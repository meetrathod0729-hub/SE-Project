import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentVerificationHandlers } from '../src/student-verification.js';
import { requireAdmin } from '../src/middleware/auth.js';

function createSupabaseMock({ responses = {}, authUsers = {}, rpcResponses = {}, rpcImplementation } = {}) {
  const calls = [];
  const rpcCalls = [];
  const queues = Object.fromEntries(
    Object.entries(responses).map(([table, tableResponses]) => [table, [...tableResponses]])
  );

  return {
    calls,
    rpcCalls,
    auth: {
      admin: {
        async getUserById(id) {
          calls.push({ table: 'auth.users', operation: 'getUserById', id });
          return authUsers[id] || { data: { user: null }, error: null };
        }
      }
    },
    async rpc(name, parameters) {
      rpcCalls.push({ name, parameters });
      if (rpcImplementation) return rpcImplementation(name, parameters);
      return rpcResponses[name] || { data: null, error: null };
    },
    from(table) {
      const call = { table, filters: [], operation: 'select', payload: null };
      calls.push(call);
      const queue = queues[table] || [];
      const result = queue.shift() || { data: null, error: null };
      const builder = {
        select(columns) {
          call.columns = columns;
          return builder;
        },
        eq(column, value) {
          call.filters.push(['eq', column, value]);
          return builder;
        },
        in(column, values) {
          call.filters.push(['in', column, values]);
          return builder;
        },
        is(column, value) {
          call.filters.push(['is', column, value]);
          return builder;
        },
        limit(value) {
          call.limit = value;
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
        insert(payload) {
          call.operation = 'insert';
          call.payload = payload;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(result);
        },
        then(resolve, reject) {
          return Promise.resolve(result).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

test('pending registrations include email looked up from Supabase Auth', async () => {
  const supabase = createSupabaseMock({
    responses: {
      profiles: [{ data: [{
        id: 'profile-1',
        full_name: 'Student One',
        student_code: null,
        account_status: 'pending_verification',
        created_at: '2026-01-01'
      }], error: null }]
    },
    authUsers: {
      'profile-1': { data: { user: { id: 'profile-1', email: 'student1@example.edu' } }, error: null }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).listPending();

  assert.equal(result.status, 200);
  assert.equal(result.body.registrations[0].email, 'student1@example.edu');
  assert.equal(result.body.registrations[0].student_code, null);
});

test('signup validation accepts name and email without a Student ID', async () => {
  const supabase = createSupabaseMock();
  const result = await createStudentVerificationHandlers(supabase).validateSignup({
    email: 'Student@Example.edu',
    full_name: 'Student Example'
  });

  assert.deepEqual(result, { status: 200, body: { valid: true } });
  assert.equal(supabase.calls.length, 0);
});

test('signup validation continues to reject missing names and malformed emails', async () => {
  const handler = createStudentVerificationHandlers(createSupabaseMock());
  const missingName = await handler.validateSignup({ email: 'student@example.edu' });
  const invalidEmail = await handler.validateSignup({ full_name: 'Student', email: 'bad-email' });

  assert.equal(missingName.status, 400);
  assert.ok(missingName.body.fields.full_name);
  assert.equal(invalidEmail.status, 400);
  assert.ok(invalidEmail.body.fields.email);
});

test('approval atomically returns the generated Student ID from the database operation', async () => {
  const supabase = createSupabaseMock({
    rpcResponses: {
      approve_pending_student_registration: {
        data: { result: 'approved', student_code: 'STU000003' },
        error: null
      }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'approve',
    'admin-profile'
  );

  assert.deepEqual(result, {
    status: 200,
    body: { success: true, status: 'active', student_code: 'STU000003' }
  });
  assert.deepEqual(supabase.rpcCalls, [{
    name: 'approve_pending_student_registration',
    parameters: { p_profile_id: 'pending-profile', p_actor_id: 'admin-profile' }
  }]);
  assert.equal(supabase.calls.length, 0);
});

test('repeated approval cannot return another generated Student ID', async () => {
  let approved = false;
  let generatedIdCount = 0;
  const supabase = createSupabaseMock({
    rpcImplementation: async () => {
      if (approved) return { data: { result: 'not_pending' }, error: null };
      approved = true;
      generatedIdCount += 1;
      return { data: { result: 'approved', student_code: 'STU000003' }, error: null };
    }
  });
  const handler = createStudentVerificationHandlers(supabase);

  const first = await handler.review('pending-profile', 'approve', 'admin-profile');
  const second = await handler.review('pending-profile', 'approve', 'admin-profile');

  assert.equal(first.body.student_code, 'STU000003');
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already been reviewed/);
  assert.equal(generatedIdCount, 1);
});

test('concurrent repeated approval of one profile generates a single student record', async () => {
  let approved = false;
  let generatedIdCount = 0;
  const supabase = createSupabaseMock({
    rpcImplementation: async () => {
      if (approved) return { data: { result: 'not_pending' }, error: null };
      approved = true;
      generatedIdCount += 1;
      return { data: { result: 'approved', student_code: 'STU000003' }, error: null };
    }
  });
  const handler = createStudentVerificationHandlers(supabase);

  const results = await Promise.all([
    handler.review('pending-profile', 'approve', 'admin-profile'),
    handler.review('pending-profile', 'approve', 'admin-profile')
  ]);

  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 1);
  assert.equal(generatedIdCount, 1);
});

test('concurrent approvals receive distinct sequence-generated Student IDs', async () => {
  let nextId = 3;
  const supabase = createSupabaseMock({
    rpcImplementation: async (_name, { p_profile_id: profileId }) => ({
      data: {
        result: 'approved',
        student_code: `STU${String(nextId++).padStart(6, '0')}`,
        profile_id: profileId
      },
      error: null
    })
  });
  const handler = createStudentVerificationHandlers(supabase);

  const results = await Promise.all([
    handler.review('pending-profile-a', 'approve', 'admin-profile'),
    handler.review('pending-profile-b', 'approve', 'admin-profile')
  ]);

  assert.deepEqual(results.map(result => result.body.student_code), ['STU000003', 'STU000004']);
  assert.equal(new Set(results.map(result => result.body.student_code)).size, 2);
});

test('approval reports a transaction failure without falling back to partial writes', async () => {
  const supabase = createSupabaseMock({
    rpcResponses: {
      approve_pending_student_registration: {
        data: null,
        error: { code: '40001', message: 'transaction failed' }
      }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'approve',
    'admin-profile'
  );

  assert.equal(result.status, 500);
  assert.match(result.body.error, /No changes were committed/);
  assert.equal(supabase.calls.length, 0);
  assert.equal(supabase.rpcCalls.length, 1);
});

test('approval rejects missing, non-student, and already-reviewed profiles', async t => {
  const outcomes = [
    ['registration_not_found', 404, /not found/i],
    ['profile_not_student', 404, /pending student registration/i],
    ['not_pending', 409, /already been reviewed/i]
  ];

  for (const [outcome, status, message] of outcomes) {
    await t.test(outcome, async () => {
      const supabase = createSupabaseMock({
        rpcResponses: {
          approve_pending_student_registration: { data: { result: outcome }, error: null }
        }
      });
      const result = await createStudentVerificationHandlers(supabase).review(
        'target-profile',
        'approve',
        'admin-profile'
      );

      assert.equal(result.status, status);
      assert.match(result.body.error, message);
    });
  }
});

test('approval does not update or relink an existing student record', async () => {
  const supabase = createSupabaseMock({
    rpcResponses: {
      approve_pending_student_registration: { data: { result: 'student_record_exists' }, error: null }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'approve',
    'admin-profile'
  );

  assert.equal(result.status, 409);
  assert.match(result.body.error, /already linked/i);
  assert.equal(supabase.calls.some(call => call.table === 'students'), false);
});

test('approval refuses a duplicate email rather than changing an existing student record', async () => {
  const supabase = createSupabaseMock({
    rpcResponses: {
      approve_pending_student_registration: { data: { result: 'student_email_exists' }, error: null }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'approve',
    'admin-profile'
  );

  assert.equal(result.status, 409);
  assert.match(result.body.error, /avoid creating a duplicate/i);
  assert.equal(supabase.calls.some(call => call.table === 'students'), false);
});

test('approval requires the pending profile to have a full name', async () => {
  const supabase = createSupabaseMock({
    rpcResponses: {
      approve_pending_student_registration: { data: { result: 'full_name_missing' }, error: null }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'approve',
    'admin-profile'
  );

  assert.equal(result.status, 400);
  assert.match(result.body.error, /no full name/i);
});

test('approval requires an active Admin according to the atomic database check', async () => {
  const supabase = createSupabaseMock({
    rpcResponses: {
      approve_pending_student_registration: { data: { result: 'admin_not_active' }, error: null }
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'approve',
    'inactive-admin'
  );

  assert.equal(result.status, 403);
  assert.match(result.body.error, /Active Admin/);
});

test('requires active Admin access', () => {
  const req = { profile: { role: 'student', account_status: 'active' } };
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;

  requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Admin access required/);
  assert.equal(nextCalled, false);
});

test('rejection remains a separate pending-profile action with an audit record', async () => {
  const supabase = createSupabaseMock({
    responses: {
      profiles: [
        { data: { id: 'pending-profile', role: 'student', account_status: 'pending_verification' }, error: null },
        { data: { id: 'pending-profile' }, error: null }
      ],
      audit_logs: [{ data: null, error: null }]
    }
  });

  const result = await createStudentVerificationHandlers(supabase).review(
    'pending-profile',
    'reject',
    'admin-profile'
  );

  assert.deepEqual(result, { status: 200, body: { success: true, status: 'rejected' } });
  const profileUpdate = supabase.calls.find(call => call.table === 'profiles' && call.operation === 'update');
  assert.equal(profileUpdate.payload.account_status, 'rejected');
  assert.equal(supabase.rpcCalls.length, 0);
  assert.ok(supabase.calls.some(call => call.table === 'audit_logs' && call.operation === 'insert'));
});
