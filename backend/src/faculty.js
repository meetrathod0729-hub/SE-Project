
export function createFacultyHandlers(supabaseAdmin) {
  return {
    async dashboard(profileId) {
      const { data: faculty, error: facultyError } = await supabaseAdmin
        .from('faculty')
        .select(`
          id,
          faculty_code,
          full_name,
          email,
          designation,
          status,
          department:departments(id, name, code)
        `)
        .eq('profile_id', profileId)
        .eq('status', 'active')
        .maybeSingle();

      if (facultyError) {
        console.error('[faculty] Profile lookup failed:', facultyError.message);
        return {
          status: 500,
          body: { error: 'Could not load the faculty profile.' }
        };
      }

      if (!faculty) {
        return {
          status: 404,
          body: { error: 'No active faculty record is linked to this account.' }
        };
      }

      const { data: assignments, error: assignmentsError } =
        await supabaseAdmin
          .from('course_faculty_assignments')
          .select(`
            id,
            status,
            created_at,
            course:courses(
              id,
              name,
              code,
              status,
              department:departments(id, name, code)
            )
          `)
          .eq('faculty_id', faculty.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

      if (assignmentsError) {
        console.error(
          '[faculty] Course assignments lookup failed:',
          assignmentsError.message
        );

        return {
          status: 500,
          body: {
            error: 'Could not load faculty course assignments. Verify that migration 010 has been applied.'
          }
        };
      }

      const courses = (assignments || [])
        .filter(assignment => assignment.course)
        .map(assignment => ({
          assignment_id: assignment.id,
          assignment_status: assignment.status,
          assigned_at: assignment.created_at,
          ...assignment.course
        }));

      return {
        status: 200,
        body: {
          faculty,
          courses,
          assignments: courses
        }
      };
    }
  };
}
