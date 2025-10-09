// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { upgradeWebSocket } from 'hono/bun';
import { websocket } from 'hono/bun';
import { stockWsManager } from './websocket/stockManager';
import backupRoute from './routes/backupRoute';
import syncRoute from './routes/syncRoute';
import stockRouter from './websocket/stockRouter';

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
app.get('/ws/stock', upgradeWebSocket(() => {
  return {
    onOpen(_evt, ws) {
      stockWsManager.addConnection(ws);
    },
    onMessage(evt, _ws) {
      // Los clientes solo reciben actualizaciones, no envían mensajes
      console.log('⚠️  Mensaje recibido pero ignorado:', evt.data);
    },
    onClose(_evt, ws) {
      stockWsManager.removeConnection(ws);
    },
    onError(evt, ws) {
      console.error('❌ Error en WebSocket:', evt);
      stockWsManager.removeConnection(ws);
    }
  };
}));

// Otras rutas
app.route('/api', backupRoute);
app.route('/api', syncRoute);
app.route('/api', stockRouter);
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

export default {
  fetch: app.fetch,
  websocket
};

// Ejemplo de uso desde código:
// stockWsManager.broadcastStockUpdate([
//   { productId: 1, stock: 50 },
//   { productId: 2, stock: 30 }
// ]);
//
// stockWsManager.broadcastStockAddition([
//   { productId: 1, quantity: 10 }
// ]);
//
// stockWsManager.broadcastStockSubtraction([
//   { productId: 1, quantity: 5 }
// ]);