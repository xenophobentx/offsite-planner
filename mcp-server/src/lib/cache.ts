// Small TTL cache for external API answers. In Azure it uses Table storage
// (shared by all instances, survives cold starts); locally it falls back to memory.

import { TableClient } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expires: number }>();

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

/** Table storage cache. Partition = key prefix before ':', row = the rest (sanitised). */
export class TableCache implements Cache {
  private ready: Promise<void>;
  private memory = new MemoryCache();

  constructor(private client: TableClient) {
    this.ready = client.createTable().catch(() => undefined);
  }

  private split(key: string) {
    const i = key.indexOf(':');
    const safe = (s: string) => s.replace(/[\\/#?\u0000-\u001f\u007f-\u009f]/g, '_').slice(0, 512);
    return { partitionKey: safe(i > 0 ? key.slice(0, i) : 'misc'), rowKey: safe(i > 0 ? key.slice(i + 1) : key) };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const local = await this.memory.get<T>(key);
    if (local !== undefined) return local;
    await this.ready;
    const { partitionKey, rowKey } = this.split(key);
    try {
      const e = await this.client.getEntity<{ value: string; expires: number }>(partitionKey, rowKey);
      if (e.expires < Date.now()) return undefined;
      const value = JSON.parse(e.value) as T;
      await this.memory.set(key, value, Math.max(1, Math.floor((e.expires - Date.now()) / 1000)));
      return value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.memory.set(key, value, ttlSeconds);
    await this.ready;
    const { partitionKey, rowKey } = this.split(key);
    try {
      await this.client.upsertEntity(
        { partitionKey, rowKey, value: JSON.stringify(value), expires: Date.now() + ttlSeconds * 1000 },
        'Replace'
      );
    } catch (err) {
      console.warn('cache write failed', key, (err as Error).message);
    }
  }
}

let shared: Cache | undefined;

/**
 * TableCache in Azure: CACHE_TABLE_ENDPOINT with managed identity, or
 * CACHE_TABLE_CONNECTION with a connection string. Otherwise memory.
 */
export function getCache(): Cache {
  if (shared) return shared;
  const endpoint = process.env.CACHE_TABLE_ENDPOINT;
  const connection = process.env.CACHE_TABLE_CONNECTION;
  const tableName = process.env.CACHE_TABLE_NAME ?? 'apicache';
  if (connection) {
    shared = new TableCache(TableClient.fromConnectionString(connection, tableName));
  } else if (endpoint) {
    const credential = new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID });
    shared = new TableCache(new TableClient(endpoint, tableName, credential));
  } else {
    shared = new MemoryCache();
  }
  return shared;
}

export function setCache(cache: Cache) {
  shared = cache;
}

export const TTL = {
  holidays: 365 * 24 * 3600,
  fx: 24 * 3600,
  climate: 30 * 24 * 3600,
  flights: 6 * 3600,
};
