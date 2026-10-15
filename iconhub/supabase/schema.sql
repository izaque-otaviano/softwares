-- IconHub: dados sincronizados de cada pessoa.
-- Cole tudo no Supabase em SQL Editor > New query > Run.

-- Pastas, favoritos e ajustes de cada ícone salvo.
create table if not exists public.folders (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  name       text not null,
  items      jsonb not null default '[]',
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- SVGs importados (são pequenos, cabem como texto).
create table if not exists public.custom_icons (
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  svg        text not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- Cada pessoa só enxerga e altera os próprios dados.
alter table public.folders enable row level security;
alter table public.custom_icons enable row level security;

drop policy if exists "dono" on public.folders;
create policy "dono" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.custom_icons;
create policy "dono" on public.custom_icons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
