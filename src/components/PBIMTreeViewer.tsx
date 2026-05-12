import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Component, Box, Scissors, Maximize, Activity } from 'lucide-react';
import { PBIMProject } from '../lib/pbim/schema';

interface PBIMTreeViewerProps {
  project: PBIMProject;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

export function PBIMTreeViewer({ project, selectedObjectId, onSelectObject }: PBIMTreeViewerProps) {
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleLevel = (id: string) => {
    setExpandedLevels(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCategory = (levelId: string, category: string) => {
    const key = `${levelId}-${category}`;
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const TreeItem = ({ icon: Icon, title, subtitle, id, onClick, depth = 0, isSelectable = true }: any) => {
    const isSelected = isSelectable && selectedObjectId === id;
    
    return (
      <div 
        className={`flex items-center justify-between p-2 border-b border-black/10 cursor-pointer transition-colors ${isSelected ? 'bg-black text-white' : 'hover:bg-black/5 text-black'}`}
        style={{ paddingLeft: `${(depth * 1) + 0.5}rem` }}
        onClick={() => onClick && onClick()}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {Icon && <Icon size={12} className={`shrink-0 ${isSelected ? 'text-white' : 'text-black/40'}`} />}
          <div className="flex flex-col overflow-hidden">
            <span className="font-mono text-xs font-semibold truncate">{title}</span>
            {subtitle && <span className={`font-serif text-[9px] italic truncate ${isSelected ? 'text-white/80' : 'text-black/60'}`}>{subtitle}</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full text-sm">
      <div className="font-mono text-[10px] p-2 bg-[#f0f0f0] border-b border-black text-black/60 uppercase font-bold sticky top-0 z-10">
        Hierarchical Model Entities
      </div>
      
      <TreeItem 
        icon={Box} 
        title="Project" 
        subtitle={project.name} 
        id={project.project_id} 
        isSelectable={false}
      />

      {project.site && (
        <TreeItem 
          icon={Maximize} 
          title="Site" 
          subtitle={`${project.site.front_width}m x ${project.site.depth}m`} 
          id="site" 
          depth={1}
          isSelectable={false}
        />
      )}

      {project.levels && project.levels.map(level => {
        // Expand the first level by default or let it be closed initially.
        const isLevelExpanded = expandedLevels[level.id] !== undefined ? expandedLevels[level.id] : true;
        const levelSpaces = project.spaces?.filter(s => s.level_id === level.id) || [];
        const levelWalls = project.walls?.filter(w => w.level_id === level.id) || [];
        
        return (
          <div key={level.id} className="flex flex-col">
            <div 
              className="flex items-center justify-between p-2 border-b border-black/20 bg-black/5 cursor-pointer hover:bg-black/10"
              style={{ paddingLeft: '1.5rem' }}
              onClick={() => toggleLevel(level.id)}
            >
              <div className="flex items-center gap-2">
                {isLevelExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider">{level.name} (Z: {level.elevation}m)</span>
              </div>
              <span className="font-mono text-[9px] opacity-50 px-1 border border-black/20">{levelSpaces.length} Spc | {levelWalls.length} Wls</span>
            </div>

            {isLevelExpanded && (
              <div className="flex flex-col">
                {/* Spaces */}
                <div 
                  className="flex items-center gap-2 p-1.5 border-b border-black/10 cursor-pointer hover:bg-black/5"
                  style={{ paddingLeft: '2.5rem' }}
                  onClick={() => toggleCategory(level.id, 'spaces')}
                >
                  {expandedCategories[`${level.id}-spaces`] !== false ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-mono text-[10px] font-bold text-black/60 uppercase">Spaces ({levelSpaces.length})</span>
                </div>
                {expandedCategories[`${level.id}-spaces`] !== false && levelSpaces.map(s => (
                  <TreeItem 
                    key={s.id}
                    icon={Activity}
                    title={s.name}
                    subtitle={`${s.category} | ${s.area_target || '?'}m²`}
                    id={s.id}
                    depth={4}
                    onClick={() => onSelectObject(s.id === selectedObjectId ? null : s.id)}
                  />
                ))}

                {/* Walls */}
                <div 
                  className="flex items-center gap-2 p-1.5 border-b border-black/10 cursor-pointer hover:bg-black/5"
                  style={{ paddingLeft: '2.5rem' }}
                  onClick={() => toggleCategory(level.id, 'walls')}
                >
                  {expandedCategories[`${level.id}-walls`] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-mono text-[10px] font-bold text-black/60 uppercase">Walls ({levelWalls.length})</span>
                </div>
                {expandedCategories[`${level.id}-walls`] && levelWalls.map(w => (
                  <div key={w.id}>
                    <TreeItem 
                      icon={Component}
                      title={`Wall [${w.structural ? 'Structural' : 'Partition'}]`}
                      subtitle={`EXT: ${w.exterior ? 'Y' : 'N'} | L: ${Math.sqrt(Math.pow(w.end[0]-w.start[0], 2) + Math.pow(w.end[1]-w.start[1], 2)).toFixed(2)}m | Thk: ${w.thickness}m`}
                      id={w.id}
                      depth={4}
                      onClick={() => onSelectObject(w.id === selectedObjectId ? null : w.id)}
                    />
                    {w.openings && w.openings.length > 0 && w.openings.map((o: any, idx: number) => (
                      <TreeItem 
                        key={o.id || `${w.id}-opening-${idx}`}
                        icon={Scissors}
                        title={`Opening [${o.type}]`}
                        subtitle={`W: ${o.width}m | H: ${o.height}m | Sill: ${o.sill_height || 0}m`}
                        id={o.id || `${w.id}-opening-${idx}`}
                        depth={5}
                        onClick={() => {}}
                        isSelectable={false}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
