
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  UserRound,
  Users,
  ClipboardCheck
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import FacultyAttendance from './FacultyAttendance';

function SummaryCard({ icon: Icon, label, value, description, tone }) {
  return (
    <article className="faculty-overview-card">
      <div className={`faculty-overview-icon ${tone}`}>
        <Icon size={21} />
      </div>
      <div className="faculty-overview-content">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </article>
  );
}

function ProfileDetail({ label, value }) {
  return (
    <div className="faculty-detail">
      <span>{label}</span>
      <strong>{value || 'Not available'}</strong>
    </div>
  );
}

export default function FacultyDashboard({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest('/faculty/me/dashboard', { token });
      setData(result);
    } catch (requestError) {
      setError(
        requestError?.message || 'Could not load the faculty dashboard.'
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="panel">
        <div className="empty-state">
          <RefreshCw size={24} />
          <strong>Loading faculty workspace</strong>
          <span>
            Retrieving your faculty profile and course assignments.
          </span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="empty-state">
          <AlertCircle size={26} />
          <strong>Faculty workspace could not be loaded</strong>
          <span>{error}</span>
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const faculty = data?.faculty;
  const courses = Array.isArray(data?.courses) ? data.courses : [];

  if (!faculty) {
    return (
      <section className="panel">
        <div className="empty-state">
          <UserRound size={26} />
          <strong>Faculty profile not found</strong>
          <span>
            Your login does not have a linked active faculty record.
            Please contact an administrator.
          </span>
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const uniqueDepartments = new Set(
    courses.map(course => course.department?.id).filter(Boolean)
  ).size;

  return (
    <section className="faculty-dashboard">
      {/* Faculty welcome section */}
      <section className="faculty-hero">
        <div className="faculty-hero-copy">
          <span className="faculty-eyebrow">FACULTY WORKSPACE</span>

          <h2>
            Hello, {faculty.full_name || 'Faculty Member'}.
          </h2>

          <p>
            View your assigned courses and manage your academic
            responsibilities from your faculty workspace.
          </p>

          <div className="faculty-hero-meta">
            <span>
              <CheckCircle2 size={15} />
              Account active
            </span>

            <span>
              <Building2 size={15} />
              {faculty.department?.name || 'Department not assigned'}
            </span>
          </div>
        </div>

        <div className="faculty-hero-art">
          <GraduationCap size={62} />
        </div>
      </section>

      {/* Overview cards */}
      <section className="faculty-overview-grid">
        <SummaryCard
          icon={UserRound}
          label="Faculty ID"
          value={faculty.faculty_code || '—'}
          description={faculty.designation || 'Faculty member'}
          tone="blue"
        />

        <SummaryCard
          icon={BookOpen}
          label="Assigned courses"
          value={courses.length}
          description="Active course assignments"
          tone="green"
        />

        <SummaryCard
          icon={Building2}
          label="Departments"
          value={uniqueDepartments}
          description="Departments represented by your courses"
          tone="purple"
        />
      </section>

      {/* Faculty profile */}
      <section className="panel faculty-profile-panel">
        <div className="faculty-section-heading">
          <div className="faculty-section-title">
            <div className="faculty-section-icon">
              <UserRound size={20} />
            </div>

            <div>
              <h2>My profile</h2>
              <p className="muted">
                Your registered faculty account details.
              </p>
            </div>
          </div>

          <button
            className="secondary-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        <div className="faculty-details-grid">
          <ProfileDetail
            label="Faculty ID"
            value={faculty.faculty_code}
          />

          <ProfileDetail
            label="Full name"
            value={faculty.full_name}
          />

          <ProfileDetail
            label="Email address"
            value={faculty.email}
          />

          <ProfileDetail
            label="Designation"
            value={faculty.designation}
          />

          <ProfileDetail
            label="Department"
            value={faculty.department?.name}
          />

          <ProfileDetail
            label="Account status"
            value={faculty.status}
          />
        </div>
      </section>

      {/* Assigned courses */}
      <section className="panel faculty-subject-panel">
        <div className="faculty-section-heading">
          <div className="faculty-section-title">
            <div className="faculty-section-icon">
              <BookOpen size={20} />
            </div>

            <div>
              <h2>My assigned courses</h2>
              <p className="muted">
                Courses assigned to you by the university administrator.
              </p>
            </div>
          </div>

          <button
            className="secondary-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Refresh courses
          </button>
        </div>

        {courses.length > 0 ? (
          <>
            <div className="faculty-assignment-count">
              {courses.length} active course
              {courses.length === 1 ? '' : 's'} assigned
            </div>

            <div className="faculty-course-grid">
              {courses.map(course => (
                <article
                  className="faculty-course-card"
                  key={course.assignment_id || course.id}
                >
                  <div className="faculty-course-card-top">
                    <div className="faculty-course-icon">
                      <BookOpen size={22} />
                    </div>

                    <span className="faculty-course-status">
                      <CheckCircle2 size={13} />
                      Active
                    </span>
                  </div>

                  <span className="faculty-course-code">
                    {course.code || 'NO COURSE CODE'}
                  </span>

                  <h3>{course.name || 'Unnamed course'}</h3>

                  <div className="faculty-course-department">
                    <Building2 size={15} />
                    <span>
                      {course.department?.name || 'Department not assigned'}
                    </span>
                  </div>

                  <div className="faculty-course-card-footer">
                    <span>
                      <Users size={15} />
                      Assigned faculty
                    </span>
                    <span className="faculty-course-status-text">
                      Assigned
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="faculty-empty-assignments">
            <div className="faculty-empty-icon">
              <BookOpen size={28} />
            </div>

            <h3>No courses assigned yet</h3>

            <p>
              Your faculty account is active, but an administrator has not
              assigned a course to you yet. Once your name is selected in
              Academic Management under Courses / Programs, the course will
              appear here automatically.
            </p>

            <div className="faculty-empty-steps">
              <div>
                <span>1</span>
                <div>
                  <strong>Admin selects a course</strong>
                  <small>
                    The course must exist in Academic Management.
                  </small>
                </div>
              </div>

              <div>
                <span>2</span>
                <div>
                  <strong>Admin assigns professors</strong>
                  <small>
                    Your active faculty account is selected in Professor(s).
                  </small>
                </div>
              </div>

              <div>
                <span>3</span>
                <div>
                  <strong>Course appears here</strong>
                  <small>
                    Refresh the dashboard to retrieve the saved assignment.
                  </small>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* NEW: Faculty attendance management */}
      <section className="faculty-attendance-section">
        <div className="faculty-section-heading">
          <div className="faculty-section-title">
            <div className="faculty-section-icon">
              <ClipboardCheck size={20} />
            </div>

            <div>
              <h2>Attendance Management</h2>
              <p className="muted">
                Record, review, and submit attendance for your enrolled students.
              </p>
            </div>
          </div>
        </div>

        <FacultyAttendance token={token} />
      </section>
    </section>
  );
}
