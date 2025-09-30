// config.js – Supabase Konfiguration
// 1) URL und anon Key aus Supabase eintragen
// 2) Optional: Tabelle/Schema anpassen (Defaults unten)

window.AppConfig = {
  // ⚠️ Anpassen:
  supabaseUrl: "https://DEINE-PROJEKT-URL.supabase.co",
  supabaseKey: "DEIN-ANON-API-KEY",

  // Optional: Namen anpassen
  tableName: "schedules",
  schema: "public",

  // Lokaler Speicherpräfix (bleibt bestehen)
  storageKeyPrefix: "schichtkalender_v4_"
};
