# Redi GST

A small multi-tenant invoicing service with GST calculation. Several companies (tenants) share the same database and the same API, but no tenant can ever see or touch another tenant's data. The isolation is enforced twice over, once in the application layer and once inside Postgres itself, so a mistake in one layer does not turn into a data leak.

The stack is a Node/Express API, a Postgres database, and a React frontend. You can run the whole thing with a single Docker command, or run each piece by hand with npm if you prefer.

## What it does

- Create tenants (organizations) and switch between them from the UI.
- Create invoices with multiple line items, each with its own GST rate.
- Automatic GST math: CGST and SGST split per line, rolled up into invoice totals.
- Void an invoice (it is marked cancelled, never hard deleted).
- A per-tenant audit log that records what happened and when.
- Keyset pagination on the invoice and audit lists, so they stay fast even with a large history.

## Tech stack

- Backend: Node 20, Express, `pg` (no ORM, plain SQL).
- Database: Postgres 16 with Row Level Security.
- Frontend: React 18, Vite, Tailwind CSS.
- Local orchestration: Docker Compose.

## How the multi-tenancy works

This is the part I spent the most time getting right, so it is worth explaining.

Every request to a tenant-scoped route has to carry an `X-Tenant-Id` header. A piece of middleware checks that the header is a valid UUID and that the tenant actually exists and is active. If any of that fails the request is rejected before it ever reaches the database.

That alone is not enough though, because a single missed `WHERE tenant_id = ...` in a query would be a cross-tenant leak. So the real guarantee lives in the database. Before running a tenant's queries, the app opens a transaction and sets a session variable, `app.current_tenant`, scoped to that transaction only. Postgres Row Level Security policies on `invoices`, `invoice_line_items`, and `audit_logs` then compare every row against that variable. If the tenant context is not set, the policies return zero rows instead of everything, which is a safe default rather than a leak.

A couple of details that matter:

- The policies use `set_config(..., true)`, so the tenant setting is local to the transaction and is cleared automatically on commit or rollback. It can never bleed into the next request that reuses the same pooled connection.
- `FORCE ROW LEVEL SECURITY` is switched on, so even the table owner is subject to the policies.
- The app connects as a least-privilege role (`app_user`) that can read and write invoices but cannot, for example, delete an invoice or edit an audit entry.

There is a script that proves all of this rather than asking you to take my word for it. See "Verifying tenant isolation" below.

## GST calculation

GST rates are limited to the standard bands (0, 5, 12, 18, 28) and that list is enforced in three places: the frontend dropdown, the calculation helper, and a `CHECK` constraint in the database.

For each line item the total GST is split evenly into CGST and SGST. To avoid the classic rounding mismatch where the two halves do not add back up to the whole, SGST is calculated as the remainder after CGST rather than being rounded on its own. All the money math runs through a small `round2` helper to keep floating point drift out of the totals. The calculation logic is pure and lives in one file (`backend/src/utils/gst.js`), and it is reused by both the API and the seed script so the numbers can never drift apart.

## Running it

You have two options. Docker is the quickest way to see it working. The npm route is there if you would rather run each part directly.

### Option 1: Docker (recommended)

You need Docker Desktop. From the project root:

```bash
cp .env.example .env
docker compose up -d --build
```

That brings up three services (Postgres, the API, and the frontend) plus a one-off job that seeds two demo tenants with sample invoices. The database migrations run automatically the first time the database volume is created.

Once it is up:

- Frontend: http://localhost:5173
- API: http://localhost:4000
- Postgres (from the host): localhost:5433

To stop it, and to wipe the data if you want a clean slate:

```bash
docker compose down       # stop
docker compose down -v     # stop and delete the database volume
```

One thing worth knowing: the backend and seed code is copied into the image at build time, so if you change backend code you need to rebuild with `docker compose up -d --build` for it to take effect. The frontend is mounted live, so its changes show up without a rebuild.

### Option 2: Running locally with npm

You need Node 20 or newer and a Postgres 16 instance running on localhost:5432.

**Database and migrations.** Create the database, then apply the migration files in order. The third one is a shell script (it reads the app role's password from the environment), so run that step from Git Bash or WSL on Windows:

```bash
createdb -U postgres redi_gst

psql -U postgres -d redi_gst -f backend/migrations/001_create_organizations.sql
psql -U postgres -d redi_gst -f backend/migrations/002_create_invoices.sql
APP_USER_PASSWORD=redigst POSTGRES_USER=postgres POSTGRES_DB=redi_gst bash backend/migrations/003_app_role_grants.sh
psql -U postgres -d redi_gst -f backend/migrations/004_create_audit_logs.sql
```

Migration 003 creates the `app_user` role. The password you give it here has to match `DB_PASSWORD` in `backend/.env`, which is `redigst` by default.

**Backend.**

```bash
cd backend
cp .env.example .env
npm install
npm run seed      # loads the two demo tenants and sample invoices
npm start         # API on http://localhost:4000
```

**Frontend.** In a second terminal:

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

## Seed data

The seed script (`npm run seed`) creates two tenants, "Mohit traders" and "Bharat SME Traders", each with a few sample invoices. The samples deliberately cover every GST band, including the 0 percent zero-rated case, so the calculation is easy to sanity check. The script is safe to run more than once; it skips invoices that already exist rather than duplicating them.

## API overview

Routes under `/api/invoices` and `/api/audit-log` require an `X-Tenant-Id` header (the UUID of an existing, active tenant). The organization routes do not, since you cannot require a tenant in order to create the first one.

| Method | Path | Header | What it does |
| ------ | ---- | ------ | ------------ |
| GET | `/api/organizations` | none | List tenants |
| POST | `/api/organizations` | none | Create a tenant (slug is derived from the name) |
| GET | `/api/invoices` | `X-Tenant-Id` | List invoices, newest first (`?limit`, `?cursor`) |
| POST | `/api/invoices` | `X-Tenant-Id` | Create an invoice with line items |
| GET | `/api/invoices/:id` | `X-Tenant-Id` | One invoice with its line items |
| PATCH | `/api/invoices/:id/void` | `X-Tenant-Id` | Void (cancel) an invoice |
| GET | `/api/audit-log` | `X-Tenant-Id` | Tenant activity feed (`?limit`, `?cursor`) |

Pagination is keyset based. The list responses include a `nextCursor`, and you pass it back as `?cursor=` to get the following page. This keeps paging fast no matter how deep into the list you go, unlike offset paging which gets slower the further you scroll.

## Verifying tenant isolation

There is a standalone script that tries to break isolation on purpose and reports what happened:

```bash
cd backend
npm run verify-isolation
```

It runs after you have seeded the data and checks, among other things, that one tenant cannot read another tenant's invoices, that a forged insert with someone else's tenant id is blocked, that a query with no tenant context returns nothing instead of everything, and that the audit log is isolated the same way. Every check should print PASS.

## Project layout

```
backend/
  migrations/        SQL and shell files, run in order to build the schema
  scripts/           the isolation verification script
  seeds/             demo data
  src/
    config/          database pool
    db/              the withTenant transaction wrapper
    middleware/      the tenant resolver
    controllers/     invoices, organizations, audit log
    routes/          route definitions
    utils/           GST calculation
frontend/
  src/
    components/      tenant switcher, invoice list and form, detail modal, history
    api.js           thin fetch wrapper around the backend
docker-compose.yml   ties the database, api, seed job and frontend together
```

## A few notes on decisions

- I used plain SQL through `pg` rather than an ORM. For a project this size the queries are clearer without the extra layer, and it keeps the Row Level Security behaviour explicit and easy to reason about.
- Invoices are voided, not deleted. There is a `voided_at` column and the row stays around. A cancelled invoice still needs to exist for the record.
- The audit log doubles as a second, independent proof of isolation. If it ever leaked across tenants that would be just as bad as the invoices leaking, so it gets the exact same RLS treatment.
- Money is stored as `NUMERIC`, never floating point, and all the arithmetic is rounded through a single helper.
