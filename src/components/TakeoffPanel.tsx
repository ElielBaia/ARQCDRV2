import React, { useMemo } from 'react';
import { PBIMProject } from '../lib/pbim/schema';
import { FileBarChart2 } from 'lucide-react';

export const TakeoffPanel: React.FC<{ project: PBIMProject | null }> = ({ project }) => {
  const takeoff = useMemo(() => {
    if (!project) return null;

    let totalArea = 0;
    let totalWallVolume = 0;
    let totalWallLen = 0;
    let concreteVolume = 0;
    
    project.spaces.forEach(s => totalArea += (s.area_actual || 0));
    
    project.walls.forEach(w => {
      const dx = w.end[0] - w.start[0];
      const dy = w.end[1] - w.start[1];
      const len = Math.hypot(dx, dy);
      totalWallLen += len;
      totalWallVolume += len * w.thickness * w.height;
      if (w.structural) concreteVolume += len * w.thickness * w.height;
    });

    // Slabs & Foundations
    let foundationArea = 0;
    let foundationVolume = 0;
    let totalSpaceVolume = 0;
    let averageDaylight = 0;
    let daylightSpaces = 0;
    let totalNodes = project.topology?.nodes.length || 0;
    let totalEdges = project.topology?.edges.length || 0;

    project.spaces.forEach(s => {
        totalSpaceVolume += (s.volume || 0);
        if (s.natural_lighting_factor !== undefined) {
             averageDaylight += s.natural_lighting_factor;
             daylightSpaces++;
        }
    });
    
    if (daylightSpaces > 0) averageDaylight /= daylightSpaces;

    project.slabs.forEach(s => {
        if (s.type === 'Foundation') {
            // Shoelace formula or simple rect approx
            const area = Math.abs(calculateArea(s.boundary as [number, number][]));
            foundationArea += area;
            foundationVolume += area * s.thickness;
            concreteVolume += area * s.thickness;
        }
    });

    const openingsCount = project.openings.length;
    const doorsCount = project.openings.filter(o => o.type === 'Door').length;
    const windowsCount = project.openings.filter(o => o.type === 'Window').length;
    const componentCount = project.components?.length || 0;

    return {
      totalArea: totalArea.toFixed(2),
      totalSpaceVolume: totalSpaceVolume.toFixed(2),
      averageDaylight: averageDaylight.toFixed(1),
      totalNodes, totalEdges,
      totalWallLen: totalWallLen.toFixed(2),
      totalWallVolume: totalWallVolume.toFixed(2),
      foundationVolume: foundationVolume.toFixed(2),
      concreteVolume: concreteVolume.toFixed(2),
      openingsCount, doorsCount, windowsCount, componentCount,
      wallCount: project.walls.length,
      spaceCount: project.spaces.length,
    }
  }, [project]);

function calculateArea(points: [number, number][]) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i][0] * points[j][1];
        area -= points[j][0] * points[i][1];
    }
    return area / 2;
}

  if (!project || !takeoff) {
    return <div className="p-4 font-mono text-[10px] opacity-50">No Data Available</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-black flex items-center gap-2 bg-black text-white">
        <FileBarChart2 size={16} />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest">BIM Quantity Takeoff (QTO)</span>
      </div>
      <div className="p-5 flex flex-col gap-8 overflow-y-auto pb-24">
        
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="text-[9px] font-mono uppercase text-black/40 mb-3 tracking-widest font-bold">Metrics Summary</div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Total Built Area (GFA)</span>
              <span className="font-mono text-xs font-bold">{takeoff.totalArea} m²</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Total Internal Volume</span>
              <span className="font-mono text-xs font-bold">{takeoff.totalSpaceVolume} m³</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Building Levels</span>
              <span className="font-mono text-xs font-bold">{project.levels.length} lvl</span>
            </div>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-50">
          <div className="text-[9px] font-mono uppercase text-black/40 mb-3 tracking-widest font-bold">Semantic & Topology</div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Topological Nodes</span>
              <span className="font-mono text-xs font-bold">{takeoff.totalNodes}</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Relational Edges</span>
              <span className="font-mono text-xs font-bold">{takeoff.totalEdges}</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Average Daylight Est.</span>
              <span className="font-mono text-xs font-bold text-blue-600">{takeoff.averageDaylight}%</span>
            </div>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
          <div className="text-[9px] font-mono uppercase text-black/40 mb-3 tracking-widest font-bold">Structural & Enclosure</div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Wall Elements</span>
              <span className="font-mono text-xs font-bold">{takeoff.wallCount}</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Foundation Volume (Radier)</span>
              <span className="font-mono text-xs font-bold">{takeoff.foundationVolume} m³</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Total Concrete Est.</span>
              <span className="font-mono text-xs font-bold text-emerald-600">{takeoff.concreteVolume} m³</span>
            </div>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
          <div className="text-[9px] font-mono uppercase text-black/40 mb-3 tracking-widest font-bold">System Components</div>
           <div className="flex flex-col gap-3">
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Special Components (Eaves/Marquees)</span>
              <span className="font-mono text-xs font-bold">{takeoff.componentCount}</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2">
              <span className="font-sans text-xs font-medium text-black/70">Openings (Door/Win)</span>
              <span className="font-mono text-xs font-bold">{takeoff.openingsCount}</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2 group">
              <span className="font-sans text-xs font-medium text-black/40 pl-4 transition-colors group-hover:text-black">▸ Exterior/Interior Doors</span>
              <span className="font-mono text-xs font-bold">{takeoff.doorsCount} units</span>
            </div>
            <div className="flex justify-between border-b border-black/5 pb-2 group">
              <span className="font-sans text-xs font-medium text-black/40 pl-4 transition-colors group-hover:text-black">▸ Glazed Windows</span>
              <span className="font-mono text-xs font-bold">{takeoff.windowsCount} units</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
