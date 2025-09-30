# Schichtkalender Polizei – v4 (Supabase + lokal)

Diese Version speichert **lokal** (Browser localStorage) und optional **in der Cloud** via **Supabase**.

## 1) Supabase einrichten
1. Projekt in Supabase anlegen.
2. Unter **SQL Editor** folgende Tabelle erstellen:

```sql
create table if not exists public.schedules (
  ym text primary key,         -- 'YYYY-MM'
  data jsonb not null,         -- kompletter State
  updated_at timestamptz not null default now()
);
-- Optional: Row Level Security deaktivieren oder passende Policies erstellen:
alter table public.schedules enable row level security;
create policy "read schedules" on public.schedules
  for select using (true);
create policy "write schedules" on public.schedules
  for insert with check (true);
create policy "update schedules" on public.schedules
  for update using (true);
create policy "delete schedules" on public.schedules
  for delete using (true);
```

> Hinweis: Für produktive Nutzung Policies bitte restriktiver gestalten (z. B. nur für authentifizierte Nutzer).

3. In **Settings → API**:
   - `Project URL` kopieren
   - `anon public` **API Key** kopieren

## 2) `config.js` anpassen
```js
window.AppConfig = {
  supabaseUrl: "https://DEINE-PROJEKT-URL.supabase.co",
  supabaseKey: "DEIN-ANON-API-KEY",
  tableName: "schedules",
  schema: "public",
  storageKeyPrefix: "schichtkalender_v4_"
};
```

## 3) Deploy
- Projektordner bei **GitHub** hochladen und in **Netlify** deployen (Build: none, Publish: Root).
- Oder über GitHub Pages.

## 4) Nutzung
- Monat auswählen → **Monat aufbauen**.
- Zellen anklicken, dann Buttons verwenden (Weiß↔Gelb, ATZA 6/12, Praktikant ±).
- **Lokal speichern/laden** = Browser localStorage.
- **Cloud speichern/laden/löschen** = Supabase (ein Datensatz pro Monat: Schlüssel `YYYY-MM`).

## Dateien
- `index.html` – App/Buttons + Supabase CDN
- `styles.css` – Layout/Design
- `config.js` – **hier URL + anon Key eintragen**
- `script.js` – Logik inkl. Supabase Upsert/Select/Delete
