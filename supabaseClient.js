// Supabase-Client mit Fallback auf localStorage
// Wenn SUPABASE_URL oder SUPABASE_ANON_KEY leer sind, wird localStorage genutzt.

let sb = null;
(function() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    // Minimale Definition eines „Clients“ (URL + Key)
    sb = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  }
})();

// Schlüssel für localStorage
function keyEntries(y,m) { return `sp:entries:${y}:${m}`; }
function keyRemarks(y,m) { return `sp:remarks:${y}:${m}`; }
function keyOverrides(y,m) { return `sp:overrides:${y}:${m}`; }

// Lokale Speicherung
function lsSaveEntry({ year, month, day, name, value }) {
  const k = keyEntries(year, month);
  const arr = JSON.parse(localStorage.getItem(k) || '[]');
  const idx = arr.findIndex(r => r.day === day && r.name === name);
  if (idx >= 0) arr[idx].value = value; else arr.push({ year, month, day, name, value });
  localStorage.setItem(k, JSON.stringify(arr));
  return Promise.resolve(arr);
}
function lsLoadMonth({ year, month }) {
  return Promise.resolve(JSON.parse(localStorage.getItem(keyEntries(year, month)) || '[]'));
}
function lsSaveRemarks({ year, month, remarks }) {
  localStorage.setItem(keyRemarks(year, month), remarks || '');
  return Promise.resolve(true);
}
function lsLoadRemarks({ year, month }) {
  return Promise.resolve(localStorage.getItem(keyRemarks(year, month)) || '');
}
function lsSaveOverride({ year, month, day, name, yellow_override }) {
  const k = keyOverrides(year, month);
  const arr = JSON.parse(localStorage.getItem(k) || '[]');
  const idx = arr.findIndex(r => r.day === day && r.name === name);
  if (idx >= 0) arr[idx].yellow_override = yellow_override; else arr.push({ year, month, day, name, yellow_override });
  localStorage.setItem(k, JSON.stringify(arr));
  return Promise.resolve(arr);
}
function lsLoadOverrides({ year, month }) {
  return Promise.resolve(JSON.parse(localStorage.getItem(keyOverrides(year, month)) || '[]'));
}

// REST-Helper für Supabase
async function postToTable(table, payload, conflictCols) {
  const rows = Array.isArray(payload) ? payload : [payload];
  const headers = {
    'apikey': sb.key,
    'Authorization': `Bearer ${sb.key}`,
    'Content-Type': 'application/json',
    'Prefer': conflictCols ? `resolution=merge-duplicates,return=representation` : 'return=representation'
  };
  const res = await fetch(`${sb.url}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function fetchFromTable(table, filters, select) {
  const url = new URL(`${sb.url}/rest/v1/${table}`);
  if (filters) {
    Object.entries(filters).forEach(([k,v]) => url.searchParams.set(k, `eq.${v}`));
  }
  url.searchParams.set('select', select || '*');
  const res = await fetch(url, {
    headers: {
      'apikey': sb.key,
      'Authorization': `Bearer ${sb.key}`
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Minimaler Supabase-Wrapper für .from().select().order(), .insert(), .update().eq()
function createSupabaseWrapper(base) {
  if (!base) return null;
  return {
    from: function(table) {
      return {
        // SELECT: erlaubt optional order(), ignoriert Filter
        select: function(selectCols) {
          return {
            order: async function(orderBy, opts) {
              try {
                const data = await fetchFromTable(table, {}, selectCols);
                return { data, error: null };
              } catch (e) {
                return { data: null, error: e };
              }
            }
          };
        },
        // INSERT: unterstützt optional onConflict (z.B. { onConflict: 'id' })
        insert: async function(rows, opts) {
          const conflictCols = opts && opts.onConflict ? opts.onConflict.split(',') : undefined;
          try {
            const data = await postToTable(table, rows, conflictCols);
            return { data, error: null };
          } catch (e) {
            return { data: null, error: e };
          }
        },
        // UPDATE: nur via eq() – nutzt postToTable mit Merge-Konflikt
        update: function(values) {
          return {
            eq: async function(col, value) {
              const payloads = Array.isArray(values) ? values : [values];
              const combined = payloads.map(row => ({ ...row, [col]: value }));
              try {
                const data = await postToTable(table, combined, [col]);
                return { data, error: null };
              } catch (e) {
                return { data: null, error: e };
              }
            }
          };
        }
      };
    }
  };
}

// Öffentliche API-Funktionen für den Plan (wie gehabt)
async function saveCell({ year, month, day, name, value }) {
  if (!sb) return lsSaveEntry({ year, month, day, name, value });
  const row = { project: window.APP_CONFIG.PROJECT_NAME || 'Schichtplan', year, month, day, name, value };
  return postToTable('cells', row, ['project','year','month','day','name']);
}
async function loadMonth({ year, month }) {
  if (!sb) return lsLoadMonth({ year, month });
  return fetchFromTable('cells', { project: window.APP_CONFIG.PROJECT_NAME || 'Schichtplan', year, month }, '*');
}
async function saveRemarks({ year, month, remarks }) {
  if (!sb) return lsSaveRemarks({ year, month, remarks });
  const row = { project: window.APP_CONFIG.PROJECT_NAME || 'Schichtplan', year, month, remarks };
  return postToTable('remarks_month', row, ['project','year','month']);
}
async function loadRemarks({ year, month }) {
  if (!sb) return lsLoadRemarks({ year, month });
  const res = await fetchFromTable('remarks_month', { project: window.APP_CONFIG.PROJECT_NAME || 'Schichtplan', year, month }, 'remarks');
  return (res && res.length > 0) ? res[0].remarks : '';
}
async function saveOverride({ year, month, day, name, yellow_override }) {
  if (!sb) return lsSaveOverride({ year, month, day, name, yellow_override });
  const row = { project: window.APP_CONFIG.PROJECT_NAME || 'Schichtplan', year, month, day, name, yellow_override };
  try {
    return await postToTable('overrides', row, ['project','year','month','day','name']);
  } catch (e) {
    // Fallback auf localStorage, falls Tabelle "overrides" nicht vorhanden oder ein Fehler auftritt
    console.warn('saveOverride: falling back to localStorage due to error', e);
    return lsSaveOverride({ year, month, day, name, yellow_override });
  }
}
async function loadOverrides({ year, month }) {
  if (!sb) return lsLoadOverrides({ year, month });
  try {
    return await fetchFromTable('overrides', { project: window.APP_CONFIG.PROJECT_NAME || 'Schichtplan', year, month }, '*');
  } catch (e) {
    console.warn('loadOverrides: falling back to localStorage due to error', e);
    return lsLoadOverrides({ year, month });
  }
}

// Exportieren in globalen Namespace, damit app.js darauf zugreifen kann
window.saveCell = saveCell;
window.loadMonth = loadMonth;
window.saveRemarks = saveRemarks;
window.loadRemarks = loadRemarks;
window.saveOverride = saveOverride;
window.loadOverrides = loadOverrides;

// Supabase-Wrapper für app.js verfügbar machen
window.supabase = createSupabaseWrapper(sb);
