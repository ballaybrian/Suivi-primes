/*************************************************
 * CONFIG
 *************************************************/
const API_URL = "https://script.google.com/macros/s/AKfycbx94ffDuY0bSr1TYRHrI71c70L-_6icRs9fgXTZOB_hOeFV0lAnSPmsPUAVDnFrliw/exec";
const ADMIN_CODE = "1234"; // même code que dans Code.gs

/*************************************************
 * JSONP (anti-CORS GitHub Pages)
 *************************************************/
function jsonp(url, timeoutMs = 15000) {
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
  if (!data || data.ok !== true) {
    throw new Error(data?.error || "API error");
  }
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

/*************************************************
 * STATE
 *************************************************/
let BOOT = null;
let currentAgent = null;
let isAdmin = sessionStorage.getItem("isAdmin") === "1";

/*************************************************
 * INIT
 *************************************************/
boot().catch(showBootError);

async function boot() {
  BOOT = await api({ action: "bootstrap" });
  renderHome();
renderLegend();
function renderLegend() {
  const legendItemsEl = document.getElementById("legendItems");
  if (!legendItemsEl) return;

  legendItemsEl.innerHTML = "";

  Object.entries(BOOT.primeTypes).forEach(([code, p]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-icon">${BOOT.icons[code] || "🔖"}</span>
      <span>${p.label}</span>
      <span>— ${p.montant.toFixed(2)}€</span>
    `;
    legendItemsEl.appendChild(item);
  });
}

  initYearWeekSelectors();

  backBtn.onclick = goHome;
  prevWeekBtn.onclick = () => shiftWeek(-1);
  nextWeekBtn.onclick = () => shiftWeek(1);
  yearSelect.onchange = refreshWeek;
  weekSelect.onchange = refreshWeek;

  adminBtn.onclick = () => {
    const code = prompt("Code admin ?");
    if (code === ADMIN_CODE) {
      isAdmin = true;
      sessionStorage.setItem("isAdmin", "1");
      alert("Mode admin activé");
      refreshWeek();
    } else if (code !== null) {
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
 * HOME
 *************************************************/
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

function openAgent(agent) {
  currentAgent = agent;
  agentNameEl.textContent = agent;
  homeEl.classList.add("hidden");
  weekViewEl.classList.remove("hidden");
  refreshWeek();
}

function goHome() {
  currentAgent = null;
  homeEl.classList.remove("hidden");
  weekViewEl.classList.add("hidden");
}

/*************************************************
 * YEAR / WEEK
 *************************************************/
function initYearWeekSelectors() {
  const now = new Date();
  const y = now.getFullYear();

  yearSelect.innerHTML = "";
  [y - 1, y, y + 1].forEach(yy => {
    const o = document.createElement("option");
    o.value = yy;
    o.textContent = yy;
    if (yy === y) o.selected = true;
    yearSelect.appendChild(o);
  });

  weekSelect.innerHTML = "";
  for (let w = 1; w <= 52; w++) {
    const o = document.createElement("option");
    o.value = w;
    o.textContent = `Semaine ${w}`;
    weekSelect.appendChild(o);
  }

  weekSelect.value = Math.min(52, getISOWeekNumber(now));
}

function shiftWeek(delta) {
  let y = Number(yearSelect.value);
  let w = Number(weekSelect.value) + delta;

  if (w < 1) { w = 52; y--; }
  if (w > 52) { w = 1; y++; }

  ensureYearOption(y);
  yearSelect.value = y;
  weekSelect.value = w;
  refreshWeek();
}

function ensureYearOption(y) {
  if ([...yearSelect.options].some(o => Number(o.value) === y)) return;
  const o = document.createElement("option");
  o.value = y;
  o.textContent = y;
  yearSelect.appendChild(o);
}

/*************************************************
 * CORE : WEEK DISPLAY
 *************************************************/
async function refreshWeek() {
  if (!currentAgent) return;

  const year = Number(yearSelect.value);
  const week = Number(weekSelect.value);

  const start = getISOWeekStartDate(year, week);
  const end = addDays(start, 7);

  weekLabel.textContent = `Semaine ${week} — ${year}` + (isAdmin ? " (Admin)" : "");
  rangeLabel.textContent = `${formatFR(start)} → ${formatFR(addDays(end, -1))}`;

  const res = await api({
    action: "weekPlan",
    agent: currentAgent,
    start: toISO(start),
    end: toISO(end)
  });

  const plan = res.plan || {};
  dayListEl.innerHTML = "";
  let totalWeek = 0;

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dISO = toISO(d);
    const codes = plan[dISO] || [];

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
      codes.forEach(code => {
        const p = BOOT.primeTypes[code];
        if (!p) return;
        totalDay += p.montant;

        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `
          <span class="icon">${BOOT.icons[code] || "🔖"}</span>
          <span class="amount">${p.montant.toFixed(2)}€</span>
        `;
        chips.appendChild(chip);
      });
    }

    totalWeek += totalDay;
    right.appendChild(chips);

    // ADMIN PANEL
    if (isAdmin) {
      const panel = document.createElement("div");
      panel.className = "admin-panel";

      const checks = document.createElement("div");
      checks.className = "checks";

      Object.entries(BOOT.primeTypes).forEach(([code, p]) => {
        const lab = document.createElement("label");
        lab.className = "check";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = code;
        cb.checked = codes.includes(code);

        lab.appendChild(cb);
        lab.append(` ${BOOT.icons[code] || ""} ${code} — ${p.label}`);
        checks.appendChild(lab);
      });

      const btn = document.createElement("button");
      btn.className = "action";
      btn.textContent = "Enregistrer ce jour";

      btn.onclick = async () => {
        const selected = [...checks.querySelectorAll("input")]
          .filter(c => c.checked)
          .map(c => c.value);

        await api({
          action: "setDayPlan",
          codeAdmin: ADMIN_CODE,
          agent: currentAgent,
          date: dISO,
          codes: selected.join(",")
        });

        refreshWeek();
      };

      panel.appendChild(checks);
      panel.appendChild(btn);
      right.appendChild(panel);
    }

    dayListEl.appendChild(row);
  }

  weekTotalEl.textContent = `Total semaine : ${totalWeek.toFixed(2)}€`;
}

/*************************************************
 * DATE UTILS
 *************************************************/
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

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function dayNameFR(d) {
  return ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"][(d.getDay()+6)%7];
}

function formatFR(d) {
  return d.toLocaleDateString("fr-FR");
}
