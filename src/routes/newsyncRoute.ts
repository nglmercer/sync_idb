import { Hono } from 'hono';
import { dbManager,SyncTask } from '../modulos/idb';
import { notificationManager } from '../websocket/notificationManager';
export type EmitEvents = "add" | "update" | "save" | "delete" | "clear" | "export" | "import";
/**
 * Lista de eventos disponibles
 */
export declare const EMIT_EVENTS: EmitEvents[];
const syncRoute = new Hono();
// one instance default dbName//not implemented more db
// ignore :dbName
interface taskData {
    id: number;
    action: EmitEvents;
    data?: any;
}
syncRoute.get('/sync/:dbName/:storeName', async (c) => {
    const { dbName, storeName } = c.req.param();
    const db = dbManager.store(storeName);
    const data = await db.getAll();
    return c.json({ success:true,data});
});
syncRoute.post('/sync/:dbName/:storeName', async (c) => {
    const { dbName, storeName } = c.req.param();
    const body = await c.req.json();
    const { data } = body;
    const db = dbManager.store(storeName);
    if (Array.isArray(data) && data.length > 0) {
        const result = await db.addMany(data);
        return c.json({ success: true,result });
    }
    return c.json({ success: false,data });
});
syncRoute.get('/sync/tasks', async (c) => {
//   const tasks = await dbManager.getAll();
    return c.json({success:true});
});
syncRoute.post('/sync/tasks', async (c) => {
    const {tasks} = await c.req.json() as {tasks: SyncTask[]};

    if (!Array.isArray(tasks) || tasks.length === 0) {
        return c.json({ success: false, message: 'No tasks provided.' }, 400);
    }

    const processedTaskIds: string[] = [];
    const failedTasks: { id: string; error: string }[] = [];

    // Process tasks sequentially to maintain data integrity and order.
    for (const task of tasks) {
        try {
            console.log(`[Sync] Processing task: ${task.action} on ${task.storeName} with ID ${task.id}`);
            
            if (!task.data || task.data.id === undefined) {
                throw new Error(`Task ${task.id} is missing 'data' or 'data.id'.`);
            }
            if (!task.storeName || !task.action) {
                throw new Error(`Task ${task.id} is missing 'storeName' or 'action'.`+task.storeName);
            }
            const store = dbManager.store(task.storeName);

            switch (task.action) {
                case 'create':
                case 'update':
                    // idb-manager's `add` method works as an "upsert", handling both creation and updates.
                    await store.add(task.data);
                    break;
                case 'delete':
                    // The primary key for deletion is consistently expected in `task.data.id`.
                    await store.delete(task.data.id);
                    break;
                default:
                    // This ensures that if new actions are added to the type, the code will fail to compile.
                    const exhaustiveCheck: never = task.action;
                    throw new Error(`Unknown action received: ${exhaustiveCheck}`);
            }

            // If the database operation was successful, mark the task as processed.
            processedTaskIds.push(task.id);

            // Broadcast the successful change to all other connected clients.
            // The entire task object is sent, giving clients all the context they need.
            notificationManager.broadcast('sync:change', task);

        } catch (error: any) {
            console.error(`[Sync] Failed task ${task.id}:`, error);
            failedTasks.push({ id: task.id, error: error.message || 'Unknown error' });
        }
    }

    return c.json({
        success: true,
        processedTaskIds,
        failedTasks
    });
});
export default syncRoute;