import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { IconButton, Modal } from '@/components/ui';
import { keepFocusIfPlaced } from '@/components/ui/focusUtils';
import { PropertiesAside } from '@/components/people/ProfileParts';
import { SkipLink } from './SkipLink';
import { routeTitle } from './routeTitle';

describe('routeTitle', () => {
  it.each([
    ['/agent/home', '', 'Início · Helpdesk'],
    ['/agent/views', '', 'Visualizações · Helpdesk'],
    ['/agent/tickets/new', '', 'Novo ticket · Helpdesk'],
    ['/agent/customers', '', 'Clientes · Helpdesk'],
    ['/agent/orgs/o1', '', 'Organização · Helpdesk'],
    ['/agent/search', '?q=carlos', 'Pesquisar carlos · Helpdesk'],
    ['/admin', '', 'Administração · Helpdesk'],
    ['/admin/statuses', '', 'Status de ticket · Administração · Helpdesk'],
    ['/admin/triggers/t1', '', 'Editar gatilho · Administração · Helpdesk'],
    ['/kit', '', 'Kit de componentes · Helpdesk'],
    ['/nada/aqui', '', 'Página não encontrada · Helpdesk'],
    ['/agent/xyz', '', 'Página não encontrada · Helpdesk'],
  ])('%s%s', (path, search, esperado) => {
    expect(routeTitle(path, search)).toBe(esperado);
  });
});

describe('SkipLink', () => {
  it('Enter leva o foco ao <main id="conteudo">', async () => {
    render(
      <>
        <SkipLink />
        <main id="conteudo" tabIndex={-1}>
          conteúdo
        </main>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Ir para o conteúdo' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('foco ao fechar', () => {
  it('popover com keepFocusIfPlaced devolve o foco ao gatilho no Esc', async () => {
    render(
      <Popover.Root>
        <Popover.Trigger>Abrir</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content aria-label="Opções" onCloseAutoFocus={keepFocusIfPlaced}>
            <button type="button">Dentro</button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByRole('dialog', { name: 'Opções' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus());
  });

  it('um único Esc fecha o modal mesmo com foco num IconButton (tooltip aberto)', async () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir modal
          </button>
          <Modal open={open} onOpenChange={setOpen} title="Teste">
            <IconButton label="Ação" icon={<span>x</span>} />
          </Modal>
        </>
      );
    }
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));
    const acao = await screen.findByRole('button', { name: 'Ação' });
    acao.focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Abrir modal' })).toHaveFocus();
  });

  it('PropertiesAside: o foco não se perde quando o rodapé some', async () => {
    function Demo() {
      const [dirty, setDirty] = useState(true);
      return (
        <PropertiesAside label="Propriedades" footer={dirty ? <button onClick={() => setDirty(false)}>Descartar</button> : undefined}>
          <input aria-label="Nome" />
        </PropertiesAside>
      );
    }
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
  });
});
