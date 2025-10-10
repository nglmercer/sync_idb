import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";
import fs from 'fs/promises';

interface BackupMetadata {
  id: string;
  database: string;
  timestamp: string;
  stores: string[];
  totalRecords: number;
  type: 'full' | 'incremental';
  since?: string;
  version: string;
}

interface BackupData {
  metadata: BackupMetadata;
  backup: Record<string, any[]>;
}

export default class BackupManager {
  static instance: BackupManager | null = null;
  private backupsDir: string;
  private metadataStorage: DataStorage<BackupMetadata>;

  constructor(backupsDir: string = 'backups') {
    if (BackupManager.instance == null) {
      this.backupsDir = path.join(process.cwd(), backupsDir);
      const metadataPath = path.join(this.backupsDir, '_metadata.json');
      
      this.metadataStorage = new DataStorage<BackupMetadata>(
        new JSONFileAdapter(metadataPath)
      );
      
      this.ensureBackupDirectory();
      BackupManager.instance = this;
    }
    return BackupManager.instance;
  }

  private async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating backup directory:', error);
    }
  }

  private generateBackupId(dbName: string, type: 'full' | 'incremental' = 'full'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${dbName}_${type}_${timestamp}`;
  }

  private getBackupFilePath(backupId: string): string {
    return path.join(this.backupsDir, `${backupId}.json`);
  }

  async saveBackup(
    dbName: string,
    backup: Record<string, any[]>,
    type: 'full' | 'incremental' = 'full',
    since?: string
  ): Promise<BackupMetadata> {
    const backupId = this.generateBackupId(dbName, type);
    const metadata: BackupMetadata = {
      id: backupId,
      database: dbName,
      timestamp: new Date().toISOString(),
      stores: Object.keys(backup),
      totalRecords: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0),
      type,
      since,
      version: '1.0'
    };

    const backupData: BackupData = {
      metadata,
      backup
    };

    // Guardar el archivo de backup
    const filePath = this.getBackupFilePath(backupId);
    await fs.writeFile(filePath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Guardar metadata
    await this.metadataStorage.save(backupId, metadata);

    return metadata;
  }

  async loadBackup(backupId: string): Promise<BackupData | null> {
    try {
      const filePath = this.getBackupFilePath(backupId);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as BackupData;
    } catch (error) {
      console.error(`Error loading backup ${backupId}:`, error);
      return null;
    }
  }

  async listBackups(dbName?: string): Promise<BackupMetadata[]> {
    const allMetadata = await this.metadataStorage.getAll();
    const backups = Object.values(allMetadata);

    if (dbName) {
      return backups.filter(b => b.database === dbName);
    }

    return backups;
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const filePath = this.getBackupFilePath(backupId);
      await fs.unlink(filePath);
      await this.metadataStorage.delete(backupId);
      return true;
    } catch (error) {
      console.error(`Error deleting backup ${backupId}:`, error);
      return false;
    }
  }

  async deleteOldBackups(dbName: string, keepLast: number = 5): Promise<number> {
    const backups = await this.listBackups(dbName);
    
    // Ordenar por timestamp (más recientes primero)
    backups.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Eliminar backups antiguos
    const toDelete = backups.slice(keepLast);
    let deleted = 0;

    for (const backup of toDelete) {
      const success = await this.deleteBackup(backup.id);
      if (success) deleted++;
    }

    return deleted;
  }

  async getBackupStats(dbName?: string): Promise<{
    total: number;
    byDatabase: Record<string, number>;
    oldestBackup?: BackupMetadata;
    newestBackup?: BackupMetadata;
    totalSize: number;
  }> {
    const backups = await this.listBackups(dbName);
    
    const byDatabase: Record<string, number> = {};
    backups.forEach(b => {
      byDatabase[b.database] = (byDatabase[b.database] || 0) + 1;
    });

    const oldestBackup = backups.reduce((oldest, current) => {
      if (!oldest) return current;
      return new Date(current.timestamp) < new Date(oldest.timestamp) ? current : oldest;
    }, null as BackupMetadata | null);

    const newestBackup = backups.reduce((newest, current) => {
      if (!newest) return current;
      return new Date(current.timestamp) > new Date(newest.timestamp) ? current : newest;
    }, null as BackupMetadata | null);

    // Calcular tamaño total de backups
    let totalSize = 0;
    for (const backup of backups) {
      try {
        const filePath = this.getBackupFilePath(backup.id);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      } catch (error) {
        // Ignorar archivos que no existen
      }
    }

    return {
      total: backups.length,
      byDatabase,
      oldestBackup: oldestBackup || undefined,
      newestBackup: newestBackup || undefined,
      totalSize
    };
  }

  async exportBackup(backupId: string, exportPath: string): Promise<boolean> {
    try {
      const backup = await this.loadBackup(backupId);
      if (!backup) return false;

      await fs.writeFile(exportPath, JSON.stringify(backup, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(`Error exporting backup ${backupId}:`, error);
      return false;
    }
  }

  async importBackup(importPath: string, dbName?: string): Promise<BackupMetadata | null> {
    try {
      const content = await fs.readFile(importPath, 'utf-8');
      const backupData = JSON.parse(content) as BackupData;

      // Si se especifica un nuevo nombre de DB, actualizarlo
      if (dbName) {
        backupData.metadata.database = dbName;
      }

      // Generar nuevo ID para evitar conflictos
      const newId = this.generateBackupId(
        backupData.metadata.database,
        backupData.metadata.type
      );
      backupData.metadata.id = newId;

      // Guardar el backup importado
      return await this.saveBackup(
        backupData.metadata.database,
        backupData.backup,
        backupData.metadata.type,
        backupData.metadata.since
      );
    } catch (error) {
      console.error(`Error importing backup:`, error);
      return null;
    }
  }
}