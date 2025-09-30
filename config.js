// config.js – Einstellungen für Schichtkalender v4.1 (Supabase)

window.SCHICHTKALENDER_CONFIG = {
  // --- Supabase ---
  supabaseUrl: "https://bvmctyqsydswekyrumzn.supabase.co",   // << hier deine Supabase-URL einfügen
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bWN0eXFzeWRzd2VreXJ1bXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTk5MTEsImV4cCI6MjA3NDczNTkxMX0.GF3JYPn1bYXeXlEjkKwif6iJh7hueDWW1o9nMOmR_98",                  // << hier deinen anon-Key einfügen
  supabaseTable: "plans",                            // unsere neue Tabelle
  defaultBackend: "supabase",                        // 'supabase' oder 'local'

  // --- UI / Defaults ---
  defaultYear: new Date().getFullYear(),
  defaultKW: null, // null = aktuelle KW automatisch
  badges: { atza6: true, atza12: true, praktikant: true },
  storageKey: "schichtkalender_v4_state",
  version: "4.1.0"
};
