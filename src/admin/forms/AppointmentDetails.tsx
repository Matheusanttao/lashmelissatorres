import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban, BellRing, CalendarClock, CheckCheck, CircleCheck, Globe, MessageCircle, UserX, Wallet, Pencil, RotateCcw, ExternalLink,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import {
  capitalize, formatDateTime, formatDuration, formatLongDate, formatMoney, formatPhone, formatTime, SERVICE_TYPE_LABEL,
} from '@/lib/format';
import { appointmentVars, DEFAULT_TEMPLATES, fillTemplate, whatsappLink } from '@/lib/whatsapp';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { setAppointmentStatus, unwrap, useAppointment, useBookingSettings, useInvalidate } from '../api';
import { useSiteContent } from '@/hooks/useSiteContent';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { Button, ButtonAnchor } from '@/components/ui/Button';
import { MoneyInput, SelectInput, TextArea } from '@/components/ui/Field';
import { Callout, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Brand';
import { useToast } from '@/components/ui/Toast';

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Outro'];

export function AppointmentDetails({
  id,
  onClose,
  onEdit,
}: {
  id: string | null;
  onClose: () => void;
  onEdit: (a: Appointment) => void;
}) {
  const q = useAppointment(id);
  const settings = useBookingSettings();
  const { content } = useSiteContent();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();
  const a = q.data;

  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);
  const [method, setMethod] = useState('Pix');

  useEffect(() => {
    if (a) {
      setNotes(a.internal_notes ?? '');
      setPaid(a.paid_cents ?? a.price_cents);
      setMethod(a.payment_method ?? 'Pix');
      setPaying(false);
    }
  }, [a]);

  const refresh = () => invalidate('appointments', 'admin-slots', 'available-slots', 'available-days', 'maintenance-suggestions');

  async function changeStatus(status: AppointmentStatus, label: string, extra: Partial<Appointment> = {}) {
    if (!a) return;
    setBusy(status);
    try {
      await setAppointmentStatus(a.id, status, extra);
      await refresh();
      toast.success(label);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: 'Cancelar este atendimento?',
      message: 'O horário será liberado na agenda e no site. Você pode avisar a cliente pelo WhatsApp depois.',
      confirmLabel: 'Cancelar atendimento',
      danger: true,
    });
    if (ok) changeStatus('cancelado', 'Atendimento cancelado.');
  }

  async function noShow() {
    const ok = await confirm({
      title: 'Marcar como "não compareceu"?',
      message: 'O horário deixa de contar como previsto e fica registrado no histórico da cliente.',
      confirmLabel: 'Confirmar',
    });
    if (ok) changeStatus('nao_compareceu', 'Registrado como não compareceu.');
  }

  async function saveNotes() {
    if (!a) return;
    setBusy('notes');
    try {
      unwrap(await db().from('appointments').update({ internal_notes: notes || null }).eq('id', a.id).select('id'));
      await refresh();
      toast.success('Observação salva.');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function savePayment(clear = false) {
    if (!a) return;
    setBusy('pay');
    try {
      unwrap(
        await db()
          .from('appointments')
          .update(clear ? { paid_cents: null, payment_method: null } : { paid_cents: paid ?? 0, payment_method: method })
          .eq('id', a.id)
          .select('id'),
      );
      await refresh();
      setPaying(false);
      toast.success(clear ? 'Pagamento removido.' : 'Pagamento registrado.');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  const client = a?.client;
  const vars = a && client
    ? appointmentVars({ clientName: client.name, studioName: content.studioName, serviceName: a.service_name, startsAt: a.starts_at })
    : null;
  const msgConfirm = vars ? fillTemplate(settings.data?.msg_confirm || DEFAULT_TEMPLATES.confirm, vars) : '';
  const msgReminder = vars ? fillTemplate(settings.data?.msg_reminder || DEFAULT_TEMPLATES.reminder, vars) : '';
  const active = a && ['pendente', 'confirmado'].includes(a.status);

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={a ? a.service_name : 'Atendimento'}
      description={a ? capitalize(`${formatLongDate(a.starts_at)} · ${formatTime(a.starts_at)} às ${formatTime(a.ends_at)}`) : undefined}
      footer={
        a && (
          <>
            {active && (
              <Button variant="danger-soft" icon={<Ban />} onClick={cancel} loading={busy === 'cancelado'}>
                Cancelar
              </Button>
            )}
            {(a.status === 'cancelado' || a.status === 'nao_compareceu') && (
              <Button variant="secondary" icon={<RotateCcw />} loading={busy === 'confirmado'} onClick={() => changeStatus('confirmado', 'Atendimento reativado.')}>
                Reativar
              </Button>
            )}
            <Button variant="secondary" icon={<Pencil />} onClick={() => onEdit(a)}>
              Editar / reagendar
            </Button>
          </>
        )
      }
    >
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error || !a ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <div className="row-between">
            <div className="row">
              <StatusBadge status={a.status} />
              {a.source === 'site' && (
                <span className="badge badge-info"><Globe aria-hidden /> Pelo site</span>
              )}
            </div>
            <span className="small subtle">Código {a.code}</span>
          </div>

          {a.status === 'pendente' && (
            <Callout tone="warning" icon={BellRing}>
              <strong>Solicitação aguardando sua confirmação.</strong> O horário já está reservado para evitar conflitos.
              <div className="row" style={{ marginTop: 10 }}>
                <Button size="sm" icon={<CircleCheck />} loading={busy === 'confirmado'} onClick={() => changeStatus('confirmado', 'Atendimento confirmado.')}>
                  Confirmar
                </Button>
                {client && (
                  <ButtonAnchor size="sm" variant="whatsapp" href={whatsappLink(client.whatsapp, msgConfirm)} target="_blank" rel="noopener noreferrer" icon={<MessageCircle />}>
                    Avisar no WhatsApp
                  </ButtonAnchor>
                )}
              </div>
            </Callout>
          )}

          <div className="detail-grid">
            <div className="detail">
              <small>Cliente</small>
              {client ? (
                <Link to={`/admin/clientes/${client.id}`} className="link" onClick={onClose}>
                  {client.name} <ExternalLink size={13} style={{ display: 'inline', verticalAlign: '-1px' }} />
                </Link>
              ) : '—'}
            </div>
            <div className="detail">
              <small>WhatsApp</small>
              <span>{client ? formatPhone(client.whatsapp) : '—'}</span>
            </div>
            {client?.email && (
              <div className="detail">
                <small>E-mail</small>
                <span>{client.email}</span>
              </div>
            )}
            <div className="detail">
              <small>Serviço</small>
              <span>{a.service_name} · {SERVICE_TYPE_LABEL[a.service_type]}</span>
            </div>
            <div className="detail">
              <small>Duração</small>
              <span>{formatDuration(a.duration_minutes)}{a.buffer_minutes ? ` + ${a.buffer_minutes} min de intervalo` : ''}</span>
            </div>
            <div className="detail">
              <small>Valor previsto</small>
              <span>{formatMoney(a.price_cents)}{a.price_is_from ? ' (a partir de)' : ''}</span>
            </div>
            <div className="detail">
              <small>Valor recebido</small>
              <span>{a.paid_cents != null ? `${formatMoney(a.paid_cents)} · ${a.payment_method ?? ''}` : 'Não registrado'}</span>
            </div>
            <div className="detail">
              <small>Criado em</small>
              <span>{formatDateTime(a.created_at)}</span>
            </div>
          </div>

          {a.client_message && (
            <div className="field">
              <span className="field-label">Mensagem da cliente</span>
              <div className="note-box">{a.client_message}</div>
            </div>
          )}

          {a.status !== 'cancelado' && (
            <div className="field">
              <span className="field-label">Andamento</span>
              <div className="status-actions">
                {a.status !== 'confirmado' && a.status !== 'concluido' && (
                  <Button size="sm" variant="soft" icon={<CircleCheck />} loading={busy === 'confirmado'} onClick={() => changeStatus('confirmado', 'Atendimento confirmado.')}>
                    Confirmar
                  </Button>
                )}
                {a.status !== 'concluido' && (
                  <Button size="sm" variant="soft" icon={<CheckCheck />} loading={busy === 'concluido'} onClick={() => changeStatus('concluido', 'Atendimento concluído.')}>
                    Concluir
                  </Button>
                )}
                {a.status !== 'nao_compareceu' && (
                  <Button size="sm" variant="ghost" icon={<UserX />} onClick={noShow}>
                    Não compareceu
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<Wallet />} onClick={() => setPaying((v) => !v)}>
                  {a.paid_cents != null ? 'Alterar pagamento' : 'Registrar pagamento'}
                </Button>
              </div>
            </div>
          )}

          {paying && (
            <div className="card" style={{ padding: 16, boxShadow: 'none', background: 'var(--nude-soft)' }}>
              <div className="form-grid">
                <MoneyInput label="Valor recebido (R$)" cents={paid} onChange={setPaid} />
                <SelectInput label="Forma de pagamento" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </SelectInput>
              </div>
              <div className="form-actions" style={{ marginTop: 12 }}>
                {a.paid_cents != null && (
                  <Button size="sm" variant="ghost" onClick={() => savePayment(true)}>Remover pagamento</Button>
                )}
                <Button size="sm" loading={busy === 'pay'} onClick={() => savePayment()}>Salvar pagamento</Button>
              </div>
            </div>
          )}

          <div className="field">
            <span className="field-label">Observações internas <span className="optional">(não aparecem no site)</span></span>
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: curvatura C, 11 mm, cola para olhos sensíveis…" />
            {notes !== (a.internal_notes ?? '') && (
              <Button size="sm" variant="soft" style={{ alignSelf: 'flex-end' }} loading={busy === 'notes'} onClick={saveNotes}>
                Salvar observação
              </Button>
            )}
          </div>

          {client && active && (
            <div className="field">
              <span className="field-label">Mensagens prontas</span>
              <span className="field-hint">Abre o WhatsApp com o texto preenchido. O envio é feito por você.</span>
              <div className="row">
                <ButtonAnchor size="sm" variant="secondary" href={whatsappLink(client.whatsapp, msgConfirm)} target="_blank" rel="noopener noreferrer" icon={<MessageCircle />}>
                  Confirmação
                </ButtonAnchor>
                <ButtonAnchor size="sm" variant="secondary" href={whatsappLink(client.whatsapp, msgReminder)} target="_blank" rel="noopener noreferrer" icon={<CalendarClock />}>
                  Lembrete do horário
                </ButtonAnchor>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
