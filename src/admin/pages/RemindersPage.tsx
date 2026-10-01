import { useState } from 'react';
import { BellPlus, CalendarClock, CalendarPlus, Clock, ListChecks, MessageCircle, Pencil, Sparkles, Trash2, User } from 'lucide-react';
import { db } from '@/lib/supabase';
import { addDays, diffDays, fmtKey, formatKeyDate, todayKey } from '@/lib/format';
import { DEFAULT_TEMPLATES, fillTemplate, whatsappLink } from '@/lib/whatsapp';
import { firstName } from '@/lib/format';
import type { Reminder } from '@/lib/types';
import { unwrap, useBookingSettings, useInvalidate, useMaintenanceSuggestions, useReminders } from '../api';
import { useAdminActions } from '../AdminActions';
import { PageHeader } from '../AdminLayout';
import { useSiteContent } from '@/hooks/useSiteContent';
import { Button, ButtonAnchor, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { SelectInput } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

function dueLabel(r: Reminder, today: string) {
  const d = diffDays(r.due_date, today);
  const time = r.due_time ? ` às ${r.due_time.slice(0, 5)}` : '';
  if (d < 0) return `Venceu ${d === -1 ? 'ontem' : `há ${-d} dias`}${time}`;
  if (d === 0) return `Hoje${time}`;
  if (d === 1) return `Amanhã${time}`;
  return `${fmtKey(r.due_date, "EEE, dd/MM")}${time}`;
}

export default function RemindersPage() {
  const [tab, setTab] = useState<'pendentes' | 'concluidas'>('pendentes');
  const [window, setWindow] = useState(7);
  const reminders = useReminders();
  const suggestions = useMaintenanceSuggestions(window);
  const settings = useBookingSettings();
  const { content } = useSiteContent();
  const actions = useAdminActions();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayKey();

  const list = (reminders.data ?? []).filter((r) => (tab === 'pendentes' ? !r.done : r.done));
  const overdue = list.filter((r) => !r.done && r.due_date < today);
  const todays = list.filter((r) => !r.done && r.due_date === today);
  const next = list.filter((r) => !r.done && r.due_date > today);

  async function toggle(r: Reminder) {
    try {
      unwrap(await db().from('reminders').update({ done: !r.done }).eq('id', r.id).select('id'));
      await invalidate('reminders');
      if (!r.done) toast.success('Tarefa concluída.');
    } catch (e) {
      toast.error(e);
    }
  }

  async function remove(r: Reminder) {
    const ok = await confirm({ title: 'Excluir lembrete?', message: r.title, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      unwrap(await db().from('reminders').delete().eq('id', r.id).select('id'));
      await invalidate('reminders', 'maintenance-suggestions');
      toast.success('Lembrete excluído.');
    } catch (e) {
      toast.error(e);
    }
  }

  const template = settings.data?.msg_maintenance || DEFAULT_TEMPLATES.maintenance;

  const renderItem = (r: Reminder) => {
    const soon = !r.done && r.due_date >= today && r.due_date <= addDays(today, 1);
    const late = !r.done && r.due_date < today;
    return (
      <div key={r.id} className={`reminder ${r.done ? 'done' : ''} ${late ? 'overdue' : soon ? 'soon' : ''}`}>
        <label className="check" style={{ marginTop: 2 }}>
          <input type="checkbox" checked={r.done} onChange={() => toggle(r)} aria-label={r.done ? 'Marcar como pendente' : 'Marcar como concluída'} />
        </label>
        <div style={{ minWidth: 0 }}>
          <div className="reminder-title">{r.title}</div>
          <div className="reminder-meta">
            <span className="row" style={{ gap: 4, color: late ? 'var(--danger)' : soon ? 'var(--warning)' : undefined, fontWeight: late || soon ? 700 : 500 }}>
              <Clock aria-hidden /> {dueLabel(r, today)}
            </span>
            {r.kind === 'manutencao' && <span className="badge badge-accent"><Sparkles aria-hidden /> Manutenção</span>}
            {r.client && <span className="row" style={{ gap: 4 }}><User aria-hidden /> {r.client.name}</span>}
          </div>
          {r.notes && <p className="small muted" style={{ marginTop: 6, whiteSpace: 'pre-line' }}>{r.notes}</p>}
        </div>
        <div className="reminder-actions">
          {r.client && !r.done && (
            <ButtonAnchor
              size="sm"
              variant="soft"
              href={whatsappLink(r.client.whatsapp, r.kind === 'manutencao' ? fillTemplate(template, { nome: firstName(r.client.name), estudio: content.studioName, servico: '' }).replace(' ()', '') : undefined)}
              target="_blank"
              rel="noopener noreferrer"
              icon={<MessageCircle />}
            >
              WhatsApp
            </ButtonAnchor>
          )}
          <IconButton label="Editar" size="sm" onClick={() => actions.editReminder(r)}><Pencil /></IconButton>
          <IconButton label="Excluir" size="sm" onClick={() => remove(r)}><Trash2 /></IconButton>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Lembretes e tarefas"
        subtitle="Organize o dia e acompanhe as manutenções das clientes."
        actions={<Button icon={<BellPlus />} onClick={() => actions.newReminder()}>Novo lembrete</Button>}
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <h3 className="row" style={{ gap: 8 }}><Sparkles size={20} color="var(--accent)" aria-hidden /> Sugestões de manutenção</h3>
            <p className="small muted" style={{ marginTop: 2 }}>
              Clientes cuja manutenção vence em breve (pelo intervalo configurado em cada serviço) e que ainda não têm horário marcado.
            </p>
          </div>
          <SelectInput value={window} onChange={(e) => setWindow(Number(e.target.value))} aria-label="Período das sugestões" style={{ minHeight: 40, width: 170 }}>
            <option value={7}>Próximos 7 dias</option>
            <option value={14}>Próximos 14 dias</option>
            <option value={30}>Próximos 30 dias</option>
          </SelectInput>
        </div>
        {suggestions.isLoading ? (
          <div className="card-body"><Skeleton h={56} /></div>
        ) : suggestions.error ? (
          <ErrorState error={suggestions.error} onRetry={() => suggestions.refetch()} />
        ) : !suggestions.data?.length ? (
          <div className="card-body small muted">Nenhuma manutenção para sugerir neste período.</div>
        ) : (
          suggestions.data.map((s) => {
            const msg = fillTemplate(template, { nome: firstName(s.client_name), estudio: content.studioName, servico: s.service_name });
            return (
              <div key={s.client_id} className="suggest-card">
                <div className="grow">
                  <strong>{s.client_name}</strong>
                  <div className="small muted">
                    {s.service_name} em {formatKeyDate(s.last_visit)} · manutenção{' '}
                    <strong style={{ color: s.days_until < 0 ? 'var(--danger)' : s.days_until <= 2 ? 'var(--warning)' : 'var(--ink)' }}>
                      {s.days_until < 0 ? `atrasada ${-s.days_until} dia(s)` : s.days_until === 0 ? 'vence hoje' : `em ${s.days_until} dia(s)`}
                    </strong>{' '}
                    ({formatKeyDate(s.due_date)})
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <ButtonAnchor size="sm" variant="whatsapp" href={whatsappLink(s.whatsapp, msg)} target="_blank" rel="noopener noreferrer" icon={<MessageCircle />}>
                    Mensagem
                  </ButtonAnchor>
                  <Button size="sm" variant="secondary" icon={<CalendarPlus />} onClick={() => actions.newAppointment({ clientId: s.client_id })}>
                    Agendar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<CalendarClock />}
                    onClick={() =>
                      actions.newReminder({
                        title: `Manutenção — ${s.client_name}`,
                        due_date: s.due_date < today ? today : addDays(s.due_date, -2) < today ? today : addDays(s.due_date, -2),
                        client_id: s.client_id,
                        service_id: s.service_id,
                        kind: 'manutencao',
                        notes: `Última visita: ${s.service_name} em ${formatKeyDate(s.last_visit)}. Manutenção prevista para ${formatKeyDate(s.due_date)}.`,
                      })
                    }
                  >
                    Criar lembrete
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pendentes'} onClick={() => setTab('pendentes')}>Pendentes</button>
        <button role="tab" aria-selected={tab === 'concluidas'} onClick={() => setTab('concluidas')}>Concluídas</button>
      </div>

      {reminders.isLoading ? (
        <div className="card card-pad stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={50} />)}</div>
      ) : reminders.error ? (
        <ErrorState error={reminders.error} onRetry={() => reminders.refetch()} />
      ) : !list.length ? (
        <div className="card">
          <EmptyState
            icon={ListChecks}
            title={tab === 'pendentes' ? 'Nenhuma tarefa pendente' : 'Nada concluído ainda'}
            text={tab === 'pendentes' ? 'Crie lembretes para compras, retornos e compromissos do estúdio.' : undefined}
            action={tab === 'pendentes' ? <Button icon={<BellPlus />} onClick={() => actions.newReminder()}>Criar lembrete</Button> : undefined}
          />
        </div>
      ) : tab === 'concluidas' ? (
        <div className="card">{list.map(renderItem)}</div>
      ) : (
        <div className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
          {overdue.length > 0 && (
            <div className="card">
              <div className="card-head"><h3 style={{ color: 'var(--danger)' }}>Vencidas</h3><span className="badge badge-danger">{overdue.length}</span></div>
              {overdue.map(renderItem)}
            </div>
          )}
          {todays.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Hoje</h3><span className="badge badge-warning">{todays.length}</span></div>
              {todays.map(renderItem)}
            </div>
          )}
          {next.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Próximas</h3></div>
              {next.map(renderItem)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
