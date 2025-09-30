-- Supabase Schema für Schichtplan
-- Tabellen
create table if not exists public.entries (
  year int not null,
  month int not null,
  day int not null,
  name text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (year, month, day, name)
);

create table if not exists public.remarks (
  year int not null,
  month int not null,
  remarks text,
  updated_at timestamptz not null default now(),
  primary key (year, month)
);

create table if not exists public.remarks_day (
  year int not null,
  month int not null,
  day int not null,
  text text,
  updated_at timestamptz not null default now(),
  primary key (year, month, day)
);

create table if not exists public.overrides (
  year int not null,
  month int not null,
  day int not null,
  name text not null,
  yellow_override text check (yellow_override in ('on','off')),
  updated_at timestamptz not null default now(),
  primary key (year, month, day, name)
);

-- RLS & Policies (offen). Für Produktion einschränken!
alter table public.entries enable row level security;
alter table public.remarks enable row level security;
alter table public.remarks_day enable row level security;
alter table public.overrides enable row level security;

create policy if not exists entries_all on public.entries for all using (true) with check (true);
create policy if not exists remarks_all on public.remarks for all using (true) with check (true);
create policy if not exists remarks_day_all on public.remarks_day for all using (true) with check (true);
create policy if not exists overrides_all on public.overrides for all using (true) with check (true);
