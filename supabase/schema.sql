-- Esquema de sincronización de Quest (Fase 9).
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar y Run.

-- Una única tabla de sincronización: cada fila es una entidad local (jsonb)
-- con last-write-wins por updated_at y tombstones (deleted=true).
create table if not exists public.sync_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  id text not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  data jsonb,
  primary key (user_id, table_name, id)
);

alter table public.sync_items enable row level security;

create policy "usuarios ven solo lo suyo"
  on public.sync_items for select
  using (auth.uid() = user_id);

create policy "usuarios insertan solo lo suyo"
  on public.sync_items for insert
  with check (auth.uid() = user_id);

create policy "usuarios actualizan solo lo suyo"
  on public.sync_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "usuarios borran solo lo suyo"
  on public.sync_items for delete
  using (auth.uid() = user_id);

create index if not exists sync_items_updated_at_idx
  on public.sync_items (user_id, updated_at);

-- Bucket privado para adjuntos; cada usuario solo accede a su carpeta ({user_id}/...).
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "adjuntos: leer propios"
  on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "adjuntos: subir propios"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "adjuntos: actualizar propios"
  on storage.objects for update
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "adjuntos: borrar propios"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
