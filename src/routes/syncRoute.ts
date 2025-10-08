import { Hono } from 'hono'
const databases = new Map<string, Map<string, Map<string, any>>>();
const syncRoute = new Hono()
syncRoute.get('/sync/:dbName/:storeName', (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!databases.has(dbName)) {
    return c.json({ data: [] });
  }
  
  const db = databases.get(dbName)!;
  if (!db.has(storeName)) {
    return c.json({ data: [] });
  }
  
  const store = db.get(storeName);
  const data = Array.from(store.values());
  
  return c.json({ 
    data,
    count: data.length,
    timestamp: new Date().toISOString()
  });
});

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
  
  // Guardar cada item
  data.forEach(item => {
    const id = item.id || item.dni || item.ticketID;
    if (id) {
      store.set(id, item);
    }
  });
  
  return c.json({ 
    success: true,
    synced: data.length,
    timestamp: new Date().toISOString()
  });
});

syncRoute.put('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  
  if (!databases.has(dbName) || !databases.get(dbName)!.has(storeName)) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = databases.get(dbName)!.get(storeName)!;
  store.set(id, body);
  
  return c.json({ 
    success: true,
    data: body,
    timestamp: new Date().toISOString()
  });
});

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
export default syncRoute
