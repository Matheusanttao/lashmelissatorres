import { ArrowRight, CalendarHeart, Heart, Leaf, MessageCircle, ShieldCheck, Sparkles, Clock } from 'lucide-react';
import { useSiteContent } from '@/hooks/useSiteContent';
import { usePublicGallery, usePublicServices } from '@/hooks/usePublicData';
import { whatsappLink } from '@/lib/whatsapp';
import { Photo } from '@/components/ui/Brand';
import { ButtonAnchor, ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import { ContactSection, SectionHead, ServiceCard } from '../parts';
import { DemoGallery, GalleryGrid } from '../GalleryView';
import { WHATSAPP_GREETING } from '../PublicLayout';

/** Destaca a última palavra da frase em itálico, como assinatura da marca. */
function Tagline({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return <>{text}</>;
  const last = words.pop();
  return (
    <>
      {words.join(' ')} <em>{last}</em>
    </>
  );
}

function Hero() {
  const { content } = useSiteContent();
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="hero-studio">{content.studioName}</span>
          <h1>
            <Tagline text={content.tagline} />
          </h1>
          <p className="hero-text">{content.heroText}</p>
          <div className="hero-actions">
            <ButtonLink to="/agendar" size="lg" icon={<CalendarHeart />}>
              Agendar meu horário
            </ButtonLink>
            {content.contact.whatsapp && (
              <ButtonAnchor
                variant="secondary"
                size="lg"
                href={whatsappLink(content.contact.whatsapp, WHATSAPP_GREETING)}
                target="_blank"
                rel="noopener noreferrer"
                icon={<MessageCircle />}
              >
                Falar no WhatsApp
              </ButtonAnchor>
            )}
          </div>
          <div className="hero-trust">
            <span><ShieldCheck aria-hidden /> Materiais hipoalergênicos</span>
            <span><Leaf aria-hidden /> Biossegurança</span>
            <span><Heart aria-hidden /> Atendimento individual</span>
          </div>
        </div>
        <div className="hero-media">
          <div className="arch-outline" aria-hidden />
          <div className="arch">
            <Photo src={content.heroImage} alt={`Trabalho de ${content.studioName}`} seed={1} eager />
          </div>
          <div className="float-card one">
            <span className="icon-circle"><CalendarHeart aria-hidden /></span>
            <span>
              <strong>Agenda online</strong>
              horários livres em tempo real
            </span>
          </div>
          <div className="float-card two">
            <span className="icon-circle"><Sparkles aria-hidden /></span>
            <span>
              <strong>Olhar natural</strong>
              leve e confortável
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedServices() {
  const { services, isDemo, loading } = usePublicServices();
  const featured = services.filter((s) => s.featured);
  const list = (featured.length ? featured : services).slice(0, 3);
  return (
    <section className="section section-blush">
      <div className="container">
        <SectionHead
          eyebrow="Procedimentos"
          title={<>Técnicas para cada <em className="script">olhar</em></>}
          text="Do efeito mais natural ao mais marcante, cada aplicação é desenhada para o formato dos seus olhos."
          center
        />
        {loading ? (
          <div className="services-grid">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={420} r={24} />
            ))}
          </div>
        ) : (
          <div className="services-grid">
            {list.map((s, i) => (
              <ServiceCard key={s.id} service={s} index={i} demo={isDemo} />
            ))}
          </div>
        )}
        <div className="section-foot">
          <ButtonLink to="/servicos" variant="secondary" iconRight={<ArrowRight />}>
            Ver todos os serviços e preços
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function About() {
  const { content } = useSiteContent();
  const a = content.about;
  return (
    <section className="section">
      <div className="container about-grid">
        <div className="about-media">
          <div className="arch">
            <Photo src={a.photo} alt={a.name} seed={3} />
          </div>
        </div>
        <div className="about-copy">
          <span className="eyebrow">A profissional</span>
          <h2>{a.title}</h2>
          <p className="pre-line">{a.text}</p>
          <div className="signature">
            {a.name}
            <small>{a.role}</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function Space() {
  const { content } = useSiteContent();
  const s = content.space;
  const photos = [s.photos[0] ?? null, s.photos[1] ?? null];
  return (
    <section className="section section-nude">
      <div className="container space-grid">
        <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <span className="eyebrow">O espaço</span>
          <h2>{s.title}</h2>
          <p className="muted pre-line">{s.text}</p>
          <div className="values">
            <div className="value">
              <span className="icon-circle"><ShieldCheck aria-hidden /></span>
              <div>
                <strong>Higiene em cada detalhe</strong>
                <span>Materiais esterilizados e descartáveis a cada atendimento.</span>
              </div>
            </div>
            <div className="value">
              <span className="icon-circle"><Clock aria-hidden /></span>
              <div>
                <strong>Tempo só seu</strong>
                <span>Um atendimento por vez, sem pressa e sem espera.</span>
              </div>
            </div>
            <div className="value">
              <span className="icon-circle"><Heart aria-hidden /></span>
              <div>
                <strong>Conforto de verdade</strong>
                <span>Maca macia, mantinha e ambiente climatizado.</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-photos">
          {photos.map((p, i) => (
            <div key={i}>
              <Photo src={p} alt={`Espaço do ${content.studioName}`} seed={i + 5} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GalleryPreview() {
  const { data, isLoading } = usePublicGallery();
  const items = data?.items ?? [];
  const featured = items.filter((i) => i.featured);
  const list = (featured.length >= 4 ? featured : items).slice(0, 8);
  return (
    <section className="section">
      <div className="container">
        <SectionHead
          eyebrow="Trabalhos realizados"
          title={<>Olhares que <em className="script">encantam</em></>}
          text="Alguns resultados de clientes que autorizaram o uso das imagens."
          center
        />
        {isLoading ? (
          <div className="gallery-grid preview">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={280} r={16} />
            ))}
          </div>
        ) : list.length ? (
          <GalleryGrid items={list} categories={data?.categories ?? []} preview />
        ) : (
          <DemoGallery count={4} preview />
        )}
        <div className="section-foot">
          <ButtonLink to="/galeria" variant="secondary" iconRight={<ArrowRight />}>
            Ver galeria completa
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedServices />
      <About />
      <GalleryPreview />
      <Space />
      <ContactSection />
    </>
  );
}
