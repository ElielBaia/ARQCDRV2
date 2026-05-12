import { z } from 'zod';

// ==========================================
// ARQCdR - PBIM (Pre-BIM) Data Schemas
// ==========================================

export const SiteSchema = z.object({
  front_width: z.number(),
  rear_width: z.number().optional(),
  depth: z.number(),
  slope_height: z.number(),
  orientation_front: z.string(),
  boundary: z.array(z.tuple([z.number(), z.number()]))
});

export const LevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(),
  height: z.number().default(3.0)
});

export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["Concrete", "Wood", "Steel", "Glass", "Masonry", "Insulation", "Composite", "Other"]),
  color: z.string().optional(),
  density: z.number().optional(), // kg/m3
  u_value: z.number().optional(), // Thermal transmittance W/(m2K)
  embodied_carbon: z.number().optional() // kgCO2e/kg or kgCO2e/m3
});

export const TopologyNodeSchema = z.object({
    id: z.string(),
    space_id: z.string(),
});

export const TopologyEdgeSchema = z.object({
    source_id: z.string(),
    target_id: z.string(),
    relation: z.enum(["adjacent", "connected_by_door", "visual_connection", "contains"]),
    element_id: z.string().optional() // Optional ID of door or window connecting them
});

export const SpatialTopologySchema = z.object({
    nodes: z.array(TopologyNodeSchema).default([]),
    edges: z.array(TopologyEdgeSchema).default([])
});

export const WallSchema = z.object({
  id: z.string(),
  type: z.literal("Wall"),
  level_id: z.string(),
  start: z.array(z.number()).default([]), // More flexible for tuple [x,y,z]
  end: z.array(z.number()).default([]),
  height: z.number(),
  thickness: z.number(),
  material_id: z.string().optional(),
  material: z.string().optional(),
  structural: z.boolean().default(false),
  load_bearing: z.boolean().default(false).optional(),
  exterior: z.boolean().default(false).optional(),
  space_left: z.string().optional(),
  space_right: z.string().optional(),
  openings: z.array(z.string()).default([])
});

export const OpeningSchema = z.object({
  id: z.string(),
  type: z.enum(["Door", "Window"]),
  wall_id: z.string(),
  width: z.number(),
  height: z.number(),
  sill_height: z.number().default(0), // 0 for doors
  position_t: z.number().min(0).max(1) // Relative position along the wall (0 to 1)
});

export const SpaceSchema = z.object({
  id: z.string(),
  type: z.literal("Space"),
  name: z.string(),
  level_id: z.string(),
  category: z.string(),
  function_type: z.enum(["circulation", "living", "sleeping", "hygiene", "working", "service", "outdoor"]).optional(),
  occupancy_load: z.number().optional(), // people/m2
  boundary_walls: z.array(z.string()),
  boundary: z.array(z.tuple([z.number(), z.number()])).optional(), // Simplified pre-calculated boundary
  area_target: z.number().optional(),
  area_actual: z.number().optional(),
  volume: z.number().optional(),
  natural_lighting_factor: z.number().optional(), // estimated daylight%
  access_type: z.string().optional(),
  privacy_level: z.string().optional(),
  adjacency_requirements: z.array(z.string()).default([]),
  quality_checks: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]).optional(),
});

export const StairSchema = z.object({
  id: z.string(),
  type: z.literal("Stair"),
  level_id: z.string(),
  start: z.array(z.number()), // [x,y]
  end: z.array(z.number()), // [x,y]
  width: z.number().default(1.0),
  treads: z.number().default(15)
});

export const SlabSchema = z.object({
  id: z.string(),
  type: z.enum(["Floor", "Roof", "Foundation", "Ceiling"]),
  level_id: z.string(),
  boundary: z.array(z.tuple([z.number(), z.number()])),
  thickness: z.number().default(0.15),
  elevation_offset: z.number().default(0),
  material: z.string().optional(),
  slope: z.number().optional(), // Degree for roofs
});

export const ComponentSchema = z.object({
  id: z.string(),
  type: z.enum(["Eave", "Marquee", "Balcony", "Beam", "Column"]),
  level_id: z.string(),
  boundary: z.array(z.tuple([z.number(), z.number()])),
  parameters: z.record(z.string(), z.any()).optional(),
  material: z.string().optional(),
});

export const FurnitureSchema = z.object({
  id: z.string(),
  type: z.enum(["Bed", "Sofa", "DiningTable", "Desk", "Chair", "Cabinet", "Toilet", "Sink", "Shower", "Cooker", "Fridge"]),
  level_id: z.string(),
  position: z.tuple([z.number(), z.number()]),
  rotation: z.number().default(0), // Degrees
  width: z.number(),
  depth: z.number(),
  space_id: z.string().optional()
});

export const BuildingSystemsSchema = z.object({
  structure: z.string().optional(),
  hvac: z.string().optional(),
  electrical: z.string().optional(),
  plumbing: z.string().optional()
});

export const MetadataSchema = z.object({
  client: z.string().default("General Client"),
  address: z.string().default("AI Studio, Cloud City"),
  author: z.string().default("AI Studio Architect"),
  description: z.string().optional()
});

export const ProjectSchema = z.object({
  project_id: z.string().uuid(),
  schema_version: z.string(),
  name: z.string(),
  units: z.literal("m"),
  metadata: MetadataSchema.default({ client: "General Client", address: "AI Studio", author: "AI Studio Architect" }).optional(),
  topology: SpatialTopologySchema.optional(),
  site: SiteSchema.optional(),
  levels: z.array(LevelSchema).default([]),
  spaces: z.array(SpaceSchema).default([]),
  walls: z.array(WallSchema).default([]),
  openings: z.array(OpeningSchema).default([]),
  materials: z.record(z.string(), MaterialSchema).optional(),
  systems: BuildingSystemsSchema.optional(),
  slabs: z.array(SlabSchema).default([]),
  components: z.array(ComponentSchema).default([]).optional(),
  furniture: z.array(FurnitureSchema).default([]).optional(),
  stairs: z.array(StairSchema).default([]),
  views: z.array(z.any()).default([]),
  sheets: z.array(z.any()).default([])
});

export type PBIMSlab = z.infer<typeof SlabSchema>;
export type PBIMComponent = z.infer<typeof ComponentSchema>;
export type PBIMFurniture = z.infer<typeof FurnitureSchema>;

export type PBIMStair = z.infer<typeof StairSchema>;

export type PBIMProject = z.infer<typeof ProjectSchema>;
export type PBIMSpace = z.infer<typeof SpaceSchema>;
export type PBIMWall = z.infer<typeof WallSchema>;
export type PBIMOpening = z.infer<typeof OpeningSchema>;
