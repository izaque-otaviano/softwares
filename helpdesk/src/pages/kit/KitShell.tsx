import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SECOES, type SecaoId } from './dados';

/** Distância do topo da janela a partir da qual uma seção já conta como "atual" (barra de 48 px + folga). */
const LIMIAR_TOPO = 72;

/**
 * Seção "atual": o IntersectionObserver avisa quais seções cruzam a faixa superior da janela e, entre elas, vale a
 * última que já passou do limiar do topo. Assim, ao saltar para uma âncora (seção encostada na barra), a seção
 * anterior, que apenas encosta na faixa, não ganha o destaque. No fim da página, onde a última seção pode não
 * alcançar a faixa, ela vira a atual.
 */
function useSecaoAtiva(): [SecaoId, (id: SecaoId) => void] {
  const [ativa, setAtiva] = useState<SecaoId>(SECOES[0].id);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const visiveis = new Set<string>();
    const escolher = () => {
      const candidatas = SECOES.filter((secao) => visiveis.has(secao.id));
      const passadas = candidatas.filter((secao) => {
        const elemento = document.getElementById(secao.id);
        return elemento !== null && elemento.getBoundingClientRect().top <= LIMIAR_TOPO;
      });
      const escolhida = passadas.at(-1) ?? candidatas[0];
      if (escolhida) setAtiva(escolhida.id);
    };

    const observer = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) visiveis.add(entrada.target.id);
          else visiveis.delete(entrada.target.id);
        }
        escolher();
      },
      // Faixa entre a barra superior (48 px + folga) e 35% da altura da janela.
      { rootMargin: '-64px 0px -65% 0px' },
    );

    for (const secao of SECOES) {
      const elemento = document.getElementById(secao.id);
      if (elemento) observer.observe(elemento);
    }

    const noFim = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        setAtiva(SECOES[SECOES.length - 1].id);
      }
    };
    window.addEventListener('scroll', noFim, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', noFim);
    };
  }, []);

  return [ativa, setAtiva];
}

/** Casca própria da página /kit: barra superior, navegação por âncoras à esquerda e conteúdo. */
export function KitShell({ children }: { children: ReactNode }) {
  const [ativa, setAtiva] = useSecaoAtiva();

  return (
    <div className="min-h-screen bg-surface text-sm text-fg">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Ir para o conteúdo
      </a>

      <header className="sticky top-0 z-30 flex h-topbar items-center gap-3 border-b border-line bg-surface-1 px-4">
        <span aria-hidden className="h-5 w-5 shrink-0 rounded bg-ink" />
        <p className="text-sm font-semibold">Helpdesk · Kit de componentes</p>
      </header>

      <div className="flex">
        <nav aria-label="Seções do kit" className="w-60 shrink-0 border-r border-line bg-surface-1">
          <div className="sticky top-topbar p-3">
            <p className="px-2 pb-2 pt-1 text-xs font-semibold text-fg-muted">Seções</p>
            <ul className="flex flex-col gap-0.5">
              {SECOES.map((secao, indice) => {
                const atual = secao.id === ativa;
                return (
                  <li key={secao.id}>
                    <a
                      href={`#${secao.id}`}
                      aria-current={atual ? 'location' : undefined}
                      onClick={() => setAtiva(secao.id)}
                      className={cn(
                        'flex h-8 items-center gap-2 rounded px-2 text-sm outline-none transition-colors duration-100 focus-visible:shadow-focus',
                        atual ? 'bg-ink-active text-fg-inverse' : 'text-fg hover:bg-hover',
                      )}
                    >
                      <span className={cn('w-4 shrink-0 text-xs', atual ? 'text-fg-inverse' : 'text-fg-muted')}>{indice + 1}</span>
                      <span className="truncate">{secao.titulo}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
