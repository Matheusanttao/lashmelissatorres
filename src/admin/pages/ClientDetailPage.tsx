import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarPlus, Camera, FileCheck2, FileText, Lock, MessageCircle, Pencil, ShieldCheck, ShieldOff, Trash2, UserX,
  Plus,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { fmt, formatDate, formatKeyDate, formatMoney, formatPhone, initials, todayKey, SERVICE_TYPE_LABEL } from '@/lib/format';
import { signedUrls, uploadPrivateFile, removePrivate, validateImage } from '@/lib/storage';
import { whatsappLink } from '@/lib/whatsapp';
import type { ImageConsent } from '@/lib/types';
import { unwrap, useClient, useClientAppointments, useClientPhotos, useConsents, useInvalidate } from '../api';
import { useAdminActions } from '../AdminActions';
import { StatusBadge } from '@/components/ui/Brand';
import { Button, ButtonAnchor, IconButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, LoadingBlock, Spinner } from '@/components/ui/Feedback';
import { TextArea, TextInput } from '@/components/ui/Field';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

function ConsentModal({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId: string }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [grantedOn, setGrantedOn] = useState(todayKey());
  const [scope, setScope] = useState('Site e redes sociais do estúdio');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setGrantedOn(todayKey());
      setScope('Site e redes sociais do estúdio');
      setNotes('');
      setFile(null);
      setAgree(false);
    }
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const document_path = file ? await uploadPrivateFile(file, `autorizacoes/${clientId}`) : null;
      unwrap(await db().from('image_consents').insert({ client_id: clientId, granted_on: grantedOn, scope, notes: notes || null, document_path }).select('id'));
      await invalidate('consents');
      toast.success('Autorização registrada.');
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
      title="Registrar autorização de imagem"
      description="Somente fotos vinculadas a uma autorização ativa podem ser publicadas na galeria."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon={<FileCheck2 />} loading={saving} disabled={!agree} onClick={save}>Registrar</Button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <TextInput label="Data da autorização" type="date" value={grantedOn} onChange={(e) => setGrantedOn(e.target.value)} />
          <TextInput label="Onde pode ser usada" value={scope} onChange={(e) => setScope(e.target.value)} />
        </div>
        <TextArea label="Observações" optional placeholder="Ex.: autorizou por mensagem no WhatsApp; não mostrar o rosto inteiro" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="field">
          <span className="field-label">Documento ou print da autorização <span className="optional">(opcional, privado)</span></span>
          <input type="file" accept="image/*,application/pdf" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="field-hint">Guardado em área privada, visível apenas no painel.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>Confirmo que a cliente autorizou o uso das imagens do procedimento.</span>
        </label>
      </div>
    </Modal>
  );
}

function PhotoUploadModal({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId: string }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [takenOn, setTakenOn] = useState(todayKey());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFiles([]);
      setCaption('');
      setTakenOn(todayKey());
    }
  }, [open]);

  async function save() {
    const bad = files.map((f) => validateImage(f, 15 * 1024 * 1024)).find(Boolean);
    if (bad) return toast.error(bad);
    setSaving(true);
    try {
      for (const f of files) {
        const path = await uploadPrivateFile(f, `clientes/${clientId}`);
        unwrap(await db().from('client_photos').insert({ client_id: clientId, storage_path: path, caption: caption || null, taken_on: takenOn }).select('id'));
      }
      await invalidate('client-photos');
      toast.success(files.length > 1 ? 'Fotos salvas.' : 'Foto salva.');
      onClose();
    } catch (e) {
      toast.error(e, 'Não foi possível enviar as fotos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fotos de acompanhamento"
      description="Fotos privadas, separadas da galeria pública."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon={<Camera />} loading={saving} disabled={!files.length} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="stack">
        <label className="upload" style={{ minHeight: 130 }}>
          <Camera aria-hidden />
          <strong>{files.length ? `${files.length} foto(s) selecionada(s)` : 'Escolher fotos'}</strong>
          <span>No celular, você pode tirar a foto na hora.</span>
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <div className="form-grid">
          <TextInput label="Data" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
          <TextInput label="Legenda" optional placeholder="Ex.: 15 dias após aplicação" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useClient(id);
  const history = useClientAppointments(id);
  const consents = useConsents(id);
  const photos = useClientPhotos(id);
  const actions = useAdminActions();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();
  const [consentOpen, setConsentOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const photoUrls = useQuery({
    queryKey: ['client-photo-urls', photos.data?.map((p) => p.storage_path).join(',')],
    enabled: !!photos.data?.length,
    staleTime: 50 * 60 * 1000,
    queryFn: () => signedUrls(photos.data!.map((p) => p.storage_path)),
  });

  if (client.isLoading) return <LoadingBlock />;
  if (client.error || !client.data) return <ErrorState error={client.error} onRetry={() => client.refetch()} title="Cliente não encontrada" />;
  const c = client.data;

  const done = (history.data ?? []).filter((a) => a.status === 'concluido');
  const upcoming = (history.data ?? []).filter((a) => ['pendente', 'confirmado'].includes(a.status) && new Date(a.starts_at) > new Date());
  const totalPaid = (history.data ?? []).reduce((s, a) => s + (a.paid_cents ?? 0), 0);
  const activeConsent = (consents.data ?? []).find((x) => !x.revoked_at);

  async function revoke(ic: ImageConsent) {
    const ok = await confirm({
      title: 'Revogar autorização?',
      message: 'Todas as fotos da galeria ligadas a esta autorização serão retiradas do site imediatamente. O registro fica guardado no histórico.',
      confirmLabel: 'Revogar',
      danger: true,
    });
    if (!ok) return;
    try {
      unwrap(await db().from('image_consents').update({ revoked_at: new Date().toISOString() }).eq('id', ic.id).select('id'));
      await invalidate('consents', 'gallery-admin', 'public-gallery');
      toast.success('Autorização revogada e fotos retiradas do site.');
    } catch (e) {
      toast.error(e);
    }
  }

  async function openDoc(path: string) {
    try {
      const urls = await signedUrls([path], 300);
      window.open(urls[path], '_blank', 'noopener');
    } catch (e) {
      toast.error(e);
    }
  }

  async function deletePhoto(photoId: string, path: string) {
    const ok = await confirm({ title: 'Excluir esta foto?', message: 'A foto será apagada definitivamente.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      unwrap(await db().from('client_photos').delete().eq('id', photoId).select('id'));
      await removePrivate([path]);
      await invalidate('client-photos');
      toast.success('Foto excluída.');
    } catch (e) {
      toast.error(e);
    }
  }

  async function deleteClient() {
    if ((history.data ?? []).length) {
      return toast.error('Esta cliente tem atendimentos no histórico e não pode ser excluída. Você pode editar os dados dela.');
    }
    const ok = await confirm({
      title: `Excluir ${c.name}?`,
      message: 'O cadastro, fotos de acompanhamento e autorizações serão apagados. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir cadastro',
      danger: true,
    });
    if (!ok) return;
    try {
      const paths = [
        ...(photos.data ?? []).map((p) => p.storage_path),
        ...(consents.data ?? []).map((x) => x.document_path),
      ].filter(Boolean) as string[];
      unwrap(await db().from('clients').delete().eq('id', c.id).select('id'));
      await removePrivate(paths);
      await invalidate('clients');
      toast.success('Cadastro excluído.');
      navigate('/admin/clientes');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <Link to="/admin/clientes" className="row small muted" style={{ gap: 6, marginBottom: 14 }}>
        <ArrowLeft size={16} /> Clientes
      </Link>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="client-head">
          <span className="avatar lg">{initials(c.name)}</span>
          <div className="grow">
            <h1>{c.name}</h1>
            <div className="muted">
              {formatPhone(c.whatsapp)}
              {c.email ? ` · ${c.email}` : ''} · cliente desde {formatDate(c.created_at)}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              {activeConsent ? (
                <span className="badge badge-success"><ShieldCheck aria-hidden /> Autoriza uso de imagem</span>
              ) : (
                <span className="badge"><ShieldOff aria-hidden /> Sem autorização de imagem</span>
              )}
              <span className="badge badge-accent">{done.length} atendimento{done.length === 1 ? '' : 's'} concluído{done.length === 1 ? '' : 's'}</span>
              {totalPaid > 0 && <span className="badge">{formatMoney(totalPaid)} recebidos</span>}
            </div>
          </div>
          <div className="row">
            <ButtonAnchor variant="whatsapp" href={whatsappLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" icon={<MessageCircle />}>
              WhatsApp
            </ButtonAnchor>
            <Button icon={<CalendarPlus />} onClick={() => actions.newAppointment({ clientId: c.id })}>Agendar</Button>
            <IconButton label="Editar cadastro" bordered onClick={() => actions.editClient(c)}><Pencil /></IconButton>
          </div>
        </div>
      </div>

      <div className="client-grid">
        <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <div className="card">
            <div className="card-head"><h3>Preferências e observações</h3>
              <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => actions.editClient(c)}>Editar</Button>
            </div>
            <div className="card-body stack" style={{ '--gap': '14px' } as React.CSSProperties}>
              <div>
                <div className="field-label" style={{ marginBottom: 4 }}>Preferências de estilo</div>
                {c.style_preferences ? <div className="note-box">{c.style_preferences}</div> : <p className="small muted">Nada registrado ainda.</p>}
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 4 }}>Observações internas</div>
                {c.notes ? <div className="note-box private">{c.notes}</div> : <p className="small muted">Nada registrado ainda.</p>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Uso de imagem</h3>
              <Button size="sm" variant="soft" icon={<Plus />} onClick={() => setConsentOpen(true)}>Registrar</Button>
            </div>
            {consents.isLoading ? (
              <div className="card-body"><Spinner /></div>
            ) : !consents.data?.length ? (
              <div className="card-body">
                <Callout tone="info">Sem autorização registrada. As fotos desta cliente não podem ser publicadas na galeria.</Callout>
              </div>
            ) : (
              <div className="list">
                {consents.data.map((ic) => (
                  <div key={ic.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    {ic.revoked_at ? <ShieldOff size={20} color="var(--ink-3)" /> : <ShieldCheck size={20} color="var(--success)" />}
                    <div className="grow">
                      <strong>{ic.revoked_at ? 'Revogada' : 'Ativa'}</strong> · desde {formatKeyDate(ic.granted_on)}
                      <div className="small muted">{ic.scope}</div>
                      {ic.notes && <div className="small muted">{ic.notes}</div>}
                      {ic.revoked_at && <div className="small" style={{ color: 'var(--danger)' }}>Revogada em {formatDate(ic.revoked_at)}</div>}
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      {ic.document_path && (
                        <IconButton label="Ver documento" size="sm" onClick={() => openDoc(ic.document_path!)}><FileText /></IconButton>
                      )}
                      {!ic.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(ic)}>Revogar</Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Fotos de acompanhamento</h3>
              <Button size="sm" variant="soft" icon={<Camera />} onClick={() => setPhotoOpen(true)}>Adicionar</Button>
            </div>
            <div className="card-body">
              <p className="private-tag" style={{ marginBottom: 12 }}><Lock aria-hidden /> Privadas — nunca aparecem no site</p>
              {photos.isLoading ? (
                <Spinner />
              ) : !photos.data?.length ? (
                <p className="small muted">Registre o antes e depois para acompanhar a evolução dos fios.</p>
              ) : (
                <div className="photo-grid">
                  {photos.data.map((p) => (
                    <div key={p.id} className="photo-thumb">
                      {photoUrls.data?.[p.storage_path] ? (
                        <button type="button" style={{ all: 'unset', cursor: 'zoom-in', display: 'block', width: '100%', height: '100%' }} onClick={() => setViewing(photoUrls.data![p.storage_path])}>
                          <img src={photoUrls.data[p.storage_path]} alt={p.caption ?? 'Foto de acompanhamento'} loading="lazy" />
                        </button>
                      ) : (
                        <div className="loading-block" style={{ padding: 0, height: '100%' }}><Spinner /></div>
                      )}
                      <span className="cap">{formatKeyDate(p.taken_on)}{p.caption ? ` · ${p.caption}` : ''}</span>
                      <IconButton label="Excluir foto" size="sm" className="del" onClick={() => deletePhoto(p.id, p.storage_path)}><Trash2 /></IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button variant="ghost" icon={<UserX />} onClick={deleteClient} style={{ alignSelf: 'flex-start', color: 'var(--danger)' }}>
            Excluir cadastro
          </Button>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Histórico de atendimentos</h3>
            {upcoming.length > 0 && <span className="badge badge-success">{upcoming.length} agendado{upcoming.length > 1 ? 's' : ''}</span>}
          </div>
          {history.isLoading ? (
            <div className="card-body"><Spinner /></div>
          ) : !history.data?.length ? (
            <EmptyState icon={CalendarPlus} title="Nenhum atendimento ainda" action={<Button icon={<CalendarPlus />} onClick={() => actions.newAppointment({ clientId: c.id })}>Agendar primeiro horário</Button>} />
          ) : (
            history.data.map((a) => (
              <button key={a.id} type="button" className="history-item" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer' }} onClick={() => actions.openAppointment(a.id)}>
                <span className="history-date">
                  <strong>{fmt(a.starts_at, 'dd')}</strong>
                  <small>{fmt(a.starts_at, 'MMM yy')}</small>
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{a.service_name}</strong>
                  <span className="small muted">
                    {SERVICE_TYPE_LABEL[a.service_type]} · {fmt(a.starts_at, 'HH:mm')} · {formatMoney(a.paid_cents ?? a.price_cents)}
                    {a.paid_cents != null ? ' pago' : ''}
                  </span>
                  {a.internal_notes && <span className="small subtle" style={{ display: 'block' }}>{a.internal_notes}</span>}
                </span>
                <StatusBadge status={a.status} />
              </button>
            ))
          )}
        </div>
      </div>

      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} clientId={c.id} />
      <PhotoUploadModal open={photoOpen} onClose={() => setPhotoOpen(false)} clientId={c.id} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Foto de acompanhamento" size="lg">
        {viewing && <img src={viewing} alt="" style={{ width: '100%', borderRadius: 12 }} />}
      </Modal>
    </>
  );
}
