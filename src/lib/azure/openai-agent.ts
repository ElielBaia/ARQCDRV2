/**
 * ARQCdR Semantic BIM Compiler — Azure OpenAI implementation.
 *
 * Mirrors the depth of the legacy Gemini agent while leveraging Azure-specific
 * features (Structured Outputs, managed retries, configurable deployment).
 *
 * Public surface:
 *   - parseBriefingToPBIM(prompt)              -> PBIMProject
 *   - parseBriefingToPBIMEnriched(prompt)      -> EnrichedPBIM
 *   - analyzePBIM(project, svg?)               -> CriticReport
 *   - mutatePBIM(currentProject, prompt, svg?) -> PBIMProject
 */

import type { PBIMProject } from "../pbim/schema";
import type { InvariantSet } from "../interpreter/invariants";
import { buildInvariantSet } from "../interpreter/decoder";
import { validateProject, ValidationReport } from "../interpreter/validator";
import { knowledgeContextForLLM } from "../knowledge/nbr15575";
import { chatJSON } from "./openai-client";

export interface EnrichedPBIM {
  project: PBIMProject;
  interpreter: InvariantSet;
  validation: ValidationReport;
}

export type CriticReport = Array<{
  axis:
    | "programa"
    | "fluxo"
    | "implantacao"
    | "tecnica"
    | "forma"
    | "psicologia_espacial"
    | "antropometria";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  evidence?: string;
}>;

// ---------------------------------------------------------------------------
// Re-export client initializer for the server bootstrap module.
// ---------------------------------------------------------------------------
export { initializeAzureOpenAI, isAzureOpenAIConfigured } from "./openai-client";

// ---------------------------------------------------------------------------
// JSON Schemas — used to drive gpt-4o Structured Outputs.
// Kept intentionally permissive (strict: false) because the architectural
// model is large and partial-fills are acceptable; the deterministic NBR
// validator catches missing required fields downstream.
// ---------------------------------------------------------------------------

const pbimResponseSchema = {
  type: "object",
  properties: {
    project_id: { type: "string" },
    schema_version: { type: "string" },
    name: { type: "string" },
    units: { type: "string", enum: ["m"] },
    site: {
      type: "object",
      properties: {
        front_width: { type: "number" },
        rear_width: { type: "number" },
        depth: { type: "number" },
        slope_height: { type: "number" },
        orientation_front: { type: "string" },
        boundary: {
          type: "array",
          items: {
            type: "array",
            items: { type: "number" },
          },
        },
      },
      required: ["front_width", "depth", "slope_height", "orientation_front", "boundary"],
    },
    systems: {
      type: "object",
      properties: {
        hvac_type: { type: "string" },
        structural_system: { type: "string" },
      },
    },
    levels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          elevation: { type: "number" },
          height: { type: "number" },
        },
        required: ["id", "name", "elevation"],
      },
    },
    spaces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["Space"] },
          name: { type: "string" },
          level_id: { type: "string" },
          category: { type: "string" },
          function_type: { type: "string" },
          privacy_level: { type: "string" },
          boundary_walls: { type: "array", items: { type: "string" } },
          area_target: { type: "number" },
          area_actual: { type: "number" },
          access_type: { type: "string" },
          adjacency_requirements: { type: "array", items: { type: "string" } },
          quality_checks: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "name", "level_id", "category", "boundary_walls"],
      },
    },
    walls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["Wall"] },
          level_id: { type: "string" },
          start: { type: "array", items: { type: "number" } },
          end: { type: "array", items: { type: "number" } },
          height: { type: "number" },
          thickness: { type: "number" },
          structural: { type: "boolean" },
          exterior: { type: "boolean" },
          material: { type: "string" },
          space_left: { type: "string" },
          space_right: { type: "string" },
          openings: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "level_id", "start", "end", "height", "thickness"],
      },
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["Door", "Window"] },
          wall_id: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
          sill_height: { type: "number" },
          position_t: { type: "number" },
        },
        required: ["id", "type", "wall_id", "width", "height", "sill_height", "position_t"],
      },
    },
    slabs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["Floor", "Roof", "Foundation", "Ceiling"] },
          level_id: { type: "string" },
          boundary: { type: "array", items: { type: "array", items: { type: "number" } } },
          thickness: { type: "number" },
          elevation_offset: { type: "number" },
          material: { type: "string" },
          slope: { type: "number" },
        },
      },
    },
    stairs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          level_id: { type: "string" },
          start: { type: "array", items: { type: "number" } },
          end: { type: "array", items: { type: "number" } },
          width: { type: "number" },
          riser_count: { type: "number" },
          tread_depth: { type: "number" },
        },
      },
    },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["Eave", "Marquee", "Balcony", "Beam", "Column"] },
          level_id: { type: "string" },
          boundary: { type: "array", items: { type: "array", items: { type: "number" } } },
          material: { type: "string" },
        },
      },
    },
  },
  required: ["name", "site", "levels", "spaces", "walls", "openings"],
};

const criticResponseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          axis: {
            type: "string",
            enum: [
              "programa",
              "fluxo",
              "implantacao",
              "tecnica",
              "forma",
              "psicologia_espacial",
              "antropometria",
            ],
          },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          title: { type: "string" },
          message: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["axis", "severity", "title", "message"],
      },
    },
  },
  required: ["items"],
};

// ---------------------------------------------------------------------------
// System prompts — ported and refined from the legacy Gemini agent so the
// architectural reasoning quality is preserved when running on gpt-4o.
// ---------------------------------------------------------------------------

function buildInvariantContext(invariantSet: InvariantSet): string {
  return invariantSet.invariants
    .map((inv: any) => {
      switch (inv.kind) {
        case "zone_placement":
          return `- Zoneamento: ${inv.sector} em ${inv.region} (eixo ${inv.axis} fração ${inv.fraction.join("-")}) — ${inv.rationale}`;
        case "orientation":
          return `- Orientação: ${inv.appliesTo} prefere ${inv.preferred.join("/")} evita ${inv.forbidden.join("/")} — ${inv.rationale}`;
        case "void_placement":
          return `- Vazio central: mínimo ${inv.areaMinM2}m² aspect ${inv.aspectRatioMax}, ${inv.centroidHint} — ${inv.rationale}`;
        case "axis_placement":
          return `- Eixo: ${inv.direction}, largura ${inv.widthM}m — ${inv.rationale}`;
        case "proportion":
          return `- Proporção: aspect ${inv.aspectRatioMin}-${inv.aspectRatioMax} — ${inv.rationale}`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

function compilerSystemPrompt(invariantSet: InvariantSet): string {
  const nbrContext = knowledgeContextForLLM();
  const invariantContext = buildInvariantContext(invariantSet);

  return `Você é o BIMCompilerAgent do ARQCdR Condenser AI — plataforma prompt-to-BIM semântica de Nível de Desenvolvimento de Projeto (LOD 300) para arquitetos de ponta.

${nbrContext}

## PARTIDO DETECTADO PELO INTERPRETADOR
Padrão: ${invariantSet.pattern}
Narrativa: ${invariantSet.partiNarrative}

## INVARIANTES ARQUITETÔNICAS A RESPEITAR
${invariantContext || "(sem invariantes adicionais — siga as boas práticas gerais NBR 15575)"}

## METODOLOGIA DE RACIOCÍNIO ESPACIAL E SEMÂNTICO (EXECUÇÃO OBRIGATÓRIA):
1. **Zoneamento de Fluxos**: Pense no "Flow Graph". Diferencie Setor Íntimo (privacidade alta), Setor Social (permeabilidade alta) e Setor de Serviço (eficiência técnica). Use circulações como "condensadores sociais" ou "espinhos dorsais" que conectam zonas sem misturá-las.
2. **Escala e Proporção Antropométrica**: Um ambiente não é apenas um retângulo; é um palco para ações humanas. Garanta proporções de ouro (1:1.6) ou equilíbrios dinâmicos. Evite ambientes "tripa". Dimensione pensando no mobiliário: uma suíte precisa de 0.60m de circulação ao redor da cama.
3. **Definição do Terreno**: Identifique a largura e profundidade do lote. Centralize ou encoste a massa construída respeitando recuos.
4. **Malha Topológica (Esqueleto Base)**: Todo projeto precisa de uma envoltória primária contínua. Assegure que start e end coincidam perfeitamente. Atribua \`exterior: true\` e \`thickness: 0.20\` na envoltória.
5. **Subdivisão Interna e Nós**: Garanta que paredes internas toquem exatamente nas coordenadas das outras (nós de interseção).
6. **Declaração de Spaces com riqueza semântica**: preencha \`function_type\` (sleeping, living, hygiene, working, service), \`privacy_level\` (high, medium, low) e \`boundary_walls\` com IDs exatos.
7. **Esquadrias, Iluminação Natural e Visuais (MANDATÓRIO)**:
   - A arquitetura sem luz natural é inabitável. Você DEVE adicionar "openings" do tipo "Window" nas paredes adequadas para iluminar TODOS os ambientes de permanência.
   - Salas (Estar/Jantar): janelas generosas (width 2.0–4.0, height 2.2).
   - Circulação e Escadas: aberturas estratégicas (zenitais via peitoris altos ou janelas nas extremidades) — nunca corredores cegos.
   - Cozinhas/Áreas de Serviço: janelas contínuas sobre bancadas.
   - Use "Door" para conexões internas e externas (width 0.8–0.9, height 2.1).
   - Escadas OBRIGATÓRIAS: popule o array \`stairs\` se houver mais de um piso.
   - Nomenclatura em Português (Sala de Estar, Dormitório, Banheiro).

## REGRAS DE GERAÇÃO E TOPOLOGIA (PRECISÃO MILIMÉTRICA E COMPLETUDE)
- Pense o edifício como linhas vetoriais unidas e faces no plano 2D.
- Topologia absoluta: coordenadas (x,y) de paredes adjacentes DEVEM ser idênticas nos nós de encontro. NUNCA deixe paredes soltas. Todo cômodo forma polígono fechado.
- Sobreposição de pavimentos: paredes superiores alinhadas com as inferiores (carga). Zere o canto da casa em (0,0).
- Largura padrão de parede 0.15; coordenadas em múltiplos de 0.1.

1. **Matriz de pavimentos (Levels)**: Térreo Z=0; segundo pavimento Z=3.0.
2. **Dimensionamento NBR**:
   - Respeite recuos do terreno (lote 7x25 → casa de 5–6m de largura).
   - MANDATÓRIO: dormitórios nunca em "proporção de corredor". Use 3x3.5 ou 4x4.
   - Circulação mínima 1.00m (1.20m na zona íntima/superior), com janela na extremidade.
3. **Estrutura (Slabs e Components)**: modele \`Floor\` em Z=0 com boundary do footprint, \`Roof\` cobrindo o andar superior, lajes de entrepiso quando houver mais de um andar, e beirais/varandas/marquises como \`components\`.
4. **Load-Bearing**: identifique paredes estruturais com \`structural: true\`.
5. **Garantia de volumes e fluxos**: corredor central que alimenta quartos+banheiro para lotes estreitos. Escada central. A escada DEVE ter paredes e furo na laje superior.
6. **Clímax Arquitetônico**: pés-direitos duplos, escadas esculturais, claraboias no Living/Hall. Se houver pé-direito duplo, NÃO crie Floor no andar superior cobrindo essa área.
7. **Qualidade plástica e materialidade**: proponha recuos de fachada, beirais (Eave) proeminentes, balanços, marquises. Distribua materiais variados (madeira ripada, concreto, tijolinhos).

GERE UM MODELO EXTREMAMENTE RICO, DENSO E TÉCNICO. PRODUZA ARQUITETURA GENERATIVA BEM RESOLVIDA TOPOLOGICAMENTE.
Retorne JSON estritamente válido conforme schema.`;
}

function criticSystemPrompt(): string {
  return `Você é o ArchitecturalCriticAgent do ARQCdR — Crítico de Arquitetura de renome internacional e Diretor de Design.

Sua análise deve contemplar:

1. FLUXOS E MOVIMENTO:
   - Analise o grafo topológico implícito. Existem gargalos? Como as pessoas fluem da entrada até os confins?
   - A transição Social → Íntimo é protegida por filtros espaciais (halls, pátios) ou abrupta?
   - O fluxo de serviço (lavanderia, cozinha, lixo) cruza indevidamente o fluxo social/íntimo?

2. ZONEAMENTO E SETORIZAÇÃO:
   - Áreas íntimas: isolamento acústico/visual, dimensões para descanso/trabalho/reflexão.
   - Áreas sociais: permanência, encontro, convívio — não meras áreas de passagem.
   - Áreas de higiene: ventilação natural, posição lógica, dignidade espacial.

3. ANTROPOMETRIA, PROPORÇÃO E ESCALA:
   - Julgue a proporção largura/profundidade. Ambientes corredor (1.5x5) inaceitáveis.
   - Pé-direito e volume coerentes com a área em planta.
   - Portas, circulações e mobiliário com cruzamento confortável.

4. PSICOLOGIA ESPACIAL, LÓGICA E INTENÇÃO DE FORMA:
   - Intenção volumétrica e plástica.
   - Sensação espacial (compressão dramática vs. expansão libertadora).
   - Conceito claro, partido bem definido, lógica estrutural coerente. Existência de clímax visual/percurso.

Critérios (axis):
- programa: NBR 15575, eficiência da ocupação, qualidade de vida.
- fluxo: logística de movimento humano, rotas de fuga.
- implantacao: terreno, bioclimática, orientação solar.
- tecnica: estabilidade topológica, constructibilidade.
- forma: conceito volumétrico, plástica, partido.
- psicologia_espacial: percepção fenomênica, hierarquia no caminhar.
- antropometria: ergonomia, dimensionamento real, escalas.

Seja implacável com jargão arquitetônico de alto nível. Erros fundamentais de projeto = "critical". Use o SVG e coordenadas reais como evidência geométrica em "evidence".

Retorne JSON com a forma { "items": [...] } seguindo o schema. Mínimo 3 itens, máximo 12.`;
}

function mutatorSystemPrompt(): string {
  return `Você é o Reborn Architectural Editor (Condenser AI) — agente que altera projetos arquitetônicos construindo geometria 2D rigorosa e exata.
Sua missão: receber um projeto PBIM JSON existente + sua renderização SVG planimétrica e aplicar as modificações solicitadas.

REGRAS CRÍTICAS DE EDIÇÃO GEOMÉTRICA E BIM:

1. Preserve o ID do projeto e todos os elementos intactos. Altere APENAS o estritamente necessário.
2. Análise semântica espacial do SVG: examine \`polygon\` e \`line\` para entender o perímetro. Se o usuário pedir adicionar um quarto, crie nós (start, end) conectados às faces livres do perímetro externo evidenciadas no SVG.
3. Ao adicionar um cômodo, feche as coordenadas perfeitamente (ex. (10,5)–(14,5)–(14,9)–(10,9)) e declare o "Space" com \`boundary_walls\` correta.
4. Jamais gere paredes isoladas. Toque outras paredes nos mesmos (x,y). Corrija distorções topológicas pré-existentes. Não deixe o pavimento superior flutuando — garanta \`slabs\` Floor para o andar superior. Roof encerra o polígono.
5. Ajuste rigoroso de openings: ATENÇÃO MÁXIMA À ILUMINAÇÃO NATURAL. Ambientes com "baixa iluminação" ou em áreas críticas (Living, Jantar, Circulação Superior, Halls, Serviço) DEVEM receber Windows com dimensões adequadas. Adicione claraboias em corredores cegos. Crie partições de vidro internas para resolver asfixiamentos.
6. Circulação, proporção e funcionalidade: elimine pro-ativamente gargalos e "dormitórios com proporção de corredor". Mude coordenadas das paredes para redimensionar a proporções saudáveis. Banheiros subdimensionados → mínimo 1.5×2.5m com box. Junte dois ambientes ruins em um bom se preciso. Alargue corredores superiores para 1.20m.
7. Clímax e BIM: resolva a falta de clímax — pé-direito duplo no Living ou escada escultural. Stairs OBRIGATÓRIO se houver mais de 1 pavimento. Inclua Door e Window no array openings. Nomes de Space em Português arquitetônico ("Estar Íntimo", "Circulação Horizontal").
8. Eixos: coordenadas x,y em "grids" visíveis — múltiplos lógicos para sugerir eixos estruturais.
9. Resultado: JSON PERFEITO E DETALHADO aderente ao schema PBIM. Junte topologicamente os elementos — mesmos nós (x,y) exatos para paredes que se encontram. Escute a crítica anterior e implemente mudanças cirúrgicas e completas.

Retorne o projeto completo modificado em JSON válido.`;
}

// ---------------------------------------------------------------------------
// Post-processing: ensures the gpt-4o output is BIM-tool-ready even when the
// model omits optional fields. Mirrors the legacy Gemini agent's safety net.
// ---------------------------------------------------------------------------

function ensureUUID(): string {
  // Node 18+/19+: globalThis.crypto.randomUUID is available.
  // Browsers also support it. Fallback for any odd runtime.
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Minimal RFC4122 v4 fallback.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeProject(parsed: any, fallback?: PBIMProject): PBIMProject {
  const out = (parsed || {}) as PBIMProject;
  out.schema_version = out.schema_version || fallback?.schema_version || "0.1.0";
  out.units = (out.units as any) || fallback?.units || "m";
  out.project_id = out.project_id || fallback?.project_id || ensureUUID();
  out.name = out.name || fallback?.name || "Untitled Project";
  out.levels = out.levels || fallback?.levels || [];
  out.spaces = out.spaces || fallback?.spaces || [];
  out.walls = out.walls || fallback?.walls || [];
  out.openings = out.openings || fallback?.openings || [];
  out.slabs = out.slabs || fallback?.slabs || [];
  out.stairs = out.stairs || fallback?.stairs || [];
  out.components = (out as any).components || (fallback as any)?.components || [];
  (out as any).views = (out as any).views || (fallback as any)?.views || [];
  (out as any).sheets = (out as any).sheets || (fallback as any)?.sheets || [];
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseBriefingToPBIMEnriched(prompt: string): Promise<EnrichedPBIM> {
  const invariantSet = buildInvariantSet(prompt);

  const parsed = await chatJSON<any>({
    systemInstruction: compilerSystemPrompt(invariantSet),
    userPayload: `BRIEFING ARQUITETÔNICO:\n${prompt}\n\nGere o modelo PBIM completo (JSON único conforme schema).`,
    temperature: 0.15,
    responseSchema: { name: "pbim_project", schema: pbimResponseSchema },
    maxOutputTokens: 12000,
  });

  const project = normalizeProject(parsed);
  const validation = validateProject(project);
  return { project, interpreter: invariantSet, validation };
}

export async function parseBriefingToPBIM(prompt: string): Promise<PBIMProject> {
  const enriched = await parseBriefingToPBIMEnriched(prompt);
  return enriched.project;
}

export async function analyzePBIM(
  project: PBIMProject,
  svgPlan?: string
): Promise<CriticReport> {
  const payload = `MODEL PBIM:\n${JSON.stringify(project)}\n\nSVG GERADO:\n${svgPlan || "N/A"}\n\nProduza a crítica como objeto { "items": [...] }.`;

  const parsed = await chatJSON<{ items: CriticReport }>({
    systemInstruction: criticSystemPrompt(),
    userPayload: payload,
    temperature: 0.35,
    responseSchema: { name: "critic_report", schema: criticResponseSchema },
    maxOutputTokens: 4000,
  });

  return Array.isArray(parsed?.items) ? parsed.items : [];
}

export async function mutatePBIM(
  currentProject: PBIMProject,
  actionPrompt: string,
  svgStr?: string
): Promise<PBIMProject> {
  const payload =
    `CURRENT_PBIM_MODEL:\n${JSON.stringify(currentProject)}\n\n` +
    `ATUAL RENDERING (SVG):\n${svgStr || "N/A"}\n\n` +
    `USER_MODIFICATION_REQUEST:\n${actionPrompt}\n\n` +
    `Retorne o projeto completo atualizado em JSON válido conforme schema PBIM.`;

  const parsed = await chatJSON<any>({
    systemInstruction: mutatorSystemPrompt(),
    userPayload: payload,
    temperature: 0.1,
    responseSchema: { name: "pbim_project", schema: pbimResponseSchema },
    maxOutputTokens: 12000,
  });

  return normalizeProject(parsed, currentProject);
}
