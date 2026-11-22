-- Historial de cambios de los usuarios no admin (BETA 8.51). Ejecutar una vez en Supabase → SQL Editor.
create table if not exists public.historial (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  usuario_id uuid not null,
  email text,
  ficha_id text,
  accion text,
  detalle jsonb
);
alter table public.historial enable row level security;
grant select, insert, delete on public.historial to authenticated;

drop policy if exists "hist_insert_propio" on public.historial;
create policy "hist_insert_propio" on public.historial for insert to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "hist_select_admin" on public.historial;
create policy "hist_select_admin" on public.historial for select to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin'));

drop policy if exists "hist_delete_admin" on public.historial;
create policy "hist_delete_admin" on public.historial for delete to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin'));
