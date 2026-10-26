# Secure first Admin provisioning

This starter intentionally does not include public Admin signup or a route that lets users promote themselves.

1. Create an account for the trusted Admin using Supabase Auth, or invite the trusted Admin through the Supabase dashboard.
2. Confirm the Admin's `auth.users.id` UUID in Supabase.
3. In SQL Editor, insert/update a `profiles` row for that UUID with `role = 'admin'` and `account_status = 'active'`. Example (replace the UUID with the actual one):

```sql
insert into public.profiles (id, role, account_status, full_name)
values ('REPLACE-WITH-AUTH-USER-UUID', 'admin', 'active', 'System Administrator')
on conflict (id) do update
set role = 'admin', account_status = 'active';
```

4. Never use a UUID from an untrusted signup. Verify the account belongs to the intended administrator.
5. Remove or secure any temporary admin credentials used during setup.

This is a manual, controlled setup step for the first Admin; it is not part of public signup.

After the first Admin is active, they can create additional Admin accounts from **Admin Management → Add Admin** in CampusFlow. The backend verifies the caller's active Admin profile, creates the Auth user with the private service-role client, and assigns the active Admin profile. Deliver temporary passwords through a secure channel. No schema migration is required.
