import { Hono } from 'hono';
import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";

const PointSalesPath = path.join(process.cwd(), "./PointSales.json");

interface TimestampedData {
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

const Databases = {
  PointSales: new DataStorage<TimestampedData>(new JSONFileAdapter(PointSalesPath)),
};

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
    return c.json({ data: [], message: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const data = await db.load(storeName);
  console.log(" data:", data,storeName,dbName);
  if (!data) {
    return c.json({ data: [], count: 0, timestamp: new Date().toISOString() });
  }
  
  return c.json({
    data: data,
    count: 1,
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
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  
  // Guardar los datos con timestamps
  const timestampedData = {
    data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  await db.save(storeName, timestampedData as any);
  
  return c.json({
    success: true,
    synced: data.length,
    created: data.length,
    updated: 0,
    timestamp: new Date().toISOString()
  });
});

// PUT - Actualizar o crear un registro específico
syncRoute.put('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName] as DataStorage<TimestampedData>;
  
  // Cargar datos existentes
  const storeData = await db.load(storeName);
  const store = storeData && typeof storeData === 'object' ? storeData : {};
  
  const exists = store.hasOwnProperty(id);
  const existing = exists ? store[id] : null;
  
  // Añadir timestamps preservando created_at si existe
  const timestampedData = addTimestamps(
    existing ? { ...existing, ...body } : body,
    exists
  );
  
  store[id] = timestampedData;
  
  // Guardar el store actualizado
  await db.save(storeName, store as any);
  
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
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData || typeof storeData !== 'object') {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  if (!storeData.hasOwnProperty(id)) {
    return c.json({ error: 'Record not found' }, 404);
  }
  
  const existing = storeData[id];
  const updated = addTimestamps({ ...existing, ...body }, true);
  
  storeData[id] = updated;
  await db.save(storeName, storeData as any);
  
  return c.json({
    success: true,
    action: 'patched',
    data: updated,
    timestamp: new Date().toISOString()
  });
});

// DELETE - Eliminar un registro
syncRoute.delete('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData || typeof storeData !== 'object') {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const deleted = delete storeData[id];
  
  if (deleted) {
    await db.save(storeName, storeData as any);
  }
  
  return c.json({
    success: deleted,
    timestamp: new Date().toISOString()
  });
});

// GET - Obtener registros modificados después de una fecha
syncRoute.get('/sync/:dbName/:storeName/since/:timestamp', async (c) => {
  const { dbName, storeName, timestamp } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ data: [], count: 0 });
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData || typeof storeData !== 'object') {
    return c.json({ data: [], count: 0 });
  }
  
  const sinceDate = new Date(timestamp);
  
  const results = Object.values(storeData).filter((item: any) => {
    return item.updated_at && new Date(item.updated_at) > sinceDate;
  });
  
  return c.json({
    data: results,
    count: results.length,
    timestamp: new Date().toISOString()
  });
});

// GET - Estadísticas de un store
syncRoute.get('/sync/:dbName/:storeName/stats', async (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData || typeof storeData !== 'object') {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const items = Object.values(storeData) as TimestampedData[];
  
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