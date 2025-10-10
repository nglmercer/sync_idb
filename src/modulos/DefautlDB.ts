import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";

const filePath = path.join(process.cwd(), "DefaultDB.json");

interface TimestampedData {
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export default class DefaultDB {
  static my: DefaultDB | null = null;
  private userStorage = new DataStorage<TimestampedData>(new JSONFileAdapter(filePath));

  constructor() {
    if (DefaultDB.my == null) DefaultDB.my = new DefaultDB();
    return DefaultDB.my;
  }

  private addTimestamps(data: any, isUpdate: boolean = false): TimestampedData {
    const now = new Date().toISOString();
    
    if (isUpdate) {
      return {
        ...data,
        updated_at: now
      };
    }
    
    return {
      ...data,
      created_at: now,
      updated_at: now
    };
  }

  async add(id: string, data: any) {
    const timestampedData = this.addTimestamps(data, false);
    await this.userStorage.save(id, timestampedData);
    return timestampedData;
  }

  async update(id: string, data: any) {
    const existing = await this.get(id);
    
    if (!existing) {
      throw new Error(`Record with id ${id} not found`);
    }

    const updatedData = this.addTimestamps({
      ...existing,
      ...data,
      created_at: existing.created_at // Preservar created_at original
    }, true);

    await this.userStorage.save(id, updatedData);
    return updatedData;
  }

  async get(id: string) {
    return await this.userStorage.load(id);
  }

  async delete(id: string) {
    await this.userStorage.delete(id);
  }

  async all() {
    return await this.userStorage.getAll();
  }

  // Métodos útiles para consultas
  async getByDateRange(startDate: string, endDate: string) {
    const allData: Record<string, TimestampedData> = await this.all();
    return Object.values(allData).filter((item: TimestampedData) => {
      const createdAt = new Date(item.created_at);
      return createdAt >= new Date(startDate) && createdAt <= new Date(endDate);
    });
  }

  async getRecentlyUpdated(minutes: number = 60) {
    const allData: Record<string, TimestampedData> = await this.all();
    const threshold = new Date(Date.now() - minutes * 60 * 1000);
    
    return Object.values(allData).filter((item: TimestampedData) => {
      return new Date(item.updated_at) >= threshold;
    });
  }
  
  // Método para obtener todos como array
  async getAllAsArray() {
    const allData: Record<string, TimestampedData> = await this.all();
    return Object.entries(allData).map(([id, data]) => ({ id, ...data }));
  }
}