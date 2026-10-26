const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function createStudentVerificationHandlers(supabaseAdmin) {
  return {
    async listPending() {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, student_code, account_status, created_at')
        .eq('role', 'student')
        .eq('account_status', 'pending_verification')
        .order('created_at', { ascending: true });

      if (error) return { status: 500, body: { error: 'Could not load pending registrations.' } };

      const registrations = await Promise.all((data || []).map(async profile => {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        if (authError) return { error: authError };
        return {
          registration: {
            profile_id: profile.id,
            ...profile,
            email: authData?.user?.email || null
          }
        };
      }));

      if (registrations.some(result => result.error)) {
        console.error('[registrations] Could not look up an Auth email for a pending profile.');
        return { status: 502, body: { error: 'Could not load registration email details.' } };
      }

      return {
        status: 200,
        body: { registrations: registrations.map(result => result.registration) }
      };
    },

    async validateSignup(body = {}) {
      const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';

      if (!fullName || fullName.length > 120) {
        return {
          status: 400,
          body: {
            error: 'Enter your full name.',
            fields: { full_name: 'Full name is required and must be 120 characters or fewer.' }
          }
        };
      }
      if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return {
          status: 400,
          body: { error: 'Enter a valid email address.', fields: { email: 'Enter a valid email address.' } }
        };
      }

      return { status: 200, body: { valid: true } };
    },

    async review(profileId, decision, reviewerId) {
      if (!['approve', 'reject'].includes(decision)) {
        return { status: 400, body: { error: 'Decision must be approve or reject.' } };
      }

      if (decision === 'approve') {
        const { data, error } = await supabaseAdmin.rpc('approve_pending_student_registration', {
          p_profile_id: profileId,
          p_actor_id: reviewerId
        });

        if (error) {
          if (error.code === 'PGRST202' || error.code === '42883') {
            return {
              status: 503,
              body: { error: 'Automatic approval is not configured. Apply supabase/migrations/007_atomic_student_approval.sql, then retry.' }
            };
          }
          if (error.code === '23505') {
            const databaseDetails = `${error.message || ''} ${error.details || ''}`;
            if (/idx_students_email_unique/i.test(databaseDetails)) {
              return {
                status: 409,
                body: { error: 'A student record already uses this account email. Review the existing record before approving to avoid creating a duplicate.' }
              };
            }
            if (/students_profile_id_key/i.test(databaseDetails)) {
              return {
                status: 409,
                body: { error: 'A student record is already linked to this profile. Review it before approving.' }
              };
            }
            return {
              status: 409,
              body: { error: 'Approval conflicts with an existing Student ID or student record. Check the Student ID generator setup; no changes were committed.' }
            };
          }
          console.error(`[registrations] Atomic approval failed${error.code ? ` (${error.code})` : ''}.`);
          return { status: 500, body: { error: 'Could not approve the registration. No changes were committed.' } };
        }

        const outcomes = {
          admin_not_active: {
            status: 403,
            error: 'Active Admin access is required.'
          },
          registration_not_found: {
            status: 404,
            error: 'Student registration not found.'
          },
          not_pending: {
            status: 409,
            error: 'This registration has already been reviewed.'
          },
          profile_not_student: {
            status: 404,
            error: 'Pending student registration not found.'
          },
          full_name_missing: {
            status: 400,
            error: 'The registration has no full name. Update the profile before approval.'
          },
          student_record_exists: {
            status: 409,
            error: 'A student record is already linked to this profile. Review it before approving.'
          },
          student_email_exists: {
            status: 409,
            error: 'A student record already uses this account email. Review the existing record before approving to avoid creating a duplicate.'
          }
        };

        if (data?.result !== 'approved') {
          const outcome = outcomes[data?.result];
          return outcome
            ? { status: outcome.status, body: { error: outcome.error } }
            : { status: 500, body: { error: 'Could not approve the registration. No changes were committed.' } };
        }

        return {
          status: 200,
          body: { success: true, status: 'active', student_code: data.student_code }
        };
      }

      const { data: target, error: findError } = await supabaseAdmin.from('profiles')
        .select('id, role, account_status')
        .eq('id', profileId)
        .maybeSingle();

      if (findError || !target || target.role !== 'student' || target.account_status !== 'pending_verification') {
        return { status: 404, body: { error: 'Pending student registration not found.' } };
      }

      const { data: updatedProfile, error: updateError } = await supabaseAdmin.from('profiles')
        .update({
          account_status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', profileId)
        .eq('account_status', 'pending_verification')
        .select('id')
        .maybeSingle();

      if (updateError || !updatedProfile) {
        return updateError
          ? { status: 500, body: { error: 'Could not update registration status.' } }
          : { status: 409, body: { error: 'This registration was already reviewed.' } };
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_profile_id: reviewerId,
        action: 'student_registration_reject',
        entity_type: 'profiles',
        entity_id: profileId,
        metadata: { decision }
      });

      return { status: 200, body: { success: true, status: 'rejected' } };
    }
  };
}
