
import { Router } from 'express';
import { requireAuth, requireFaculty } from './middleware/auth.js';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ATTENDANCE_STATUSES = new Set(['present', 'absent', 'late']);

function validDate(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function cleanText(value, maxLength = 500) {
    if (value == null) return null;
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim();
    return cleaned ? cleaned.slice(0, maxLength) : null;
}

function sendDbError(res, label, error) {
    console.error(`[attendance] ${label}:`, error?.code || error?.message || 'unknown error');
    return res.status(500).json({ error: `Could not ${label}.` });
}

export function createFacultyAttendanceRouter(supabaseAdmin) {
    const router = Router();

    router.use(requireAuth, requireFaculty);

    async function hasCourseAssignment(facultyId, courseId) {
        const { data, error } = await supabaseAdmin
            .from('course_faculty_assignments')
            .select('id')
            .eq('faculty_id', facultyId)
            .eq('course_id', courseId)
            .eq('status', 'active')
            .maybeSingle();

        if (error) throw error;
        return Boolean(data);
    }

    async function getSession(sessionId, facultyId) {
        const { data, error } = await supabaseAdmin
            .from('attendance_sessions')
            .select(`
        id, course_id, semester_id, faculty_id, session_date,
        topic, notes, status, submitted_at, created_at, updated_at,
        course:courses(id, name, code),
        semester:semesters(id, name, status)
      `)
            .eq('id', sessionId)
            .eq('faculty_id', facultyId)
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    // Courses assigned to the currently authenticated faculty member.

    router.get('/courses', async (req, res) => {
        try {
            const { data: assignments, error } = await supabaseAdmin
                .from('course_faculty_assignments')
                .select(`
        course_id,
        course:courses(
          id,
          name,
          code,
          department_id,
          department:departments(id, name, code)
        )
      `)
                .eq('faculty_id', req.faculty.id)
                .eq('status', 'active');

            if (error) {
                console.error('[attendance] Course assignments failed:', error.message);
                return res.status(500).json({
                    error: 'Could not load assigned courses.'
                });
            }

            const courses = (assignments || [])
                .map(item => item.course)
                .filter(Boolean);

            const uniqueCourses = [
                ...new Map(courses.map(course => [course.id, course])).values()
            ];

            if (uniqueCourses.length === 0) {
                return res.json({ courses: [] });
            }

            const courseIds = uniqueCourses.map(course => course.id);

            const { data: semesterAssignments, error: semesterError } =
                await supabaseAdmin
                    .from('course_semester_assignments')
                    .select(`
          course_id,
          semester_id,
          semester:semesters(
            id,
            label,
            semester_number,
            status,
            academic_year:academic_years(id, year_code, label)
          )
        `)
                    .in('course_id', courseIds)
                    .eq('status', 'active');

            if (semesterError) {
                console.error(
                    '[attendance] Course semester assignments failed:',
                    semesterError.message
                );

                return res.status(500).json({
                    error: 'Could not load course semester assignments.'
                });
            }

            const semesterByCourse = new Map(
                (semesterAssignments || [])
                    .filter(item => item.semester?.status === 'active')
                    .map(item => [
                        item.course_id,
                        {
                            ...item.semester,
                            name: item.semester.label ||
                                `Semester ${item.semester.semester_number}`
                        }
                    ])
            );

            res.json({
                courses: uniqueCourses.map(course => ({
                    ...course,
                    semester: semesterByCourse.get(course.id) || null,
                    semester_id: semesterByCourse.get(course.id)?.id || ''
                }))
            });
        } catch (error) {
            console.error('[attendance] Courses endpoint failed:', error.message);

            res.status(500).json({
                error: 'Could not load assigned courses.'
            });
        }
    });


    // Active semesters available for attendance.

    router.get('/semesters', async (_req, res) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('semesters')
                .select(`
        id,
        label,
        semester_number,
        academic_year_id,
        status,
        academic_year:academic_years(id, year_code, label)
      `)
                .eq('status', 'active')
                .order('semester_number');

            if (error) {
                console.error('[attendance] Could not load semesters:', error.message);
                return res.status(500).json({
                    error: 'Could not load active semesters.'
                });
            }

            res.json({
                semesters: (data || []).map(semester => ({
                    ...semester,
                    name: semester.label || `Semester ${semester.semester_number}`
                }))
            });
        } catch (error) {
            console.error('[attendance] Semester endpoint failed:', error.message);
            res.status(500).json({
                error: 'Could not load active semesters.'
            });
        }
    });



    // List sessions for one assigned course and semester.
    router.get('/sessions', async (req, res) => {
        const { course_id: courseId, semester_id: semesterId } = req.query;

        if (!UUID_PATTERN.test(courseId || '') || !UUID_PATTERN.test(semesterId || '')) {
            return res.status(400).json({ error: 'Select a valid course and semester.' });
        }

        try {
            if (!(await hasCourseAssignment(req.faculty.id, courseId))) {
                return res.status(403).json({ error: 'You are not assigned to this course.' });
            }

            const { data, error } = await supabaseAdmin
                .from('attendance_sessions')
                .select('id, course_id, semester_id, session_date, topic, status, submitted_at, updated_at')
                .eq('faculty_id', req.faculty.id)
                .eq('course_id', courseId)
                .eq('semester_id', semesterId)
                .order('session_date', { ascending: false });

            if (error) return sendDbError(res, 'load attendance sessions', error);
            res.json({ sessions: data || [] });
        } catch (error) {
            return sendDbError(res, 'load attendance sessions', error);
        }
    });

    // Load the explicitly enrolled student roster and any saved attendance for a date.
    router.get('/roster', async (req, res) => {
        const { course_id: courseId, semester_id: semesterId, date } = req.query;

        if (!UUID_PATTERN.test(courseId || '') ||
            !UUID_PATTERN.test(semesterId || '') ||
            !validDate(date)) {
            return res.status(400).json({ error: 'Select a valid course, semester, and date.' });
        }

        try {
            if (!(await hasCourseAssignment(req.faculty.id, courseId))) {
                return res.status(403).json({ error: 'You are not assigned to this course.' });
            }

            const { data: enrollments, error: enrollmentError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select('student_id')
                .eq('course_id', courseId)
                .eq('semester_id', semesterId)
                .eq('status', 'enrolled');

            if (enrollmentError) {
                return sendDbError(res, 'load enrolled students', enrollmentError);
            }

            const studentIds = [...new Set((enrollments || []).map(row => row.student_id))];

            const [sessionResult, studentsResult] = await Promise.all([
                supabaseAdmin.from('attendance_sessions')
                    .select('id, status, topic, notes, submitted_at')
                    .eq('faculty_id', req.faculty.id)
                    .eq('course_id', courseId)
                    .eq('semester_id', semesterId)
                    .eq('session_date', date)
                    .maybeSingle(),
                studentIds.length
                    ? supabaseAdmin.from('students')
                        .select('id, student_code, full_name, email')
                        .in('id', studentIds)
                        .eq('status', 'active')
                        .order('full_name')
                    : Promise.resolve({ data: [], error: null })
            ]);

            if (sessionResult.error) {
                return sendDbError(res, 'load attendance session', sessionResult.error);
            }
            if (studentsResult.error) {
                return sendDbError(res, 'load enrolled students', studentsResult.error);
            }

            const session = sessionResult.data;
            let records = [];

            if (session) {
                const { data, error } = await supabaseAdmin
                    .from('attendance_records')
                    .select('student_id, attendance_status, remarks')
                    .eq('session_id', session.id);

                if (error) return sendDbError(res, 'load saved attendance', error);
                records = data || [];
            }

            const recordMap = new Map(records.map(record => [record.student_id, record]));
            const students = (studentsResult.data || []).map(student => {
                const record = recordMap.get(student.id);
                return {
                    ...student,
                    attendance_status: record?.attendance_status || 'present',
                    remarks: record?.remarks || ''
                };
            });

            res.json({
                session,
                students,
                enrolledCount: students.length
            });
        } catch (error) {
            return sendDbError(res, 'load attendance roster', error);
        }
    });

    // Create a session or save changes to an existing open session.
    router.post('/sessions', async (req, res) => {
        const body = req.body || {};
        const courseId = body.course_id;
        const semesterId = body.semester_id;
        const sessionDate = body.session_date;
        const topic = cleanText(body.topic, 200);
        const notes = cleanText(body.notes, 2000);
        const attendance = body.attendance;

        if (!UUID_PATTERN.test(courseId || '') ||
            !UUID_PATTERN.test(semesterId || '') ||
            !validDate(sessionDate)) {
            return res.status(400).json({ error: 'Select a valid course, semester, and date.' });
        }
        if (topic === undefined || notes === undefined) {
            return res.status(400).json({ error: 'Topic or notes are invalid.' });
        }
        if (!Array.isArray(attendance)) {
            return res.status(400).json({ error: 'Attendance must be a list of student statuses.' });
        }
        if (attendance.length > 1000) {
            return res.status(400).json({ error: 'Too many attendance records in one request.' });
        }

        const seen = new Set();
        for (const row of attendance) {
            if (!UUID_PATTERN.test(row?.student_id || '') ||
                !ATTENDANCE_STATUSES.has(row?.attendance_status) ||
                (row?.remarks != null && typeof row.remarks !== 'string') ||
                seen.has(row.student_id)) {
                return res.status(400).json({ error: 'One or more attendance entries are invalid or duplicated.' });
            }
            seen.add(row.student_id);
        }

        try {
            if (!(await hasCourseAssignment(req.faculty.id, courseId))) {
                return res.status(403).json({ error: 'You are not assigned to this course.' });
            }

            const { data: enrollmentRows, error: enrollmentError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select('student_id')
                .eq('course_id', courseId)
                .eq('semester_id', semesterId)
                .eq('status', 'enrolled');

            if (enrollmentError) {
                return sendDbError(res, 'validate student enrollment', enrollmentError);
            }

            const enrolledIds = new Set((enrollmentRows || []).map(row => row.student_id));
            if (attendance.some(row => !enrolledIds.has(row.student_id))) {
                return res.status(400).json({
                    error: 'Attendance contains a student who is not actively enrolled in this course and semester.'
                });
            }

            // A unique course/semester/date constraint allows one session per course per day.
            const { data: existing, error: existingError } = await supabaseAdmin
                .from('attendance_sessions')
                .select('id, status')
                .eq('course_id', courseId)
                .eq('semester_id', semesterId)
                .eq('session_date', sessionDate)
                .maybeSingle();

            if (existingError) return sendDbError(res, 'check attendance session', existingError);
            if (existing && existing.faculty_id && existing.faculty_id !== req.faculty.id) {
                return res.status(403).json({ error: 'This session belongs to another faculty member.' });
            }
            if (existing?.status === 'submitted') {
                return res.status(409).json({ error: 'This session has been submitted. Reopen it before editing.' });
            }

            let session;
            if (existing) {
                const { data, error } = await supabaseAdmin
                    .from('attendance_sessions')
                    .update({
                        topic,
                        notes,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                    .eq('faculty_id', req.faculty.id)
                    .select('*')
                    .single();

                if (error) return sendDbError(res, 'update attendance session', error);
                session = data;
            } else {
                const { data, error } = await supabaseAdmin
                    .from('attendance_sessions')
                    .insert({
                        course_id: courseId,
                        semester_id: semesterId,
                        faculty_id: req.faculty.id,
                        session_date: sessionDate,
                        topic,
                        notes,
                        status: 'open'
                    })
                    .select('*')
                    .single();

                if (error) {
                    if (error.code === '23505') {
                        return res.status(409).json({
                            error: 'An attendance session for this course and date already exists. Refresh and try again.'
                        });
                    }
                    return sendDbError(res, 'create attendance session', error);
                }
                session = data;
            }

            if (attendance.length) {
                const rows = attendance.map(row => ({
                    session_id: session.id,
                    student_id: row.student_id,
                    attendance_status: row.attendance_status,
                    remarks: cleanText(row.remarks, 500),
                    marked_by: req.faculty.id
                }));

                if (rows.some(row => row.remarks === undefined)) {
                    return res.status(400).json({ error: 'One or more remarks are invalid.' });
                }

                const { error } = await supabaseAdmin
                    .from('attendance_records')
                    .upsert(rows, { onConflict: 'session_id,student_id' });

                if (error) return sendDbError(res, 'save attendance records', error);
            }

            res.json({ message: 'Attendance saved successfully.', session });
        } catch (error) {
            return sendDbError(res, 'save attendance', error);
        }
    });

    // Submit a saved session. It becomes read-only until reopened.
    router.post('/sessions/:id/submit', async (req, res) => {
        if (!UUID_PATTERN.test(req.params.id)) {
            return res.status(400).json({ error: 'Invalid attendance session ID.' });
        }

        try {
            const session = await getSession(req.params.id, req.faculty.id);
            if (!session) return res.status(404).json({ error: 'Attendance session not found.' });
            if (session.status === 'submitted') {
                return res.json({ message: 'Attendance was already submitted.', session });
            }

            const { data: enrollments, error: enrollmentError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select('student_id')
                .eq('course_id', session.course_id)
                .eq('semester_id', session.semester_id)
                .eq('status', 'enrolled');

            if (enrollmentError) return sendDbError(res, 'validate enrolled students', enrollmentError);

            const enrolledIds = new Set((enrollments || []).map(row => row.student_id));
            const { data: records, error: recordsError } = await supabaseAdmin
                .from('attendance_records')
                .select('student_id')
                .eq('session_id', session.id);

            if (recordsError) return sendDbError(res, 'validate attendance records', recordsError);

            const markedIds = new Set((records || []).map(row => row.student_id));
            const missing = [...enrolledIds].filter(id => !markedIds.has(id));

            if (missing.length) {
                return res.status(400).json({
                    error: `Mark attendance for all enrolled students before submitting. ${missing.length} student(s) remain unmarked.`
                });
            }

            const { data, error } = await supabaseAdmin
                .from('attendance_sessions')
                .update({
                    status: 'submitted',
                    submitted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', session.id)
                .eq('faculty_id', req.faculty.id)
                .select('*')
                .single();

            if (error) return sendDbError(res, 'submit attendance', error);
            res.json({ message: 'Attendance submitted successfully.', session: data });
        } catch (error) {
            return sendDbError(res, 'submit attendance', error);
        }
    });

    // Reopen a submitted session for corrections.
    router.post('/sessions/:id/reopen', async (req, res) => {
        if (!UUID_PATTERN.test(req.params.id)) {
            return res.status(400).json({ error: 'Invalid attendance session ID.' });
        }

        try {
            const session = await getSession(req.params.id, req.faculty.id);
            if (!session) return res.status(404).json({ error: 'Attendance session not found.' });
            if (session.status === 'open') {
                return res.json({ message: 'Attendance session is already open.', session });
            }

            const { data, error } = await supabaseAdmin
                .from('attendance_sessions')
                .update({
                    status: 'open',
                    submitted_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', session.id)
                .eq('faculty_id', req.faculty.id)
                .select('*')
                .single();

            if (error) return sendDbError(res, 'reopen attendance session', error);
            res.json({ message: 'Attendance session reopened.', session: data });
        } catch (error) {
            return sendDbError(res, 'reopen attendance session', error);
        }
    });

    return router;
}
