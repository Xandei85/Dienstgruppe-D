/*
 * Supabase client helper functions.  This module abstracts saving and
 * loading of entries, monthly remarks and day remarks.  If a Supabase
 * configuration is provided via `window.APP_CONFIG` (see config.js),
 * the data will be persisted to a remote database.  Otherwise the
 * functions fall back to localStorage so the app still works offline.
 */

let sb = null;
(function() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    sb = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  }
})();

// LocalStorage key helpers
function lsKeyEntries(y, m) { return `sp:entries:${y}:${m}`; }
function lsKeyRemarks(y, m) { return `sp:remarks:${y}:${m}`; }
function lsKeyDayRemarks(y, m) { return `sp:dayremarks:${y}:${m}`; }

// LocalStorage persistence for entries
function localSaveEntry({ year, month, day, name, value }) {
  const k = lsKeyEntries(year, month);
  const a = JSON.parse(localStorage.getItem(k) || "[]");
  const i = a.findIndex(r => r.day === day && r.name === name);
  if (i >= 0) a[i].value = value; else a.push({ year, month, day, name, value });
  localStorage.setItem(k, JSON.stringify(a));
  return Promise.resolve(a);
}
function localLoadMonth({ year, month }) {
  return Promise.resolve(JSON.parse(localStorage.getItem(lsKeyEntries(year, month)) || "[]"));
}

// LocalStorage persistence for monthly remarks
function localSaveRemarks({ year, month, remarks }) {
  localStorage.setItem(lsKeyRemarks(year, month), remarks || "");
  return Promise.resolve(true);
}
function localLoadRemarks({ year, month }) {
  return Promise.resolve(localStorage.getItem(lsKeyRemarks(year, month)) || "");
}

// LocalStorage persistence for per‑day remarks
function localSaveDayRemark({ year, month, day, text }) {
  const k = lsKeyDayRemarks(year, month);
  const m = JSON.parse(localStorage.getItem(k) || "{}");
  m[day] = text || "";
  localStorage.setItem(k, JSON.stringify(m));
  return Promise.resolve(true);
}
function localLoadDayRemarks({ year, month }) {
  return Promise.resolve(JSON.parse(localStorage.getItem(lsKeyDayRemarks(year, month)) || "{}"));
}

/*
 * If Supabase is configured, the following functions will perform
 * network requests to the database.  Otherwise, they delegate to
 * the local persistence helpers above.  Each function returns a
 * Promise.
 */

async function saveCell({ year, month, day, name, value }) {
  if (!sb) return localSaveEntry({ year, month, day, name, value });
  const p = { year, month, day, name, value };
  const r = await fetch(`${sb.url}/rest/v1/entries`, {
    method: 'POST',
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(p)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadMonth({ year, month }) {
  if (!sb) return localLoadMonth({ year, month });
  const u = new URL(`${sb.url}/rest/v1/entries`);
  u.searchParams.set('year', 'eq.' + year);
  u.searchParams.set('month', 'eq.' + month);
  u.searchParams.set('select', '*');
  const r = await fetch(u, {
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`
    }
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function saveRemarks({ year, month, remarks }) {
  if (!sb) return localSaveRemarks({ year, month, remarks });
  const p = { year, month, remarks };
  const r = await fetch(`${sb.url}/rest/v1/remarks`, {
    method: 'POST',
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(p)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadRemarks({ year, month }) {
  if (!sb) return localLoadRemarks({ year, month });
  const u = new URL(`${sb.url}/rest/v1/remarks`);
  u.searchParams.set('year', 'eq.' + year);
  u.searchParams.set('month', 'eq.' + month);
  u.searchParams.set('select', 'remarks');
  const r = await fetch(u, {
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`
    }
  });
  if (!r.ok) throw new Error(await r.text());
  const a = await r.json();
  return a.length ? a[0].remarks : "";
}

async function saveDayRemark({ year, month, day, text }) {
  if (!sb) return localSaveDayRemark({ year, month, day, text });
  const p = { year, month, day, text };
  const r = await fetch(`${sb.url}/rest/v1/remarks_day`, {
    method: 'POST',
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(p)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadDayRemarks({ year, month }) {
  if (!sb) return localLoadDayRemarks({ year, month });
  const u = new URL(`${sb.url}/rest/v1/remarks_day`);
  u.searchParams.set('year', 'eq.' + year);
  u.searchParams.set('month', 'eq.' + month);
  u.searchParams.set('select', 'day,text');
  const r = await fetch(u, {
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`
    }
  });
  if (!r.ok) throw new Error(await r.text());
  const a = await r.json();
  const m = {};
  a.forEach(r => m[r.day] = r.text);
  return m;
}

// Export functions globally for use in app.js
window.saveCell = saveCell;
window.loadMonth = loadMonth;
window.saveRemarks = saveRemarks;
window.loadRemarks = loadRemarks;
window.saveDayRemark = saveDayRemark;
window.loadDayRemarks = loadDayRemarks;