import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileImage, FileText, Receipt, Save } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useSiteContent } from '@/hooks/useSiteContent';
import {
  STATUS_LABEL,
  addDays,
  capitalize,
  formatKeyDate,
  formatLongDate,
  formatMoney,
  formatTime,
  spToDate,
  todayKey,
} from '@/lib/format';
import { db } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';
import { unwrap, useAppointments, useBookingSettings, useInvalidate } from '../api';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

const NAME_KEY = 'lash-ata-profissional';

function countsForRevenue(a: Appointment): boolean {
  if (a.paid_cents == null || a.paid_cents < 0) return false;
  return a.status === 'concluido' || a.status === 'confirmado';
}

function fileStamp(day: string) {
  return day.replaceAll('-', '');
}

export default function DailyReportPage() {
  const { content } = useSiteContent();
  const settings = useBookingSettings();
  const invalidate = useInvalidate();
  const toast = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [day, setDay] = useState(todayKey());
  const [cut, setCut] = useState(30);
  const [proName, setProName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [savingCut, setSavingCut] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);

  const fromIso = spToDate(day).toISOString();
  const toIso = spToDate(addDays(day, 1)).toISOString();
  const appts = useAppointments(fromIso, toIso);

  useEffect(() => {
    if (settings.data?.salon_cut_percent != null) {
      setCut(Number(settings.data.salon_cut_percent));
    }
  }, [settings.data?.salon_cut_percent]);

  useEffect(() => {
    localStorage.setItem(NAME_KEY, proName);
  }, [proName]);

  const list = useMemo(() => {
    const all = appts.data ?? [];
    return [...all].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [appts.data]);

  const billed = useMemo(() => list.filter(countsForRevenue), [list]);
  const totalCents = useMemo(() => billed.reduce((s, a) => s + (a.paid_cents ?? 0), 0), [billed]);
  const cutPct = Math.min(100, Math.max(0, cut));
  const ownerCents = Math.round((totalCents * cutPct) / 100);
  const keepCents = totalCents - ownerCents;
  const missingPay = list.filter((a) => a.status === 'concluido' && a.paid_cents == null).length;

  async function saveCut() {
    setSavingCut(true);
    try {
      unwrap(await db().from('booking_settings').update({ salon_cut_percent: cutPct }).eq('id', 1).select('id'));
      await invalidate('booking-settings');
      toast.success('Percentual da dona salvo.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingCut(false);
    }
  }

  async function capture(): Promise<HTMLCanvasElement> {
    const el = printRef.current;
    if (!el) throw new Error('Pré-visualização da ata não encontrada.');
    return html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
  }

  async function downloadPng() {
    setExporting('png');
    try {
      const canvas = await capture();
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `ata-${fileStamp(day)}.png`;
      a.click();
      toast.success('Imagem baixada.');
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(null);
    }
  }

  async function downloadPdf() {
    setExporting('pdf');
    try {
      const canvas = await capture();
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(img, 'PNG', (pageW - w) / 2, margin, w, h);
      pdf.save(`ata-${fileStamp(day)}.pdf`);
      toast.success('PDF baixado.');
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(null);
    }
  }

  const loading = appts.isLoading || settings.isLoading;
  const error = appts.error || settings.error;

  return (
    <div>
      <PageHeader
        title="Ata do dia"
        subtitle="Resumo dos atendimentos e quanto repassar para a dona do salão."
        actions={
          <>
            <Button variant="secondary" icon={<FileImage />} loading={exporting === 'png'} disabled={!!exporting} onClick={downloadPng}>
              Baixar imagem
            </Button>
            <Button icon={<FileText />} loading={exporting === 'pdf'} disabled={!!exporting} onClick={downloadPdf}>
              Baixar PDF
            </Button>
          </>
        }
      />

      <div className="ata-toolbar card card-pad">
        <div className="ata-day-nav">
          <IconButton label="Dia anterior" onClick={() => setDay((d) => addDays(d, -1))}>
            <ChevronLeft />
          </IconButton>
          <TextInput
            label="Data"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value || todayKey())}
          />
          <IconButton label="Próximo dia" onClick={() => setDay((d) => addDays(d, 1))}>
            <ChevronRight />
          </IconButton>
          {day !== todayKey() && (
            <Button size="sm" variant="ghost" onClick={() => setDay(todayKey())}>
              Hoje
            </Button>
          )}
        </div>
        <div className="ata-toolbar-fields">
          <TextInput
            label="Seu nome (na ata)"
            value={proName}
            onChange={(e) => setProName(e.target.value)}
            placeholder="Ex.: Ana"
            hint="Aparece no cabeçalho do PDF/imagem."
          />
          <TextInput
            label="% da dona"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            value={cut}
            onChange={(e) => setCut(Number(e.target.value))}
          />
          <div className="ata-toolbar-save">
            <Button size="sm" variant="secondary" icon={<Save />} loading={savingCut} onClick={saveCut}>
              Salvar %
            </Button>
          </div>
        </div>
      </div>

      {missingPay > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warning">
            {missingPay === 1
              ? 'Há 1 atendimento concluído sem pagamento registrado — ele não entra no faturamento.'
              : `Há ${missingPay} atendimentos concluídos sem pagamento registrado — eles não entram no faturamento.`}
          </Callout>
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState error={error} onRetry={() => { appts.refetch(); settings.refetch(); }} />
      ) : (
        <>
          <div className="money-card card ata-money-summary" style={{ marginBottom: 16 }}>
            <div>
              <small>FATURADO</small>
              <strong>{formatMoney(totalCents)}</strong>
              <span>{billed.length} com pagamento</span>
            </div>
            <div>
              <small>DONA ({cutPct}%)</small>
              <strong>{formatMoney(ownerCents)}</strong>
              <span>Para repassar</span>
            </div>
            <div>
              <small>VOCÊ ({(100 - cutPct).toFixed(cutPct % 1 ? 1 : 0)}%)</small>
              <strong>{formatMoney(keepCents)}</strong>
              <span>Fica com você</span>
            </div>
          </div>

          <div className="ata-preview-wrap">
            <p className="muted small" style={{ marginBottom: 8 }}>Pré-visualização (é o que sai no PDF/imagem)</p>
            <div className="ata-sheet" ref={printRef} id="ata-print">
              <header className="ata-sheet-head">
                <div>
                  <p className="ata-kicker">Ata diária</p>
                  <h2>{content.studioName || 'Estúdio'}</h2>
                  <p className="ata-date">{capitalize(formatLongDate(spToDate(day)))}</p>
                </div>
                <div className="ata-sheet-meta">
                  <span>Profissional</span>
                  <strong>{proName.trim() || '—'}</strong>
                  <span>Gerada em {formatKeyDate(todayKey())}</span>
                </div>
              </header>

              {list.length === 0 ? (
                <EmptyState icon={Receipt} title="Nenhum atendimento neste dia" text="Quando houver agenda, a lista e os totais aparecem aqui." />
              ) : (
                <table className="ata-table">
                  <thead>
                    <tr>
                      <th>Horário</th>
                      <th>Cliente</th>
                      <th>Serviço</th>
                      <th>Status</th>
                      <th>Pago</th>
                      <th>Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => {
                      const inTotal = countsForRevenue(a);
                      return (
                        <tr key={a.id} className={inTotal ? undefined : 'ata-row-muted'}>
                          <td>{formatTime(a.starts_at)}</td>
                          <td>{a.client?.name ?? 'Cliente'}</td>
                          <td>{a.service_name}</td>
                          <td>{STATUS_LABEL[a.status]}</td>
                          <td className="ata-num">
                            {a.paid_cents != null ? formatMoney(a.paid_cents) : '—'}
                          </td>
                          <td>{a.payment_method ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <footer className="ata-sheet-foot">
                <div className="ata-totals">
                  <div>
                    <span>Atendimentos no dia</span>
                    <strong>{list.length}</strong>
                  </div>
                  <div>
                    <span>Com pagamento (no total)</span>
                    <strong>{billed.length}</strong>
                  </div>
                  <div>
                    <span>Total faturado</span>
                    <strong>{formatMoney(totalCents)}</strong>
                  </div>
                  <div className="ata-total-owner">
                    <span>Para a dona ({cutPct}%)</span>
                    <strong>{formatMoney(ownerCents)}</strong>
                  </div>
                  <div>
                    <span>Para a profissional ({(100 - cutPct).toFixed(cutPct % 1 ? 1 : 0)}%)</span>
                    <strong>{formatMoney(keepCents)}</strong>
                  </div>
                </div>
                <p className="ata-note">
                  Valores baseados nos pagamentos registrados no painel. Cancelados e sem pagamento não entram no faturamento.
                </p>
              </footer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
