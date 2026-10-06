-- Clients and visits. Every client belongs to one staff member (the owner): a team member sees and manages only their
-- own clients, an incharge the clients of their department, admin / accounts all of them. Visits (meetings, calls,
-- demos ...) are logged per client with an optional next follow-up date. Revenue entries can name the client.

create table if not exists public.clients (
    id             uuid primary key default gen_random_uuid(),
    name           text not null,
    type           text not null default 'Corporate',
    category       text not null default '',
    contact_person text not null default '',
    phone          text,
    email          text,
    address        text not null default '',
    city           text not null default '',
    pincode        text,
    status         text not null default 'Lead',
    notes          text not null default '',
    -- Owner: the staff member who manages this client; the department follows the owner.
    staff_id       uuid not null references public.staff (id),
    dept           text not null references public.departments (name) on update cascade,
    created_by     uuid,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'clients_type_check') then
        alter table public.clients add constraint clients_type_check check (type in ('Individual', 'Corporate'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'clients_status_check') then
        alter table public.clients add constraint clients_status_check check (status in ('Lead', 'Active', 'Inactive'));
    end if;
end $$;
create index if not exists idx_clients_staff on public.clients (staff_id);
create index if not exists idx_clients_dept on public.clients (dept);
-- The same phone number cannot be on two clients (stops two people working the same client unknowingly).
create unique index if not exists ux_clients_phone on public.clients (phone) where phone is not null;

create table if not exists public.client_visits (
    id             uuid primary key default gen_random_uuid(),
    client_id      uuid not null references public.clients (id) on delete cascade,
    -- Who made the visit / call.
    staff_id       uuid not null references public.staff (id),
    visit_date     date not null,
    kind           text not null default 'Visit',
    purpose        text not null default '',
    notes          text not null default '',
    next_follow_up date,
    created_by     uuid,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'client_visits_kind_check') then
        alter table public.client_visits add constraint client_visits_kind_check
            check (kind in ('Visit', 'Call', 'Meeting', 'Demo', 'Email', 'Other'));
    end if;
end $$;
create index if not exists idx_client_visits_client on public.client_visits (client_id, visit_date desc);
create index if not exists idx_client_visits_follow on public.client_visits (next_follow_up) where next_follow_up is not null;

alter table public.revenue_entries add column if not exists client_id uuid references public.clients (id) on delete set null;
create index if not exists idx_revenue_client on public.revenue_entries (client_id);

alter table public.clients       enable row level security;
alter table public.client_visits enable row level security;
