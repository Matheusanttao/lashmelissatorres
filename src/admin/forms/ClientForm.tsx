import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { db } from '@/lib/supabase';
import { isValidEmail, isValidPhone } from '@/lib/format';
import type { Client } from '@/lib/types';
import { unwrap, useInvalidate } from '../api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PhoneInput, TextArea, TextInput } from '@/components/ui/Field';
import { Callout } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';

export function ClientForm({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client | null;
  onSaved?: (c: Client) => void;
}) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', whatsapp: '', email: '', style_preferences: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setError(null);
    setForm({
      name: client?.name ?? '',
      whatsapp: client?.whatsapp ?? '',
      email: client?.email ?? '',
      style_preferences: client?.style_preferences ?? '',
      notes: client?.notes ?? '',
    });
  }, [open, client]);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function save() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Informe o nome.';
    if (!isValidPhone(form.whatsapp)) e.whatsapp = 'Informe um WhatsApp válido com DDD.';
    if (form.email && !isValidEmail(form.email)) e.email = 'E-mail inválido.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      whatsapp: form.whatsapp,
      email: form.email || null,
      style_preferences: form.style_preferences || null,
      notes: form.notes || null,
    };
    try {
      const saved = unwrap(
        client
          ? await db().from('clients').update(payload).eq('id', client.id).select().single()
          : await db().from('clients').insert({ ...payload, source: 'painel' }).select().single(),
      ) as Client;
      await invalidate('clients', 'appointments');
      toast.success(client ? 'Cadastro atualizado.' : 'Cliente cadastrada.');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent
      title={client ? 'Editar cliente' : 'Nova cliente'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} icon={<UserCheck />} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="stack">
        {error && <Callout tone="danger">{error}</Callout>}
        <TextInput label="Nome" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} maxLength={120} />
        <div className="form-grid">
          <PhoneInput label="WhatsApp" value={form.whatsapp} onChange={(v) => set('whatsapp', v)} error={errors.whatsapp} />
          <TextInput label="E-mail" optional type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
        </div>
        <TextArea
          label="Preferências de estilo"
          optional
          placeholder="Ex.: gosta de efeito natural, curvatura C, 10–12 mm, sem fios coloridos"
          value={form.style_preferences}
          onChange={(e) => set('style_preferences', e.target.value)}
        />
        <TextArea
          label="Observações"
          optional
          hint="Alergias, sensibilidade, cuidados especiais. Visível somente no painel."
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
    </Modal>
  );
}
