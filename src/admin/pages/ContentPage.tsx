import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Plus, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { DEMO_CONTENT, DEFAULT_ACCENT, DEFAULT_BLUSH, contrastRatio, isDemoContent, mergeContent, type SiteContent } from '@/lib/content';
import { formatDateTime, isValidEmail, isValidPhone, maskPhone } from '@/lib/format';
import { unwrap, useInvalidate, useSiteContentAdmin } from '../api';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { TextArea, TextInput } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const SECTIONS = [
  { id: 'marca', label: 'Marca e banner' },
  { id: 'apresentacao', label: 'Apresentação' },
  { id: 'contato', label: 'Contatos e redes' },
  { id: 'cuidados', label: 'Cuidados' },
  { id: 'faq', label: 'Perguntas frequentes' },
  { id: 'politicas', label: 'Políticas e regras' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const ACCENTS = [
  { c: '#9A5563', n: 'Rosé' },
  { c: '#8E5A73', n: 'Malva' },
  { c: '#A0604F', n: 'Terracota suave' },
  { c: '#86604F', n: 'Nude cacau' },
  { c: '#A2566A', n: 'Rosa antigo' },
];
const BLUSHES = [
  { c: '#F2D9D5', n: 'Blush' },
  { c: '#F3E3DA', n: 'Nude' },
  { c: '#EFDCE0', n: 'Rosa seco' },
  { c: '#F1E6DF', n: 'Areia' },
];

/** Primeiro rascunho: textos de exemplo úteis, mas sem nome e contatos fictícios. */
function firstDraft(): SiteContent {
  const c = structuredClone(DEMO_CONTENT);
  c.studioName = '';
  c.about.name = '';
  c.about.title = 'Muito prazer!';
  c.contact = { whatsapp: '', phone: '', email: '', instagram: '', address: '', city: '', mapsUrl: '' };
  return c;
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const move = (i: number, d: number) => {
    const c = [...items];
    [c[i], c[i + d]] = [c[i + d], c[i]];
    onChange(c);
  };
  return (
    <div className="list-editor">
      {items.map((t, i) => (
        <div key={i} className="list-editor-row">
          <input className="input" value={t} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Item ${i + 1}`} />
          <div className="tools">
            <IconButton label="Subir" size="sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconButton>
            <IconButton label="Descer" size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconButton>
            <IconButton label="Remover" size="sm" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></IconButton>
          </div>
        </div>
      ))}
      <Button variant="soft" size="sm" icon={<Plus />} style={{ justifySelf: 'start' }} onClick={() => onChange([...items, ''])}>
        Adicionar item
      </Button>
    </div>
  );
}

function ColorPicker({ label, value, presets, onChange }: { label: string; value: string; presets: { c: string; n: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="color-row">
        {presets.map((p) => (
          <button key={p.c} type="button" className="color-swatch" style={{ background: p.c }} aria-pressed={value.toLowerCase() === p.c.toLowerCase()} title={p.n} aria-label={p.n} onClick={() => onChange(p.c)} />
        ))}
        <input type="color" className="color-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} personalizada`} />
      </div>
    </div>
  );
}

export default function ContentPage() {
  const q = useSiteContentAdmin();
  const invalidate = useInvalidate();
  const toast = useToast();
  const confirm = useConfirm();
  const [section, setSection] = useState<SectionId>('marca');
  const [c, setC] = useState<SiteContent | null>(null);
  const [saving, setSaving] = useState<'draft' | 'publish' | 'preview' | null>(null);
  const savedRef = useRef<string>('');

  useEffect(() => {
    if (q.data && !c) {
      const initial = isDemoContent(q.data.draft) ? firstDraft() : mergeContent(q.data.draft);
      setC(initial);
      savedRef.current = isDemoContent(q.data.draft) ? '' : JSON.stringify(initial);
    }
  }, [q.data, c]);

  const dirty = !!c && JSON.stringify(c) !== savedRef.current;
  const unpublished = useMemo(() => {
    if (!q.data) return false;
    return JSON.stringify(mergeContent(q.data.draft)) !== JSON.stringify(mergeContent(q.data.published)) || isDemoContent(q.data.published);
  }, [q.data]);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  if (q.isLoading || (!c && !q.error)) return <LoadingBlock />;
  if (q.error || !c) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => setC((x) => (x ? { ...x, [k]: v } : x));
  const setIn = <K extends 'about' | 'space' | 'contact' | 'care' | 'policies' | 'colors'>(k: K, patch: Partial<SiteContent[K]>) =>
    setC((x) => (x ? { ...x, [k]: { ...x[k], ...patch } } : x));

  function validate(forPublish: boolean): string | null {
    if (forPublish && c!.studioName.trim().length < 2) return 'Informe o nome do estúdio antes de publicar.';
    if (c!.contact.whatsapp && !isValidPhone(c!.contact.whatsapp)) return 'O WhatsApp informado não parece válido (use DDD + número).';
    if (c!.contact.email && !isValidEmail(c!.contact.email)) return 'O e-mail de contato não parece válido.';
    return null;
  }

  async function saveDraft(silent = false) {
    const clean: SiteContent = {
      ...c!,
      care: { before: c!.care.before.filter((t) => t.trim()), after: c!.care.after.filter((t) => t.trim()) },
      faq: c!.faq.filter((f) => f.q.trim()),
      space: { ...c!.space, photos: c!.space.photos.filter(Boolean) },
    };
    unwrap(await db().from('site_content').update({ draft: clean }).eq('id', 1).select('id'));
    savedRef.current = JSON.stringify(c);
    await invalidate('site-content-admin', 'site-content-draft');
    if (!silent) toast.success('Rascunho salvo. Ainda não está visível no site.');
  }

  async function onSave() {
    const err = validate(false);
    if (err) return toast.error(err);
    setSaving('draft');
    try {
      await saveDraft();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(null);
    }
  }

  async function onPreview() {
    const err = validate(false);
    if (err) return toast.error(err);
    setSaving('preview');
    // Abre a aba antes do await para não ser bloqueada pelo navegador.
    const win = window.open('about:blank', '_blank');
    try {
      await saveDraft(true);
      if (win) win.location.href = '/?preview=1';
      else window.location.href = '/?preview=1';
    } catch (e) {
      win?.close();
      toast.error(e);
    } finally {
      setSaving(null);
    }
  }

  async function onPublish() {
    const err = validate(true);
    if (err) return toast.error(err);
    const ok = await confirm({
      title: 'Publicar alterações?',
      message: 'O conteúdo do rascunho substituirá o que está no site agora.',
      confirmLabel: 'Publicar no site',
    });
    if (!ok) return;
    setSaving('publish');
    try {
      await saveDraft(true);
      unwrap(await db().rpc('publish_site_content'));
      await invalidate('site-content', 'site-content-admin');
      toast.success('Site atualizado! As alterações já estão no ar.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(null);
    }
  }

  async function discard() {
    const ok = await confirm({ title: 'Descartar alterações não salvas?', confirmLabel: 'Descartar', danger: true });
    if (!ok || !q.data) return;
    setC(isDemoContent(q.data.draft) ? firstDraft() : mergeContent(q.data.draft));
  }

  const contrast = contrastRatio(c.colors.accent || DEFAULT_ACCENT, '#ffffff');

  return (
    <>
      <PageHeader
        title="Conteúdo do site"
        subtitle="Edite, pré-visualize e publique quando estiver tudo como você quer."
        actions={
          <Button variant="secondary" icon={<Eye />} loading={saving === 'preview'} onClick={onPreview}>
            Pré-visualizar
          </Button>
        }
      />

      {isDemoContent(q.data?.published) && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="warning">
            <strong>O site está mostrando conteúdo de demonstração.</strong> Preencha o nome do estúdio e os contatos e clique em
            “Publicar no site”. Os textos de cuidados, dúvidas e políticas vieram como sugestão — revise à vontade.
          </Callout>
        </div>
      )}

      <div className="content-layout">
        <nav className="content-nav" aria-label="Seções do conteúdo">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={section === s.id} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="card card-pad">
          {section === 'marca' && (
            <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
              <h3>Marca e banner</h3>
              <div className="form-grid">
                <TextInput label="Nome do estúdio" value={c.studioName} onChange={(e) => set('studioName', e.target.value)} placeholder="Ex.: Studio Ana Lash" maxLength={60} />
                <TextInput label="Frase de destaque" value={c.tagline} onChange={(e) => set('tagline', e.target.value)} hint="A última palavra aparece em itálico no banner." maxLength={90} />
              </div>
              <TextArea label="Texto de apresentação do banner" value={c.heroText} onChange={(e) => set('heroText', e.target.value)} maxLength={260} />
              <div className="form-grid">
                <ImageUpload label="Foto principal (banner)" value={c.heroImage} folder="site" aspect="4 / 5" onChange={(url) => set('heroImage', url)} hint="Foto vertical de um olhar com cílios aplicados." />
                <ImageUpload label="Logo" value={c.logo} folder="site" aspect="3 / 2" onChange={(url) => set('logo', url)} hint="PNG com fundo transparente fica melhor. Sem logo, usamos a marca delicada padrão." />
              </div>
              <div className="form-grid">
                <ColorPicker label="Cor de destaque (botões e detalhes)" value={c.colors.accent || DEFAULT_ACCENT} presets={ACCENTS} onChange={(v) => setIn('colors', { accent: v })} />
                <ColorPicker label="Cor de fundo suave" value={c.colors.blush || DEFAULT_BLUSH} presets={BLUSHES} onChange={(v) => setIn('colors', { blush: v })} />
              </div>
              {contrast < 4.5 && (
                <Callout tone="info">
                  Essa cor é clara para texto branco. Nos botões, ela será escurecida automaticamente para manter a leitura confortável.
                </Callout>
              )}
            </div>
          )}

          {section === 'apresentacao' && (
            <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
              <h3>A profissional</h3>
              <div className="form-grid">
                <TextInput label="Seu nome" value={c.about.name} onChange={(e) => setIn('about', { name: e.target.value })} />
                <TextInput label="Como você se apresenta" value={c.about.role} onChange={(e) => setIn('about', { role: e.target.value })} placeholder="Lash designer" />
              </div>
              <TextInput label="Título da seção" value={c.about.title} onChange={(e) => setIn('about', { title: e.target.value })} />
              <TextArea label="Sobre você" value={c.about.text} onChange={(e) => setIn('about', { text: e.target.value })} style={{ minHeight: 160 }} />
              <ImageUpload label="Sua foto" value={c.about.photo} folder="site" aspect="4 / 5" onChange={(url) => setIn('about', { photo: url })} />
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />
              <h3>O espaço</h3>
              <TextInput label="Título" value={c.space.title} onChange={(e) => setIn('space', { title: e.target.value })} />
              <TextArea label="Descrição do espaço" value={c.space.text} onChange={(e) => setIn('space', { text: e.target.value })} />
              <div className="form-grid">
                {[0, 1].map((i) => (
                  <ImageUpload
                    key={i}
                    label={`Foto do espaço ${i + 1}`}
                    value={c.space.photos[i] ?? null}
                    folder="site"
                    aspect="3 / 4"
                    onChange={(url) => {
                      const photos = [c.space.photos[0] ?? '', c.space.photos[1] ?? ''];
                      photos[i] = url ?? '';
                      setIn('space', { photos });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {section === 'contato' && (
            <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
              <h3>Contatos e redes</h3>
              <div className="form-grid">
                <TextInput label="WhatsApp" type="tel" value={maskPhone(c.contact.whatsapp)} onChange={(e) => setIn('contact', { whatsapp: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="(11) 99999-9999" hint="Usado nos botões “Falar no WhatsApp”." />
                <TextInput label="Instagram" value={c.contact.instagram} onChange={(e) => setIn('contact', { instagram: e.target.value })} placeholder="@seuestudio" />
                <TextInput label="E-mail" optional type="email" value={c.contact.email} onChange={(e) => setIn('contact', { email: e.target.value })} />
                <TextInput label="Endereço" value={c.contact.address} onChange={(e) => setIn('contact', { address: e.target.value })} placeholder="Rua, número, sala" />
                <TextInput label="Bairro / cidade" value={c.contact.city} onChange={(e) => setIn('contact', { city: e.target.value })} placeholder="Centro — Curitiba, PR" />
                <TextInput label="Link do Google Maps" optional value={c.contact.mapsUrl} onChange={(e) => setIn('contact', { mapsUrl: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
              </div>
              <TextInput label="Observação sobre horários" optional value={c.hoursNote} onChange={(e) => set('hoursNote', e.target.value)} hint="Os dias e horários vêm do expediente configurado em “Horários e agenda”." />
            </div>
          )}

          {section === 'cuidados' && (
            <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
              <h3>Antes do procedimento</h3>
              <ListEditor items={c.care.before} onChange={(v) => setIn('care', { before: v })} placeholder="Ex.: Venha sem maquiagem nos olhos" />
              <h3>Depois do procedimento</h3>
              <ListEditor items={c.care.after} onChange={(v) => setIn('care', { after: v })} placeholder="Ex.: Não molhe nas primeiras 24 horas" />
              <TextArea label="Orientação exibida no agendamento" optional value={c.bookingNote} onChange={(e) => set('bookingNote', e.target.value)} />
            </div>
          )}

          {section === 'faq' && (
            <div className="stack">
              <h3>Perguntas frequentes</h3>
              {c.faq.map((f, i) => (
                <div key={i} className="faq-editor-row">
                  <div className="row-between">
                    <strong className="small">Pergunta {i + 1}</strong>
                    <div className="row" style={{ gap: 2 }}>
                      <IconButton label="Subir" size="sm" disabled={i === 0} onClick={() => { const x = [...c.faq]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; set('faq', x); }}><ArrowUp /></IconButton>
                      <IconButton label="Descer" size="sm" disabled={i === c.faq.length - 1} onClick={() => { const x = [...c.faq]; [x[i + 1], x[i]] = [x[i], x[i + 1]]; set('faq', x); }}><ArrowDown /></IconButton>
                      <IconButton label="Remover" size="sm" onClick={() => set('faq', c.faq.filter((_, j) => j !== i))}><Trash2 /></IconButton>
                    </div>
                  </div>
                  <input className="input" placeholder="Pergunta" value={f.q} onChange={(e) => set('faq', c.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} aria-label="Pergunta" />
                  <textarea className="textarea" placeholder="Resposta" value={f.a} onChange={(e) => set('faq', c.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} aria-label="Resposta" />
                </div>
              ))}
              <Button variant="soft" icon={<Plus />} style={{ alignSelf: 'flex-start' }} onClick={() => set('faq', [...c.faq, { q: '', a: '' }])}>
                Adicionar pergunta
              </Button>
            </div>
          )}

          {section === 'politicas' && (
            <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
              <h3>Políticas</h3>
              <TextArea label="Atrasos" value={c.policies.late} onChange={(e) => setIn('policies', { late: e.target.value })} />
              <TextArea label="Cancelamento" value={c.policies.cancellation} onChange={(e) => setIn('policies', { cancellation: e.target.value })} />
              <TextArea label="Reagendamento" value={c.policies.reschedule} onChange={(e) => setIn('policies', { reschedule: e.target.value })} />
              <TextArea label="Regras e prazo de manutenção" value={c.maintenanceRules} onChange={(e) => set('maintenanceRules', e.target.value)} hint="Exibido na página de serviços. Cada serviço também pode ter condições próprias." />
            </div>
          )}
        </div>
      </div>

      <div className="publish-bar">
        <div className="small">
          {dirty ? (
            <strong style={{ color: 'var(--warning)' }}>Alterações não salvas</strong>
          ) : unpublished ? (
            <strong style={{ color: 'var(--accent)' }}>Rascunho salvo, ainda não publicado</strong>
          ) : (
            <span className="muted">Tudo publicado</span>
          )}
          {q.data?.published_at && <div className="subtle">Última publicação: {formatDateTime(q.data.published_at)}</div>}
        </div>
        <div className="row">
          {dirty && <Button variant="ghost" icon={<Undo2 />} onClick={discard}>Descartar</Button>}
          <Button variant="secondary" icon={<Save />} loading={saving === 'draft'} disabled={!dirty} onClick={onSave}>
            Salvar rascunho
          </Button>
          <Button icon={<Send />} loading={saving === 'publish'} disabled={!dirty && !unpublished} onClick={onPublish}>
            Publicar no site
          </Button>
        </div>
      </div>
    </>
  );
}
