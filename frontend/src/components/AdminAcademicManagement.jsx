
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  CirclePlus,
  RefreshCw,
  Users
} from 'lucide-react';
import { apiRequest } from '../lib/api';

const SECTIONS = [
  { key: 'years', title: 'Academic Years', dataKey: 'academic_years', label: 'Academic year' },
  { key: 'semesters', title: 'Semesters', dataKey: 'semesters', label: 'Semester' },
  { key: 'departments', title: 'Departments', dataKey: 'departments', label: 'Department' },
  { key: 'courses', title: 'Courses / Programs', dataKey: 'courses', label: 'Course' }
];

const EMPTY_DATA = {
  academic_years: [],
  semesters: [],
  departments: [],
  courses: [],
  faculty: []
};

function emptyForm(section) {
  switch (section) {
    case 'years':
      return { year_code: '', label: '', start_date: '', end_date: '' };
    case 'semesters':
      return {
        academic_year_id: '',
        semester_number: '',
        label: '',
        start_date: '',
        end_date: ''
      };
    case 'departments':
      return { name: '', code: '' };
    case 'courses':
      return { department_id: '', name: '', code: '', faculty_ids: [] };
    default:
      return {};
  }
}

function recordForm(section, item) {
  switch (section) {
    case 'years':
      return {
        year_code: item.year_code,
        label: item.label,
        start_date: item.start_date,
        end_date: item.end_date,
        status: item.status
      };
    case 'semesters':
      return {
        academic_year_id: item.academic_year_id,
        semester_number: String(item.semester_number),
        label: item.label,
        start_date: item.start_date,
        end_date: item.end_date,
        status: item.status
      };
    case 'departments':
      return { name: item.name, code: item.code, status: item.status };
    case 'courses':
      return {
        department_id: item.department_id,
        name: item.name,
        code: item.code,
        faculty_ids: item.faculty_ids || item.professors?.map(person => person.id) || [],
        status: item.status
      };
    default:
      return {};
  }
}

function rowLabel(section, item) {
  switch (section) {
    case 'years':
      return `${item.label} (${item.year_code})`;
    case 'semesters':
      return `${item.academic_year?.label || 'Academic year'} — ${item.label}`;
    case 'departments':
      return `${item.name} (${item.code})`;
    case 'courses':
      return `${item.name} (${item.code})`;
    default:
      return item.id;
  }
}

function AcademicFields({ section, form, data, errors, onChange }) {
  const field = (name, label, type = 'text', options = {}) => (
    <label className="academic-field" key={name}>
      <span>{label}</span>

      {type === 'select' ? (
        <select
          required={options.required !== false}
          value={form[name] ?? ''}
          aria-invalid={Boolean(errors[name])}
          onChange={event => onChange(name, event.target.value)}
        >
          <option value="">Select {label.toLowerCase()}</option>
          {options.items.map(item => (
            <option key={item.id} value={item.id}>
              {options.label(item)}
            </option>
          ))}
        </select>
      ) : (
        <input
          required={options.required !== false}
          type={type}
          min={options.min}
          max={options.max}
          step={options.step}
          maxLength={options.maxLength}
          value={form[name] ?? ''}
          aria-invalid={Boolean(errors[name])}
          onChange={event => onChange(name, event.target.value)}
        />
      )}

      {errors[name] && (
        <small className="field-error">{errors[name]}</small>
      )}
    </label>
  );

  return (
    <>
      {section === 'years' && (
        <>
          {field('year_code', 'Year code', 'text', { maxLength: 30 })}
          {field('label', 'Display label', 'text', { maxLength: 100 })}
          {field('start_date', 'Start date', 'date')}
          {field('end_date', 'End date', 'date')}
        </>
      )}

      {section === 'semesters' && (
        <>
          {field('academic_year_id', 'Academic year', 'select', {
            items: data.academic_years.filter(item => item.status === 'active'),
            label: item => `${item.label} (${item.year_code})`
          })}
          {field('semester_number', 'Semester number', 'number', {
            min: 1, max: 50, step: 1
          })}
          {field('label', 'Semester label', 'text', { maxLength: 100 })}
          {field('start_date', 'Start date', 'date')}
          {field('end_date', 'End date', 'date')}
        </>
      )}

      {section === 'departments' && (
        <>
          {field('name', 'Department name', 'text', { maxLength: 120 })}
          {field('code', 'Department code', 'text', { maxLength: 30 })}
        </>
      )}

      {section === 'courses' && (
        <>
          {field('department_id', 'Department', 'select', {
            items: data.departments.filter(item => item.status === 'active'),
            label: item => `${item.name} (${item.code})`
          })}

          {field('name', 'Course / program name', 'text', {
            maxLength: 120
          })}

          {field('code', 'Course code', 'text', { maxLength: 30 })}

          <label className="academic-field faculty-multiselect-field">
            <span>Professor(s)</span>
            <small className="academic-secondary">
              Select one or more active faculty members for this course.
            </small>

            <select
              multiple
              value={form.faculty_ids || []}
              aria-invalid={Boolean(errors.faculty_ids)}
              onChange={event => {
                onChange(
                  'faculty_ids',
                  Array.from(event.target.selectedOptions, option => option.value)
                );
              }}
              size={Math.min(
                6,
                Math.max(3, data.faculty.filter(item => item.status === 'active').length)
              )}
            >
              {data.faculty
                .filter(item => item.status === 'active')
                .map(person => (
                  <option key={person.id} value={person.id}>
                    {person.full_name} — {person.designation || 'Faculty'}
                    {person.faculty_code ? ` (${person.faculty_code})` : ''}
                  </option>
                ))}
            </select>

            <small className="academic-secondary">
              On Windows, hold Ctrl to select multiple professors.
            </small>

            {errors.faculty_ids && (
              <small className="field-error">{errors.faculty_ids}</small>
            )}
          </label>

          {Array.isArray(form.faculty_ids) && form.faculty_ids.length > 0 && (
            <div className="selected-professors">
              <strong>
                Selected professors ({form.faculty_ids.length})
              </strong>
              <div className="selected-professor-list">
                {form.faculty_ids.map(id => {
                  const person = data.faculty.find(item => item.id === id);
                  if (!person) return null;

                  return (
                    <span key={id} className="selected-professor-chip">
                      {person.full_name}
                      <button
                        type="button"
                        aria-label={`Remove ${person.full_name}`}
                        onClick={() => onChange(
                          'faculty_ids',
                          form.faculty_ids.filter(value => value !== id)
                        )}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {data.faculty.filter(item => item.status === 'active').length === 0 && (
            <div className="alert">
              No active faculty accounts are available. Create faculty accounts
              in Faculty Management first.
            </div>
          )}
        </>
      )}

      {Object.hasOwn(form, 'status') && (
        <label className="academic-field">
          <span>Status</span>
          <select
            value={form.status}
            onChange={event => onChange('status', event.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      )}
    </>
  );
}

export default function AdminAcademicManagement({ token }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [activeSection, setActiveSection] = useState('years');
  const [form, setForm] = useState(emptyForm('years'));
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState('');

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const result = await apiRequest('/academic', { token });
      setData({ ...EMPTY_DATA, ...result });
    } catch (e) {
      setError(e.message || 'Could not load academic management data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const section = SECTIONS.find(item => item.key === activeSection);
  const rows = data[section.dataKey] || [];

  function selectSection(key) {
    setActiveSection(key);
    setForm(emptyForm(key));
    setEditing(null);
    setFieldErrors({});
    setError('');
    setMessage('');
  }

  function changeField(name, value) {
    setForm(current => ({ ...current, [name]: value }));
    setFieldErrors(current => ({ ...current, [name]: '' }));
  }

  function startEdit(item) {
    setEditing(item);
    setForm(recordForm(activeSection, item));
    setFieldErrors({});
    setError('');
    setMessage('');
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm(activeSection));
    setFieldErrors({});
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setFieldErrors({});

    const payload = { ...form };

    try {
      await apiRequest(
        `/academic/${activeSection}${editing ? `/${editing.id}` : ''}`,
        {
          token,
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      setMessage(
        `${section.label} ${editing ? 'updated' : 'created'} successfully.`
      );
      setForm(emptyForm(activeSection));
      setEditing(null);
      await loadData({ silent: true });
    } catch (e) {
      setError(e.message || 'Could not save the academic record.');
      setFieldErrors(e.fields || {});
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(item) {
    const nextStatus = item.status === 'active' ? 'inactive' : 'active';

    if (
      nextStatus === 'inactive' &&
      !window.confirm(
        `Deactivate ${rowLabel(activeSection, item)}? Existing academic records will be retained.`
      )
    ) {
      return;
    }

    const payload = {
      ...recordForm(activeSection, item),
      status: nextStatus
    };

    setError('');
    setMessage('');

    try {
      await apiRequest(`/academic/${activeSection}/${item.id}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setMessage(
        `${section.label} ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`
      );
      await loadData({ silent: true });
    } catch (e) {
      setError(e.message || 'Could not update the record status.');
    }
  }

  return (
    <section className="panel academic-management">
      <div className="panel-heading">
        <div>
          <h2>Academic Management</h2>
          <p className="muted">
            Manage academic years, semesters, departments, courses, and assigned professors.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => loadData()}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}

      <nav className="academic-tabs" aria-label="Academic record types">
        {SECTIONS.map(item => (
          <button
            key={item.key}
            type="button"
            aria-current={activeSection === item.key ? 'page' : undefined}
            className={`academic-tab ${activeSection === item.key ? 'active' : ''}`}
            onClick={() => selectSection(item.key)}
          >
            {item.title}
          </button>
        ))}
      </nav>

      <div className="academic-content">
        <form className="academic-form" onSubmit={saveRecord}>
          <h3>
            {editing ? `Edit ${section.label}` : `Add ${section.label}`}
          </h3>

          <AcademicFields
            section={activeSection}
            form={form}
            data={data}
            errors={fieldErrors}
            onChange={changeField}
          />

          <div className="modal-actions">
            {editing && (
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={cancelEdit}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              className="primary-button admin-submit-button"
              disabled={saving || loading}
            >
              {saving ? (
                'Saving…'
              ) : editing ? (
                'Save changes'
              ) : (
                <>
                  <CirclePlus size={15} />
                  Create {section.label}
                </>
              )}
            </button>
          </div>
        </form>

        <section
          className="academic-records"
          aria-label={`${section.title} records`}
        >
          <h3>{section.title}</h3>

          {loading ? (
            <div className="empty-state">
              <RefreshCw size={22} />
              <span>Loading academic records…</span>
            </div>
          ) : rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    {activeSection === 'courses' && <th>Professor(s)</th>}
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(item => (
                    <tr key={item.id}>
                      <td>
                        <strong>{rowLabel(activeSection, item)}</strong>
                        {activeSection === 'courses' && item.department && (
                          <small className="academic-secondary">
                            {item.department.name} ({item.department.code})
                          </small>
                        )}
                      </td>

                      {activeSection === 'courses' && (
                        <td>
                          {item.professors?.length ? (
                            <div className="course-professor-list">
                              {item.professors.map(person => (
                                <span
                                  key={person.id}
                                  className="course-professor-chip"
                                >
                                  <Users size={13} />
                                  {person.full_name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="academic-secondary">
                              No professors assigned
                            </span>
                          )}
                        </td>
                      )}

                      <td>
                        <span
                          className={`status-pill ${item.status === 'active' ? 'active-status' : 'pending'}`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => startEdit(item)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={
                              item.status === 'active'
                                ? 'reject-button'
                                : 'approve-button'
                            }
                            onClick={() => toggleStatus(item)}
                          >
                            {item.status === 'active' ? 'Deactivate' : 'Reactivate'}
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
              <BookOpen size={24} />
              <strong>No {section.title.toLowerCase()} yet</strong>
              <span>
                Add actual university records here. No sample records are generated automatically.
              </span>
            </div>
          )}
        </section>
      </div>

      <div className="academic-model-note">
        <CalendarDays size={16} />
        <span>
          Each course can have multiple professors. Assignments are saved in Supabase
          and displayed in the assigned professors’ Faculty Dashboards.
        </span>
      </div>
    </section>
  );
}
