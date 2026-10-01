import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="container" style={{ padding: '64px 0' }}>
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        text="O endereço pode ter mudado. Que tal voltar para o início?"
        action={<ButtonLink to="/">Ir para o início</ButtonLink>}
      />
    </div>
  );
}
