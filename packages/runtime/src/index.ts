/**
 * 资源运行时（任务 P0-20）。
 */

export type ResourceType = 'texture' | 'mesh' | 'shader' | 'audio' | 'data' | 'ephemeris';

export type AssetTier = 'S' | 'A' | 'B' | 'C';

export type PrecisionLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface ResourceId {
  type: ResourceType;
  name: string;
  tier?: AssetTier;
  precision?: PrecisionLevel;
}

export interface ResourceMeta {
  id: ResourceId;
  url: string;
  size: number;
  hash: string;
  contentType: string;
  tier: AssetTier;
  precision: PrecisionLevel;
  dependencies?: ResourceId[];
}

export interface ResourceCacheEntry {
  data: ArrayBuffer;
  meta: ResourceMeta;
  accessedAt: number;
  size: number;
}

export interface ResourceLoadOptions {
  priority?: number;
  range?: [number, number];
  cache?: boolean;
  integrity?: boolean;
}

export interface ResourceLoadProgress {
  url: string;
  loaded: number;
  total: number;
  progress: number;
  status: 'loading' | 'completed' | 'failed';
  error?: Error;
}

export interface GPUResourceLimits {
  maxTextureSize: number;
  maxBufferSize: number;
  maxBindGroups: number;
  maxUniformBufferBindingSize: number;
  maxStorageBufferBindingSize: number;
}

export interface MemoryBudget {
  total: number;
  used: number;
  limit: number;
  textureMemory: number;
  bufferMemory: number;
}

export class ResourceIdImpl implements ResourceId {
  type: ResourceType;
  name: string;
  tier?: AssetTier;
  precision?: PrecisionLevel;

  constructor(type: ResourceType, name: string, tier?: AssetTier, precision?: PrecisionLevel) {
    this.type = type;
    this.name = name;
    this.tier = tier;
    this.precision = precision;
  }

  toString(): string {
    return `${this.type}:${this.name}:${this.tier || 'default'}:${this.precision || 'P2'}`;
  }

  static fromString(str: string): ResourceIdImpl {
    const parts = str.split(':');
    return new ResourceIdImpl(
      parts[0] as ResourceType,
      parts[1] || '',
      parts[2] === 'default' || !parts[2] ? undefined : (parts[2] as AssetTier),
      parts[3] === 'P2' || !parts[3] ? undefined : (parts[3] as PrecisionLevel),
    );
  }
}

export class ResourceMetaImpl implements ResourceMeta {
  id: ResourceId;
  url: string;
  size: number;
  hash: string;
  contentType: string;
  tier: AssetTier;
  precision: PrecisionLevel;
  dependencies?: ResourceId[];

  constructor(
    id: ResourceId,
    url: string,
    size: number,
    hash: string,
    contentType: string,
    tier: AssetTier = 'B',
    precision: PrecisionLevel = 'P2',
    dependencies?: ResourceId[],
  ) {
    this.id = id;
    this.url = url;
    this.size = size;
    this.hash = hash;
    this.contentType = contentType;
    this.tier = tier;
    this.precision = precision;
    this.dependencies = dependencies;
  }
}

export class LRUCache {
  private cache: Map<string, ResourceCacheEntry> = new Map();
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSize: number = 512 * 1024 * 1024) {
    this.maxSize = maxSize;
  }

  get(key: string): ResourceCacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.accessedAt = Date.now();
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  set(key: string, entry: ResourceCacheEntry): void {
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.currentSize -= oldEntry.size;
    }

    while (this.currentSize + entry.size > this.maxSize && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;
      const removedEntry = this.cache.get(firstKey);
      if (!removedEntry) break;
      this.currentSize -= removedEntry.size;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, entry);
    this.currentSize += entry.size;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  get size(): number {
    return this.currentSize;
  }

  get count(): number {
    return this.cache.size;
  }

  getStats(): { size: number; count: number; maxSize: number } {
    return {
      size: this.currentSize,
      count: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

export class ResourceLoader {
  private cache: LRUCache;
  private loading: Map<string, Promise<ArrayBuffer>> = new Map();
  private onProgress?: (progress: ResourceLoadProgress) => void;

  constructor(cacheSize?: number) {
    this.cache = new LRUCache(cacheSize);
  }

  setOnProgress(callback: (progress: ResourceLoadProgress) => void): void {
    this.onProgress = callback;
  }

  async load(url: string, options?: ResourceLoadOptions): Promise<ArrayBuffer> {
    const key = this.generateKey(url, options?.range);

    if (options?.cache !== false) {
      const cached = this.cache.get(key);
      if (cached) {
        return cached.data;
      }
    }

    if (this.loading.has(key)) {
      return this.loading.get(key)!;
    }

    const promise = this.performLoad(url, options);
    this.loading.set(key, promise);

    try {
      const data = await promise;

      if (options?.integrity !== false && options?.cache !== false) {
        const hash = await this.computeHash(data);
        const meta: ResourceMeta = {
          id: new ResourceIdImpl('data', url),
          url,
          size: data.byteLength,
          hash,
          contentType: '',
          tier: 'B',
          precision: 'P2',
        };

        const entry: ResourceCacheEntry = {
          data,
          meta,
          accessedAt: Date.now(),
          size: data.byteLength,
        };

        this.cache.set(key, entry);
      }

      return data;
    } finally {
      this.loading.delete(key);
    }
  }

  private async performLoad(url: string, options?: ResourceLoadOptions): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {};

    if (options?.range) {
      const [start, end] = options.range;
      headers['Range'] = `bytes=${start}-${end}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to load resource: ${url}, status: ${response.status}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      return response.arrayBuffer();
    }

    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.byteLength;

      if (this.onProgress && total > 0) {
        this.onProgress({
          url,
          loaded,
          total,
          progress: loaded / total,
          status: 'loading',
        });
      }
    }

    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    if (this.onProgress) {
      this.onProgress({
        url,
        loaded,
        total: loaded,
        progress: 1,
        status: 'completed',
      });
    }

    return result.buffer;
  }

  private generateKey(url: string, range?: [number, number]): string {
    return range ? `${url}:${range[0]}-${range[1]}` : url;
  }

  private async computeHash(data: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  getCache(): LRUCache {
    return this.cache;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export class MemoryBudgetImpl implements MemoryBudget {
  total: number;
  used: number = 0;
  limit: number;
  textureMemory: number = 0;
  bufferMemory: number = 0;

  constructor(limit: number = 512 * 1024 * 1024) {
    this.limit = limit;
    this.total = limit;
  }

  allocate(size: number, type: 'texture' | 'buffer'): boolean {
    if (this.used + size > this.limit) {
      return false;
    }

    this.used += size;
    if (type === 'texture') {
      this.textureMemory += size;
    } else {
      this.bufferMemory += size;
    }

    return true;
  }

  deallocate(size: number, type: 'texture' | 'buffer'): void {
    this.used = Math.max(0, this.used - size);
    if (type === 'texture') {
      this.textureMemory = Math.max(0, this.textureMemory - size);
    } else {
      this.bufferMemory = Math.max(0, this.bufferMemory - size);
    }
  }

  getUsage(): number {
    return (this.used / this.limit) * 100;
  }

  getStats(): MemoryBudget {
    return {
      total: this.total,
      used: this.used,
      limit: this.limit,
      textureMemory: this.textureMemory,
      bufferMemory: this.bufferMemory,
    };
  }

  setLimit(limit: number): void {
    this.limit = limit;
    this.total = limit;
  }
}

export class ResourceRuntime {
  private loader: ResourceLoader;
  private memoryBudget: MemoryBudgetImpl;
  private resourceRegistry: Map<string, ResourceMeta> = new Map();

  constructor(cacheSize?: number, memoryLimit?: number) {
    this.loader = new ResourceLoader(cacheSize);
    this.memoryBudget = new MemoryBudgetImpl(memoryLimit);
  }

  async loadResource(meta: ResourceMeta, options?: ResourceLoadOptions): Promise<ArrayBuffer> {
    const data = await this.loader.load(meta.url, options);

    if (options?.integrity !== false) {
      const hash = await this.computeHash(data);
      if (hash !== meta.hash) {
        throw new Error(`Resource integrity check failed: ${meta.id.toString()}`);
      }
    }

    this.resourceRegistry.set(meta.id.toString(), meta);

    return data;
  }

  async loadTexture(url: string, options?: ResourceLoadOptions): Promise<ArrayBuffer> {
    return this.loader.load(url, options);
  }

  async loadMesh(url: string, options?: ResourceLoadOptions): Promise<ArrayBuffer> {
    return this.loader.load(url, options);
  }

  async loadShader(url: string, options?: ResourceLoadOptions): Promise<string> {
    const data = await this.loader.load(url, options);
    return new TextDecoder().decode(data);
  }

  async loadData(url: string, options?: ResourceLoadOptions): Promise<ArrayBuffer> {
    return this.loader.load(url, options);
  }

  registerResource(meta: ResourceMeta): void {
    this.resourceRegistry.set(meta.id.toString(), meta);
  }

  getResourceMeta(id: ResourceId): ResourceMeta | undefined {
    return this.resourceRegistry.get(id.toString());
  }

  getAllResources(): ResourceMeta[] {
    return Array.from(this.resourceRegistry.values());
  }

  getMemoryBudget(): MemoryBudget {
    return this.memoryBudget.getStats();
  }

  getCacheStats(): { size: number; count: number; maxSize: number } {
    return this.loader.getCache().getStats();
  }

  clearCache(): void {
    this.loader.clearCache();
  }

  setOnProgress(callback: (progress: ResourceLoadProgress) => void): void {
    this.loader.setOnProgress(callback);
  }

  private async computeHash(data: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
