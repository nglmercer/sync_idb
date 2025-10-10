import { Hono } from 'hono';
import BackupManager from '../modulos/BackupManager';

const databases = new Map<string, Map<string, Map<string, any>>>();
const backupManager = new BackupManager();

const backupRoute = new Hono();

// GET - Hacer backup de una base de datos completa y guardarlo en archivo
backupRoute.get('/backup/:dbName', async (c) => {
  const { dbName } = c.req.param();
  const { autoSave = 'true' } = c.req.query();
 
  if (!databases.has(dbName)) {
    return c.json({ error: 'Database not found' }, 404);
  }
  
  const db = databases.get(dbName)!;
  const backup: Record<string, any[]> = {};
  
  db.forEach((store, storeName) => {
    backup[storeName] = Array.from(store.values());
  });

  // Guardar automáticamente en archivo si autoSave es true
  let savedMetadata = null;
  if (autoSave === 'true') {
    savedMetadata = await backupManager.saveBackup(dbName, backup, 'full');
  }
  
  return c.json({
    database: dbName,
    backup,
    timestamp: new Date().toISOString(),
    stores: Object.keys(backup),
    totalRecords: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0),
    saved: autoSave === 'true',
    backupId: savedMetadata?.id,
    metadata: {
      version: '1.0',
      created_at: new Date().toISOString()
    }
  });
});

// POST - Crear backup manualmente con opciones personalizadas
backupRoute.post('/backup/:dbName/create', async (c) => {
  const { dbName } = c.req.param();
  const body = await c.req.json();
  const { stores = null, type = 'full' } = body;
 
  if (!databases.has(dbName)) {
    return c.json({ error: 'Database not found' }, 404);
  }
  
  const db = databases.get(dbName)!;
  const backup: Record<string, any[]> = {};
  
  // Si se especifican stores, solo respaldar esos
  const storesToBackup = stores || Array.from(db.keys());
  
  storesToBackup.forEach((storeName: string) => {
    if (db.has(storeName)) {
      backup[storeName] = Array.from(db.get(storeName)!.values());
    }
  });

  const savedMetadata = await backupManager.saveBackup(dbName, backup, type);
  
  return c.json({
    success: true,
    backupId: savedMetadata.id,
    metadata: savedMetadata,
    timestamp: new Date().toISOString()
  });
});

// POST - Restaurar backup desde archivo
backupRoute.post('/backup/:backupId/restore', async (c) => {
  const { backupId } = c.req.param();
  const body = await c.req.json();
  const { 
    overwrite = false, 
    mergeStrategy = 'newer',
    targetDbName = null 
  } = body;
 
  // Cargar backup desde archivo
  const backupData = await backupManager.loadBackup(backupId);
  
  if (!backupData) {
    return c.json({ error: 'Backup not found' }, 404);
  }

  const dbName = targetDbName || backupData.metadata.database;
  const backup = backupData.backup;
 
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
          store.set(id, item);
          totalRestored++;
        } else {
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
            totalSkipped++;
          }
        }
      });
    }
  });
 
  return c.json({
    success: true,
    backupId,
    database: dbName,
    restored: totalRestored,
    updated: totalUpdated,
    skipped: totalSkipped,
    stores: Object.keys(backup),
    timestamp: new Date().toISOString()
  });
});

// GET - Listar todos los backups guardados
backupRoute.get('/backup', async (c) => {
  const { database } = c.req.query();
  
  const backups = await backupManager.listBackups(database);
  
  return c.json({
    backups,
    count: backups.length,
    timestamp: new Date().toISOString()
  });
});

// GET - Obtener información detallada de un backup
backupRoute.get('/backup/:backupId/info', async (c) => {
  const { backupId } = c.req.param();
  
  const backupData = await backupManager.loadBackup(backupId);
  
  if (!backupData) {
    return c.json({ error: 'Backup not found' }, 404);
  }
  
  return c.json({
    metadata: backupData.metadata,
    storeDetails: Object.entries(backupData.backup).map(([storeName, items]) => ({
      name: storeName,
      count: items.length,
      sampleData: items.slice(0, 3) // Mostrar algunos registros de ejemplo
    })),
    timestamp: new Date().toISOString()
  });
});

// DELETE - Eliminar un backup guardado
backupRoute.delete('/backup/:backupId', async (c) => {
  const { backupId } = c.req.param();
 
  const deleted = await backupManager.deleteBackup(backupId);
 
  return c.json({
    success: deleted,
    backupId,
    timestamp: new Date().toISOString()
  });
});

// DELETE - Limpiar backups antiguos
backupRoute.delete('/backup/:dbName/cleanup', async (c) => {
  const { dbName } = c.req.param();
  const { keepLast = '5' } = c.req.query();
  
  const deleted = await backupManager.deleteOldBackups(dbName, parseInt(keepLast));
  
  return c.json({
    success: true,
    database: dbName,
    deleted,
    kept: parseInt(keepLast),
    timestamp: new Date().toISOString()
  });
});

// GET - Backup incremental y guardarlo
backupRoute.get('/backup/:dbName/incremental/:since', async (c) => {
  const { dbName, since } = c.req.param();
  const { autoSave = 'true' } = c.req.query();
  
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

  // Guardar backup incremental
  let savedMetadata = null;
  if (autoSave === 'true') {
    savedMetadata = await backupManager.saveBackup(dbName, backup, 'incremental', since);
  }
  
  return c.json({
    database: dbName,
    backup,
    incremental: true,
    since,
    timestamp: new Date().toISOString(),
    stores: Object.keys(backup),
    totalRecords: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0),
    saved: autoSave === 'true',
    backupId: savedMetadata?.id
  });
});

// POST - Comparar backup con estado actual
backupRoute.post('/backup/:backupId/compare', async (c) => {
  const { backupId } = c.req.param();
  
  const backupData = await backupManager.loadBackup(backupId);
  
  if (!backupData) {
    return c.json({ error: 'Backup not found' }, 404);
  }

  const dbName = backupData.metadata.database;
  const backup = backupData.backup;
  
  if (!databases.has(dbName)) {
    return c.json({ error: 'Database not found in memory' }, 404);
  }
  
  const db = databases.get(dbName)!;
  const comparison: Record<string, {
    onlyInBackup: number;
    onlyInCurrent: number;
    different: number;
    same: number;
  }> = {};
  
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
    backupId,
    database: dbName,
    comparison,
    timestamp: new Date().toISOString()
  });
});

// GET - Estadísticas de backups
backupRoute.get('/backup/stats', async (c) => {
  const { database } = c.req.query();
  
  const stats = await backupManager.getBackupStats(database);
  
  return c.json({
    ...stats,
    totalSizeFormatted: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
    timestamp: new Date().toISOString()
  });
});

// POST - Exportar backup a una ruta específica
backupRoute.post('/backup/:backupId/export', async (c) => {
  const { backupId } = c.req.param();
  const body = await c.req.json();
  const { exportPath } = body;
  
  if (!exportPath) {
    return c.json({ error: 'Export path is required' }, 400);
  }
  
  const success = await backupManager.exportBackup(backupId, exportPath);
  
  return c.json({
    success,
    backupId,
    exportPath,
    timestamp: new Date().toISOString()
  });
});

// POST - Importar backup desde archivo externo
backupRoute.post('/backup/import', async (c) => {
  const body = await c.req.json();
  const { importPath, targetDbName = null } = body;
  
  if (!importPath) {
    return c.json({ error: 'Import path is required' }, 400);
  }
  
  const metadata = await backupManager.importBackup(importPath, targetDbName);
  
  if (!metadata) {
    return c.json({ error: 'Failed to import backup' }, 500);
  }
  
  return c.json({
    success: true,
    backupId: metadata.id,
    metadata,
    timestamp: new Date().toISOString()
  });
});

export default backupRoute;