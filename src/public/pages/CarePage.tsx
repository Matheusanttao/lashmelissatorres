import { CalendarX2, Clock3, Plus, RefreshCcw, Sparkles, Sun } from 'lucide-react';
import { useSiteContent } from '@/hooks/useSiteContent';
import { Ornament } from '@/components/ui/Brand';
import { SectionHead } from '../parts';

export default function CarePage() {
  const { content } = useSiteContent();
  const { care, faq, policies } = content;

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Informações e cuidados</span>
          <h1>
            Tudo para o seu <em className="script">conforto</em>
          </h1>
          <Ornament className="ornament" />
          <p>Orientações simples que fazem toda a diferença no resultado e na durabilidade dos seus cílios.</p>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 12 }}>
        <div className="container care-grid">
          <div className="card care-card reveal">
            <h3>
              <span className="icon-circle"><Sun aria-hidden /></span>
              Antes do procedimento
            </h3>
            <ul className="care-list">
              {care.before.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
          <div className="card care-card reveal" style={{ animationDelay: '80ms' }}>
            <h3>
              <span className="icon-circle"><Sparkles aria-hidden /></span>
              Depois do procedimento
            </h3>
            <ul className="care-list">
              {care.after.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {faq.length > 0 && (
        <section className="section section-blush">
          <div className="container">
            <SectionHead eyebrow="Dúvidas" title={<>Perguntas <em className="script">frequentes</em></>} center />
            <div className="faq">
              {faq.filter((f) => f.q).map((f, i) => (
                <details key={i}>
                  <summary>
                    {f.q}
                    <Plus aria-hidden />
                  </summary>
                  <p className="pre-line">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Políticas"
            title={<>Combinados para um atendimento <em className="script">tranquilo</em></>}
            center
          />
          <div className="policy-grid">
            {policies.late && (
              <div className="card policy-card">
                <span className="icon-circle"><Clock3 aria-hidden /></span>
                <h3>Atrasos</h3>
                <p className="pre-line">{policies.late}</p>
              </div>
            )}
            {policies.cancellation && (
              <div className="card policy-card">
                <span className="icon-circle"><CalendarX2 aria-hidden /></span>
                <h3>Cancelamento</h3>
                <p className="pre-line">{policies.cancellation}</p>
              </div>
            )}
            {policies.reschedule && (
              <div className="card policy-card">
                <span className="icon-circle"><RefreshCcw aria-hidden /></span>
                <h3>Reagendamento</h3>
                <p className="pre-line">{policies.reschedule}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
