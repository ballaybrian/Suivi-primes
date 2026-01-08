/*************************************************
 * CONFIG
 *************************************************/
const API_URL = "https://script.google.com/macros/s/AKfycbx94ffDuY0bSr1TYRHrI71c70L-_6icRs9fgXTZOB_hOeFV0lAnSPmsPUAVDnFrliw/exec";
const ADMIN_CODE = "1234";

/*************************************************
 * JSONP (anti-CORS GitHub Pages)
 *************************************************/
function jsonp(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }

    window[cb] = (data) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP load error"));
    };

    document.body.appendChild(script);
  });
}

async function api(params) {
  const qs = new URLSearchParams(params).toString();
  const data = await jsonp(`${API_URL}?${qs}`);
  if (!data || data.ok !== true) throw new Error(data?.error || "API error");
  return data;
}

/*************************************************
 * DOM
 *************************************************/
const homeEl = document.getElementById("home");
const weekViewEl = document.getElementById("weekView");
const agentButtonsEl = document.getElementById("agentButtons");
const agentNameEl = document.getElementById("agentName");
const backBtn = document.getElementById("backBtn");

const yearSelect = document.getElementById("yearSelect");
const weekSelect = document.getElementById("weekSelect");
const prevWeekBtn = document.getElementById("prevWeekBtn");
const nextWeekBtn = document.getElementById("nextWeekBtn");

const weekLabel = document.getElementById("weekLabel");
const rangeLabel = document.getElementById("rangeLabel");
const weekTotalEl = document.getElementById("weekTotal");
const dayListEl = document.getElementById("dayList");

const adminBtn = document.getElementById("adminHiddenBtn");

// RECAP DOM
const recapViewEl = document.getElementById("recapView");
const recapBackBtn = document.getElementById("recapBackBtn");
const recapAgentNameEl = document.getElementById("recapAgentName");
const recapYearSelect = document.getElementById("recapYearSelect");
const recapGridEl = document.getElementById("recapGrid");
const recapYearTotalEl = document.getElementById("recapYearTotal");

// ADMIN WEEK DOM
const adminWeekViewEl = document.getElementById("adminWeekView");
const adminWeekBackBtn = document.getElementById("adminWeekBackBtn");
const adminYearSelect = document.getElementById("adminYearSelect");
const adminWeekSelect = document.getElementById("adminWeekSelect");
const adminPrevWeekBtn = document.getElementById("adminPrevWeekBtn");
const adminNextWeekBtn = document.getElementById("adminNextWeekBtn");
const adminSaveWeekBtn = document.getElementById("adminSaveWeekBtn");
const adminWeekLabel = document.getElementById("adminWeekLabel");
const adminRangeLabel = document.getElementById("adminRangeLabel");
const adminGridWrap = document.getElementById("adminGridWrap");
const adminSaveStatus = document.getElementById("adminSaveStatus");

/*************************************************
 * STATE
 *************************************************/
let BOOT = null;
let currentAgent = null;
let isAdmin = sessionStorage.getItem("isAdmin") === "1";
let recapAgent = null;

/*************************************************
 * INIT
 *************************************************/
boot().catch(showBootError);

async function boot() {
  BOOT = await api({ action: "bootstrap" });

  renderHome();
  initYearWeekSelectors();
  initRecapYearSelector();
  initAdminYearWeekSelectors();
  renderLegend();

  backBtn.onclick = showHome;
  prevWeekBtn.onclick = () => shiftWeek(-1);
  nextWeekBtn.onclick = () => shiftWeek(1);
  yearSelect.onchange = refreshWeek;
  weekSelect.onchange = refreshWeek;

  recapBackBtn.onclick = showHome;
  recapYearSelect.onchange = refreshRecap;

  adminWeekBackBtn.onclick = showHome;
  adminPrevWeekBtn.onclick = () => shiftAdminWeek(-1);
  adminNextWeekBtn.onclick = () => shiftAdminWeek(1);
  adminYearSelect.onchange = renderAdminWeekGrid;
  adminWeekSelect.onchange = renderAdminWeekGrid;
  adminSaveWeekBtn.onclick = saveAdminWeekBulk;

  adminBtn.onclick = () => {
    const code = prompt("Code admin ?");
    if (code === null) return;

    if (code === ADMIN_CODE) {
      isAdmin = true;
      sessionStorage.setItem("isAdmin", "1");
      alert("Mode admin activé");
      renderHome();
      if (!weekViewEl.classList.contains("hidden")) refreshWeek();
    } else {
      alert("Code incorrect");
    }
  };
}

function showBootError(err) {
  console.error(err);
  agentButtonsEl.innerHTML = `
    <div style="padding:12px;border:1px solid #f2c2c2;background:#fff5f5;border-radius:12px;">
      <b>Erreur chargement</b><br/>${String(err?.message || err)}
    </div>
  `;
}

/*************************************************
 * NAV
 *************************************************/
function showHome() {
  currentAgent = null;
  recapAgent = null;

  homeEl.classList.remove("hidden");
  weekViewEl.classList.add("hidden");
  recapViewEl.classList.add("hidden");
  adminWeekViewEl.classList.add("hidden");
}

/*************************************************
 * HOME
 *************************************************/
function renderHome() {
  agentButtonsEl.innerHTML = "";

  // bouton accès saisie semaine (admin seulement)
  if (isAdmin) {
    const top = document.createElement("div");
    top.className = "row";
    top.style.justifyContent = "center";
    top.style.marginBottom = "12px";
    top.innerHTML = `<button class="action" id="openAdminWeekBtn">Saisie semaine (Admin)</button>`;
    agentButtonsEl.appendChild(top);

    setTimeout(() => {
      const btn = document.getElementById("openAdminWeekBtn");
      if (btn) btn.onclick = openAdminWeek;
    }, 0);
  }

  const groups = document.createElement("div");
  groups.className = "agent-groups";

  const row1 = document.createElement("div");
  row1.className = "agent-row two";

  const row2 = document.createElement("div");
  row2.className = "agent-row three";

  const row3 = document.createElement("div");
  row3.className = "agent-row three";

  const rows = [row1, row1, row2, row2, row2, row3, row3, row3];

  (BOOT.agents || []).forEach((agent, idx) => {
    const tile = document.createElement("div");
    tile.className = "agent-tile";
    tile.innerHTML = `
      <div class="left">
        <div class="name">${escapeHtml(agent)}</div>
        <div class="hint">Primes Semaine</div>
      </div>
      <div class="agent-actions">
        <button class="recap-btn" type="button">Recap</button>
        <div class="arrow">→</div>
      </div>
    `;

    tile.onclick = () => openAgent(agent);
    tile.querySelector(".recap-btn").onclick = (ev) => { ev.stopPropagation(); openRecap(agent); };

    (rows[idx] || row3).appendChild(tile);
  });

  groups.appendChild(row1);
  groups.appendChild(row2);
  groups.appendChild(row3);
  agentButtonsEl.appendChild(groups);
}

function openAgent(agent) {
  currentAgent = agent;
  agentNameEl.textContent = agent;

  homeEl.classList.add("hidden");
  recapViewEl.classList.add("hidden");
  adminWeekViewEl.classList.add("hidden");
  weekViewEl.classList.remove("hidden");

  refreshWeek();
}

/*************************************************
 * LEGEND
 *************************************************/
function renderLegend() {
  const legendItemsEl = document.getElementById("legendItems");
  if (!legendItemsEl) return;

  legendItemsEl.innerHTML = "";
  const entries = Object.entries(BOOT.primeTypes || {}).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [code, p] of entries) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-icon">${BOOT.icons?.[code] || "🔖"}</span>
      <span>${escapeHtml(p.label || code)}</span>
      <span>— ${Number(p.montant || 0).toFixed(2)}€</span>
    `;
    legendItemsEl.appendChild(item);
  }
}

/*************************************************
 * YEAR/WEEK (ISO)
 *************************************************/
function initYearWeekSelectors() {
  const now = new Date();
  const isoYear = getISOWeekYear(now);
  const isoWeek = getISOWeekNumber(now);

  yearSelect.innerHTML = "";
  [isoYear - 1, isoYear, isoYear + 1].forEach((yy) => {
    const o = document.createElement("option");
    o.value = String(yy);
    o.textContent = String(yy);
    if (yy === isoYear) o.selected = true;
    yearSelect.appendChild(o);
  });

  weekSelect.innerHTML = "";
  for (let w = 1; w <= 53; w++) {
    const o = document.createElement("option");
    o.value = String(w);
    o.textContent = `Semaine ${w}`;
    weekSelect.appendChild(o);
  }

  weekSelect.value = String(isoWeek);
}

function shiftWeek(delta) {
  let y = Number(yearSelect.value);
  let w = Number(weekSelect.value) + delta;

  if (w < 1) { w = 53; y--; }
  if (w > 53) { w = 1; y++; }

  ensureYearOption(yearSelect, y);
  yearSelect.value = String(y);
  weekSelect.value = String(w);
  refreshWeek();
}

function ensureYearOption(selectEl, y) {
  if ([...selectEl.options].some(o => Number(o.value) === y)) return;
  const o = document.createElement("option");
  o.value = String(y);
  o.textContent = String(y);
  selectEl.appendChild(o);
}

/*************************************************
 * WEEK VIEW
 *************************************************/
async function refreshWeek() {
  if (!currentAgent) return;

  const year = Number(yearSelect.value);
  const week = Number(weekSelect.value);

  const start = getISOWeekStartDate(year, week);
  const end = addDays(start, 7);

  const startISO = toISO(start);
  const endISO = toISO(end);

  weekLabel.textContent = `Semaine ${week} — ${year}` + (isAdmin ? " (Admin)" : "");
  rangeLabel.textContent = `${formatFR(start)} → ${formatFR(addDays(end, -1))}`;

  const res = await api({ action: "weekPlan", agent: currentAgent, start: startISO, end: endISO });
  const plan = res.plan || {};

  dayListEl.innerHTML = "";
  let totalWeek = 0;

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dISO = toISO(d);
    const codes = Array.isArray(plan[dISO]) ? plan[dISO] : [];

    const row = document.createElement("div");
    row.className = "dayrow";
    row.innerHTML = `
      <div class="dayleft">
        <div class="dayname">${dayNameFR(d)}</div>
        <div class="daydate">${formatFR(d)}</div>
      </div>
      <div class="rightcol"></div>
    `;

    const right = row.querySelector(".rightcol");
    const chips = document.createElement("div");
    chips.className = "chips";

    let totalDay = 0;
    if (codes.length === 0) {
      chips.innerHTML = `<span class="muted">—</span>`;
    } else {
      for (const code of codes) {
        const p = BOOT.primeTypes?.[code];
        if (!p) continue;
        const amount = Number(p.montant || 0);
        totalDay += amount;

        const chip = document.createElement("div");
        chip.className = "chip";
        chip.title = p.label || code;
        chip.innerHTML = `
          <span class="icon">${BOOT.icons?.[code] || "🔖"}</span>
          <span class="amount">${amount.toFixed(2)}€</span>
        `;
        chips.appendChild(chip);
      }
    }

    totalWeek += totalDay;
    right.appendChild(chips);
    dayListEl.appendChild(row);
  }

  weekTotalEl.textContent = `Total semaine : ${totalWeek.toFixed(2)}€`;
}

/*************************************************
 * RECAP (12 mois)
 *************************************************/
function initRecapYearSelector() {
  const now = new Date();
  const y = now.getFullYear();

  recapYearSelect.innerHTML = "";
  [y - 1, y, y + 1].forEach((yy) => {
    const o = document.createElement("option");
    o.value = String(yy);
    o.textContent = String(yy);
    if (yy === y) o.selected = true;
    recapYearSelect.appendChild(o);
  });
}

function openRecap(agent) {
  recapAgent = agent;
  recapAgentNameEl.textContent = agent;

  homeEl.classList.add("hidden");
  weekViewEl.classList.add("hidden");
  adminWeekViewEl.classList.add("hidden");
  recapViewEl.classList.remove("hidden");

  refreshRecap();
}

async function refreshRecap() {
  if (!recapAgent) return;

  const year = Number(recapYearSelect.value);
  recapGridEl.innerHTML = "";
  recapYearTotalEl.textContent = "Total année : …";

  try {
    const res = await api({ action: "monthRecap", agent: recapAgent, year: String(year) });
    const months = Array.isArray(res.months) ? res.months : Array(12).fill(0);

    const labels = ["Janv","Févr","Mars","Avr","Mai","Juin","Juil","Août","Sept","Oct","Nov","Déc"];

    let totalYear = 0;
    for (let i = 0; i < 12; i++) {
      const val = Number(months[i] || 0);
      totalYear += val;

      const card = document.createElement("div");
      card.className = "recap-card";
      card.innerHTML = `
        <div class="recap-month">${labels[i]}</div>
        <div class="recap-amount">${val.toFixed(2)}€</div>
      `;
      recapGridEl.appendChild(card);
    }

    recapYearTotalEl.textContent = `Total année : ${totalYear.toFixed(2)}€`;
  } catch (e) {
    recapYearTotalEl.textContent = "Total année : —";
    recapGridEl.innerHTML = `
      <div class="recap-card" style="grid-column:1/-1;border-color:#f2c2c2;background:#fff5f5;">
        <div class="recap-month">Erreur API</div>
        <div class="recap-amount" style="font-size:14px;font-weight:800;">
          ${escapeHtml(String(e?.message || e))}
        </div>
      </div>
    `;
  }
}

/*************************************************
 * ADMIN - SAISIE SEMAINE (BULK)
 *************************************************/
function initAdminYearWeekSelectors() {
  const now = new Date();
  const isoYear = getISOWeekYear(now);
  const isoWeek = getISOWeekNumber(now);

  adminYearSelect.innerHTML = "";
  [isoYear - 1, isoYear, isoYear + 1].forEach((yy) => {
    const o = document.createElement("option");
    o.value = String(yy);
    o.textContent = String(yy);
    if (yy === isoYear) o.selected = true;
    adminYearSelect.appendChild(o);
  });

  adminWeekSelect.innerHTML = "";
  for (let w = 1; w <= 53; w++) {
    const o = document.createElement("option");
    o.value = String(w);
    o.textContent = `Semaine ${w}`;
    adminWeekSelect.appendChild(o);
  }
  adminWeekSelect.value = String(isoWeek);
}

function openAdminWeek() {
  if (!isAdmin) return alert("Active le mode admin d'abord.");

  homeEl.classList.add("hidden");
  weekViewEl.classList.add("hidden");
  recapViewEl.classList.add("hidden");
  adminWeekViewEl.classList.remove("hidden");

  renderAdminWeekGrid();
}

function shiftAdminWeek(delta) {
  let y = Number(adminYearSelect.value);
  let w = Number(adminWeekSelect.value) + delta;

  if (w < 1) { w = 53; y--; }
  if (w > 53) { w = 1; y++; }

  ensureYearOption(adminYearSelect, y);
  adminYearSelect.value = String(y);
  adminWeekSelect.value = String(w);
  renderAdminWeekGrid();
}

async function renderAdminWeekGrid() {
  const year = Number(adminYearSelect.value);
  const week = Number(adminWeekSelect.value);

  const start = getISOWeekStartDate(year, week);
  const end = addDays(start, 7);

  const startISO = toISO(start);
  const endISO = toISO(end);

  adminWeekLabel.textContent = `Semaine ${week} — ${year}`;
  adminRangeLabel.textContent = `${formatFR(start)} → ${formatFR(addDays(end, -1))}`;
  adminSaveStatus.textContent = "Chargement…";

  // charge plan de la semaine pour chaque agent (8 appels => OK)
  const planByAgent = {};
  for (const agent of (BOOT.agents || [])) {
    const res = await api({ action: "weekPlan", agent, start: startISO, end: endISO });
    planByAgent[agent] = res.plan || {};
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    days.push({ date: d, iso: toISO(d), label: dayNameFR(d) + " " + formatFR(d) });
  }

  const primeEntries = Object.entries(BOOT.primeTypes || {}).sort((a, b) => a[0].localeCompare(b[0]));

  let html = `<table class="admin-grid"><thead><tr><th>Agent</th>`;
  for (const day of days) html += `<th>${escapeHtml(day.label)}</th>`;
  html += `</tr></thead><tbody>`;

  for (const agent of (BOOT.agents || [])) {
    html += `<tr><td>${escapeHtml(agent)}</td>`;

    for (const day of days) {
      const codes = (planByAgent[agent]?.[day.iso] || []);
      html += `<td>
        <select class="admin-multi" multiple data-agent="${escapeAttr(agent)}" data-date="${day.iso}">
          ${primeEntries.map(([code, p]) => {
            const sel = codes.includes(code) ? "selected" : "";
            const icon = BOOT.icons?.[code] || "🔖";
            return `<option value="${code}" ${sel}>${icon} ${code} — ${escapeHtml(p.label)} (${Number(p.montant).toFixed(2)}€)</option>`;
          }).join("")}
        </select>
      </td>`;
    }

    html += `</tr>`;
  }

  html += `</tbody></table>`;
  adminGridWrap.innerHTML = html;

  adminWeekViewEl.dataset.startISO = startISO;
  adminWeekViewEl.dataset.endISO = endISO;

  adminSaveStatus.textContent = "—";
}

async function saveAdminWeekBulk() {
  const startISO = adminWeekViewEl.dataset.startISO;
  const endISO = adminWeekViewEl.dataset.endISO;
  if (!startISO || !endISO) return;

  const selects = [...adminGridWrap.querySelectorAll("select.admin-multi")];

  // payload: [{agent, days:{dateISO:[codes...]}}]
  const map = new Map();

  for (const sel of selects) {
    const agent = sel.dataset.agent;
    const dateISO = sel.dataset.date;
    const codes = [...sel.selectedOptions].map(o => o.value);

    if (!map.has(agent)) map.set(agent, {});
    map.get(agent)[dateISO] = codes;
  }

  const payloadObj = [];
  for (const [agent, days] of map.entries()) payloadObj.push({ agent, days });

  const payload = encodeURIComponent(JSON.stringify(payloadObj));

  adminSaveWeekBtn.disabled = true;
  adminSaveStatus.textContent = "Enregistrement…";

  try {
    await api({
      action: "setWeekBulk",
      codeAdmin: ADMIN_CODE,
      start: startISO,
      end: endISO,
      payload
    });
    adminSaveStatus.textContent = "✅ Semaine enregistrée";
  } catch (e) {
    adminSaveStatus.textContent = "❌ " + (e?.message || e);
  } finally {
    adminSaveWeekBtn.disabled = false;
    setTimeout(() => (adminSaveStatus.textContent = "—"), 2500);
  }
}

/*************************************************
 * DATE UTILS (ISO)
 *************************************************/
function getISOWeekYear(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  return date.getUTCFullYear();
}

function getISOWeekStartDate(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + (week - 1) * 7);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
}

function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// FIX LUNDI : ISO LOCAL (pas UTC)
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayNameFR(d) {
  return ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"][(d.getDay()+6)%7];
}

function formatFR(d) {
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });
}

/*************************************************
 * ESCAPE
 *************************************************/
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// pour attribut HTML (data-agent)
function escapeAttr(s) {
  return String(s).replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
