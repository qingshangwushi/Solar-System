import { describe, expect, it, vi } from "vitest";
import { SolarSystemScene } from "../../src/scene/SolarSystemScene";

function fakeRenderer() {
  return {
    setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
    shadowMap: { enabled: false }, info: { render: { calls: 0, triangles: 0 } },
  };
}

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number): Event {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
  return event;
}

function canvasWithPointerSupport(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, {
    setPointerCapture: { value: vi.fn() },
    releasePointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: vi.fn(() => false) },
  });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  return canvas;
}

describe("SolarSystemScene lifecycle", () => {
  it("disposes renderer, scene resources, frame, and listeners once", () => {
    const renderer = fakeRenderer();
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(123);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const scene = new SolarSystemScene({ rendererFactory: () => renderer as never });
    const canvas = document.createElement("canvas");
    const remove = vi.spyOn(canvas, "removeEventListener");
    scene.mount(canvas);
    scene.setBodies([{ id: "earth", name: "Earth", type: "planet", source: "test", positionKm: { x: 10, y: 20, z: 30 }, radiusKm: 6371 }]);
    scene.dispose();
    scene.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(123);
    expect(remove).toHaveBeenCalled();
    raf.mockRestore();
    cancel.mockRestore();
  });

  it("selects on a click, not on a drag gesture", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(123);
    const onSelect = vi.fn();
    const scene = new SolarSystemScene({ rendererFactory: () => fakeRenderer() as never, onSelect });
    const canvas = canvasWithPointerSupport();
    scene.mount(canvas);
    scene.setBodies([{ id: "earth", name: "Earth", type: "planet", source: "test", radiusKm: 6371, positionKm: { x: 0, y: 0, z: 0 } }]);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 50, 50));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 70, 50));
    expect(onSelect).not.toHaveBeenCalled();
    canvas.dispatchEvent(pointerEvent("pointerdown", 2, 50, 50));
    canvas.dispatchEvent(pointerEvent("pointerup", 2, 50, 50));
    expect(onSelect).toHaveBeenCalledWith("earth");

    scene.dispose();
    raf.mockRestore();
  });

  it("resolves an InstancedMesh click to the body's catalog ID", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(123);
    const onSelect = vi.fn();
    const scene = new SolarSystemScene({ rendererFactory: () => fakeRenderer() as never, onSelect });
    const canvas = canvasWithPointerSupport();
    scene.mount(canvas);
    scene.setBodies([{ id: "apophis", name: "Apophis", type: "asteroid", source: "test", positionKm: { x: 0, y: 0, z: 0 } }]);
    canvas.dispatchEvent(pointerEvent("pointerdown", 3, 50, 50));
    canvas.dispatchEvent(pointerEvent("pointerup", 3, 50, 50));
    expect(onSelect).toHaveBeenCalledWith("apophis");
    scene.dispose();
    raf.mockRestore();
  });
});
