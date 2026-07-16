/**
 * 资源运行时测试
 */

import { describe, it, expect } from 'vitest';
import {
  ResourceIdImpl,
  ResourceMetaImpl,
  LRUCache,
  MemoryBudgetImpl,
} from '../index.js';

describe('ResourceId', () => {
  it('应正确创建 ResourceId', () => {
    const id = new ResourceIdImpl('texture', 'earth_albedo', 'S', 'P0');
    expect(id.type).toBe('texture');
    expect(id.name).toBe('earth_albedo');
    expect(id.tier).toBe('S');
    expect(id.precision).toBe('P0');
  });

  it('应正确序列化和反序列化', () => {
    const id = new ResourceIdImpl('mesh', 'moon', 'A', 'P1');
    const str = id.toString();
    const parsed = ResourceIdImpl.fromString(str);
    expect(parsed.type).toBe('mesh');
    expect(parsed.name).toBe('moon');
    expect(parsed.tier).toBe('A');
    expect(parsed.precision).toBe('P1');
  });
});

describe('ResourceMeta', () => {
  it('应正确创建 ResourceMeta', () => {
    const id = new ResourceIdImpl('data', 'test');
    const meta = new ResourceMetaImpl(id, 'https://example.com/test.bin', 1024, 'abc123', 'application/octet-stream');
    expect(meta.url).toBe('https://example.com/test.bin');
    expect(meta.size).toBe(1024);
    expect(meta.tier).toBe('B');
    expect(meta.precision).toBe('P2');
  });
});

describe('LRUCache', () => {
  it('应能设置和获取缓存项', () => {
    const cache = new LRUCache(1024);
    const entry = {
      data: new ArrayBuffer(100),
      meta: new ResourceMetaImpl(
        new ResourceIdImpl('data', 'test'),
        'url',
        100,
        'hash',
        'type',
      ),
      accessedAt: Date.now(),
      size: 100,
    };
    cache.set('key1', entry);
    expect(cache.has('key1')).toBe(true);
    expect(cache.get('key1')?.size).toBe(100);
  });

  it('应正确执行淘汰策略', () => {
    const cache = new LRUCache(200);
    const entry1 = {
      data: new ArrayBuffer(100),
      meta: new ResourceMetaImpl(
        new ResourceIdImpl('data', 'test1'),
        'url',
        100,
        'hash',
        'type',
      ),
      accessedAt: Date.now(),
      size: 150,
    };
    const entry2 = {
      data: new ArrayBuffer(100),
      meta: new ResourceMetaImpl(
        new ResourceIdImpl('data', 'test2'),
        'url',
        100,
        'hash',
        'type',
      ),
      accessedAt: Date.now(),
      size: 150,
    };
    cache.set('key1', entry1);
    cache.set('key2', entry2);
    expect(cache.count).toBeLessThanOrEqual(2);
  });

  it('应正确统计缓存状态', () => {
    const cache = new LRUCache(1000);
    const entry = {
      data: new ArrayBuffer(50),
      meta: new ResourceMetaImpl(
        new ResourceIdImpl('data', 'test'),
        'url',
        50,
        'hash',
        'type',
      ),
      accessedAt: Date.now(),
      size: 50,
    };
    cache.set('key', entry);
    const stats = cache.getStats();
    expect(stats.size).toBe(50);
    expect(stats.count).toBe(1);
    expect(stats.maxSize).toBe(1000);
  });
});

describe('MemoryBudget', () => {
  it('应能分配和释放内存', () => {
    const budget = new MemoryBudgetImpl(1000);
    expect(budget.allocate(100, 'texture')).toBe(true);
    expect(budget.used).toBe(100);
    expect(budget.textureMemory).toBe(100);
    budget.deallocate(50, 'texture');
    expect(budget.used).toBe(50);
  });

  it('应在超出限制时拒绝分配', () => {
    const budget = new MemoryBudgetImpl(100);
    expect(budget.allocate(150, 'buffer')).toBe(false);
  });

  it('应正确计算使用率', () => {
    const budget = new MemoryBudgetImpl(1000);
    budget.allocate(250, 'texture');
    expect(budget.getUsage()).toBe(25);
  });

  it('应正确返回统计信息', () => {
    const budget = new MemoryBudgetImpl(1000);
    budget.allocate(100, 'texture');
    budget.allocate(200, 'buffer');
    const stats = budget.getStats();
    expect(stats.total).toBe(1000);
    expect(stats.used).toBe(300);
    expect(stats.textureMemory).toBe(100);
    expect(stats.bufferMemory).toBe(200);
  });
});
