
-- CampusFlow: Faculty attendance foundation.
-- Attendance is recorded for an assigned course and semester.
-- Students must have an enrolled record for that semester.

BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
  faculty_id uuid NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
  session_date date NOT NULL,
  topic text,
  notes text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_unique_course_semester_date
    UNIQUE (course_id, semester_id, session_date)
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL
    REFERENCES public.students(id) ON DELETE RESTRICT,
  attendance_status text NOT NULL
    CHECK (attendance_status IN ('present', 'absent', 'late')),
  remarks text,
  marked_by uuid NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_unique_session_student
    UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_faculty_date
  ON public.attendance_sessions(faculty_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course_semester
  ON public.attendance_sessions(course_id, semester_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student
  ON public.attendance_records(student_id, session_id);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Attendance writes are performed by the authenticated backend using
-- its server-side Supabase admin client. No client-side write policy is added.

COMMENT ON TABLE public.attendance_sessions IS
  'A faculty attendance session for a course, semester, and date.';

COMMENT ON TABLE public.attendance_records IS
  'Individual student attendance status for a session.';

NOTIFY pgrst, 'reload schema';

COMMIT;
