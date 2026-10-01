import { useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import { usePublicGallery } from '@/hooks/usePublicData';
import { useSiteContent } from '@/hooks/useSiteContent';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Ornament } from '@/components/ui/Brand';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { DemoGallery, GalleryGrid } from '../GalleryView';

export default function GalleryPage() {
  const { data, isLoading, error, refetch } = usePublicGallery();
  const { isDemo } = useSiteContent();
  const [cat, setCat] = useState<string>('all');
  const [onlyBA, setOnlyBA] = useState(false);

  const items = data?.items ?? [];
  const categories = useMemo(
    () => (data?.categories ?? []).filter((c) => items.some((i) => i.category_id === c.id)),
    [data, items],
  );
  const filtered = items.filter(
    (i) => (cat === 'all' || i.category_id === cat) && (!onlyBA || i.before_image_url),
  );
  const hasBA = items.some((i) => i.before_image_url);
  const showDemo = !isLoading && !items.length && (isDemo || !isSupabaseConfigured);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Galeria</span>
          <h1>
            Trabalhos <em className="script">realizados</em>
          </h1>
          <Ornament className="ornament" />
          <p>Resultados reais de clientes e modelos que autorizaram o uso das imagens. Toque em uma foto para ampliar.</p>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 12 }}>
        <div className="container">
          {items.length > 0 && (categories.length > 1 || hasBA) && (
            <div className="chips" style={{ justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
              <button type="button" className="chip" aria-pressed={cat === 'all' && !onlyBA} onClick={() => { setCat('all'); setOnlyBA(false); }}>
                Todos
              </button>
              {categories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.name}
                </button>
              ))}
              {hasBA && (
                <button type="button" className="chip" aria-pressed={onlyBA} onClick={() => setOnlyBA((v) => !v)}>
                  Antes e depois
                </button>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="gallery-grid">
              {[320, 240, 360, 280, 300, 260].map((h, i) => <Skeleton key={i} h={h} r={16} />)}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : showDemo ? (
            <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
              <Callout tone="warning">
                <strong>Galeria de exemplo.</strong> As fotos reais aparecem aqui assim que o estúdio publicar os trabalhos.
              </Callout>
              <DemoGallery />
            </div>
          ) : !filtered.length ? (
            <EmptyState
              icon={Images}
              title={items.length ? 'Nenhuma foto neste filtro' : 'Novos trabalhos em breve'}
              text={items.length ? 'Experimente outra técnica.' : 'Estamos preparando uma seleção especial de resultados.'}
              action={<ButtonLink to="/agendar" variant="secondary">Agendar meu horário</ButtonLink>}
            />
          ) : (
            <GalleryGrid key={cat + String(onlyBA)} items={filtered} categories={data?.categories ?? []} />
          )}
        </div>
      </section>
    </>
  );
}
