// Konfigurationsdatei für den Schichtplan
// Trage hier deine Supabase-URL und deinen anon-Key ein. Lasse die Felder leer, um localStorage zu verwenden.

window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  PROJECT_NAME: "Schichtplan Polizei",
  // Namen der regulären Teammitglieder (erscheinen im Dropdown "Ich bin")
  NAMES: ["Wiesent","Puhl","Botzenhard","Sommer","Schmid"],
  YEAR_START: 2026,
  YEAR_END: 2030,
  // Startdatum des Gelb/Weiß-Zyklus (2 Tage Arbeit, 2 Tage frei)
  START_PATTERN_DATE: "2026-01-02",
  PATTERN_SHIFT: 0
};