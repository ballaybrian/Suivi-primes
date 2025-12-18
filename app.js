// ===== CONFIG =====
const API_URL = "https://script.google.com/macros/s/AKfycbx94ffDuY0bSr1TYRHrI71c70L-_6icRs9fgXTZOB_hOeFV0lAnSPmsPUAVDnFrliw/exec";
const ADMIN_CODE = "1234"; // 🔴 doit matcher Code.gs

// ===== STATE =====
let BOOT = null;
let currentAgent = null;
let calendar = null;
let isAdmin = false; // bascule via bouton caché

// ===== DOM =====
const homeEl = document.getElementById("home");
const agentViewEl = document.getElementById("agentView");

const agentButtonsEl = document.getElementById("agentButtons");
const agentNameEl = document.getElementById("agentName");
const monthTotalEl = document.getElementById("monthTotal");

const adminFormEl = document.getElementById("adminForm");
const primeDateEl = document.getElementById("primeDate");
const primeCodeEl = document.getElementById("primeCode");
const primeCommentEl = document.getElementById("primeComment");

const adminAccessCardEl = document.getElementById("adminAccessCard");
const accessChecksEl = document.getElementById("accessChecks");
const saveAccessBtn = document.getElementById("saveAccessBtn");
const saveAccessStatus = document.getElementById("saveAccessStatus");

const modeBadgeEl = document.getElementById("modeBadge");
const backBtn = document.getElementById("backBtn");
const adminHiddenBtn = document.getElementById("adminHiddenBtn");

backBtn.addEventListener("click", goHome);

// ===== JSONP (anti-CORS) =====
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

// ===== INIT =====
boot().catch(showBootError);

async function boot() {
  setMode(false); // agent par défaut
  BOOT = await api({ action: "bootstrap" });
  renderHome();
  setupAdminButton();
}

function showBootError(err) {
  console.error(err);
  agentButtonsEl.innerHTML = `
    <div class="notice">
      <b>Erreur chargement</b><br/>
      ${String(err?.message || err)}
    </div>
  `;
}

function setMode(admin) {
  isAdmin = admin;
  modeBadgeEl.textContent = `Mode : ${isAdmin ? "Admin" : "Agent"}`;

  // UI admin visible uniquement si admin
  adminFormEl.classList.toggle("hidden", !isAdmin);
  adminAccessCardEl.classList.toggle("hidden", !isAdmin);
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

  saveAccessStatus.textContent = "";
  accessChecksEl.innerHTML = "";
}

// ===== AGENT VIEW =====
async function openAgent(agent) {
  currentAgent = agent;
  agentNameEl.textContent = agent;

  homeEl.classList.add("hidden");
  agentViewEl.classList.remove("hidden");

  initCalendar();

  // admin features
  if (isAdmin) {
    primeDateEl.valueAsDate = new Date();
    fillPrimeSelect();
    wireAdminButtons();
    await loadAccessUI();
  }

  // refresh initial
  const v = calendar.view;
  await refreshEvents(v.activeStart.toISOString().slice(0,10), v.activeEnd.toISOString().slice(0,10));
  await refreshMonthTotal(v.currentStart);
}

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

// ===== ADMIN MODE (hidden button) =====
function setupAdminButton() {
  adminHiddenBtn.addEventListener("click", () => {
    const code = prompt("Code admin ?");
    if (code === null) return;

    if (code === ADMIN_CODE) {
      setMode(true);
      alert("Mode admin activé");
      // si on est déjà dans la vue agent, on recharge l'UI admin
      if (currentAgent) openAgent(currentAgent);
    } else {
      alert("Code incorrect");
    }
  });
}

function wireAdminButtons() {
  // éviter multi-bind
  const addBtn = document.getElementById("addBtn");
  addBtn.onclick = addPrimeAdmin;
  saveAccessBtn.onclick = saveAccess;
}

async function loadAccessUI() {
  saveAccessStatus.textContent = "";
  const res = await api({ action: "allowed", agent: currentAgent });
  const allowed = new Set(res.codes || []);

  accessChecksEl.innerHTML = "";
  const entries = Object.entries(BOOT.primeTypes || {}).sort((a,b) => a[0].localeCompare(b[0]));

  for (const [code, p] of entries) {
    const icon = BOOT.icons?.[code] || "🔖";
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
    await api({
      action: "setAccess",
      codeAdmin: ADMIN_CODE,
      agent: currentAgent,
      codes: codes.join(",")
    });
    saveAccessStatus.textContent = "✅ Sauvegardé";
  } catch (e) {
    saveAccessStatus.textContent = "❌ " + (e?.message || e);
  } finally {
    saveAccessBtn.disabled = false;
    setTimeout(() => (saveAccessStatus.textContent = ""), 2500);
  }
}

async function addPrimeAdmin() {
  const dateISO = primeDateEl.value;
  const code = primeCodeEl.value;
  const comment = primeCommentEl.value || "";

  if (!dateISO || !code) { alert("Choisis une date et une prime."); return; }

  try {
    await api({
      action: "addPrime",
      codeAdmin: ADMIN_CODE,
      agent: currentAgent,
      date: dateISO,
      code,
      comment
    });

    primeCommentEl.value = "";

    const v = calendar.view;
    await refreshEvents(v.activeStart.toISOString().slice(0,10), v.activeEnd.toISOString().slice(0,10));
    await refreshMonthTotal(v.currentStart);
  } catch (e) {
    alert("Erreur: " + (e?.message || e));
  }
}
