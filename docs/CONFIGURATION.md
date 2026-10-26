# Configuration: Where to add keys and URLs

## Frontend — `frontend/.env`
Copy `frontend/.env.example` to `frontend/.env`.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
VITE_API_BASE_URL=http://localhost:4000/api
```

Where to find the values:
- `VITE_SUPABASE_URL`: Supabase Dashboard → Project Settings → API.
- `VITE_SUPABASE_ANON_KEY`: same page; use the publishable/anon key only.
- `VITE_API_BASE_URL`: local Express URL while developing. Change this to the deployed backend API URL after deployment.

These frontend values are visible in the browser by design. Never put the service-role key here.

## Backend — `backend/.env`
Copy `backend/.env.example` to `backend/.env`.

```env
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_SERVICE_ROLE_OR_SECRET_KEY
```

Where to find the values:
- `SUPABASE_URL`: Supabase Dashboard → Project Settings → API.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API Keys. Use the private service-role/secret key only on the backend.
- `FRONTEND_ORIGIN`: exact trusted frontend origin(s), comma-separated if needed. During local development, Express also allows only `http://localhost` and `http://127.0.0.1` Vite origins on ports 5173–5199, so Vite can select an available port. This local-port allowance is disabled in production; set the deployed frontend origin explicitly.
- `PORT`: local backend port, normally 4000.

The service-role key can bypass Row Level Security. It must be private, stored only in backend environment variables or the hosting provider's secret manager, and never committed to GitHub or placed in frontend code.

## If a key was exposed
Rotate it in Supabase immediately and update the backend environment variable.

## Auth redirect settings
In Supabase Dashboard → Authentication → URL Configuration, set:
- Site URL: `http://localhost:5173`
- Redirect URL: `http://localhost:5173/**` (or the specific callback path used by your configuration)

For deployment, add the real frontend URL too.

## No API key needed for this starter
There is no separate OpenAI/Gemini/Mistral API key in this starter. It uses Supabase only. Add an external AI key only if a future approved feature requires an AI provider.
