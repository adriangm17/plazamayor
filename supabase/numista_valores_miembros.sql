-- Permite que cualquier usuario con sesión (admin y miembro) guarde valores calculados en numista_valores.
-- Ejecutar en Supabase → SQL Editor. Si ya tienes políticas con otro nombre que bloqueen, bórralas antes.
alter table public.numista_valores enable row level security;

drop policy if exists "valores_insert_autenticados" on public.numista_valores;
create policy "valores_insert_autenticados" on public.numista_valores
  for insert to authenticated with check (true);

drop policy if exists "valores_update_autenticados" on public.numista_valores;
create policy "valores_update_autenticados" on public.numista_valores
  for update to authenticated using (true) with check (true);

-- (la lectura ya la tienen los dos usuarios; si no: )
-- create policy "valores_select_autenticados" on public.numista_valores for select to authenticated using (true);
