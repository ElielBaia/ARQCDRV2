/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, Maximize, FileText, Layers, Share2, Download, 
  Settings, Hexagon, Component, Activity, MessageSquare, 
  FolderOpen, Plus, Play, ChevronRight, CheckCircle2, CircleAlert, LayoutTemplate,
  Cloud, LogIn, Scissors
} from 'lucide-react';
import { motion } from 'motion/react';
import { GeometryEngine } from './lib/geometry_engine/svg_builder';
import { ElevationBuilder } from './lib/geometry_engine/elevation_builder';
import { SectionBuilder } from './lib/geometry_engine/section_builder';
import { TopoGraphBuilder } from './lib/geometry_engine/svg_graph_builder';
import { PBIMProject } from './lib/pbim/schema';
import { ThreeDViewer } from './components/ThreeDViewer';
import { InteractivePlanEditor } from './components/InteractivePlanEditor';
import { TechnicalSheet } from './components/TechnicalSheet';
import { TakeoffPanel } from './components/TakeoffPanel';
import { MetadataEditor } from './components/MetadataEditor';
import { PBIMTreeViewer } from './components/PBIMTreeViewer';
import {
  isMsalConfigured,
  loginPopup,
  logout as msalLogout,
  getActiveAccount,
  authedFetch,
} from './lib/azure/msal-browser';

interface User {
  id: string;
  email?: string;
  name?: string;
}

async function savePBIMProjectToCloud(project: PBIMProject): Promise<{ persisted: boolean }> {
  const response = await authedFetch('/api/projects/save', {
    method: 'POST',
    body: JSON.stringify({ project }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `Save failed (HTTP ${response.status})`);
  }
  return await response.json();
}

// --- MOCK DATA FOR FALLBACK ---
const semanticLayers = [
  { id: 'geo', name: 'Geometry', status: 'active' },
  { id: 'sem', name: 'Semantic', status: 'active' },
  { id: 'prog', name: 'Program', status: 'active' },
  { id: 'topo', name: 'Topology', status: 'pending' },
];

// --- COMPONENTS ---

const IconButton = ({ icon: Icon, active, onClick, title }: any) => (
  <button 
    onClick={onClick}
    title={title}
    className={`p-2 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none
      ${active ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'}`}
  >
    <Icon size={16} strokeWidth={1.5} />
  </button>
);

const PanelHeader = ({ title }: { title: string }) => (
  <div className="flex items-center justify-between border-b border-black p-4 bg-white">
    <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] font-black">{title}</h2>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('qto'); // qto, pbim, exports
  const [prompt, setPrompt] = useState('Residência brutalista tropical em lote inclinado com pátio interno, iluminação zenital e separação clara entre espaços públicos e íntimos.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState('svg_plan'); // svg_plan, 3d, graph, facade_view, section_view, sheet
  const [project, setProject] = useState<PBIMProject | null>(null);
  const [svgStr, setSvgStr] = useState<string>('');
  const [svgFacadeStr, setSvgFacadeStr] = useState<string>('');
  const [svgSectionStr, setSvgSectionStr] = useState<string>('');
  const [sectionConfig, setSectionConfig] = useState<{ axis: 'X' | 'Y', coord: number }>({ axis: 'X', coord: 0 });
  const [svgGraphStr, setSvgGraphStr] = useState<string>('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [actionPrompt, setActionPrompt] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [actionAlert, setActionAlert] = useState<any>(null);
  const [critics, setCritics] = useState<any[]>([]);
  const [isCriticizing, setIsCriticizing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [currentLevelId, setCurrentLevelId] = useState<string>('');

  // Restore session: MSAL when configured, else server-side /api/me probe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isMsalConfigured()) {
          const account = await getActiveAccount();
          if (!cancelled && account) {
            setUser({
              id: account.localAccountId || account.homeAccountId,
              email: account.username,
              name: account.name,
            });
            return;
          }
        }
        // Fallback: ask the server who we are (anonymous OK).
        const r = await fetch('/api/me');
        if (r.ok) {
          const data = await r.json();
          if (!cancelled && data.user && !data.anonymous) {
            setUser(data.user);
          }
        }
      } catch (e) {
        console.warn('Session probe failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = async () => {
    try {
      if (isMsalConfigured()) {
        const result = await loginPopup();
        const account = result.account;
        if (account) {
          setUser({
            id: account.localAccountId || account.homeAccountId,
            email: account.username,
            name: account.name,
          });
        }
      } else {
        // No MSAL configured — fall back to server-side Authorization Code flow.
        window.location.href = '/auth/login';
      }
    } catch (e: any) {
      console.error(e);
      setActionAlert({ explanation: e?.message || 'Login failed.' });
    }
  };

  const handleLogout = async () => {
    try {
      if (isMsalConfigured()) {
        await msalLogout();
      }
    } finally {
      setUser(null);
    }
  };

  const handleSaveToCloud = async () => {
    if (!project) {
      setActionAlert({ explanation: 'Nenhum projeto carregado para salvar.' });
      return;
    }
    try {
      const result = await savePBIMProjectToCloud(project);
      setActionAlert({
        explanation: result.persisted
          ? 'Projeto salvo na nuvem (Azure Cosmos DB).'
          : 'Projeto salvo localmente (Cosmos DB indisponível no servidor).',
      });
    } catch (e: any) {
      console.error(e);
      setActionAlert({ explanation: e?.message || 'Erro ao salvar na nuvem.' });
    }
  };

  useEffect(() => {
    authedFetch('/api/projects/sample/model')
      .then(r => r.json())
      .then((data: PBIMProject) => {
        setProject(data);
        if (data.levels && data.levels.length > 0) {
            setCurrentLevelId(data.levels[0].id);
        }
      })
      .catch(e => console.error("Error fetching PBIM", e));
  }, []);

  useEffect(() => {
    // Generate all SVGs whenever the project changes so they are always available.
    if (project) {
        const gEngine = new GeometryEngine(project);
        const newSvgStr = gEngine.generateSVGPlan(currentLevelId || (project.levels && project.levels[0]?.id) || 'level_terreo', selectedObjectId);
        setSvgStr(newSvgStr);
        
        const eBuilder = new ElevationBuilder(project);
        setSvgFacadeStr(eBuilder.generateFrontElevationSVG());
        
        const sBuilder = new SectionBuilder(project);
        setSvgSectionStr(sBuilder.generateSectionSVG(sectionConfig.axis, sectionConfig.coord));

        const topoBuilder = new TopoGraphBuilder(project);
        setSvgGraphStr(topoBuilder.generateGraphSVG(currentLevelId || (project.levels && project.levels[0]?.id) || 'level_terreo'));

        // Trigger Critic Agent
        if (project.walls && project.walls.length > 0 && !isGenerating) {
            setIsCriticizing(true);
            const runCritic = async () => {
              try {
                const r = await authedFetch('/api/projects/critic', {
                  method: 'POST',
                  body: JSON.stringify({ project, svgStr: newSvgStr })
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || 'Failed to analyze project');
                if (Array.isArray(data)) setCritics(data);
                setIsCriticizing(false);
              } catch (e: any) {
                console.error(e);
                setCritics([{ aspect: 'Error', message: e.message || 'System error during analysis.' }]);
                setIsCriticizing(false);
              }
            };
            runCritic();
        }
    }
  }, [project, sectionConfig.axis, sectionConfig.coord, currentLevelId, selectedObjectId, isGenerating]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const r = await authedFetch('/api/projects/from-briefing', {
        method: 'POST',
        body: JSON.stringify({ prompt })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to generate');
      setProject(data);
      setIsGenerating(false);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'API request failed');
      setIsGenerating(false);
    }
  };

  const handleAction = async () => {
    if (!actionPrompt || !selectedObjectId || !project) return;
    setIsActing(true);
    setActionAlert(null);
    try {
      const r = await authedFetch('/api/projects/action', {
        method: 'POST',
        body: JSON.stringify({ prompt: actionPrompt, targetId: selectedObjectId, currentProject: project, svgStr })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Action failed');
      setActionAlert(data.actionAlert || { explanation: "Model updated via Reborn Conversational AI." });
      setProject(data.updatedModel);
      setActionPrompt('');
      setIsActing(false);
    } catch (e: any) {
      console.error(e);
      setActionAlert({ explanation: e.message || 'Error occurred.' });
      setIsActing(false);
    }
  };

  const handleAutoFix = async () => {
    if (!project || (critics.length === 0 && !project.spaces?.some(s => s.warnings?.length))) return;
    
    let autoPrompt = "Please implement the following architectural solutions to fix the project based on the Critic Reports and System warnings:\n\n";
    
    if (project.spaces) {
      project.spaces.forEach(s => {
        if (s.warnings && s.warnings.length > 0) {
          autoPrompt += `Spatial Issue in ${s.name}:\n` + s.warnings.map(w => `- ${w}`).join("\n") + "\n\n";
        }
      });
    }

    critics.forEach(c => {
      autoPrompt += `${c.title} (${c.axis} System):\n${c.message}\n\n`;
    });

    autoPrompt += "Gere um novo JSON PBIM alterando as localizações das paredes, criando portar e janelas, redimensionando recintos ou espaços conforme as críticas exigirem. É obrigatório processar isso.";

    setIsActing(true);
    setActionAlert(null);
    try {
      const r = await authedFetch('/api/projects/action', {
        method: 'POST',
        body: JSON.stringify({ prompt: autoPrompt, targetId: project.project_id, currentProject: project, svgStr })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Action failed');
      setActionAlert({ explanation: "Projeto corrigido automaticamente baseado na crítica do agente semântico." });
      setProject(data.updatedModel);
      setActionPrompt('');
      setIsActing(false);
    } catch (e: any) {
      console.error(e);
      setActionAlert({ explanation: e.message || 'Error occurred during auto-fix.' });
      setIsActing(false);
    }
  };

  const handleSvgClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.classList && target.classList.contains('pbim-object')) {
      const id = target.getAttribute('data-id');
      if (id) {
        setSelectedObjectId(id);
        setActiveTab('pbim');
      }
    } else {
      setSelectedObjectId(null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#fcfaf7] overflow-hidden text-[#141414] font-sans">
      {/* TOPBAR */}
      <header className="flex items-center justify-between border-b-2 border-black bg-white h-16 shrink-0 px-8 z-20 shadow-sm">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setViewMode('svg_plan')}>
            <div className="bg-black text-white p-1.5 rotate-45 group-hover:rotate-0 transition-transform">
                <Box size={18} />
            </div>
            <div className="flex flex-col">
                <h1 className="font-sans font-black text-2xl tracking-tighter uppercase leading-none italic">BI-MODEL</h1>
                <span className="font-mono text-[8px] uppercase tracking-[0.5em] font-bold text-black/30 mt-1">Procedural Architecture</span>
            </div>
          </div>
          <div className="h-8 w-px bg-black/10" />
          <div className="flex flex-col">
            <span className="font-mono text-[8px] text-black/40 uppercase font-black tracking-widest leading-none">Project Context</span>
            <span className="font-sans font-bold text-sm tracking-tight mt-1">{project?.name || 'Untitled Project'}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex flex-col items-end">
                <span className="font-mono text-[8px] text-black/40 uppercase font-bold">Engine Status</span>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-emerald-600 font-black tracking-widest">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Operational
                </div>
            </div>
          </div>

          <div className="h-8 w-px bg-black/10 mx-2" />

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="font-mono text-[8px] text-black/40 uppercase font-bold tracking-widest">Signed in as</span>
                <span className="font-mono text-[10px] font-bold tracking-tight truncate max-w-[180px]" title={user.email || user.id}>
                  {user.name || user.email || user.id}
                </span>
              </div>
              <button
                onClick={handleSaveToCloud}
                className="flex items-center gap-2 font-mono text-[10px] uppercase bg-black text-white px-5 py-2.5 hover:bg-black/90 transition-all font-bold tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                <Cloud size={14} /> Synchronize
              </button>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="flex items-center gap-1 font-mono text-[9px] uppercase border border-black px-3 py-2.5 hover:bg-black hover:text-white transition-all font-bold tracking-widest"
              >
                Sign out
              </button>
            </div>
          ) : (
             <button
              onClick={handleLogin}
              className="flex items-center gap-2 font-mono text-[10px] uppercase bg-black text-white px-5 py-2.5 hover:bg-black/90 transition-all font-bold tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
            >
              <LogIn size={14} /> Authenticate
            </button>
          )}
        </div>
      </header>

      {/* WORKSPACE */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL - AI Briefing & Semantic Engine */}
        <aside className="w-80 flex flex-col border-r border-black bg-white shrink-0 z-10 shadow-xl">
          <PanelHeader title="Briefing Agent" />
          
          <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3">
              <label className="font-mono text-[9px] uppercase text-black/40 font-bold tracking-widest">Architectural Prompt</label>
              <textarea 
                className="w-full h-40 p-4 font-sans text-sm font-medium border border-black focus:outline-none focus:ring-0 focus:border-black/40 resize-none bg-[#fcfaf7] leading-relaxed shadow-inner"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter spatial intent..."
              />
              <button 
                onClick={handleGenerate}
                className="flex items-center justify-center gap-3 w-full py-3 bg-black text-white font-mono text-[10px] uppercase font-bold tracking-[0.2em] hover:bg-black/90 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <Activity size={14} />
                  </motion.div>
                ) : (
                  <><Play size={14} fill="currentColor" /> Generate Spatial Model</>
                )}
              </button>
            </div>

            <div className="w-full h-px bg-black/10 my-2" />

            <div className="flex flex-col gap-3">
              <span className="font-mono text-[9px] uppercase text-black/40 font-bold tracking-widest">Semantic Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {['Brutalism', 'Tropical', 'Courtyard', 'Privacy'].map((tag, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] border border-black px-2 py-0.5 bg-white font-mono font-medium uppercase tracking-tighter shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    <CheckCircle2 size={10} className="text-black" />
                    <span>{tag}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-black/10 my-2" />

            <div className="flex flex-col gap-3">
              <span className="font-mono text-[9px] uppercase text-black/40 font-bold tracking-widest">Critic Intelligence</span>
              {isCriticizing && (
                <div className="p-4 border border-black/10 bg-[#fcfaf7] text-black/40 text-[11px] font-mono leading-relaxed animate-pulse uppercase tracking-tight">
                  Analyzing spatial topology...
                </div>
              )}
              
              {/* Manual/Synthesis Critics */}
              {project?.spaces && project.spaces.some(s => s.warnings && s.warnings.length > 0) && (
                <div className="flex flex-col gap-2">
                  {project.spaces.filter(s => s.warnings && s.warnings.length > 0).map((space, idx) => (
                    <div key={`warn-${idx}`} className="p-4 border border-orange-200 bg-orange-50/50 text-orange-900 text-[11px] font-sans leading-relaxed shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <CircleAlert size={14} className="text-orange-600" />
                        <span className="font-bold uppercase tracking-tight">Spatial Issue: {space.name}</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-1">
                        {space.warnings?.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {!isCriticizing && critics.length === 0 && (!project?.spaces || !project.spaces.some(s => s.warnings && s.warnings.length > 0)) && (
                <div className="p-4 border border-emerald-200 bg-emerald-50/30 text-emerald-900 text-[11px] font-sans font-medium leading-relaxed">
                  Spatial logic validated. No critical issues detected.
                </div>
              )}
              {!isCriticizing && critics.map((critic, idx) => (
                <div key={idx} className={`p-4 border text-[11px] font-sans leading-relaxed shadow-sm ${
                  critic.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-900' :
                  critic.severity === 'warning' ? 'border-orange-200 bg-orange-50 text-orange-900' :
                  'border-black/10 bg-[#fcfaf7] text-black'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CircleAlert size={14} />
                    <span className="font-bold uppercase tracking-tight">{critic.title}</span>
                  </div>
                  <div className="mb-2 uppercase text-[8px] font-mono font-black opacity-30 tracking-[0.2em]">{critic.axis} System</div>
                  <div className="opacity-80 leading-normal">{critic.message}</div>
                </div>
              ))}
              
              {!isCriticizing && (critics.length > 0 || (project?.spaces && project.spaces.some(s => s.warnings && s.warnings.length > 0))) && (
                <button
                  onClick={handleAutoFix}
                  disabled={isActing}
                  className="mt-4 flex items-center justify-center gap-2 w-full p-3 bg-black text-white font-mono text-[10px] uppercase font-bold tracking-widest hover:bg-black/80 transition-colors disabled:opacity-50"
                  >
                  <Hexagon size={14} className={isActing ? "animate-spin" : ""} />
                  {isActing ? "Implementing Solutions..." : "Auto-Fix Issues (AI Critic Intelligence)"}
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* CENTER PANEL - Canvas */}
        <section className="flex-1 flex flex-col relative bg-[#f4f4f4]">
          {/* Canvas Toolbar */}
          <div className="absolute top-4 left-4 z-10 flex gap-4">
            <div className="flex gap-1">
              <IconButton icon={Box} title="3D Massing" active={viewMode === '3d'} onClick={() => setViewMode('3d')} />
              <IconButton icon={Maximize} title="Schematic Plan" active={viewMode === 'svg_plan'} onClick={() => setViewMode('svg_plan')} />
              <IconButton icon={Activity} title="Elevation View" active={viewMode === 'facade_view'} onClick={() => setViewMode('facade_view')} />
              <IconButton icon={Scissors} title="Section View" active={viewMode === 'section_view'} onClick={() => setViewMode('section_view')} />
              <IconButton icon={LayoutTemplate} title="Technical Sheet" active={viewMode === 'sheet'} onClick={() => setViewMode('sheet')} />
            </div>

            {project?.levels && project.levels.length > 1 && viewMode === 'svg_plan' && (
              <div className="flex bg-white border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {project.levels.map(lvl => (
                  <button 
                    key={lvl.id}
                    className={`px-3 py-1 font-mono text-[10px] font-bold uppercase transition-colors ${currentLevelId === lvl.id ? 'bg-black text-white' : 'hover:bg-black/5'}`}
                    onClick={() => setCurrentLevelId(lvl.id)}
                  >
                    {lvl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="absolute top-4 right-4 z-10 font-mono text-[10px] uppercase bg-white border border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            {viewMode === 'svg_plan' ? `SVG // ${project?.levels.find(l => l.id === currentLevelId)?.name || 'LVL'}` : viewMode === '3d' ? 'OBJ // Monochromatic' : viewMode === 'sheet' ? 'SHEET // A1 PREVIEW' : viewMode === 'section_view' ? 'SVG // SECTION A-A' : 'SVG // FRONT ELEVATION'}
          </div>

          {/* Canvas Area Mock */}
          <div className="w-full h-full flex flex-col p-4 overflow-auto" 
               style={{ 
                 backgroundImage: 'radial-gradient(#141414 1px, transparent 1px)', 
                 backgroundSize: '20px 20px',
                 backgroundPosition: '-10px -10px'
               }}>
            
            {viewMode === 'svg_plan' && project && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 w-full h-full shadow-2xl relative border-[2px] border-black bg-white/80"
              >
                <InteractivePlanEditor 
                   project={project} 
                   levelId={currentLevelId || 'level_terreo'} 
                   onUpdateProject={setProject} 
                   selectedObjectId={selectedObjectId}
                   onSelectObject={setSelectedObjectId}
                   onDefineSection={(axis, coord) => {
                     setSectionConfig({ axis, coord });
                     setViewMode('section_view');
                   }}
                   sectionConfig={sectionConfig}
                />
              </motion.div>
            )}

            {viewMode === 'sheet' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 w-full h-full flex items-center justify-center p-4"
              >
                <TechnicalSheet project={project} svgPlanStr={svgStr} svgFacadeStr={svgFacadeStr} svgSectionStr={svgSectionStr} />
              </motion.div>
            )}

            {viewMode === 'section_view' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 w-full h-full relative border-[2px] border-black bg-white/80 p-8 shadow-2xl flex flex-col items-center justify-center"
              >
                {svgSectionStr ? (
                  <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svgSectionStr }} />
                ) : (
                  <div className="font-mono text-xs opacity-50">Generating Section...</div>
                )}
                
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">Corte Técnico</span>
                  Corte Longitudinal AA
                </div>
              </motion.div>
            )}

            {viewMode === 'facade_view' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 w-full h-full relative border-[2px] border-black bg-white/80 p-8 shadow-2xl flex flex-col items-center justify-center"
              >
                {svgFacadeStr ? (
                  <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svgFacadeStr }} />
                ) : (
                  <div className="font-mono text-xs opacity-50">Generating Elevation...</div>
                )}
                
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">Vista Técnica</span>
                  Fachada Frontal
                </div>
              </motion.div>
            )}

            {viewMode === 'graph' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 w-full h-full relative border-[2px] border-black bg-white/80 p-8 shadow-2xl flex flex-col items-center justify-center"
              >
                {svgGraphStr ? (
                  <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svgGraphStr }} />
                ) : (
                  <div className="font-mono text-xs opacity-50">Generating Topo Graph...</div>
                )}
                
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">Analysis</span>
                  Topological Adjacency Diagram
                </div>
              </motion.div>
            )}

            {viewMode === '3d' && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="w-full h-full border-[2px] border-black bg-white/80 shadow-2xl relative"
              >
                {project ? (
                  <ThreeDViewer 
                    project={project} 
                    selectedObjectId={selectedObjectId} 
                    onSelect={(id) => {
                      setSelectedObjectId(id);
                      if (id) setActiveTab('pbim');
                    }} 
                  />
                ) : (
                  <div className="flex items-center justify-center font-mono text-sm h-full opacity-50">
                    Loading 3D Engine...
                  </div>
                )}
                <div className="absolute bottom-4 left-4 font-serif italic text-xs text-black/60 pointer-events-none">
                  <span className="font-mono text-[10px] bg-black/10 px-1 py-0.5 rounded-sm not-italic font-bold mr-2 uppercase">WebGL Active</span>
                  {project?.name || 'Loading Model...'}
                </div>
              </motion.div>
            )}

          </div>
        </section>

        {/* RIGHT PANEL - Documentation & BIM */}
        <aside className="w-80 flex flex-col border-l border-black bg-white shrink-0">
          <div className="flex border-b border-black">
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase ${activeTab === 'pbim' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('pbim')}
            >
              PBIM
            </button>
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase border-l border-black ${activeTab === 'qto' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('qto')}
            >
              QTO Data
            </button>
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase border-l border-black ${activeTab === 'exports' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('exports')}
            >
              Exports
            </button>
            <button 
              className={`flex-1 p-2 font-mono text-xs uppercase border-l border-black ${activeTab === 'info' ? 'bg-black text-white' : 'hover:bg-black/5'}`}
              onClick={() => setActiveTab('info')}
            >
              Info
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-0">
            {activeTab === 'info' && project && (
              <MetadataEditor project={project} onUpdate={setProject} />
            )}
            {activeTab === 'pbim' && (
              project ? (
                <PBIMTreeViewer 
                  project={project} 
                  selectedObjectId={selectedObjectId} 
                  onSelectObject={setSelectedObjectId} 
                />
              ) : (
                <div className="p-4 font-mono text-[10px] opacity-50">No PBIM Object Loaded</div>
              )
            )}

            {activeTab === 'pbim' && (
              <div className="p-4 flex flex-col gap-3 border-t border-black bg-[#fafafa]">
                <span className="font-mono text-[10px] uppercase text-black/60">Reborn / AI Editor</span>
                <div className="flex flex-col gap-2">
                  <textarea 
                    className="w-full p-2 font-mono text-xs border border-black focus:outline-none focus:ring-1 focus:ring-black resize-none bg-white placeholder:text-black/30"
                    placeholder="e.g. Ampliar o salão principal em 2m, adicionar janela na fachada norte..."
                    rows={4}
                    value={actionPrompt}
                    onChange={e => setActionPrompt(e.target.value)}
                  />
                  <button 
                    disabled={isActing}
                    onClick={handleAction}
                    className="flex items-center justify-center gap-2 w-full py-1.5 bg-black text-white font-mono text-xs uppercase hover:bg-black/80 transition-colors"
                  >
                    {isActing ? 'Mutating PBIM...' : 'Request Change'}
                  </button>
                  {actionAlert && (
                     <div className="mt-2 p-2 font-serif text-xs border border-black/20 bg-emerald-50 text-emerald-900 shadow-sm leading-tight">
                       <span className="font-bold flex items-center gap-1 mb-1"><CheckCircle2 size={12} /> Operation Validated:</span>
                       {actionAlert.explanation}
                     </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'qto' && (
              <TakeoffPanel project={project} />
            )}

            {activeTab === 'exports' && (
              <div className="p-4 flex flex-col gap-2">
                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!svgStr) return;
                     const blob = new Blob([svgStr], {type: "image/svg+xml"});
                     const url = URL.createObjectURL(blob);
                     const a = document.createElement("a");
                     a.href = url;
                     a.download = `${project?.name || 'export'}.svg`;
                     a.click();
                  }}
                >
                  <span className="font-mono text-xs uppercase">SVG Vector</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>

                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!project) return;
                     import('./lib/geometry_engine/dxf_builder').then(({ DXFBuilder }) => {
                       const dxfBuilder = new DXFBuilder(project);
                       const dxfStr = dxfBuilder.generateThickWallsDXF();
                       const blob = new Blob([dxfStr], {type: "text/plain"});
                       const url = URL.createObjectURL(blob);
                       const a = document.createElement("a");
                       a.href = url;
                       a.download = `${project.name || 'export'}.dxf`;
                       a.click();
                     });
                  }}
                >
                  <span className="font-mono text-xs uppercase">DXF CAD</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>

                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!project) return;
                     const blob = new Blob([JSON.stringify(project, null, 2)], {type: "application/json"});
                     const url = URL.createObjectURL(blob);
                     const a = document.createElement("a");
                     a.href = url;
                     a.download = `${project?.name || 'export'}.pbim.json`;
                     a.click();
                  }}
                >
                  <span className="font-mono text-xs uppercase">PBIM JSON</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>

                <button 
                  className="flex items-center justify-between p-3 border border-black hover:bg-black hover:text-white transition-colors group"
                  onClick={() => {
                     if (!project) return;
                     import('./lib/geometry_engine/obj_builder').then(({ OBJBuilder }) => {
                       const objBuilder = new OBJBuilder(project);
                       const objStr = objBuilder.generateOBJ();
                       const blob = new Blob([objStr], {type: "text/plain"});
                       const url = URL.createObjectURL(blob);
                       const a = document.createElement("a");
                       a.href = url;
                       a.download = `${project.name || 'export'}.obj`;
                       a.click();
                     });
                  }}
                >
                  <span className="font-mono text-xs uppercase">OBJ 3D Model</span>
                  <Download size={14} className="opacity-50 group-hover:opacity-100" />
                </button>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
