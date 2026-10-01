-- =====================================================================
-- Studio de Cílios — ÚNICO script do banco
-- Rode UMA vez no SQL Editor do Supabase (tudo de uma vez).
-- =====================================================================
-- Inclui: schema, funções, segurança, storage, valores iniciais,
-- serviços de exemplo (opcional) e liberação da admin.
--
-- Antes de rodar:
--   1. Authentication → Users → Add user (marque Auto Confirm User)
--   2. Troque o e-mail na seção ADMIN no final deste arquivo
-- =====================================================================


-- >>>>> 20260930000100_schema.sql <<<<<
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
  salon_cut_percent     numeric(5, 2) not null default 30 check (salon_cut_percent >= 0 and salon_cut_percent <= 100),
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

-- ---------- Controle financeiro (gastos, anúncios, reservas) --------
-- Valores em centavos. Categorias:
--   gasto    = saída geral (material, transporte, etc.)
--   anuncio  = investimento em anúncio / divulgação
--   reserva  = dinheiro guardado (entra no “caixa reserva”)
--   retirada = tirou da reserva
--   extra    = ganho avulso (fora dos atendimentos)
create table if not exists public.finance_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  category    text not null check (category in ('gasto', 'anuncio', 'reserva', 'retirada', 'extra')),
  amount_cents integer not null check (amount_cents > 0),
  title       text not null check (length(btrim(title)) between 1 and 160),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on public.finance_entries (entry_date desc);
create index if not exists finance_entries_category_idx on public.finance_entries (category, entry_date);

-- ---------- Controle anti-abuso das solicitações públicas -----------
create table if not exists public.booking_attempts (
  id         bigserial primary key,
  ip         text,
  whatsapp   text,
  created_at timestamptz not null default now()
);
create index if not exists booking_attempts_ip_idx on public.booking_attempts (ip, created_at);
create index if not exists booking_attempts_phone_idx on public.booking_attempts (whatsapp, created_at);


-- >>>>> 20260930000200_functions.sql <<<<<
-- =====================================================================
-- Funções, gatilhos e operações seguras
-- =====================================================================

-- ---------- Papel de administradora ---------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Utilidades ----------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists services_touch on public.services;
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();
drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
drop trigger if exists gallery_items_touch on public.gallery_items;
create trigger gallery_items_touch before update on public.gallery_items
  for each row execute function public.touch_updated_at();
drop trigger if exists booking_settings_touch on public.booking_settings;
create trigger booking_settings_touch before update on public.booking_settings
  for each row execute function public.touch_updated_at();
drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_updated_at();

create or replace function public.new_booking_code()
returns text
language sql
volatile
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

-- Normaliza telefone: só dígitos, remove DDI 55 se presente.
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when d ~ '^55\d{10,11}$' then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.clients_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.whatsapp := public.normalize_phone(new.whatsapp);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  return new;
end $$;

drop trigger if exists clients_normalize on public.clients;
create trigger clients_normalize before insert or update on public.clients
  for each row execute function public.clients_before_write();

-- ---------- Agenda: regras de conflito ------------------------------
-- Todas as escritas na agenda (agendamentos e bloqueios) passam por um
-- mesmo lock transacional. Assim, duas reservas simultâneas são
-- processadas em fila e a segunda enxerga a primeira.
create or replace function public.lock_agenda()
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(hashtext('lash_studio_agenda'));
$$;

create or replace function public.appointments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services;
begin
  if new.code is null or new.code = '' then
    new.code := public.new_booking_code();
  end if;

  -- Copia os dados do serviço quando não informados (histórico preservado
  -- mesmo que o serviço mude de preço depois).
  if new.service_id is not null and (tg_op = 'INSERT' or new.service_id is distinct from old.service_id) then
    select * into v_service from public.services where id = new.service_id;
    if found then
      new.service_name := coalesce(nullif(new.service_name, ''), v_service.name);
      new.service_type := coalesce(new.service_type, v_service.type);
      if new.duration_minutes is null then new.duration_minutes := v_service.duration_minutes; end if;
      if new.price_cents is null then new.price_cents := v_service.price_cents; end if;
    end if;
  end if;

  if new.buffer_minutes is null then
    select buffer_minutes into new.buffer_minutes from public.booking_settings where id = 1;
  end if;
  new.buffer_minutes := coalesce(new.buffer_minutes, 0);
  new.price_cents := coalesce(new.price_cents, 0);
  new.service_type := coalesce(new.service_type, 'aplicacao');

  new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);
  new.occupied_until := new.ends_at + make_interval(mins => new.buffer_minutes);
  new.updated_at := now();

  if new.status = 'confirmado' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  if new.status = 'cancelado' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;
  if new.status <> 'cancelado' then
    new.cancelled_at := null;
  end if;
  if new.paid_cents is not null and new.paid_at is null then
    new.paid_at := now();
  end if;
  if new.paid_cents is null then
    new.paid_at := null;
  end if;

  if new.status in ('pendente', 'confirmado', 'concluido') and (
       tg_op = 'INSERT'
       or new.starts_at is distinct from old.starts_at
       or new.occupied_until is distinct from old.occupied_until
       or old.status not in ('pendente', 'confirmado', 'concluido')
     ) then
    perform public.lock_agenda();
    if exists (
      select 1 from public.time_blocks t
      where tstzrange(t.starts_at, t.ends_at) && tstzrange(new.starts_at, new.ends_at)
    ) then
      raise exception 'Este horário está bloqueado na agenda.' using errcode = 'P0001', hint = 'agenda_bloqueada';
    end if;
    if exists (
      select 1 from public.appointments a
      where a.id <> new.id
        and a.status in ('pendente', 'confirmado', 'concluido')
        and tstzrange(a.starts_at, a.occupied_until) && tstzrange(new.starts_at, new.occupied_until)
    ) then
      raise exception 'Já existe um atendimento neste horário (considerando o intervalo entre atendimentos).'
        using errcode = 'P0001', hint = 'agenda_conflito';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists appointments_validate on public.appointments;
create trigger appointments_validate before insert or update on public.appointments
  for each row execute function public.appointments_before_write();

create or replace function public.time_blocks_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_agenda();
  if exists (
    select 1 from public.appointments a
    where a.status in ('pendente', 'confirmado')
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'Existe atendimento pendente ou confirmado neste período. Reagende ou cancele antes de bloquear.'
      using errcode = 'P0001', hint = 'bloqueio_conflito';
  end if;
  return new;
end $$;

drop trigger if exists time_blocks_validate on public.time_blocks;
create trigger time_blocks_validate before insert or update on public.time_blocks
  for each row execute function public.time_blocks_before_write();

-- ---------- Galeria: exige autorização de imagem ---------------------
create or replace function public.gallery_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consent public.image_consents;
begin
  if new.consent_id is not null then
    select * into v_consent from public.image_consents where id = new.consent_id;
    new.client_id := v_consent.client_id;
  end if;

  if new.published then
    if new.consent_id is null or v_consent.revoked_at is not null then
      raise exception 'Para publicar a foto é preciso vincular uma autorização de uso de imagem ativa.'
        using errcode = 'P0001', hint = 'sem_autorizacao';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists gallery_items_validate on public.gallery_items;
create trigger gallery_items_validate before insert or update on public.gallery_items
  for each row execute function public.gallery_items_before_write();

-- Revogou a autorização? As fotos ligadas a ela saem do site na hora.
create or replace function public.image_consents_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update public.gallery_items set published = false where consent_id = new.id and published;
  end if;
  return new;
end $$;

drop trigger if exists image_consents_revoke on public.image_consents;
create trigger image_consents_revoke after update on public.image_consents
  for each row execute function public.image_consents_after_update();

create or replace function public.reminders_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.done and new.done_at is null then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;

drop trigger if exists reminders_done on public.reminders;
create trigger reminders_done before insert or update on public.reminders
  for each row execute function public.reminders_before_write();

-- ---------- Disponibilidade -----------------------------------------
-- Calcula os horários livres de um dia para um serviço, considerando:
-- duração, intervalo entre atendimentos, expediente, pausas, folgas,
-- bloqueios, antecedência mínima e limite de dias à frente.
create or replace function public.compute_slots(
  p_service_id  uuid,
  p_date        date,
  p_admin       boolean default false,
  p_exclude_id  uuid default null,
  p_duration    integer default null
)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    constant text := 'America/Sao_Paulo';
  v_today date := (now() at time zone v_tz)::date;
  v_dur   integer;
  cfg     public.booking_settings;
  wh      public.working_hours;
  v_cand  timestamptz;
  v_close timestamptz;
  v_end   timestamptz;
  v_occ   timestamptz;
begin
  select * into cfg from public.booking_settings where id = 1;
  if not found then return; end if;

  select coalesce(p_duration, s.duration_minutes) into v_dur
  from public.services s
  where s.id = p_service_id and (p_admin or s.active);
  if v_dur is null then return; end if;

  if not p_admin and (p_date < v_today or p_date > v_today + cfg.max_advance_days) then
    return;
  end if;

  select * into wh from public.working_hours where weekday = extract(dow from p_date)::smallint;
  if not found or not wh.is_working then return; end if;

  v_cand  := (p_date + wh.start_time) at time zone v_tz;
  v_close := (p_date + wh.end_time) at time zone v_tz;

  while v_cand + make_interval(mins => v_dur) <= v_close loop
    v_end := v_cand + make_interval(mins => v_dur);
    v_occ := v_end + make_interval(mins => cfg.buffer_minutes);

    if (p_admin or v_cand >= now() + make_interval(hours => cfg.min_advance_hours))
       and not exists (
         select 1 from public.working_breaks b
         where b.weekday = wh.weekday
           and tstzrange((p_date + b.start_time) at time zone v_tz, (p_date + b.end_time) at time zone v_tz)
               && tstzrange(v_cand, v_end)
       )
       and not exists (
         select 1 from public.time_blocks t
         where tstzrange(t.starts_at, t.ends_at) && tstzrange(v_cand, v_end)
       )
       and not exists (
         select 1 from public.appointments a
         where a.status in ('pendente', 'confirmado', 'concluido')
           and (p_exclude_id is null or a.id <> p_exclude_id)
           and tstzrange(a.starts_at, a.occupied_until) && tstzrange(v_cand, v_occ)
       )
    then
      return next v_cand;
    end if;

    v_cand := v_cand + make_interval(mins => cfg.slot_step_minutes);
  end loop;
end $$;

-- Pública: horários livres de um dia (somente horários, nenhum dado de cliente).
create or replace function public.get_available_slots(p_service_id uuid, p_date date)
returns table (starts_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s from public.compute_slots(p_service_id, p_date) as s;
$$;

-- Pública: dias com pelo menos um horário livre no intervalo (máx. 62 dias).
create or replace function public.get_available_days(p_service_id uuid, p_from date, p_to date)
returns table (day date, slots integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
  n integer;
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Intervalo de datas inválido.' using errcode = 'P0001';
  end if;
  d := p_from;
  while d <= p_to loop
    select count(*) into n from public.compute_slots(p_service_id, d);
    if n > 0 then
      day := d; slots := n;
      return next;
    end if;
    d := d + 1;
  end loop;
end $$;

-- Painel: horários livres ignorando antecedência e permitindo excluir o
-- próprio atendimento (útil para reagendar) e usar duração personalizada.
create or replace function public.admin_available_slots(
  p_service_id uuid, p_date date, p_exclude_id uuid default null, p_duration integer default null
)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query select s from public.compute_slots(p_service_id, p_date, true, p_exclude_id, p_duration) as s;
end $$;

-- ---------- Solicitação pública de agendamento -----------------------
create or replace function public.request_booking(
  p_service_id uuid,
  p_starts_at  timestamptz,
  p_name       text,
  p_whatsapp   text,
  p_email      text default null,
  p_message    text default null
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name    text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone   text := public.normalize_phone(p_whatsapp);
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_headers json;
  v_ip      text;
  cfg       public.booking_settings;
  v_service public.services;
  v_client  uuid;
  v_appt    public.appointments;
begin
  -- 1) Validação dos dados
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if v_phone !~ '^\d{10,11}$' then
    raise exception 'Informe um WhatsApp válido com DDD.' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 160 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'O e-mail informado não parece válido.' using errcode = 'P0001';
  end if;
  if v_message is not null and length(v_message) > 500 then
    raise exception 'A observação pode ter no máximo 500 caracteres.' using errcode = 'P0001';
  end if;

  select * into cfg from public.booking_settings where id = 1;
  select * into v_service from public.services where id = p_service_id and active;
  if not found then
    raise exception 'Este serviço não está disponível para agendamento.' using errcode = 'P0001';
  end if;

  -- 2) Proteção contra abuso
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(btrim(split_part(coalesce(
            v_headers ->> 'cf-connecting-ip',
            v_headers ->> 'x-real-ip',
            v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');

  delete from public.booking_attempts where created_at < now() - interval '2 days';

  if v_ip is not null and (
    select count(*) from public.booking_attempts
    where ip = v_ip and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Recebemos muitas solicitações em pouco tempo. Tente novamente mais tarde ou fale com a gente pelo WhatsApp.'
      using errcode = 'P0001', hint = 'limite';
  end if;
  if (select count(*) from public.booking_attempts
      where whatsapp = v_phone and created_at > now() - interval '1 hour') >= 4 then
    raise exception 'Recebemos muitas solicitações em pouco tempo. Tente novamente mais tarde ou fale com a gente pelo WhatsApp.'
      using errcode = 'P0001', hint = 'limite';
  end if;
  if (select count(*) from public.appointments
      where source = 'site' and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'O agendamento online está temporariamente indisponível. Fale com a gente pelo WhatsApp.'
      using errcode = 'P0001', hint = 'limite';
  end if;
  if (select count(*) from public.appointments a join public.clients c on c.id = a.client_id
      where c.whatsapp = v_phone and a.status = 'pendente' and a.starts_at > now()) >= cfg.max_pending_per_phone then
    raise exception 'Você já tem solicitações aguardando confirmação. Aguarde o retorno ou fale com a gente pelo WhatsApp.'
      using errcode = 'P0001', hint = 'limite';
  end if;

  -- 3) Validação do horário (em fila, para evitar reservas simultâneas)
  perform public.lock_agenda();

  if not exists (
    select 1 from public.compute_slots(p_service_id, (p_starts_at at time zone 'America/Sao_Paulo')::date) as s
    where s = p_starts_at
  ) then
    raise exception 'Este horário acabou de ficar indisponível. Por favor, escolha outro.'
      using errcode = 'P0001', hint = 'horario_indisponivel';
  end if;

  -- 4) Cliente (não sobrescreve dados já cadastrados pelo estúdio)
  select id into v_client from public.clients where whatsapp = v_phone;
  if v_client is null then
    insert into public.clients (name, whatsapp, email, source)
    values (v_name, v_phone, v_email, 'site')
    returning id into v_client;
  elsif v_email is not null then
    update public.clients set email = coalesce(email, v_email) where id = v_client;
  end if;

  -- 5) Solicitação
  begin
    insert into public.appointments (
      client_id, service_id, service_name, service_type, duration_minutes,
      price_cents, price_is_from, starts_at, buffer_minutes, status, source, client_message
    ) values (
      v_client, v_service.id, v_service.name, v_service.type, v_service.duration_minutes,
      v_service.price_cents, v_service.price_is_from, p_starts_at, cfg.buffer_minutes,
      case when cfg.auto_approve then 'confirmado'::public.appointment_status else 'pendente'::public.appointment_status end,
      'site', v_message
    ) returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'Este horário acabou de ficar indisponível. Por favor, escolha outro.'
      using errcode = 'P0001', hint = 'horario_indisponivel';
  end;

  insert into public.booking_attempts (ip, whatsapp) values (v_ip, v_phone);

  return json_build_object(
    'code', v_appt.code,
    'status', v_appt.status,
    'starts_at', v_appt.starts_at,
    'ends_at', v_appt.ends_at,
    'service_name', v_appt.service_name,
    'duration_minutes', v_appt.duration_minutes,
    'price_cents', v_appt.price_cents,
    'price_is_from', v_appt.price_is_from,
    'client_first_name', split_part(v_name, ' ', 1)
  );
end $$;

-- Pública: comprovante pelo código (sem telefone, e-mail ou observações).
create or replace function public.get_booking_receipt(p_code text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code', a.code,
    'status', a.status,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'service_name', a.service_name,
    'duration_minutes', a.duration_minutes,
    'price_cents', a.price_cents,
    'price_is_from', a.price_is_from,
    'client_first_name', split_part(c.name, ' ', 1)
  )
  from public.appointments a
  join public.clients c on c.id = a.client_id
  where a.code = upper(btrim(p_code))
    and length(btrim(p_code)) = 10;
$$;

-- ---------- Conteúdo público ----------------------------------------
create or replace function public.get_site_content()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'content', (select published from public.site_content where id = 1),
    'published_at', (select published_at from public.site_content where id = 1),
    'auto_approve', (select auto_approve from public.booking_settings where id = 1),
    'max_advance_days', (select max_advance_days from public.booking_settings where id = 1),
    'working_hours', coalesce((
      select json_agg(json_build_object(
        'weekday', w.weekday, 'is_working', w.is_working,
        'start_time', to_char(w.start_time, 'HH24:MI'), 'end_time', to_char(w.end_time, 'HH24:MI')
      ) order by w.weekday)
      from public.working_hours w), '[]'::json)
  );
$$;

create or replace function public.get_public_gallery()
returns table (
  id uuid, category_id uuid, title text, description text, image_url text,
  before_image_url text, featured boolean, sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.category_id, g.title, g.description, g.image_url,
         g.before_image_url, g.featured, g.sort_order
  from public.gallery_items g
  join public.image_consents ic on ic.id = g.consent_id and ic.revoked_at is null
  where g.published
  order by g.featured desc, g.sort_order, g.created_at desc;
$$;

-- ---------- Painel ---------------------------------------------------
create or replace function public.publish_site_content()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.site_content set published = draft, published_at = v_at where id = 1;
  return v_at;
end $$;

-- Sugestões de manutenção: clientes cuja última visita concluída tem
-- intervalo de manutenção configurado e está vencendo, sem agendamento
-- futuro e sem lembrete de manutenção criado depois da visita.
create or replace function public.get_maintenance_suggestions(p_days_ahead integer default 7)
returns table (
  client_id uuid, client_name text, whatsapp text, service_id uuid,
  service_name text, last_visit date, due_date date, days_until integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  last_visit as (
    select distinct on (a.client_id) a.client_id, a.service_id, a.service_name, a.starts_at
    from public.appointments a
    where a.status = 'concluido'
    order by a.client_id, a.starts_at desc
  )
  select c.id, c.name, c.whatsapp, s.id, lv.service_name,
         (lv.starts_at at time zone 'America/Sao_Paulo')::date,
         (lv.starts_at at time zone 'America/Sao_Paulo')::date + s.maintenance_interval_days,
         ((lv.starts_at at time zone 'America/Sao_Paulo')::date + s.maintenance_interval_days) - (select d from today)
  from last_visit lv
  join public.clients c on c.id = lv.client_id
  join public.services s on s.id = lv.service_id
  where s.maintenance_interval_days is not null
    and (lv.starts_at at time zone 'America/Sao_Paulo')::date + s.maintenance_interval_days
        between (select d from today) - 21 and (select d from today) + greatest(p_days_ahead, 0)
    and not exists (
      select 1 from public.appointments f
      where f.client_id = c.id and f.status in ('pendente', 'confirmado') and f.starts_at > lv.starts_at
    )
    and not exists (
      select 1 from public.reminders r
      where r.client_id = c.id and r.kind = 'manutencao' and r.created_at > lv.starts_at
    )
  order by 7;
$$;


-- >>>>> 20260930000300_security.sql <<<<<
-- =====================================================================
-- Row Level Security e permissões
-- =====================================================================
-- Regra geral:
--   * anon (visitantes)        -> só conteúdo público, via funções seguras
--                                 ou tabelas sem dados pessoais (serviços
--                                 ativos e categorias da galeria).
--   * authenticated sem admin  -> nada além do que um visitante vê.
--   * administradora           -> acesso completo às tabelas do estúdio.

alter table public.admins             enable row level security;
alter table public.site_content       enable row level security;
alter table public.booking_settings   enable row level security;
alter table public.working_hours      enable row level security;
alter table public.working_breaks     enable row level security;
alter table public.time_blocks        enable row level security;
alter table public.services           enable row level security;
alter table public.clients            enable row level security;
alter table public.image_consents     enable row level security;
alter table public.appointments       enable row level security;
alter table public.client_photos      enable row level security;
alter table public.gallery_categories enable row level security;
alter table public.gallery_items      enable row level security;
alter table public.reminders          enable row level security;
alter table public.finance_entries    enable row level security;
alter table public.booking_attempts   enable row level security;

-- ---------- Permissões de tabela (defesa em profundidade) -------------
revoke all on
  public.admins, public.site_content, public.booking_settings, public.working_hours,
  public.working_breaks, public.time_blocks, public.services, public.clients,
  public.image_consents, public.appointments, public.client_photos,
  public.gallery_categories, public.gallery_items, public.reminders, public.finance_entries,
  public.booking_attempts
from anon;

revoke all on public.booking_attempts from authenticated;
revoke insert, update, delete on public.admins from authenticated;

grant select on public.services, public.gallery_categories to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- Administradoras -----------------------------------------
drop policy if exists "admins: ver o próprio registro" on public.admins;
create policy "admins: ver o próprio registro" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- Tabelas exclusivas do painel ---------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'site_content', 'booking_settings', 'working_hours', 'working_breaks', 'time_blocks',
    'services', 'clients', 'image_consents', 'appointments', 'client_photos',
    'gallery_categories', 'gallery_items', 'reminders', 'finance_entries'
  ] loop
    execute format('drop policy if exists "admin: acesso total" on public.%I', t);
    execute format(
      'create policy "admin: acesso total" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t);
  end loop;
end $$;

-- ---------- Leituras públicas --------------------------------------
drop policy if exists "público: serviços ativos" on public.services;
create policy "público: serviços ativos" on public.services
  for select to anon, authenticated using (active);

drop policy if exists "público: categorias da galeria" on public.gallery_categories;
create policy "público: categorias da galeria" on public.gallery_categories
  for select to anon, authenticated using (true);

-- ---------- Funções: quem pode executar ----------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin()                                         to anon, authenticated;
grant execute on function public.get_site_content()                                 to anon, authenticated;
grant execute on function public.get_public_gallery()                               to anon, authenticated;
grant execute on function public.get_available_slots(uuid, date)                    to anon, authenticated;
grant execute on function public.get_available_days(uuid, date, date)              to anon, authenticated;
grant execute on function public.request_booking(uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.get_booking_receipt(text)                          to anon, authenticated;

grant execute on function public.admin_available_slots(uuid, date, uuid, integer)   to authenticated;
grant execute on function public.publish_site_content()                             to authenticated;
grant execute on function public.get_maintenance_suggestions(integer)               to authenticated;

-- Funções de gatilho/utilitárias são usadas internamente.
grant execute on function public.touch_updated_at()           to authenticated;
grant execute on function public.clients_before_write()       to authenticated;
grant execute on function public.appointments_before_write()  to authenticated;
grant execute on function public.time_blocks_before_write()   to authenticated;
grant execute on function public.gallery_items_before_write() to authenticated;
grant execute on function public.image_consents_after_update() to authenticated;
grant execute on function public.reminders_before_write()     to authenticated;
grant execute on function public.normalize_phone(text)        to authenticated;

-- Novas funções criadas no futuro não ficam públicas por padrão.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------- Tempo real no painel ------------------------------------
-- Novas solicitações aparecem no painel sem recarregar a página.
-- (O Realtime respeita as políticas de RLS acima.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
     ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;


-- >>>>> 20260930000400_storage.sql <<<<<
-- =====================================================================
-- Armazenamento de imagens
-- =====================================================================
--   public-media  -> fotos do site (banner, logo, serviços, galeria).
--                    Leitura pública pela URL; só administradoras enviam.
--   private-media -> fotos de acompanhamento e documentos de autorização.
--                    Somente administradoras leem (via URL assinada).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']),
  ('private-media', 'private-media', false, 15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "midia: admin lê" on storage.objects;
create policy "midia: admin lê" on storage.objects
  for select to authenticated
  using (bucket_id in ('public-media', 'private-media') and public.is_admin());

drop policy if exists "midia: admin envia" on storage.objects;
create policy "midia: admin envia" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('public-media', 'private-media') and public.is_admin());

drop policy if exists "midia: admin altera" on storage.objects;
create policy "midia: admin altera" on storage.objects
  for update to authenticated
  using (bucket_id in ('public-media', 'private-media') and public.is_admin())
  with check (bucket_id in ('public-media', 'private-media') and public.is_admin());

drop policy if exists "midia: admin remove" on storage.objects;
create policy "midia: admin remove" on storage.objects
  for delete to authenticated
  using (bucket_id in ('public-media', 'private-media') and public.is_admin());

-- Observação: não há política de SELECT para visitantes. Arquivos do
-- bucket público continuam acessíveis pela URL pública, mas ninguém de
-- fora consegue listar o conteúdo dos buckets.


-- >>>>> 20260930000500_defaults.sql <<<<<
-- =====================================================================
-- Valores iniciais (seguros para rodar mais de uma vez)
-- =====================================================================

insert into public.site_content (id) values (1) on conflict (id) do nothing;

insert into public.booking_settings (id, msg_confirm, msg_reminder, msg_maintenance)
values (
  1,
  'Oi, {nome}! Aqui é do {estudio}. Seu horário de {servico} está confirmado para {data} às {hora}. Qualquer imprevisto, é só me avisar por aqui. Até lá!',
  'Oi, {nome}! Passando para lembrar do seu horário de {servico} em {data} às {hora}. Venha sem maquiagem nos olhos, combinado? Te espero com carinho.',
  'Oi, {nome}! Já está chegando a hora da manutenção dos seus cílios ({servico}). Quer que eu reserve um horário para você?'
)
on conflict (id) do nothing;

-- Expediente inicial: terça a sábado, 9h às 18h. Domingo e segunda: folga.
insert into public.working_hours (weekday, is_working, start_time, end_time) values
  (0, false, '09:00', '18:00'),
  (1, false, '09:00', '18:00'),
  (2, true,  '09:00', '18:00'),
  (3, true,  '09:00', '18:00'),
  (4, true,  '09:00', '18:00'),
  (5, true,  '09:00', '18:00'),
  (6, true,  '09:00', '15:00')
on conflict (weekday) do nothing;

-- Pausa para almoço (terça a sexta).
insert into public.working_breaks (weekday, start_time, end_time, label)
select d, '12:00', '13:00', 'Almoço'
from generate_series(2, 5) as d
where not exists (select 1 from public.working_breaks);

-- Categorias iniciais da galeria (podem ser editadas ou removidas).
insert into public.gallery_categories (name, sort_order)
select v.name, v.ord
from (values ('Fio a fio', 1), ('Volume brasileiro', 2), ('Volume russo', 3), ('Efeito molhado', 4)) as v(name, ord)
where not exists (select 1 from public.gallery_categories);


-- >>>>> 20261001000100_salon_cut.sql <<<<<
-- Percentual da dona do salão (ata diária). Idempotente.
alter table public.booking_settings
  add column if not exists salon_cut_percent numeric(5, 2) not null default 30;

do $$ begin
  alter table public.booking_settings
    add constraint booking_settings_salon_cut_percent_check
    check (salon_cut_percent >= 0 and salon_cut_percent <= 100);
exception when duplicate_object then null;
end $$;


-- >>>>> 20261001000200_finance_entries.sql <<<<<
-- Controle financeiro do painel. Idempotente (pode rodar sozinho em bases já criadas).
create table if not exists public.finance_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  category     text not null check (category in ('gasto', 'anuncio', 'reserva', 'retirada', 'extra')),
  amount_cents integer not null check (amount_cents > 0),
  title        text not null check (length(btrim(title)) between 1 and 160),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on public.finance_entries (entry_date desc);
create index if not exists finance_entries_category_idx on public.finance_entries (category, entry_date);

alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from anon;
drop policy if exists "admin: acesso total" on public.finance_entries;
create policy "admin: acesso total" on public.finance_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- =====================================================================
-- SERVIÇOS DE EXEMPLO (pode apagar esta seção se preferir cadastrar pelo painel)
-- =====================================================================
-- =====================================================================
-- OPCIONAL: serviços de exemplo para começar mais rápido.
-- Rode apenas se quiser. Depois ajuste nomes, preços e fotos pelo painel
-- (Serviços e preços). Pode ser executado no SQL Editor do Supabase.
-- =====================================================================
insert into public.services
  (name, type, duration_minutes, price_cents, price_is_from, description, featured, sort_order, maintenance_interval_days, maintenance_rules)
values
  ('Fio a fio clássico', 'aplicacao', 120, 16000, false,
   'Um fio sintético sobre cada fio natural. Efeito rímel, natural e delicado.', true, 1, 18, null),
  ('Volume brasileiro', 'aplicacao', 150, 18000, false,
   'Fios em formato de Y que trazem preenchimento com leveza.', true, 2, 18, null),
  ('Volume russo', 'aplicacao', 180, 22000, true,
   'Leques feitos à mão para um olhar marcante e sofisticado.', true, 3, 18, null),
  ('Manutenção', 'manutencao', 90, 11000, true,
   'Reposição dos fios que caíram naturalmente.', false, 1, 18, 'Válida até 21 dias após a última aplicação.'),
  ('Remoção segura', 'remocao', 30, 5000, false,
   'Retirada com removedor próprio, sem danificar os fios naturais.', false, 1, null, null);


-- =====================================================================
-- ADMIN — troque o e-mail e o nome antes de rodar
-- A usuária JÁ precisa existir em Authentication → Users.
-- =====================================================================
insert into public.admins (user_id, display_name)
select id, 'Ana'
from auth.users
where email = 'email-da-profissional@exemplo.com'
on conflict (user_id) do update set display_name = excluded.display_name;

-- Se der 0 linhas, o e-mail ainda não existe no Auth. Crie a usuária e rode de novo.
