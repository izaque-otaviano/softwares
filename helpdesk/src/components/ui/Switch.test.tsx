import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

function Harness() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onCheckedChange={setOn} label="Ativo" />;
}

describe('Switch', () => {
  it('expõe role=switch com nome do rótulo e alterna por clique', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: 'Ativo' });
    expect(sw).not.toBeChecked();
    await user.click(sw);
    expect(sw).toBeChecked();
    await user.click(screen.getByText('Ativo'));
    expect(sw).not.toBeChecked();
  });

  it('alterna com Espaço depois de Tab', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Notificações" />);
    await user.tab();
    expect(screen.getByRole('switch', { name: 'Notificações' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('disabled não alterna', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Bloqueado" disabled />);
    const sw = screen.getByRole('switch', { name: 'Bloqueado' });
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
