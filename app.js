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
  initYearWeekSelectors();
  renderLegend();

  backBtn.onclick = goHome;
  prevWeekBtn.onclick = () => shiftWeek(-1);
  nextWeekBtn.onclick = () => shiftWeek(1);
  yearSelect.onchange = refreshWeek;
  weekSelect.onchange = refreshWeek;

  adminBtn.onclick = () => {
    const code = prompt("Code admin ?");
    if (code === null) return;

    if (code === ADMIN_CODE) {
      isAdmin = true;
      sessionStorage.setItem("isAdmin", "1");
      alert("Mode admin activé");
      refreshWeek();
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
 * HOME
 *************************************************/
function renderHome() {
  agentButtonsEl.innerHTML = "";

  // conteneur des 3 lignes
  const groups = document.createElement("div");
  groups.className = "agent-groups";

  const row1 = document.createElement("div");
  row1.className = "agent-row two";

  const row2 = document.createElement("div");
  row2.className = "agent-row three";

  const row3 = document.createElement("div");
  row3.className = "agent-row three";

  // mapping 2 / 3 / 3
  const rows = [row1, row1, row2, row2, row2, row3, row3, row3];

  BOOT.agents.forEach((agent, idx) => {
    const b = document.createElement("button");
    b.className = "agent-tile";
    b.innerHTML = `
      <div class="left">
        <div class="name">${agent}</div>
        <div class="hint">Voir le planning de la semaine</div>
      </div>
      <div class="arrow">→</div>
    `;
    b.onclick = () => openAgent(agent);
    rows[idx]?.appendChild(b);
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
  weekViewEl.classList.remove("hidden");
  refreshWeek();
}

function goHome() {
  currentAgent = null;
  homeEl.classList.remove("hidden");
  weekViewEl.classList.add("hidden");
}

/*************************************************
 * LÉGENDE
 *************************************************/
function renderLegend() {
  const legendItemsEl = document.getElementById("legendItems");
  if (!legendItemsEl) return;

  legendItemsEl.innerHTML = "";
  const entries = Object.entries(BOOT.primeTypes).sort((a,b) => a[0].localeCompare(b[0]));

  for (const [code, p] of entries) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-icon">${BOOT.icons?.[code] || "🔖"}</span>
      <span>${p.label}</span>
      <span>— ${Number(p.montant).toFixed(2)}€</span>
    `;
    legendItemsEl.appendChild(item);
  }
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
    o.value = String(yy);
    o.textContent = String(yy);
    if (yy === y) o.selected = true;
    yearSelect.appendChild(o);
  });

  weekSelect.innerHTML = "";
  for (let w = 1; w <= 52; w++) {
    const o = document.createElement("option");
    o.value = String(w);
    o.textContent = `Semaine ${w}`;
    weekSelect.appendChild(o);
  }

  weekSelect.value = String(Math.min(52, Math.max(1, getISOWeekNumber(now))));
}

function shiftWeek(delta) {
  let y = Number(yearSelect.value);
  let w = Number(weekSelect.value) + delta;

  if (w < 1) { w = 52; y--; }
  if (w > 52) { w = 1; y++; }

  ensureYearOption(y);
  yearSelect.value = String(y);
  weekSelect.value = String(w);
  refreshWeek();
}

function ensureYearOption(y) {
  if ([...yearSelect.options].some(o => Number(o.value) === y)) return;
  const o = document.createElement("option");
  o.value = String(y);
  o.textContent = String(y);
  yearSelect.appendChild(o);
}

/*************************************************
 * CORE : WEEK DISPLAY + ADMIN RESET
 *************************************************/
async function refreshWeek() {
  if (!currentAgent) return;

  const year = Number(yearSelect.value);
  const week = Number(weekSelect.value);

  const start = getISOWeekStartDate(year, week); // lundi
  const end = addDays(start, 7);                 // exclu

  const startISO = toISO(start);
  const endISO = toISO(end);

  weekLabel.textContent = `Semaine ${week} — ${year}` + (isAdmin ? " (Admin)" : "");
  rangeLabel.textContent = `${formatFR(start)} → ${formatFR(addDays(end, -1))}`;

  const res = await api({ action: "weekPlan", agent: currentAgent, start: startISO, end: endISO });
  const plan = res.plan || {}; // { "YYYY-MM-DD": ["ATTX","TCA"] }

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

    // Affichage chips
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

    // Admin panel (checkbox + save + reset day)
    if (isAdmin) {
      const panel = document.createElement("div");
      panel.className = "admin-panel";

      const checks = document.createElement("div");
      checks.className = "checks";

      const entries = Object.entries(BOOT.primeTypes).sort((a,b) => a[0].localeCompare(b[0]));
      for (const [code, p] of entries) {
        const lab = document.createElement("label");
        lab.className = "check";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = code;
        cb.checked = codes.includes(code);

        const txt = document.createElement("span");
        txt.textContent = `${BOOT.icons?.[code] || "🔖"} ${code} — ${p.label} (${Number(p.montant).toFixed(2)}€)`;

        lab.appendChild(cb);
        lab.appendChild(txt);
        checks.appendChild(lab);
      }

      const actions = document.createElement("div");
      actions.className = "row";
      actions.style.marginTop = "10px";

      const saveBtn = document.createElement("button");
      saveBtn.className = "action";
      saveBtn.textContent = "Enregistrer ce jour";

      const resetDayBtn = document.createElement("button");
      resetDayBtn.className = "danger";
      resetDayBtn.textContent = "Réinitialiser ce jour";

      const status = document.createElement("span");
      status.className = "muted small";

      saveBtn.onclick = async () => {
        const selected = [...checks.querySelectorAll("input[type='checkbox']")]
          .filter(x => x.checked).map(x => x.value);

        saveBtn.disabled = true;
        resetDayBtn.disabled = true;
        status.textContent = "Enregistrement…";

        try {
          await api({
            action: "setDayPlan",
            codeAdmin: ADMIN_CODE,
            agent: currentAgent,
            date: dISO,
            codes: selected.join(",")
          });
          status.textContent = "✅ OK";
          await refreshWeek();
        } catch (e) {
          status.textContent = "❌ " + (e?.message || e);
        } finally {
          saveBtn.disabled = false;
          resetDayBtn.disabled = false;
          setTimeout(() => (status.textContent = ""), 2000);
        }
      };

      resetDayBtn.onclick = async () => {
        if (!confirm("Réinitialiser TOUTES les primes de ce jour ?")) return;

        resetDayBtn.disabled = true;
        saveBtn.disabled = true;
        status.textContent = "Réinitialisation…";

        try {
          await api({
            action: "resetDay",
            codeAdmin: ADMIN_CODE,
            agent: currentAgent,
            date: dISO
          });
          status.textContent = "✅ Réinitialisé";
          await refreshWeek();
        } catch (e) {
          status.textContent = "❌ " + (e?.message || e);
        } finally {
          resetDayBtn.disabled = false;
          saveBtn.disabled = false;
          setTimeout(() => (status.textContent = ""), 2000);
        }
      };

      actions.appendChild(saveBtn);
      actions.appendChild(resetDayBtn);
      actions.appendChild(status);

      panel.appendChild(checks);
      panel.appendChild(actions);
      right.appendChild(panel);
    }

    dayListEl.appendChild(row);
  }

  // Total semaine + reset semaine (admin)
  if (isAdmin) {
    weekTotalEl.innerHTML = `
      Total semaine : ${totalWeek.toFixed(2)}€
      <button id="resetWeekBtn" class="danger" style="margin-left:10px;padding:8px 10px;border-radius:999px;">Réinitialiser semaine</button>
    `;
    const resetWeekBtn = document.getElementById("resetWeekBtn");
    resetWeekBtn.onclick = async () => {
      if (!confirm("⚠️ Réinitialiser TOUTE la semaine pour cet agent ?")) return;

      resetWeekBtn.disabled = true;
      try {
        await api({
          action: "resetWeek",
          codeAdmin: ADMIN_CODE,
          agent: currentAgent,
          start: startISO,
          end: endISO
        });
        await refreshWeek();
      } catch (e) {
        alert("Erreur: " + (e?.message || e));
      } finally {
        resetWeekBtn.disabled = false;
      }
    };
  } else {
    weekTotalEl.textContent = `Total semaine : ${totalWeek.toFixed(2)}€`;
  }
}

/*************************************************
 * DATE UTILS
 *************************************************/
function getISOWeekStartDate(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7; // 0=lundi
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
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });
}
