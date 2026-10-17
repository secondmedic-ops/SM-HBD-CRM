-- Deleted data stays in place, hidden and read-only, for five complete days.
alter table public.departments add column if not exists deleted_at timestamptz;
create index if not exists idx_departments_deleted_at on public.departments (deleted_at) where deleted_at is not null;

-- Lock referenced departments before writing, so a concurrent deletion cannot accept a late edit.
create or replace function public.guard_retained_department_data() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
    previous jsonb;
    following jsonb;
    d record;
begin
    if current_setting('app.purging_departments', true) = 'on' then
        if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    if tg_op <> 'INSERT' then previous := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then following := to_jsonb(new); end if;
    for d in
        select name, deleted_at from public.departments
        where name in (
            select x->>'dept' from (values (previous), (following)) data(x)
            union
            select s.dept from public.staff s where s.id in (
                select (x->>'staff_id')::uuid from (values (previous), (following)) data(x))
            union
            select cl.dept from public.clients cl where cl.id in (
                select (x->>'client_id')::uuid from (values (previous), (following)) data(x)))
        order by name for share
    loop
        if d.deleted_at is not null then
            raise exception 'Department data is in its five-day deletion hold' using errcode = '23514';
        end if;
    end loop;
    if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

do $$
declare t text;
begin
    foreach t in array array['staff', 'clients', 'client_visits', 'revenue_entries', 'outstanding_payments', 'daily_updates'] loop
        if not exists (select 1 from pg_trigger where tgname = 'guard_retained_department_data' and tgrelid = ('public.' || t)::regclass) then
            execute format('create trigger guard_retained_department_data before insert or update or delete on public.%I for each row execute function public.guard_retained_department_data()', t);
        end if;
    end loop;
end $$;

-- Invoked by the Worker's scheduled handler, with all dependent removal in one transaction.
create or replace function public.purge_deleted_departments() returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
    departments_to_remove text[];
    staff_to_remove uuid[];
    clients_to_remove uuid[];
    revenue_to_remove uuid[];
    outstanding_to_remove uuid[];
    images_to_remove uuid[];
    previous_flag text := current_setting('app.purging_departments', true);
begin
    select array_agg(name) into departments_to_remove from (
        select name from public.departments where deleted_at <= now() - interval '5 days'
        order by deleted_at limit 10 for update skip locked) expired;
    if departments_to_remove is null then return 0; end if;
    select coalesce(array_agg(id), '{}'::uuid[]) into staff_to_remove from public.staff where dept = any(departments_to_remove);
    select coalesce(array_agg(id), '{}'::uuid[]) into clients_to_remove from public.clients
        where dept = any(departments_to_remove) or staff_id = any(staff_to_remove);
    select coalesce(array_agg(id), '{}'::uuid[]) into revenue_to_remove from public.revenue_entries
        where dept = any(departments_to_remove) or staff_id = any(staff_to_remove) or client_id = any(clients_to_remove);
    select coalesce(array_agg(id), '{}'::uuid[]) into outstanding_to_remove from public.outstanding_payments
        where dept = any(departments_to_remove) or staff_id = any(staff_to_remove) or revenue_entry_id = any(revenue_to_remove);
    select coalesce(array_agg(id), '{}'::uuid[]) into images_to_remove from (
        select slip_id as id from public.revenue_entries where id = any(revenue_to_remove)
        union select screenshot_id from public.outstanding_payments where id = any(outstanding_to_remove)) images where id is not null;

    perform set_config('app.purging_departments', 'on', true);
    delete from public.client_visits where client_id = any(clients_to_remove) or staff_id = any(staff_to_remove);
    delete from public.daily_updates where dept = any(departments_to_remove) or staff_id = any(staff_to_remove);
    delete from public.outstanding_payments where id = any(outstanding_to_remove);
    delete from public.revenue_entries where id = any(revenue_to_remove);
    delete from public.clients where id = any(clients_to_remove);
    delete from public.staff where id = any(staff_to_remove);
    delete from public.attachments a where id = any(images_to_remove)
        and not exists (select 1 from public.revenue_entries r where r.slip_id = a.id)
        and not exists (select 1 from public.outstanding_payments o where o.screenshot_id = a.id);
    insert into public.audit_log (action, table_name, row_id, after)
        select 'PURGE', 'departments', name, jsonb_build_object('retentionDays', 5) from unnest(departments_to_remove) names(name);
    delete from public.departments where name = any(departments_to_remove);
    perform set_config('app.purging_departments', coalesce(previous_flag, ''), true);
    return cardinality(departments_to_remove);
end $$;

revoke all on function public.guard_retained_department_data() from public;
revoke all on function public.purge_deleted_departments() from public;
