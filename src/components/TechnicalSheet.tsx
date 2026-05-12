import React from 'react';
import { PBIMProject } from '../lib/pbim/schema';

interface TechnicalSheetProps {
  project: PBIMProject | null;
  svgPlanStr: string;
  svgFacadeStr: string;
  svgSectionStr: string;
}

export const TechnicalSheet: React.FC<TechnicalSheetProps> = ({ project, svgPlanStr, svgFacadeStr, svgSectionStr }) => {
  if (!project) return null;

  return (
    <div className="w-full aspect-[1.414/1] bg-[#fcfaf7] border-[0.5px] border-black p-6 flex flex-col relative font-sans text-black shadow-[20px_20px_60px_-15px_rgba(0,0,0,0.15)] overflow-hidden">
      {/* Outer Border */}
      <div className="border-[0.5px] border-black flex-1 flex flex-row relative">
        
        {/* Drawings Area */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          <div className="flex-[1.5] border-[0.25px] border-black/20 p-4 relative bg-white/40 shadow-inner overflow-hidden">
             <div className="absolute top-2 left-2 text-[8px] uppercase font-bold tracking-[0.2em] bg-black text-white px-2 py-0.5 z-10">01 // PLANTA BAIXA - NÍVEL TÉRREO</div>
             <div className="w-full h-full flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: svgPlanStr }} />
          </div>
          
          <div className="flex-1 flex flex-row gap-4 overflow-hidden">
             <div className="flex-1 border-[0.25px] border-black/20 p-4 relative bg-white/40 shadow-inner overflow-hidden">
                <div className="absolute top-2 left-2 text-[8px] uppercase font-bold tracking-[0.2em] bg-black text-white px-2 py-0.5 z-10">02 // FACHADA FRONTAL</div>
                <div className="w-full h-full flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: svgFacadeStr }} />
             </div>
             <div className="flex-1 border-[0.25px] border-black/20 p-4 relative bg-white/40 shadow-inner overflow-hidden">
                <div className="absolute top-2 left-2 text-[8px] uppercase font-bold tracking-[0.2em] bg-black text-white px-2 py-0.5 z-10">03 // CORTE LONGITUDINAL AA</div>
                <div className="w-full h-full flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: svgSectionStr }} />
             </div>
          </div>
        </div>

        {/* Title Block (Carimbo) Right Side */}
        <div className="w-64 xl:w-72 border-l-[0.5px] border-black flex flex-col bg-white">
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            {/* Quadro de Áreas */}
            <div className="border-[0.5px] border-black p-3 bg-black/5">
                <div className="text-[9px] uppercase font-bold tracking-widest border-b-[0.5px] border-black pb-1 mb-2">Quadro de Áreas</div>
                <table className="w-full text-[8px] border-collapse">
                    <thead>
                        <tr className="border-b border-black text-black/60">
                            <th className="text-left py-1">Ambiente</th>
                            <th className="text-right py-1">Área (m²)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {project.spaces.map(space => (
                            <tr key={space.id} className="border-b border-black/10">
                                <td className="py-1 uppercase truncate max-w-[100px]">{space.name}</td>
                                <td className="py-1 text-right font-mono">{(space.area_actual || 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold">
                            <td className="py-1 uppercase">Total Construída</td>
                            <td className="py-1 text-right font-mono">
                                {project.spaces.reduce((acc, s) => acc + (s.area_actual || 0), 0).toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="border-[0.5px] border-black p-3">
                <div className="text-[9px] uppercase font-bold tracking-widest border-b-[0.5px] border-black pb-1 mb-2">Notas Técnicas</div>
                <div className="text-[7px] leading-relaxed text-black/70 italic">
                    1. Dimensões em metros. <br/>
                    2. Conferir medidas no local. <br/>
                    3. Alvenarias externas: 0.15m. <br/>
                    4. Projeto gerado via motor procedimental BIM.
                </div>
            </div>

            <div className="flex-1 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.05] text-[60px] font-black tracking-tighter leading-none pointer-events-none rotate-[-90deg] whitespace-nowrap">
                   BI-MODEL
                </div>
            </div>
          </div> 
          
          <div className="border-t-[0.5px] border-black flex flex-col bg-white z-10 shrink-0">
             <div className="p-4 border-b-[0.5px] border-black">
               <div className="text-[8px] uppercase text-black/40 font-bold mb-1 tracking-widest">Projeto / Local</div>
               <div className="text-sm font-bold leading-tight uppercase tracking-tight line-clamp-2">{project.name || 'Residência Sem Nome'}</div>
               <div className="text-[9px] text-black/60 mt-1 uppercase truncate">{project.metadata?.address || 'AI Studio Architecture'}</div>
             </div>
             
             <div className="p-4 border-b-[0.5px] border-black">
               <div className="text-[8px] uppercase text-black/40 font-bold mb-1 tracking-widest">Cliente</div>
               <div className="text-[10px] font-bold uppercase tracking-tight">{project.metadata?.client || 'General Client'}</div>
             </div>
             
             <div className="p-4 border-b-[0.5px] border-black relative">
               <div className="text-[8px] uppercase text-black/40 font-bold mb-1 tracking-widest">Responsável Técnico / CREA</div>
               <div className="text-[10px] font-bold">{project.metadata?.author || 'AI Studio Architect'}</div>
               <div className="mt-4 flex justify-between items-center">
                 <div className="w-10 h-10 border border-black/10 p-1 bg-white">
                   <svg viewBox="0 0 10 10" className="w-full h-full fill-black">
                     <path d="M0 0h3v3H0zM7 0h3v3H7zM0 7h3v3H0zM4 4h2v2H4zM2 4h1v1H2zM6 2h1v1H6z" />
                   </svg>
                 </div>
                 <div className="flex-1 ml-3 border-b border-black/20 h-px self-end mb-1"></div>
               </div>
               <div className="text-[7px] text-black/30 mt-1 text-right uppercase tracking-widest leading-none">Chave de Autenticidade Digital</div>
             </div>
             
             <div className="flex flex-row">
               <div className="p-4 border-r-[0.5px] border-black flex-1">
                 <div className="text-[8px] uppercase text-black/40 font-bold mb-1 tracking-widest">Data</div>
                 <div className="text-[10px] font-bold font-mono">{(new Date()).toLocaleDateString('pt-BR')}</div>
               </div>
               <div className="p-4 flex-1">
                 <div className="text-[8px] uppercase text-black/40 font-bold mb-1 tracking-widest">Escala</div>
                 <div className="text-[10px] font-bold font-mono">1:100 (INDICADA)</div>
               </div>
             </div>
             
             <div className="p-5 border-t-[0.5px] border-black bg-black text-white flex justify-between items-end">
               <div className="text-[9px] uppercase font-bold tracking-[0.3em] text-white/50">Prancha</div>
               <div className="text-4xl font-black leading-none tracking-tighter">A01</div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
