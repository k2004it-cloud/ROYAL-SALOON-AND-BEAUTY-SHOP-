-- Keep each employee's operational profile attached to the employee account.
update public.users u
set job_title = coalesce(nullif(u.job_title, ''), s.role, 'Employee')
from public.stylists s
where u.role = 'employee' and u.stylist_id = s.id;

update public.users
set job_title = 'Employee'
where role = 'employee' and coalesce(job_title, '') = '';

update public.users u
set stylist_id = u.id
where u.role = 'employee'
  and not exists (select 1 from public.stylists s where s.id = u.stylist_id);

insert into public.stylists (id, name, role, specialty, avatar_url, commission_rate, active)
select u.id, u.name, u.job_title, u.job_title, '', 0.35, u.active
from public.users u
where u.role = 'employee'
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    specialty = excluded.specialty,
    active = excluded.active;
