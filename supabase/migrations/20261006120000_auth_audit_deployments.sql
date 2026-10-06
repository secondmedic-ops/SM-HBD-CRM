-- Login roles, audit trail and deployment log (sb-spring-cf-stack standard tables).

-- A role set by hand for a Supabase user: ADMIN (first admin is made with the SQL printed by START-HERE.bat).
-- Everyone else gets their role from Staff mapping (staff email = INCHARGE / STAFF, accounts team email = ACCOUNTS).
create table if not exists public.user_roles (
    user_id    uuid primary key references auth.users on delete cascade,
    role       text not null,
    created_at timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'user_roles_role_check') then
        alter table public.user_roles add constraint user_roles_role_check
            check (role in ('ADMIN', 'ACCOUNTS', 'INCHARGE', 'STAFF'));
    end if;
end $$;

-- Who changed what (written by the backend inside the same transaction as the change).
-- Personal data (client names, phones, the text of daily updates, images) is never written here.
create table if not exists public.audit_log (
    id         bigserial primary key,
    at         timestamptz not null default now(),
    user_id    uuid,
    action     text not null,
    table_name text not null,
    row_id     text,
    before     jsonb,
    after      jsonb
);
create index if not exists idx_audit_log_at on public.audit_log (at desc);

-- Every ship: commit, what changed, who, success/failure, link to the pipeline run.
create table if not exists public.deployments (
    id      bigserial primary key,
    at      timestamptz not null default now(),
    sha     text not null,
    subject text,
    author  text,
    areas   text,
    status  text not null,
    run_url text
);

-- The backend connects as postgres (bypasses RLS) and does all authorization itself.
-- RLS on with no policies closes these tables to Supabase's public Data API.
alter table public.user_roles  enable row level security;
alter table public.audit_log   enable row level security;
alter table public.deployments enable row level security;
