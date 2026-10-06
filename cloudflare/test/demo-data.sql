-- RUN-LOCAL-TEST.bat only: sample entries for the in-memory test database (never applied to Supabase).
-- The staff list comes from the migration. Dates are relative to today so the dashboard always has data.
insert into public.revenue_entries (entry_date, staff_id, dept, client, type, amount, cost, is_new_client, amount_received, due_date)
select current_date - (g * 5), s.id, s.dept,
       (array['Apollo Clinic Vashi', 'Fortis Hiranandani', 'Reliance Corporate Park', 'Gynoveda Wellness', 'Ranchi City Hospital',
              'Lilavati Diagnostics', 'Navi Mumbai Housing Society', 'Infosys Airoli Campus'])[1 + g % 8],
       case when g % 2 = 0 then 'Corporate' else 'Individual' end,
       15000 + (g * 7919) % 85000, round((15000 + (g * 7919) % 85000) * 0.3), g % 3 = 0,
       case g % 5 when 0 then 0 when 1 then round((15000 + (g * 7919) % 85000) * 0.5) else 15000 + (g * 7919) % 85000 end,
       case when g % 5 in (0, 1) then current_date - (g * 5) + 15 end
from generate_series(1, 36) g
join lateral (select id, dept from public.staff where active order by name offset (g * 3) % 10 limit 1) s on true;

insert into public.outstanding_payments (revenue_entry_id, client, staff_id, dept, amount, amount_paid, due_date)
select r.id, r.client, r.staff_id, r.dept, r.amount - r.amount_received, 0, coalesce(r.due_date, r.entry_date + 15)
from public.revenue_entries r where r.amount_received < r.amount;

insert into public.daily_updates (update_date, staff_id, dept, update_text, clients_met)
select current_date - (g % 4), s.id, s.dept, 'Met clients in the area and followed up on pending quotes.', 1 + g % 5
from generate_series(1, 14) g
join lateral (select id, dept from public.staff where active order by name offset g % 10 limit 1) s on true;

insert into public.accounts_logins (email) values ('accounts@secondmedic.com') on conflict do nothing;

insert into public.clients (name, type, category, contact_person, phone, city, status, staff_id, dept)
select v.name, v.type, v.category, v.contact, v.phone, v.city, v.status, s.id, s.dept
from (values
  ('Apollo Clinic Vashi', 'Corporate', 'Clinic', 'Dr Mehta', '9820011111', 'Navi Mumbai', 'Active', 'Supriya'),
  ('Infosys Airoli Campus', 'Corporate', 'Corporate', 'HR desk', '9820022222', 'Navi Mumbai', 'Lead', 'Manoj'),
  ('Ranchi City Hospital', 'Corporate', 'Hospital', 'Admin office', '9431033333', 'Ranchi', 'Active', 'Nihal'),
  ('Gynoveda Wellness', 'Corporate', 'Corporate', 'Ops team', '9820044444', 'Mumbai', 'Active', 'Ranju')
) as v(name, type, category, contact, phone, city, status, owner)
join public.staff s on s.name = v.owner;

insert into public.client_visits (client_id, staff_id, visit_date, kind, purpose, notes, next_follow_up)
select c.id, c.staff_id, current_date - 3, 'Meeting', 'Health camp proposal', 'Asked for rates for 200 employees', current_date + 2
from public.clients c;

update public.revenue_entries r set client_id = c.id from public.clients c where r.client = c.name;
