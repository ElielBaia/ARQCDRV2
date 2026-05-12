/**
 * ARQCdR - Validator NBR pos-geracao
 *
 * Roda apos o Gemini gerar o PBIM. Checa areas minimas, larguras de porta,
 * pe-direito, presenca de aberturas conforme NBR 15575 / NBR 9050.
 * Emite ViolationReport - DETERMINISTICO, nao depende de LLM.
 */

import type { PBIMProject, PBIMSpace, PBIMWall, PBIMOpening } from "../pbim/schema";
import { ROOM_STANDARDS, DOOR_STANDARDS, findRoomByAlias, CEILING_HEIGHTS } from "../knowledge/nbr15575";

export type ViolationSeverity = "error" | "warning" | "info";

export interface Violation {
  severity: ViolationSeverity;
  norm: string;
  field: string;
  message: string;
  relatedId?: string;
}

export interface ValidationReport {
  status: "ok" | "warning" | "error";
  violations: Violation[];
  suggestions: string[];
  summary: {
    spaceCount: number;
    wallCount: number;
    openingCount: number;
    totalAreaM2: number;
  };
}

function polygonArea(boundary: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < boundary.length; i++) {
    const [x1, y1] = boundary[i];
    const [x2, y2] = boundary[(i + 1) % boundary.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function computeSpaceArea(space: PBIMSpace, walls: PBIMWall[]): number {
  if (space.area_actual && space.area_actual > 0) return space.area_actual;
  // tentativa fraca: usa o boundary das walls (pode falhar se nao formar poligono fechado)
  const points: Array<[number, number]> = [];
  const boundaryWalls = space.boundary_walls || [];
  for (const wallId of boundaryWalls) {
    const w = walls.find(x => x.id === wallId);
    if (w) {
      points.push([w.start[0], w.start[1]]);
    }
  }
  if (points.length < 3) return 0;
  return polygonArea(points);
}

export function validateProject(project: PBIMProject): ValidationReport {
  const violations: Violation[] = [];
  const suggestions: string[] = [];

  const spaces = project.spaces || [];
  const walls = project.walls || [];
  const openings = project.openings || [];

  let totalArea = 0;

  // 1. Checagem por space: area minima + presenca de abertura
  for (const space of spaces) {
    const area = computeSpaceArea(space, walls);
    totalArea += area;

    // Tenta achar standard pela category direta
    let standard = ROOM_STANDARDS[space.category];
    // Senao tenta por alias no name
    if (!standard) {
      const found = findRoomByAlias(space.name);
      if (found) standard = found;
    }

    if (!standard) {
      violations.push({
        severity: "info",
        norm: "ARQCdR",
        field: "space.category",
        message: `Space "${space.name}" tem categoria "${space.category}" sem standard NBR mapeado.`,
        relatedId: space.id,
      });
      continue;
    }

    // Area minima
    if (area > 0 && area < standard.areaMinM2) {
      violations.push({
        severity: "error",
        norm: standard.sourceNorm,
        field: "space.area",
        message: `"${space.name}" tem ${area.toFixed(2)}m2 - abaixo do minimo NBR (${standard.areaMinM2}m2).`,
        relatedId: space.id,
      });
      suggestions.push(`Aumentar "${space.name}" para pelo menos ${standard.areaMinM2}m2 (NBR 15575).`);
    } else if (area > 0 && area < standard.areaComfortM2) {
      violations.push({
        severity: "warning",
        norm: standard.sourceNorm,
        field: "space.area",
        message: `"${space.name}" tem ${area.toFixed(2)}m2 - abaixo do tier conforto (${standard.areaComfortM2}m2).`,
        relatedId: space.id,
      });
    }

    // Janelas exigidas
    if (standard.requiresWindowsCount > 0) {
      const wallsOfSpace = walls.filter(w => (space.boundary_walls || []).includes(w.id));
      const windowsHere = openings.filter(o =>
        o.type === "Window" && wallsOfSpace.some(w => w.id === o.wall_id)
      );
      if (windowsHere.length < standard.requiresWindowsCount) {
        violations.push({
          severity: "error",
          norm: "NBR 15575",
          field: "space.openings",
          message: `"${space.name}" exige ${standard.requiresWindowsCount} janela(s); encontradas ${windowsHere.length}.`,
          relatedId: space.id,
        });
        suggestions.push(`Adicionar ${standard.requiresWindowsCount - windowsHere.length} janela(s) em "${space.name}" para ventilacao/iluminacao natural.`);
      }
    }
  }

  // 2. Checagem por opening: largura minima conforme tipo
  for (const op of openings) {
    if (op.type === "Door") {
      if (op.width < 0.60) {
        violations.push({
          severity: "error",
          norm: "NBR 9050",
          field: "opening.width",
          message: `Porta ${op.id}: largura ${op.width}m abaixo do minimo NBR 9050 (0.60m vao livre).`,
          relatedId: op.id,
        });
      } else if (op.width < 0.80) {
        violations.push({
          severity: "warning",
          norm: "NBR 9050",
          field: "opening.width",
          message: `Porta ${op.id}: largura ${op.width}m abaixo do vao livre acessivel (0.80m).`,
          relatedId: op.id,
        });
      }
    }
    if (op.type === "Window" && op.width < 0.60) {
      violations.push({
        severity: "warning",
        norm: "NBR 15575",
        field: "opening.width",
        message: `Janela ${op.id}: largura ${op.width}m pode ser insuficiente para ventilacao.`,
        relatedId: op.id,
      });
    }
  }

  // 3. Pe-direito por level
  for (const level of project.levels || []) {
    if ((level.height || 0) < CEILING_HEIGHTS.residentialMin) {
      violations.push({
        severity: "error",
        norm: "NBR 15575",
        field: "level.height",
        message: `Nivel "${level.name}" com pe-direito ${level.height}m abaixo do minimo (${CEILING_HEIGHTS.residentialMin}m).`,
        relatedId: level.id,
      });
    }
  }

  // 4. Programa basico
  if (spaces.length === 0) {
    violations.push({ severity: "error", norm: "ARQCdR", field: "project.spaces", message: "Projeto sem nenhum space definido." });
  }
  if (walls.length === 0) {
    violations.push({ severity: "error", norm: "ARQCdR", field: "project.walls", message: "Projeto sem nenhuma wall definida." });
  }
  if (openings.length === 0 && spaces.length > 0) {
    violations.push({ severity: "warning", norm: "ARQCdR", field: "project.openings", message: "Nenhuma abertura - planta lacrada, fluxos impossiveis." });
    suggestions.push("Adicionar pelo menos uma porta principal (1.00m) e janelas por ambiente.");
  }

  const errorCount = violations.filter(v => v.severity === "error").length;
  const warnCount = violations.filter(v => v.severity === "warning").length;
  const status: ValidationReport["status"] = errorCount > 0 ? "error" : (warnCount > 0 ? "warning" : "ok");

  return {
    status,
    violations,
    suggestions: [...new Set(suggestions)],
    summary: {
      spaceCount: spaces.length,
      wallCount: walls.length,
      openingCount: openings.length,
      totalAreaM2: Math.round(totalArea * 100) / 100,
    },
  };
}
