# Phase status

## Implemented
- Supabase schema and baseline RLS policies
- Student signup/login and pending-verification UI
- Express token verification and role/active-student checks
- Admin student registration review with atomic Student ID generation
- Admin student and Admin management screens
- Admin Academic Management for academic years, semesters, departments, courses, subjects, and semester-specific subject offerings
- Forward-only migration proposal for academic years, semesters, subject offerings, student-semester enrollment, and future faculty assignment linkage; migration 008 is not applied
- Student dashboard and navigation with real linked identity and academic placement data
- Student profile view and phone-only profile update
- Courses & Subjects view for the assigned course, explicitly distinguished from semester enrollment
- Empty states for timetable, attendance, and academic calendar while no real data source exists

## Data- or workflow-blocked
- Timetable and academic calendar: no corresponding schema/data source
- Attendance and correction submissions/review: no attendance records or authorized correction workflow
- Semester enrollment: no student-to-course/subject enrollment relationship
- Admin student placement remains department/course only; new semester enrollment has no Admin API/UI yet
- Exams, results, and official announcements: no supporting schema or data source
- Password recovery: no in-app recovery workflow

## Not complete
- Faculty role and authorized faculty workflows
- Remaining correction-request submission/review workflow
- CSV processing, reports, and full audit coverage
- Production-grade automated tests, deployment configuration, and security review

Do not deploy this starter publicly until the remaining authorization, data, operational, and security gaps are reviewed and tested.
