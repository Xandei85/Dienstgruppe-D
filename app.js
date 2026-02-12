// ===============================
// Dienstgruppe D – Final Stable Build
// Single Table + Mitarbeiterverwaltung
// Supabase robust (match() statt eq())
// ===============================

/* ---------- SUPABASE CLIENT ---------- */
const supabaseClient =
  window.supabaseClient ||
  window.supabase ||
  (window.supabase && window.supabase.createClient
    ? window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      )
    : null);

if (!supabaseClient) {
  console.error("Supabase Client nicht verfügbar!");
}

/* ---------- DATUM ---------- */
let currentDate = new Date();
let overrideMap = {};

/* ---------- BASIS NAMEN ---------- */
const BASE_NAMES = [
  "Wiesent",
  "Puhl",
  "Botzenhard",
  "Sommer"
];

const DEFAULT_EXTRA = [
  "Praktikant",
  "Glowczewski",
  "Kathi"
];

/* ---------- HELPER ---------- */
function formatDateKey(date, day) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------- MITARBEITER LADEN ---------- */
async function loadActiveEmployees() {
  try {
    const { data, error } = await supabaseClient
      .from("mitarbeiter")
      .select("name, aktiv")
      .order("name");

    if (error) throw error;

    const active =
      (data || [])
        .filter(r => r && r.aktiv === true)
        .map(r => r.name.trim());

    return active.length
      ? active
      : [...BASE_NAMES, ...DEFAULT_EXTRA];

  } catch (e) {
    console.error("loadActiveEmployees failed", e);
    return [...BASE_NAMES, ...DEFAULT_EXTRA];
  }
}

/* ---------- MITARBEITER AKTIV / INAKTIV ---------- */
async function upsertEmployeeActive(name, aktiv) {
  const cleanName = (name || "").trim();
  if (!cleanName) return;

  try {
    const { data } = await supabaseClient
      .from("mitarbeiter")
      .select("id")
      .match({ name: cleanName })
      .limit(1);

    if (data && data.length) {
      await supabaseClient
        .from("mitarbeiter")
        .update({ aktiv })
        .match({ id: data[0].id });
    } else {
      await supabaseClient
        .from("mitarbeiter")
        .insert([{ name: cleanName, aktiv }]);
    }

  } catch (e) {
    console.error("upsertEmployeeActive error:", e);
  }
}

/* ---------- GRID RENDER ---------- */
async function renderGrid() {
  const container = document.getElementById("gridContainer");
  const names = await loadActiveEmployees();

  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  const days = new Date(y, m + 1, 0).getDate();

  let html = "<table><thead><tr><th>Name</th>";

  for (let d = 1; d <= days; d++) {
    html += `<th>${d}</th>`;
  }

  html += "</tr></thead><tbody>";

  names.forEach(name => {
    html += `<tr><td class="name-click">${name}</td>`;
    for (let d = 1; d <= days; d++) {
      html += `<td></td>`;
    }
    html += "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  bindNameClick();
}

/* ---------- NAME CLICK ---------- */
function bindNameClick() {
  document.querySelectorAll(".name-click").forEach(el => {
    el.addEventListener("click", () => {
      document.getElementById("personSelect").value =
        el.textContent.trim();
    });
  });
}

/* ---------- BUTTONS ---------- */
async function addEmployee() {
  const name = prompt("Name des neuen Mitarbeiters:");
  if (!name) return;

  await upsertEmployeeActive(name, true);
  renderGrid();
}

async function removeEmployee() {
  const name = document.getElementById("personSelect").value;
  if (!name) return;

  if (!confirm(
    `Mitarbeiter wirklich deaktivieren?\n\n${name}\n\nHinweis: Daten bleiben erhalten.`
  )) return;

  await upsertEmployeeActive(name, false);
  renderGrid();
}

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  renderGrid();
});
