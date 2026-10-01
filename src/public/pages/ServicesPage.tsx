import { CalendarClock, Sparkles } from 'lucide-react';
import { usePublicServices } from '@/hooks/usePublicData';
import { useSiteContent } from '@/hooks/useSiteContent';
import { SERVICE_TYPE_PLURAL } from '@/lib/format';
import type { ServiceType } from '@/lib/types';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Ornament } from '@/components/ui/Brand';
import { ServiceCard } from '../parts';

const ORDER: ServiceType[] = ['aplicacao', 'manutencao', 'remocao'];

export default function ServicesPage() {
  const { services, isDemo, loading, error, refetch } = usePublicServices();
  const { content } = useSiteContent();

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Serviços e preços</span>
          <h1>
            Escolha o seu <em className="script">efeito</em>
          </h1>
          <Ornament className="ornament" />
          <p>Valores, duração e tudo o que você precisa saber antes de agendar.</p>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 16 }}>
        <div className="container">
          {isDemo && (
            <div style={{ marginBottom: 28 }}>
              <Callout tone="warning">
                <strong>Serviços de exemplo.</strong> Os procedimentos e preços abaixo são ilustrativos e serão
                substituídos quando o estúdio cadastrar a tabela oficial.
              </Callout>
            </div>
          )}

          {loading ? (
            <div className="services-grid">
              {[0, 1, 2].map((i) => <Skeleton key={i} h={420} r={24} />)}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : !services.length ? (
            <EmptyState icon={Sparkles} title="Tabela em atualização" text="Em breve os serviços estarão disponíveis por aqui." />
          ) : (
            ORDER.map((type) => {
              const list = services.filter((s) => s.type === type);
              if (!list.length) return null;
              return (
                <div className="service-group" key={type}>
                  <div className="service-group-head">
                    <h2>{SERVICE_TYPE_PLURAL[type]}</h2>
                  </div>
                  <div className="services-grid">
                    {list.map((s, i) => (
                      <ServiceCard key={s.id} service={s} index={i} demo={isDemo} />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {content.maintenanceRules && (
            <div className="rules-card" style={{ marginTop: 56 }}>
              <span className="icon-circle"><CalendarClock aria-hidden /></span>
              <div>
                <h3>Regras de manutenção</h3>
                <p className="pre-line">{content.maintenanceRules}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
