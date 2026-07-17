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
  range?: { start: number; end: number };
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

export type VramBudgetTier = 'cinematic' | 'standard' | 'low';

export interface VramBudgetConfig {
  tier: VramBudgetTier;
  availableVramBytes?: number;
}

export interface VramAllocation {
  bodyId: string | number;
  budgetBytes: number;
  maxLod: number;
  isPrimary: boolean;
}

export interface VramBudgetStats {
  totalBudgetBytes: number;
  allocatedBytes: number;
  remainingBytes: number;
  primaryTarget: string | number | null;
  allocations: VramAllocation[];
}

export class VramBudgeter {
  private tier: VramBudgetTier;
  private availableVramBytes?: number;
  private totalBudgetBytes: number;
  private allocations = new Map<string | number, VramAllocation>();
  private primaryTarget: string | number | null = null;
  private dirty = false;

  constructor(config: VramBudgetConfig) {
    this.tier = config.tier;
    this.availableVramBytes = config.availableVramBytes;
    this.totalBudgetBytes = this.computeBudget();
  }

  private computeBudget(): number {
    let tierBudget: number;
    if (this.tier === 'cinematic') {
      tierBudget = 5.5 * 1024 * 1024 * 1024;
    } else if (this.tier === 'standard') {
      tierBudget = 2 * 1024 * 1024 * 1024;
    } else {
      tierBudget = 768 * 1024 * 1024;
    }
    if (this.availableVramBytes !== undefined) {
      return Math.min(tierBudget, this.availableVramBytes);
    }
    return tierBudget;
  }

  setPrimaryTarget(bodyId: string | number): void {
    this.primaryTarget = bodyId;
    this.dirty = true;
  }

  allocate(
    targets: Array<{ bodyId: string | number; importance: number; baseLod: number }>,
  ): VramAllocation[] {
    const allocatable = this.totalBudgetBytes * 0.95;
    const primaryBudget = allocatable * 0.5;
    const nonPrimaryBudget = allocatable * 0.5;

    this.allocations.clear();

    const result: VramAllocation[] = [];

    const nonPrimaryTargets = targets.filter((t) => t.bodyId !== this.primaryTarget);
    const sumImportance = nonPrimaryTargets.reduce((sum, t) => sum + t.importance, 0);

    for (const target of targets) {
      const isPrimary = target.bodyId === this.primaryTarget;
      let budgetBytes: number;
      let maxLod: number;

      if (isPrimary) {
        budgetBytes = primaryBudget;
        maxLod = 0;
      } else {
        const share = sumImportance > 0 ? target.importance / sumImportance : 0;
        budgetBytes = nonPrimaryBudget * share;
        maxLod = Math.max(target.baseLod, 1);
      }

      const allocation: VramAllocation = {
        bodyId: target.bodyId,
        budgetBytes,
        maxLod,
        isPrimary,
      };
      this.allocations.set(target.bodyId, allocation);
      result.push(allocation);
    }

    this.dirty = false;
    return result;
  }

  getAllocation(bodyId: string | number): VramAllocation | undefined {
    return this.allocations.get(bodyId);
  }

  private getAllocatedBytes(): number {
    let allocatedBytes = 0;
    for (const allocation of this.allocations.values()) {
      allocatedBytes += allocation.budgetBytes;
    }
    return allocatedBytes;
  }

  getStats(): VramBudgetStats {
    const allocatedBytes = this.getAllocatedBytes();
    const allocations = Array.from(this.allocations.values());
    return {
      totalBudgetBytes: this.totalBudgetBytes,
      allocatedBytes,
      remainingBytes: this.totalBudgetBytes - allocatedBytes,
      primaryTarget: this.primaryTarget,
      allocations,
    };
  }

  canAllocate(requiredBytes: number): boolean {
    return this.getAllocatedBytes() + requiredBytes <= this.totalBudgetBytes;
  }

  release(bodyId: string | number): void {
    this.allocations.delete(bodyId);
  }

  setTier(tier: VramBudgetTier): void {
    this.tier = tier;
    this.totalBudgetBytes = this.computeBudget();
    this.dirty = true;
  }

  getTier(): VramBudgetTier {
    return this.tier;
  }

  isDirty(): boolean {
    return this.dirty;
  }
}

export interface ResourceBundle {
  id: string;
  resourceIds: string[];
  loaded: boolean;
  descriptors?: ResourceDescriptor[];
}

export class ResourceBundleManager {
  private bundles = new Map<string, ResourceBundle>();

  constructor(private manager: ResourceManager) {}

  registerBundle(bundle: ResourceBundle): void {
    this.bundles.set(bundle.id, { ...bundle, loaded: false });
  }

  async loadBundle(bundleId: string): Promise<void> {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    const descriptors = bundle.descriptors ?? [];
    await Promise.all(descriptors.map((d) => this.manager.load(d)));
    bundle.loaded = true;
  }

  unloadBundle(bundleId: string): void {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }
    for (const id of bundle.resourceIds) {
      this.manager.unload(id);
    }
    bundle.loaded = false;
  }

  listBundles(): ResourceBundle[] {
    return Array.from(this.bundles.values());
  }

  isBundleLoaded(bundleId: string): boolean {
    const bundle = this.bundles.get(bundleId);
    return bundle?.loaded ?? false;
  }
}

export class RangeAwareDataLoader implements ResourceLoader<ArrayBuffer> {
  readonly type: ResourceType = 'data';

  async load(descriptor: ResourceDescriptor, options?: LoadOptions): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {};
    if (descriptor.range) {
      headers['Range'] = `bytes=${descriptor.range.start}-${descriptor.range.end}`;
    }
    const response = await fetch(descriptor.url, {
      signal: options?.signal,
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  unload(_data: ArrayBuffer): void {}

  estimateSize(data: ArrayBuffer): number {
    return data.byteLength;
  }
}

export interface LazyResourceOptions<T> {
  descriptor: ResourceDescriptor;
  transform?: (data: unknown) => { default: T };
}

export function createLazyResource<T>(
  manager: ResourceManager,
  options: LazyResourceOptions<T>,
): () => Promise<{ default: T }> {
  return () =>
    manager.load<T>(options.descriptor).then((data) => {
      if (options.transform) return options.transform(data);
      return { default: data as unknown as T };
    });
}