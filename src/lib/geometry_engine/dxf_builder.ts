import { PBIMProject, PBIMWall } from '../pbim/schema';

export class DXFBuilder {
  private project: PBIMProject;

  constructor(project: PBIMProject) {
    this.project = project;
  }

  generateDXF(): string {
    let dxf = '';

    // HEADER
    dxf += '  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n';

    // ENTITIES
    dxf += '  0\nSECTION\n  2\nENTITIES\n';

    // Site Boundary
    if (this.project.site && this.project.site.boundary) {
      const b = this.project.site.boundary;
      for (let i = 0; i < b.length; i++) {
        const p1 = b[i];
        const p2 = b[(i + 1) % b.length];
        dxf += this.createLine(p1[0], p1[1], p2[0], p2[1], 'Site');
      }
    }

    // Walls
    if (this.project.walls) {
      this.project.walls.forEach(wall => {
        // Simple center line for walls for now. 
        // We could also do the thickness calculation easily if we wanted real solid thick lines
        dxf += this.createLine(wall.start[0], wall.start[1], wall.end[0], wall.end[1], 'Walls');
      });
    }

    dxf += '  0\nENDSEC\n  0\nEOF\n';

    return dxf;
  }

  generateThickWallsDXF(): string {
    let dxf = '';
    dxf += '  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n';
    dxf += '  0\nSECTION\n  2\nENTITIES\n';

    if (this.project.site && this.project.site.boundary) {
      const b = this.project.site.boundary;
      for (let i = 0; i < b.length; i++) {
        const p1 = b[i];
        const p2 = b[(i + 1) % b.length];
        dxf += this.createLine(p1[0], p1[1], p2[0], p2[1], 'Site');
      }
    }

    if (this.project.walls) {
      this.project.walls.forEach(wall => {
        const [x1, y1] = wall.start;
        const [x2, y2] = wall.end;
        const t = wall.thickness / 2;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;

        // 4 corners of the thick wall
        const c1x = x1 + nx * t, c1y = y1 + ny * t;
        const c2x = x1 - nx * t, c2y = y1 - ny * t;
        const c3x = x2 - nx * t, c3y = y2 - ny * t;
        const c4x = x2 + nx * t, c4y = y2 + ny * t;

        dxf += this.createLine(c1x, c1y, c2x, c2y, 'Walls');
        dxf += this.createLine(c2x, c2y, c3x, c3y, 'Walls');
        dxf += this.createLine(c3x, c3y, c4x, c4y, 'Walls');
        dxf += this.createLine(c4x, c4y, c1x, c1y, 'Walls');
      });
    }

    dxf += '  0\nENDSEC\n  0\nEOF\n';
    return dxf;
  }

  private createLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
    return `  0
LINE
  8
${layer}
 10
${x1.toFixed(4)}
 20
${y1.toFixed(4)}
 30
0.0
 11
${x2.toFixed(4)}
 21
${y2.toFixed(4)}
 31
0.0
`;
  }
}
