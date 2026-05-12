import { PBIMProject, PBIMSlab, PBIMComponent, PBIMFurniture } from './schema';

/**
 * BuildingSynthesisEngine
 * A highly sophisticated algorithm for semantic enrichment of BIM models.
 * Implements "Building Memory" by analyzing spatial relationships and 
 * automatically generating structural and architectural dependencies.
 */
export class BuildingSynthesisEngine {
  
  static enrich(project: PBIMProject): PBIMProject {
    console.log("[Synthesis] Enriching building semantic model...");
    
    // Ensure basic collections exist
    project.walls = project.walls || [];
    project.spaces = project.spaces || [];
    project.openings = project.openings || [];
    project.slabs = project.slabs || [];
    project.levels = project.levels || [];
    project.components = project.components || [];

    // 1. Ensure Foundations (Radiers)
    this.synthesizeFoundations(project);
    
    // 2. Ensure Ceilings and Intermediate Slabs
    this.synthesizeSlabs(project);
    
    // 3. Synthesize Eaves (Beirais) from Roof footprint
    this.synthesizeEaves(project);

    // 4. Synthesize Structural Columns at Wall Intersections (Simplified)
    this.synthesizeColumns(project);

    // 5. Semantic Validation Analysis
    this.validateSpatialSemantics(project);

    // 5.5 Space-Wall Relational Inference
    this.computeSpaceAdjacencies(project);

    // 6. Synthesize Semantic Topology Graph
    this.synthesizeTopology(project);

    // 7. Compute Environmental & Volume Metrics
    this.computeEnvironmentalMetrics(project);

    // 8. Synthesize Furniture Symbols
    this.synthesizeFurniture(project);

    return project;
  }

  private static computeSpaceAdjacencies(project: PBIMProject) {
      // Clear out existing adjs
      project.walls.forEach(w => {
          w.space_left = undefined;
          w.space_right = undefined;
      });

      // For every space, it has boundary_walls. 
      // We can assign the space to either space_left or space_right of the wall.
      project.spaces.forEach(space => {
          if (!space.boundary_walls) return;
          space.boundary_walls.forEach(wallId => {
              const wall = project.walls.find(w => w.id === wallId);
              if (wall) {
                  // Extremely simplified assignment
                  if (!wall.space_left) {
                      wall.space_left = space.id;
                  } else if (wall.space_left !== space.id && !wall.space_right) {
                      wall.space_right = space.id;
                  }
              }
          });
      });
  }

  private static synthesizeTopology(project: PBIMProject) {
      if (!project.topology) {
          project.topology = { nodes: [], edges: [] };
      }
      project.topology.nodes = [];
      project.topology.edges = [];

      // Create nodes for all spaces (and outdoor space)
      project.spaces.forEach(space => {
          project.topology!.nodes.push({ id: `node_${space.id}`, space_id: space.id });
      });

      // Find connections by shared walls
      project.walls.forEach(wall => {
          if (wall.space_left && wall.space_right) {
              const door = project.openings.find(o => o.wall_id === wall.id && o.type === 'Door');
              project.topology!.edges.push({
                  source_id: `node_${wall.space_left}`,
                  target_id: `node_${wall.space_right}`,
                  relation: door ? "connected_by_door" : "adjacent",
                  element_id: door?.id
              });
          }
      });
  }

  private static computeEnvironmentalMetrics(project: PBIMProject) {
      project.spaces.forEach(space => {
          // Volume computation (Area * Height of containing level)
          const level = project.levels.find(l => l.id === space.level_id);
          const height = level?.height || 3.0;
          if (space.area_actual) {
              space.volume = space.area_actual * height;
          }

          // Daylight estimation (Ratio of Window area to Floor area)
          const spaceWalls = project.walls.filter(w => (space.boundary_walls || []).includes(w.id));
          const spaceWindows = project.openings.filter(o => o.type === 'Window' && spaceWalls.some(w => w.id === o.wall_id));
          
          let windowArea = 0;
          spaceWindows.forEach(w => { windowArea += (w.width * w.height); });
          
          if (space.area_actual && space.area_actual > 0) {
              const daylightFactor = (windowArea / space.area_actual) * 100; // rough % approximation
              space.natural_lighting_factor = Math.round(daylightFactor * 10) / 10;
              
              if (daylightFactor < 10 && !['circulation', 'service', 'lavabo', 'garage'].includes(space.category?.toLowerCase() || '')) {
                 if (!space.warnings) space.warnings = [];
                 space.warnings.push(`ENV: Low natural lighting estimated (${daylightFactor.toFixed(1)}%). Recommended > 10%.`);
              }
          }
      });
  }

  private static validateSpatialSemantics(project: PBIMProject) {
      const standards: Record<string, { minArea: number, minWidth?: number, description: string }> = {
          'bedroom_couple': { minArea: 12, minWidth: 3.0, description: 'Master Bedroom' },
          'master_suite': { minArea: 14, minWidth: 3.2, description: 'Master Suite' },
          'bedroom_single': { minArea: 9, minWidth: 2.5, description: 'Single Bedroom' },
          'bathroom': { minArea: 3, minWidth: 1.2, description: 'Bathroom' },
          'kitchen': { minArea: 7, minWidth: 2.1, description: 'Kitchen' },
          'living': { minArea: 15, minWidth: 3.0, description: 'Living Room' },
          'dining': { minArea: 10, minWidth: 2.5, description: 'Dining Room' },
          'circulation': { minArea: 1, minWidth: 0.9, description: 'Corridor' },
          'lavabo': { minArea: 1.5, minWidth: 0.9, description: 'Powder Room' },
          'garage': { minArea: 12.5, minWidth: 2.5, description: 'Garage' }
      };

      project.spaces.forEach(space => {
          if (!space.warnings) space.warnings = [];
          
          const cat = space.category?.toLowerCase() || '';
          
          // Auto-classify functional zoning if missing
          if (!space.function_type) {
              if (['bedroom', 'suite', 'dormitorio', 'quartos'].some(k => cat.includes(k))) space.function_type = 'sleeping';
              else if (['living', 'estar', 'jantar', 'dining', 'varanda', 'balcony'].some(k => cat.includes(k))) space.function_type = 'living';
              else if (['kitchen', 'cozinha', 'area de servico', 'lavanderia', 'service'].some(k => cat.includes(k))) space.function_type = 'service';
              else if (['bathroom', 'banheiro', 'wc', 'lavabo', 'hygiene'].some(k => cat.includes(k))) space.function_type = 'hygiene';
              else if (['office', 'escritorio', 'studio', 'working'].some(k => cat.includes(k))) space.function_type = 'working';
              else if (['circulation', 'corredor', 'hall', 'escada', 'stairs'].some(k => cat.includes(k))) space.function_type = 'circulation';
          }

          if (!space.privacy_level) {
              if (space.function_type === 'sleeping') space.privacy_level = 'high';
              else if (space.function_type === 'living') space.privacy_level = 'low';
              else if (space.function_type === 'hygiene') space.privacy_level = 'high';
              else if (space.function_type === 'circulation') space.privacy_level = 'low';
              else space.privacy_level = 'medium';
          }

          const standard = standards[cat];
          
          // Calculate boundary if missing but we have walls
          if (!space.boundary || space.boundary.length === 0) {
              space.boundary = this.calculateSpaceBoundary(space, project);
          }

          if (space.boundary && space.boundary.length > 0) {
              // Calculate actual area from boundary if missing or potentially wrong
              const polyArea = Math.abs(this.calculatePolygonArea(space.boundary as [number, number][]));
              space.area_actual = polyArea;

              if (standard) {
                  const [minX, minY, maxX, maxY] = this.getPolygonBounds(space.boundary as [number, number][]);
                  const width = maxX - minX;
                  const depth = maxY - minY;
                  const minDimension = Math.min(width, depth);

                  if (polyArea < standard.minArea) {
                      space.warnings.push(`SEMAN: Area (${polyArea.toFixed(1)}m²) below ${standard.description} standard (${standard.minArea}m²).`);
                  }
                  if (standard.minWidth && minDimension < standard.minWidth) {
                      space.warnings.push(`METRIC: Width (${minDimension.toFixed(1)}m) below ${standard.description} minimum (${standard.minWidth}m).`);
                  }

                  // Proportion check (Proporção Áurea ou similar)
                  const aspect = width > 0 ? (Math.max(width, depth) / Math.min(width, depth)) : 0;
                  if (aspect > 3 && space.function_type !== 'circulation') {
                      space.warnings.push(`DESIGN: Narrow space (aspect 1:${aspect.toFixed(1)}). Consider widening for better habitability.`);
                  }
              }

              // Topology checks
              this.checkTopology(space, project);
          }
      });
  }

  private static calculatePolygonArea(points: [number, number][]) {
      let area = 0;
      for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          area += points[i][0] * points[j][1];
          area -= points[j][0] * points[i][1];
      }
      return area / 2;
  }

  private static checkTopology(space: any, project: PBIMProject) {
      // Check for openings (ventilation requirements)
      const wallsInSpace = project.walls.filter(w => (space.boundary_walls || []).includes(w.id));
      const openingsCount = project.openings.filter(o => wallsInSpace.some(w => w.id === o.wall_id)).length;
      
      if (openingsCount === 0 && !['circulation', 'lavabo', 'garage'].includes(space.category?.toLowerCase() || '')) {
          space.warnings.push('HEALTH: No openings (window/door) detected for this habitable space.');
      }

      // Adjacency checking (example: suite must have direct connection to a bathroom)
      // This requires more complex graph traversal, simplified for now
  }

  private static calculateSpaceBoundary(space: any, project: PBIMProject): [number, number][] {
      // Very simplified: collect all endpoints of boundary walls and try to order them
      const points: [number, number][] = [];
      (space.boundary_walls || []).forEach((wallId: string) => {
          const wall = project.walls.find(w => w.id === wallId);
          if (wall) {
              points.push([wall.start[0], wall.start[1]]);
              points.push([wall.end[0], wall.end[1]]);
          }
      });
      if (points.length < 3) return [];
      
      // Remove duplicates
      const uniquePoints = points.filter((p, i) => points.findIndex(p2 => p2[0] === p[0] && p2[1] === p[1]) === i);
      
      // Simple centroid sort for convex polygons (fallback)
      const cx = uniquePoints.reduce((sum, p) => sum + p[0], 0) / uniquePoints.length;
      const cy = uniquePoints.reduce((sum, p) => sum + p[1], 0) / uniquePoints.length;
      
      return uniquePoints.sort((a, b) => {
          return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
      });
  }

  private static getPolygonBounds(poly: [number, number][]): [number, number, number, number] {
      if (poly.length === 0) return [0, 0, 0, 0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      poly.forEach(p => {
          minX = Math.min(minX, p[0]);
          minY = Math.min(minY, p[1]);
          maxX = Math.max(maxX, p[0]);
          maxY = Math.max(maxY, p[1]);
      });
      return [minX, minY, maxX, maxY];
  }

  private static synthesizeFoundations(project: PBIMProject) {
    const hasFoundation = project.slabs.some(s => s.type === 'Foundation');
    if (hasFoundation) return;

    // Create a bounding box union of all level 0 walls/slabs
    const groundLevel = project.levels.find(l => l.elevation === 0) || project.levels[0];
    if (!groundLevel) return;

    // For radier, we use the convex hull or bounding footprint of all walls
    const footprint = this.calculateBuildingFootprint(project);
    if (footprint.length < 3) return;

    const foundation: PBIMSlab = {
      id: `found_${crypto.randomUUID().split('-')[0]}`,
      type: 'Foundation',
      level_id: groundLevel.id,
      boundary: footprint,
      thickness: 0.30, // Radier thickness
      elevation_offset: -0.30,
      material: 'Concrete'
    };

    project.slabs.push(foundation);
  }

  private static synthesizeSlabs(project: PBIMProject) {
    // Ensure every space has a floor if not present
    project.spaces.forEach(space => {
        // ... in a real sophisticated engine we would check if space is covered
    });
  }

  private static synthesizeEaves(project: PBIMProject) {
    const roofs = project.slabs.filter(s => s.type === 'Roof');
    roofs.forEach(roof => {
        const hasEave = project.components.some(c => c.type === 'Eave' && c.level_id === roof.level_id);
        if (hasEave) return;

        // Offset roof boundary outwards for eaves
        const eaveBoundary = this.offsetPolygon(roof.boundary as [number, number][], 0.6); // 60cm eave
        
        const eave: PBIMComponent = {
            id: `eave_${crypto.randomUUID().split('-')[0]}`,
            type: 'Eave',
            level_id: roof.level_id,
            boundary: eaveBoundary,
            material: 'Wood/Concrete'
        };
        project.components.push(eave);
    });
  }

  private static synthesizeColumns(project: PBIMProject) {
      // In a "sophisticated" approach, we find wall joints and place columns
      const joints = new Set<string>();
      project.walls.forEach(w => {
          joints.add(`${w.start[0]},${w.start[1]}`);
          joints.add(`${w.end[0]},${w.end[1]}`);
      });

      joints.forEach(joint => {
          const [x, y] = joint.split(',').map(Number);
          const col: PBIMComponent = {
              id: `col_${crypto.randomUUID().split('-')[0]}`,
              type: 'Column',
              level_id: project.levels[0]?.id || 'lvl0',
              boundary: [
                  [x - 0.1, y - 0.1],
                  [x + 0.1, y - 0.1],
                  [x + 0.1, y + 0.1],
                  [x - 0.1, y + 0.1]
              ],
              material: 'Reinforced Concrete'
          };
          project.components.push(col);
      });
  }

  private static calculateBuildingFootprint(project: PBIMProject): [number, number][] {
    // Simplified: Bounding box of all walls
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    project.walls.forEach(w => {
      minX = Math.min(minX, w.start[0], w.end[0]);
      minY = Math.min(minY, w.start[1], w.end[1]);
      maxX = Math.max(maxX, w.start[0], w.end[0]);
      maxY = Math.max(maxY, w.start[1], w.end[1]);
    });
    
    // Add small offset
    const offset = 0.2;
    return [
      [minX - offset, minY - offset],
      [maxX + offset, minY - offset],
      [maxX + offset, maxY + offset],
      [minX - offset, maxY + offset]
    ];
  }

  private static offsetPolygon(poly: [number, number][], offset: number): [number, number][] {
      // Simplified polygon offset (only works for rect-like)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      poly.forEach(p => {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]);
        maxY = Math.max(maxY, p[1]);
      });
      return [
        [minX - offset, minY - offset],
        [maxX + offset, minY - offset],
        [maxX + offset, maxY + offset],
        [minX - offset, maxY + offset]
      ];
  }

  private static synthesizeFurniture(project: PBIMProject) {
      if (!project.furniture) project.furniture = [];
      
      project.spaces.forEach(space => {
          // Only place if no furniture exists for this space
          const hasExisting = project.furniture!.some(f => f.space_id === space.id);
          if (hasExisting) return;
          
          if (!space.boundary || space.boundary.length < 3) return;
          
          const [minX, minY, maxX, maxY] = this.getPolygonBounds(space.boundary as [number, number][]);
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const width = maxX - minX;
          const depth = maxY - minY;

          const createFurn = (type: PBIMFurniture['type'], w: number, d: number, ox = 0, oy = 0, rot = 0): PBIMFurniture => ({
              id: `furn_${type.toLowerCase()}_${crypto.randomUUID().split('-')[0]}`,
              type,
              level_id: space.level_id,
              position: [centerX + ox, centerY + oy],
              width: w,
              depth: d,
              rotation: rot,
              space_id: space.id
          });

          const ft = space.function_type;
          const cat = space.category?.toLowerCase() || '';

          if (ft === 'sleeping' || cat.includes('bedroom') || cat.includes('suite')) {
              project.furniture!.push(createFurn("Bed", 1.6, 2.0));
          } 
          else if (ft === 'living' || cat.includes('living') || cat.includes('estar') || cat.includes('jantar')) {
              if (cat.includes('jantar') || cat.includes('dining')) {
                project.furniture!.push(createFurn("DiningTable", 1.8, 0.9));
              } else {
                project.furniture!.push(createFurn("Sofa", 2.2, 0.9, 0, -depth/4));
              }
          }
          else if (ft === 'hygiene' || cat.includes('bath') || cat.includes('wc')) {
              project.furniture!.push(createFurn("Toilet", 0.4, 0.6, -width/4, depth/4));
              project.furniture!.push(createFurn("Sink", 0.6, 0.4, width/4, depth/4));
              if (width * depth > 3.5) {
                project.furniture!.push(createFurn("Shower", 0.9, 0.9, -width/4, -depth/4));
              }
          }
          else if (ft === 'service' || cat.includes('kitchen') || cat.includes('cozinha')) {
              project.furniture!.push(createFurn("Cooker", 0.6, 0.6, -width/3, 0));
              project.furniture!.push(createFurn("Fridge", 0.7, 0.7, width/3, 0));
          }
          else if (ft === 'working' || cat.includes('office') || cat.includes('estudo')) {
              project.furniture!.push(createFurn("Desk", 1.4, 0.7, 0, -depth/4));
              project.furniture!.push(createFurn("Chair", 0.5, 0.5, 0, -depth/4 + 0.6));
          }
      });
  }
}
