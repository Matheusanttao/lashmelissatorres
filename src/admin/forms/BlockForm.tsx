import { useEffect, useState } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { addDays, dateKey, formatTime, spToDate, todayKey } from '@/lib/format';
import type { TimeBlock } from '@/lib/types';
import { unwrap, useInvalidate } from '../api';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Segmented, TextInput } from '@/components/ui/Field';
import { Callout } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';

export interface BlockDefaults {
  date?: string;
  time?: string;
}

/** Bloqueio de horário ou folga (um ou mais dias inteiros). */
export function BlockForm({
  open,
  onClose,
  block,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  block?: TimeBlock | null;
  defaults?: BlockDefaults;
}) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState<'bloqueio' | 'folga'>('bloqueio');
  const [date, setDate] = useState(todayKey());
  const [endDate, setEndDate] = useState(todayKey());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (block) {
      setKind(block.kind);
      setDate(dateKey(block.starts_at));
      setStart(formatTime(block.starts_at));
      setEnd(formatTime(block.ends_at));
      // Folga termina à meia-noite do dia seguinte ao último dia.
      setEndDate(block.kind === 'folga' ? addDays(dateKey(block.ends_at), -1) : dateKey(block.ends_at));
      setReason(block.reason ?? '');
    } else {
      const d = defaults?.date ?? todayKey();
      setKind('bloqueio');
      setDate(d);
      setEndDate(d);
      const s = defaults?.time ?? '09:00';
      setStart(s);
      const [h, m] = s.split(':').map(Number);
      setEnd(`${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      setReason('');
    }
  }, [open, block, defaults]);

  async function save() {
    let starts: Date, ends: Date;
    if (kind === 'folga') {
      if (endDate < date) return setError('A data final precisa ser igual ou depois da inicial.');
      starts = spToDate(date, '00:00');
      ends = spToDate(addDays(endDate, 1), '00:00');
    } else {
      if (end <= start) return setError('O horário final precisa ser depois do inicial.');
      starts = spToDate(date, start);
      ends = spToDate(date, end);
    }
    setSaving(true);
    setError(null);
    const payload = { kind, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: reason || null };
    try {
      unwrap(
        block
          ? await db().from('time_blocks').update(payload).eq('id', block.id).select('id')
          : await db().from('time_blocks').insert(payload).select('id'),
      );
      await invalidate('blocks', 'admin-slots', 'available-slots', 'available-days');
      toast.success(kind === 'folga' ? 'Folga registrada.' : 'Horário bloqueado.');
      onClose();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(err.code === 'P0001' ? err.message! : 'Não foi possível salvar o bloqueio.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!block) return;
    const ok = await confirm({
      title: 'Remover este bloqueio?',
      message: 'O período volta a ficar disponível para agendamentos.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      unwrap(await db().from('time_blocks').delete().eq('id', block.id).select('id'));
      await invalidate('blocks', 'admin-slots', 'available-slots', 'available-days');
      toast.success('Bloqueio removido.');
      onClose();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={block ? 'Editar bloqueio' : 'Bloquear horário'}
      description="Períodos bloqueados não aparecem para agendamento no site."
      footer={
        <>
          {block && (
            <Button variant="danger-soft" icon={<Trash2 />} onClick={remove} style={{ marginRight: 'auto' }}>
              Remover
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} icon={<Lock />} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="stack">
        {error && <Callout tone="danger">{error}</Callout>}
        <Segmented
          label="Tipo de bloqueio"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'bloqueio', label: 'Algumas horas' },
            { value: 'folga', label: 'Folga (dia inteiro)' },
          ]}
        />
        {kind === 'folga' ? (
          <div className="form-grid">
            <TextInput label="Primeiro dia" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
            <TextInput label="Último dia" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        ) : (
          <div className="form-grid">
            <TextInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} wrapClassName="span-all" />
            <TextInput label="Das" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
            <TextInput label="Até" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        <TextInput label="Motivo" optional placeholder="Ex.: curso, consulta médica, férias" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
      </div>
    </Modal>
  );
}
