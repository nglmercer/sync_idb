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
stockWsManager.setValidator(async (event, data) => {
  // Aquí puedes validar contra tu base de datos
  // Ejemplo básico:
  
  if (event === 'stock:update' || event === 'stock:sync') {
    const updates = data as StockUpdate[];
    
    // Validar que los productos existen y el stock es válido
    for (const update of updates) {
      if (update.stock < 0) {
        return {
          valid: false,
          error: `Stock negativo no permitido para producto ${update.productId}`
        };
      }
      
      // TODO: Verificar en BD que el producto existe
      // const product = await db.products.findById(update.productId);
      // if (!product) {
      //   return { valid: false, error: `Producto ${update.productId} no encontrado` };
      // }
    }
  }

  if (event === 'stock:subtract') {
    const subtractions = data as StockSubtraction[];
    
    // Validar que hay suficiente stock
    for (const sub of subtractions) {
      // TODO: Verificar stock actual en BD
      // const currentStock = await db.products.getStock(sub.productId);
      // if (currentStock < sub.quantity) {
      //   return { valid: false, error: `Stock insuficiente para producto ${sub.productId}` };
      // }
    }
  }

  // Si todo está bien, retornar valid: true
  return { valid: true };
});

// WebSocket endpoint
app.get('/ws', upgradeWebSocket(() => {
  let clientId: string;

  return {
    onOpen(_evt, ws) {
      clientId = stockWsManager.addConnection(ws);
    },
    onMessage(evt, _ws) {
      // Los clientes pueden enviar mensajes para actualizar stock
      const message = evt.data.toString();
      stockWsManager.handleMessage(message, clientId);
    },
    onClose(_evt, _ws) {
      stockWsManager.removeConnection(clientId);
    },
    onError(evt, _ws) {
      console.error('❌ Error en WebSocket:', evt);
      stockWsManager.removeConnection(clientId);
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