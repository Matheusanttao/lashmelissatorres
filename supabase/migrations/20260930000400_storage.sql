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
