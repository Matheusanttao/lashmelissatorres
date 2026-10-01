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
