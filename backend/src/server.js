import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, isAllowedOrigin } from './config.js';
import routes from './routes.js';

const app = express();
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  console.error(`[api] ${req.method} ${req.path} failed:`, err?.message || 'unknown error');
  res.status(500).json({ error: 'Unexpected server error.' });
});

const server = app.listen(config.port, () => {
  console.log(`University Automation API listening on http://localhost:${config.port}`);
  if (config.supabaseUrl && config.serviceRoleKey) {
    console.log('[config] Backend Supabase URL and service key are configured.');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${config.port} is already in use. Stop the existing CampusFlow backend before starting another instance.`);
  } else {
    console.error('[startup] Could not start the API server:', error.message);
  }
  process.exitCode = 1;
});
