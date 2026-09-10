const applications = [
  { name: 'Kwame Asante', initials: 'KA', id: 'CP-260828-014', date: 'Today, 09:42', location: 'Ward 04 · Central', status: 'pending' },
  { name: 'Amina Osei', initials: 'AO', id: 'CP-260828-013', date: 'Today, 09:18', location: 'Ward 02 · Central', status: 'flagged' },
  { name: 'Daniel Boateng', initials: 'DB', id: 'CP-260827-012', date: 'Yesterday, 16:03', location: 'Ward 04 · Central', status: 'pending' },
  { name: 'Efua Mensima', initials: 'EM', id: 'CP-260827-011', date: 'Yesterday, 14:27', location: 'Ward 01 · Central', status: 'pending' },
  { name: 'Nana Yaa Owusu', initials: 'NY', id: 'CP-260826-010', date: '27 Aug, 11:12', location: 'Ward 03 · Central', status: 'approved' },
  { name: 'Kojo Mensah', initials: 'KM', id: 'CP-260826-009', date: '27 Aug, 10:46', location: 'Ward 02 · Central', status: 'pending' }
];

const statusLabels = { pending: 'Pending review', flagged: 'Needs attention', approved: 'Approved' };
const tableRow = (application, detailed = false) => `<tr><td><div class="person"><span class="person-avatar">${application.initials}</span>${application.name}</div></td>${detailed ? `<td>${application.id}</td>` : ''}<td>${application.date}</td><td>${application.location}</td><td><span class="status ${application.status}">${statusLabels[application.status]}</span></td><td><button class="row-action" data-applicant="${application.name}">${application.status === 'approved' ? 'View' : 'Review'} ${detailed ? '→' : ''}</button></td></tr>`;

const api = '/api';
async function saveApplication(record) {
  const response = await fetch(`${api}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
  if (!response.ok) throw new Error('The application could not be saved.');
  return response.json();
}
async function getApplication(applicationNumber) {
  const response = await fetch(`${api}/applications/${encodeURIComponent(applicationNumber)}`);
  return response.ok ? response.json() : null;
}
async function loadVoters() {
  const query = document.querySelector('#voter-search').value.trim();
  const scope = document.querySelector('#voter-search-scope').value;
  const authorized = document.querySelector('#authorized-search').checked;
  if (query && query.length < 2) { document.querySelector('#voters-table').innerHTML = '<tr><td colspan="7" class="empty-cell">Enter at least 2 characters to search.</td></tr>'; return; }
  if ((scope === 'phone' || scope === 'nationalId') && !authorized) { document.querySelector('#voters-table').innerHTML = '<tr><td colspan="7" class="empty-cell">Authorization is required for this sensitive search.</td></tr>'; return; }
  const params = new URLSearchParams({ q: query, scope, authorized, district: document.querySelector('#filter-district').value, ward: document.querySelector('#filter-ward').value, centre: document.querySelector('#filter-centre').value, status: document.querySelector('#filter-status').value, from: document.querySelector('#filter-from').value, to: document.querySelector('#filter-to').value });
  const response = await fetch(`/api/admin/voters?${params}`, { headers: { 'X-User-Role': 'admin' } });
  const records = await response.json();
  if (!response.ok) { document.querySelector('#voters-table').innerHTML = `<tr><td colspan="7" class="empty-cell">${records.error}</td></tr>`; return; }
  document.querySelector('#registered-voter-count').textContent = records.total.toLocaleString();
  document.querySelector('#voters-table').innerHTML = records.items.length ? records.items.map(voter => `<tr><td>${voter.voterRegistrationNumber || 'Pending assignment'}</td><td><div class="person"><span class="person-avatar">${(voter.firstName[0] || '') + (voter.lastName[0] || '')}</span>${voter.firstName} ${voter.lastName}</div></td><td>${voter.district || 'Not recorded'}</td><td>${voter.ward || 'Not recorded'}</td><td><span class="status ${voter.status === 'Approved' || voter.status === 'Active' ? 'approved' : 'pending'}">${voter.status || 'Active'}</span></td><td>${voter.registrationDate ? new Date(voter.registrationDate).toLocaleDateString() : 'Not recorded'}</td><td><button class="row-action" data-voter="${voter.id}">View →</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-cell">No voter records found.</td></tr>';
  if (records.filters && document.querySelector('#filter-district').options.length === 1) populateVoterFilters(records.filters);
}
function populateVoterFilters(filters) {
  [['#filter-district', filters.districts], ['#filter-ward', filters.wards], ['#filter-centre', filters.centres]].forEach(([selector, values]) => { const select = document.querySelector(selector); select.innerHTML += values.map(value => `<option>${value}</option>`).join(''); });
}

let registrationStep = 1;
let registrationDraft = {};
const stepContent = document.querySelector('#registration-step-content');
const stepLabel = document.querySelector('#modal-step-label');
const stepIntro = document.querySelector('#modal-intro');
const progress = document.querySelector('.modal-progress');
function renderRegistrationStep() {
  progress.innerHTML = '<span></span>'.repeat(6);
  progress.querySelectorAll('span').forEach((bar, index) => bar.classList.toggle('active', index < registrationStep));
  const steps = ['PERSONAL INFORMATION', 'CONTACT', 'ELECTORAL INFORMATION', 'IDENTIFICATION', 'PHOTO / BIOMETRICS', 'REVIEW'];
  stepLabel.textContent = `STEP ${registrationStep} OF 6 · ${steps[registrationStep - 1]}`;
  const field = (label, name, type = 'text', placeholder = '') => `<label>${label}<input name="${name}" type="${type}" required placeholder="${placeholder}"></label>`;
  if (registrationStep === 1) {
    stepIntro.textContent = 'Tell us who the applicant is.';
    stepContent.innerHTML = `<div class="form-row">${field('First name', 'firstName', 'text', 'John')}${field('Middle name', 'middleName', 'text', 'Optional')}</div><div class="form-row">${field('Last name', 'lastName', 'text', 'Kamara')}${field('Nationality', 'nationality', 'text', 'e.g. Ghanaian')}</div><div class="form-row">${field('Date of birth', 'dob', 'date')}${field('Sex', 'sex', 'text', 'Female, Male or Other')}</div><button class="primary-button submit-button" type="submit">Continue to contact <span>→</span></button>`;
  } else if (registrationStep === 2) {
    stepIntro.textContent = 'Add reliable ways to contact the applicant.';
    stepContent.innerHTML = `${field('Phone number', 'phone', 'tel', '+233 24 000 0000')}${field('Email address', 'email', 'email', 'applicant@example.com')}${field('Residential address', 'address', 'text', 'House number, street, town')}<button class="primary-button submit-button" type="submit">Continue to electoral information <span>→</span></button>`;
  } else if (registrationStep === 3) {
    stepIntro.textContent = 'Place the applicant in the correct electoral area.';
    stepContent.innerHTML = `${field('Region', 'region', 'text', 'e.g. Greater Accra')}${field('District', 'district', 'text', 'e.g. Central District')}${field('Constituency / ward', 'ward', 'text', 'e.g. Ward 04')}${field('Registration centre', 'centre', 'text', 'Select registration centre')}<button class="primary-button submit-button" type="submit">Continue to identification <span>→</span></button>`;
  } else if (registrationStep === 4) {
    stepIntro.textContent = 'Record an accepted identity document.';
    stepContent.innerHTML = `<label>Identification document<select name="documentType" required><option value="">Select document</option><option>National identity card</option><option>Passport</option><option>Driver's licence</option><option>Voter card replacement</option></select></label>${field('Document number', 'documentNumber', 'text', 'Enter document number')}<label>Upload document<input name="document" required type="file" accept="image/*,.pdf"></label><p class="upload-note">Upload only where permitted by the relevant electoral authority.</p><button class="primary-button submit-button" type="submit">Continue to photo and biometrics <span>→</span></button>`;
  } else if (registrationStep === 5) {
    stepIntro.textContent = 'Capture the applicant photograph and any legally required biometrics.';
    stepContent.innerHTML = `<label>Photograph<input name="photo" required type="file" accept="image/*"></label><label>Biometrics record<input name="biometrics" type="file" accept="image/*,.pdf"></label><p class="upload-note">Biometrics are optional here and should only be collected where legally required.</p><button class="primary-button submit-button" type="submit">Review application <span>→</span></button>`;
  } else {
    stepIntro.textContent = 'Check the details before submitting to the registration officer.';
    const fullName = [registrationDraft.firstName, registrationDraft.middleName, registrationDraft.lastName].filter(Boolean).join(' ');
    stepContent.innerHTML = `<div class="review-summary"><div><span>Name</span><strong>${fullName || 'Not provided'}</strong></div><div><span>DOB</span><strong>${registrationDraft.dob || 'Not provided'}</strong></div><div><span>District</span><strong>${registrationDraft.district || 'Not provided'}</strong></div><div><span>Ward</span><strong>${registrationDraft.ward || 'Not provided'}</strong></div><div><span>Registration Centre</span><strong>${registrationDraft.centre || 'Not provided'}</strong></div></div><button class="primary-button submit-button" type="submit">Submit application <span>→</span></button>`;
  }
}

document.querySelector('#review-table').innerHTML = applications.slice(0, 4).map(item => tableRow(item)).join('');
document.querySelector('#applications-table').innerHTML = applications.map(item => tableRow(item, true)).join('');

const views = ['overview', 'applications', 'voters', 'reports', 'admin'];
function showView(viewName) {
  views.forEach(view => document.querySelector(`#${view}-view`).classList.toggle('active-view', view === viewName));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
  document.querySelector('#page-title').textContent = viewName[0].toUpperCase() + viewName.slice(1);
  if (viewName === 'voters') loadVoters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', event => {
  if (event.target.closest('#voters-view .secondary-button')) { event.preventDefault(); openLatestApprovals(); return; }
  const viewTrigger = event.target.closest('[data-view]');
  if (viewTrigger) showView(viewTrigger.dataset.view);
  if (event.target.closest('#open-registration, #quick-register, #applications-new')) openModal();
  const rowAction = event.target.closest('.row-action');
  if (rowAction) openApplicant(rowAction.dataset.applicant);
  const voterAction = event.target.closest('[data-voter]');
  if (voterAction) openVoterRecord(voterAction.dataset.voter);
  const adminAction = event.target.closest('[data-admin-action]');
  if (adminAction) showToast(`${adminAction.dataset.adminAction[0].toUpperCase() + adminAction.dataset.adminAction.slice(1)} management opened`);
});

const approvalsModal = document.querySelector('#approvals-modal');
async function openLatestApprovals() {
  approvalsModal.classList.add('open');
  approvalsModal.setAttribute('aria-hidden', 'false');
  const response = await fetch('/api/admin/approvals', { headers: { 'X-User-Role': 'admin' } });
  const result = await response.json();
  document.querySelector('#approved-today').textContent = result.approvedToday.toLocaleString();
  document.querySelector('#approvals-table').innerHTML = result.items.length ? result.items.map(item => `<tr><td>${item.registrationNumber}</td><td>${item.name}</td><td>${item.centre || 'Not recorded'}</td><td>${new Date(item.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">No approved registrations found.</td></tr>';
}
function closeApprovals() { approvalsModal.classList.remove('open'); approvalsModal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-approvals').addEventListener('click', closeApprovals);
approvalsModal.addEventListener('click', event => { if (event.target === approvalsModal) closeApprovals(); });

const voterRecordModal = document.querySelector('#voter-record-modal');
async function openVoterRecord(id) {
  const response = await fetch(`/api/admin/voters/${id}`, { headers: { 'X-User-Role': 'officer' } });
  if (!response.ok) { showToast('Permission is required to view this voter record'); return; }
  const voter = await response.json();
  document.querySelector('#record-number').textContent = voter.voterRegistrationNumber;
  document.querySelector('#record-name').textContent = [voter.firstName, voter.middleName, voter.lastName].filter(Boolean).join(' ');
  document.querySelector('#record-dob').textContent = voter.dateOfBirth || '••/••/••••';
  document.querySelector('#record-sex').textContent = voter.sex || 'Not recorded';
  document.querySelector('#record-district').textContent = voter.district || 'Not recorded';
  document.querySelector('#record-ward').textContent = voter.ward || 'Not recorded';
  document.querySelector('#record-centre').textContent = voter.registrationCentre || 'Not recorded';
  document.querySelector('#record-status').textContent = (voter.status || 'Active').toUpperCase();
  document.querySelector('#record-date').textContent = voter.registrationDate ? new Date(voter.registrationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not recorded';
  voterRecordModal.classList.add('open');
  voterRecordModal.setAttribute('aria-hidden', 'false');
}
function closeVoterRecord() { voterRecordModal.classList.remove('open'); voterRecordModal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-voter-record').addEventListener('click', closeVoterRecord);
document.querySelector('#back-directory').addEventListener('click', closeVoterRecord);
voterRecordModal.addEventListener('click', event => { if (event.target === voterRecordModal) closeVoterRecord(); });
document.querySelector('#record-history').addEventListener('click', () => showToast('Registration history opened'));
document.querySelector('#record-correction').addEventListener('click', () => showToast('Correction request submitted for authorization'));

async function loadAuditLog() {
  const log = document.querySelector('#audit-log');
  try {
    const response = await fetch('/api/audit-logs');
    const entries = await response.json();
    document.querySelector('#admin-audit-count').textContent = entries.length;
    
    const formatAuditEntry = (entry) => {
      const actionMap = {
        'VOTER_EXPORT': { icon: '↓', color: 'blue' },
        'VOTER_RECORD_VIEWED': { icon: '◉', color: 'teal' },
        'APPLICATION_APPROVED': { icon: '✓', color: 'green' },
        'APPLICATION_REJECTED': { icon: '✕', color: 'red' },
        'SENSITIVE_VOTER_SEARCH': { icon: '🔍', color: 'orange' },
        'APPLICATION_SUBMITTED': { icon: '▤', color: 'purple' }
      };
      
      const actionInfo = actionMap[entry.action] || { icon: '◷', color: 'gray' };
      const timestamp = new Date(entry.createdAt).toLocaleString();
      
      let details = '';
      if (entry.details) {
        try {
          const parsed = JSON.parse(entry.details);
          if (entry.action === 'VOTER_EXPORT') {
            details = `Records: ${parsed.recordsExported} | Format: ${parsed.format}`;
          } else if (entry.action === 'VOTER_RECORD_VIEWED') {
            details = `Type: ${parsed.viewType} | Voter: ${parsed.voterRegistrationNumber}`;
          } else {
            details = JSON.stringify(parsed).substring(0, 50);
          }
        } catch (e) {
          details = entry.details.substring(0, 50);
        }
      }
      
      const sensitiveFlag = entry.reason ? ' [Sensitive]' : '';
      
      return `<div class="audit-entry">
        <span class="audit-icon ${actionInfo.color}">${actionInfo.icon}</span>
        <div>
          <strong>${entry.action.replaceAll('_', ' ')}${sensitiveFlag}</strong>
          <small>${entry.actor} (${entry.actorRole || 'system'}) · ${timestamp}</small>
          ${details ? `<small style="color:#999;margin-top:3px;display:block">${details}</small>` : ''}
        </div>
      </div>`;
    };
    
    log.innerHTML = entries.length ? entries.slice(0, 15).map(formatAuditEntry).join('') : '<p class="audit-empty">No activity recorded yet.</p>';
  } catch { log.innerHTML = '<p class="audit-empty">Audit log unavailable.</p>'; }
}
document.querySelector('#refresh-audit').addEventListener('click', loadAuditLog);
loadAuditLog();

let selectedApplicant = null;
const applicantModal = document.querySelector('#applicant-modal');
function openApplicant(name) {
  selectedApplicant = applications.find(application => application.name === name);
  if (!selectedApplicant) return;
  document.querySelector('#detail-name').textContent = selectedApplicant.name;
  document.querySelector('#detail-number').textContent = selectedApplicant.id;
  document.querySelector('#detail-district').textContent = 'Central District';
  document.querySelector('#detail-ward').textContent = selectedApplicant.location.split(' · ')[0];
  applicantModal.classList.add('open');
  applicantModal.setAttribute('aria-hidden', 'false');
}
function closeApplicant() { applicantModal.classList.remove('open'); applicantModal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-applicant').addEventListener('click', closeApplicant);
applicantModal.addEventListener('click', event => { if (event.target === applicantModal) closeApplicant(); });
document.querySelectorAll('.evidence-button').forEach(button => button.addEventListener('click', () => showToast(`${button.querySelector('strong').textContent} opened for review`)));
document.querySelectorAll('.decision-button').forEach(button => button.addEventListener('click', async () => {
  if (!selectedApplicant) return;
  const response = await fetch(`/api/applications/${selectedApplicant.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: selectedApplicant.name, district: 'Central District', ward: selectedApplicant.location.split(' · ')[0], status: button.dataset.decision }) });
  closeApplicant();
  showToast(response.ok ? `${selectedApplicant.name}: ${button.dataset.decision}` : 'Could not save the decision');
}));

const modal = document.querySelector('#registration-modal');
function openModal() { registrationStep = 1; registrationDraft = {}; renderRegistrationStep(); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.querySelector('input[name="firstName"]').focus(); }
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

document.querySelector('#registration-form').addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  Object.assign(registrationDraft, Object.fromEntries(formData.entries()));
  if (registrationStep < 6) { registrationStep += 1; renderRegistrationStep(); return; }
  const record = { ...registrationDraft, name: [registrationDraft.firstName, registrationDraft.middleName, registrationDraft.lastName].filter(Boolean).join(' ') };
  const savedRecord = await saveApplication(record);
  closeModal();
  showToast(`Application ${savedRecord.applicationNumber} submitted`);
  showView('applications');
});

const search = document.querySelector('#application-search');
search.addEventListener('input', event => {
  const query = event.target.value.toLowerCase();
  document.querySelector('#applications-table').innerHTML = applications.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(query)).map(item => tableRow(item, true)).join('') || '<tr><td colspan="6" class="empty-cell">No applications found</td></tr>';
});

document.querySelector('#voter-search').addEventListener('input', loadVoters);
document.querySelector('#voter-search-scope').addEventListener('change', loadVoters);
document.querySelector('#authorized-search').addEventListener('change', loadVoters);
const filterModal = document.querySelector('#filter-modal');
document.querySelector('#open-voter-filters').addEventListener('click', () => { filterModal.classList.add('open'); filterModal.setAttribute('aria-hidden', 'false'); });
document.querySelector('#close-filters').addEventListener('click', () => { filterModal.classList.remove('open'); filterModal.setAttribute('aria-hidden', 'true'); });
filterModal.addEventListener('click', event => { if (event.target === filterModal) { filterModal.classList.remove('open'); filterModal.setAttribute('aria-hidden', 'true'); } });
document.querySelector('#filter-form').addEventListener('submit', event => { event.preventDefault(); const from = document.querySelector('#filter-from').value; const to = document.querySelector('#filter-to').value; if (from && to && from > to) { showToast('The start date must be before the end date'); return; } filterModal.classList.remove('open'); filterModal.setAttribute('aria-hidden', 'true'); loadVoters(); showToast('Filter submitted'); });
document.querySelector('#clear-filters').addEventListener('click', () => { document.querySelector('#filter-form').reset(); loadVoters(); showToast('Filters cleared'); });
document.querySelectorAll('.voter-filters select').forEach(select => select.addEventListener('change', loadVoters));

// Export voter list functionality
const exportModal = document.querySelector('#export-modal');
let voterExportCount = 0;
async function openExportModal() {
  exportModal.classList.add('open');
  exportModal.setAttribute('aria-hidden', 'false');
  // Get count of records that would be exported based on current filters
  const query = document.querySelector('#voter-search').value.trim();
  const scope = document.querySelector('#voter-search-scope').value;
  const authorized = document.querySelector('#authorized-search').checked;
  const params = new URLSearchParams({ q: query, scope, authorized, district: document.querySelector('#filter-district').value, ward: document.querySelector('#filter-ward').value, centre: document.querySelector('#filter-centre').value, status: document.querySelector('#filter-status').value, from: document.querySelector('#filter-from').value, to: document.querySelector('#filter-to').value });
  try {
    const response = await fetch(`/api/admin/voters?${params}`, { headers: { 'X-User-Role': 'admin' } });
    const records = await response.json();
    voterExportCount = records.total;
    document.querySelector('#export-count').innerHTML = `<strong>${voterExportCount.toLocaleString()}</strong><span>voter records</span>`;
  } catch (error) {
    voterExportCount = 0;
    document.querySelector('#export-count').innerHTML = '<strong>0</strong><span>voter records</span>';
  }
}
function closeExportModal() { exportModal.classList.remove('open'); exportModal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-export').addEventListener('click', closeExportModal);
document.querySelector('#cancel-export').addEventListener('click', closeExportModal);
exportModal.addEventListener('click', event => { if (event.target === exportModal) closeExportModal(); });
document.querySelector('#export-voters').addEventListener('click', openExportModal);
document.querySelector('#export-form').addEventListener('submit', async event => {
  event.preventDefault();
  const query = document.querySelector('#voter-search').value.trim();
  const scope = document.querySelector('#voter-search-scope').value;
  const authorized = document.querySelector('#authorized-search').checked;
  const selectedFields = Array.from(document.querySelectorAll('#export-form input[type="checkbox"]:checked')).map(cb => cb.name);
  const format = document.querySelector('input[name="format"]:checked').value;
  const filters = { q: query, scope, authorized, district: document.querySelector('#filter-district').value, ward: document.querySelector('#filter-ward').value, centre: document.querySelector('#filter-centre').value, status: document.querySelector('#filter-status').value, from: document.querySelector('#filter-from').value, to: document.querySelector('#filter-to').value };
  try {
    showToast('Generating export...');
    const response = await fetch('/api/admin/export-voters', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }, body: JSON.stringify({ fields: selectedFields, format, filters }) });
    if (!response.ok) { showToast('Export failed. Check permissions and try again.'); return; }
    const blob = await response.blob();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `voter-export-${timestamp}.${format === 'excel' ? 'xlsx' : format}`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    closeExportModal();
    showToast(`Export downloaded: ${filename}`);
  } catch (error) {
    showToast('Export error. Please try again.');
    console.error('Export error:', error);
  }
});

// Application workflow functions
const applicationWorkflow = {
  steps: ['draft', 'submitted', 'validation', 'duplicate-check', 'pending-review', 'approved'],
  current: 'draft',
  applicationNumber: null,
  payload: {},
  
  async initialize(appNumber) {
    this.applicationNumber = appNumber;
    const response = await fetch(`/api/applications/${appNumber}`, { headers: { 'X-User-Role': 'admin' } });
    if (response.ok) {
      const app = await response.json();
      this.payload = app;
      this.current = app.status ? app.status.toLowerCase().replaceAll(' ', '-') : 'draft';
      this.render();
    }
  },
  
  render() {
    const modal = document.querySelector('#application-workflow-modal');
    if (!modal) return;
    
    // Update step visual states
    document.querySelectorAll('.workflow-step').forEach(step => {
      const stepName = step.dataset.step;
      const stepIndex = this.steps.indexOf(stepName);
      const currentIndex = this.steps.indexOf(this.current);
      
      step.classList.remove('active', 'completed', 'error');
      if (stepIndex === currentIndex) step.classList.add('active');
      else if (stepIndex < currentIndex) step.classList.add('completed');
    });
    
    // Update status display
    document.querySelector('#workflow-current-value').textContent = this.statusLabel(this.current);
    
    // Update actions based on current state
    this.updateActions();
  },
  
  statusLabel(status) {
    const labels = {
      'draft': 'DRAFT',
      'submitted': 'SUBMITTED',
      'validation': 'VALIDATING',
      'validation-failed': 'VALIDATION FAILED',
      'duplicate-check': 'CHECKING DUPLICATES',
      'duplicate-found': 'DUPLICATE FOUND',
      'pending-review': 'PENDING REVIEW',
      'corrections-required': 'CORRECTIONS REQUIRED',
      'approved': 'APPROVED'
    };
    return labels[status] || status.toUpperCase();
  },
  
  updateActions() {
    const actionsDiv = document.querySelector('#workflow-actions');
    const messagesDiv = document.querySelector('#workflow-messages');
    actionsDiv.innerHTML = '';
    messagesDiv.innerHTML = '';
    
    const userRole = localStorage.getItem('userRole') || 'voter';
    
    switch (this.current) {
      case 'draft':
        actionsDiv.innerHTML = '<button class="secondary-button" onclick="applicationWorkflow.submit()">Submit Application</button>';
        messagesDiv.innerHTML = '<p class="workflow-messages info">Fill in all required fields and submit your application.</p>';
        break;
        
      case 'submitted':
        actionsDiv.innerHTML = '<button class="primary-button" onclick="applicationWorkflow.validate()">Validate Information</button>';
        messagesDiv.innerHTML = '<p class="workflow-messages info">Application submitted. Beginning data validation...</p>';
        break;
        
      case 'validation':
        messagesDiv.innerHTML = '<p class="workflow-messages info">Validating applicant information...</p>';
        break;
        
      case 'validation-failed':
        actionsDiv.innerHTML = '<button class="secondary-button" onclick="applicationWorkflow.editApplication()">Fix Errors</button>';
        messagesDiv.innerHTML = '<p class="workflow-messages error" id="validation-errors"></p>';
        break;
        
      case 'duplicate-check':
        actionsDiv.innerHTML = '<button class="primary-button" onclick="applicationWorkflow.checkDuplicates()">Check for Duplicates</button>';
        messagesDiv.innerHTML = '<p class="workflow-messages info">Checking against existing voter records...</p>';
        break;
        
      case 'duplicate-found':
        actionsDiv.innerHTML = '<button class="secondary-button" onclick="applicationWorkflow.confirmNotDuplicate()">This is Not a Duplicate</button><button class="secondary-button" onclick="applicationWorkflow.editApplication()">Edit Information</button>';
        messagesDiv.innerHTML = '<p class="workflow-messages error" id="duplicate-warning"></p>';
        break;
        
      case 'pending-review':
        if (userRole === 'admin' || userRole === 'officer') {
          actionsDiv.innerHTML = '<button class="primary-button" onclick="applicationWorkflow.approve()">Approve</button><button class="secondary-button" onclick="applicationWorkflow.requestCorrections()">Request Corrections</button>';
        }
        messagesDiv.innerHTML = '<p class="workflow-messages info">Application ready for officer review.</p>';
        break;
        
      case 'corrections-required':
        actionsDiv.innerHTML = '<button class="secondary-button" onclick="applicationWorkflow.editApplication()">Make Corrections</button>';
        messagesDiv.innerHTML = '<p class="workflow-messages error" id="correction-reason"></p>';
        break;
        
      case 'approved':
        messagesDiv.innerHTML = '<p class="workflow-messages success">✓ Application approved! Voter record created.</p>';
        break;
    }
  },
  
  async submit() {
    this.current = 'submitted';
    this.render();
    showToast('Application submitted');
  },
  
  async validate() {
    this.current = 'validation';
    this.render();
    
    try {
      const response = await fetch(`/api/applications/${this.applicationNumber}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' },
        body: JSON.stringify({ payload: this.payload })
      });
      
      const result = await response.json();
      if (result.status === 'VALIDATION_FAILED') {
        this.current = 'validation-failed';
        document.querySelector('#validation-errors').textContent = result.errors.join(', ');
      } else {
        this.current = 'duplicate-check';
      }
      this.render();
    } catch (error) {
      showToast('Validation error');
      console.error(error);
    }
  },
  
  async checkDuplicates() {
    this.current = 'duplicate-check';
    this.render();
    
    try {
      const response = await fetch(`/api/applications/${this.applicationNumber}/duplicate-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }
      });
      
      const result = await response.json();
      if (result.isDuplicate) {
        this.current = 'duplicate-found';
        document.querySelector('#duplicate-warning').textContent = `⚠ Possible duplicate found: ${result.possibleMatch.voterRegistrationNumber} (${result.possibleMatch.name})`;
      } else {
        this.current = 'pending-review';
      }
      this.render();
    } catch (error) {
      showToast('Duplicate check error');
      console.error(error);
    }
  },
  
  async confirmNotDuplicate() {
    this.current = 'pending-review';
    this.render();
    showToast('Duplicate flagged, proceeding to review');
  },
  
  async approve() {
    if (confirm('Approve this application?')) {
      try {
        const response = await fetch(`/api/applications/${this.applicationNumber}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }
        });
        
        if (response.ok) {
          this.current = 'approved';
          this.render();
          showToast('Application approved! Voter registered.');
        }
      } catch (error) {
        showToast('Approval error');
        console.error(error);
      }
    }
  },
  
  async requestCorrections(reason = 'Please review and correct the information.') {
    try {
      await fetch(`/api/applications/${this.applicationNumber}/request-corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' },
        body: JSON.stringify({ reason })
      });
      
      this.current = 'corrections-required';
      document.querySelector('#correction-reason').textContent = reason;
      this.render();
      showToast('Corrections requested');
    } catch (error) {
      showToast('Error requesting corrections');
      console.error(error);
    }
  },
  
  editApplication() {
    showToast('Opening application for editing...');
    // Trigger registration form modal with pre-filled data
  }
};

// Workflow modal management
document.querySelector('#close-workflow')?.addEventListener('click', () => {
  document.querySelector('#application-workflow-modal').classList.remove('open');
  document.querySelector('#application-workflow-modal').setAttribute('aria-hidden', 'true');
});

// Admin dashboard event handlers
document.querySelector('#admin-latest-approvals')?.addEventListener('click', () => {
  document.querySelector('#approvals-modal').classList.add('open');
  document.querySelector('#approvals-modal').setAttribute('aria-hidden', 'false');
  loadAuditLog(); // Load audit with filter for approvals if needed
});

document.querySelector('#admin-export')?.addEventListener('click', openExportModal);

document.querySelector('#admin-audit-nav')?.addEventListener('click', () => {
  showView('admin');
  setTimeout(() => loadAuditLog(), 100);
});

function showToast(message) { document.querySelector('#toast-message').textContent = message; const toast = document.querySelector('#toast'); toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200); }

const statusForm = document.querySelector('#status-form');
const statusResult = document.querySelector('#status-result');
statusForm.addEventListener('submit', async event => {
  event.preventDefault();
  const number = document.querySelector('#status-number').value.trim().toUpperCase();
  const saved = await getApplication(number).catch(() => null);
  if (number !== 'VR-2026-000125' && (!saved || number !== saved.applicationNumber)) {
    statusResult.innerHTML = '<p class="status-error">No application found. Check the number and try again.</p>';
    return;
  }
  const application = number === 'VR-2026-000125' ? { applicationNumber: number, name: 'John Kamara' } : saved;
  statusResult.innerHTML = `<div class="status-result-heading"><div><span class="status-number">Application: ${application.applicationNumber}</span><h3>Status: <mark>Under Verification</mark></h3></div><span class="verification-badge">● Active</span></div><div class="verification-timeline"><div class="timeline-item complete"><span>✓</span><div><strong>Application submitted</strong><small>Received by CivicPass</small></div></div><div class="timeline-item complete"><span>✓</span><div><strong>Documents received</strong><small>Identity documents are on file</small></div></div><div class="timeline-item complete"><span>✓</span><div><strong>Identity verification</strong><small>Initial checks completed</small></div></div><div class="timeline-item current"><span>⏳</span><div><strong>Officer review</strong><small>Your application is being reviewed</small></div></div><div class="timeline-item"><span>○</span><div><strong>Registration approved</strong><small>Pending final decision</small></div></div></div>`;
});
