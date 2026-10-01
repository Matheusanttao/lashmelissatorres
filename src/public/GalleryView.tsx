import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { GalleryCategory, PublicGalleryItem } from '@/lib/types';
import { DemoImage } from '@/components/ui/Brand';
import { IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Field';

export function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="ba" style={{ '--pos': `${pos}%` } as React.CSSProperties}>
      <img src={before} alt={`${alt} — antes`} />
      <img src={after} alt={`${alt} — depois`} className="ba-after" />
      <span className="ba-label before">Antes</span>
      <span className="ba-label after">Depois</span>
      <span className="ba-handle" aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Arraste para comparar antes e depois"
      />
    </div>
  );
}

export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
  categories,
}: {
  items: PublicGalleryItem[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  categories: GalleryCategory[];
}) {
  const item = items[index];
  const [mode, setMode] = useState<'depois' | 'comparar'>('depois');
  const go = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    setMode(item?.before_image_url ? 'comparar' : 'depois');
  }, [item?.id, item?.before_image_url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [go, onClose]);

  // Deslizar para os lados no celular.
  const [touchX, setTouchX] = useState<number | null>(null);

  if (!item) return null;
  const cat = categories.find((c) => c.id === item.category_id);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <div className="lightbox-top">
        <span className="small" style={{ opacity: 0.8 }}>
          {index + 1} de {items.length}
        </span>
        {item.before_image_url && (
          <Segmented
            label="Modo de visualização"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'comparar', label: 'Antes e depois' },
              { value: 'depois', label: 'Resultado' },
            ]}
          />
        )}
        <IconButton label="Fechar" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div
        className="lightbox-stage"
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX == null || mode === 'comparar') return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          setTouchX(null);
        }}
      >
        {mode === 'comparar' && item.before_image_url ? (
          <BeforeAfter before={item.before_image_url} after={item.image_url} alt={item.title ?? 'Trabalho'} />
        ) : (
          <img src={item.image_url} alt={item.title ?? 'Trabalho realizado'} />
        )}
        {items.length > 1 && (
          <>
            <button type="button" className="lightbox-nav prev" onClick={() => go(-1)} aria-label="Foto anterior">
              <ChevronLeft />
            </button>
            <button type="button" className="lightbox-nav next" onClick={() => go(1)} aria-label="Próxima foto">
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      {(item.title || item.description || cat) && (
        <div className="lightbox-caption">
          {item.title && <h3>{item.title}</h3>}
          <p>{[cat?.name, item.description].filter(Boolean).join(' · ')}</p>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function GalleryGrid({
  items,
  categories,
  preview,
}: {
  items: PublicGalleryItem[];
  categories: GalleryCategory[];
  preview?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={`gallery-grid ${preview ? 'preview' : ''}`}>
        {items.map((it, i) => {
          const cat = categories.find((c) => c.id === it.category_id);
          return (
            <button
              key={it.id}
              type="button"
              className="gallery-tile reveal"
              style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              onClick={() => setOpen(i)}
              aria-label={`Ampliar ${it.title ?? 'foto'}`}
            >
              {it.before_image_url && <span className="ba-flag">Antes e depois</span>}
              <img src={it.image_url} alt={it.title ?? 'Trabalho realizado'} loading="lazy" decoding="async" />
              <span className="gallery-tile-info">
                <strong>{it.title ?? cat?.name ?? 'Trabalho'}</strong>
                {it.title && cat && <span className="tiny">{cat.name}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {open != null && (
        <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} categories={categories} />
      )}
    </>
  );
}

const DEMO_TILES = [
  { title: 'Fio a fio', ratio: '4 / 5' },
  { title: 'Volume brasileiro', ratio: '1 / 1' },
  { title: 'Efeito molhado', ratio: '4 / 5.6' },
  { title: 'Volume russo', ratio: '4 / 4.6' },
  { title: 'Fio a fio', ratio: '4 / 5.4' },
  { title: 'Volume brasileiro', ratio: '4 / 4.2' },
];

/** Galeria ilustrativa, exibida apenas enquanto não há fotos publicadas. */
export function DemoGallery({ count = 6, preview }: { count?: number; preview?: boolean }) {
  return (
    <div className={`gallery-grid ${preview ? 'preview' : ''}`}>
      {DEMO_TILES.slice(0, count).map((t, i) => (
        <div key={i} className="gallery-tile reveal" style={{ '--ratio': t.ratio, cursor: 'default', animationDelay: `${i * 50}ms` } as React.CSSProperties}>
          <DemoImage seed={i + 2} label="Exemplo" />
          <span className="gallery-tile-info" style={{ opacity: 1, transform: 'none' }}>
            <strong>{t.title}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}
