-- University Automation System: initial schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('admin', 'student')),
  account_status text not null default 'pending_verification'
    check (account_status in ('pending_verification', 'active', 'rejected', 'inactive')),
  full_name text,
  student_code text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  name text not null,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  name text not null,
  code text not null unique,
  credits numeric(4,1),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  profile_id uuid unique references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete restrict,
  course_id uuid references public.courses(id) on delete restrict,
  full_name text not null,
  email text,
  phone text,
  admission_year integer,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  faculty_code text not null unique,
  department_id uuid references public.departments(id) on delete restrict,
  full_name text not null,
  email text,
  phone text,
  designation text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faculty_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  academic_year text not null,
  semester text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (faculty_id, subject_id, academic_year)
);

create table if not exists public.profile_correction_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  requested_field text not null,
  current_value text,
  proposed_value text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  initiated_by uuid references public.profiles(id) on delete set null,
  entity_type text not null check (entity_type in ('students', 'faculty')),
  file_name text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
  total_rows integer not null default 0,
  success_rows integer not null default 0,
  error_rows integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.import_row_errors (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  field_name text,
  error_reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_students_department on public.students(department_id);
create index if not exists idx_students_course on public.students(course_id);
create index if not exists idx_students_status on public.students(status);
create index if not exists idx_faculty_department on public.faculty(department_id);
create index if not exists idx_assignments_year on public.faculty_subject_assignments(academic_year);
create index if not exists idx_profiles_status on public.profiles(account_status);
create index if not exists idx_correction_student on public.profile_correction_requests(student_id);
create index if not exists idx_audit_created_at on public.audit_logs(created_at desc);

-- New Supabase Auth users get a student profile. Role is never copied from user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, account_status, full_name, student_code)
  values (
    new.id,
    'student',
    'pending_verification',
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'student_code', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
