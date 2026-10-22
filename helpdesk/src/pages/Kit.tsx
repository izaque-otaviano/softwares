import { KitShell } from './kit/KitShell';
import { SecaoBotoes } from './kit/SecaoBotoes';
import { SecaoCampos } from './kit/SecaoCampos';
import { SecaoSobreposicoes } from './kit/SecaoSobreposicoes';
import { SecaoStatus } from './kit/SecaoStatus';
import { SecaoTabela } from './kit/SecaoTabela';
import { SecaoTokens } from './kit/SecaoTokens';
import { SecaoVazios } from './kit/SecaoVazios';

/** Catálogo vivo dos componentes e tokens do Helpdesk (rota /kit). Dados fictícios locais, sem backend. */
export default function Kit() {
  return (
    <KitShell>
      <header className="border-b border-line pb-8">
        <h1 className="text-2xl font-normal text-fg">Kit de componentes</h1>
        <p className="mt-2 max-w-3xl text-sm text-fg-muted">
          Catálogo vivo da fase 1: cada componente em todos os estados relevantes, usando o próprio kit. Tudo é interativo e usa só os
          tokens do Tailwind. Teste também com o teclado: Tab, Enter, Esc e setas.
        </p>
      </header>
      <SecaoTokens />
      <SecaoBotoes />
      <SecaoCampos />
      <SecaoStatus />
      <SecaoSobreposicoes />
      <SecaoTabela />
      <SecaoVazios />
    </KitShell>
  );
}
