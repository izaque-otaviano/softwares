import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Banner } from '@/components/ui';

interface Props {
  children: ReactNode;
  /** Muda quando o usuário navega: limpa o erro para a nova tela tentar de novo. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Rede de segurança: um erro de renderização vira mensagem com "Recarregar" em vez de tela branca. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro de renderização:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6">
        <Banner tone="error" title="Algo deu errado nesta tela" retryLabel="Recarregar" onRetry={() => window.location.reload()}>
          Não foi possível exibir esta página. Seu trabalho em outras abas continua guardado até você recarregar.
        </Banner>
      </div>
    );
  }
}
