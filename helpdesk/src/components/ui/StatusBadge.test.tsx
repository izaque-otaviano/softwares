import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STATUSES, STATUS_COLOR_KEYS } from '@/lib/status';
import type { TicketStatus } from '@/types/domain';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { StatusBadge } from './StatusBadge';
import { tokenHex } from './testTokens';

const byId = (id: string): TicketStatus => DEFAULT_STATUSES.find((s) => s.id === id)!;
const badge = (name: string) => screen.getByText(name).parentElement!;

describe('StatusBadge: nome conforme o público', () => {
  it('agent (padrão) usa agentName', () => {
    render(<StatusBadge status={byId('pending')} />);
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando resposta')).toBeNull();
  });

  it('end_user usa endUserName', () => {
    render(<StatusBadge status={byId('pending')} audience="end_user" />);
    expect(screen.getByText('Aguardando resposta')).toBeInTheDocument();
    expect(screen.queryByText('Pendente')).toBeNull();
  });

  it('label sobrescreve o nome do status', () => {
    render(<StatusBadge status={byId('open')} label="Reaberto" />);
    expect(screen.getByText('Reaberto')).toBeInTheDocument();
  });

  it('funciona só com label + color, sem status', () => {
    render(<StatusBadge label="Escalado" color="hold" />);
    expect(badge('Escalado').style.backgroundColor).toBe('var(--status-soft-hold)');
    expect(badge('Escalado').style.color).toBe('var(--status-hold)');
  });
});

describe('StatusBadge: cor por token', () => {
  it.each(STATUS_COLOR_KEYS)('pílula suave: fundo var(--status-soft-%s) e texto var(--status-%s)', (key) => {
    render(<StatusBadge label="x" color={key} />);
    expect(badge('x').style.backgroundColor).toBe(`var(--status-soft-${key})`);
    expect(badge('x').style.color).toBe(`var(--status-${key})`);
  });

  it('usa a cor do status quando color não é informado, e color tem prioridade', () => {
    const { rerender } = render(<StatusBadge status={byId('in_progress')} />);
    expect(badge('Em andamento').style.backgroundColor).toBe('var(--status-soft-hold)');
    rerender(<StatusBadge status={byId('in_progress')} color="solved" />);
    expect(badge('Em andamento').style.backgroundColor).toBe('var(--status-soft-solved)');
  });

  it('reconhece o tom forte de fábrica vindo do backend como o token correspondente', () => {
    render(<StatusBadge label="x" color="#A12620" />);
    expect(badge('x').style.backgroundColor).toBe('var(--status-soft-open)');
    expect(badge('x').style.color).toBe('var(--status-open)');
  });

  it('é 12/600 com formato de pílula, sem sombra nem gradiente', () => {
    render(<StatusBadge status={byId('open')} />);
    const el = badge('Aberto');
    expect(el).toHaveClass('text-xs', 'font-semibold', 'rounded-pill');
    expect(el.className).not.toMatch(/gradient|shadow/);
  });

  it('sem cor definida cai para o fundo neutro ink', () => {
    render(<StatusBadge label="?" />);
    expect(badge('?')).toHaveClass('bg-ink', 'text-fg-inverse');
  });
});

describe('StatusBadge: contraste AA do texto', () => {
  it.each(STATUS_COLOR_KEYS)('status.%s: texto no tom forte tem >= 4,5:1 sobre o fundo suave', (key) => {
    expect(contrastRatio(tokenHex(`status.${key}`), tokenHex(`status-soft.${key}`))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('cor personalizada em hex ganha fundo suave derivado e texto escurecido', () => {
    render(<StatusBadge label="x" color="#1B5E20" />);
    expect(badge('x').style.backgroundColor).toContain('color-mix');
    expect(badge('x').style.color).toContain('color-mix');
  });
});

describe('StatusBadge compact', () => {
  it('mostra só a inicial e expõe o nome completo', () => {
    render(<StatusBadge status={byId('solved')} compact />);
    expect(screen.getByRole('img', { name: 'Resolvido' })).toHaveTextContent('R');
  });

  it('mescla className', () => {
    render(<StatusBadge label="x" color="open" className="ml-2" />);
    expect(badge('x')).toHaveClass('ml-2');
  });
});
