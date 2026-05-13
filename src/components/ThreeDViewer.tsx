import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Environment, ContactShadows, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { PBIMProject, PBIMWall, PBIMSpace } from '../lib/pbim/schema';

// Helper for spaces
import { getPolygonCoords } from './InteractivePlanEditor';

const getLevelHeight = (levelId: string | undefined, project: PBIMProject): number => {
  const DEFAULT_HEIGHT = 3.0;
  if (!levelId) return DEFAULT_HEIGHT;
  const currentLevel = project.levels.find(l => l.id === levelId);
  if (!currentLevel) return DEFAULT_HEIGHT;

  // Try to find the level above to calculate height from elevation difference
  const sortedLevels = [...project.levels].sort((a, b) => a.elevation - b.elevation);
  const currentIndex = sortedLevels.findIndex(l => l.id === levelId);

  if (currentIndex !== -1 && currentIndex < sortedLevels.length - 1) {
    const diff = sortedLevels[currentIndex + 1].elevation - currentLevel.elevation;
    if (diff > 0) return diff;
  }

  return currentLevel.height || DEFAULT_HEIGHT;
};

// Helper to convert Wall to 3D Transform
const buildWallTransform = (wall: PBIMWall, levelZ: number) => {
  const [x1, y1] = wall.start;
  const [x2, y2] = wall.end;
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  // Center point
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  
  // Angle
  const angle = Math.atan2(-dy, dx); 

  return {
    position: [cx, (wall.height / 2) + levelZ, -cy] as [number, number, number],
    rotation: [0, angle, 0] as [number, number, number],
    args: [length, wall.height, wall.thickness] as [number, number, number],
    structural: wall.structural,
    length,
    dx, dy
  };
};

const SpaceFloorMesh = ({ space, project, clipPlanes }: { space: PBIMSpace, project: PBIMProject, clipPlanes: THREE.Plane[] }) => {
  const pts = getPolygonCoords(space, project.walls, (id) => {
    const w = project.walls.find(w => w.id === id);
    if (!w) return {x:0, y:0};
    return { x: w.start[0], y: w.start[1], ox: w.end[0], oy: w.end[1] };
  });

  if (!pts || pts.length < 3) return null;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      s.lineTo(pts[i].x, pts[i].y);
    }
    s.lineTo(pts[0].x, pts[0].y);
    return s;
  }, [pts]);

  const levelZ = project.levels.find(l => l.id === space.level_id)?.elevation || 0;
  // Extrude settings: floor is typically 0.15m thick
  const extrudeSettings = { depth: 0.15, bevelEnabled: false };

  let color = '#e2e8f0'; // Default gray floor
  if (space.category === 'outdoor') color = '#dcfce7'; // green-ish
  else if (space.category === 'bathroom') color = '#f1f5f9'; // tile-like
  else if (space.category === 'living' || space.category === 'social') color = '#fef3c7'; // warm wood-like

  return (
    <mesh position={[0, levelZ, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshPhysicalMaterial color={color} roughness={0.9} clippingPlanes={clipPlanes} />
      <Edges scale={1} threshold={30} color="#cbd5e1" />
    </mesh>
  );
};

const RoofMesh = ({ space, project, clipPlanes }: { space: PBIMSpace, project: PBIMProject, clipPlanes: THREE.Plane[] }) => {
  // If no level above, draw a roof
  const currentLevel = project.levels.find(l => l.id === space.level_id);
  const zElevation = currentLevel ? currentLevel.elevation : 0;
  
  const levelHeight = getLevelHeight(space.level_id, project);
  let maxWHeight = levelHeight;
  if (space.boundary_walls) {
    space.boundary_walls.forEach(wid => {
      const w = project.walls.find(x => x.id === wid);
      if (w && typeof w.height === 'number') {
        maxWHeight = Math.max(maxWHeight, w.height);
      }
    });
  }

  const pts = getPolygonCoords(space, project.walls, (id) => {
    const w = project.walls.find(w => w.id === id);
    if (!w) return {x:0, y:0};
    return { x: w.start[0], y: w.start[1], ox: w.end[0], oy: w.end[1] };
  });

  if (!pts || pts.length < 3) return null;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // Offset slightly for eaves
    s.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      s.lineTo(pts[i].x, pts[i].y);
    }
    s.lineTo(pts[0].x, pts[0].y);
    return s;
  }, [pts]);

  const roofZ = zElevation + maxWHeight;

  // We only draw roof if this is L1 (or highest level)
  if (space.level_id !== 'L1' && space.level_id !== 'level_superior') return null;

  return (
    <mesh position={[0, roofZ, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <extrudeGeometry args={[shape, { depth: 0.2, bevelEnabled: false }]} />
      <meshPhysicalMaterial color="#475569" roughness={0.8} clippingPlanes={clipPlanes} />
    </mesh>
  );
};

const getSemanticMaterial = (materialName: string | undefined, defaultColor: string, isStructural: boolean) => {
  // Always favor a clean, architectural model look unless specific materials are requested.
  // We use off-white / plaster tones for a cohesive "museum model" feel.
  let color = '#f4f4f4'; 
  let roughness = 0.95;
  let metalness = 0.0;
  let clearcoat = 0.0;
  let transmission = 0.0;

  if (materialName) {
      const name = materialName.toLowerCase();
      if (name.includes('vidro') || name.includes('glass')) {
        color = '#aaccff';
        roughness = 0.1;
        metalness = 0.8;
        transmission = 0.9;
        clearcoat = 1.0;
      } else if (name.includes('madeira') || name.includes('wood')) {
        color = '#dcd3b6'; // very light ash wood for the model look
        roughness = 0.8;
      } else if (name.includes('metal') || name.includes('steel') || name.includes('aco')) {
        color = '#333333';
        roughness = 0.5;
        metalness = 0.8;
      }
  } else if (!isStructural) {
      color = '#ffffff';
  } else {
      color = '#e8e8e8'; // slightly darker for structural elements like foundations
  }

  return { color, roughness, metalness, clearcoat, transmission: 0 };
};

const WallMesh = ({ wall, project, selected, onClick, clipPlanes }: { wall: PBIMWall, project: PBIMProject, selected: boolean, onClick: (e: any) => void, clipPlanes: THREE.Plane[], key?: React.Key }) => {
  const levelZ = project.levels.find(l => l.id === wall.level_id)?.elevation || 0;
  const { position, rotation, args, structural, length } = useMemo(() => buildWallTransform(wall, levelZ), [wall, levelZ]);

  const semanticMat = getSemanticMaterial(wall.material, '', structural);

  const wallOpenings = project.openings?.filter(o => o.wall_id === wall.id) || [];

  return (
    <group position={position} rotation={rotation}>
      <mesh 
        onClick={onClick}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
        userData={{ type: 'Wall', id: wall.id }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={args} />
        <meshPhysicalMaterial 
          color={selected ? '#4f46e5' : semanticMat.color} 
          roughness={semanticMat.roughness} 
          metalness={semanticMat.metalness} 
          clearcoat={semanticMat.clearcoat}
          transparent={selected || semanticMat.color === '#aaccff'} 
          opacity={(selected ? 0.7 : 1) * (semanticMat.color === '#aaccff' ? 0.5 : 1)} 
          transmission={semanticMat.transmission || (semanticMat.color === '#aaccff' ? 0.9 : 0)}
          clippingPlanes={clipPlanes} 
          side={THREE.DoubleSide} 
        />
        <Edges scale={1} threshold={30} color={selected ? '#4f46e5' : '#b0b0b0'} />
      </mesh>
      
      {/* Draw Openings as Overlays */}
      {wallOpenings.map(op => {
         const localX = (op.position_t - 0.5) * length;
         const localY = -wall.height/2 + (op.sill_height || 0) + op.height/2;
         
         if (op.type === 'Window') {
             return (
               <group key={op.id} position={[localX, localY, 0]}>
                 <mesh>
                    <boxGeometry args={[op.width, op.height, wall.thickness - 0.02]} />
                    <meshPhysicalMaterial color="#88ccff" transmission={0.8} opacity={1} transparent roughness={0.1} ior={1.5} thickness={0.05} clippingPlanes={clipPlanes} side={THREE.DoubleSide} />
                 </mesh>
                 <mesh position={[0,0,0]} castShadow receiveShadow>
                     <boxGeometry args={[op.width + 0.04, op.height + 0.04, wall.thickness + 0.04]} />
                     <meshStandardMaterial color="#2d2d2d" roughness={0.7} clippingPlanes={clipPlanes} />
                 </mesh>
               </group>
             )
         } else {
             return (
               <mesh key={op.id} position={[localX, localY, 0]} castShadow receiveShadow>
                  <boxGeometry args={[op.width, op.height, wall.thickness + 0.04]} />
                  <meshStandardMaterial color="#dcd3b6" roughness={0.8} clippingPlanes={clipPlanes} side={THREE.DoubleSide} />
                  <Edges scale={1} threshold={30} color="#b0b0b0" />
               </mesh>
             )
         }
      })}
    </group>
  );
};

const SlabMesh = ({ slab, project, selected, onClick, clipPlanes }: { slab: any, project: PBIMProject, selected: boolean, onClick: (e: any) => void, clipPlanes: THREE.Plane[], key?: React.Key }) => {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (!slab.boundary || slab.boundary.length < 3) return null;
    
    // Y in 2D goes to -Z in 3D
    shape.moveTo(slab.boundary[0][0], -slab.boundary[0][1]);
    for(let i = 1; i < slab.boundary.length; i++) {
        shape.lineTo(slab.boundary[i][0], -slab.boundary[i][1]);
    }
    shape.lineTo(slab.boundary[0][0], -slab.boundary[0][1]); // close

    const extrudeSettings = {
      depth: slab.thickness || 0.15,
      bevelEnabled: false,
    };
    
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    
    return geo;
  }, [slab]);

  if (!geometry) return null;

  let baseColor = '#e0e0e0';
  if (slab.type === 'Roof') baseColor = '#2a2a2a';
  else if (slab.type === 'Foundation') baseColor = '#9a9a9a';
  else if (slab.type === 'Ceiling') baseColor = '#faf9f6';

  const semanticMat = getSemanticMaterial(slab.material, baseColor, slab.type === 'Foundation');

  const levelZ = project.levels.find(l => l.id === slab.level_id)?.elevation || 0;
  const levelHeight = getLevelHeight(slab.level_id, project);
  const yPos = levelZ + (slab.elevation_offset || 0) + (slab.type === 'Roof' ? levelHeight : slab.type === 'Foundation' ? -slab.thickness : 0);

  return (
    <mesh 
      geometry={geometry} 
      position={[0, yPos, 0]} 
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
      castShadow
      receiveShadow
    >
      <meshPhysicalMaterial 
        color={selected ? '#ffdddd' : semanticMat.color} 
        roughness={slab.type === 'Roof' && !slab.material ? 0.9 : semanticMat.roughness} 
        metalness={semanticMat.metalness} 
        clearcoat={semanticMat.clearcoat}
        transparent={selected || semanticMat.color === '#aaccff'} 
        opacity={(selected ? 0.8 : 1) * (semanticMat.color === '#aaccff' ? 0.5 : 1)} 
        transmission={semanticMat.color === '#aaccff' ? 0.9 : 0}
        clippingPlanes={clipPlanes} 
        side={THREE.DoubleSide} 
      />
      <Edges scale={1} threshold={15} color={selected ? '#ff0000' : (slab.type === 'Roof' && !slab.material ? '#111' : '#c0c0c0')} />
    </mesh>
  );
};

const ComponentMesh = ({ component, project, selected, onClick, clipPlanes }: { component: any, project: PBIMProject, selected: boolean, onClick: (e: any) => void, clipPlanes: THREE.Plane[], key?: React.Key }) => {
    const levelZ = project.levels.find(l => l.id === component.level_id)?.elevation || 0;
    
    const levelHeight = getLevelHeight(component.level_id, project);

    const geometry = useMemo(() => {
      const shape = new THREE.Shape();
      if (!component.boundary || component.boundary.length < 3) return null;
      
      shape.moveTo(component.boundary[0][0], -component.boundary[0][1]);
      for(let i = 1; i < component.boundary.length; i++) {
          shape.lineTo(component.boundary[i][0], -component.boundary[i][1]);
      }
      shape.lineTo(component.boundary[0][0], -component.boundary[0][1]);
  
      const depth = component.type === 'Column' ? levelHeight : component.type === 'Beam' ? 0.4 : 0.15;
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      return geo;
    }, [component, levelHeight]);
  
    if (!geometry) return null;
  
    let baseColor = '#ffffff';
    if (component.type === 'Marquee' || component.type === 'Eave') baseColor = '#141414';
    else if (component.type === 'Beam' || component.type === 'Column') baseColor = '#e8e8e8';

    const semanticMat = getSemanticMaterial(component.material, baseColor, component.type === 'Beam' || component.type === 'Column');
  
    const yPos = levelZ + (component.type === 'Column' ? levelHeight : component.type === 'Marquee' ? levelHeight * 0.93 : component.type === 'Eave' ? levelHeight * 1.03 : levelHeight);
  
    return (
      <mesh 
        geometry={geometry} 
        position={[0, yPos, 0]} 
        onClick={onClick}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial 
          color={selected ? '#ffdddd' : (semanticMat.color === '#ffffff' ? '#f5f4ef' : semanticMat.color)} 
          roughness={semanticMat.roughness} 
          metalness={semanticMat.metalness} 
          clearcoat={semanticMat.clearcoat}
          transparent={selected || semanticMat.color === '#aaccff'} 
          opacity={(selected ? 0.8 : 1) * (semanticMat.color === '#aaccff' ? 0.5 : 1)} 
          transmission={semanticMat.color === '#aaccff' ? 0.9 : 0}
          clippingPlanes={clipPlanes} 
          side={THREE.DoubleSide} 
        />
        <Edges scale={1} threshold={15} color={selected ? '#ff0000' : (baseColor === '#141414' && !component.material ? '#000' : '#d0cfca')} />
      </mesh>
    );
};

const StairMesh = ({ stair, project, clipPlanes }: { stair: any, project: PBIMProject, clipPlanes: THREE.Plane[], key?: React.Key }) => {
  const levelZ = project.levels.find(l => l.id === stair.level_id)?.elevation || 0;
  // stair.start, stair.end, stair.width, stair.treads
  const [x1, y1] = stair.start;
  const [x2, y2] = stair.end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const treads = stair.treads || 15;
  const treadDepth = length / treads;
  const levelHeight = getLevelHeight(stair.level_id, project);
  const treadHeight = levelHeight / treads; // assuming level height per floor

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    let vertexOffset = 0;
    
    for (let i = 0; i < treads; i++) {
        const x_start = i * treadDepth;
        const x_end = (i + 1) * treadDepth;
        const z_start = i * treadHeight;
        const z_end = (i + 1) * treadHeight;
        const halfWidth = (stair.width || 1.0) / 2;

        // Tread Top (Horizontal)
        vertices.push(
          x_start, z_start, -halfWidth,  // 0
          x_end, z_start, -halfWidth,    // 1
          x_start, z_start, halfWidth,   // 2
          x_end, z_start, halfWidth      // 3
        );
        indices.push(
          vertexOffset, vertexOffset+1, vertexOffset+2,
          vertexOffset+1, vertexOffset+3, vertexOffset+2
        );
        vertexOffset += 4;

        // Riser Front (Vertical)
        vertices.push(
          x_end, z_start, -halfWidth,    // 0
          x_end, z_end, -halfWidth,      // 1
          x_end, z_start, halfWidth,     // 2
          x_end, z_end, halfWidth        // 3
        );
        indices.push(
          vertexOffset, vertexOffset+1, vertexOffset+2,
          vertexOffset+1, vertexOffset+3, vertexOffset+2
        );
        vertexOffset += 4;
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const groupGeo = new THREE.BufferGeometry();
    const matr = new THREE.Matrix4().makeRotationY(-angle);
    const matT = new THREE.Matrix4().makeTranslation(x1, 0, y1);
    
    geo.applyMatrix4(matr);
    geo.applyMatrix4(matT);

    return geo;
  }, [stair, length, angle, x1, y1]);

  return (
    <mesh geometry={geometry} position={[0, levelZ, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#c0c0c0" roughness={0.8} clippingPlanes={clipPlanes} side={THREE.DoubleSide} />
      <Edges scale={1} threshold={15} color="#888" />
    </mesh>
  );
};

export const ThreeDViewer = ({ 
  project, 
  selectedObjectId, 
  onSelect 
}: { 
  project: PBIMProject, 
  selectedObjectId: string | null,
  onSelect: (id: string | null) => void 
}) => {
  
  // Calculate scene center
  const center = useMemo(() => {
    if (!project || project.walls.length === 0) return [0, 0, 0] as [number, number, number];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    project.walls.forEach(w => {
      minX = Math.min(minX, w.start[0], w.end[0]);
      minY = Math.min(minY, w.start[1], w.end[1]);
      maxX = Math.max(maxX, w.start[0], w.end[0]);
      maxY = Math.max(maxY, w.start[1], w.end[1]);
    });
    return [(minX + maxX)/2, 0, -(minY + maxY)/2] as [number, number, number];
  }, [project]);

  // Section / Cut Plane (Example to cut along X axis, looking +X)
  // To avoid cutting everything unless user wants, we can make it a toggle, but for now we won't clip by default.
  // We can attach `clippingPlanes` to all materials.
  const [isSectionActive, setIsSectionActive] = React.useState(false);
  const clipPlanes = useMemo(() => {
      if (!isSectionActive) return [];
      // Plane cutting halfway through the building
      return [new THREE.Plane(new THREE.Vector3(1, 0, 0), -(center[0]))];
  }, [isSectionActive, center]);

  return (
    <div className="relative w-full h-full">
      <button 
         className="absolute top-4 left-4 z-10 font-mono text-xs uppercase bg-white border border-black px-2 py-1 hover:bg-black hover:text-white"
         onClick={() => setIsSectionActive(!isSectionActive)}
      >
         {isSectionActive ? 'Disable Section 🔴' : 'Enable Section (Corte) ✂️'}
      </button>

      <Canvas shadows camera={{ position: [center[0], 25, center[2] + 25], fov: 40 }} gl={{ localClippingEnabled: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}>
        <fog attach="fog" args={['#e8e8e8', 30, 150]} />
        <Sky sunPosition={[100, 20, 100]} turbidity={0.3} rayleigh={0.5} />
        <Environment preset="city" />

        {/* Soft architectural daylight lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight 
           position={[50, 50, 30]} 
           intensity={1.2} 
           castShadow 
           shadow-bias={-0.0001} 
           shadow-mapSize={[2048, 2048]} 
           shadow-camera-left={-20}
           shadow-camera-right={20}
           shadow-camera-top={20}
           shadow-camera-bottom={-20}
        />
        <hemisphereLight intensity={0.4} groundColor="#888888" color="#ffffff" />
        
        <ContactShadows resolution={1024} scale={50} blur={2} opacity={0.4} far={10} color="#000000" />

        {/* Major Grid on the ground */}
        <gridHelper args={[200, 40, '#000000', '#bbbbbb']} position={[0, -0.02, 0]} material-opacity={0.08} material-transparent />
      
        {/* 3D Walls */}
        {project.walls.map(wall => (
          <WallMesh 
            key={wall.id} 
            wall={wall} 
            project={project}
            selected={selectedObjectId === wall.id}
            clipPlanes={clipPlanes}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(wall.id);
            }}
          />
        ))}

        {/* 3D Floors and Roofs derived from Spaces */}
        {project.spaces?.map(space => (
          <React.Fragment key={space.id}>
            <SpaceFloorMesh space={space} project={project} clipPlanes={clipPlanes} />
            <RoofMesh space={space} project={project} clipPlanes={clipPlanes} />
          </React.Fragment>
        ))}

        {/* 3D Stairs */}
        {project.stairs?.map(stair => (
          <StairMesh 
            key={stair.id}
            stair={stair}
            project={project}
            clipPlanes={clipPlanes}
          />
        ))}

        {/* Ground plane with subtle "paper" color */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.05, 0]} 
          receiveShadow 
          onClick={() => onSelect(null)}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshStandardMaterial color="#f0efe9" roughness={1} />
        </mesh>

        {/* Site Plot Representation */}
        {project.site?.boundary && (
           <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
              <shapeGeometry args={[useMemo(() => {
                const s = new THREE.Shape();
                const b = project.site!.boundary;
                if (!b || b.length < 3) return new THREE.Shape();
                s.moveTo(b[0][0], b[0][1]);
                for(let i=1; i<b.length; i++) s.lineTo(b[i][0], b[i][1]);
                s.lineTo(b[0][0], b[0][1]);
                return s;
              }, [project.site.boundary])]} />
              <meshStandardMaterial color="#dce2c8" roughness={0.9} transparent opacity={0.6} />
              <Edges scale={1} threshold={15} color="#8da080" />
           </mesh>
        )}
      
        {/* 3D Slabs (Floors, Roofs) */}
      {project.slabs?.map(slab => (
        <SlabMesh 
          key={slab.id} 
          slab={slab} 
          project={project}
          selected={selectedObjectId === slab.id}
          clipPlanes={clipPlanes}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(slab.id);
          }}
        />
      ))}

        {/* 3D Components (Eaves, Marquees, etc.) */}
      {project.components?.map(comp => (
        <ComponentMesh 
          key={comp.id} 
          component={comp} 
          project={project}
          selected={selectedObjectId === comp.id}
          clipPlanes={clipPlanes}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(comp.id);
          }}
        />
      ))}
      
      <OrbitControls target={center} makeDefault minPolarAngle={0} maxPolarAngle={Math.PI/2 - 0.1} />
    </Canvas>
    </div>
  );
};
