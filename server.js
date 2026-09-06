// Zero-dependency server: only Node's built-in "http" and "fs" modules.
// This means there is NO "npm install" step at all -- just `node server.js`.
// That matters on hackathon day: judges' laptops, campus wifi, and locked-down
// machines can all still run this with nothing but Node itself installed.
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { load, save, resetToSeed } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- Staff auth ----------
// In-memory session store: token -> { facilityId, username, displayName }.
// Sessions reset when the server restarts -- fine for a demo; swap for a
// real session store / JWT + hashed passwords for production use.
const SESSIONS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = String(storedHash || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function getSession(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    return null;
  }
  return session;
}

function requirePatientAuth(req, res) {
  const session = getSession(req);
  if (!session || session.kind !== 'patient') {
    sendJSON(res, 401, { error: 'Patient login required.' });
    return null;
  }
  return session;
}

function requireStaffAuth(req, res) {
  const session = getSession(req);
  if (!session || session.kind !== 'staff') {
    sendJSON(res, 401, { error: 'Staff login required for this action.' });
    return null;
  }
  return session;
}

function isAdmin(session) {
  return Boolean(session && !session.facilityId);
}

function requireFacilityAuth(req, res, facilityId) {
  const session = requireStaffAuth(req, res);
  if (!session) return null;
  if (!isAdmin(session) && session.facilityId !== facilityId) {
    sendJSON(res, 403, { error: 'You can only manage records for your assigned facility.' });
    return null;
  }
  return session;
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeHealthId(value) {
  return String(value || '').trim().toUpperCase();
}

function nextHealthId(db) {
  const highest = (db.patients || []).reduce((max, patient) => {
    const match = String(patient.healthId || '').match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 100000);
  }, 100000);
  return `HA-${String(highest + 1).padStart(6, '0')}`;
}

function getOrCreatePatient(db, { healthId, patientName }) {
  const normalizedId = normalizeHealthId(healthId);
  if (normalizedId) {
    const existing = (db.patients || []).find(p => normalizeHealthId(p.healthId) === normalizedId);
    if (!existing) return { error: 'Health ID not found.' };
    return { patient: existing };
  }

  const name = cleanText(patientName, 120);
  if (!name) return { error: 'Patient name or Health ID is required.' };
  let patient = (db.patients || []).find(p => String(p.name || '').trim().toLowerCase() === name.toLowerCase());
  if (!patient) {
    patient = { id: uid('p'), healthId: nextHealthId(db), name, createdAt: Date.now() };
    db.patients.push(patient);
  }
  return { patient };
}

function patientForAppointment(db, appointment) {
  return (db.patients || []).find(p => p.id === appointment.patientId) || null;
}

function patientSessionPayload(account, patient) {
  const token = uid('ptok');
  SESSIONS.set(token, {
    token,
    kind: 'patient',
    patientId: patient.id,
    healthId: patient.healthId,
    username: account.username,
    displayName: patient.name,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return {
    token,
    patientId: patient.id,
    healthId: patient.healthId,
    username: account.username,
    displayName: patient.name
  };
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  // prevent path traversal outside /public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- Digital triage rule engine ----------
const TRIAGE_RULES = [
  { keywords: ['chest pain', 'breathless', 'breathing difficulty', 'heart'], department: 'Cardiology', urgency: 'high', facilityType: 'Hospital' },
  { keywords: ['accident', 'bleeding', 'unconscious', 'severe injury', 'fracture', 'broken bone'], department: 'Emergency / Orthopedics', urgency: 'high', facilityType: 'Hospital' },
  { keywords: ['pregnant', 'pregnancy', 'labour', 'labor'], department: 'Gynecology', urgency: 'medium', facilityType: 'Hospital' },
  { keywords: ['eye', 'vision', 'blurry'], department: 'Ophthalmology', urgency: 'low', facilityType: 'Specialist' },
  { keywords: ['skin', 'rash', 'itching'], department: 'Dermatology', urgency: 'low', facilityType: 'Specialist' },
  { keywords: ['tooth', 'dental', 'gum'], department: 'Dental', urgency: 'low', facilityType: 'Specialist' },
  { keywords: ['fever', 'cold', 'cough', 'headache', 'body ache', 'weakness'], department: 'General Medicine', urgency: 'low', facilityType: 'PHC' }
];

async function handleApi(req, res, pathname, query) {
  const db = load();
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]

  // GET /api/facilities
  if (req.method === 'GET' && pathname === '/api/facilities') {
    return sendJSON(res, 200, db.facilities);
  }

  // ---------- Staff auth ----------
  // POST /api/staff/login
  if (req.method === 'POST' && pathname === '/api/staff/login') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const account = db.staffAccounts.find(a => a.username.toLowerCase() === username && a.password === password);
    if (!account) return sendJSON(res, 401, { error: 'Incorrect username or password.' });

    const token = uid('tok');
    SESSIONS.set(token, {
      token,
      facilityId: account.facilityId,
      kind: 'staff',
      username: account.username,
      displayName: account.displayName,
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    return sendJSON(res, 200, {
      token,
      facilityId: account.facilityId,
      username: account.username,
      displayName: account.displayName
    });
  }

  // POST /api/staff/logout
  if (req.method === 'POST' && pathname === '/api/staff/logout') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) SESSIONS.delete(token);
    return sendJSON(res, 200, { message: 'Logged out' });
  }

  // GET /api/staff/session -- lets the frontend check if a stored token is still valid
  if (req.method === 'GET' && pathname === '/api/staff/session') {
    const session = getSession(req);
    if (!session || session.kind !== 'staff') return sendJSON(res, 401, { error: 'No active staff session' });
    return sendJSON(res, 200, { facilityId: session.facilityId, username: session.username, displayName: session.displayName });
  }

  // POST /api/patient/register
  if (req.method === 'POST' && pathname === '/api/patient/register') {
    const body = await readBody(req);
    const name = cleanText(body.name, 120);
    const username = cleanText(body.username, 80).toLowerCase();
    const password = String(body.password || '');
    const healthId = normalizeHealthId(body.healthId);
    if (name.length < 2) return sendJSON(res, 400, { error: 'Please enter your full name.' });
    if (!/^[a-z0-9._-]{3,80}$/.test(username)) return sendJSON(res, 400, { error: 'Username must be 3–80 letters, numbers, dots, underscores, or hyphens.' });
    if (password.length < 6) return sendJSON(res, 400, { error: 'Password must be at least 6 characters.' });
    if (db.patientAccounts.some(a => a.username.toLowerCase() === username)) {
      return sendJSON(res, 409, { error: 'That username is already registered.' });
    }
    const patientResult = getOrCreatePatient(db, { healthId, patientName: name });
    if (patientResult.error) return sendJSON(res, 400, { error: patientResult.error });
    const patient = patientResult.patient;
    if (db.patientAccounts.some(a => a.patientId === patient.id)) {
      return sendJSON(res, 409, { error: 'This patient already has an account. Please log in.' });
    }
    const account = { id: uid('pa'), patientId: patient.id, username, passwordHash: hashPassword(password), createdAt: Date.now() };
    db.patientAccounts.push(account);
    save(db);
    return sendJSON(res, 201, patientSessionPayload(account, patient));
  }

  // POST /api/patient/login
  if (req.method === 'POST' && pathname === '/api/patient/login') {
    const body = await readBody(req);
    const username = cleanText(body.username, 80).toLowerCase();
    const password = String(body.password || '');
    const account = db.patientAccounts.find(a => a.username.toLowerCase() === username);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return sendJSON(res, 401, { error: 'Incorrect patient username or password.' });
    }
    const patient = (db.patients || []).find(p => p.id === account.patientId);
    if (!patient) return sendJSON(res, 500, { error: 'Patient record is missing.' });
    return sendJSON(res, 200, patientSessionPayload(account, patient));
  }

  // POST /api/patient/logout
  if (req.method === 'POST' && pathname === '/api/patient/logout') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) SESSIONS.delete(token);
    return sendJSON(res, 200, { message: 'Logged out' });
  }

  // GET /api/patient/session
  if (req.method === 'GET' && pathname === '/api/patient/session') {
    const session = getSession(req);
    if (!session || session.kind !== 'patient') return sendJSON(res, 401, { error: 'No active patient session' });
    return sendJSON(res, 200, {
      patientId: session.patientId,
      healthId: session.healthId,
      username: session.username,
      displayName: session.displayName
    });
  }

  // GET /api/patient-record?healthId=HA-100001
  if (req.method === 'GET' && pathname === '/api/patient-record') {
    const session = getSession(req);
    if (!session) return sendJSON(res, 401, { error: 'Patient or staff login required.' });
    const healthId = normalizeHealthId(query.get('healthId'));
    const patient = (db.patients || []).find(p => normalizeHealthId(p.healthId) === healthId);
    if (!patient) return sendJSON(res, 404, { error: 'Health ID not found.' });
    if (session.kind === 'patient' && session.patientId !== patient.id) {
      return sendJSON(res, 403, { error: 'You can only view your own health record.' });
    }

    const appointments = db.appointments
      .filter(a => a.patientId === patient.id)
      .map(a => ({
        type: 'visit',
        id: a.id,
        date: a.completedAt || a.createdAt,
        facilityId: a.facilityId,
        facilityName: (db.facilities.find(f => f.id === a.facilityId) || {}).name || a.facilityId,
        department: a.department,
        status: a.status,
        token: a.token,
        patientReport: a.patientReport || '',
        visitNote: a.visitNote || '',
        diagnosis: a.diagnosis || '',
        outcome: a.outcome || ''
      }));
    const referrals = db.referrals
      .filter(r => r.patientId === patient.id)
      .map(r => ({
        type: 'referral',
        id: r.id,
        date: r.createdAt,
        fromFacilityId: r.fromFacilityId,
        fromFacilityName: (db.facilities.find(f => f.id === r.fromFacilityId) || {}).name || r.fromFacilityId,
        toFacilityId: r.toFacilityId,
        toFacilityName: (db.facilities.find(f => f.id === r.toFacilityId) || {}).name || r.toFacilityId,
        status: r.status,
        reason: r.reason || ''
      }));

    return sendJSON(res, 200, {
      patient: { id: patient.id, healthId: patient.healthId, name: patient.name },
      timeline: appointments.concat(referrals).sort((a, b) => b.date - a.date)
    });
  }

  // POST /api/triage
  if (req.method === 'POST' && pathname === '/api/triage') {
    const body = await readBody(req);
    const symptoms = String(body.symptoms || '').toLowerCase();
    if (!symptoms.trim()) return sendJSON(res, 400, { error: 'Please describe the symptoms.' });
    const match = TRIAGE_RULES.find(rule => rule.keywords.some(k => symptoms.includes(k)));
    const result = match || { department: 'General Medicine', urgency: 'low', facilityType: 'PHC' };
    const suggestedFacilities = db.facilities.filter(f => f.type === result.facilityType);
    return sendJSON(res, 200, {
      department: result.department,
      urgency: result.urgency,
      facilityType: result.facilityType,
      suggestedFacilities: suggestedFacilities.length ? suggestedFacilities : db.facilities
    });
  }

  // GET /api/queue/:facilityId
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'queue' && parts[2]) {
    const waiting = db.appointments
      .filter(a => a.facilityId === parts[2] && a.status === 'waiting')
      .sort((a, b) => a.token - b.token)
      .map((a, idx) => {
        const patient = patientForAppointment(db, a);
        return { ...a, healthId: patient ? patient.healthId : '', position: idx + 1, estimatedWaitMins: idx * a.avgMinsPerPatient };
      });
    return sendJSON(res, 200, waiting);
  }

  // POST /api/appointments
  if (req.method === 'POST' && pathname === '/api/appointments') {
    const body = await readBody(req);
    const { facilityId, patientName, department, healthId, patientReport } = body;
    if (!facilityId || !department || (!patientName && !healthId)) {
      return sendJSON(res, 400, { error: 'facilityId, department, and patient name or Health ID are required.' });
    }
    if (!db.facilities.some(f => f.id === facilityId)) {
      return sendJSON(res, 400, { error: 'Unknown facility.' });
    }
    const patientResult = getOrCreatePatient(db, { healthId, patientName });
    if (patientResult.error) return sendJSON(res, 400, { error: patientResult.error });
    const patient = patientResult.patient;
    const existing = db.appointments.filter(a => a.facilityId === facilityId);
    const nextToken = existing.length ? Math.max(...existing.map(a => a.token)) + 1 : 1;
    const appointment = {
      id: uid('a'), patientId: patient.id, healthId: patient.healthId, facilityId,
      patientName: patient.name, department, token: nextToken, status: 'waiting',
      avgMinsPerPatient: 8, patientReport: cleanText(patientReport, 1000),
      visitNote: '', diagnosis: '', outcome: '', createdAt: Date.now()
    };
    db.appointments.push(appointment);
    save(db);
    return sendJSON(res, 201, appointment);
  }

  // POST /api/appointments/:id/notes (staff only)
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'appointments' && parts[3] === 'notes') {
    const appt = db.appointments.find(a => a.id === parts[2]);
    if (!appt) return sendJSON(res, 404, { error: 'Not found' });
    if (!requireFacilityAuth(req, res, appt.facilityId)) return;
    const body = await readBody(req);
    appt.visitNote = cleanText(body.visitNote, 1000);
    appt.diagnosis = cleanText(body.diagnosis, 240);
    appt.outcome = cleanText(body.outcome, 500);
    appt.updatedAt = Date.now();
    save(db);
    return sendJSON(res, 200, { ...appt, healthId: (patientForAppointment(db, appt) || {}).healthId || '' });
  }

  // POST /api/appointments/:id/complete  (staff only)
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'appointments' && parts[3] === 'complete') {
    const appt = db.appointments.find(a => a.id === parts[2]);
    if (!appt) return sendJSON(res, 404, { error: 'Not found' });
    if (!requireFacilityAuth(req, res, appt.facilityId)) return;
    appt.status = 'done';
    appt.completedAt = Date.now();
    save(db);
    return sendJSON(res, 200, { ...appt, healthId: (patientForAppointment(db, appt) || {}).healthId || '' });
  }

  // GET /api/medicine/:facilityId
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'medicine' && parts[2]) {
    const meds = db.medicines.filter(m => m.facilityId === parts[2]);
    return sendJSON(res, 200, meds.map(m => ({ ...m, available: m.quantity > 0, lowStock: m.quantity > 0 && m.quantity < 10 })));
  }

  // POST /api/medicine/:id/stock  (staff only)
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'medicine' && parts[3] === 'stock') {
    const med = db.medicines.find(m => m.id === parts[2]);
    if (!med) return sendJSON(res, 404, { error: 'Not found' });
    if (!requireFacilityAuth(req, res, med.facilityId)) return;
    const body = await readBody(req);
    med.quantity = Math.max(0, Number(body.quantity) || 0);
    save(db);
    return sendJSON(res, 200, med);
  }

  // GET /api/referrals
  if (req.method === 'GET' && pathname === '/api/referrals') {
    return sendJSON(res, 200, db.referrals);
  }

  // POST /api/referrals  (staff only)
  if (req.method === 'POST' && pathname === '/api/referrals') {
    const body = await readBody(req);
    const { patientName, healthId, fromFacilityId, toFacilityId, reason } = body;
    if (!fromFacilityId || !toFacilityId || (!patientName && !healthId)) {
      return sendJSON(res, 400, { error: 'patient name or Health ID, from facility, and to facility are required.' });
    }
    if (!db.facilities.some(f => f.id === fromFacilityId) || !db.facilities.some(f => f.id === toFacilityId)) {
      return sendJSON(res, 400, { error: 'Unknown referral facility.' });
    }
    const session = requireFacilityAuth(req, res, fromFacilityId);
    if (!session) return;
    const patientResult = getOrCreatePatient(db, { healthId, patientName });
    if (patientResult.error) return sendJSON(res, 400, { error: patientResult.error });
    const patient = patientResult.patient;
    const referral = {
      id: uid('r'), patientId: patient.id, healthId: patient.healthId, patientName: patient.name,
      fromFacilityId, toFacilityId, reason: cleanText(reason, 500), status: 'in-transit', createdAt: Date.now()
    };
    db.referrals.push(referral);
    save(db);
    return sendJSON(res, 201, referral);
  }

  // POST /api/referrals/:id/status  (staff only)
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'referrals' && parts[3] === 'status') {
    const ref = db.referrals.find(r => r.id === parts[2]);
    if (!ref) return sendJSON(res, 404, { error: 'Not found' });
    const session = requireStaffAuth(req, res);
    if (!session) return;
    if (!isAdmin(session) && session.facilityId !== ref.fromFacilityId && session.facilityId !== ref.toFacilityId) {
      return sendJSON(res, 403, { error: 'You can only update referrals connected to your facility.' });
    }
    const body = await readBody(req);
    const allowedStatuses = ['in-transit', 'reached', 'cancelled'];
    if (!allowedStatuses.includes(body.status)) return sendJSON(res, 400, { error: 'Invalid referral status.' });
    ref.status = body.status;
    save(db);
    return sendJSON(res, 200, ref);
  }

  // GET /api/feedback/:facilityId
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'feedback' && parts[2]) {
    return sendJSON(res, 200, db.feedback.filter(f => f.facilityId === parts[2]));
  }

  // POST /api/feedback
  if (req.method === 'POST' && pathname === '/api/feedback') {
    const body = await readBody(req);
    const { facilityId, patientName, message, rating } = body;
    if (!facilityId || !message) return sendJSON(res, 400, { error: 'facilityId and message are required.' });
    const entry = { id: uid('f'), facilityId, patientName: patientName || 'Anonymous', message, rating: Number(rating) || 3, createdAt: Date.now() };
    db.feedback.push(entry);
    save(db);
    return sendJSON(res, 201, entry);
  }

  // GET /api/dashboard/:facilityId
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'dashboard' && parts[2]) {
    const facilityId = parts[2];
    const waiting = db.appointments.filter(a => a.facilityId === facilityId && a.status === 'waiting');
    const avgWait = waiting.length ? Math.round(waiting.reduce((sum, a, idx) => sum + idx * a.avgMinsPerPatient, 0) / waiting.length) : 0;
    const meds = db.medicines.filter(m => m.facilityId === facilityId);
    const lowStock = meds.filter(m => m.quantity > 0 && m.quantity < 10);
    const outOfStock = meds.filter(m => m.quantity === 0);
    const feedback = db.feedback.filter(f => f.facilityId === facilityId);
    const avgRating = feedback.length ? Number((feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1)) : null;
    const referralsOut = db.referrals.filter(r => r.fromFacilityId === facilityId);
    const referralsIn = db.referrals.filter(r => r.toFacilityId === facilityId);
    return sendJSON(res, 200, {
      facilityId, queueLength: waiting.length, avgWaitMins: avgWait,
      medicineCount: meds.length, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
      feedbackCount: feedback.length, avgRating,
      referralsOutCount: referralsOut.length, referralsInCount: referralsIn.length
    });
  }

  // POST /api/reset-demo-data  (staff only)
  if (req.method === 'POST' && pathname === '/api/reset-demo-data') {
    if (!requireStaffAuth(req, res)) return;
    const fresh = resetToSeed();
    return sendJSON(res, 200, { message: 'Demo data reset', db: fresh });
  }

  return sendJSON(res, 404, { error: 'Unknown API route' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // basic CORS (harmless for a same-origin demo, but handy if the frontend
  // is ever opened from a different port/device on the same network)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url.searchParams);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    sendJSON(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\nHealthAccess demo server running:\n  -> http://localhost:${PORT}\n  (open this in a browser; press Ctrl+C to stop)\n`);
});
