import { Hono } from 'hono';
import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";
import mergeManager from '../modulos/MergeManager';
import { notificationManager } from '../websocket/notificationManager';

const PointSalesPath = path.join(process.cwd(), "./PointSales.json");

interface VersionedData {
  created_at: string;
  updated_at: string;
  version: number;
  client_id?: string;
  [key: string]: any;
}

interface StoreMetadata {
  data: VersionedData[];
  currentVersion: number;
  versionLog: VersionLogEntry[];
  created_at: string;
  updated_at: string;
}

interface VersionLogEntry {
  version: number;
  timestamp: string;
  operation: 'create' | 'update' | 'delete' | 'bulk';
  itemIds: string[];
  clientId: string;
}

interface SyncConflictLog {
  timestamp: string;
  storeName: string;
  conflicts: any[];
  resolved: boolean;
}

const Databases = {
  PointSales: new DataStorage<any>(new JSONFileAdapter(PointSalesPath)),
};

const conflictLogs: SyncConflictLog[] = [];
const MAX_CONFLICT_LOGS = 100;

const broadcastChange = (storeName: string, action: string, data: any) => {
  notificationManager.broadcast('sync:change', {
    storeName,
    action,
    item: data,
    data,
    version: data.version,
    timestamp: new Date().toISOString()
  });
};

const broadcastStockUpdate = (updates: any[]) => {
  notificationManager.broadcast('stock:update', updates);
};

const initStoreMetadata = (): StoreMetadata => ({
  data: [],
  currentVersion: 0,
  versionLog: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

const addVersionedData = (data: any, isUpdate: boolean, clientId: string, newVersion: number): VersionedData => {
  const now = new Date().toISOString();

  return {
    ...data,
    created_at: data.created_at || now,
    updated_at: now,
    version: newVersion,
    client_id: clientId
  };
};

const addVersionLog = (
  storeMetadata: StoreMetadata,
  operation: VersionLogEntry['operation'],
  itemIds: string[],
  clientId: string
): number => {
  if (!storeMetadata.versionLog) {
    storeMetadata.versionLog = [];
  }

  storeMetadata.currentVersion++;

  storeMetadata.versionLog.push({
    version: storeMetadata.currentVersion,
    timestamp: new Date().toISOString(),
    operation,
    itemIds,
    clientId
  });

  if (storeMetadata.versionLog.length > 1000) {
    storeMetadata.versionLog = storeMetadata.versionLog.slice(-500);
  }

  return storeMetadata.currentVersion;
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

const syncRoute = new Hono();

syncRoute.get('/sync/:dbName/:storeName', async (c) => {
  const { dbName, storeName } = c.req.param();

  if (!Databases[dbName]) {
    return c.json({ data: [], message: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    storeMetadata = initStoreMetadata();
  }

  const dataArray = storeMetadata.data.filter(item => item !== null && item !== undefined);

  return c.json({
    data: dataArray,
    count: dataArray.length,
    version: storeMetadata.currentVersion || 0,
    timestamp: new Date().toISOString()
  });
});

syncRoute.post('/sync/:dbName/:storeName', async (c) => {
  const { dbName, storeName } = c.req.param();
  const body = await c.req.json();
  const {
    data: incomingData,
    clientId = 'unknown',
    strategy = 'field-level-merge',
    idField = 'id',
    lastVersion = 0
  } = body;

  if (!Array.isArray(incomingData)) {
    return c.json({ error: 'Data must be an array' }, 400);
  }

  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    storeMetadata = initStoreMetadata();
  }

  if (lastVersion < storeMetadata.currentVersion) {
    console.warn(`⚠️ Version conflict for ${storeName}. Client v${lastVersion} vs Server v${storeMetadata.currentVersion}. Full Sync required.`);
    return c.json({
      success: false,
      needsFullSync: true,
      serverVersion: storeMetadata.currentVersion,
      message: `Version conflict. Client version ${lastVersion} is outdated. Server is at ${storeMetadata.currentVersion}.`
    }, 409);
  }

  const localDataMap = new Map(
    storeMetadata.data.filter(item => item && item[idField] != null).map(item => [item[idField], item])
  );

  const conflicts: any[] = [];
  const processedItems: VersionedData[] = [];
  const createdIds: string[] = [];
  const updatedIds: string[] = [];

  for (const item of incomingData) {
    const id = item[idField];
    const existingItem = localDataMap.get(id);
    const now = new Date().toISOString();

    let finalItem: VersionedData;
    let operation: 'create' | 'update';

    if (existingItem) {
      operation = 'update';
      updatedIds.push(id);
      const { merged, conflict } = mergeManager.mergeObjects(existingItem, item, { strategy: strategy as any });
      if (conflict) conflicts.push(conflict);
      finalItem = merged as VersionedData;
    } else {
      operation = 'create';
      createdIds.push(id);
      finalItem = item;
    }

    finalItem.updated_at = now;
    finalItem.created_at = existingItem?.created_at || now;
    finalItem.client_id = clientId;

    localDataMap.set(id, finalItem);
    processedItems.push(finalItem);
  }

  const newVersion = addVersionLog(storeMetadata, 'bulk', [...createdIds, ...updatedIds], clientId);

  processedItems.forEach(item => item.version = newVersion);

  storeMetadata.data = Array.from(localDataMap.values());
  storeMetadata.updated_at = new Date().toISOString();

  await db.save(storeName, storeMetadata);

  logConflicts(storeName, conflicts);

  if (processedItems.length > 0) {
    broadcastChange(storeName, 'update', {
      count: processedItems.length,
      items: processedItems,
      version: storeMetadata.currentVersion
    });
  }

  return c.json({
    success: true,
    synced: incomingData.length,
    conflicts: conflicts.length,
    version: storeMetadata.currentVersion,
    timestamp: new Date().toISOString()
  });
});

syncRoute.put('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  const { clientId = 'unknown' } = body;

  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    storeMetadata = initStoreMetadata();
  }

  const existingIndex = storeMetadata.data.findIndex(item => item && item.id == id);
  const exists = existingIndex !== -1;
  const existing = exists ? storeMetadata.data[existingIndex] : null;

  let mergedData;
  let hadConflict = false;

  if (existing) {
    const { merged, conflict } = mergeManager.mergeObjects(existing, body, { strategy: 'field-level-merge' });
    mergedData = merged;
    if (conflict) {
      hadConflict = true;
      logConflicts(storeName, [conflict]);
    }
  } else {
    mergedData = body;
  }

  const action = exists ? 'update' : 'create';
  const newVersion = addVersionLog(storeMetadata, action, [id], clientId);

  const versionedData = addVersionedData(mergedData, exists, clientId, newVersion);
  
  if (exists) {
    storeMetadata.data[existingIndex] = versionedData;
  } else {
    storeMetadata.data.push(versionedData);
  }
  
  // REMOVED DUPLICATE: addVersionLog was called twice before
  storeMetadata.updated_at = new Date().toISOString();

  await db.save(storeName, storeMetadata);

  broadcastChange(storeName, action, versionedData);

  if (storeName === 'products' && versionedData.stock !== undefined) {
    broadcastStockUpdate([{
      productId: id,
      stock: versionedData.stock,
      timestamp: versionedData.updated_at
    }]);
  }

  return c.json({
    success: true,
    action,
    hadConflict,
    data: versionedData,
    version: storeMetadata.currentVersion,
    timestamp: new Date().toISOString()
  });
});

syncRoute.patch('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json();
  const { clientId = 'unknown' } = body;

  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    return c.json({ error: 'Store not found' }, 404);
  }

  const existingIndex = storeMetadata.data.findIndex(item => item && item.id == id);

  if (existingIndex === -1) {
    return c.json({ error: 'Record not found' }, 404);
  }

  const existing = storeMetadata.data[existingIndex];

  const { merged, conflict } = mergeManager.mergeObjects(existing, body, { strategy: 'field-level-merge' });
  if (conflict) {
    logConflicts(storeName, [conflict]);
  }
  
  const newVersion = addVersionLog(storeMetadata, 'update', [id], clientId);
  const updated = addVersionedData(merged, true, clientId, newVersion);
  storeMetadata.data[existingIndex] = updated;

  // REMOVED DUPLICATE: addVersionLog was called twice before
  storeMetadata.updated_at = new Date().toISOString();

  await db.save(storeName, storeMetadata);

  broadcastChange(storeName, 'patch', updated);

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
    version: storeMetadata.currentVersion,
    timestamp: new Date().toISOString()
  });
});

syncRoute.delete('/sync/:dbName/:storeName/:id', async (c) => {
  const { dbName, storeName, id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const { clientId = 'server' } = body;

  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    return c.json({ error: 'Store not found' }, 404);
  }

  if (!storeMetadata.versionLog) {
    storeMetadata.versionLog = [];
  }

  const itemIndex = storeMetadata.data.findIndex(item => item && item.id == id);

  if (itemIndex === -1) {
    return c.json({ error: 'Item not found' }, 404);
  }

  const itemToDelete = storeMetadata.data[itemIndex];

  storeMetadata.data.splice(itemIndex, 1);

  addVersionLog(storeMetadata, 'delete', [id], clientId);
  storeMetadata.updated_at = new Date().toISOString();

  await db.save(storeName, storeMetadata);

  broadcastChange(storeName, 'delete', { id, ...itemToDelete });

  return c.json({
    success: true,
    version: storeMetadata.currentVersion,
    timestamp: new Date().toISOString()
  });
});

syncRoute.get('/sync/:dbName/:storeName/from/:version', async (c) => {
  const { dbName, storeName, version } = c.req.param();
  const fromVersion = parseInt(version, 10);

  if (!Databases[dbName]) {
    return c.json({ data: [], count: 0 });
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    return c.json({
      data: [],
      count: 0,
      currentVersion: 0,
      hasMore: false
    });
  }

  const changedLogs = storeMetadata.versionLog?.filter(log => log.version > fromVersion) || [];
  const changedIds = new Set<string>();

  changedLogs.forEach(log => {
    log.itemIds.forEach(id => changedIds.add(id));
  });

  const changedItems = storeMetadata.data.filter(item =>
    item && changedIds.has(String(item.id))
  );

  console.log(`📤 Version sync ${storeName}: from v${fromVersion} to v${storeMetadata.currentVersion}, ${changedItems.length} changes`);

  return c.json({
    data: changedItems,
    count: changedItems.length,
    currentVersion: storeMetadata.currentVersion,
    hasMore: false,
    timestamp: new Date().toISOString()
  });
});

syncRoute.get('/sync/:dbName/:storeName/conflicts', async (c) => {
  const { storeName } = c.req.param();

  const storeConflicts = conflictLogs.filter(log => log.storeName === storeName);

  return c.json({
    conflicts: storeConflicts,
    count: storeConflicts.length,
    timestamp: new Date().toISOString()
  });
});

syncRoute.get('/sync/:dbName/:storeName/stats', async (c) => {
  const { dbName, storeName } = c.req.param();

  if (!Databases[dbName]) {
    return c.json({ error: 'Database not found: ' + dbName }, 404);
  }

  const db = Databases[dbName];
  let storeMetadata = await db.load(storeName) as StoreMetadata;

  if (!storeMetadata || !storeMetadata.data) {
    return c.json({ error: 'Store not found' }, 404);
  }

  const items = storeMetadata.data.filter(item => item !== null && item !== undefined);

  const byClient: Record<string, number> = {};
  items.forEach(item => {
    const clientId = item.client_id || 'unknown';
    byClient[clientId] = (byClient[clientId] || 0) + 1;
  });

  return c.json({
    total: items.length,
    currentVersion: storeMetadata.currentVersion,
    byClient,
    conflicts: conflictLogs.filter(log => log.storeName === storeName).length,
    lastModified: storeMetadata.updated_at,
    timestamp: new Date().toISOString()
  });
});

export default syncRoute;