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
alter table public.booking_attempts   enable row level security;

-- ---------- Permissões de tabela (defesa em profundidade) -------------
revoke all on
  public.admins, public.site_content, public.booking_settings, public.working_hours,
  public.working_breaks, public.time_blocks, public.services, public.clients,
  public.image_consents, public.appointments, public.client_photos,
  public.gallery_categories, public.gallery_items, public.reminders, public.booking_attempts
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
    'gallery_categories', 'gallery_items', 'reminders'
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
