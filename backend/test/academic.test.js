import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAcademicRouter } from '../src/academic.js';

const YEAR_ID = '11111111-1111-4111-8111-111111111111';
const SEMESTER_ID = '22222222-2222-4222-8222-222222222222';
const DEPARTMENT_ID = '33333333-3333-4333-8333-333333333333';
const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const SUBJECT_ID = '55555555-5555-4555-8555-555555555555';

function createDatabaseMock({ responses = {}, handler } = {}) {
  const calls = [];
  const queues = Object.fromEntries(Object.entries(responses).map(([table, results]) => [table, [...results]]));
  return {
    calls,
    from(table) {
      const call = { table, operation: 'select', filters: [], payload: null };
      calls.push(call);
      const builder = {
        select(columns) {
          call.columns = columns;
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        limit(value) {
          call.limit = value;
          return builder;
        },
        order(column, options) {
          call.order = [column, options];
          return builder;
        },
        insert(payload) {
          call.operation = 'insert';
          call.payload = payload;
          return builder;
        },
        update(payload) {
          call.operation = 'update';
          call.payload = payload;
          return builder;
        },
        single() {
          return Promise.resolve(result());
        },
        maybeSingle() {
          return Promise.resolve(result());
        },
        then(resolve, reject) {
          return Promise.resolve(result()).then(resolve, reject);
        }
      };
      function result() {
        if (handler) return handler(call);
        return queues[table]?.shift() || { data: null, error: null };
      }
      return builder;
    }
  };
}

async function withServer(database, { authorized = true } = {}, callback) {
  const app = express();
  app.use(express.json());
  app.use('/academic', createAcademicRouter(database, {
    requireAuthMiddleware(_req, _res, next) { next(); },
    requireAdminMiddleware(_req, res, next) {
      if (!authorized) return res.status(403).json({ error: 'Admin access required.' });
      next();
    }
  }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/academic`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('academic routes require the authentication and admin middleware before writes', async () => {
  const db = createDatabaseMock();
  await withServer(db, { authorized: false }, async baseUrl => {
    const response = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Engineering', code: 'ENG' })
    });
    assert.equal(response.status, 403);
    assert.equal(db.calls.length, 0);
  });
});

test('academic year creation validates dates and normalizes year code', async () => {
  const db = createDatabaseMock({ handler: call => ({ data: call.payload, error: null }) });
  await withServer(db, {}, async baseUrl => {
    const invalid = await fetch(`${baseUrl}/years`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year_code: '2026-27', label: '2026–2027', start_date: '2026-02-30', end_date: '2027-01-01' })
    });
    assert.equal(invalid.status, 400);
    assert.equal(db.calls.length, 0);

    const valid = await fetch(`${baseUrl}/years`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ year_code: ' 2026-27 ', label: '2026-2027', start_date: '2026-08-01', end_date: '2027-07-31' })
    });
    assert.equal(valid.status, 201);
    assert.equal(db.calls[0].payload.year_code, '2026-27');
  });
});

test('academic APIs map duplicate constraints to conflict responses', async () => {
  const db = createDatabaseMock({ handler: () => ({ data: null, error: { code: '23505' } }) });
  await withServer(db, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Engineering', code: 'eng' })
    });
    assert.equal(response.status, 409);
  });
});

test('academic updates do not write record IDs into update payloads', async () => {
  const db = createDatabaseMock({ handler: call => ({ data: call.payload, error: null }) });
  await withServer(db, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/departments/${DEPARTMENT_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Engineering', code: 'ENG', status: 'active' })
    });
    assert.equal(response.status, 200);
    assert.equal(db.calls[0].operation, 'update');
    assert.equal(Object.hasOwn(db.calls[0].payload, 'id'), false);
  });
});

test('course deactivation is blocked while active subjects remain', async () => {
  const db = createDatabaseMock({
    handler: call => {
      if (call.table === 'departments') return { data: { id: DEPARTMENT_ID, status: 'active' }, error: null };
      if (call.table === 'subjects') return { data: { id: SUBJECT_ID }, error: null };
      return { data: null, error: null };
    }
  });
  await withServer(db, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/courses/${COURSE_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ department_id: DEPARTMENT_ID, name: 'Engineering', code: 'ENG', status: 'inactive' })
    });
    assert.equal(response.status, 409);
    assert.ok(db.calls.some(call => call.table === 'subjects'
      && call.filters.some(([column, value]) => column === 'course_id' && value === COURSE_ID)));
  });
});

test('semester dates must be valid and fall within the selected academic year', async () => {
  const db = createDatabaseMock({
    responses: { academic_years: [{ data: { id: YEAR_ID, start_date: '2026-08-01', end_date: '2027-07-31', status: 'active' }, error: null }] }
  });
  await withServer(db, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/semesters`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ academic_year_id: YEAR_ID, semester_number: 1, label: 'Semester 1', start_date: '2026-07-01', end_date: '2026-12-31' })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /within the selected academic year/);
  });
});

test('courses and subjects validate existing foreign-key relationships', async () => {
  const noDepartment = createDatabaseMock({ responses: { departments: [{ data: null, error: null }] } });
  const noCourse = createDatabaseMock({ responses: { courses: [{ data: null, error: null }] } });

  await withServer(noDepartment, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ department_id: DEPARTMENT_ID, name: 'Engineering', code: 'ENG' })
    });
    assert.equal(response.status, 400);
  });
  await withServer(noCourse, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/subjects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ course_id: COURSE_ID, name: 'Mathematics', code: 'MATH101', credits: 4 })
    });
    assert.equal(response.status, 400);
  });
});

test('subject offerings reject a subject belonging to a different course', async () => {
  const db = createDatabaseMock({
    responses: {
      semesters: [{ data: { id: SEMESTER_ID, status: 'active' }, error: null }],
      courses: [{ data: { id: COURSE_ID, status: 'active' }, error: null }],
      subjects: [{ data: { id: SUBJECT_ID, course_id: DEPARTMENT_ID, status: 'active' }, error: null }]
    }
  });

  await withServer(db, {}, async baseUrl => {
    const response = await fetch(`${baseUrl}/offerings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ semester_id: SEMESTER_ID, course_id: COURSE_ID, subject_id: SUBJECT_ID })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /belong to the selected course/);
  });
});
