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

## Database relationships

The local `civicpass.db` SQLite database stores the role relationships used by the app:

- `users` stores every account and its role: `admin`, `officer`, or `voter`.
- `admin_profiles` extends administrator accounts without duplicating login data.
- `officers.user_id` links an officer profile to `users`; `officers.created_by_admin_id` records which admin created it.
- `voter_applications.user_id` links an application to its submitting user, while `assigned_officer_id` links it to the officer responsible for review.
- `application_assignments` stores assignment history and the admin who assigned each case.
- `application_reviews` stores each officer decision, reason, and review timestamp.
- `voters.application_id` links the official voter record to the application that created it.
- `audit_logs.user_id` links important actions back to the authenticated account.

An officer is an operator, not the voter. When an officer submits a registration, `voter_applications.created_by_user_id` stores the officer account and `voter_applications.user_id` remains empty unless the applicant has a separate voter login. This allows one officer account to create and process many different voter applications.

Admin assignment is available through `PATCH /api/admin/applications/:applicationNumber/assign` with `{ "officerId": 1 }`. Officer queues are scoped to the authenticated officer's assigned applications.

## Application lifecycle

Applications expose the existing `status` value for compatibility and an additive canonical `lifecycleStatus` value:

`DRAFT` -> `SUBMITTED` -> `UNDER_REVIEW` -> `FLAGGED` -> `CORRECTION_SUBMITTED` -> `UNDER_REVIEW` -> `APPROVED` -> `REGISTERED` -> `VOTER_RECORD_CREATED`

`REJECTED` is a terminal alternative to the review path. The lifecycle history for an application is available from `GET /api/applications/:applicationNumber/lifecycle`.

## Demo roles

The server seeds development-only accounts on first start:

- Admin login name: `Amara Mensah` / `ChangeMe-Admin-2026`
- Officer: `Registration Officer` / `ChangeMe-Officer-2026`
- User: `CivicPass User` / `ChangeMe-User-2026`

Change or remove these credentials before any deployment. The login endpoint is `POST /api/auth/login`.

## Security notes

Sensitive voter data is stored server-side and is never written to browser storage. Passwords use salted `scrypt` hashes. Foreign keys and transaction boundaries protect relational integrity, and submissions and decisions create audit events.

This is a local prototype. Production deployment still requires HTTPS, real session/token authentication, role middleware on every admin route, encrypted document storage, secrets from environment variables, backups, monitoring, retention rules, and eligibility/document rules approved by the relevant electoral authority.