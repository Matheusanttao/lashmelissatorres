import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderPlus, ImagePlus, Images, Pencil, ShieldAlert, Star, Tags, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { formatKeyDate } from '@/lib/format';
import { removePublic } from '@/lib/storage';
import type { GalleryCategory, GalleryItem } from '@/lib/types';
import { moveId, saveOrder, unwrap, useActiveConsents, useGalleryAdmin, useInvalidate } from '../api';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

type ItemForm = Pick<GalleryItem, 'category_id' | 'title' | 'description' | 'image_url' | 'image_path' | 'before_image_url' | 'before_image_path' | 'consent_id' | 'featured' | 'published'>;
const EMPTY: ItemForm = {
  category_id: null, title: '', description: '', image_url: '', image_path: null, before_image_url: null, before_image_path: null,
  consent_id: null, featured: false, published: false,
};

function ItemFormModal({
  open, onClose, item, categories, nextOrder,
}: { open: boolean; onClose: () => void; item?: GalleryItem | null; categories: GalleryCategory[]; nextOrder: number }) {
  const consents = useActiveConsents();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [f, setF] = useState<ItemForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(item ? { ...EMPTY, ...item, title: item.title ?? '', description: item.description ?? '' } : EMPTY);
  }, [open, item]);

  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const consentOk = !!f.consent_id && (consents.data ?? []).some((c) => c.id === f.consent_id);

  async function save() {
    if (!f.image_url) return setError('Envie a foto do resultado.');
    if (f.published && !consentOk) return setError('Para publicar, vincule uma autorização de uso de imagem ativa.');
    setSaving(true);
    setError(null);
    const payload = { ...f, title: f.title || null, description: f.description || null };
    try {
      if (item) {
        unwrap(await db().from('gallery_items').update(payload).eq('id', item.id).select('id'));
        const old = [item.image_path !== f.image_path && item.image_path, item.before_image_path !== f.before_image_path && item.before_image_path];
        await removePublic(old.filter(Boolean) as string[]);
      } else {
        unwrap(await db().from('gallery_items').insert({ ...payload, sort_order: nextOrder }).select('id'));
      }
      await invalidate('gallery-admin', 'public-gallery');
      toast.success(f.published ? 'Foto salva e publicada.' : 'Foto salva como rascunho.');
      onClose();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(err.code === 'P0001' ? err.message! : 'Não foi possível salvar a foto.');
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
      title={item ? 'Editar foto' : 'Nova foto na galeria'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="stack">
        {error && <Callout tone="danger">{error}</Callout>}
        <div className="form-grid">
          <ImageUpload label="Foto do resultado (depois)" value={f.image_url || null} folder="galeria" aspect="4 / 5" onChange={(url, path) => setF((x) => ({ ...x, image_url: url ?? '', image_path: path }))} />
          <ImageUpload label="Foto de antes (opcional)" value={f.before_image_url} folder="galeria" aspect="4 / 5" onChange={(url, path) => setF((x) => ({ ...x, before_image_url: url, before_image_path: path }))} hint="Com as duas fotos, o site mostra o comparador antes e depois." />
        </div>
        <div className="form-grid">
          <TextInput label="Título" optional placeholder="Ex.: Volume brasileiro, efeito gatinho" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} />
          <SelectInput label="Técnica / estilo" value={f.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </div>
        <TextArea label="Descrição" optional value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} hint="Não inclua nome ou dados pessoais da cliente." />
        <SelectInput
          label="Autorização de uso de imagem"
          value={f.consent_id ?? ''}
          onChange={(e) => set('consent_id', e.target.value || null)}
          hint={<>Apenas clientes com autorização ativa. Para registrar uma nova, abra a <Link to="/admin/clientes" className="link">ficha da cliente</Link>. O nome não aparece no site.</>}
        >
          <option value="">Nenhuma (não pode ser publicada)</option>
          {(consents.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.client?.name ?? 'Cliente'} — desde {formatKeyDate(c.granted_on)}</option>
          ))}
        </SelectInput>
        {!consentOk && (
          <Callout tone="warning" icon={ShieldAlert}>Sem autorização vinculada, a foto fica salva apenas no painel.</Callout>
        )}
        <div className="row" style={{ gap: 24 }}>
          <Switch checked={f.published} disabled={!consentOk} onChange={(v) => set('published', v)} label="Publicar no site" description={consentOk ? 'Visível na galeria pública.' : 'Requer autorização.'} />
          <Switch checked={f.featured} onChange={(v) => set('featured', v)} label="Destaque" description="Aparece primeiro e na página inicial." />
        </div>
      </div>
    </Modal>
  );
}

function CategoriesModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: GalleryCategory[] }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});

  const refresh = () => invalidate('gallery-admin', 'public-gallery');

  async function add() {
    if (name.trim().length < 2) return;
    try {
      unwrap(await db().from('gallery_categories').insert({ name: name.trim(), sort_order: categories.length + 1 }).select('id'));
      setName('');
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }
  async function rename(c: GalleryCategory) {
    const v = editing[c.id]?.trim();
    if (!v || v === c.name) return;
    try {
      unwrap(await db().from('gallery_categories').update({ name: v }).eq('id', c.id).select('id'));
      await refresh();
      toast.success('Categoria renomeada.');
    } catch (e) {
      toast.error(e);
    }
  }
  async function remove(c: GalleryCategory) {
    const ok = await confirm({ title: `Excluir “${c.name}”?`, message: 'As fotos dessa categoria continuam na galeria, sem categoria.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      unwrap(await db().from('gallery_categories').delete().eq('id', c.id).select('id'));
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }
  async function move(c: GalleryCategory, dir: -1 | 1) {
    try {
      await saveOrder('gallery_categories', moveId(categories.map((x) => x.id), c.id, dir));
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Técnicas e estilos" description="Organize a galeria por técnica. A ordem aqui é a ordem dos filtros no site.">
      <div className="stack">
        {categories.map((c, i) => (
          <div key={c.id} className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              className="input"
              value={editing[c.id] ?? c.name}
              onChange={(e) => setEditing((x) => ({ ...x, [c.id]: e.target.value }))}
              onBlur={() => rename(c)}
              aria-label="Nome da categoria"
            />
            <IconButton label="Subir" size="sm" disabled={i === 0} onClick={() => move(c, -1)}><ArrowUp /></IconButton>
            <IconButton label="Descer" size="sm" disabled={i === categories.length - 1} onClick={() => move(c, 1)}><ArrowDown /></IconButton>
            <IconButton label="Excluir" size="sm" onClick={() => remove(c)}><Trash2 /></IconButton>
          </div>
        ))}
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" placeholder="Nova categoria (ex.: Efeito delineado)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button icon={<FolderPlus />} onClick={add} disabled={name.trim().length < 2}>Adicionar</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function GalleryAdminPage() {
  const q = useGalleryAdmin();
  const invalidate = useInvalidate();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<GalleryItem | null | undefined>(undefined);
  const [catsOpen, setCatsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');

  const items = q.data?.items ?? [];
  const categories = q.data?.categories ?? [];
  const shown = items.filter((i) => filter === 'all' || (filter === 'published' ? i.published : !i.published));

  async function update(item: GalleryItem, patch: Partial<GalleryItem>, msg: string) {
    try {
      unwrap(await db().from('gallery_items').update(patch).eq('id', item.id).select('id'));
      await invalidate('gallery-admin', 'public-gallery');
      toast.success(msg);
    } catch (e) {
      toast.error(e);
    }
  }

  async function move(item: GalleryItem, dir: -1 | 1) {
    try {
      await saveOrder('gallery_items', moveId(items.map((i) => i.id), item.id, dir));
      await invalidate('gallery-admin', 'public-gallery');
    } catch (e) {
      toast.error(e);
    }
  }

  async function remove(item: GalleryItem) {
    const ok = await confirm({ title: 'Excluir esta foto da galeria?', message: 'Ela sai do site e é apagada do armazenamento.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      unwrap(await db().from('gallery_items').delete().eq('id', item.id).select('id'));
      await removePublic([item.image_path, item.before_image_path]);
      await invalidate('gallery-admin', 'public-gallery');
      toast.success('Foto excluída.');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <PageHeader
        title="Galeria"
        subtitle="Somente fotos com autorização de imagem registrada podem ser publicadas."
        actions={
          <>
            <Button variant="secondary" icon={<Tags />} onClick={() => setCatsOpen(true)}>Técnicas</Button>
            <Button icon={<ImagePlus />} onClick={() => setEditing(null)}>Adicionar foto</Button>
          </>
        }
      />
      <div className="chips" style={{ marginBottom: 16 }}>
        {([['all', 'Todas'], ['published', 'Publicadas'], ['draft', 'Não publicadas']] as const).map(([v, l]) => (
          <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {l} ({v === 'all' ? items.length : items.filter((i) => (v === 'published' ? i.published : !i.published)).length})
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <div className="gallery-admin-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={300} r={24} />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !shown.length ? (
        <div className="card">
          <EmptyState
            icon={Images}
            title={items.length ? 'Nenhuma foto neste filtro' : 'Sua galeria está esperando os primeiros olhares'}
            text={items.length ? undefined : 'Adicione fotos dos seus trabalhos. Lembre-se de registrar a autorização de imagem na ficha da cliente antes de publicar.'}
            action={!items.length ? <Button icon={<ImagePlus />} onClick={() => setEditing(null)}>Adicionar primeira foto</Button> : undefined}
          />
        </div>
      ) : (
        <div className="gallery-admin-grid">
          {shown.map((it) => {
            const idx = items.indexOf(it);
            const cat = categories.find((c) => c.id === it.category_id);
            return (
              <article key={it.id} className="card admin-card">
                <div className="media">
                  <img src={it.image_url} alt={it.title ?? ''} loading="lazy" />
                  <div className="badges">
                    {it.published ? <span className="badge badge-success"><Eye aria-hidden /> No site</span> : <span className="badge"><EyeOff aria-hidden /> Rascunho</span>}
                    {it.featured && <span className="badge badge-accent"><Star aria-hidden /></span>}
                    {it.before_image_url && <span className="badge badge-info">Antes/depois</span>}
                  </div>
                </div>
                <div className="body">
                  <strong>{it.title || cat?.name || 'Sem título'}</strong>
                  <span className="small muted">{cat?.name ?? 'Sem categoria'}</span>
                  {!it.consent_id && <span className="small" style={{ color: 'var(--warning)' }}>Sem autorização vinculada</span>}
                </div>
                <div className="foot">
                  <IconButton label={it.published ? 'Tirar do site' : 'Publicar'} size="sm" disabled={!it.consent_id && !it.published} onClick={() => update(it, { published: !it.published }, it.published ? 'Foto retirada do site.' : 'Foto publicada.')}>
                    {it.published ? <EyeOff /> : <Eye />}
                  </IconButton>
                  <IconButton label={it.featured ? 'Remover destaque' : 'Destacar'} size="sm" onClick={() => update(it, { featured: !it.featured }, 'Destaque atualizado.')}>
                    <Star fill={it.featured ? 'currentColor' : 'none'} />
                  </IconButton>
                  <div className="order-btns">
                    <IconButton label="Mover para trás" size="sm" disabled={idx === 0 || filter !== 'all'} onClick={() => move(it, -1)}><ArrowUp /></IconButton>
                    <IconButton label="Mover para frente" size="sm" disabled={idx === items.length - 1 || filter !== 'all'} onClick={() => move(it, 1)}><ArrowDown /></IconButton>
                    <IconButton label="Editar" size="sm" onClick={() => setEditing(it)}><Pencil /></IconButton>
                    <IconButton label="Excluir" size="sm" onClick={() => remove(it)}><Trash2 /></IconButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ItemFormModal open={editing !== undefined} onClose={() => setEditing(undefined)} item={editing} categories={categories} nextOrder={items.length + 1} />
      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories} />
    </>
  );
}
