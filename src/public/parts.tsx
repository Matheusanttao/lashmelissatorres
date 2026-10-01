import type { ReactNode } from 'react';
import { CalendarHeart, Clock, MapPin, MessageCircle, Mail, Sparkles } from 'lucide-react';
import { useSiteContent } from '@/hooks/useSiteContent';
import { instagramHandle, instagramUrl } from '@/lib/content';
import { whatsappLink } from '@/lib/whatsapp';
import { formatDuration, formatMoney, formatPhone, weekday, todayKey, WEEKDAYS, SERVICE_TYPE_LABEL } from '@/lib/format';
import type { PublicWorkingHours, Service } from '@/lib/types';
import { InstagramIcon as Instagram, Ornament, Photo } from '@/components/ui/Brand';
import { ButtonAnchor, ButtonLink } from '@/components/ui/Button';
import { WHATSAPP_GREETING } from './PublicLayout';

export function SectionHead({
  eyebrow,
  title,
  text,
  center,
}: {
  eyebrow?: string;
  title: ReactNode;
  text?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`section-head ${center ? 'center' : ''}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {center && <Ornament className="ornament" />}
      {text && <p>{text}</p>}
    </div>
  );
}

export function ServiceCard({ service, index = 0, demo }: { service: Service; index?: number; demo?: boolean }) {
  return (
    <article className="service-card reveal" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="service-media">
        {demo && <span className="badge badge-demo">Exemplo</span>}
        <Photo src={service.image_url} alt={service.name} seed={index} demoLabel={service.image_url ? null : 'Imagem ilustrativa'} />
      </div>
      <div className="service-body">
        <span className="badge badge-accent" style={{ alignSelf: 'flex-start' }}>
          {SERVICE_TYPE_LABEL[service.type]}
        </span>
        <h3>{service.name}</h3>
        {service.description && <p>{service.description}</p>}
        <div className="service-meta">
          <span>
            <Clock aria-hidden /> {formatDuration(service.duration_minutes)}
          </span>
          {service.maintenance_interval_days && service.type !== 'remocao' && (
            <span>
              <Sparkles aria-hidden /> Manutenção em ~{service.maintenance_interval_days} dias
            </span>
          )}
        </div>
        {service.maintenance_rules && <p className="small subtle">{service.maintenance_rules}</p>}
        <div className="service-foot">
          <div className="price">
            {service.price_is_from && <small>a partir de</small>}
            <strong>{formatMoney(service.price_cents)}</strong>
          </div>
          <ButtonLink
            to={demo ? '/agendar' : `/agendar?servico=${service.id}`}
            size="sm"
            icon={<CalendarHeart />}
            aria-label={`Agendar ${service.name}`}
          >
            Agendar
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

const DEMO_HOURS: PublicWorkingHours[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  weekday: d,
  is_working: d >= 2,
  start_time: '09:00',
  end_time: d === 6 ? '15:00' : '18:00',
}));

/** Agrupa dias consecutivos com o mesmo horário: "Terça a sexta". */
function groupHours(hours: PublicWorkingHours[]) {
  const order = [1, 2, 3, 4, 5, 6, 0]; // segunda primeiro
  const rows: { days: number[]; label: string; off: boolean }[] = [];
  for (const d of order) {
    const h = hours.find((x) => x.weekday === d);
    const label = h?.is_working ? `${h.start_time} – ${h.end_time}` : 'Fechado';
    const last = rows[rows.length - 1];
    if (last && last.label === label) last.days.push(d);
    else rows.push({ days: [d], label, off: !h?.is_working });
  }
  return rows.map((r) => {
    const names = r.days.map((d) => WEEKDAYS[d].toLowerCase());
    const title =
      r.days.length === 1 ? WEEKDAYS[r.days[0]] : `${WEEKDAYS[r.days[0]]} a ${names[names.length - 1]}`;
    return { ...r, title };
  });
}

export function HoursList() {
  const { workingHours, content } = useSiteContent();
  const hours = workingHours.length ? workingHours : DEMO_HOURS;
  const today = weekday(todayKey());
  return (
    <div>
      <div className="hours">
        {groupHours(hours).map((r) => (
          <div key={r.title} className={r.days.includes(today) ? 'today' : r.off ? 'off' : ''}>
            <span>{r.title}</span>
            <span className="tabular">{r.label}</span>
          </div>
        ))}
      </div>
      {content.hoursNote && <p className="small muted" style={{ marginTop: 12 }}>{content.hoursNote}</p>}
    </div>
  );
}

export function ContactSection() {
  const { content } = useSiteContent();
  const c = content.contact;
  const mapHref = c.mapsUrl || (c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.address} ${c.city}`)}` : '');
  return (
    <section className="section section-nude" id="contato">
      <div className="container">
        <SectionHead eyebrow="Contato" title={<>Vamos marcar o seu <em className="script">momento</em>?</>} center />
        <div className="contact-grid">
          <div className="card contact-card">
            <h3>Onde me encontrar</h3>
            <div className="contact-list">
              {c.address && (
                <div className="contact-item">
                  <span className="icon-circle"><MapPin aria-hidden /></span>
                  <div>
                    <small>Endereço</small>
                    {mapHref ? (
                      <a href={mapHref} target="_blank" rel="noopener noreferrer">
                        {c.address}
                        {c.city && <><br />{c.city}</>}
                      </a>
                    ) : (
                      <span>{c.address}</span>
                    )}
                  </div>
                </div>
              )}
              {c.whatsapp && (
                <div className="contact-item">
                  <span className="icon-circle"><MessageCircle aria-hidden /></span>
                  <div>
                    <small>WhatsApp</small>
                    <a href={whatsappLink(c.whatsapp, WHATSAPP_GREETING)} target="_blank" rel="noopener noreferrer">
                      {formatPhone(c.whatsapp)}
                    </a>
                  </div>
                </div>
              )}
              {c.instagram && (
                <div className="contact-item">
                  <span className="icon-circle"><Instagram aria-hidden /></span>
                  <div>
                    <small>Instagram</small>
                    <a href={instagramUrl(c.instagram)} target="_blank" rel="noopener noreferrer">
                      {instagramHandle(c.instagram)}
                    </a>
                  </div>
                </div>
              )}
              {c.email && (
                <div className="contact-item">
                  <span className="icon-circle"><Mail aria-hidden /></span>
                  <div>
                    <small>E-mail</small>
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
            <div className="card contact-card">
              <h3 className="row" style={{ gap: 10 }}>
                <Clock size={22} color="var(--accent)" aria-hidden /> Horário de atendimento
              </h3>
              <HoursList />
            </div>
            <div className="cta-card">
              <h3>Seu horário está a poucos cliques</h3>
              <p>Escolha o procedimento, veja os horários livres e reserve na hora.</p>
              <div className="row">
                <ButtonLink to="/agendar" icon={<CalendarHeart />}>Agendar meu horário</ButtonLink>
                {c.whatsapp && (
                  <ButtonAnchor
                    variant="secondary"
                    href={whatsappLink(c.whatsapp, WHATSAPP_GREETING)}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<MessageCircle />}
                  >
                    WhatsApp
                  </ButtonAnchor>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
