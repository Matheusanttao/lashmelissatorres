import { Link } from 'react-router-dom';
import {
  ArrowRight, BellRing, CalendarCheck2, CalendarPlus, CalendarRange, CircleCheck, Clock, Hourglass, Lock, Sparkles, UserPlus, Users,
  Wallet, CalendarHeart,
} from 'lucide-react';
import { useState } from 'react';
import {
  addDays, addMonths, capitalize, dateKey, formatLongDate, formatMoney, formatTime, fmt, fmtKey, spToDate, startOfMonth, todayKey,
  ACTIVE_STATUSES, minutesOfDay,
} from '@/lib/format';
import { db } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';
import {
  setAppointmentStatus, unwrap, useAppointments, useClientCount, useInvalidate, useMaintenanceSuggestions, usePendingAppointments, useReminders,
} from '../api';
import { useAdminActions } from '../AdminActions';
import { PageHeader } from '../AdminLayout';
import { StatusBadge } from '@/components/ui/Brand';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Checkbox } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

function greeting() {
  const h = Number(fmt(new Date(), 'H'));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function AppointmentRow({ a, onOpen, showDate }: { a: Appointment; onOpen: () => void; showDate?: boolean }) {
  return (
    <button type="button" className="appt-row" onClick={onOpen}>
      <span className="appt-time">
        {formatTime(a.starts_at)}
        <small>{showDate ? fmt(a.starts_at, 'EEE dd/MM') : formatTime(a.ends_at)}</small>
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="appt-name" style={{ display: 'block' }}>{a.client?.name ?? 'Cliente'}</span>
        <span className="appt-service" style={{ display: 'block' }}>{a.service_name}</span>
      </span>
      <StatusBadge status={a.status} />
    </button>
  );
}

function sumPrevisto(list: Appointment[]) {
  return list.filter((a) => ACTIVE_STATUSES.includes(a.status)).reduce((s, a) => s + a.price_cents, 0);
}
function sumRecebido(list: Appointment[]) {
  return list.reduce((s, a) => s + (a.paid_cents ?? 0), 0);
}

export default function DashboardPage() {
  const actions = useAdminActions();
  const invalidate = useInvalidate();
  const toast = useToast();
  const today = todayKey();
  const monthStart = startOfMonth(today);
  const nextMonth = addMonths(monthStart, 1);
  const rangeEnd = addDays(today, 8) > nextMonth ? addDays(today, 8) : nextMonth;

  const appts = useAppointments(spToDate(monthStart).toISOString(), spToDate(rangeEnd).toISOString());
  const pending = usePendingAppointments();
  const clients = useClientCount();
  const reminders = useReminders();
  const suggestions = useMaintenanceSuggestions(7);
  const [confirming, setConfirming] = useState<string | null>(null);

  const all = appts.data ?? [];
  const todays = all.filter((a) => dateKey(a.starts_at) === today && a.status !== 'cancelado');
  const month = all.filter((a) => dateKey(a.starts_at) < nextMonth);
  const nowMin = minutesOfDay(new Date());
  const upcoming = all
    .filter((a) => dateKey(a.starts_at) > today && dateKey(a.starts_at) <= addDays(today, 7) && ['pendente', 'confirmado'].includes(a.status))
    .slice(0, 8);
  const todaysReminders = (reminders.data ?? []).filter((r) => !r.done && r.due_date <= today);
  const nextToday = todays.find((a) => minutesOfDay(a.starts_at) >= nowMin && ['confirmado', 'pendente'].includes(a.status));

  async function confirm(a: Appointment) {
    setConfirming(a.id);
    try {
      await setAppointmentStatus(a.id, 'confirmado');
      await invalidate('appointments');
      toast.success(`Horário de ${a.client?.name ?? 'cliente'} confirmado.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setConfirming(null);
    }
  }

  async function toggleReminder(id: string, done: boolean) {
    try {
      unwrap(await db().from('reminders').update({ done }).eq('id', id).select('id'));
      await invalidate('reminders');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <PageHeader
        title={`${greeting()}!`}
        subtitle={capitalize(formatLongDate(new Date()))}
        actions={
          <ButtonLink to="/admin/agenda" variant="secondary" icon={<CalendarRange />}>
            Abrir agenda
          </ButtonLink>
        }
      />

      <div className="quick">
        <button type="button" className="action-tile" onClick={() => actions.newAppointment()}>
          <span className="icon-circle"><CalendarPlus aria-hidden /></span>
          <span>Novo agendamento<small>Marcar um horário manualmente</small></span>
        </button>
        <button type="button" className="action-tile" onClick={() => actions.newClient()}>
          <span className="icon-circle"><UserPlus aria-hidden /></span>
          <span>Nova cliente<small>Cadastro rápido</small></span>
        </button>
        <button type="button" className="action-tile" onClick={() => actions.newBlock()}>
          <span className="icon-circle"><Lock aria-hidden /></span>
          <span>Bloquear horário<small>Compromisso, folga ou férias</small></span>
        </button>
      </div>

      <div className="stats">
        <div className="card stat highlight">
          <span className="stat-label"><CalendarCheck2 aria-hidden /> Atendimentos hoje</span>
          <span className="stat-value">{appts.isLoading ? '–' : todays.filter((a) => ACTIVE_STATUSES.includes(a.status)).length}</span>
          <span className="stat-sub">{nextToday ? `Próximo às ${formatTime(nextToday.starts_at)}` : 'Nenhum a seguir hoje'}</span>
        </div>
        <div className={`card stat ${pending.data?.length ? 'warn' : ''}`}>
          <span className="stat-label"><Hourglass aria-hidden /> Solicitações pendentes</span>
          <span className="stat-value">{pending.isLoading ? '–' : pending.data?.length ?? 0}</span>
          <span className="stat-sub">Aguardando sua confirmação</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><CalendarHeart aria-hidden /> Próximos 7 dias</span>
          <span className="stat-value">{appts.isLoading ? '–' : upcoming.length}</span>
          <span className="stat-sub">Agendamentos marcados</span>
        </div>
        <div className="card stat">
          <span className="stat-label"><Users aria-hidden /> Total de clientes</span>
          <span className="stat-value">{clients.isLoading ? '–' : clients.data}</span>
          <span className="stat-sub"><Link to="/admin/clientes" className="link">Ver clientes</Link></span>
        </div>
      </div>

      <div className="dash-grid">
        <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <div className="card">
            <div className="card-head">
              <h3>Hoje</h3>
              <Button size="sm" variant="ghost" icon={<CalendarPlus />} onClick={() => actions.newAppointment({ date: today })}>
                Agendar
              </Button>
            </div>
            {appts.isLoading ? (
              <div className="card-body stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
            ) : appts.error ? (
              <ErrorState error={appts.error} onRetry={() => appts.refetch()} />
            ) : todays.length ? (
              todays.map((a) => <AppointmentRow key={a.id} a={a} onOpen={() => actions.openAppointment(a.id)} />)
            ) : (
              <EmptyState icon={CalendarHeart} title="Dia livre por aqui" text="Nenhum atendimento para hoje. Aproveite para cuidar de você também." />
            )}
          </div>

          {!!pending.data?.length && (
            <div className="card">
              <div className="card-head">
                <h3>Solicitações pendentes</h3>
                <span className="badge badge-warning">{pending.data.length}</span>
              </div>
              {pending.data.map((a) => (
                <div key={a.id} className="appt-row pending-row">
                  <span className="appt-time">
                    {formatTime(a.starts_at)}
                    <small>{fmt(a.starts_at, 'EEE dd/MM')}</small>
                  </span>
                  <button type="button" className="pending-row-open" onClick={() => actions.openAppointment(a.id)}>
                    <span className="appt-name" style={{ display: 'block' }}>{a.client?.name}</span>
                    <span className="appt-service" style={{ display: 'block' }}>{a.service_name}</span>
                  </button>
                  <Button size="sm" className="pending-row-confirm" icon={<CircleCheck />} loading={confirming === a.id} onClick={() => confirm(a)}>
                    Confirmar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>Próximos agendamentos</h3>
              <ButtonLink to="/admin/agenda?view=semana" size="sm" variant="ghost" iconRight={<ArrowRight />}>
                Semana
              </ButtonLink>
            </div>
            {appts.isLoading ? (
              <div className="card-body stack">{[0, 1].map((i) => <Skeleton key={i} h={44} />)}</div>
            ) : upcoming.length ? (
              upcoming.map((a) => <AppointmentRow key={a.id} a={a} showDate onOpen={() => actions.openAppointment(a.id)} />)
            ) : (
              <EmptyState icon={CalendarRange} title="Nada marcado nos próximos dias" text="Os novos agendamentos aparecerão aqui." />
            )}
          </div>
        </div>

        <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <div className="card">
            <div className="card-head">
              <h3 className="row" style={{ gap: 8 }}><Wallet size={20} color="var(--accent)" aria-hidden /> Valores</h3>
            </div>
            {appts.isLoading ? (
              <div className="card-body"><Skeleton h={80} /></div>
            ) : (
              <>
                <div className="money-card" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div>
                    <small>PREVISTO HOJE</small>
                    <strong>{formatMoney(sumPrevisto(todays))}</strong>
                    <span>Pendentes, confirmados e concluídos</span>
                  </div>
                  <div>
                    <small>RECEBIDO HOJE</small>
                    <strong style={{ color: 'var(--success)' }}>{formatMoney(sumRecebido(todays))}</strong>
                    <span>Pagamentos registrados</span>
                  </div>
                </div>
                <div className="money-card">
                  <div>
                    <small>PREVISTO EM {fmtKey(today, 'MMMM').toUpperCase()}</small>
                    <strong>{formatMoney(sumPrevisto(month))}</strong>
                  </div>
                  <div>
                    <small>RECEBIDO EM {fmtKey(today, 'MMMM').toUpperCase()}</small>
                    <strong style={{ color: 'var(--success)' }}>{formatMoney(sumRecebido(month))}</strong>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Lembretes do dia</h3>
              <Button size="sm" variant="ghost" onClick={() => actions.newReminder()}>Novo</Button>
            </div>
            {reminders.isLoading ? (
              <div className="card-body"><Skeleton h={60} /></div>
            ) : todaysReminders.length ? (
              <div className="list">
                {todaysReminders.slice(0, 6).map((r) => {
                  const overdue = r.due_date < today;
                  return (
                    <div key={r.id} className="list-item" style={overdue ? { background: 'linear-gradient(90deg, var(--danger-soft), transparent 50%)' } : undefined}>
                      <Checkbox checked={r.done} onChange={(v) => toggleReminder(r.id, v)}>
                        <strong style={{ display: 'block' }}>{r.title}</strong>
                        <span className="small" style={{ color: overdue ? 'var(--danger)' : 'var(--ink-2)' }}>
                          {overdue ? `Venceu em ${fmtKey(r.due_date, 'dd/MM')}` : 'Hoje'}
                          {r.due_time ? ` · ${r.due_time.slice(0, 5)}` : ''}
                          {r.client ? ` · ${r.client.name}` : ''}
                        </span>
                      </Checkbox>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={CircleCheck} title="Tudo em dia" text="Nenhuma tarefa pendente para hoje." />
            )}
            {todaysReminders.length > 6 && (
              <div className="card-body"><Link to="/admin/lembretes" className="link">Ver todos</Link></div>
            )}
          </div>

          <div className="card card-pad">
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span className="empty-art" style={{ width: 48, height: 48, margin: 0, flex: 'none' }}>
                <Sparkles aria-hidden style={{ width: 20, height: 20 }} />
              </span>
              <div className="grow">
                <strong>Manutenções a sugerir</strong>
                <p className="small muted" style={{ marginTop: 2 }}>
                  {suggestions.isLoading
                    ? 'Calculando…'
                    : suggestions.data?.length
                      ? `${suggestions.data.length} cliente${suggestions.data.length > 1 ? 's' : ''} com manutenção vencendo, sem horário marcado.`
                      : 'Nenhuma manutenção vencendo nos próximos 7 dias.'}
                </p>
                {!!suggestions.data?.length && (
                  <ButtonLink to="/admin/lembretes" size="sm" variant="soft" iconRight={<ArrowRight />} style={{ marginTop: 10 }}>
                    Ver sugestões
                  </ButtonLink>
                )}
              </div>
            </div>
          </div>

          <div className="callout callout-info small">
            <BellRing aria-hidden />
            <div>
              Lembretes e mensagens são exibidos aqui no painel. O WhatsApp abre com o texto pronto, mas o <strong>envio é
              sempre feito por você</strong> — nada é enviado automaticamente.
            </div>
          </div>
          <div className="small subtle row" style={{ gap: 6 }}>
            <Clock size={14} aria-hidden /> Horários exibidos no fuso de Brasília.
          </div>
        </div>
      </div>
    </>
  );
}
