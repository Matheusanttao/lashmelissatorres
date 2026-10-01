import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Appointment, Client, Reminder, TimeBlock } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { AppointmentForm, type AppointmentDefaults } from './forms/AppointmentForm';
import { AppointmentDetails } from './forms/AppointmentDetails';
import { BlockForm, type BlockDefaults } from './forms/BlockForm';
import { ClientForm } from './forms/ClientForm';
import { ReminderForm, type ReminderDefaults } from './forms/ReminderForm';

interface Actions {
  newAppointment: (d?: AppointmentDefaults) => void;
  editAppointment: (a: Appointment) => void;
  openAppointment: (id: string) => void;
  newClient: (onSaved?: (c: Client) => void) => void;
  editClient: (c: Client) => void;
  newBlock: (d?: BlockDefaults) => void;
  editBlock: (b: TimeBlock) => void;
  newReminder: (d?: ReminderDefaults) => void;
  editReminder: (r: Reminder) => void;
}

const Ctx = createContext<Actions | null>(null);

type State =
  | { kind: 'appt-form'; appointment?: Appointment; defaults?: AppointmentDefaults }
  | { kind: 'client-form'; client?: Client; onSaved?: (c: Client) => void }
  | { kind: 'block-form'; block?: TimeBlock; defaults?: BlockDefaults }
  | { kind: 'reminder-form'; reminder?: Reminder; defaults?: ReminderDefaults }
  | null;

/** Modais globais do painel + atualização em tempo real da agenda. */
export function AdminActionsProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<State>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('agenda-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['appointments'] });
        qc.invalidateQueries({ queryKey: ['admin-slots'] });
        const row = payload.new as Partial<Appointment> | undefined;
        if (payload.eventType === 'INSERT' && row?.source === 'site') {
          toast.success(row.status === 'pendente' ? 'Nova solicitação de agendamento pelo site.' : 'Novo agendamento confirmado pelo site.');
        }
      })
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [qc, toast]);

  const actions: Actions = {
    newAppointment: (defaults) => setForm({ kind: 'appt-form', defaults }),
    editAppointment: (appointment) => {
      setDetailsId(null);
      setForm({ kind: 'appt-form', appointment });
    },
    openAppointment: (id) => setDetailsId(id),
    newClient: (onSaved) => setForm({ kind: 'client-form', onSaved }),
    editClient: (client) => setForm({ kind: 'client-form', client }),
    newBlock: (defaults) => setForm({ kind: 'block-form', defaults }),
    editBlock: (block) => setForm({ kind: 'block-form', block }),
    newReminder: (defaults) => setForm({ kind: 'reminder-form', defaults }),
    editReminder: (reminder) => setForm({ kind: 'reminder-form', reminder }),
  };

  const close = () => setForm(null);

  return (
    <Ctx.Provider value={actions}>
      {children}
      <AppointmentDetails id={detailsId} onClose={() => setDetailsId(null)} onEdit={actions.editAppointment} />
      <AppointmentForm
        open={form?.kind === 'appt-form'}
        onClose={close}
        appointment={form?.kind === 'appt-form' ? form.appointment : undefined}
        defaults={form?.kind === 'appt-form' ? form.defaults : undefined}
        onSaved={(a) => setDetailsId(a.id)}
      />
      <ClientForm
        open={form?.kind === 'client-form'}
        onClose={close}
        client={form?.kind === 'client-form' ? form.client : undefined}
        onSaved={form?.kind === 'client-form' ? form.onSaved : undefined}
      />
      <BlockForm
        open={form?.kind === 'block-form'}
        onClose={close}
        block={form?.kind === 'block-form' ? form.block : undefined}
        defaults={form?.kind === 'block-form' ? form.defaults : undefined}
      />
      <ReminderForm
        open={form?.kind === 'reminder-form'}
        onClose={close}
        reminder={form?.kind === 'reminder-form' ? form.reminder : undefined}
        defaults={form?.kind === 'reminder-form' ? form.defaults : undefined}
      />
    </Ctx.Provider>
  );
}

export function useAdminActions(): Actions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminActions fora do provider');
  return ctx;
}
