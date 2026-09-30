/**
 * Renderer and post-processing.
 *
 * Owns the WebGL2 context, the camera, the effect composer and the long-run
 * safety net the specification requires:
 *  - `webglcontextlost` is intercepted and prevented, so the browser can restore
 *    the context instead of blanking the installation;
 *  - `webglcontextrestored` re-uploads every GPU resource through a callback;
 *  - `dispose()` releases the renderer, the composer passes and the event listeners.
 *
 * Post-processing is deliberately restrained: bloom on the emissive bodies, tone
 * mapping and no lens flare or sci-fi grade, so the imagery stays close to the
 * NASA-visualisation target rather than a game look.
 */
import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js'
import type { QualityProfile } from './QualityController'

export interface RendererStatistics {
  drawCalls: number
  triangles: number
  points: number
  textureMb: number
  geometryMb: number
  /** Number of textures currently resident on the GPU. */
  textureCount: number
  /** Number of geometries currently resident on the GPU. */
  geometryCount: number
}

export class SceneRenderer {
  readonly renderer: WebGLRenderer
  readonly camera: PerspectiveCamera
  readonly scene = new Scene()
  private composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly bloomPass: UnrealBloomPass
  private readonly smaaPass: SMAAPass
  private readonly vignettePass: ShaderPass
  private readonly outputPass: OutputPass
  private readonly renderTarget: WebGLRenderTarget
  private bloomEnabled = true
  private width = 1
  private height = 1

  private readonly handleContextLost = (event: Event) => {
    // Preventing the default lets the browser attempt a restore.
    event.preventDefault()
    this.contextLostCallback?.()
  }

  private readonly handleContextRestored = () => {
    this.contextRestoredCallback?.()
  }

  private contextLostCallback: (() => void) | null = null
  private contextRestoredCallback: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement, options: { pixelRatio: number; bloom: boolean }) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      // A single logarithmic depth buffer is what makes a 1e-4 .. 1e9 near/far
      // range usable; without it the outer planets z-fight at overview range.
      logarithmicDepthBuffer: true,
      stencil: false,
    })
    this.renderer.setPixelRatio(options.pixelRatio)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.18
    // The effect composer issues several renderer.render() calls per frame; manual
    // resetting makes info.render cover the whole frame instead of only the last pass.
    this.renderer.info.autoReset = false

    this.camera = new PerspectiveCamera(42, 1, 1e-4, 1e9)
    this.camera.position.set(0, 1200, 2600)

    // A multisampled composer target is what actually delivers the `antialias: true`
    // request: once every frame is drawn into a render target, the canvas-level MSAA
    // no longer applies (P2-8). SMAA then cleans up the remaining edges, and a very
    // slight vignette settles the corners of a large exhibition screen.
    this.renderTarget = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType })
    this.composer = new EffectComposer(this.renderer, this.renderTarget)
    this.renderPass = new RenderPass(this.scene, this.camera)
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.6, 0.85)
    this.smaaPass = new SMAAPass()
    this.vignettePass = new ShaderPass(VignetteShader)
    this.vignettePass.uniforms.offset.value = 0.94
    this.vignettePass.uniforms.darkness.value = 0.3
    this.outputPass = new OutputPass()
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.bloomPass)
    // SMAA works in linear-sRGB, so it is inserted before the output pass, which
    // applies the tone map and the colour-space conversion.
    this.composer.addPass(this.smaaPass)
    this.composer.addPass(this.outputPass)
    this.composer.addPass(this.vignettePass)
    this.setBloom(options.bloom)

    canvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false)
  }

  setContextLostHandler(callback: () => void): void {
    this.contextLostCallback = callback
  }

  setContextRestoredHandler(callback: () => void): void {
    this.contextRestoredCallback = callback
  }

  setBloom(enabled: boolean): void {
    this.bloomEnabled = enabled
    this.bloomPass.enabled = enabled
  }

  get isBloomEnabled(): boolean {
    return this.bloomEnabled
  }

  setPixelRatio(pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio)
    this.composer.setPixelRatio(pixelRatio)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height, false)
    this.composer.setSize(this.width, this.height)
    this.bloomPass.setSize(this.width, this.height)
    this.smaaPass.setSize(this.width, this.height)
  }

  applyQuality(profile: QualityProfile, devicePixelRatio: number): void {
    this.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatioCap))
    this.setBloom(profile.bloom)
    this.resize(this.width, this.height)
  }

  /** PNG snapshot of the current frame, used by the acceptance evidence scripts. */
  toDataUrl(): string {
    return this.renderer.domElement.toDataURL('image/png')
  }

  get viewport(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  render(): void {
    this.renderer.info.reset()
    this.composer.render()
  }

  statistics(): RendererStatistics {
    const info = this.renderer.info
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      textureMb: Math.round((info.memory.textures * 1.4 * 1024 * 1024) / 1024 / 1024),
      geometryMb: Math.round((info.memory.geometries * 0.25 * 1024 * 1024) / 1024 / 1024),
      textureCount: info.memory.textures,
      geometryCount: info.memory.geometries,
    }
  }

  dispose(): void {
    const canvas = this.renderer.domElement
    canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.bloomPass.dispose()
    this.smaaPass.dispose?.()
    this.vignettePass.dispose?.()
    this.outputPass.dispose?.()
    this.composer.dispose()
    this.renderTarget.dispose()
    this.renderer.dispose()
  }
}