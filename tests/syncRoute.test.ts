import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { dbManager, SyncTask } from '../src/modulos/idb';
import { notificationManager } from '../src/websocket/notificationManager';

// Test data helpers
const generateTestProduct = (id: number, overrides = {}) => ({
  id,
  name: `Product ${id}`,
  category: 'Test Category',
  price: 10.99 * id,
  stock: 100 - id,
  ...overrides
});

const generateTestCustomer = (id: number, overrides = {}) => ({
  id,
  name: `Customer ${id}`,
  phone: `555-010${id}`,
  dni: `DNI${id}`,
  ...overrides
});

const generateTestTicket = (id: number, overrides = {}) => ({
  id,
  ticketID: `TICKET-${id}`,
  date: new Date().toISOString(),
  total: 99.99 * id,
  customerData: {
    name: `Customer ${id}`,
    dni: `DNI${id}`,
    orderType: 'retail'
  },
  ...overrides
});

const generateSyncTask = (action: 'create' | 'update' | 'delete', storeName: 'products' | 'tickets' | 'customers', data: any): SyncTask => ({
  id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  storeName,
  action,
  data,
  timestamp: Date.now()
});

describe('Sync Route Tests - Multiple Instance Synchronization', () => {
  beforeAll(async () => {
    // Ensure database is initialized
    await dbManager.openDatabase();
  });

  beforeEach(async () => {
    // Clean up database before each test
    const productsStore = dbManager.store('products');
    const customersStore = dbManager.store('customers');
    const ticketsStore = dbManager.store('tickets');
    
    await productsStore.clear();
    await customersStore.clear();
    await ticketsStore.clear();
  });

  describe('GET /api/sync/:dbName/:storeName', () => {
    it('should return empty array for empty store', async () => {
      const res = await app.request('/api/sync/PointSales/products');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });

    it('should return all items from a store', async () => {
      // Insert test data
      const productsStore = dbManager.store('products');
      const testProducts = [
        generateTestProduct(1),
        generateTestProduct(2),
        generateTestProduct(3)
      ];
      await productsStore.addMany(testProducts);

      const res = await app.request('/api/sync/PointSales/products');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(3);
      expect(json.data.map((p: any) => p.id)).toEqual([1, 2, 3]);
    });

    it('should return customers from customers store', async () => {
      const customersStore = dbManager.store('customers');
      const testCustomers = [
        generateTestCustomer(1),
        generateTestCustomer(2)
      ];
      await customersStore.addMany(testCustomers);

      const res = await app.request('/api/sync/PointSales/customers');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].name).toBe('Customer 1');
    });

    it('should return tickets from tickets store', async () => {
      const ticketsStore = dbManager.store('tickets');
      const testTickets = [
        generateTestTicket(1),
        generateTestTicket(2)
      ];
      await ticketsStore.addMany(testTickets);

      const res = await app.request('/api/sync/PointSales/tickets');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].ticketID).toBe('TICKET-1');
    });
  });

  describe('POST /api/sync/:dbName/:storeName', () => {
    it('should add multiple items to store', async () => {
      const testProducts = [
        generateTestProduct(1),
        generateTestProduct(2),
        generateTestProduct(3)
      ];

      const res = await app.request('/api/sync/PointSales/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: testProducts })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result).toBe(true); // addMany returns true, not an array

      // Verify data was actually added
      const verifyRes = await app.request('/api/sync/PointSales/products');
      const verifyJson = await verifyRes.json();
      expect(verifyJson.data).toHaveLength(3);
    });

    it('should handle empty data array', async () => {
      const res = await app.request('/api/sync/PointSales/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [] })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('should handle non-array data', async () => {
      const res = await app.request('/api/sync/PointSales/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { id: 1, name: 'Test' } })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('POST /api/sync/tasks - Multi-Instance Sync', () => {
    it('should process create tasks from multiple instances', async () => {
      // Simulate tasks from different instances
      const tasks = [
        generateSyncTask('create', 'products', generateTestProduct(101)),
        generateSyncTask('create', 'products', generateTestProduct(102)),
        generateSyncTask('create', 'customers', generateTestCustomer(201))
      ];

      const res = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedTaskIds).toHaveLength(3);
      expect(json.failedTasks).toHaveLength(0);

      // Verify data was synced
      const productsRes = await app.request('/api/sync/PointSales/products');
      const productsJson = await productsRes.json();
      expect(productsJson.data).toHaveLength(2);

      const customersRes = await app.request('/api/sync/PointSales/customers');
      const customersJson = await customersRes.json();
      expect(customersJson.data).toHaveLength(1);
    });

    it('should process update tasks from multiple instances', async () => {
      // First, create initial data
      const productsStore = dbManager.store('products');
      const initialProduct = generateTestProduct(301, { price: 10.99 });
      await productsStore.add(initialProduct);

      // Simulate update from instance 1
      const updateTask1 = generateSyncTask('update', 'products', 
        generateTestProduct(301, { price: 15.99, category: 'Updated Category 1' })
      );

      const res1 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [updateTask1] })
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.processedTaskIds).toHaveLength(1);

      // Verify update was applied
      const productsRes = await app.request('/api/sync/PointSales/products');
      const productsJson = await productsRes.json();
      expect(productsJson.data[0].price).toBe(15.99);
      expect(productsJson.data[0].category).toBe('Updated Category 1');

      // Simulate another update from instance 2 (later timestamp)
      const updateTask2 = generateSyncTask('update', 'products', 
        generateTestProduct(301, { price: 20.99, stock: 50 })
      );

      const res2 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [updateTask2] })
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.processedTaskIds).toHaveLength(1);

      // Verify final state - update replaces entire object, not merges
      const finalProductsRes = await app.request('/api/sync/PointSales/products');
      const finalProductsJson = await finalProductsRes.json();
      expect(finalProductsJson.data[0].price).toBe(20.99);
      expect(finalProductsJson.data[0].stock).toBe(50);
      expect(finalProductsJson.data[0].category).toBe('Test Category'); // Reset to default because update replaces entire object
    });

    it('should process delete tasks from multiple instances', async () => {
      // Create initial data
      const productsStore = dbManager.store('products');
      const testProducts = [
        generateTestProduct(401),
        generateTestProduct(402),
        generateTestProduct(403)
      ];
      await productsStore.addMany(testProducts);

      // Verify initial state
      const initialRes = await app.request('/api/sync/PointSales/products');
      const initialJson = await initialRes.json();
      expect(initialJson.data).toHaveLength(3);

      // Simulate delete from instance 1
      const deleteTask1 = generateSyncTask('delete', 'products', { id: 401 });

      const res1 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [deleteTask1] })
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.processedTaskIds).toHaveLength(1);

      // Verify delete was applied
      const afterDelete1Res = await app.request('/api/sync/PointSales/products');
      const afterDelete1Json = await afterDelete1Res.json();
      expect(afterDelete1Json.data).toHaveLength(2);
      expect(afterDelete1Json.data.map((p: any) => p.id)).toEqual([402, 403]);

      // Simulate another delete from instance 2
      const deleteTask2 = generateSyncTask('delete', 'products', { id: 403 });

      const res2 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [deleteTask2] })
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.processedTaskIds).toHaveLength(1);

      // Verify final state
      const finalRes = await app.request('/api/sync/PointSales/products');
      const finalJson = await finalRes.json();
      expect(finalJson.data).toHaveLength(1);
      expect(finalJson.data[0].id).toBe(402);
    });

    it('should handle mixed tasks from multiple instances', async () => {
      const tasks = [
        generateSyncTask('create', 'products', generateTestProduct(501)),
        generateSyncTask('create', 'customers', generateTestCustomer(601)),
        generateSyncTask('create', 'tickets', generateTestTicket(701)),
        generateSyncTask('update', 'products', generateTestProduct(501, { price: 25.99 })),
        generateSyncTask('create', 'products', generateTestProduct(502)),
        generateSyncTask('delete', 'customers', { id: 601 })
      ];

      const res = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedTaskIds).toHaveLength(6);
      expect(json.failedTasks).toHaveLength(0);

      // Verify final state
      const productsRes = await app.request('/api/sync/PointSales/products');
      const productsJson = await productsRes.json();
      expect(productsJson.data).toHaveLength(2);
      expect(productsJson.data.find((p: any) => p.id === 501).price).toBe(25.99);

      const customersRes = await app.request('/api/sync/PointSales/customers');
      const customersJson = await customersRes.json();
      expect(customersJson.data).toHaveLength(0); // Should be deleted

      const ticketsRes = await app.request('/api/sync/PointSales/tickets');
      const ticketsJson = await ticketsRes.json();
      expect(ticketsJson.data).toHaveLength(1);
    });

    it('should handle invalid tasks gracefully', async () => {
      const tasks = [
        generateSyncTask('create', 'products', generateTestProduct(801)),
        {
          id: 'invalid-task-1',
          storeName: 'products',
          action: 'create' as const,
          // Missing data
          timestamp: Date.now()
        },
        {
          id: 'invalid-task-2',
          storeName: 'products',
          action: 'create' as const,
          data: { id: 802 }, // Missing required fields
          timestamp: Date.now()
        },
        generateSyncTask('delete', 'products', { id: 801 })
      ];

      const res = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedTaskIds).toHaveLength(3); // 2 valid tasks + 1 partially valid (id: 802 has id but missing other fields)
      expect(json.failedTasks).toHaveLength(1); // Only the completely invalid task (missing data)
    });

    it('should handle empty tasks array', async () => {
      const res = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [] })
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toBe('No tasks provided.');
    });

    it('should handle missing tasks in request', async () => {
      const res = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toBe('No tasks provided.');
    });
  });

  describe('GET /api/sync/tasks', () => {
    it('should return success for tasks endpoint', async () => {
      const res = await app.request('/api/sync/tasks');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('Real-world Synchronization Scenarios', () => {
    it('should simulate concurrent modifications from multiple instances', async () => {
      // Instance 1 creates a product
      const instance1CreateTask = generateSyncTask('create', 'products', 
        generateTestProduct(901, { name: 'Product from Instance 1', price: 10.99 })
      );

      const res1 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [instance1CreateTask] })
      });

      expect(res1.status).toBe(200);

      // Instance 2 modifies the same product
      const instance2UpdateTask = generateSyncTask('update', 'products', 
        generateTestProduct(901, { 
          name: 'Product updated by Instance 2', 
          price: 12.99, 
          stock: 50 
        })
      );

      const res2 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [instance2UpdateTask] })
      });

      expect(res2.status).toBe(200);

      // Instance 3 adds more information
      const instance3UpdateTask = generateSyncTask('update', 'products', 
        generateTestProduct(901, { 
          category: 'Electronics',
          description: 'Updated by Instance 3'
        })
      );

      const res3 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [instance3UpdateTask] })
      });

      expect(res3.status).toBe(200);

      // Verify final state - last update wins (replaces entire object)
      const finalRes = await app.request('/api/sync/PointSales/products');
      const finalJson = await finalRes.json();
      expect(finalJson.data).toHaveLength(1);
      
      const finalProduct = finalJson.data[0];
      expect(finalProduct.id).toBe(901);
      expect(finalProduct.name).toBe('Product 901'); // Reset to default
      expect(finalProduct.price).toBe(9901.99); // 10.99 * 901 (correct calculation)
      expect(finalProduct.stock).toBe(-801); // 100 - 901
      expect(finalProduct.category).toBe('Electronics'); // From last update
      expect(finalProduct.description).toBe('Updated by Instance 3'); // From last update
    });

    it('should handle conflict resolution when same field is modified', async () => {
      // Create initial product
      const initialTask = generateSyncTask('create', 'products', 
        generateTestProduct(1001, { name: 'Original Name', price: 10.99, stock: 100 })
      );

      await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [initialTask] })
      });

      // Instance 1 updates name and price
      const instance1Task = generateSyncTask('update', 'products', 
        generateTestProduct(1001, { name: 'Name from Instance 1', price: 15.99 })
      );

      const res1 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [instance1Task] })
      });

      expect(res1.status).toBe(200);

      // Instance 2 updates same fields with different values (later)
      const instance2Task = generateSyncTask('update', 'products', 
        generateTestProduct(1001, { name: 'Name from Instance 2', price: 20.99 })
      );

      const res2 = await app.request('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [instance2Task] })
      });

      expect(res2.status).toBe(200);

      // Verify last update wins (current implementation - replaces entire object)
      const finalRes = await app.request('/api/sync/PointSales/products');
      const finalJson = await finalRes.json();
      const finalProduct = finalJson.data[0];
      
      expect(finalProduct.name).toBe('Name from Instance 2');
      expect(finalProduct.price).toBe(20.99);
      expect(finalProduct.stock).toBe(-901); // 100 - 1001 (default calculation)
    });
  });
});
