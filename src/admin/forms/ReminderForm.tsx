import { useEffect, useState } from 'react';
import { BellPlus } from 'lucide-react';
import { db } from '@/lib/supabase';
import { todayKey } from '@/lib/format';
import type { Reminder } from '@/lib/types';
import { unwrap, useInvalidate } from '../api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Switch, TextArea, TextInput } from '@/components/ui/Field';
import { Callout } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { ClientPicker } from './ClientPicker';

export type ReminderDefaults = Partial<Pick<Reminder, 'title' | 'notes' | 'due_date' | 'due_time' | 'client_id' | 'service_id' | 'kind'>>;

export function ReminderForm({
  open,
  onClose,
  reminder,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  reminder?: Reminder | null;
  defaults?: ReminderDefaults;
}) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [linkClient, setLinkClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const src = reminder ?? defaults ?? {};
    setTitle(src.title ?? '');
    setDate(src.due_date ?? todayKey());
    setTime(src.due_time?.slice(0, 5) ?? '');
    setNotes(src.notes ?? '');
    setClientId(src.client_id ?? null);
    setLinkClient(!!src.client_id);
    setError(null);
  }, [open, reminder, defaults]);

  async function save() {
    if (!title.trim()) return setError('Dê um título ao lembrete.');
    if (!date) return setError('Informe a data.');
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      due_date: date,
      due_time: time || null,
      notes: notes || null,
      client_id: linkClient ? clientId : null,
      kind: reminder?.kind ?? defaults?.kind ?? 'manual',
      service_id: reminder?.service_id ?? defaults?.service_id ?? null,
    };
    try {
      unwrap(
        reminder
          ? await db().from('reminders').update(payload).eq('id', reminder.id).select('id')
          : await db().from('reminders').insert(payload).select('id'),
      );
      await invalidate('reminders', 'maintenance-suggestions');
      toast.success(reminder ? 'Lembrete atualizado.' : 'Lembrete criado.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reminder ? 'Editar lembrete' : 'Novo lembrete'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} icon={<BellPlus />} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="stack">
        {error && <Callout tone="danger">{error}</Callout>}
        <TextInput label="Título" placeholder="Ex.: Comprar cola, confirmar horários de sábado" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        <div className="form-grid">
          <TextInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextInput label="Horário" optional type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <TextArea label="Observação" optional value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Switch checked={linkClient} onChange={setLinkClient} label="Vincular a uma cliente" description="Mostra o botão de WhatsApp no lembrete." />
        {linkClient && <ClientPicker value={clientId} onChange={setClientId} />}
      </div>
    </Modal>
  );
}
