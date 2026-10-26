
-- CampusFlow: Assign one or more faculty members directly to courses.
-- Existing subjects, offerings, and student records are preserved.

BEGIN;

CREATE TABLE IF NOT EXISTS public.course_faculty_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL
    REFERENCES public.courses(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL
    REFERENCES public.faculty(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_faculty_assignments_course_faculty_unique
    UNIQUE (course_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_course_faculty_assignments_course_status
  ON public.course_faculty_assignments(course_id, status);

CREATE INDEX IF NOT EXISTS idx_course_faculty_assignments_faculty_status
  ON public.course_faculty_assignments(faculty_id, status);

ALTER TABLE public.course_faculty_assignments ENABLE ROW LEVEL SECURITY;

-- Faculty can read their own course assignments.
DROP POLICY IF EXISTS course_faculty_assignments_read_own
  ON public.course_faculty_assignments;

CREATE POLICY course_faculty_assignments_read_own
  ON public.course_faculty_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.faculty f
      WHERE f.id = faculty_id
        AND f.profile_id = (SELECT auth.uid())
        AND f.status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
