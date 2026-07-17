import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResourceManager,
  TextureLoader,
  ShaderLoader,
  DataLoader,
  MeshLoader,
  PriorityLoadQueue,
  ResourceBundleManager,
  RangeAwareDataLoader,
  createLazyResource,
  VramBudgeter,
  ResourceDescriptor,
  ResourceType,
  ResourceLoader,
} from '../index.js';

class MockDataLoader implements ResourceLoader<string> {
  readonly type: ResourceType = 'data';
  async load(_descriptor: ResourceDescriptor): Promise<string> {
    return 'mock-data';
  }
  unload(_data: string): void {}
  estimateSize(data: string): number {
    return data.length * 2;
  }
}

describe('ResourceManager', () => {
  let manager: ResourceManager;

  beforeEach(() => {
    manager = new ResourceManager();
  });

  describe('Loader Registration', () => {
    it('should register a loader', () => {
      const loader = new TextureLoader();
      manager.registerLoader(loader);
      expect(manager.getStats().entries).toBe(0);
    });

    it('should unregister a loader', () => {
      const loader = new TextureLoader();
      manager.registerLoader(loader);
      manager.unregisterLoader('texture');
      const descriptor: ResourceDescriptor = {
        id: 'test',
        type: 'texture',
        url: 'https://example.com/test.png',
      };
      expect(manager.load(descriptor)).rejects.toThrow();
    });
  });

  describe('Cache Stats', () => {
    it('should return initial stats', () => {
      const stats = manager.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });

    it('should set memory limit', () => {
      manager.setMemoryLimit(100 * 1024 * 1024);
      const stats = manager.getStats();
      expect(stats.memoryLimit).toBe(100 * 1024 * 1024);
    });
  });

  describe('Clear', () => {
    it('should clear all entries', () => {
      manager.clear();
      const stats = manager.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.hits).toBe(0);
    });
  });
});

describe('TextureLoader', () => {
  it('should have correct type', () => {
    const loader = new TextureLoader();
    expect(loader.type).toBe('texture');
  });

  it('should estimate size for ImageBitmap', () => {
    const loader = new TextureLoader();
    const mockImageBitmap = { width: 100, height: 100 };
    const size = loader.estimateSize(mockImageBitmap as unknown as ImageBitmap);
    expect(size).toBe(100 * 100 * 4);
  });
});

describe('ShaderLoader', () => {
  it('should have correct type', () => {
    const loader = new ShaderLoader();
    expect(loader.type).toBe('shader');
  });

  it('should estimate size for shader string', () => {
    const loader = new ShaderLoader();
    const size = loader.estimateSize('test shader');
    expect(size).toBe('test shader'.length * 2);
  });
});

describe('DataLoader', () => {
  it('should have correct type', () => {
    const loader = new DataLoader();
    expect(loader.type).toBe('data');
  });

  it('should estimate size for string data', () => {
    const loader = new DataLoader();
    const size = loader.estimateSize('test data');
    expect(size).toBe('test data'.length * 2);
  });

  it('should estimate size for object data', () => {
    const loader = new DataLoader();
    const data = { key: 'value' };
    const size = loader.estimateSize(data);
    expect(size).toBeGreaterThan(0);
  });
});

describe('MeshLoader', () => {
  it('should have correct type', () => {
    const loader = new MeshLoader();
    expect(loader.type).toBe('mesh');
  });

  it('should estimate size for ArrayBuffer', () => {
    const loader = new MeshLoader();
    const buffer = new ArrayBuffer(100);
    const size = loader.estimateSize(buffer);
    expect(size).toBe(100);
  });
});

describe('PriorityLoadQueue', () => {
  let manager: ResourceManager;
  let queue: PriorityLoadQueue;

  beforeEach(() => {
    manager = new ResourceManager();
    queue = new PriorityLoadQueue(manager);
  });

  it('should create queue with manager', () => {
    expect(queue.pending).toBe(0);
  });

  it('should set max concurrent', () => {
    queue.setMaxConcurrent(8);
    expect(queue.pending).toBe(0);
  });

  it('should clear queue', () => {
    queue.clear();
    expect(queue.pending).toBe(0);
  });
});

describe('VramBudgeter', () => {
  it('cinematic tier should have budget between 5GB and 6GB', () => {
    const budgeter = new VramBudgeter({ tier: 'cinematic' });
    const stats = budgeter.getStats();
    expect(stats.totalBudgetBytes).toBeGreaterThan(5 * 1024 * 1024 * 1024);
    expect(stats.totalBudgetBytes).toBeLessThan(6 * 1024 * 1024 * 1024);
  });

  it('standard tier should have budget between 1.5GB and 2.5GB', () => {
    const budgeter = new VramBudgeter({ tier: 'standard' });
    const stats = budgeter.getStats();
    expect(stats.totalBudgetBytes).toBeGreaterThan(1.5 * 1024 * 1024 * 1024);
    expect(stats.totalBudgetBytes).toBeLessThan(2.5 * 1024 * 1024 * 1024);
  });

  it('low tier should have budget less than 1GB', () => {
    const budgeter = new VramBudgeter({ tier: 'low' });
    const stats = budgeter.getStats();
    expect(stats.totalBudgetBytes).toBeLessThan(1024 * 1024 * 1024);
  });

  it('availableVramBytes should take min with tier default', () => {
    const budgeter = new VramBudgeter({
      tier: 'cinematic',
      availableVramBytes: 3 * 1024 * 1024 * 1024,
    });
    const stats = budgeter.getStats();
    expect(stats.totalBudgetBytes).toBe(3 * 1024 * 1024 * 1024);
  });

  it('primary target should get 50% budget and maxLod=0', () => {
    const budgeter = new VramBudgeter({ tier: 'standard' });
    budgeter.setPrimaryTarget('earth');
    const allocations = budgeter.allocate([
      { bodyId: 'earth', importance: 1, baseLod: 2 },
      { bodyId: 'mars', importance: 1, baseLod: 1 },
    ]);
    const earth = allocations.find((a) => a.bodyId === 'earth');
    const stats = budgeter.getStats();
    const expectedPrimary = stats.totalBudgetBytes * 0.95 * 0.5;
    expect(earth).toBeDefined();
    expect(earth?.isPrimary).toBe(true);
    expect(earth?.maxLod).toBe(0);
    expect(earth?.budgetBytes).toBeCloseTo(expectedPrimary, -2);
  });

  it('non-primary targets should be allocated by importance weights', () => {
    const budgeter = new VramBudgeter({ tier: 'standard' });
    budgeter.setPrimaryTarget('earth');
    const allocations = budgeter.allocate([
      { bodyId: 'earth', importance: 1, baseLod: 0 },
      { bodyId: 'mars', importance: 1, baseLod: 1 },
      { bodyId: 'venus', importance: 3, baseLod: 1 },
    ]);
    const mars = allocations.find((a) => a.bodyId === 'mars');
    const venus = allocations.find((a) => a.bodyId === 'venus');
    const stats = budgeter.getStats();
    const nonPrimaryPool = stats.totalBudgetBytes * 0.95 * 0.5;
    expect(mars?.budgetBytes).toBeCloseTo(nonPrimaryPool * 0.25, -2);
    expect(venus?.budgetBytes).toBeCloseTo(nonPrimaryPool * 0.75, -2);
  });

  it('non-primary maxLod should be at least 1', () => {
    const budgeter = new VramBudgeter({ tier: 'standard' });
    budgeter.setPrimaryTarget('earth');
    const allocations = budgeter.allocate([
      { bodyId: 'earth', importance: 1, baseLod: 0 },
      { bodyId: 'mars', importance: 1, baseLod: 0 },
    ]);
    const mars = allocations.find((a) => a.bodyId === 'mars');
    expect(mars?.maxLod).toBeGreaterThanOrEqual(1);
  });

  it('canAllocate should check against total budget', () => {
    const budgeter = new VramBudgeter({ tier: 'low' });
    const stats = budgeter.getStats();
    expect(budgeter.canAllocate(stats.totalBudgetBytes)).toBe(true);
    expect(budgeter.canAllocate(stats.totalBudgetBytes + 1)).toBe(false);
  });

  it('release should remove an allocation', () => {
    const budgeter = new VramBudgeter({ tier: 'standard' });
    budgeter.setPrimaryTarget('earth');
    budgeter.allocate([
      { bodyId: 'earth', importance: 1, baseLod: 0 },
      { bodyId: 'mars', importance: 1, baseLod: 1 },
    ]);
    expect(budgeter.getAllocation('mars')).toBeDefined();
    budgeter.release('mars');
    expect(budgeter.getAllocation('mars')).toBeUndefined();
  });

  it('setTier should change tier and mark dirty', () => {
    const budgeter = new VramBudgeter({ tier: 'standard' });
    budgeter.setTier('cinematic');
    expect(budgeter.getTier()).toBe('cinematic');
    expect(budgeter.isDirty()).toBe(true);
    const stats = budgeter.getStats();
    expect(stats.totalBudgetBytes).toBeGreaterThan(5 * 1024 * 1024 * 1024);
  });
});

describe('ResourceBundleManager', () => {
  let manager: ResourceManager;
  let bundleManager: ResourceBundleManager;

  beforeEach(() => {
    manager = new ResourceManager();
    manager.registerLoader(new MockDataLoader());
    bundleManager = new ResourceBundleManager(manager);
  });

  it('should register a bundle', () => {
    bundleManager.registerBundle({
      id: 'b1',
      resourceIds: ['r1', 'r2'],
      loaded: false,
      descriptors: [
        { id: 'r1', type: 'data', url: 'http://example.com/r1' },
        { id: 'r2', type: 'data', url: 'http://example.com/r2' },
      ],
    });
    const bundles = bundleManager.listBundles();
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.id).toBe('b1');
    expect(bundleManager.isBundleLoaded('b1')).toBe(false);
  });

  it('should load bundle using manager.load concurrently', async () => {
    const descriptors: ResourceDescriptor[] = [
      { id: 'r1', type: 'data', url: 'http://example.com/r1' },
      { id: 'r2', type: 'data', url: 'http://example.com/r2' },
    ];
    bundleManager.registerBundle({
      id: 'b1',
      resourceIds: descriptors.map((d) => d.id),
      loaded: false,
      descriptors,
    });
    await bundleManager.loadBundle('b1');
    expect(bundleManager.isBundleLoaded('b1')).toBe(true);
    expect(manager.getState('r1')).toBe('loaded');
    expect(manager.getState('r2')).toBe('loaded');
  });

  it('should unload bundle', async () => {
    const descriptors: ResourceDescriptor[] = [
      { id: 'r1', type: 'data', url: 'http://example.com/r1' },
    ];
    bundleManager.registerBundle({
      id: 'b1',
      resourceIds: descriptors.map((d) => d.id),
      loaded: false,
      descriptors,
    });
    await bundleManager.loadBundle('b1');
    expect(bundleManager.isBundleLoaded('b1')).toBe(true);
    bundleManager.unloadBundle('b1');
    expect(bundleManager.isBundleLoaded('b1')).toBe(false);
    expect(manager.getState('r1')).toBe('evicted');
  });

  it('should throw when loading an unregistered bundle', async () => {
    await expect(bundleManager.loadBundle('nonexistent')).rejects.toThrow();
  });
});

describe('RangeAwareDataLoader', () => {
  it('should have correct type', () => {
    const loader = new RangeAwareDataLoader();
    expect(loader.type).toBe('data');
  });

  it('should estimate size from ArrayBuffer byteLength', () => {
    const loader = new RangeAwareDataLoader();
    const buffer = new ArrayBuffer(256);
    const size = loader.estimateSize(buffer);
    expect(size).toBe(256);
  });
});

describe('createLazyResource', () => {
  let manager: ResourceManager;

  beforeEach(() => {
    manager = new ResourceManager();
    manager.registerLoader(new MockDataLoader());
  });

  it('should resolve with {default: data} when no transform is provided', async () => {
    const lazy = createLazyResource<string>(manager, {
      descriptor: { id: 'r1', type: 'data', url: 'http://example.com/r1' },
    });
    const result = await lazy();
    expect(result.default).toBe('mock-data');
  });

  it('should apply custom transform when provided', async () => {
    const lazy = createLazyResource<string>(manager, {
      descriptor: { id: 'r2', type: 'data', url: 'http://example.com/r2' },
      transform: (data) => ({ default: `transformed-${data}` }),
    });
    const result = await lazy();
    expect(result.default).toBe('transformed-mock-data');
  });
});