import { PBIMProject, PBIMWall } from '../pbim/schema';

export class OBJBuilder {
    private project: PBIMProject;

    constructor(project: PBIMProject) {
        this.project = project;
    }

    public generateOBJ(): string {
        let objStr = `# PBIM Export - ${this.project.name || 'Model'}\n`;
        objStr += `o Project\n\n`;

        let vertexIdx = 1;

        this.project.walls.forEach((w, i) => {
            const dx = w.end[0] - w.start[0];
            const dy = w.end[1] - w.start[1];
            const len = Math.hypot(dx, dy);
            
            // Normalize direction
            let nx = dx / len;
            let ny = dy / len;
            
            // Perpendicular vector for thickness
            let px = -ny * (w.thickness / 2);
            let py = nx * (w.thickness / 2);

            // Find elevation from level
            const level = this.project.levels.find(l => l.id === w.level_id);
            const z = level ? level.elevation : 0;
            const h = w.height;

            // 4 base corners
            const v1 = [w.start[0] + px, w.start[1] + py, z];
            const v2 = [w.start[0] - px, w.start[1] - py, z];
            const v3 = [w.end[0] - px, w.end[1] - py, z];
            const v4 = [w.end[0] + px, w.end[1] + py, z];

            // 4 top corners
            const v5 = [v1[0], v1[1], z + h];
            const v6 = [v2[0], v2[1], z + h];
            const v7 = [v3[0], v3[1], z + h];
            const v8 = [v4[0], v4[1], z + h];

            const verts = [v1, v2, v3, v4, v5, v6, v7, v8];
            
            objStr += `# Wall ${w.id}\n`;
            verts.forEach(v => {
                objStr += `v ${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)}\n`;
            });

            const vStart = vertexIdx;
            
            // Faces (1-indexed counter-clockwise)
            // Bottom (v1, v4, v3, v2)
            objStr += `f ${vStart} ${vStart+3} ${vStart+2} ${vStart+1}\n`;
            // Top (v5, v6, v7, v8)
            objStr += `f ${vStart+4} ${vStart+5} ${vStart+6} ${vStart+7}\n`;
            // Front (v1, v2, v6, v5)
            objStr += `f ${vStart} ${vStart+1} ${vStart+5} ${vStart+4}\n`;
            // Right (v2, v3, v7, v6)
            objStr += `f ${vStart+1} ${vStart+2} ${vStart+6} ${vStart+5}\n`;
            // Back (v3, v4, v8, v7)
            objStr += `f ${vStart+2} ${vStart+3} ${vStart+7} ${vStart+6}\n`;
            // Left (v4, v1, v5, v8)
            objStr += `f ${vStart+3} ${vStart} ${vStart+4} ${vStart+7}\n`;

            objStr += `\n`;
            vertexIdx += 8;
        });

        // Super simple, ignoring openings for now (boolean sub in OBJ is hard)

        return objStr;
    }
}
