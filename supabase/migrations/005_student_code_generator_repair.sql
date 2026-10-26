create sequence if not exists public.student_code_seq;

do $$
declare
  max_student_number bigint;
  sequence_last_value bigint;
  sequence_is_called boolean;
begin
  select max(substring(upper(student_code) from '^STU([0-9]{1,18})$')::bigint)
  into max_student_number
  from public.students
  where upper(student_code) ~ '^STU[0-9]{1,18}$';

  select last_value, is_called
  into sequence_last_value, sequence_is_called
  from public.student_code_seq;

  if max_student_number is not null
      and max_student_number > 0
      and (max_student_number > sequence_last_value
        or (max_student_number = sequence_last_value and not sequence_is_called)) then
    perform setval('public.student_code_seq', max_student_number, true);
  end if;
end;
$$;

create or replace function public.generate_student_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'STU' || lpad(nextval('public.student_code_seq'::regclass)::text, 6, '0');
$$;

revoke all on sequence public.student_code_seq from public, anon, authenticated;
revoke all on function public.generate_student_code() from public, anon, authenticated;
grant execute on function public.generate_student_code() to service_role;

notify pgrst, 'reload schema';
