import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';
import { requireAuth, requireAdmin, requireFaculty, requireVerifiedStudent } from './middleware/auth.js';
import { createStudentVerificationHandlers } from './student-verification.js';
import { createStudentProfileHandlers } from './student-profile.js';
import { createAcademicRouter } from './academic.js';
import { createFacultyHandlers } from './faculty.js';
import { createFacultyManagementRouter } from './faculty-management.js';
import { createFacultyAttendanceRouter } from './faculty-attendance.js';

const router = Router();
const studentVerification = createStudentVerificationHandlers(supabaseAdmin);
const studentProfile = createStudentProfileHandlers(supabaseAdmin);
const faculty = createFacultyHandlers(supabaseAdmin);
const STUDENT_SELECT = 'id, student_code, profile_id, department_id, course_id, full_name, email, phone, admission_year, status, created_at, updated_at, department:departments(id, name, code), course:courses(id, name, code)';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'university-automation-api' }));

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    user: { id: req.user.id, email: req.user.email },
    profile: req.profile || {
      id: req.user.id, role: 'student', account_status: 'pending_verification',
      full_name: req.user.user_metadata?.full_name || null
    }
  });
});
router.use('/faculty-management', createFacultyManagementRouter(supabaseAdmin));
router.use(
  '/faculty/me/attendance',
  createFacultyAttendanceRouter(supabaseAdmin)
);

async function validateStudentPlacement(departmentId, courseId) {
  try {
    if (departmentId) {
      const { data, error } = await supabaseAdmin.from('departments')
        .select('id').eq('id', departmentId).eq('status', 'active').maybeSingle();
      if (error) return { error: 'Could not validate the selected department.', status: 500 };
      if (!data) return { error: 'Select an active department.', field: 'department_id', status: 400 };
    }
    if (courseId) {
      if (!departmentId) {
        return { error: 'Select a department before choosing a course.', field: 'course_id', status: 400 };
      }
      const { data, error } = await supabaseAdmin.from('courses')
        .select('id').eq('id', courseId).eq('department_id', departmentId).eq('status', 'active').maybeSingle();
      if (error) return { error: 'Could not validate the selected course.', status: 500 };
      if (!data) return { error: 'Select an active course in the selected department.', field: 'course_id', status: 400 };
    }
    return null;
  } catch {
    console.error('[students] Unexpected failure validating academic placement.');
    return { error: 'Could not validate the selected department and course.', status: 500 };
  }
}

function validateStudentFields(body, { partial = false } = {}) {
  const fields = {};
  const values = {};
  const has = key => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has('full_name')) {
    const name = typeof body.full_name === 'string'
      ? body.full_name.replace(/[\u0000-\u001f\u007f]/g, '').trim()
      : '';
    if (!name) fields.full_name = 'Full name is required.';
    else if (name.length > 120) fields.full_name = 'Full name must be 120 characters or fewer.';
    else values.full_name = name;
  }
  if (!partial || has('email')) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (body.email != null && typeof body.email !== 'string') {
      fields.email = 'Enter a valid email address.';
    } else if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      fields.email = 'Enter a valid email address.';
    } else values.email = email || null;
  }
  if (!partial || has('phone')) {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (body.phone != null && typeof body.phone !== 'string') fields.phone = 'Enter a valid phone number.';
    else if (phone.length > 40) fields.phone = 'Phone must be 40 characters or fewer.';
    else values.phone = phone || null;
  }
  for (const key of ['department_id', 'course_id']) {
    if (!partial || has(key)) {
      const value = body[key] === '' || body[key] == null ? null : body[key];
      if (value && (typeof value !== 'string' || !UUID_PATTERN.test(value))) {
        fields[key] = 'Select a valid option.';
      } else values[key] = value;
    }
  }
  if (!partial || has('admission_year')) {
    const year = body.admission_year;
    if (year === '' || year === null || year === undefined) values.admission_year = null;
    else if (!Number.isInteger(Number(year)) || Number(year) < 1900 || Number(year) > 2200) {
      fields.admission_year = 'Enter a valid admission year between 1900 and 2200.';
    } else values.admission_year = Number(year);
  }
  return { fields, values };
}

router.get('/students/options', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [departments, courses] = await Promise.all([
      supabaseAdmin.from('departments').select('id, name, code').eq('status', 'active').order('name'),
      supabaseAdmin.from('courses').select('id, name, code, department_id').eq('status', 'active').order('name')
    ]);
    if (departments.error || courses.error) {
      console.error('[students] Could not load student department/course options.');
      return res.status(500).json({ error: 'Could not load departments and courses.' });
    }
    res.json({ departments: departments.data || [], courses: courses.data || [] });
  } catch {
    console.error('[students] Unexpected failure while loading department/course options.');
    return res.status(500).json({ error: 'Could not load departments and courses.' });
  }
});

router.get('/students', requireAuth, requireAdmin, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const departmentId = typeof req.query.department_id === 'string' ? req.query.department_id : '';
  const courseId = typeof req.query.course_id === 'string' ? req.query.course_id : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const limitValue = Number(req.query.limit || 25);
  const offsetValue = Number(req.query.offset || 0);

  if (departmentId && !UUID_PATTERN.test(departmentId)) return res.status(400).json({ error: 'Invalid department filter.' });
  if (courseId && !UUID_PATTERN.test(courseId)) return res.status(400).json({ error: 'Invalid course filter.' });
  if (status && !['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100
    || !Number.isInteger(offsetValue) || offsetValue < 0) {
    return res.status(400).json({ error: 'Invalid pagination values.' });
  }

  try {
    let listQuery = supabaseAdmin.from('students')
      .select(STUDENT_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offsetValue, offsetValue + limitValue - 1);
    if (departmentId) listQuery = listQuery.eq('department_id', departmentId);
    if (courseId) listQuery = listQuery.eq('course_id', courseId);
    if (status) listQuery = listQuery.eq('status', status);
    const safeQuery = query.replace(/[^\p{L}\p{N}@.+ _-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (safeQuery) {
      listQuery = listQuery.or(`student_code.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`);
    }

    const [students, total] = await Promise.all([
      listQuery,
      supabaseAdmin.from('students').select('id', { count: 'exact', head: true })
    ]);
    if (students.error || total.error) {
      console.error('[students] Could not load student records.');
      return res.status(500).json({ error: 'Could not load student records.' });
    }
    res.json({
      students: students.data || [],
      totalCount: total.count || 0,
      filteredCount: students.count || 0,
      limit: limitValue,
      offset: offsetValue
    });
  } catch {
    console.error('[students] Unexpected failure while loading student records.');
    return res.status(500).json({ error: 'Could not load student records.' });
  }
});

router.get('/students/:id', requireAuth, requireAdmin, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid student record ID.' });
  try {
    const { data, error } = await supabaseAdmin.from('students')
      .select(STUDENT_SELECT).eq('id', req.params.id).maybeSingle();
    if (error) {
      console.error('[students] Could not load a student record.');
      return res.status(500).json({ error: 'Could not load student details.' });
    }
    if (!data) return res.status(404).json({ error: 'Student record not found.' });
    res.json({ student: data });
  } catch {
    console.error('[students] Unexpected failure while loading student details.');
    res.status(500).json({ error: 'Could not load student details.' });
  }
});

router.post('/students', requireAuth, requireAdmin, async (req, res) => {
  const { fields, values } = validateStudentFields(req.body || {});
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }
  const placementError = await validateStudentPlacement(values.department_id, values.course_id);
  if (placementError) {
    return res.status(placementError.status).json({
      error: placementError.error,
      ...(placementError.field ? { fields: { [placementError.field]: placementError.error } } : {})
    });
  }
  if (values.email) {
    try {
      const { data: duplicate, error } = await supabaseAdmin.from('students')
        .select('id').eq('email', values.email).limit(1).maybeSingle();
      if (error) return res.status(500).json({ error: 'Could not validate the student email.' });
      if (duplicate) return res.status(409).json({ error: 'A student record with this email already exists.', fields: { email: 'This email is already assigned to a student record.' } });
    } catch {
      console.error('[students] Unexpected failure checking for a duplicate email.');
      return res.status(500).json({ error: 'Could not validate the student email.' });
    }
  }

  try {
    const { data: studentCode, error: codeError } = await supabaseAdmin.rpc('generate_student_code');
    if (codeError || typeof studentCode !== 'string' || !/^STU\d{6,}$/.test(studentCode)) {
      if (codeError?.code === 'PGRST202' || codeError?.code === '42883') {
        console.error('[students] The public.generate_student_code() RPC is missing from the PostgREST schema cache.');
        return res.status(503).json({
          error: 'Student ID generation is not available. Apply supabase/migrations/005_student_code_generator_repair.sql in Supabase SQL Editor, then retry.'
        });
      }
      console.error(`[students] Student ID generation failed${codeError?.code ? ` (${codeError.code})` : ''}.`);
      return res.status(500).json({ error: 'Could not generate a student ID. Check the database generator setup and try again.' });
    }
    const { data, error } = await supabaseAdmin.from('students')
      .insert({ ...values, student_code: studentCode, status: 'active' })
      .select(STUDENT_SELECT)
      .single();
    if (error) {
      if (error.code === '23505') {
        const duplicateStudentCode = /student_code/i.test(`${error.message || ''} ${error.details || ''}`);
        return res.status(409).json({
          error: duplicateStudentCode
            ? 'The generated Student ID already exists. Reapply the student code generator repair migration, then retry.'
            : 'A student record with this email already exists.'
        });
      }
      console.error('[students] Could not create a student record.');
      return res.status(500).json({ error: 'Could not create the student record.' });
    }
    res.status(201).json({ student: data });
  } catch {
    console.error('[students] Unexpected failure while creating a student record.');
    res.status(500).json({ error: 'Could not create the student record.' });
  }
});

router.patch('/students/:id', requireAuth, requireAdmin, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid student record ID.' });
  const body = req.body || {};
  const allowed = ['full_name', 'email', 'phone', 'department_id', 'course_id', 'admission_year'];
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    return res.status(400).json({ error: 'Student ID, account status, and linked profile cannot be changed here.' });
  }
  const { fields, values } = validateStudentFields(body, { partial: true });
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }
  if (!Object.keys(values).length) return res.status(400).json({ error: 'No editable student fields were provided.' });

  try {
    const { data: current, error: findError } = await supabaseAdmin.from('students')
      .select('id, department_id, course_id').eq('id', req.params.id).maybeSingle();
    if (findError) return res.status(500).json({ error: 'Could not load the student record.' });
    if (!current) return res.status(404).json({ error: 'Student record not found.' });

    const placementChanged = Object.prototype.hasOwnProperty.call(values, 'department_id')
      || Object.prototype.hasOwnProperty.call(values, 'course_id');
    if (placementChanged) {
      const departmentId = Object.prototype.hasOwnProperty.call(values, 'department_id') ? values.department_id : current.department_id;
      const courseId = Object.prototype.hasOwnProperty.call(values, 'course_id') ? values.course_id : current.course_id;
      const placementError = await validateStudentPlacement(departmentId, courseId);
      if (placementError) {
        return res.status(placementError.status).json({
          error: placementError.error,
          ...(placementError.field ? { fields: { [placementError.field]: placementError.error } } : {})
        });
      }
    }
    if (values.email) {
      const { data: duplicate, error } = await supabaseAdmin.from('students')
        .select('id').eq('email', values.email).neq('id', req.params.id).limit(1).maybeSingle();
      if (error) return res.status(500).json({ error: 'Could not validate the student email.' });
      if (duplicate) return res.status(409).json({ error: 'A student record with this email already exists.', fields: { email: 'This email is already assigned to another student record.' } });
    }

    const { data, error } = await supabaseAdmin.from('students')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select(STUDENT_SELECT).single();
    if (error) {
      console.error('[students] Could not update a student record.');
      return res.status(error.code === '23505' ? 409 : 500).json({
        error: error.code === '23505' ? 'A student record with this email already exists.' : 'Could not update the student record.'
      });
    }
    res.json({ student: data });
  } catch {
    console.error('[students] Unexpected failure while updating a student record.');
    res.status(500).json({ error: 'Could not update the student record.' });
  }
});

router.patch('/students/:id/status', requireAuth, requireAdmin, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid student record ID.' });
  const { status } = req.body || {};
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  try {
    const { data, error } = await supabaseAdmin.from('students')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select(STUDENT_SELECT).maybeSingle();
    if (error) {
      console.error('[students] Could not change student account status.');
      return res.status(500).json({ error: 'Could not change student status.' });
    }
    if (!data) return res.status(404).json({ error: 'Student record not found.' });
    res.json({ student: data });
  } catch {
    console.error('[students] Unexpected failure while changing student status.');
    res.status(500).json({ error: 'Could not change student status.' });
  }
});

router.get('/admins', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, account_status, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    if (profileError) {
      console.error('[admins] Could not load admin profiles.');
      return res.status(500).json({ error: 'Could not load admin accounts.' });
    }

    const adminsById = new Map((profiles || []).map(profile => [profile.id, {
      id: profile.id,
      full_name: profile.full_name,
      account_status: profile.account_status,
      created_at: profile.created_at,
      email: null
    }]));

    let page = 1;
    const perPage = 1000;
    while (adminsById.size && [...adminsById.values()].some(admin => admin.email === null)) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error('[admins] Could not load Auth users for admin email addresses.');
        return res.status(502).json({ error: 'Could not load admin email addresses.' });
      }

      for (const user of data?.users || []) {
        const admin = adminsById.get(user.id);
        if (admin) admin.email = user.email || null;
      }
      if (!data?.users || data.users.length < perPage) break;
      page += 1;
    }

    res.json({ admins: [...adminsById.values()] });
  } catch {
    console.error('[admins] Unexpected failure while loading admin accounts.');
    return res.status(502).json({ error: 'Could not load admin accounts.' });
  }
});

router.post('/admins', requireAuth, requireAdmin, async (req, res) => {
  const body = req.body || {};
  const fullName = typeof body.fullName === 'string'
    ? body.fullName.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const fieldErrors = {};

  if (!fullName) fieldErrors.fullName = 'Full name is required.';
  else if (fullName.length > 120) fieldErrors.fullName = 'Full name must be 120 characters or fewer.';
  if (!email) fieldErrors.email = 'Email address is required.';
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = 'Enter a valid email address.';
  }
  if (password.length < 8 || password.length > 128) {
    fieldErrors.password = 'Password must be between 8 and 128 characters.';
  }
  if (confirmPassword !== password) fieldErrors.confirmPassword = 'Passwords do not match.';
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: fieldErrors });
  }
  if (email === req.user.email?.toLowerCase()) {
    return res.status(409).json({ error: 'This email belongs to your current account.' });
  }

  let created;
  let createError;
  try {
    ({ data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    }));
  } catch {
    console.error('[admins] Supabase Auth request failed while creating an admin account.');
    return res.status(502).json({ error: 'Could not create the admin account. Check the backend Supabase configuration and try again.' });
  }

  if (createError) {
    const duplicate = /already (registered|exists)|already been registered/i.test(createError.message || '');
    if (duplicate) return res.status(409).json({ error: 'An account with this email already exists.' });
    if (Number(createError.status) === 422) {
      return res.status(400).json({
        error: 'Supabase rejected the account details. Check the email and the project Auth password policy.'
      });
    }
    console.error(`[admins] Supabase Auth could not create an admin account (status ${createError.status || 'unknown'}).`);
    return res.status(502).json({ error: 'Could not create the admin account. Check the backend Supabase configuration and try again.' });
  }
  if (!created?.user?.id) {
    console.error('[admins] Supabase Auth returned no user after admin creation.');
    return res.status(502).json({ error: 'Could not confirm the new Auth account. Check Supabase before retrying.' });
  }

  let profile;
  let profileError;
  try {
    ({ data: profile, error: profileError } = await supabaseAdmin.from('profiles')
      .upsert({
        id: created.user.id,
        role: 'admin',
        account_status: 'active',
        full_name: fullName
      }, { onConflict: 'id' })
      .select('id, role, account_status')
      .single());
  } catch {
    profileError = true;
  }

  if (profileError || !profile || profile.role !== 'admin' || profile.account_status !== 'active') {
    let cleanupError;
    try {
      ({ error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(created.user.id));
    } catch {
      cleanupError = true;
    }
    if (cleanupError) {
      console.error('[admins] Profile setup failed and Auth-user cleanup also failed.');
      return res.status(500).json({
        error: 'Admin setup did not complete and automatic cleanup failed. Contact support before retrying.'
      });
    }
    console.error('[admins] Profile setup failed; the new Auth user was removed.');
    return res.status(500).json({ error: 'Could not configure the admin profile. The new account was removed; please try again.' });
  }

  res.status(201).json({
    admin: {
      id: created.user.id,
      email: created.user.email,
      full_name: fullName,
      account_status: 'active',
      created_at: created.user.created_at
    }
  });
});

router.post('/registrations/validate', async (req, res) => {
  try {
    const result = await studentVerification.validateSignup(req.body);
    res.status(result.status).json(result.body);
  } catch {
    console.error('[registrations] Unexpected failure validating a signup.');
    res.status(500).json({ error: 'Could not validate the registration details.' });
  }
});

router.get('/registrations/pending', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await studentVerification.listPending();
    res.status(result.status).json(result.body);
  } catch {
    console.error('[registrations] Unexpected failure loading pending registrations.');
    res.status(500).json({ error: 'Could not load pending registrations.' });
  }
});

router.post('/registrations/:profileId/review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await studentVerification.review(
      req.params.profileId,
      req.body?.decision,
      req.user.id
    );
    res.status(result.status).json(result.body);
  } catch {
    console.error('[registrations] Unexpected failure reviewing a registration.');
    res.status(500).json({ error: 'Could not review the registration.' });
  }
});

router.get('/profile/me', requireAuth, requireVerifiedStudent, async (req, res) => {
  const result = await studentProfile.get(req.user.id);
  res.status(result.status).json(result.body);
});

router.patch('/profile/me', requireAuth, requireVerifiedStudent, async (req, res) => {
  const result = await studentProfile.updatePhone(req.user.id, req.body);
  res.status(result.status).json(result.body);
});

router.get('/faculty/me/dashboard', requireAuth, requireFaculty, async (req, res) => {
  const result = await faculty.dashboard(req.user.id);
  res.status(result.status).json(result.body);
});

// Initial Admin-only API foundations. Full CRUD validation will be added in later phases.
const adminListRoutes = [
  ['/departments', 'departments'],
  ['/courses', 'courses'],
  ['/subjects', 'subjects'],
  ['/assignments', 'faculty_subject_assignments']
];
for (const [path, table] of adminListRoutes) {
  router.get(path, requireAuth, requireAdmin, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const { data, error, count } = await supabaseAdmin.from(table)
      .select('*', { count: 'exact' }).range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ error: `Could not load ${table}.` });
    res.json({ data, count, limit, offset });
  });
}

router.get('/reports/summary', requireAuth, requireAdmin, async (_req, res) => {
  const tables = ['students', 'faculty', 'departments', 'courses', 'subjects'];
  const summary = {};
  for (const table of tables) {
    const { count, error } = await supabaseAdmin.from(table)
      .select('*', { count: 'exact', head: true }).eq('status', 'active');
    if (error) return res.status(500).json({ error: 'Could not load report summary.' });
    summary[table] = count || 0;
  }
  res.json({ summary });
});

router.use('/academic', createAcademicRouter(supabaseAdmin));

export default router;
