import { createHash } from 'crypto';

interface MergeStrategy {
  strategy: 'last-write-wins' | 'field-level-merge' | 'vector-clock' | 'custom';
  conflictResolver?: (local: any, remote: any) => any;
}

interface VersionVector {
  [clientId: string]: number;
}

interface VersionedRecord {
  data: any;
  version: VersionVector;
  lastModified: string;
  hash: string;
}

export class MergeManager {
  private static instance: MergeManager | null = null;
  
  constructor() {
    if (MergeManager.instance == null) {
      MergeManager.instance = this;
    }
    return MergeManager.instance;
  }

  /**
   * Genera un hash del contenido para detectar cambios reales
   */
  private generateHash(data: any): string {
    const content = JSON.stringify(this.normalizeForHash(data));
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Normaliza datos para hashing (excluye timestamps y metadata)
   */
  private normalizeForHash(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeForHash(item));
    }
    
    if (data && typeof data === 'object') {
      const normalized: any = {};
      const keysToExclude = ['created_at', 'updated_at', 'synced_at', 'version', 'hash'];
      
      for (const key of Object.keys(data).sort()) {
        if (!keysToExclude.includes(key)) {
          normalized[key] = this.normalizeForHash(data[key]);
        }
      }
      return normalized;
    }
    
    return data;
  }

  /**
   * Merge de nivel de campo - compara campo por campo
   */
  private fieldLevelMerge(local: any, remote: any, localTime: Date, remoteTime: Date): any {
    const merged = { ...local };
    
    for (const key in remote) {
      if (key === 'created_at' || key === 'id') {
        // Mantener el más antiguo para created_at
        if (key === 'created_at' && local.created_at) {
          merged.created_at = new Date(local.created_at) < new Date(remote.created_at) 
            ? local.created_at 
            : remote.created_at;
        }
        continue;
      }
      
      // Si el campo no existe en local, tomarlo de remote
      if (!(key in local)) {
        merged[key] = remote[key];
        continue;
      }
      
      // Si los valores son diferentes, usar el más reciente
      if (JSON.stringify(local[key]) !== JSON.stringify(remote[key])) {
        merged[key] = remoteTime > localTime ? remote[key] : local[key];
      }
    }
    
    return merged;
  }

  /**
   * Merge con vector clocks para detección de conflictos causales
   */
  mergeWithVectorClock(
    local: VersionedRecord,
    remote: VersionedRecord,
    clientId: string
  ): VersionedRecord {
    // Comparar vector clocks
    const localVector = local.version;
    const remoteVector = remote.version;
    
    let localIsNewer = false;
    let remoteIsNewer = false;
    
    const allClients = new Set([
      ...Object.keys(localVector),
      ...Object.keys(remoteVector)
    ]);
    
    for (const client of allClients) {
      const localV = localVector[client] || 0;
      const remoteV = remoteVector[client] || 0;
      
      if (localV > remoteV) localIsNewer = true;
      if (remoteV > localV) remoteIsNewer = true;
    }
    
    // Caso 1: Local es estrictamente más nuevo (domina a remote)
    if (localIsNewer && !remoteIsNewer) {
      return local;
    }
    
    // Caso 2: Remote es estrictamente más nuevo (domina a local)
    if (remoteIsNewer && !localIsNewer) {
      return {
        ...remote,
        version: this.mergeVectorClocks(localVector, remoteVector)
      };
    }
    
    // Caso 3: Conflicto concurrente - hacer merge a nivel de campo
    const mergedData = this.fieldLevelMerge(
      local.data,
      remote.data,
      new Date(local.lastModified),
      new Date(remote.lastModified)
    );
    
    return {
      data: mergedData,
      version: this.mergeVectorClocks(localVector, remoteVector),
      lastModified: new Date().toISOString(),
      hash: this.generateHash(mergedData)
    };
  }

  /**
   * Merge de vector clocks
   */
  private mergeVectorClocks(v1: VersionVector, v2: VersionVector): VersionVector {
    const merged: VersionVector = { ...v1 };
    
    for (const client in v2) {
      merged[client] = Math.max(merged[client] || 0, v2[client]);
    }
    
    return merged;
  }

  /**
   * Merge de arrays - mantiene todos los elementos únicos
   */
  mergeArrays(
    localArray: any[],
    remoteArray: any[],
    idField: string = 'id',
    strategy: MergeStrategy = { strategy: 'field-level-merge' }
  ): { merged: any[], conflicts: any[] } {
    const merged = new Map<string, any>();
    const conflicts: any[] = [];
    
    // Procesar elementos locales
    for (const item of localArray) {
      const id = item[idField];
      if (!id) continue;
      
      merged.set(id, {
        ...item,
        _source: 'local',
        _hash: this.generateHash(item)
      });
    }
    
    // Procesar elementos remotos y hacer merge
    for (const remoteItem of remoteArray) {
      const id = remoteItem[idField];
      if (!id) continue;
      
      const localItem = merged.get(id);
      
      if (!localItem) {
        // Nuevo elemento de remote
        merged.set(id, {
          ...remoteItem,
          _source: 'remote',
          _hash: this.generateHash(remoteItem)
        });
        continue;
      }
      
      // Comparar hashes para ver si realmente hay cambios
      const remoteHash = this.generateHash(remoteItem);
      
      if (localItem._hash === remoteHash) {
        // Sin cambios reales
        continue;
      }
      
      // Hay cambios, aplicar estrategia de merge
      let mergedItem: any;
      
      switch (strategy.strategy) {
        case 'last-write-wins':
          const localTime = new Date(localItem.updated_at || localItem.created_at || 0);
          const remoteTime = new Date(remoteItem.updated_at || remoteItem.created_at || 0);
          mergedItem = remoteTime > localTime ? remoteItem : localItem;
          break;
          
        case 'field-level-merge':
          mergedItem = this.fieldLevelMerge(
            localItem,
            remoteItem,
            new Date(localItem.updated_at || localItem.created_at || 0),
            new Date(remoteItem.updated_at || remoteItem.created_at || 0)
          );
          break;
          
        case 'custom':
          if (strategy.conflictResolver) {
            mergedItem = strategy.conflictResolver(localItem, remoteItem);
          } else {
            mergedItem = remoteItem;
          }
          break;
          
        default:
          mergedItem = remoteItem;
      }
      
      // Registrar conflicto si hubo merge
      if (strategy.strategy === 'field-level-merge') {
        conflicts.push({
          id,
          local: localItem,
          remote: remoteItem,
          merged: mergedItem,
          timestamp: new Date().toISOString()
        });
      }
      
      merged.set(id, {
        ...mergedItem,
        _source: 'merged',
        _hash: this.generateHash(mergedItem),
        updated_at: new Date().toISOString()
      });
    }
    
    // Limpiar campos internos
    const result = Array.from(merged.values()).map(item => {
      const { _source, _hash, ...cleanItem } = item;
      return cleanItem;
    });
    
    return { merged: result, conflicts };
  }

  /**
   * Incrementa el vector clock para un cliente
   */
  incrementVectorClock(vector: VersionVector, clientId: string): VersionVector {
    return {
      ...vector,
      [clientId]: (vector[clientId] || 0) + 1
    };
  }

  /**
   * Crea un nuevo vector clock
   */
  createVectorClock(clientId: string): VersionVector {
    return { [clientId]: 1 };
  }

  /**
   * Detecta si hay un conflicto real entre dos registros
   */
  hasConflict(local: any, remote: any): boolean {
    const localHash = this.generateHash(local);
    const remoteHash = this.generateHash(remote);
    
    if (localHash === remoteHash) {
      return false; // No hay conflicto, son idénticos
    }
    
    const localTime = new Date(local.updated_at || local.created_at || 0);
    const remoteTime = new Date(remote.updated_at || remote.created_at || 0);
    
    // Si la diferencia es menos de 1 segundo, podría ser un conflicto concurrente
    return Math.abs(localTime.getTime() - remoteTime.getTime()) < 1000;
  }

  /**
   * Genera un reporte de conflictos
   */
  generateConflictReport(conflicts: any[]): string {
    if (conflicts.length === 0) {
      return 'No se detectaron conflictos';
    }
    
    let report = `Se detectaron ${conflicts.length} conflictos:\n\n`;
    
    for (const conflict of conflicts) {
      report += `ID: ${conflict.id}\n`;
      report += `Timestamp: ${conflict.timestamp}\n`;
      report += `Campos modificados:\n`;
      
      for (const key in conflict.merged) {
        if (JSON.stringify(conflict.local[key]) !== JSON.stringify(conflict.remote[key])) {
          report += `  - ${key}: local="${conflict.local[key]}" → remote="${conflict.remote[key]}" → merged="${conflict.merged[key]}"\n`;
        }
      }
      
      report += '\n';
    }
    
    return report;
  }
}

export default new MergeManager();