import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacultyHandlers } from '../src/faculty.js';

function mockDatabase(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        eq(column, value) { call.filters.push([column, value]); return builder; },
        order() { return Promise.resolve(results[table]?.shift() || { data: [], error: null }); },
        maybeSingle() { return Promise.resolve(results[table]?.shift() || { data: null, error: null }); }
      };
      return builder;
    }
  };
}

test('faculty dashboard is scoped to the authenticated linked faculty record', async () => {
  const db = mockDatabase({
    faculty: [{ data: { id: 'faculty-1', faculty_code: 'FAC001', full_name: 'A Faculty', status: 'active' }, error: null }],
    faculty_subject_assignments: [{ data: [{ id: 'assignment-1', status: 'active' }], error: null }]
  });
  const result = await createFacultyHandlers(db).dashboard('profile-1');
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls[0].filters, [['profile_id', 'profile-1'], ['status', 'active']]);
  assert.deepEqual(db.calls[1].filters, [['faculty_id', 'faculty-1'], ['status', 'active']]);
});

test('faculty dashboard reports an unlinked account without loading assignments', async () => {
  const db = mockDatabase({ faculty: [{ data: null, error: null }] });
  const result = await createFacultyHandlers(db).dashboard('profile-1');
  assert.equal(result.status, 404);
  assert.equal(db.calls.length, 1);
});
