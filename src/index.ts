// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import backupRoute from './routes/backupRoute';
import syncRoute from './routes/syncRoute';

const app = new Hono();

const databases = new Map<string, Map<string, Map<string, any>>>();

app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: ['http://localhost:3000','http://localhost:4321', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.route('/api', syncRoute)
app.route('/api', backupRoute)

app.get('/', (c) => {
  return c.json({ 
    status: 'ok', 
    message: 'Generic IndexedDB Sync Server',
    timestamp: new Date().toISOString()
  });
});

app.notFound((c) => {
  return c.json({ 
    error: 'Not Found',
    path: c.req.path,
    method: c.req.method
  }, 404);
});

app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message
  }, 500);
});

const port = process.env.PORT || 3001;
export default app