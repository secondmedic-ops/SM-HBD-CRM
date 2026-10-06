-- Reporting line: every team member reports to one incharge (staff.incharge_id). An incharge works with their own team
-- (entries, outstanding, clients, daily updates) and can add staff to it; the admin builds and changes the structure.

alter table public.staff add column if not exists incharge_id uuid references public.staff (id) on delete set null;
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'staff_incharge_not_self') then
        alter table public.staff add constraint staff_incharge_not_self check (incharge_id is null or incharge_id <> id);
    end if;
end $$;
create index if not exists idx_staff_incharge on public.staff (incharge_id) where active;

-- Start from today's set-up: a team member of a department with exactly one incharge reports to that incharge.
-- Departments without an incharge (or with several) are left for the admin to assign in Staff mapping.
update public.staff t set incharge_id = i.id, updated_at = now()
from (select dept, (array_agg(id))[1] as id from public.staff where active and role = 'Incharge' group by dept having count(*) = 1) i
where t.active and t.role = 'Team' and t.incharge_id is null and t.dept = i.dept;
