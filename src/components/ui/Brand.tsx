import { useState, type CSSProperties } from 'react';
import type { AppointmentStatus } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/format';

/** Marca delicada: pálpebra fechada com cílios. */
export function LashMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M7 22c9 9.5 25 9.5 34 0" strokeWidth="2.2" />
      <path d="M12.5 27.2 10 31.6M17.6 29.7l-1.4 4.9M24 30.6v5.2M30.4 29.7l1.4 4.9M35.5 27.2l2.5 4.4" strokeWidth="1.8" />
      <path d="M24 12.5c1.6 2.3 3.6 3.4 6 3.5-2.4.1-4.4 1.2-6 3.5-1.6-2.3-3.6-3.4-6-3.5 2.4-.1 4.4-1.2 6-3.5Z" strokeWidth="1.2" fill="currentColor" fillOpacity=".12" />
    </svg>
  );
}

export function Logo({ name, logoUrl, compact }: { name: string; logoUrl?: string | null; compact?: boolean }) {
  return (
    <span className={`logo ${compact ? 'compact' : ''}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="logo-img" />
      ) : (
        <span className="logo-mark">
          <LashMark size={28} />
        </span>
      )}
      {!compact && <span className="logo-name">{name}</span>}
    </span>
  );
}

/** Pequeno ornamento entre títulos. */
export function Ornament({ className }: { className?: string }) {
  return (
    <svg className={className} width="88" height="14" viewBox="0 0 88 14" fill="none" aria-hidden>
      <path d="M0 7h32M56 7h32" stroke="currentColor" strokeWidth="1" />
      <path d="M44 1.5c1.2 2.4 3 3.9 5.5 5.5-2.5 1.6-4.3 3.1-5.5 5.5-1.2-2.4-3-3.9-5.5-5.5 2.5-1.6 4.3-3.1 5.5-5.5Z" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

const DEMO_GRADIENTS = [
  ['#f6e4df', '#ecd2cc', '#e7c6c1'],
  ['#f4e9e1', '#ead7cb', '#dfc3b4'],
  ['#f8e8e8', '#efd4d7', '#e3bcc2'],
  ['#f5ebe4', '#efdcd6', '#e5c9c6'],
];

/**
 * Ilustração usada no lugar de fotos ainda não cadastradas.
 * Sempre acompanhada do selo "Imagem ilustrativa".
 */
export function DemoImage({ seed = 0, label = 'Imagem ilustrativa', className, style }: {
  seed?: number;
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const g = DEMO_GRADIENTS[Math.abs(seed) % DEMO_GRADIENTS.length];
  const angle = 140 + (seed % 5) * 12;
  return (
    <div
      className={['demo-img', className].filter(Boolean).join(' ')}
      style={{ background: `linear-gradient(${angle}deg, ${g[0]}, ${g[1]} 55%, ${g[2]})`, ...style }}
      role="img"
      aria-label={label ?? 'Imagem ilustrativa'}
    >
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <circle cx={seed % 2 ? 150 : 48} cy="46" r="58" fill="#fff" opacity=".28" />
        <circle cx={seed % 2 ? 40 : 160} cy="170" r="44" fill="#fff" opacity=".2" />
        <g stroke="#a86a74" strokeLinecap="round" fill="none" opacity=".55" transform="translate(0 6)">
          <path d="M52 96c26 26 70 26 96 0" strokeWidth="2" />
          {Array.from({ length: 11 }).map((_, i) => {
            const t = i / 10;
            const x = 56 + t * 88;
            const y = 96 + Math.sin(t * Math.PI) * 19.5;
            const dx = (t - 0.5) * 14;
            return <path key={i} d={`M${x} ${y} q${dx * 0.4} 8 ${dx} ${13 + Math.sin(t * Math.PI) * 5}`} strokeWidth="1.3" />;
          })}
        </g>
      </svg>
      {label && <span className="demo-img-label">{label}</span>}
    </div>
  );
}

/** Imagem com carregamento suave; mostra a ilustração se não houver foto. */
export function Photo({
  src,
  alt,
  seed,
  className,
  demoLabel,
  eager,
}: {
  src?: string | null;
  alt: string;
  seed?: number;
  className?: string;
  demoLabel?: string | null;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <DemoImage seed={seed} className={className} label={demoLabel} />;
  return (
    <img
      src={src}
      alt={alt}
      className={['photo', loaded && 'is-loaded', className].filter(Boolean).join(' ')}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`status status-${status} status-badge`}>{STATUS_LABEL[status]}</span>;
}

/** Ícone do Instagram (traço simples, no mesmo estilo dos demais ícones). */
export function InstagramIcon({ size = 24, ...rest }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
