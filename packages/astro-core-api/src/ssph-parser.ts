/**
 * SSPH 紧凑二进制星历解析器（设计文档 14.2 / 修复 E-12、E-42）。
 *
 * 与 `tools/ephemeris-pipeline/build_ephemeris.py` 的 `write_compact_binary`
 * 写出的格式一一对应，供主线程在 `phaseResourceLoad` 阶段把
 * `ephemeris-<bodyId>.bin` 解析为 WASM `registerEphemeris` 接受的 JSON 字符串。
 *
 * 二进制布局（小端 LE）：
 *     magic            : 4 bytes  = b"SSPH"
 *     version          : u32 LE   = 1
 *     body_id          : u64 LE
 *     frame            : u8       (ReferenceFrame 变体序号)
 *     precision        : u8       (Precision 变体序号)
 *     segment_count    : u32 LE
 *     for each segment:
 *         t_start      : f64 LE
 *         t_end        : f64 LE
 *         coef_count   : u32 LE   (x/y/z 共用同一长度)
 *         coef_x       : coef_count * f64 LE
 *         coef_y       : coef_count * f64 LE
 *         coef_z       : coef_count * f64 LE
 *
 * 变体序号与 Rust 枚举声明顺序一致：
 * - ReferenceFrame：0=SolarSystemBarycentricInertial, 1=HeliocentricInertial,
 *   2=BodyBarycentric, 3=BodyFixed, 4=SurfaceLocalEnu, 5=ObserverRelative
 * - Precision：0=P0, 1=P1, 2=P2, 3=P3, 4=P4
 *
 * 设计原则（设计文档 9.3、14.3）：
 * - 解析失败必须显式抛错，不得返回伪数据（FR-ASTRO-004 不输出伪高精度）。
 * - 解析器为纯函数，无副作用，便于单元测试。
 * - 输出 JSON 字符串与 Rust `BodyEphemeris` serde 序列化形态一致，
 *   直接传给 `wasm.registerEphemeris(bodyJson)`。
 */

/** ReferenceFrame 变体序号 → 字符串名（与 crates/coordinate-system/src/frame.rs 对齐）。 */
const FRAME_BY_INDEX: readonly string[] = [
  'SolarSystemBarycentricInertial',
  'HeliocentricInertial',
  'BodyBarycentric',
  'BodyFixed',
  'SurfaceLocalEnu',
  'ObserverRelative',
] as const;

/** Precision 变体序号 → 字符串名（与 crates/ephemeris-runtime/src/provider.rs 对齐）。 */
const PRECISION_BY_INDEX: readonly string[] = ['P0', 'P1', 'P2', 'P3', 'P4'] as const;

/** SSPH 魔数。 */
const SSPH_MAGIC = 0x48505353; // "SSPH" little-endian: 0x53 0x53 0x50 0x48

/** 当前支持的 SSPH 版本。 */
const SSPH_SUPPORTED_VERSION = 1;

/** 单个切比雪夫段的解析结果（与 Rust `ChebyshevSegment` 字段名一致）。 */
export interface SsphSegment {
  t_start: number;
  t_end: number;
  coef_x: number[];
  coef_y: number[];
  coef_z: number[];
}

/** 单个天体星历的解析结果（与 Rust `BodyEphemeris` 字段名一致）。 */
export interface SsphBodyEphemeris {
  body_id: number;
  frame: string;
  precision: string;
  segments: SsphSegment[];
}

/** SSPH 解析错误。 */
export class SsphParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsphParseError';
  }
}

/**
 * 解析 SSPH 二进制为 `SsphBodyEphemeris` 结构。
 *
 * @param buffer 二进制数据（来自 `ephemeris-<bodyId>.bin`）
 * @param bodyIdOverride 可选，覆盖二进制中的 body_id。
 *   用途：星历二进制由 Python 管线用“简化 ID”（0=太阳, 3=地球, 301=月球）写出，
 *   但运行时编排器按 NAIF ID（10=太阳, 399=地球, 301=月球）索引天体。
 *   调用方可传入 NAIF ID 覆盖，使注册到 WASM 的 body_id 与 catalog/编排器一致。
 * @throws SsphParseError 解析失败（魔数/版本/字段越界等）
 */
export function parseSsph(buffer: ArrayBuffer, bodyIdOverride?: number): SsphBodyEphemeris {
  if (!buffer || buffer.byteLength < 22) {
    throw new SsphParseError(`SSPH 数据过短：${buffer?.byteLength ?? 0} 字节（至少需要 22 字节头）`);
  }
  const view = new DataView(buffer);
  let off = 0;

  // 1. 魔数
  const magic = view.getUint32(off, true);
  off += 4;
  if (magic !== SSPH_MAGIC) {
    // 把 4 字节当作 ASCII 显示，便于调试
    const bytes = new Uint8Array(buffer, 0, 4);
    const ascii = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    throw new SsphParseError(`SSPH 魔数不匹配：期望 "SSPH"，实际 0x${magic.toString(16)} ("${ascii}")`);
  }

  // 2. 版本
  const version = view.getUint32(off, true);
  off += 4;
  if (version !== SSPH_SUPPORTED_VERSION) {
    throw new SsphParseError(`SSPH 版本不支持：${version}（当前仅支持 ${SSPH_SUPPORTED_VERSION}）`);
  }

  // 3. body_id（u64 LE；JS Number 可安全表示至 2^53，body_id 远小于此）
  const bodyIdLow = view.getUint32(off, true);
  const bodyIdHigh = view.getUint32(off + 4, true);
  off += 8;
  const bodyIdFromFile = bodyIdHigh * 0x100000000 + bodyIdLow;
  const bodyId = bodyIdOverride ?? bodyIdFromFile;

  // 4. frame / precision
  const frameIdx = view.getUint8(off);
  off += 1;
  const precisionIdx = view.getUint8(off);
  off += 1;
  if (frameIdx >= FRAME_BY_INDEX.length) {
    throw new SsphParseError(`未知的 ReferenceFrame 变体序号：${frameIdx}`);
  }
  if (precisionIdx >= PRECISION_BY_INDEX.length) {
    throw new SsphParseError(`未知的 Precision 变体序号：${precisionIdx}`);
  }
  const frame = FRAME_BY_INDEX[frameIdx]!;
  const precision = PRECISION_BY_INDEX[precisionIdx]!;

  // 5. segment_count
  const segmentCount = view.getUint32(off, true);
  off += 4;
  // 上限 65536：覆盖短周期天体在 200 年范围内的分段需求
  // （例如月球 27 天周期 × 200 年 ≈ 2670 段），同时仍能拦截损坏文件。
  if (segmentCount > 65536) {
    throw new SsphParseError(`SSPH 段数异常：${segmentCount}（上限 65536）`);
  }

  // 6. 逐段解析
  const segments: SsphSegment[] = [];
  for (let i = 0; i < segmentCount; i++) {
    if (off + 16 > buffer.byteLength) {
      throw new SsphParseError(`SSPH 段 ${i} 头部越界：offset=${off}, buffer=${buffer.byteLength}`);
    }
    const tStart = view.getFloat64(off, true);
    off += 8;
    const tEnd = view.getFloat64(off, true);
    off += 8;
    if (off + 4 > buffer.byteLength) {
      throw new SsphParseError(`SSPH 段 ${i} coef_count 越界：offset=${off}`);
    }
    const coefCount = view.getUint32(off, true);
    off += 4;
    if (coefCount > 1024) {
      throw new SsphParseError(`SSPH 段 ${i} 系数长度异常：${coefCount}（上限 1024）`);
    }
    const segBytes = coefCount * 8;
    const xyzBytes = segBytes * 3;
    if (off + xyzBytes > buffer.byteLength) {
      throw new SsphParseError(
        `SSPH 段 ${i} 系数数据越界：需要 ${xyzBytes} 字节，剩余 ${buffer.byteLength - off}`,
      );
    }
    const coefX = new Array<number>(coefCount);
    const coefY = new Array<number>(coefCount);
    const coefZ = new Array<number>(coefCount);
    for (let k = 0; k < coefCount; k++) {
      coefX[k] = view.getFloat64(off + k * 8, true);
    }
    off += segBytes;
    for (let k = 0; k < coefCount; k++) {
      coefY[k] = view.getFloat64(off + k * 8, true);
    }
    off += segBytes;
    for (let k = 0; k < coefCount; k++) {
      coefZ[k] = view.getFloat64(off + k * 8, true);
    }
    off += segBytes;
    segments.push({ t_start: tStart, t_end: tEnd, coef_x: coefX, coef_y: coefY, coef_z: coefZ });
  }

  if (off !== buffer.byteLength) {
    // 尾部多余字节不致命，但记录警告（便于调试管线写入与读取不一致）
    // 不抛错：向前兼容未来添加的可选尾部字段。
    // eslint-disable-next-line no-console
    console.warn(
      `[ssph-parser] body_id=${bodyId} 解析后剩余 ${buffer.byteLength - off} 字节未消费（可能为未来版本字段）`,
    );
  }

  return { body_id: bodyId, frame, precision, segments };
}

/**
 * 将解析结果序列化为 WASM `registerEphemeris` 接受的 JSON 字符串。
 *
 * JSON 形态与 Rust `BodyEphemeris` 的 serde 序列化一致：
 * ```json
 * {
 *   "body_id": 10,
 *   "frame": "HeliocentricInertial",
 *   "precision": "P2",
 *   "segments": [
 *     { "t_start": 15020.0, "t_end": 33282.25,
 *       "coef_x": [...], "coef_y": [...], "coef_z": [...] }
 *   ]
 * }
 * ```
 */
export function serializeBodyEphemerisToJson(eph: SsphBodyEphemeris): string {
  return JSON.stringify(eph);
}

/**
 * 便捷：解析 SSPH 二进制并直接序列化为 JSON 字符串。
 *
 * 等价于 `serializeBodyEphemerisToJson(parseSsph(buffer, bodyIdOverride))`。
 */
export function parseSsphToJson(buffer: ArrayBuffer, bodyIdOverride?: number): string {
  return serializeBodyEphemerisToJson(parseSsph(buffer, bodyIdOverride));
}