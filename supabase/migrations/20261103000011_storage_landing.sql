-- ============================================================================
-- Storage: fotos de la landing (productos, antes/después)
-- ============================================================================
-- Bucket público: cualquiera puede ver las fotos (las usa la landing).
-- Solo super_admin, owner y marketing pueden subir, reemplazar o borrar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('landing', 'landing', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "landing: staff uploads" on storage.objects;
create policy "landing: staff uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'landing' and public.get_my_role() in ('super_admin', 'owner', 'marketing'));

drop policy if exists "landing: staff updates" on storage.objects;
create policy "landing: staff updates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'landing' and public.get_my_role() in ('super_admin', 'owner', 'marketing'));

drop policy if exists "landing: staff deletes" on storage.objects;
create policy "landing: staff deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'landing' and public.get_my_role() in ('super_admin', 'owner', 'marketing'));
