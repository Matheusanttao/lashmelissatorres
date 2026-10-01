import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/supabase';
import type {
  Appointment, BookingSettings, Client, ClientPhoto, FinanceEntry, GalleryCategory, GalleryItem, ImageConsent,
  MaintenanceSuggestion, Reminder, Service, TimeBlock, WorkingBreak, WorkingHours,
} from '@/lib/types';
import { mergeContent, type SiteContent } from '@/lib/content';

/** Lança o erro do Supabase ou devolve os dados. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

const APPT_SELECT = '*, client:clients(id,name,whatsapp,email)';

// ---------- Consultas --------------------------------------------------
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () =>
      unwrap(await db().from('services').select('*').order('type').order('sort_order').order('name')) as Service[],
  });
}

export function useAppointments(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['appointments', fromIso, toIso],
    queryFn: async () =>
      unwrap(
        await db()
          .from('appointments')
          .select(APPT_SELECT)
          .gte('starts_at', fromIso)
          .lt('starts_at', toIso)
          .order('starts_at'),
      ) as Appointment[],
  });
}

export function useAppointment(id: string | null) {
  return useQuery({
    queryKey: ['appointments', 'one', id],
    enabled: !!id,
    queryFn: async () => unwrap(await db().from('appointments').select(APPT_SELECT).eq('id', id!).single()) as Appointment,
  });
}

export function usePendingAppointments() {
  return useQuery({
    queryKey: ['appointments', 'pending'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('appointments')
          .select(APPT_SELECT)
          .eq('status', 'pendente')
          .gte('starts_at', new Date(Date.now() - 86400000).toISOString())
          .order('starts_at'),
      ) as Appointment[],
  });
}

export function useBlocks(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['blocks', fromIso, toIso],
    queryFn: async () =>
      unwrap(
        await db().from('time_blocks').select('*').lt('starts_at', toIso).gt('ends_at', fromIso).order('starts_at'),
      ) as TimeBlock[],
  });
}

export function useUpcomingBlocks() {
  return useQuery({
    queryKey: ['blocks', 'upcoming'],
    queryFn: async () =>
      unwrap(
        await db().from('time_blocks').select('*').gt('ends_at', new Date().toISOString()).order('starts_at').limit(100),
      ) as TimeBlock[],
  });
}

export function useWorkingHours() {
  return useQuery({
    queryKey: ['working-hours'],
    queryFn: async () => {
      const [h, b] = await Promise.all([
        db().from('working_hours').select('*').order('weekday'),
        db().from('working_breaks').select('*').order('weekday').order('start_time'),
      ]);
      return { hours: unwrap(h) as WorkingHours[], breaks: unwrap(b) as WorkingBreak[] };
    },
  });
}

export function useBookingSettings() {
  return useQuery({
    queryKey: ['booking-settings'],
    queryFn: async () => unwrap(await db().from('booking_settings').select('*').eq('id', 1).single()) as BookingSettings,
  });
}

export function useClients(search: string) {
  return useQuery({
    queryKey: ['clients', search],
    queryFn: async () => {
      let q = db().from('clients').select('*').order('name').limit(200);
      const s = search.trim();
      if (s) {
        const digits = s.replace(/\D/g, '');
        const safe = s.replace(/[%,()]/g, ' ');
        q = digits.length >= 3 ? q.or(`name.ilike.%${safe}%,whatsapp.ilike.%${digits}%`) : q.ilike('name', `%${safe}%`);
      }
      return unwrap(await q) as Client[];
    },
  });
}

export function useClientCount() {
  return useQuery({
    queryKey: ['clients', 'count'],
    queryFn: async () => {
      const { count, error } = await db().from('clients').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', 'one', id],
    enabled: !!id,
    queryFn: async () => unwrap(await db().from('clients').select('*').eq('id', id!).single()) as Client,
  });
}

export function useClientAppointments(clientId: string | undefined) {
  return useQuery({
    queryKey: ['appointments', 'client', clientId],
    enabled: !!clientId,
    queryFn: async () =>
      unwrap(
        await db().from('appointments').select(APPT_SELECT).eq('client_id', clientId!).order('starts_at', { ascending: false }),
      ) as Appointment[],
  });
}

export function useConsents(clientId?: string) {
  return useQuery({
    queryKey: ['consents', clientId ?? 'all'],
    queryFn: async () => {
      let q = db().from('image_consents').select('*').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      return unwrap(await q) as ImageConsent[];
    },
  });
}

export function useActiveConsents() {
  return useQuery({
    queryKey: ['consents', 'active-with-client'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('image_consents')
          .select('*, client:clients(id,name)')
          .is('revoked_at', null)
          .order('created_at', { ascending: false }),
      ) as (ImageConsent & { client: { id: string; name: string } | null })[],
  });
}

export function useClientPhotos(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-photos', clientId],
    enabled: !!clientId,
    queryFn: async () =>
      unwrap(
        await db().from('client_photos').select('*').eq('client_id', clientId!).order('taken_on', { ascending: false }),
      ) as ClientPhoto[],
  });
}

export function useReminders() {
  return useQuery({
    queryKey: ['reminders'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('reminders')
          .select('*, client:clients(id,name,whatsapp)')
          .order('done')
          .order('due_date')
          .order('due_time', { nullsFirst: false })
          .limit(300),
      ) as Reminder[],
  });
}

/** Lançamentos financeiros. Passar from/to como YYYY-MM-DD (to exclusivo). */
export function useFinanceEntries(fromKey: string, toKey: string) {
  return useQuery({
    queryKey: ['finance-entries', fromKey, toKey],
    queryFn: async () =>
      unwrap(
        await db()
          .from('finance_entries')
          .select('*')
          .gte('entry_date', fromKey)
          .lt('entry_date', toKey)
          .order('entry_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(500),
      ) as FinanceEntry[],
  });
}

/** Saldo acumulado de reservas (todas as datas) para o card “guardado”. */
export function useFinanceSavingsBalance() {
  return useQuery({
    queryKey: ['finance-entries', 'savings-balance'],
    queryFn: async () => {
      const rows = unwrap(
        await db().from('finance_entries').select('category, amount_cents').in('category', ['reserva', 'retirada']),
      ) as Pick<FinanceEntry, 'category' | 'amount_cents'>[];
      return rows.reduce((s, r) => s + (r.category === 'reserva' ? r.amount_cents : -r.amount_cents), 0);
    },
  });
}

export function useMaintenanceSuggestions(daysAhead = 7) {
  return useQuery({
    queryKey: ['maintenance-suggestions', daysAhead],
    queryFn: async () =>
      unwrap(await db().rpc('get_maintenance_suggestions', { p_days_ahead: daysAhead })) as MaintenanceSuggestion[],
  });
}

export function useGalleryAdmin() {
  return useQuery({
    queryKey: ['gallery-admin'],
    queryFn: async () => {
      const [items, cats] = await Promise.all([
        db().from('gallery_items').select('*').order('featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false }),
        db().from('gallery_categories').select('*').order('sort_order').order('name'),
      ]);
      return { items: unwrap(items) as GalleryItem[], categories: unwrap(cats) as GalleryCategory[] };
    },
  });
}

export function useSiteContentAdmin() {
  return useQuery({
    queryKey: ['site-content-admin'],
    queryFn: async () => {
      const row = unwrap(
        await db().from('site_content').select('draft,published,updated_at,published_at').eq('id', 1).single(),
      ) as { draft: unknown; published: unknown; updated_at: string; published_at: string | null };
      return { ...row, draftContent: mergeContent(row.draft) as SiteContent };
    },
  });
}

// ---------- Invalidação --------------------------------------------
/** Após qualquer alteração, atualiza painel e site (mesmo navegador). */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

// ---------- Utilidades de gravação ----------------------------------
export async function setAppointmentStatus(id: string, status: Appointment['status'], extra: Partial<Appointment> = {}) {
  unwrap(await db().from('appointments').update({ status, ...extra }).eq('id', id).select('id'));
}

/** Salva a nova ordem de exibição (posição = índice na lista). */
export async function saveOrder(table: 'services' | 'gallery_items' | 'gallery_categories', ids: string[]) {
  const results = await Promise.all(ids.map((id, i) => db().from(table).update({ sort_order: i + 1 }).eq('id', id)));
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

/** Move um item para cima (-1) ou para baixo (+1) dentro da lista. */
export function moveId(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const copy = [...ids];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
