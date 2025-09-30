# Schichtplan Polizei – PWA v4.4.3
**Fix:** Monats-Bemerkungen werden jetzt korrekt gespeichert (Button & Auto-Save beim Monatswechsel).  
Weitere Änderungen:
- Inline „Tagesbemerkung übernehmen“ (Button jetzt aktiv)
- Polizei Bayern Palette, Logo im Header
- SW-Cache v4-3

## Tipp
Falls Supabase nicht verbunden ist, werden Bemerkungen lokal (localStorage) persistiert.


## v4.4.4
- Echte Upserts (keine Duplikate) – Header `resolution=merge-duplicates`
- Tastatur-Shortcuts für Codes (U, AA, AZA, 6→AZA6, 2→AZA12, W=Weiß→Gelb, Shift+W=Gelb→Weiß, B=🍺, Backspace=Löschen)
- Undo/Redo (Strg+Z / Strg+Y)
- Enter übernimmt Inline-Tagesbemerkung
- Service-Worker Cache-Bump auf v4-4

- Monats-Bemerkungen wirklich pro Monat geladen/geleert
- Toggle-Button für 'Praktikant' (persistiert in localStorage)

- v4.4.7: Praktikant-Feature entfernt (Button & Logik), Namen/Spalten wieder stabil über `NAMES`.
