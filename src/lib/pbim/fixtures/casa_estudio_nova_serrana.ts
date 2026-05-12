import { PBIMProject } from '../schema';

export const casaEstudioNovaSerrana: PBIMProject = {
  project_id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  schema_version: "0.1.0",
  name: "Casa Estudio Nova Serrana",
  units: "m",
  site: {
    front_width: 10.0,
    rear_width: 12.0,
    depth: 30.0,
    slope_height: 1.8,
    orientation_front: "west",
    boundary: [[0, 0], [10, 0], [12, 30], [0, 30]]
  },
  levels: [
    { id: "level_terreo", name: "Terreo", elevation: 0.00, height: 3.2 },
    { id: "level_superior", name: "Pavimento Superior", elevation: 3.20, height: 3.0 }
  ],
  spaces: [
    {
      id: "space_001",
      type: "Space",
      name: "Estudio Fotografico",
      level_id: "level_terreo",
      category: "work",
      boundary_walls: ["wall_001", "wall_002", "wall_003", "wall_004"],
      area_target: 35.0,
      area_actual: 33.8,
      access_type: "independent",
      privacy_level: "public",
      adjacency_requirements: [],
      quality_checks: []
    },
    {
      id: "space_002",
      type: "Space",
      name: "Garagem",
      level_id: "level_terreo",
      category: "service",
      boundary_walls: ["wall_005", "wall_006", "wall_002", "wall_007"],
      privacy_level: "public",
      adjacency_requirements: [],
      quality_checks: []
    }
  ],
  walls: [
    // Estudio walls (simple 5x7 box for demo)
    { id: "wall_001", type: "Wall", level_id: "level_terreo", start: [0, 5, 0], end: [5, 5, 0], height: 3.0, thickness: 0.15, structural: false, openings: [] },
    { id: "wall_002", type: "Wall", level_id: "level_terreo", start: [5, 5, 0], end: [5, 12, 0], height: 3.0, thickness: 0.15, structural: true, openings: [] },
    { id: "wall_003", type: "Wall", level_id: "level_terreo", start: [5, 12, 0], end: [0, 12, 0], height: 3.0, thickness: 0.15, structural: false, openings: [] },
    { id: "wall_004", type: "Wall", level_id: "level_terreo", start: [0, 12, 0], end: [0, 5, 0], height: 3.0, thickness: 0.15, structural: true, openings: [] },
    
    // Garagem walls
    { id: "wall_005", type: "Wall", level_id: "level_terreo", start: [5, 0, 0], end: [10, 0, 0], height: 3.0, thickness: 0.15, structural: false, openings: [] },
    { id: "wall_006", type: "Wall", level_id: "level_terreo", start: [10, 0, 0], end: [10, 5, 0], height: 3.0, thickness: 0.15, structural: true, openings: [] },
    { id: "wall_007", type: "Wall", level_id: "level_terreo", start: [10, 5, 0], end: [5, 5, 0], height: 3.0, thickness: 0.15, structural: false, openings: [] },
  ],
  openings: [
    { id: "door_001", type: "Door", wall_id: "wall_001", width: 1.2, height: 2.1, sill_height: 0, position_t: 0.5 },
    { id: "window_001", type: "Window", wall_id: "wall_004", width: 2.0, height: 1.0, sill_height: 1.1, position_t: 0.5 }
  ],
  slabs: [
    {
      id: "floor-1",
      type: "Floor",
      level_id: "lvl-01",
      thickness: 0.15,
      elevation_offset: -0.15,
      boundary: [[0, 0], [10, 0], [10, 10], [0, 10]]
    },
    {
      id: "roof-1",
      type: "Roof",
      level_id: "lvl-01",
      thickness: 0.20,
      elevation_offset: 3.0,
      boundary: [[-0.5, -0.5], [10.5, -0.5], [10.5, 10.5], [-0.5, 10.5]]
    }
  ],
  stairs: [],
  views: [],
  sheets: []
};
