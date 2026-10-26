do $$
declare
  max_student_number bigint;
  sequence_exists boolean;
begin
  sequence_exists := to_regclass('public.student_code_seq') is not null;
  if not sequence_exists then
    create sequence public.student_code_seq;
    select max(substring(upper(student_code) from '^STU([0-9]+)$')::bigint)
    into max_student_number
    from public.students
    where upper(student_code) ~ '^STU[0-9]{1,18}$';

    if max_student_number is null or max_student_number < 1 then
      perform setval('public.student_code_seq', 1, false);
    else
      perform setval('public.student_code_seq', max_student_number, true);
    end if;
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

revoke all on function public.generate_student_code() from public, anon, authenticated;
grant execute on function public.generate_student_code() to service_role;

notify pgrst, 'reload schema';
