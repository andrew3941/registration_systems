const authSession = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
if (authSession?.role) {
  document.body.classList.remove('auth-required');
  document.body.classList.add(`role-${authSession.role === 'voter' ? 'user' : authSession.role}`);
  document.querySelector('#login-screen').setAttribute('aria-hidden', 'true');
  document.querySelector('#page-title').textContent = 'Overview';
  document.querySelector('#logout-button strong').textContent = authSession.name;
  document.querySelector('#logout-button small').textContent = authSession.role === 'voter' ? 'CivicPass user' : authSession.role === 'officer' ? 'Registration officer' : 'Administrator';
  if (authSession.role === 'voter') document.querySelector('#user-logout-button strong').textContent = authSession.name;
  if (authSession.role === 'voter') {
    document.querySelector('#user-welcome-name').textContent = authSession.name;
    document.querySelector('#user-profile-name').textContent = authSession.name;
    document.querySelector('#user-profile-email').textContent = authSession.email;
  }
  if (authSession.role === 'admin') loadAdminOverview();
  if (authSession.role === 'voter') { loadUserApplications(); loadUserNotifications(); }
}

document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#login-error');
  const button = form.querySelector('button[type="submit"]');
  error.textContent = '';
  button.disabled = true;
  button.innerHTML = 'Signing in...';
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name.value.trim(), password: form.password.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Invalid credentials');
    sessionStorage.setItem('civicpassAdmin', JSON.stringify(result));
    localStorage.setItem('userRole', result.role);
    document.querySelector('#logout-button strong').textContent = result.name;
    document.querySelector('#logout-button small').textContent = result.role === 'voter' ? 'CivicPass user' : result.role === 'officer' ? 'Registration officer' : 'Administrator';
    if (result.role === 'voter') document.querySelector('#user-logout-button strong').textContent = result.name;
    document.body.classList.remove('role-user', 'role-officer', 'role-admin');
    document.body.classList.add(`role-${result.role === 'voter' ? 'user' : result.role}`);
    document.body.classList.remove('auth-required');
    document.querySelector('#login-screen').setAttribute('aria-hidden', 'true');
    if (result.role === 'voter') {
      document.querySelector('#user-welcome-name').textContent = result.name;
      document.querySelector('#user-profile-name').textContent = result.name;
      document.querySelector('#user-profile-email').textContent = result.email;
    }
    if (result.role === 'admin') loadAdminOverview();
    if (result.role === 'voter') { loadUserApplications(); loadUserNotifications(); }
    if (result.role === 'officer') loadOfficerApplications();
  } catch (loginError) {
    error.textContent = loginError.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Sign in <span>→</span>';
  }
});

function logoutCurrentUser() {
  sessionStorage.removeItem('civicpassAdmin');
  localStorage.removeItem('userRole');
  document.body.classList.add('auth-required');
  document.body.classList.remove('role-user', 'role-officer', 'role-admin');
  document.querySelector('#login-screen').setAttribute('aria-hidden', 'false');
  document.querySelector('#login-form').reset();
  document.querySelector('#login-name').focus();
}
document.querySelector('#logout-button').addEventListener('click', logoutCurrentUser);
document.querySelector('#logout-top').addEventListener('click', logoutCurrentUser);
document.querySelector('#officer-logout-button').addEventListener('click', logoutCurrentUser);
document.querySelector('#user-logout-button').addEventListener('click', logoutCurrentUser);

const applications = [
  { name: 'Kwame Asante', initials: 'KA', id: 'CP-260828-014', date: 'Today, 09:42', location: 'Ward 04 · Central', status: 'pending' },
  { name: 'Amina Osei', initials: 'AO', id: 'CP-260828-013', date: 'Today, 09:18', location: 'Ward 02 · Central', status: 'flagged' },
  { name: 'Daniel Boateng', initials: 'DB', id: 'CP-260827-012', date: 'Yesterday, 16:03', location: 'Ward 04 · Central', status: 'pending' },
  { name: 'Efua Mensima', initials: 'EM', id: 'CP-260827-011', date: 'Yesterday, 14:27', location: 'Ward 01 · Central', status: 'pending' },
  { name: 'Nana Yaa Owusu', initials: 'NY', id: 'CP-260826-010', date: '27 Aug, 11:12', location: 'Ward 03 · Central', status: 'approved' },
  { name: 'Kojo Mensah', initials: 'KM', id: 'CP-260826-009', date: '27 Aug, 10:46', location: 'Ward 02 · Central', status: 'pending' }
];

const statusLabels = { pending: 'Pending review', flagged: 'Needs attention', approved: 'Approved' };
const statusPresentation = status => {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'active', 'officer verified', 'verified', 'registered', 'voter record created'].includes(normalized)) return { className: 'approved', icon: '●', label: status || 'Approved' };
  if (['rejected', 'flagged', 'corrections required', 'suspended', 'needs attention'].includes(normalized)) return { className: 'flagged', icon: '●', label: status || 'Flagged' };
  if (['draft', 'submitted'].includes(normalized)) return { className: 'submitted', icon: '●', label: status || 'Submitted' };
  return { className: 'pending', icon: '●', label: status || 'Pending review' };
};
const statusBadge = status => { const presentation = statusPresentation(status); return `<span class="status ${presentation.className}"><span class="status-icon" aria-hidden="true">${presentation.icon}</span>${presentation.label}</span>`; };
const tableRow = (application, detailed = false) => `<tr><td><div class="person"><span class="person-avatar">${application.initials}</span>${application.name}</div></td>${detailed ? `<td>${application.id}</td>` : ''}<td>${application.date}</td><td>${application.location}</td><td>${statusBadge(statusLabels[application.status])}</td><td><button class="row-action" data-applicant="${application.name}">${application.status === 'approved' ? 'View' : 'Review'} ${detailed ? '→' : ''}</button></td></tr>`;

const api = '/api';
function buildDuplicateRegistrationPayload(record = {}) {
  return {
    firstName: record.firstName || '',
    lastName: record.lastName || '',
    dob: record.dateOfBirth || record.dob || '',
    sex: record.sex || '',
    nationality: record.nationality || '',
    documentNumber: record.documentNumber || record.nationalId || record.identityReference || '',
    name: record.name || [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ')
  };
}
async function checkForDuplicateRegistration(record) {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`${api}/applications/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': String(session?.userId || ''), 'X-User-Role': session?.role || '' },
    body: JSON.stringify(record)
  });
  const result = await response.json();
  if (!response.ok && result?.duplicate) return result;
  return result;
}
async function saveApplication(record) {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`${api}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': String(session?.userId || ''), 'X-User-Role': session?.role || '' }, body: JSON.stringify(record) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The application could not be saved.');
    error.duplicate = result.duplicate ? result.match : null;
    throw error;
  }
  return result;
}
async function getApplication(applicationNumber) {
  const response = await fetch(`${api}/applications/${encodeURIComponent(applicationNumber)}`);
  return response.ok ? response.json() : null;
}
async function loadUserApplications() {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const list = document.querySelector('#user-applications-list');
  if (!list || session?.role !== 'voter') return;
  const response = await fetch('/api/user/applications', { headers: { 'X-User-Id': String(session.userId), 'X-User-Role': session.role } });
  const records = await response.json();
  if (response.ok && records.length) {
    renderUserCurrentApplication(records[0]);
    list.innerHTML = records.map(record => `<div class="role-list-item"><div><strong>${record.firstName} ${record.lastName}</strong><small>${record.applicationNumber}</small></div><div><strong>${record.district || 'Area pending'}</strong><small>${record.ward || 'Ward pending'}</small></div><div>${statusBadge(record.status)}<small>${new Date(record.submittedAt).toLocaleDateString()}</small></div><div class="user-actions"><button class="row-action" data-status-number="${record.applicationNumber}" title="View application status"><span class="view-status-icon" aria-hidden="true">👁</span> View Status</button>${!['Approved', 'Rejected'].includes(record.status) ? `<button class="row-action" data-edit-application="${record.applicationNumber}" title="Edit application"><span aria-hidden="true">✎</span> Edit</button>` : ''}</div></div>`).join('');
    document.querySelector('#user-notification-count').textContent = records.some(record => ['Flagged', 'Corrections Required'].includes(record.status)) ? 'Action required' : 'No new notifications';
  } else {
    list.innerHTML = '<p class="audit-empty">You have not submitted an application yet.</p>';
    renderUserCurrentApplication(null);
  }
}
async function loadUserNotifications() {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const panel = document.querySelector('#user-notifications-panel');
  if (!panel || session?.role !== 'voter') return;
  const response = await fetch('/api/user/notifications', { headers: { 'X-User-Id': String(session.userId), 'X-User-Role': session.role } });
  const notifications = await response.json();
  const content = panel.querySelector('.notification-item');
  if (!response.ok || !notifications.length) { content.innerHTML = '<span class="notification-mark">✓</span><div><strong>No new updates</strong><small>Your application activity will appear here.</small></div>'; return; }
  content.innerHTML = notifications.slice(0, 5).map(notification => `<span class="notification-mark">${notification.action.includes('CORRECTIONS') || notification.action.includes('FLAGGED') ? '!' : '✓'}</span><div><strong>${notification.action.replaceAll('_', ' ')}</strong><small>${notification.applicationNumber} · ${notification.reason || 'Application status updated'} · ${new Date(notification.createdAt).toLocaleString()}</small></div>`).join('');
}
function renderUserCurrentApplication(application) {
  const title = document.querySelector('#user-current-application');
  const submitted = document.querySelector('#user-current-submitted');
  const status = document.querySelector('#user-current-status');
  const steps = ['Submitted', 'Under Review', 'Flagged', 'Approved', 'Rejected', 'Registered'];
  if (!application) { title.textContent = 'No application submitted yet'; submitted.textContent = 'Submit a registration to generate your application ID.'; status.textContent = 'Not started'; return; }
  title.textContent = application.applicationNumber;
  submitted.textContent = `Submitted: ${new Date(application.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const lifecycleLabels = { DRAFT: 'Draft', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', FLAGGED: 'Flagged', CORRECTION_SUBMITTED: 'Correction Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', REGISTERED: 'Registered', VOTER_RECORD_CREATED: 'Voter Record Created' };
  const lifecycleStatus = application.lifecycleStatus || (application.status === 'Approved' ? 'APPROVED' : application.status === 'Rejected' ? 'REJECTED' : application.status === 'Flagged' || application.status === 'Corrections Required' ? 'FLAGGED' : 'UNDER_REVIEW');
  const currentPresentation = statusPresentation(lifecycleLabels[lifecycleStatus] || application.status);
  status.className = `status ${currentPresentation.className}`;
  status.innerHTML = `<span class="status-icon" aria-hidden="true">${currentPresentation.icon}</span>${currentPresentation.label}`;
  const current = lifecycleStatus === 'DRAFT' ? 0 : lifecycleStatus === 'SUBMITTED' ? 0 : lifecycleStatus === 'UNDER_REVIEW' || lifecycleStatus === 'CORRECTION_SUBMITTED' ? 1 : lifecycleStatus === 'FLAGGED' ? 2 : lifecycleStatus === 'REJECTED' ? 4 : lifecycleStatus === 'APPROVED' ? 3 : lifecycleStatus === 'REGISTERED' || lifecycleStatus === 'VOTER_RECORD_CREATED' ? 5 : 1;
  document.querySelectorAll('#user-timeline .user-timeline-step').forEach((step, index) => { step.classList.toggle('complete', index < current); step.classList.toggle('current', index === current); step.querySelector('span').textContent = index <= current ? '●' : '○'; });
}
async function openUserApplicationStatus(applicationNumber) {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const [applicationResponse, lifecycleResponse] = await Promise.all([
    fetch(`/api/applications/${encodeURIComponent(applicationNumber)}`, { headers: { 'X-User-Id': String(session?.userId || ''), 'X-User-Role': 'voter' } }),
    fetch(`/api/applications/${encodeURIComponent(applicationNumber)}/lifecycle`)
  ]);
  const application = await applicationResponse.json();
  const lifecycle = lifecycleResponse.ok ? await lifecycleResponse.json() : { history: [] };
  if (!applicationResponse.ok) return showToast(application.error || 'Application could not be loaded');
  const presentation = statusPresentation(application.status);
  const fullName = [application.firstName, application.middleName, application.lastName].filter(Boolean).join(' ') || application.name || 'Applicant';
  const history = lifecycle.history || [];
  const historyMarkup = history.length ? history.map((item, index) => `<div class="status-history-item ${index === history.length - 1 ? 'current' : 'complete'}"><span class="status-history-icon">${item.status === 'REJECTED' ? '✕' : '✓'}</span><div><strong>${item.status.replaceAll('_', ' ')}</strong><small>${item.status === 'UNDER_REVIEW' ? 'Application reviewed by Registration Officer' : item.status === 'APPROVED' ? 'Your application was approved' : item.status === 'REJECTED' ? 'Application rejected' : item.status === 'FLAGGED' ? 'Additional information is required' : 'Application status updated'}</small><small>${new Date(item.createdAt).toLocaleString()}</small></div></div>`).join('') : `<div class="status-history-item current"><span class="status-history-icon">✓</span><div><strong>${application.status}</strong><small>Application received</small><small>${new Date(application.createdAt || Date.now()).toLocaleString()}</small></div></div>`;
  const reason = history.find(item => item.reason)?.reason || (application.status === 'Rejected' ? 'The submitted information could not be verified.' : '');
  document.querySelector('#user-application-status-content').innerHTML = `<div class="status-detail-header"><div><p class="eyebrow">APPLICATION</p><h2>${application.applicationNumber}</h2><h3>${fullName}</h3><p>${application.district || 'Area pending'} · Electoral Area ${application.ward || 'pending'}</p></div><span class="status-detail-badge ${presentation.className}"><span class="status-icon">${presentation.icon}</span>${presentation.label}</span></div><section class="status-detail-section"><p class="eyebrow">REGISTRATION PROGRESS</p><div class="status-history">${historyMarkup}</div></section><section class="status-detail-section"><p class="eyebrow">APPLICANT INFORMATION</p><div class="status-info-grid"><div><span>Name</span><strong>${fullName}</strong></div><div><span>Date of Birth</span><strong>${application.dob || application.dateOfBirth || 'Not provided'}</strong></div><div><span>Nationality</span><strong>${application.nationality || 'Not provided'}</strong></div><div><span>Sex</span><strong>${application.sex || 'Not provided'}</strong></div><div><span>Electoral Area</span><strong>${application.district || 'Pending'} · ${application.ward || 'Pending'}</strong></div></div></section><section class="status-detail-section"><p class="eyebrow">DOCUMENTS & VERIFICATION</p><div class="status-verification-list"><div>📷 Voter Photograph <strong>${application.photoData ? '✓ Captured' : '○ Pending'}</strong></div><div>🪪 Identity Information <strong>✓ On file</strong></div><div>📍 Address <strong>${application.address ? '✓ On file' : '○ Pending'}</strong></div><div>🗳 Electoral Area <strong>${application.district && application.ward ? '✓ Verified' : '○ Pending'}</strong></div></div></section>${application.status === 'Rejected' || reason ? `<section class="status-detail-section rejection-section"><p class="eyebrow">${application.status === 'Rejected' ? 'REJECTION INFORMATION' : 'CORRECTION REQUIRED'}</p><p>${reason || 'Your application needs additional information.'}</p>${application.status !== 'Rejected' ? '<button class="primary-button" data-edit-application="' + application.applicationNumber + '">Fix Application →</button>' : ''}</section>` : ''}<section class="status-detail-section"><p class="eyebrow">OFFICER REVIEW</p><div class="status-review-line"><span>Status</span><strong>${presentation.icon} ${presentation.label}</strong><span>Reviewed by</span><strong>Registration Officer</strong></div></section>`;
  const modal = document.querySelector('#user-application-status-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
async function loadAdminUsers() {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const table = document.querySelector('#admin-users-table');
  if (!table || session?.role !== 'admin') return;
  const response = await fetch('/api/admin/users', { headers: { 'X-User-Id': String(session.userId), 'X-User-Role': 'admin' } });
  const users = await response.json();
  const header = table.closest('table').querySelector('thead');
  header.innerHTML = '<tr><th>Name</th><th>Contact</th><th>Role</th><th>Status</th><th>Change role</th><th>Account action</th></tr>';
  table.innerHTML = response.ok ? users.map(user => `<tr><td><strong>${user.name}</strong></td><td>${user.email}</td><td>${statusBadge(user.role)}</td><td>${statusBadge(user.status)}</td><td><select class="admin-role-select" data-user-id="${user.id}" aria-label="Role for ${user.name}"><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option><option value="officer" ${user.role === 'officer' ? 'selected' : ''}>Officer</option><option value="voter" ${user.role === 'voter' ? 'selected' : ''}>User</option></select></td><td><button class="row-action ${user.status === 'active' ? 'danger-action' : ''}" data-user-status-action="${user.status === 'active' ? 'suspended' : 'active'}" data-user-id="${user.id}">${user.status === 'active' ? 'Suspend' : 'Reactivate'}</button></td></tr>`).join('') : `<tr><td colspan="6" class="empty-cell">${users.error}</td></tr>`;
}
async function updateAdminUserStatus(userId, status) {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`/api/admin/users/${userId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Id': String(session?.userId || ''), 'X-User-Role': 'admin' }, body: JSON.stringify({ status }) });
  const result = await response.json();
  showToast(response.ok ? `Account ${status}` : result.error);
  if (response.ok) loadAdminUsers();
}
async function loadAdminOverview() {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const metrics = document.querySelector('.admin-metrics');
  if (!metrics || session?.role !== 'admin') return;
  const response = await fetch('/api/admin/overview', { headers: { 'X-User-Id': String(session.userId || ''), 'X-User-Role': 'admin' } });
  const overview = await response.json();
  if (!response.ok) return;
  const currentMonthApprovalChange = overview.approvedPreviousMonth ? ((overview.approvedThisMonth - overview.approvedPreviousMonth) / overview.approvedPreviousMonth) * 100 : (overview.approvedThisMonth ? 100 : 0);
  const pendingChange = overview.pendingToday - overview.pendingYesterday;
  const dashboardDate = new Date(overview.date || Date.now()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.querySelector('#admin-dashboard-date').textContent = dashboardDate.toUpperCase();
  document.querySelector('#admin-dashboard-name').textContent = overview.adminName;
  document.querySelector('#admin-dashboard-office').textContent = overview.office;
  document.querySelector('#admin-dashboard-pending').textContent = Number(overview.pending).toLocaleString();
  document.querySelector('#admin-dashboard-pending-change').textContent = `${pendingChange >= 0 ? '↑' : '↓'} ${Math.abs(pendingChange).toLocaleString()}`;
  document.querySelector('#admin-dashboard-approved').textContent = Number(overview.approvedThisMonth).toLocaleString();
  document.querySelector('#admin-dashboard-approved-change').textContent = `${currentMonthApprovalChange >= 0 ? '↑' : '↓'} ${Math.abs(currentMonthApprovalChange).toFixed(1)}%`;
  document.querySelector('#admin-dashboard-flagged').textContent = Number(overview.flagged).toLocaleString();
  document.querySelector('#admin-dashboard-documents').textContent = `${Number(overview.flaggedDocuments).toLocaleString()} documents`;
  document.querySelector('#admin-dashboard-duplicates').textContent = `${Number(overview.duplicateFlags).toLocaleString()} duplicates`;
  document.querySelector('#admin-dashboard-voters').textContent = Number(overview.registeredVoters).toLocaleString();
  document.querySelector('#admin-dashboard-voters-label').textContent = `${overview.office} total`;
  const cards = [['Total citizens', overview.voters, 'blue', 'Approved voter records'], ['Applications', overview.applications, 'yellow', 'All submitted applications'], ['Pending', overview.pending, 'yellow', 'Awaiting officer action'], ['Flagged', overview.flagged, 'orange', 'Need more information'], ['Approved', overview.approved, 'green', 'Awaiting voter registration'], ['Rejected', overview.rejected, 'orange', 'Applications closed']];
  metrics.innerHTML = cards.map(([label, value, color, note]) => `<article class="metric-card ${label === 'Pending' ? 'accent' : ''}"><div class="metric-top"><span>${label}</span><span class="metric-icon ${color}">${label === 'Approved' ? '✓' : label === 'Rejected' || label === 'Flagged' ? '!' : '◷'}</span></div><strong>${Number(value).toLocaleString()}</strong><div class="metric-foot">${note}</div></article>`).join('');
}
async function loadAdminOfficers() {
  const table = document.querySelector('#admin-officers-table');
  if (!table) return;
  const response = await fetch('/api/admin/officers', { headers: { 'X-User-Role': 'admin' } });
  const officers = await response.json();
  const centresResponse = await fetch('/api/admin/centres', { headers: { 'X-User-Role': 'admin' } });
  const centres = centresResponse.ok ? await centresResponse.json() : [];
  const header = table.closest('table').querySelector('thead');
  const officerPanel = table.closest('.admin-management');
  if (officerPanel && !officerPanel.querySelector('#add-admin-officer')) officerPanel.querySelector('.panel-heading').insertAdjacentHTML('beforeend', '<button class="secondary-button" id="add-admin-officer">Add officer</button>');
  header.innerHTML = '<tr><th>Officer</th><th>Centre</th><th>Status</th><th>Activity</th><th>Actions</th></tr>';
  table.innerHTML = response.ok ? officers.map(officer => `<tr><td><strong>${officer.name || officer.email}</strong><small class="table-subtext">${officer.email}</small></td><td><select class="officer-centre-select" data-officer-id="${officer.id}"><option value="">Unassigned</option>${centres.map(centre => `<option value="${centre.id}" ${centre.id === officer.centreId ? 'selected' : ''}>${centre.name}</option>`).join('')}</select></td><td>${statusBadge(officer.status)}</td><td><strong>${officer.activity.reviewed || 0} reviewed</strong><small class="table-subtext">${officer.activity.approved || 0} approved · ${officer.activity.flagged || 0} flagged · ${officer.activity.rejected || 0} rejected</small></td><td><div class="admin-officer-actions"><button class="row-action" data-officer-admin-action="view" data-officer-id="${officer.id}">View</button><button class="row-action" data-officer-admin-action="edit" data-officer-id="${officer.id}" data-officer-name="${officer.name || ''}">Edit</button><button class="row-action ${officer.status === 'active' ? 'danger-action' : ''}" data-officer-admin-action="toggle" data-officer-id="${officer.id}" data-officer-status="${officer.status}">${officer.status === 'active' ? 'Deactivate' : 'Activate'}</button><button class="row-action" data-officer-admin-action="activity" data-officer-id="${officer.id}">Activity</button></div></td></tr>`).join('') : `<tr><td colspan="5" class="empty-cell">${officers.error}</td></tr>`;
}
async function updateAdminOfficer(officerId, changes) {
  const response = await fetch(`/api/admin/officers/${officerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }, body: JSON.stringify(changes) });
  const result = await response.json();
  showToast(response.ok ? 'Officer record updated' : result.error);
  if (response.ok) loadAdminOfficers();
}
async function showAdminOfficerActivity(officerId) {
  const response = await fetch(`/api/admin/officers/${officerId}/activity`, { headers: { 'X-User-Role': 'admin' } });
  const result = await response.json();
  if (!response.ok) return showToast(result.error);
  const latest = result.activity[0];
  showToast(latest ? `${result.officer.name}: ${result.activity.length} actions · Last ${new Date(latest.createdAt).toLocaleString()}` : `${result.officer.name}: no activity recorded`);
}
async function editUserApplication(applicationNumber) {
  const application = await getApplication(applicationNumber);
  if (!application) return showToast('Application could not be loaded');
  registrationDraft = { ...application, dob: application.dob || application.dateOfBirth };
  registrationStep = 1;
  renderRegistrationStep();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
let officerApplicationFilter = 'all';
async function loadOfficerApplications() {
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const table = document.querySelector('#officer-applications-table');
  if (!table || !['officer', 'admin'].includes(session?.role)) return;
  const response = await fetch('/api/officer/applications', { headers: { 'X-User-Id': String(session.userId || ''), 'X-User-Role': session.role } });
  const records = await response.json();
  if (!response.ok) { table.innerHTML = `<tr><td colspan="5" class="empty-cell">${records.error}</td></tr>`; return; }
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector('#officer-queue-count').textContent = records.filter(record => ['Under Verification', 'Pending Review', 'Flagged', 'Corrections Required'].includes(record.status)).length;
  document.querySelector('#officer-verified-count').textContent = records.filter(record => record.status === 'Officer Verified').length;
  document.querySelector('#officer-flagged-count').textContent = records.filter(record => record.status === 'Flagged').length;
  document.querySelector('#officer-reviewed-count').textContent = records.filter(record => record.reviewedAt && record.reviewedAt.slice(0, 10) === today).length;
  document.querySelector('#officer-approved-count').textContent = records.filter(record => record.status === 'Approved').length;
  document.querySelector('#officer-rejected-count').textContent = records.filter(record => record.status === 'Rejected').length;
  document.querySelector('#officer-report-reviewed').textContent = records.filter(record => record.reviewedAt && record.reviewedAt.slice(0, 10) === today).length;
  document.querySelector('#officer-report-verified').textContent = records.filter(record => record.status === 'Officer Verified').length;
  document.querySelector('#officer-report-flagged').textContent = records.filter(record => record.status === 'Flagged' || record.status === 'Corrections Required').length;
  const queueRecords = records.filter(record => {
    if (officerApplicationFilter === 'draft') return record.status === 'Draft';
    if (officerApplicationFilter === 'submitted') return record.status === 'Submitted' || record.status === 'Under Verification';
    if (officerApplicationFilter === 'pending') return ['Under Verification', 'Pending Review', 'Corrections Required'].includes(record.status);
    if (officerApplicationFilter === 'correction') return record.status === 'Corrections Required';
    if (officerApplicationFilter === 'flagged') return record.status === 'Flagged' || record.status === 'Corrections Required';
    if (officerApplicationFilter === 'verified') return record.status === 'Officer Verified';
    if (officerApplicationFilter === 'approved') return record.status === 'Approved';
    if (officerApplicationFilter === 'rejected') return record.status === 'Rejected';
    return ['Under Verification', 'Pending Review', 'Flagged', 'Corrections Required', 'Officer Verified', 'Rejected'].includes(record.status);
  });

  const queueRecordsWithDuplicates = await Promise.all(queueRecords.map(async record => {
    const duplicateResult = await checkForDuplicateRegistration(buildDuplicateRegistrationPayload(record));
    return { ...record, duplicateMatch: duplicateResult?.duplicate ? duplicateResult.match : null };
  }));

  table.innerHTML = queueRecordsWithDuplicates.length ? queueRecordsWithDuplicates.map(record => `
    <tr>
      <td>
        <button class="applicant-select" data-officer-open="${record.applicationNumber}">
          <span class="person"><span class="person-avatar">${(record.firstName[0] || '') + (record.lastName[0] || '')}</span>${record.firstName} ${record.lastName}</span>
        </button>
        ${record.duplicateMatch ? '<span class="duplicate-warning-tag">⚠ Duplicate match</span>' : ''}
      </td>
      <td>${record.applicationNumber}</td>
      <td>${record.district || 'Not recorded'} · ${record.ward || 'Not recorded'}</td>
      <td>${statusBadge(record.status)}</td>
      <td><div class="officer-actions"><button class="decision-action approve-action" data-officer-decision="verified" data-application="${record.applicationNumber}" title="Approve application"><span aria-hidden="true">✓</span> Approve</button><button class="decision-action correction-action" data-officer-decision="corrections" data-application="${record.applicationNumber}" title="Request correction"><span aria-hidden="true">↻</span> Request Correction</button><button class="decision-action flag-action" data-officer-decision="flagged" data-application="${record.applicationNumber}" title="Flag application"><span aria-hidden="true">⚑</span> Flag</button><button class="decision-action reject-action" data-officer-decision="rejected" data-application="${record.applicationNumber}" title="Reject application"><span aria-hidden="true">✕</span> Reject</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-cell">No applications require review.</td></tr>';
}
let selectedOfficerApplication = null;
async function openOfficerApplication(applicationNumber) {
  selectedOfficerApplication = applicationNumber;
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`/api/officer/applications/${applicationNumber}`, { headers: { 'X-User-Role': session?.role || '' } });
  const record = await response.json();
  if (!response.ok) return showToast(record.error || 'Application could not be loaded');
  const duplicateResult = await checkForDuplicateRegistration(buildDuplicateRegistrationPayload(record));
  const duplicateMatch = duplicateResult?.duplicate ? duplicateResult.match : null;
  const duplicatePanel = document.querySelector('#officer-detail-duplicate');
  if (duplicateMatch) {
    duplicatePanel.innerHTML = `
      <div class="duplicate-alert-box">
        <strong>⚠ Possible duplicate registration</strong>
        <p>We found an existing active application that may belong to this voter.</p>
        <div class="duplicate-alert-meta">
          <span>Name</span><strong>${duplicateMatch.firstName || record.firstName} ${duplicateMatch.lastName || record.lastName}</strong>
          <span>Application</span><strong>${duplicateMatch.applicationNumber}</strong>
          <span>Status</span><strong>${duplicateMatch.status || 'Under Verification'}</strong>
        </div>
      </div>
    `;
    duplicatePanel.classList.remove('hidden');
  } else {
    duplicatePanel.innerHTML = '';
    duplicatePanel.classList.add('hidden');
  }
  document.querySelector('#officer-detail-title').textContent = `${record.applicationNumber} · ${record.firstName} ${record.lastName}`;
  document.querySelector('#officer-detail-status').textContent = `Status: ${record.status} · Submitted ${new Date(record.submittedAt).toLocaleDateString()}`;
  document.querySelector('#detail-personal-name').textContent = [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ');
  document.querySelector('#detail-personal-dob').textContent = record.dateOfBirth || '-';
  document.querySelector('#detail-personal-sex').textContent = [record.sex, record.nationality].filter(Boolean).join(' / ') || '-';
  document.querySelector('#detail-identity-document').textContent = record.documentType || '-';
  document.querySelector('#detail-identity-number').textContent = record.documentNumber || '-';
  document.querySelector('#detail-address').textContent = record.address || '-';
  document.querySelector('#detail-electoral').textContent = [record.region, record.district, record.ward].filter(Boolean).join(' / ') || '-';
  document.querySelector('#detail-centre').textContent = record.registrationCentre || '-';
  document.querySelector('#officer-detail-history').innerHTML = record.history.length ? record.history.map(item => `<div><strong>${item.action.replaceAll('_', ' ')}</strong><small>${item.actor} · ${new Date(item.createdAt).toLocaleString()}</small></div>`).join('') : '<p class="audit-empty">No history loaded.</p>';
  document.querySelector('#officer-detail-panel').classList.add('selected');
  document.querySelector('#officer-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function submitOfficerDetailDecision(decision) {
  if (!selectedOfficerApplication) return showToast('Select an application first');
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`/api/applications/${selectedOfficerApplication}/officer-review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': String(session?.userId || ''), 'X-User-Role': session?.role || '' }, body: JSON.stringify({ decision }) });
  const result = await response.json();
  showToast(response.ok ? `${result.applicationNumber}: ${result.status}` : result.error);
  if (response.ok) { document.querySelector('#officer-detail-panel').classList.remove('selected'); loadOfficerApplications(); }
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
  document.querySelector('#voters-table').innerHTML = records.items.length ? records.items.map(voter => `<tr><td>${voter.voterRegistrationNumber || 'Pending assignment'}</td><td><div class="person"><span class="person-avatar">${(voter.firstName[0] || '') + (voter.lastName[0] || '')}</span>${voter.firstName} ${voter.lastName}</div></td><td>${voter.district || 'Not recorded'}</td><td>${voter.ward || 'Not recorded'}</td><td>${statusBadge(voter.status || 'Active')}</td><td>${voter.registrationDate ? new Date(voter.registrationDate).toLocaleDateString() : 'Not recorded'}</td><td><button class="row-action" data-voter="${voter.id}">View →</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-cell">No voter records found.</td></tr>';
  if (records.filters && document.querySelector('#filter-district').options.length === 1) populateVoterFilters(records.filters);
}
async function loadAdminElectionDashboard() {
  const response = await fetch('/api/admin/election-dashboard', { headers: { 'X-User-Role': 'admin' } });
  const result = await response.json();
  if (!response.ok) return;
  const election = result.election || {};
  const total = Number(result.totalEligible || 0);
  const checkedIn = Number(result.checkedIn || 0);
  const voted = Number(result.voted || 0);
  const turnout = Number(result.turnout || 0);
  const pending = Number(result.pending || 0);
  const electionName = document.querySelector('#admin-election-name');
  const electionDate = document.querySelector('#admin-election-date');
  if (electionName) electionName.textContent = election.name || 'No active election';
  if (electionDate) electionDate.textContent = election.electionDate ? new Date(election.electionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set';
  const eligibleEl = document.querySelector('#admin-election-eligible');
  const checkedInEl = document.querySelector('#admin-election-checked-in');
  const votedEl = document.querySelector('#admin-election-voted');
  const turnoutEl = document.querySelector('#admin-election-turnout');
  const stationsEl = document.querySelector('#admin-election-stations');
  const pendingEl = document.querySelector('#admin-election-pending');
  if (eligibleEl) eligibleEl.textContent = total.toLocaleString();
  if (checkedInEl) checkedInEl.textContent = checkedIn.toLocaleString();
  if (votedEl) votedEl.textContent = voted.toLocaleString();
  if (turnoutEl) turnoutEl.textContent = `${turnout.toFixed(1)}%`;
  if (stationsEl) stationsEl.textContent = Number(result.pollingStations || 0).toLocaleString();
  if (pendingEl) pendingEl.textContent = pending.toLocaleString();
}
async function loadElectionDaySummary() {
  const response = await fetch('/api/admin/election-day/summary', { headers: { 'X-User-Role': 'admin' } });
  const summary = await response.json();
  if (!response.ok) return;
  const total = Number(summary.totalEligible || 0);
  const voted = Number(summary.voted || 0);
  const pending = Number(summary.pending || 0);
  document.querySelector('#election-day-total').textContent = total.toLocaleString();
  document.querySelector('#election-day-voted').textContent = voted.toLocaleString();
  document.querySelector('#election-day-pending').textContent = pending.toLocaleString();
  document.querySelector('#election-day-turnout').textContent = `${total ? ((voted / total) * 100).toFixed(1) : '0.0'}%`;
  loadAdminElectionDashboard();
  loadPollingStationDashboard();
}
async function loadElectionExceptions() {
  const response = await fetch('/api/admin/election-day/exceptions', { headers: { 'X-User-Role': 'admin' } });
  const result = await response.json();
  const list = document.querySelector('#election-exception-list');
  if (!list) return;
  if (!response.ok) {
    list.innerHTML = `<li class="empty-exception">${result.error || 'Exceptions unavailable.'}</li>`;
    return;
  }
  const items = Array.isArray(result.items) ? result.items : [];
  list.innerHTML = items.length ? items.map(item => {
    const requiresSupervisor = Number(item.requires_supervisor) === 1 || item.status === 'PENDING_SUPERVISOR_REVIEW';
    return `
      <li class="exception-item ${requiresSupervisor ? 'requires-supervisor' : ''}">
        <div class="exception-topline">
          <strong>${item.incident_type || 'Exception'}</strong>
          <span class="exception-status ${requiresSupervisor ? 'warning' : 'ok'}">${requiresSupervisor ? 'Supervisor required' : item.status || 'OPEN'}</span>
        </div>
        <p>${item.description || 'No additional details provided.'}</p>
        <small>${item.voter_name || 'General incident'} • ${new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </li>
    `;
  }).join('') : '<li class="empty-exception">No election incidents reported.</li>';
}
async function loadPollingStationDashboard() {
  const stationCode = 'PS-009-04';
  const response = await fetch(`/api/admin/election-day/station-dashboard?station=${encodeURIComponent(stationCode)}`, { headers: { 'X-User-Role': 'admin' } });
  const station = await response.json();
  if (!response.ok) return;
  const eligible = Number(station.eligibleVoters || 0);
  const checkedIn = Number(station.checkedIn || 0);
  const voted = Number(station.voted || 0);
  const remaining = Number(station.remaining || Math.max(eligible - checkedIn, 0));
  document.querySelector('#station-dashboard-code').textContent = station.stationCode || stationCode;
  document.querySelector('#station-dashboard-location').textContent = `${station.district || 'Kenema'} · ${station.areaLabel || 'Electoral Area 009'}`;
  document.querySelector('#station-eligible').textContent = eligible.toLocaleString();
  document.querySelector('#station-checked-in').textContent = checkedIn.toLocaleString();
  document.querySelector('#station-voted').textContent = voted.toLocaleString();
  document.querySelector('#station-remaining').textContent = remaining.toLocaleString();
  const activityList = document.querySelector('#station-activity-list');
  if (!activityList) return;
  activityList.innerHTML = station.activity && station.activity.length ? station.activity.map(item => `
    <li>
      <div class="station-activity-main"><span>${item.name}</span><strong>${item.status}</strong></div>
      <time>${item.time}</time>
    </li>
  `).join('') : '<li>No recent activity for this polling station.</li>';
}
async function searchVoterForCheckIn(identifier) {
  const query = String(identifier || document.querySelector('#election-voter-search')?.value || '').trim();
  if (!query) {
    showToast('Enter a voter number or name to search.');
    return;
  }
  const response = await fetch(`/api/admin/election-day/check-in?identifier=${encodeURIComponent(query)}`, { headers: { 'X-User-Role': 'admin' } });
  const result = await response.json();
  if (!response.ok) {
    const panel = document.querySelector('#election-voter-result');
    panel.className = 'election-voter-result error';
    panel.innerHTML = `<div class="checkin-result-error">${result.error || 'Voter not found or not eligible for polling.'}</div>`;
    return;
  }
  if (result.warning || ['CHECKED_IN', 'VOTED'].includes(String(result.electionStatus || '').toUpperCase())) {
    renderAlreadyProcessedResult(result);
    return;
  }
  renderElectionCheckInResult(result);
}
function renderAlreadyProcessedResult(result) {
  const panel = document.querySelector('#election-voter-result');
  if (!panel || !result?.voter) return;
  const voter = result.voter;
  const fullName = [voter.firstName, voter.middleName, voter.lastName].filter(Boolean).join(' ') || voter.fullName || 'Voter';
  const processedAt = result.processedAt || result.updatedAt || result.checkedInAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const status = String(result.electionStatus || 'VOTED').toUpperCase();
  panel.className = 'election-voter-result';
  panel.innerHTML = `
    <div class="voter-processed-card">
      <div class="voter-processed-header">
        <span class="warning-icon">⚠</span>
        <div>
          <h3>VOTER ALREADY PROCESSED</h3>
        </div>
      </div>
      <div class="voter-processed-body">
        <p class="processed-name">${fullName}</p>
        <p class="processed-id">${voter.voterRegistrationNumber || 'VR-2026-000000'}</p>
        <div class="processed-line"><span>Election Status:</span> <strong class="processed-status">● ${status === 'VOTED' ? 'VOTED' : status === 'CHECKED_IN' ? 'CHECKED IN' : status}</strong></div>
        <div class="processed-line"><span>Processed at:</span> <strong>${processedAt}</strong></div>
        <div class="processed-line"><span>Polling Station:</span> <strong>${result.assignedPollingStation || voter.pollingStationCode || 'PS-009-04'}</strong></div>
        <p class="processed-note">This voter cannot be processed again.</p>
        <button class="primary-button" type="button" data-close-processed-warning>Close</button>
      </div>
    </div>
  `;
}
function buildStatusBadge(status, label) {
  const normalized = String(status || '').toUpperCase();
  const text = label || normalized.replace(/_/g, ' ');
  if (!normalized || normalized === 'NOT_CHECKED_IN') return '<span class="status pending">' + text + '</span>';
  if (normalized === 'CHECKED_IN') return '<span class="status approved">' + text + '</span>';
  if (normalized === 'VOTED') return '<span class="status approved">' + text + '</span>';
  if (normalized === 'ELIGIBLE') return '<span class="status approved">✓ ' + text + '</span>';
  if (normalized === 'REGISTERED') return '<span class="status submitted">' + text + '</span>';
  return '<span class="status flagged">' + text + '</span>';
}
async function renderElectionCheckInResult(result) {
  const panel = document.querySelector('#election-voter-result');
  if (!panel || !result?.voter) return;
  const voter = result.voter;
  const fullName = [voter.firstName, voter.middleName, voter.lastName].filter(Boolean).join(' ') || voter.fullName || 'Voter';
  const initials = fullName.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'VP';
  const permanentStatus = String(result.registrationStatus || 'REGISTERED').toUpperCase();
  const electionStatus = String(result.electionStatus || 'NOT_CHECKED_IN').toUpperCase().replace(/\s+/g, '_');
  const permanentBadge = buildStatusBadge(permanentStatus, permanentStatus === 'ELIGIBLE' ? 'ELIGIBLE' : permanentStatus);
  const electionBadge = buildStatusBadge(electionStatus, electionStatus.replace(/_/g, ' '));
  const stationWarning = result.stationMatch === false ? `<div class="station-mismatch">This voter is assigned to <strong>${result.expectedPollingStation || 'the correct station'}</strong> and cannot vote at this polling station.</div>` : '';
  const privateVoteNote = electionStatus === 'VOTED' ? '<div class="station-mismatch">Ballot choice is not recorded in CivicPass. Only election processing is tracked.</div>' : '';
  const currentOfficer = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null')?.name || 'Officer 004';
  const completedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const completionBlock = electionStatus === 'VOTED' ? `
    <div class="voter-record-card">
      <div class="voter-record-header">${fullName}</div>
      <div class="voter-record-meta">${voter.voterRegistrationNumber || 'VR-2026-000000'}</div>
      <div class="voter-record-meta">${voter.district || 'Kenema'} · Area ${voter.ward || voter.electoralArea || '009'}</div>
      <div class="voter-record-lines">
        <div><span>Eligibility:</span> <strong>${permanentBadge}</strong></div>
        <div><span>Check-in:</span> <strong>✓ CHECKED IN</strong></div>
        <div><span>Voting:</span> <strong>✓ COMPLETED</strong></div>
      </div>
      <div class="voter-record-footer">
        <div>Time: ${completedTime}</div>
        <div>Polling Station: ${result.assignedPollingStation || 'PS-009-04'}</div>
        <div>Recorded by: ${currentOfficer}</div>
      </div>
    </div>
  ` : `
    <div class="voter-found-card">
      <div class="voter-found-header">
        <div class="voter-photo-slot">${initials}</div>
        <div>
          <h3>${fullName}</h3>
          <p>Voter No: ${voter.voterRegistrationNumber || 'Not assigned'}</p>
          <p>District: ${voter.district || 'Not recorded'}</p>
          <p>Electoral Area: ${voter.electoralArea || voter.ward || 'Not recorded'}</p>
          <p>Polling Station: ${result.assignedPollingStation || 'Not assigned'}</p>
        </div>
      </div>
      <div class="voter-found-meta">
        <p>Permanent Status: ${permanentBadge}</p>
        <p>Election Status: ${electionBadge}</p>
      </div>
      ${stationWarning}
      ${privateVoteNote}
      <div class="voter-checkin-actions">
        <button class="primary-button" type="button" data-voter-checkin="${voter.id}" ${result.stationMatch === false || electionStatus === 'VOTED' ? 'disabled' : ''}>${electionStatus === 'VOTED' ? '✓ VOTED' : '✓ CHECK IN VOTER'}</button>
      </div>
    </div>
  `;
  panel.className = 'election-voter-result';
  panel.innerHTML = completionBlock;
}
async function loadElectionDayVoters() {
  const response = await fetch('/api/admin/election-day/voters', { headers: { 'X-User-Role': 'admin' } });
  const result = await response.json();
  const table = document.querySelector('#election-day-table');
  if (!table) return;
  if (!response.ok) { table.innerHTML = `<tr><td colspan="6" class="empty-cell">${result.error || 'Election-day data is unavailable.'}</td></tr>`; return; }
  table.innerHTML = result.items.length ? result.items.map(voter => {
    const permanentStatus = String(voter.permanentStatus || 'REGISTERED').toUpperCase();
    const electionStatus = String(voter.electionStatus || 'NOT_CHECKED_IN').toUpperCase().replace(/\s+/g, '_');
    const actionText = electionStatus === 'VOTED' ? 'Voted' : electionStatus === 'CHECKED_IN' ? 'Mark voted' : 'Check in';
    return `
      <tr>
        <td><div class="person"><span class="person-avatar">${(voter.firstName[0] || '') + (voter.lastName[0] || '')}</span>${voter.firstName} ${voter.lastName}</div></td>
        <td>${voter.voterRegistrationNumber || 'Pending assignment'}</td>
        <td>${buildStatusBadge(permanentStatus, permanentStatus)}</td>
        <td>${buildStatusBadge(electionStatus, electionStatus.replace(/_/g, ' '))}</td>
        <td>${voter.officialIdCardNumber || 'Not issued'}</td>
        <td><button class="row-action" data-voter-${electionStatus === 'VOTED' ? 'vote' : 'checkin'}="${voter.id}">${actionText}</button></td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6" class="empty-cell">No eligible voters are available for election-day tracking.</td></tr>';
}
async function checkInVoter(voterId, pollingStationCode = '') {
  const response = await fetch(`/api/admin/election-day/voters/${voterId}/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' },
    body: JSON.stringify({ pollingStationCode })
  });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || 'Could not check in this voter');
  showToast(result.message || 'Voter checked in successfully');
  loadElectionDaySummary();
  loadElectionDayVoters();
  renderElectionCheckInResult({
    voter: result.voter,
    registrationStatus: result.registrationStatus || 'ELIGIBLE',
    electionStatus: result.electionStatus || 'CHECKED_IN',
    stationMatch: true,
    assignedPollingStation: result.assignedPollingStation || result.voter.pollingStationCode || 'PS-009-04'
  });
}
async function markVoterAsVoted(voterId, pollingStationCode = '') {
  const response = await fetch(`/api/admin/election-day/voters/${voterId}/mark-voted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' },
    body: JSON.stringify({ pollingStationCode })
  });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || 'Could not update election-day status');
  showToast(result.message || 'Voting status updated');
  loadElectionDaySummary();
  loadElectionDayVoters();
  if (result.voter) {
    renderElectionCheckInResult({
      voter: result.voter,
      registrationStatus: result.registrationStatus || 'ELIGIBLE',
      electionStatus: result.electionStatus || 'VOTED',
      stationMatch: true,
      assignedPollingStation: result.assignedPollingStation || result.voter.pollingStationCode || 'PS-009-04'
    });
  }
}
async function recordVotingCompleted(voterId) {
  const voter = document.querySelector('#election-voter-search')?.value || '';
  await markVoterAsVoted(voterId, voter);
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
  const editing = Boolean(registrationDraft.applicationNumber);
  const field = (label, name, type = 'text', placeholder = '') => `<label>${label}<input name="${name}" type="${type}" ${type === 'file' && editing ? '' : 'required'} value="${type === 'file' ? '' : (registrationDraft[name] || '')}" placeholder="${placeholder}"></label>`;
  if (registrationStep === 1) {
    stepIntro.textContent = 'Tell us who the applicant is.';
    const photoCaptured = Boolean(registrationDraft.photoData);
    const photoPreview = photoCaptured ? `<img src="${registrationDraft.photoData}" alt="Captured voter photograph"><strong>✓ Photo captured</strong><small>Captured ${registrationDraft.photoCapturedAt || 'just now'}</small>` : '<span class="photo-placeholder-icon" aria-hidden="true">📷</span><strong>No photo captured yet</strong><small>Capture a clear photograph of the voter.</small>';
    const photoRemove = photoCaptured ? '<button class="text-button" type="button" data-remove-photo>Remove</button>' : '';
    stepContent.innerHTML = `<div class="form-row">${field('First name', 'firstName', 'text', 'John')}${field('Middle name', 'middleName', 'text', 'Optional')}</div><div class="form-row">${field('Last name', 'lastName', 'text', 'Kamara')}${field('Nationality', 'nationality', 'text', 'e.g. Sierra Leonean')}</div><div class="form-row">${field('Date of birth', 'dob', 'date')}${field('Sex', 'sex', 'text', 'Female, Male or Other')}</div><section class="photo-capture-section"><div class="photo-capture-heading"><div><p class="eyebrow">VOTER PHOTOGRAPH</p><h3>Capture a clear photograph of the voter.</h3><p>This image will be attached to the registration application.</p></div></div><div class="photo-preview">${photoPreview}</div><div class="photo-actions"><button class="secondary-button" type="button" data-capture-photo>📷 ${photoCaptured ? 'Retake Photo' : 'Capture Photo'}</button><button class="secondary-button" type="button" data-upload-photo>↑ Upload Photo</button>${photoRemove}<input class="photo-upload-input" type="file" accept="image/*" hidden></div><div class="photo-checks"><span>✓ Face clearly visible</span><span>✓ Good lighting</span><span>✓ No sunglasses or face covering</span></div></section><button class="primary-button submit-button" type="submit">Continue to Contact & Address <span>→</span></button>`;
  } else if (registrationStep === 2) {
    stepIntro.textContent = 'Add reliable ways to contact the applicant.';
    stepContent.innerHTML = `${field('Phone number', 'phone', 'tel', '+233 24 000 0000')}${field('Email address', 'email', 'email', 'applicant@example.com')}${field('Residential address', 'address', 'text', 'House number, street, town')}<button class="primary-button submit-button" type="submit">Continue to electoral information <span>→</span></button>`;
  } else if (registrationStep === 3) {
    stepIntro.textContent = 'Place the applicant in the correct electoral area.';
    stepContent.innerHTML = `${field('Region', 'region', 'text', 'e.g. Greater Accra')}${field('District', 'district', 'text', 'e.g. Central District')}${field('Constituency / ward', 'ward', 'text', 'e.g. Ward 04')}${field('Registration centre', 'centre', 'text', 'Select registration centre')}<button class="primary-button submit-button" type="submit">Continue to identification <span>→</span></button>`;
  } else if (registrationStep === 4) {
    stepIntro.textContent = 'Record an accepted identity document.';
    stepContent.innerHTML = `<label>Identification document<select name="documentType" required><option value="">Select document</option><option>National identity card</option><option>Passport</option><option>Driver's licence</option><option>Voter card replacement</option></select></label>${field('Document number', 'documentNumber', 'text', 'Enter document number')}<label>Upload document<input name="document" ${editing ? '' : 'required'} type="file" accept="image/*,.pdf"></label><p class="upload-note">Upload only where permitted by the relevant electoral authority.</p><button class="primary-button submit-button" type="submit">Continue to photo and biometrics <span>→</span></button>`;
  } else if (registrationStep === 5) {
    stepIntro.textContent = 'Capture the applicant photograph and any legally required biometrics.';
    stepContent.innerHTML = `<label>Biometrics record<input name="biometrics" type="file" accept="image/*,.pdf"></label><p class="upload-note">Biometrics are optional here and should only be collected where legally required.</p><button class="primary-button submit-button" type="submit">Review application <span>→</span></button>`;
  } else {
    stepIntro.textContent = 'Check the details before submitting to the registration officer.';
    const fullName = [registrationDraft.firstName, registrationDraft.middleName, registrationDraft.lastName].filter(Boolean).join(' ');
    stepContent.innerHTML = `<div class="review-summary"><div><span>Name</span><strong>${fullName || 'Not provided'}</strong></div><div><span>DOB</span><strong>${registrationDraft.dob || 'Not provided'}</strong></div><div><span>District</span><strong>${registrationDraft.district || 'Not provided'}</strong></div><div><span>Ward</span><strong>${registrationDraft.ward || 'Not provided'}</strong></div><div><span>Registration Centre</span><strong>${registrationDraft.centre || 'Not provided'}</strong></div></div><button class="primary-button submit-button" type="submit">Submit application <span>→</span></button>`;
  }
}

let voterCameraStream = null;
let pendingVoterPhoto = null;
function closePhotoCapture() {
  if (voterCameraStream) voterCameraStream.getTracks().forEach(track => track.stop());
  voterCameraStream = null;
  pendingVoterPhoto = null;
  document.querySelector('#photo-capture-modal').classList.remove('open');
  document.querySelector('#photo-capture-modal').setAttribute('aria-hidden', 'true');
}
async function openPhotoCapture() {
  const modal = document.querySelector('#photo-capture-modal');
  const video = document.querySelector('#photo-camera-video');
  const preview = document.querySelector('#photo-camera-preview');
  const captureButton = document.querySelector('#photo-capture-button');
  const retakeButton = document.querySelector('#photo-retake-button');
  preview.hidden = true;
  video.hidden = false;
  captureButton.textContent = '● Capture';
  retakeButton.hidden = true;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  try {
    voterCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = voterCameraStream;
  } catch (error) {
    document.querySelector('#photo-camera-error').textContent = 'Camera access is unavailable. Use Upload Photo instead.';
  }
}
function acceptPhoto(dataUrl) {
  registrationDraft.photoData = dataUrl;
  registrationDraft.photoCapturedAt = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  closePhotoCapture();
  renderRegistrationStep();
}
function captureVoterPhoto() {
  if (pendingVoterPhoto) return acceptPhoto(pendingVoterPhoto);
  const video = document.querySelector('#photo-camera-video');
  if (!video.videoWidth) return showToast('Camera is not ready yet');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  pendingVoterPhoto = canvas.toDataURL('image/jpeg', 0.88);
  document.querySelector('#photo-camera-preview').src = pendingVoterPhoto;
  document.querySelector('#photo-camera-preview').hidden = false;
  video.hidden = true;
  document.querySelector('#photo-capture-button').textContent = '✓ Use Photo';
  document.querySelector('#photo-retake-button').hidden = false;
}
function readUploadedPhoto(file) {
  if (!file || !file.type.startsWith('image/')) return showToast('Choose an image file');
  const reader = new FileReader();
  reader.onload = event => acceptPhoto(event.target.result);
  reader.readAsDataURL(file);
}

document.querySelector('#review-table').innerHTML = applications.slice(0, 4).map(item => tableRow(item)).join('');
document.querySelector('#applications-table').innerHTML = applications.map(item => tableRow(item, true)).join('');
document.querySelector('#election-search-button')?.addEventListener('click', () => searchVoterForCheckIn());
document.querySelector('#election-voter-search')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchVoterForCheckIn(); } });
document.querySelector('#station-search-voter')?.addEventListener('click', () => {
  const field = document.querySelector('#election-voter-search');
  if (field) field.focus();
});
document.querySelector('#station-scan-id')?.addEventListener('click', () => {
  showToast('QR scanner ready. Enter the voter ID or scan the code at the polling station.');
});
document.querySelector('#station-voter-checkin')?.addEventListener('click', () => {
  const field = document.querySelector('#election-voter-search');
  if (field && field.value.trim()) searchVoterForCheckIn(field.value.trim());
  else showToast('Enter a voter number or name to begin check-in.');
});
document.querySelector('#report-exception-button')?.addEventListener('click', async () => {
  const incidentType = document.querySelector('#exception-type')?.value?.trim();
  const description = document.querySelector('#exception-detail')?.value?.trim();
  if (!incidentType) return showToast('Select an exception type first.');
  const supervisorRequired = ['Voter already voted', 'Registration inactive', 'Duplicate identity concern', 'ID/card mismatch', 'Officer requires supervisor assistance'].includes(incidentType);
  const response = await fetch('/api/admin/election-day/exceptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' },
    body: JSON.stringify({ incidentType, description: description || 'No additional details supplied.', officerName: JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null')?.name || 'Officer', supervisorRequired })
  });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || 'Could not submit the incident.');
  showToast(supervisorRequired ? 'Incident escalated for supervisor review.' : 'Incident recorded successfully.');
  document.querySelector('#exception-type').value = '';
  document.querySelector('#exception-detail').value = '';
  loadElectionExceptions();
});
document.querySelector('#election-qr-scan')?.addEventListener('click', () => {
  showToast('QR scanner ready. Enter the voter ID or scan the code at the polling station.');
});

const views = ['overview', 'applications', 'voters', 'election', 'reports', 'admin'];
function closeTreeGroups() {
  document.querySelectorAll('.tree-group.open').forEach(group => {
    group.classList.remove('open');
    group.querySelector('.tree-toggle')?.setAttribute('aria-expanded', 'false');
  });
}
function showView(viewName) {
  views.forEach(view => document.querySelector(`#${view}-view`).classList.toggle('active-view', view === viewName));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
  document.querySelector('#page-title').textContent = viewName === 'election' ? 'Election Day / Voting' : viewName[0].toUpperCase() + viewName.slice(1);
  if (viewName === 'voters') loadVoters();
  if (viewName === 'election') { loadElectionDaySummary(); loadElectionDayVoters(); loadElectionExceptions(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-view-duplicate-application]')) {
    const appNumber = event.target.closest('[data-view-duplicate-application]').dataset.viewDuplicateApplication;
    const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
    if (session?.role === 'voter') { closeModal(); openUserApplicationStatus(appNumber); return; }
    if (session?.role === 'officer') { closeModal(); openOfficerApplication(appNumber); return; }
    closeModal(); showToast(`Existing application ${appNumber} is available in the queue.`);
    return;
  }
  if (event.target.closest('[data-return-to-registration]')) {
    duplicateCheckResult = null;
    renderRegistrationStep();
    return;
  }
  if (event.target.closest('[data-capture-photo]')) { openPhotoCapture(); return; }
  if (event.target.closest('[data-upload-photo]')) { document.querySelector('.photo-upload-input')?.click(); return; }
  if (event.target.closest('[data-remove-photo]')) { delete registrationDraft.photoData; delete registrationDraft.photoCapturedAt; renderRegistrationStep(); return; }
  if (event.target.closest('#close-photo-capture, #cancel-photo-capture')) { closePhotoCapture(); return; }
  if (event.target.closest('#photo-capture-button')) { captureVoterPhoto(); return; }
  if (event.target.closest('#photo-retake-button')) { pendingVoterPhoto = null; openPhotoCapture(); return; }
  if (event.target.closest('#voters-view .secondary-button')) { event.preventDefault(); openLatestApprovals(); return; }
  const userPanelButton = event.target.closest('[data-user-panel]');
  if (userPanelButton) {
    const panel = userPanelButton.dataset.userPanel;
    document.querySelectorAll('.user-tree [data-user-panel]').forEach(item => item.classList.toggle('active', item === userPanelButton));
    if (panel === 'new-registration') { openModal(); return; }
    document.querySelectorAll('.user-subpanel').forEach(item => item.classList.remove('selected'));
    if (panel === 'dashboard') document.querySelector('#user-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (panel === 'applications') document.querySelector('.user-view .role-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else { const target = document.querySelector(`#user-${panel}-panel`); target?.classList.add('selected'); target?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  const officerPanelButton = event.target.closest('[data-officer-panel]');
  if (officerPanelButton) {
    const panel = officerPanelButton.dataset.officerPanel;
    if (officerPanelButton.classList.contains('tree-toggle')) {
      const group = officerPanelButton.closest('.tree-group');
      const wasOpen = group.classList.contains('open');
      closeTreeGroups();
      group.classList.toggle('open', !wasOpen);
      officerPanelButton.setAttribute('aria-expanded', String(!wasOpen));
      if (!wasOpen) officerApplicationFilter = 'all';
      return;
    }
    document.querySelectorAll('.officer-tree [data-officer-panel]').forEach(item => item.classList.toggle('active', item === officerPanelButton));
    document.querySelectorAll('.officer-panel').forEach(item => item.classList.remove('selected'));
    if (panel === 'new-registration') { openModal(); return; }
    if (panel === 'dashboard' || panel === 'queue' || ['applications', 'draft', 'submitted', 'pending', 'correction', 'flagged', 'verified', 'approved', 'rejected'].includes(panel)) {
      if (['applications', 'draft', 'submitted', 'pending', 'correction', 'flagged', 'verified', 'approved', 'rejected'].includes(panel)) officerApplicationFilter = panel;
      if (panel === 'queue' || panel === 'dashboard') officerApplicationFilter = 'all';
      if (panel !== 'dashboard') loadOfficerApplications();
      document.querySelector('#officer-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (panel !== 'dashboard') document.querySelector('#officer-applications-table')?.closest('.role-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const target = document.querySelector(`#officer-panel-${panel}`);
      target?.classList.add('selected');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  const statusTrigger = event.target.closest('[data-status-number]');
  if (statusTrigger) { openUserApplicationStatus(statusTrigger.dataset.statusNumber); return; }
  if (event.target.closest('[data-voter-checkin]')) { const voterId = event.target.closest('[data-voter-checkin]').dataset.voterCheckin; checkInVoter(voterId, document.querySelector('#election-voter-search')?.value || ''); return; }
  if (event.target.closest('[data-voter-vote]')) { markVoterAsVoted(event.target.closest('[data-voter-vote]').dataset.voterVote, document.querySelector('#election-voter-search')?.value || ''); return; }
  if (event.target.closest('[data-voter-complete]')) { const voterId = event.target.closest('[data-voter-complete]').dataset.voterComplete; recordVotingCompleted(voterId); return; }
  if (event.target.closest('[data-close-processed-warning]')) {
    const panel = document.querySelector('#election-voter-result');
    panel.className = 'election-voter-result empty';
    panel.innerHTML = 'Search for a registered voter to begin the check-in process.';
    return;
  }
  if (event.target.closest('#close-user-application-status, #back-user-applications')) { const modal = document.querySelector('#user-application-status-modal'); modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); return; }
  const officerOpen = event.target.closest('[data-officer-open]');
  if (officerOpen) { openOfficerApplication(officerOpen.dataset.officerOpen); return; }
  const detailDecision = event.target.closest('[data-detail-decision]');
  if (detailDecision) { submitOfficerDetailDecision(detailDecision.dataset.detailDecision); return; }
  const editTrigger = event.target.closest('[data-edit-application]');
  if (editTrigger) { document.querySelector('#user-application-status-modal')?.classList.remove('open'); editUserApplication(editTrigger.dataset.editApplication); return; }
  const officerDecision = event.target.closest('[data-officer-decision]');
  if (officerDecision) {
    const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
    fetch(`/api/applications/${officerDecision.dataset.application}/officer-review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': String(session?.userId || ''), 'X-User-Role': session?.role || '' }, body: JSON.stringify({ decision: officerDecision.dataset.officerDecision }) }).then(async response => { const result = await response.json(); showToast(response.ok ? `${result.applicationNumber}: ${result.status}` : result.error); if (response.ok) loadOfficerApplications(); });
    return;
  }
  const officerAdminAction = event.target.closest('[data-officer-admin-action]');
  if (officerAdminAction) {
    const id = officerAdminAction.dataset.officerId;
    if (officerAdminAction.dataset.officerAdminAction === 'toggle') updateAdminOfficer(id, { status: officerAdminAction.dataset.officerStatus === 'active' ? 'inactive' : 'active' });
    if (officerAdminAction.dataset.officerAdminAction === 'view') showAdminOfficerActivity(id);
    if (officerAdminAction.dataset.officerAdminAction === 'activity') showAdminOfficerActivity(id);
    if (officerAdminAction.dataset.officerAdminAction === 'edit') { const name = prompt('Officer name', officerAdminAction.dataset.officerName || ''); if (name?.trim()) updateAdminOfficer(id, { name: name.trim() }); }
    return;
  }
  const centreSelect = event.target.closest('.officer-centre-select');
  if (centreSelect) { updateAdminOfficer(centreSelect.dataset.officerId, { centreId: centreSelect.value || null }); return; }
  const treeToggle = event.target.closest('.tree-toggle');
  if (treeToggle) {
    const group = treeToggle.closest('.tree-group');
    const wasOpen = group.classList.contains('open');
    closeTreeGroups();
    group.classList.toggle('open', !wasOpen);
    treeToggle.setAttribute('aria-expanded', String(!wasOpen));
    showView(treeToggle.dataset.view);
    return;
  }
  if (event.target.closest('.tree-child')) closeTreeGroups();
  else if (event.target.closest('.admin-tree .nav-item')) closeTreeGroups();
  const viewTrigger = event.target.closest('[data-view]');
  if (viewTrigger) showView(viewTrigger.dataset.view);
  if (event.target.closest('#open-registration, #quick-register, #applications-new, #user-new-registration')) openModal();
  const rowAction = event.target.closest('.row-action');
  if (rowAction) openApplicant(rowAction.dataset.applicant);
  const voterAction = event.target.closest('[data-voter]');
  if (voterAction) openVoterRecord(voterAction.dataset.voter);
  const adminAction = event.target.closest('[data-admin-action]');
  if (adminAction) showToast(`${adminAction.dataset.adminAction[0].toUpperCase() + adminAction.dataset.adminAction.slice(1)} management opened`);
  const roleSelect = event.target.closest('.admin-role-select');
  if (roleSelect) {
    const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
    fetch(`/api/admin/users/${roleSelect.dataset.userId}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Role': session?.role || '' }, body: JSON.stringify({ role: roleSelect.value }) }).then(response => showToast(response.ok ? 'User role updated' : 'Could not update user role'));
  }
  const userStatusAction = event.target.closest('[data-user-status-action]');
  if (userStatusAction) { updateAdminUserStatus(userStatusAction.dataset.userId, userStatusAction.dataset.userStatusAction); return; }
});
document.addEventListener('change', event => {
  if (event.target.matches('.photo-upload-input')) readUploadedPhoto(event.target.files[0]);
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
let selectedVoterRecordId = null;
async function openVoterRecord(id) {
  selectedVoterRecordId = Number(id);
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`/api/admin/voters/${id}`, { headers: { 'X-User-Role': session?.role || 'admin', 'X-User-Id': String(session?.userId || '') } });
  if (!response.ok) { showToast('Permission is required to view this voter record'); return; }
  const voter = await response.json();
  document.querySelector('#record-number').textContent = voter.voterRegistrationNumber;
  document.querySelector('#record-card-number').textContent = voter.officialIdCardNumber || 'Not issued';
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
async function issueOfficialIdCard() {
  if (!selectedVoterRecordId) return showToast('Select a voter record first');
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const response = await fetch(`/api/admin/eligible-voters/${selectedVoterRecordId}/issue-id-card`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin', 'X-User-Id': String(session?.userId || '') } });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || 'ID card could not be issued');
  document.querySelector('#record-card-number').textContent = result.cardNumber;
  showToast(`Official ID card issued: ${result.cardNumber}`);
  loadVoters();
}
function closeVoterRecord() { selectedVoterRecordId = null; voterRecordModal.classList.remove('open'); voterRecordModal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-voter-record').addEventListener('click', closeVoterRecord);
document.querySelector('#back-directory').addEventListener('click', closeVoterRecord);
voterRecordModal.addEventListener('click', event => { if (event.target === voterRecordModal) closeVoterRecord(); });
document.querySelector('#record-card-status').addEventListener('click', issueOfficialIdCard);
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
        'APPLICATION_REVIEWED': { icon: '◉', color: 'blue' },
        'VOTER_RECORD_CREATED': { icon: '✓', color: 'green' },
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
function renderDuplicateRegistrationWarning(match) {
  const formArea = document.querySelector('#registration-step-content');
  if (!formArea) return;
  const fullName = [match.firstName, match.lastName].filter(Boolean).join(' ') || 'Applicant';
  formArea.innerHTML = `
    <div class="duplicate-registration-alert">
      <p class="eyebrow">DUPLICATE REGISTRATION DETECTED</p>
      <h3>Possible existing registration for ${fullName}</h3>
      <p>We found an existing application that may belong to this voter. The system will not allow a second active registration for the same person.</p>
      <div class="duplicate-card">
        <div><span>Name</span><strong>${fullName}</strong></div>
        <div><span>Application</span><strong>${match.applicationNumber}</strong></div>
        <div><span>Area</span><strong>${match.district || 'Area pending'} · ${match.ward || 'Ward pending'}</strong></div>
        <div><span>Status</span><strong>${match.status || 'Under Verification'}</strong></div>
      </div>
      <div class="duplicate-actions">
        <button class="primary-button" type="button" data-view-duplicate-application="${match.applicationNumber}">View Existing Application</button>
        <button class="secondary-button" type="button" data-return-to-registration>Return to Registration</button>
      </div>
    </div>
  `;
}
function openModal() { registrationStep = 1; registrationDraft = {}; renderRegistrationStep(); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.querySelector('input[name="firstName"]').focus(); }
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
document.querySelector('#close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

document.querySelector('#registration-form').addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  Object.assign(registrationDraft, Object.fromEntries(formData.entries()));
  if (registrationStep === 1 && !registrationDraft.photoData) return showToast('Capture or upload a voter photo before continuing');
  if (registrationStep < 6) { registrationStep += 1; renderRegistrationStep(); return; }
  const record = { ...registrationDraft, name: [registrationDraft.firstName, registrationDraft.middleName, registrationDraft.lastName].filter(Boolean).join(' ') };
  const session = JSON.parse(sessionStorage.getItem('civicpassAdmin') || 'null');
  const editingApplicationNumber = registrationDraft.applicationNumber;
  try {
    const duplicateCheck = await checkForDuplicateRegistration(record);
    if (duplicateCheck?.duplicate) {
      renderDuplicateRegistrationWarning(duplicateCheck.match);
      showToast('Duplicate registration blocked. Existing application found.');
      return;
    }
    const savedRecord = editingApplicationNumber && session?.role === 'voter' ? await fetch(`/api/user/applications/${editingApplicationNumber}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-User-Id': String(session.userId), 'X-User-Role': session.role }, body: JSON.stringify(record) }).then(response => response.json()) : await saveApplication(record);
    closeModal();
    showToast(`Application ${savedRecord.applicationNumber} submitted`);
    if (session?.role === 'voter') loadUserApplications();
    else showView('applications');
  } catch (error) {
    if (error.duplicate) {
      renderDuplicateRegistrationWarning(error.duplicate);
      showToast('Duplicate registration blocked. Existing application found.');
      return;
    }
    showToast(error.message || 'The application could not be saved.');
  }
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
      const lifecycleView = { DRAFT: 'draft', SUBMITTED: 'submitted', UNDER_REVIEW: 'pending-review', FLAGGED: 'flagged', CORRECTION_SUBMITTED: 'pending-review', APPROVED: 'approved', REJECTED: 'rejected', REGISTERED: 'approved', VOTER_RECORD_CREATED: 'approved' };
      this.current = lifecycleView[app.lifecycleStatus] || (app.status ? app.status.toLowerCase().replaceAll(' ', '-') : 'draft');
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
      'under-review': 'UNDER REVIEW',
      'flagged': 'FLAGGED',
      'rejected': 'REJECTED',
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
document.querySelector('#user-status-form').addEventListener('submit', async event => {
  event.preventDefault();
  const number = document.querySelector('#user-status-number').value.trim().toUpperCase();
  const result = document.querySelector('#user-status-result');
  const application = await getApplication(number).catch(() => null);
  result.innerHTML = application ? `<p class="role-status-found"><strong>${application.applicationNumber}</strong> · ${application.lifecycleStatus || application.status}</p>` : '<p class="status-error">No application found. Check the application number.</p>';
});
document.querySelector('#refresh-user-applications').addEventListener('click', loadUserApplications);
document.querySelector('#refresh-officer-applications').addEventListener('click', loadOfficerApplications);
document.querySelector('#close-officer-detail').addEventListener('click', () => { selectedOfficerApplication = null; document.querySelector('#officer-detail-panel').classList.remove('selected'); });
document.querySelector('#load-admin-users').addEventListener('click', loadAdminUsers);
document.querySelector('#load-admin-officers').addEventListener('click', loadAdminOfficers);
document.addEventListener('click', async event => {
  if (!event.target.closest('#add-admin-officer')) return;
  const name = prompt('Officer name');
  const email = name && prompt('Officer email');
  const password = email && prompt('Temporary password');
  if (!name || !email || !password) return;
  const response = await fetch('/api/admin/officers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Role': 'admin' }, body: JSON.stringify({ name, email, password }) });
  const result = await response.json();
  showToast(response.ok ? `${result.name} created as officer` : result.error);
  if (response.ok) loadAdminOfficers();
});
document.querySelector('#save-settings').addEventListener('click', () => showToast('System settings saved'));
statusForm.addEventListener('submit', async event => {
  event.preventDefault();
  const number = document.querySelector('#status-number').value.trim().toUpperCase();
  const saved = await getApplication(number).catch(() => null);
  if (number !== 'VR-2026-000125' && (!saved || number !== saved.applicationNumber)) {
    statusResult.innerHTML = '<p class="status-error">No application found. Check the number and try again.</p>';
    return;
  }
  const application = number === 'VR-2026-000125' ? { applicationNumber: number, name: 'John Kamara' } : saved;
  const lifecycleLabels = { DRAFT: 'Draft', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', FLAGGED: 'Flagged', CORRECTION_SUBMITTED: 'Correction Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', REGISTERED: 'Registered', VOTER_RECORD_CREATED: 'Voter Record Created' };
  const displayStatus = lifecycleLabels[application.lifecycleStatus] || application.status || 'Under Review';
  statusResult.innerHTML = `<div class="status-result-heading"><div><span class="status-number">Application: ${application.applicationNumber}</span><h3>Status: <mark>${displayStatus}</mark></h3></div><span class="verification-badge">● Active</span></div><div class="verification-timeline"><div class="timeline-item complete"><span>✓</span><div><strong>Application submitted</strong><small>Received by CivicPass</small></div></div><div class="timeline-item complete"><span>✓</span><div><strong>Documents received</strong><small>Identity documents are on file</small></div></div><div class="timeline-item complete"><span>✓</span><div><strong>Identity verification</strong><small>Initial checks completed</small></div></div><div class="timeline-item current"><span>⏳</span><div><strong>Officer review</strong><small>Your application is being reviewed</small></div></div><div class="timeline-item"><span>○</span><div><strong>Registration approved</strong><small>Pending final decision</small></div></div></div>`;
});
