/**
 * ARQCdR - Decoder de Partido Arquitetonico
 *
 * Detecta 4 padroes canonicos brasileiros a partir do prompt do usuario:
 *  - compacto: bloco unico, padrao residencial simples
 *  - L: dois bracos ortogonais, social na frente, intimo no fundo
 *  - U_patio: tres bracos abracando vazio central
 *  - barra: linear longitudinal, alinhado a frente do lote
 *
 * A partir do padrao detectado, emite o InvariantSet inicial com defaults BR
 * (zoneamento, orientacao, vazio, proporcao).
 */

import {
  DeploymentPattern,
  Invariant,
  InvariantSet,
  nextId,
} from "./invariants";

interface ProgramHint {
  bedroomCount: number;
  hasSuite: boolean;
  hasLavabo: boolean;
  hasOffice: boolean;
  hasGarage: boolean;
  hasServiceArea: boolean;
  totalAreaHint: number | null;
  lotDimensions: { widthM: number; depthM: number } | null;
}

export interface DecodedBrief {
  pattern: DeploymentPattern;
  invariants: Invariant[];
  partiNarrative: string;
  programHint: ProgramHint;
}

const PATTERN_KEYWORDS: Record<DeploymentPattern, string[]> = {
  compacto: ["compacto", "compacta", "bloco unico", "bloco único", "monolitico", "monolítico", "cubico", "cúbico"],
  L: ["em l", "em \"l\"", "formato l", "planta em l", "implantacao em l", "implantação em l", "abraçando o fundo", "abracando o fundo"],
  U_patio: ["em u", "em \"u\"", "patio central", "pátio central", "patio interno", "pátio interno", "voltado pro patio", "abracando o vazio", "abraçando o vazio", "abracando o patio", "u abraçando", "u abracando"],
  barra: ["barra", "longitudinal", "alinhad", "linear ao longo", "fita", "extens"],
  unknown: [],
};

export function detectPattern(prompt: string): DeploymentPattern {
  const text = prompt.toLowerCase();
  // Ordem importa - patterns mais especificos primeiro
  for (const pattern of ["U_patio", "L", "barra", "compacto"] as DeploymentPattern[]) {
    for (const kw of PATTERN_KEYWORDS[pattern]) {
      if (text.includes(kw)) return pattern;
    }
  }
  return "unknown";
}

const NUM_WORDS: Record<string, number> = {
  "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "três": 3,
  "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8,
};

function extractCount(text: string, keywords: string[]): number {
  for (const kw of keywords) {
    // numero antes da palavra
    const re = new RegExp(`(\\d+|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito)\\s+${kw}`, "i");
    const m = text.match(re);
    if (m) {
      const val = m[1].toLowerCase();
      return NUM_WORDS[val] ?? parseInt(val, 10);
    }
    // palavra solta (1 implicito)
    if (text.includes(kw)) return 1;
  }
  return 0;
}

export function extractProgramHints(prompt: string): ProgramHint {
  const text = prompt.toLowerCase();
  const bedroomCount = extractCount(text, ["quartos", "quarto", "dormitorios", "dormitórios", "dormitorio", "dormitório", "dorms"]);
  const hasSuite = /\bsu[íi]tes?\b/i.test(prompt);
  const hasLavabo = /\blavabo\b/i.test(prompt);
  const hasOffice = /\b(escrit[óo]rio|home\s*office|est[úu]dio|ateli[êe])\b/i.test(prompt);
  const hasGarage = /\bgaragem|vagas?\b/i.test(prompt);
  const hasServiceArea = /\b(area de servi[çc]o|lavanderia|servi[çc]o)\b/i.test(prompt);

  // Area total
  let totalAreaHint: number | null = null;
  const areaMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  if (areaMatch) totalAreaHint = parseFloat(areaMatch[1].replace(",", "."));

  // Lote (12x30, lote 12 x 30, etc)
  let lotDimensions: { widthM: number; depthM: number } | null = null;
  const lotMatch = prompt.match(/(?:terreno|lote|implanta[çc][ãa]o)?\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m?/i);
  if (lotMatch) {
    lotDimensions = {
      widthM: parseFloat(lotMatch[1].replace(",", ".")),
      depthM: parseFloat(lotMatch[2].replace(",", ".")),
    };
  }

  return { bedroomCount, hasSuite, hasLavabo, hasOffice, hasGarage, hasServiceArea, totalAreaHint, lotDimensions };
}

function defaultBrInvariants(pattern: DeploymentPattern): Invariant[] {
  const inv: Invariant[] = [];

  // Zoneamento BR padrao: social frontal, intimo fundos
  inv.push({
    kind: "zone_placement", id: nextId("zone"),
    sector: "social", region: "frontal", axis: "y", fraction: [0.0, 0.5],
    strength: "soft", weight: 1.0,
    rationale: "convencao residencial BR: social na frente do lote",
  });
  inv.push({
    kind: "zone_placement", id: nextId("zone"),
    sector: "intimo", region: "fundos", axis: "y", fraction: [0.5, 1.0],
    strength: "soft", weight: 1.0,
    rationale: "convencao residencial BR: intimo nos fundos, mais resguardado",
  });

  // Orientacao solar BR
  inv.push({
    kind: "orientation", id: nextId("orient"),
    appliesTo: "bedroom", preferred: ["L", "NL", "N"], forbidden: ["O"],
    strength: "soft", weight: 1.0,
    rationale: "quartos preferem sol da manha (L/NL); evitam oeste (superaquece a tarde)",
  });
  inv.push({
    kind: "orientation", id: nextId("orient"),
    appliesTo: "service_area", preferred: ["S", "SO", "O"], forbidden: [],
    strength: "soft", weight: 0.7,
    rationale: "area de servico aceita sol forte (secagem natural)",
  });

  // Padrao especifico
  if (pattern === "U_patio") {
    inv.push({
      kind: "void_placement", id: nextId("void"),
      areaMinM2: 25.0, aspectRatioMax: 1.8, centroidHint: "centro",
      strength: "hard", weight: 2.0,
      rationale: "padrao U: patio central com area minima para iluminar/ventilar os 3 bracos",
    });
    inv.push({
      kind: "axis_placement", id: nextId("axis"),
      direction: "longitudinal", widthM: 1.20,
      strength: "soft", weight: 1.0,
      rationale: "eixo de circulacao abracando o patio",
    });
  } else if (pattern === "L") {
    inv.push({
      kind: "proportion", id: nextId("prop"),
      aspectRatioMin: 1.2, aspectRatioMax: 2.5,
      strength: "soft", weight: 1.0,
      rationale: "L exige dois bracos ortogonais com proporcao bem definida",
    });
  } else if (pattern === "barra") {
    inv.push({
      kind: "proportion", id: nextId("prop"),
      aspectRatioMin: 2.0, aspectRatioMax: 4.0,
      strength: "soft", weight: 1.0,
      rationale: "barra: longitudinal, frente alinhada a rua",
    });
    inv.push({
      kind: "axis_placement", id: nextId("axis"),
      direction: "longitudinal", widthM: 0.90,
      strength: "soft", weight: 1.0,
      rationale: "circulacao linear paralela a frente",
    });
  } else {
    // compacto / unknown
    inv.push({
      kind: "proportion", id: nextId("prop"),
      aspectRatioMin: 0.8, aspectRatioMax: 1.4,
      strength: "soft", weight: 0.5,
      rationale: "bloco compacto: proporcao proxima a quadrada",
    });
  }

  return inv;
}

function buildNarrative(pattern: DeploymentPattern, hints: ProgramHint): string {
  const programParts: string[] = [];
  if (hints.bedroomCount > 0) programParts.push(`${hints.bedroomCount} quarto${hints.bedroomCount > 1 ? "s" : ""}`);
  if (hints.hasSuite) programParts.push("suite");
  if (hints.hasLavabo) programParts.push("lavabo");
  if (hints.hasOffice) programParts.push("escritorio");
  if (hints.hasGarage) programParts.push("garagem");
  if (hints.hasServiceArea) programParts.push("area de servico");

  const patternLabel: Record<DeploymentPattern, string> = {
    compacto: "compacto",
    L: "em L abracando o fundo",
    U_patio: "em U abracando patio central",
    barra: "barra longitudinal alinhada a frente",
    unknown: "compacto (fallback)",
  };

  let narrative = `Partido detectado: ${patternLabel[pattern]}.`;
  if (programParts.length) narrative += ` Programa: ${programParts.join(", ")}.`;
  if (hints.lotDimensions) narrative += ` Lote: ${hints.lotDimensions.widthM}m x ${hints.lotDimensions.depthM}m.`;
  if (hints.totalAreaHint) narrative += ` Area alvo: ~${hints.totalAreaHint}m2.`;
  if (pattern === "unknown") {
    narrative += " Padrao nao reconhecido explicitamente - aplicando compacto como fallback gracioso.";
  }
  return narrative;
}

export function decodeBrief(prompt: string): DecodedBrief {
  const pattern = detectPattern(prompt);
  const programHint = extractProgramHints(prompt);
  const invariants = defaultBrInvariants(pattern === "unknown" ? "compacto" : pattern);
  const partiNarrative = buildNarrative(pattern, programHint);
  return { pattern, invariants, partiNarrative, programHint };
}

export function buildInvariantSet(prompt: string): InvariantSet {
  const decoded = decodeBrief(prompt);
  return {
    invariants: decoded.invariants,
    pattern: decoded.pattern,
    partiNarrative: decoded.partiNarrative,
    version: 1,
  };
}
