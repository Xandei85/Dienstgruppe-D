# Schichtplan Polizei – PWA v4.4.8 (stabile Basis)
- **Geburtstags-Autofill entfernt** (GEB-Button bleibt für manuelle Markierung).
- **Praktikant**: nur lokal (Toggle), keine Supabase-Synchronisierung.
- Robuste Fallbacks bei Supabase-Fehlern (lokale Speicherung greift).
- Service Worker Cache: **v4-8**.

## Setup
1) `config.js` mit deiner `SUPABASE_URL` und `SUPABASE_ANON_KEY` befüllen (Namen nicht löschen!).
2) Dateien ins GitHub-Repo, committen → Netlify baut neu.
3) Im Browser **Strg/Cmd+F5**.
