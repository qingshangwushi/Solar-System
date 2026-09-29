/**
 * Graphics capability detection.
 *
 * The specification requires graceful degradation rather than a blank screen:
 *   WebGPU -> WebGL2 -> WebGL1, and a clear message when neither is available.
 * three.js r160+ needs WebGL2 for its renderer, so an exhibition machine without
 * WebGL2 gets an explicit, readable notice instead of a crashed page.
 */

export type GraphicsBackend = 'webgl2' | 'webgl1' | 'none'

export interface GraphicsCapability {
  backend: GraphicsBackend
  /** Human-readable renderer string when it can be read (useful in diagnostics). */
  renderer: string | null
  webgpu: boolean
  error: string | null
}

export function detectGraphicsCapability(): GraphicsCapability {
  if (typeof document === 'undefined') {
    return { backend: 'none', renderer: null, webgpu: false, error: 'no DOM available' }
  }
  const canvas = document.createElement('canvas')
  let error: string | null = null
  let renderer: string | null = null

  const describe = (context: WebGLRenderingContext | WebGL2RenderingContext): string | null => {
    try {
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
      if (!debugInfo) return null
      return String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '') || null
    } catch {
      return null
    }
  }

  try {
    const webgl2 = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
    if (webgl2) {
      renderer = describe(webgl2 as WebGL2RenderingContext)
      const lose = webgl2.getExtension('WEBGL_lose_context')
      lose?.loseContext()
      return {
        backend: 'webgl2',
        renderer,
        webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
        error: null,
      }
    }
  } catch (exception) {
    error = String(exception)
  }

  try {
    const webgl1 = canvas.getContext('webgl')
    if (webgl1) {
      renderer = describe(webgl1 as WebGLRenderingContext)
      const lose = webgl1.getExtension('WEBGL_lose_context')
      lose?.loseContext()
      return {
        backend: 'webgl1',
        renderer,
        webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
        error: null,
      }
    }
  } catch (exception) {
    error = error ?? String(exception)
  }

  return {
    backend: 'none',
    renderer: null,
    webgpu: false,
    error: error ?? 'no WebGL context could be created',
  }
}

/** Message shown when the installation cannot render 3D at all. */
export function degradationNotice(capability: GraphicsCapability, language: 'zh-CN' | 'en-US'): string {
  if (capability.backend === 'webgl2') return ''
  if (language === 'zh-CN') {
    return capability.backend === 'webgl1'
      ? '当前浏览器仅支持 WebGL 1，本展项需要 WebGL 2（three.js 新版渲染器要求）。请在浏览器中启用硬件加速，或使用支持 WebGL 2 的浏览器/显卡驱动。'
      : '当前环境未能创建 WebGL 上下文（可能是浏览器禁用了硬件加速，或在无 GPU 的沙箱中运行）。请启用 WebGL/硬件加速后重试。'
  }
  return capability.backend === 'webgl1'
    ? 'This browser only exposes WebGL 1, but the exhibition needs WebGL 2 (required by the current three.js renderer). Enable hardware acceleration or use a browser/GPU driver with WebGL 2.'
    : 'No WebGL context could be created in this environment — hardware acceleration may be disabled, or the page is running in a GPU-less sandbox. Enable WebGL acceleration and retry.'
}