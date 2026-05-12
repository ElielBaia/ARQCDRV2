import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { PBIMProject, PBIMWall, PBIMSpace, PBIMOpening, PBIMFurniture, PBIMStair } from '../lib/pbim/schema';
import { MousePointer2, Move, Crosshair, HelpCircle, Grip, Undo2, Maximize, Plus, Scissors, Network } from 'lucide-react';

interface Point2D { x: number; y: number; }
interface TopoNode {
    id: string;
    x: number;
    y: number;
    refs: { wallId: string; endpoint: 'start' | 'end' }[];
}

interface EditorProps {
    project: PBIMProject;
    levelId: string;
    onUpdateProject: (p: PBIMProject) => void;
    onDefineSection?: (axis: 'X' | 'Y', coord: number) => void;
    sectionConfig?: { axis: 'X' | 'Y', coord: number };
    selectedObjectId?: string | null;
    onSelectObject?: (id: string | null) => void;
}

// Helpers
const distance = (p1: Point2D, p2: Point2D) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const calcPolyArea = (pts: Point2D[]) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        let j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y;
        area -= pts[i].y * pts[j].x;
    }
    return Math.abs(area / 2);
}

export const getPolygonCoords = (space: PBIMSpace, walls: PBIMWall[], getCoords: (wId: string, type: 'start'|'end') => Point2D) => {
    const segments = space.boundary_walls.map(wId => {
        const w = walls.find(w => w.id === wId);
        if (!w) return null;
        return { id: wId, p1: getCoords(wId, 'start'), p2: getCoords(wId, 'end') }
    }).filter(Boolean) as {id: string, p1: Point2D, p2: Point2D}[];

    if (segments.length < 3) return null;

    const points: Point2D[] = [];
    let unvisited = [...segments];
    let current = unvisited.shift()!;
    points.push(current.p1);
    let target = current.p2;

    for (let i=0; i<100; i++) { // safety limit
        points.push(target);
        const idx = unvisited.findIndex(s => Math.hypot(s.p1.x - target.x, s.p1.y - target.y) < 0.1 || Math.hypot(s.p2.x - target.x, s.p2.y - target.y) < 0.1);
        if (idx === -1) break;
        const nextSeg = unvisited[idx];
        unvisited.splice(idx, 1);
        if (Math.hypot(nextSeg.p1.x - target.x, nextSeg.p1.y - target.y) < 0.1) target = nextSeg.p2;
        else target = nextSeg.p1;
        
        if (unvisited.length === 0) break;
    }
    return points;
};

export const InteractivePlanEditor: React.FC<EditorProps> = ({ project, levelId, onUpdateProject, onDefineSection, sectionConfig, selectedObjectId, onSelectObject }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Viewport State
    const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 40 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPos, setLastPanPos] = useState<Point2D | null>(null);

    // Initial Auto-Center
    useEffect(() => {
        if (!project || project.walls.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        project.walls.forEach(w => {
            minX = Math.min(minX, w.start[0], w.end[0]);
            minY = Math.min(minY, w.start[1], w.end[1]);
            maxX = Math.max(maxX, w.start[0], w.end[0]);
            maxY = Math.max(maxY, w.start[1], w.end[1]);
        });
        if (project.site?.boundary) {
             project.site.boundary.forEach(pt => {
                minX = Math.min(minX, pt[0]);
                minY = Math.min(minY, pt[1]);
                maxX = Math.max(maxX, pt[0]);
                maxY = Math.max(maxY, pt[1]);
             });
        }
        if (minX !== Infinity) {
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            // The camera center is cx, cy. To center it in the SVG, we need offset
            // We'll set camera x, y to offset the cx, cy to 0,0 locally
            const zoom = 40;
            setCamera({ x: -cx * zoom, y: cy * zoom, zoom });
        }
    }, [project]);

    // Interaction State
    const [mode, setMode] = useState<'select' | 'wall' | 'section'>('select');
    const [showTopology, setShowTopology] = useState(false);
    const [drawStart, setDrawStart] = useState<Point2D | null>(null);
    const [mousePos, setMousePos] = useState<Point2D | null>(null);
    const [newWallHeight, setNewWallHeight] = useState<number>(3.0);
    const [newWallThickness, setNewWallThickness] = useState<number>(0.2);

    const [dragState, setDragState] = useState<{
        type: 'node' | 'wall' | 'none';
        id?: string;
        startMouse?: Point2D;
        originalNodes?: TopoNode[];
        dragPos?: Point2D;
    }>({ type: 'none' });
    
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredWall, setHoveredWall] = useState<string | null>(null);
    const [snaps, setSnaps] = useState<{x?: number, y?: number}>({});

        // Build Topology
    const topoNodes = useMemo(() => {
        const nodes: TopoNode[] = [];
        const TOL = 0.1;
        project.walls.forEach(w => {
            if (w.level_id !== levelId) return;
            (['start', 'end'] as const).forEach(endpoint => {
                const pt = endpoint === 'start' ? w.start : w.end;
                let n = nodes.find(existing => Math.hypot(existing.x - pt[0], existing.y - pt[1]) < TOL);
                if (!n) {
                    n = { id: `node_${pt[0].toFixed(2)}_${pt[1].toFixed(2)}_${Math.random().toString(36).substr(2,4)}`, x: pt[0], y: pt[1], refs: [] };
                    nodes.push(n);
                }
                n.refs.push({ wallId: w.id, endpoint });
            });
        });
        return nodes;
    }, [project, levelId]);

    // Compute Structural Axes (Unique X and Y coordinates of walls)
    const projectAxes = useMemo(() => {
        const xs = new Set<number>();
        const ys = new Set<number>();
        const TOL = 0.2; // Group axes within 20cm

        topoNodes.forEach(n => {
            let foundX = false;
            for (const existingX of xs) {
                if (Math.abs(existingX - n.x) < TOL) { foundX = true; break; }
            }
            if (!foundX) xs.add(n.x);

            let foundY = false;
            for (const existingY of ys) {
                if (Math.abs(existingY - n.y) < TOL) { foundY = true; break; }
            }
            if (!foundY) ys.add(n.y);
        });

        const sortedX = Array.from(xs).sort((a,b) => a-b);
        const sortedY = Array.from(ys).sort((a,b) => b-a); // Y top to bottom
        return { x: sortedX, y: sortedY };
    }, [topoNodes]);

    // Screen to World Transform
    const screenToWorld = useCallback((clientX: number, clientY: number): Point2D => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const x = (clientX - rect.left - rect.width / 2 - camera.x) / camera.zoom;
        const y = -(clientY - rect.top - rect.height / 2 - camera.y) / camera.zoom;
        return { x, y };
    }, [camera]);

    // Handlers
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey || true) { // Always zoom on wheel for now
             e.preventDefault();
             const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
             setCamera(c => ({ ...c, zoom: Math.max(5, Math.min(300, c.zoom * scaleFactor)) }));
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 1 || e.button === 2) { // Middle click or right click -> pan
            setIsPanning(true);
            setLastPanPos({ x: e.clientX, y: e.clientY });
            return;
        }

        const worldPt = screenToWorld(e.clientX, e.clientY);

        if (mode === 'section') {
            if (!drawStart) {
                setDrawStart(worldPt);
            } else {
                if (onDefineSection && distance(drawStart, worldPt) > 0.1) {
                    const dx = Math.abs(worldPt.x - drawStart.x);
                    const dy = Math.abs(worldPt.y - drawStart.y);
                    if (dx > dy) {
                        onDefineSection('Y', (drawStart.y + worldPt.y) / 2);
                    } else {
                        onDefineSection('X', (drawStart.x + worldPt.x) / 2);
                    }
                }
                setDrawStart(null);
                setMode('select');
            }
            return;
        }

        if (mode === 'wall') {
            if (!drawStart) {
                setDrawStart(worldPt);
            } else {
                // Create Wall
                const newWall: PBIMWall = {
                    id: `W_${Math.random().toString(36).substr(2, 6)}`,
                    type: 'Wall',
                    level_id: levelId,
                    start: [drawStart.x, drawStart.y, 0],
                    end: [worldPt.x, worldPt.y, 0],
                    height: newWallHeight,
                    thickness: newWallThickness,
                    structural: true,
                    openings: [],
                    material: 'Concrete'
                };

                const newProject = JSON.parse(JSON.stringify(project)) as PBIMProject;
                newProject.walls.push(newWall);

                // Recalculate areas
                newProject.spaces.forEach(space => {
                    const pts = getPolygonCoords(space, newProject.walls, (wId, type) => {
                        const w = newProject.walls.find(ww => ww.id === wId);
                        return type === 'start' ? { x: w!.start[0], y: w!.start[1] } : { x: w!.end[0], y: w!.end[1] };
                    });
                    if (pts && pts.length >= 3) {
                        space.area_actual = Number(calcPolyArea(pts).toFixed(2));
                    }
                });

                onUpdateProject(newProject);
                setDrawStart(null);
            }
            return;
        }

        // Check if clicked a node
        const clickedNode = topoNodes.find(n => distance(n, worldPt) < 0.4);
        if (clickedNode) {
            setDragState({ type: 'node', id: clickedNode.id, startMouse: worldPt, dragPos: { x: clickedNode.x, y: clickedNode.y } });
            (e.target as Element).setPointerCapture(e.pointerId);
            return;
        }

        // Feature: Drag whole wall (requires more complex hit testing, skipping for brevity, handled via clicking wall element directly instead)
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const worldPt = screenToWorld(e.clientX, e.clientY);
        setMousePos(worldPt);

        if (isPanning && lastPanPos) {
            setCamera(c => ({
                ...c,
                x: c.x + (e.clientX - lastPanPos.x),
                y: c.y + (e.clientY - lastPanPos.y)
            }));
            setLastPanPos({ x: e.clientX, y: e.clientY });
            return;
        }

        if (dragState.type === 'node' && dragState.id) {
            // Snapping Logic
            let fx = worldPt.x;
            let fy = worldPt.y;
            let sx, sy;

            const snapNodes = topoNodes.filter(n => n.id !== dragState.id);
            const snapX = snapNodes.find(n => Math.abs(n.x - fx) < 0.2);
            const snapY = snapNodes.find(n => Math.abs(n.y - fy) < 0.2);

            if (snapX) { fx = snapX.x; sx = fx; }
            if (snapY) { fy = snapY.y; sy = fy; }

            // Grid snapping overriding
            if (e.shiftKey) {
                fx = Math.round(fx); fy = Math.round(fy);
            }

            setDragState(prev => ({ ...prev, dragPos: { x: fx, y: fy } }));
            setSnaps({ x: sx, y: sy });
        } else if (dragState.type === 'wall' && dragState.originalNodes) {
            // Drag entire wall
            const dx = worldPt.x - (dragState.startMouse?.x || 0);
            const dy = worldPt.y - (dragState.startMouse?.y || 0);

            let newDragPos = { x: worldPt.x, y: worldPt.y };
            
            // Basic snapping for wall dragging (snap translation vector)
            if (e.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) setDragState(prev => ({...prev, dragPos: { x: worldPt.x, y: dragState.startMouse!.y }}));
                else setDragState(prev => ({...prev, dragPos: { x: dragState.startMouse!.x, y: worldPt.y }}));
            } else {
                 setDragState(prev => ({...prev, dragPos: newDragPos}));
            }
        } else {
            // Hover logic for nodes
            const hovered = topoNodes.find(n => distance(n, worldPt) < 0.4);
            setHoveredNode(hovered ? hovered.id : null);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsPanning(false);
        setLastPanPos(null);

        const worldPt = screenToWorld(e.clientX, e.clientY);

        if (dragState.type !== 'none' && dragState.dragPos) {
            const newProject = JSON.parse(JSON.stringify(project)) as PBIMProject;
            
            if (dragState.type === 'node' && dragState.id) {
                const node = topoNodes.find(n => n.id === dragState.id);
                if (node) {
                    node.refs.forEach(ref => {
                        const w = newProject.walls.find(w => w.id === ref.wallId);
                        if (w) {
                            if (ref.endpoint === 'start') { w.start[0] = dragState.dragPos!.x; w.start[1] = dragState.dragPos!.y; }
                            else { w.end[0] = dragState.dragPos!.x; w.end[1] = dragState.dragPos!.y; }
                        }
                    });
                }
            } else if (dragState.type === 'wall' && dragState.id && dragState.originalNodes && dragState.startMouse) {
                let dx = dragState.dragPos.x - dragState.startMouse.x;
                let dy = dragState.dragPos.y - dragState.startMouse.y;
                
                // apply translation to both nodes connected to this wall
                const wOrig = newProject.walls.find(w => w.id === dragState.id);
                if (wOrig) {
                   wOrig.start[0] += dx; wOrig.start[1] += dy;
                   wOrig.end[0] += dx; wOrig.end[1] += dy;
                   // Wait, if other walls share these nodes, they should stretch!
                   dragState.originalNodes.forEach(node => {
                       node.refs.forEach(ref => {
                           const w = newProject.walls.find(ww => ww.id === ref.wallId);
                           if (w && w.id !== dragState.id) {
                               if (ref.endpoint === 'start') { w.start[0] += dx; w.start[1] += dy; }
                               else { w.end[0] += dx; w.end[1] += dy; }
                           }
                       })
                   });
                }
            }
            
            // Recalculate areas based on new wall geometry
            newProject.spaces.forEach(space => {
               const pts = getPolygonCoords(space, newProject.walls, (wId, type) => {
                   const w = newProject.walls.find(ww => ww.id === wId);
                   return type === 'start' ? {x: w!.start[0], y: w!.start[1]} : {x: w!.end[0], y: w!.end[1]};
               });
               if (pts && pts.length >= 3) {
                   space.area_actual = Number(calcPolyArea(pts).toFixed(2));
               }
            });

            onUpdateProject(newProject);
        }

        setDragState({ type: 'none' });
        setSnaps({});
    };

    const getNodeCoords = useCallback((wallId: string, endpoint: 'start'|'end') => {
        // If we are dragging, supply dynamic coords
        if (dragState.type === 'node' && dragState.id && dragState.dragPos) {
           const n = topoNodes.find(n => n.id === dragState.id);
           if (n && n.refs.some(r => r.wallId === wallId && r.endpoint === endpoint)) return dragState.dragPos;
        } else if (dragState.type === 'wall' && dragState.id && dragState.dragPos && dragState.startMouse && dragState.originalNodes) {
           let dx = dragState.dragPos.x - dragState.startMouse.x;
           let dy = dragState.dragPos.y - dragState.startMouse.y;
           
           const nOrig = dragState.originalNodes.find(n => n.refs.some(r => r.wallId === wallId && r.endpoint === endpoint));
           if (nOrig) { return { x: nOrig.x + dx, y: nOrig.y + dy }; }
        }

        const w = project.walls.find(w => w.id === wallId);
        if (!w) return {x: 0, y: 0};
        return endpoint === 'start' ? {x: w.start[0], y: w.start[1]} : {x: w.end[0], y: w.end[1]};
    }, [project, topoNodes, dragState]);

    return (
        <div className="relative w-full h-full bg-[#fcfaf7] overflow-hidden select-none outline-none touch-none" 
             ref={containerRef}
             onWheel={handleWheel}
             onPointerDown={handlePointerDown}
             onPointerMove={handlePointerMove}
             onPointerUp={handlePointerUp}
             onPointerLeave={handlePointerUp}
             onContextMenu={(e) => e.preventDefault()}
             style={{ cursor: isPanning ? 'grabbing' : dragState.type !== 'none' ? 'grabbing' : 'crosshair' }}
        >
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className="flex bg-white border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-mono text-[9px] items-center px-3 py-1.5 uppercase font-bold text-black">
                    <Crosshair className="w-3 h-3 mr-2" />
                    Interactive Blueprint Engine v2.0
                </div>
                <button 
                    className={`border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] p-1.5 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${mode === 'section' ? 'bg-black text-white ring-2 ring-black ring-offset-1' : 'bg-white text-black hover:bg-black hover:text-white'}`} 
                    onClick={() => {
                        setMode(mode === 'section' ? 'select' : 'section');
                        setDrawStart(null);
                    }} 
                    title="Define Section"
                >
                    <Scissors className="w-4 h-4" />
                </button>

                <button 
                    className={`border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] p-1.5 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${mode === 'wall' ? 'bg-black text-white ring-2 ring-black ring-offset-1' : 'bg-white text-black hover:bg-black hover:text-white'}`} 
                    onClick={() => {
                        setMode(mode === 'wall' ? 'select' : 'wall');
                        setDrawStart(null);
                    }} 
                    title="Draw Wall"
                >
                    <Plus className="w-4 h-4" />
                </button>

                {mode === 'wall' && (
                    <div className="flex bg-white border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] animate-in slide-in-from-left-2 duration-200">
                        <div className="flex items-center px-2 py-1 border-r border-black gap-2">
                            <span className="font-mono text-[8px] font-bold text-black/40 uppercase">Thick</span>
                            <input 
                                type="number" 
                                value={newWallThickness}
                                step="0.01"
                                min="0.05"
                                onChange={(e) => setNewWallThickness(parseFloat(e.target.value) || 0.2)}
                                className="w-12 bg-transparent font-mono text-[10px] font-bold focus:outline-none"
                            />
                            <span className="font-mono text-[8px] font-bold text-black/40">m</span>
                        </div>
                        <div className="flex items-center px-2 py-1 gap-2">
                            <span className="font-mono text-[8px] font-bold text-black/40 uppercase">Height</span>
                            <input 
                                type="number" 
                                value={newWallHeight}
                                step="0.1"
                                min="0.1"
                                onChange={(e) => setNewWallHeight(parseFloat(e.target.value) || 3.0)}
                                className="w-12 bg-transparent font-mono text-[10px] font-bold focus:outline-none"
                            />
                            <span className="font-mono text-[8px] font-bold text-black/40">m</span>
                        </div>
                    </div>
                )}

                <button className="bg-white border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] p-1.5 hover:bg-black hover:text-white transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none" onClick={() => {
                    if (!project || project.walls.length === 0) {
                        setCamera({x:0, y:0, zoom: 40});
                        return;
                    }
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    project.walls.forEach(w => {
                        minX = Math.min(minX, w.start[0], w.end[0]);
                        minY = Math.min(minY, w.start[1], w.end[1]);
                        maxX = Math.max(maxX, w.start[0], w.end[0]);
                        maxY = Math.max(maxY, w.start[1], w.end[1]);
                    });
                    if (project.site?.boundary) {
                        project.site.boundary.forEach(pt => {
                            minX = Math.min(minX, pt[0]);
                            minY = Math.min(minY, pt[1]);
                            maxX = Math.max(maxX, pt[0]);
                            maxY = Math.max(maxY, pt[1]);
                        });
                    }
                    if (minX !== Infinity) {
                        const cx = (minX + maxX) / 2;
                        const cy = (minY + maxY) / 2;
                        setCamera({ x: -cx * 40, y: cy * 40, zoom: 40 });
                    }
                }} title="Reset View">
                    <Maximize className="w-4 h-4" />
                </button>

                <div className="w-px h-8 bg-black/20 mx-1" />

                <button 
                    className={`border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] p-1.5 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${showTopology ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-black hover:bg-black hover:text-white'}`} 
                    onClick={() => setShowTopology(!showTopology)} 
                    title="Toggle Semantic Topology Graph"
                >
                    <Network className="w-4 h-4" />
                </button>
            </div>

            <div className="absolute bottom-4 left-4 z-10 flex flex-col pointer-events-none font-mono text-[9px] text-black/40 gap-1 uppercase tracking-wider">
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-black/20" />
                  <span>Nodes: Reshape [Lock Axis: Shift]</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-black/20" />
                  <span>View: Pan [Middle/Right] | Zoom [Scroll]</span>
               </div>
            </div>

            {/* North Arrow and Scale */}
            <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end pointer-events-none font-sans text-[10px] text-black gap-6">
                <div className="flex flex-col items-center">
                    <div className="w-10 h-10 relative flex items-center justify-center">
                        <div className="absolute w-[0.5px] h-full bg-black/40" />
                        <div className="absolute w-full h-[0.5px] bg-black/10" />
                        <div className="absolute top-0 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-black" />
                        <span className="absolute -top-4 font-mono font-bold text-[9px] tracking-tighter">N</span>
                        {/* decorative circle */}
                        <div className="w-6 h-6 border-[0.5px] border-black/20 rounded-full" />
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                    <div className="flex">
                        <div className="w-6 h-1 border-l border-b border-black" />
                        <div className="w-6 h-1 border-l border-b border-white bg-black" />
                        <div className="w-6 h-1 border-l border-r border-b border-black" />
                    </div>
                    <div className="flex w-[72px] justify-between text-[8px] font-mono leading-none font-medium opacity-60">
                        <span>0</span>
                        <span>{ (80 / camera.zoom).toFixed(1) }m</span>
                    </div>
                </div>
            </div>

            {/* Info Overlay */}
            <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                <div className="bg-white border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] p-2 flex flex-col items-end">
                    <span className="font-mono text-[8px] font-bold text-black/40 uppercase">Total Area ({project.levels.find(l => l.id === levelId)?.name || 'LVL'})</span>
                    <span className="font-mono text-xl font-black leading-none mt-1">
                        {project.spaces.filter(s => s.level_id === levelId).reduce((acc, s) => acc + (s.area_actual || 0), 0).toFixed(2)}
                        <span className="text-[10px] ml-1">m²</span>
                    </span>
                </div>
            </div>

            <svg className="w-full h-full pointer-events-none bg-white">
                {/* Visual Background Grid */}
                <defs>
                    <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#eee" strokeWidth="0.5"/>
                    </pattern>
                    <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                        <rect width="100" height="100" fill="url(#smallGrid)"/>
                        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#ddd" strokeWidth="1"/>
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                {/* Viewport Transform Group */}
                {containerRef.current && (
                    <g transform={`translate(${containerRef.current.clientWidth/2 + camera.x}, ${containerRef.current.clientHeight/2 + camera.y}) scale(${camera.zoom}, ${-camera.zoom})`}>
                        
                        {/* Major Grid Curves / Lines (Project Structural Axes) */}
                        <g pointerEvents="none">
                            {projectAxes.x.map((x, i) => (
                                <g key={`x-${i}`}>
                                    <line x1={x} y1={-40} x2={x} y2={40} stroke="#ef4444" strokeWidth={0.02} strokeDasharray="0.8 0.2 0.1 0.2" opacity={0.5} />
                                    <g transform={`translate(${x}, 42) scale(1, -1)`} opacity={0.8}>
                                        <circle r={0.7} fill="#fff" stroke="#ef4444" strokeWidth={0.04} />
                                        <text textAnchor="middle" dominantBaseline="central" fontSize={0.8} fill="#ef4444" fontFamily="Inter" fontWeight="600">
                                            {String.fromCharCode(65 + i)}
                                        </text>
                                    </g>
                                    <g transform={`translate(${x}, -42) scale(1, -1)`} opacity={0.8}>
                                        <circle r={0.7} fill="#fff" stroke="#ef4444" strokeWidth={0.04} />
                                        <text textAnchor="middle" dominantBaseline="central" fontSize={0.8} fill="#ef4444" fontFamily="Inter" fontWeight="600">
                                            {String.fromCharCode(65 + i)}
                                        </text>
                                    </g>
                                </g>
                            ))}
                            {projectAxes.y.map((y, i) => (
                                <g key={`y-${i}`}>
                                    <line x1={-40} y1={y} x2={40} y2={y} stroke="#ef4444" strokeWidth={0.02} strokeDasharray="0.8 0.2 0.1 0.2" opacity={0.5} />
                                    <g transform={`translate(-42, ${y}) scale(1, -1)`} opacity={0.8}>
                                        <circle r={0.7} fill="#fff" stroke="#ef4444" strokeWidth={0.04} />
                                        <text textAnchor="middle" dominantBaseline="central" fontSize={0.8} fill="#ef4444" fontFamily="Inter" fontWeight="600">
                                            {i + 1}
                                        </text>
                                    </g>
                                    <g transform={`translate(42, ${y}) scale(1, -1)`} opacity={0.8}>
                                        <circle r={0.7} fill="#fff" stroke="#ef4444" strokeWidth={0.04} />
                                        <text textAnchor="middle" dominantBaseline="central" fontSize={0.8} fill="#ef4444" fontFamily="Inter" fontWeight="600">
                                            {i + 1}
                                        </text>
                                    </g>
                                </g>
                            ))}
                        </g>

                        {/* Site Boundary */}
                        {project.site?.boundary && (
                            <polygon 
                                points={project.site.boundary.map(p => `${p[0]},${p[1]}`).join(' ')} 
                                fill="none" 
                                stroke="#141414" 
                                strokeWidth={0.04} 
                                strokeDasharray="0.2 0.1"
                                opacity={0.3}
                            />
                        )}

                        {/* Section Line Visualization */}
                        {sectionConfig && (
                            <g opacity={0.6}>
                                {sectionConfig.axis === 'X' ? (
                                    <g>
                                        <line x1={sectionConfig.coord} y1={-50} x2={sectionConfig.coord} y2={50} stroke="#2563eb" strokeWidth={0.05} strokeDasharray="0.5 0.2" />
                                        <g transform={`translate(${sectionConfig.coord}, 10) scale(1,-1)`}>
                                           <circle r={0.3} fill="#2563eb" />
                                           <text y={0.8} textAnchor="middle" fontSize={0.4} fill="#2563eb" fontWeight="bold">A</text>
                                        </g>
                                    </g>
                                ) : (
                                    <g>
                                        <line x1={-50} y1={sectionConfig.coord} x2={50} y2={sectionConfig.coord} stroke="#2563eb" strokeWidth={0.05} strokeDasharray="0.5 0.2" />
                                        <g transform={`translate(10, ${sectionConfig.coord}) scale(1,-1)`}>
                                           <circle r={0.3} fill="#2563eb" />
                                           <text x={0.5} y={0.1} fontSize={0.4} fill="#2563eb" fontWeight="bold">B</text>
                                        </g>
                                    </g>
                                )}
                            </g>
                        )}

                        {/* Spaces */}
                        {project.spaces.filter(s => s.level_id === levelId).map(space => {
                            const pts = getPolygonCoords(space, project.walls, getNodeCoords);
                            const isSelected = selectedObjectId === space.id;
                            
                            let fill = '#ffffff';
                            if (space.category?.toLowerCase() === 'social' || space.category?.toLowerCase() === 'living') fill = '#fdfbf7';
                            else if (space.category?.toLowerCase() === 'intimate' || space.category?.toLowerCase() === 'bedroom' || space.category?.toLowerCase() === 'intimo') fill = '#f8fafc';
                            else if (space.category?.toLowerCase() === 'service' || space.category?.toLowerCase() === 'bathroom' || space.category?.toLowerCase() === 'servico') fill = '#f3f4f6';
                            else if (space.category?.toLowerCase() === 'circulation') fill = '#fafafa';
                            else if (space.category?.toLowerCase() === 'outdoor') fill = '#f0fdf4';

                            if (!pts || pts.length < 3) return null;

                            // Calculate center of polygon for text
                            let cx = 0, cy = 0;
                            pts.forEach(p => { cx += p.x; cy += p.y; });
                            cx /= pts.length;
                            cy /= pts.length;

                            return (
                                <g key={space.id}>
                                    <polygon 
                                        points={pts.map(p => `${p.x},${p.y}`).join(' ')} 
                                        fill={isSelected ? '#e0e7ff' : fill}
                                        stroke={isSelected ? '#4f46e5' : 'none'}
                                        strokeWidth={0.05}
                                        className="pointer-events-auto cursor-pointer hover:opacity-90 transition-opacity"
                                        onPointerDown={(e) => { e.stopPropagation(); onSelectObject?.(space.id); }}
                                    />
                                    {/* Space Label */}
                                    <g transform={`translate(${cx}, ${cy}) scale(1, -1)`} opacity={0.9} className="pointer-events-none">
                                        <text textAnchor="middle" dominantBaseline="middle" fontFamily="Inter" fontSize={0.28} fontWeight="500" fill="#2d3748" letterSpacing="0.05em" className="uppercase">
                                            {space.name}
                                        </text>
                                        <text y={0.35} textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono" fontSize={0.16} fill="#718096" opacity={0.8}>
                                            {space.area_actual} m²
                                        </text>
                                    </g>

                                     {/* Furniture Symbols */}
                                     <g opacity={0.3} pointerEvents="none">
                                         {project.furniture?.filter(f => f.space_id === space.id && f.level_id === levelId).map(furn => (
                                             <g key={furn.id} transform={`translate(${furn.position[0]}, ${furn.position[1]}) rotate(${furn.rotation})`}>
                                                 {furn.type === 'Bed' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                         <rect x={-furn.width/2 + 0.1} y={furn.depth/2 - 0.5} width={furn.width/2 - 0.2} height={0.4} fill="none" stroke="#606060" strokeWidth={0.02} rx={0.05} />
                                                         <rect x={0.1} y={furn.depth/2 - 0.5} width={furn.width/2 - 0.2} height={0.4} fill="none" stroke="#606060" strokeWidth={0.02} rx={0.05} />
                                                         <line x1={-furn.width/2} y1={furn.depth/2 - 0.6} x2={furn.width/2} y2={furn.depth/2 - 0.6} stroke="#606060" strokeWidth={0.01} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Sofa' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} rx={0.1} />
                                                         <rect x={-furn.width/2 + 0.15} y={-furn.depth/2 + 0.1} width={furn.width - 0.3} height={furn.depth - 0.3} fill="none" stroke="#606060" strokeWidth={0.02} rx={0.05} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'DiningTable' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} rx={0.05} />
                                                         <circle cx={-furn.width/4} cy={-furn.depth/2 - 0.2} r={0.2} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={furn.width/4} cy={-furn.depth/2 - 0.2} r={0.2} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={-furn.width/4} cy={furn.depth/2 + 0.2} r={0.2} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={furn.width/4} cy={furn.depth/2 + 0.2} r={0.2} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Toilet' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={0.1} width={furn.width} height={furn.depth/3} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                         <ellipse cx={0} cy={-0.1} rx={furn.width/2} ry={furn.depth/2 - 0.1} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Sink' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                         <ellipse cx={0} cy={0} rx={furn.width/2.5} ry={furn.depth/2.5} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={0} cy={furn.depth/4} r={0.04} fill="#606060" />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Shower' && (
                                                    <g>
                                                        <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                        <line x1={-furn.width/2} y1={-furn.depth/2} x2={furn.width/2} y2={furn.depth/2} stroke="#606060" strokeWidth={0.01} strokeOpacity={0.5} />
                                                        <line x1={furn.width/2} y1={-furn.depth/2} x2={-furn.width/2} y2={furn.depth/2} stroke="#606060" strokeWidth={0.01} strokeOpacity={0.5} />
                                                        <circle cx={0} cy={0} r={0.05} fill="#606060" />
                                                    </g>
                                                 )}
                                                 {furn.type === 'Cooker' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                         <circle cx={-0.15} cy={-0.15} r={0.08} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={0.15} cy={-0.15} r={0.08} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={-0.15} cy={0.15} r={0.08} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                         <circle cx={0.15} cy={0.15} r={0.08} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Fridge' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                         <line x1={-furn.width/2} y1={furn.depth/2 - 0.15} x2={furn.width/2} y2={furn.depth/2 - 0.15} stroke="#606060" strokeWidth={0.02} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Desk' && (
                                                     <g>
                                                         <rect x={-furn.width/2} y={-furn.depth/2} width={furn.width} height={furn.depth} fill="none" stroke="#606060" strokeWidth={0.03} />
                                                         <circle cx={0} cy={furn.depth/2 + 0.25} r={0.2} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                     </g>
                                                 )}
                                                 {furn.type === 'Chair' && (
                                                     <circle cx={0} cy={0} r={furn.width/2} fill="none" stroke="#606060" strokeWidth={0.02} />
                                                 )}
                                             </g>
                                         ))}
                                     </g>
                                </g>
                            )
                        })}

                        {/* Slabs (Foundations) */}
                        {project.slabs?.filter(s => s.level_id === levelId && s.type === 'Foundation').map(slab => (
                            <polygon 
                                key={slab.id}
                                points={slab.boundary.map(p => `${p[0]},${p[1]}`).join(' ')} 
                                fill="none" 
                                stroke="#141414" 
                                strokeWidth={0.02} 
                                strokeDasharray="0.1 0.05"
                                opacity={0.1}
                                pointerEvents="none"
                            />
                        ))}

                        {/* Components (Columns, Eaves, etc.) */}
                        {project.components?.slice(0, 100).filter(c => c.level_id === levelId).map(comp => {
                            if (comp.type === 'Column') {
                                const [cx, cy] = comp.boundary[0];
                                return (
                                    <rect 
                                        key={comp.id}
                                        x={cx - 0.1} y={cy - 0.1} width={0.2} height={0.2}
                                        fill="#000"
                                        stroke="none"
                                        pointerEvents="none"
                                    />
                                );
                            }
                            if (comp.type === 'Eave' || comp.type === 'Marquee') {
                                return (
                                    <polygon 
                                        key={comp.id}
                                        points={comp.boundary.map(p => `${p[0]},${p[1]}`).join(' ')} 
                                        fill="none" 
                                        stroke="#141414" 
                                        strokeWidth={0.01} 
                                        strokeDasharray="0.1 0.05"
                                        opacity={0.3}
                                        pointerEvents="none"
                                    />
                                );
                            }
                            return null;
                        })}

                        {/* Stairs */}
                        {project.stairs?.filter(s => s.level_id === levelId).map(stair => {
                            const [x1, y1] = stair.start;
                            const [x2, y2] = stair.end;
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            const length = Math.hypot(dx, dy);
                            const angle = Math.atan2(dy, dx);
                            
                            const treadLength = length / (stair.treads || 15);
                            
                            return (
                                <g key={stair.id} transform={`translate(${x1}, ${y1}) rotate(${angle * 180 / Math.PI})`}>
                                    <rect x={0} y={-stair.width/2} width={length} height={stair.width} fill="none" stroke="#141414" strokeWidth={0.02} opacity={0.5} />
                                    {Array.from({length: (stair.treads || 15)}).map((_, i) => (
                                        <line key={i} x1={i * treadLength} y1={-stair.width/2} x2={i * treadLength} y2={stair.width/2} stroke="#141414" strokeWidth={0.01} strokeOpacity={0.8} />
                                    ))}
                                    <line x1={length/2} y1={0} x2={length} y2={0} stroke="#141414" strokeWidth={0.02} />
                                    <polygon points={`${length-0.1},${-0.1} ${length},0 ${length-0.1},${0.1}`} fill="#141414" />
                                </g>
                            )
                        })}

                        {/* Walls */}
                        {project.walls.filter(w => w.level_id === levelId).map(wall => {
                            const p1 = getNodeCoords(wall.id, 'start');
                            const p2 = getNodeCoords(wall.id, 'end');
                            const isSelected = selectedObjectId === wall.id;
                            
                            const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                            const length = Math.hypot(dx, dy);
                            const angle = Math.atan2(dy, dx);
                            
                            return (
                                <g key={wall.id} className="pointer-events-auto" 
                                   onPointerEnter={() => setHoveredWall(wall.id)}
                                   onPointerLeave={() => setHoveredWall(null)}
                                   onPointerDown={(e) => {
                                       e.stopPropagation();
                                       onSelectObject?.(wall.id);
                                       if (e.button === 0) {
                                           // Setup Wall Drag
                                           const worldPt = screenToWorld(e.clientX, e.clientY);
                                           const nodesLinked = topoNodes.filter(n => n.refs.some(r => r.wallId === wall.id));
                                           setDragState({ type: 'wall', id: wall.id, startMouse: worldPt, dragPos: worldPt, originalNodes: nodesLinked });
                                           (e.target as Element).setPointerCapture(e.pointerId);
                                       }
                                   }}
                                >
                                    {/* Invisible hit area */}
                                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={0.8} style={{cursor: 'move'}} />
                                    
                                    {/* Axis Line */}
                                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ff0000" strokeWidth={0.02} strokeDasharray="0.1 0.1" opacity={0.5} pointerEvents="none" />

                                    {/* Real Wall with Poche */}
                                    <g transform={`translate(${(p1.x+p2.x)/2}, ${(p1.y+p2.y)/2}) rotate(${angle * 180 / Math.PI})`}>
                                        <line x1={-length/2} y1={0} x2={length/2} y2={0} stroke={isSelected ? '#4f46e5' : '#1a202c'} strokeWidth={wall.thickness - 0.02} strokeLinecap="square" />
                                        <line x1={-length/2} y1={-wall.thickness/2} x2={length/2} y2={-wall.thickness/2} stroke={isSelected ? '#4f46e5' : '#1a202c'} strokeWidth={0.02} strokeLinecap="square" />
                                        <line x1={-length/2} y1={wall.thickness/2} x2={length/2} y2={wall.thickness/2} stroke={isSelected ? '#4f46e5' : '#1a202c'} strokeWidth={0.02} strokeLinecap="square" />
                                    </g>
                                          
                                    {/* Wall Dimension Text (Hover or Drag) */}
                                    {(hoveredWall === wall.id || dragState.id === wall.id || isSelected) && (
                                        <g transform={`translate(${(p1.x+p2.x)/2}, ${(p1.y+p2.y)/2 + 0.4}) scale(1, -1)`}>
                                            <rect x={-0.4} y={-0.15} width={0.8} height={0.3} fill="#141414" rx={0.05} />
                                            <text textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono" fontSize={0.18} fill="white" fontWeight="500">
                                                {length.toFixed(2)}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            )
                        })}

                        {/* Openings */}
                        {project.openings.map(op => {
                            const w = project.walls.find(ww => ww.id === op.wall_id);
                            if (!w || w.level_id !== levelId) return null;
                            const p1 = getNodeCoords(w.id, 'start');
                            const p2 = getNodeCoords(w.id, 'end');
                            
                            const opCx = p1.x + (p2.x - p1.x) * op.position_t;
                            const opCy = p1.y + (p2.y - p1.y) * op.position_t;
                            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                            
                            return (
                                <g key={op.id} transform={`translate(${opCx}, ${opCy}) rotate(${angle * 180 / Math.PI})`} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); onSelectObject?.(op.id); }}>
                                    {/* Opening Void */}
                                    <rect x={-op.width/2} y={-w.thickness/2 - 0.02} width={op.width} height={w.thickness + 0.04} fill="#ffffff" />
                                    
                                    {op.type === 'Window' ? (
                                        <g>
                                            {/* Window Style: Triple Line */}
                                            <line x1={-op.width/2} y1={-w.thickness/2} x2={op.width/2} y2={-w.thickness/2} stroke="#1a202c" strokeWidth={0.02} />
                                            <line x1={-op.width/2} y1={w.thickness/2} x2={op.width/2} y2={w.thickness/2} stroke="#1a202c" strokeWidth={0.02} />
                                            <line x1={-op.width/2} y1={0} x2={op.width/2} y2={0} stroke="#1a202c" strokeWidth={0.015} />
                                        </g>
                                    ) : (
                                        <g>
                                          {/* Refined Door: Frame + Swing + Leaf */}
                                          <line x1={-op.width/2} y1={-w.thickness/2} x2={-op.width/2} y2={w.thickness/2} stroke="#1a202c" strokeWidth={0.04} />
                                          <line x1={op.width/2} y1={-w.thickness/2} x2={op.width/2} y2={w.thickness/2} stroke="#1a202c" strokeWidth={0.04} />
                                          
                                          {/* Swing Arc */}
                                          <path d={`M ${-op.width/2} ${w.thickness/2 + op.width} A ${op.width} ${op.width} 0 0 1 ${op.width/2} ${w.thickness/2}`} fill="none" stroke="#1a202c" strokeWidth={0.015} strokeDasharray="0.05 0.05" />
                                          
                                          {/* Door Leaf (Rectangle) */}
                                          <rect x={-op.width/2} y={w.thickness/2} width={0.04} height={op.width} fill="#ffffff" stroke="#1a202c" strokeWidth={0.02} />
                                        </g>
                                    )}
                                </g>
                            )
                        })}

                        {/* Nodes */}
                        {topoNodes.map(node => {
                            let nx = node.x; let ny = node.y;
                            if (dragState.type === 'node' && dragState.id === node.id && dragState.dragPos) { nx = dragState.dragPos.x; ny = dragState.dragPos.y; }
                            else if (dragState.type === 'wall' && dragState.originalNodes?.find(n => n.id === node.id) && dragState.dragPos && dragState.startMouse) {
                                nx += dragState.dragPos.x - dragState.startMouse.x;
                                ny += dragState.dragPos.y - dragState.startMouse.y;
                            }

                            const isHovered = hoveredNode === node.id || (dragState.type === 'node' && dragState.id === node.id);
                            
                            return (
                                <circle 
                                    key={node.id} 
                                    cx={nx} cy={ny} 
                                    r={isHovered ? 0.2 / (camera.zoom/40) : 0.06 / (camera.zoom/40)} 
                                    fill={isHovered ? '#000' : 'none'} 
                                    stroke="#000" strokeWidth={0.02} 
                                    strokeOpacity={isHovered ? 1 : 0.3}
                                    className="pointer-events-none transition-all"
                                />
                            )
                        })}

                        {/* Snap Guides */}
                        {snaps.x !== undefined && <line x1={snaps.x} y1={-100} x2={snaps.x} y2={100} stroke="#000" strokeWidth={0.01} strokeDasharray="0.1 0.1" strokeOpacity={0.2} pointerEvents="none" />}
                        {snaps.y !== undefined && <line x1={-100} y1={snaps.y} x2={100} y2={snaps.y} stroke="#000" strokeWidth={0.01} strokeDasharray="0.1 0.1" strokeOpacity={0.2} pointerEvents="none" />}

                        {/* Semantic Topology Overlay */}
                        {showTopology && project.topology && (
                            <g>
                                {/* Edges */}
                                {project.topology.edges.map((edge, i) => {
                                    const n1 = project.topology!.nodes.find(n => n.id === edge.source_id);
                                    const n2 = project.topology!.nodes.find(n => n.id === edge.target_id);
                                    if (!n1 || !n2) return null;

                                    const s1 = project.spaces.find(s => s.id === n1.space_id);
                                    const s2 = project.spaces.find(s => s.id === n2.space_id);
                                    if (!s1 || !s2) return null;

                                    const pts1 = getPolygonCoords(s1, project.walls, getNodeCoords);
                                    const pts2 = getPolygonCoords(s2, project.walls, getNodeCoords);

                                    if (!pts1 || !pts2) return null;

                                    let cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0;
                                    pts1.forEach(p => { cx1 += p.x; cy1 += p.y; });
                                    cx1 /= pts1.length; cy1 /= pts1.length;

                                    pts2.forEach(p => { cx2 += p.x; cy2 += p.y; });
                                    cx2 /= pts2.length; cy2 /= pts2.length;

                                    return (
                                        <g key={`edge-${i}`}>
                                            <line 
                                                x1={cx1} y1={cy1} x2={cx2} y2={cy2} 
                                                stroke={edge.relation === 'connected_by_door' ? '#4f46e5' : '#9ca3af'} 
                                                strokeWidth={edge.relation === 'connected_by_door' ? 0.08 : 0.04} 
                                                strokeDasharray={edge.relation === 'connected_by_door' ? undefined : "0.1 0.1"} 
                                                opacity={0.8} 
                                                pointerEvents="none" 
                                            />
                                            {edge.relation === 'connected_by_door' && (
                                                <circle cx={(cx1+cx2)/2} cy={(cy1+cy2)/2} r={0.1} fill="#fff" stroke="#4f46e5" strokeWidth={0.02} pointerEvents="none" />
                                            )}
                                        </g>
                                    );
                                })}

                                {/* Nodes (Space Centroids) */}
                                {project.topology.nodes.map(node => {
                                    const s = project.spaces.find(sp => sp.id === node.space_id);
                                    if (!s) return null;
                                    const pts = getPolygonCoords(s, project.walls, getNodeCoords);
                                    if (!pts) return null;
                                    let cx = 0, cy = 0;
                                    pts.forEach(p => { cx += p.x; cy += p.y; });
                                    cx /= pts.length; cy /= pts.length;

                                    return (
                                        <g key={`node-${node.id}`} transform={`translate(${cx}, ${cy})`} pointerEvents="none">
                                            <circle r={0.2} fill="#4f46e5" stroke="#fff" strokeWidth={0.05} />
                                            <circle r={0.6} fill="none" stroke="#4f46e5" strokeWidth={0.02} opacity={0.5} />
                                        </g>
                                    );
                                })}
                            </g>
                        )}

                        {/* Drawing Preview */}
                        {drawStart && mousePos && (
                            <g opacity={0.5}>
                                <line x1={drawStart.x} y1={drawStart.y} x2={mousePos.x} y2={mousePos.y} stroke={mode === 'section' ? '#2563eb' : '#141414'} strokeWidth={0.1} strokeDasharray="0.1 0.05" />
                                {mode === 'section' && (
                                    <>
                                        {/* Infinite cutting plane line */}
                                        {Math.abs(mousePos.x - drawStart.x) > Math.abs(mousePos.y - drawStart.y) ? (
                                            <line x1={-100} y1={(drawStart.y + mousePos.y)/2} x2={100} y2={(drawStart.y + mousePos.y)/2} stroke="#2563eb" strokeWidth={0.02} strokeDasharray="0.5 0.5" />
                                        ) : (
                                            <line x1={(drawStart.x + mousePos.x)/2} y1={-100} x2={(drawStart.x + mousePos.x)/2} y2={100} stroke="#2563eb" strokeWidth={0.02} strokeDasharray="0.5 0.5" />
                                        )}
                                        <g transform={`translate(${mousePos.x}, ${mousePos.y}) scale(1, -1)`}>
                                            <text x={0.2} y={-0.2} fontFamily="monospace" fontSize={0.3} fontWeight="bold" fill="#2563eb">SECTION A-A</text>
                                        </g>
                                    </>
                                )}
                                <text x={(drawStart.x + mousePos.x)/2} y={(drawStart.y + mousePos.y)/2 + 0.3} transform="scale(1, -1)" textAnchor="middle" fontFamily="JetBrains Mono" fontSize={0.25} fill="#141414" fontWeight="600">
                                    {distance(drawStart, mousePos).toFixed(2)}m
                                </text>
                            </g>
                        )}

                    </g>
                )}
            </svg>

        </div>
    );
}
