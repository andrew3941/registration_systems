# CivicPass Registration System

## Run locally

```powershell
npm install
npm start
```

Open `http://localhost:3000`.

The server stores records in `civicpass.db` using SQLite. New registrations are written to normalized tables in a single transaction:

- `users`
- `voter_applications`
- `voters`
- `identity_documents`
- `registration_centres`
- `officers`
- `verification_records`
- `audit_logs`

The legacy `applications` table remains for compatibility with the prototype queue and is not the source of truth for new registration data.

## Demo roles

The server seeds development-only accounts on first start:

- Admin: `admin@civicpass.local` / `ChangeMe-Admin-2026`
- Officer: `officer@civicpass.local` / `ChangeMe-Officer-2026`

Change or remove these credentials before any deployment. The login endpoint is `POST /api/auth/login`.

## Security notes

Sensitive voter data is stored server-side and is never written to browser storage. Passwords use salted `scrypt` hashes. Foreign keys and transaction boundaries protect relational integrity, and submissions and decisions create audit events.

This is a local prototype. Production deployment still requires HTTPS, real session/token authentication, role middleware on every admin route, encrypted document storage, secrets from environment variables, backups, monitoring, retention rules, and eligibility/document rules approved by the relevant electoral authority.