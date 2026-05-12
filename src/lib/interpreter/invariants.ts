/**
 * ARQCdR - Invariantes Arquitetonicas (PR-INT v0)
 *
 * Um InvariantSet eh a traducao do partido em restricoes executaveis.
 * O decoder emite invariantes a partir do prompt; o validator checa o output.
 */

import type { Face, Sector } from "../knowledge/nbr15575";

export type DeploymentPattern = "compacto" | "L" | "U_patio" | "barra" | "unknown";
export type InvariantStrength = "hard" | "soft";

export interface ZonePlacement {
  kind: "zone_placement";
  id: string;
  sector: Sector;
  region: "frontal" | "central" | "fundos" | "lateral_esq" | "lateral_dir";
  axis: "x" | "y";
  fraction: [number, number]; // [min, max] no eixo
  strength: InvariantStrength;
  weight: number;
  rationale: string;
}

export interface OrientationConstraint {
  kind: "orientation";
  id: string;
  appliesTo: string; // categoria do space
  preferred: Face[];
  forbidden: Face[];
  strength: InvariantStrength;
  weight: number;
  rationale: string;
}

export interface VoidPlacement {
  kind: "void_placement";
  id: string;
  areaMinM2: number;
  aspectRatioMax: number;
  centroidHint: "centro" | "lateral" | "fundo";
  strength: InvariantStrength;
  weight: number;
  rationale: string;
}

export interface AxisPlacement {
  kind: "axis_placement";
  id: string;
  direction: "longitudinal" | "transversal";
  widthM: number;
  strength: InvariantStrength;
  weight: number;
  rationale: string;
}

export interface ProportionConstraint {
  kind: "proportion";
  id: string;
  aspectRatioMin: number;
  aspectRatioMax: number;
  strength: InvariantStrength;
  weight: number;
  rationale: string;
}

export type Invariant =
  | ZonePlacement
  | OrientationConstraint
  | VoidPlacement
  | AxisPlacement
  | ProportionConstraint;

export interface InvariantSet {
  invariants: Invariant[];
  pattern: DeploymentPattern;
  partiNarrative: string;
  version: number;
}

let _idCounter = 0;
export function nextId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}_${_idCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
