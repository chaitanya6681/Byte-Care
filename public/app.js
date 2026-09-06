const API = '/api';
let FACILITIES = [];
let currentRole = 'patient';
let STAFF_SESSION = null; // { token, facilityId, username, displayName }
let PATIENT_SESSION = null; // { token, patientId, healthId, username, displayName }

// ---------- helpers ----------
async function api(path, options) {
  const opts = options ? { ...options } : {};
  const activeSession = currentRole === 'staff' ? STAFF_SESSION : PATIENT_SESSION;
  if (activeSession && activeSession.token) {
    opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${activeSession.token}` };
  }
  const res = await fetch(API + path, opts);
  if (res.status === 401) {
    const hadStaffSession = Boolean(STAFF_SESSION);
    const hadPatientSession = Boolean(PATIENT_SESSION);
    clearStaffSession();
    clearPatientSession();
    renderStaffWhoami();
    renderPatientWhoami();
    if (currentRole === 'staff' && hadStaffSession) {
      showStaffLogin();
      toast('Your staff session expired. Please log in again.', 'alert');
    } else if (currentRole === 'patient' && hadPatientSession) {
      showPatientAuth();
      toast('Your patient session expired. Please log in again.', 'alert');
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Login required');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.json();
}

function saveStaffSession(session) {
  STAFF_SESSION = session;
  localStorage.setItem('ha_staff_session', JSON.stringify(session));
}

function clearStaffSession() {
  STAFF_SESSION = null;
  localStorage.removeItem('ha_staff_session');
}

function loadStoredStaffSession() {
  try {
    const raw = localStorage.getItem('ha_staff_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function savePatientSession(session) {
  PATIENT_SESSION = session;
  localStorage.setItem('ha_patient_session', JSON.stringify(session));
}

function clearPatientSession() {
  PATIENT_SESSION = null;
  localStorage.removeItem('ha_patient_session');
}

function loadStoredPatientSession() {
  try {
    const raw = localStorage.getItem('ha_patient_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function toast(msg, iconName) {
  const el = document.getElementById('toast');
  el.innerHTML = (iconName ? iconSvg(iconName, 18) : '') + `<span>${msg}</span>`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function facilityName(id) {
  const f = FACILITIES.find(f => f.id === id);
  return f ? f.name : id;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString() : 'Date unavailable';
}

function fillFacilitySelect(select, { includeAll = false } = {}) {
  select.innerHTML = '';
  if (includeAll) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'All facilities';
    select.appendChild(opt);
  }
  FACILITIES.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.name} (${f.type})`;
    select.appendChild(opt);
  });
}

function urgencyPillClass(u) {
  return u === 'high' ? 'pill-danger' : u === 'medium' ? 'pill-warn' : 'pill-ok';
}

// render every static <span class="icon" data-icon="..."> placeholder in the DOM
function renderIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const size = Number(el.getAttribute('data-icon-size')) || 22;
    el.innerHTML = iconSvg(name, size);
  });
}

// ---------- init ----------
async function init() {
  renderIcons();
  FACILITIES = await api('/facilities');

  [
    'bookFacility', 'queueFacility', 'medFacility', 'fbFacility',
    'dashFacility', 'mqFacility', 'msFacility', 'newRefFrom', 'newRefTo', 'fbListFacility'
  ].forEach(id => fillFacilitySelect(document.getElementById(id)));

  document.getElementById('roleBtnPatient').addEventListener('click', () => setRole('patient'));
  document.getElementById('roleBtnStaff').addEventListener('click', () => setRole('staff'));

  document.querySelectorAll('.tabbar').forEach(bar => {
    bar.addEventListener('click', e => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      activateTab(bar, btn.dataset.tab);
    });
  });

  // home screen quick-access cards
  document.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.dataset.goto;
      activateTab(document.getElementById('patientTabs'), target);
    });
  });

  const langSelect = document.getElementById('langSelect');
  const savedLang = localStorage.getItem('ha_lang') || 'en';
  langSelect.value = savedLang;
  applyLanguage(savedLang);
  langSelect.addEventListener('change', () => applyLanguage(langSelect.value));

  document.getElementById('bookSubmit').addEventListener('click', bookToken);
  document.getElementById('recordLookupSubmit').addEventListener('click', loadPatientRecord);
  document.getElementById('recordHealthId').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadPatientRecord();
  });
  document.getElementById('queueFacility').addEventListener('change', loadQueue);
  document.getElementById('triageSubmit').addEventListener('click', runTriage);
  document.getElementById('medFacility').addEventListener('change', loadMedicine);
  document.getElementById('fbSubmit').addEventListener('click', submitFeedback);
  setupMic();

  document.getElementById('dashFacility').addEventListener('change', loadDashboard);
  document.getElementById('mqFacility').addEventListener('change', loadManageQueue);
  document.getElementById('msFacility').addEventListener('change', loadManageStock);
  document.getElementById('newRefSubmit').addEventListener('click', createReferral);
  document.getElementById('fbListFacility').addEventListener('change', loadFeedbackList);
  document.getElementById('staffLoginSubmit').addEventListener('click', submitStaffLogin);
  document.getElementById('staffPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitStaffLogin();
  });
  document.getElementById('patientRegisterSubmit').addEventListener('click', submitPatientRegister);
  document.getElementById('patientLoginSubmit').addEventListener('click', submitPatientLogin);
  document.getElementById('patientAuthRegisterTab').addEventListener('click', () => setPatientAuthMode('register'));
  document.getElementById('patientAuthLoginTab').addEventListener('click', () => setPatientAuthMode('login'));
  document.getElementById('patientRegisterPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPatientRegister();
  });
  document.getElementById('patientLoginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPatientLogin();
  });

  // restore a previous staff session (if the token is still valid server-side)
  const stored = loadStoredStaffSession();
  if (stored) {
    STAFF_SESSION = stored;
    api('/staff/session').then(() => renderStaffWhoami()).catch(() => {
      clearStaffSession();
    });
  }

  const storedPatient = loadStoredPatientSession();
  if (storedPatient) {
    PATIENT_SESSION = storedPatient;
    api('/patient/session').then(session => {
      savePatientSession({ ...storedPatient, ...session });
      renderPatientWhoami();
      applyPatientHealthId();
      if (currentRole === 'patient') setRole('patient');
    }).catch(() => {
      clearPatientSession();
      showPatientAuth();
    });
  } else {
    showPatientAuth();
  }

  loadQueue();
  loadMedicine();
  loadReferralsPatientView();
  loadDashboard();
  loadManageQueue();
  loadManageStock();
  loadStaffReferrals();
  loadFeedbackList();
}

function activateTab(bar, tabId) {
  bar.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  showView(tabId);
}

function setRole(role) {
  currentRole = role;
  document.getElementById('roleBtnPatient').classList.toggle('active', role === 'patient');
  document.getElementById('roleBtnStaff').classList.toggle('active', role === 'staff');
  document.getElementById('patientTabs').style.display = role === 'patient' && PATIENT_SESSION ? 'flex' : 'none';

  if (role === 'patient') {
    document.getElementById('staffTabs').style.display = 'none';
    if (!PATIENT_SESSION) {
      showPatientAuth();
      return;
    }
    activateTab(document.getElementById('patientTabs'), 'home');
    return;
  }

  // role === 'staff'
  if (STAFF_SESSION) {
    document.getElementById('staffTabs').style.display = 'flex';
    const firstTab = document.getElementById('staffTabs').querySelector('button').dataset.tab;
    activateTab(document.getElementById('staffTabs'), firstTab);
    applyStaffFacilityDefault();
  } else {
    showStaffLogin();
  }
}

function setPatientAuthMode(mode) {
  const isRegister = mode === 'register';
  document.getElementById('patientRegisterPanel').style.display = isRegister ? 'block' : 'none';
  document.getElementById('patientLoginPanel').style.display = isRegister ? 'none' : 'block';
  document.getElementById('patientAuthRegisterTab').classList.toggle('active', isRegister);
  document.getElementById('patientAuthLoginTab').classList.toggle('active', !isRegister);
  document.getElementById('patientRegisterError').style.display = 'none';
  document.getElementById('patientLoginError').style.display = 'none';
}

function showPatientAuth() {
  document.getElementById('patientTabs').style.display = 'none';
  document.getElementById('staffTabs').style.display = 'none';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-patientAuth').classList.add('active');
  setPatientAuthMode('register');
}

function showStaffLogin() {
  document.getElementById('staffTabs').style.display = 'none';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-staffLogin').classList.add('active');
  document.getElementById('staffLoginError').style.display = 'none';
  document.getElementById('staffPassword').value = '';
}

async function submitStaffLogin() {
  const username = document.getElementById('staffUsername').value.trim();
  const password = document.getElementById('staffPassword').value;
  const errorEl = document.getElementById('staffLoginError');
  errorEl.style.display = 'none';
  if (!username || !password) {
    errorEl.textContent = 'Please enter both username and password.';
    errorEl.style.display = 'block';
    return;
  }
  try {
    const res = await fetch(API + '/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveStaffSession({ token: data.token, facilityId: data.facilityId, username: data.username, displayName: data.displayName });
    renderStaffWhoami();
    toast(`Welcome, ${data.displayName}`, 'check');
    document.getElementById('staffTabs').style.display = 'flex';
    activateTab(document.getElementById('staffTabs'), 'dashboard');
    applyStaffFacilityDefault();
    loadDashboard(); loadManageQueue(); loadManageStock(); loadStaffReferrals(); loadFeedbackList();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
}

function applyPatientHealthId() {
  if (!PATIENT_SESSION) return;
  const healthId = PATIENT_SESSION.healthId;
  const recordInput = document.getElementById('recordHealthId');
  const bookingInput = document.getElementById('bookHealthId');
  if (recordInput) recordInput.value = healthId;
  if (bookingInput) bookingInput.value = healthId;
  const bookingName = document.getElementById('bookName');
  if (bookingName && !bookingName.value) bookingName.value = PATIENT_SESSION.displayName;
}

function completePatientAuth(data, welcomeMessage) {
  savePatientSession({
    token: data.token,
    patientId: data.patientId,
    healthId: data.healthId,
    username: data.username,
    displayName: data.displayName
  });
  renderPatientWhoami();
  applyPatientHealthId();
  setRole('patient');
  toast(`${welcomeMessage} Health ID: ${data.healthId}`, 'check');
}

async function submitPatientRegister() {
  const name = document.getElementById('patientRegisterName').value.trim();
  const username = document.getElementById('patientRegisterUsername').value.trim();
  const password = document.getElementById('patientRegisterPassword').value;
  const healthId = document.getElementById('patientRegisterHealthId').value.trim();
  const errorEl = document.getElementById('patientRegisterError');
  errorEl.style.display = 'none';
  try {
    const res = await fetch(API + '/patient/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password, healthId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    completePatientAuth(data, 'Account created.');
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
}

async function submitPatientLogin() {
  const username = document.getElementById('patientLoginUsername').value.trim();
  const password = document.getElementById('patientLoginPassword').value;
  const errorEl = document.getElementById('patientLoginError');
  errorEl.style.display = 'none';
  try {
    const res = await fetch(API + '/patient/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    completePatientAuth(data, 'Welcome back.');
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
}

function renderPatientWhoami() {
  const el = document.getElementById('patientWhoami');
  if (!PATIENT_SESSION) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = `<span>Health ID: ${escapeHtml(PATIENT_SESSION.healthId)}</span>`;
  const btn = document.createElement('button');
  btn.className = 'logout-btn';
  btn.textContent = 'Log out';
  btn.addEventListener('click', patientLogout);
  el.appendChild(btn);
}

async function patientLogout() {
  try {
    await fetch(API + '/patient/logout', {
      method: 'POST',
      headers: PATIENT_SESSION?.token ? { Authorization: `Bearer ${PATIENT_SESSION.token}` } : {}
    });
  } catch (e) { /* ignore */ }
  clearPatientSession();
  renderPatientWhoami();
  showPatientAuth();
  toast('Logged out', 'check');
}

function renderStaffWhoami() {
  const el = document.getElementById('staffWhoami');
  if (!STAFF_SESSION) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = `<span>${STAFF_SESSION.displayName}</span>`;
  const btn = document.createElement('button');
  btn.className = 'logout-btn';
  btn.textContent = 'Log out';
  btn.addEventListener('click', staffLogout);
  el.appendChild(btn);
}

async function staffLogout() {
  try { await api('/staff/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  clearStaffSession();
  renderStaffWhoami();
  setRole('patient');
  toast('Logged out', 'check');
}

// If the logged-in staff account belongs to one specific facility, default
// the facility pickers to it (admin accounts have facilityId === null and
// can see/manage every facility).
function applyStaffFacilityDefault() {
  if (!STAFF_SESSION || !STAFF_SESSION.facilityId) return;
  ['dashFacility', 'mqFacility', 'msFacility', 'fbListFacility'].forEach(id => {
    const select = document.getElementById(id);
    if (select) select.value = STAFF_SESSION.facilityId;
  });
  loadDashboard(); loadManageQueue(); loadManageStock(); loadFeedbackList();
}

function showView(tabId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById('view-' + tabId);
  if (view) view.classList.add('active');
}

// ---------- Booking ----------
async function bookToken() {
  const facilityId = document.getElementById('bookFacility').value;
  const department = document.getElementById('bookDept').value;
  const patientName = document.getElementById('bookName').value.trim();
  const healthId = document.getElementById('bookHealthId').value.trim();
  const patientReport = document.getElementById('bookPatientReport').value.trim();
  if (!patientName && !healthId) return toast('Enter your name or Health ID', 'alert');

  try {
    const appt = await api('/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facilityId, department, patientName, healthId, patientReport })
    });
    document.getElementById('bookResultCard').style.display = 'block';
    document.getElementById('bookTokenNum').textContent = '#' + appt.token;
    document.getElementById('bookTokenWait').textContent = `${facilityName(facilityId)} · ${department}`;
    document.getElementById('bookHealthIdResult').textContent = `Health ID: ${appt.healthId}`;
    document.getElementById('recordHealthId').value = appt.healthId;
    document.getElementById('bookHealthId').value = appt.healthId;
    document.getElementById('bookPatientReport').value = '';
    toast(`Token booked — save your ${appt.healthId}`, 'check');
    loadQueue();
    loadDashboard();
  } catch (e) {
    toast(e.message, 'alert');
  }
}

// ---------- Patient health record ----------
async function loadPatientRecord() {
  const healthId = document.getElementById('recordHealthId').value.trim().toUpperCase();
  const summary = document.getElementById('recordPatientSummary');
  const timeline = document.getElementById('recordTimeline');
  if (!healthId) return toast('Enter your Health ID', 'alert');
  try {
    const record = await api(`/patient-record?healthId=${encodeURIComponent(healthId)}`);
    summary.innerHTML = `<div class="row" style="background:var(--teal-100); border-color:var(--teal-500);">
      <div class="row-icon-main">
        <div class="icon-circle teal">${iconSvg('users', 20)}</div>
        <div class="row-main">
          <div class="row-title">${escapeHtml(record.patient.name)}</div>
          <div class="row-sub">Health ID: ${escapeHtml(record.patient.healthId)}</div>
        </div>
      </div>
    </div>`;
    timeline.innerHTML = '';
    if (!record.timeline.length) {
      timeline.innerHTML = '<p class="empty-note">No visits or referrals yet.</p>';
      return;
    }
    record.timeline.forEach(event => {
      const row = document.createElement('div');
      row.className = 'row';
      if (event.type === 'visit') {
        row.innerHTML = `<div class="row-icon-main">
          <div class="icon-circle teal">${iconSvg('stethoscope', 20)}</div>
          <div class="row-main">
            <div class="row-title">Visit · ${escapeHtml(event.facilityName)}</div>
            <div class="row-sub">${escapeHtml(formatDate(event.date))} · ${escapeHtml(event.department)} · ${escapeHtml(event.status)}</div>
            ${event.patientReport ? `<div class="row-sub"><b>Patient report:</b> ${escapeHtml(event.patientReport)}</div>` : ''}
            ${event.diagnosis ? `<div class="row-sub"><b>Diagnosis:</b> ${escapeHtml(event.diagnosis)}</div>` : ''}
            ${event.visitNote ? `<div class="row-sub"><b>Visit note:</b> ${escapeHtml(event.visitNote)}</div>` : ''}
            ${event.outcome ? `<div class="row-sub"><b>Outcome:</b> ${escapeHtml(event.outcome)}</div>` : ''}
          </div>
        </div>`;
      } else {
        row.innerHTML = `<div class="row-icon-main">
          <div class="icon-circle marigold">${iconSvg('swap', 20)}</div>
          <div class="row-main">
            <div class="row-title">Referral · ${escapeHtml(event.status)}</div>
            <div class="row-sub">${escapeHtml(formatDate(event.date))} · ${escapeHtml(event.fromFacilityName)} → ${escapeHtml(event.toFacilityName)}</div>
            ${event.reason ? `<div class="row-sub">${escapeHtml(event.reason)}</div>` : ''}
          </div>
        </div>`;
      }
      timeline.appendChild(row);
    });
  } catch (e) {
    summary.innerHTML = '';
    timeline.innerHTML = `<p class="empty-note">${escapeHtml(e.message)}</p>`;
  }
}

function loadPatientRecordForHealthId(healthId) {
  if (!healthId) return;
  const input = document.getElementById('recordHealthId');
  if (input) input.value = healthId;
  if (document.getElementById('recordTimeline')) loadPatientRecord();
}

// ---------- Patient queue view ----------
async function loadQueue() {
  const facilityId = document.getElementById('queueFacility').value;
  if (!facilityId) return;
  const queue = await api(`/queue/${facilityId}`);
  const list = document.getElementById('queueList');
  list.innerHTML = '';
  if (!queue.length) {
    list.innerHTML = '<p class="empty-note">No one waiting right now.</p>';
    return;
  }
  queue.forEach(a => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-icon-main">
        <div class="icon-circle teal">${iconSvg('ticket', 20)}</div>
        <div class="row-main">
          <div class="row-title">Token #${a.token} — ${a.patientName}</div>
          <div class="row-sub">${a.department} · Position ${a.position}</div>
        </div>
      </div>
      <span class="pill pill-ok">${iconSvg('clock', 13)} ~${a.estimatedWaitMins} min</span>
    `;
    list.appendChild(row);
  });
}

// ---------- Triage ----------
async function runTriage() {
  const symptoms = document.getElementById('triageInput').value.trim();
  if (!symptoms) return toast('Please describe the symptoms', 'alert');
  try {
    const result = await api('/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms })
    });
    const box = document.getElementById('triageResult');
    box.innerHTML = `
      <div class="row" style="background:var(--teal-100); border-color:var(--teal-500);">
        <div class="row-icon-main">
          <div class="icon-circle teal">${iconSvg('stethoscope', 20)}</div>
          <div class="row-main">
            <div class="row-title">Suggested: ${result.department}</div>
            <div class="row-sub">Facility type: ${result.facilityType}</div>
          </div>
        </div>
        <span class="pill ${urgencyPillClass(result.urgency)}">${result.urgency.toUpperCase()} urgency</span>
      </div>
      <div class="list" style="margin-top:12px;">
        ${result.suggestedFacilities.map(f => `
          <div class="row">
            <div class="row-icon-main">
              <div class="icon-circle marigold">${iconSvg('home', 18)}</div>
              <div class="row-main">
                <div class="row-title">${f.name}</div>
                <div class="row-sub">${f.location}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    toast(e.message, 'alert');
  }
}

function setupMic() {
  const micBtn = document.getElementById('triageMic');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none';
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = (localStorage.getItem('ha_lang') === 'hi') ? 'hi-IN' : 'en-IN';
  recognition.interimResults = false;

  micBtn.addEventListener('click', () => {
    recognition.lang = (localStorage.getItem('ha_lang') === 'hi') ? 'hi-IN' : 'en-IN';
    micBtn.classList.add('listening');
    recognition.start();
  });
  recognition.addEventListener('result', e => {
    const text = e.results[0][0].transcript;
    document.getElementById('triageInput').value = text;
  });
  recognition.addEventListener('end', () => micBtn.classList.remove('listening'));
  recognition.addEventListener('error', () => micBtn.classList.remove('listening'));
}

// ---------- Medicine ----------
async function loadMedicine() {
  const facilityId = document.getElementById('medFacility').value;
  if (!facilityId) return;
  const meds = await api(`/medicine/${facilityId}`);
  const list = document.getElementById('medList');
  list.innerHTML = '';
  meds.forEach(m => {
    const pill = m.quantity === 0
      ? `<span class="pill pill-danger">${iconSvg('alert', 13)} Out of stock</span>`
      : m.lowStock
      ? `<span class="pill pill-warn">${iconSvg('alert', 13)} Low stock</span>`
      : `<span class="pill pill-ok">${iconSvg('check', 13)} Available</span>`;
    const circleClass = m.quantity === 0 ? 'red' : m.lowStock ? 'marigold' : 'teal';
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-icon-main">
        <div class="icon-circle ${circleClass}">${iconSvg('pill', 20)}</div>
        <div class="row-main">
          <div class="row-title">${m.name}</div>
          <div class="row-sub">${m.quantity} units</div>
        </div>
      </div>
      ${pill}
    `;
    list.appendChild(row);
  });
}

// ---------- Referral (patient read-only) ----------
async function loadReferralsPatientView() {
  const referrals = await api('/referrals');
  const list = document.getElementById('referralPatientList');
  list.innerHTML = '';
  if (!referrals.length) {
    list.innerHTML = '<p class="empty-note">No referrals yet.</p>';
    return;
  }
  referrals.forEach(r => list.appendChild(referralRow(r, false)));
}

function referralRow(r, withActions) {
  const row = document.createElement('div');
  row.className = 'row';
  const statusPill = r.status === 'reached' ? 'pill-ok' : r.status === 'in-transit' ? 'pill-warn' : 'pill-danger';
  row.innerHTML = `
    <div class="row-icon-main">
      <div class="icon-circle teal">${iconSvg('swap', 20)}</div>
      <div class="row-main">
        <div class="row-title">${r.patientName}</div>
        <div class="row-sub">${facilityName(r.fromFacilityId)} → ${facilityName(r.toFacilityId)}</div>
        <div class="row-sub">${r.reason || ''}</div>
      </div>
    </div>
    <span class="pill ${statusPill}">${r.status}</span>
  `;
  if (withActions) {
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    ['in-transit', 'reached', 'cancelled'].forEach(status => {
      const b = document.createElement('button');
      b.className = 'btn btn-ghost btn-small';
      b.textContent = status;
      b.addEventListener('click', async () => {
        await api(`/referrals/${r.id}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        loadStaffReferrals();
        loadReferralsPatientView();
      });
      actions.appendChild(b);
    });
    row.appendChild(actions);
  }
  return row;
}

// ---------- Feedback (patient submit) ----------
async function submitFeedback() {
  const facilityId = document.getElementById('fbFacility').value;
  const patientName = document.getElementById('fbName').value.trim();
  const message = document.getElementById('fbMessage').value.trim();
  const rating = document.getElementById('fbRating').value;
  if (!message) return toast('Please write your feedback', 'alert');
  try {
    await api('/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facilityId, patientName, message, rating })
    });
    document.getElementById('fbMessage').value = '';
    toast('Thank you for your feedback', 'check');
    loadFeedbackList();
    loadDashboard();
  } catch (e) {
    toast(e.message, 'alert');
  }
}

// ---------- Staff: dashboard ----------
async function loadDashboard() {
  const facilityId = document.getElementById('dashFacility').value;
  if (!facilityId) return;
  const stats = await api(`/dashboard/${facilityId}`);

  const banner = document.getElementById('dashAlertBanner');
  const alerts = [];
  if (stats.outOfStockCount > 0) alerts.push(`${stats.outOfStockCount} medicine(s) out of stock`);
  if (stats.lowStockCount > 0) alerts.push(`${stats.lowStockCount} medicine(s) running low`);
  if (stats.queueLength > 5) alerts.push(`${stats.queueLength} patients currently waiting`);
  banner.innerHTML = alerts.length
    ? `<div class="alert-banner">${iconSvg('alert', 18)}<span>${alerts.join(' · ')}</span></div>`
    : `<div class="alert-banner ok">${iconSvg('check', 18)}<span>Everything looks normal at this facility</span></div>`;

  const box = document.getElementById('dashStats');
  box.innerHTML = [
    statCard('ticket', stats.queueLength, 'Patients waiting'),
    statCard('clock', stats.avgWaitMins + ' min', 'Avg wait time'),
    statCard('pill', stats.outOfStockCount, 'Out of stock', 'red', stats.outOfStockCount > 0),
    statCard('box', stats.lowStockCount, 'Low on stock', 'marigold', stats.lowStockCount > 0),
    statCard('star', stats.avgRating ?? '—', 'Avg feedback rating'),
    statCard('swap', stats.referralsOutCount + ' out / ' + stats.referralsInCount + ' in', 'Referrals')
  ].join('');

  const meds = await api(`/medicine/${facilityId}`);
  const chart = document.getElementById('dashMedChart');
  chart.innerHTML = '';
  const maxQty = Math.max(1, ...meds.map(m => m.quantity));
  meds.forEach(m => {
    const pct = Math.round((m.quantity / maxQty) * 100);
    const fillClass = m.quantity === 0 ? 'danger' : m.quantity < 10 ? 'warn' : 'ok';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label">${m.name}</div>
      <div class="bar-track"><div class="bar-fill ${fillClass}" style="width:${pct}%"></div></div>
      <div class="bar-value">${m.quantity}</div>
    `;
    chart.appendChild(row);
  });
}

function statCard(icon, num, label, color, alert) {
  const circleColor = color || 'teal';
  return `<div class="stat ${alert ? 'alert' : ''}">
    <div class="icon-circle ${circleColor}">${iconSvg(icon, 22)}</div>
    <div>
      <div class="stat-num">${num}</div>
      <div class="stat-label">${label}</div>
    </div>
  </div>`;
}

// ---------- Staff: manage queue ----------
async function loadManageQueue() {
  const facilityId = document.getElementById('mqFacility').value;
  if (!facilityId) return;
  const queue = await api(`/queue/${facilityId}`);
  const list = document.getElementById('mqList');
  list.innerHTML = '';
  if (!queue.length) {
    list.innerHTML = '<p class="empty-note">Queue is empty.</p>';
    return;
  }
  queue.forEach(a => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-icon-main">
        <div class="icon-circle teal">${iconSvg('ticket', 20)}</div>
        <div class="row-main">
          <div class="row-title">Token #${a.token} — ${escapeHtml(a.patientName)}</div>
          <div class="row-sub">${escapeHtml(a.department)} · waiting ~${a.estimatedWaitMins} min · Health ID: ${escapeHtml(a.healthId || 'not linked')}</div>
          ${a.patientReport ? `<div class="row-sub"><b>Patient report:</b> ${escapeHtml(a.patientReport)}</div>` : '<div class="row-sub">No patient report provided.</div>'}
        </div>
      </div>
    `;
    const noteEditor = document.createElement('div');
    noteEditor.style.cssText = 'flex-basis:100%; margin-top:8px;';
    noteEditor.innerHTML = `
      <details>
        <summary>Visit note / diagnosis</summary>
        <label>Diagnosis</label>
        <input type="text" class="visit-diagnosis" value="${escapeHtml(a.diagnosis || '')}" placeholder="Short diagnosis or assessment" />
        <label>Visit note</label>
        <textarea class="visit-note" placeholder="What was observed or advised?">${escapeHtml(a.visitNote || '')}</textarea>
        <label>Outcome / follow-up</label>
        <input type="text" class="visit-outcome" value="${escapeHtml(a.outcome || '')}" placeholder="Medication, referral, or follow-up plan" />
        <button class="btn btn-ghost btn-small save-visit-note">Save visit record</button>
      </details>
    `;
    noteEditor.querySelector('.save-visit-note').addEventListener('click', async () => {
      try {
        await api(`/appointments/${a.id}/notes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            diagnosis: noteEditor.querySelector('.visit-diagnosis').value,
            visitNote: noteEditor.querySelector('.visit-note').value,
            outcome: noteEditor.querySelector('.visit-outcome').value
          })
        });
        toast('Visit record saved', 'check');
        loadManageQueue();
        loadPatientRecordForHealthId(a.healthId);
      } catch (e) {
        toast(e.message, 'alert');
      }
    });
    row.appendChild(noteEditor);
    const btn = document.createElement('button');
    btn.className = 'btn btn-marigold btn-small';
    btn.innerHTML = `${iconSvg('check', 15)} Mark done`;
    btn.addEventListener('click', async () => {
      await api(`/appointments/${a.id}/complete`, { method: 'POST' });
      loadManageQueue();
      loadQueue();
      loadDashboard();
      loadPatientRecordForHealthId(a.healthId);
    });
    row.appendChild(btn);
    list.appendChild(row);
  });
}

// ---------- Staff: manage stock ----------
async function loadManageStock() {
  const facilityId = document.getElementById('msFacility').value;
  if (!facilityId) return;
  const meds = await api(`/medicine/${facilityId}`);
  const list = document.getElementById('msList');
  list.innerHTML = '';
  meds.forEach(m => {
    const circleClass = m.quantity === 0 ? 'red' : m.lowStock ? 'marigold' : 'teal';
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-icon-main">
        <div class="icon-circle ${circleClass}">${iconSvg('pill', 20)}</div>
        <div class="row-main">
          <div class="row-title">${m.name}</div>
          <div class="row-sub">Current: ${m.quantity} units</div>
        </div>
      </div>
    `;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = m.quantity;
    input.style.width = '90px';
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-small';
    btn.textContent = 'Update';
    btn.addEventListener('click', async () => {
      await api(`/medicine/${m.id}/stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: input.value })
      });
      toast('Stock updated', 'check');
      loadManageStock();
      loadDashboard();
      loadMedicine();
    });
    row.appendChild(input);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

// ---------- Staff: referrals ----------
async function createReferral() {
  const healthId = document.getElementById('newRefHealthId').value.trim();
  const patientName = document.getElementById('newRefName').value.trim();
  const fromFacilityId = document.getElementById('newRefFrom').value;
  const toFacilityId = document.getElementById('newRefTo').value;
  const reason = document.getElementById('newRefReason').value.trim();
  if (!patientName && !healthId) return toast('Enter a Health ID or patient name', 'alert');
  try {
    await api('/referrals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ healthId, patientName, fromFacilityId, toFacilityId, reason })
    });
    document.getElementById('newRefHealthId').value = '';
    document.getElementById('newRefName').value = '';
    document.getElementById('newRefReason').value = '';
    toast('Referral created', 'check');
    loadStaffReferrals();
    loadReferralsPatientView();
    loadDashboard();
  } catch (e) {
    toast(e.message, 'alert');
  }
}

async function loadStaffReferrals() {
  const referrals = await api('/referrals');
  const list = document.getElementById('staffReferralList');
  list.innerHTML = '';
  if (!referrals.length) {
    list.innerHTML = '<p class="empty-note">No referrals yet.</p>';
    return;
  }
  referrals.slice().reverse().forEach(r => list.appendChild(referralRow(r, true)));
}

// ---------- Staff: feedback list ----------
async function loadFeedbackList() {
  const facilityId = document.getElementById('fbListFacility').value;
  if (!facilityId) return;
  const feedback = await api(`/feedback/${facilityId}`);
  const list = document.getElementById('fbListList');
  list.innerHTML = '';
  if (!feedback.length) {
    list.innerHTML = '<p class="empty-note">No complaints or feedback yet.</p>';
    return;
  }
  feedback.slice().reverse().forEach(f => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-icon-main">
        <div class="icon-circle marigold">${iconSvg('chat', 18)}</div>
        <div class="row-main">
          <div class="row-title">${f.patientName} — ${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>
          <div class="row-sub">${f.message}</div>
        </div>
      </div>
    `;
    list.appendChild(row);
  });
}

init();
