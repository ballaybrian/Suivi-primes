const API_URL = "https://script.google.com/macros/s/AKfycbx94ffDuY0bSr1TYRHrI71c70L-_6icRs9fgXTZOB_hOeFV0lAnSPmsPUAVDnFrliw/exec";

// ---------- JSONP (anti-CORS) ----------
function jsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}`;

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
    }

    window[cbName] = (data) => {
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

// ---------- DOM ----------
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

// ---------- STATE ----------
let BOOT = null;
let currentAgent = null;

// ---------- BOOT ----------
boot().catch(err => {
  console.error(err);
  agentButtonsEl.innerHTML = `<div style="padding:12px;border:1px solid #f2c2c2;background:#fff5f5;border-radius:12px;">
    <b>Erreur chargement</b><br/>${String(err?.message || err)}
  </div>`;
});

async function boot() {
  BOOT = await api({ action: "bootstrap" });
  renderHome();

  backBtn.addEventListener("click", goHome);
  prevWeekBtn.addEventListener("click", () => shiftWeek(-1));
  nextWeekBtn.addEventListener("click", () => shiftWeek(1));
  yearSelect.addEventListener("change", () => refreshWeek());
  weekSelect.addEventListener("change", () => refreshWeek());

  initYearWeekSelectors();
}

function renderHome() {
  agentButtonsEl.innerHTML = "";
  BOOT.agents.forEach(agent => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = agent;
    b.onclick = () => openAgent(agent);
    agentButtonsEl.appendChild(b);
  });
}

function goHome() {
  currentAgent = null;
  homeEl.classList.remove("hidden");
  weekViewEl.classList.add("hidden");
}

// ---------- YEAR / WEEK ----------
function initYearWeekSelectors() {
  const now = new Date();
  const y = now.getFullYear();

  // années: y-1, y, y+1 (modifiable)
  yearSelect.innerHTML = "";
  [y - 1, y, y + 1].forEach(yy => {
    const opt = document.createElement("option");
    opt.value = String(yy);
    opt.textContent = String(yy);
    if (yy === y) opt.selected = true;
    yearSelect.appendChild(opt);
  });

  // semaines 1..52 (tu m’as demandé 52)
  weekSelect.innerHTML = "";
  for (let w = 1; w <= 52; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Semaine ${w}`;
    weekSelect.appendChild(opt);
  }

  // semaine courante ISO approximée
  const isoWeek = getISOWeekNumber(now);
  weekSelect.value = String(Math.min(52, Math.max(1, isoWeek)));
}

function openAgent(agent) {
  currentAgent = agent;
  agentNameEl.textContent = agent;

  homeEl.classList.add("hidden");
  weekViewEl.classList.remove("hidden");

  refreshWeek();
}

function shiftWeek(delta) {
  let y = Number(yearSelect.value);
  let w = Number(weekSelect.value);

  w += delta;
  if (w < 1) { w = 52; y -= 1; }
  if (w > 52) { w = 1; y += 1; }

  // si année pas dans la liste, on l’ajoute
  ensureYearOption(y);
  yearSelect.value = String(y);
  weekSelect.value = String(w);

  refreshWeek();
}

function ensureYearOption(y) {
  const exists = Array.from(yearSelect.options).some(o => Number(o.value) === y);
  if (exists) return;
  const opt = document.createElement("option");
  opt.value = String(y);
  opt.textContent = String(y);
  yearSelect.appendChild(opt);
}

// ---------- CORE: afficher la semaine ----------
async function refreshWeek() {
  if (!currentAgent) return;

  const year = Number(yearSelect.value);
  const week = Number(weekSelect.value);

  const start = getISOWeekStartDate(year, week); // lundi
  const end = addDays(start, 7);                 // lundi suivant (exclusif)

  const startISO = toISODate(start);
  const endISO = toISODate(end);

  weekLabel.textContent = `Semaine ${week} — ${year}`;
  rangeLabel.textContent = `${formatFR(start)} → ${formatFR(addDays(end, -1))}`;

  const res = await api({ action: "events", agent: currentAgent, start: startISO, end: endISO });
  const events = res.events || [];

  // Regrouper par date YYYY-MM-DD
  const byDay = new Map();
  for (const e of events) {
    const d = e.start; // YYYY-MM-DD
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }

  // Construire 7 jours
  dayListEl.innerHTML = "";
  let total = 0;

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dISO = toISODate(d);
    const list = byDay.get(dISO) || [];

    const row = document.createElement("div");
    row.className = "dayrow";

    const left = document.createElement("div");
    left.className = "dayleft";
    left.innerHTML = `
      <div class="dayname">${dayNameFR(d)}</div>
      <div class="daydate">${formatFR(d)}</div>
    `;

    const right = document.createElement("div");
    right.className = "icons";

    if (list.length === 0) {
      right.innerHTML = `<span class="muted">—</span>`;
    } else {
      // afficher “logos” (icônes) + montant
      for (const ev of list) {
        const code = ev.extendedProps?.code || "";
        const amount = Number(ev.extendedProps?.montant || 0);
        total += amount;

        const icon = BOOT.icons?.[code] || "🔖";
        const label = BOOT.primeTypes?.[code]?.label || code;

        const chip = document.createElement("div");
        chip.className = "iconchip";
        chip.title = label;

        chip.innerHTML = `
          <span class="icon">${icon}</span>
          <span class="amount">${amount.toFixed(2)}€</span>
        `;
        right.appendChild(chip);
      }
    }

    row.appendChild(left);
    row.appendChild(right);
    dayListEl.appendChild(row);
  }

  weekTotalEl.textContent = `Total semaine : ${total.toFixed(2)}€`;
}

// ---------- Date utils (ISO week) ----------
// Retourne lundi (ISO) de la semaine donnée
function getISOWeekStartDate(year, week) {
  // ISO: semaine 1 = semaine contenant le 4 janvier
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 0=lundi
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day);

  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);

  // repasse en local sans casser le YYYY-MM-DD
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayNameFR(date) {
  return ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"][((date.getDay()+6)%7)];
}

function formatFR(date) {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
