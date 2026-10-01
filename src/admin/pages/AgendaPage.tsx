import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import {
  addDays, addMonths, capitalize, dateKey, fmtKey, formatTime, minutesOfDay, spToDate, startOfMonth, startOfWeek, STATUS_LABEL,
  timeToMinutes, todayKey, weekday, WEEKDAYS_SHORT,
} from '@/lib/format';
import type { Appointment, AppointmentStatus, TimeBlock, WorkingBreak, WorkingHours } from '@/lib/types';
import { useAppointments, useBlocks, useWorkingHours } from '../api';
import { useAdminActions } from '../AdminActions';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, Segmented } from '@/components/ui/Field';
import { ErrorState, Spinner } from '@/components/ui/Feedback';

type View = 'dia' | 'semana' | 'mes';
const HOUR_H = 64;
const PPM = HOUR_H / 60;

interface DayData {
  key: string;
  appts: Appointment[];
  blocks: { block: TimeBlock; from: number; to: number }[];
  breaks: WorkingBreak[];
  hours?: WorkingHours;
}

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

/** Distribui eventos que se sobrepõem visualmente em colunas lado a lado. */
function lanes(appts: Appointment[]) {
  const sorted = [...appts].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ends: number[] = [];
  const out = new Map<string, { lane: number; total: number }>();
  const groups: Appointment[][] = [];
  let group: Appointment[] = [];
  let groupEnd = 0;
  for (const a of sorted) {
    const s = new Date(a.starts_at).getTime();
    const e = new Date(a.ends_at).getTime();
    if (group.length && s >= groupEnd) {
      groups.push(group);
      group = [];
      ends.length = 0;
    }
    let lane = ends.findIndex((x) => x <= s);
    if (lane < 0) lane = ends.length;
    ends[lane] = e;
    out.set(a.id, { lane, total: 0 });
    group.push(a);
    groupEnd = Math.max(groupEnd, e);
  }
  if (group.length) groups.push(group);
  for (const g of groups) {
    const total = Math.max(...g.map((a) => out.get(a.id)!.lane)) + 1;
    g.forEach((a) => (out.get(a.id)!.total = total));
  }
  return out;
}

function Timeline({
  days,
  startHour,
  endHour,
  week,
  onOpen,
  onEmpty,
  onBlock,
  onDayClick,
}: {
  days: DayData[];
  startHour: number;
  endHour: number;
  week?: boolean;
  onOpen: (id: string) => void;
  onEmpty: (key: string, time: string) => void;
  onBlock: (b: TimeBlock) => void;
  onDayClick: (key: string) => void;
}) {
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const today = todayKey();
  const [now, setNow] = useState(() => minutesOfDay(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(minutesOfDay(new Date())), 60000);
    return () => clearInterval(t);
  }, []);
  const top = (min: number) => (min - startHour * 60) * PPM;

  return (
    <div className="timeline-scroll">
      <div className={`timeline ${week ? 'week' : ''}`}>
        {week && <div className="col-head-spacer" />}
        {week &&
          days.map((d) => (
            <div key={d.key} className={`col-head ${d.key === today ? 'today' : ''}`} onClick={() => onDayClick(d.key)} role="button" tabIndex={0}>
              <small>{WEEKDAYS_SHORT[weekday(d.key)]}</small>
              <strong>{Number(d.key.slice(8))}</strong>
            </div>
          ))}
        <div className="timeline-hours">
          {hours.map((h) => (
            <div key={h}>{String(h).padStart(2, '0')}:00</div>
          ))}
        </div>
        {days.map((d) => {
          const lay = lanes(d.appts);
          const off = !d.hours?.is_working;
          return (
            <div key={d.key} className={`timeline-col ${d.key === today ? 'today' : ''} ${off ? 'off' : ''}`}>
              {hours.map((h) => (
                <div key={h} className="hour-line" />
              ))}
              {/* Clique em um espaço vazio para agendar */}
              {hours.flatMap((h) =>
                [0, 30].map((m) => (
                  <button
                    key={`${h}-${m}`}
                    type="button"
                    className="slot-click"
                    style={{ top: top(h * 60 + m), height: HOUR_H / 2 }}
                    aria-label={`Agendar em ${fmtKey(d.key, 'dd/MM')} às ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`}
                    onClick={() => onEmpty(d.key, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)}
                  />
                )),
              )}
              {d.breaks.map((b) => {
                const s = timeToMinutes(b.start_time), e = timeToMinutes(b.end_time);
                return (
                  <div key={b.id} className="ev-break" style={{ top: top(s), height: (e - s) * PPM }}>
                    {b.label || 'Pausa'}
                  </div>
                );
              })}
              {d.blocks.map(({ block, from, to }) => (
                <button
                  key={block.id}
                  type="button"
                  className="ev-block"
                  style={{ top: top(Math.max(from, startHour * 60)), height: Math.max((Math.min(to, endHour * 60) - Math.max(from, startHour * 60)) * PPM, 20) }}
                  onClick={() => onBlock(block)}
                >
                  <Lock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                  {block.kind === 'folga' ? 'Folga' : 'Bloqueado'}
                  {block.reason ? ` · ${block.reason}` : ''}
                </button>
              ))}
              {d.appts.map((a) => {
                const s = minutesOfDay(a.starts_at);
                const { lane, total } = lay.get(a.id)!;
                const height = Math.max(a.duration_minutes * PPM, 26);
                return (
                  <div key={a.id}>
                    <button
                      type="button"
                      className={`ev status status-${a.status}`}
                      style={{
                        top: top(s),
                        height,
                        left: `calc(${(lane / total) * 100}% + 3px)`,
                        right: 'auto',
                        width: `calc(${100 / total}% - 6px)`,
                      }}
                      onClick={() => onOpen(a.id)}
                      title={`${formatTime(a.starts_at)} ${a.client?.name ?? ''} — ${a.service_name} (${STATUS_LABEL[a.status]})`}
                    >
                      <strong>{a.client?.name ?? 'Cliente'}</strong>
                      {height > 34 && <span>{formatTime(a.starts_at)} · {a.service_name}</span>}
                    </button>
                    {a.buffer_minutes > 0 && ['pendente', 'confirmado', 'concluido'].includes(a.status) && (
                      <span className="ev-buffer" style={{ top: top(s) + height + 1 }} aria-hidden />
                    )}
                  </div>
                );
              })}
              {d.key === today && now >= startHour * 60 && now <= endHour * 60 && (
                <div className="now-line" style={{ top: top(now) }} aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  appts,
  blocksByDay,
  hours,
  onDay,
}: {
  month: string;
  appts: Appointment[];
  blocksByDay: Map<string, TimeBlock[]>;
  hours: WorkingHours[];
  onDay: (key: string) => void;
}) {
  const start = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = todayKey();
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    appts.forEach((a) => {
      const k = dateKey(a.starts_at);
      m.set(k, [...(m.get(k) ?? []), a]);
    });
    return m;
  }, [appts]);

  return (
    <div className="month">
      {WEEKDAYS_SHORT.map((w) => (
        <div key={w} className="wd">{w}</div>
      ))}
      {cells.map((k) => {
        const list = byDay.get(k) ?? [];
        const out = k.slice(0, 7) !== month.slice(0, 7);
        const off = !hours.find((h) => h.weekday === weekday(k))?.is_working || (blocksByDay.get(k) ?? []).some((b) => b.kind === 'folga');
        return (
          <button key={k} type="button" className={`month-cell ${out ? 'out' : ''} ${k === today ? 'today' : ''} ${off && !out ? 'off' : ''}`} onClick={() => onDay(k)}>
            <span className="num">{Number(k.slice(8))}</span>
            {list.slice(0, 3).map((a) => (
              <span key={a.id} className={`month-ev status status-${a.status}`}>
                <b>{formatTime(a.starts_at)}</b> {a.client?.name?.split(' ')[0]}
              </span>
            ))}
            {list.length > 3 && <span className="month-more">+{list.length - 3} mais</span>}
            {list.length > 0 && (
              <span className="month-dots" aria-label={`${list.length} atendimentos`}>
                {list.slice(0, 5).map((a) => <i key={a.id} className={`status status-${a.status}`} />)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const LEGEND: AppointmentStatus[] = ['pendente', 'confirmado', 'concluido', 'nao_compareceu', 'cancelado'];

export default function AgendaPage() {
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || (isMobile ? 'dia' : 'semana');
  const date = params.get('data') || todayKey();
  const [showCancelled, setShowCancelled] = useState(false);
  const actions = useAdminActions();

  const setView = (v: View) => setParams((p) => { p.set('view', v); return p; });
  const setDate = (d: string) => setParams((p) => { p.set('data', d); return p; });

  const range = useMemo(() => {
    if (view === 'dia') return { from: date, to: addDays(date, 1) };
    if (view === 'semana') {
      const s = startOfWeek(date);
      return { from: s, to: addDays(s, 7) };
    }
    const s = startOfWeek(startOfMonth(date));
    return { from: s, to: addDays(s, 42) };
  }, [view, date]);

  const fromIso = spToDate(range.from).toISOString();
  const toIso = spToDate(range.to).toISOString();
  const appts = useAppointments(fromIso, toIso);
  const blocks = useBlocks(fromIso, toIso);
  const wh = useWorkingHours();

  const visible = (appts.data ?? []).filter(
    (a) => showCancelled || !['cancelado', 'nao_compareceu'].includes(a.status),
  );

  const dayKeys = view === 'dia' ? [date] : view === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(range.from, i)) : [];

  // Partes de bloqueios que caem em cada dia (em minutos do dia).
  const blocksByDay = useMemo(() => {
    const m = new Map<string, TimeBlock[]>();
    (blocks.data ?? []).forEach((b) => {
      let k = dateKey(b.starts_at);
      const last = dateKey(new Date(new Date(b.ends_at).getTime() - 1));
      while (k <= last) {
        m.set(k, [...(m.get(k) ?? []), b]);
        k = addDays(k, 1);
      }
    });
    return m;
  }, [blocks.data]);

  const days: DayData[] = dayKeys.map((k) => {
    const dayStart = spToDate(k).getTime();
    const dayEnd = spToDate(addDays(k, 1)).getTime();
    return {
      key: k,
      appts: visible.filter((a) => dateKey(a.starts_at) === k),
      blocks: (blocksByDay.get(k) ?? []).map((block) => ({
        block,
        from: (Math.max(new Date(block.starts_at).getTime(), dayStart) - dayStart) / 60000,
        to: (Math.min(new Date(block.ends_at).getTime(), dayEnd) - dayStart) / 60000,
      })),
      breaks: (wh.data?.breaks ?? []).filter((b) => b.weekday === weekday(k)),
      hours: wh.data?.hours.find((h) => h.weekday === weekday(k)),
    };
  });

  // Faixa de horas: cobre o expediente e qualquer atendimento fora dele.
  const working = (wh.data?.hours ?? []).filter((h) => h.is_working);
  let startHour = working.length ? Math.min(...working.map((h) => Math.floor(timeToMinutes(h.start_time) / 60))) : 8;
  let endHour = working.length ? Math.max(...working.map((h) => Math.ceil(timeToMinutes(h.end_time) / 60))) : 19;
  days.forEach((d) =>
    d.appts.forEach((a) => {
      startHour = Math.min(startHour, Math.floor(minutesOfDay(a.starts_at) / 60));
      endHour = Math.max(endHour, Math.ceil((minutesOfDay(a.starts_at) + a.duration_minutes) / 60));
    }),
  );
  startHour = Math.max(0, startHour);
  endHour = Math.min(24, Math.max(endHour, startHour + 1));

  function move(dir: -1 | 1) {
    if (view === 'dia') setDate(addDays(date, dir));
    else if (view === 'semana') setDate(addDays(date, 7 * dir));
    else setDate(addMonths(startOfMonth(date), dir));
  }

  const title = capitalize(
    view === 'dia'
      ? fmtKey(date, "EEEE, d 'de' MMMM")
      : view === 'semana'
        ? `${fmtKey(range.from, 'd MMM')} – ${fmtKey(addDays(range.from, 6), 'd MMM yyyy')}`
        : fmtKey(date, 'MMMM yyyy'),
  );

  const loading = appts.isLoading || blocks.isLoading || wh.isLoading;
  const error = appts.error || blocks.error || wh.error;

  return (
    <>
      <PageHeader
        title="Agenda"
        actions={
          <>
            <Button variant="secondary" icon={<Lock />} onClick={() => actions.newBlock({ date })}>
              Bloquear
            </Button>
            <Button icon={<CalendarPlus />} onClick={() => actions.newAppointment({ date })}>
              Novo atendimento
            </Button>
          </>
        }
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="agenda-toolbar" style={{ margin: 0 }}>
            <div className="nav">
              <IconButton label="Anterior" bordered onClick={() => move(-1)}><ChevronLeft /></IconButton>
              <IconButton label="Próximo" bordered onClick={() => move(1)}><ChevronRight /></IconButton>
              <Button size="sm" variant="ghost" onClick={() => setDate(todayKey())}>Hoje</Button>
              <h2>{title}</h2>
              {(appts.isFetching || blocks.isFetching) && !loading && <Spinner />}
            </div>
            <Segmented
              label="Visualização"
              value={view}
              onChange={setView}
              options={[
                { value: 'dia', label: 'Dia' },
                { value: 'semana', label: 'Semana' },
                { value: 'mes', label: 'Mês' },
              ]}
            />
          </div>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => { appts.refetch(); blocks.refetch(); wh.refetch(); }} />
        ) : loading ? (
          <div className="loading-block"><Spinner /><p>Carregando agenda…</p></div>
        ) : view === 'mes' ? (
          <MonthGrid
            month={startOfMonth(date)}
            appts={visible}
            blocksByDay={blocksByDay}
            hours={wh.data?.hours ?? []}
            onDay={(k) => setParams((p) => { p.set('view', 'dia'); p.set('data', k); return p; })}
          />
        ) : (
          <Timeline
            days={days}
            startHour={startHour}
            endHour={endHour}
            week={view === 'semana'}
            onOpen={actions.openAppointment}
            onEmpty={(k, t) => actions.newAppointment({ date: k, time: t })}
            onBlock={actions.editBlock}
            onDayClick={(k) => setParams((p) => { p.set('view', 'dia'); p.set('data', k); return p; })}
          />
        )}
        {view === 'dia' && !loading && !error && !days[0]?.appts.length && (
          <p className="small muted center" style={{ padding: '4px 16px 16px' }}>
            {days[0]?.hours?.is_working ? 'Nenhum atendimento neste dia. Toque em um horário para agendar.' : 'Dia sem expediente configurado.'}
          </p>
        )}
      </div>

      <div className="row-between" style={{ marginTop: 4 }}>
        <div className="legend">
          {LEGEND.map((s) => (
            <span key={s} className={`status status-${s}`}><i /> {STATUS_LABEL[s]}</span>
          ))}
          <span><i className="block" /> Bloqueio / folga</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <Checkbox checked={showCancelled} onChange={setShowCancelled}>
            <span className="small">Mostrar cancelados e faltas</span>
          </Checkbox>
        </div>
      </div>
    </>
  );
}
