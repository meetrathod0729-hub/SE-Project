
-- Migration 007: Atomic student approval with automatic Student ID generation

BEGIN;

-- 1. Approve a pending student and assign a new Student ID atomically.
CREATE OR REPLACE FUNCTION public.approve_pending_student_registration(
  p_profile_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  active_admin_id uuid;
  student_email text;
  generated_code text;
  existing_student_id uuid;
BEGIN
  -- Verify that the actor is an active Admin.
  SELECT admin_profile.id
  INTO active_admin_id
  FROM public.profiles AS admin_profile
  WHERE admin_profile.id = p_actor_id
    AND admin_profile.role = 'admin'
    AND admin_profile.account_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'admin_not_active');
  END IF;

  -- Lock the registration to prevent concurrent approvals.
  SELECT profile.*
  INTO target_profile
  FROM public.profiles AS profile
  WHERE profile.id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'registration_not_found');
  END IF;

  IF target_profile.role <> 'student' THEN
    RETURN jsonb_build_object('result', 'profile_not_student');
  END IF;

  IF target_profile.account_status <> 'pending_verification' THEN
    RETURN jsonb_build_object('result', 'not_pending');
  END IF;

  IF target_profile.full_name IS NULL
     OR btrim(target_profile.full_name) = '' THEN
    RETURN jsonb_build_object('result', 'full_name_missing');
  END IF;

  -- Do not create a second record for the same profile.
  SELECT student.id
  INTO existing_student_id
  FROM public.students AS student
  WHERE student.profile_id = p_profile_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('result', 'student_record_exists');
  END IF;

  -- Obtain the email from the existing Auth account.
  SELECT auth_user.email
  INTO student_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_profile_id;

  IF student_email IS NULL OR btrim(student_email) = '' THEN
    RETURN jsonb_build_object('result', 'student_email_missing');
  END IF;

  -- Do not duplicate or overwrite an existing student's email.
  IF EXISTS (
    SELECT 1
    FROM public.students AS existing_student
    WHERE lower(btrim(existing_student.email)) =
          lower(btrim(student_email))
  ) THEN
    RETURN jsonb_build_object('result', 'student_email_exists');
  END IF;

  -- Generate a unique ID using the existing database sequence.
  generated_code := public.generate_student_code();

  -- Create the university student record.
  INSERT INTO public.students (
    student_code,
    profile_id,
    full_name,
    email,
    status
  )
  VALUES (
    generated_code,
    p_profile_id,
    btrim(target_profile.full_name),
    student_email,
    'active'
  );

  -- Activate the profile and save the generated ID.
  UPDATE public.profiles
  SET student_code = generated_code,
      account_status = 'active',
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_profile_id
    AND account_status = 'pending_verification';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending registration changed during approval';
  END IF;

  -- Record the approval in the existing audit log.
  INSERT INTO public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_actor_id,
    'student_registration_approve',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'decision', 'approve',
      'student_code', generated_code
    )
  );

  RETURN jsonb_build_object(
    'result', 'approved',
    'student_code', generated_code
  );
END;
$$;

-- Only the trusted backend service can execute the approval function.
REVOKE ALL ON FUNCTION
  public.approve_pending_student_registration(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.approve_pending_student_registration(uuid, uuid)
  TO service_role;


-- 2. Keep the signup trigger compatible with automatic ID assignment.
-- Student ID is assigned only after explicit Admin approval.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    role,
    account_status,
    full_name
  )
  VALUES (
    NEW.id,
    'student',
    'pending_verification',
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- 3. Retire the old correction function only if it exists.
-- This does not delete any student or profile records.
DROP FUNCTION IF EXISTS
  public.correct_pending_student_id(uuid, text, text, uuid);

-- Refresh the API schema cache.
NOTIFY pgrst, 'reload schema';


COMMIT;
