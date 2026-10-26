const STUDENT_PROFILE_SELECT = [
  'id',
  'student_code',
  'full_name',
  'email',
  'phone',
  'department_id',
  'course_id',
  'admission_year',
  'status',
  'department:departments(id, name, code)',
  'course:courses(id, name, code, subjects(id, name, code, credits, status))'
].join(', ');

function validatePhoneUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be an object.' };
  }
  if (Object.keys(body).some(key => key !== 'phone')) {
    return { error: 'Only the phone field can be updated.' };
  }
  if (typeof body.phone !== 'string') {
    return { error: 'Enter a valid phone number.' };
  }

  const phone = body.phone.trim();
  if (phone.length > 40 || /[\u0000-\u001f\u007f]/.test(phone)) {
    return { error: 'Phone must be 40 characters or fewer and cannot contain control characters.' };
  }
  return { phone: phone || null };
}

export function createStudentProfileHandlers(supabaseAdmin) {
  return {
    async get(profileId) {
      try {
        const { data: student, error: studentError } = await supabaseAdmin.from('students')
          .select(STUDENT_PROFILE_SELECT)
          .eq('profile_id', profileId)
          .maybeSingle();
        if (studentError) {
          console.error('[profile] Could not load the linked student record.');
          return { status: 500, body: { error: 'Could not load student profile.' } };
        }
        if (!student) return { status: 404, body: { error: 'No student record is linked to this account.' } };

        const { data: pendingRequests, error: requestsError } = await supabaseAdmin
          .from('profile_correction_requests')
          .select('id, requested_field, status, created_at')
          .eq('student_id', student.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        if (requestsError) {
          console.error('[profile] Could not load the student’s pending profile requests.');
          return { status: 500, body: { error: 'Could not load student profile requests.' } };
        }
        return {
          status: 200,
          body: { student: { ...student, pending_profile_requests: pendingRequests || [] } }
        };
      } catch (error) {
        console.error('[profile] Unexpected profile lookup failure:', error?.message || 'unknown error');
        return { status: 500, body: { error: 'Could not load student profile.' } };
      }
    },

    async updatePhone(profileId, body) {
      const validation = validatePhoneUpdate(body);
      if (validation.error) {
        return { status: 400, body: { error: validation.error, fields: { phone: validation.error } } };
      }
      try {
        const { data, error } = await supabaseAdmin.from('students')
          .update({ phone: validation.phone, updated_at: new Date().toISOString() })
          .eq('profile_id', profileId)
          .select('phone')
          .maybeSingle();
        if (error) {
          console.error('[profile] Could not update the student phone number.');
          return { status: 500, body: { error: 'Could not update phone number.' } };
        }
        if (!data) return { status: 404, body: { error: 'No student record is linked to this account.' } };
        return { status: 200, body: { phone: data.phone } };
      } catch (error) {
        console.error('[profile] Unexpected phone update failure:', error?.message || 'unknown error');
        return { status: 500, body: { error: 'Could not update phone number.' } };
      }
    }
  };
}
