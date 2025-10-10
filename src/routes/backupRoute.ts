import { Hono } from 'hono';

const databases = new Map<string, Map<string, Map<string, any>>>();

const backupRoute = new Hono();

// GET - Hacer backup de una base de datos completa
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
    totalRecords: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0),
    metadata: {
      version: '1.0',
      created_at: new Date().toISOString()
    }
  });
});

// POST - Restaurar backup
backupRoute.post('/backup/:dbName/restore', async (c) => {
  const { dbName } = c.req.param();
  const body = await c.req.json();
  const { backup, overwrite = false, mergeStrategy = 'newer' } = body;
 
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
  let totalSkipped = 0;
  let totalUpdated = 0;
 
  // Restaurar cada store
  Object.entries(backup).forEach(([storeName, items]) => {
    if (!db.has(storeName)) {
      db.set(storeName, new Map());
    }
   
    const store = db.get(storeName)!;
   
    if (Array.isArray(items)) {
      items.forEach(item => {
        const id = item.id || item.dni || item.ticketID;
        if (!id) return;

        const existing = store.get(id);
        
        if (!existing) {
          // Nuevo registro
          store.set(id, item);
          totalRestored++;
        } else {
          // Registro existente - aplicar estrategia de merge
          if (mergeStrategy === 'newer') {
            const existingDate = new Date(existing.updated_at || existing.created_at || 0);
            const itemDate = new Date(item.updated_at || item.created_at || 0);
            
            if (itemDate > existingDate) {
              store.set(id, item);
              totalUpdated++;
            } else {
              totalSkipped++;
            }
          } else if (mergeStrategy === 'force') {
            store.set(id, item);
            totalUpdated++;
          } else {
            // 'skip' - no hacer nada
            totalSkipped++;
          }
        }
      });
    }
  });
 
  return c.json({
    success: true,
    database: dbName,
    restored: totalRestored,
    updated: totalUpdated,
    skipped: totalSkipped,
    stores: Object.keys(backup),
    timestamp: new Date().toISOString()
  });
});

// GET - Listar todos los backups disponibles
backupRoute.get('/backup', (c) => {
  const backups = Array.from(databases.keys()).map(dbName => {
    const db = databases.get(dbName)!;
    const stores: Record<string, { count: number, oldest?: string, newest?: string }> = {};
   
    db.forEach((store, storeName) => {
      const items = Array.from(store.values());
      const oldest = items.reduce((old, item) => {
        const itemDate = new Date(item.created_at || 0);
        return !old || itemDate < new Date(old) ? item.created_at : old;
      }, null as string | null);
      
      const newest = items.reduce((newItem, item) => {
        const itemDate = new Date(item.created_at || 0);
        return !newItem || itemDate > new Date(newItem) ? item.created_at : newItem;
      }, null as string | null);
      
      stores[storeName] = {
        count: store.size,
        oldest: oldest || undefined,
        newest: newest || undefined
      };
    });
   
    return {
      database: dbName,
      stores,
      totalRecords: Object.values(stores).reduce((sum, store) => sum + store.count, 0)
    };
  });
 
  return c.json({
    backups,
    count: backups.length,
    timestamp: new Date().toISOString()
  });
});

// DELETE - Eliminar una base de datos
backupRoute.delete('/backup/:dbName', (c) => {
  const { dbName } = c.req.param();
 
  const deleted = databases.delete(dbName);
 
  return c.json({
    success: deleted,
    database: dbName,
    timestamp: new Date().toISOString()
  });
});

// GET - Backup incremental (solo cambios después de una fecha)
backupRoute.get('/backup/:dbName/incremental/:since', (c) => {
  const { dbName, since } = c.req.param();
  
  if (!databases.has(dbName)) {
    return c.json({ error: 'Database not found' }, 404);
  }
  
  const db = databases.get(dbName)!;
  const sinceDate = new Date(since);
  const backup: Record<string, any[]> = {};
  
  db.forEach((store, storeName) => {
    const items = Array.from(store.values()).filter(item => {
      const updatedAt = new Date(item.updated_at || item.created_at || 0);
      return updatedAt > sinceDate;
    });
    
    if (items.length > 0) {
      backup[storeName] = items;
    }
  });
  
  return c.json({
    database: dbName,
    backup,
    incremental: true,
    since,
    timestamp: new Date().toISOString(),
    stores: Object.keys(backup),
    totalRecords: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0)
  });
});

// POST - Comparar backup con estado actual
backupRoute.post('/backup/:dbName/compare', async (c) => {
  const { dbName } = c.req.param();
  const body = await c.req.json();
  const { backup } = body;
  
  if (!databases.has(dbName)) {
    return c.json({ error: 'Database not found' }, 404);
  }
  
  const db = databases.get(dbName)!;
  const comparison: Record<string, {
    onlyInBackup: number;
    onlyInCurrent: number;
    different: number;
    same: number;
  }> = {};
  
  // Comparar cada store
  Object.entries(backup).forEach(([storeName, items]) => {
    const store = db.get(storeName);
    const stats = {
      onlyInBackup: 0,
      onlyInCurrent: 0,
      different: 0,
      same: 0
    };
    
    if (!store) {
      stats.onlyInBackup = (items as any[]).length;
    } else {
      (items as any[]).forEach(item => {
        const id = item.id || item.dni || item.ticketID;
        const current = store.get(id);
        
        if (!current) {
          stats.onlyInBackup++;
        } else {
          const backupDate = new Date(item.updated_at || item.created_at || 0);
          const currentDate = new Date(current.updated_at || current.created_at || 0);
          
          if (backupDate.getTime() !== currentDate.getTime()) {
            stats.different++;
          } else {
            stats.same++;
          }
        }
      });
      
      // Contar items que solo están en current
      store.forEach((value, key) => {
        const inBackup = (items as any[]).some(item => 
          (item.id || item.dni || item.ticketID) === key
        );
        if (!inBackup) {
          stats.onlyInCurrent++;
        }
      });
    }
    
    comparison[storeName] = stats;
  });
  
  return c.json({
    database: dbName,
    comparison,
    timestamp: new Date().toISOString()
  });
});

export default backupRoute;