// ===== CONFIG =====
const API_URL = "https://script.google.com/macros/s/AKfycbzH5t37kIqFwVJX3zDbpO-uljb0QfuBjdasYuBWwdQW-1M5aR4GOB5huKewjA-Ljg/exec";
const IS_ADMIN = new URLSearchParams(window.location.search).get("admin") === "1";

// ===== STATE =====
let BOOT = null;
let currentAgent = null;
let calendar = null;
let ALLOWED_CODES = new Set(); // pour les agents

// ===== JSONP (anti-CORS) =====
function jsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${sep}callback=${cbName}`;

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

    script.src = finalUrl;
    document.body.appendChild(script);
  });
}

async function api(params) {
  const qs = new URLSearchParams(params).toString();
  const data = await jsonp(`${API_URL}?${qs}`);
  if (!data || data.ok !== true) throw new Error(data?.error || "API error");
  return data;
}

// ===== DOM =====
const homeEl = document.getElementById("home");
const agentViewEl = document.getElementById("agentView");

const agentButtonsEl = document.getElementById("agentButtons");
const agentNameEl = document.getElementById("agentName");
const monthTotalEl = document.getElementById("monthTotal");

const adminFormEl = document.getElementById("adminForm");
const agentFormEl = document.getElementById("agentForm");

const primeDateEl = document.getElementById("primeDate");
const primeCodeEl = document.getElementById("primeCode");
const primeCommentEl = document.getElementById("primeComment");

const primeDateAgentEl = document.getElementById("primeDateAgent");
const primeIconsEl = document.getElementById("primeIcons");

const adminAccessCardEl = document.getElementById("adminAccessCard");
const accessChecksEl = document.getElementById("accessChecks");
const saveAccessBtn = document.getElementById("saveAccessBtn");
const saveAccessStatus = document.getElementById("saveAccessStatus");

document.getElementById("backBtn").addEventListener("click", goHome);
document.getElementById("modeBadge").textContent = `Mode : ${IS_ADMIN ? "Admin" : "Agent"}`;

if (IS_ADMIN) {
  document.getElementById("addBtn").addEventListener("click", addPrimeAdmin);
  saveAccessBtn.addEventListener("click", saveAccess);
}

// ===== BOOT =====
boot();

async function boot() {
  BOOT = await api({ action: "bootstrap" });
  renderHome();
  fillPrimeSelect();

  adminFormEl.classList.toggle("hidden", !IS_ADMIN);
  agentFormEl.classList.toggle("hidden", IS_ADMIN);
  adminAccessCardEl.classList.toggle("hidden", !IS_ADMIN);
}

// ===== HOME =====
function renderHome() {
  agentButtonsEl.innerHTML = "";
  BOOT.agents.forEach(a => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = a;
    b.onclick = () => openAgent(a);
    agentButtonsEl.appendChild(b);
  });
}

function fillPrimeSelect() {
  primeCodeEl.innerHTML = "";
  const types = BOOT.primeTypes || {};
  Object.keys(types).sort().forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} — ${types[code].label} (${Number(types[code].montant).toFixed(2)}€)`;
    primeCodeEl.appendChild(opt);
  });
}

// ===== NAV =====
function goHome() {
  homeEl.classList.remove("hidden");
  agentViewEl.classList.add("hidden");
  currentAgent = null;

  if (calendar) { calendar.destroy(); calendar = null; }
  ALLOWED_CODES = new Set();
  accessChecksEl.innerHTML = "";
  saveAccessStatus.textContent = "";
}

async function openAgent(agent) {
  currentAgent = agent;
  agentNameEl.textContent = agent;

  homeEl.classList.add("hidden");
  agentViewEl.classList.remove("hidden");

  // default date
  if (IS_ADMIN) {
    primeDateEl.valueAsDate = new Date();
  } else {
    primeDateAgentEl.valueAsDate = new Date();
  }

  // Charge accès + UI accès
  if (IS_ADMIN) {
    await loadAccessForAdminUI();
  } else {
    await loadAllowedForAgent();
    renderAgentIcons();
  }

  initCalendar();
}

// ===== ACCESS =====
async function loadAllowedForAgent() {
  const res = await api({ action: "allowed", agent: currentAgent });
  ALLOWED_CODES = new Set(res.codes || []);
}

async function loadAccessForAdminUI() {
  saveAccessStatus.textContent = "";
  const res = await api({ action: "allowed", agent: currentAgent });
  const allowed = new Set(res.codes || []);

  accessChecksEl.innerHTML = "";
  const entries = Object.entries(BOOT.primeTypes || {}).sort((a,b) => a[0].localeCompare(b[0]));
  for (const [code, p] of entries) {
    const icon = (BOOT.icons && BOOT.icons[code]) ? BOOT.icons[code] : "🔖";
    const wrap = document.createElement("label");
    wrap.className = "check";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = code;
    cb.checked = allowed.has(code);

    const box = document.createElement("div");
    box.innerHTML = `
      <div class="label">${icon} ${code} — ${p.label}</div>
      <div class="sub">${Number(p.montant).toFixed(2)}€</div>
    `;

    wrap.appendChild(cb);
    wrap.appendChild(box);
    accessChecksEl.appendChild(wrap);
  }
}

async function saveAccess() {
  const cbs = Array.from(accessChecksEl.querySelectorAll("input[type='checkbox']"));
  const codes = cbs.filter(x => x.checked).map(x => x.value);

  saveAccessBtn.disabled = true;
  saveAccessStatus.textContent = "Enregistrement…";

  try {
    await api({ action: "setAccess", agent: currentAgent, codes: codes.join(",") });
    saveAccessStatus.textContent = "✅ Sauvegardé";
  } catch (e) {
    saveAccessStatus.textContent = "❌ Erreur : " + (e?.message || e);
  } finally {
    saveAccessBtn.disabled = false;
    setTimeout(() => (saveAccessStatus.textContent = ""), 3000);
  }
}

// ===== AGENT ICONS =====
function renderAgentIcons() {
  primeIconsEl.innerHTML = "";

  const entries = Object.entries(BOOT.primeTypes || {}).sort((a,b) => a[0].localeCompare(b[0]));
  for (const [code, p] of entries) {
    // filtre autorisations
    if (ALLOWED_CODES.size > 0 && !ALLOWED_CODES.has(code)) continue;

    const icon = (BOOT.icons && BOOT.icons[code]) ? BOOT.icons[code] : "🔖";

    const b = document.createElement("button");
    b.className = "btn";
    b.innerHTML = `
      <div class="icon-box">
        <div class="icon-big">${icon}</div>
        <div style="font-weight:950">${p.label}</div>
        <div class="muted small">${Number(p.montant).toFixed(2)}€</div>
      </div>
    `;

    b.onclick = async () => {
      const dateISO = primeDateAgentEl.value;
      if (!dateISO) { alert("Choisis une date"); return; }

      try {
        await api({ action: "addPrime", agent: currentAgent, date: dateISO, code });
        await refreshAfterAdd();
      } catch (e) {
        alert("Erreur: " + (e?.message || e));
      }
    };

    primeIconsEl.appendChild(b);
  }

  if (primeIconsEl.children.length === 0) {
    primeIconsEl.innerHTML = `<div class="muted small">Aucune prime attribuée à cet agent (admin).</div>`;
  }
}

// ===== CALENDAR =====
function initCalendar() {
  const el = document.getElementById("calendar");
  if (calendar) { calendar.destroy(); calendar = null; }

  calendar = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth",
    height: "auto",
    firstDay: 1,
    headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth" },
    datesSet: async (info) => {
      await refreshEvents(info.startStr, info.endStr);
      await refreshMonthTotal(info.view.currentStart);
    }
  });

  calendar.render();

  const v = calendar.view;
  refreshEvents(v.activeStart.toISOString().slice(0,10), v.activeEnd.toISOString().slice(0,10));
  refreshMonthTotal(v.currentStart);
}

async function refreshEvents(startStr, endStr) {
  const res = await api({ action: "events", agent: currentAgent, start: startStr, end: endStr });
  calendar.removeAllEvents();
  (res.events || []).forEach(e => calendar.addEvent(e));
}

async function refreshMonthTotal(dateObj) {
  const y = dateObj.getFullYear();
  const m = dateObj.getMonth() + 1;
  const res = await api({ action: "monthTotal", agent: currentAgent, year: String(y), month: String(m) });
  monthTotalEl.textContent = `Total mois : ${Number(res.total).toFixed(2)}€`;
}

async function refreshAfterAdd() {
  const v = calendar.view;
  await refreshEvents(v.activeStart.toISOString().slice(0,10), v.activeEnd.toISOString().slice(0,10));
  await refreshMonthTotal(v.currentStart);
}

// ===== ADMIN ADD PRIME =====
async function addPrimeAdmin() {
  const dateISO = primeDateEl.value;
  const code = primeCodeEl.value;
  const comment = primeCommentEl.value || "";

  if (!dateISO || !code) { alert("Choisis une date et une prime."); return; }

  try {
    await api({ action: "addPrime", agent: currentAgent, date: dateISO, code, comment });
    primeCommentEl.value = "";
    await refreshAfterAdd();
  } catch (e) {
    alert("Erreur: " + (e?.message || e));
  }
}
