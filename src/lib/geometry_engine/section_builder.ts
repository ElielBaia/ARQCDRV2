import { PBIMProject } from '../pbim/schema';

export class SectionBuilder {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  generateSectionSVG(axis: 'X' | 'Y' = 'X', coordinate?: number): string {
    if (!this.project || !this.project.walls) return '<svg></svg>';

    let svgElements: string[] = [];
    
    // Find middle coordinate if not specified
    if (coordinate === undefined) {
        let min = Infinity, max = -Infinity;
        this.project.walls.forEach(w => {
            min = Math.min(min, axis === 'X' ? w.start[0] : w.start[1]);
            max = Math.max(max, axis === 'X' ? w.end[0] : w.end[1]);
        });
        coordinate = (min + max) / 2;
    }

    svgElements.push(`<g id="section-${axis}-${coordinate.toFixed(1)}">`);

    // Slabs (Floors and Roofs)
    let minBuild = Infinity;
    let maxBuild = -Infinity;
    
    this.project.walls.forEach(w => {
        if (axis === 'X') {
            minBuild = Math.min(minBuild, w.start[1], w.end[1]);
            maxBuild = Math.max(maxBuild, w.start[1], w.end[1]);
        } else {
            minBuild = Math.min(minBuild, w.start[0], w.end[0]);
            maxBuild = Math.max(maxBuild, w.start[0], w.end[0]);
        }
    });

    if (minBuild === Infinity) { minBuild = 0; maxBuild = 15; }

    this.project.slabs.forEach(slab => {
        const level = this.project.levels?.find(l => l.id === slab.level_id);
        const z = (level ? level.elevation : 0) + (slab.type === 'Roof' ? 3.0 : 0);
        
        svgElements.push(`
            <rect x="${minBuild - 1}" y="${z}" width="${maxBuild - minBuild + 2}" height="${slab.thickness}" fill="#e2e8f0" stroke="#1e293b" stroke-width="0.06" />
            <rect x="${minBuild - 1}" y="${z}" width="${maxBuild - minBuild + 2}" height="${slab.thickness}" fill="url(#concrete-hatch)" opacity="0.3" pointer-events="none" />
        `);
    });

    // Terrain
    svgElements.push(`
      <rect x="${minBuild - 5}" y="-5" width="${maxBuild - minBuild + 10}" height="5" fill="#f1f5f9" />
      <rect x="${minBuild - 5}" y="-5" width="${maxBuild - minBuild + 10}" height="5" fill="url(#terrain-pattern)" opacity="0.5" />
      <line x1="${minBuild - 5}" y1="0" x2="${maxBuild + 5}" y2="0" stroke="#0f172a" stroke-width="0.12" />
    `);

    // Levels
    this.project.levels.forEach(lvl => {
        const z = lvl.elevation;
        svgElements.push(`
            <g class="level-indicator">
              <line x1="${minBuild - 2}" y1="${z}" x2="${maxBuild + 2}" y2="${z}" stroke="#64748b" stroke-width="0.02" stroke-dasharray="0.2 0.2" />
              <g transform="translate(${maxBuild + 2.5}, ${z}) scale(0.4)">
                 <path d="M0 0 L1 1 L3 1 M1 1 L1 0" fill="none" stroke="#475569" stroke-width="0.08" />
                 <text x="1.2" y="0.8" font-size="1.8" font-family="Inter, sans-serif" font-weight="600" fill="#475569" transform="scale(1, -1)">N.A. ${z.toFixed(2)}</text>
              </g>
            </g>
        `);
    });

    // Walls being cut vs in distance
    this.project.walls.forEach(wall => {
      const x1 = wall.start[0];
      const x2 = wall.end[0];
      const y1 = wall.start[1];
      const y2 = wall.end[1];
      
      const level = this.project.levels?.find(l => l.id === wall.level_id);
      const baseZ = level ? level.elevation : 0;

      // Check if coordinate cuts through this wall
      let isCut = false;
      let cutWidth = 0;
      let cutPos = 0; // The X coordinate in the section drawing

      if (axis === 'X') {
          // Cutting line is vertical in plan (X = coordinate), running along Y.
          // Section drawing horizontal axis represents Y.
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          // If wall crosses the section line
          if (coordinate! >= minX - wall.thickness/2 && coordinate! <= maxX + wall.thickness/2) {
              isCut = true;
              cutWidth = wall.thickness;
              // Project wall's Y onto section X
              // Simplified: average Y for intersecting part
              cutPos = (y1 + y2) / 2;
          }
      } else {
        // Cutting line is horizontal in plan (Y = coordinate), running along X.
        // Section drawing horizontal axis represents X.
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        if (coordinate! >= minY - wall.thickness/2 && coordinate! <= maxY + wall.thickness/2) {
            isCut = true;
            cutWidth = wall.thickness;
            cutPos = (x1 + x2) / 2;
        }
      }

      if (isCut) {
        // Cut wall representation (Heavy line, hatched)
        svgElements.push(`
          <rect x="${cutPos - cutWidth/2}" y="${baseZ}" width="${cutWidth}" height="${wall.height}" fill="#f8fafc" stroke="#1e293b" stroke-width="0.08" />
          <rect x="${cutPos - cutWidth/2}" y="${baseZ}" width="${cutWidth}" height="${wall.height}" fill="url(#concrete-hatch)" opacity="0.6" pointer-events="none" />
        `);
      } else {
          // Wall in distance (Lighter)
          if (axis === 'X') {
              // Section looks along X. We are at coordinate X, looking right (or left).
              // Simplified: show walls parallel to Y
              const minX = Math.min(x1, x2);
              if (Math.abs(x1 - x2) < 0.2 && minX > coordinate!) {
                  svgElements.push(`
                    <rect x="${Math.min(y1, y2)}" y="${baseZ}" width="${Math.abs(y1 - y2)}" height="${wall.height}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.03" />
                  `);
              }
          } else {
              // Section looks along Y.
              const minY = Math.min(y1, y2);
              if (Math.abs(y1 - y2) < 0.2 && minY > coordinate!) {
                  svgElements.push(`
                    <rect x="${Math.min(x1, x2)}" y="${baseZ}" width="${Math.abs(x1 - x2)}" height="${wall.height}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.03" />
                  `);
              }
          }
      }
    });

    // Human Figure for Scale (Stylish outline)
    svgElements.push(`
        <g transform="translate(${maxBuild - 1.5}, ${this.project.levels[0]?.elevation || 0}) scale(1, -1)">
            <path d="M0 -1.7 C-0.08 -1.7 -0.15 -1.63 -0.15 -1.55 C-0.15 -1.47 -0.08 -1.4 0 -1.4 C0.08 -1.4 0.15 -1.47 0.15 -1.55 C0.15 -1.63 0.08 -1.7 0 -1.7 Z M -0.2 -1.3 C -0.3 -1.3 -0.3 -1.2 -0.3 -1.1 L -0.3 -0.6 L -0.1 -0.6 L -0.1 -1.1 C -0.1 -1.0 0.1 -1.0 0.1 -1.1 L 0.1 -0.6 L 0.3 -0.6 L 0.3 -1.1 C 0.3 -1.2 0.3 -1.3 0.2 -1.3 L -0.2 -1.3 Z M -0.15 -0.5 L -0.15 -0.1 L 0.15 -0.1 L 0.15 -0.5 L -0.15 -0.5 Z" fill="#94a3b8" opacity="0.8" />
        </g>
    `);

    svgElements.push(`</g>`);

    const levelCount = this.project.levels ? this.project.levels.length : 1;
    const maxZ = levelCount * 4.5;
    
    // Calculate dynamic width based on geometry
    let gMinX = Infinity;
    let gMaxX = -Infinity;
    
    this.project.walls?.forEach(w => {
        gMinX = Math.min(gMinX, w.start[0], w.end[0], w.start[1], w.end[1]);
        gMaxX = Math.max(gMaxX, w.start[0], w.end[0], w.start[1], w.end[1]);
    });
    
    if (gMinX === Infinity) { gMinX = 0; gMaxX = 20; }
    
    const vW = Math.max(gMaxX - gMinX, 10) + 16;
    const vH = maxZ + 8;
    const vX = gMinX - 8;
    const vY = -3;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="${vX} ${vY} ${vW} ${vH}" width="100%" height="100%" style="background-color: #fcfaf7;">
        <defs>
          <pattern id="terrain-pattern" patternUnits="userSpaceOnUse" width="1" height="1">
            <path d="M0 1 L1 0" stroke="#ccc" stroke-width="0.05" />
          </pattern>
          <pattern id="concrete-hatch" patternUnits="userSpaceOnUse" width="0.5" height="0.5">
             <circle cx="0.1" cy="0.1" r="0.02" fill="#000" />
             <path d="M0.3 0.3 L0.4 0.4" stroke="#000" stroke-width="0.01" />
          </pattern>
        </defs>
        <g transform="scale(1, -1) translate(0, -${maxZ + 2})">
          ${svgElements.join('\n')}
        </g>
        <!-- Scale Bar -->
        <g transform="translate(${vX + vW - 8}, ${vY + vH - 2})">
            <rect x="0" y="0" width="2" height="0.4" fill="#000" />
            <rect x="2" y="0" width="2" height="0.4" fill="none" stroke="#000" stroke-width="0.05" />
            <text x="0" y="1" font-size="0.8" font-family="monospace">0</text>
            <text x="2" y="1" font-size="0.8" font-family="monospace">5m</text>
            <text x="0" y="-0.5" font-size="0.6" font-weight="bold" font-family="sans-serif">ESCALA 1:100</text>
        </g>
      </svg>
    `;
  }
}
