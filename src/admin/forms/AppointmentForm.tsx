import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { dateKey, formatDuration, formatTime, spToDate, STATUS_LABEL, todayKey, SERVICE_TYPE_LABEL, fmt } from '@/lib/format';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { unwrap, useInvalidate, useServices } from '../api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Callout, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { ClientPicker } from './ClientPicker';

export interface AppointmentDefaults {
  date?: string;
  time?: string;
  clientId?: string;
  serviceId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Atendimento existente: edição/reagendamento. */
  appointment?: Appointment | null;
  defaults?: AppointmentDefaults;
  onSaved?: (a: Appointment) => void;
}

const STATUSES: AppointmentStatus[] = ['confirmado', 'pendente', 'concluido', 'cancelado', 'nao_compareceu'];

export function AppointmentForm({ open, onClose, appointment, defaults, onSaved }: Props) {
  const services = useServices();
  const invalidate = useInvalidate();
  const toast = useToast();
  const editing = !!appointment;

  const [clientId, setClientId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState<number | null>(0);
  const [status, setStatus] = useState<AppointmentStatus>('confirmado');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Preenche o formulário a cada abertura.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTouched(false);
    if (appointment) {
      setClientId(appointment.client_id);
      setServiceId(appointment.service_id ?? '');
      setDate(dateKey(appointment.starts_at));
      setTime(formatTime(appointment.starts_at));
      setDuration(appointment.duration_minutes);
      setPrice(appointment.price_cents);
      setStatus(appointment.status);
      setNotes(appointment.internal_notes ?? '');
    } else {
      setClientId(defaults?.clientId ?? null);
      setServiceId(defaults?.serviceId ?? '');
      setDate(defaults?.date ?? todayKey());
      setTime(defaults?.time ?? '');
      setStatus('confirmado');
      setNotes('');
    }
  }, [open, appointment, defaults]);

  const service = services.data?.find((s) => s.id === serviceId);

  // Ao trocar o serviço num novo atendimento, usa duração e preço dele.
  useEffect(() => {
    if (!service || (editing && service.id === appointment?.service_id)) return;
    setDuration(service.duration_minutes);
    setPrice(service.price_cents);
  }, [service, editing, appointment?.service_id]);

  const suggestions = useQuery({
    queryKey: ['admin-slots', serviceId, date, appointment?.id, duration],
    enabled: open && !!serviceId && !!date && duration > 0,
    queryFn: async () =>
      (unwrap(
        await db().rpc('admin_available_slots', {
          p_service_id: serviceId,
          p_date: date,
          p_exclude_id: appointment?.id ?? null,
          p_duration: duration,
        }),
      ) as { starts_at: string }[]).map((s) => formatTime(s.starts_at)),
  });

  const outside = useMemo(
    () => !!time && !!suggestions.data && !suggestions.isFetching && !suggestions.data.includes(time),
    [time, suggestions.data, suggestions.isFetching],
  );

  async function save() {
    setTouched(true);
    if (!clientId || !serviceId || !date || !time || !duration) {
      setError('Preencha cliente, serviço, data e horário.');
      return;
    }
    setSaving(true);
    setError(null);
    const starts = spToDate(date, time).toISOString();
    const payload = {
      client_id: clientId,
      service_id: serviceId,
      service_name: service?.name ?? appointment?.service_name,
      service_type: service?.type ?? appointment?.service_type,
      duration_minutes: duration,
      price_cents: price ?? 0,
      price_is_from: false,
      starts_at: starts,
      status,
      internal_notes: notes || null,
    };
    try {
      const res = editing
        ? await db().from('appointments').update(payload).eq('id', appointment!.id).select('*, client:clients(id,name,whatsapp,email)').single()
        : await db().from('appointments').insert({ ...payload, source: 'painel' }).select('*, client:clients(id,name,whatsapp,email)').single();
      const saved = unwrap(res) as Appointment;
      await invalidate('appointments', 'admin-slots', 'available-slots', 'available-days', 'maintenance-suggestions');
      toast.success(editing ? 'Atendimento atualizado.' : 'Atendimento agendado.');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      const err = e as { message?: string; code?: string };
      setError(
        err.code === 'P0001' || err.code === '23P01'
          ? err.code === '23P01'
            ? 'Esse horário se sobrepõe a outro atendimento. Escolha um dos horários livres sugeridos.'
            : err.message!
          : 'Não foi possível salvar. Tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  const activeServices = (services.data ?? []).filter((s) => s.active || s.id === serviceId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent
      size="lg"
      title={editing ? 'Editar ou reagendar' : 'Novo atendimento'}
      description={editing ? `Código ${appointment!.code}` : 'Cadastre um horário manualmente na agenda.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save} icon={<CalendarCheck2 />}>
            {editing ? 'Salvar alterações' : 'Agendar'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Callout tone="danger">{error}</Callout>}
        <ClientPicker value={clientId} onChange={setClientId} error={touched && !clientId ? 'Escolha a cliente.' : null} />
        <SelectInput
          label="Serviço"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          error={touched && !serviceId ? 'Escolha o serviço.' : null}
        >
          <option value="">Selecione…</option>
          {activeServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {SERVICE_TYPE_LABEL[s.type]} · {formatDuration(s.duration_minutes)}
              {!s.active ? ' (inativo)' : ''}
            </option>
          ))}
        </SelectInput>
        <div className="form-grid">
          <TextInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextInput label="Horário" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} error={touched && !time ? 'Informe o horário.' : null} />
          <TextInput
            label="Duração (minutos)"
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
          <MoneyInput label="Valor (R$)" cents={price} onChange={setPrice} />
        </div>

        {serviceId && date && (
          <div className="field">
            <span className="field-label">Horários livres em {fmt(spToDate(date, '12:00'), "dd/MM")}</span>
            {suggestions.isLoading ? (
              <Spinner />
            ) : suggestions.data?.length ? (
              <div className="slot-suggest">
                {suggestions.data.map((t) => (
                  <button key={t} type="button" aria-pressed={t === time} onClick={() => setTime(t)}>
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <span className="field-hint">Sem horários livres dentro do expediente neste dia.</span>
            )}
            {outside && (
              <span className="field-hint" style={{ color: 'var(--warning)' }}>
                Horário fora da grade livre (expediente, pausa ou intervalo). Você ainda pode salvar se não houver conflito.
              </span>
            )}
          </div>
        )}

        <SelectInput label="Status" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </SelectInput>
        <TextArea
          label="Observações internas"
          optional
          hint="Visíveis somente no painel."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
