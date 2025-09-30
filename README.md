# Schichtkalender Polizei – v4 (Full Package)

Einfacher, statischer Dienstplan für Dienstgruppen – **für Netlify optimiert**.  
Dieses Paket enthält **alle notwendigen Dateien** (HTML/CSS/JS) plus **Konfiguration**, Manifest, Icons, Netlify-Setup und Beispiel-Konfig.

## Features
- Zellen markieren (Klick), **Bereich** (Shift), **Mehrfach** (Strg/Cmd)
- **Weiß → Gelb** / **Gelb → Weiß** (Zellenhintergrund)
- **ATZA 6** / **ATZA 12** / **Praktikant** als Badges ein-/ausblendbar
- **+ Zeile / – Zeile**
- **Bemerkungen**-Zeile pro Tag
- **Speichern / Laden / Löschen** über localStorage (pro Browser/Endgerät)
- KW/Jahr setzen → Wochentage/Datum werden automatisch gefüllt

## Dateien
- `index.html` – App
- `style.css` – Design
- `app.js` – Logik
- `config.js` – **Konfiguration** (z. B. Storage-Key, Version, Defaults)
- `site.webmanifest`, `icon.svg`, `apple-touch-icon.png`, `favicon.ico`
- `robots.txt`
- `netlify.toml` & `_redirects` & `_headers` – **Netlify-Konfiguration**
- `.editorconfig`
- `LICENSE` (MIT)
- `README.md` (diese Datei)

## Deployment (Netlify)
1. Dieses ZIP entpacken.
2. Im Netlify-Dashboard ein neues **Site from folder** erstellen und **den entpackten Ordner** hochladen.
3. Fertig. (Keine Build-Settings erforderlich – reiner Static-Host.)

### Optional: eigene Domain
- Domain verbinden → DNS A/ALIAS/CNAME gemäß Netlify-Hinweisen setzen.

## Konfiguration
Passe `config.js` an:
```js
window.SCHICHTKALENDER_CONFIG = {
  defaultYear: 2026,
  defaultKW: null, // null = ISO-Woche automatisch
  badges: { atza6: true, atza12: true, praktikant: true },
  storageKey: 'schichtkalender_v4_state',
  version: '4.0.0'
};
```
> Der `storageKey` unterscheidet verschiedene Pläne (praktisch, wenn mehrere Gruppen/Lagen getrennt speichern sollen).

## Datenschutz / Speicherung
- Es werden **keine Server-Daten** genutzt. Alles bleibt lokal im Browser (localStorage).  
- Wenn mehrere Geräte genutzt werden, ist kein Sync eingebaut (kann auf Wunsch per Backend ergänzt werden).

## Backup / Export
- Im Browser DevTools → `localStorage`-Eintrag `schichtkalender_v4_state` kopieren/sichern.
- Erweiterung/Feature für Export als JSON/CSV kann ich dir bei Bedarf integrieren.

## Support / Anpassungen
- Weitere Spalten, Druck-/PDF-Ansicht, Festschreibungen, 2026-Jahresansicht, Benutzerrollen? Sag Bescheid – ich erweitere die v4 gern zu v5.
