import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const database = new DatabaseSync(path.join(__dirname, 'civicpass.db'));

database.exec('PRAGMA journal_mode = WAL');
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, email TEXT UNIQUE, name TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin', 'officer', 'voter')), status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS admin_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'Administrator', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS registration_centres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, region TEXT NOT NULL, district TEXT NOT NULL, ward TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS officers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), centre_id INTEGER REFERENCES registration_centres(id), created_by_admin_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE IF NOT EXISTS voter_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, application_number TEXT NOT NULL UNIQUE, user_id INTEGER REFERENCES users(id), created_by_user_id INTEGER REFERENCES users(id), assigned_officer_id INTEGER REFERENCES officers(id), created_by_admin_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'Under Verification', submitted_at TEXT NOT NULL, reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS voters (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_registration_number TEXT UNIQUE, application_id INTEGER NOT NULL UNIQUE REFERENCES voter_applications(id), first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL, date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, nationality TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, region TEXT, district TEXT, ward TEXT, registration_centre_id INTEGER REFERENCES registration_centres(id), is_eligible INTEGER NOT NULL DEFAULT 0, official_id_card_number TEXT UNIQUE);
  CREATE TABLE IF NOT EXISTS identity_documents (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL REFERENCES voters(id), document_type TEXT NOT NULL, document_number TEXT NOT NULL, document_reference TEXT, UNIQUE(document_type, document_number));
  CREATE TABLE IF NOT EXISTS voter_id_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL UNIQUE REFERENCES voters(id), application_id INTEGER NOT NULL UNIQUE REFERENCES voter_applications(id), card_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'issued', issued_at TEXT NOT NULL, printed_at TEXT, photo_data TEXT, qr_code TEXT);
  CREATE TABLE IF NOT EXISTS verification_records (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL REFERENCES voter_applications(id), verification_type TEXT NOT NULL, result TEXT NOT NULL, officer_id INTEGER REFERENCES officers(id), verified_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS application_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL REFERENCES voter_applications(id) ON DELETE CASCADE, officer_id INTEGER NOT NULL REFERENCES officers(id), assigned_by_admin_id INTEGER REFERENCES users(id), assigned_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE IF NOT EXISTS application_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL REFERENCES voter_applications(id) ON DELETE CASCADE, officer_id INTEGER NOT NULL REFERENCES officers(id), decision TEXT NOT NULL, reason TEXT, reviewed_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, record_type TEXT, record_id TEXT, application_number TEXT, actor TEXT NOT NULL, actor_role TEXT, details TEXT, previous_value TEXT, new_value TEXT, reason TEXT, device_info TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS applications (
    application_number TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Under Verification',
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TEXT NOT NULL
  )
`);
try { database.exec("ALTER TABLE voter_applications ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT'"); } catch {}
try { database.exec("ALTER TABLE applications ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT'"); } catch {}
database.exec(`
  CREATE TABLE IF NOT EXISTS application_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_number TEXT NOT NULL,
    status TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'System',
    actor_role TEXT NOT NULL DEFAULT 'system',
    reason TEXT,
    created_at TEXT NOT NULL
  )
`);
database.exec(`
  CREATE TABLE IF NOT EXISTS elections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    election_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    description TEXT,
    created_at TEXT NOT NULL
  )
`);
database.exec(`
  CREATE TABLE IF NOT EXISTS voter_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id INTEGER NOT NULL UNIQUE REFERENCES voters(id),
    registration_number TEXT NOT NULL UNIQUE,
    permanent_status TEXT NOT NULL DEFAULT 'ELIGIBLE',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    approved_at TEXT,
    official_id_card_number TEXT
  )
`);
database.exec(`
  CREATE TABLE IF NOT EXISTS election_voter_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    election_id INTEGER NOT NULL REFERENCES elections(id),
    voter_id INTEGER NOT NULL REFERENCES voters(id),
    polling_station_code TEXT,
    registration_status TEXT NOT NULL DEFAULT 'ELIGIBLE',
    election_status TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN',
    checked_in_at TEXT,
    voted_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(election_id, voter_id)
  )
`);
database.exec(`
  UPDATE voter_applications
  SET lifecycle_status = CASE status
    WHEN 'Approved' THEN 'VOTER_RECORD_CREATED'
    WHEN 'Rejected' THEN 'REJECTED'
    WHEN 'Flagged' THEN 'FLAGGED'
    WHEN 'Corrections Required' THEN 'FLAGGED'
    WHEN 'Under Verification' THEN 'UNDER_REVIEW'
    WHEN 'Pending Review' THEN 'UNDER_REVIEW'
    ELSE COALESCE(NULLIF(lifecycle_status, ''), 'DRAFT')
  END
  WHERE lifecycle_status IS NULL OR lifecycle_status = 'DRAFT'
`);
database.exec(`
  UPDATE applications
  SET lifecycle_status = CASE status
    WHEN 'APPROVED' THEN 'VOTER_RECORD_CREATED'
    WHEN 'REJECTED' THEN 'REJECTED'
    WHEN 'FLAGGED' THEN 'FLAGGED'
    WHEN 'CORRECTIONS_REQUIRED' THEN 'FLAGGED'
    WHEN 'PENDING_REVIEW' THEN 'UNDER_REVIEW'
    WHEN 'UNDER_VERIFICATION' THEN 'UNDER_REVIEW'
    WHEN 'Under Verification' THEN 'UNDER_REVIEW'
    WHEN 'Pending Review' THEN 'UNDER_REVIEW'
    ELSE COALESCE(NULLIF(lifecycle_status, ''), 'DRAFT')
  END
  WHERE lifecycle_status IS NULL OR lifecycle_status = 'DRAFT'
`);
try { database.exec('CREATE TABLE IF NOT EXISTS pollings_stations (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, district TEXT NOT NULL, ward TEXT NOT NULL, electoral_area TEXT, active INTEGER NOT NULL DEFAULT 1)'); } catch {}
try { database.exec('CREATE TABLE IF NOT EXISTS election_day_voters (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL UNIQUE REFERENCES voters(id), election_status TEXT NOT NULL DEFAULT "NOT_CHECKED_IN", permanent_status TEXT NOT NULL DEFAULT "REGISTERED", voting_status TEXT NOT NULL DEFAULT "NOT_CHECKED_IN", checked_in_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'); } catch {}
try { database.exec('CREATE TABLE IF NOT EXISTS election_day_incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER REFERENCES voters(id), incident_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT "warning", title TEXT, description TEXT, requires_supervisor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "OPEN", officer_name TEXT, supervisor_name TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'); } catch {}
try { database.exec('ALTER TABLE election_day_voters ADD COLUMN election_status TEXT'); } catch {}
try { database.exec('ALTER TABLE election_day_voters ADD COLUMN permanent_status TEXT'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN polling_station_code TEXT'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN electoral_area TEXT'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN permanent_status TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN record_id TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN record_type TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN actor_role TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN details TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN previous_value TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN new_value TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN reason TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN device_info TEXT'); } catch {}
try { database.exec('ALTER TABLE users ADD COLUMN name TEXT'); } catch {}
try { database.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"); } catch {}
try { database.exec('ALTER TABLE voter_applications ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
try { database.exec('ALTER TABLE voter_applications ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)'); } catch {}
try { database.exec('ALTER TABLE voter_applications ADD COLUMN assigned_officer_id INTEGER REFERENCES officers(id)'); } catch {}
try { database.exec('ALTER TABLE voter_applications ADD COLUMN created_by_admin_id INTEGER REFERENCES users(id)'); } catch {}
try { database.exec('ALTER TABLE officers ADD COLUMN created_by_admin_id INTEGER REFERENCES users(id)'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN is_eligible INTEGER NOT NULL DEFAULT 0'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN official_id_card_number TEXT'); } catch {}
try { database.exec('CREATE TABLE IF NOT EXISTS voter_id_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL UNIQUE REFERENCES voters(id), application_id INTEGER NOT NULL UNIQUE REFERENCES voter_applications(id), card_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT \'issued\', issued_at TEXT NOT NULL, printed_at TEXT, photo_data TEXT, qr_code TEXT)'); } catch {}
const voterColumns = new Set(database.prepare('PRAGMA table_info(voters)').all().map(column => column.name));
const applicationColumns = new Set(database.prepare('PRAGMA table_info(voter_applications)').all().map(column => column.name));
for (const [column, definition] of [['voter_registration_number', 'TEXT'], ['is_active', 'INTEGER NOT NULL DEFAULT 0'], ['is_eligible', 'INTEGER NOT NULL DEFAULT 0'], ['official_id_card_number', 'TEXT'], ['polling_station_code', 'TEXT'], ['electoral_area', 'TEXT'], ['permanent_status', 'TEXT']]) {
  if (!voterColumns.has(column)) {
    try { database.exec(`ALTER TABLE voters ADD COLUMN ${column} ${definition}`); } catch {} 
    voterColumns.add(column);
  }
}
for (const [column, definition] of [['lifecycle_status', 'TEXT NOT NULL DEFAULT \'DRAFT\''], ['assigned_officer_id', 'INTEGER REFERENCES officers(id)'], ['created_by_user_id', 'INTEGER REFERENCES users(id)'], ['created_by_admin_id', 'INTEGER REFERENCES users(id)'], ['user_id', 'INTEGER REFERENCES users(id)']]) {
  if (!applicationColumns.has(column)) {
    try { database.exec(`ALTER TABLE voter_applications ADD COLUMN ${column} ${definition}`); } catch {}
    applicationColumns.add(column);
  }
}
database.exec(`UPDATE voter_applications SET created_by_user_id = user_id, user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE role IN ('officer', 'admin')) AND created_by_user_id IS NULL`);
database.exec("UPDATE voters SET is_active = 1, is_eligible = 1, voter_registration_number = COALESCE(voter_registration_number, 'VR-' || printf('%06d', id)) WHERE application_id IN (SELECT id FROM voter_applications WHERE status = 'Approved')");

const now = new Date().toISOString();
const seedUser = database.prepare('INSERT OR IGNORE INTO users (phone, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const hashPassword = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
seedUser.run('+233240000001', 'admin@civicpass.local', 'Amara Mensah', hashPassword('ChangeMe-Admin-2026'), 'admin', now);
seedUser.run('+233240000002', 'officer@civicpass.local', 'Registration Officer', hashPassword('ChangeMe-Officer-2026'), 'officer', now);
seedUser.run('+233240000003', 'user@civicpass.local', 'CivicPass User', hashPassword('ChangeMe-User-2026'), 'voter', now);
database.prepare('UPDATE users SET name = ? WHERE email = ? AND (name IS NULL OR name = \'\')').run('Amara Mensah', 'admin@civicpass.local');
database.prepare('UPDATE users SET name = ? WHERE email = ? AND (name IS NULL OR name = \'\')').run('Registration Officer', 'officer@civicpass.local');
database.prepare('UPDATE users SET name = ? WHERE email = ? AND (name IS NULL OR name = \'\')').run('CivicPass User', 'user@civicpass.local');
database.prepare('INSERT OR IGNORE INTO registration_centres (id, name, region, district, ward) VALUES (?, ?, ?, ?, ?)').run(1, 'Central Office 04', 'Central', 'Central District', 'Ward 04');
database.prepare('INSERT OR IGNORE INTO admin_profiles (user_id, title, created_at) SELECT id, \'Administrator\', ? FROM users WHERE role = \'admin\'').run(now);
database.prepare('INSERT OR IGNORE INTO officers (user_id, centre_id, created_by_admin_id, status) SELECT id, 1, (SELECT id FROM users WHERE role = \'admin\' ORDER BY id LIMIT 1), \'active\' FROM users WHERE role = \'officer\'').run();
database.prepare('INSERT OR IGNORE INTO elections (code, name, election_date, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('GEN-2026', 'General Election 2026', '2026-11-15', 'active', 'National general election', now);
database.prepare('INSERT OR IGNORE INTO pollings_stations (code, name, district, ward, electoral_area, active) VALUES (?, ?, ?, ?, ?, 1)').run('PS-009-04', 'Kenema Polling Station 04', 'Kenema', '009', '009');
database.prepare('INSERT OR IGNORE INTO pollings_stations (code, name, district, ward, electoral_area, active) VALUES (?, ?, ?, ?, ?, 1)').run('PS-010-02', 'Central Polling Station 02', 'Central District', 'Ward 02', '010');
database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_application_assignment_active ON application_assignments(application_id, officer_id, status)');
const syncVoterRecordRows = database.prepare(`
  INSERT OR IGNORE INTO voter_records (voter_id, registration_number, permanent_status, is_active, created_at, approved_at, official_id_card_number)
  SELECT v.id, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)), 'ELIGIBLE', 1, COALESCE(a.reviewed_at, a.submitted_at, ?), a.reviewed_at, COALESCE(v.official_id_card_number, NULL)
  FROM voters v
  JOIN voter_applications a ON a.id = v.application_id
  WHERE v.is_active = 1 AND a.status = 'Approved'
`);
syncVoterRecordRows.run(now);
const activeElection = database.prepare('SELECT id FROM elections WHERE status = ? ORDER BY election_date DESC LIMIT 1').get('active');
if (activeElection) {
  database.prepare(`
    INSERT OR IGNORE INTO election_voter_records (election_id, voter_id, polling_station_code, registration_status, election_status, checked_in_at, voted_at, created_at)
    SELECT ?, v.id, COALESCE(v.polling_station_code, CASE WHEN v.ward <> '' THEN 'PS-' || UPPER(SUBSTR(COALESCE(v.ward, '009'), 1, 3)) || '-' || SUBSTR(COALESCE(v.district, '009'), 1, 2) ELSE 'PS-009-04' END), 'ELIGIBLE', 'NOT_CHECKED_IN', NULL, NULL, ?
    FROM voters v
    WHERE v.is_active = 1 AND v.is_eligible = 1
  `).run(activeElection.id, now);
}
database.prepare(`INSERT OR IGNORE INTO application_assignments (application_id, officer_id, assigned_by_admin_id, assigned_at)
  SELECT a.id, o.id, (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1), a.submitted_at
  FROM voter_applications a CROSS JOIN officers o
  WHERE a.assigned_officer_id IS NULL AND o.status = 'active'
  AND a.status IN ('Under Verification', 'Pending Review', 'Flagged', 'Corrections Required')`).run();
database.exec(`UPDATE voter_applications SET assigned_officer_id = (SELECT officer_id FROM application_assignments WHERE application_id = voter_applications.id ORDER BY id DESC LIMIT 1) WHERE assigned_officer_id IS NULL`);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

const createApplication = database.prepare(`
  INSERT INTO applications (application_number, payload, status, created_at)
  VALUES (?, ?, ?, ?)
`);
const createVoterIdCard = database.prepare('INSERT INTO voter_id_cards (voter_id, application_id, card_number, issued_at, photo_data, qr_code) VALUES (?, ?, ?, ?, ?, ?)');
const findApplication = database.prepare('SELECT application_number AS applicationNumber, payload, status, lifecycle_status AS lifecycleStatus, created_at AS createdAt FROM applications WHERE application_number = ?');
const updateApplication = database.prepare('UPDATE applications SET payload = ?, status = ? WHERE application_number = ?');

const applicationLifecycle = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'FLAGGED', 'CORRECTION_SUBMITTED', 'APPROVED', 'REJECTED', 'REGISTERED', 'VOTER_RECORD_CREATED', 'ELIGIBLE', 'ID_CARD_ISSUED'];
const recordLifecycleTransition = database.prepare('INSERT INTO application_status_history (application_number, status, actor, actor_role, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)');

function setApplicationLifecycle(applicationNumber, lifecycleStatus, options = {}) {
  if (!applicationLifecycle.includes(lifecycleStatus)) throw new Error(`Invalid application lifecycle status: ${lifecycleStatus}`);
  const { actor = 'System', actorRole = 'system', reason = null } = options;
  const current = database.prepare('SELECT lifecycle_status AS lifecycleStatus FROM voter_applications WHERE application_number = ?').get(applicationNumber);
  if (current?.lifecycleStatus === lifecycleStatus) return;
  const createdAt = new Date().toISOString();
  database.prepare('UPDATE voter_applications SET lifecycle_status = ? WHERE application_number = ?').run(lifecycleStatus, applicationNumber);
  database.prepare('UPDATE applications SET lifecycle_status = ? WHERE application_number = ?').run(lifecycleStatus, applicationNumber);
  recordLifecycleTransition.run(applicationNumber, lifecycleStatus, actor, actorRole, reason, createdAt);
}

// Enhanced audit logging with full details
const createDetailedAuditLog = database.prepare(`
  INSERT INTO audit_logs (user_id, action, record_type, record_id, application_number, actor, actor_role, details, previous_value, new_value, reason, device_info, created_at) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listAuditLogs = database.prepare(`
  SELECT id, action, record_type, record_id, application_number, actor, actor_role, details, previous_value, new_value, reason, device_info, created_at 
  FROM audit_logs 
  ORDER BY id DESC 
  LIMIT 100
`);

// Helper function to log audit events with full context
function logAuditEvent(action, options = {}) {
  const {
    recordType = null,
    recordId = null,
    applicationNumber = null,
    actor = 'System',
    actorRole = 'system',
    details = null,
    previousValue = null,
    newValue = null,
    reason = null,
    deviceInfo = null,
    actorUserId = null
  } = options;
  
  createDetailedAuditLog.run(
    actorUserId,
    action,
    recordType,
    recordId,
    applicationNumber,
    actor,
    actorRole,
    details ? JSON.stringify(details) : null,
    previousValue,
    newValue,
    reason,
    deviceInfo,
    new Date().toISOString()
  );
}

function normaliseIdentifier(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
function normaliseStationValue(value) {
  return String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}
function resolveAssignedPollingStation(voterRow) {
  if (voterRow.polling_station_code) return voterRow.polling_station_code;
  if (!voterRow.district && !voterRow.ward) return null;
  const station = database.prepare(`SELECT code, district, ward, electoral_area FROM pollings_stations WHERE active = 1 AND (${normaliseStationValue(voterRow.district)} <> '' OR ${normaliseStationValue(voterRow.ward)} <> '') LIMIT 1`).get();
  if (!station) return null;
  const districtMatch = normaliseStationValue(voterRow.district) && normaliseStationValue(station.district) === normaliseStationValue(voterRow.district);
  const wardMatch = normaliseStationValue(voterRow.ward) && normaliseStationValue(station.ward) === normaliseStationValue(voterRow.ward);
  if (districtMatch && wardMatch) return station.code;
  return station.code;
}
function validateVoterPollingAssignment(voterId, pollingStationCode) {
  const voter = database.prepare(`SELECT id, voter_registration_number, district, ward, electoral_area, polling_station_code FROM voters WHERE id = ? AND is_active = 1 AND is_eligible = 1`).get(voterId);
  if (!voter) return { allowed: false, error: 'Eligible voter not found.' };
  const expected = voter.polling_station_code || resolveAssignedPollingStation(voter);
  if (!expected) return { allowed: false, error: 'This voter has no assigned polling station in the election configuration.' };
  const provided = String(pollingStationCode || '').trim();
  if (provided && provided.toUpperCase() !== expected.toUpperCase()) {
    return { allowed: false, error: `This voter is assigned to ${expected} for ${voter.electoral_area || voter.ward || voter.district}.` };
  }
  return { allowed: true, expectedPollingStation: expected, assignedPollingStation: expected };
}
function getPermanentVoterStatus(voter) {
  if (!voter) return 'INACTIVE';
  if (voter.is_active !== 1) return 'INACTIVE';
  if (voter.is_eligible === 1) return 'ELIGIBLE';
  if (voter.is_eligible === 0) return 'REGISTERED';
  return 'REGISTERED';
}
function getElectionDayStatus(row) {
  const status = String(row?.election_status || row?.voting_status || 'NOT_CHECKED_IN').trim().toUpperCase().replace(/\s+/g, '_');
  if (['NOT_CHECKED_IN', 'CHECKED_IN', 'VOTED', 'CHALLENGED', 'REFERRED'].includes(status)) return status;
  if (status === 'NOT_YET_VOTED' || status === 'NOT_CHECKED') return 'NOT_CHECKED_IN';
  if (status === 'VOTED' || status === 'VOTE_COMPLETED') return 'VOTED';
  if (status === 'CHECKED_IN' || status === 'CHECKEDIN') return 'CHECKED_IN';
  return 'NOT_CHECKED_IN';
}

function findDuplicateRegistrationCandidate(input = {}) {
  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const dateOfBirth = String(input.dob || input.dateOfBirth || '').trim();
  const sex = String(input.sex || '').trim();
  const nationality = String(input.nationality || '').trim();
  const documentNumber = String(input.documentNumber || input.identityReference || input.nationalId || '').trim();
  if (!firstName || !lastName || !dateOfBirth) return null;

  const activeStatuses = [
    'Under Verification',
    'Pending Review',
    'Officer Verified',
    'Flagged',
    'Corrections Required',
    'Approved'
  ];

  const params = [
    firstName,
    lastName,
    dateOfBirth,
    sex || 'Not specified',
    nationality || 'Not specified'
  ];

  let documentClause = '';
  if (documentNumber) {
    documentClause = ` OR (LOWER(COALESCE(d.document_number, '')) = LOWER(?))`;
    params.push(documentNumber);
  }

  const duplicate = database.prepare(`
    SELECT
      v.id,
      a.application_number AS applicationNumber,
      a.status,
      v.first_name AS firstName,
      v.last_name AS lastName,
      v.date_of_birth AS dateOfBirth,
      v.sex,
      v.nationality,
      v.district,
      v.ward,
      u.name AS createdByName,
      a.created_by_user_id AS createdByUserId,
      a.submitted_at AS submittedAt
    FROM voters v
    JOIN voter_applications a ON a.id = v.application_id
    LEFT JOIN identity_documents d ON d.voter_id = v.id
    LEFT JOIN users u ON u.id = a.created_by_user_id
    WHERE a.status IN (${activeStatuses.map(() => '?').join(', ')})
      AND (
        (LOWER(TRIM(v.first_name)) = LOWER(?) AND LOWER(TRIM(v.last_name)) = LOWER(?) AND v.date_of_birth = ? AND LOWER(COALESCE(v.sex, '')) = LOWER(?) AND LOWER(COALESCE(v.nationality, '')) = LOWER(?))
        ${documentClause}
      )
    ORDER BY a.submitted_at DESC
    LIMIT 1
  `).get(...activeStatuses, ...params);

  if (!duplicate) return null;
  return {
    applicationNumber: duplicate.applicationNumber,
    status: duplicate.status,
    firstName: duplicate.firstName,
    lastName: duplicate.lastName,
    dateOfBirth: duplicate.dateOfBirth,
    district: duplicate.district || 'Area pending',
    ward: duplicate.ward || 'Ward pending',
    createdByName: duplicate.createdByName || 'Registration Officer',
    submittedAt: duplicate.submittedAt,
    matchedIdentity: {
      firstName: duplicate.firstName,
      lastName: duplicate.lastName,
      dateOfBirth: duplicate.dateOfBirth,
      sex: duplicate.sex,
      nationality: duplicate.nationality
    }
  };
}

const createNormalizedApplication = database.prepare('INSERT INTO voter_applications (application_number, user_id, created_by_user_id, created_by_admin_id, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?)');
const createVoter = database.prepare('INSERT INTO voters (application_id, first_name, middle_name, last_name, date_of_birth, sex, nationality, phone, email, address, region, district, ward, registration_centre_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const createDocument = database.prepare('INSERT INTO identity_documents (voter_id, document_type, document_number, document_reference) VALUES (?, ?, ?, ?)');
const createVerification = database.prepare('INSERT INTO verification_records (application_id, verification_type, result, verified_at) VALUES (?, ?, ?, ?)');
const createApplicationAssignment = database.prepare('INSERT INTO application_assignments (application_id, officer_id, assigned_by_admin_id, assigned_at) VALUES (?, ?, ?, ?)');
const createApplicationReview = database.prepare('INSERT INTO application_reviews (application_id, officer_id, decision, reason, reviewed_at) VALUES (?, ?, ?, ?, ?)');

app.post('/api/applications/check-duplicate', (request, response) => {
  const input = request.body || {};
  const match = findDuplicateRegistrationCandidate(input);
  if (match) {
    logAuditEvent('APPLICATION_DUPLICATE_FOUND', {
      recordType: 'APPLICATION',
      recordId: match.applicationNumber,
      applicationNumber: match.applicationNumber,
      actor: 'System',
      actorRole: 'system',
      details: {
        duplicateCheck: 'POSSIBLE_MATCH',
        voterName: `${match.firstName} ${match.lastName}`,
        applicationNumber: match.applicationNumber,
        status: match.status,
        createdBy: match.createdByName
      }
    });
    return response.status(409).json({
      duplicate: true,
      message: 'A possible existing voter registration was found.',
      match
    });
  }

  response.json({ duplicate: false, message: 'No active duplicate registration found.' });
});

app.post('/api/applications', (request, response) => {
  const input = request.body || {};
  const duplicateCheck = findDuplicateRegistrationCandidate(input);
  if (duplicateCheck) {
    logAuditEvent('APPLICATION_DUPLICATE_BLOCKED', {
      recordType: 'APPLICATION',
      recordId: duplicateCheck.applicationNumber,
      applicationNumber: duplicateCheck.applicationNumber,
      actor: request.get('x-user-role') || 'officer',
      actorRole: request.get('x-user-role') || 'officer',
      actorUserId: Number(request.get('x-user-id')) || null,
      details: {
        blockedApplication: 'NEW_SUBMISSION',
        existingApplicationNumber: duplicateCheck.applicationNumber,
        existingStatus: duplicateCheck.status,
        applicantName: `${duplicateCheck.firstName} ${duplicateCheck.lastName}`
      }
    });
    return response.status(409).json({
      error: 'Duplicate registration detected. This voter already has an active application.',
      duplicate: true,
      match: duplicateCheck
    });
  }

  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Registration Officer';
  const applicationNumber = `VR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const createdAt = new Date().toISOString();
  const record = { ...input, applicationNumber, createdAt, status: 'Under Verification' };
  const normalized = { ...record, firstName: input.firstName || '', lastName: input.lastName || '', dateOfBirth: input.dob || '', sex: input.sex || 'Not specified', nationality: input.nationality || 'Not specified' };
  const userId = Number(request.get('x-user-id')) || null;
  const role = request.get('x-user-role');
  const voterUserId = role === 'voter' ? userId : null;
  const creatorUserId = ['officer', 'admin'].includes(role) ? userId : null;
  const adminId = role === 'admin' ? userId : null;
  database.exec('BEGIN');
  try {
    const application = createNormalizedApplication.run(applicationNumber, voterUserId, creatorUserId, adminId, record.status, createdAt);
    const voter = createVoter.run(application.lastInsertRowid, normalized.firstName, normalized.middleName || null, normalized.lastName, normalized.dateOfBirth, normalized.sex, normalized.nationality, normalized.phone || null, normalized.email || null, normalized.address || null, normalized.region || null, normalized.district || null, normalized.ward || null, 1);
    createDocument.run(voter.lastInsertRowid, normalized.documentType || 'Not specified', normalized.documentNumber || 'Not specified', `server-reference://${applicationNumber}/identity-document`);
    ['Identity', 'Eligibility', 'Electoral Area', 'Duplicate Check'].forEach(type => createVerification.run(application.lastInsertRowid, type, 'Passed', createdAt));
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); return response.status(400).json({ error: 'The application could not be saved', detail: error.message }); }
  createApplication.run(applicationNumber, JSON.stringify(record), record.status, createdAt);
  if (role === 'officer') {
    const officer = database.prepare("SELECT id FROM officers WHERE user_id = ? AND status = 'active'").get(userId);
    if (officer) {
      database.prepare('UPDATE voter_applications SET assigned_officer_id = ? WHERE application_number = ?').run(officer.id, applicationNumber);
      createApplicationAssignment.run(database.prepare('SELECT id FROM voter_applications WHERE application_number = ?').get(applicationNumber).id, officer.id, null, createdAt);
    }
  }
  setApplicationLifecycle(applicationNumber, 'SUBMITTED', { actor: userId ? `User ${userId}` : 'Registration officer', actorRole: userId ? 'voter' : 'officer' });
  logAuditEvent('APPLICATION_SUBMITTED', { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: userId ? `User ${userId}` : 'Registration officer', actorRole: userId ? 'voter' : 'officer', actorUserId: userId, details: { submittedAt: createdAt } });
  response.status(201).json(record);
});

app.get('/api/applications/:applicationNumber', (request, response) => {
  const row = findApplication.get(request.params.applicationNumber.toUpperCase());
  if (!row) return response.status(404).json({ error: 'Application not found' });
  response.json({ ...JSON.parse(row.payload), applicationNumber: row.applicationNumber, status: row.status, lifecycleStatus: row.lifecycleStatus, createdAt: row.createdAt });
});

app.get('/api/applications/:applicationNumber/lifecycle', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const application = database.prepare('SELECT application_number AS applicationNumber, lifecycle_status AS lifecycleStatus, created_at AS createdAt FROM applications WHERE application_number = ?').get(applicationNumber);
  if (!application) return response.status(404).json({ error: 'Application not found' });
  const history = database.prepare('SELECT status, actor, actor_role AS actorRole, reason, created_at AS createdAt FROM application_status_history WHERE application_number = ? ORDER BY id').all(applicationNumber);
  response.json({ application, statuses: applicationLifecycle, history });
});

app.patch('/api/applications/:applicationNumber', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const row = findApplication.get(applicationNumber);
  const record = { ...(row ? JSON.parse(row.payload) : request.body), applicationNumber, status: request.body.status || row?.status || 'Under Verification', reviewedAt: new Date().toISOString() };
  if (row) updateApplication.run(JSON.stringify(record), record.status, applicationNumber);
  else createApplication.run(applicationNumber, JSON.stringify(record), record.status, record.createdAt || new Date().toISOString());
  const lifecycleByLegacyStatus = { Flagged: 'FLAGGED', 'Corrections Required': 'FLAGGED', Rejected: 'REJECTED', Approved: 'APPROVED' };
  if (lifecycleByLegacyStatus[record.status]) setApplicationLifecycle(applicationNumber, lifecycleByLegacyStatus[record.status], { actor: 'Central administrator', actorRole: 'admin' });
  logAuditEvent(`APPLICATION_${record.status.toUpperCase().replaceAll(' ', '_')}`, { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, newValue: record.status, details: { status: record.status } });
  if (['Flagged', 'Corrections Required', 'Officer Verified', 'Approved', 'Rejected'].includes(record.status)) logAuditEvent('APPLICATION_REVIEWED', { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, details: { resultingStatus: record.status } });
  const normalized = database.prepare('UPDATE voter_applications SET status = ?, reviewed_at = ? WHERE application_number = ?');
  normalized.run(record.status, record.reviewedAt, applicationNumber);
  if (record.status === 'Approved') {
    database.prepare("UPDATE voters SET is_active = 1, voter_registration_number = COALESCE(voter_registration_number, 'VR-' || printf('%06d', id)) WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)").run(applicationNumber);
    const voterRecord = database.prepare('SELECT id, voter_registration_number AS voterRegistrationNumber FROM voters WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)').get(applicationNumber);
    if (voterRecord) logAuditEvent('VOTER_RECORD_CREATED', { recordType: 'VOTER', recordId: voterRecord.voterRegistrationNumber || String(voterRecord.id), applicationNumber, actor: 'System', actorRole: 'system', actorUserId: Number(request.get('x-user-id')) || null, details: { voterRegistrationNumber: voterRecord.voterRegistrationNumber, createdAt: record.reviewedAt } });
  } else {
    database.prepare('UPDATE voters SET is_active = 0 WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)').run(applicationNumber);
  }
  response.json(record);
});

app.get('/api/audit-logs', (_request, response) => {
  const logs = listAuditLogs.all();
  const formatted = logs.map(log => ({
    id: log.id,
    action: log.action,
    recordType: log.record_type,
    recordId: log.record_id,
    applicationNumber: log.application_number,
    actor: log.actor,
    actorRole: log.actor_role,
    details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
    previousValue: log.previous_value,
    newValue: log.new_value,
    reason: log.reason,
    deviceInfo: log.device_info,
    createdAt: log.created_at
  }));
  response.json(formatted);
});

app.get('/api/admin/overview', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const count = table => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  const userId = Number(request.get('x-user-id')) || null;
  const admin = userId ? database.prepare('SELECT name FROM users WHERE id = ? AND role = ?').get(userId, 'admin') : database.prepare("SELECT name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const assignedOffice = database.prepare(`SELECT c.name AS centre, c.district, c.ward FROM registration_centres c JOIN officers o ON o.centre_id = c.id WHERE o.status = 'active' ORDER BY o.id LIMIT 1`).get() || database.prepare('SELECT name AS centre, district, ward FROM registration_centres WHERE active = 1 ORDER BY id LIMIT 1').get();
  const activeVoters = database.prepare("SELECT COUNT(*) AS count FROM voters WHERE is_active = 1").get().count;
  const registeredVoters = assignedOffice ? database.prepare('SELECT COUNT(*) AS count FROM voters WHERE is_active = 1 AND registration_centre_id = (SELECT id FROM registration_centres WHERE name = ? LIMIT 1)').get(assignedOffice.centre).count : activeVoters;
  const statusCount = status => database.prepare('SELECT COUNT(*) AS count FROM voter_applications WHERE status = ?').get(status).count;
  const pendingToday = database.prepare("SELECT COUNT(*) AS count FROM voter_applications WHERE status IN ('Pending Review', 'Under Verification') AND date(submitted_at) = date('now')").get().count;
  const pendingYesterday = database.prepare("SELECT COUNT(*) AS count FROM voter_applications WHERE status IN ('Pending Review', 'Under Verification') AND date(submitted_at) = date('now', '-1 day')").get().count;
  const approvedThisMonth = database.prepare("SELECT COUNT(*) AS count FROM voter_applications WHERE status = 'Approved' AND strftime('%Y-%m', reviewed_at) = strftime('%Y-%m', 'now')").get().count;
  const approvedPreviousMonth = database.prepare("SELECT COUNT(*) AS count FROM voter_applications WHERE status = 'Approved' AND strftime('%Y-%m', reviewed_at) = strftime('%Y-%m', 'now', '-1 month')").get().count;
  const flaggedDocuments = database.prepare("SELECT COUNT(DISTINCT a.id) AS count FROM voter_applications a LEFT JOIN verification_records v ON v.application_id = a.id WHERE a.status IN ('Flagged', 'Corrections Required') AND (v.result IN ('Failed', 'Needs Review') OR a.status = 'Corrections Required')").get().count;
  const duplicateFlags = database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'APPLICATION_DUPLICATE_FOUND' AND date(created_at) >= date('now', 'start of month')").get().count;
  response.json({
    adminName: admin?.name || 'Administrator',
    date: new Date().toISOString(),
    office: assignedOffice ? `${assignedOffice.district} · ${assignedOffice.centre}` : 'Unassigned office',
    voters: activeVoters,
    registeredVoters,
    applications: count('voter_applications'),
    pending: statusCount('Pending Review') + statusCount('Under Verification'),
    pendingToday,
    pendingYesterday,
    flagged: statusCount('Flagged') + statusCount('Corrections Required'),
    flaggedDocuments,
    duplicateFlags,
    approved: statusCount('Approved'),
    approvedThisMonth,
    approvedPreviousMonth,
    rejected: statusCount('Rejected'),
    officers: count('officers'),
    centres: count('registration_centres'),
    auditEvents: count('audit_logs')
  });
});
app.get('/api/admin/centres', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  response.json(database.prepare('SELECT id, name, region, district, ward, active FROM registration_centres ORDER BY name').all());
});
app.get('/api/admin/officers', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const officers = database.prepare(`SELECT officers.id, officers.user_id AS userId, users.name, users.email, officers.status, officers.centre_id AS centreId, registration_centres.name AS centre FROM officers JOIN users ON users.id = officers.user_id LEFT JOIN registration_centres ON registration_centres.id = officers.centre_id ORDER BY officers.id`).all();
  response.json(officers.map(officer => ({ ...officer, activity: database.prepare("SELECT COUNT(*) AS reviewed, SUM(CASE WHEN action LIKE '%APPROVED%' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN action LIKE '%FLAGGED%' THEN 1 ELSE 0 END) AS flagged, SUM(CASE WHEN action LIKE '%REJECTED%' THEN 1 ELSE 0 END) AS rejected, MAX(created_at) AS lastActivity FROM audit_logs WHERE actor_role = 'officer' AND (actor = ? OR details LIKE ?) ").get(officer.name, `%${officer.email}%`) })));
});
app.post('/api/admin/officers', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const { name, email, password, phone = null, centreId = null } = request.body || {};
  if (!name || !email || !password) return response.status(400).json({ error: 'Name, email, and password are required.' });
  if (centreId !== null && !database.prepare('SELECT id FROM registration_centres WHERE id = ? AND active = 1').get(Number(centreId))) return response.status(400).json({ error: 'Choose an active registration centre.' });
  try {
    const user = database.prepare('INSERT INTO users (phone, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(phone, email.trim().toLowerCase(), name.trim(), hashPassword(password), 'officer', new Date().toISOString());
    const officer = database.prepare('INSERT INTO officers (user_id, centre_id, created_by_admin_id, status) VALUES (?, ?, ?, ?)').run(user.lastInsertRowid, centreId === null ? null : Number(centreId), Number(request.get('x-user-id')) || null, 'active');
    logAuditEvent('OFFICER_CREATED', { recordType: 'OFFICER', recordId: String(officer.lastInsertRowid), actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, details: { officerName: name.trim(), email: email.trim().toLowerCase(), centreId } });
    response.status(201).json({ id: officer.lastInsertRowid, userId: user.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), status: 'active', centreId });
  } catch (error) { response.status(400).json({ error: 'Could not create officer. Email or phone may already exist.' }); }
});
app.patch('/api/admin/officers/:id', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const officer = database.prepare('SELECT officers.id, officers.user_id AS userId, users.name, officers.status, officers.centre_id AS centreId FROM officers JOIN users ON users.id = officers.user_id WHERE officers.id = ?').get(request.params.id);
  if (!officer) return response.status(404).json({ error: 'Officer not found.' });
  const input = request.body || {};
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : officer.name;
  const status = input.status && ['active', 'inactive'].includes(input.status) ? input.status : officer.status;
  const centreId = input.centreId === null || input.centreId === '' ? null : (input.centreId === undefined ? officer.centreId : Number(input.centreId));
  if (centreId !== null && !database.prepare('SELECT id FROM registration_centres WHERE id = ? AND active = 1').get(centreId)) return response.status(400).json({ error: 'Choose an active registration centre.' });
  database.prepare('UPDATE officers SET status = ?, centre_id = ? WHERE id = ?').run(status, centreId, officer.id);
  database.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, officer.userId);
  logAuditEvent('OFFICER_UPDATED', { recordType: 'OFFICER', recordId: String(officer.id), actor: 'Central administrator', actorRole: 'admin', previousValue: JSON.stringify({ name: officer.name, status: officer.status, centreId: officer.centreId }), newValue: JSON.stringify({ name, status, centreId }), details: { officerName: name } });
  response.json({ id: officer.id, name, status, centreId });
});
app.get('/api/admin/officers/:id/activity', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const officer = database.prepare('SELECT officers.id, users.name, users.email FROM officers JOIN users ON users.id = officers.user_id WHERE officers.id = ?').get(request.params.id);
  if (!officer) return response.status(404).json({ error: 'Officer not found.' });
  const activity = database.prepare("SELECT action, application_number AS applicationNumber, reason, created_at AS createdAt FROM audit_logs WHERE actor_role = 'officer' AND (actor = ? OR details LIKE ?) ORDER BY id DESC LIMIT 100").all(officer.name, `%${officer.email}%`);
  response.json({ officer, activity });
});
app.get('/api/admin/voters', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const query = String(request.query.q || '').trim();
  const scope = String(request.query.scope || 'all');
  const authorized = request.query.authorized === 'true';
  const dateFrom = String(request.query.from || ''), dateTo = String(request.query.to || '');
  if ((dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) || (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) return response.status(400).json({ error: 'Enter a valid registration date range.' });
  if (query.length === 1) return response.status(400).json({ error: 'Enter at least 2 characters to search.' });
  if ((scope === 'phone' || scope === 'nationalId') && !authorized) return response.status(403).json({ error: 'Authorization is required for this sensitive search.' });
  const pattern = `%${query}%`, district = String(request.query.district || ''), ward = String(request.query.ward || ''), centre = String(request.query.centre || ''), status = String(request.query.status || '');
  const searchColumns = { all: `(v.first_name || ' ' || v.last_name LIKE ? OR v.voter_registration_number LIKE ? OR a.application_number LIKE ? OR c.name LIKE ?)`, name: `v.first_name || ' ' || v.last_name LIKE ?`, registration: `v.voter_registration_number LIKE ?`, application: `a.application_number LIKE ?`, centre: `c.name LIKE ?`, phone: `v.phone LIKE ?`, nationalId: `d.document_number LIKE ? OR d.document_reference LIKE ?` };
  const searchValues = scope === 'all' ? [pattern, pattern, pattern, pattern] : scope === 'nationalId' ? [pattern, pattern] : [pattern];
  const clauses = [`(? = '' OR ${searchColumns[scope] || searchColumns.all})`, `(? = '' OR v.district = ?)`, `(? = '' OR v.ward = ?)`, `(? = '' OR c.name = ?)`, `(? = '' OR a.status = ? OR (? = 'Active' AND a.status = 'Approved'))`, `(? = '' OR date(a.submitted_at) >= date(?))`, `(? = '' OR date(a.submitted_at) <= date(?))`];
  const values = [query, ...searchValues, district, district, ward, ward, centre, centre, status, status, status, dateFrom, dateFrom, dateTo, dateTo];
  const from = 'FROM voters v JOIN voter_applications a ON a.id = v.application_id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id LEFT JOIN identity_documents d ON d.voter_id = v.id';
  clauses.push('v.is_active = 1 AND a.status = \'Approved\'');
  const where = `WHERE ${clauses.join(' AND ')}`;
  const select = `SELECT v.id, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber, a.application_number AS applicationNumber, v.first_name AS firstName, v.last_name AS lastName, v.district, v.ward, a.status, a.submitted_at AS registrationDate ${from} ${where} ORDER BY v.id DESC LIMIT 100`;
  const countQuery = `SELECT COUNT(*) AS count ${from} ${where}`;
  const items = database.prepare(select).all(...values);
  const matched = database.prepare(countQuery).get(...values).count;
  const total = database.prepare('SELECT COUNT(*) AS count FROM voters').get().count;
  const filters = { districts: database.prepare('SELECT DISTINCT district FROM voters WHERE district IS NOT NULL AND district <> \'\' ORDER BY district').all().map(row => row.district), wards: database.prepare('SELECT DISTINCT ward FROM voters WHERE ward IS NOT NULL AND ward <> \'\' ORDER BY ward').all().map(row => row.ward), centres: database.prepare('SELECT name FROM registration_centres WHERE active = 1 ORDER BY name').all().map(row => row.name) };
  if (query && (scope === 'phone' || scope === 'nationalId')) logAuditEvent('SENSITIVE_VOTER_SEARCH', { actor: 'Central administrator', actorRole: 'admin', details: { searchScope: scope, recordsMatched: matched } });
  response.json({ total, matched, items, filters });
});
app.get('/api/admin/voters/:id', (request, response) => {
  if (!['admin', 'officer'].includes(request.get('x-user-role')) && request.get('x-view-sensitive') !== 'true') return response.status(403).json({ error: 'Permission is required to view this voter record.' });
  const voter = database.prepare(`SELECT v.id, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber, a.application_number AS applicationNumber, v.first_name AS firstName, v.middle_name AS middleName, v.last_name AS lastName, v.date_of_birth AS dateOfBirth, v.sex, v.nationality, v.district, v.ward, c.name AS registrationCentre, v.official_id_card_number AS officialIdCardNumber, v.is_eligible AS isEligible, a.status, a.submitted_at AS registrationDate FROM voters v JOIN voter_applications a ON a.id = v.application_id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id WHERE v.id = ? AND v.is_active = 1 AND a.status = 'Approved'`).get(request.params.id);
  if (!voter) return response.status(404).json({ error: 'Voter record not found.' });
  const canViewSensitive = request.get('x-view-sensitive') === 'true' || request.get('x-user-role') === 'admin';
  const viewType = canViewSensitive ? 'SENSITIVE' : 'STANDARD';
  logAuditEvent('VOTER_RECORD_VIEWED', { recordType: 'VOTER', recordId: String(request.params.id), actor: request.get('x-user-role') === 'admin' ? 'Central administrator' : 'Officer', actorRole: request.get('x-user-role') || 'officer', details: { voterRegistrationNumber: voter.voterRegistrationNumber, viewType, sensitiveFieldsViewed: canViewSensitive } });
  response.json({ ...voter, dateOfBirth: canViewSensitive ? voter.dateOfBirth : '••/••/••••', sensitiveFieldsMasked: !canViewSensitive });
});
app.get('/api/admin/eligible-voters', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const rows = database.prepare(`SELECT v.id, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber, a.application_number AS applicationNumber, TRIM(v.first_name || ' ' || COALESCE(v.middle_name || ' ', '') || v.last_name) AS name, v.district, v.ward, c.name AS registrationCentre, v.official_id_card_number AS officialIdCardNumber, a.reviewed_at AS approvedAt FROM voters v JOIN voter_applications a ON a.id = v.application_id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id WHERE v.is_active = 1 AND v.is_eligible = 1 AND a.status = 'Approved' ORDER BY datetime(a.reviewed_at) DESC LIMIT 500`).all();
  response.json(rows);
});
app.post('/api/admin/eligible-voters/:id/issue-id-card', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const voterId = Number(request.params.id);
  const voter = database.prepare(`SELECT v.id, v.application_id AS applicationId, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber, v.first_name AS firstName, v.last_name AS lastName, v.official_id_card_number AS officialIdCardNumber, a.application_number AS applicationNumber, a.status FROM voters v JOIN voter_applications a ON a.id = v.application_id WHERE v.id = ? AND v.is_active = 1`).get(voterId);
  if (!voter) return response.status(404).json({ error: 'Eligible voter not found.' });
  const cardNumber = voter.officialIdCardNumber || `ID-${new Date().getFullYear()}-${String(voter.id).padStart(6, '0')}`;
  const issuedAt = new Date().toISOString();
  const existingCard = database.prepare('SELECT id FROM voter_id_cards WHERE voter_id = ?').get(voterId);
  if (!existingCard) {
    createVoterIdCard.run(voterId, voter.applicationId, cardNumber, issuedAt, null, `QR-${cardNumber}`);
  } else {
    database.prepare('UPDATE voter_id_cards SET status = ?, printed_at = ?, issued_at = COALESCE(issued_at, ?) WHERE voter_id = ?').run('reissued', issuedAt, issuedAt, voterId);
  }
  database.prepare('UPDATE voters SET is_eligible = 1, official_id_card_number = ? WHERE id = ?').run(cardNumber, voterId);
  setApplicationLifecycle(voter.applicationNumber, 'ELIGIBLE', { actor: 'Central administrator', actorRole: 'admin', reason: `Official voter ID card ${cardNumber} issued.` });
  setApplicationLifecycle(voter.applicationNumber, 'ID_CARD_ISSUED', { actor: 'Central administrator', actorRole: 'admin', reason: `Official voter ID card ${cardNumber} issued.` });
  logAuditEvent('VOTER_ID_CARD_ISSUED', { recordType: 'VOTER_CARD', recordId: cardNumber, applicationNumber: voter.applicationNumber, actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, details: { cardNumber, issuedAt, voterRegistrationNumber: voter.voterRegistrationNumber } });
  response.json({ id: voter.id, applicationNumber: voter.applicationNumber, voterRegistrationNumber: voter.voterRegistrationNumber, cardNumber, issuedAt, status: 'issued' });
});
app.get('/api/admin/approvals', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const items = database.prepare(`SELECT COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS registrationNumber, TRIM(v.first_name || ' ' || COALESCE(v.middle_name || ' ', '') || v.last_name) AS name, c.name AS centre, a.reviewed_at AS approvedAt FROM voter_applications a JOIN voters v ON v.application_id = a.id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id WHERE a.status = 'Approved' AND v.is_active = 1 ORDER BY datetime(a.reviewed_at) DESC LIMIT 100`).all();
  const approvedToday = database.prepare("SELECT COUNT(*) AS count FROM voter_applications WHERE status = 'Approved' AND date(reviewed_at) = date('now')").get().count;
  response.json({ approvedToday, items });
});
app.get('/api/admin/election-dashboard', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const activeElection = database.prepare("SELECT id, code, name, election_date AS electionDate, status FROM elections WHERE status = 'active' ORDER BY election_date DESC LIMIT 1").get() || database.prepare("SELECT id, code, name, election_date AS electionDate, status FROM elections ORDER BY id DESC LIMIT 1").get();
  const eligible = database.prepare("SELECT COUNT(*) AS count FROM voter_records WHERE is_active = 1 AND permanent_status = 'ELIGIBLE'").get().count;
  const checkedIn = activeElection ? database.prepare("SELECT COUNT(*) AS count FROM election_voter_records WHERE election_id = ? AND election_status IN ('CHECKED_IN', 'VOTED')").get(activeElection.id).count : 0;
  const voted = activeElection ? database.prepare("SELECT COUNT(*) AS count FROM election_voter_records WHERE election_id = ? AND election_status = 'VOTED'").get(activeElection.id).count : 0;
  const stations = activeElection ? database.prepare("SELECT COUNT(DISTINCT polling_station_code) AS count FROM election_voter_records WHERE election_id = ? AND polling_station_code IS NOT NULL").get(activeElection.id).count : 0;
  const incidents = database.prepare("SELECT COUNT(*) AS count FROM election_day_incidents WHERE status <> 'RESOLVED'").get().count;
  response.json({
    election: activeElection ? { ...activeElection, electionDate: activeElection.electionDate || new Date().toISOString() } : { id: null, code: 'N/A', name: 'No active election', electionDate: new Date().toISOString(), status: 'scheduled' },
    totalEligible: eligible,
    checkedIn,
    voted,
    pending: Math.max(eligible - checkedIn, 0),
    turnout: eligible ? (voted / eligible) * 100 : 0,
    pollingStations: stations,
    incidents
  });
});
app.get('/api/admin/election-day/summary', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const totalEligible = database.prepare("SELECT COUNT(*) AS count FROM voters WHERE is_active = 1 AND is_eligible = 1").get().count;
  const voted = database.prepare("SELECT COUNT(*) AS count FROM election_day_voters WHERE election_status = 'VOTED' OR voting_status = 'Voted'").get().count;
  const pending = Math.max(totalEligible - voted, 0);
  response.json({ totalEligible, voted, pending, turnout: totalEligible ? (voted / totalEligible) * 100 : 0 });
});
app.get('/api/admin/election-day/exceptions', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const items = database.prepare(`
    SELECT ei.id,
      ei.incident_type,
      ei.severity,
      ei.description,
      ei.requires_supervisor,
      ei.status,
      ei.officer_name,
      ei.created_at,
      TRIM(COALESCE(v.first_name || ' ', '') || COALESCE(v.middle_name || ' ', '') || COALESCE(v.last_name, '')) AS voter_name
    FROM election_day_incidents ei
    LEFT JOIN voters v ON v.id = ei.voter_id
    ORDER BY datetime(ei.created_at) DESC
    LIMIT 20
  `).all();
  response.json({ items });
});
app.post('/api/admin/election-day/exceptions', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const payload = request.body || {};
  const incidentType = String(payload.incidentType || '').trim();
  const description = String(payload.description || '').trim();
  const officerName = String(payload.officerName || 'Officer').trim();
  if (!incidentType) return response.status(400).json({ error: 'Select an election-day issue type.' });
  const supervisorRequired = Boolean(payload.supervisorRequired || ['Voter already voted', 'Registration inactive', 'Duplicate identity concern', 'ID/card mismatch', 'Officer requires supervisor assistance'].includes(incidentType));
  const status = supervisorRequired ? 'PENDING_SUPERVISOR_REVIEW' : 'OPEN';
  const title = incidentType;
  database.prepare(`INSERT INTO election_day_incidents (incident_type, severity, title, description, requires_supervisor, status, officer_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    incidentType,
    supervisorRequired ? 'high' : 'medium',
    title,
    description || 'No additional details provided.',
    supervisorRequired ? 1 : 0,
    status,
    officerName || 'Officer',
    new Date().toISOString()
  );
  response.status(201).json({
    message: supervisorRequired ? 'Exception recorded and escalated for supervisor review.' : 'Exception recorded successfully.',
    status,
    requiresSupervisor: supervisorRequired
  });
});
app.get('/api/admin/election-day/station-dashboard', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const stationCode = String(request.query.station || 'PS-009-04').trim() || 'PS-009-04';
  const station = database.prepare(`SELECT code, district, ward, electoral_area, name FROM pollings_stations WHERE UPPER(code) = UPPER(?) AND active = 1 LIMIT 1`).get(stationCode) || {
    code: stationCode,
    district: 'Kenema',
    ward: '009',
    electoral_area: '009',
    name: 'Kenema Polling Station 04'
  };
  const eligibleVoters = database.prepare(`SELECT COUNT(*) AS count FROM voters WHERE is_active = 1 AND is_eligible = 1 AND (UPPER(COALESCE(polling_station_code, '')) = UPPER(?) OR UPPER(COALESCE(ward, '')) = UPPER(?) OR UPPER(COALESCE(electoral_area, ward, '')) = UPPER(?))`).get(stationCode, station.ward || station.electoral_area || '009', station.electoral_area || station.ward || '009').count;
  const checkedIn = database.prepare(`SELECT COUNT(*) AS count FROM election_day_voters ed INNER JOIN voters v ON v.id = ed.voter_id WHERE v.is_active = 1 AND v.is_eligible = 1 AND (UPPER(COALESCE(v.polling_station_code, '')) = UPPER(?) OR UPPER(COALESCE(v.ward, '')) = UPPER(?) OR UPPER(COALESCE(v.electoral_area, v.ward, '')) = UPPER(?)) AND (UPPER(COALESCE(ed.election_status, ed.voting_status, 'NOT_CHECKED_IN')) IN ('CHECKED_IN', 'VOTED'))`).get(stationCode, station.ward || station.electoral_area || '009', station.electoral_area || station.ward || '009').count;
  const voted = database.prepare(`SELECT COUNT(*) AS count FROM election_day_voters ed INNER JOIN voters v ON v.id = ed.voter_id WHERE v.is_active = 1 AND v.is_eligible = 1 AND (UPPER(COALESCE(v.polling_station_code, '')) = UPPER(?) OR UPPER(COALESCE(v.ward, '')) = UPPER(?) OR UPPER(COALESCE(v.electoral_area, v.ward, '')) = UPPER(?)) AND UPPER(COALESCE(ed.election_status, ed.voting_status, 'NOT_CHECKED_IN')) = 'VOTED'`).get(stationCode, station.ward || station.electoral_area || '009', station.electoral_area || station.ward || '009').count;
  const remaining = Math.max(eligibleVoters - checkedIn, 0);
  const activity = database.prepare(`
    SELECT TRIM(v.first_name || ' ' || COALESCE(v.middle_name || ' ', '') || v.last_name) AS name,
      COALESCE(ed.election_status, ed.voting_status, 'NOT_CHECKED_IN') AS status,
      COALESCE(ed.updated_at, ed.checked_in_at, datetime('now')) AS activityTime
    FROM election_day_voters ed
    INNER JOIN voters v ON v.id = ed.voter_id
    WHERE v.is_active = 1 AND v.is_eligible = 1
      AND (UPPER(COALESCE(v.polling_station_code, '')) = UPPER(?) OR UPPER(COALESCE(v.ward, '')) = UPPER(?) OR UPPER(COALESCE(v.electoral_area, v.ward, '')) = UPPER(?))
      AND UPPER(COALESCE(ed.election_status, ed.voting_status, 'NOT_CHECKED_IN')) IN ('CHECKED_IN', 'VOTED')
    ORDER BY datetime(COALESCE(ed.updated_at, ed.checked_in_at, datetime('now'))) DESC
    LIMIT 3
  `).all(stationCode, station.ward || station.electoral_area || '009', station.electoral_area || station.ward || '009').map(row => ({
    name: row.name,
    status: String(row.status || 'CHECKED_IN').toUpperCase() === 'VOTED' ? '✓ Voted' : '✓ Checked In',
    time: new Date(row.activityTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }));
  response.json({
    stationCode: station.code || stationCode,
    district: station.district || 'Kenema',
    areaLabel: `Electoral Area ${station.electoral_area || station.ward || '009'}`,
    eligibleVoters,
    checkedIn,
    voted,
    remaining,
    activity
  });
});
app.get('/api/admin/election-day/check-in', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const identifier = String(request.query.identifier || '').trim();
  if (!identifier) return response.status(400).json({ error: 'Enter a voter number or name.' });
  const searchTerm = `%${identifier.toLowerCase()}%`;
  const voter = database.prepare(`
    SELECT v.id,
      COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber,
      v.first_name AS firstName,
      v.middle_name AS middleName,
      v.last_name AS lastName,
      v.district,
      v.ward,
      COALESCE(v.electoral_area, v.ward) AS electoralArea,
      v.polling_station_code AS pollingStationCode,
      v.official_id_card_number AS officialIdCardNumber,
      v.is_active AS isActive,
      v.is_eligible AS isEligible,
      COALESCE(ed.election_status, ed.voting_status, 'NOT_CHECKED_IN') AS electionStatus
    FROM voters v
    LEFT JOIN election_day_voters ed ON ed.voter_id = v.id
    WHERE v.is_active = 1 AND v.is_eligible = 1
      AND (
        LOWER(COALESCE(v.voter_registration_number, '')) LIKE LOWER(?)
        OR LOWER(TRIM(v.first_name || ' ' || COALESCE(v.middle_name || ' ', '') || v.last_name)) LIKE LOWER(?)
      )
    ORDER BY v.id DESC LIMIT 1
  `).get(searchTerm, searchTerm);
  if (!voter) return response.status(404).json({ error: 'No eligible voter matched that search.' });
  const assigned = voter.pollingStationCode || resolveAssignedPollingStation(voter);
  const record = database.prepare('SELECT election_status, voting_status, checked_in_at, updated_at FROM election_day_voters WHERE voter_id = ?').get(voter.id) || {};
  const electionStatus = getElectionDayStatus(record);
  const registrationStatus = getPermanentVoterStatus(voter);
  const stationMatch = !assigned || assigned.toUpperCase() === String(request.query.pollingStationCode || '').toUpperCase() || !String(request.query.pollingStationCode || '').trim();
  if (['CHECKED_IN', 'VOTED'].includes(electionStatus)) {
    return response.json({
      warning: true,
      electionStatus,
      registrationStatus,
      processedAt: record.updated_at || record.checked_in_at || new Date().toISOString(),
      assignedPollingStation: assigned,
      expectedPollingStation: assigned,
      stationMatch,
      voter: {
        id: voter.id,
        voterRegistrationNumber: voter.voterRegistrationNumber,
        firstName: voter.firstName,
        middleName: voter.middleName,
        lastName: voter.lastName,
        district: voter.district,
        ward: voter.ward,
        electoralArea: voter.electoralArea,
        pollingStationCode: assigned,
        officialIdCardNumber: voter.officialIdCardNumber
      },
      message: electionStatus === 'VOTED' ? 'This voter has already been processed and cannot be processed again.' : 'This voter has already checked in and cannot be processed again.'
    });
  }
  response.json({
    voter: {
      id: voter.id,
      voterRegistrationNumber: voter.voterRegistrationNumber,
      firstName: voter.firstName,
      middleName: voter.middleName,
      lastName: voter.lastName,
      district: voter.district,
      ward: voter.ward,
      electoralArea: voter.electoralArea,
      pollingStationCode: assigned,
      officialIdCardNumber: voter.officialIdCardNumber
    },
    registrationStatus,
    electionStatus,
    assignedPollingStation: assigned,
    expectedPollingStation: assigned,
    stationMatch,
    message: stationMatch ? 'Voter is assigned to the correct polling station.' : 'Voter is assigned to a different polling station.'
  });
});
app.post('/api/admin/election-day/voters/:id/check-in', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const voterId = Number(request.params.id);
  const providedStation = String(request.body?.pollingStationCode || '').trim();
  const voter = database.prepare(`SELECT id, voter_registration_number, first_name, last_name, district, ward, electoral_area, polling_station_code, is_active, is_eligible FROM voters WHERE id = ? AND is_active = 1 AND is_eligible = 1`).get(voterId);
  if (!voter) return response.status(404).json({ error: 'Eligible voter not found.' });
  const assignment = validateVoterPollingAssignment(voterId, providedStation);
  if (!assignment.allowed) return response.status(409).json({ error: assignment.error, assignedPollingStation: assignment.expectedPollingStation || null, voter: { id: voter.id, voterRegistrationNumber: voter.voter_registration_number, firstName: voter.first_name, lastName: voter.last_name, district: voter.district, ward: voter.ward, electoralArea: voter.electoral_area || voter.ward } });
  const record = database.prepare('SELECT election_status, voting_status FROM election_day_voters WHERE voter_id = ?').get(voterId) || {};
  const currentStatus = getElectionDayStatus(record);
  if (['CHECKED_IN', 'VOTED', 'CHALLENGED', 'REFERRED'].includes(currentStatus)) {
    return response.status(409).json({ error: `This voter is already in election status ${currentStatus}.`, electionStatus: currentStatus });
  }
  const now = new Date().toISOString();
  const nextStatus = 'CHECKED_IN';
  database.prepare(`INSERT INTO election_day_voters (voter_id, election_status, voting_status, checked_in_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(voter_id) DO UPDATE SET election_status = excluded.election_status, voting_status = excluded.voting_status, checked_in_at = COALESCE(checked_in_at, excluded.checked_in_at), updated_at = excluded.updated_at`).run(voterId, nextStatus, nextStatus, now, now);
  logAuditEvent('ELECTION_DAY_CHECK_IN', { recordType: 'VOTER', recordId: String(voterId), applicationNumber: null, actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, details: { voterRegistrationNumber: voter.voter_registration_number, voterName: `${voter.first_name} ${voter.last_name}`, electionStatus: nextStatus, assignedPollingStation: assignment.expectedPollingStation } });
  response.json({ message: `${voter.voter_registration_number || 'Voter'} checked in successfully at ${assignment.expectedPollingStation}.`, electionStatus: nextStatus, registrationStatus: 'ELIGIBLE', assignedPollingStation: assignment.expectedPollingStation, voter: { id: voter.id, voterRegistrationNumber: voter.voter_registration_number, firstName: voter.first_name, lastName: voter.last_name, district: voter.district, ward: voter.ward, electoralArea: voter.electoral_area || voter.ward, pollingStationCode: assignment.expectedPollingStation } });
});
app.get('/api/admin/election-day/voters', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const items = database.prepare(`
    SELECT v.id,
      COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber,
      TRIM(v.first_name || ' ' || COALESCE(v.middle_name || ' ', '') || v.last_name) AS fullName,
      v.first_name AS firstName,
      v.last_name AS lastName,
      v.district,
      v.ward,
      v.official_id_card_number AS officialIdCardNumber,
      CASE WHEN v.is_active = 1 AND v.is_eligible = 1 THEN 'ELIGIBLE' ELSE 'REGISTERED' END AS permanentStatus,
      COALESCE(ed.election_status, ed.voting_status, 'NOT_CHECKED_IN') AS electionStatus
    FROM voters v
    LEFT JOIN election_day_voters ed ON ed.voter_id = v.id
    WHERE v.is_active = 1 AND v.is_eligible = 1
    ORDER BY v.id DESC
  `).all();
  response.json({ items });
});
app.post('/api/admin/election-day/voters/:id/mark-voted', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const voterId = Number(request.params.id);
  const providedStation = String(request.body?.pollingStationCode || '').trim();
  const voter = database.prepare(`SELECT id, voter_registration_number, first_name, last_name, district, ward, electoral_area, polling_station_code, is_active, is_eligible FROM voters WHERE id = ? AND is_active = 1 AND is_eligible = 1`).get(voterId);
  if (!voter) return response.status(404).json({ error: 'Eligible voter not found.' });
  const assignment = validateVoterPollingAssignment(voterId, providedStation);
  if (!assignment.allowed) return response.status(409).json({ error: assignment.error, assignedPollingStation: assignment.expectedPollingStation || null, voter: { id: voter.id, voterRegistrationNumber: voter.voter_registration_number, firstName: voter.first_name, lastName: voter.last_name, district: voter.district, ward: voter.ward, electoralArea: voter.electoral_area || voter.ward } });
  const record = database.prepare('SELECT election_status, voting_status FROM election_day_voters WHERE voter_id = ?').get(voterId) || {};
  const currentStatus = getElectionDayStatus(record);
  if (currentStatus === 'VOTED') return response.status(409).json({ error: 'This voter has already been recorded as voted.', electionStatus: currentStatus });
  if (currentStatus !== 'CHECKED_IN') return response.status(409).json({ error: 'This voter must be checked in before being marked as voted.', electionStatus: currentStatus });
  const status = 'VOTED';
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO election_day_voters (voter_id, election_status, voting_status, checked_in_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(voter_id) DO UPDATE SET election_status = excluded.election_status, voting_status = excluded.voting_status, checked_in_at = COALESCE(checked_in_at, excluded.checked_in_at), updated_at = excluded.updated_at`).run(voterId, status, status, record.checked_in_at || now, now);
  logAuditEvent('ELECTION_DAY_VOTE_MARKED', { recordType: 'VOTER', recordId: String(voterId), applicationNumber: null, actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, details: { voterRegistrationNumber: voter.voter_registration_number, voterName: `${voter.first_name} ${voter.last_name}`, electionStatus: status, assignedPollingStation: assignment.expectedPollingStation } });
  response.json({ message: `${voter.voter_registration_number || 'Voter'} completed the voting process at ${assignment.expectedPollingStation}. Candidate choice is not stored in CivicPass.`, voterId, electionStatus: status, registrationStatus: 'ELIGIBLE', assignedPollingStation: assignment.expectedPollingStation, voter: { id: voter.id, voterRegistrationNumber: voter.voter_registration_number, firstName: voter.first_name, lastName: voter.last_name, district: voter.district, ward: voter.ward, electoralArea: voter.electoral_area || voter.ward, pollingStationCode: assignment.expectedPollingStation }, candidateChoice: null });
});

// Export voter list endpoint
app.post('/api/admin/export-voters', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  
  const { fields = [], format = 'csv', filters = {} } = request.body || {};
  
  // Validate format
  if (!['csv', 'excel', 'pdf'].includes(format)) return response.status(400).json({ error: 'Invalid export format.' });
  
  // Build query to get voter records based on filters
  const query = String(filters.q || '').trim();
  const scope = String(filters.scope || 'all');
  const authorized = filters.authorized === 'true' || filters.authorized === true;
  const dateFrom = String(filters.from || ''), dateTo = String(filters.to || '');
  
  // Validate date ranges
  if ((dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) || (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    return response.status(400).json({ error: 'Enter a valid registration date range.' });
  }
  
  // Check if sensitive search is authorized
  if ((scope === 'phone' || scope === 'nationalId') && !authorized) {
    return response.status(403).json({ error: 'Authorization is required for sensitive data export.' });
  }
  
  // Map field names to database columns
  const fieldMap = {
    registrationNumber: 'COALESCE(v.voter_registration_number, \'VR-\' || printf(\'%06d\', v.id))',
    fullName: 'TRIM(v.first_name || \' \' || COALESCE(v.middle_name || \' \', \'\') || v.last_name)',
    district: 'v.district',
    ward: 'v.ward',
    registrationCentre: 'c.name',
    phone: 'v.phone',
    identificationNumber: 'd.document_number'
  };
  
  // Validate requested fields
  const validFields = Object.keys(fieldMap);
  const exportFields = fields.filter(f => validFields.includes(f));
  
  if (exportFields.length === 0) {
    return response.status(400).json({ error: 'At least one field must be selected for export.' });
  }
  
  // Check for sensitive fields
  const sensitiveFields = ['phone', 'identificationNumber'];
  const hasSensitiveFields = exportFields.some(f => sensitiveFields.includes(f));
  
  // Build SELECT clause
  const selectClauses = exportFields.map(f => `${fieldMap[f]} AS ${f}`).join(', ');
  
  // Build WHERE clause
  const pattern = `%${query}%`;
  const district = String(filters.district || '');
  const ward = String(filters.ward || '');
  const centre = String(filters.centre || '');
  const status = String(filters.status || '');
  
  const searchColumns = { all: `(v.first_name || ' ' || v.last_name LIKE ? OR v.voter_registration_number LIKE ? OR c.name LIKE ?)`, name: `v.first_name || ' ' || v.last_name LIKE ?`, registration: `v.voter_registration_number LIKE ?`, centre: `c.name LIKE ?`, phone: `v.phone LIKE ?`, nationalId: `d.document_number LIKE ?` };
  const searchValues = scope === 'all' ? [pattern, pattern, pattern] : scope === 'nationalId' ? [pattern] : [pattern];
  
  const clauses = [`(? = '' OR ${searchColumns[scope] || searchColumns.all})`, `(? = '' OR v.district = ?)`, `(? = '' OR v.ward = ?)`, `(? = '' OR c.name = ?)`, `(? = '' OR a.status = ? OR (? = 'Active' AND a.status = 'Approved'))`, `(? = '' OR date(a.submitted_at) >= date(?))`, `(? = '' OR date(a.submitted_at) <= date(?))`];
  const whereValues = [query, ...searchValues, district, district, ward, ward, centre, centre, status, status, status, dateFrom, dateFrom, dateTo, dateTo];
  
  clauses.push('v.is_active = 1 AND a.status = \'Approved\'');
  
  const from = `FROM voters v JOIN voter_applications a ON a.id = v.application_id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id ${exportFields.includes('identificationNumber') ? 'LEFT JOIN identity_documents d ON d.voter_id = v.id' : ''}`;
  const where = `WHERE ${clauses.join(' AND ')}`;
  
  const selectQuery = `SELECT ${selectClauses} ${from} ${where} ORDER BY v.id DESC LIMIT 50000`;
  
  try {
    const voters = database.prepare(selectQuery).all(...whereValues);
    
    // Enhanced export audit logging
    const sensitiveFieldsUsed = hasSensitiveFields ? sensitiveFields.filter(f => exportFields.includes(f)).join(', ') : null;
    const exportDetails = {
      exportedFields: exportFields,
      format: format,
      recordsExported: voters.length,
      filtersApplied: {
        district: filters.district || 'None',
        ward: filters.ward || 'None',
        centre: filters.centre || 'None',
        status: filters.status || 'Approved',
        dateRange: dateFrom || dateTo ? `${dateFrom} to ${dateTo}` : 'None'
      },
      sensitiveFieldsIncluded: sensitiveFieldsUsed
    };
    
    logAuditEvent('VOTER_EXPORT', {
      recordType: 'EXPORT',
      actor: 'Central administrator',
      actorRole: 'admin',
      details: exportDetails,
      reason: sensitiveFieldsUsed ? `Export with sensitive fields: ${sensitiveFieldsUsed}` : null
    });
    
    // Generate file content based on format
    let content, contentType, filename;
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'csv') {
      // Generate CSV
      const headers = exportFields.join(',');
      const rows = voters.map(voter => 
        exportFields.map(field => {
          const value = voter[field] || '';
          // Escape CSV values that contain commas or quotes
          if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) {
            return `"${String(value).replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      );
      content = [headers, ...rows].join('\n');
      contentType = 'text/csv; charset=utf-8';
      filename = `voter-export-${timestamp}.csv`;
    } else if (format === 'excel') {
      // For Excel, send CSV with Excel MIME type for now (better approach would use xlsx library)
      // CSV can be opened in Excel with .xlsx extension
      const headers = exportFields.join('\t');
      const rows = voters.map(voter => 
        exportFields.map(field => voter[field] || '').join('\t')
      );
      content = [headers, ...rows].join('\n');
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `voter-export-${timestamp}.xlsx`;
    } else if (format === 'pdf') {
      // For PDF, generate a simple HTML table and convert to PDF-like format
      // A complete solution would use a PDF library like pdf-lib or pdfkit
      // For now, send as text/plain and indicate it's a PDF export
      const headers = exportFields.join(' | ');
      const rows = voters.map(voter => 
        exportFields.map(field => voter[field] || '').join(' | ')
      );
      const title = 'VOTER REGISTRATION EXPORT\n';
      const timestamp_text = `Export Date: ${new Date().toLocaleString()}\n`;
      const separator = '='.repeat(80) + '\n';
      content = title + timestamp_text + separator + headers + '\n' + separator + rows.join('\n');
      contentType = 'application/pdf';
      filename = `voter-export-${timestamp}.pdf`;
    }
    
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', Buffer.byteLength(content));
    response.send(content);
  } catch (error) {
    console.error('Export error:', error);
    response.status(500).json({ error: 'Export generation failed', detail: error.message });
  }
});

app.post('/api/auth/login', (request, response) => {
  const { name, password } = request.body || {};
  const user = database.prepare('SELECT id, name, email, password_hash AS passwordHash, role, status FROM users WHERE lower(trim(name)) = lower(trim(?))').get(String(name || ''));
  if (!user) return response.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'active') return response.status(403).json({ error: 'This account is suspended. Contact an administrator.' });
  const [salt, stored] = user.passwordHash.split(':');
  const valid = timingSafeEqual(Buffer.from(stored, 'hex'), scryptSync(password || '', salt, 64));
  if (!valid) return response.status(401).json({ error: 'Invalid credentials' });
  response.json({ userId: user.id, name: user.name, email: user.email, role: user.role });
});

app.get('/api/user/applications', (request, response) => {
  const userId = Number(request.get('x-user-id'));
  if (!userId || request.get('x-user-role') !== 'voter') return response.status(403).json({ error: 'User access is required.' });
  const rows = database.prepare(`SELECT a.application_number AS applicationNumber, a.status, a.lifecycle_status AS lifecycleStatus, a.submitted_at AS submittedAt, a.reviewed_at AS reviewedAt, v.first_name AS firstName, v.last_name AS lastName, v.district, v.ward FROM voter_applications a JOIN voters v ON v.application_id = a.id WHERE a.user_id = ? ORDER BY datetime(a.submitted_at) DESC`).all(userId);
  response.json(rows);
});

app.get('/api/user/notifications', (request, response) => {
  const userId = Number(request.get('x-user-id'));
  if (!userId || request.get('x-user-role') !== 'voter') return response.status(403).json({ error: 'User access is required.' });
  const notifications = database.prepare(`SELECT l.id, l.action, l.application_number AS applicationNumber, l.reason, l.created_at AS createdAt FROM audit_logs l JOIN voter_applications a ON a.application_number = l.application_number WHERE a.user_id = ? AND l.action IN ('APPLICATION_OFFICER_CORRECTIONS', 'APPLICATION_OFFICER_FLAGGED', 'APPLICATION_OFFICER_REJECTED', 'APPLICATION_APPROVED') ORDER BY l.id DESC LIMIT 50`).all(userId);
  response.json(notifications);
});

app.patch('/api/user/applications/:applicationNumber', (request, response) => {
  const userId = Number(request.get('x-user-id'));
  if (!userId || request.get('x-user-role') !== 'voter') return response.status(403).json({ error: 'User access is required.' });
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const owned = database.prepare(`SELECT a.id, a.status, app.payload FROM voter_applications a LEFT JOIN applications app ON app.application_number = a.application_number WHERE a.application_number = ? AND a.user_id = ?`).get(applicationNumber, userId);
  if (!owned) return response.status(404).json({ error: 'Application not found.' });
  if (['Approved', 'Rejected'].includes(owned.status)) return response.status(409).json({ error: 'This application can no longer be edited.' });
  const payload = { ...(owned.payload ? JSON.parse(owned.payload) : {}), ...(request.body || {}), applicationNumber };
  const nextStatus = owned.status === 'Corrections Required' ? 'Pending Review' : owned.status;
  updateApplication.run(JSON.stringify(payload), nextStatus.toUpperCase().replaceAll(' ', '_'), applicationNumber);
  if (nextStatus !== owned.status) database.prepare('UPDATE voter_applications SET status = ?, reviewed_at = NULL WHERE id = ?').run(nextStatus, owned.id);
  if (owned.status === 'Corrections Required') setApplicationLifecycle(applicationNumber, 'CORRECTION_SUBMITTED', { actor: `User ${userId}`, actorRole: 'voter' });
  const input = request.body || {};
  database.prepare(`UPDATE voters SET first_name = COALESCE(?, first_name), middle_name = COALESCE(?, middle_name), last_name = COALESCE(?, last_name), date_of_birth = COALESCE(?, date_of_birth), sex = COALESCE(?, sex), nationality = COALESCE(?, nationality), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address), region = COALESCE(?, region), district = COALESCE(?, district), ward = COALESCE(?, ward) WHERE application_id = ?`).run(input.firstName ?? null, input.middleName ?? null, input.lastName ?? null, input.dob ?? null, input.sex ?? null, input.nationality ?? null, input.phone ?? null, input.email ?? null, input.address ?? null, input.region ?? null, input.district ?? null, input.ward ?? null, owned.id);
  logAuditEvent('APPLICATION_UPDATED_BY_USER', { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: `User ${userId}`, actorRole: 'voter', details: { fieldsUpdated: Object.keys(input) } });
  response.json({ applicationNumber, status: nextStatus });
});

app.get('/api/officer/applications', (request, response) => {
  if (request.get('x-user-role') !== 'officer' && request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Officer access is required.' });
  const officerUserId = Number(request.get('x-user-id')) || null;
  const scope = request.get('x-user-role') === 'officer' ? ' AND (a.assigned_officer_id = (SELECT id FROM officers WHERE user_id = ?) OR a.created_by_user_id = ?)' : '';
  const values = request.get('x-user-role') === 'officer' ? [officerUserId, officerUserId] : [];
  const rows = database.prepare(`SELECT a.application_number AS applicationNumber, a.status, a.submitted_at AS submittedAt, a.reviewed_at AS reviewedAt, a.assigned_officer_id AS assignedOfficerId, a.created_by_user_id AS createdByUserId, v.first_name AS firstName, v.last_name AS lastName, v.district, v.ward, d.document_type AS documentType, d.document_number AS documentNumber FROM voter_applications a JOIN voters v ON v.application_id = a.id LEFT JOIN identity_documents d ON d.voter_id = v.id WHERE 1 = 1${scope} ORDER BY datetime(a.submitted_at) DESC`).all(...values);
  response.json(rows);
});

app.get('/api/officer/applications/:applicationNumber', (request, response) => {
  if (request.get('x-user-role') !== 'officer' && request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Officer access is required.' });
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const row = database.prepare(`SELECT a.id, a.application_number AS applicationNumber, a.status, a.submitted_at AS submittedAt, a.reviewed_at AS reviewedAt, a.user_id AS voterUserId, a.created_by_user_id AS createdByUserId, a.assigned_officer_id AS assignedOfficerId, v.first_name AS firstName, v.middle_name AS middleName, v.last_name AS lastName, v.date_of_birth AS dateOfBirth, v.sex, v.nationality, v.phone, v.email, v.address, v.region, v.district, v.ward, c.name AS registrationCentre, d.document_type AS documentType, d.document_number AS documentNumber FROM voter_applications a JOIN voters v ON v.application_id = a.id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id LEFT JOIN identity_documents d ON d.voter_id = v.id WHERE a.application_number = ?`).get(applicationNumber);
  if (!row) return response.status(404).json({ error: 'Application not found.' });
  const history = database.prepare('SELECT action, actor, actor_role AS actorRole, reason, created_at AS createdAt FROM audit_logs WHERE application_number = ? ORDER BY id DESC').all(applicationNumber);
  response.json({ ...row, history });
});

app.get('/api/admin/users', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  response.json(database.prepare('SELECT id, name, email, phone, role, status, created_at AS createdAt FROM users ORDER BY id').all());
});

app.patch('/api/admin/users/:id/role', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const role = String(request.body?.role || '');
  if (!['admin', 'officer', 'voter'].includes(role)) return response.status(400).json({ error: 'Invalid role.' });
  const user = database.prepare('SELECT id, name, role FROM users WHERE id = ?').get(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found.' });
  database.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, request.params.id);
  logAuditEvent('USER_ROLE_UPDATED', { recordType: 'USER', recordId: String(user.id), actor: 'Central administrator', actorRole: 'admin', previousValue: user.role, newValue: role, details: { userName: user.name } });
  response.json({ id: user.id, role });
});

app.patch('/api/admin/users/:id/status', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const status = String(request.body?.status || '');
  if (!['active', 'suspended'].includes(status)) return response.status(400).json({ error: 'Invalid account status.' });
  const user = database.prepare('SELECT id, name, role, status FROM users WHERE id = ?').get(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found.' });
  if (user.id === Number(request.get('x-user-id')) && status === 'suspended') return response.status(400).json({ error: 'You cannot suspend your own admin account.' });
  database.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, user.id);
  logAuditEvent('USER_STATUS_UPDATED', { recordType: 'USER', recordId: String(user.id), actor: 'Central administrator', actorRole: 'admin', previousValue: user.status, newValue: status, details: { userName: user.name, userRole: user.role } });
  response.json({ id: user.id, status });
});

app.get('/api/admin/applications/:applicationNumber/history', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const application = database.prepare('SELECT application_number AS applicationNumber, status, submitted_at AS submittedAt, reviewed_at AS reviewedAt FROM voter_applications WHERE application_number = ?').get(applicationNumber);
  if (!application) return response.status(404).json({ error: 'Application not found.' });
  const history = database.prepare('SELECT action, actor, actor_role AS actorRole, reason, previous_value AS previousValue, new_value AS newValue, created_at AS createdAt FROM audit_logs WHERE application_number = ? ORDER BY id DESC').all(applicationNumber);
  response.json({ application, history });
});

app.patch('/api/admin/applications/:applicationNumber/assign', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const officerId = Number(request.body?.officerId);
  const application = database.prepare('SELECT id FROM voter_applications WHERE application_number = ?').get(applicationNumber);
  const officer = database.prepare("SELECT id, user_id AS userId FROM officers WHERE id = ? AND status = 'active'").get(officerId);
  if (!application) return response.status(404).json({ error: 'Application not found.' });
  if (!officer) return response.status(400).json({ error: 'Choose an active officer.' });
  const assignedAt = new Date().toISOString();
  database.prepare('UPDATE voter_applications SET assigned_officer_id = ? WHERE id = ?').run(officer.id, application.id);
  database.prepare("UPDATE application_assignments SET status = 'inactive' WHERE application_id = ? AND status = 'active'").run(application.id);
  createApplicationAssignment.run(application.id, officer.id, Number(request.get('x-user-id')) || null, assignedAt);
  logAuditEvent('APPLICATION_ASSIGNED', { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: 'Central administrator', actorRole: 'admin', actorUserId: Number(request.get('x-user-id')) || null, details: { officerId: officer.id, officerUserId: officer.userId, assignedAt } });
  response.json({ applicationNumber, officerId: officer.id, assignedAt });
});

app.post('/api/applications/:applicationNumber/officer-review', (request, response) => {
  if (request.get('x-user-role') !== 'officer') return response.status(403).json({ error: 'Officer access is required.' });
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const { decision, reason } = request.body || {};
  const officerUserId = Number(request.get('x-user-id')) || null;
  const officer = database.prepare('SELECT id FROM officers WHERE user_id = ? AND status = \'active\'').get(officerUserId);
  if (!officer) return response.status(403).json({ error: 'An active officer account is required.' });
  const statuses = { verified: 'Officer Verified', flagged: 'Flagged', corrections: 'Corrections Required', rejected: 'Rejected' };
  if (!statuses[decision]) return response.status(400).json({ error: 'Choose a valid officer decision.' });
  const app = findApplication.get(applicationNumber);
  if (!app) return response.status(404).json({ error: 'Application not found' });
  const normalizedApplication = database.prepare('SELECT id, assigned_officer_id AS assignedOfficerId FROM voter_applications WHERE application_number = ?').get(applicationNumber);
  if (!normalizedApplication) return response.status(404).json({ error: 'Normalized application not found' });
  if (normalizedApplication.assignedOfficerId && normalizedApplication.assignedOfficerId !== officer.id) return response.status(403).json({ error: 'This application is assigned to another officer.' });
  if (!normalizedApplication.assignedOfficerId) {
    database.prepare('UPDATE voter_applications SET assigned_officer_id = ? WHERE id = ?').run(officer.id, normalizedApplication.id);
    createApplicationAssignment.run(normalizedApplication.id, officer.id, null, new Date().toISOString());
  }
  const reviewedAt = new Date().toISOString();
  updateApplication.run(app.payload, statuses[decision].toUpperCase().replaceAll(' ', '_'), applicationNumber);
  database.prepare('UPDATE voter_applications SET status = ?, reviewed_at = ? WHERE application_number = ?').run(statuses[decision], reviewedAt, applicationNumber);
  createApplicationReview.run(normalizedApplication.id, officer.id, decision, reason || null, reviewedAt);
  setApplicationLifecycle(applicationNumber, decision === 'flagged' || decision === 'corrections' ? 'FLAGGED' : decision === 'rejected' ? 'REJECTED' : 'UNDER_REVIEW', { actor: 'Registration Officer', actorRole: 'officer', reason });
  logAuditEvent('APPLICATION_REVIEWED', { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: 'Registration Officer', actorRole: 'officer', actorUserId: officerUserId, reason: reason || null, details: { decision, resultingStatus: statuses[decision], officerId: officer.id } });
  logAuditEvent(`APPLICATION_OFFICER_${decision.toUpperCase()}`, { recordType: 'APPLICATION', recordId: applicationNumber, applicationNumber, actor: 'Registration Officer', actorRole: 'officer', reason: reason || null, details: { decision } });
  response.json({ applicationNumber, status: statuses[decision] });
});

// Application workflow endpoints
app.post('/api/applications/:applicationNumber/validate', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const { payload } = request.body || {};
  
  // Validate required fields
  const errors = [];
  if (!payload.firstName || payload.firstName.trim().length === 0) errors.push('First name is required');
  if (!payload.lastName || payload.lastName.trim().length === 0) errors.push('Last name is required');
  if (!payload.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth)) errors.push('Valid date of birth is required (YYYY-MM-DD)');
  if (!payload.nationality || payload.nationality.trim().length === 0) errors.push('Nationality is required');
  if (payload.district && payload.district.trim().length === 0) errors.push('District information is invalid');
  
  if (errors.length > 0) {
    logAuditEvent('APPLICATION_VALIDATION_FAILED', {
      recordType: 'APPLICATION',
      recordId: applicationNumber,
      applicationNumber,
      actor: 'System',
      actorRole: 'system',
      details: { errors }
    });
    return response.status(400).json({ status: 'VALIDATION_FAILED', errors });
  }
  
  // Update application status to validation passed
  const app = findApplication.get(applicationNumber);
  if (app) {
    updateApplication.run(JSON.stringify({ ...JSON.parse(app.payload), ...payload }), 'VALIDATION_PASSED', applicationNumber);
  }
  
  logAuditEvent('APPLICATION_VALIDATED', {
    recordType: 'APPLICATION',
    recordId: applicationNumber,
    applicationNumber,
    actor: 'System',
    actorRole: 'system',
    details: { validationPassed: true }
  });
  
  response.json({ status: 'VALIDATION_PASSED', applicationNumber });
});

app.post('/api/applications/:applicationNumber/duplicate-check', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const app = findApplication.get(applicationNumber);
  if (!app) return response.status(404).json({ error: 'Application not found' });
  
  const payload = JSON.parse(app.payload);
  
  // Check for duplicate voters by name and date of birth
  const duplicate = database.prepare(`
    SELECT v.id, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber, 
           v.first_name, v.last_name, v.date_of_birth, a.application_number
    FROM voters v
    JOIN voter_applications a ON a.id = v.application_id
    WHERE LOWER(v.first_name) = LOWER(?) AND LOWER(v.last_name) = LOWER(?) 
      AND v.date_of_birth = ?
      AND a.status IN ('Approved', 'Pending Review')
    LIMIT 1
  `).get(payload.firstName, payload.lastName, payload.dateOfBirth);
  
  if (duplicate) {
    updateApplication.run(JSON.stringify(payload), 'DUPLICATE_FOUND', applicationNumber);
    logAuditEvent('APPLICATION_DUPLICATE_FOUND', {
      recordType: 'APPLICATION',
      recordId: applicationNumber,
      applicationNumber,
      actor: 'System',
      actorRole: 'system',
      details: { possibleDuplicate: duplicate.voterRegistrationNumber, duplicateApplication: duplicate.application_number }
    });
    return response.json({ status: 'DUPLICATE_FOUND', isDuplicate: true, possibleMatch: { voterRegistrationNumber: duplicate.voterRegistrationNumber, name: `${duplicate.first_name} ${duplicate.last_name}`, dateOfBirth: duplicate.date_of_birth } });
  }
  
  updateApplication.run(JSON.stringify(payload), 'PENDING_REVIEW', applicationNumber);
  logAuditEvent('APPLICATION_DUPLICATE_CHECK_CLEAR', {
    recordType: 'APPLICATION',
    recordId: applicationNumber,
    applicationNumber,
    actor: 'System',
    actorRole: 'system',
    details: { duplicateCheckPassed: true }
  });
  
  response.json({ status: 'PENDING_REVIEW', isDuplicate: false });
});

app.post('/api/applications/:applicationNumber/submit-for-review', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const app = findApplication.get(applicationNumber);
  if (!app) return response.status(404).json({ error: 'Application not found' });
  
  updateApplication.run(app.payload, 'PENDING_REVIEW', applicationNumber);
  
  database.prepare('UPDATE voter_applications SET status = ? WHERE application_number = ?').run('Pending Review', applicationNumber);
  setApplicationLifecycle(applicationNumber, 'UNDER_REVIEW', { actor: request.get('x-user-role') === 'admin' ? 'Central administrator' : 'Officer', actorRole: request.get('x-user-role') || 'officer' });
  
  logAuditEvent('APPLICATION_SUBMITTED_FOR_REVIEW', {
    recordType: 'APPLICATION',
    recordId: applicationNumber,
    applicationNumber,
    actor: request.get('x-user-role') === 'admin' ? 'Central administrator' : 'Officer',
    actorRole: request.get('x-user-role') || 'officer',
    details: { submittedAt: new Date().toISOString() }
  });
  
  response.json({ status: 'PENDING_REVIEW', applicationNumber });
});

app.post('/api/applications/:applicationNumber/request-corrections', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const { reason } = request.body || {};
  const app = findApplication.get(applicationNumber);
  if (!app) return response.status(404).json({ error: 'Application not found' });
  
  updateApplication.run(app.payload, 'CORRECTIONS_REQUIRED', applicationNumber);
  
  database.prepare('UPDATE voter_applications SET status = ? WHERE application_number = ?').run('Corrections Required', applicationNumber);
  setApplicationLifecycle(applicationNumber, 'FLAGGED', { actor: request.get('x-user-role') === 'admin' ? 'Central administrator' : 'Officer', actorRole: request.get('x-user-role') || 'officer', reason });
  
  logAuditEvent('APPLICATION_CORRECTIONS_REQUESTED', {
    recordType: 'APPLICATION',
    recordId: applicationNumber,
    applicationNumber,
    actor: request.get('x-user-role') === 'admin' ? 'Central administrator' : 'Officer',
    actorRole: request.get('x-user-role') || 'officer',
    reason: reason || 'No reason provided',
    details: { requestedAt: new Date().toISOString() }
  });
  
  response.json({ status: 'CORRECTIONS_REQUIRED', reason, applicationNumber });
});

app.post('/api/applications/:applicationNumber/approve', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const app = findApplication.get(applicationNumber);
  if (!app) return response.status(404).json({ error: 'Application not found' });
  
  const payload = JSON.parse(app.payload);
  updateApplication.run(JSON.stringify(payload), 'APPROVED', applicationNumber);
  
  const reviewedAt = new Date().toISOString();
  database.prepare('UPDATE voter_applications SET status = ?, reviewed_at = ? WHERE application_number = ?').run('Approved', reviewedAt, applicationNumber);
  setApplicationLifecycle(applicationNumber, 'APPROVED', { actor: 'Central administrator', actorRole: 'admin' });
  database.prepare("UPDATE voters SET is_active = 1, is_eligible = 1, voter_registration_number = COALESCE(voter_registration_number, 'VR-' || printf('%06d', id)) WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)").run(applicationNumber);
  setApplicationLifecycle(applicationNumber, 'REGISTERED', { actor: 'System', actorRole: 'system' });
  setApplicationLifecycle(applicationNumber, 'VOTER_RECORD_CREATED', { actor: 'System', actorRole: 'system' });
  setApplicationLifecycle(applicationNumber, 'ELIGIBLE', { actor: 'System', actorRole: 'system' });
  
  logAuditEvent('APPLICATION_APPROVED', {
    recordType: 'APPLICATION',
    recordId: applicationNumber,
    applicationNumber,
    actor: 'Central administrator',
    actorRole: 'admin',
    details: { approvedAt: reviewedAt, applicantName: `${payload.firstName} ${payload.lastName}` }
  });
  const voterRecord = database.prepare('SELECT id, voter_registration_number AS voterRegistrationNumber FROM voters WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)').get(applicationNumber);
  if (voterRecord) {
    const existingCard = database.prepare('SELECT card_number AS cardNumber FROM voter_id_cards WHERE voter_id = ?').get(voterRecord.id);
    if (!existingCard) {
      const cardNumber = `ID-${new Date().getFullYear()}-${String(voterRecord.id).padStart(6, '0')}`;
      createVoterIdCard.run(voterRecord.id, database.prepare('SELECT id FROM voter_applications WHERE application_number = ?').get(applicationNumber).id, cardNumber, reviewedAt, JSON.stringify(payload.photoData || null), `QR-${cardNumber}`);
      database.prepare('UPDATE voters SET official_id_card_number = ?, is_eligible = 1 WHERE id = ?').run(cardNumber, voterRecord.id);
      setApplicationLifecycle(applicationNumber, 'ID_CARD_ISSUED', { actor: 'System', actorRole: 'system', reason: `Official voter ID card ${cardNumber} issued.` });
      logAuditEvent('VOTER_ID_CARD_ISSUED', {
        recordType: 'VOTER_CARD',
        recordId: cardNumber,
        applicationNumber,
        actor: 'System',
        actorRole: 'system',
        details: { cardNumber, issuedAt: reviewedAt }
      });
    }
    logAuditEvent('VOTER_RECORD_CREATED', {
      recordType: 'VOTER',
      recordId: voterRecord.voterRegistrationNumber || String(voterRecord.id),
      applicationNumber,
      actor: 'System',
      actorRole: 'system',
      details: { voterRegistrationNumber: voterRecord.voterRegistrationNumber, createdAt: reviewedAt }
    });
  }
  
  response.json({ status: 'APPROVED', applicationNumber, registeredAt: reviewedAt, voterRegistrationNumber: voterRecord?.voterRegistrationNumber || null });
});

app.listen(port, () => console.log(`CivicPass running at http://localhost:${port}`));
