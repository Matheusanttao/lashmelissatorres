import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Megaphone, Pencil, PiggyBank, Plus, Receipt, Trash2, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import {
  addMonths, capitalize, formatKeyDate, formatMoney, fmtKey, spToDate, startOfMonth, todayKey,
} from '@/lib/format';
import type { Appointment, FinanceCategory, FinanceEntry } from '@/lib/types';
import {
  unwrap, useAppointments, useBookingSettings, useFinanceEntries, useFinanceSavingsBalance, useInvalidate,
} from '../api';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  gasto: 'Gasto',
  anuncio: 'Anúncio',
  reserva: 'Guardado',
  retirada: 'Retirada da reserva',
  extra: 'Ganho extra',
};

const CATEGORY_HINT: Record<FinanceCategory, string> = {
  gasto: 'Material, transporte, taxa, etc.',
  anuncio: 'Meta, Instagram, panfleto…',
  reserva: 'Quanto você está guardando agora.',
  retirada: 'Tirou dinheiro da reserva.',
  extra: 'Ganho que não veio de atendimento.',
};

function countsForRevenue(a: Appointment): boolean {
  if (a.paid_cents == null || a.paid_cents < 0) return false;
  return a.status === 'concluido' || a.status === 'confirmado';
}

function monthLabel(fromKey: string) {
  return capitalize(fmtKey(fromKey, 'MMMM yyyy'));
}

function EntryForm({
  open,
  onClose,
  entry,
  defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  entry?: FinanceEntry | null;
  defaultCategory?: FinanceCategory;
}) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [category, setCategory] = useState<FinanceCategory>('gasto');
  const [date, setDate] = useState(todayKey());
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(entry?.category ?? defaultCategory ?? 'gasto');
    setDate(entry?.entry_date ?? todayKey());
    setTitle(entry?.title ?? '');
    setAmount(entry?.amount_cents ?? null);
    setNotes(entry?.notes ?? '');
    setError(null);
  }, [open, entry, defaultCategory]);

  async function save() {
    if (!title.trim()) return setError('Dê um nome ao lançamento.');
    if (!date) return setError('Informe a data.');
    if (amount == null || amount <= 0) return setError('Informe um valor maior que zero.');
    setSaving(true);
    setError(null);
    const payload = {
      category,
      entry_date: date,
      title: title.trim(),
      amount_cents: amount,
      notes: notes.trim() || null,
    };
    try {
      unwrap(
        entry
          ? await db().from('finance_entries').update(payload).eq('id', entry.id).select('id')
          : await db().from('finance_entries').insert(payload).select('id'),
      );
      await invalidate('finance-entries');
      toast.success(entry ? 'Lançamento atualizado.' : 'Lançamento registrado.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Editar lançamento' : 'Novo lançamento'} size="sm">
      <div className="stack" style={{ gap: 14 }}>
        <SelectInput
          label="Tipo"
          value={category}
          onChange={(e) => setCategory(e.target.value as FinanceCategory)}
          hint={CATEGORY_HINT[category]}
        >
          {(Object.keys(CATEGORY_LABEL) as FinanceCategory[]).map((k) => (
            <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>
          ))}
        </SelectInput>
        <TextInput label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value || todayKey())} />
        <TextInput
          label="Descrição"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={category === 'anuncio' ? 'Ex.: Meta Ads semana' : 'Ex.: Cola e fios'}
        />
        <MoneyInput label="Valor (R$)" cents={amount} onChange={setAmount} />
        <TextArea label="Observação" optional value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>{entry ? 'Salvar' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function FinancePage() {
  const settings = useBookingSettings();
  const savings = useFinanceSavingsBalance();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();

  const [monthStart, setMonthStart] = useState(() => startOfMonth(todayKey()));
  const monthEnd = addMonths(monthStart, 1);
  const entries = useFinanceEntries(monthStart, monthEnd);
  const appts = useAppointments(spToDate(monthStart).toISOString(), spToDate(monthEnd).toISOString());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const [quickCategory, setQuickCategory] = useState<FinanceCategory | undefined>();
  const [filter, setFilter] = useState<'todos' | FinanceCategory>('todos');

  const cutPct = Number(settings.data?.salon_cut_percent ?? 30);

  const receivedCents = useMemo(() => {
    return (appts.data ?? []).filter(countsForRevenue).reduce((s, a) => s + (a.paid_cents ?? 0), 0);
  }, [appts.data]);

  const list = entries.data ?? [];
  const byCat = (cat: FinanceCategory) => list.filter((e) => e.category === cat).reduce((s, e) => s + e.amount_cents, 0);

  const extraCents = byCat('extra');
  const gastoCents = byCat('gasto');
  const anuncioCents = byCat('anuncio');
  const reservaCents = byCat('reserva');
  const retiradaCents = byCat('retirada');
  const ganhosCents = receivedCents + extraCents;
  const gastosCents = gastoCents + anuncioCents;
  const ownerCutCents = Math.round((receivedCents * Math.min(100, Math.max(0, cutPct))) / 100);
  const liquidoCents = ganhosCents - gastosCents - reservaCents + retiradaCents - ownerCutCents;
  const guardadoSaldo = savings.data ?? 0;

  const filtered = filter === 'todos' ? list : list.filter((e) => e.category === filter);

  function openNew(cat?: FinanceCategory) {
    setEditing(null);
    setQuickCategory(cat);
    setFormOpen(true);
  }

  function openEdit(e: FinanceEntry) {
    setEditing(e);
    setQuickCategory(undefined);
    setFormOpen(true);
  }

  async function remove(e: FinanceEntry) {
    const ok = await confirm({
      title: 'Excluir lançamento?',
      message: `${CATEGORY_LABEL[e.category]} · ${e.title} · ${formatMoney(e.amount_cents)}`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      unwrap(await db().from('finance_entries').delete().eq('id', e.id).select('id'));
      await invalidate('finance-entries');
      toast.success('Lançamento excluído.');
    } catch (err) {
      toast.error(err);
    }
  }

  const loading = entries.isLoading || appts.isLoading || settings.isLoading || savings.isLoading;
  const error = entries.error || appts.error || settings.error || savings.error;

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Controle o que entrou, o que saiu, quanto foi em anúncio e quanto está guardado."
        actions={
          <Button icon={<Plus />} onClick={() => openNew()}>
            Novo lançamento
          </Button>
        }
      />

      <div className="ata-toolbar card card-pad" style={{ marginBottom: 20 }}>
        <div className="ata-day-nav">
          <IconButton label="Mês anterior" onClick={() => setMonthStart((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </IconButton>
          <TextInput
            label="Mês"
            type="month"
            value={monthStart.slice(0, 7)}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setMonthStart(`${v}-01`);
            }}
          />
          <IconButton label="Próximo mês" onClick={() => setMonthStart((m) => addMonths(m, 1))}>
            <ChevronRight />
          </IconButton>
          {monthStart !== startOfMonth(todayKey()) && (
            <Button size="sm" variant="ghost" onClick={() => setMonthStart(startOfMonth(todayKey()))}>
              Este mês
            </Button>
          )}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Resumo de <strong>{monthLabel(monthStart)}</strong>
          {cutPct > 0 && <> · {cutPct}% da dona já descontado no “sobrou”</>}
        </p>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => { entries.refetch(); appts.refetch(); savings.refetch(); }} />
      ) : (
        <>
          <div className="stats finance-stats">
            <div className="stat card highlight">
              <span className="stat-label"><TrendingUp size={16} aria-hidden /> Ganhos</span>
              <strong className="stat-value" style={{ color: 'var(--success)' }}>{formatMoney(ganhosCents)}</strong>
              <span className="small muted">
                Atendimentos {formatMoney(receivedCents)}
                {extraCents > 0 && ` · extras ${formatMoney(extraCents)}`}
              </span>
            </div>
            <div className="stat card">
              <span className="stat-label"><TrendingDown size={16} aria-hidden /> Gastos</span>
              <strong className="stat-value" style={{ color: 'var(--danger)' }}>{formatMoney(gastosCents)}</strong>
              <span className="small muted">
                Gerais {formatMoney(gastoCents)} · anúncios {formatMoney(anuncioCents)}
              </span>
            </div>
            <div className="stat card">
              <span className="stat-label"><Megaphone size={16} aria-hidden /> Anúncios</span>
              <strong className="stat-value">{formatMoney(anuncioCents)}</strong>
              <span className="small muted">Investido neste mês</span>
            </div>
            <div className="stat card">
              <span className="stat-label"><PiggyBank size={16} aria-hidden /> Guardado</span>
              <strong className="stat-value">{formatMoney(guardadoSaldo)}</strong>
              <span className="small muted">
                Saldo total
                {reservaCents > 0 || retiradaCents > 0
                  ? ` · mês +${formatMoney(reservaCents)}${retiradaCents ? ` / −${formatMoney(retiradaCents)}` : ''}`
                  : ''}
              </span>
            </div>
          </div>

          <div className="money-card card" style={{ marginBottom: 20 }}>
            <div>
              <small>SOBROU NO MÊS</small>
              <strong style={{ color: liquidoCents >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatMoney(liquidoCents)}
              </strong>
              <span>Ganhos − gastos − % dona − o que guardou (+ retiradas)</span>
            </div>
            <div>
              <small>% DA DONA (ATA)</small>
              <strong>{formatMoney(ownerCutCents)}</strong>
              <span>{cutPct}% sobre {formatMoney(receivedCents)} recebidos</span>
            </div>
          </div>

          <div className="finance-quick" style={{ marginBottom: 20 }}>
            <Button size="sm" variant="secondary" icon={<Receipt />} onClick={() => openNew('gasto')}>Gasto</Button>
            <Button size="sm" variant="secondary" icon={<Megaphone />} onClick={() => openNew('anuncio')}>Anúncio</Button>
            <Button size="sm" variant="secondary" icon={<PiggyBank />} onClick={() => openNew('reserva')}>Guardar</Button>
            <Button size="sm" variant="secondary" icon={<Wallet />} onClick={() => openNew('extra')}>Ganho extra</Button>
          </div>

          <div className="card">
            <div className="card-head" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3>Lançamentos</h3>
                <p className="small muted" style={{ marginTop: 2 }}>
                  Gastos, anúncios e reservas que você registrou neste mês. Os atendimentos entram sozinhos nos ganhos.
                </p>
              </div>
              <div className="tabs" role="tablist" style={{ margin: 0 }}>
                {([
                  ['todos', 'Todos'],
                  ['gasto', 'Gastos'],
                  ['anuncio', 'Anúncios'],
                  ['reserva', 'Guardado'],
                  ['retirada', 'Retiradas'],
                  ['extra', 'Extras'],
                ] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!filtered.length ? (
              <EmptyState
                icon={Wallet}
                title="Nenhum lançamento neste mês"
                text="Registre gastos, anúncios ou o que estiver guardando para acompanhar o controle."
                action={<Button icon={<Plus />} onClick={() => openNew()}>Novo lançamento</Button>}
              />
            ) : (
              filtered.map((e) => (
                <div key={e.id} className="finance-row">
                  <div className={`finance-cat finance-cat-${e.category}`} aria-hidden>
                    {e.category === 'anuncio' ? <Megaphone size={18} />
                      : e.category === 'reserva' || e.category === 'retirada' ? <PiggyBank size={18} />
                        : e.category === 'extra' ? <TrendingUp size={18} />
                          : <TrendingDown size={18} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="finance-row-title">{e.title}</div>
                    <div className="small muted">
                      {CATEGORY_LABEL[e.category]} · {formatKeyDate(e.entry_date)}
                    </div>
                    {e.notes && <p className="small muted" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{e.notes}</p>}
                  </div>
                  <strong
                    className="finance-amount"
                    style={{
                      color:
                        e.category === 'extra' || e.category === 'retirada'
                          ? 'var(--success)'
                          : e.category === 'reserva'
                            ? 'var(--ink)'
                            : 'var(--danger)',
                    }}
                  >
                    {e.category === 'extra' || e.category === 'retirada' ? '+' : '−'}
                    {formatMoney(e.amount_cents)}
                  </strong>
                  <div className="finance-row-actions">
                    <IconButton label="Editar" size="sm" onClick={() => openEdit(e)}><Pencil /></IconButton>
                    <IconButton label="Excluir" size="sm" onClick={() => remove(e)}><Trash2 /></IconButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <EntryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        entry={editing}
        defaultCategory={quickCategory}
      />
    </div>
  );
}
