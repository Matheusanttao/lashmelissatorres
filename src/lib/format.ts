import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import type { AppointmentStatus, ServiceType } from './types';

export const TZ = 'America/Sao_Paulo';

// ---------- Dinheiro -------------------------------------------------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMoney(cents: number | null | undefined): string {
  return brl.format((cents ?? 0) / 100);
}

export function formatPrice(cents: number, isFrom: boolean): string {
  return isFrom ? `a partir de ${formatMoney(cents)}` : formatMoney(cents);
}

/** "180,50" | "R$ 180" | "180.5" -> 18050 */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, '').trim();
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ---------- Duração -------------------------------------------------
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

// ---------- Telefone ------------------------------------------------
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

export function normalizePhone(v: string): string {
  const d = onlyDigits(v);
  return /^55\d{10,11}$/.test(d) ? d.slice(2) : d;
}

export function formatPhone(v: string | null | undefined): string {
  if (!v) return '';
  const d = normalizePhone(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

/** Máscara progressiva para o campo de WhatsApp. */
export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(v: string): boolean {
  return /^\d{10,11}$/.test(normalizePhone(v));
}

export function isValidEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}

// ---------- Datas (sempre no fuso de São Paulo) ----------------------
type DateInput = string | Date | number;

export function fmt(date: DateInput, pattern: string): string {
  return formatInTimeZone(date, TZ, pattern, { locale: ptBR });
}

/** 14/10/2026 */
export const formatDate = (d: DateInput) => fmt(d, 'dd/MM/yyyy');
/** 14:30 */
export const formatTime = (d: DateInput) => fmt(d, 'HH:mm');
/** 14/10/2026 às 14:30 */
export const formatDateTime = (d: DateInput) => fmt(d, "dd/MM/yyyy 'às' HH:mm");
/** quarta-feira, 14 de outubro */
export const formatLongDate = (d: DateInput) => fmt(d, "EEEE, d 'de' MMMM");

/** Chave de data (yyyy-MM-dd) no fuso de São Paulo. */
export function dateKey(d: DateInput = new Date()): string {
  return fmt(d, 'yyyy-MM-dd');
}

export const todayKey = () => dateKey(new Date());

/** Converte data (yyyy-MM-dd) + hora (HH:mm) de São Paulo para Date/UTC. */
export function spToDate(key: string, time = '00:00'): Date {
  return fromZonedTime(`${key}T${time.slice(0, 5)}:00`, TZ);
}

// Aritmética de datas "puras" (sem fuso), baseada em UTC.
function keyToUTC(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function utcToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(key: string, n: number): string {
  const d = keyToUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToKey(d);
}
export function addMonths(key: string, n: number): string {
  const d = keyToUTC(key);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return utcToKey(d);
}
export function weekday(key: string): number {
  return keyToUTC(key).getUTCDay();
}
export function startOfWeek(key: string): string {
  // Semana começando no domingo, como no calendário brasileiro.
  return addDays(key, -weekday(key));
}
export function startOfMonth(key: string): string {
  return key.slice(0, 8) + '01';
}
export function daysInMonth(key: string): number {
  const d = keyToUTC(startOfMonth(key));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.getUTCDate();
}
export function diffDays(a: string, b: string): number {
  return Math.round((keyToUTC(a).getTime() - keyToUTC(b).getTime()) / 86400000);
}
/** Formata uma chave de data (sem fuso) — ex.: "EEE, dd/MM". */
export function fmtKey(key: string, pattern: string): string {
  // Meio-dia evita qualquer virada de data por fuso.
  return formatInTimeZone(new Date(`${key}T12:00:00Z`), 'UTC', pattern, { locale: ptBR });
}
export const formatKeyDate = (key: string) => fmtKey(key, 'dd/MM/yyyy');

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function minutesOfDay(d: DateInput): number {
  const [h, m] = fmt(d, 'HH:mm').split(':').map(Number);
  return h * 60 + m;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ---------- Rótulos -------------------------------------------------
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  aplicacao: 'Aplicação',
  manutencao: 'Manutenção',
  remocao: 'Remoção',
};

export const SERVICE_TYPE_PLURAL: Record<ServiceType, string> = {
  aplicacao: 'Aplicações',
  manutencao: 'Manutenções',
  remocao: 'Remoção',
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
};

export const ACTIVE_STATUSES: AppointmentStatus[] = ['pendente', 'confirmado', 'concluido'];

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
