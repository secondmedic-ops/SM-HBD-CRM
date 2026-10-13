-- Optional patient details belong to the revenue entry and follow its existing access scope.
alter table public.revenue_entries
  add column if not exists patient_name varchar(200),
  add column if not exists patient_contact_number varchar(13);
