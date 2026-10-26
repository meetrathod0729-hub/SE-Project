create unique index if not exists idx_profiles_student_code_association_unique
on public.profiles (upper(btrim(student_code)))
where role = 'student'
  and account_status in ('pending_verification', 'active')
  and student_code is not null
  and btrim(student_code) <> '';

create or replace function public.correct_pending_student_id(
  p_profile_id uuid,
  p_student_code text,
  p_confirmed_email text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(btrim(p_student_code));
  normalized_confirmation text := lower(btrim(p_confirmed_email));
  target_profile public.profiles%rowtype;
  target_student public.students%rowtype;
  auth_email text;
begin
  if not exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = p_actor_id
      and admin_profile.role = 'admin'
      and admin_profile.account_status = 'active'
  ) then
    return jsonb_build_object('result', 'admin_not_active');
  end if;

  if normalized_code !~ '^STU[0-9]{6,}$' then
    return jsonb_build_object('result', 'invalid_student_id');
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.role = 'student'
    and profile.account_status = 'pending_verification'
  for update;

  if not found then
    return jsonb_build_object('result', 'pending_registration_not_found');
  end if;

  select lower(btrim(auth_user.email))
  into auth_email
  from auth.users auth_user
  where auth_user.id = p_profile_id;

  if auth_email is null
    or normalized_confirmation is null
    or auth_email <> normalized_confirmation then
    return jsonb_build_object('result', 'confirmed_email_mismatch');
  end if;

  select student.*
  into target_student
  from public.students student
  where upper(btrim(student.student_code)) = normalized_code
  for update;

  if not found or target_student.status <> 'active' then
    return jsonb_build_object('result', 'invalid_student_id');
  end if;

  if target_student.email is not null
    and btrim(target_student.email) <> ''
    and lower(btrim(target_student.email)) <> auth_email then
    return jsonb_build_object('result', 'student_email_mismatch');
  end if;

  if target_student.profile_id is not null
    and target_student.profile_id <> p_profile_id then
    return jsonb_build_object('result', 'student_record_linked');
  end if;

  if exists (
    select 1
    from public.profiles other_profile
    where other_profile.role = 'student'
      and other_profile.account_status in ('pending_verification', 'active')
      and upper(btrim(other_profile.student_code)) = normalized_code
      and other_profile.id <> p_profile_id
  ) then
    return jsonb_build_object('result', 'duplicate_profile_association');
  end if;

  update public.profiles
  set student_code = normalized_code
  where id = p_profile_id
    and account_status = 'pending_verification';

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_actor_id,
    'student_id_corrected',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'previous_student_code', target_profile.student_code,
      'student_code', normalized_code
    )
  );

  return jsonb_build_object('result', 'corrected', 'student_code', normalized_code);
end;
$$;

revoke all on function public.correct_pending_student_id(uuid, text, text, uuid) from public;
revoke all on function public.correct_pending_student_id(uuid, text, text, uuid) from anon;
revoke all on function public.correct_pending_student_id(uuid, text, text, uuid) from authenticated;
grant execute on function public.correct_pending_student_id(uuid, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
