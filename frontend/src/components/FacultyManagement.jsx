
import { useCallback, useEffect, useState } from 'react';
import {
    Users,
    UserPlus,
    RefreshCw,
    Search,
    X,
    CheckCircle2,
    CircleAlert,
    Building2,
    Mail,
    ShieldCheck
} from 'lucide-react';
import { apiRequest } from '../lib/api';

const EMPTY_FORM = {
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    designation: '',
    department_id: ''
};

export default function FacultyManagement({ token }) {
    const [faculty, setFaculty] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams();
            if (search.trim()) params.set('q', search.trim());
            if (statusFilter) params.set('status', statusFilter);

            const [facultyResult, departmentResult] = await Promise.all([
                apiRequest(`/faculty-management?${params.toString()}`, { token }),
                apiRequest('/faculty-management/options', { token })
            ]);

            setFaculty(facultyResult.faculty || []);
            setDepartments(departmentResult.departments || []);
        } catch (e) {
            setError(e.message || 'Could not load faculty records.');
        } finally {
            setLoading(false);
        }
    }, [token, search, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    function openDialog() {
        setForm(EMPTY_FORM);
        setFieldErrors({});
        setError('');
        setMessage('');
        setDialogOpen(true);
    }

    function updateField(key, value) {
        setForm(current => ({ ...current, [key]: value }));
        setFieldErrors(current => ({ ...current, [key]: '' }));
    }

    function validate() {
        const errors = {};

        if (!form.full_name.trim()) {
            errors.full_name = 'Full name is required.';
        }

        if (!form.email.trim()) {
            errors.email = 'Email address is required.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
            errors.email = 'Enter a valid email address.';
        }

        if (!form.designation.trim()) {
            errors.designation = 'Designation is required.';
        }

        if (form.password.length < 8 || form.password.length > 128) {
            errors.password = 'Password must contain 8–128 characters.';
        }

        if (form.password !== form.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match.';
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    }

    async function createFaculty(event) {
        event.preventDefault();
        if (!validate()) return;

        setSaving(true);
        setError('');
        setMessage('');

        try {
            await apiRequest('/faculty-management', {
                token,
                method: 'POST',
                body: JSON.stringify({
                    ...form,
                    full_name: form.full_name.trim(),
                    email: form.email.trim().toLowerCase(),
                    designation: form.designation.trim(),
                    department_id: form.department_id || null
                })
            });

            setDialogOpen(false);
            setForm(EMPTY_FORM);
            setFieldErrors({});
            setMessage('Faculty account created successfully.');
            await loadData();
        } catch (e) {
            setError(e.message || 'Could not create faculty account.');
            setFieldErrors(current => ({ ...current, ...(e.fields || {}) }));
        } finally {
            setSaving(false);
        }
    }

    async function toggleStatus(item) {
        const nextStatus = item.status === 'active' ? 'inactive' : 'active';
        const action = nextStatus === 'inactive' ? 'deactivate' : 'reactivate';

        if (!window.confirm(`Are you sure you want to ${action} ${item.full_name}?`)) {
            return;
        }

        setError('');
        setMessage('');

        try {
            await apiRequest(`/faculty-management/${item.id}/status`, {
                token,
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus })
            });

            setMessage(`Faculty record ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`);
            await loadData();
        } catch (e) {
            setError(e.message || 'Could not update faculty status.');
        }
    }

    return (
        <section className="faculty-management-page">
            <div className="faculty-management-header">
                <div>
                    <span className="eyebrow">UNIVERSITY WORKSPACE</span>
                    <h2>Faculty Management</h2>
                    <p className="muted">
                        Create faculty accounts, manage department assignments, and review faculty records.
                    </p>
                </div>

                <button className="primary-button faculty-add-button" onClick={openDialog}>
                    <UserPlus size={18} />
                    Add Faculty
                </button>
            </div>

            {error && !dialogOpen && (
                <div className="alert error" role="alert">
                    <CircleAlert size={18} />
                    {error}
                </div>
            )}

            {message && (
                <div className="alert success" role="status">
                    <CheckCircle2 size={18} />
                    {message}
                </div>
            )}

            <section className="panel faculty-management-panel">
                <div className="faculty-toolbar">
                    <div>
                        <h3>Faculty Directory</h3>
                        <p className="muted">
                            {faculty.length} faculty record{faculty.length === 1 ? '' : 's'} shown
                        </p>
                    </div>

                    <button
                        className="secondary-button"
                        type="button"
                        onClick={loadData}
                        disabled={loading}
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>

                <div className="faculty-filters">
                    <label className="faculty-search">
                        <Search size={17} />
                        <input
                            type="search"
                            placeholder="Search name, ID, or designation"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                        />
                    </label>

                    <select
                        aria-label="Filter faculty by status"
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value)}
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <RefreshCw size={24} />
                        <span>Loading faculty records…</span>
                    </div>
                ) : faculty.length === 0 ? (
                    <div className="empty-state">
                        <Users size={28} />
                        <strong>No faculty records found</strong>
                        <span>Add a faculty member or adjust your search filters.</span>
                        <button className="primary-button" onClick={openDialog}>
                            <UserPlus size={17} />
                            Add Faculty
                        </button>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>FACULTY</th>
                                    <th>EMAIL</th>
                                    <th>DEPARTMENT</th>
                                    <th>DESIGNATION</th>
                                    <th>STATUS</th>
                                    <th>ACTIONS</th>
                                </tr>
                            </thead>

                            <tbody>
                                {faculty.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="faculty-name-cell">
                                                <span className="faculty-avatar">
                                                    {(item.full_name || 'F').slice(0, 1).toUpperCase()}
                                                </span>
                                                <div>
                                                    <strong>{item.full_name}</strong>
                                                    <small>{item.faculty_code}</small>
                                                </div>
                                            </div>
                                        </td>

                                        <td>{item.email || '—'}</td>

                                        <td>
                                            <span className="faculty-department">
                                                <Building2 size={15} />
                                                {item.department?.name || 'Not assigned'}
                                            </span>
                                        </td>

                                        <td>{item.designation || '—'}</td>

                                        <td>
                                            <span className={`status-pill ${item.status === 'active' ? 'success' : 'muted'}`}>
                                                {item.status}
                                            </span>
                                        </td>

                                        <td>
                                            <button
                                                type="button"
                                                className="secondary-button faculty-status-button"
                                                onClick={() => toggleStatus(item)}
                                            >
                                                {item.status === 'active' ? 'Deactivate' : 'Reactivate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {dialogOpen && (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget && !saving) setDialogOpen(false);
                    }}
                >
                    <section
                        className="admin-modal faculty-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="faculty-modal-title"
                    >
                        <div className="panel-heading">
                            <div>
                                <h2 id="faculty-modal-title">Add Faculty</h2>
                                <p className="muted">
                                    Create a faculty login and link it to a faculty record.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="icon-button"
                                aria-label="Close"
                                disabled={saving}
                                onClick={() => setDialogOpen(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {error && (
                            <div className="alert error" role="alert">
                                <CircleAlert size={17} />
                                {error}
                            </div>
                        )}

                        <form onSubmit={createFaculty} noValidate>
                            <label htmlFor="faculty-full-name">Full name</label>
                            <input
                                id="faculty-full-name"
                                autoComplete="name"
                                maxLength={120}
                                value={form.full_name}
                                aria-invalid={Boolean(fieldErrors.full_name)}
                                onChange={event => updateField('full_name', event.target.value)}
                            />
                            {fieldErrors.full_name && <small className="field-error">{fieldErrors.full_name}</small>}

                            <label htmlFor="faculty-email">Email address</label>
                            <input
                                id="faculty-email"
                                type="email"
                                autoComplete="email"
                                value={form.email}
                                aria-invalid={Boolean(fieldErrors.email)}
                                onChange={event => updateField('email', event.target.value)}
                            />
                            {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}

                            <label htmlFor="faculty-designation">Designation</label>
                            <input
                                id="faculty-designation"
                                maxLength={120}
                                placeholder="e.g. Assistant Professor"
                                value={form.designation}
                                aria-invalid={Boolean(fieldErrors.designation)}
                                onChange={event => updateField('designation', event.target.value)}
                            />
                            {fieldErrors.designation && <small className="field-error">{fieldErrors.designation}</small>}

                            <label htmlFor="faculty-department">Department</label>
                            <select
                                id="faculty-department"
                                value={form.department_id}
                                onChange={event => updateField('department_id', event.target.value)}
                            >
                                <option value="">No department assigned</option>
                                {departments.map(department => (
                                    <option value={department.id} key={department.id}>
                                        {department.name} ({department.code})
                                    </option>
                                ))}
                            </select>
                            {fieldErrors.department_id && <small className="field-error">{fieldErrors.department_id}</small>}

                            <label htmlFor="faculty-password">Temporary password</label>
                            <input
                                id="faculty-password"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                maxLength={128}
                                value={form.password}
                                aria-invalid={Boolean(fieldErrors.password)}
                                onChange={event => updateField('password', event.target.value)}
                            />
                            {fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}

                            <label htmlFor="faculty-confirm-password">Confirm password</label>
                            <input
                                id="faculty-confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={form.confirmPassword}
                                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                                onChange={event => updateField('confirmPassword', event.target.value)}
                            />
                            {fieldErrors.confirmPassword && <small className="field-error">{fieldErrors.confirmPassword}</small>}

                            <p className="muted faculty-security-note">
                                <ShieldCheck size={16} />
                                Faculty accounts are created by an active administrator. Share temporary credentials securely.
                            </p>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={saving}
                                    onClick={() => setDialogOpen(false)}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    className="primary-button admin-submit-button"
                                    disabled={saving}
                                >
                                    {saving ? 'Creating…' : 'Create Faculty Account'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
        </section>
    );
}
