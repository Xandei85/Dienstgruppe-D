// Konfigurationsdatei für den Schichtplan
// Trage hier deine Supabase-URL und deinen anon-key ein. Lasse die Felder leer, um localStorage zu verwenden.

window.APP_CONFIG = {
  SUPABASE_URL: "https://bvmctyqsydswekyrumzn.supabase.co",
  SUPABASE_ANON_KEY: "eyJh…",
  PROJECT_NAME: "Schichtplan Polizei",
  NAMES: ["Wiesent", "Puhl", "Botzenhard", "Sommer", "Schmid"],
  YEAR_START: 2026,
  YEAR_END: 2030,
  START_PATTERN_DATE: "2026-01-02",
  PATTERN_SHIFT: 0
};

// NEU: Keys ans window hängen, damit sie global verfügbar sind
window.SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = window.APP_CONFIG.SUPABASE_ANON_KEY;
