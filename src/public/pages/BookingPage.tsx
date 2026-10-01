import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarHeart, CalendarX2, Check, ChevronLeft, ChevronRight, Clock, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePublicServices } from '@/hooks/usePublicData';
import { useSiteContent } from '@/hooks/useSiteContent';
import {
  addDays, addMonths, capitalize, daysInMonth, fmt, fmtKey, formatDuration, formatLongDate, formatMoney,
  formatPhone, formatTime, isValidEmail, isValidPhone, SERVICE_TYPE_LABEL, SERVICE_TYPE_PLURAL,
  startOfMonth, todayKey, weekday, WEEKDAYS_SHORT, minutesOfDay,
} from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { whatsappLink } from '@/lib/whatsapp';
import type { BookingReceipt, Service, ServiceType } from '@/lib/types';
import { Photo } from '@/components/ui/Brand';
import { Button, ButtonAnchor, IconButton } from '@/components/ui/Button';
import { Callout, EmptyState, LoadingBlock, Skeleton, Spinner } from '@/components/ui/Feedback';
import { Checkbox, PhoneInput, TextArea, TextInput } from '@/components/ui/Field';
import { WHATSAPP_GREETING } from '../PublicLayout';
import { Link } from 'react-router-dom';

const STEPS = ['Serviço', 'Data e horário', 'Seus dados', 'Confirmar'];

function Steps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="Etapas do agendamento" style={{ listStyle: 'none', padding: 0 }}>
      {STEPS.map((s, i) => (
        <li key={s} className={`step ${i === current ? 'current' : i < current ? 'done' : ''}`} aria-current={i === current ? 'step' : undefined}>
          <span className="dot">{i < current ? <Check aria-hidden /> : i + 1}</span>
          <span className="label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------- 1. Serviço ------------------------------------------------
function ServiceStep({ services, selected, onSelect }: { services: Service[]; selected?: string; onSelect: (s: Service) => void }) {
  const order: ServiceType[] = ['aplicacao', 'manutencao', 'remocao'];
  return (
    <div className="pick-list">
      {order.map((type) => {
        const list = services.filter((s) => s.type === type);
        if (!list.length) return null;
        return (
          <div key={type} className="pick-list">
            <div className="pick-group-title">{SERVICE_TYPE_PLURAL[type]}</div>
            {list.map((s, i) => (
              <button key={s.id} type="button" className="pick" aria-pressed={selected === s.id} onClick={() => onSelect(s)}>
                <span className="pick-thumb">
                  <Photo src={s.image_url} alt="" seed={i} demoLabel={null} />
                </span>
                <span>
                  <span className="pick-title">{s.name}</span>
                  <span className="pick-sub">
                    <span>{formatDuration(s.duration_minutes)}</span>
                    <span>{SERVICE_TYPE_LABEL[s.type]}</span>
                  </span>
                </span>
                <span className="pick-price">
                  {s.price_is_from && <small>a partir de</small>}
                  {formatMoney(s.price_cents)}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------- 2. Data e horário ----------------------------------------
function DateTimeStep({
  service,
  day,
  slot,
  onDay,
  onSlot,
}: {
  service: Service;
  day: string | null;
  slot: string | null;
  onDay: (d: string) => void;
  onSlot: (s: string) => void;
}) {
  const { maxAdvanceDays } = useSiteContent();
  const today = todayKey();
  const lastDay = addDays(today, maxAdvanceDays);
  const [month, setMonth] = useState(startOfMonth(day ?? today));

  const monthEnd = addDays(month, daysInMonth(month) - 1);
  const from = month < today ? today : month;
  const to = monthEnd > lastDay ? lastDay : monthEnd;

  const days = useQuery({
    queryKey: ['available-days', service.id, from, to],
    enabled: from <= to,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_available_days', { p_service_id: service.id, p_from: from, p_to: to });
      if (error) throw error;
      return new Set((data as { day: string }[]).map((d) => d.day));
    },
  });

  const slots = useQuery({
    queryKey: ['available-slots', service.id, day],
    enabled: !!day,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_available_slots', { p_service_id: service.id, p_date: day });
      if (error) throw error;
      return (data as { starts_at: string }[]).map((d) => d.starts_at);
    },
  });

  // Se o horário escolhido deixar de existir (alguém reservou), limpa a seleção.
  useEffect(() => {
    if (slot && slots.data && !slots.data.some((s) => new Date(s).getTime() === new Date(slot).getTime())) onSlot('');
  }, [slots.data, slot, onSlot]);

  // Na primeira carga, avança para o mês seguinte se este não tiver datas.
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (!autoAdvanced && days.data && days.data.size === 0 && !day && addMonths(month, 1) <= lastDay) {
      setAutoAdvanced(true);
      setMonth(addMonths(month, 1));
    }
  }, [days.data, autoAdvanced, day, month, lastDay]);

  const firstWd = weekday(month);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWd }, () => null),
    ...Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i)),
  ];

  const groups = useMemo(() => {
    const g: Record<string, string[]> = { Manhã: [], Tarde: [], Noite: [] };
    (slots.data ?? []).forEach((s) => {
      const m = minutesOfDay(s);
      g[m < 12 * 60 ? 'Manhã' : m < 18 * 60 ? 'Tarde' : 'Noite'].push(s);
    });
    return Object.entries(g).filter(([, v]) => v.length);
  }, [slots.data]);

  return (
    <div className="date-time">
      <div className="calendar">
        <div className="calendar-head">
          <IconButton label="Mês anterior" bordered disabled={month <= startOfMonth(today)} onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft />
          </IconButton>
          <strong>{capitalize(fmtKey(month, 'MMMM yyyy'))}</strong>
          <IconButton label="Próximo mês" bordered disabled={addMonths(month, 1) > lastDay} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight />
          </IconButton>
        </div>
        <div className="calendar-grid" role="grid" aria-busy={days.isLoading}>
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="wd" role="columnheader">{w}</div>
          ))}
          {cells.map((c, i) => {
            if (!c) return <div key={`e${i}`} />;
            const available = days.data?.has(c);
            return (
              <button
                key={c}
                type="button"
                className={`day-btn ${available ? 'available' : ''} ${c === today ? 'today' : ''}`}
                disabled={!available}
                aria-pressed={day === c}
                aria-label={`${fmtKey(c, "EEEE, d 'de' MMMM")}${available ? '' : ' — sem horários'}`}
                onClick={() => onDay(c)}
              >
                {Number(c.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span><i /> Com horários livres</span>
          {days.isLoading && <span><Spinner /> Consultando agenda…</span>}
        </div>
        {days.data && days.data.size === 0 && !days.isLoading && (
          <p className="small muted" style={{ marginTop: 12 }}>Sem horários livres neste mês. Veja o próximo.</p>
        )}
        {days.error && <p className="field-error" style={{ marginTop: 12 }}>{friendlyError(days.error)}</p>}
      </div>

      <div>
        {!day ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', background: 'var(--nude-soft)', borderStyle: 'dashed', boxShadow: 'none' }}>
            <CalendarHeart size={28} color="var(--accent)" style={{ margin: '0 auto 10px' }} aria-hidden />
            <p className="muted">Escolha um dia destacado no calendário para ver os horários.</p>
          </div>
        ) : (
          <>
            <div className="slots-title">{capitalize(fmtKey(day, "EEEE, d 'de' MMMM"))}</div>
            {slots.isLoading ? (
              <div className="slots">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={46} />)}</div>
            ) : slots.error ? (
              <p className="field-error">{friendlyError(slots.error)}</p>
            ) : !slots.data?.length ? (
              <p className="muted">Os horários deste dia acabaram de ser preenchidos. Escolha outro dia.</p>
            ) : (
              groups.map(([label, list]) => (
                <div key={label}>
                  <div className="slot-period">{label}</div>
                  <div className="slots">
                    {list.map((s) => (
                      <button key={s} type="button" className="slot" aria-pressed={slot === s} onClick={() => onSlot(s)}>
                        {formatTime(s)}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Página ---------------------------------------------------
interface ClientData {
  name: string;
  phone: string;
  email: string;
  message: string;
  accept: boolean;
  website: string; // armadilha para robôs
}

export default function BookingPage() {
  const { services, isDemo, loading } = usePublicServices();
  const { content, autoApprove } = useSiteContent();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | undefined>(params.get('servico') ?? undefined);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [data, setData] = useState<ClientData>({ name: '', phone: '', email: '', message: '', accept: false, website: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ClientData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);

  // Serviço vindo do link "Agendar" de um card: já começa na etapa 2.
  useEffect(() => {
    if (!loading && params.get('servico') && service && step === 0) setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const set = <K extends keyof ClientData>(k: K, v: ClientData[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validateClient(): boolean {
    const e: typeof errors = {};
    if (data.name.trim().length < 2) e.name = 'Informe seu nome.';
    if (!isValidPhone(data.phone)) e.phone = 'Informe um WhatsApp válido com DDD.';
    if (data.email && !isValidEmail(data.email)) e.email = 'Confira o e-mail digitado.';
    if (!data.accept) e.accept = 'Para continuar, confirme que leu as políticas.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit() {
    if (!service || !slot) return;
    if (data.website) return setSubmitError('Não foi possível enviar sua solicitação.');
    setSubmitting(true);
    setSubmitError(null);
    const { data: res, error } = await supabase!.rpc('request_booking', {
      p_service_id: service.id,
      p_starts_at: slot,
      p_name: data.name,
      p_whatsapp: data.phone,
      p_email: data.email || null,
      p_message: data.message || null,
    });
    setSubmitting(false);
    if (error) {
      const msg = friendlyError(error, 'Não foi possível concluir o agendamento. Tente novamente.');
      setSubmitError(msg);
      if (error.hint === 'horario_indisponivel' || error.code === '23P01') {
        setSlot(null);
      }
      return;
    }
    const receipt = res as BookingReceipt;
    navigate(`/agendamento/${receipt.code}`, { state: { receipt, fresh: true } });
  }

  const whatsapp = content.contact.whatsapp;

  if (loading) return <LoadingBlock text="Carregando serviços…" />;

  if (isDemo || !supabase) {
    return (
      <div className="booking">
        <div className="card booking-panel">
          <EmptyState
            icon={CalendarX2}
            title="Agendamento online em preparação"
            text="A agenda online será liberada assim que o estúdio cadastrar os serviços. Enquanto isso, fale com a gente pelo WhatsApp."
            action={
              whatsapp ? (
                <ButtonAnchor variant="whatsapp" href={whatsappLink(whatsapp, WHATSAPP_GREETING)} target="_blank" rel="noopener noreferrer" icon={<MessageCircle />}>
                  Falar no WhatsApp
                </ButtonAnchor>
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="booking">
      <div className="booking-head">
        <span className="eyebrow">Agendamento online</span>
        <h1>Reserve o seu <em className="script">horário</em></h1>
      </div>
      <Steps current={step} />

      {step === 0 && (
        <div className="card booking-panel" key="s0">
          <h2>Qual procedimento você deseja?</h2>
          <p className="muted">Na dúvida entre as técnicas, escolha a mais próxima — ajustamos juntas no dia.</p>
          <ServiceStep
            services={services}
            selected={serviceId}
            onSelect={(s) => {
              setServiceId(s.id);
              setDay(null);
              setSlot(null);
            }}
          />
          <div className="booking-nav">
            <span />
            <Button disabled={!service} onClick={() => setStep(1)} iconRight={<ArrowRight />}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 1 && service && (
        <div className="card booking-panel" key="s1">
          <h2>Escolha o dia e o horário</h2>
          <p className="muted">
            {service.name} · {formatDuration(service.duration_minutes)}. Mostramos apenas horários realmente livres.
          </p>
          <DateTimeStep
            service={service}
            day={day}
            slot={slot}
            onDay={(d) => {
              setDay(d);
              setSlot(null);
            }}
            onSlot={(s) => setSlot(s || null)}
          />
          <div className="booking-nav">
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep(0)}>
              Voltar
            </Button>
            <Button disabled={!slot} onClick={() => setStep(2)} iconRight={<ArrowRight />}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form
          className="card booking-panel"
          key="s2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (validateClient()) setStep(3);
          }}
        >
          <h2>Seus dados</h2>
          <p className="muted">Usamos seu WhatsApp apenas para falar sobre o seu atendimento.</p>
          <div className="form-grid">
            <TextInput
              label="Nome completo"
              autoComplete="name"
              value={data.name}
              maxLength={120}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
              wrapClassName="span-all"
            />
            <PhoneInput label="WhatsApp" value={data.phone} onChange={(v) => set('phone', v)} error={errors.phone} />
            <TextInput
              label="E-mail"
              optional
              type="email"
              inputMode="email"
              autoComplete="email"
              value={data.email}
              maxLength={160}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <TextArea
              label="Quer contar algo?"
              optional
              placeholder="Ex.: tenho olhos sensíveis, é minha primeira vez…"
              value={data.message}
              maxLength={500}
              onChange={(e) => set('message', e.target.value)}
              wrapClassName="span-all"
              hint={`${data.message.length}/500`}
            />
            {/* Campo invisível: robôs preenchem, pessoas não. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={data.website}
              onChange={(e) => set('website', e.target.value)}
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              aria-hidden
            />
            <div className="span-all field">
              <Checkbox checked={data.accept} onChange={(v) => set('accept', v)}>
                Li e concordo com as{' '}
                <Link to="/cuidados" target="_blank" className="link">
                  políticas de atraso, cancelamento e reagendamento
                </Link>
                .
              </Checkbox>
              {errors.accept && <span className="field-error">{errors.accept}</span>}
            </div>
          </div>
          <div className="booking-nav">
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button type="submit" iconRight={<ArrowRight />}>
              Revisar agendamento
            </Button>
          </div>
        </form>
      )}

      {step === 3 && service && slot && (
        <div className="card booking-panel" key="s3">
          <h2>Confira antes de confirmar</h2>
          <p className="muted">Está tudo certinho?</p>
          <div className="summary">
            <div className="summary-row"><span>Serviço</span><span>{service.name}</span></div>
            <div className="summary-row"><span>Data</span><span>{capitalize(formatLongDate(slot))}</span></div>
            <div className="summary-row">
              <span>Horário</span>
              <span className="tabular">
                {formatTime(slot)} às {fmt(new Date(new Date(slot).getTime() + service.duration_minutes * 60000), 'HH:mm')}
              </span>
            </div>
            <div className="summary-row"><span>Duração</span><span>{formatDuration(service.duration_minutes)}</span></div>
            <div className="summary-row"><span>Nome</span><span>{data.name}</span></div>
            <div className="summary-row"><span>WhatsApp</span><span>{formatPhone(data.phone)}</span></div>
            {data.email && <div className="summary-row"><span>E-mail</span><span>{data.email}</span></div>}
            <div className="summary-row total">
              <span>Valor{service.price_is_from ? ' (a partir de)' : ''}</span>
              <span>{formatMoney(service.price_cents)}</span>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            {autoApprove ? (
              <Callout tone="success" icon={Check}>
                Ao confirmar, seu horário fica <strong>reservado na hora</strong>.
              </Callout>
            ) : (
              <Callout tone="warning" icon={Clock}>
                Sua solicitação ficará <strong>aguardando confirmação</strong> do estúdio. Você receberá o retorno pelo
                WhatsApp.
              </Callout>
            )}
          </div>
          {service.price_is_from && (
            <p className="small muted" style={{ marginTop: 12 }}>
              O valor final pode variar conforme a quantidade de fios e o estado dos cílios no dia.
            </p>
          )}
          {submitError && (
            <div style={{ marginTop: 14 }}>
              <Callout tone="danger">
                {submitError}
                {!slot || submitError.includes('indisponível') ? (
                  <>
                    {' '}
                    <button type="button" className="link" onClick={() => setStep(1)}>Escolher outro horário</button>
                  </>
                ) : null}
              </Callout>
            </div>
          )}
          <div className="booking-nav">
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep(2)} disabled={submitting}>
              Voltar
            </Button>
            <Button size="lg" loading={submitting} onClick={submit} icon={<CalendarHeart />}>
              {autoApprove ? 'Confirmar agendamento' : 'Enviar solicitação'}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && !slot && (
        <div className="card booking-panel">
          <Callout tone="danger">
            {submitError ?? 'Escolha um horário para continuar.'}{' '}
            <button type="button" className="link" onClick={() => setStep(1)}>Escolher outro horário</button>
          </Callout>
        </div>
      )}
    </div>
  );
}
