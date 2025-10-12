import { IndexedDBManager,type DatabaseSchema } from 'idb-manager';
import { NodeAdapter } from 'idb-manager/node';
export interface SyncTask {
  id: string; // ID único universal (UUID) para cada tarea
  storeName: 'products' | 'tickets' | 'customers';
  action: 'create' | 'update' | 'delete';
  // 'data' contiene el objeto completo para 'create'/'update',
  // o un objeto con solo el 'id' para 'delete'.
  data?: Record<string, any> & { id: string | number };
  timestamp: number;
}
const pointSalesSchema: DatabaseSchema = {
  name: 'PointSales',
  version: 2,
  stores: [
    {
      name: 'products',
      keyPath: 'id',
      autoIncrement: false,
      indexes: [
        { name: 'name', keyPath: 'name', unique: false },
        { name: 'category', keyPath: 'category', unique: false },
        { name: 'price', keyPath: 'price', unique: false },
        { name: 'stock', keyPath: 'stock', unique: false }
      ]
    },
    {
      name: 'tickets',
      keyPath: 'id',
      autoIncrement: false,
      indexes: [
        { name: 'customerName', keyPath: 'customerData.name', unique: false },
        { name: 'customerDni', keyPath: 'customerData.dni', unique: false },
        { name: 'date', keyPath: 'date', unique: false },
        { name: 'orderType', keyPath: 'customerData.orderType', unique: false },
        { name: 'total', keyPath: 'total', unique: false },
        { name: 'ticketID', keyPath: 'ticketID', unique: true }
      ]
    },
    {
      name: 'customers',
      keyPath: 'id',
      autoIncrement: false,
      indexes: [
        { name: 'name', keyPath: 'name', unique: false },
        { name: 'phone', keyPath: 'phone', unique: false },
        { name: 'dni', keyPath: 'dni', unique: true }
      ]
    }
  ]
};
const dbManager = new IndexedDBManager(pointSalesSchema,{
    autoInit: true,
    adapter: new NodeAdapter()
});
async function testDB() {
    await dbManager.openDatabase()
    const store = dbManager.store('products')
    const storeData = await store.getAll()
    //console.log(storeData)
}
testDB();
export {dbManager};
export default dbManager;
