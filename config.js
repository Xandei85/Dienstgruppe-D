// config.js – Supabase Konfiguration
// 1) URL und anon Key aus Supabase eintragen
// 2) Optional: Tabelle/Schema anpassen (Defaults unten)

window.AppConfig = {
  // ⚠️ Anpassen:
  supabaseUrl: "https://bvmctyqsydswekyrumzn.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bWN0eXFzeWRzd2VreXJ1bXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTk5MTEsImV4cCI6MjA3NDczNTkxMX0.GF3JYPn1bYXeXlEjkKwif6iJh7hueDWW1o9nMOmR_98",

  // Optional: Namen anpassen
  tableName: "schedules",
  schema: "public",

  // Lokaler Speicherpräfix (bleibt bestehen)
  storageKeyPrefix: "schichtkalender_v4_"
};
