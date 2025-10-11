// ../modulos/MergeManager.ts

import { createHash } from 'crypto';

interface MergeStrategy {
  strategy: 'last-write-wins' | 'field-level-merge' | 'custom';
  conflictResolver?: (local: any, remote: any) => any;
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
   * Generates a hash of an object's content, ignoring metadata fields.
   * This is used to detect genuine changes in data.
   */
  private generateHash(data: any): string {
    const content = JSON.stringify(this.normalizeForHash(data));
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Prepares an object for hashing by removing volatile metadata and sorting keys.
   */
  private normalizeForHash(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeForHash(item));
    }
    
    if (data && typeof data === 'object') {
      const normalized: any = {};
      const keysToExclude = ['created_at', 'updated_at', 'synced_at', 'version', 'hash', 'client_id'];
      
      for (const key of Object.keys(data).sort()) {
        if (!keysToExclude.includes(key) && data[key] !== undefined) {
          normalized[key] = this.normalizeForHash(data[key]);
        }
      }
      return normalized;
    }
    
    return data;
  }
  
  /**
   * Merges two objects field by field, resolving conflicts based on timestamps.
   * The most recent value for each field wins.
   * @param local The local (server) version of the object.
   * @param remote The remote (client) version of the object.
   * @param localTime The timestamp of the local version.
   * @param remoteTime The timestamp of the remote version.
   * @returns The merged object.
   */
  public fieldLevelMerge(local: any, remote: any, localTime: Date, remoteTime: Date): any {
    const merged = { ...local };
    
    for (const key in remote) {
      // Always keep the original creation date
      if (key === 'created_at') {
        if (local.created_at) {
          merged.created_at = new Date(local.created_at) < new Date(remote.created_at) 
            ? local.created_at 
            : remote.created_at;
        } else {
            merged.created_at = remote.created_at;
        }
        continue;
      }
      
      // Ignore fields that should not be merged this way
      if (key === 'id') continue;
      
      // If the field doesn't exist locally, add it from remote.
      if (!(key in local)) {
        merged[key] = remote[key];
        continue;
      }
      
      // If values are different, the newer one wins.
      if (JSON.stringify(local[key]) !== JSON.stringify(remote[key])) {
        merged[key] = remoteTime >= localTime ? remote[key] : local[key];
      }
    }
    
    return merged;
  }

  /**
   * Main public method to merge two objects based on a specified strategy.
   * Detects and reports conflicts.
   */
  public mergeObjects(
    local: any,
    remote: any,
    options: MergeStrategy = { strategy: 'field-level-merge' }
  ): { merged: any; conflict: any | null } {
    let merged: any;
    let conflict: any | null = null;
    const localTime = new Date(local.updated_at || local.created_at || 0);
    const remoteTime = new Date(remote.updated_at || remote.created_at || 0);

    // If objects are semantically identical, no merge is needed.
    // Just update the timestamp to the latest one.
    if (this.generateHash(local) === this.generateHash(remote)) {
      merged = { ...local, updated_at: remoteTime > localTime ? remote.updated_at : local.updated_at };
      return { merged, conflict: null };
    }

    switch (options.strategy) {
      case 'last-write-wins':
        merged = remoteTime >= localTime ? remote : local;
        break;

      case 'field-level-merge':
        merged = this.fieldLevelMerge(local, remote, localTime, remoteTime);
        
        // Generate a conflict report if any fields were resolved.
        const resolvedFields: any = {};
        for (const key in merged) {
          if (key in remote && JSON.stringify(local[key]) !== JSON.stringify(remote[key])) {
             resolvedFields[key] = {
               local: local[key],
               remote: remote[key],
               resolved: merged[key],
               winner: remoteTime >= localTime ? 'remote' : 'local'
             };
          }
        }
        
        if (Object.keys(resolvedFields).length > 0) {
          conflict = {
            id: local.id || remote.id,
            resolvedFields,
            timestamp: new Date().toISOString()
          };
        }
        break;
        
      case 'custom':
        if (options.conflictResolver) {
          merged = options.conflictResolver(local, remote);
        } else {
          // Fallback to LWW if no resolver is provided
          merged = remoteTime >= localTime ? remote : local;
        }
        break;

      default:
        // Default to the safest strategy
        merged = this.fieldLevelMerge(local, remote, localTime, remoteTime);
        break;
    }
    
    // Ensure the merged object has a fresh timestamp
    merged.updated_at = new Date().toISOString();

    return { merged, conflict };
  }

  /**
   * Merges two arrays of objects based on a unique ID field.
   */
  public mergeArrays(
    localArray: any[],
    remoteArray: any[],
    idField: string = 'id',
    strategy: MergeStrategy = { strategy: 'field-level-merge' }
  ): { merged: any[], conflicts: any[] } {
    const mergedMap = new Map<string, any>();
    const conflicts: any[] = [];
    
    // Add all local items to the map
    for (const item of localArray) {
      const id = item[idField];
      if (id != null) {
        mergedMap.set(String(id), item);
      }
    }
    
    // Process remote items, merging with existing local items
    for (const remoteItem of remoteArray) {
      const id = remoteItem[idField];
      if (id == null) continue;
      
      const localItem = mergedMap.get(String(id));
      
      if (localItem) {
        // Item exists, perform merge
        const { merged, conflict } = this.mergeObjects(localItem, remoteItem, strategy);
        if (conflict) {
          conflicts.push(conflict);
        }
        mergedMap.set(String(id), merged);
      } else {
        // New item from remote
        mergedMap.set(String(id), remoteItem);
      }
    }
    
    return { merged: Array.from(mergedMap.values()), conflicts };
  }
}

export default new MergeManager();