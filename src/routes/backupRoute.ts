import { Hono } from 'hono'

const databases = new Map<string, Map<string, Map<string, any>>>();
const backupRoute = new Hono()
backupRoute.get('/backup/:dbName', (c) => {
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

backupRoute.post('/backup/:dbName/restore', async (c) => {
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

backupRoute.get('/backup', (c) => {
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

backupRoute.delete('/backup/:dbName', (c) => {
  const { dbName } = c.req.param();
  
  const deleted = databases.delete(dbName);
  
  return c.json({
    success: deleted,
    database: dbName,
    timestamp: new Date().toISOString()
  });
});


export default backupRoute
