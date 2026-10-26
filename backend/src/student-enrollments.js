
import { Router } from 'express';
import { requireAuth, requireAdmin } from './middleware/auth.js';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStudentEnrollmentsRouter(supabaseAdmin) {
    const router = Router();

    router.use(requireAuth, requireAdmin);

    // Return all enrollment records for one student.
    router.get('/:studentId/enrollments', async (req, res) => {
        const { studentId } = req.params;

        if (!UUID_PATTERN.test(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select(`
          id,
          student_id,
          course_id,
          semester_id,
          status,
          course:courses(id, name, code),
          semester:semesters(
            id,
            label,
            semester_number,
            academic_year:academic_years(id, label, year_code)
          )
        `)
                .eq('student_id', studentId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[enrollments] Load failed:', error.message);
                return res.status(500).json({
                    error: 'Could not load student enrollments.'
                });
            }

            return res.json({ enrollments: data || [] });
        } catch (error) {
            console.error('[enrollments] Unexpected load error:', error.message);
            return res.status(500).json({
                error: 'Could not load student enrollments.'
            });
        }
    });

    // Replace a student's currently enrolled course-semester combinations.
    router.put('/:studentId/enrollments', async (req, res) => {
        const { studentId } = req.params;
        const enrollments = req.body?.enrollments;

        if (!UUID_PATTERN.test(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID.' });
        }

        if (!Array.isArray(enrollments)) {
            return res.status(400).json({
                error: 'Enrollments must be an array.'
            });
        }

        if (enrollments.length > 100) {
            return res.status(400).json({
                error: 'A student cannot have more than 100 course enrollments.'
            });
        }

        const unique = new Set();

        for (const enrollment of enrollments) {
            if (
                !UUID_PATTERN.test(enrollment?.course_id || '') ||
                !UUID_PATTERN.test(enrollment?.semester_id || '')
            ) {
                return res.status(400).json({
                    error: 'Every enrollment requires a valid course and semester.'
                });
            }

            const key = `${enrollment.course_id}:${enrollment.semester_id}`;

            if (unique.has(key)) {
                return res.status(400).json({
                    error: 'Duplicate course and semester selections are not allowed.'
                });
            }

            unique.add(key);
        }

        try {
            const { data: student, error: studentError } = await supabaseAdmin
                .from('students')
                .select('id, status')
                .eq('id', studentId)
                .maybeSingle();

            if (studentError) {
                console.error('[enrollments] Student lookup failed:', studentError.message);
                return res.status(500).json({
                    error: 'Could not validate the student.'
                });
            }

            if (!student) {
                return res.status(404).json({ error: 'Student not found.' });
            }

            if (enrollments.length) {
                const courseIds = [...new Set(enrollments.map(item => item.course_id))];
                const semesterIds = [...new Set(enrollments.map(item => item.semester_id))];

                const [coursesResult, semestersResult] = await Promise.all([
                    supabaseAdmin
                        .from('courses')
                        .select('id, status')
                        .in('id', courseIds),

                    supabaseAdmin
                        .from('semesters')
                        .select('id, status')
                        .in('id', semesterIds)
                ]);

                if (coursesResult.error || semestersResult.error) {
                    return res.status(500).json({
                        error: 'Could not validate the selected courses and semesters.'
                    });
                }

                const activeCourses = new Set(
                    (coursesResult.data || [])
                        .filter(item => item.status === 'active')
                        .map(item => item.id)
                );

                const activeSemesters = new Set(
                    (semestersResult.data || [])
                        .filter(item => item.status === 'active')
                        .map(item => item.id)
                );

                for (const enrollment of enrollments) {
                    if (!activeCourses.has(enrollment.course_id)) {
                        return res.status(400).json({
                            error: 'One or more selected courses are inactive or unavailable.'
                        });
                    }

                    if (!activeSemesters.has(enrollment.semester_id)) {
                        return res.status(400).json({
                            error: 'One or more selected semesters are inactive or unavailable.'
                        });
                    }
                }
            }

            const { data: existing, error: existingError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select('id, course_id, semester_id, status')
                .eq('student_id', studentId);

            if (existingError) {
                console.error('[enrollments] Existing records lookup failed:', existingError.message);
                return res.status(500).json({
                    error: 'Could not load existing enrollments.'
                });
            }

            const selectedKeys = new Set(
                enrollments.map(item => `${item.course_id}:${item.semester_id}`)
            );

            // Preserve history by withdrawing selections that were removed.
            const toWithdraw = (existing || []).filter(
                item =>
                    item.status === 'enrolled' &&
                    !selectedKeys.has(`${item.course_id}:${item.semester_id}`)
            );

            if (toWithdraw.length) {
                const { error } = await supabaseAdmin
                    .from('student_semester_enrollments')
                    .update({ status: 'withdrawn' })
                    .in('id', toWithdraw.map(item => item.id));

                if (error) {
                    console.error('[enrollments] Withdrawal failed:', error.message);
                    return res.status(500).json({
                        error: 'Could not update removed enrollments.'
                    });
                }
            }

            if (enrollments.length) {
                const rows = enrollments.map(item => ({
                    student_id: studentId,
                    course_id: item.course_id,
                    semester_id: item.semester_id,
                    status: 'enrolled'
                }));

                const { error } = await supabaseAdmin
                    .from('student_semester_enrollments')
                    .upsert(rows, {
                        onConflict: 'student_id,course_id,semester_id'
                    });

                if (error) {
                    console.error('[enrollments] Save failed:', error.message);
                    return res.status(500).json({
                        error: 'Could not save course enrollments. Check the enrollment table constraints.'
                    });
                }
            }

            const { data: saved, error: savedError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select(`
          id,
          student_id,
          course_id,
          semester_id,
          status,
          course:courses(id, name, code),
          semester:semesters(
            id,
            label,
            semester_number,
            academic_year:academic_years(id, label, year_code)
          )
        `)
                .eq('student_id', studentId)
                .eq('status', 'enrolled');

            if (savedError) {
                return res.status(500).json({
                    error: 'Enrollments were saved but could not be reloaded.'
                });
            }

            return res.json({
                message: 'Student enrollments updated successfully.',
                enrollments: saved || []
            });
        } catch (error) {
            console.error('[enrollments] Unexpected save error:', error.message);
            return res.status(500).json({
                error: 'Could not save student enrollments.'
            });
        }
    });

    return router;
}
