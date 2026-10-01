export type ServiceType = 'aplicacao' | 'manutencao' | 'remocao';
export type AppointmentStatus = 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'nao_compareceu';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  type: ServiceType;
  duration_minutes: number;
  price_cents: number;
  price_is_from: boolean;
  image_url: string | null;
  image_path: string | null;
  active: boolean;
  featured: boolean;
  sort_order: number;
  maintenance_interval_days: number | null;
  maintenance_rules: string | null;
  created_at?: string;
}

export interface Client {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  notes: string | null;
  style_preferences: string | null;
  source: 'site' | 'painel';
  created_at: string;
}

export interface ImageConsent {
  id: string;
  client_id: string;
  granted_on: string;
  scope: string;
  notes: string | null;
  document_path: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  code: string;
  client_id: string;
  service_id: string | null;
  service_name: string;
  service_type: ServiceType;
  duration_minutes: number;
  price_cents: number;
  price_is_from: boolean;
  starts_at: string;
  ends_at: string;
  buffer_minutes: number;
  occupied_until: string;
  status: AppointmentStatus;
  source: 'site' | 'painel';
  client_message: string | null;
  internal_notes: string | null;
  paid_cents: number | null;
  payment_method: string | null;
  paid_at: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  client?: Pick<Client, 'id' | 'name' | 'whatsapp' | 'email'> | null;
}

export interface TimeBlock {
  id: string;
  starts_at: string;
  ends_at: string;
  kind: 'bloqueio' | 'folga';
  reason: string | null;
  created_at: string;
}

export interface WorkingHours {
  weekday: number;
  is_working: boolean;
  start_time: string;
  end_time: string;
}

export interface WorkingBreak {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

export interface BookingSettings {
  id: number;
  auto_approve: boolean;
  slot_step_minutes: number;
  buffer_minutes: number;
  min_advance_hours: number;
  max_advance_days: number;
  max_pending_per_phone: number;
  /** Percentual do faturamento do dia que fica com a dona do salão (ata). */
  salon_cut_percent: number;
  msg_confirm: string | null;
  msg_reminder: string | null;
  msg_maintenance: string | null;
}

export interface GalleryCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface GalleryItem {
  id: string;
  category_id: string | null;
  title: string | null;
  description: string | null;
  image_url: string;
  image_path: string | null;
  before_image_url: string | null;
  before_image_path: string | null;
  client_id: string | null;
  consent_id: string | null;
  featured: boolean;
  sort_order: number;
  published: boolean;
  created_at: string;
}

export type PublicGalleryItem = Pick<
  GalleryItem,
  'id' | 'category_id' | 'title' | 'description' | 'image_url' | 'before_image_url' | 'featured' | 'sort_order'
>;

export interface ClientPhoto {
  id: string;
  client_id: string;
  appointment_id: string | null;
  storage_path: string;
  caption: string | null;
  taken_on: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  due_date: string;
  due_time: string | null;
  done: boolean;
  done_at: string | null;
  kind: 'manual' | 'manutencao';
  client_id: string | null;
  service_id: string | null;
  appointment_id: string | null;
  created_at: string;
  client?: Pick<Client, 'id' | 'name' | 'whatsapp'> | null;
}

/** Lançamentos manuais do controle financeiro do painel. */
export type FinanceCategory = 'gasto' | 'anuncio' | 'reserva' | 'retirada' | 'extra';

export interface FinanceEntry {
  id: string;
  entry_date: string;
  category: FinanceCategory;
  amount_cents: number;
  title: string;
  notes: string | null;
  created_at: string;
}

export interface MaintenanceSuggestion {
  client_id: string;
  client_name: string;
  whatsapp: string;
  service_id: string;
  service_name: string;
  last_visit: string;
  due_date: string;
  days_until: number;
}

export interface BookingReceipt {
  code: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  service_name: string;
  duration_minutes: number;
  price_cents: number;
  price_is_from: boolean;
  client_first_name: string;
}

export interface PublicWorkingHours {
  weekday: number;
  is_working: boolean;
  start_time: string;
  end_time: string;
}
