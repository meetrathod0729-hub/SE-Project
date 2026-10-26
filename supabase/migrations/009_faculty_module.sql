-- Faculty portal foundation. Apply after migration 008.
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'student', 'faculty'));

ALTER TABLE public.faculty
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_profile_id_unique
  ON public.faculty(profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_faculty_assignments_faculty_status
  ON public.faculty_subject_assignments(faculty_id, status);

ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faculty_read_own_record ON public.faculty;
CREATE POLICY faculty_read_own_record ON public.faculty
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS faculty_assignments_read_own ON public.faculty_subject_assignments;
CREATE POLICY faculty_assignments_read_own ON public.faculty_subject_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.faculty f
      WHERE f.id = faculty_id AND f.profile_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
