import type { StockUpdate, StockAddition, StockSubtraction } from '../types/stock';
import { notificationManager } from './notificationManager';
import { Hono } from 'hono';
const wsRouter = new Hono();
// API endpoints para disparar actualizaciones de stock
wsRouter.post('/ws/broadcast', async (c) => {
  const body = await c.req.json();
  const { event, data } = body;

  if (!event || !data) {
    return c.json({ error: 'Se requieren "event" y "data"' }, 400);
  }

  const result = notificationManager.broadcastAll(event, data);
  
  return c.json({
    success: true,
    message: `Broadcast enviado a ${result.sentTo} clientes`,
    ...result
  });
});
export default wsRouter;