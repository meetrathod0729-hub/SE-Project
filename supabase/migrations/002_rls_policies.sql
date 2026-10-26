-- RLS baseline. The Express starter currently uses a backend service-role client,
-- which bypasses RLS; all API routes must enforce role/ownership checks server-side.
-- These policies still protect direct client access using the publishable key.

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.courses enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.faculty enable row level security;
alter table public.faculty_subject_assignments enable row level security;
alter table public.profile_correction_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_row_errors enable row level security;

-- Students can read their own profile. Admin profile access is handled by backend service.
create policy "profile_read_self" on public.profiles
for select to authenticated using (id = (select auth.uid()));

-- A student can read only their own linked student row.
create policy "student_read_own_record" on public.students
for select to authenticated using (profile_id = (select auth.uid()));

-- Students can read academic structure needed by the portal.
create policy "departments_read_authenticated" on public.departments
for select to authenticated using (true);
create policy "courses_read_authenticated" on public.courses
for select to authenticated using (true);
create policy "subjects_read_authenticated" on public.subjects
for select to authenticated using (true);

-- Faculty, assignment, correction, audit, and import tables have no direct-client policies.
-- Add narrowly scoped policies only if direct client access is required.
