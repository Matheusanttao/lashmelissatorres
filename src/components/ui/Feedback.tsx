import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { friendlyError } from '@/lib/errors';

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function LoadingBlock({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="loading-block">
      <Spinner />
      <p>{text}</p>
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number | string; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-art">
        <Icon aria-hidden />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Algo não saiu como esperado' }: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="empty" role="alert">
      <div className="empty-art" style={{ color: 'var(--danger)' }}>
        <AlertCircle aria-hidden />
      </div>
      <h3>{title}</h3>
      <p>{friendlyError(error, 'Não conseguimos carregar as informações agora.')}</p>
      {onRetry && (
        <Button variant="secondary" icon={<RefreshCw />} onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

const CALLOUT_ICON = { info: Info, warning: TriangleAlert, danger: AlertCircle, success: CheckCircle2, accent: Info };

export function Callout({
  tone = 'info',
  children,
  icon,
}: {
  tone?: keyof typeof CALLOUT_ICON;
  children: ReactNode;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? CALLOUT_ICON[tone];
  return (
    <div className={`callout callout-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  );
}
