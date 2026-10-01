import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { formatDuration, formatPrice, SERVICE_TYPE_LABEL, SERVICE_TYPE_PLURAL } from '@/lib/format';
import { removePublic } from '@/lib/storage';
import type { Service, ServiceType } from '@/lib/types';
import { moveId, saveOrder, unwrap, useInvalidate, useServices } from '../api';
import { PageHeader } from '../AdminLayout';
import { Photo } from '@/components/ui/Brand';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { MoneyInput, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const TYPES: ServiceType[] = ['aplicacao', 'manutencao', 'remocao'];
type Form = Omit<Service, 'id' | 'created_at' | 'sort_order'>;
const EMPTY: Form = {
  name: '', description: '', type: 'aplicacao', duration_minutes: 120, price_cents: 0, price_is_from: false,
  image_url: null, image_path: null, active: true, featured: false, maintenance_interval_days: null, maintenance_rules: '',
};

function ServiceForm({ open, onClose, service, nextOrder }: { open: boolean; onClose: () => void; service?: Service | null; nextOrder: number }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(service ? { ...EMPTY, ...service, description: service.description ?? '', maintenance_rules: service.maintenance_rules ?? '' } : EMPTY);
  }, [open, service]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (f.name.trim().length < 2) return setError('Informe o nome do serviço.');
    if (!f.duration_minutes || f.duration_minutes < 5) return setError('Informe a duração em minutos.');
    setSaving(true);
    setError(null);
    const payload = {
      ...f,
      name: f.name.trim(),
      description: f.description || null,
      maintenance_rules: f.maintenance_rules || null,
      maintenance_interval_days: f.maintenance_interval_days || null,
    };
    try {
      if (service) {
        unwrap(await db().from('services').update(payload).eq('id', service.id).select('id'));
        if (service.image_path && service.image_path !== f.image_path) await removePublic([service.image_path]);
      } else {
        unwrap(await db().from('services').insert({ ...payload, sort_order: nextOrder }).select('id'));
      }
      await invalidate('services', 'public-services');
      toast.success(service ? 'Serviço atualizado.' : 'Serviço criado.');
      onClose();
    } catch (e) {
      setError('Não foi possível salvar o serviço.');
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent
      size="lg"
      title={service ? 'Editar serviço' : 'Novo serviço'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Salvar serviço</Button>
        </>
      }
    >
      <div className="stack">
        {error && <Callout tone="danger">{error}</Callout>}
        <div className="form-grid">
          <TextInput label="Nome" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} wrapClassName="span-all" />
          <SelectInput label="Categoria" value={f.type} onChange={(e) => set('type', e.target.value as ServiceType)}>
            {TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABEL[t]}</option>)}
          </SelectInput>
          <TextInput label="Duração (minutos)" type="number" inputMode="numeric" min={5} max={600} step={5} value={f.duration_minutes} onChange={(e) => set('duration_minutes', Number(e.target.value))} hint={f.duration_minutes ? formatDuration(f.duration_minutes) : undefined} />
          <MoneyInput label="Preço (R$)" cents={f.price_cents} onChange={(v) => set('price_cents', v ?? 0)} />
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <Switch checked={f.price_is_from} onChange={(v) => set('price_is_from', v)} label="Preço “a partir de”" description="Mostra “a partir de” antes do valor." />
          </div>
        </div>
        <TextArea label="Descrição" optional value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Conte o efeito, para quem é indicado e o que torna especial." />
        <ImageUpload label="Foto do procedimento" value={f.image_url} folder="servicos" onChange={(url, path) => setF((x) => ({ ...x, image_url: url, image_path: path }))} hint="Fotos verticais ou quadradas ficam lindas nos cartões." />
        <div className="card" style={{ padding: 16, boxShadow: 'none', background: 'var(--nude-soft)' }}>
          <strong className="row" style={{ gap: 8, marginBottom: 12 }}><Sparkles size={18} color="var(--accent)" /> Manutenção</strong>
          <div className="form-grid">
            <TextInput
              label="Sugerir manutenção após (dias)"
              optional
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={f.maintenance_interval_days ?? ''}
              onChange={(e) => set('maintenance_interval_days', e.target.value ? Number(e.target.value) : null)}
              hint="Usado nas sugestões de lembrete. Deixe vazio para não sugerir."
            />
            <TextInput label="Condições de manutenção" optional value={f.maintenance_rules ?? ''} onChange={(e) => set('maintenance_rules', e.target.value)} placeholder="Ex.: válida até 21 dias após a aplicação" />
          </div>
        </div>
        <div className="row" style={{ gap: 24 }}>
          <Switch checked={f.active} onChange={(v) => set('active', v)} label="Ativo no site" description="Aparece na tabela e no agendamento." />
          <Switch checked={f.featured} onChange={(v) => set('featured', v)} label="Destaque" description="Mostrado na página inicial." />
        </div>
      </div>
    </Modal>
  );
}

export default function ServicesAdminPage() {
  const q = useServices();
  const invalidate = useInvalidate();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Service | null | undefined>(undefined);

  const services = q.data ?? [];

  async function toggle(s: Service, field: 'active' | 'featured') {
    try {
      unwrap(await db().from('services').update({ [field]: !s[field] }).eq('id', s.id).select('id'));
      await invalidate('services', 'public-services');
      toast.success(field === 'active' ? (s.active ? 'Serviço desativado — saiu do site.' : 'Serviço ativado — já aparece no site.') : 'Destaque atualizado.');
    } catch (e) {
      toast.error(e);
    }
  }

  async function move(s: Service, dir: -1 | 1) {
    const ids = services.filter((x) => x.type === s.type).map((x) => x.id);
    try {
      await saveOrder('services', moveId(ids, s.id, dir));
      await invalidate('services', 'public-services');
    } catch (e) {
      toast.error(e);
    }
  }

  async function remove(s: Service) {
    const ok = await confirm({
      title: `Excluir “${s.name}”?`,
      message: 'Os atendimentos já registrados continuam no histórico. Se quiser apenas tirar do site, prefira desativar.',
      confirmLabel: 'Excluir serviço',
      danger: true,
    });
    if (!ok) return;
    try {
      unwrap(await db().from('services').delete().eq('id', s.id).select('id'));
      await removePublic([s.image_path]);
      await invalidate('services', 'public-services');
      toast.success('Serviço excluído.');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <PageHeader
        title="Serviços e preços"
        subtitle="O que estiver ativo aparece no site e no agendamento online."
        actions={<Button icon={<Plus />} onClick={() => setEditing(null)}>Novo serviço</Button>}
      />
      {q.isLoading ? (
        <div className="admin-grid">{[0, 1, 2].map((i) => <Skeleton key={i} h={300} r={24} />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !services.length ? (
        <div className="card">
          <EmptyState
            icon={Sparkles}
            title="Cadastre seu primeiro serviço"
            text="Enquanto não houver serviços, o site mostra uma tabela de exemplo e o agendamento online fica fechado."
            action={<Button icon={<Plus />} onClick={() => setEditing(null)}>Criar serviço</Button>}
          />
        </div>
      ) : (
        TYPES.map((type) => {
          const list = services.filter((s) => s.type === type);
          if (!list.length) return null;
          return (
            <section key={type} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: '1.6rem', marginBottom: 12 }}>{SERVICE_TYPE_PLURAL[type]}</h2>
              <div className="admin-grid">
                {list.map((s, i) => (
                  <article key={s.id} className={`card admin-card ${s.active ? '' : 'inactive'}`}>
                    <div className="media">
                      <Photo src={s.image_url} alt="" seed={i} demoLabel={s.image_url ? null : 'Sem foto'} />
                      <div className="badges">
                        {!s.active && <span className="badge">Inativo</span>}
                        {s.featured && <span className="badge badge-accent"><Star aria-hidden /> Destaque</span>}
                      </div>
                    </div>
                    <div className="body">
                      <h3>{s.name}</h3>
                      <div className="row small muted" style={{ gap: 12 }}>
                        <span className="row" style={{ gap: 4 }}><Clock size={14} /> {formatDuration(s.duration_minutes)}</span>
                        <strong style={{ color: 'var(--ink)' }}>{formatPrice(s.price_cents, s.price_is_from)}</strong>
                      </div>
                      {s.maintenance_interval_days && <span className="small subtle">Manutenção sugerida após {s.maintenance_interval_days} dias</span>}
                    </div>
                    <div className="foot">
                      <Switch checked={s.active} onChange={() => toggle(s, 'active')} label={<span className="small">Ativo</span>} />
                      <div className="order-btns">
                        <IconButton label="Mover para cima" size="sm" disabled={i === 0} onClick={() => move(s, -1)}><ArrowUp /></IconButton>
                        <IconButton label="Mover para baixo" size="sm" disabled={i === list.length - 1} onClick={() => move(s, 1)}><ArrowDown /></IconButton>
                        <IconButton label={s.featured ? 'Remover destaque' : 'Destacar'} size="sm" onClick={() => toggle(s, 'featured')}><Star fill={s.featured ? 'currentColor' : 'none'} /></IconButton>
                        <IconButton label="Editar" size="sm" onClick={() => setEditing(s)}><Pencil /></IconButton>
                        <IconButton label="Excluir" size="sm" onClick={() => remove(s)}><Trash2 /></IconButton>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}
      <ServiceForm open={editing !== undefined} onClose={() => setEditing(undefined)} service={editing} nextOrder={services.length + 1} />
    </>
  );
}
