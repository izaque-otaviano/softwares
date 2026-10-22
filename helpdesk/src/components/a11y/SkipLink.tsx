export const MAIN_ID = 'conteudo';

/** Primeiro item da ordem de tabulação: leva o foco direto ao `<main id="conteudo">`. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById(MAIN_ID);
        main?.focus();
        main?.scrollIntoView?.({ block: 'start' });
      }}
      className="sr-only rounded bg-surface px-3 py-2 text-sm text-action shadow-pop focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:shadow-focus focus:outline-none"
    >
      Ir para o conteúdo
    </a>
  );
}
