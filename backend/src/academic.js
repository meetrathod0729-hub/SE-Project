
import { Router } from 'express';
import { requireAuth, requireAdmin } from './middleware/auth.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES = ['active', 'inactive'];

const RESOURCE_SPECS = {
  years: {
    table: 'academic_years',
    fields: ['year_code', 'label', 'start_date', 'end_date', 'status'],
    required: ['year_code', 'label', 'start_date', 'end_date'],
    key: 'academic_years'
  },
  semesters: {
    table: 'semesters',
    fields: [
      'academic_year_id',
      'semester_number',
      'label',
      'start_date',
      'end_date',
      'status'
    ],
    required: [
      'academic_year_id',
      'semester_number',
      'label',
      'start_date',
      'end_date'
    ],
    key: 'semesters'
  },
  departments: {
    table: 'departments',
    fields: ['name', 'code', 'status'],
    required: ['name', 'code'],
    key: 'departments'
  },
  courses: {
    table: 'courses',
    fields: [
      'department_id',
      'name',
      'code',
      'status',
      'faculty_ids',
      'semester_id'
    ],
    required: ['department_id', 'name', 'code', 'semester_id'],
    key: 'courses'
  }
};

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function validateText(value, field, maxLength, errors, { uppercase = false } = {}) {
  if (typeof value !== 'string') {
    errors[field] = `${field.replaceAll('_', ' ')} is required.`;
    return undefined;
  }

  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');

  if (!normalized || normalized.length > maxLength) {
    errors[field] =
      `${field.replaceAll('_', ' ')} must be between 1 and ${maxLength} characters.`;
    return undefined;
  }

  return uppercase ? normalized.toUpperCase() : normalized;
}

function validateDateRange(body, errors) {
  const dates = {};

  for (const field of ['start_date', 'end_date']) {
    if (!validDate(body[field])) {
      errors[field] = 'Enter a valid date in YYYY-MM-DD format.';
    } else {
      dates[field] = body[field];
    }
  }

  if (
    dates.start_date &&
    dates.end_date &&
    dates.start_date > dates.end_date
  ) {
    errors.end_date = 'End date must be on or after the start date.';
  }

  return dates;
}

function normalizePayload(resource, body) {
  const spec = RESOURCE_SPECS[resource];

  if (!spec) {
    return { errors: { resource: 'Unknown academic resource.' } };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'Request body must be an object.' } };
  }

  const unexpected = Object.keys(body).filter(
    key => !spec.fields.includes(key)
  );

  if (unexpected.length) {
    return { errors: { body: `Unsupported field: ${unexpected[0]}.` } };
  }

  const errors = {};
  const values = {};

  for (const field of spec.required) {
    if (!Object.hasOwn(body, field)) {
      errors[field] = `${field.replaceAll('_', ' ')} is required.`;
    }
  }

  if (Object.hasOwn(body, 'status')) {
    if (!STATUS_VALUES.includes(body.status)) {
      errors.status = 'Status must be active or inactive.';
    } else {
      values.status = body.status;
    }
  }

  if (resource === 'years') {
    if (Object.hasOwn(body, 'year_code')) {
      values.year_code = validateText(
        body.year_code, 'year_code', 30, errors, { uppercase: true }
      );
    }

    if (Object.hasOwn(body, 'label')) {
      values.label = validateText(body.label, 'label', 100, errors);
    }

    if (Object.hasOwn(body, 'start_date') || Object.hasOwn(body, 'end_date')) {
      Object.assign(values, validateDateRange(body, errors));
    }
  }

  if (resource === 'semesters') {
    if (Object.hasOwn(body, 'academic_year_id')) {
      if (
        typeof body.academic_year_id !== 'string' ||
        !UUID_PATTERN.test(body.academic_year_id)
      ) {
        errors.academic_year_id = 'Select a valid academic year.';
      } else {
        values.academic_year_id = body.academic_year_id;
      }
    }

    if (Object.hasOwn(body, 'semester_number')) {
      const number = Number(body.semester_number);

      if (!Number.isInteger(number) || number < 1 || number > 50) {
        errors.semester_number =
          'Semester number must be an integer from 1 to 50.';
      } else {
        values.semester_number = number;
      }
    }

    if (Object.hasOwn(body, 'label')) {
      values.label = validateText(body.label, 'label', 100, errors);
    }

    if (Object.hasOwn(body, 'start_date') || Object.hasOwn(body, 'end_date')) {
      Object.assign(values, validateDateRange(body, errors));
    }
  }

  if (resource === 'departments') {
    if (Object.hasOwn(body, 'name')) {
      values.name = validateText(body.name, 'name', 120, errors);
    }

    if (Object.hasOwn(body, 'code')) {
      values.code = validateText(
        body.code, 'code', 30, errors, { uppercase: true }
      );
    }
  }

  let facultyIds;
  let semesterId;

  if (resource === 'courses') {
    if (Object.hasOwn(body, 'department_id')) {
      if (
        typeof body.department_id !== 'string' ||
        !UUID_PATTERN.test(body.department_id)
      ) {
        errors.department_id = 'Select a valid department.';
      } else {
        values.department_id = body.department_id;
      }
    }

    if (Object.hasOwn(body, 'name')) {
      values.name = validateText(body.name, 'name', 120, errors);
    }

    if (Object.hasOwn(body, 'code')) {
      values.code = validateText(
        body.code, 'code', 30, errors, { uppercase: true }
      );
    }

    if (Object.hasOwn(body, 'semester_id')) {
      if (
        typeof body.semester_id !== 'string' ||
        !UUID_PATTERN.test(body.semester_id)
      ) {
        errors.semester_id = 'Select a valid semester.';
      } else {
        semesterId = body.semester_id;
      }
    }

    if (Object.hasOwn(body, 'faculty_ids')) {
      if (
        !Array.isArray(body.faculty_ids) ||
        body.faculty_ids.some(
          id => typeof id !== 'string' || !UUID_PATTERN.test(id)
        ) ||
        new Set(body.faculty_ids).size !== body.faculty_ids.length
      ) {
        errors.faculty_ids =
          'Select valid faculty members without duplicate selections.';
      } else {
        facultyIds = body.faculty_ids;
      }
    }
  }

  return { errors, values, facultyIds, semesterId };
}

function errorResponse(error) {
  if (error?.code === '23505') {
    return {
      status: 409,
      body: {
        error: 'An academic record with these unique values already exists.'
      }
    };
  }

  if (error?.code === '23503' || error?.code === '23514') {
    return {
      status: 400,
      body: {
        error: 'The academic record references an invalid or incompatible record.'
      }
    };
  }

  console.error(
    `[academic] Database operation failed${error?.code ? ` (${error.code})` : ''}:`,
    error?.message || 'unknown error'
  );

  return { status: 500, body: { error: 'Could not save academic data.' } };
}

async function validateReferences(db, resource, values, recordId) {
  if (recordId && resource === 'years' && values.status === 'inactive') {
    const { data, error } = await db.from('semesters')
      .select('id')
      .eq('academic_year_id', recordId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (error) {
      return { status: 500, body: { error: 'Could not check active semesters.' } };
    }

    if (data) {
      return {
        status: 409,
        body: { error: 'Deactivate this academic year’s active semesters first.' }
      };
    }
  }

  if (resource === 'semesters' && values.academic_year_id) {
    const { data, error } = await db.from('academic_years')
      .select('id, start_date, end_date, status')
      .eq('id', values.academic_year_id)
      .maybeSingle();

    if (error) {
      return { status: 500, body: { error: 'Could not validate the academic year.' } };
    }

    if (!data) {
      return {
        status: 400,
        body: {
          error: 'Select an existing academic year.',
          fields: { academic_year_id: 'Academic year not found.' }
        }
      };
    }

    if (values.status !== 'inactive' && data.status !== 'active') {
      return {
        status: 400,
        body: {
          error: 'An active semester must belong to an active academic year.',
          fields: { academic_year_id: 'Academic year is inactive.' }
        }
      };
    }

    if (
      (values.start_date && values.start_date < data.start_date) ||
      (values.end_date && values.end_date > data.end_date)
    ) {
      return {
        status: 400,
        body: {
          error: 'Semester dates must fall within the selected academic year.',
          fields: {
            start_date: 'Semester dates must be within the academic year.'
          }
        }
      };
    }
  }

  if (resource === 'courses' && values.department_id) {
    const { data, error } = await db.from('departments')
      .select('id, status')
      .eq('id', values.department_id)
      .maybeSingle();

    if (error) {
      return { status: 500, body: { error: 'Could not validate the department.' } };
    }

    if (!data) {
      return {
        status: 400,
        body: {
          error: 'Select an existing department.',
          fields: { department_id: 'Department not found.' }
        }
      };
    }

    if (values.status !== 'inactive' && data.status !== 'active') {
      return {
        status: 400,
        body: {
          error: 'An active course must belong to an active department.',
          fields: { department_id: 'Department is inactive.' }
        }
      };
    }
  }

  if (recordId && resource === 'semesters' && values.status === 'inactive') {
    const [offerings, courseAssignments] = await Promise.all([
      db.from('subject_offerings')
        .select('id')
        .eq('semester_id', recordId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
      db.from('course_semester_assignments')
        .select('id')
        .eq('semester_id', recordId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
    ]);

    if (offerings.error || courseAssignments.error) {
      return {
        status: 500,
        body: { error: 'Could not check active semester assignments.' }
      };
    }

    if (offerings.data || courseAssignments.data) {
      return {
        status: 409,
        body: {
          error: 'Deactivate this semester’s active offerings and course assignments first.'
        }
      };
    }
  }

  if (recordId && resource === 'courses' && values.status === 'inactive') {
    const [subjects, offerings, assignments, semesterAssignments] =
      await Promise.all([
        db.from('subjects').select('id')
          .eq('course_id', recordId).eq('status', 'active')
          .limit(1).maybeSingle(),
        db.from('subject_offerings').select('id')
          .eq('course_id', recordId).eq('status', 'active')
          .limit(1).maybeSingle(),
        db.from('course_faculty_assignments').select('id')
          .eq('course_id', recordId).eq('status', 'active')
          .limit(1).maybeSingle(),
        db.from('course_semester_assignments').select('id')
          .eq('course_id', recordId).eq('status', 'active')
          .limit(1).maybeSingle()
      ]);

    if (
      subjects.error || offerings.error ||
      assignments.error || semesterAssignments.error
    ) {
      return {
        status: 500,
        body: { error: 'Could not check active course records.' }
      };
    }

    if (
      subjects.data || offerings.data ||
      assignments.data || semesterAssignments.data
    ) {
      return {
        status: 409,
        body: {
          error: 'Deactivate this course’s active subjects, offerings, professor assignments, and semester assignments first.'
        }
      };
    }
  }

  return null;
}

async function validateSemesterId(db, semesterId) {
  if (!semesterId) {
    return {
      status: 400,
      body: {
        error: 'Select a semester.',
        fields: { semester_id: 'Semester is required.' }
      }
    };
  }

  const { data, error } = await db.from('semesters')
    .select('id, status')
    .eq('id', semesterId)
    .maybeSingle();

  if (error) {
    return {
      status: 500,
      body: { error: 'Could not validate the selected semester.' }
    };
  }

  if (!data) {
    return {
      status: 400,
      body: {
        error: 'The selected semester does not exist.',
        fields: { semester_id: 'Semester not found.' }
      }
    };
  }

  if (data.status !== 'active') {
    return {
      status: 400,
      body: {
        error: 'Select an active semester.',
        fields: { semester_id: 'Semester is inactive.' }
      }
    };
  }

  return null;
}

async function validateFacultyIds(db, facultyIds) {
  if (facultyIds === undefined || facultyIds.length === 0) return null;

  const { data, error } = await db.from('faculty')
    .select('id, status')
    .in('id', facultyIds);

  if (error) {
    return {
      status: 500,
      body: { error: 'Could not validate the selected faculty members.' }
    };
  }

  const byId = new Map((data || []).map(item => [item.id, item]));

  for (const id of facultyIds) {
    const faculty = byId.get(id);

    if (!faculty) {
      return {
        status: 400,
        body: { error: 'One or more selected faculty members do not exist.' }
      };
    }

    if (faculty.status !== 'active') {
      return {
        status: 400,
        body: { error: 'Only active faculty members can be assigned to a course.' }
      };
    }
  }

  return null;
}

async function syncCourseFaculty(db, courseId, facultyIds) {
  if (facultyIds === undefined) return { error: null };

  const { error: deactivateError } = await db
    .from('course_faculty_assignments')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('course_id', courseId)
    .eq('status', 'active');

  if (deactivateError) return { error: deactivateError };

  if (facultyIds.length === 0) return { error: null };

  const rows = facultyIds.map(facultyId => ({
    course_id: courseId,
    faculty_id: facultyId,
    status: 'active',
    updated_at: new Date().toISOString()
  }));

  const { error: upsertError } = await db
    .from('course_faculty_assignments')
    .upsert(rows, {
      onConflict: 'course_id,faculty_id',
      ignoreDuplicates: false
    });

  return { error: upsertError || null };
}

async function syncCourseSemester(db, courseId, semesterId) {
  if (semesterId === undefined) return { error: null };

  const { error } = await db
    .from('course_semester_assignments')
    .upsert(
      {
        course_id: courseId,
        semester_id: semesterId,
        status: 'active',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'course_id,semester_id' }
    );

  if (error) return { error };

  // Keep only the selected semester active for this course.
  const { error: deactivateError } = await db
    .from('course_semester_assignments')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('course_id', courseId)
    .neq('semester_id', semesterId)
    .eq('status', 'active');

  return { error: deactivateError || null };
}

export function createAcademicRouter(
  db,
  authorization = {
    requireAuthMiddleware: requireAuth,
    requireAdminMiddleware: requireAdmin
  }
) {
  const router = Router();

  router.use(
    authorization.requireAuthMiddleware,
    authorization.requireAdminMiddleware
  );

  router.get('/', async (_req, res) => {
    try {
      const [
        years,
        semesters,
        departments,
        courses,
        faculty,
        assignments,
        semesterAssignments
      ] = await Promise.all([
        db.from('academic_years')
          .select('*')
          .order('start_date', { ascending: false }),
        db.from('semesters')
          .select('*, academic_year:academic_years(id, year_code, label)')
          .order('start_date', { ascending: false }),
        db.from('departments')
          .select('*')
          .order('name'),
        db.from('courses')
          .select('*, department:departments(id, name, code)')
          .order('name'),
        db.from('faculty')
          .select('id, faculty_code, full_name, email, designation, status, department_id')
          .order('full_name'),
        db.from('course_faculty_assignments')
          .select('id, course_id, faculty_id, status')
          .eq('status', 'active'),
        db.from('course_semester_assignments')
          .select('id, course_id, semester_id, status')
          .eq('status', 'active')
      ]);

      const failed = [
        years,
        semesters,
        departments,
        courses,
        faculty,
        assignments,
        semesterAssignments
      ].find(result => result.error);

      if (failed) {
        console.error('[academic] List query failed:', failed.error?.message);
        return res.status(500).json({
          error: 'Could not load academic management data. Verify that migrations 010 and 012 have been applied.'
        });
      }

      const facultyById = new Map(
        (faculty.data || []).map(person => [person.id, person])
      );

      const semestersById = new Map(
        (semesters.data || []).map(semester => [semester.id, semester])
      );

      const assignmentsByCourse = new Map();

      for (const assignment of assignments.data || []) {
        const person = facultyById.get(assignment.faculty_id);
        if (!person) continue;

        const list = assignmentsByCourse.get(assignment.course_id) || [];

        list.push({
          ...person,
          assignment_id: assignment.id,
          assignment_status: assignment.status
        });

        assignmentsByCourse.set(assignment.course_id, list);
      }

      const semesterByCourse = new Map();

      for (const assignment of semesterAssignments.data || []) {
        const semester = semestersById.get(assignment.semester_id);
        if (!semester) continue;

        semesterByCourse.set(assignment.course_id, {
          ...semester,
          assignment_id: assignment.id,
          assignment_status: assignment.status
        });
      }

      const coursesWithAssignments = (courses.data || []).map(course => {
        const professors = assignmentsByCourse.get(course.id) || [];
        const semester = semesterByCourse.get(course.id) || null;

        return {
          ...course,
          professors,
          faculty_ids: professors.map(person => person.id),
          semester,
          semester_id: semester?.id || ''
        };
      });

      res.json({
        academic_years: years.data || [],
        semesters: semesters.data || [],
        departments: departments.data || [],
        courses: coursesWithAssignments,
        faculty: faculty.data || []
      });
    } catch (error) {
      console.error('[academic] Unexpected list failure:', error?.message || 'unknown error');
      res.status(500).json({ error: 'Could not load academic management data.' });
    }
  });

  for (const [resource, spec] of Object.entries(RESOURCE_SPECS)) {
    router.post(`/${resource}`, async (req, res) => {
      const { errors, values, facultyIds, semesterId } =
        normalizePayload(resource, req.body);

      if (Object.keys(errors).length) {
        return res.status(400).json({
          error: 'Please correct the highlighted fields.',
          fields: errors
        });
      }

      try {
        const referenceError = await validateReferences(
          db, resource, values, undefined
        );

        if (referenceError) {
          return res.status(referenceError.status).json(referenceError.body);
        }

        if (resource === 'courses') {
          const semesterError = await validateSemesterId(db, semesterId);
          if (semesterError) {
            return res.status(semesterError.status).json(semesterError.body);
          }

          const facultyError = await validateFacultyIds(db, facultyIds);
          if (facultyError) {
            return res.status(facultyError.status).json(facultyError.body);
          }
        }

        const { data, error } = await db.from(spec.table)
          .insert(values)
          .select('*')
          .single();

        if (error) {
          const result = errorResponse(error);
          return res.status(result.status).json(result.body);
        }

        if (resource === 'courses') {
          const semesterResult = await syncCourseSemester(
            db, data.id, semesterId
          );

          if (semesterResult.error) {
            console.error('[academic] Course saved but semester assignment failed:', semesterResult.error.message);
            await db.from('courses').delete().eq('id', data.id);

            return res.status(500).json({
              error: 'Could not save the course semester assignment. The course creation was rolled back where possible.'
            });
          }

          if (facultyIds !== undefined) {
            const facultyResult = await syncCourseFaculty(db, data.id, facultyIds);

            if (facultyResult.error) {
              console.error('[academic] Course saved but faculty assignment failed:', facultyResult.error.message);
              await db.from('courses').delete().eq('id', data.id);

              return res.status(500).json({
                error: 'Could not save the professor assignments. The course creation was rolled back where possible.'
              });
            }
          }
        }

        return res.status(201).json({
          [spec.key === 'courses' ? 'course' : resource]: data
        });
      } catch (error) {
        const result = errorResponse(error);
        return res.status(result.status).json(result.body);
      }
    });

    router.patch(`/${resource}/:id`, async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid academic record ID.' });
      }

      const { errors, values, facultyIds, semesterId } =
        normalizePayload(resource, req.body);

      if (Object.keys(errors).length) {
        return res.status(400).json({
          error: 'Please provide a complete, valid academic record.',
          fields: errors
        });
      }

      try {
        const referenceError = await validateReferences(
          db, resource, values, req.params.id
        );

        if (referenceError) {
          return res.status(referenceError.status).json(referenceError.body);
        }

        if (resource === 'courses') {
          const semesterError = await validateSemesterId(db, semesterId);
          if (semesterError) {
            return res.status(semesterError.status).json(semesterError.body);
          }

          const facultyError = await validateFacultyIds(db, facultyIds);
          if (facultyError) {
            return res.status(facultyError.status).json(facultyError.body);
          }
        }

        const { data, error } = await db.from(spec.table)
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq('id', req.params.id)
          .select('*')
          .maybeSingle();

        if (error) {
          const result = errorResponse(error);
          return res.status(result.status).json(result.body);
        }

        if (!data) {
          return res.status(404).json({ error: 'Academic record not found.' });
        }

        if (resource === 'courses') {
          const semesterResult = await syncCourseSemester(
            db, data.id, semesterId
          );

          if (semesterResult.error) {
            console.error('[academic] Course updated but semester assignment failed:', semesterResult.error.message);
            return res.status(500).json({
              error: 'Course was saved, but its semester assignment could not be updated.'
            });
          }

          if (facultyIds !== undefined) {
            const facultyResult = await syncCourseFaculty(db, data.id, facultyIds);

            if (facultyResult.error) {
              console.error('[academic] Course updated but faculty assignment failed:', facultyResult.error.message);
              return res.status(500).json({
                error: 'Course was saved, but professor assignments could not be updated. Please retry.'
              });
            }
          }
        }

        return res.json({
          [spec.key === 'courses' ? 'course' : resource]: data
        });
      } catch (error) {
        const result = errorResponse(error);
        return res.status(result.status).json(result.body);
      }
    });
  }

  return router;
}
