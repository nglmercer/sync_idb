import type { StockUpdate, StockAddition, StockSubtraction } from '../types/stock';
import { stockWsManager } from './stockManager';
import { Hono } from 'hono';
const stockRouter = new Hono();
// API endpoints para disparar actualizaciones de stock
stockRouter.post('/stock/update', async (c) => {
  try {
    const body = await c.req.json<{ updates: StockUpdate[] }>();
    
    if (!body.updates || !Array.isArray(body.updates)) {
      return c.json({ error: 'Se requiere un array "updates"' }, 400);
    }

    const result = stockWsManager.broadcastStockUpdate(body.updates);

    return c.json({
      success: result.success,
      sentTo: result.sentTo,
      updates: body.updates.length
    });
  } catch (error) {
    return c.json({ error: 'Formato de datos inválido' }, 400);
  }
});

stockRouter.post('/stock/add', async (c) => {
  try {
    const body = await c.req.json<{ additions: StockAddition[] }>();
    
    if (!body.additions || !Array.isArray(body.additions)) {
      return c.json({ error: 'Se requiere un array "additions"' }, 400);
    }

    const result = stockWsManager.broadcastStockAddition(body.additions);

    return c.json({
      success: result.success,
      sentTo: result.sentTo,
      additions: body.additions.length
    });
  } catch (error) {
    return c.json({ error: 'Formato de datos inválido' }, 400);
  }
});

stockRouter.post('/stock/subtract', async (c) => {
  try {
    const body = await c.req.json<{ subtractions: StockSubtraction[] }>();
    
    if (!body.subtractions || !Array.isArray(body.subtractions)) {
      return c.json({ error: 'Se requiere un array "subtractions"' }, 400);
    }

    const result = stockWsManager.broadcastStockSubtraction(body.subtractions);

    return c.json({
      success: result.success,
      sentTo: result.sentTo,
      subtractions: body.subtractions.length
    });
  } catch (error) {
    return c.json({ error: 'Formato de datos inválido' }, 400);
  }
});

stockRouter.post('/stock/sync', async (c) => {
  try {
    const body = await c.req.json<{ stockData: StockUpdate[] }>();
    
    if (!body.stockData || !Array.isArray(body.stockData)) {
      return c.json({ error: 'Se requiere un array "stockData"' }, 400);
    }

    const result = stockWsManager.broadcastStockSync(body.stockData);

    return c.json({
      success: result.success,
      sentTo: result.sentTo,
      items: body.stockData.length
    });
  } catch (error) {
    return c.json({ error: 'Formato de datos inválido' }, 400);
  }
});

// Status endpoint
stockRouter.get('/stock/status', (c) => {
  return c.json({
    connectedClients: stockWsManager.getConnectionCount(),
    timestamp: new Date().toISOString()
  });
});
export default stockRouter;