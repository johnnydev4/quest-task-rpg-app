-- Esquema de sincronización de Quest (Fase 9) + Web Push.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar y Run.
--
-- El script es re-ejecutable: cada política se borra antes de crearse, porque
-- Postgres no admite `create policy if not exists` y al correrlo dos veces
-- fallaba con "policy ... already exists".

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

drop policy if exists "usuarios ven solo lo suyo" on public.sync_items;
create policy "usuarios ven solo lo suyo"
  on public.sync_items for select
  using (auth.uid() = user_id);

drop policy if exists "usuarios insertan solo lo suyo" on public.sync_items;
create policy "usuarios insertan solo lo suyo"
  on public.sync_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "usuarios actualizan solo lo suyo" on public.sync_items;
create policy "usuarios actualizan solo lo suyo"
  on public.sync_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "usuarios borran solo lo suyo" on public.sync_items;
create policy "usuarios borran solo lo suyo"
  on public.sync_items for delete
  using (auth.uid() = user_id);

create index if not exists sync_items_updated_at_idx
  on public.sync_items (user_id, updated_at);

-- Bucket privado para adjuntos; cada usuario solo accede a su carpeta ({user_id}/...).
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "adjuntos: leer propios" on storage.objects;
create policy "adjuntos: leer propios"
  on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "adjuntos: subir propios" on storage.objects;
create policy "adjuntos: subir propios"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "adjuntos: actualizar propios" on storage.objects;
create policy "adjuntos: actualizar propios"
  on storage.objects for update
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "adjuntos: borrar propios" on storage.objects;
create policy "adjuntos: borrar propios"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- Web Push: avisos con la app cerrada (ver supabase/PUSH.md)
-- ---------------------------------------------------------------------------

-- Una fila por dispositivo suscrito. `last_seen_at` lo refresca la app abierta:
-- la Edge Function salta los dispositivos vistos hace poco para no duplicar el
-- aviso que ya está dando el temporizador in-app.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'UTC',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: ver propias" on public.push_subscriptions;
create policy "push: ver propias"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push: crear propias" on public.push_subscriptions;
create policy "push: crear propias"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push: actualizar propias" on public.push_subscriptions;
create policy "push: actualizar propias"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push: borrar propias" on public.push_subscriptions;
create policy "push: borrar propias"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- Registro de avisos ya enviados, para no repetir el mismo push cada minuto.
-- Sin políticas a propósito: solo la Edge Function (service role) lo toca.
create table if not exists public.push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);

alter table public.push_sent enable row level security;

create index if not exists push_sent_sent_at_idx on public.push_sent (sent_at);
