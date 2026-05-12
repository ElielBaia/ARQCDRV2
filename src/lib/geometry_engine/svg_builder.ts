import { PBIMProject, PBIMWall } from '../pbim/schema';

/**
 * Geometric helper class to process PBIM models into drawing representations (like SVGs).
 */
export class GeometryEngine {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  /**
   * Generates a 2D SVG string of a given level.
   */
  public generateSVGPlan(levelId: string, activeId: string | null = null, width = 800, height = 600, padding = 40): string {
    const wallsOnLevel = this.project.walls.filter(w => w.level_id === levelId);
    
    // 1. Calculate bounding box of the site & building to auto-scale
    let minX = 0, minY = 0, maxX = 10, maxY = 10;
    
    if (this.project.site) {
      const b = this.project.site.boundary;
      if (b.length > 0) {
        minX = Math.min(...b.map(pt => pt[0]));
        minY = Math.min(...b.map(pt => pt[1]));
        maxX = Math.max(...b.map(pt => pt[0]));
        maxY = Math.max(...b.map(pt => pt[1]));
      }
    } else if (wallsOnLevel.length > 0) {
      minX = Math.min(...wallsOnLevel.map(w => Math.min(w.start[0], w.end[0])));
      minY = Math.min(...wallsOnLevel.map(w => Math.min(w.start[1], w.end[1])));
      maxX = Math.max(...wallsOnLevel.map(w => Math.max(w.start[0], w.end[0])));
      maxY = Math.max(...wallsOnLevel.map(w => Math.max(w.start[1], w.end[1])));
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    // Use a fixed scale drawing approach or a viewbox
    // For SVG, we can just use the natural units and let the SVG viewBox handle scaling.
    const viewBoxMinX = minX - 2;
    const viewBoxMinY = minY - 2;
    const viewBoxWidth = spanX + 4;
    const viewBoxHeight = spanY + 4;

    let svgElements: string[] = [];

    // --- Draw Structural Grids ---
    svgElements.push(`<g id="layer-grids" opacity="0.3">`);
    const gridSpacing = 5;
    for (let x = Math.floor(minX/gridSpacing)*gridSpacing; x <= maxX; x += gridSpacing) {
       svgElements.push(`
         <line x1="${x}" y1="${minY - 2}" x2="${x}" y2="${maxY + 2}" stroke="#141414" stroke-width="0.01" stroke-dasharray="0.2 0.2" />
         <circle cx="${x}" cy="${maxY + 2.5}" r="0.4" fill="none" stroke="#141414" stroke-width="0.02" />
         <text x="${x}" y="${maxY + 2.5}" text-anchor="middle" dominant-baseline="middle" font-size="0.4" font-family="monospace" font-weight="bold" transform="scale(1, -1) translate(0, ${-2*(maxY + 2.5)})">${String.fromCharCode(65 + Math.floor(x/gridSpacing))}</text>
       `);
    }
    for (let y = Math.floor(minY/gridSpacing)*gridSpacing; y <= maxY; y += gridSpacing) {
       svgElements.push(`
         <line x1="${minX - 2}" y1="${y}" x2="${maxX + 2}" y2="${y}" stroke="#141414" stroke-width="0.01" stroke-dasharray="0.2 0.2" />
         <circle cx="${maxX + 2.5}" cy="${y}" r="0.4" fill="none" stroke="#141414" stroke-width="0.02" />
         <text x="${maxX + 2.5}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="0.4" font-family="monospace" font-weight="bold" transform="scale(1, -1) translate(0, ${-2*y})">${Math.floor(y/gridSpacing) + 1}</text>
       `);
    }
    svgElements.push(`</g>`);

    // --- Draw Site ---
    if (this.project.site) {
      const pts = this.project.site.boundary.map(p => `${p[0]},${p[1]}`).join(' ');
      svgElements.push(`
        <g id="layer-site-boundary">
          <polygon points="${pts}" fill="none" stroke="#000000" stroke-width="0.08" stroke-dasharray="0.6 0.3" />
          <text x="${minX}" y="${maxY + 1}" font-size="0.3" fill="#666" transform="scale(1, -1) translate(0, ${-2*(maxY+1)})">PROPRIEDADE / LOTE</text>
        </g>
      `);
    }

    // --- Draw Spaces (Backgrounds / Annotations) ---
    svgElements.push(`<g id="layer-spaces">`);
    const spacesOnLevel = this.project.spaces.filter(s => s.level_id === levelId);
    
    for (const space of spacesOnLevel) {
      const bWalls = this.project.walls.filter(w => space.boundary_walls.includes(w.id));
      if (bWalls.length > 0) {
        // Compute precise inner bounds
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        bWalls.forEach(w => {
           sMinX = Math.min(sMinX, w.start[0], w.end[0]);
           sMinY = Math.min(sMinY, w.start[1], w.end[1]);
           sMaxX = Math.max(sMaxX, w.start[0], w.end[0]);
           sMaxY = Math.max(sMaxY, w.start[1], w.end[1]);
        });

        const cx = (sMinX + sMaxX) / 2;
        const cy = (sMinY + sMaxY) / 2;
        const isSelected = activeId === space.id;
        
        let spaceFillColor = 'rgba(20, 20, 20, 0.01)';
        const cat = space.category?.toLowerCase() || '';
        if (cat.includes('social') || cat.includes('living')) spaceFillColor = 'rgba(20, 20, 20, 0.03)';
        else if (cat.includes('intimate') || cat.includes('bedroom')) spaceFillColor = 'rgba(20, 20, 20, 0.02)';
        else if (cat.includes('service') || cat.includes('kitchen') || cat.includes('bathroom')) spaceFillColor = 'rgba(20, 20, 20, 0.05)';

        svgElements.push(`
          <rect x="${sMinX + 0.1}" y="${sMinY + 0.1}" width="${sMaxX - sMinX - 0.2}" height="${sMaxY - sMinY - 0.2}" 
                fill="${isSelected ? 'rgba(0, 0, 0, 0.08)' : spaceFillColor}" 
                stroke="none"
                class="hover:fill-black/10 cursor-pointer pbim-object transition-all" 
                data-type="Space" 
                data-id="${space.id}" />
        `);

        // Draw Technical Annotations
        svgElements.push(`
          <g pointer-events="none">
            <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="0.35" font-weight="800" fill="#000" transform="scale(1, -1) translate(0, ${-2*cy})" style="text-transform: uppercase; letter-spacing: 0.1em;">
              ${space.name}
            </text>
            <text x="${cx}" y="${cy + 0.5}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="0.22" font-weight="bold" fill="#666" transform="scale(1, -1) translate(0, ${-2*(cy+0.5)})">
              A:${(space.area_actual || 0).toFixed(2)}m²
            </text>
            <text x="${cx}" y="${cy + 0.8}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="0.18" fill="#999" transform="scale(1, -1) translate(0, ${-2*(cy+0.8)})">
              ±0.00
            </text>
          </g>
        `);
      }
    }
    svgElements.push(`</g>`);

    // --- Draw Walls ---
    svgElements.push(`<g id="layer-wall-cut">`);
    for (const wall of wallsOnLevel) {
      const dx = wall.end[0] - wall.start[0];
      const dy = wall.end[1] - wall.start[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      const nx = -dy / len;
      const ny = dx / len;

      const t2 = wall.thickness / 2;
      const p1x = wall.start[0] + nx * t2;
      const p1y = wall.start[1] + ny * t2;
      const p2x = wall.start[0] - nx * t2;
      const p2y = wall.start[1] - ny * t2;
      
      const p3x = wall.end[0] - nx * t2;
      const p3y = wall.end[1] - ny * t2;
      const p4x = wall.end[0] + nx * t2;
      const p4y = wall.end[1] + ny * t2;

      // Check for openings on this wall
      const wallOpenings = this.project.openings.filter(o => o.wall_id === wall.id);
      
      // Handle selection state
      const isSelected = activeId === wall.id;
      const fillColor = isSelected ? '#000' : (wall.structural ? '#141414' : '#fff');

      // Axis Line
      svgElements.push(`
        <line x1="${wall.start[0]}" y1="${wall.start[1]}" x2="${wall.end[0]}" y2="${wall.end[1]}" 
              stroke="#ff0000" 
              stroke-width="0.02" 
              stroke-dasharray="0.2 0.1" 
              opacity="0.8" 
              pointer-events="none" />
      `);

      // Poche Wall
      svgElements.push(`
        <polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}" 
                 fill="${isSelected ? '#4f46e5' : '#1a202c'}" 
                 stroke="${isSelected ? '#4f46e5' : '#1a202c'}" 
                 stroke-width="0.04"
                 class="cursor-pointer pbim-object transition-all hover:opacity-80"
                 data-type="Wall"
                 data-id="${wall.id}" />
      `);

      // Draw openings cutouts
      for (const op of wallOpenings) {
        const angle = Math.atan2(dy, dx);
        const opCx = wall.start[0] + dx * op.position_t;
        const opCy = wall.start[1] + dy * op.position_t;
        
        if (op.type === 'Window') {
            svgElements.push(`
              <g transform="translate(${opCx}, ${opCy}) rotate(${angle * 180 / Math.PI})">
                <rect x="${-op.width/2}" y="${-wall.thickness/2-0.02}" width="${op.width}" height="${wall.thickness+0.04}" fill="#ffffff" />
                <line x1="${-op.width/2}" y1="${-wall.thickness/2}" x2="${op.width/2}" y2="${-wall.thickness/2}" stroke="#1a202c" stroke-width="0.02" />
                <line x1="${-op.width/2}" y1="${wall.thickness/2}" x2="${op.width/2}" y2="${wall.thickness/2}" stroke="#1a202c" stroke-width="0.02" />
                <line x1="${-op.width/2}" y1="0}" x2="${op.width/2}" y2="0" stroke="#1a202c" stroke-width="0.015" />
              </g>
            `);
        } else {
            svgElements.push(`
              <g transform="translate(${opCx}, ${opCy}) rotate(${angle * 180 / Math.PI})">
                <rect x="${-op.width/2}" y="${-wall.thickness/2-0.02}" width="${op.width}" height="${wall.thickness+0.04}" fill="#ffffff" />
                <line x1="${-op.width/2}" y1="${-wall.thickness/2}" x2="${-op.width/2}" y2="${wall.thickness/2}" stroke="#1a202c" stroke-width="0.04" />
                <line x1="${op.width/2}" y1="${-wall.thickness/2}" x2="${op.width/2}" y2="${wall.thickness/2}" stroke="#1a202c" stroke-width="0.04" />
                <path d="M ${-op.width/2} ${wall.thickness/2 + op.width} A ${op.width} ${op.width} 0 0 1 ${op.width/2} ${wall.thickness/2}" fill="none" stroke="#1a202c" stroke-width="0.015" stroke-dasharray="0.05 0.05" />
                <rect x="${-op.width/2}" y="${wall.thickness/2}" width="0.04" height="${op.width}" fill="#ffffff" stroke="#1a202c" stroke-width="0.02" />
              </g>
            `);
        }
      }
    }
    svgElements.push(`</g>`);


    // --- Draw Dimensions ---
    svgElements.push(`<g id="layer-dimensions">`);
    const dimOffset = 2.5; // offset from bounding box
    
    // Bottom Dimension (Width)
    const dimYBottom = minY - dimOffset;
    svgElements.push(`
      <line x1="${minX}" y1="${dimYBottom}" x2="${maxX}" y2="${dimYBottom}" stroke="#000" stroke-width="0.03" />
      <line x1="${minX}" y1="${minY - 0.2}" x2="${minX}" y2="${dimYBottom - 0.5}" stroke="#000" stroke-width="0.01" />
      <line x1="${maxX}" y1="${minY - 0.2}" x2="${maxX}" y2="${dimYBottom - 0.5}" stroke="#000" stroke-width="0.01" />
      <path d="M${minX - 0.1} ${dimYBottom - 0.15} L${minX + 0.1} ${dimYBottom + 0.15}" stroke="#000" stroke-width="0.06" />
      <path d="M${maxX - 0.1} ${dimYBottom - 0.15} L${maxX + 0.1} ${dimYBottom + 0.15}" stroke="#000" stroke-width="0.06" />
      <text x="${(minX + maxX)/2}" y="${dimYBottom + 0.3}" text-anchor="middle" font-family="monospace" font-size="0.4" font-weight="bold" fill="#000" transform="scale(1, -1) translate(0, ${-2*(dimYBottom + 0.3)})" pointer-events="none">${(maxX - minX).toFixed(2)}</text>
    `);

    // Left Dimension (Depth)
    const dimXLeft = minX - dimOffset;
    svgElements.push(`
      <line x1="${dimXLeft}" y1="${minY}" x2="${dimXLeft}" y2="${maxY}" stroke="#000" stroke-width="0.03" />
      <line x1="${minX - 0.2}" y1="${minY}" x2="${dimXLeft - 0.5}" y2="${minY}" stroke="#000" stroke-width="0.01" />
      <line x1="${minX - 0.2}" y1="${maxY}" x2="${dimXLeft - 0.5}" y2="${maxY}" stroke="#000" stroke-width="0.01" />
      <path d="M${dimXLeft - 0.15} ${minY - 0.1} L${dimXLeft + 0.15} ${minY + 0.1}" stroke="#000" stroke-width="0.06" />
      <path d="M${dimXLeft - 0.15} ${maxY - 0.1} L${dimXLeft + 0.15} ${maxY + 0.1}" stroke="#000" stroke-width="0.06" />
      <text x="${dimXLeft - 0.5}" y="${(minY + maxY)/2}" text-anchor="middle" font-family="monospace" font-size="0.4" font-weight="bold" fill="#000" transform="scale(1, -1) translate(0, ${-2*((minY + maxY)/2)}) rotate(-90, ${dimXLeft - 0.5}, ${(minY + maxY)/2})" pointer-events="none">${(maxY - minY).toFixed(2)}</text>
    `);
    svgElements.push(`</g>`);

    // --- Technical Symbols (North, Scale) ---
    const symX = maxX + 4;
    const symY = minY;
    svgElements.push(`
      <g id="technical-symbols" transform="translate(${symX}, ${symY})">
        <!-- North Arrow -->
        <g transform="translate(0, 5)">
            <circle r="1" fill="none" stroke="#000" stroke-width="0.05" />
            <path d="M0 -0.8 L0.4 0.4 L0 0.2 L-0.4 0.4 Z" fill="#000" />
            <text y="-1.5" text-anchor="middle" font-size="0.5" font-weight="bold" transform="scale(1,-1)">N</text>
        </g>
        <!-- Graphical Scale Bar -->
        <g transform="translate(-1, 0)">
            <rect x="0" y="0" width="2" height="0.2" fill="#000" />
            <rect x="2" y="0" width="2" height="0.2" fill="none" stroke="#000" stroke-width="0.05" />
            <text x="0" y="-0.5" font-size="0.3" transform="scale(1,-1)">0</text>
            <text x="2" y="-0.5" font-size="0.3" transform="scale(1,-1)">5m</text>
            <text x="4" y="-0.5" font-size="0.3" transform="scale(1,-1)">10m</text>
            <text x="0" y="0.6" font-size="0.25" font-weight="bold" transform="scale(1,-1)">ESCALA GRÁFICA</text>
        </g>
      </g>
    `);

    // Assemble SVG
    return `
      <svg width="100%" height="100%" viewBox="${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth + 6} ${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg" style="background-color: #fcfaf7;">
        <defs>
          <pattern id="concrete-hatch-plan" patternUnits="userSpaceOnUse" width="0.5" height="0.5">
             <circle cx="0.1" cy="0.1" r="0.02" fill="#000" />
             <path d="M0.3 0.3 L0.4 0.4" stroke="#000" stroke-width="0.01" />
          </pattern>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;800&amp;family=JetBrains+Mono:wght@400;500;700&amp;display=swap');
            text { font-family: 'Inter', sans-serif; }
            .mono { font-family: 'JetBrains Mono', monospace; }
          </style>
        </defs>
        <g transform="scale(1, -1) translate(0, -${viewBoxHeight + 2 * viewBoxMinY})">
          ${svgElements.join('\n')}
        </g>
      </svg>
    `;
  }
}
