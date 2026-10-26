
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { requireAuth, requireAdmin } from './middleware/auth.js';

const FACULTY_SELECT =
    'id, faculty_code, profile_id, department_id, full_name, designation, status, created_at, department:departments(id, name, code)';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateFaculty(body = {}) {
    const fields = {};
    const values = {};

    const fullName = typeof body.full_name === 'string'
        ? body.full_name.replace(/[\u0000-\u001f\u007f]/g, '').trim()
        : '';

    const email = typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword =
        typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    const designation = typeof body.designation === 'string'
        ? body.designation.replace(/[\u0000-\u001f\u007f]/g, '').trim()
        : '';

    const departmentId =
        body.department_id === '' || body.department_id == null
            ? null
            : body.department_id;

    if (!fullName) fields.full_name = 'Full name is required.';
    else if (fullName.length > 120) {
        fields.full_name = 'Full name must be 120 characters or fewer.';
    } else values.full_name = fullName;

    if (!email) fields.email = 'Email address is required.';
    else if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        fields.email = 'Enter a valid email address.';
    } else values.email = email;

    if (password.length < 8 || password.length > 128) {
        fields.password = 'Password must be between 8 and 128 characters.';
    }

    if (confirmPassword !== password) {
        fields.confirmPassword = 'Passwords do not match.';
    }

    if (!designation) {
        fields.designation = 'Designation is required.';
    } else if (designation.length > 120) {
        fields.designation = 'Designation must be 120 characters or fewer.';
    } else {
        values.designation = designation;
    }

    if (
        departmentId &&
        (typeof departmentId !== 'string' || !UUID_PATTERN.test(departmentId))
    ) {
        fields.department_id = 'Select a valid department.';
    } else {
        values.department_id = departmentId;
    }

    return {
        fields,
        values,
        password,
        confirmPassword
    };
}

export function createFacultyManagementRouter(supabaseAdmin) {
    const router = Router();

    router.use(requireAuth, requireAdmin);

    router.get('/options', async (_req, res) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('departments')
                .select('id, name, code')
                .eq('status', 'active')
                .order('name');

            if (error) {
                console.error('[faculty-management] Could not load departments.');
                return res.status(500).json({
                    error: 'Could not load departments.'
                });
            }

            return res.json({ departments: data || [] });
        } catch {
            return res.status(500).json({
                error: 'Could not load departments.'
            });
        }
    });

    router.get('/', async (req, res) => {
        const query = typeof req.query.q === 'string'
            ? req.query.q.trim().slice(0, 100)
            : '';

        const status = typeof req.query.status === 'string'
            ? req.query.status
            : '';

        if (status && !['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                error: 'Status must be active or inactive.'
            });
        }

        try {
            let request = supabaseAdmin
                .from('faculty')
                .select(FACULTY_SELECT, { count: 'exact' })
                .order('created_at', { ascending: false });

            if (status) request = request.eq('status', status);

            const safeQuery = query
                .replace(/[^\p{L}\p{N}@.+ _-]/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (safeQuery) {
                request = request.or(
                    `faculty_code.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%,designation.ilike.%${safeQuery}%`
                );
            }

            const { data, error, count } = await request;

            if (error) {
                console.error('[faculty-management] Could not load faculty records.');
                return res.status(500).json({
                    error: 'Could not load faculty records.'
                });
            }

            const facultyIds = (data || [])
                .map(item => item.profile_id)
                .filter(Boolean);

            const emailByProfileId = new Map();

            if (facultyIds.length) {
                const { data: profiles, error: profilesError } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .in('id', facultyIds);

                if (profilesError) {
                    return res.status(500).json({
                        error: 'Could not load faculty account details.'
                    });
                }

                const profileIdSet = new Set((profiles || []).map(item => item.id));
                let page = 1;
                const perPage = 1000;

                while (
                    [...profileIdSet].some(id => !emailByProfileId.has(id))
                ) {
                    const { data: users, error: usersError } =
                        await supabaseAdmin.auth.admin.listUsers({ page, perPage });

                    if (usersError) {
                        return res.status(502).json({
                            error: 'Could not load faculty email addresses.'
                        });
                    }

                    for (const user of users?.users || []) {
                        if (profileIdSet.has(user.id)) {
                            emailByProfileId.set(user.id, user.email || '');
                        }
                    }

                    if (!users?.users || users.users.length < perPage) break;
                    page += 1;
                }
            }

            return res.json({
                faculty: (data || []).map(item => ({
                    ...item,
                    email: item.profile_id
                        ? emailByProfileId.get(item.profile_id) || ''
                        : ''
                })),
                totalCount: count || 0
            });
        } catch {
            console.error('[faculty-management] Unexpected list failure.');
            return res.status(500).json({
                error: 'Could not load faculty records.'
            });
        }
    });

    router.post('/', async (req, res) => {
        const { fields, values, password } = validateFaculty(req.body);

        if (Object.keys(fields).length) {
            return res.status(400).json({
                error: 'Please correct the highlighted fields.',
                fields
            });
        }

        if (req.body.email.trim().toLowerCase() === req.user.email?.toLowerCase()) {
            return res.status(409).json({
                error: 'This email belongs to your current account.'
            });
        }

        if (values.department_id) {
            try {
                const { data: department, error } = await supabaseAdmin
                    .from('departments')
                    .select('id')
                    .eq('id', values.department_id)
                    .eq('status', 'active')
                    .maybeSingle();

                if (error) {
                    return res.status(500).json({
                        error: 'Could not validate the selected department.'
                    });
                }

                if (!department) {
                    return res.status(400).json({
                        error: 'Select an active department.',
                        fields: {
                            department_id: 'Select an active department.'
                        }
                    });
                }
            } catch {
                return res.status(500).json({
                    error: 'Could not validate the selected department.'
                });
            }
        }

        let createdUser;

        try {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email: values.email,
                password,
                email_confirm: true,
                user_metadata: { full_name: values.full_name }
            });

            if (error) {
                const duplicate =
                    /already (registered|exists)|already been registered/i.test(
                        error.message || ''
                    );

                if (duplicate) {
                    return res.status(409).json({
                        error: 'An account with this email already exists.'
                    });
                }

                return res.status(502).json({
                    error: 'Could not create the faculty account. Check Supabase Auth configuration.'
                });
            }

            createdUser = data?.user;

            if (!createdUser?.id) {
                return res.status(502).json({
                    error: 'Supabase did not confirm the new faculty account.'
                });
            }
        } catch {
            return res.status(502).json({
                error: 'Could not create the faculty account.'
            });
        }

        let profile;
        let profileError;

        try {
            const result = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: createdUser.id,
                    role: 'faculty',
                    account_status: 'active',
                    full_name: values.full_name
                }, { onConflict: 'id' })
                .select('id, role, account_status')
                .single();

            profile = result.data;
            profileError = result.error;
        } catch {
            profileError = true;
        }

        if (
            profileError ||
            !profile ||
            profile.role !== 'faculty' ||
            profile.account_status !== 'active'
        ) {
            try {
                await supabaseAdmin.auth.admin.deleteUser(createdUser.id);
            } catch {
                console.error('[faculty-management] Auth cleanup failed after profile setup failure.');
            }

            return res.status(500).json({
                error: 'Could not configure the faculty profile. Check Supabase before retrying.'
            });
        }

        const facultyCode = `FAC${randomBytes(5).toString('hex').toUpperCase()}`;

        let facultyRecord;
        let facultyError;

        try {
            const result = await supabaseAdmin
                .from('faculty')
                .insert({
                    faculty_code: facultyCode,
                    profile_id: createdUser.id,
                    department_id: values.department_id,
                    full_name: values.full_name,
                    designation: values.designation,
                    status: 'active'
                })
                .select(FACULTY_SELECT)
                .single();

            facultyRecord = result.data;
            facultyError = result.error;
        } catch {
            facultyError = true;
        }

        if (facultyError || !facultyRecord) {
            try {
                await supabaseAdmin.auth.admin.deleteUser(createdUser.id);
            } catch {
                console.error('[faculty-management] Auth cleanup failed after faculty record creation failure.');
            }

            return res.status(500).json({
                error: 'Could not create the faculty record. Check your faculty table schema and try again.'
            });
        }

        return res.status(201).json({
            faculty: {
                ...facultyRecord,
                email: createdUser.email
            }
        });
    });

    router.patch('/:id/status', async (req, res) => {
        if (!UUID_PATTERN.test(req.params.id)) {
            return res.status(400).json({ error: 'Invalid faculty record ID.' });
        }

        const { status } = req.body || {};

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                error: 'Status must be active or inactive.'
            });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('faculty')
                .update({ status })
                .eq('id', req.params.id)
                .select(FACULTY_SELECT)
                .maybeSingle();

            if (error) {
                return res.status(500).json({
                    error: 'Could not update faculty status.'
                });
            }

            if (!data) {
                return res.status(404).json({
                    error: 'Faculty record not found.'
                });
            }

            return res.json({ faculty: data });
        } catch {
            return res.status(500).json({
                error: 'Could not update faculty status.'
            });
        }
    });

    return router;
}
