import { useState } from "react";
import { useToasts } from "@/store/toasts";

const RANGES: [string, number, number][] = [
  ["Maiúsculas", 0x41, 0x5a], ["Minúsculas", 0x61, 0x7a], ["Números", 0x30, 0x39],
  ["Pontuação e símbolos", 0x21, 0x2f], ["Latin-1 (acentos)", 0xc0, 0xff], ["Pontuação geral", 0x2013, 0x2026],
  ["Latin Estendido-A", 0x100, 0x17f], ["Moeda e setas", 0x20a0, 0x20bf],
];

export function CharGrid({ fontStyle }: { fontStyle: React.CSSProperties }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-label-2">
        Mostra os caracteres como o navegador os desenha com esta fonte; glifos ausentes aparecem na fonte substituta. Clique para copiar.
      </p>
      {RANGES.map(([name, a, b]) => (
        <section key={name} aria-label={name}>
          <h4 className="mb-1 text-[11px] font-semibold text-label-2">{name}{hover !== null && hover >= a && hover <= b && ` — U+${hover.toString(16).toUpperCase().padStart(4, "0")}`}</h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1">
            {Array.from({ length: b - a + 1 }, (_, i) => a + i).filter((c) => !(c >= 0x7f && c < 0xa0)).map((c) => (
              <button
                key={c}
                className="aspect-square rounded-[6px] text-lg hover:bg-fill-2"
                style={fontStyle}
                aria-label={`Caractere ${String.fromCodePoint(c)} U+${c.toString(16).toUpperCase()}`}
                onMouseEnter={() => setHover(c)}
                onClick={() => {
                  navigator.clipboard?.writeText(String.fromCodePoint(c));
                  useToasts.getState().push({ tone: "info", text: `Copiado: ${String.fromCodePoint(c)}` }, 1500);
                }}
              >
                {String.fromCodePoint(c)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
