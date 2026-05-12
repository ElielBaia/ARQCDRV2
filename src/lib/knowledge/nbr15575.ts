/**
 * ARQCdR - Base de Conhecimento Arquitetonico Residencial Brasileiro
 *
 * Fontes: NBR 15575 (Desempenho), NBR 9050 (Acessibilidade), Caixa HIS.
 * NAO substitui codigo de obras municipal - verificar regulacao local.
 *
 * Esta base alimenta o Gemini agent como contexto estruturado e o validator
 * pos-geracao como checagem deterministica.
 */

export type Face = "N" | "NL" | "L" | "SL" | "SE" | "S" | "SO" | "O" | "NO";
export type Sector = "social" | "intimo" | "servico" | "trabalho" | "circulacao";

export interface FurnitureSpec {
  name: string;
  widthM: number;
  depthM: number;
  quantityMin: number;
  quantityTypical: number;
}

export interface SolarPreference {
  preferred: Face[];
  acceptable: Face[];
  forbidden: Face[];
  rationale: string;
}

export interface CirculationRequirement {
  aroundFurnitureM: number;
  betweenBedsM: number;
  inFrontOfWardrobeM: number;
  inFrontOfToiletM: number;
  workTriangleMaxM: number;
}

export interface RoomStandard {
  category: string;
  sector: Sector;
  areaMinM2: number;
  areaComfortM2: number;
  areaGenerousM2: number;
  furniture: FurnitureSpec[];
  circulation: CirculationRequirement;
  solar: SolarPreference | null;
  typicalAdjacencies: string[];
  avoidAdjacencies: string[];
  requiresWindowsCount: number;
  ceilingHeightM: number;
  aliases: string[];
  sourceNorm: string;
}

export interface DoorStandard {
  kind: string;
  widthM: number;
  heightM: number;
  sourceNorm: string;
}

export interface WindowStandard {
  spaceCategory: string;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  sourceNorm: string;
}

export interface CirculationStandard {
  kind: string;
  widthMinM: number;
  widthComfortableM: number;
  rationale: string;
  sourceNorm: string;
}

// --- Mobiliario canonico NBR 15575 (footprint em metros) ---
const CAMA_CASAL: FurnitureSpec   = { name: "cama_casal",     widthM: 1.40, depthM: 1.90, quantityMin: 1, quantityTypical: 1 };
const CAMA_SOLT: FurnitureSpec    = { name: "cama_solteiro",  widthM: 0.80, depthM: 1.90, quantityMin: 2, quantityTypical: 2 };
const CRIADO: FurnitureSpec       = { name: "criado_mudo",    widthM: 0.50, depthM: 0.50, quantityMin: 1, quantityTypical: 2 };
const GR_CASAL: FurnitureSpec     = { name: "guarda_roupa",   widthM: 1.60, depthM: 0.50, quantityMin: 1, quantityTypical: 1 };
const GR_SOLT: FurnitureSpec      = { name: "guarda_roupa",   widthM: 1.50, depthM: 0.50, quantityMin: 1, quantityTypical: 1 };
const SOFA3: FurnitureSpec        = { name: "sofa_3lug",      widthM: 2.10, depthM: 0.90, quantityMin: 1, quantityTypical: 1 };
const POLTRONA: FurnitureSpec     = { name: "poltrona",       widthM: 0.85, depthM: 0.85, quantityMin: 0, quantityTypical: 2 };
const MESA_C: FurnitureSpec       = { name: "mesa_centro",    widthM: 1.20, depthM: 0.60, quantityMin: 1, quantityTypical: 1 };
const RACK: FurnitureSpec         = { name: "rack_tv",        widthM: 1.80, depthM: 0.45, quantityMin: 1, quantityTypical: 1 };
const MESA_J6: FurnitureSpec      = { name: "mesa_jantar_6",  widthM: 1.40, depthM: 0.80, quantityMin: 1, quantityTypical: 1 };
const PIA_C: FurnitureSpec        = { name: "pia_cozinha",    widthM: 1.20, depthM: 0.55, quantityMin: 1, quantityTypical: 1 };
const FOGAO: FurnitureSpec        = { name: "fogao_4b",       widthM: 0.55, depthM: 0.60, quantityMin: 1, quantityTypical: 1 };
const GELADEIRA: FurnitureSpec    = { name: "geladeira",      widthM: 0.70, depthM: 0.70, quantityMin: 1, quantityTypical: 1 };
const BANCADA: FurnitureSpec      = { name: "bancada_apoio",  widthM: 1.20, depthM: 0.55, quantityMin: 1, quantityTypical: 1 };
const VASO: FurnitureSpec         = { name: "vaso_sanitario", widthM: 0.40, depthM: 0.70, quantityMin: 1, quantityTypical: 1 };
const PIA_B: FurnitureSpec        = { name: "pia_banheiro",   widthM: 0.55, depthM: 0.45, quantityMin: 1, quantityTypical: 1 };
const BOX: FurnitureSpec          = { name: "box_ducha",      widthM: 0.90, depthM: 0.90, quantityMin: 1, quantityTypical: 1 };
const TANQUE: FurnitureSpec       = { name: "tanque",         widthM: 0.55, depthM: 0.55, quantityMin: 1, quantityTypical: 1 };
const ML: FurnitureSpec           = { name: "maquina_lavar",  widthM: 0.60, depthM: 0.65, quantityMin: 1, quantityTypical: 1 };
const MESA_T: FurnitureSpec       = { name: "mesa_escrit",    widthM: 1.20, depthM: 0.60, quantityMin: 1, quantityTypical: 1 };
const CADEIRA_E: FurnitureSpec    = { name: "cadeira_escrit", widthM: 0.60, depthM: 0.60, quantityMin: 1, quantityTypical: 1 };
const ESTANTE: FurnitureSpec      = { name: "estante",        widthM: 1.20, depthM: 0.30, quantityMin: 1, quantityTypical: 1 };
const VAGA: FurnitureSpec         = { name: "vaga_auto",      widthM: 2.40, depthM: 5.00, quantityMin: 1, quantityTypical: 1 };

// --- Preferencias de insolacao BR ---
const SOL_QUARTOS: SolarPreference  = { preferred: ["L","NL"],     acceptable: ["N"],          forbidden: ["O"],      rationale: "sol da manha favorece descanso; oeste superaquece a tarde" };
const SOL_SOCIAL: SolarPreference   = { preferred: ["N","NL","L"], acceptable: ["NO"],         forbidden: [],         rationale: "luz diurna prolongada favorece convivio" };
const SOL_COZINHA: SolarPreference  = { preferred: ["S","SE"],     acceptable: ["L","SL"],     forbidden: ["O","NO"], rationale: "evitar superaquecimento da bancada" };
const SOL_BANHEIRO: SolarPreference = { preferred: ["S","SO"],     acceptable: ["SE"],         forbidden: [],         rationale: "ventilacao para evitar umidade" };
const SOL_SERVICO: SolarPreference  = { preferred: ["S","SO","O"], acceptable: ["NO"],         forbidden: [],         rationale: "secagem natural; aceita sol forte" };
const SOL_OFFICE: SolarPreference   = { preferred: ["S","L"],      acceptable: ["N"],          forbidden: ["O"],      rationale: "luz difusa sem ofuscar tela" };
const SOL_GARAGEM: SolarPreference  = { preferred: [],             acceptable: ["S","SO","O","N","NO"], forbidden: [], rationale: "sem restricao" };

// --- Circulacoes NBR 15575 ---
const CIRC_DEFAULT: CirculationRequirement  = { aroundFurnitureM: 0.50, betweenBedsM: 0.60, inFrontOfWardrobeM: 0.60, inFrontOfToiletM: 0.40, workTriangleMaxM: 6.0 };
const CIRC_KITCHEN: CirculationRequirement  = { ...CIRC_DEFAULT, aroundFurnitureM: 0.80 };
const CIRC_BATHROOM: CirculationRequirement = { ...CIRC_DEFAULT, aroundFurnitureM: 0.40 };
const CIRC_DINING: CirculationRequirement   = { ...CIRC_DEFAULT, aroundFurnitureM: 0.75 };
const CIRC_GARAGE: CirculationRequirement   = { ...CIRC_DEFAULT, aroundFurnitureM: 0.70 };

function room(partial: Partial<RoomStandard> & { category: string; sector: Sector; areaMinM2: number; areaComfortM2: number; areaGenerousM2: number }): RoomStandard {
  return {
    furniture: [],
    circulation: CIRC_DEFAULT,
    solar: null,
    typicalAdjacencies: [],
    avoidAdjacencies: [],
    requiresWindowsCount: 1,
    ceilingHeightM: 2.50,
    aliases: [],
    sourceNorm: "NBR 15575",
    ...partial,
  };
}

export const ROOM_STANDARDS: Record<string, RoomStandard> = {
  bedroom_couple: room({
    category: "bedroom_couple", sector: "intimo",
    areaMinM2: 8.0, areaComfortM2: 11.0, areaGenerousM2: 14.0,
    furniture: [CAMA_CASAL, CRIADO, GR_CASAL], solar: SOL_QUARTOS, circulation: CIRC_DEFAULT,
    typicalAdjacencies: ["bathroom","circulation"], avoidAdjacencies: ["kitchen","service_area","garage"],
    aliases: ["quarto casal","suite","dormitorio casal","master"],
  }),
  bedroom_single: room({
    category: "bedroom_single", sector: "intimo",
    areaMinM2: 7.0, areaComfortM2: 9.0, areaGenerousM2: 12.0,
    furniture: [CAMA_SOLT, CRIADO, GR_SOLT], solar: SOL_QUARTOS, circulation: CIRC_DEFAULT,
    typicalAdjacencies: ["bathroom","circulation"], avoidAdjacencies: ["kitchen","service_area","garage"],
    aliases: ["quarto solteiro","quarto filho","quarto crianca","dormitorio solteiro"],
  }),
  bedroom: room({
    category: "bedroom", sector: "intimo",
    areaMinM2: 7.5, areaComfortM2: 10.0, areaGenerousM2: 12.0,
    furniture: [CAMA_CASAL, CRIADO, GR_CASAL], solar: SOL_QUARTOS, circulation: CIRC_DEFAULT,
    typicalAdjacencies: ["bathroom","circulation"], avoidAdjacencies: ["kitchen","service_area","garage"],
    aliases: ["quarto","dormitorio","dorm","qto"],
  }),
  master_suite: room({
    category: "master_suite", sector: "intimo",
    areaMinM2: 16.0, areaComfortM2: 22.0, areaGenerousM2: 30.0,
    furniture: [CAMA_CASAL, CRIADO, GR_CASAL, VASO, PIA_B, BOX], solar: SOL_QUARTOS,
    avoidAdjacencies: ["kitchen","service_area","garage"],
    aliases: ["suite master","suite casal"],
  }),
  bathroom: room({
    category: "bathroom", sector: "servico",
    areaMinM2: 2.4, areaComfortM2: 3.6, areaGenerousM2: 5.0,
    furniture: [VASO, PIA_B, BOX], solar: SOL_BANHEIRO, circulation: CIRC_BATHROOM,
    aliases: ["banheiro","wc","banheiro social"],
  }),
  lavabo: room({
    category: "lavabo", sector: "social",
    areaMinM2: 1.5, areaComfortM2: 2.0, areaGenerousM2: 2.5,
    furniture: [VASO, PIA_B], solar: SOL_BANHEIRO, circulation: CIRC_BATHROOM,
    requiresWindowsCount: 0,
    aliases: ["lavabo","lavabo visita"],
  }),
  living: room({
    category: "living", sector: "social",
    areaMinM2: 12.0, areaComfortM2: 18.0, areaGenerousM2: 25.0,
    furniture: [SOFA3, POLTRONA, MESA_C, RACK], solar: SOL_SOCIAL,
    typicalAdjacencies: ["dining","kitchen","circulation"],
    ceilingHeightM: 2.70,
    aliases: ["sala","sala de estar","estar","living"],
  }),
  dining: room({
    category: "dining", sector: "social",
    areaMinM2: 8.0, areaComfortM2: 12.0, areaGenerousM2: 16.0,
    furniture: [MESA_J6], solar: SOL_SOCIAL, circulation: CIRC_DINING,
    typicalAdjacencies: ["living","kitchen"],
    ceilingHeightM: 2.70,
    aliases: ["sala de jantar","jantar"],
  }),
  kitchen: room({
    category: "kitchen", sector: "servico",
    areaMinM2: 5.0, areaComfortM2: 8.0, areaGenerousM2: 12.0,
    furniture: [PIA_C, FOGAO, GELADEIRA, BANCADA], solar: SOL_COZINHA, circulation: CIRC_KITCHEN,
    typicalAdjacencies: ["dining","living","service_area"], avoidAdjacencies: ["bedroom"],
    aliases: ["cozinha","coz","copa"],
  }),
  service_area: room({
    category: "service_area", sector: "servico",
    areaMinM2: 3.0, areaComfortM2: 5.0, areaGenerousM2: 7.0,
    furniture: [TANQUE, ML], solar: SOL_SERVICO,
    typicalAdjacencies: ["kitchen","circulation"], avoidAdjacencies: ["bedroom","living"],
    aliases: ["area de servico","lavanderia","servico"],
  }),
  office: room({
    category: "office", sector: "trabalho",
    areaMinM2: 6.0, areaComfortM2: 8.0, areaGenerousM2: 12.0,
    furniture: [MESA_T, CADEIRA_E, ESTANTE], solar: SOL_OFFICE,
    avoidAdjacencies: ["service_area","kitchen"],
    aliases: ["escritorio","home office","estudio","atelie"],
  }),
  garage: room({
    category: "garage", sector: "servico",
    areaMinM2: 12.0, areaComfortM2: 18.0, areaGenerousM2: 28.0,
    furniture: [VAGA], solar: SOL_GARAGEM, circulation: CIRC_GARAGE,
    requiresWindowsCount: 0,
    aliases: ["garagem","vaga","vagas"],
  }),
  circulation: room({
    category: "circulation", sector: "circulacao",
    areaMinM2: 1.5, areaComfortM2: 2.0, areaGenerousM2: 3.0,
    requiresWindowsCount: 0,
    aliases: ["corredor","circulacao","hall","passagem"],
  }),
};

export const DOOR_STANDARDS: Record<string, DoorStandard> = {
  internal:   { kind: "internal",   widthM: 0.80, heightM: 2.10, sourceNorm: "NBR 15575" },
  external:   { kind: "external",   widthM: 0.90, heightM: 2.10, sourceNorm: "NBR 15575" },
  main:       { kind: "main",       widthM: 1.00, heightM: 2.20, sourceNorm: "NBR 15575" },
  bathroom:   { kind: "bathroom",   widthM: 0.70, heightM: 2.10, sourceNorm: "NBR 15575" },
  service:    { kind: "service",    widthM: 0.80, heightM: 2.10, sourceNorm: "NBR 15575" },
  accessible: { kind: "accessible", widthM: 0.90, heightM: 2.10, sourceNorm: "NBR 9050 - vao livre 0.80m" },
};

export const WINDOW_STANDARDS: Record<string, WindowStandard> = {
  bedroom:  { spaceCategory: "bedroom",  widthM: 1.20, heightM: 1.20, sillHeightM: 1.10, sourceNorm: "NBR 15575" },
  living:   { spaceCategory: "living",   widthM: 2.00, heightM: 1.20, sillHeightM: 0.90, sourceNorm: "NBR 15575" },
  kitchen:  { spaceCategory: "kitchen",  widthM: 1.20, heightM: 1.00, sillHeightM: 1.10, sourceNorm: "NBR 15575" },
  bathroom: { spaceCategory: "bathroom", widthM: 0.60, heightM: 0.60, sillHeightM: 1.50, sourceNorm: "NBR 15575" },
  service:  { spaceCategory: "service",  widthM: 1.00, heightM: 1.00, sillHeightM: 1.20, sourceNorm: "NBR 15575" },
  office:   { spaceCategory: "office",   widthM: 1.20, heightM: 1.20, sillHeightM: 1.00, sourceNorm: "NBR 15575" },
};

export const CIRCULATION_STANDARDS: Record<string, CirculationStandard> = {
  internal_min:     { kind: "internal_min",     widthMinM: 0.80, widthComfortableM: 0.90, rationale: "minimo NBR 15575",          sourceNorm: "NBR 15575" },
  internal_default: { kind: "internal_default", widthMinM: 0.90, widthComfortableM: 1.00, rationale: "pratica brasileira",        sourceNorm: "NBR 15575" },
  internal_comfort: { kind: "internal_comfort", widthMinM: 1.00, widthComfortableM: 1.20, rationale: "dois ocupantes cruzando",   sourceNorm: "NBR 15575" },
  accessible:       { kind: "accessible",       widthMinM: 1.20, widthComfortableM: 1.50, rationale: "cadeirante manobrando",     sourceNorm: "NBR 9050" },
};

export const CEILING_HEIGHTS = {
  residentialMin: 2.50,
  residentialDefault: 2.70,
  socialGenerous: 3.00,
};

// --- Helpers ---

/** Encontra RoomStandard pelo alias em portugues no prompt. */
export function findRoomByAlias(text: string): RoomStandard | null {
  const lower = text.toLowerCase();
  for (const room of Object.values(ROOM_STANDARDS)) {
    for (const alias of room.aliases) {
      if (lower.includes(alias)) return room;
    }
  }
  return null;
}

/** Resumo compacto da base pra injetar no system prompt do Gemini. */
export function knowledgeContextForLLM(): string {
  const rooms = Object.values(ROOM_STANDARDS).map(r =>
    `- ${r.category} (${r.sector}): min ${r.areaMinM2}m2, conforto ${r.areaComfortM2}m2, generoso ${r.areaGenerousM2}m2; ${r.furniture.length} moveis NBR; solar=${r.solar?.preferred.join("/") || "n/a"}; aliases=[${r.aliases.join(", ")}]`
  ).join("\n");
  const doors = Object.values(DOOR_STANDARDS).map(d => `${d.kind}=${d.widthM}m`).join(", ");
  const wins  = Object.values(WINDOW_STANDARDS).map(w => `${w.spaceCategory}=${w.widthM}x${w.heightM}m@${w.sillHeightM}`).join(", ");
  return `\n## BASE DE CONHECIMENTO NBR 15575 / NBR 9050\n\n### Areas por ambiente (m2):\n${rooms}\n\n### Portas: ${doors}\n### Janelas: ${wins}\n### Circulacao: corredor min 0.80m, pratico 0.90m, confortavel 1.20m, acessivel 1.50m (NBR 9050)\n### Pe-direito: 2.50m minimo, 2.70m padrao, 3.00m social generoso\n`;
}
