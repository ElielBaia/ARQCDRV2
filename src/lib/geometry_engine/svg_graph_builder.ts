import { PBIMProject } from '../pbim/schema';

export class TopoGraphBuilder {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  public generateGraphSVG(levelId: string): string {
    const spacesOnLevel = this.project.spaces.filter(s => s.level_id === levelId);
    if (!spacesOnLevel.length) return '<svg></svg>';

    // Create a force-directed-like layout approximation
    const nodes = spacesOnLevel.map((space, index) => {
      // Basic circle placement
      const angle = (index / spacesOnLevel.length) * Math.PI * 2;
      const radius = 10;
      return {
        id: space.id,
        name: space.name,
        category: space.category,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        r: Math.sqrt(space.area_target || space.area_actual || 15) / 1.5
      };
    });

    const links: { source: any, target: any }[] = [];
    
    // Create links based on adjacent boundaries
    for (let i = 0; i < spacesOnLevel.length; i++) {
        for (let j = i + 1; j < spacesOnLevel.length; j++) {
            const s1 = spacesOnLevel[i];
            const s2 = spacesOnLevel[j];
            const sharedWalls = s1.boundary_walls.filter(w => s2.boundary_walls.includes(w));
            if (sharedWalls.length > 0) {
                links.push({
                    source: nodes.find(n => n.id === s1.id),
                    target: nodes.find(n => n.id === s2.id)
                });
            }
        }
    }

    let svgElements: string[] = [];

    // Draw Links
    svgElements.push('<g id="graph-links">');
    links.forEach(l => {
        if(l.source && l.target){
            svgElements.push(`<line x1="${l.source.x}" y1="${l.source.y}" x2="${l.target.x}" y2="${l.target.y}" stroke="#141414" stroke-width="0.1" stroke-dasharray="0.2 0.2" />`);
        }
    });
    svgElements.push('</g>');

    // Draw Nodes
    svgElements.push('<g id="graph-nodes">');
    nodes.forEach(n => {
        let nodeFill = '#e0e0e0';
        const cat = n.category?.toLowerCase() || '';
        if (cat.includes('social')) nodeFill = '#ffe6c8';
        else if (cat.includes('intim')) nodeFill = '#c8dcff';
        else if (cat.includes('servic')) nodeFill = '#dcffdc';
        else if (cat.includes('circ')) nodeFill = '#ffffc8';

        svgElements.push(`
            <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${nodeFill}" stroke="#141414" stroke-width="0.05" />
            <text x="${n.x}" y="${n.y}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="0.6" font-weight="bold" fill="#141414" pointer-events="none">
              ${n.name.toUpperCase()}
            </text>
        `);
    });
    svgElements.push('</g>');

    return `
      <svg width="100%" height="100%" viewBox="-15 -15 30 30" xmlns="http://www.w3.org/2000/svg">
        ${svgElements.join('\n')}
      </svg>
    `;
  }
}
