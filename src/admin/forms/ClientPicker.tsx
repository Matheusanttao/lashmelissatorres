import { useEffect, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/supabase';
import { formatPhone, initials, isValidPhone } from '@/lib/format';
import type { Client } from '@/lib/types';
import { unwrap, useClients, useInvalidate } from '../api';
import { Button, IconButton } from '@/components/ui/Button';
import { PhoneInput, TextInput } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Busca por nome/telefone com opção de cadastrar rapidamente. */
export function ClientPicker({
  value,
  onChange,
  error,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string | null;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const list = useClients(debounced);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const invalidate = useInvalidate();

  const selected = useQuery({
    queryKey: ['clients', 'one', value],
    enabled: !!value,
    queryFn: async () => unwrap(await db().from('clients').select('*').eq('id', value!).single()) as Client,
  });

  async function create() {
    if (name.trim().length < 2) return toast.error('Informe o nome da cliente.');
    if (!isValidPhone(phone)) return toast.error('Informe um WhatsApp válido com DDD.');
    setSaving(true);
    try {
      const c = unwrap(await db().from('clients').insert({ name, whatsapp: phone, source: 'painel' }).select().single()) as Client;
      await invalidate('clients');
      onChange(c.id);
      setCreating(false);
      setName('');
      setPhone('');
      toast.success('Cliente cadastrada.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (value) {
    const c = selected.data;
    return (
      <div className="field">
        <span className="field-label">Cliente</span>
        <div className="row card" style={{ padding: '10px 12px', boxShadow: 'none', flexWrap: 'nowrap' }}>
          <span className="avatar">{c ? initials(c.name) : ''}</span>
          <div className="grow">
            <strong>{c?.name ?? 'Carregando…'}</strong>
            <div className="small muted">{c ? formatPhone(c.whatsapp) : ''}</div>
          </div>
          <IconButton label="Trocar cliente" size="sm" onClick={() => onChange(null)}>
            <X />
          </IconButton>
        </div>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="card" style={{ padding: 14, boxShadow: 'none', background: 'var(--nude-soft)' }}>
        <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
          <strong>Nova cliente</strong>
          <TextInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <PhoneInput label="WhatsApp" value={phone} onChange={setPhone} />
          <div className="form-actions">
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={create}>Cadastrar e selecionar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor="client-search">Cliente</label>
      <div className="input-group">
        <Search aria-hidden />
        <input
          id="client-search"
          className="input"
          placeholder="Buscar por nome ou WhatsApp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
        />
      </div>
      {error && <span className="field-error">{error}</span>}
      <div className="card" style={{ boxShadow: 'none', maxHeight: 240, overflowY: 'auto' }}>
        {list.isLoading ? (
          <div className="row" style={{ padding: 14 }}><Spinner /> <span className="muted small">Buscando…</span></div>
        ) : (
          <div className="list">
            {(list.data ?? []).slice(0, 8).map((c) => (
              <button key={c.id} type="button" className="list-item clickable" style={{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', textAlign: 'left', width: '100%' }} onClick={() => onChange(c.id)}>
                <span className="avatar">{initials(c.name)}</span>
                <span className="grow">
                  <strong style={{ display: 'block' }}>{c.name}</strong>
                  <span className="small muted">{formatPhone(c.whatsapp)}</span>
                </span>
              </button>
            ))}
            {!list.data?.length && <div className="small muted" style={{ padding: 14 }}>Nenhuma cliente encontrada.</div>}
          </div>
        )}
      </div>
      <Button
        variant="soft"
        size="sm"
        icon={<UserPlus />}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          setCreating(true);
          if (/\d{4,}/.test(search)) setPhone(search.replace(/\D/g, ''));
          else setName(search);
        }}
      >
        Cadastrar nova cliente
      </Button>
    </div>
  );
}
