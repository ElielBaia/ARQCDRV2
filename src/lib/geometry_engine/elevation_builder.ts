import { PBIMProject } from '../pbim/schema';

export class ElevationBuilder {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  generateElevationSVG(orientation: 'front' | 'rear' | 'left' | 'right' = 'front'): string {
    if (!this.project || !this.project.walls) return '<svg></svg>';

    let svgElements: string[] = [];
    
    // Group everything
    svgElements.push(`<g id="elevation-${orientation}">`);

    // Terrain Line (Stronger ground)
    svgElements.push(`<line x1="-15" y1="0" x2="35" y2="0" stroke="#000000" stroke-width="0.15" />`);
    // Hatch under terrain (diagonal lines)
    for (let i = -15; i < 35; i += 1) {
       svgElements.push(`<line x1="${i}" y1="0" x2="${i - 0.5}" y2="-0.5" stroke="#ccc" stroke-width="0.05" />`);
    }

    // Level Markers
    if (this.project.levels) {
        this.project.levels.forEach(lvl => {
            const z = lvl.elevation;
            // Level horizontal indicator
            svgElements.push(`
                <g class="level-marker">
                    <line x1="-5" y1="${z}" x2="25" y2="${z}" stroke="#666" stroke-width="0.02" stroke-dasharray="0.2 0.2" />
                    <text x="-5.5" y="${z}" font-size="0.3" fill="#666" font-family="monospace" transform="scale(1, -1) translate(0, ${-2*z})">
                        NÍVEL ${z >= 0 ? '+' : ''}${z.toFixed(2)}
                    </text>
                    <path d="M-5 ${z} L-4.8 ${z+0.2} L-4.4 ${z+0.2} Z" fill="#666" />
                </g>
            `);
        });
    }

    // Project Walls
    // Identify furthest depth to normalize atmospheric perspective
    const allDepths = this.project.walls.map(w => Math.min(w.start[1], w.end[1]));
    const maxDepthValue = Math.max(...allDepths, 10);

    this.project.walls.forEach(wall => {
      const x1 = wall.start[0];
      const x2 = wall.end[0];
      const y1 = wall.start[1];
      const y2 = wall.end[1];
      
      let minProj = 0, maxProj = 0, depth = 0;
      let isVisible = false;

      if (orientation === 'front') {
        minProj = Math.min(x1, x2);
        maxProj = Math.max(x1, x2);
        depth = Math.min(y1, y2);
        isVisible = Math.abs(x2 - x1) > 0.01; // mostly running along X
      } else if (orientation === 'left') {
        minProj = Math.min(y1, y2);
        maxProj = Math.max(y1, y2);
        depth = Math.min(x1, x2);
        isVisible = Math.abs(y2 - y1) > 0.01;
      }

      if (isVisible) {
        const level = this.project.levels?.find(l => l.id === wall.level_id);
        const baseZ = level ? level.elevation : 0;
        const width = maxProj - minProj;

        // Wall Body with depth shading (farther = lighter and thinner lines)
        const depthFactor = Math.max(0, depth / maxDepthValue);
        const opacity = 1.0 - (depthFactor * 0.4);
        const strokeWidth = 0.05 * (1.0 - (depthFactor * 0.5));

        svgElements.push(`
            <g opacity="${opacity}">
                <rect x="${minProj}" y="${baseZ}" width="${width}" height="${wall.height}" fill="#fff" stroke="#000" stroke-width="${strokeWidth}" />
                <!-- Texture/Hatch for high standard -->
                ${wall.material?.includes('Stone') ? `<rect x="${minProj}" y="${baseZ}" width="${width}" height="${wall.height}" fill="url(#stone-pattern)" opacity="0.1" />` : ''}
            </g>
        `);

        // Openings
        this.project.openings?.filter(op => op.wall_id === wall.id).forEach(op => {
          const opW = op.width;
          const opH = op.height;
          const opSill = op.sill_height || 0;
          const opX = minProj + width * op.position_t - opW/2;
          const bottomZ = baseZ + opSill;
          
          // Glass shading
          svgElements.push(`
            <g class="opening">
                <rect x="${opX}" y="${bottomZ}" width="${opW}" height="${opH}" fill="#e8f4f8" stroke="#000" stroke-width="0.03" />
                <rect x="${opX + 0.05}" y="${bottomZ + 0.05}" width="${opW - 0.1}" height="${opH - 0.1}" fill="none" stroke="#ddd" stroke-width="0.01" />
                ${op.type === 'Window' ? `
                    <line x1="${opX}" y1="${bottomZ + opH/2}" x2="${opX + opW}" y2="${bottomZ+opH/2}" stroke="#000" stroke-width="0.01" opacity="0.3"/>
                    <line x1="${opX + opW/2}" y1="${bottomZ}" x2="${opX + opW/2}" y2="${bottomZ+opH}" stroke="#000" stroke-width="0.01" opacity="0.3"/>
                ` : ``}
            </g>
          `);
        });
      }
    });

    // Slabs (Roof eaves, slabs visible)
    this.project.slabs.forEach(slab => {
        if (slab.type === 'Roof') {
            const [minX, minY, maxX, maxY] = this.getPolygonBounds(slab.boundary as [number, number][]);
            const level = this.project.levels?.find(l => l.id === slab.level_id);
            const baseZ = (level ? level.elevation : 0) + 3.0; // Roof height approx
            
            if (orientation === 'front') {
                svgElements.push(`
                    <rect x="${minX}" y="${baseZ}" width="${maxX - minX}" height="${slab.thickness}" fill="#141414" stroke="#000" stroke-width="0.05" />
                    <polyline points="${minX},${baseZ+slab.thickness} ${(minX+maxX)/2},${baseZ+slab.thickness+1} ${maxX},${baseZ+slab.thickness}" fill="#333" stroke="#000" stroke-width="0.05" />
                `);
            }
        }
    });

    // Add Legend
    svgElements.push(`
        <g transform="translate(26, 0)">
            <text font-size="0.4" font-weight="bold" transform="scale(1, -1)">LEGENDA</text>
            <rect y="-0.8" width="0.8" height="0.4" fill="#e8f4f8" stroke="#000" stroke-width="0.02" />
            <text x="1" y="-0.5" font-size="0.3" transform="scale(1, -1)">VIDRO / ESQUADRIA</text>
            <rect y="-1.6" width="0.8" height="0.4" fill="#fcfaf7" stroke="#141414" stroke-width="0.02" />
            <text x="1" y="-1.3" font-size="0.3" transform="scale(1, -1)">ALVENARIA</text>
        </g>
    `);

    svgElements.push(`</g>`);
    
    const levelCount = this.project.levels ? this.project.levels.length : 1;
    const maxZ = levelCount * 4.5;
    
    // Calculate dynamic width based on geometry
    let gMinX = Infinity;
    let gMaxX = -Infinity;
    
    this.project.walls?.forEach(w => {
        gMinX = Math.min(gMinX, w.start[0], w.end[0]);
        gMaxX = Math.max(gMaxX, w.start[0], w.end[0]);
    });
    
    if (gMinX === Infinity) { gMinX = 0; gMaxX = 20; }
    
    const vW = Math.max(gMaxX - gMinX, 10) + 16; // Add padding
    const vH = maxZ + 4;
    const vX = gMinX - 8;
    const vY = -2;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="${vX} ${vY} ${vW} ${vH}" width="100%" height="100%" style="background-color: #fcfaf7;">
        <defs>
          <pattern id="stone-pattern" patternUnits="userSpaceOnUse" width="1" height="1">
            <path d="M0 0 L1 1 M1 0 L0 1" stroke="#000" stroke-width="0.05" />
          </pattern>
        </defs>
        <g transform="scale(1, -1) translate(0, -${maxZ + 1})">
          ${svgElements.join('\n')}
        </g>
      </svg>
    `;
  }

  private getPolygonBounds(poly: [number, number][]): [number, number, number, number] {
      if (!poly || poly.length === 0) return [0, 0, 0, 0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      poly.forEach(p => {
          minX = Math.min(minX, p[0]);
          minY = Math.min(minY, p[1]);
          maxX = Math.max(maxX, p[0]);
          maxY = Math.max(maxY, p[1]);
      });
      return [minX, minY, maxX, maxY];
  }

  // legacy method
  generateFrontElevationSVG() { return this.generateElevationSVG('front'); }
}
