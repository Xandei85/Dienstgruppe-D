/*
 * Application configuration.  The SUPABASE_URL and SUPABASE_ANON_KEY
 * determine whether data are stored remotely (via Supabase) or locally
 * in the browser.  Replace the placeholder values below with your
 * actual Supabase project URL and anon API key.  Leaving either
 * value empty disables remote storage.
 */

window.APP_CONFIG = {
  // URL of your Supabase project (e.g. "https://bvmctyqsydswelyrumzn.supabase.co")
  SUPABASE_URL: "https://bvmctyqsydswelyrumzn.supabase.co",
  // Public anon key for your Supabase project.  Replace the placeholder
  // string with the value from your Supabase dashboard.
  SUPABASE_ANON_KEY: "REPLACE_WITH_YOUR_SUPABASE_ANON_KEY",
  // A name used to distinguish data in a shared Supabase instance
  PROJECT_NAME: "Schichtplan Polizei",
  // List of names that will appear as rows in the grid
  NAMES: ["Wiesent", "Puhl", "Botzenhard", "Sommer", "Schmid"],
  // Year range covered by the app
  YEAR_START: 2026,
  YEAR_END: 2026,
  // Start date for the two‑days‑on/two‑days‑off work pattern (YYYY-MM-DD)
  START_PATTERN_DATE: "2026-01-02",
  // Optional shift of the pattern (0–3).  Useful if you need to offset
  // the pattern mid‑year without changing the start date.
  PATTERN_SHIFT: 0
};