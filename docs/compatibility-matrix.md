# 浏览器与操作系统兼容性矩阵

> 设计基线：`docs/Web3D影视级太阳系项目完整设计文档.md` 第 32 节（行 2080–2128）。
>
> 本文档记录本项目发布时**正式验收**的浏览器/操作系统/GPU 驱动组合，以及 GPU 黑名单与 WebGPU 安全上下文策略。规则随静态版本发布，**不远程更新**；后续浏览器升级需要执行兼容回归（见第 6 节）。
>
> 文档版本：v1.0（2026-07-17）。维护方：项目维护者，参考 `docs/reviews/fragments/task13-fr-checklist.md` 中 FR-BOOT-001 ~ FR-BOOT-003 的实现证据。

---

## 1. 正式支持矩阵（设计 32.1）

### 1.1 Windows 10 / Windows 11

| 浏览器 | 支持等级 | 渲染后端 | 备注 |
|---|---|---|---|
| Chrome ≥ 121 | ✅ 正式支持 | WebGPU 优先 / WebGL2 兜底 | 影视级 1440p 验收基线浏览器 |
| Edge ≥ 121（Chromium 内核） | ✅ 正式支持 | WebGPU 优先 / WebGL2 兜底 | 与 Chrome 同源，等价正式支持 |
| Firefox ≥ 122 | 🟡 兼容支持 | WebGL2 / 降低特效 | 允许进入 WebGL2 或降低特效；不作为影视级正式基线 |
| Safari | ❌ 不承诺 | — | Windows 平台不验证 |
| 其他（Opera、Brave 等 Chromium 系） | ❌ 不承诺 | — | 用户自负风险 |

### 1.2 Linux / macOS

| 平台 | 支持等级 | 备注 |
|---|---|---|
| Linux（X11 / Wayland） | 🟡 尽力兼容 | 不作为首版正式验收阻塞项；需运行自动测试，但不保证所有 GPU 驱动组合 |
| macOS 12+（Intel / Apple Silicon） | 🟡 尽力兼容 | 同上；Apple Silicon 上 WebGPU 受系统版本限制 |

### 1.3 操作系统补丁版本（设计 32.2 版本冻结）

| 维度 | 正式验收版本 | 备注 |
|---|---|---|
| Windows 10 | 22H2（OS Build 19045.x）或更新 | 安装最新累积更新 |
| Windows 11 | 23H2（OS Build 22631.x）或更新 | 安装最新累积更新 |
| Linux 内核 | ≥ 6.1（LTS） | 主流发行版 Ubuntu 22.04 / Debian 12 / Fedora 39 |
| macOS | ≥ 13.5（Ventura） | Apple Silicon 与 Intel 均验证 |

---

## 2. 版本冻结（设计 32.2）

发布版本（`release/manifests/manifest.json` 中的 `version` 字段，当前 `0.1.0`）对应的运行时快照：

| 项目 | 冻结版本 | 证据 |
|---|---|---|
| Node.js | ≥ 20.0.0 LTS | `package.json:22` `engines.node` |
| pnpm | 10.28.1 | `package.json:7` `packageManager` |
| TypeScript | ^5.6.3 | `package.json:19` `devDependencies.typescript` |
| Vite | ^5.4.11 | `apps/web/package.json` |
| React | ^18.3.1 | `apps/web/package.json` |
| Three.js | 未使用 | 项目自研 renderer-core / renderer-webgpu / renderer-webgl2，无 `three` 依赖 |
| WebGPU 能力快照 | `maxTextureDimension2D ≥ 16384 → featureLevel: 'full'` | `packages/diagnostics/src/index.ts:167` `detectWebgpu()` |
| Rust（仅构建期） | ≥ 1.75 | `crates/astro-core`、`crates/ephemeris-runtime` 等编译需求 |
| wasm-pack | ≥ 0.12 | `package.json:13` `build:wasm` |

后续浏览器升级需要执行兼容回归（见第 6 节）。

---

## 3. WebGPU 安全上下文（设计 32.3）

WebGPU 仅在**安全上下文**中可用。本项目的部署形态（设计 31 节）与 WebGPU 可用性映射：

| 部署形态 | 上下文 | WebGPU 可用 | 兜底 | 启动器提示 |
|---|---|---|---|---|
| 单机 `http://localhost:8080` | 安全上下文（localhost 豁免） | ✅ 可用 | WebGL2 | `scripts/start.{ps1,sh}` 默认此模式 |
| 局域网 `https://<lan-ip>:8443` | 安全上下文（TLS） | ✅ 可用 | WebGL2 | 需 HTTPS 服务器（见下） |
| 普通内网 `http://<lan-ip>:8080` | 非安全上下文 | ❌ 不可用 | 强制 WebGL2 | 启动器检测并提示切换至 HTTPS |
| `file://` 直接打开 | 不支持 | ❌ 不可用 | — | 设计 31.2 明确禁止；服务器需 `pnpm dev` 或 `pnpm --filter @solar-system/server start` |

### 3.1 安全头（生产服务器，FR-OFFLINE-004）

`packages/server/src/server.ts:166-177` `buildSecurityHeaders()` 强制下发：

| 头 | 值 | 用途 |
|---|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` | 隔离浏览上下文，启用 SharedArrayBuffer / 高精度计时 |
| `Cross-Origin-Embedder-Policy` | `require-corp` | 配合 COOP 实现 crossOriginIsolated |
| `Cross-Origin-Resource-Policy` | `same-origin` | 限制跨域资源加载 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HSTS，强制 HTTPS（局域网 HTTPS 部署生效） |
| `Content-Security-Policy` | 见 `server.ts:73-84` `CSP_POLICY` | 禁止远程脚本/字体/CDN，允许 `wasm-unsafe-eval`（WASM 模块加载）与 `unsafe-inline` 样式（Tailwind 注入） |
| `X-Content-Type-Options` | `nosniff` | 禁止 MIME 嗅探 |
| `X-Frame-Options` | `DENY` | 禁止嵌入 iframe |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 限制 Referrer 泄漏 |

### 3.2 WebGPU 检测与降级链（FR-BOOT-003）

`packages/diagnostics/src/index.ts:132` `detectWebgpu()` 检测顺序：

1. `navigator.gpu` 不存在 → `supported: false`，进入 WebGL2 标准模式
2. `requestAdapter()` 返回 null → `supported: false`，进入 WebGL2 标准模式
3. `requestDevice()` 失败 → `supported: false`，进入 WebGL2 标准模式
4. `maxTextureDimension2D >= 16384` → `featureLevel: 'full'`（影视级 / 极高）
5. 否则 → `featureLevel: 'partial'`（标准模式降特效）

`recommendBackend()`（`packages/diagnostics/src/index.ts:295`）根据上述结果选择渲染后端。

---

## 4. GPU 驱动黑名单（设计 32.4）

项目维护**内部兼容规则**，规则随静态版本发布，**不远程更新**。

### 4.1 已知崩溃驱动（强制 WebGL2）

| GPU 厂商 | 驱动范围 | 平台 | 表现 | 处置 |
|---|---|---|---|---|
| Intel HD Graphics 4000（Ivy Bridge） | 全部 | Windows | WebGPU adapter 创建后浏览器进程崩溃 | 强制 WebGL2 标准模式 |
| AMD Radeon Software < 22.5.1 | < 22.5.1 | Windows | WebGPU compute shader 偶发 GPU 重置 | 强制 WebGL2 + 禁用计算着色器 |
| NVIDIA GeForce 驱动 < 536.x | < 536.x | Windows/Linux | `maxStorageBufferBindingSize` 上报异常小 | 限制 SSBO 尺寸到 64 MiB |
| Apple Silicon macOS < 13.5 | < 13.5 | macOS | WebGPU 不可用 | 走 WebGL2 路径 |

### 4.2 已知错误特性（禁用特定 Shader 路径）

| 特性 | 受影响组合 | 错误 | 处置 |
|---|---|---|---|
| `bgra8unorm` 渲染目标 | AMD Radeon + Chrome ≤ 120 | 颜色通道反转 | 强制 `rgba8unorm` |
| `float32-filterable` | Intel Arc A380 + Chrome ≤ 121 | 采样器返回 NaN | 不启用该 feature |
| 深度比较采样器 | NVIDIA + Firefox | 兼容性差 | WebGL2 路径走 `WEBGL_depth_texture` |
| Storage texture atomics | 全部 < featureLevel='full' | 不支持 | 影视级特效禁用 |

### 4.3 强制 WebGL2 与纹理尺寸限制

- `detectWebgpu()` 返回 `featureLevel: 'partial'` 时，自动降至 WebGL2 标准模式，且：
  - `maxTextureDimension2D` 上限取 `8192`（即便硬件支持更大，避免驱动缺陷）
  - 禁用 BC/ASTC 纹理压缩，回退到未压缩 RGBA8（`detectTextureCompression()` `packages/diagnostics/src/index.ts:204`）
  - 禁用 HDR 后处理路径
- WebGL2 不可用时（`detectWebgl2().supported === false`）：
  - 显示"浏览器不兼容"错误页（错误分类 `browser-incompatible`，设计 33.1）
  - 不进入模拟

### 4.4 黑名单维护

- 黑名单**仅随静态版本发布**，不通过任何远程配置更新（隐私约束，设计 34.1）。
- 黑名单条目需在 `packages/diagnostics/src/__tests__/detection.test.ts` 中具备回归用例。
- 新增条目时同步更新本表与 `docs/reviews/fragments/task13-fr-checklist.md` 中 FR-BOOT-003 的证据。

---

## 5. 兼容性回归测试

### 5.1 自动测试覆盖

| 测试文件 | 覆盖项 |
|---|---|
| `packages/diagnostics/src/__tests__/detection.test.ts` | `detectBrowser` / `detectOs` / `detectWebgpu` / `detectWebgl2` / `detectTextureCompression` 单元测试 |
| `packages/diagnostics/src/__tests__/benchmark.test.ts` | `runBenchmark` 性能基准 |
| `packages/server/src/__tests__/security-headers.test.ts` | COOP/COEP/CORP/HSTS/CSP/ETag/Range 12 项测试 |

### 5.2 兼容测试矩阵（设计 35.6）

每次发布前需在以下组合运行 smoke 测试（启动 + 加载 catalog.json + 求值地球星历）：

| GPU 厂商 | Chrome | Edge | Firefox |
|---|---|---|---|
| NVIDIA RTX 4070（影视级基线） | ✅ | ✅ | 🟡 |
| AMD RX 7800 XT（影视级基线） | ✅ | ✅ | 🟡 |
| Intel UHD 630（标准模式基线） | ✅ | ✅ | 🟡 |
| Apple M2（macOS） | 🟡 | — | 🟡 |

✅ = 必须通过；🟡 = 尽力通过，失败不阻塞发布。

### 5.3 启动器检测（FR-BOOT-001）

`scripts/verify.{ps1,sh}` 在启动前检查 7 项：

1. Node.js ≥ 20
2. pnpm ≥ 10
3. Rust + wasm-pack 可用
4. `node_modules` 已安装
5. `data-src/normalized/catalog.json` 存在
6. workspace 包符号链接完整
7. `pnpm typecheck` 通过

任一项失败即给出明确错误并退出，不进入模拟。

---

## 6. 兼容回归触发条件

发生以下任一情况时，需重新执行第 5 节回归矩阵：

| 触发条件 | 责任方 | 范围 |
|---|---|---|
| Chrome / Edge / Firefox 主版本升级 | 维护者 | 全矩阵 |
| WebGPU API 规范变更（工作组草案更新） | 维护者 | WebGPU 检测 + 影视级基线 |
| GPU 驱动大版本升级（NVIDIA / AMD / Intel） | 维护者 | 对应厂商组合 |
| macOS / Windows 主版本升级 | 维护者 | 对应平台组合 |
| 项目 `renderer-webgpu` / `renderer-webgl2` 主版本升级 | 维护者 | 全矩阵 |
| 新增 GPU 黑名单条目 | 维护者 | 黑名单条目对应组合 |

回归失败时，需更新本矩阵第 1 / 2 / 4 节并发布新版本（`release/manifests/manifest.json` 中的 `version` 字段）。

---

## 附：与设计文档的对应关系

| 设计章节 | 本文档章节 |
|---|---|
| 32.1 正式支持矩阵 | 第 1 节 |
| 32.2 版本冻结 | 第 2 节 |
| 32.3 WebGPU 安全上下文 | 第 3 节 |
| 32.4 GPU 驱动黑名单 | 第 4 节 |
| 35.6 兼容测试 | 第 5 节 |
| 33.4 本地诊断包 | `docs/reviews/fragments/task14-nfr-acceptance.md` |
