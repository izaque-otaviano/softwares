import { describe, expect, it } from "vitest";
import { nearestWeight, googleCssUrl } from "./fontLoader";
import { formatBytes, weightName } from "./utils";
import { phaseLabel } from "../components/phaseLabel";

describe("fontLoader", () => {
  it("escolhe o peso real mais próximo", () => {
    expect(nearestWeight([300, 400, 700], 500)).toBe(400);
    expect(nearestWeight([300, 400, 700], 600)).toBe(700);
    expect(nearestWeight([], 500)).toBe(500);
  });
  it("monta a URL css2 do Google", () => {
    expect(googleCssUrl("Open Sans", 700, false)).toBe("https://fonts.googleapis.com/css2?family=Open+Sans:wght@700&display=swap");
    expect(googleCssUrl("Lora", 400, true)).toBe("https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,400&display=swap");
    expect(googleCssUrl("Inter", 400, false, [100, 900])).toContain("wght@100..900");
  });
});

describe("utils", () => {
  it("formata", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(weightName(700)).toBe("Bold");
    expect(weightName(450)).toBe("450");
  });
});

describe("estados reais de ativação", () => {
  it("rótulos exigidos pela especificação", () => {
    expect(phaseLabel({ phase: "downloading", done: 1, total: 4 })).toBe("Baixando… 1/4");
    expect(phaseLabel({ phase: "registering" })).toBe("Registrando…");
    expect(phaseLabel({ phase: "active_in_system" })).toBe("Ativada no sistema");
    expect(phaseLabel({ phase: "waiting_app" })).toBe("Aguardando atualização do aplicativo");
    expect(phaseLabel({ phase: "error" })).toBe("Erro ao ativar");
  });
});
