// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

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

app.get('/', (c) => {
  return c.json({ 
    status: 'ok', 
    message: 'Generic IndexedDB Sync Server',
    timestamp: new Date().toISOString()
  });
});


app.get('/api/sync/:dbName/:storeName', (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!databases.has(dbName)) {
    return c.json({ data: [] });
  }
  
  const db = databases.get(dbName)!;
  if (!db.has(storeName)) {
    return c.json({ data: [] });
  }
  
  const store = db.get(storeName)!;
  const data = Array.from(store.values());
  
  return c.json({ 
    data,
    count: data.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/sync/:dbName/:storeName', async (c) => {
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

app.put('/api/sync/:dbName/:storeName/:id', async (c) => {
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

app.delete('/api/sync/:dbName/:storeName/:id', (c) => {
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


app.get('/api/backup/:dbName', (c) => {
  const { dbName } = c.req.param();
  
  if (!databases.has(dbName)) {
    return c.json({ error: 'Database not found' }, 404);
  }
  
  const db = databases.get(dbName)!;
  const backup: Record<string, any[]> = {};
  
  db.forEach((store, storeName) => {
    backup[storeName] = Array.from(store.values());
  });
  
  return c.json({
    database: dbName,
    backup,
    timestamp: new Date().toISOString(),
    stores: Object.keys(backup),
    totalRecords: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0)
  });
});

app.post('/api/backup/:dbName/restore', async (c) => {
  const { dbName } = c.req.param();
  const body = await c.req.json();
  const { backup, overwrite = false } = body;
  
  if (!backup || typeof backup !== 'object') {
    return c.json({ error: 'Invalid backup format' }, 400);
  }
  
  // Si overwrite es true, limpiar la DB primero
  if (overwrite && databases.has(dbName)) {
    databases.delete(dbName);
  }
  
  // Crear o obtener la DB
  if (!databases.has(dbName)) {
    databases.set(dbName, new Map());
  }
  
  const db = databases.get(dbName)!;
  let totalRestored = 0;
  
  // Restaurar cada store
  Object.entries(backup).forEach(([storeName, items]) => {
    if (!db.has(storeName)) {
      db.set(storeName, new Map());
    }
    
    const store = db.get(storeName)!;
    
    if (Array.isArray(items)) {
      items.forEach(item => {
        const id = item.id || item.dni || item.ticketID;
        if (id) {
          store.set(id, item);
          totalRestored++;
        }
      });
    }
  });
  
  return c.json({
    success: true,
    database: dbName,
    restored: totalRestored,
    stores: Object.keys(backup),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/backup', (c) => {
  const backups = Array.from(databases.keys()).map(dbName => {
    const db = databases.get(dbName)!;
    const stores: Record<string, number> = {};
    
    db.forEach((store, storeName) => {
      stores[storeName] = store.size;
    });
    
    return {
      database: dbName,
      stores,
      totalRecords: Object.values(stores).reduce((sum, count) => sum + count, 0)
    };
  });
  
  return c.json({
    backups,
    count: backups.length,
    timestamp: new Date().toISOString()
  });
});

app.delete('/api/backup/:dbName', (c) => {
  const { dbName } = c.req.param();
  
  const deleted = databases.delete(dbName);
  
  return c.json({
    success: deleted,
    database: dbName,
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