import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentProfileHandlers } from '../src/student-profile.js';

function createSupabaseMock(responses = {}) {
  const calls = [];
  const queues = Object.fromEntries(
    Object.entries(responses).map(([table, values]) => [table, [...values]])
  );

  return {
    calls,
    from(table) {
      const call = { table, filters: [], operation: 'select', payload: null };
      calls.push(call);
      const result = (queues[table] || []).shift() || { data: null, error: null };
      const builder = {
        select(columns) {
          call.columns = columns;
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        order(column, options) {
          call.order = [column, options];
          return Promise.resolve(result);
        },
        update(payload) {
          call.operation = 'update';
          call.payload = payload;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(result);
        }
      };
      return builder;
    }
  };
}

test('student profile lookup scopes the student and requests to the authenticated profile', async () => {
  const supabase = createSupabaseMock({
    students: [{ data: {
      id: 'student-1',
      profile_id: 'profile-1',
      course: { id: 'course-1', subjects: [] }
    }, error: null }],
    profile_correction_requests: [{ data: [{ id: 'request-1', status: 'pending' }], error: null }]
  });

  const result = await createStudentProfileHandlers(supabase).get('profile-1');

  assert.equal(result.status, 200);
  assert.equal(result.body.student.pending_profile_requests[0].id, 'request-1');
  assert.deepEqual(supabase.calls[0].filters, [['profile_id', 'profile-1']]);
  assert.deepEqual(supabase.calls[1].filters, [
    ['student_id', 'student-1'],
    ['status', 'pending']
  ]);
});

test('student phone update writes only the authenticated student record phone field', async () => {
  const supabase = createSupabaseMock({
    students: [{ data: { phone: '+1 555 0100' }, error: null }]
  });

  const result = await createStudentProfileHandlers(supabase)
    .updatePhone('profile-1', { phone: ' +1 555 0100 ' });

  assert.equal(result.status, 200);
  assert.equal(supabase.calls[0].payload.phone, '+1 555 0100');
  assert.ok(supabase.calls[0].payload.updated_at);
  assert.deepEqual(Object.keys(supabase.calls[0].payload).sort(), ['phone', 'updated_at']);
  assert.deepEqual(supabase.calls[0].filters, [['profile_id', 'profile-1']]);
});

test('student phone update rejects restricted fields and invalid phone values without writing', async () => {
  const supabase = createSupabaseMock();
  const handlers = createStudentProfileHandlers(supabase);

  const restricted = await handlers.updatePhone('profile-1', {
    phone: '555-0100',
    student_code: 'STU000001',
    status: 'inactive'
  });
  const invalid = await handlers.updatePhone('profile-1', { phone: 'x'.repeat(41) });

  assert.equal(restricted.status, 400);
  assert.equal(invalid.status, 400);
  assert.equal(supabase.calls.length, 0);
});

test('student profile lookup reports missing records and request-query failures explicitly', async () => {
  const missingStudent = createSupabaseMock({
    students: [{ data: null, error: null }]
  });
  const requestsFailure = createSupabaseMock({
    students: [{ data: { id: 'student-1' }, error: null }],
    profile_correction_requests: [{ data: null, error: { message: 'query failed' } }]
  });

  const missingResult = await createStudentProfileHandlers(missingStudent).get('profile-1');
  const errorResult = await createStudentProfileHandlers(requestsFailure).get('profile-1');

  assert.equal(missingResult.status, 404);
  assert.equal(requestsFailure.calls.length, 2);
  assert.equal(errorResult.status, 500);
  assert.equal(errorResult.body.error, 'Could not load student profile requests.');
});
