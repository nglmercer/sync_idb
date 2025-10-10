import { Hono } from 'hono';
import DefaultDB from '../modulos/DefautlDB';

const Databases = {
  DefautlDB: DefaultDB.my
};

const databases = new Map<string, Map<string, Map<string, any>>>();

const syncRoute = new Hono();

// Helper para añadir timestamps
const addTimestamps = (data: any, isUpdate: boolean = false) => {
  const now = new Date().toISOString();
  
  if (isUpdate && data.created_at) {
    return {
      ...data,
      updated_at: now
    };
  }
  
  return {
    ...data,
    created_at: data.created_at || now,
    updated_at: now
  };
};

// GET - Obtener todos los registros de un store
syncRoute.get('/sync/:dbName/:storeName', async (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ data: [] });
  }
  
  const resultQuery = await Databases[dbName].get(storeName);
  
  return c.json({
    data: resultQuery,
    count: resultQuery.length,
    timestamp: new Date().toISOString()
  });
});

// POST - Sincronizar múltiples registros (bulk)
syncRoute.post('/sync/:dbName/:storeName', async (c) => {
  const { dbName, storeName } = c.req.param();
  const body = await c.req.json();
  const { data } = body;
  
  if (!Array.isArray(data)) {
    return c.json({ error: 'Data must be an array' }, 400);
  }
  
  // Inicializar DB y store si no existen
  if (!databases.has(dbName)) {
    databases.set(dbName, new Map());
  }
  
  const db = databases.get(dbName)!;
  if (!db.has(storeName)) {
    db.set(storeName, new Map());
  }
  
  const store = db.get(storeName)!;
  let created = 0;
  let updated = 0;
  
  // Guardar cada item con timestamps
  data.forEach(item => {
    const id = item.id || item.dni || item.ticketID;
    if (id) {
      const exists = store.has(id);
      const timestampedItem = addTimestamps(item, exists);
      store.set(id, timestampedItem);
      
      if (exists) {
        updated++;
      } else {
        created++;
      }
    }
  });
  
  return c.json({
    success: true,
    synced: data.length,
    created,
    updated,
    timestamp: new Date().toISOString()
  });
});

// PUT - Actualizar o crear un registro específico
syncRoute.put('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  
  // Inicializar si no existe
  if (!databases.has(dbName)) {
    databases.set(dbName, new Map());
  }
  
  const db = databases.get(dbName)!;
  if (!db.has(storeName)) {
    db.set(storeName, new Map());
  }
  
  const store = db.get(storeName)!;
  const exists = store.has(id);
  const existing = exists ? store.get(id) : null;
  
  // Añadir timestamps preservando created_at si existe
  const timestampedData = addTimestamps(
    existing ? { ...existing, ...body } : body,
    exists
  );
  
  store.set(id, timestampedData);
  
  return c.json({
    success: true,
    action: exists ? 'updated' : 'created',
    data: timestampedData,
    timestamp: new Date().toISOString()
  });
});

// PATCH - Actualizar parcialmente un registro
syncRoute.patch('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  
  if (!databases.has(dbName) || !databases.get(dbName)!.has(storeName)) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = databases.get(dbName)!.get(storeName)!;
  
  if (!store.has(id)) {
    return c.json({ error: 'Record not found' }, 404);
  }
  
  const existing = store.get(id)!;
  const updated = addTimestamps({ ...existing, ...body }, true);
  
  store.set(id, updated);
  
  return c.json({
    success: true,
    action: 'patched',
    data: updated,
    timestamp: new Date().toISOString()
  });
});

// DELETE - Eliminar un registro
syncRoute.delete('/sync/:dbName/:storeName/:id', (c) => {
  const { dbName, storeName, id } = c.req.param();
  
  if (!databases.has(dbName) || !databases.get(dbName)!.has(storeName)) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = databases.get(dbName)!.get(storeName)!;
  const deleted = store.delete(id);
  
  return c.json({
    success: deleted,
    timestamp: new Date().toISOString()
  });
});

// GET - Obtener registros modificados después de una fecha
syncRoute.get('/sync/:dbName/:storeName/since/:timestamp', (c) => {
  const { dbName, storeName, timestamp } = c.req.param();
  
  if (!databases.has(dbName) || !databases.get(dbName)!.has(storeName)) {
    return c.json({ data: [], count: 0 });
  }
  
  const store = databases.get(dbName)!.get(storeName)!;
  const sinceDate = new Date(timestamp);
  
  const results = Array.from(store.values()).filter(item => {
    return new Date(item.updated_at) > sinceDate;
  });
  
  return c.json({
    data: results,
    count: results.length,
    timestamp: new Date().toISOString()
  });
});

// GET - Estadísticas de un store
syncRoute.get('/sync/:dbName/:storeName/stats', (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!databases.has(dbName) || !databases.get(dbName)!.has(storeName)) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = databases.get(dbName)!.get(storeName)!;
  const items = Array.from(store.values());
  
  const now = Date.now();
  const last24h = items.filter(item => 
    now - new Date(item.updated_at).getTime() < 24 * 60 * 60 * 1000
  ).length;
  
  const last7d = items.filter(item => 
    now - new Date(item.updated_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;
  
  return c.json({
    total: items.length,
    updatedLast24h: last24h,
    updatedLast7d: last7d,
    oldestRecord: items.reduce((oldest, item) => {
      return !oldest || new Date(item.created_at) < new Date(oldest.created_at) ? item : oldest;
    }, null as any)?.created_at,
    newestRecord: items.reduce((newest, item) => {
      return !newest || new Date(item.created_at) > new Date(newest.created_at) ? item : newest;
    }, null as any)?.created_at,
    timestamp: new Date().toISOString()
  });
});

export default syncRoute;