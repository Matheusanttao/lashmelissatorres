import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CalendarPlus, Clock, Hourglass, MessageCircle, Printer, SearchX, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSiteContent } from '@/hooks/useSiteContent';
import { capitalize, formatDuration, formatLongDate, formatMoney, formatTime, formatDate } from '@/lib/format';
import { whatsappLink } from '@/lib/whatsapp';
import type { BookingReceipt } from '@/lib/types';
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Brand';

function icsFile(r: BookingReceipt, studio: string, address: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio de Cilios//Agendamento//PT-BR',
    'BEGIN:VEVENT',
    `UID:${r.code}@agendamento`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(r.starts_at)}`,
    `DTEND:${stamp(r.ends_at)}`,
    `SUMMARY:${esc(`${r.service_name} — ${studio}`)}`,
    address ? `LOCATION:${esc(address)}` : '',
    `DESCRIPTION:${esc(`Código do agendamento: ${r.code}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `agendamento-${r.code}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReceiptPage() {
  const { code = '' } = useParams();
  const location = useLocation();
  const initial = (location.state as { receipt?: BookingReceipt } | null)?.receipt;
  const { content } = useSiteContent();

  const q = useQuery({
    queryKey: ['receipt', code],
    enabled: !!supabase && !!code,
    initialData: initial?.code === code ? initial : undefined,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_booking_receipt', { p_code: code });
      if (error) throw error;
      return (data as BookingReceipt | null) ?? null;
    },
  });

  if (q.isLoading) return <LoadingBlock text="Buscando seu agendamento…" />;
  const r = q.data;
  if (!r) {
    return (
      <div className="booking">
        <div className="card booking-panel">
          <EmptyState
            icon={SearchX}
            title="Agendamento não encontrado"
            text="Confira o código do comprovante ou fale com a gente pelo WhatsApp."
            action={<ButtonLink to="/agendar">Fazer novo agendamento</ButtonLink>}
          />
        </div>
      </div>
    );
  }

  const pending = r.status === 'pendente';
  const cancelled = r.status === 'cancelado' || r.status === 'nao_compareceu';
  const address = [content.contact.address, content.contact.city].filter(Boolean).join(' — ');
  const message = `Olá! Fiz um agendamento pelo site.\n\n${r.service_name}\n${capitalize(formatLongDate(r.starts_at))} às ${formatTime(r.starts_at)}\nCódigo: ${r.code}`;

  return (
    <div className="booking">
      <div className="receipt">
        <div className="receipt-top">
          <span className={`icon-ring ${pending ? 'pending' : ''}`}>
            {cancelled ? <XCircle aria-hidden /> : pending ? <Hourglass aria-hidden /> : <CalendarCheck2 aria-hidden />}
          </span>
          <StatusBadge status={r.status} />
          <h1>
            {cancelled ? 'Agendamento cancelado' : pending ? 'Solicitação enviada!' : 'Horário confirmado!'}
          </h1>
          <p>
            {cancelled
              ? 'Este horário não está mais reservado. Se quiser, faça um novo agendamento.'
              : pending
                ? `Obrigada, ${r.client_first_name}! Sua solicitação está aguardando confirmação do estúdio. Você receberá o retorno pelo WhatsApp.`
                : `Obrigada, ${r.client_first_name}! Seu horário está reservado. Te espero com carinho.`}
          </p>
        </div>
        <div className="receipt-cut" aria-hidden />
        <div className="receipt-body">
          <div className="summary">
            <div className="summary-row"><span>Serviço</span><span>{r.service_name}</span></div>
            <div className="summary-row"><span>Data</span><span>{capitalize(formatLongDate(r.starts_at))}</span></div>
            <div className="summary-row"><span>Horário</span><span className="tabular">{formatTime(r.starts_at)} às {formatTime(r.ends_at)}</span></div>
            <div className="summary-row"><span>Duração</span><span>{formatDuration(r.duration_minutes)}</span></div>
            {address && <div className="summary-row"><span>Local</span><span>{address}</span></div>}
            <div className="summary-row total">
              <span>Valor{r.price_is_from ? ' (a partir de)' : ''}</span>
              <span>{formatMoney(r.price_cents)}</span>
            </div>
          </div>
          <div className="receipt-code">
            <small>Código do agendamento</small>
            <strong>{r.code}</strong>
            <div className="tiny subtle">Emitido em {formatDate(new Date())} · guarde este comprovante</div>
          </div>
          {pending && (
            <p className="small muted center" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Clock size={16} aria-hidden /> O horário fica reservado para você enquanto analisamos.
            </p>
          )}
          <div className="receipt-actions">
            {content.contact.whatsapp && !cancelled && (
              <ButtonAnchor
                variant="whatsapp"
                block
                href={whatsappLink(content.contact.whatsapp, message)}
                target="_blank"
                rel="noopener noreferrer"
                icon={<MessageCircle />}
              >
                Enviar comprovante no WhatsApp
              </ButtonAnchor>
            )}
            {!cancelled && (
              <div className="row" style={{ '--gap': '10px' } as React.CSSProperties}>
                <Button variant="secondary" className="grow" icon={<CalendarPlus />} onClick={() => icsFile(r, content.studioName, address)}>
                  Salvar na agenda
                </Button>
                <Button variant="secondary" className="grow" icon={<Printer />} onClick={() => window.print()}>
                  Imprimir
                </Button>
              </div>
            )}
            <Link to="/" className="link center" style={{ marginTop: 6 }}>
              Voltar para o início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
