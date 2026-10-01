-- =====================================================================
-- Studio de Cílios — estrutura principal
-- =====================================================================
-- Fuso de referência de todo o sistema: America/Sao_Paulo.
-- Valores monetários são armazenados em centavos (inteiros).

-- ---------- Tipos ----------------------------------------------------
do $$ begin
  create type public.service_type as enum ('aplicacao', 'manutencao', 'remocao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum ('pendente', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu');
exception when duplicate_object then null; end $$;

-- ---------- Administradoras -----------------------------------------
-- Criar uma conta no Auth NÃO dá acesso ao painel. A pessoa só vira
-- administradora quando o dono do projeto insere o user_id aqui
-- (via SQL Editor, com a chave de serviço). Não existe política de
-- INSERT/UPDATE/DELETE para esta tabela.
create table if not exists public.admins (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ---------- Conteúdo do site (rascunho + publicado) ------------------
create table if not exists public.site_content (
  id           smallint primary key default 1 check (id = 1),
  draft        jsonb not null default '{}'::jsonb,
  published    jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);

-- ---------- Configurações de agendamento -----------------------------
create table if not exists public.booking_settings (
  id                    smallint primary key default 1 check (id = 1),
  auto_approve          boolean not null default false,
  slot_step_minutes     integer not null default 30 check (slot_step_minutes in (10, 15, 20, 30, 45, 60)),
  buffer_minutes        integer not null default 15 check (buffer_minutes between 0 and 240),
  min_advance_hours     integer not null default 2  check (min_advance_hours between 0 and 720),
  max_advance_days      integer not null default 60 check (max_advance_days between 1 and 365),
  max_pending_per_phone integer not null default 2  check (max_pending_per_phone between 1 and 10),
  msg_confirm           text,
  msg_reminder          text,
  msg_maintenance       text,
  updated_at            timestamptz not null default now()
);

-- ---------- Expediente ----------------------------------------------
-- weekday: 0 = domingo ... 6 = sábado (mesmo padrão do extract(dow)).
create table if not exists public.working_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  is_working boolean not null default false,
  start_time time not null default '09:00',
  end_time   time not null default '18:00',
  constraint working_hours_valid check (end_time > start_time)
);

create table if not exists public.working_breaks (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  label      text,
  constraint working_breaks_valid check (end_time > start_time)
);
create index if not exists working_breaks_weekday_idx on public.working_breaks (weekday);

-- Bloqueios pontuais e folgas (dias inteiros ou intervalos).
create table if not exists public.time_blocks (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  kind       text not null default 'bloqueio' check (kind in ('bloqueio', 'folga')),
  reason     text,
  created_at timestamptz not null default now(),
  constraint time_blocks_valid check (ends_at > starts_at)
);
create index if not exists time_blocks_range_idx on public.time_blocks using gist (tstzrange(starts_at, ends_at));

-- ---------- Serviços -------------------------------------------------
create table if not exists public.services (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (length(btrim(name)) between 2 and 120),
  description               text,
  type                      public.service_type not null default 'aplicacao',
  duration_minutes          integer not null check (duration_minutes between 5 and 600),
  price_cents               integer not null default 0 check (price_cents >= 0),
  price_is_from             boolean not null default false,
  image_url                 text,
  image_path                text,
  active                    boolean not null default true,
  featured                  boolean not null default false,
  sort_order                integer not null default 0,
  maintenance_interval_days integer check (maintenance_interval_days between 1 and 365),
  maintenance_rules         text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists services_order_idx on public.services (type, sort_order);

-- ---------- Clientes -------------------------------------------------
create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 2 and 120),
  whatsapp          text not null check (whatsapp ~ '^\d{10,13}$'),
  email             text,
  notes             text,
  style_preferences text,
  source            text not null default 'painel' check (source in ('site', 'painel')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint clients_whatsapp_unique unique (whatsapp)
);
create index if not exists clients_name_idx on public.clients (lower(name));

-- Registro de autorização de uso de imagem (histórico, não se apaga:
-- revogar = preencher revoked_at).
create table if not exists public.image_consents (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  granted_on    date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  scope         text not null default 'Site e redes sociais do estúdio',
  notes         text,
  document_path text,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists image_consents_client_idx on public.image_consents (client_id);

-- ---------- Agendamentos --------------------------------------------
create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  client_id        uuid not null references public.clients (id) on delete restrict,
  service_id       uuid references public.services (id) on delete set null,
  service_name     text not null,
  -- Sem valor padrão: o gatilho copia do serviço quando não informado.
  service_type     public.service_type not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  price_cents      integer not null check (price_cents >= 0),
  price_is_from    boolean not null default false,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  buffer_minutes   integer not null check (buffer_minutes between 0 and 240),
  occupied_until   timestamptz not null,
  status           public.appointment_status not null default 'pendente',
  source           text not null default 'painel' check (source in ('site', 'painel')),
  client_message   text,
  internal_notes   text,
  paid_cents       integer check (paid_cents >= 0),
  payment_method   text,
  paid_at          timestamptz,
  cancel_reason    text,
  confirmed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint appointments_time_valid check (ends_at > starts_at and occupied_until >= ends_at),
  -- Garantia final contra agendamentos sobrepostos, mesmo com requisições
  -- simultâneas: o próprio banco recusa dois períodos ocupados que se cruzem.
  constraint appointments_no_overlap exclude using gist (
    tstzrange(starts_at, occupied_until, '[)') with &&
  ) where (status in ('pendente', 'confirmado', 'concluido'))
);
create index if not exists appointments_starts_idx on public.appointments (starts_at);
create index if not exists appointments_client_idx on public.appointments (client_id, starts_at desc);
create index if not exists appointments_status_idx on public.appointments (status);

-- ---------- Fotos privadas de acompanhamento -------------------------
create table if not exists public.client_photos (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  storage_path   text not null,
  caption        text,
  taken_on       date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_at     timestamptz not null default now()
);
create index if not exists client_photos_client_idx on public.client_photos (client_id, taken_on desc);

-- ---------- Galeria pública -----------------------------------------
create table if not exists public.gallery_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 60),
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.gallery_items (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references public.gallery_categories (id) on delete set null,
  title             text,
  description       text,
  image_url         text not null,
  image_path        text,
  before_image_url  text,
  before_image_path text,
  -- Dados privados: nunca são expostos pela função pública da galeria.
  client_id         uuid references public.clients (id) on delete set null,
  consent_id        uuid references public.image_consents (id) on delete restrict,
  featured          boolean not null default false,
  sort_order        integer not null default 0,
  published         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists gallery_items_order_idx on public.gallery_items (sort_order, created_at desc);

-- ---------- Lembretes e tarefas -------------------------------------
create table if not exists public.reminders (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(btrim(title)) between 1 and 160),
  notes          text,
  due_date       date not null,
  due_time       time,
  done           boolean not null default false,
  done_at        timestamptz,
  kind           text not null default 'manual' check (kind in ('manual', 'manutencao')),
  client_id      uuid references public.clients (id) on delete set null,
  service_id     uuid references public.services (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (done, due_date);

-- ---------- Controle anti-abuso das solicitações públicas -----------
create table if not exists public.booking_attempts (
  id         bigserial primary key,
  ip         text,
  whatsapp   text,
  created_at timestamptz not null default now()
);
create index if not exists booking_attempts_ip_idx on public.booking_attempts (ip, created_at);
create index if not exists booking_attempts_phone_idx on public.booking_attempts (whatsapp, created_at);
