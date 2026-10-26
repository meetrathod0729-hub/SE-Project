import { supabaseAdmin } from '../supabase.js';

export async function requireAuth(req, res, next) {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Backend Supabase configuration is missing.' });
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
      const status = Number(error.status);
      if (status === 401 || status === 403) {
        return res.status(401).json({ error: 'Invalid or expired Supabase access token.' });
      }
      console.error(`[auth] Supabase token validation failed (status ${status || 'unknown'}).`);
      return res.status(502).json({ error: 'Could not validate the Supabase access token.' });
    }
    if (!user) return res.status(401).json({ error: 'Invalid or expired Supabase access token.' });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, account_status, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[auth] Could not load the authenticated user profile.');
      return res.status(500).json({ error: 'Could not load account profile.' });
    }
    if (!profile) return res.status(404).json({ error: 'Account profile not found. Contact an administrator.' });

    req.user = user;
    req.profile = profile;
    next();
  } catch (error) {
    console.error('[auth] Authentication middleware failed:', error?.message || 'unknown error');
    return res.status(500).json({ error: 'Authentication check failed.' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.profile || req.profile.role !== 'admin' || req.profile.account_status !== 'active') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

export async function requireFaculty(req, res, next) {
  if (!req.profile || req.profile.role !== 'faculty' || req.profile.account_status !== 'active') {
    return res.status(403).json({ error: 'Active faculty access required.' });
  }
  try {
    const { data: faculty, error } = await supabaseAdmin.from('faculty')
      .select('id, status').eq('profile_id', req.user.id).maybeSingle();
    if (error) {
      console.error('[auth] Could not verify the linked faculty record.');
      return res.status(500).json({ error: 'Could not verify faculty account status.' });
    }
    if (!faculty || faculty.status !== 'active') {
      return res.status(403).json({ error: 'Active faculty record required.' });
    }
    req.faculty = faculty;
    next();
  } catch (error) {
    console.error('[auth] Faculty record authorization failed:', error?.message || 'unknown error');
    return res.status(500).json({ error: 'Could not verify faculty account status.' });
  }
}

export async function requireVerifiedStudent(req, res, next) {
  if (!req.profile || req.profile.role !== 'student' || req.profile.account_status !== 'active') {
    return res.status(403).json({ error: 'Verified student access required.' });
  }
  try {
    const { data: student, error } = await supabaseAdmin.from('students')
      .select('id, status')
      .eq('profile_id', req.user.id)
      .maybeSingle();
    if (error) {
      console.error('[auth] Could not verify the linked student record.');
      return res.status(500).json({ error: 'Could not verify student account status.' });
    }
    if (!student || student.status !== 'active') {
      return res.status(403).json({ error: 'Active student record required.' });
    }
    next();
  } catch (error) {
    console.error('[auth] Student record authorization failed:', error?.message || 'unknown error');
    return res.status(500).json({ error: 'Could not verify student account status.' });
  }
}
