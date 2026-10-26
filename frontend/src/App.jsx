import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, GraduationCap, LayoutDashboard, LogOut, ShieldCheck,
  Users, UserRound, RefreshCw, CircleAlert, CheckCircle2, Clock3, Shield,
  UserPlus, X, Search, Eye, Pencil, UserRoundPlus, ChevronLeft, ChevronRight,
  CalendarDays, ClipboardCheck, Building2, Sun, Moon
} from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase';
import { apiRequest } from './lib/api';
import AdminAcademicManagement from './components/AdminAcademicManagement';
import FacultyDashboard from './components/FacultyDashboard';
import FacultyManagement from './components/FacultyManagement';

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><GraduationCap size={23} /></div>
      <div>
        <strong>CampusFlow</strong>
        <small>University Automation System</small>
      </div>
    </div>
  );
}

function EmptyPortalPanel({ icon: Icon, title, description, requirement }) {
  return (
    <section className="panel student-module-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
      </div>
      <div className="empty-state">
        <Icon size={26} />
        <strong>No data available</strong>
        <span>{requirement}</span>
      </div>
    </section>
  );
}

function emptyStudentForm() {
  return {
    full_name: '',
    email: '',
    phone: '',
    department_id: '',
    course_id: '',
    admission_year: ''
  };
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('campusflow-theme') === 'dark'
        ? 'dark'
        : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('campusflow-theme', theme);
    } catch {
      // Storage may be unavailable.
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function toggleTheme() {
    setTheme(current => current === 'light' ? 'dark' : 'light');
  }

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('dashboard');
  const [studentRecord, setStudentRecord] = useState(null);
  const [studentRecordLoading, setStudentRecordLoading] = useState(false);
  const [studentRecordError, setStudentRecordError] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneMessage, setPhoneMessage] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [mode, setMode] = useState('login');
  const [authRole, setAuthRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupFieldErrors, setSignupFieldErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [admins, setAdmins] = useState(null);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [adminFieldErrors, setAdminFieldErrors] = useState({});
  const [students, setStudents] = useState([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentFilteredTotal, setStudentFilteredTotal] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentOffset, setStudentOffset] = useState(0);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilters, setStudentFilters] = useState({
    department_id: '',
    course_id: '',
    status: ''
  });
  const [studentOptions, setStudentOptions] = useState({
    departments: [],
    courses: []
  });
  const [studentOptionsLoading, setStudentOptionsLoading] = useState(false);
  const [studentOptionsError, setStudentOptionsError] = useState('');
  const [studentsError, setStudentsError] = useState('');
  const studentRequestId = useRef(0);
  const [studentModal, setStudentModal] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentForm, setStudentForm] = useState(emptyStudentForm());
  const [studentFieldErrors, setStudentFieldErrors] = useState({});

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setProfile(null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.access_token) {
      loadProfile(session.access_token);
    } else {
      setProfile(null);
      setData(null);
      setStudentRecord(null);
      setStudentRecordError('');
    }
  }, [session]);

  useEffect(() => {
    if (
      profile?.role !== 'student' ||
      profile.account_status !== 'active' ||
      !session?.access_token
    ) {
      setStudentRecord(null);
      setStudentRecordError('');
      setStudentRecordLoading(false);
      return;
    }

    let cancelled = false;

    setStudentRecordLoading(true);
    setStudentRecordError('');

    apiRequest('/profile/me', { token: session.access_token })
      .then(result => {
        if (!cancelled) {
          setStudentRecord(result.student);
          setPhoneDraft(result.student.phone || '');
        }
      })
      .catch(e => {
        if (!cancelled) {
          setStudentRecordError(e.message);
          setStudentRecord(null);
        }
      })
      .finally(() => {
        if (!cancelled) setStudentRecordLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile, session?.access_token]);

  async function loadProfile(token) {
    setProfileLoading(true);
    setError('');

    try {
      const result = await apiRequest('/auth/me', { token });
      setProfile(result.profile);
    } catch (e) {
      setError(e.message);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setSignupFieldErrors({});

    try {
      if (mode === 'signup') {
        if (authRole !== 'student') {
          throw new Error(
            `${authRole === 'admin' ? 'Admin' : 'Faculty'} accounts must be provisioned by an active Admin. Use the sign-in option after receiving your account details.`
          );
        }

        const validation = await apiRequest('/registrations/validate', {
          method: 'POST',
          body: JSON.stringify({ email, full_name: fullName })
        });

        if (!validation.valid) {
          throw new Error('Could not validate the registration details.');
        }

        const { data: signupData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() }
          }
        });

        if (error) throw error;

        if (!signupData?.user) {
          throw new Error(
            'Could not confirm signup. Try again or contact support.'
          );
        }

        if (
          Array.isArray(signupData.user.identities) &&
          signupData.user.identities.length === 0
        ) {
          throw new Error(
            'An account with this email may already exist. Sign in or contact an administrator.'
          );
        }

        setMessage(
          'Signup submitted. Check your email if confirmation is enabled. Student access remains pending until Admin verification.'
        );
        setMode('login');
      } else {
        const { data: signinData, error } =
          await supabase.auth.signInWithPassword({ email, password });

        if (error) throw error;

        const account = await apiRequest('/auth/me', {
          token: signinData.session.access_token
        });

        if (account.profile.role !== authRole) {
          await supabase.auth.signOut();

          throw new Error(
            `This account is registered as ${account.profile.role}. Select the matching sign-in option.`
          );
        }
      }
    } catch (e) {
      setError(e.message || 'Authentication failed.');
      setSignupFieldErrors(e.fields || {});
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();

    setSession(null);
    setProfile(null);
    setStudentRecord(null);
    setView('dashboard');
  }

  async function loadAdminRegistrations({ clearFeedback = true } = {}) {
    setBusy(true);

    if (clearFeedback) {
      setError('');
      setMessage('');
    }

    try {
      const result = await apiRequest('/registrations/pending', {
        token: session.access_token
      });

      setData(result.registrations || []);
      setView('registrations');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewRegistration(id, decision) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const result = await apiRequest(`/registrations/${id}/review`, {
        token: session.access_token,
        method: 'POST',
        body: JSON.stringify({ decision })
      });

      setMessage(
        decision === 'approve'
          ? `Registration approved. Generated Student ID: ${result.student_code}.`
          : 'Registration rejected.'
      );

      await loadAdminRegistrations({ clearFeedback: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadStudentProfile() {
    setPhoneError('');
    setPhoneMessage('');
    setView('profile');
  }

  async function saveStudentPhone(event) {
    event.preventDefault();
    setPhoneError('');
    setPhoneMessage('');

    const phone = phoneDraft.trim();

    if (phone.length > 40 || /[\u0000-\u001f\u007f]/.test(phone)) {
      setPhoneError(
        'Phone must be 40 characters or fewer and cannot contain control characters.'
      );
      return;
    }

    setPhoneSaving(true);

    try {
      const result = await apiRequest('/profile/me', {
        token: session.access_token,
        method: 'PATCH',
        body: JSON.stringify({ phone })
      });

      setStudentRecord(current =>
        current ? { ...current, phone: result.phone } : current
      );

      setPhoneDraft(result.phone || '');
      setPhoneMessage('Phone number updated.');
    } catch (e) {
      setPhoneError(e.message);
    } finally {
      setPhoneSaving(false);
    }
  }

  async function loadAdmins({ clearFeedback = true } = {}) {
    setView('admins');
    setAdminsLoading(true);

    if (clearFeedback) {
      setError('');
      setMessage('');
    }

    try {
      const result = await apiRequest('/admins', {
        token: session.access_token
      });

      setAdmins(result.admins || []);
      setView('admins');
    } catch (e) {
      setError(e.message);
    } finally {
      setAdminsLoading(false);
    }
  }

  async function loadStudentOptions() {
    setStudentOptionsLoading(true);
    setStudentOptionsError('');

    try {
      const result = await apiRequest('/students/options', {
        token: session.access_token
      });

      setStudentOptions({
        departments: result.departments || [],
        courses: result.courses || []
      });
    } catch (e) {
      setStudentOptionsError(e.message);
      setStudentOptions({ departments: [], courses: [] });
    } finally {
      setStudentOptionsLoading(false);
    }
  }

  async function loadStudents({
    offset = studentOffset,
    search = studentSearch,
    filters = studentFilters,
    clearFeedback = true
  } = {}) {
    const requestId = ++studentRequestId.current;

    setView('students');
    setStudentsLoading(true);

    if (clearFeedback) {
      setError('');
      setMessage('');
    }

    setStudentsError('');

    const params = new URLSearchParams({
      limit: '25',
      offset: String(offset)
    });

    if (search.trim()) params.set('q', search.trim());

    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    try {
      const result = await apiRequest(
        `/students?${params.toString()}`,
        { token: session.access_token }
      );

      if (requestId !== studentRequestId.current) return;

      setStudents(result.students || []);
      setStudentTotal(result.totalCount || 0);
      setStudentFilteredTotal(result.filteredCount || 0);
      setStudentOffset(result.offset || 0);
    } catch (e) {
      if (requestId !== studentRequestId.current) return;

      setError(e.message);
      setStudentsError(e.message);
      setStudents([]);
      setStudentFilteredTotal(0);
    } finally {
      if (requestId === studentRequestId.current) {
        setStudentsLoading(false);
      }
    }
  }

  function openStudentManagement() {
    setView('students');
    setStudentOffset(0);
    loadStudentOptions();
    loadStudents({ offset: 0 });
  }

  function openStudentCreate() {
    setStudentForm(emptyStudentForm());
    setStudentFieldErrors({});
    setSelectedStudent(null);
    setError('');
    setMessage('');
    setStudentModal('add');
  }

  async function openStudentDetails(student, modalMode) {
    setSelectedStudent(student);
    setStudentFieldErrors({});

    if (modalMode === 'edit') {
      setStudentForm({
        full_name: student.full_name || '',
        email: student.email || '',
        phone: student.phone || '',
        department_id: student.department_id || '',
        course_id: student.course_id || '',
        admission_year: student.admission_year ?? ''
      });
    }

    setStudentModal(modalMode);

    if (modalMode === 'view') {
      try {
        const result = await apiRequest(`/students/${student.id}`, {
          token: session.access_token
        });

        setSelectedStudent(result.student);
      } catch (e) {
        setError(e.message);
        setStudentModal(null);
      }
    }
  }

  function validateStudentForm() {
    const errors = {};
    const name = studentForm.full_name.trim();
    const emailValue = studentForm.email.trim();

    if (!name) {
      errors.full_name = 'Full name is required.';
    } else if (name.length > 120) {
      errors.full_name = 'Full name must be 120 characters or fewer.';
    }

    if (
      emailValue &&
      (
        emailValue.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
      )
    ) {
      errors.email = 'Enter a valid email address.';
    }

    if (studentForm.phone.trim().length > 40) {
      errors.phone = 'Phone must be 40 characters or fewer.';
    }

    if (
      studentForm.admission_year !== '' &&
      (
        !/^\d{4}$/.test(String(studentForm.admission_year)) ||
        Number(studentForm.admission_year) < 1900 ||
        Number(studentForm.admission_year) > 2200
      )
    ) {
      errors.admission_year =
        'Enter a valid admission year between 1900 and 2200.';
    }

    if (studentForm.course_id && !studentForm.department_id) {
      errors.course_id = 'Select a department first.';
    }

    setStudentFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveStudent(event) {
    event.preventDefault();

    if (!validateStudentForm()) return;

    setBusy(true);
    setError('');
    setMessage('');

    const payload = {
      ...studentForm,
      full_name: studentForm.full_name.trim(),
      email: studentForm.email.trim(),
      phone: studentForm.phone.trim(),
      admission_year:
        studentForm.admission_year === ''
          ? null
          : Number(studentForm.admission_year),
      department_id: studentForm.department_id || null,
      course_id: studentForm.course_id || null
    };

    try {
      await apiRequest(
        studentModal === 'edit'
          ? `/students/${selectedStudent.id}`
          : '/students',
        {
          token: session.access_token,
          method: studentModal === 'edit' ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      const nextOffset = studentModal === 'add' ? 0 : studentOffset;

      setStudentOffset(nextOffset);
      setStudentModal(null);

      setMessage(
        studentModal === 'edit'
          ? 'Student record updated.'
          : 'Student record created.'
      );

      await loadStudents({
        offset: nextOffset,
        clearFeedback: false
      });
    } catch (e) {
      setError(e.message);
      setStudentFieldErrors(e.fields || {});
    } finally {
      setBusy(false);
    }
  }

  async function changeStudentStatus(student) {
    const nextStatus =
      student.status === 'active' ? 'inactive' : 'active';

    const action =
      nextStatus === 'inactive' ? 'deactivate' : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${student.full_name} (${student.student_code})?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/students/${student.id}/status`, {
        token: session.access_token,
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });

      setMessage(
        `Student ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`
      );

      await loadStudents({ clearFeedback: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function validateAdminForm() {
    const errors = {};
    const cleanName = adminForm.fullName.trim();
    const cleanEmail = adminForm.email.trim();

    if (!cleanName) {
      errors.fullName = 'Enter the admin’s full name.';
    } else if (cleanName.length > 120) {
      errors.fullName = 'Name must be 120 characters or fewer.';
    }

    if (!cleanEmail) {
      errors.email = 'Enter an email address.';
    } else if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      errors.email = 'Enter a valid email address.';
    }

    if (
      adminForm.password.length < 8 ||
      adminForm.password.length > 128
    ) {
      errors.password = 'Use a password between 8 and 128 characters.';
    }

    if (adminForm.confirmPassword !== adminForm.password) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setAdminFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function createAdmin(event) {
    event.preventDefault();

    if (!validateAdminForm()) return;

    setAdminBusy(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/admins', {
        token: session.access_token,
        method: 'POST',
        body: JSON.stringify({
          fullName: adminForm.fullName.trim(),
          email: adminForm.email.trim(),
          password: adminForm.password,
          confirmPassword: adminForm.confirmPassword
        })
      });

      setAdminDialogOpen(false);

      setAdminForm({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
      });

      setAdminFieldErrors({});
      setMessage('Admin account created successfully.');

      await loadAdmins({ clearFeedback: false });
    } catch (e) {
      setError(e.message);

      setAdminFieldErrors({
        ...(e.fields || {}),
        ...(e.status === 409 ? { email: e.message } : {})
      });
    } finally {
      setAdminBusy(false);
    }
  }

  function openAdminDialog() {
    setAdminForm({
      fullName: '',
      email: '',
      password: '',
      confirmPassword: ''
    });

    setAdminFieldErrors({});
    setError('');
    setMessage('');
    setAdminDialogOpen(true);
  }

  if (!supabaseConfigured) {
    return (
      <main className="setup-page" data-theme={theme}>
        <div className="setup-card">
          <Brand />

          <div className="setup-icon">
            <CircleAlert size={28} />
          </div>

          <h1>Configuration required</h1>

          <p>
            Before signing in, add your Supabase project details to{' '}
            <code>frontend/.env</code>.
          </p>

          <ol>
            <li>
              Copy <code>frontend/.env.example</code> to{' '}
              <code>frontend/.env</code>.
            </li>
            <li>Set <code>VITE_SUPABASE_URL</code>.</li>
            <li>
              Set <code>VITE_SUPABASE_ANON_KEY</code> to the
              publishable/anon key.
            </li>
            <li>Restart the frontend development server.</li>
          </ol>

          <p className="warning">
            Never put the service-role key in the frontend.
          </p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-page" data-theme={theme}>
        <section className="auth-intro">
          <Brand />

          <div className="intro-copy">
            <span className="eyebrow">ONE CAMPUS. ONE SYSTEM.</span>

            <h1>University operations, made simpler.</h1>

            <p>
              A central place for student records, academic information,
              and university administration.
            </p>

            <div className="intro-points">
              <span>
                <ShieldCheck size={18} /> Secure role-based access
              </span>
              <span>
                <Users size={18} /> Centralized records
              </span>
              <span>
                <BookOpen size={18} /> Academic information
              </span>
            </div>
          </div>

          <small className="copyright">
            University Automation System · Starter build
          </small>
        </section>

        <section className="auth-form-wrap">
          <form className="auth-card" onSubmit={handleAuth}>
            <span className="eyebrow">
              {mode === 'login'
                ? 'WELCOME BACK'
                : `${authRole.toUpperCase()} REGISTRATION`}
            </span>

            <h2>
              {mode === 'login'
                ? `Sign in as ${authRole}`
                : authRole === 'student'
                  ? 'Create a student account'
                  : `Create a ${authRole} account`}
            </h2>

            <div
              className="auth-role-selector"
              role="group"
              aria-label="Account type"
            >
              {['student', 'admin', 'faculty'].map(role => (
                <button
                  key={role}
                  type="button"
                  className={authRole === role ? 'active' : ''}
                  onClick={() => {
                    setAuthRole(role);
                    setMode('login');
                    setError('');
                    setMessage('');
                    setSignupFieldErrors({});
                  }}
                >
                  {role}
                </button>
              ))}
            </div>

            <p className="muted">
              {mode === 'login'
                ? `Enter your ${authRole} credentials to continue.`
                : authRole === 'student'
                  ? 'Registration remains pending until an Admin reviews and approves it. Your Student ID is created on approval.'
                  : `${authRole === 'admin' ? 'Admin' : 'Faculty'} accounts are created by an active Admin to protect university access.`}
            </p>

            {mode === 'signup' && authRole === 'student' && (
              <>
                <label>Full name</label>
                <input
                  value={fullName}
                  onChange={e => {
                    setFullName(e.target.value);
                    setSignupFieldErrors({
                      ...signupFieldErrors,
                      full_name: ''
                    });
                  }}
                  required
                  maxLength={120}
                  aria-invalid={Boolean(signupFieldErrors.full_name)}
                  placeholder="Enter full name"
                />

                {signupFieldErrors.full_name && (
                  <small className="field-error">
                    {signupFieldErrors.full_name}
                  </small>
                )}
              </>
            )}

            {(mode === 'login' || authRole === 'student') && (
              <>
                <label>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setSignupFieldErrors({
                      ...signupFieldErrors,
                      email: ''
                    });
                  }}
                  required
                  aria-invalid={Boolean(signupFieldErrors.email)}
                  placeholder="name@example.com"
                />

                {signupFieldErrors.email && (
                  <small className="field-error">
                    {signupFieldErrors.email}
                  </small>
                )}

                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </>
            )}

            {error && <div className="alert error">{error}</div>}
            {message && <div className="alert success">{message}</div>}

            {mode === 'signup' && authRole !== 'student' ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setMode('login')}
              >
                Return to {authRole} sign in
              </button>
            ) : (
              <button className="primary-button" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : mode === 'login'
                    ? `Sign in as ${authRole}`
                    : 'Create student account'}
              </button>
            )}

            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
                setMessage('');
                setSignupFieldErrors({});
              }}
            >
              {mode === 'login'
                ? `Need a ${authRole} account? ${authRole === 'student' ? 'Sign up' : 'Learn how to get access'}`
                : 'Already registered? Sign in'}
            </button>

            <p className="footnote">
              Student registration is public. Admin and Faculty accounts are
              provisioned by an active Admin.
            </p>
          </form>
        </section>
      </main>
    );
  }

  const isAdmin =
    profile?.role === 'admin' &&
    profile?.account_status === 'active';

  const isFaculty =
    profile?.role === 'faculty' &&
    profile?.account_status === 'active';

  const isActiveStudent =
    profile?.role === 'student' &&
    profile?.account_status === 'active';

  const isPending =
    profile?.account_status === 'pending_verification';

  const pageTitles = {
    dashboard: 'Dashboard',
    profile: 'My Profile',
    courses: 'Courses & Subjects',
    timetable: 'Timetable',
    attendance: 'Attendance',
    calendar: 'Academic Calendar',
    registrations: 'Student verification',
    students: 'Student Management',
    facultyManagement: 'Faculty Management',
    admins: 'Admin Management',
    academic: 'Academic Management',
    faculty: 'Faculty Workspace'
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <Brand />

        <div className="nav-label">WORKSPACE</div>

        {isActiveStudent ? (
          <nav className="student-nav" aria-label="Student portal">
            <button
              className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
              aria-current={view === 'dashboard' ? 'page' : undefined}
              onClick={() => setView('dashboard')}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>

            <button
              className={`nav-item ${view === 'profile' ? 'active' : ''}`}
              aria-current={view === 'profile' ? 'page' : undefined}
              onClick={loadStudentProfile}
            >
              <UserRound size={18} /> My Profile
            </button>

            <button
              className={`nav-item ${view === 'courses' ? 'active' : ''}`}
              aria-current={view === 'courses' ? 'page' : undefined}
              onClick={() => setView('courses')}
            >
              <BookOpen size={18} /> Courses &amp; Subjects
            </button>

            <button
              className={`nav-item ${view === 'timetable' ? 'active' : ''}`}
              aria-current={view === 'timetable' ? 'page' : undefined}
              onClick={() => setView('timetable')}
            >
              <Clock3 size={18} /> Timetable
            </button>

            <button
              className={`nav-item ${view === 'attendance' ? 'active' : ''}`}
              aria-current={view === 'attendance' ? 'page' : undefined}
              onClick={() => setView('attendance')}
            >
              <ClipboardCheck size={18} /> Attendance
            </button>

            <button
              className={`nav-item ${view === 'calendar' ? 'active' : ''}`}
              aria-current={view === 'calendar' ? 'page' : undefined}
              onClick={() => setView('calendar')}
            >
              <CalendarDays size={18} /> Academic Calendar
            </button>
          </nav>
        ) : isFaculty ? (
          <nav className="student-nav" aria-label="Faculty portal">
            <button
              className={`nav-item ${view === 'faculty' || view === 'dashboard' ? 'active' : ''}`}
              aria-current={
                view === 'faculty' || view === 'dashboard'
                  ? 'page'
                  : undefined
              }
              onClick={() => setView('faculty')}
            >
              <LayoutDashboard size={18} /> Faculty Dashboard
            </button>
          </nav>
        ) : (
          <>
            <button
              className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
              aria-current={view === 'dashboard' ? 'page' : undefined}
              onClick={() => {
                setView('dashboard');
                setData(null);
              }}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>

            {isAdmin && (
              <button
                className={`nav-item ${view === 'registrations' ? 'active' : ''}`}
                onClick={loadAdminRegistrations}
              >
                <Users size={18} /> Student verification
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'students' ? 'active' : ''}`}
                onClick={openStudentManagement}
              >
                <UserRoundPlus size={18} /> Students
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'facultyManagement' ? 'active' : ''}`}
                aria-current={view === 'facultyManagement' ? 'page' : undefined}
                onClick={() => {
                  setView('facultyManagement');
                  setError('');
                  setMessage('');
                }}
              >
                <Users size={18} /> Faculty Management
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'academic' ? 'active' : ''}`}
                aria-current={view === 'academic' ? 'page' : undefined}
                onClick={() => {
                  setView('academic');
                  setError('');
                  setMessage('');
                }}
              >
                <Building2 size={18} /> Academic Management
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'admins' ? 'active' : ''}`}
                onClick={loadAdmins}
              >
                <Shield size={18} /> Admin Management
              </button>
            )}

            {!isAdmin && !isPending && (
              <button
                className={`nav-item ${view === 'profile' ? 'active' : ''}`}
                onClick={loadStudentProfile}
              >
                <UserRound size={18} /> My profile
              </button>
            )}
          </>
        )}

        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="avatar">
              {(profile?.full_name || session.user.email || 'U')
                .slice(0, 1)
                .toUpperCase()}
            </div>

            <div className="user-meta">
              <strong>{profile?.full_name || session.user.email}</strong>
              <small>{profile?.role || 'Account pending'}</small>
            </div>
          </div>

          <button className="nav-item" onClick={signOut}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="muted">University Automation System</span>
            <h1>{pageTitles[view] || 'Dashboard'}</h1>
          </div>

          <div className="top-actions">
            <span
              className={`status-pill ${isPending ? 'pending' : 'active-status'}`}
            >
              {isPending
                ? 'Pending verification'
                : profile?.account_status || 'Loading'}
            </span>

            <button
              className="icon-button theme-toggle"
              type="button"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-pressed={theme === 'dark'}
              onClick={toggleTheme}
            >
              {theme === 'light'
                ? <Moon size={17} />
                : <Sun size={17} />}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>

            <button
              className="icon-button"
              title="Refresh profile"
              aria-label="Refresh profile"
              onClick={() => loadProfile(session.access_token)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        {isPending ? (
          <section className="pending-card">
            <div className="pending-icon">
              <Clock3 size={30} />
            </div>

            <h2>Registration under review</h2>

            <p>
              Your account has been created, but student portal access is not
              yet enabled. An Admin must verify your details and link your
              account to the correct student record.
            </p>

            <button
              className="secondary-button"
              onClick={() => loadProfile(session.access_token)}
            >
              Check status
            </button>
          </section>
        ) : !profile ? (
          <section className="panel">
            <p>
              {profileLoading
                ? 'Loading account details…'
                : 'Account details could not be loaded. Check the error above, then retry.'}
            </p>

            <button
              className="secondary-button"
              disabled={profileLoading}
              onClick={() => loadProfile(session.access_token)}
            >
              {profileLoading ? 'Loading…' : 'Retry'}
            </button>
          </section>
        ) : view === 'registrations' && isAdmin ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Pending registrations</h2>
                <p className="muted">
                  Review each account before granting student access.
                </p>
              </div>

              <button
                className="secondary-button"
                onClick={loadAdminRegistrations}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>

            {Array.isArray(data) && data.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Student ID</th>
                      <th>Submitted</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.map(r => (
                      <tr key={r.profile_id}>
                        <td>{r.full_name || '—'}</td>
                        <td>{r.email || '—'}</td>
                        <td>{r.student_code || 'Generated on approval'}</td>
                        <td>
                          {r.created_at
                            ? new Date(r.created_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="approve-button"
                              disabled={busy}
                              onClick={() =>
                                reviewRegistration(r.profile_id, 'approve')
                              }
                            >
                              Approve
                            </button>

                            <button
                              className="reject-button"
                              disabled={busy}
                              onClick={() =>
                                reviewRegistration(r.profile_id, 'reject')
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <Users size={26} />
                <strong>No pending registrations loaded</strong>
                <span>Refresh to check for new registrations.</span>
              </div>
            )}
          </section>
        ) : view === 'facultyManagement' && isAdmin ? (
          <FacultyManagement token={session.access_token} />
        ) : view === 'students' && isAdmin ? (
          <section className="student-management">
            <div className="panel student-management-panel">
              <div className="panel-heading student-heading">
                <div>
                  <h2>Student Management</h2>
                  <p className="muted">
                    Create and maintain student records. Creating a record
                    does not create or activate a login account.
                  </p>
                </div>

                <div className="admin-page-actions">
                  <button
                    className="secondary-button"
                    disabled={studentsLoading}
                    onClick={() => {
                      loadStudentOptions();
                      loadStudents();
                    }}
                  >
                    <RefreshCw size={15} /> Refresh
                  </button>

                  <button
                    className="primary-button admin-add-button"
                    onClick={openStudentCreate}
                  >
                    <UserPlus size={15} /> Add Student
                  </button>
                </div>
              </div>

              <div className="student-summary">
                <div className="stat-icon blue">
                  <Users size={20} />
                </div>
                <span>Total student records</span>
                <strong>
                  {studentsLoading && studentTotal === 0
                    ? '…'
                    : studentTotal}
                </strong>
              </div>

              <form
                className="student-filters"
                onSubmit={event => {
                  event.preventDefault();
                  loadStudents({ offset: 0 });
                }}
              >
                <label className="student-search">
                  <span>Search students</span>
                  <div>
                    <Search size={16} />
                    <input
                      value={studentSearch}
                      onChange={event => setStudentSearch(event.target.value)}
                      placeholder="Student ID, name, or email"
                    />
                  </div>
                </label>

                <label>
                  <span>Department</span>
                  <select
                    value={studentFilters.department_id}
                    onChange={event =>
                      setStudentFilters({
                        ...studentFilters,
                        department_id: event.target.value,
                        course_id: ''
                      })
                    }
                  >
                    <option value="">All departments</option>
                    {studentOptions.departments.map(department => (
                      <option value={department.id} key={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Course</span>
                  <select
                    value={studentFilters.course_id}
                    onChange={event =>
                      setStudentFilters({
                        ...studentFilters,
                        course_id: event.target.value
                      })
                    }
                  >
                    <option value="">All courses</option>
                    {studentOptions.courses
                      .filter(
                        course =>
                          !studentFilters.department_id ||
                          course.department_id === studentFilters.department_id
                      )
                      .map(course => (
                        <option value={course.id} key={course.id}>
                          {course.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={studentFilters.status}
                    onChange={event =>
                      setStudentFilters({
                        ...studentFilters,
                        status: event.target.value
                      })
                    }
                  >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>

                <button
                  className="secondary-button filter-submit"
                  disabled={studentsLoading}
                >
                  <Search size={15} /> Search
                </button>
              </form>

              {studentOptionsError && (
                <div className="alert error">{studentOptionsError}</div>
              )}

              {studentOptionsLoading &&
                !studentOptions.departments.length && (
                  <p className="muted student-option-note">
                    Loading department and course options…
                  </p>
                )}

              {!studentOptionsError &&
                !studentOptionsLoading &&
                !studentOptions.departments.length && (
                  <p className="muted student-option-note">
                    No active departments are configured. You can still add
                    students without academic placement.
                  </p>
                )}

              <div className="student-table-heading">
                <strong>
                  {studentsLoading
                    ? 'Loading student records…'
                    : `Showing ${studentFilteredTotal} matching record${studentFilteredTotal === 1 ? '' : 's'}`}
                </strong>
                <span>{studentTotal} total</span>
              </div>

              {studentsLoading ? (
                <div className="empty-state">
                  <RefreshCw size={24} />
                  <span>Loading students…</span>
                </div>
              ) : studentsError ? (
                <div className="empty-state">
                  <CircleAlert size={26} />
                  <strong>Student records could not be loaded</strong>
                  <span>{studentsError}</span>
                  <button
                    className="secondary-button"
                    onClick={() => loadStudents()}
                  >
                    <RefreshCw size={15} /> Retry
                  </button>
                </div>
              ) : students.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Full name</th>
                        <th>Email</th>
                        <th>Department</th>
                        <th>Course</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {students.map(student => (
                        <tr key={student.id}>
                          <td><strong>{student.student_code}</strong></td>
                          <td>{student.full_name}</td>
                          <td>{student.email || '—'}</td>
                          <td>{student.department?.name || '—'}</td>
                          <td>{student.course?.name || '—'}</td>
                          <td>
                            <span
                              className={`status-pill ${student.status === 'active' ? 'active-status' : 'pending'}`}
                            >
                              {student.status}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="secondary-button student-action"
                                title="View details"
                                onClick={() =>
                                  openStudentDetails(student, 'view')
                                }
                              >
                                <Eye size={14} />
                              </button>

                              <button
                                className="secondary-button student-action"
                                title="Edit student"
                                onClick={() =>
                                  openStudentDetails(student, 'edit')
                                }
                              >
                                <Pencil size={14} />
                              </button>

                              <button
                                className={
                                  student.status === 'active'
                                    ? 'reject-button'
                                    : 'approve-button'
                                }
                                onClick={() => changeStudentStatus(student)}
                                disabled={busy}
                              >
                                {student.status === 'active'
                                  ? 'Deactivate'
                                  : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <UserRoundPlus size={26} />
                  <strong>
                    {studentTotal === 0
                      ? 'No student records yet'
                      : 'No students match these filters'}
                  </strong>
                  <span>
                    {studentTotal === 0
                      ? 'Add a student record to get started.'
                      : 'Change your search or filters and try again.'}
                  </span>
                </div>
              )}

              <div className="student-pagination">
                <button
                  className="secondary-button"
                  disabled={studentsLoading || studentOffset <= 0}
                  onClick={() =>
                    loadStudents({
                      offset: Math.max(0, studentOffset - 25)
                    })
                  }
                >
                  <ChevronLeft size={15} /> Previous
                </button>

                <span>
                  {studentFilteredTotal
                    ? `${studentOffset + 1}–${Math.min(studentOffset + students.length, studentFilteredTotal)} of ${studentFilteredTotal}`
                    : '0 results'}
                </span>

                <button
                  className="secondary-button"
                  disabled={
                    studentsLoading ||
                    studentOffset + students.length >= studentFilteredTotal
                  }
                  onClick={() =>
                    loadStudents({ offset: studentOffset + 25 })
                  }
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>
        ) : view === 'academic' && isAdmin ? (
          <AdminAcademicManagement token={session.access_token} />
        ) : view === 'faculty' && isFaculty ? (
          <FacultyDashboard token={session.access_token} />
        ) : view === 'admins' && isAdmin ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Admin Management</h2>
                <p className="muted">
                  Authorized Admins can manage access to the university
                  administration workspace.
                </p>
              </div>

              <div className="admin-page-actions">
                <button
                  className="secondary-button"
                  disabled={adminsLoading}
                  onClick={loadAdmins}
                >
                  <RefreshCw size={15} /> Refresh
                </button>

                <button
                  className="primary-button admin-add-button"
                  onClick={openAdminDialog}
                >
                  <UserPlus size={15} /> Add Admin
                </button>
              </div>
            </div>

            {adminsLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} />
                <span>Loading admin accounts…</span>
              </div>
            ) : admins?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Admin</th>
                      <th>Email</th>
                      <th>Account status</th>
                      <th>Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {admins.map(admin => (
                      <tr key={admin.id}>
                        <td>{admin.full_name || '—'}</td>
                        <td>{admin.email || '—'}</td>
                        <td>
                          <span
                            className={`status-pill ${admin.account_status === 'active' ? 'active-status' : 'pending'}`}
                          >
                            {admin.account_status?.replaceAll('_', ' ') ||
                              'Unknown'}
                          </span>
                        </td>
                        <td>
                          {admin.created_at
                            ? new Date(admin.created_at).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : admins === null ? (
              <div className="empty-state">
                <CircleAlert size={26} />
                <strong>Admin accounts could not be loaded</strong>
                <span>Refresh to retry.</span>
              </div>
            ) : (
              <div className="empty-state">
                <Shield size={26} />
                <strong>No Admin accounts found</strong>
                <span>Add an Admin account to grant administrative access.</span>
              </div>
            )}
          </section>
        ) : view === 'profile' && isActiveStudent ? (
          <section className="panel student-module-panel">
            <div className="panel-heading">
              <div>
                <h2>My student profile</h2>
                <p className="muted">
                  Official identity and academic placement are read-only.
                </p>
              </div>

              <button
                className="secondary-button"
                disabled={studentRecordLoading}
                onClick={() => loadProfile(session.access_token)}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>

            {studentRecordLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} />
                <span>Loading your profile…</span>
              </div>
            ) : studentRecordError ? (
              <div className="empty-state">
                <CircleAlert size={26} />
                <strong>Profile could not be loaded</strong>
                <span>{studentRecordError}</span>
                <button
                  className="secondary-button"
                  onClick={() => loadProfile(session.access_token)}
                >
                  Retry
                </button>
              </div>
            ) : studentRecord ? (
              <>
                <div className="profile-grid">
                  <div className="profile-field">
                    <span>Student ID</span>
                    <strong>{studentRecord.student_code}</strong>
                  </div>

                  <div className="profile-field">
                    <span>Full name</span>
                    <strong>{studentRecord.full_name}</strong>
                  </div>

                  <div className="profile-field">
                    <span>Email</span>
                    <strong>{studentRecord.email || '—'}</strong>
                  </div>

                  <div className="profile-field">
                    <span>Account status</span>
                    <strong>
                      {profile.account_status.replaceAll('_', ' ')}
                    </strong>
                  </div>

                  {studentRecord.department && (
                    <div className="profile-field">
                      <span>Department</span>
                      <strong>
                        {studentRecord.department.name} (
                        {studentRecord.department.code})
                      </strong>
                    </div>
                  )}

                  {studentRecord.course && (
                    <div className="profile-field">
                      <span>Course</span>
                      <strong>
                        {studentRecord.course.name} (
                        {studentRecord.course.code})
                      </strong>
                    </div>
                  )}

                  {studentRecord.admission_year && (
                    <div className="profile-field">
                      <span>Admission year</span>
                      <strong>{studentRecord.admission_year}</strong>
                    </div>
                  )}

                  <div className="profile-field">
                    <span>Student record status</span>
                    <strong>{studentRecord.status}</strong>
                  </div>
                </div>

                <form
                  className="student-profile-form"
                  onSubmit={saveStudentPhone}
                  noValidate
                >
                  <h3>Permitted personal detail</h3>

                  <label htmlFor="student-profile-phone">
                    Phone number
                  </label>

                  <input
                    id="student-profile-phone"
                    type="tel"
                    maxLength={40}
                    value={phoneDraft}
                    aria-invalid={Boolean(phoneError)}
                    aria-describedby={
                      phoneError ? 'student-phone-error' : undefined
                    }
                    onChange={event => {
                      setPhoneDraft(event.target.value);
                      setPhoneError('');
                      setPhoneMessage('');
                    }}
                  />

                  {phoneError && (
                    <small
                      id="student-phone-error"
                      className="field-error"
                      role="alert"
                    >
                      {phoneError}
                    </small>
                  )}

                  {phoneMessage && (
                    <div className="alert success" role="status">
                      {phoneMessage}
                    </div>
                  )}

                  <button
                    className="primary-button admin-submit-button"
                    disabled={phoneSaving}
                  >
                    {phoneSaving ? 'Saving…' : 'Save phone number'}
                  </button>

                  <p className="muted profile-note">
                    Student ID, name, email, role, status and academic
                    assignments cannot be edited here.
                  </p>
                </form>

                <div className="password-flow-note">
                  <strong>Password changes</strong>
                  <p className="muted">
                    A password change/reset flow is not implemented in this
                    portal. Contact university support for the supported
                    account-recovery instructions; no password workaround is
                    provided here.
                  </p>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <UserRound size={26} />
                <span>No student record is linked to this account.</span>
              </div>
            )}
          </section>
        ) : view === 'courses' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={BookOpen}
            title="Courses & Subjects"
            description="View your current academic course and subject information."
            requirement="Course and subject data must be configured by university administration."
          />
        ) : view === 'timetable' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={Clock3}
            title="Timetable"
            description="Review your class schedule."
            requirement="Your timetable will appear here after a timetable has been configured."
          />
        ) : view === 'attendance' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={ClipboardCheck}
            title="Attendance"
            description="Review your attendance records."
            requirement="Attendance records will appear here after faculty begin recording attendance."
          />
        ) : view === 'calendar' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={CalendarDays}
            title="Academic Calendar"
            description="Keep track of important university dates."
            requirement="Academic events will appear here after they have been published."
          />
        ) : (
          <section className="dashboard-grid">
            <div className="welcome-card">
              <div>
                <span className="eyebrow">YOUR CAMPUS WORKSPACE</span>
                <h2>
                  Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}.
                </h2>
                <p>
                  Manage your university information from one central
                  workspace.
                </p>
              </div>
              <div className="welcome-icon">
                <GraduationCap size={36} />
              </div>
            </div>

            <div className="dashboard-stat-grid">
              <div className="dashboard-stat-card">
                <div className="stat-icon blue"><Users size={20} /></div>
                <span>Account role</span>
                <strong>
                  {profile?.role
                    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
                    : '—'}
                </strong>
                <small>Based on your university account</small>
              </div>

              <div className="dashboard-stat-card">
                <div className="stat-icon green"><ShieldCheck size={20} /></div>
                <span>Account status</span>
                <strong>
                  {profile?.account_status?.replaceAll('_', ' ') || '—'}
                </strong>
                <small>Current access status</small>
              </div>

              <div className="dashboard-stat-card">
                <div className="stat-icon purple"><BookOpen size={20} /></div>
                <span>Academic workspace</span>
                <strong>{isAdmin ? 'Management' : isFaculty ? 'Faculty' : 'Student'}</strong>
                <small>Available modules depend on your role</small>
              </div>
            </div>

            <div className="panel dashboard-overview">
              <div className="panel-heading">
                <div>
                  <h2>Workspace overview</h2>
                  <p className="muted">
                    {isAdmin
                      ? 'Manage student verification, student records, faculty, and academic setup.'
                      : isFaculty
                        ? 'Access your faculty workspace and assigned academic activities.'
                        : 'Your account and academic information are available here.'}
                  </p>
                </div>
              </div>

              <div className="overview-list">
                {isAdmin ? (
                  <>
                    <button
                      className="overview-item"
                      onClick={loadAdminRegistrations}
                    >
                      <span className="overview-icon"><Users size={19} /></span>
                      <span>
                        <strong>Student verification</strong>
                        <small>Review pending student registrations</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>

                    <button
                      className="overview-item"
                      onClick={openStudentManagement}
                    >
                      <span className="overview-icon"><UserRoundPlus size={19} /></span>
                      <span>
                        <strong>Student management</strong>
                        <small>Maintain student records and status</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>

                    <button
                      className="overview-item"
                      onClick={() => setView('facultyManagement')}
                    >
                      <span className="overview-icon"><Users size={19} /></span>
                      <span>
                        <strong>Faculty management</strong>
                        <small>Create and manage faculty accounts</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>

                    <button
                      className="overview-item"
                      onClick={() => setView('academic')}
                    >
                      <span className="overview-icon"><Building2 size={19} /></span>
                      <span>
                        <strong>Academic management</strong>
                        <small>Configure departments, courses, and subjects</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>

                    <button
                      className="overview-item"
                      onClick={loadAdmins}
                    >
                      <span className="overview-icon"><Shield size={19} /></span>
                      <span>
                        <strong>Admin management</strong>
                        <small>Manage administrator access</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  </>
                ) : isFaculty ? (
                  <button
                    className="overview-item"
                    onClick={() => setView('faculty')}
                  >
                    <span className="overview-icon"><LayoutDashboard size={19} /></span>
                    <span>
                      <strong>Faculty dashboard</strong>
                      <small>Open your faculty workspace</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ) : (
                  <button
                    className="overview-item"
                    onClick={loadStudentProfile}
                  >
                    <span className="overview-icon"><UserRound size={19} /></span>
                    <span>
                      <strong>My profile</strong>
                      <small>Review your official student information</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {studentModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !busy) {
              setStudentModal(null);
            }
          }}
        >
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-modal-title"
          >
            <div className="panel-heading">
              <div>
                <h2 id="student-modal-title">
                  {studentModal === 'add'
                    ? 'Add Student'
                    : studentModal === 'edit'
                      ? 'Edit Student'
                      : 'Student Details'}
                </h2>
                <p className="muted">
                  {studentModal === 'view'
                    ? 'Review the selected student record.'
                    : 'Enter the student information below.'}
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setStudentModal(null)}
                disabled={busy}
              >
                <X size={18} />
              </button>
            </div>

            {studentModal === 'view' ? (
              selectedStudent ? (
                <div className="profile-grid">
                  <div className="profile-field">
                    <span>Student ID</span>
                    <strong>{selectedStudent.student_code || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Full name</span>
                    <strong>{selectedStudent.full_name || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Email</span>
                    <strong>{selectedStudent.email || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Phone</span>
                    <strong>{selectedStudent.phone || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Department</span>
                    <strong>{selectedStudent.department?.name || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Course</span>
                    <strong>{selectedStudent.course?.name || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Admission year</span>
                    <strong>{selectedStudent.admission_year || '—'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Status</span>
                    <strong>{selectedStudent.status || '—'}</strong>
                  </div>

                  <div className="modal-actions">
                    <button
                      className="secondary-button"
                      onClick={() => setStudentModal(null)}
                    >
                      Close
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => openStudentDetails(selectedStudent, 'edit')}
                    >
                      <Pencil size={15} /> Edit Student
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <RefreshCw size={24} />
                  <span>Loading student details…</span>
                </div>
              )
            ) : (
              <form onSubmit={saveStudent} noValidate>
                <label htmlFor="student-full-name">Full name</label>
                <input
                  id="student-full-name"
                  value={studentForm.full_name}
                  maxLength={120}
                  aria-invalid={Boolean(studentFieldErrors.full_name)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      full_name: event.target.value
                    })
                  }
                  required
                />
                {studentFieldErrors.full_name && (
                  <small className="field-error">
                    {studentFieldErrors.full_name}
                  </small>
                )}

                <label htmlFor="student-email">Email address</label>
                <input
                  id="student-email"
                  type="email"
                  value={studentForm.email}
                  aria-invalid={Boolean(studentFieldErrors.email)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      email: event.target.value
                    })
                  }
                />
                {studentFieldErrors.email && (
                  <small className="field-error">
                    {studentFieldErrors.email}
                  </small>
                )}

                <label htmlFor="student-phone">Phone number</label>
                <input
                  id="student-phone"
                  type="tel"
                  value={studentForm.phone}
                  maxLength={40}
                  aria-invalid={Boolean(studentFieldErrors.phone)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      phone: event.target.value
                    })
                  }
                />
                {studentFieldErrors.phone && (
                  <small className="field-error">
                    {studentFieldErrors.phone}
                  </small>
                )}

                <label htmlFor="student-department">Department</label>
                <select
                  id="student-department"
                  value={studentForm.department_id}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      department_id: event.target.value,
                      course_id: ''
                    })
                  }
                >
                  <option value="">No department assigned</option>
                  {studentOptions.departments.map(department => (
                    <option value={department.id} key={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>

                <label htmlFor="student-course">Course</label>
                <select
                  id="student-course"
                  value={studentForm.course_id}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      course_id: event.target.value
                    })
                  }
                >
                  <option value="">No course assigned</option>
                  {studentOptions.courses
                    .filter(
                      course =>
                        !studentForm.department_id ||
                        course.department_id === studentForm.department_id
                    )
                    .map(course => (
                      <option value={course.id} key={course.id}>
                        {course.name}
                      </option>
                    ))}
                </select>
                {studentFieldErrors.course_id && (
                  <small className="field-error">
                    {studentFieldErrors.course_id}
                  </small>
                )}

                <label htmlFor="student-admission-year">Admission year</label>
                <input
                  id="student-admission-year"
                  inputMode="numeric"
                  value={studentForm.admission_year}
                  maxLength={4}
                  aria-invalid={Boolean(studentFieldErrors.admission_year)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      admission_year: event.target.value
                    })
                  }
                  placeholder="e.g. 2026"
                />
                {studentFieldErrors.admission_year && (
                  <small className="field-error">
                    {studentFieldErrors.admission_year}
                  </small>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setStudentModal(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button admin-submit-button"
                    disabled={busy}
                  >
                    {busy
                      ? 'Saving…'
                      : studentModal === 'edit'
                        ? 'Save Changes'
                        : 'Create Student'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {adminDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !adminBusy) {
              setAdminDialogOpen(false);
            }
          }}
        >
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
          >
            <div className="panel-heading">
              <div>
                <h2 id="admin-modal-title">Add Admin</h2>
                <p className="muted">
                  Create an administrator account with university-wide access.
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                disabled={adminBusy}
                onClick={() => setAdminDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createAdmin} noValidate>
              <label htmlFor="admin-full-name">Full name</label>
              <input
                id="admin-full-name"
                value={adminForm.fullName}
                maxLength={120}
                aria-invalid={Boolean(adminFieldErrors.fullName)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    fullName: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    fullName: ''
                  });
                }}
                required
              />
              {adminFieldErrors.fullName && (
                <small className="field-error">
                  {adminFieldErrors.fullName}
                </small>
              )}

              <label htmlFor="admin-email">Email address</label>
              <input
                id="admin-email"
                type="email"
                value={adminForm.email}
                aria-invalid={Boolean(adminFieldErrors.email)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    email: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    email: ''
                  });
                }}
                required
              />
              {adminFieldErrors.email && (
                <small className="field-error">
                  {adminFieldErrors.email}
                </small>
              )}

              <label htmlFor="admin-password">Temporary password</label>
              <input
                id="admin-password"
                type="password"
                value={adminForm.password}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                aria-invalid={Boolean(adminFieldErrors.password)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    password: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    password: ''
                  });
                }}
                required
              />
              {adminFieldErrors.password && (
                <small className="field-error">
                  {adminFieldErrors.password}
                </small>
              )}

              <label htmlFor="admin-confirm-password">Confirm password</label>
              <input
                id="admin-confirm-password"
                type="password"
                value={adminForm.confirmPassword}
                autoComplete="new-password"
                aria-invalid={Boolean(adminFieldErrors.confirmPassword)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    confirmPassword: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    confirmPassword: ''
                  });
                }}
                required
              />
              {adminFieldErrors.confirmPassword && (
                <small
                  className="field-error"
                  id="admin-confirm-password-error"
                >
                  {adminFieldErrors.confirmPassword}
                </small>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={adminBusy}
                  onClick={() => setAdminDialogOpen(false)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button admin-submit-button"
                  disabled={adminBusy}
                >
                  {adminBusy ? 'Creating…' : 'Create Admin'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}