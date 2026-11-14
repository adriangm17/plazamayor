-- Permite que cualquier usuario con sesión (admin y miembro) guarde valores calculados en numista_valores.
-- Ejecutar ENTERO en Supabase -> SQL Editor.
-- "permission denied for table" = falta el permiso de la tabla (GRANT); las políticas (RLS) solas no bastan.

grant usage on schema public to authenticated;
grant select, insert, update on public.numista_valores to authenticated;

alter table public.numista_valores enable row level security;

drop policy if exists "valores_select_autenticados" on public.numista_valores;
create policy "valores_select_autenticados" on public.numista_valores
  for select to authenticated using (true);

drop policy if exists "valores_insert_autenticados" on public.numista_valores;
create policy "valores_insert_autenticados" on public.numista_valores
  for insert to authenticated with check (true);

drop policy if exists "valores_update_autenticados" on public.numista_valores;
create policy "valores_update_autenticados" on public.numista_valores
  for update to authenticated using (true) with check (true);
