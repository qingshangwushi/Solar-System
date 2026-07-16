/**
 * 诊断面板：性能监控与调试工具（任务 P2-8）。
 *
 * 实现性能统计、调试信息、渲染管线分析。
 */

import { PerformanceMetrics } from './quality.js';

export interface DiagnosticInfo {
  performance: PerformanceMetrics;
  memory: MemoryInfo | null;
  webgl: WebGLInfo | null;
  errors: ErrorLog[];
  warnings: WarningLog[];
}

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface WebGLInfo {
  vendor: string;
  renderer: string;
  version: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxVertexAttribs: number;
  shaderVersion: string;
  extensions: string[];
}

export interface ErrorLog {
  timestamp: number;
  message: string;
  stack?: string;
  severity: 'error' | 'critical';
}

export interface WarningLog {
  timestamp: number;
  message: string;
  category: 'performance' | 'memory' | 'rendering' | 'resource';
}

export interface DiagnosticConfig {
  enabled: boolean;
  logErrors: boolean;
  logWarnings: boolean;
  performanceHistorySize: number;
  warningThresholds: {
    fps: number;
    memoryMB: number;
    drawCalls: number;
  };
}

export type DiagnosticCallback = (info: DiagnosticInfo) => void;

export class DiagnosticPanel {
  private config: DiagnosticConfig;
  private performanceHistory: PerformanceMetrics[] = [];
  private errors: ErrorLog[] = [];
  private warnings: WarningLog[] = [];
  private callbacks: DiagnosticCallback[] = [];
  private glInfo: WebGLInfo | null = null;
  private lastUpdateTime = 0;
  private updateInterval = 1000;

  constructor(config?: Partial<DiagnosticConfig>) {
    this.config = {
      enabled: true,
      logErrors: true,
      logWarnings: true,
      performanceHistorySize: 60,
      warningThresholds: {
        fps: 30,
        memoryMB: 500,
        drawCalls: 1000,
      },
      ...config,
    };
  }

  initialize(gl: WebGL2RenderingContext | WebGLRenderingContext): void {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

    let vendor = 'Unknown';
    let renderer = 'Unknown';
    let version = 'Unknown';

    if (debugInfo) {
      vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
      renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
    }

    version = gl.getParameter(gl.VERSION) as string;

    const extensions: string[] = [];
    const exts = gl.getSupportedExtensions();
    if (exts) {
      extensions.push(...exts);
    }

    this.glInfo = {
      vendor,
      renderer,
      version,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number,
      shaderVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) as string,
      extensions,
    };
  }

  updatePerformance(metrics: PerformanceMetrics): void {
    if (!this.config.enabled) return;

    this.performanceHistory.push(metrics);

    if (this.performanceHistory.length > this.config.performanceHistorySize) {
      this.performanceHistory.shift();
    }

    this.checkThresholds(metrics);

    const now = performance.now();
    if (now - this.lastUpdateTime > this.updateInterval) {
      this.notifyCallbacks();
      this.lastUpdateTime = now;
    }
  }

  private checkThresholds(metrics: PerformanceMetrics): void {
    if (metrics.fps < this.config.warningThresholds.fps) {
      this.addWarning('performance', `FPS dropped to ${metrics.fps.toFixed(1)}`);
    }

    if (metrics.drawCalls > this.config.warningThresholds.drawCalls) {
      this.addWarning('rendering', `High draw call count: ${metrics.drawCalls}`);
    }

    const memoryMB = metrics.memoryUsed / (1024 * 1024);
    if (memoryMB > this.config.warningThresholds.memoryMB) {
      this.addWarning('memory', `Memory usage: ${memoryMB.toFixed(1)} MB`);
    }
  }

  logError(error: Error, severity: 'error' | 'critical' = 'error'): void {
    if (!this.config.enabled || !this.config.logErrors) return;

    const entry: ErrorLog = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      severity,
    };

    this.errors.push(entry);

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors.shift();
    }

    this.notifyCallbacks();
  }

  addWarning(category: WarningLog['category'], message: string): void {
    if (!this.config.enabled || !this.config.logWarnings) return;

    const entry: WarningLog = {
      timestamp: Date.now(),
      message,
      category,
    };

    this.warnings.push(entry);

    // Keep only last 50 warnings
    if (this.warnings.length > 50) {
      this.warnings.shift();
    }
  }

  getMemoryInfo(): MemoryInfo | null {
    const perf = performance as unknown as { memory?: MemoryInfo };
    if (perf.memory) {
      const mem = perf.memory;
      return {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      };
    }
    return null;
  }

  getDiagnosticInfo(): DiagnosticInfo {
    const avgMetrics = this.calculateAverageMetrics();

    return {
      performance: avgMetrics,
      memory: this.getMemoryInfo(),
      webgl: this.glInfo,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  private calculateAverageMetrics(): PerformanceMetrics {
    if (this.performanceHistory.length === 0) {
      return {
        fps: 0,
        frameTime: 0,
        gpuTime: null,
        drawCalls: 0,
        triangles: 0,
        memoryUsed: 0,
      };
    }

    const sum = this.performanceHistory.reduce(
      (acc: { fps: number; frameTime: number; gpuTime: number; drawCalls: number; triangles: number; memoryUsed: number }, m) => ({
        fps: acc.fps + m.fps,
        frameTime: acc.frameTime + m.frameTime,
        gpuTime: acc.gpuTime + (m.gpuTime ?? 0),
        drawCalls: acc.drawCalls + m.drawCalls,
        triangles: acc.triangles + m.triangles,
        memoryUsed: acc.memoryUsed + m.memoryUsed,
      }),
      { fps: 0, frameTime: 0, gpuTime: 0, drawCalls: 0, triangles: 0, memoryUsed: 0 }
    );

    const count = this.performanceHistory.length;
    const avgGpuTime = sum.gpuTime / count;

    return {
      fps: sum.fps / count,
      frameTime: sum.frameTime / count,
      gpuTime: avgGpuTime > 0 ? avgGpuTime : null,
      drawCalls: sum.drawCalls / count,
      triangles: sum.triangles / count,
      memoryUsed: sum.memoryUsed / count,
    };
  }

  subscribe(callback: DiagnosticCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index !== -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks(): void {
    const info = this.getDiagnosticInfo();
    for (const callback of this.callbacks) {
      try {
        callback(info);
      } catch (e) {
        console.error('Diagnostic callback error:', e);
      }
    }
  }

  clearHistory(): void {
    this.performanceHistory = [];
    this.errors = [];
    this.warnings = [];
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

export function formatFPS(fps: number): string {
  if (fps >= 60) {
    return `${fps.toFixed(0)} FPS (excellent)`;
  } else if (fps >= 45) {
    return `${fps.toFixed(0)} FPS (good)`;
  } else if (fps >= 30) {
    return `${fps.toFixed(0)} FPS (acceptable)`;
  } else {
    return `${fps.toFixed(0)} FPS (poor)`;
  }
}

export function formatFrameTime(ms: number): string {
  if (ms < 16.67) {
    return `${ms.toFixed(2)} ms (> 60 FPS)`;
  } else if (ms < 33.33) {
    return `${ms.toFixed(2)} ms (30-60 FPS)`;
  } else {
    return `${ms.toFixed(2)} ms (< 30 FPS)`;
  }
}

export function createDiagnosticOverlay(panel: DiagnosticPanel): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;

  const container = document.createElement('div');
  container.id = 'diagnostic-overlay';
  container.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: #0f0;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    border-radius: 4px;
    z-index: 99999;
    min-width: 200px;
    pointer-events: none;
  `;

  const updateDisplay = () => {
    const info = panel.getDiagnosticInfo();
    const memory = info.memory;
    const perf = info.performance;

    container.innerHTML = `
      <div style="margin-bottom: 5px; font-weight: bold;">Performance</div>
      <div>FPS: ${formatFPS(perf.fps)}</div>
      <div>Frame: ${formatFrameTime(perf.frameTime)}</div>
      <div>Draw Calls: ${perf.drawCalls}</div>
      <div>Triangles: ${perf.triangles.toLocaleString()}</div>
      ${memory ? `
        <div style="margin-top: 5px; font-weight: bold;">Memory</div>
        <div>Used: ${formatBytes(memory.usedJSHeapSize)}</div>
        <div>Total: ${formatBytes(memory.totalJSHeapSize)}</div>
      ` : ''}
      ${info.errors.length > 0 ? `
        <div style="margin-top: 5px; color: #f00;">Errors: ${info.errors.length}</div>
      ` : ''}
      ${info.warnings.length > 0 ? `
        <div style="margin-top: 5px; color: #ff0;">Warnings: ${info.warnings.length}</div>
      ` : ''}
    `;
  };

  panel.subscribe(updateDisplay);
  updateDisplay();

  return container;
}

// Global error handler setup
export function setupGlobalErrorHandler(panel: DiagnosticPanel): () => void {
  const errorHandler = (event: ErrorEvent): void => {
    panel.logError(event.error || new Error(event.message), 'error');
  };

  const rejectionHandler = (event: PromiseRejectionEvent): void => {
    panel.logError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), 'error');
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
}