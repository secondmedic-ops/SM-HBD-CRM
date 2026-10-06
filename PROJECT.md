# SM HBD CRM

Sales, revenue and staff-performance tracker for SecondMedic's healthcare business-development team (Mohan's team):
revenue entries with payment slips, outstanding payments, daily updates, staff targets and department targets. It runs
on the **sb-spring-cf-stack** pipeline: one push checks and ships the database, the API and the frontend together, all
on free plans.

- GitHub repo: secondmedic-ops/SM-HBD-CRM (`main` = production)
- Live URL: https://sm-hbd-crm.secondmedic.workers.dev
- Cloudflare Worker: `sm-hbd-crm` (Workers **Free** plan), everything in `cloudflare/`. ONE Worker is the whole app:
  `/api/*` is the backend (TypeScript: `src/api`, `src/services`, `src/domain`), everything else is the React build `dist/`.
- Database access: Cloudflare **Hyperdrive** config `sm-hbd-crm-db` (free: 100,000 queries a day), created and updated
  by the pipeline (`scripts/hyperdrive.mjs`) from the GitHub secret `SUPABASE_DB_URL`, caching off.
- Supabase project: a project of its own (not SM ERP's or the Corporate CRM's: tables and migration history would clash).
- Supabase project ref: exabofknlxihojcxalxj   region: ap-south-1   URL: https://exabofknlxihojcxalxj.supabase.co
- DB pooler host: aws-0-ap-south-1.pooler.supabase.com   user: postgres.exabofknlxihojcxalxj
- Auth: Supabase Auth with ES256 signing keys, verified in the Worker with `jose` against
  `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`).
  Every `/api` call needs a token, except `/api/v1/health`, `/api/version` and `/api/actuator/health(/liveness)`.
- Roles (worked out per login in `cloudflare/src/api/auth.ts`, cached 60 s):
  - **ADMIN**: `public.user_roles` row (first admin: the SQL START-HERE.bat prints). Everything, incl. Staff mapping.
  - **ACCOUNTS**: email in Staff mapping > Accounts team logins. Sees and edits all departments, all amounts; no Staff mapping.
  - **INCHARGE**: email on a staff row with role Incharge. Works with their **team** = themselves + the staff whose
    `staff.incharge_id` points at them (entries, outstanding, clients, daily updates; may delete the team's entries).
    My team tab: adds Team members to their own team, edits their name / designation / project / target / email and
    makes their logins. Role, department and who reports to whom are set by ADMIN in Staff mapping (Reports to).
  - **STAFF**: email on a staff row with role Team. Only their own entries, outstanding and clients (never cost or
    profit), their team's daily updates; cannot delete entries.
  - A login whose email is in none of these has no role and sees nothing.
- Logins: Staff mapping > Create login (ADMIN) makes the Supabase user or sets a new password. It needs the Worker
  secret `SUPABASE_SERVICE_ROLE_KEY`, set once with `STAFF-LOGINS-KEY.bat`.
- Sensitive fields kept out of `audit_log`: client names, staff names and emails, daily update text, images.
- Images (payment slips, outstanding screenshots) are shrunk in the browser (`src/lib/image.ts`, about 100-300 KB) and
  kept in `public.attachments`; lists carry only the id, `GET /api/v1/attachments/{id}` checks who may see it.
  The Supabase free database (500 MB) holds a few thousand of them.

## Commands (Windows, in this folder)

| What | How |
|---|---|
| First-time setup (GitHub secrets, Cloudflare key, Supabase connection) | `START-HERE.bat` |
| Ship any change (commit, push, watch the pipeline) | `SHIP.bat` |
| Let Staff mapping create logins | `STAFF-LOGINS-KEY.bat` (once) |
| Replace a bad Cloudflare token | `CLOUDFLARE-TOKEN.bat` |
| Try it on this computer (test database, no login) | `RUN-LOCAL-TEST.bat` |

## Rollback

GitHub > Actions > ship > **Run workflow**: `ref` = the last good `deploy-*` tag, tick `skip_db`. The database never
rolls back; reverse a bad migration with a new one.

## When AI Studio touched Claude-owned files (step 1 blocked the push)

Nothing was deployed. PowerShell in this folder:
`git fetch --tags; $t = git tag --list "deploy-*" | Select-Object -Last 1; git restore --source $t -- cloudflare supabase .github scripts docs PROJECT.md CLAUDE.md src/api.ts src/AuthGate.tsx src/main.tsx src/lib src/context/AppContext.tsx`, then `SHIP.bat`.
