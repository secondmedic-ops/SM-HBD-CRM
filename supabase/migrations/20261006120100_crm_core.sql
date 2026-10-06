-- SM HBD CRM (Mohan's team): departments, staff, revenue entries, outstanding payments, daily updates,
-- slip / screenshot images and the accounts team logins. All reads and writes go through the Worker.

create table if not exists public.departments (
    name       text primary key,
    target     numeric(14,2) not null default 0,
    sort_order int not null default 0,
    updated_at timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'departments_target_check') then
        alter table public.departments add constraint departments_target_check check (target >= 0);
    end if;
end $$;
-- The five departments of the team with their monthly targets (Airoli 6L, MDSA 7L, Corporate 6L, BD 6L, Campaign 6L).
insert into public.departments (name, target, sort_order) values
    ('AIROLI', 600000, 1), ('MDSA', 700000, 2), ('CORPORATE', 600000, 3), ('BD', 600000, 4), ('CAMPAIGN', 600000, 5)
on conflict (name) do nothing;

create table if not exists public.staff (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    dept              text not null references public.departments (name) on update cascade,
    role              text not null default 'Team',
    designation       text not null default '',
    project           text not null default '',
    individual_target numeric(14,2) not null default 0,
    -- Work email of the person's login: links the login to this row (INCHARGE / STAFF view).
    email             text,
    active            boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'staff_role_check') then
        alter table public.staff add constraint staff_role_check check (role in ('Incharge', 'Team'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'staff_target_check') then
        alter table public.staff add constraint staff_target_check check (individual_target >= 0);
    end if;
end $$;
create unique index if not exists ux_staff_email on public.staff (lower(email)) where email is not null and active;
create index if not exists idx_staff_dept on public.staff (dept) where active;

-- The team as it was set up in the first version of the app (only when the table is still empty).
insert into public.staff (name, dept, role, designation, project, individual_target)
select v.name, v.dept, v.role, v.designation, v.project, v.target
from (values
    ('Manoj',   'AIROLI',    'Incharge', 'Sr. Development Executive',  'AIROLI General',       300000),
    ('Supriya', 'AIROLI',    'Team',     'Lab Technician - Execution', 'AIROLI Lab',           150000),
    ('Sakshi',  'AIROLI',    'Team',     'Lab Technician - Execution', 'AIROLI Lab',           150000),
    ('Nihal',   'MDSA',      'Team',     'Field Officer (Ranchi)',     'MDSA Ranchi',          700000),
    ('Ranju',   'CORPORATE', 'Incharge', 'BDM',                        'Gynoveda',             200000),
    ('Mansi',   'CORPORATE', 'Team',     'BDE - Execution',            'Gynoveda',             200000),
    ('Leena',   'CORPORATE', 'Team',     'BDE - Execution',            'Gynoveda',             200000),
    ('Promod',  'BD',        'Team',     'BDM',                        'BD Growth',            300000),
    ('Vandana', 'BD',        'Team',     'BDE',                        'BD Growth',            300000),
    ('Mohan',   'CAMPAIGN',  'Incharge', 'BDM',                        'SecondMedic Campaign', 600000)
) as v(name, dept, role, designation, project, target)
where not exists (select 1 from public.staff);

-- Payment slips and outstanding screenshots, as compressed image data URLs (the browser shrinks them before upload).
create table if not exists public.attachments (
    id         uuid primary key default gen_random_uuid(),
    mime       text not null,
    data       text not null,
    bytes      int not null,
    created_by uuid,
    created_at timestamptz not null default now()
);

create table if not exists public.revenue_entries (
    id              uuid primary key default gen_random_uuid(),
    entry_date      date not null,
    staff_id        uuid not null references public.staff (id),
    -- Department at the time of the entry (stays with the entry if the person later moves).
    dept            text not null references public.departments (name) on update cascade,
    client          text not null,
    type            text not null,
    amount          numeric(14,2) not null,
    cost            numeric(14,2) not null default 0,
    is_new_client   boolean not null default false,
    amount_received numeric(14,2) not null default 0,
    due_date        date,
    slip_id         uuid references public.attachments (id) on delete set null,
    created_by      uuid,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'revenue_entries_type_check') then
        alter table public.revenue_entries add constraint revenue_entries_type_check check (type in ('Individual', 'Corporate'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'revenue_entries_amounts_check') then
        alter table public.revenue_entries add constraint revenue_entries_amounts_check
            check (amount > 0 and cost >= 0 and amount_received >= 0 and amount_received <= amount);
    end if;
end $$;
create index if not exists idx_revenue_date on public.revenue_entries (entry_date desc);
create index if not exists idx_revenue_staff on public.revenue_entries (staff_id);
create index if not exists idx_revenue_dept on public.revenue_entries (dept);

create table if not exists public.outstanding_payments (
    id               uuid primary key default gen_random_uuid(),
    -- Set when the outstanding came from a revenue entry (Outstanding / Partly paid); deleted with it.
    revenue_entry_id uuid unique references public.revenue_entries (id) on delete cascade,
    client           text not null,
    staff_id         uuid not null references public.staff (id),
    dept             text not null references public.departments (name) on update cascade,
    amount           numeric(14,2) not null,
    amount_paid      numeric(14,2) not null default 0,
    due_date         date not null,
    screenshot_id    uuid references public.attachments (id) on delete set null,
    created_by       uuid,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'outstanding_amounts_check') then
        alter table public.outstanding_payments add constraint outstanding_amounts_check
            check (amount >= 0 and amount_paid >= 0 and amount_paid <= amount);
    end if;
end $$;
create index if not exists idx_outstanding_staff on public.outstanding_payments (staff_id);
create index if not exists idx_outstanding_dept on public.outstanding_payments (dept);

create table if not exists public.daily_updates (
    id          uuid primary key default gen_random_uuid(),
    update_date date not null,
    staff_id    uuid not null references public.staff (id),
    dept        text not null references public.departments (name) on update cascade,
    update_text text not null,
    clients_met int not null default 0,
    created_by  uuid,
    created_at  timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'daily_updates_clients_check') then
        alter table public.daily_updates add constraint daily_updates_clients_check check (clients_met between 0 and 500);
    end if;
end $$;
create index if not exists idx_daily_updates_date on public.daily_updates (update_date desc);
create index if not exists idx_daily_updates_staff on public.daily_updates (staff_id);

-- Staff mapping > Accounts team logins: these emails get the ACCOUNTS role (all departments, all amounts).
create table if not exists public.accounts_logins (
    email      text primary key,
    added_by   uuid,
    created_at timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'accounts_logins_email_check') then
        alter table public.accounts_logins add constraint accounts_logins_email_check check (email = lower(trim(email)) and email like '%_@_%');
    end if;
end $$;

alter table public.departments          enable row level security;
alter table public.staff                enable row level security;
alter table public.attachments          enable row level security;
alter table public.revenue_entries      enable row level security;
alter table public.outstanding_payments enable row level security;
alter table public.daily_updates        enable row level security;
alter table public.accounts_logins      enable row level security;
