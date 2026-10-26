BEGIN;

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_code text NOT NULL UNIQUE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_years_valid_dates CHECK (start_date <= end_date)
);

CREATE TABLE public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  semester_number integer NOT NULL CHECK (semester_number > 0),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT semesters_valid_dates CHECK (start_date <= end_date),
  CONSTRAINT semesters_unique_number UNIQUE (academic_year_id, semester_number),
  CONSTRAINT semesters_unique_label UNIQUE (academic_year_id, label),
  CONSTRAINT semesters_unique_id_year UNIQUE (id, academic_year_id)
);

CREATE FUNCTION public.validate_semester_academic_year_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  selected_year public.academic_years%ROWTYPE;
BEGIN
  SELECT * INTO selected_year
  FROM public.academic_years
  WHERE id = NEW.academic_year_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic year does not exist'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.start_date < selected_year.start_date
     OR NEW.end_date > selected_year.end_date THEN
    RAISE EXCEPTION 'Semester dates must be within the academic year'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND selected_year.status <> 'active' THEN
    RAISE EXCEPTION 'An active semester requires an active academic year'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER semesters_academic_year_dates
BEFORE INSERT OR UPDATE OF academic_year_id, start_date, end_date, status
ON public.semesters
FOR EACH ROW
EXECUTE FUNCTION public.validate_semester_academic_year_dates();

CREATE FUNCTION public.validate_academic_year_semester_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.semesters s
    WHERE s.academic_year_id = NEW.id
      AND (s.start_date < NEW.start_date OR s.end_date > NEW.end_date)
  ) THEN
    RAISE EXCEPTION 'Academic year dates cannot exclude an existing semester'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academic_years_semester_dates
BEFORE UPDATE OF start_date, end_date
ON public.academic_years
FOR EACH ROW
EXECUTE FUNCTION public.validate_academic_year_semester_dates();

ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_unique_id_course UNIQUE (id, course_id);

CREATE TABLE public.subject_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_offerings_subject_course_fk
    FOREIGN KEY (subject_id, course_id)
    REFERENCES public.subjects(id, course_id) ON DELETE RESTRICT,
  CONSTRAINT subject_offerings_unique_subject
    UNIQUE (semester_id, course_id, subject_id),
  CONSTRAINT subject_offerings_unique_id_course_semester
    UNIQUE (id, course_id, semester_id),
  CONSTRAINT subject_offerings_unique_id_subject
    UNIQUE (id, subject_id)
);

CREATE FUNCTION public.validate_subject_offering_active_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  semester_status text;
  course_status text;
  subject_status text;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO semester_status
  FROM public.semesters WHERE id = NEW.semester_id;
  SELECT status INTO course_status
  FROM public.courses WHERE id = NEW.course_id;
  SELECT status INTO subject_status
  FROM public.subjects WHERE id = NEW.subject_id;

  IF semester_status IS DISTINCT FROM 'active'
     OR course_status IS DISTINCT FROM 'active'
     OR subject_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'An active subject offering requires an active semester, course, and subject'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subject_offerings_active_references
BEFORE INSERT OR UPDATE OF semester_id, course_id, subject_id, status
ON public.subject_offerings
FOR EACH ROW
EXECUTE FUNCTION public.validate_subject_offering_active_references();

ALTER TABLE public.students
  ADD CONSTRAINT students_unique_id_course UNIQUE (id, course_id);

CREATE TABLE public.student_semester_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'completed', 'withdrawn')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_enrollments_student_course_fk
    FOREIGN KEY (student_id, course_id)
    REFERENCES public.students(id, course_id) ON DELETE RESTRICT,
  CONSTRAINT student_enrollments_semester_fk
    FOREIGN KEY (semester_id)
    REFERENCES public.semesters(id) ON DELETE RESTRICT,
  CONSTRAINT student_enrollments_unique_student_semester
    UNIQUE (student_id, semester_id)
);

COMMENT ON TABLE public.semesters IS
  'Institution-wide academic periods; course-specific subject plans belong to subject_offerings.';
COMMENT ON TABLE public.subject_offerings IS
  'Subjects offered for a course in an academic semester; this does not itself enroll students.';
COMMENT ON TABLE public.student_semester_enrollments IS
  'Explicit student course/semester enrollment history; no records are inferred from students.course_id.';

CREATE INDEX idx_semesters_academic_year ON public.semesters(academic_year_id);
CREATE INDEX idx_subject_offerings_course_semester
  ON public.subject_offerings(course_id, semester_id);
CREATE INDEX idx_student_enrollments_semester
  ON public.student_semester_enrollments(semester_id);

ALTER TABLE public.faculty_subject_assignments
  ADD COLUMN subject_offering_id uuid;

ALTER TABLE public.faculty_subject_assignments
  ADD CONSTRAINT faculty_assignments_offering_subject_fk
    FOREIGN KEY (subject_offering_id, subject_id)
    REFERENCES public.subject_offerings(id, subject_id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.faculty_subject_assignments.subject_offering_id IS
  'Optional normalized semester offering link for future faculty assignment workflows; legacy text fields are retained.';

DO $$
DECLARE
  legacy_constraint record;
BEGIN
  FOR legacy_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.faculty_subject_assignments'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS key_column(attnum)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = key_column.attnum
      ) = ARRAY['academic_year', 'faculty_id', 'subject_id']::text[]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.faculty_subject_assignments DROP CONSTRAINT %I',
      legacy_constraint.conname
    );
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX faculty_assignments_legacy_unique
  ON public.faculty_subject_assignments(faculty_id, subject_id, academic_year)
  WHERE subject_offering_id IS NULL;
CREATE UNIQUE INDEX faculty_assignments_offering_unique
  ON public.faculty_subject_assignments(faculty_id, subject_offering_id)
  WHERE subject_offering_id IS NOT NULL;

CREATE INDEX idx_faculty_assignments_offering
  ON public.faculty_subject_assignments(subject_offering_id)
  WHERE subject_offering_id IS NOT NULL;

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_semester_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY academic_years_read_authenticated
  ON public.academic_years FOR SELECT TO authenticated
  USING (true);
CREATE POLICY academic_years_admin_manage
  ON public.academic_years FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  );

CREATE POLICY semesters_read_authenticated
  ON public.semesters FOR SELECT TO authenticated
  USING (true);
CREATE POLICY semesters_admin_manage
  ON public.semesters FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  );

CREATE POLICY subject_offerings_read_authenticated
  ON public.subject_offerings FOR SELECT TO authenticated
  USING (status = 'active');
CREATE POLICY subject_offerings_admin_manage
  ON public.subject_offerings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  );

CREATE POLICY student_enrollments_read_own
  ON public.student_semester_enrollments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.profile_id = (SELECT auth.uid())
    )
  );
CREATE POLICY student_enrollments_admin_manage
  ON public.student_semester_enrollments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
