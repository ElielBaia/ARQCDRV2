/**
 * Smoke tests do decoder ARQCdR.
 * Roda com: npm install -D vitest && npx vitest run
 */
import { describe, it, expect } from "vitest";
import { decodeBrief, detectPattern, extractProgramHints, buildInvariantSet } from "../decoder";

describe("detectPattern", () => {
  it("detecta U_patio", () => {
    expect(detectPattern("Casa com pátio central abraçado por volume em U")).toBe("U_patio");
  });
  it("detecta L", () => {
    expect(detectPattern("Implantação em L abrindo pro fundo do lote")).toBe("L");
  });
  it("detecta barra", () => {
    expect(detectPattern("Barra longitudinal alinhada à rua")).toBe("barra");
  });
  it("detecta compacto", () => {
    expect(detectPattern("Casa compacta de dois pavimentos")).toBe("compacto");
  });
  it("fallback unknown", () => {
    expect(detectPattern("Casa qualquer sem padrão claro")).toBe("unknown");
  });
});

describe("extractProgramHints", () => {
  it("conta 3 quartos", () => {
    const h = extractProgramHints("Casa com 3 quartos sala e cozinha");
    expect(h.bedroomCount).toBe(3);
  });
  it("detecta suíte", () => {
    const h = extractProgramHints("Casa com 2 quartos sendo 1 suíte");
    expect(h.hasSuite).toBe(true);
    expect(h.bedroomCount).toBe(2);
  });
  it("captura área total", () => {
    const h = extractProgramHints("Residência de 180m² em terreno arborizado");
    expect(h.totalAreaHint).toBe(180);
  });
  it("captura terreno 12x30", () => {
    const h = extractProgramHints("Terreno 12x30 com pátio");
    expect(h.lotDimensions).toEqual({ widthM: 12, depthM: 30 });
  });
  it("detecta lavabo, escritório, garagem, serviço", () => {
    const h = extractProgramHints("Casa com lavabo, home office, garagem 2 vagas e área de serviço");
    expect(h.hasLavabo).toBe(true);
    expect(h.hasOffice).toBe(true);
    expect(h.hasGarage).toBe(true);
    expect(h.hasServiceArea).toBe(true);
  });
});

describe("buildInvariantSet", () => {
  it("emite invariantes pra U_patio incluindo void central", () => {
    const set = buildInvariantSet("Casa com pátio central em U");
    expect(set.pattern).toBe("U_patio");
    const voidInv = set.invariants.find(i => i.kind === "void_placement");
    expect(voidInv).toBeDefined();
    expect(voidInv?.kind).toBe("void_placement");
  });
  it("sempre emite zoneamento social+intimo", () => {
    const set = buildInvariantSet("Casa compacta");
    const zones = set.invariants.filter(i => i.kind === "zone_placement");
    expect(zones.length).toBeGreaterThanOrEqual(2);
  });
  it("sempre emite orientação solar pra quartos", () => {
    const set = buildInvariantSet("Casa simples");
    const orientations = set.invariants.filter(i => i.kind === "orientation");
    expect(orientations.some(o => o.kind === "orientation" && o.appliesTo === "bedroom")).toBe(true);
  });
});

describe("decodeBrief integração", () => {
  it("prompt rico produz partido + programa + narrativa", () => {
    const decoded = decodeBrief("Casa unifamiliar de 180m² em terreno 12×30, 3 quartos sendo 1 suíte, sala, cozinha integrada, lavabo, garagem 2 vagas e pátio central em U");
    expect(decoded.pattern).toBe("U_patio");
    expect(decoded.programHint.bedroomCount).toBe(3);
    expect(decoded.programHint.hasSuite).toBe(true);
    expect(decoded.programHint.hasLavabo).toBe(true);
    expect(decoded.programHint.hasGarage).toBe(true);
    expect(decoded.programHint.totalAreaHint).toBe(180);
    expect(decoded.programHint.lotDimensions).toEqual({ widthM: 12, depthM: 30 });
    expect(decoded.partiNarrative.length).toBeGreaterThan(20);
  });
});
