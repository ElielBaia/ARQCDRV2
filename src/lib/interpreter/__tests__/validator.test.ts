import { describe, it, expect } from "vitest";
import { validateProject } from "../validator";
import type { PBIMProject } from "../../pbim/schema";

const baseProject: PBIMProject = {
  project_id: "test-uuid-0000-0000-0000-000000000000",
  schema_version: "0.1.0",
  name: "Test",
  units: "m",
  site: { front_width: 10, depth: 20, slope_height: 0, orientation_front: "north", boundary: [[0,0],[10,0],[10,20],[0,20]] },
  levels: [{ id: "L1", name: "Terreo", elevation: 0, height: 2.7 }],
  spaces: [],
  walls: [],
  openings: [],
  slabs: [],
  stairs: [],
  views: [],
  sheets: [],
};

describe("validateProject", () => {
  it("erro quando vazio", () => {
    const r = validateProject(baseProject);
    expect(r.status).toBe("error");
    expect(r.violations.some(v => v.message.includes("space"))).toBe(true);
  });

  it("warning quando porta abaixo de 0.80 acessível", () => {
    const r = validateProject({
      ...baseProject,
      spaces: [{ id: "s1", type: "Space", name: "Sala", level_id: "L1", category: "living", boundary_walls: ["w1","w2","w3","w4"], area_actual: 15, adjacency_requirements: [], quality_checks: [] }],
      walls: [
        { id: "w1", type: "Wall", level_id: "L1", start: [0,0,0], end: [3,0,0], height: 2.7, thickness: 0.20, structural: true, openings: [] },
        { id: "w2", type: "Wall", level_id: "L1", start: [3,0,0], end: [3,5,0], height: 2.7, thickness: 0.20, structural: true, openings: [] },
        { id: "w3", type: "Wall", level_id: "L1", start: [3,5,0], end: [0,5,0], height: 2.7, thickness: 0.20, structural: true, openings: [] },
        { id: "w4", type: "Wall", level_id: "L1", start: [0,5,0], end: [0,0,0], height: 2.7, thickness: 0.20, structural: true, openings: [] },
      ],
      openings: [
        { id: "d1", type: "Door", wall_id: "w1", width: 0.70, height: 2.10, sill_height: 0, position_t: 0.5 },
        { id: "win1", type: "Window", wall_id: "w2", width: 1.20, height: 1.20, sill_height: 1.10, position_t: 0.5 },
      ],
    });
    const portaWarning = r.violations.find(v => v.field === "opening.width" && v.severity === "warning");
    expect(portaWarning).toBeDefined();
  });

  it("erro pé-direito abaixo de 2.50", () => {
    const r = validateProject({ ...baseProject, levels: [{ id: "L1", name: "Terreo", elevation: 0, height: 2.30 }] });
    expect(r.violations.some(v => v.field === "level.height")).toBe(true);
  });
});
