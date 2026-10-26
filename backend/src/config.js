import 'dotenv/config';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingSupabaseConfig = required.filter(key => !process.env[key]);
if (missingSupabaseConfig.length) {
  console.warn(`[config] Missing required backend settings: ${missingSupabaseConfig.join(', ')}.`);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  allowLocalViteOrigins: process.env.NODE_ENV !== 'production',
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};

export function isAllowedOrigin(origin) {
  if (!origin || config.frontendOrigins.includes(origin)) return true;
  if (!config.allowLocalViteOrigins) return false;

  try {
    const url = new URL(origin);
    const isLocalHost = ['localhost', '127.0.0.1'].includes(url.hostname);
    const port = Number(url.port);
    return url.protocol === 'http:' && isLocalHost && port >= 5173 && port <= 5199;
  } catch {
    return false;
  }
}
