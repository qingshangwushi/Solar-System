import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResourceManager,
  TextureLoader,
  ShaderLoader,
  DataLoader,
  MeshLoader,
  PriorityLoadQueue,
  ResourceDescriptor,
} from '../index.js';

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