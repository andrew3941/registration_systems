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
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin', 'officer', 'voter')), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS registration_centres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, region TEXT NOT NULL, district TEXT NOT NULL, ward TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS officers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), centre_id INTEGER REFERENCES registration_centres(id), status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE IF NOT EXISTS voter_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, application_number TEXT NOT NULL UNIQUE, user_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'Under Verification', submitted_at TEXT NOT NULL, reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS voters (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_registration_number TEXT UNIQUE, application_id INTEGER NOT NULL UNIQUE REFERENCES voter_applications(id), first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL, date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, nationality TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, region TEXT, district TEXT, ward TEXT, registration_centre_id INTEGER REFERENCES registration_centres(id));
  CREATE TABLE IF NOT EXISTS identity_documents (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL REFERENCES voters(id), document_type TEXT NOT NULL, document_number TEXT NOT NULL, document_reference TEXT, UNIQUE(document_type, document_number));
  CREATE TABLE IF NOT EXISTS verification_records (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL REFERENCES voter_applications(id), verification_type TEXT NOT NULL, result TEXT NOT NULL, officer_id INTEGER REFERENCES officers(id), verified_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, record_type TEXT, record_id TEXT, application_number TEXT, actor TEXT NOT NULL, actor_role TEXT, details TEXT, previous_value TEXT, new_value TEXT, reason TEXT, device_info TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS applications (
    application_number TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Under Verification',
    created_at TEXT NOT NULL
  )
`);
try { database.exec('ALTER TABLE audit_logs ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN record_id TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN record_type TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN actor_role TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN details TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN previous_value TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN new_value TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN reason TEXT'); } catch {}
try { database.exec('ALTER TABLE audit_logs ADD COLUMN device_info TEXT'); } catch {}
try { database.exec('ALTER TABLE voters ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0'); } catch {}
database.exec("UPDATE voters SET is_active = 1, voter_registration_number = COALESCE(voter_registration_number, 'VR-' || printf('%06d', id)) WHERE application_id IN (SELECT id FROM voter_applications WHERE status = 'Approved')");

const now = new Date().toISOString();
const seedUser = database.prepare('INSERT OR IGNORE INTO users (phone, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)');
const hashPassword = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
seedUser.run('+233240000001', 'admin@civicpass.local', hashPassword('ChangeMe-Admin-2026'), 'admin', now);
seedUser.run('+233240000002', 'officer@civicpass.local', hashPassword('ChangeMe-Officer-2026'), 'officer', now);
database.prepare('INSERT OR IGNORE INTO registration_centres (id, name, region, district, ward) VALUES (?, ?, ?, ?, ?)').run(1, 'Central Office 04', 'Central', 'Central District', 'Ward 04');
database.prepare('INSERT OR IGNORE INTO officers (user_id, centre_id, status) SELECT id, 1, \'active\' FROM users WHERE role = \'officer\'').run();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

const createApplication = database.prepare(`
  INSERT INTO applications (application_number, payload, status, created_at)
  VALUES (?, ?, ?, ?)
`);
const findApplication = database.prepare('SELECT application_number AS applicationNumber, payload, status, created_at AS createdAt FROM applications WHERE application_number = ?');
const updateApplication = database.prepare('UPDATE applications SET payload = ?, status = ? WHERE application_number = ?');

// Enhanced audit logging with full details
const createDetailedAuditLog = database.prepare(`
  INSERT INTO audit_logs (action, record_type, record_id, application_number, actor, actor_role, details, previous_value, new_value, reason, device_info, created_at) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    deviceInfo = null
  } = options;
  
  createDetailedAuditLog.run(
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

const createNormalizedApplication = database.prepare('INSERT INTO voter_applications (application_number, status, submitted_at) VALUES (?, ?, ?)');
const createVoter = database.prepare('INSERT INTO voters (application_id, first_name, middle_name, last_name, date_of_birth, sex, nationality, phone, email, address, region, district, ward, registration_centre_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const createDocument = database.prepare('INSERT INTO identity_documents (voter_id, document_type, document_number, document_reference) VALUES (?, ?, ?, ?)');
const createVerification = database.prepare('INSERT INTO verification_records (application_id, verification_type, result, verified_at) VALUES (?, ?, ?, ?)');

app.post('/api/applications', (request, response) => {
  const input = request.body || {};
  const applicationNumber = `VR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const createdAt = new Date().toISOString();
  const record = { ...input, applicationNumber, createdAt, status: 'Under Verification' };
  const normalized = { ...record, firstName: input.firstName || '', lastName: input.lastName || '', dateOfBirth: input.dob || '', sex: input.sex || 'Not specified', nationality: input.nationality || 'Not specified' };
  database.exec('BEGIN');
  try {
    const application = createNormalizedApplication.run(applicationNumber, record.status, createdAt);
    const voter = createVoter.run(application.lastInsertRowid, normalized.firstName, normalized.middleName || null, normalized.lastName, normalized.dateOfBirth, normalized.sex, normalized.nationality, normalized.phone || null, normalized.email || null, normalized.address || null, normalized.region || null, normalized.district || null, normalized.ward || null, 1);
    createDocument.run(voter.lastInsertRowid, normalized.documentType || 'Not specified', normalized.documentNumber || 'Not specified', `server-reference://${applicationNumber}/identity-document`);
    ['Identity', 'Eligibility', 'Electoral Area', 'Duplicate Check'].forEach(type => createVerification.run(application.lastInsertRowid, type, 'Passed', createdAt));
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); return response.status(400).json({ error: 'The application could not be saved', detail: error.message }); }
  createApplication.run(applicationNumber, JSON.stringify(record), record.status, createdAt);
  createAuditLog.run('APPLICATION_SUBMITTED', applicationNumber, 'Registration officer', createdAt);
  response.status(201).json(record);
});

app.get('/api/applications/:applicationNumber', (request, response) => {
  const row = findApplication.get(request.params.applicationNumber.toUpperCase());
  if (!row) return response.status(404).json({ error: 'Application not found' });
  response.json({ ...JSON.parse(row.payload), applicationNumber: row.applicationNumber, status: row.status, createdAt: row.createdAt });
});

app.patch('/api/applications/:applicationNumber', (request, response) => {
  const applicationNumber = request.params.applicationNumber.toUpperCase();
  const row = findApplication.get(applicationNumber);
  const record = { ...(row ? JSON.parse(row.payload) : request.body), applicationNumber, status: request.body.status || row?.status || 'Under Verification', reviewedAt: new Date().toISOString() };
  if (row) updateApplication.run(JSON.stringify(record), record.status, applicationNumber);
  else createApplication.run(applicationNumber, JSON.stringify(record), record.status, record.createdAt || new Date().toISOString());
  createDetailedAuditLog.run(`APPLICATION_${record.status.toUpperCase().replaceAll(' ', '_')}`, 'APPLICATION', applicationNumber, applicationNumber, 'Central administrator', 'admin', `Status changed to ${record.status}`, null, record.status, null, null, record.reviewedAt);
  const normalized = database.prepare('UPDATE voter_applications SET status = ?, reviewed_at = ? WHERE application_number = ?');
  normalized.run(record.status, record.reviewedAt, applicationNumber);
  if (record.status === 'Approved') {
    database.prepare("UPDATE voters SET is_active = 1, voter_registration_number = COALESCE(voter_registration_number, 'VR-' || printf('%06d', id)) WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)").run(applicationNumber);
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
    details: log.details ? JSON.parse(log.details) : null,
    previousValue: log.previous_value,
    newValue: log.new_value,
    reason: log.reason,
    deviceInfo: log.device_info,
    createdAt: log.created_at
  }));
  response.json(formatted);
});

app.get('/api/admin/overview', (_request, response) => {
  const count = table => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  const activeVoters = database.prepare("SELECT COUNT(*) AS count FROM voters WHERE is_active = 1").get().count;
  response.json({ voters: activeVoters, applications: count('voter_applications'), officers: count('officers'), centres: count('registration_centres'), auditEvents: count('audit_logs') });
});
app.get('/api/admin/centres', (_request, response) => response.json(database.prepare('SELECT id, name, region, district, ward, active FROM registration_centres ORDER BY name').all()));
app.get('/api/admin/officers', (_request, response) => response.json(database.prepare('SELECT officers.id, users.email, officers.status, registration_centres.name AS centre FROM officers JOIN users ON users.id = officers.user_id LEFT JOIN registration_centres ON registration_centres.id = officers.centre_id ORDER BY officers.id').all()));
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
  const voter = database.prepare(`SELECT v.id, COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS voterRegistrationNumber, a.application_number AS applicationNumber, v.first_name AS firstName, v.middle_name AS middleName, v.last_name AS lastName, v.date_of_birth AS dateOfBirth, v.sex, v.nationality, v.district, v.ward, c.name AS registrationCentre, a.status, a.submitted_at AS registrationDate FROM voters v JOIN voter_applications a ON a.id = v.application_id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id WHERE v.id = ? AND v.is_active = 1 AND a.status = 'Approved'`).get(request.params.id);
  if (!voter) return response.status(404).json({ error: 'Voter record not found.' });
  const canViewSensitive = request.get('x-view-sensitive') === 'true' || request.get('x-user-role') === 'admin';
  const viewType = canViewSensitive ? 'SENSITIVE' : 'STANDARD';
  logAuditEvent('VOTER_RECORD_VIEWED', { recordType: 'VOTER', recordId: String(request.params.id), actor: request.get('x-user-role') === 'admin' ? 'Central administrator' : 'Officer', actorRole: request.get('x-user-role') || 'officer', details: { voterRegistrationNumber: voter.voterRegistrationNumber, viewType, sensitiveFieldsViewed: canViewSensitive } });
  response.json({ ...voter, dateOfBirth: canViewSensitive ? voter.dateOfBirth : '••/••/••••', sensitiveFieldsMasked: !canViewSensitive });
});
app.get('/api/admin/approvals', (request, response) => {
  if (request.get('x-user-role') !== 'admin') return response.status(403).json({ error: 'Administrator permission is required.' });
  const items = database.prepare(`SELECT COALESCE(v.voter_registration_number, 'VR-' || printf('%06d', v.id)) AS registrationNumber, TRIM(v.first_name || ' ' || COALESCE(v.middle_name || ' ', '') || v.last_name) AS name, c.name AS centre, a.reviewed_at AS approvedAt FROM voter_applications a JOIN voters v ON v.application_id = a.id LEFT JOIN registration_centres c ON c.id = v.registration_centre_id WHERE a.status = 'Approved' AND v.is_active = 1 ORDER BY datetime(a.reviewed_at) DESC LIMIT 100`).all();
  const approvedToday = database.prepare("SELECT COUNT(*) AS count FROM voter_applications WHERE status = 'Approved' AND date(reviewed_at) = date('now')").get().count;
  response.json({ approvedToday, items });
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
  const { email, password } = request.body || {};
  const user = database.prepare('SELECT id, email, password_hash AS passwordHash, role FROM users WHERE email = ?').get(email);
  if (!user) return response.status(401).json({ error: 'Invalid credentials' });
  const [salt, stored] = user.passwordHash.split(':');
  const valid = timingSafeEqual(Buffer.from(stored, 'hex'), scryptSync(password || '', salt, 64));
  if (!valid) return response.status(401).json({ error: 'Invalid credentials' });
  response.json({ userId: user.id, email: user.email, role: user.role });
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
  database.prepare("UPDATE voters SET is_active = 1, voter_registration_number = COALESCE(voter_registration_number, 'VR-' || printf('%06d', id)) WHERE application_id = (SELECT id FROM voter_applications WHERE application_number = ?)").run(applicationNumber);
  
  logAuditEvent('APPLICATION_APPROVED', {
    recordType: 'APPLICATION',
    recordId: applicationNumber,
    applicationNumber,
    actor: 'Central administrator',
    actorRole: 'admin',
    details: { approvedAt: reviewedAt, applicantName: `${payload.firstName} ${payload.lastName}` }
  });
  
  response.json({ status: 'APPROVED', applicationNumber, registeredAt: reviewedAt });
});

app.listen(port, () => console.log(`CivicPass running at http://localhost:${port}`));
