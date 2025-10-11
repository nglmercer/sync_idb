// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { upgradeWebSocket } from 'hono/bun';
import { websocket } from 'hono/bun';
import { notificationManager } from './websocket/notificationManager';
import backupRoute from './routes/backupRoute';
import syncRoute from './routes/syncRoute';
import wsRouter from './websocket/wsRouter';
import type { StockUpdate, StockAddition, StockSubtraction } from './types/stock';

const app = new Hono();

// Middlewares
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:4321', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
// WebSocket endpoint
app.get('/ws', upgradeWebSocket(() => {
  let clientId: string;

  return {
    onOpen(_evt, ws) {
      clientId = notificationManager.addConnection(ws);
    },
    onMessage(evt, _ws) {
      const message = evt.data.toString();
      console.log("📩 Mensaje recibido:", message);
    },
    onClose(_evt, _ws) {
      notificationManager.removeConnection(clientId);
    },
    onError(evt, _ws) {
      console.error('❌ Error en WebSocket:', evt);
      notificationManager.removeConnection(clientId);
    }
  };
}));
app.get('/', (c) => c.json({ message: 'API is running' }));
// Otras rutas
app.route('/api', backupRoute);
app.route('/api', syncRoute);
app.route('/api', wsRouter);
// Error handlers
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
export {app}
export default {
  fetch: app.fetch,
  websocket
};