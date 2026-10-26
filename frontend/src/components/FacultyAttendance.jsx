
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    RefreshCw,
    Save,
    Send,
    Users,
    RotateCcw
} from 'lucide-react';
import { apiRequest } from '../lib/api';

function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const STATUS_OPTIONS = [
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'late', label: 'Late' }
];

export default function FacultyAttendance({ token }) {
    const [courses, setCourses] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [courseId, setCourseId] = useState('');
    const [semesterId, setSemesterId] = useState('');
    const [date, setDate] = useState(getToday());
    const [topic, setTopic] = useState('');
    const [notes, setNotes] = useState('');
    const [students, setStudents] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [session, setSession] = useState(null);
    const [loadingOptions, setLoadingOptions] = useState(true);
    const [loadingRoster, setLoadingRoster] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const isSubmitted = session?.status === 'submitted';

    const counts = useMemo(() => {
        return students.reduce((result, student) => {
            const status = student.attendance_status;
            if (status === 'present') result.present += 1;
            if (status === 'absent') result.absent += 1;
            if (status === 'late') result.late += 1;
            return result;
        }, { present: 0, absent: 0, late: 0 });
    }, [students]);

    const loadOptions = useCallback(async () => {
        setLoadingOptions(true);
        setError('');

        try {
            const [courseResult, semesterResult] = await Promise.all([
                apiRequest('/faculty/me/attendance/courses', { token }),
                apiRequest('/faculty/me/attendance/semesters', { token })
            ]);

            const nextCourses = Array.isArray(courseResult.courses)
                ? courseResult.courses : [];
            const nextSemesters = Array.isArray(semesterResult.semesters)
                ? semesterResult.semesters : [];

            setCourses(nextCourses);
            setSemesters(nextSemesters);

            setCourseId(current =>
                nextCourses.some(course => course.id === current)
                    ? current : nextCourses[0]?.id || ''
            );
            setSemesterId(current =>
                nextSemesters.some(semester => semester.id === current)
                    ? current : nextSemesters[0]?.id || ''
            );
        } catch (requestError) {
            setError(requestError?.message || 'Could not load attendance options.');
        } finally {
            setLoadingOptions(false);
        }
    }, [token]);

    const loadSessions = useCallback(async () => {
        if (!courseId || !semesterId) {
            setSessions([]);
            return;
        }

        try {
            const result = await apiRequest(
                `/faculty/me/attendance/sessions?course_id=${encodeURIComponent(courseId)}&semester_id=${encodeURIComponent(semesterId)}`,
                { token }
            );
            setSessions(Array.isArray(result.sessions) ? result.sessions : []);
        } catch (requestError) {
            setError(requestError?.message || 'Could not load attendance sessions.');
        }
    }, [token, courseId, semesterId]);

    const loadRoster = useCallback(async () => {
        if (!courseId || !semesterId || !date) {
            setStudents([]);
            setSession(null);
            return;
        }

        setLoadingRoster(true);
        setError('');
        setMessage('');

        try {
            const params = new URLSearchParams({
                course_id: courseId,
                semester_id: semesterId,
                date
            });

            const result = await apiRequest(
                `/faculty/me/attendance/roster?${params.toString()}`,
                { token }
            );

            setSession(result.session || null);
            setTopic(result.session?.topic || '');
            setNotes(result.session?.notes || '');
            setStudents(Array.isArray(result.students) ? result.students : []);
        } catch (requestError) {
            setStudents([]);
            setSession(null);
            setError(requestError?.message || 'Could not load the student roster.');
        } finally {
            setLoadingRoster(false);
        }
    }, [token, courseId, semesterId, date]);

    useEffect(() => {
        loadOptions();
    }, [loadOptions]);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    useEffect(() => {
        loadRoster();
    }, [loadRoster]);

    function changeStatus(studentId, status) {
        setStudents(current => current.map(student =>
            student.id === studentId
                ? { ...student, attendance_status: status }
                : student
        ));
    }

    function changeRemark(studentId, remarks) {
        setStudents(current => current.map(student =>
            student.id === studentId
                ? { ...student, remarks }
                : student
        ));
    }

    function markEveryone(status) {
        if (isSubmitted) return;
        setStudents(current => current.map(student => ({
            ...student,
            attendance_status: status
        })));
    }

    async function saveAttendance(event) {
        event?.preventDefault();

        if (!courseId || !semesterId || !date) {
            setError('Select a course, semester, and date.');
            return;
        }

        if (isSubmitted) {
            setError('Reopen this submitted session before editing it.');
            return;
        }

        setSaving(true);
        setError('');
        setMessage('');

        try {
            const result = await apiRequest('/faculty/me/attendance/sessions', {
                token,
                method: 'POST',
                body: JSON.stringify({
                    course_id: courseId,
                    semester_id: semesterId,
                    session_date: date,
                    topic,
                    notes,
                    attendance: students.map(student => ({
                        student_id: student.id,
                        attendance_status: student.attendance_status,
                        remarks: student.remarks || ''
                    }))
                })
            });

            setSession(result.session || null);
            setMessage(result.message || 'Attendance saved successfully.');
            await loadSessions();
            await loadRoster();
        } catch (requestError) {
            setError(requestError?.message || 'Could not save attendance.');
        } finally {
            setSaving(false);
        }
    }

    async function submitAttendance() {
        if (!session?.id) {
            setError('Save attendance before submitting the session.');
            return;
        }

        if (!window.confirm('Submit attendance? You will need to reopen the session to make corrections.')) {
            return;
        }

        setSaving(true);
        setError('');
        setMessage('');

        try {
            const result = await apiRequest(
                `/faculty/me/attendance/sessions/${session.id}/submit`,
                { token, method: 'POST' }
            );
            setSession(result.session || session);
            setMessage(result.message || 'Attendance submitted successfully.');
            await loadSessions();
            await loadRoster();
        } catch (requestError) {
            setError(requestError?.message || 'Could not submit attendance.');
        } finally {
            setSaving(false);
        }
    }

    async function reopenSession() {
        if (!session?.id) return;

        if (!window.confirm('Reopen this submitted session for corrections?')) return;

        setSaving(true);
        setError('');
        setMessage('');

        try {
            const result = await apiRequest(
                `/faculty/me/attendance/sessions/${session.id}/reopen`,
                { token, method: 'POST' }
            );
            setSession(result.session || null);
            setMessage(result.message || 'Attendance session reopened.');
            await loadSessions();
            await loadRoster();
        } catch (requestError) {
            setError(requestError?.message || 'Could not reopen the session.');
        } finally {
            setSaving(false);
        }
    }

    function openSession(selectedSession) {
        setDate(selectedSession.session_date);
    }

    if (loadingOptions) {
        return (
            <section className="panel">
                <div className="empty-state">
                    <RefreshCw size={24} />
                    <strong>Loading attendance workspace</strong>
                    <span>Loading assigned courses and available semesters.</span>
                </div>
            </section>
        );
    }

    return (
        <section className="panel faculty-attendance">
            <div className="panel-heading">
                <div>
                    <h2>Attendance Management</h2>
                    <p className="muted">
                        Mark, save, and submit attendance for students enrolled in your courses.
                    </p>
                </div>
                <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                        loadOptions();
                        loadSessions();
                        loadRoster();
                    }}
                    disabled={saving || loadingRoster}
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="attendance-alert attendance-error" role="alert">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {message && (
                <div className="attendance-alert attendance-success" role="status">
                    <CheckCircle2 size={18} />
                    <span>{message}</span>
                </div>
            )}

            {!courses.length ? (
                <div className="empty-state">
                    <ClipboardCheck size={28} />
                    <strong>No courses assigned</strong>
                    <span>
                        Ask an administrator to assign at least one course to your faculty account.
                    </span>
                </div>
            ) : !semesters.length ? (
                <div className="empty-state">
                    <CalendarDays size={28} />
                    <strong>No active semesters</strong>
                    <span>An administrator must activate a semester before attendance can be recorded.</span>
                </div>
            ) : (
                <>
                    <div className="attendance-filters">
                        <label>
                            <span>Course</span>
                            <select
                                value={courseId}
                                onChange={event => setCourseId(event.target.value)}
                                disabled={saving}
                            >
                                {courses.map(course => (
                                    <option key={course.id} value={course.id}>
                                        {course.name} ({course.code})
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            <span>Semester</span>
                            <select
                                value={semesterId}
                                onChange={event => setSemesterId(event.target.value)}
                                disabled={saving}
                            >
                                {semesters.map(semester => (
                                    <option key={semester.id} value={semester.id}>
                                        {semester.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            <span>Attendance date</span>
                            <input
                                type="date"
                                value={date}
                                onChange={event => setDate(event.target.value)}
                                disabled={saving}
                            />
                        </label>
                    </div>

                    {sessions.length > 0 && (
                        <div className="attendance-sessions">
                            <div className="attendance-section-heading">
                                <h3>Previous sessions</h3>
                                <span>{sessions.length} session(s)</span>
                            </div>
                            <div className="attendance-session-list">
                                {sessions.map(item => (
                                    <button
                                        type="button"
                                        key={item.id}
                                        className={`attendance-session-item ${item.session_date === date ? 'selected' : ''}`}
                                        onClick={() => openSession(item)}
                                        disabled={saving}
                                    >
                                        <span>
                                            <CalendarDays size={16} />
                                            {item.session_date}
                                        </span>
                                        <span className={`attendance-status-badge ${item.status}`}>
                                            {item.status === 'submitted' ? 'Submitted' : 'Open'}
                                        </span>
                                        {item.topic && <small>{item.topic}</small>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="attendance-section-heading">
                        <div>
                            <h3>Student attendance</h3>
                            <p className="muted">
                                {students.length} enrolled student(s) for the selected course and semester.
                            </p>
                        </div>
                        {session && (
                            <span className={`attendance-status-badge ${session.status}`}>
                                {isSubmitted ? 'Submitted' : 'Open session'}
                            </span>
                        )}
                    </div>

                    <div className="attendance-summary">
                        <div><Users size={17} /><span>Total</span><strong>{students.length}</strong></div>
                        <div><CheckCircle2 size={17} /><span>Present</span><strong>{counts.present}</strong></div>
                        <div><AlertCircle size={17} /><span>Absent</span><strong>{counts.absent}</strong></div>
                        <div><Clock3 size={17} /><span>Late</span><strong>{counts.late}</strong></div>
                    </div>

                    <form onSubmit={saveAttendance}>
                        <div className="attendance-session-details">
                            <label>
                                <span>Lecture topic</span>
                                <input
                                    type="text"
                                    value={topic}
                                    onChange={event => setTopic(event.target.value)}
                                    maxLength={200}
                                    placeholder="e.g. Introduction to Operating Systems"
                                    disabled={isSubmitted || saving}
                                />
                            </label>
                            <label>
                                <span>Notes (optional)</span>
                                <textarea
                                    value={notes}
                                    onChange={event => setNotes(event.target.value)}
                                    maxLength={2000}
                                    rows={2}
                                    placeholder="Add lecture notes or attendance remarks"
                                    disabled={isSubmitted || saving}
                                />
                            </label>
                        </div>

                        {!isSubmitted && students.length > 0 && (
                            <div className="attendance-bulk-actions">
                                <span>Mark everyone:</span>
                                <button type="button" className="secondary-button" onClick={() => markEveryone('present')}>
                                    All Present
                                </button>
                                <button type="button" className="secondary-button" onClick={() => markEveryone('absent')}>
                                    All Absent
                                </button>
                            </div>
                        )}

                        {loadingRoster ? (
                            <div className="empty-state">
                                <RefreshCw size={23} />
                                <span>Loading enrolled students...</span>
                            </div>
                        ) : students.length === 0 ? (
                            <div className="empty-state">
                                <Users size={26} />
                                <strong>No enrolled students found</strong>
                                <span>
                                    No active student-semester enrollment records were found for this course and semester.
                                </span>
                            </div>
                        ) : (
                            <div className="attendance-table-wrap">
                                <table className="attendance-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Student ID</th>
                                            <th>Status</th>
                                            <th>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map(student => (
                                            <tr key={student.id}>
                                                <td>
                                                    <strong>{student.full_name}</strong>
                                                    <small>{student.email || 'No email available'}</small>
                                                </td>
                                                <td>{student.student_code || '—'}</td>
                                                <td>
                                                    <select
                                                        value={student.attendance_status}
                                                        onChange={event => changeStatus(student.id, event.target.value)}
                                                        disabled={isSubmitted || saving}
                                                        aria-label={`Attendance status for ${student.full_name}`}
                                                    >
                                                        {STATUS_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={student.remarks || ''}
                                                        onChange={event => changeRemark(student.id, event.target.value)}
                                                        placeholder="Optional"
                                                        maxLength={500}
                                                        disabled={isSubmitted || saving}
                                                        aria-label={`Remarks for ${student.full_name}`}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="attendance-footer">
                            <span className="muted">
                                {isSubmitted
                                    ? 'This session is read-only. Reopen it to make corrections.'
                                    : 'Save your changes before submitting attendance.'}
                            </span>

                            <div className="attendance-footer-actions">
                                {!isSubmitted ? (
                                    <>
                                        <button
                                            type="submit"
                                            className="secondary-button"
                                            disabled={saving || loadingRoster || students.length === 0}
                                        >
                                            <Save size={16} />
                                            {saving ? 'Saving...' : 'Save Attendance'}
                                        </button>
                                        <button
                                            type="button"
                                            className="primary-button"
                                            onClick={submitAttendance}
                                            disabled={saving || !session?.id || students.length === 0}
                                        >
                                            <Send size={16} />
                                            Submit Attendance
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={reopenSession}
                                        disabled={saving}
                                    >
                                        <RotateCcw size={16} />
                                        Reopen Session
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </>
            )}
        </section>
    );
}
