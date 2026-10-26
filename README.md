# University Automation System — Starter Project

Stack: React + Vite + CSS, Node.js + Express, Supabase Auth + PostgreSQL.

## Important
- This is a starter implementation, not a complete production system.
- Never put a Supabase `service_role` key in the frontend.
- Do not commit `.env` files. Only `.env.example` is included.
- The first Admin must be provisioned securely as described below.
- Student self-signup requires a name, email, and password. The account remains pending until an Admin approves it; approval generates and links the Student ID and student record.

## Requirements
- Node.js 20+ recommended
- A Supabase project

## 1. Configure Supabase
1. Create a Supabase project.
2. Open **Project Settings → API** (or API Keys, depending on dashboard version).
3. Copy the Project URL and publishable/anon key for the frontend.
4. Copy the service-role/secret key for the backend only. Keep it private.
5. In Supabase Auth settings, configure the allowed site URL and redirect URLs for your local frontend (usually `http://localhost:5173`).
6. Enable email confirmation if desired for account email verification. Email verification is separate from university enrollment verification.

## 2. Set up database
- Open Supabase SQL Editor.
- Run `supabase/migrations/001_initial_schema.sql`.
- Review `supabase/migrations/002_rls_policies.sql` and run it.
- Run `supabase/migrations/003_student_id_sequence.sql` to enable concurrency-safe Student ID generation.
- If Student ID generation is unavailable or the sequence is behind existing IDs, run the idempotent repair migration `supabase/migrations/005_student_code_generator_repair.sql`.
- Run `supabase/migrations/004_student_email_unique.sql` to prevent duplicate student email addresses, ignoring case and surrounding whitespace.
- Run `supabase/migrations/007_atomic_student_approval.sql` to enable transactional Admin approval and student record creation.
- Review `supabase/migrations/008_academic_management.sql` against the deployed schema and back up the database before applying it manually. It is not applied by the application or build.
- `006_pending_student_id_correction.sql` is retained as migration history because it may already have been applied. Do not apply it on a new installation. Migration 007 safely removes its obsolete correction RPC if present and leaves any existing profile Student ID uniqueness index intact. Do not delete migration 006 or manually reverse its database changes.
- Create the first Admin account through Supabase Auth, then follow the controlled provisioning instructions in `docs/ADMIN_SETUP.md`.
- Do not make Admin provisioning publicly accessible.

## 3. Configure environment files
Copy:
- `frontend/.env.example` to `frontend/.env`
- `backend/.env.example` to `backend/.env`

Fill in the values locally. See `docs/CONFIGURATION.md` for exactly where each value goes.

## 4. Install and run
Open two terminals.

### Backend
```bash
cd backend
npm install
npm run dev
```
Backend default: `http://localhost:4000`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend default: `http://localhost:5173`

## Current starter functionality
- Student sign-up and login using Supabase Auth
- Pending student verification state
- Authenticated API requests to Express
- Admin/Student role-aware dashboard shell
- Student dashboard with linked Student ID, account status, assigned course/department when present, and profile-request count
- Student profile view with a phone-only personal detail update; official identity and academic assignments remain read-only
- Courses & Subjects view sourced from the student's assigned course and its active subjects; this is not semester enrollment
- Student navigation for Dashboard, Profile, Courses & Subjects, Timetable, Attendance, and Academic Calendar
- Clear data-unavailable states for modules without a real source in the current schema
- Admin list of pending registrations and approve/reject workflow
- Automatic Student ID generation and student-record linking when an Admin approves a pending registration
- Admin Management page for active Admins to create additional Admin accounts
- Student Management with paginated search, academic filters, generated IDs, editing, and deactivation
- Admin Academic Management for academic years, semesters, departments, courses, subjects, and semester-specific subject offerings
- Forward-only academic schema foundation for student-semester enrollment and future faculty-offering assignments
- Basic student/faculty/department/course/subject/assignment API foundations
- Initial PostgreSQL schema and RLS policies
- Timetable, enrollment, attendance, academic calendar, exam schedule, and announcement records are not currently modeled; corresponding student views remain empty until a reviewed data source is added
- CSV import/export and CRUD screens for other modules are not yet implemented; those belong to later phases.

## Suggested build sequence
1. Verify Supabase setup and authentication.
2. Verify Admin provisioning and pending-registration review.
3. Add CRUD screens and APIs.
4. Add academic structure and assignments.
5. Add correction requests, CSV import/export, reports, audit views, and tests.
