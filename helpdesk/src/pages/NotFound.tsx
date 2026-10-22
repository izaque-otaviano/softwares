import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <EmptyState
        illustration="search"
        title="Nada aqui."
        description="A página que você está procurando não existe ou você não tem acesso a ela."
        action={<Button onClick={() => navigate('/agent/home')}>Ir para o início</Button>}
      />
    </div>
  );
}
