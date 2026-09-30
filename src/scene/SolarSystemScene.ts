import {
  AdditiveBlending, AmbientLight, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, Line, LineBasicMaterial,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PointLight, Raycaster, RingGeometry, Scene, SphereGeometry,
  Sprite, SpriteMaterial, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { eclipticToScene } from "../astronomy/coordinates";
import type { CelestialObject, Vec3Km } from "../astronomy/types";
import { createScale, type ScaleMode, type SceneScale } from "./scale";
import { MinorBodyLayer } from "./MinorBodyLayer";
import { StellarBackground, type BackgroundStar } from "./StellarBackground";
import { createOrbitLine } from "./orbitGeometry";
import { bodyCameraOffset, resetOverviewCamera } from "./camera";
import { qualityProfile, type QualityPreset } from "./quality";

export type CameraMode = "overview" | "orbit" | "follow" | "near" | "free";
export type RenderBody = CelestialObject & { positionKm: Vec3Km };
export type SceneLayer = "bodies" | "orbits" | "labels" | "asteroids" | "comets" | "tno" | "stars";
export type SceneRenderer = Pick<WebGLRenderer, "setPixelRatio" | "setSize" | "render" | "dispose" | "forceContextLoss"> & { shadowMap: { enabled: boolean }; info?: WebGLRenderer["info"] };

interface SceneOptions {
  rendererFactory?: (canvas: HTMLCanvasElement) => SceneRenderer;
  onSelect?: (id: string) => void;
  onContextLost?: () => void;
}

const COLORS: Partial<Record<CelestialObject["type"], string>> = {
  star: "#ffd27d", planet: "#a9c9e8", dwarfPlanet: "#ccb7a4", moon: "#c6c7ca", asteroid: "#a68b69",
};
const BODY_MU = (massKg: number): number => 6.67430e-20 * massKg;

export class SolarSystemScene {
  private renderer?: SceneRenderer;
  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private controls?: OrbitControls;
  private flyControls?: FlyControls;
  private resizeListener?: () => void;
  private contextLostListener?: (event: Event) => void;
  private animationFrame?: number;
  private mountedCanvas?: HTMLCanvasElement;
  private readonly bodyRoot = new Group();
  private readonly orbitRoot = new Group();
  private bodies: RenderBody[] = [];
  private bodyMeshes = new Map<string, Group>();
  private minorBodyLayer?: MinorBodyLayer;
  private stellarBackground?: StellarBackground;
  private backgroundStars: BackgroundStar[] = [];
  private scale: SceneScale = createScale("scientific");
  private mode: CameraMode = "overview";
  private simulationJD = 2_451_545;
  private qualityPreset: QualityPreset = "high";
  private targetId?: string;
  private cameraFlightTarget?: Vector3;
  private originKm: Vec3Km = { x: 0, y: 0, z: 0 };
  private pointerDown?: { pointerId: number; clientX: number; clientY: number };
  private enabledLayers = new Set<SceneLayer>(["bodies", "orbits", "labels", "asteroids"]);
  private disposed = true;

  constructor(private readonly options: SceneOptions = {}) {}

  mount(canvas: HTMLCanvasElement): void {
    if (!this.disposed) throw new Error("SolarSystemScene is already mounted");
    this.disposed = false;
    this.mountedCanvas = canvas;
    this.scene = new Scene();
    this.scene.background = new Color("#030711");
    this.camera = new PerspectiveCamera(48, 1, 0.01, 1e9);
    this.camera.position.set(0, 0, 52);
    const rendererFactory = this.options.rendererFactory ?? ((target) => new WebGLRenderer({ canvas: target, antialias: true, alpha: false }));
    this.renderer = rendererFactory(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityProfile(this.qualityPreset).pixelRatio));
    this.resizeListener = () => this.resize();
    window.addEventListener("resize", this.resizeListener);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.scene.add(new AmbientLight(0xffffff, 0.55));
    const sunlight = new PointLight(0xffffff, 220, 0, 1.6);
    this.scene.add(sunlight);
    this.scene.add(this.bodyRoot, this.orbitRoot);
    this.contextLostListener = (event) => {
      event.preventDefault();
      this.options.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", this.contextLostListener);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.resize();
    this.renderFrame();
  }

  setBodies(bodies: RenderBody[]): void {
    this.assertMounted();
    const replaceCatalog = bodies !== this.bodies;
    this.minorBodyLayer?.dispose();
    this.minorBodyLayer = undefined;
    this.stellarBackground?.dispose();
    this.stellarBackground = undefined;
    this.disposeGroup(this.bodyRoot);
    this.disposeGroup(this.orbitRoot);
    this.bodyMeshes.clear();
    this.bodies = bodies.slice();
    for (const body of bodies) {
      if (["asteroid", "comet", "tno", "centaur"].includes(body.type)) { this.buildOrbit(body); continue; }
      const group = new Group();
      group.userData.bodyId = body.id;
      if (body.axialTiltDeg) group.rotation.z = body.axialTiltDeg * Math.PI / 180;
      const radius = this.scale.radiusKm(body.radiusKm ?? 500, body.type);
      const geometry = new SphereGeometry(Math.max(radius, 0.002), 32, 20);
      const color = COLORS[body.type] ?? "#91a9c7";
      const material = body.type === "star"
        ? new MeshBasicMaterial({ color, toneMapped: false })
        : new MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.02 });
      const sphere = new Mesh(geometry, material);
      if (body.type === "star") {
        const glow = new Mesh(new SphereGeometry(Math.max(radius * 1.55, 0.01), 24, 16), new MeshBasicMaterial({ color: "#ff9f45", transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false }));
        group.add(glow);
      }
      sphere.userData.bodyId = body.id;
      group.add(sphere);
      if (body.id === "saturn") {
        const ring = new Mesh(new RingGeometry(radius * 1.35, radius * 2.25, 64), new MeshStandardMaterial({ color: "#c4ac83", side: 2, transparent: true, opacity: 0.76, roughness: 1 }));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }
      if (this.enabledLayers.has("labels")) {
        const label = this.makeLabel(body.name);
        if (label) {
          label.position.set(0, radius * 1.6, 0);
          label.userData.bodyId = body.id;
          group.add(label);
        }
      }
      this.bodyRoot.add(group);
      this.bodyMeshes.set(body.id, group);
      this.buildOrbit(body);
    }
    if (["asteroids", "comets", "tno"].some((layer) => this.enabledLayers.has(layer as SceneLayer))) {
      this.minorBodyLayer = new MinorBodyLayer(this.bodyRoot, this.scale, Math.max(100_000, bodies.filter((body) => ["asteroid", "comet", "tno", "centaur"].includes(body.type)).length));
      this.syncMinorBodyLayer();
    }
    this.updateBodyPositions();
    if (replaceCatalog && this.mode === "overview" && this.camera && this.controls) this.frameOverview();
  }

  setPositions(positions: ReadonlyMap<string, Vec3Km>): void {
    this.bodies = this.bodies.map((body) => positions.has(body.id) ? { ...body, positionKm: { ...positions.get(body.id)! } } : body);
    if (this.targetId && this.mode === "follow") {
      const target = this.bodies.find((body) => body.id === this.targetId);
      if (target) this.originKm = { ...target.positionKm };
    }
    this.syncMinorBodyLayer();
    this.rebuildOrbitGeometry();
    this.updateBodyPositions();
  }

  setQualityPreset(preset: QualityPreset): void {
    this.qualityPreset = preset;
    this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityProfile(preset).pixelRatio));
    this.resize();
    if (!this.disposed) this.rebuildOrbitGeometry();
  }

  setSimulationTime(jdTdb: number): void {
    if (!Number.isFinite(jdTdb)) throw new RangeError("Simulation time must be a finite TDB Julian Date");
    this.simulationJD = jdTdb;
    for (const body of this.bodies) {
      const group = this.bodyMeshes.get(body.id);
      const sphere = group?.children.find((child) => child.userData.bodyId === body.id);
      if (sphere && body.rotationPeriodHours) {
        sphere.rotation.y = ((jdTdb - 2_451_545) * 24 / body.rotationPeriodHours) * 2 * Math.PI;
      }
    }
  }

  setScaleMode(mode: ScaleMode): void {
    this.scale = createScale(mode);
    if (!this.disposed) {
      this.setBodies(this.bodies);
      if (this.mode === "overview") this.frameOverview();
    }
    if (this.stellarBackground) { this.stellarBackground.dispose(); this.stellarBackground = new StellarBackground(this.scene!, this.backgroundStars, this.scale); }
  }

  setTarget(id: string): void {
    const body = this.bodies.find((item) => item.id === id);
    if (!body) throw new Error(`Unknown scene body id: ${id}`);
    this.targetId = id;
    this.originKm = { ...body.positionKm };
    if (this.controls && this.camera) {
      this.controls.target.set(0, 0, 0);
      this.cameraFlightTarget = bodyCameraOffset(body, this.scale);
      if (this.mode === "near") this.cameraFlightTarget.multiplyScalar(0.12);
    }
    this.syncMinorBodyLayer();
    this.rebuildOrbitGeometry();
    this.updateBodyPositions();
  }

  setCameraMode(mode: CameraMode): void {
    this.mode = mode;
    if (["orbit", "follow", "near"].includes(mode) && this.targetId) {
      const body = this.bodies.find((candidate) => candidate.id === this.targetId);
      if (body) this.setTarget(body.id);
    }
    if (mode === "free" && this.camera && this.mountedCanvas) {
      this.controls && (this.controls.enabled = false);
      this.flyControls?.dispose();
      this.flyControls = new FlyControls(this.camera, this.mountedCanvas);
      this.flyControls.movementSpeed = this.dynamicCameraSpeed();
      this.flyControls.rollSpeed = 0.32;
      this.flyControls.dragToLook = true;
    } else {
      this.flyControls?.dispose();
      this.flyControls = undefined;
      if (this.controls) this.controls.enabled = true;
    }
    if (mode === "overview" && this.camera && this.controls) {
      this.originKm = { x: 0, y: 0, z: 0 };
      this.frameOverview();
      this.rebuildOrbitGeometry();
      this.updateBodyPositions();
    }
  }

  setBackgroundStars(stars: BackgroundStar[]): void {
    this.backgroundStars = stars.slice();
    if (this.stellarBackground) { this.stellarBackground.dispose(); this.stellarBackground = undefined; }
    if (this.enabledLayers.has("stars") && this.scene) this.stellarBackground = new StellarBackground(this.scene, this.backgroundStars, this.scale);
  }

  setLayer(layer: SceneLayer, enabled: boolean): void {
    if (enabled) this.enabledLayers.add(layer);
    else this.enabledLayers.delete(layer);
    if (!this.disposed && (layer === "asteroids" || layer === "comets" || layer === "tno" || layer === "labels" || layer === "orbits")) this.setBodies(this.bodies);
    if (layer === "stars") {
      this.stellarBackground?.dispose(); this.stellarBackground = undefined;
      if (enabled && this.scene && this.backgroundStars.length) this.stellarBackground = new StellarBackground(this.scene, this.backgroundStars, this.scale);
    }
    if (layer === "bodies") this.bodyRoot.visible = enabled;
  }

  getScale(): SceneScale { return this.scale; }
  getCameraMode(): CameraMode { return this.mode; }
  getSelectedBodyId(): string | undefined { return this.targetId; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    if (this.resizeListener) window.removeEventListener("resize", this.resizeListener);
    if (this.mountedCanvas && this.contextLostListener) this.mountedCanvas.removeEventListener("webglcontextlost", this.contextLostListener);
    if (this.mountedCanvas) this.mountedCanvas.removeEventListener("pointerdown", this.handlePointerDown);
    if (this.mountedCanvas) this.mountedCanvas.removeEventListener("pointerup", this.handlePointerUp);
    if (this.mountedCanvas) this.mountedCanvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.pointerDown = undefined;
    this.controls?.dispose();
    this.flyControls?.dispose();
    this.flyControls = undefined;
    this.minorBodyLayer?.dispose();
    this.minorBodyLayer = undefined;
    this.stellarBackground?.dispose();
    this.stellarBackground = undefined;
    this.disposeGroup(this.bodyRoot);
    this.disposeGroup(this.orbitRoot);
    this.scene?.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
    this.controls = undefined;
    this.mountedCanvas = undefined;
    this.bodyMeshes.clear();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.isPrimary === false || event.button !== 0) return;
    this.pointerDown = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = undefined;
    if (!down || down.pointerId !== event.pointerId || Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 8) return;
    this.selectAt(event.clientX, event.clientY);
  };

  private readonly handlePointerCancel = (): void => { this.pointerDown = undefined; };

  private selectAt(clientX: number, clientY: number): void {
    if (!this.camera || !this.scene || !this.mountedCanvas) return;
    const rect = this.mountedCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    const ndc = new Vector3(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const direction = ndc.sub(this.camera.position).normalize();
    const ray = new Raycaster(this.camera.position, direction);
    const hits = ray.intersectObjects(this.bodyRoot.children, true);
    const bodyHit = hits.find((hit) => typeof hit.object.userData.bodyId === "string" ||
      (typeof hit.instanceId === "number" && Array.isArray(hit.object.userData.bodyIds) && typeof hit.object.userData.bodyIds[hit.instanceId] === "string"));
    const id = bodyHit?.object.userData.bodyId as string | undefined ??
      (typeof bodyHit?.instanceId === "number" ? bodyHit.object.userData.bodyIds?.[bodyHit.instanceId] as string | undefined : undefined);
    if (id) { this.options.onSelect?.(id); this.setTarget(id); }
  }

  private resize(): void {
    if (!this.renderer || !this.camera || !this.mountedCanvas) return;
    const rect = this.mountedCanvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.mountedCanvas.clientWidth || 1);
    const height = Math.max(1, rect.height || this.mountedCanvas.clientHeight || 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private renderFrame = (): void => {
    if (this.disposed || !this.renderer || !this.scene || !this.camera) return;
    if (this.camera && this.cameraFlightTarget) {
      this.camera.position.lerp(this.cameraFlightTarget, 0.09);
      if (this.camera.position.distanceTo(this.cameraFlightTarget) < 0.015) {
        this.camera.position.copy(this.cameraFlightTarget);
        this.cameraFlightTarget = undefined;
      }
    }
    this.controls?.update();
    if (this.flyControls && this.camera) this.flyControls.movementSpeed = this.dynamicCameraSpeed();
    this.flyControls?.update(1 / 60);
    this.updateBodyPositions();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.renderFrame);
  };

  private dynamicCameraSpeed(): number {
    const distance = this.camera?.position.length() ?? 1;
    return Math.min(1_000_000, Math.max(0.3, distance * 0.18));
  }

  private syncMinorBodyLayer(): void {
    if (!this.minorBodyLayer) return;
    const bodies = this.bodies.filter((body) =>
      (body.type === "asteroid" && this.enabledLayers.has("asteroids")) ||
      (body.type === "comet" && this.enabledLayers.has("comets")) ||
      (["tno", "centaur"].includes(body.type) && this.enabledLayers.has("tno")),
    ).map((body) => ({
      ...body, positionKm: { x: body.positionKm.x - this.originKm.x, y: body.positionKm.y - this.originKm.y, z: body.positionKm.z - this.originKm.z },
    }));
    this.minorBodyLayer.setBodies(bodies);
  }

  private updateBodyPositions(): void {
    for (const body of this.bodies) {
      const group = this.bodyMeshes.get(body.id);
      if (!group) continue;
      const relative = { x: body.positionKm.x - this.originKm.x, y: body.positionKm.y - this.originKm.y, z: body.positionKm.z - this.originKm.z };
      const scenePosition = eclipticToScene({ x: this.scale.distanceKm(relative.x), y: this.scale.distanceKm(relative.y), z: this.scale.distanceKm(relative.z) });
      group.position.set(scenePosition.x, scenePosition.y, scenePosition.z);
    }
  }

  private rebuildOrbitGeometry(): void {
    this.disposeGroup(this.orbitRoot);
    for (const body of this.bodies) this.buildOrbit(body);
  }

  private frameOverview(): void {
    if (!this.camera || !this.controls) return;
    let extent = 20;
    for (const body of this.bodies) {
      const relative = { x: body.positionKm.x - this.originKm.x, y: body.positionKm.y - this.originKm.y, z: body.positionKm.z - this.originKm.z };
      extent = Math.max(extent, Math.hypot(
        this.scale.distanceKm(relative.x), this.scale.distanceKm(relative.y), this.scale.distanceKm(relative.z),
        this.scale.radiusKm(body.radiusKm ?? 500, body.type),
      ));
      if (body.parentId === "sun" && body.orbit && body.orbit.eccentricity < 1) {
        extent = Math.max(extent, this.scale.distanceKm(Math.abs(body.orbit.semiMajorAxisKm) * (1 + body.orbit.eccentricity)));
      }
    }
    resetOverviewCamera(this.camera, this.controls, extent);
  }

  private buildOrbit(body: RenderBody): void {
    if (!this.enabledLayers.has("orbits") || !body.orbit || body.orbit.eccentricity >= 1 || !body.parentId) return;
    const parent = this.bodies.find((candidate) => candidate.id === body.parentId);
    if (!parent) return;
    const line = createOrbitLine(body, parent, this.scale, this.originKm, qualityProfile(this.qualityPreset).orbitSegments);
    if (line) this.orbitRoot.add(line);
  }

  private makeLabel(text: string): Sprite | undefined {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.font = "24px system-ui";
    context.fillStyle = "rgba(10,18,32,.78)";
    context.fillRect(0, 8, canvas.width, 48);
    context.fillStyle = "#eaf3ff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, 32, canvas.width - 16);
    const texture = new CanvasTexture(canvas);
    const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(3.8, 0.95, 1);
    return sprite;
  }

  private disposeGroup(group: Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry instanceof BufferGeometry) mesh.geometry.dispose();
        const material = (object as Mesh | Sprite).material;
        if (Array.isArray(material)) material.forEach((item) => { if ("map" in item) (item as MeshBasicMaterial | MeshStandardMaterial | SpriteMaterial).map?.dispose(); item.dispose(); });
        else if (material) { (material as MeshBasicMaterial | MeshStandardMaterial | SpriteMaterial).map?.dispose(); material.dispose(); }
      });
    }
  }

  private assertMounted(): void { if (this.disposed || !this.renderer || !this.scene) throw new Error("SolarSystemScene must be mounted first"); }
}
