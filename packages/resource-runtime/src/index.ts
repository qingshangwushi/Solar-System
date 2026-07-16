/**
 * 资源运行时管理器（任务 P2-4）。
 *
 * 实现资源加载、缓存、生命周期管理。
 */

export type ResourceType = 'texture' | 'mesh' | 'shader' | 'data' | 'audio';

export type ResourceState = 'unloaded' | 'loading' | 'loaded' | 'failed' | 'evicted';

export interface ResourceDescriptor {
  id: string;
  type: ResourceType;
  url: string;
  size?: number;
  priority?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface ResourceEntry<T = unknown> {
  descriptor: ResourceDescriptor;
  data: T | null;
  state: ResourceState;
  error: Error | null;
  refCount: number;
  lastAccessed: number;
  loadedAt: number | null;
}

export interface LoadOptions {
  priority?: number;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  memoryUsed: number;
  memoryLimit: number;
}

export interface ResourceLoader<T = unknown> {
  readonly type: ResourceType;
  load(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<T>;
  unload(data: T): void;
  estimateSize(data: T): number;
}

export class ResourceManager {
  private entries = new Map<string, ResourceEntry>();
  private loaders = new Map<ResourceType, ResourceLoader>();
  private pendingLoads = new Map<string, Promise<unknown>>();
  private lruList: string[] = [];
  private memoryUsed = 0;
  private memoryLimit = 1024 * 1024 * 1024; // 1 GB default

  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  registerLoader(loader: ResourceLoader): void {
    this.loaders.set(loader.type, loader);
  }

  unregisterLoader(type: ResourceType): void {
    this.loaders.delete(type);
  }

  async load<T>(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<T> {
    const existing = this.entries.get(descriptor.id);
    if (existing && existing.state === 'loaded') {
      this.stats.hits++;
      existing.refCount++;
      existing.lastAccessed = Date.now();
      this.updateLRU(descriptor.id);
      return existing.data as T;
    }

    const pending = this.pendingLoads.get(descriptor.id);
    if (pending) {
      return pending as Promise<T>;
    }

    this.stats.misses++;

    if (!this.entries.has(descriptor.id)) {
      this.entries.set(descriptor.id, {
        descriptor,
        data: null,
        state: 'unloaded',
        error: null,
        refCount: 0,
        lastAccessed: Date.now(),
        loadedAt: null,
      });
    }

    const entry = this.entries.get(descriptor.id)!;
    entry.state = 'loading';

    const loader = this.loaders.get(descriptor.type);
    if (!loader) {
      entry.state = 'failed';
      entry.error = new Error(`No loader registered for type: ${descriptor.type}`);
      throw entry.error;
    }

    const loadPromise = this.executeLoad(loader, descriptor, options);
    this.pendingLoads.set(descriptor.id, loadPromise);

    try {
      const data = await loadPromise;
      entry.data = data;
      entry.state = 'loaded';
      entry.loadedAt = Date.now();
      entry.lastAccessed = Date.now();
      entry.refCount++;

      const size = loader.estimateSize(data);
      this.memoryUsed += size;

      this.lruList.push(descriptor.id);

        return data as T;
    } catch (error) {
      entry.state = 'failed';
      entry.error = error as Error;
      throw error;
    } finally {
      this.pendingLoads.delete(descriptor.id);
    }
  }

  private async executeLoad<T>(
    loader: ResourceLoader<T>,
    descriptor: ResourceDescriptor,
    options?: LoadOptions,
  ): Promise<T> {
    const retries = options?.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await loader.load(descriptor, options);
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries - 1) {
          await this.delay(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  unload(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    entry.refCount--;

    if (entry.refCount <= 0 && entry.state === 'loaded') {
      const loader = this.loaders.get(entry.descriptor.type);
      if (loader && entry.data) {
        const size = loader.estimateSize(entry.data);
        this.memoryUsed -= size;
        loader.unload(entry.data);
      }
      entry.data = null;
      entry.state = 'evicted';
      this.stats.evictions++;

      const lruIndex = this.lruList.indexOf(id);
      if (lruIndex !== -1) {
        this.lruList.splice(lruIndex, 1);
      }
    }
  }

  evictLRU(amount: number): number {
    let evicted = 0;

    while (this.lruList.length > 0 && this.memoryUsed > amount) {
      const id = this.lruList.shift()!;
      const entry = this.entries.get(id);

      if (entry && entry.state === 'loaded' && entry.refCount <= 0) {
        const loader = this.loaders.get(entry.descriptor.type);
        if (loader && entry.data) {
          const size = loader.estimateSize(entry.data);
          this.memoryUsed -= size;
          loader.unload(entry.data);
        }
        entry.data = null;
        entry.state = 'evicted';
        this.stats.evictions++;
        evicted++;
      }
    }

    return evicted;
  }

  ensureMemoryAvailable(required: number): void {
    const available = this.memoryLimit - this.memoryUsed;
    if (available < required) {
      this.evictLRU(this.memoryLimit - required);
    }
  }

  private updateLRU(id: string): void {
    const index = this.lruList.indexOf(id);
    if (index !== -1) {
      this.lruList.splice(index, 1);
    }
    this.lruList.push(id);
  }

  get(id: string): unknown | null {
    const entry = this.entries.get(id);
    if (entry && entry.state === 'loaded') {
      entry.lastAccessed = Date.now();
      this.updateLRU(id);
      return entry.data;
    }
    return null;
  }

  getState(id: string): ResourceState | null {
    const entry = this.entries.get(id);
    return entry?.state ?? null;
  }

  getStats(): CacheStats {
    return {
      entries: this.entries.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      memoryUsed: this.memoryUsed,
      memoryLimit: this.memoryLimit,
    };
  }

  setMemoryLimit(limit: number): void {
    this.memoryLimit = limit;
    if (this.memoryUsed > limit) {
      this.evictLRU(limit);
    }
  }

  clear(): void {
    for (const [id, entry] of this.entries) {
      if (entry.state === 'loaded' && entry.data) {
        const loader = this.loaders.get(entry.descriptor.type);
        if (loader) {
          loader.unload(entry.data);
        }
      }
      this.entries.delete(id);
    }
    this.lruList = [];
    this.memoryUsed = 0;
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
}

export class TextureLoader implements ResourceLoader<ImageBitmap | ImageData> {
  readonly type: ResourceType = 'texture';

  async load(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<ImageBitmap | ImageData> {
    const response = await fetch(descriptor.url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Failed to load texture: ${response.statusText}`);
    }

    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  unload(data: ImageBitmap | ImageData): void {
    if ('close' in data) {
      data.close();
    }
  }

  estimateSize(data: ImageBitmap | ImageData): number {
    if ('width' in data && 'height' in data) {
      return data.width * data.height * 4;
    }
    return 0;
  }
}

export class DataLoader<T = unknown> implements ResourceLoader<T> {
  readonly type: ResourceType = 'data';

  async load(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<T> {
    const response = await fetch(descriptor.url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response.text() as Promise<T>;
  }

  unload(_data: T): void {
    // No cleanup needed for data
  }

  estimateSize(data: T): number {
    if (typeof data === 'string') {
      return data.length * 2;
    }
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data).length * 2;
    }
    return 0;
  }
}

export class ShaderLoader implements ResourceLoader<string> {
  readonly type: ResourceType = 'shader';

  async load(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<string> {
    const response = await fetch(descriptor.url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${response.statusText}`);
    }
    return response.text();
  }

  unload(_data: string): void {
    // No cleanup needed for shaders
  }

  estimateSize(data: string): number {
    return data.length * 2;
  }
}

export class MeshLoader implements ResourceLoader<ArrayBuffer> {
  readonly type: ResourceType = 'mesh';

  async load(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<ArrayBuffer> {
    const response = await fetch(descriptor.url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Failed to load mesh: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  unload(_data: ArrayBuffer): void {
    // ArrayBuffer is automatically garbage collected
  }

  estimateSize(data: ArrayBuffer): number {
    return data.byteLength;
  }
}

export class PriorityLoadQueue {
  private queue: Array<{ descriptor: ResourceDescriptor; options?: LoadOptions; resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
  private maxConcurrent = 4;
  private currentLoads = 0;

  constructor(private manager: ResourceManager) {}

  enqueue<T>(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        descriptor,
        options,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.queue.sort((a, b) => {
        const priorityA = a.descriptor.priority ?? a.options?.priority ?? 0;
        const priorityB = b.descriptor.priority ?? b.options?.priority ?? 0;
        return priorityB - priorityA;
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.currentLoads < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.currentLoads++;

      this.manager.load(item.descriptor, item.options)
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.currentLoads--;
          this.processQueue();
        });
    }
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    this.processQueue();
  }

  clear(): void {
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length;
  }
}