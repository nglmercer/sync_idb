import { describe, it, expect, beforeEach, vi } from 'bun:test';

// =================================================================
// PASO 1: MOCKING DE DEPENDENCIAS
// Utilizamos vi.mock para reemplazar los módulos que interactúan con el disco 
// (json-obj-manager) y los WebSockets (notificationManager).
// Nota sobre TS: Si TypeScript se queja de 'vi.mock', pero Bun ejecuta el test, 
// es un problema de tipos. La sintaxis es correcta para el runtime de Bun.
// =================================================================

// Un objeto en memoria para simular nuestra base de datos JSON
let mockDbStore: Record<string, any> = {};

// Funciones mock para simular 'load' y 'save' del DataStorage
const mockLoad = vi.fn(async (storeName: string) => {
    // Simulamos la estructura Databases.PointSales.load(storeName)
    // Asumimos que DataStorage siempre opera dentro del contexto 'PointSales'
    return mockDbStore.PointSales?.[storeName] || { data: [], currentVersion: 0, versionLog: [] };
});

const mockSave = vi.fn(async (storeName: string, data: any) => {
    if (!mockDbStore.PointSales) mockDbStore.PointSales = {};
    mockDbStore.PointSales[storeName] = data;
});

// 1. Mock para el gestor de almacenamiento (DataStorage)
vi.mock('json-obj-manager', () => ({
  DataStorage: class MockDataStorage {
    constructor() {}
    load = mockLoad;
    save = mockSave;
  }
}));

// 2. Mock para el adaptador de archivos
vi.mock('json-obj-manager/node', () => ({
  JSONFileAdapter: class MockAdapter {}
}));

// 3. Mock para el gestor de notificaciones WebSocket
const mockBroadcast = vi.fn();
vi.mock('../src/websocket/notificationManager', () => ({
  notificationManager: {
    broadcast: mockBroadcast
  }
}));

// 4. Mock para el gestor de fusiones (MergeManager)
vi.mock('../src/modulos/MergeManager', () => ({
  default: {
    // Simulamos una fusión simple: combina, sin conflictos por defecto
    mergeObjects: (existing: any, incoming: any) => ({
      merged: { ...existing, ...incoming },
      conflict: null
    })
  }
}));


// =================================================================
// PASO 2: IMPORTAR LA APP DE HONO
// Importamos el archivo principal que monta todas las rutas y middlewares.
// =================================================================
import {app} from '../src/index'; 


// =================================================================
// PASO 3: ESCRIBIR LOS TESTS
// =================================================================

describe('Sync API Routes (Hono/Bun Test)', () => {

  beforeEach(() => {
    // 1. Limpiar el historial de llamadas de los mocks antes de cada test
    vi.clearAllMocks();

    // 2. Reiniciar la base de datos simulada a un estado inicial conocido
    mockDbStore = {
      PointSales: { 
        sales: {
          data: [
            { id: '1', total: 100, version: 1, client_id: 'client-a', updated_at: '2023-10-26T10:00:00.000Z', created_at: '2023-10-26T10:00:00.000Z' },
            { id: '2', total: 200, version: 2, client_id: 'client-b', updated_at: '2023-10-26T11:00:00.000Z', created_at: '2023-10-26T11:00:00.000Z' },
          ],
          currentVersion: 2,
          versionLog: [
              { version: 1, itemIds: ['1'], operation: 'create', clientId: 'client-a', timestamp: '...' },
              { version: 2, itemIds: ['2'], operation: 'create', clientId: 'client-b', timestamp: '...' }
          ],
          created_at: '2023-10-26T10:00:00.000Z',
          updated_at: '2023-10-26T11:00:00.000Z'
        },
        products: { // Store para probar la actualización de stock
            data: [
                { id: 'p1', name: 'Product A', stock: 5, version: 1, client_id: 'server', updated_at: '...', created_at: '...' },
            ],
            currentVersion: 1,
            versionLog: [{ version: 1, itemIds: ['p1'], operation: 'create', clientId: 'server', timestamp: '...' }],
            created_at: '...',
            updated_at: '...'
        }
      },
    };
  });

  // ============================================================
  // GET: Obtención Inicial y Versión
  // ============================================================
  describe('GET /api/sync/:dbName/:storeName', () => {
    it('should retrieve all items and server version (v2)', async () => {
      const res = await app.request('/api/sync/PointSales/sales');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeArrayOfSize(2);
      expect(body.version).toBe(2);
    });

    it('should return empty structure for a new store', async () => {
      const res = await app.request('/api/sync/PointSales/new-items');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.version).toBe(0);
    });
  });
  
  // ============================================================
  // POST: Sincronización Masiva (Bulk Sync)
  // ============================================================
  describe('POST /api/sync/PointSales/sales', () => {
    it('should sync create and update operations, and broadcast changes', async () => {
      const payload = {
        lastVersion: 2, // Cliente está al día
        clientId: 'client-c',
        data: [
          { id: '2', total: 250, someField: 'new' }, // Actualizar ítem 2
          { id: '3', total: 300, newField: true },   // Crear ítem 3
        ]
      };

      const res = await app.request('/api/sync/PointSales/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.synced).toBe(2);
      expect(body.version).toBe(4); // Versión pasa de 2 a 4 (dos cambios)

      // Verificar que los datos se guardaron correctamente
      const salesData = mockDbStore.PointSales.sales.data;
      const updatedItem = salesData.find(item => item.id === '2');
      const newItem = salesData.find(item => item.id === '3');
      
      expect(updatedItem.total).toBe(250);
      expect(updatedItem.version).toBe(3); // v3
      expect(newItem.version).toBe(4); // v4
      
      // Verificar broadcast
      expect(mockBroadcast).toHaveBeenCalledWith(
          'sync:change', 
          'update', 
          expect.objectContaining({ version: 4, count: 2 })
      );
    });

    it('should return 409 Conflict if client version is outdated', async () => {
        const payload = { lastVersion: 1, data: [{id: '3', total: 300}] }; 
        const res = await app.request('/api/sync/PointSales/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.needsFullSync).toBe(true);
        expect(body.serverVersion).toBe(2);
    });
  });

  // ============================================================
  // PUT: Upsert (Crear o Reemplazar/Fusionar)
  // ============================================================
  describe('PUT /api/sync/PointSales/products/:id', () => {
    it('should update stock and broadcast stock update', async () => {
        const payload = { stock: 10, clientId: 'client-pos' };
        const res = await app.request('/api/sync/PointSales/products/p1', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.action).toBe('update');
        expect(body.data.stock).toBe(10);
        
        // Debe haber dos broadcasts: uno para sync:change y otro para stock:update
        expect(mockBroadcast).toHaveBeenCalledTimes(2); 
        expect(mockBroadcast).toHaveBeenCalledWith('stock:update', [
            expect.objectContaining({
                productId: 'p1',
                stock: 10,
            })
        ]);
    });
  });

  // ============================================================
  // PATCH: Actualización Parcial
  // ============================================================
  describe('PATCH /api/sync/PointSales/sales/:id', () => {
    it('should partially update an existing item (total)', async () => {
        const payload = { total: 999 }; 
        const res = await app.request('/api/sync/PointSales/sales/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.action).toBe('patched');
        expect(body.data.total).toBe(999);
        expect(body.data.version).toBe(3); // Versión incrementada
    });
  });

  // ============================================================
  // DELETE: Eliminación
  // ============================================================
  describe('DELETE /api/sync/PointSales/sales/:id', () => {
    it('should delete an item, increment version, and broadcast delete', async () => {
        const res = await app.request('/api/sync/PointSales/sales/2', { 
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: 'server' }) // Envía clientId en body
        });
        
        expect(res.status).toBe(200);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.version).toBe(3); // v2 -> v3

        // Verificar que el item fue eliminado
        const salesData = mockDbStore.PointSales.sales.data;
        expect(salesData).toHaveLength(1);
        
        // Verificar broadcast de eliminación
        expect(mockBroadcast).toHaveBeenCalledWith('sync:change', 'delete', expect.objectContaining({ id: '2' }));
    });
  });

  // ============================================================
  // GET /from/:version: Sincronización Diferencial
  // ============================================================
  describe('GET /api/sync/PointSales/sales/from/:version', () => {
    it('should return changes based on versionLog', async () => {
        // En nuestro beforeEach, la v2 creó el item '2'.
        const res = await app.request('/api/sync/PointSales/sales/from/1');
        const body = await res.json();

        expect(body.count).toBe(1);
        expect(body.data[0].id).toBe('2'); 
        expect(body.currentVersion).toBe(2);
    });
  });
});