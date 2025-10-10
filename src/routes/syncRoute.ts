// src/routes/syncRoute.ts
import { Hono } from 'hono';
import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";
import mergeManager from '../modulos/MergeManager';
import { notificationManager } from '../websocket/notificationManager';

const PointSalesPath = path.join(process.cwd(), "./PointSales.json");

interface TimestampedData {
  created_at: string;
  updated_at: string;
  synced_at?: string;
  version?: number;
  client_id?: string;
  [key: string]: any;
}

interface SyncConflictLog {
  timestamp: string;
  storeName: string;
  conflicts: any[];
  resolved: boolean;
}

const Databases = {
  PointSales: new DataStorage<TimestampedData>(new JSONFileAdapter(PointSalesPath)),
};

const conflictLogs: SyncConflictLog[] = [];
const MAX_CONFLICT_LOGS = 100;

const syncRoute = new Hono();

// ============================================
// HELPER: Broadcast de cambios por WebSocket
// ============================================

const broadcastChange = (storeName: string, action: string, data: any) => {
  // Emitir evento de sincronización a todos los clientes
  notificationManager.broadcast('sync:change', {
    storeName,
    action,
    item: data,
    timestamp: new Date().toISOString()
  });
  
  console.log(`📡 Broadcasted ${action} on ${storeName} to all clients`);
};

const broadcastStockUpdate = (updates: any[]) => {
  notificationManager.broadcast('stock:update', updates);
  console.log(`📡 Broadcasted stock updates: ${updates.length} items`);
};

// Helper para añadir timestamps y versión
const addTimestamps = (data: any, isUpdate: boolean = false, clientId?: string) => {
  const now = new Date().toISOString();
  
  const baseData = {
    ...data,
    updated_at: now,
    synced_at: now,
    client_id: clientId || data.client_id || 'unknown'
  };
  
  if (isUpdate && data.created_at) {
    return {
      ...baseData,
      version: (data.version || 0) + 1
    };
  }
  
  return {
    ...baseData,
    created_at: data.created_at || now,
    version: data.version || 1
  };
};

const logConflicts = (storeName: string, conflicts: any[]) => {
  if (conflicts.length > 0) {
    conflictLogs.unshift({
      timestamp: new Date().toISOString(),
      storeName,
      conflicts,
      resolved: true
    });
    
    if (conflictLogs.length > MAX_CONFLICT_LOGS) {
      conflictLogs.length = MAX_CONFLICT_LOGS;
    }
  }
};

// ============================================
// GET - Obtener todos los registros
// ============================================
syncRoute.get('/sync/:dbName/:storeName', async (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ data: [], message: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const data = await db.load(storeName);
  
  if (!data) {
    return c.json({ data: [], count: 0, timestamp: new Date().toISOString() });
  }
  
  const dataArray = data.data || (Array.isArray(data) ? data : Object.values(data));
  
  return c.json({
    data: dataArray,
    count: Array.isArray(dataArray) ? dataArray.length : 1,
    timestamp: new Date().toISOString(),
    version: data.version || 1
  });
});

// ============================================
// POST - Sincronizar múltiples registros
// ============================================
syncRoute.post('/sync/:dbName/:storeName', async (c) => {
  const { dbName, storeName } = c.req.param();
  const body = await c.req.json();
  const { 
    data: incomingData, 
    clientId = 'unknown',
    strategy = 'field-level-merge',
    idField = 'id'
  } = body;
  
  if (!Array.isArray(incomingData)) {
    return c.json({ error: 'Data must be an array' }, 400);
  }
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  
  // Cargar datos existentes
  const existingData = await db.load(storeName);
  let localArray: any[] = [];
  
  if (existingData) {
    if (existingData.data && Array.isArray(existingData.data)) {
      localArray = existingData.data;
    } else if (Array.isArray(existingData)) {
      localArray = existingData;
    } else if (typeof existingData === 'object') {
      localArray = Object.values(existingData);
    }
  }
  
  // Hacer merge de arrays con detección de conflictos
  const { merged, conflicts } = mergeManager.mergeArrays(
    localArray,
    incomingData,
    idField,
    { strategy: strategy as any }
  );
  
  // Añadir timestamps a todos los registros
  const timestampedData = merged.map(item => 
    addTimestamps(item, !!item.created_at, clientId)
  );
  
  // Guardar datos mergeados
  const dataToSave = {
    data: timestampedData,
    created_at: existingData?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: (existingData?.version || 0) + 1,
    last_sync_client: clientId
  };
  
  await db.save(storeName, dataToSave as any);
  
  // Registrar conflictos si los hay
  logConflicts(storeName, conflicts);
  
  // 🔥 BROADCAST: Notificar a todos los clientes sobre los cambios
  if (timestampedData.length > 0) {
    broadcastChange(storeName, 'bulk-update', {
      count: timestampedData.length,
      items: timestampedData
    });
  }
  
  return c.json({
    success: true,
    synced: incomingData.length,
    created: timestampedData.length - localArray.length,
    updated: Math.min(localArray.length, incomingData.length),
    conflicts: conflicts.length,
    conflictReport: conflicts.length > 0 ? mergeManager.generateConflictReport(conflicts) : null,
    merged: timestampedData,
    timestamp: new Date().toISOString(),
    version: dataToSave.version
  });
});

// ============================================
// PUT - Actualizar o crear un registro individual
// ============================================
syncRoute.put('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  const { clientId = 'unknown' } = body;
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName] as DataStorage<TimestampedData>;
  
  // Cargar datos existentes
  const storeData = await db.load(storeName);
  let store: any = {};
  
  if (storeData) {
    if (storeData.data && typeof storeData.data === 'object') {
      store = storeData.data;
    } else if (typeof storeData === 'object' && !Array.isArray(storeData)) {
      store = storeData;
    }
  }
  
  const exists = store.hasOwnProperty(id);
  const existing = exists ? store[id] : null;
  
  let mergedData = body;
  let hadConflict = false;
  
  // Si existe, hacer merge inteligente
  if (existing) {
    const hasConflict = mergeManager.hasConflict(existing, body);
    
    if (hasConflict) {
      // Merge a nivel de campo
      mergedData = mergeManager['fieldLevelMerge'](
        existing,
        body,
        new Date(existing.updated_at || existing.created_at),
        new Date(body.updated_at || new Date())
      );
      hadConflict = true;
    } else {
      mergedData = { ...existing, ...body };
    }
  }
  
  // Añadir timestamps preservando created_at si existe
  const timestampedData = addTimestamps(mergedData, exists, clientId);
  
  store[id] = timestampedData;
  
  // Guardar el store actualizado
  const dataToSave = {
    data: store,
    created_at: storeData?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: (storeData?.version || 0) + 1
  };
  
  await db.save(storeName, dataToSave as any);
  
  // 🔥 BROADCAST: Notificar cambio individual
  const action = exists ? 'update' : 'create';
  broadcastChange(storeName, action, timestampedData);
  
  // Si es productos y hay cambio de stock, broadcast específico
  if (storeName === 'products' && timestampedData.stock !== undefined) {
    broadcastStockUpdate([{
      productId: id,
      stock: timestampedData.stock,
      timestamp: timestampedData.updated_at
    }]);
  }
  
  return c.json({
    success: true,
    action,
    hadConflict,
    data: timestampedData,
    timestamp: new Date().toISOString(),
    version: dataToSave.version
  });
});

// ============================================
// PATCH - Actualizar parcialmente
// ============================================
syncRoute.patch('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  const { clientId = 'unknown' } = body;
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = storeData.data || storeData;
  
  if (!store || !store.hasOwnProperty(id)) {
    return c.json({ error: 'Record not found' }, 404);
  }
  
  const existing = store[id];
  
  // Merge a nivel de campo
  const merged = mergeManager['fieldLevelMerge'](
    existing,
    body,
    new Date(existing.updated_at || existing.created_at),
    new Date()
  );
  
  const updated = addTimestamps(merged, true, clientId);
  
  store[id] = updated;
  
  const dataToSave = {
    data: store,
    created_at: storeData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: (storeData.version || 0) + 1
  };
  
  await db.save(storeName, dataToSave as any);
  
  // 🔥 BROADCAST: Notificar actualización parcial
  broadcastChange(storeName, 'patch', updated);
  
  // Stock update específico si aplica
  if (storeName === 'products' && updated.stock !== undefined) {
    broadcastStockUpdate([{
      productId: id,
      stock: updated.stock,
      timestamp: updated.updated_at
    }]);
  }
  
  return c.json({
    success: true,
    action: 'patched',
    data: updated,
    timestamp: new Date().toISOString(),
    version: dataToSave.version
  });
});

// ============================================
// DELETE - Eliminar un registro
// ============================================
syncRoute.delete('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = storeData.data || storeData;
  const itemToDelete = store[id];
  const deleted = delete store[id];
  
  if (deleted) {
    const dataToSave = {
      data: store,
      created_at: storeData.created_at,
      updated_at: new Date().toISOString(),
      version: (storeData.version || 0) + 1
    };
    
    await db.save(storeName, dataToSave as any);
    
    // 🔥 BROADCAST: Notificar eliminación
    broadcastChange(storeName, 'delete', { id, ...itemToDelete });
  }
  
  return c.json({
    success: deleted,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// GET - Obtener cambios desde timestamp
// ============================================
syncRoute.get('/sync/:dbName/:storeName/since/:timestamp', async (c) => {
  const { dbName, storeName, timestamp } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ data: [], count: 0 });
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData) {
    return c.json({ data: [], count: 0 });
  }
  
  const store = storeData.data || storeData;
  const sinceDate = new Date(timestamp);
  
  const results = Object.values(store).filter((item: any) => {
    // Verificar que el item es un objeto válido
    if (!item || typeof item !== 'object') {
      return false;
    }
    
    // Verificar que updated_at existe y es válido
    if (!item.updated_at) {
      return false;
    }
    
    // Verificar que la fecha es válida
    const itemDate = new Date(item.updated_at);
    return !isNaN(itemDate.getTime()) && itemDate > sinceDate;
  });
  
  console.log(`📤 Enviando ${results.length} cambios desde ${timestamp} para ${storeName}`);
  
  return c.json({
    data: results,
    count: results.length,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// GET - Logs de conflictos
// ============================================
syncRoute.get('/sync/:dbName/:storeName/conflicts', async (c) => {
  const { storeName } = c.req.param();
  
  const storeConflicts = conflictLogs.filter(log => log.storeName === storeName);
  
  return c.json({
    conflicts: storeConflicts,
    count: storeConflicts.length,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// GET - Estadísticas de un store
// ============================================
syncRoute.get('/sync/:dbName/:storeName/stats', async (c) => {
  const { dbName, storeName } = c.req.param();
  
  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }
  
  const db = Databases[dbName] as DataStorage<TimestampedData>;
  const storeData = await db.load(storeName);
  
  if (!storeData) {
    return c.json({ error: 'Store not found' }, 404);
  }
  
  const store = storeData.data || storeData;
  const items = Object.values(store) as TimestampedData[];
  
  const now = Date.now();
  const last24h = items.filter(item => 
    now - new Date(item.updated_at).getTime() < 24 * 60 * 60 * 1000
  ).length;
  
  const last7d = items.filter(item => 
    now - new Date(item.updated_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;
  
  const byClient: Record<string, number> = {};
  items.forEach(item => {
    const clientId = item.client_id || 'unknown';
    byClient[clientId] = (byClient[clientId] || 0) + 1;
  });
  
  return c.json({
    total: items.length,
    updatedLast24h: last24h,
    updatedLast7d: last7d,
    version: storeData.version || 1,
    byClient,
    conflicts: conflictLogs.filter(log => log.storeName === storeName).length,
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