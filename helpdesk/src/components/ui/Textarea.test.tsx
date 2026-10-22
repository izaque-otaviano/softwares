import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usa minRows como número de linhas e aceita digitação', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Descrição" minRows={4} />);
    const textarea = screen.getByRole('textbox', { name: 'Descrição' });
    expect(textarea).toHaveAttribute('rows', '4');
    await user.type(textarea, 'olá');
    expect(textarea).toHaveValue('olá');
  });

  it('invalid marca aria-invalid; ref é encaminhada', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="Descrição" invalid />);
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Descrição' }));
    expect(ref.current).toHaveAttribute('aria-invalid', 'true');
    expect(ref.current).toHaveClass('border-danger');
  });

  it('autoGrow ajusta a altura ao conteúdo ao digitar', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(96);
    function Controlled() {
      const [text, setText] = useState('');
      return <Textarea aria-label="Mensagem" autoGrow value={text} onChange={(e) => setText(e.target.value)} />;
    }
    render(<Controlled />);
    const textarea = screen.getByRole('textbox', { name: 'Mensagem' });
    expect(textarea).toHaveClass('resize-none');
    await user.type(textarea, 'a');
    expect(textarea.style.height).toBe('96px');
  });

  it('sem autoGrow não mexe na altura', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(96);
    render(<Textarea aria-label="Mensagem" />);
    const textarea = screen.getByRole('textbox', { name: 'Mensagem' });
    await user.type(textarea, 'a');
    expect(textarea.style.height).toBe('');
  });
});
