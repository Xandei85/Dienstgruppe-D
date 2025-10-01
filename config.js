// Konfigurationsdatei für den Schichtplan
// Trage hier deine Supabase-URL und deinen anon-Key ein. Lasse die Felder leer, um localStorage zu verwenden.

window.APP_CONFIG = {
  SUPABASE_URL: "https://bvmctyqsydswekyrumzn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bWN0eXFzeWRzd2VreXJ1bXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTk5MTEsImV4cCI6MjA3NDczNTkxMX0.GF3JYPn1bYXeXlEjkKwif6iJh7hueDWW1o9nMOmR_98",
  PROJECT_NAME: "Schichtplan Polizei",
  // Namen der regulären Teammitglieder (erscheinen im Dropdown "Ich bin")
  NAMES: ["Wiesent","Puhl","Botzenhard","Sommer","Schmid"],
  YEAR_START: 2026,
  YEAR_END: 2030,
  // Startdatum des Gelb/Weiß-Zyklus (2 Tage Arbeit, 2 Tage frei)
  START_PATTERN_DATE: "2026-01-02",
  PATTERN_SHIFT: 0
};
