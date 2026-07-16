/**
 * SphereGeometry 顶点生成测试（任务 T-P0-06 / 修复 E-10）。
 *
 * 验证：
 * 1. 构造时调用 renderer.createBuffer 创建顶点/索引缓冲；
 * 2. vertexCount / indexCount 与生成数据长度一致；
 * 3. 顶点位置位于球面上（到原点距离 ≈ radius）；
 * 4. 法线为单位长度；
 * 5. UV 在 [0,1] 范围内、索引在顶点范围内。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SphereGeometry,
  type BufferDescriptor,
  type BufferHandle,
  type Renderer,
} from '../index.js';

function createMockRenderer() {
  const descriptors: BufferDescriptor[] = [];
  let counter = 0;
  const createBuffer = vi.fn((desc: BufferDescriptor): BufferHandle => {
    descriptors.push(desc);
    return { id: `buf-${counter++}`, usage: desc.usage };
  });
  const renderer = { createBuffer } as unknown as Renderer;
  return { renderer, createBuffer, descriptors };
}

describe('SphereGeometry', () => {
  it('creates vertex and index buffers via renderer.createBuffer', () => {
    const { renderer, createBuffer } = createMockRenderer();
    const geo = new SphereGeometry(renderer, 2, 8, 4);

    expect(createBuffer).toHaveBeenCalledTimes(2);
    expect(geo.vertexBuffer).toBeDefined();
    expect(geo.indexBuffer).toBeDefined();
    // Buffers stored on the instance are the real handles returned by the renderer.
    expect(geo.vertexBuffer.id).toMatch(/^buf-/);
    expect(geo.indexBuffer?.id).toMatch(/^buf-/);
    expect(geo.indexBuffer?.id).not.toBe(geo.vertexBuffer.id);
  });

  it('passes correctly-sized ArrayBuffers to createBuffer', () => {
    const { renderer, descriptors } = createMockRenderer();
    const geo = new SphereGeometry(renderer, 2, 8, 4);

    expect(descriptors).toHaveLength(2);
    const vertexDesc = descriptors[0]!;
    const indexDesc = descriptors[1]!;

    expect(vertexDesc.data).toBeInstanceOf(ArrayBuffer);
    expect(indexDesc.data).toBeInstanceOf(ArrayBuffer);
    // 8 floats (pos3 + normal3 + uv2) per vertex.
    expect(vertexDesc.size).toBe(geo.vertexCount * 8 * 4);
    expect(vertexDesc.size).toBe(vertexDesc.data!.byteLength);
    expect(indexDesc.size).toBe((geo.indexCount ?? 0) * 4);
    expect(indexDesc.size).toBe(indexDesc.data!.byteLength);
    expect(vertexDesc.usage).toBe('static');
    expect(indexDesc.usage).toBe('static');
  });

  it('vertexCount and indexCount match the generated data length', () => {
    const { renderer } = createMockRenderer();
    const widthSegments = 8;
    const heightSegments = 4;
    const geo = new SphereGeometry(renderer, 2, widthSegments, heightSegments);

    const expectedVertexCount = (widthSegments + 1) * (heightSegments + 1);
    const expectedIndexCount = widthSegments * heightSegments * 6;

    expect(geo.vertexCount).toBe(expectedVertexCount);
    expect(geo.indexCount).toBe(expectedIndexCount);
    expect(geo.positions.length).toBe(expectedVertexCount * 3);
    expect(geo.normals.length).toBe(expectedVertexCount * 3);
    expect(geo.uvs.length).toBe(expectedVertexCount * 2);
    expect(geo.indices.length).toBe(expectedIndexCount);
  });

  it('positions lie on the sphere surface (distance from origin ≈ radius)', () => {
    const { renderer } = createMockRenderer();
    const radius = 2.5;
    const geo = new SphereGeometry(renderer, radius, 12, 8);

    for (let i = 0; i < geo.vertexCount; i++) {
      const x = geo.positions[i * 3] as number;
      const y = geo.positions[i * 3 + 1] as number;
      const z = geo.positions[i * 3 + 2] as number;
      const dist = Math.hypot(x, y, z);
      expect(dist).toBeCloseTo(radius, 5);
    }
  });

  it('normals are unit length', () => {
    const { renderer } = createMockRenderer();
    const geo = new SphereGeometry(renderer, 3, 12, 8);

    for (let i = 0; i < geo.vertexCount; i++) {
      const nx = geo.normals[i * 3] as number;
      const ny = geo.normals[i * 3 + 1] as number;
      const nz = geo.normals[i * 3 + 2] as number;
      const len = Math.hypot(nx, ny, nz);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it('uv coordinates are within [0, 1]', () => {
    const { renderer } = createMockRenderer();
    const geo = new SphereGeometry(renderer, 1, 8, 4);

    for (let i = 0; i < geo.vertexCount; i++) {
      const u = geo.uvs[i * 2] as number;
      const v = geo.uvs[i * 2 + 1] as number;
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('all indices reference valid vertices', () => {
    const { renderer } = createMockRenderer();
    const geo = new SphereGeometry(renderer, 1, 8, 4);

    for (let i = 0; i < geo.indices.length; i++) {
      const idx = geo.indices[i] as number;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(geo.vertexCount);
    }
  });

  it('uses default segments when width/height segments are omitted', () => {
    const { renderer, createBuffer } = createMockRenderer();
    const geo = new SphereGeometry(renderer, 1);

    expect(geo.widthSegments).toBe(32);
    expect(geo.heightSegments).toBe(16);
    expect(geo.vertexCount).toBe(33 * 17);
    expect(geo.indexCount).toBe(32 * 16 * 6);
    expect(createBuffer).toHaveBeenCalledTimes(2);
  });
});
