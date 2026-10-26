create unique index if not exists idx_students_email_unique
on public.students (lower(btrim(email)))
where email is not null and btrim(email) <> '';

notify pgrst, 'reload schema';
