
BEGIN;

CREATE TABLE IF NOT EXISTS public.course_semester_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL
    REFERENCES public.courses(id) ON DELETE CASCADE,
  semester_id uuid NOT NULL
    REFERENCES public.semesters(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_semester_assignments_unique
    UNIQUE (course_id, semester_id)
);

CREATE INDEX IF NOT EXISTS idx_course_semester_assignments_semester
  ON public.course_semester_assignments(semester_id, status);

CREATE INDEX IF NOT EXISTS idx_course_semester_assignments_course
  ON public.course_semester_assignments(course_id, status);

ALTER TABLE public.course_semester_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.course_semester_assignments IS
  'Associates courses with academic semesters.';

NOTIFY pgrst, 'reload schema';

COMMIT;
