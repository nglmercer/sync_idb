// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { websocket,upgradeWebSocket } from 'hono/bun'
import backupRoute from './routes/backupRoute';
import syncRoute from './routes/syncRoute';

const app = new Hono();

const connections = new Set<any>();

app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:4321', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.get('/ws', upgradeWebSocket((c) => {
  return {
    onOpen(evt, ws) {
      console.log('Cliente conectado');
      connections.add(ws);
    },
    onMessage(evt, ws) {
      // Opcional: Puedes recibir mensajes pero no hacer nada con ellos
      console.log('Mensaje recibido (ignorado):', evt.data);
    },
    onClose(evt, ws) {
      console.log('Cliente desconectado');
      connections.delete(ws);
    },
    onError(evt, ws) {
      console.error('Error en WebSocket:', evt);
      connections.delete(ws);
    }
  };
}));
app.route('/api', backupRoute);
app.route('/api', syncRoute);

export function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  
  connections.forEach((ws) => {
    try {
      ws.send(message);
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      connections.delete(ws);
    }
  });
  
  console.log(`Broadcast enviado a ${connections.size} clientes:`, event);
}

app.post('/ws/broadcast', async (c) => {
  const body = await c.req.json();
  const { event, data } = body;
  
  if (!event) {
    return c.json({ error: 'Event name is required' }, 400);
  }
  
  broadcast(event, data);
  
  return c.json({
    success: true,
    event,
    sentTo: connections.size
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

// Ejemplo: Emitir eventos automáticamente cada X tiempo (opcional)
// setInterval(() => {
//   broadcast('sync', { action: 'check_updates' });
// }, 30000);

export default {
  fetch: app.fetch,
  websocket
};