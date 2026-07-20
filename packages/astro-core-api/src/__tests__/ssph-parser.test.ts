/**
 * SSPH 二进制星历解析器测试。
 *
 * 验证：
 * - 正确解析魔数 / 版本 / body_id / frame / precision / segment_count；
 * - 逐段解析 t_start / t_end / coef_count / coef_x / coef_y / coef_z；
 * - body_id 覆盖（NAIF ID 替换简化 ID）；
 * - 序列化为 JSON 与 Rust BodyEphemeris serde 形态一致；
 * - 错误情况：魔数不匹配 / 版本不支持 / 数据截断 / 未知变体序号。
 *
 * 与 `tools/ephemeris-pipeline/build_ephemeris.py` 的 write_compact_binary
 * 写出格式一一对应；测试数据为手工构造的精简 SSPH 二进制。
 */
import { describe, it, expect } from 'vitest';
import {
  parseSsph,
  parseSsphToJson,
  serializeBodyEphemerisToJson,
  SsphParseError,
} from '../ssph-parser.js';

/** 构造 SSPH 二进制（小端 LE），与 Python write_compact_binary 格式一致。 */
function buildSsph(opts: {
  bodyId: number;
  frame: number;
  precision: number;
  segments: Array<{ tStart: number; tEnd: number; coefX: number[]; coefY: number[]; coefZ: number[] }>;
  version?: number;
  magic?: string;
}): ArrayBuffer {
  const segCount = opts.segments.length;
  // 头部：4(magic) + 4(version) + 8(body_id) + 1(frame) + 1(precision) + 4(seg_count) = 22
  let totalBytes = 22;
  for (const s of opts.segments) {
    // 8(t_start) + 8(t_end) + 4(coef_count) + 3*N*8
    const n = s.coefX.length;
    totalBytes += 8 + 8 + 4 + 3 * n * 8;
  }
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  let off = 0;
  // magic
  const magic = opts.magic ?? 'SSPH';
  for (let i = 0; i < 4; i++) {
    view.setUint8(off + i, magic.charCodeAt(i));
  }
  off += 4;
  // version
  view.setUint32(off, opts.version ?? 1, true);
  off += 4;
  // body_id (u64 LE)
  view.setUint32(off, opts.bodyId, true);
  view.setUint32(off + 4, 0, true);
  off += 8;
  // frame / precision
  view.setUint8(off, opts.frame);
  off += 1;
  view.setUint8(off, opts.precision);
  off += 1;
  // segment_count
  view.setUint32(off, segCount, true);
  off += 4;
  // segments
  for (const s of opts.segments) {
    view.setFloat64(off, s.tStart, true);
    off += 8;
    view.setFloat64(off, s.tEnd, true);
    off += 8;
    const n = s.coefX.length;
    view.setUint32(off, n, true);
    off += 4;
    for (let k = 0; k < n; k++) {
      view.setFloat64(off + k * 8, s.coefX[k]!, true);
    }
    off += n * 8;
    for (let k = 0; k < n; k++) {
      view.setFloat64(off + k * 8, s.coefY[k]!, true);
    }
    off += n * 8;
    for (let k = 0; k < n; k++) {
      view.setFloat64(off + k * 8, s.coefZ[k]!, true);
    }
    off += n * 8;
  }
  expect(off).toBe(totalBytes);
  return buf;
}

describe('SSPH 解析器', () => {
  it('正确解析单段星历（含非零系数）', () => {
    const buf = buildSsph({
      bodyId: 3,
      frame: 1, // HeliocentricInertial
      precision: 2, // P2
      segments: [
        {
          tStart: 51544.0,
          tEnd: 51574.0,
          coefX: [100.0, 200.0, 300.0],
          coefY: [10.0, 20.0, 30.0],
          coefZ: [1.0, 2.0, 3.0],
        },
      ],
    });
    const eph = parseSsph(buf);
    expect(eph.body_id).toBe(3);
    expect(eph.frame).toBe('HeliocentricInertial');
    expect(eph.precision).toBe('P2');
    expect(eph.segments).toHaveLength(1);
    expect(eph.segments[0]!.t_start).toBe(51544.0);
    expect(eph.segments[0]!.t_end).toBe(51574.0);
    expect(eph.segments[0]!.coef_x).toEqual([100.0, 200.0, 300.0]);
    expect(eph.segments[0]!.coef_y).toEqual([10.0, 20.0, 30.0]);
    expect(eph.segments[0]!.coef_z).toEqual([1.0, 2.0, 3.0]);
  });

  it('正确解析多段星历', () => {
    const buf = buildSsph({
      bodyId: 399,
      frame: 1,
      precision: 3, // P3
      segments: [
        { tStart: 15020, tEnd: 33282, coefX: [1], coefY: [2], coefZ: [3] },
        { tStart: 33282, tEnd: 51544, coefX: [4], coefY: [5], coefZ: [6] },
        { tStart: 51544, tEnd: 69806, coefX: [7], coefY: [8], coefZ: [9] },
      ],
    });
    const eph = parseSsph(buf);
    expect(eph.body_id).toBe(399);
    expect(eph.precision).toBe('P3');
    expect(eph.segments).toHaveLength(3);
    expect(eph.segments[2]!.coef_x).toEqual([7]);
  });

  it('body_id 覆盖：NAIF ID 替换简化 ID', () => {
    // 二进制内 body_id=0（简化太阳 ID），覆盖为 10（NAIF 太阳 ID）
    const buf = buildSsph({
      bodyId: 0,
      frame: 1,
      precision: 2,
      segments: [{ tStart: 15020, tEnd: 88069, coefX: [0], coefY: [0], coefZ: [0] }],
    });
    const eph = parseSsph(buf, 10);
    expect(eph.body_id).toBe(10); // 覆盖为 NAIF ID
  });

  it('不提供覆盖时使用二进制内 body_id', () => {
    const buf = buildSsph({
      bodyId: 301,
      frame: 1,
      precision: 2,
      segments: [{ tStart: 15020, tEnd: 88069, coefX: [0], coefY: [0], coefZ: [0] }],
    });
    const eph = parseSsph(buf);
    expect(eph.body_id).toBe(301);
  });

  it('frame 变体序号映射全部正确', () => {
    const frames = [
      'SolarSystemBarycentricInertial',
      'HeliocentricInertial',
      'BodyBarycentric',
      'BodyFixed',
      'SurfaceLocalEnu',
      'ObserverRelative',
    ];
    for (let i = 0; i < frames.length; i++) {
      const buf = buildSsph({
        bodyId: 0,
        frame: i,
        precision: 2,
        segments: [{ tStart: 0, tEnd: 1, coefX: [0], coefY: [0], coefZ: [0] }],
      });
      expect(parseSsph(buf).frame).toBe(frames[i]);
    }
  });

  it('precision 变体序号映射全部正确', () => {
    const precisions = ['P0', 'P1', 'P2', 'P3', 'P4'];
    for (let i = 0; i < precisions.length; i++) {
      const buf = buildSsph({
        bodyId: 0,
        frame: 1,
        precision: i,
        segments: [{ tStart: 0, tEnd: 1, coefX: [0], coefY: [0], coefZ: [0] }],
      });
      expect(parseSsph(buf).precision).toBe(precisions[i]);
    }
  });

  it('serializeBodyEphemerisToJson 输出与 Rust serde 形态一致', () => {
    const buf = buildSsph({
      bodyId: 10,
      frame: 1,
      precision: 2,
      segments: [
        { tStart: 15020.0, tEnd: 33282.25, coefX: [0.0, 0.0], coefY: [0.0, 0.0], coefZ: [0.0, 0.0] },
      ],
    });
    const eph = parseSsph(buf);
    const json = serializeBodyEphemerisToJson(eph);
    const obj = JSON.parse(json);
    expect(obj.body_id).toBe(10);
    expect(obj.frame).toBe('HeliocentricInertial');
    expect(obj.precision).toBe('P2');
    expect(obj.segments).toHaveLength(1);
    expect(obj.segments[0].t_start).toBe(15020.0);
    expect(obj.segments[0].t_end).toBe(33282.25);
    expect(obj.segments[0].coef_x).toEqual([0.0, 0.0]);
    expect(obj.segments[0].coef_y).toEqual([0.0, 0.0]);
    expect(obj.segments[0].coef_z).toEqual([0.0, 0.0]);
  });

  it('parseSsphToJson 等价于 parseSsph + serialize', () => {
    const buf = buildSsph({
      bodyId: 399,
      frame: 1,
      precision: 2,
      segments: [{ tStart: 0, tEnd: 1, coefX: [1.5], coefY: [2.5], coefZ: [3.5] }],
    });
    const direct = parseSsphToJson(buf, 399);
    const indirect = serializeBodyEphemerisToJson(parseSsph(buf, 399));
    expect(direct).toBe(indirect);
  });

  it('错误：魔数不匹配抛 SsphParseError', () => {
    const buf = buildSsph({
      bodyId: 0,
      frame: 1,
      precision: 2,
      magic: 'XXXX',
      segments: [{ tStart: 0, tEnd: 1, coefX: [0], coefY: [0], coefZ: [0] }],
    });
    expect(() => parseSsph(buf)).toThrow(SsphParseError);
    expect(() => parseSsph(buf)).toThrow(/魔数不匹配/);
  });

  it('错误：版本不支持抛 SsphParseError', () => {
    const buf = buildSsph({
      bodyId: 0,
      frame: 1,
      precision: 2,
      version: 999,
      segments: [{ tStart: 0, tEnd: 1, coefX: [0], coefY: [0], coefZ: [0] }],
    });
    expect(() => parseSsph(buf)).toThrow(/版本不支持/);
  });

  it('错误：数据过短抛 SsphParseError', () => {
    const buf = new ArrayBuffer(10);
    expect(() => parseSsph(buf)).toThrow(/数据过短/);
  });

  it('错误：未知 frame 变体序号抛 SsphParseError', () => {
    const buf = buildSsph({
      bodyId: 0,
      frame: 99,
      precision: 2,
      segments: [{ tStart: 0, tEnd: 1, coefX: [0], coefY: [0], coefZ: [0] }],
    });
    expect(() => parseSsph(buf)).toThrow(/ReferenceFrame/);
  });

  it('错误：未知 precision 变体序号抛 SsphParseError', () => {
    const buf = buildSsph({
      bodyId: 0,
      frame: 1,
      precision: 99,
      segments: [{ tStart: 0, tEnd: 1, coefX: [0], coefY: [0], coefZ: [0] }],
    });
    expect(() => parseSsph(buf)).toThrow(/Precision/);
  });

  it('错误：段数据越界抛 SsphParseError', () => {
    // 构造一个声称有段但数据不足的 buffer
    const buf = new ArrayBuffer(22 + 8 + 8 + 4); // 头 + 段头但无系数数据
    const view = new DataView(buf);
    // magic
    for (let i = 0; i < 4; i++) view.setUint8(i, 'SSPH'.charCodeAt(i));
    view.setUint32(4, 1, true); // version
    view.setUint32(8, 0, true); view.setUint32(12, 0, true); // body_id
    view.setUint8(16, 1); // frame
    view.setUint8(17, 2); // precision
    view.setUint32(18, 1, true); // segment_count = 1
    // 段头
    view.setFloat64(22, 0, true); // t_start
    view.setFloat64(30, 1, true); // t_end
    view.setUint32(38, 5, true); // coef_count = 5，但 buffer 无更多数据
    expect(() => parseSsph(buf)).toThrow(/越界/);
  });

  it('解析真实 ephemeris-10.bin（Sun，全零系数）', async () => {
    // 读取项目内的真实二进制文件验证端到端解析
    // 注意：vitest 环境下 fetch 不可用，此处通过动态 import + fs 读取
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.resolve(
      __dirname,
      '../../../../apps/web/public/data/ephemeris-10.bin',
    );
    if (!fs.existsSync(filePath)) {
      console.warn('[ssph-parser.test] 跳过真实文件测试：', filePath, '不存在');
      return;
    }
    const data = fs.readFileSync(filePath);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const eph = parseSsph(buf, 10); // 用 NAIF ID 10 覆盖
    expect(eph.body_id).toBe(10);
    expect(eph.frame).toBe('HeliocentricInertial');
    expect(eph.precision).toBe('P2');
    // 修复 E-43 后：自适应分段，段长上限 365 天 → 200 年范围 ≈ 201 段
    // （原固定 4 段对长周期天体导致切比雪夫发散）
    expect(eph.segments.length).toBeGreaterThanOrEqual(200);
    expect(eph.segments.length).toBeLessThanOrEqual(65536);
    // Sun 全零系数（太阳在日心系原点，所有段所有系数恒为 0）
    for (const seg of eph.segments) {
      for (const c of seg.coef_x) expect(c).toBe(0);
      for (const c of seg.coef_y) expect(c).toBe(0);
      for (const c of seg.coef_z) expect(c).toBe(0);
    }
    // 覆盖范围 1900-2100（MJD 15020.0 ~ 88069.0）
    expect(eph.segments[0]!.t_start).toBeCloseTo(15020.0, 3);
    expect(eph.segments[eph.segments.length - 1]!.t_end).toBeCloseTo(88069.0, 3);
  });

  it('解析真实 ephemeris-301.bin（Moon，短周期高分段数）', async () => {
    // 验证修复 E-45：SSPH 解析器段数上限从 1024 提升到 65536，
    // 支持月球 27 天周期 × 200 年 ≈ 2673 段的解析需求。
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.resolve(
      __dirname,
      '../../../../apps/web/public/data/ephemeris-301.bin',
    );
    if (!fs.existsSync(filePath)) {
      console.warn('[ssph-parser.test] 跳过真实文件测试：', filePath, '不存在');
      return;
    }
    const data = fs.readFileSync(filePath);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    // 月球 NAIF ID 与简化 ID 均为 301，无需覆盖
    const eph = parseSsph(buf);
    expect(eph.body_id).toBe(301);
    expect(eph.frame).toBe('HeliocentricInertial');
    expect(eph.precision).toBe('P2');
    // 月球周期 27.32 天，200 年范围内应有 ~2670 段（>1024 旧上限）
    expect(eph.segments.length).toBeGreaterThan(1024);
    expect(eph.segments.length).toBeLessThanOrEqual(65536);
    // 每段系数长度 = 8（7 阶切比雪夫）
    for (const seg of eph.segments) {
      expect(seg.coef_x).toHaveLength(8);
      expect(seg.coef_y).toHaveLength(8);
      expect(seg.coef_z).toHaveLength(8);
    }
    // 覆盖范围 1900-2100
    expect(eph.segments[0]!.t_start).toBeCloseTo(15020.0, 3);
    expect(eph.segments[eph.segments.length - 1]!.t_end).toBeCloseTo(88069.0, 3);
  });
});
