import { useEffect, useState } from 'react';
import { CalendarOff, Coffee, Lock, MessageCircle, Plus, Save, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { dateKey, formatDateTime, formatKeyDate, addDays, WEEKDAYS, formatTime } from '@/lib/format';
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp';
import type { BookingSettings, WorkingBreak, WorkingHours } from '@/lib/types';
import { unwrap, useBookingSettings, useInvalidate, useUpcomingBlocks, useWorkingHours } from '../api';
import { useAdminActions } from '../AdminActions';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

type Tab = 'expediente' | 'agendamento' | 'bloqueios' | 'mensagens';
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SLOT_AGENDA_KEYS = ['working-hours', 'site-content', 'admin-slots', 'available-slots', 'available-days'];

function HoursTab() {
  const q = useWorkingHours();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [hours, setHours] = useState<WorkingHours[]>([]);
  const [breaks, setBreaks] = useState<(WorkingBreak & { _new?: boolean })[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) {
      setHours(q.data.hours.map((h) => ({ ...h, start_time: h.start_time.slice(0, 5), end_time: h.end_time.slice(0, 5) })));
      setBreaks(q.data.breaks.map((b) => ({ ...b, start_time: b.start_time.slice(0, 5), end_time: b.end_time.slice(0, 5) })));
      setRemoved([]);
    }
  }, [q.data]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const setH = (wd: number, patch: Partial<WorkingHours>) => setHours((l) => l.map((h) => (h.weekday === wd ? { ...h, ...patch } : h)));
  const setB = (id: string, patch: Partial<WorkingBreak>) => setBreaks((l) => l.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  async function save() {
    for (const h of hours) {
      if (h.is_working && h.end_time <= h.start_time) return toast.error(`${WEEKDAYS[h.weekday]}: o fim do expediente precisa ser depois do início.`);
    }
    for (const b of breaks) {
      if (b.end_time <= b.start_time) return toast.error(`Pausa de ${WEEKDAYS[b.weekday]}: o fim precisa ser depois do início.`);
    }
    setSaving(true);
    try {
      unwrap(await db().from('working_hours').upsert(hours.map(({ weekday, is_working, start_time, end_time }) => ({ weekday, is_working, start_time, end_time }))).select('weekday'));
      if (removed.length) unwrap(await db().from('working_breaks').delete().in('id', removed).select('id'));
      const rows = breaks.map(({ _new, id, ...b }) => (_new ? b : { id, ...b }));
      const existing = rows.filter((r) => 'id' in r);
      const created = rows.filter((r) => !('id' in r));
      if (existing.length) unwrap(await db().from('working_breaks').upsert(existing).select('id'));
      if (created.length) unwrap(await db().from('working_breaks').insert(created).select('id'));
      await invalidate(...SLOT_AGENDA_KEYS);
      toast.success('Expediente salvo. O agendamento online já considera os novos horários.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-pad">
      <p className="muted small" style={{ marginBottom: 8 }}>
        Defina os dias de trabalho, o horário de cada dia e as pausas (como almoço). Folgas pontuais e férias ficam em “Folgas e bloqueios”.
      </p>
      {ORDER.map((wd) => {
        const h = hours.find((x) => x.weekday === wd);
        if (!h) return null;
        const dayBreaks = breaks.filter((b) => b.weekday === wd);
        return (
          <div key={wd} className="hours-row">
            <Switch checked={h.is_working} onChange={(v) => setH(wd, { is_working: v })} label={WEEKDAYS[wd]} description={h.is_working ? 'Atende' : 'Folga'} />
            <div>
              {h.is_working ? (
                <>
                  <div className="times">
                    <input className="input" type="time" value={h.start_time} onChange={(e) => setH(wd, { start_time: e.target.value })} aria-label={`Início ${WEEKDAYS[wd]}`} />
                    <span className="muted">às</span>
                    <input className="input" type="time" value={h.end_time} onChange={(e) => setH(wd, { end_time: e.target.value })} aria-label={`Fim ${WEEKDAYS[wd]}`} />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Coffee />}
                      onClick={() => setBreaks((l) => [...l, { id: crypto.randomUUID(), weekday: wd, start_time: '12:00', end_time: '13:00', label: 'Almoço', _new: true }])}
                    >
                      Pausa
                    </Button>
                  </div>
                  {dayBreaks.length > 0 && (
                    <div className="breaks">
                      {dayBreaks.map((b) => (
                        <div key={b.id} className="times" style={{ padding: '6px 8px', borderRadius: 12, background: 'var(--nude-soft)' }}>
                          <Coffee size={15} color="var(--ink-3)" aria-hidden />
                          <input className="input" type="time" value={b.start_time} onChange={(e) => setB(b.id, { start_time: e.target.value })} aria-label="Início da pausa" style={{ width: 110 }} />
                          <span className="muted small">às</span>
                          <input className="input" type="time" value={b.end_time} onChange={(e) => setB(b.id, { end_time: e.target.value })} aria-label="Fim da pausa" style={{ width: 110 }} />
                          <IconButton
                            label="Remover pausa"
                            size="sm"
                            onClick={() => {
                              setBreaks((l) => l.filter((x) => x.id !== b.id));
                              if (!b._new) setRemoved((r) => [...r, b.id]);
                            }}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <span className="muted small">Sem atendimento neste dia.</span>
              )}
            </div>
          </div>
        );
      })}
      <div className="form-actions" style={{ marginTop: 16 }}>
        <Button icon={<Save />} loading={saving} onClick={save}>Salvar expediente</Button>
      </div>
    </div>
  );
}

function BookingTab() {
  const q = useBookingSettings();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [s, setS] = useState<BookingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  if (q.isLoading || !s) return q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <LoadingBlock />;

  const set = <K extends keyof BookingSettings>(k: K, v: BookingSettings[K]) => setS((x) => (x ? { ...x, [k]: v } : x));

  async function save() {
    setSaving(true);
    try {
      const { auto_approve, slot_step_minutes, buffer_minutes, min_advance_hours, max_advance_days, max_pending_per_phone, salon_cut_percent } = s!;
      unwrap(await db().from('booking_settings').update({
        auto_approve, slot_step_minutes, buffer_minutes, min_advance_hours, max_advance_days, max_pending_per_phone, salon_cut_percent,
      }).eq('id', 1).select('id'));
      await invalidate('booking-settings', ...SLOT_AGENDA_KEYS);
      toast.success('Regras de agendamento salvas.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-pad stack" style={{ '--gap': '22px' } as React.CSSProperties}>
      <Switch
        checked={s.auto_approve}
        onChange={(v) => set('auto_approve', v)}
        label="Aprovar automaticamente os agendamentos do site"
        description={s.auto_approve ? 'A cliente recebe o horário confirmado na hora.' : 'Cada solicitação fica pendente até você confirmar. O horário fica reservado enquanto isso.'}
      />
      <div className="form-grid">
        <SelectInput label="Intervalo entre horários oferecidos" value={s.slot_step_minutes} onChange={(e) => set('slot_step_minutes', Number(e.target.value))} hint="De quanto em quanto tempo o site oferece horários de início.">
          {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>A cada {m} minutos</option>)}
        </SelectInput>
        <TextInput label="Intervalo entre atendimentos (min)" type="number" inputMode="numeric" min={0} max={240} value={s.buffer_minutes} onChange={(e) => set('buffer_minutes', Number(e.target.value))} hint="Tempo livre depois de cada cliente para organizar e higienizar." />
        <TextInput label="Antecedência mínima (horas)" type="number" inputMode="numeric" min={0} max={720} value={s.min_advance_hours} onChange={(e) => set('min_advance_hours', Number(e.target.value))} hint="Evita reservas em cima da hora." />
        <TextInput label="Agenda aberta para (dias)" type="number" inputMode="numeric" min={1} max={365} value={s.max_advance_days} onChange={(e) => set('max_advance_days', Number(e.target.value))} hint="Até quantos dias à frente a cliente pode agendar." />
        <TextInput label="Solicitações pendentes por WhatsApp" type="number" inputMode="numeric" min={1} max={10} value={s.max_pending_per_phone} onChange={(e) => set('max_pending_per_phone', Number(e.target.value))} hint="Proteção contra abuso: limite de pedidos em aberto por número." />
        <TextInput
          label="% da dona do salão"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          value={s.salon_cut_percent ?? 30}
          onChange={(e) => set('salon_cut_percent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          hint="Usado na ata diária: quanto do faturamento você repassa para a dona."
        />
      </div>
      <Callout tone="info">
        O banco de dados impede qualquer sobreposição de horários — inclusive quando duas clientes tentam reservar ao mesmo tempo — e
        considera a duração do serviço, este intervalo, o expediente, as pausas, as folgas e os bloqueios.
      </Callout>
      <div className="form-actions">
        <Button icon={<Save />} loading={saving} onClick={save}>Salvar regras</Button>
      </div>
    </div>
  );
}

function BlocksTab() {
  const q = useUpcomingBlocks();
  const actions = useAdminActions();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();

  async function remove(id: string) {
    const ok = await confirm({ title: 'Remover este bloqueio?', message: 'O período volta a ficar disponível para agendamento.', confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    try {
      unwrap(await db().from('time_blocks').delete().eq('id', id).select('id'));
      await invalidate('blocks', 'admin-slots', 'available-slots', 'available-days');
      toast.success('Bloqueio removido.');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Próximas folgas e bloqueios</h3>
        <Button size="sm" icon={<Plus />} onClick={() => actions.newBlock()}>Adicionar</Button>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={CalendarOff} title="Nenhum bloqueio programado" text="Registre férias, cursos, feriados ou compromissos para que esses horários não apareçam no site." />
      ) : (
        <div className="list">
          {q.data.map((b) => (
            <div key={b.id} className="list-item">
              {b.kind === 'folga' ? <CalendarOff size={20} color="var(--accent)" /> : <Lock size={20} color="var(--ink-3)" />}
              <button type="button" className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => actions.editBlock(b)}>
                <strong>
                  {b.kind === 'folga'
                    ? (() => {
                        const first = dateKey(b.starts_at);
                        const last = addDays(dateKey(b.ends_at), -1);
                        return first === last ? `Folga em ${formatKeyDate(first)}` : `Folga de ${formatKeyDate(first)} a ${formatKeyDate(last)}`;
                      })()
                    : `${formatDateTime(b.starts_at)} às ${formatTime(b.ends_at)}`}
                </strong>
                <div className="small muted">{b.reason || (b.kind === 'folga' ? 'Dia inteiro' : 'Horário bloqueado')}</div>
              </button>
              <IconButton label="Remover" size="sm" onClick={() => remove(b.id)}><Trash2 /></IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessagesTab() {
  const q = useBookingSettings();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [m, setM] = useState({ msg_confirm: '', msg_reminder: '', msg_maintenance: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data)
      setM({
        msg_confirm: q.data.msg_confirm || DEFAULT_TEMPLATES.confirm,
        msg_reminder: q.data.msg_reminder || DEFAULT_TEMPLATES.reminder,
        msg_maintenance: q.data.msg_maintenance || DEFAULT_TEMPLATES.maintenance,
      });
  }, [q.data]);

  async function save() {
    setSaving(true);
    try {
      unwrap(await db().from('booking_settings').update(m).eq('id', 1).select('id'));
      await invalidate('booking-settings');
      toast.success('Mensagens salvas.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (q.isLoading) return <LoadingBlock />;
  return (
    <div className="card card-pad stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <Callout tone="info" icon={MessageCircle}>
        Estas mensagens abrem prontas no WhatsApp para você revisar e enviar manualmente. O sistema <strong>não envia mensagens
        automaticamente</strong>. Use {'{nome}'}, {'{estudio}'}, {'{servico}'}, {'{data}'} e {'{hora}'} para preencher os dados.
      </Callout>
      <TextArea label="Confirmação de horário" value={m.msg_confirm} onChange={(e) => setM({ ...m, msg_confirm: e.target.value })} />
      <TextArea label="Lembrete do horário" value={m.msg_reminder} onChange={(e) => setM({ ...m, msg_reminder: e.target.value })} />
      <TextArea label="Convite para manutenção" value={m.msg_maintenance} onChange={(e) => setM({ ...m, msg_maintenance: e.target.value })} />
      <div className="form-actions">
        <Button icon={<Save />} loading={saving} onClick={save}>Salvar mensagens</Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('expediente');
  return (
    <>
      <PageHeader title="Horários e agenda" subtitle="Expediente, pausas, folgas e regras do agendamento online." />
      <div className="tabs" role="tablist">
        {([
          ['expediente', 'Expediente e pausas'],
          ['agendamento', 'Regras de agendamento'],
          ['bloqueios', 'Folgas e bloqueios'],
          ['mensagens', 'Mensagens prontas'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'expediente' && <HoursTab />}
      {tab === 'agendamento' && <BookingTab />}
      {tab === 'bloqueios' && <BlocksTab />}
      {tab === 'mensagens' && <MessagesTab />}
    </>
  );
}
