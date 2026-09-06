// Simple JSON-file "database". No native compilation needed -> runs on any
// machine that has Node installed. Good enough for a hackathon demo; swap
// for Postgres/Mongo later without changing the route logic much.
const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || path.join('/tmp', 'byte-care-data.json');


function seedData() {
  return {
    // Demo staff accounts. In a real deployment these would be hashed
    // passwords in a proper users table -- this is a JSON demo store, so
    // plaintext is fine here, but call this out clearly if you ever wire
    // this up to something real.
    staffAccounts: [
      { facilityId: 'phc1', username: 'ramnagar_staff', password: 'phc123', displayName: 'Ramnagar PHC Staff' },
      { facilityId: 'phc2', username: 'devipur_staff', password: 'phc123', displayName: 'Devipur PHC Staff' },
      { facilityId: 'hosp1', username: 'hosp_staff', password: 'hosp123', displayName: 'District Hospital Staff' },
      { facilityId: 'spec1', username: 'spec_staff', password: 'spec123', displayName: 'City Specialty Staff' },
      { facilityId: null, username: 'admin', password: 'admin123', displayName: 'System Admin (all facilities)' }
    ],
    facilities: [
      { id: 'phc1', name: 'Ramnagar PHC', type: 'PHC', location: 'Ramnagar Village' },
      { id: 'phc2', name: 'Devipur PHC', type: 'PHC', location: 'Devipur Village' },
      { id: 'hosp1', name: 'District General Hospital', type: 'Hospital', location: 'District HQ' },
      { id: 'spec1', name: 'City Specialty Centre', type: 'Specialist', location: 'City Centre' }
    ],
    patients: [
      { id: 'p1', healthId: 'HA-100001', name: 'Sunita Devi', createdAt: Date.now() - 1000 * 60 * 60 * 24 * 90 },
      { id: 'p2', healthId: 'HA-100002', name: 'Ram Kumar', createdAt: Date.now() - 1000 * 60 * 60 * 24 * 65 },
      { id: 'p3', healthId: 'HA-100003', name: 'Geeta', createdAt: Date.now() - 1000 * 60 * 60 * 24 * 40 },
      { id: 'p4', healthId: 'HA-100004', name: 'Vikram Singh', createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30 },
      { id: 'p5', healthId: 'HA-100005', name: 'Anita Kumari', createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20 }
    ],
    patientAccounts: [],
    appointments: [
      { id: 'a1', patientId: 'p1', facilityId: 'phc1', patientName: 'Sunita Devi', department: 'General Medicine', token: 1, status: 'waiting', avgMinsPerPatient: 8, patientReport: 'Fever and body ache since two days.', visitNote: '', diagnosis: '', outcome: '', createdAt: Date.now() - 1000 * 60 * 40 },
      { id: 'a2', patientId: 'p2', facilityId: 'phc1', patientName: 'Ram Kumar', department: 'General Medicine', token: 2, status: 'waiting', avgMinsPerPatient: 8, patientReport: 'Persistent cough and weakness.', visitNote: '', diagnosis: '', outcome: '', createdAt: Date.now() - 1000 * 60 * 30 },
      { id: 'a3', patientId: 'p3', facilityId: 'phc1', patientName: 'Geeta', department: 'General Medicine', token: 3, status: 'waiting', avgMinsPerPatient: 8, patientReport: 'Headache and mild fever.', visitNote: '', diagnosis: '', outcome: '', createdAt: Date.now() - 1000 * 60 * 10 },
      { id: 'a4', patientId: 'p4', facilityId: 'hosp1', patientName: 'Vikram Singh', department: 'Orthopedics', token: 1, status: 'waiting', avgMinsPerPatient: 15, patientReport: 'Pain after a fall; difficulty walking.', visitNote: '', diagnosis: '', outcome: '', createdAt: Date.now() - 1000 * 60 * 20 },
      { id: 'a5', patientId: 'p1', facilityId: 'phc1', patientName: 'Sunita Devi', department: 'General Medicine', token: 4, status: 'done', avgMinsPerPatient: 8, patientReport: 'Follow-up for fatigue after fever.', visitNote: 'Hydration advice and symptom review completed.', diagnosis: 'Viral fever, recovering', outcome: 'Follow-up in 7 days', createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7, completedAt: Date.now() - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 18 }
    ],
    medicines: [
      { id: 'm1', facilityId: 'phc1', name: 'Paracetamol', quantity: 120 },
      { id: 'm2', facilityId: 'phc1', name: 'ORS Packets', quantity: 8 },
      { id: 'm3', facilityId: 'phc1', name: 'Amoxicillin', quantity: 0 },
      { id: 'm4', facilityId: 'phc2', name: 'Paracetamol', quantity: 15 },
      { id: 'm5', facilityId: 'phc2', name: 'Iron Folic Acid', quantity: 60 },
      { id: 'm6', facilityId: 'hosp1', name: 'Insulin', quantity: 25 },
      { id: 'm7', facilityId: 'hosp1', name: 'IV Fluids', quantity: 4 }
    ],
    referrals: [
      { id: 'r1', patientId: 'p4', patientName: 'Vikram Singh', fromFacilityId: 'phc1', toFacilityId: 'hosp1', reason: 'Suspected fracture, needs X-ray', status: 'in-transit', createdAt: Date.now() - 1000 * 60 * 90 },
      { id: 'r2', patientId: 'p5', patientName: 'Anita Kumari', fromFacilityId: 'phc2', toFacilityId: 'spec1', reason: 'Referred for cardiology consult', status: 'reached', createdAt: Date.now() - 1000 * 60 * 60 * 5 }
    ],
    feedback: [
      { id: 'f1', facilityId: 'phc1', patientName: 'Sunita Devi', message: 'Waited almost an hour for a fever checkup.', rating: 2, createdAt: Date.now() - 1000 * 60 * 60 * 2 },
      { id: 'f2', facilityId: 'hosp1', patientName: 'Vikram Singh', message: 'Staff was helpful once I reached, but referral took long.', rating: 3, createdAt: Date.now() - 1000 * 60 * 60 }
    ]
  };
}

function migrationPatientId(index) {
  return `p${index + 1}`;
}

function migrate(data) {
  let changed = false;
  if (!Array.isArray(data.patients)) {
    data.patients = [];
    changed = true;
  }
  if (!Array.isArray(data.patientAccounts)) {
    data.patientAccounts = [];
    changed = true;
  }

  const byName = new Map(data.patients.map(p => [String(p.name || '').trim().toLowerCase(), p]));
  let nextPatientNumber = data.patients.length + 1;
  const getOrCreatePatient = name => {
    const cleanName = String(name || 'Unknown patient').trim() || 'Unknown patient';
    const key = cleanName.toLowerCase();
    let patient = byName.get(key);
    if (!patient) {
      patient = {
        id: migrationPatientId(nextPatientNumber - 1),
        healthId: `HA-${String(100000 + nextPatientNumber).slice(-6)}`,
        name: cleanName,
        createdAt: Date.now()
      };
      nextPatientNumber += 1;
      data.patients.push(patient);
      byName.set(key, patient);
      changed = true;
    }
    return patient;
  };

  (data.appointments || []).forEach(appointment => {
    if (!appointment.patientId) {
      appointment.patientId = getOrCreatePatient(appointment.patientName).id;
      changed = true;
    }
    if (appointment.patientReport === undefined) { appointment.patientReport = ''; changed = true; }
    if (appointment.visitNote === undefined) { appointment.visitNote = ''; changed = true; }
    if (appointment.diagnosis === undefined) { appointment.diagnosis = ''; changed = true; }
    if (appointment.outcome === undefined) { appointment.outcome = ''; changed = true; }
  });

  (data.referrals || []).forEach(referral => {
    if (!referral.patientId) {
      referral.patientId = getOrCreatePatient(referral.patientName).id;
      changed = true;
    }
  });

  if (!data.staffAccounts) {
    data.staffAccounts = seedData().staffAccounts;
    changed = true;
  }
  if (changed) save(data);
  return data;
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    save(seedData());
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  return migrate(data);
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function resetToSeed() {
  save(seedData());
  return load();
}

module.exports = { load, save, resetToSeed };
