import type { Vec3d } from '@solar-system/schemas';

export type EventType =
  | 'solar_eclipse'
  | 'lunar_eclipse'
  | 'conjunction'
  | 'opposition'
  | 'transit'
  | 'moon_phase'
  | 'solstice'
  | 'equinox';

export interface CelestialEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  peakDate: Date;
  visibility: string;
  bodies: string[];
  coordinates?: Vec3d;
  magnitude?: number;
  duration?: number;
}

export type EventResult = CelestialEvent;

/**
 * 时间设定：相对偏移 + 时钟速率，用于 CruiseWaypoint 中模拟"快进到事件"等场景。
 */
export interface TimeSetting {
  startOffset: number;
  endOffset: number;
  clockRate: number;
}

export interface CameraTarget {
  bodyId: string;
  position: Vec3d;
}

export interface CameraDirection {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface LayerVisibility {
  orbits: boolean;
  labels: boolean;
  grid: boolean;
}

export interface ResourcePreload {
  bodyIds: string[];
  textureTiers: number[];
}

export interface TextCard {
  title: string;
  body: string;
  duration: number;
}

export interface ExitState {
  returnToParent: boolean;
  clearLayerOverrides: boolean;
}

export type ScaleMode = 'real' | 'enhanced';

/**
 * CruiseWaypoint: 扩展接口（E-21），包含 12+ 字段以支持时间设定、相机目标、
 * 资源预加载、图层可见性、文字卡片等。
 */
export interface CruiseWaypoint {
  bodyId: string;
  name: string;
  position: Vec3d;
  duration: number;
  pauseDuration: number;
  // E-21 扩展字段（全部可选，向后兼容）
  timeSetting?: TimeSetting;
  cameraTarget?: CameraTarget;
  cameraPosition?: Vec3d;
  cameraDirection?: CameraDirection;
  referenceFrame?: string;
  easingCurve?: string;
  timeMultiplier?: number;
  scaleMode?: ScaleMode;
  layerVisibility?: LayerVisibility;
  minQuality?: 'low' | 'medium' | 'high' | 'ultra';
  resourcePreload?: ResourcePreload;
  textCard?: TextCard;
  exitState?: ExitState;
}

export interface Cruise {
  id: string;
  name: string;
  description: string;
  waypoints: CruiseWaypoint[];
  totalDuration: number;
  recommendedTime: string;
  featured: boolean;
}

export interface EventSearchOptions {
  types?: EventType[];
  startDate?: Date;
  endDate?: Date;
  body?: string;
  limit?: number;
}

export interface EventsService {
  search(options: EventSearchOptions): CelestialEvent[];
  getEvent(id: string): CelestialEvent | null;
  getUpcomingEvents(limit?: number): CelestialEvent[];
  getPastEvents(limit?: number): CelestialEvent[];
  subscribe(callback: (event: CelestialEvent) => void): () => void;
}

/**
 * CruiseService 回调集合：在 update() 中根据 waypoint 配置触发。
 */
export interface CruiseCallbacks {
  onCameraChange?: (target: CameraTarget | null, position: Vec3d | null, direction: CameraDirection | null) => void;
  onClockChange?: (timeSetting: TimeSetting | null, timeMultiplier: number | null) => void;
  onScaleChange?: (scaleMode: ScaleMode | null) => void;
  onLayerVisibilityChange?: (visibility: LayerVisibility | null) => void;
}

export interface CruiseService {
  getAllCruises(): Cruise[];
  getCruise(id: string): Cruise | null;
  getFeaturedCruises(): Cruise[];
  startCruise(id: string): void;
  pauseCruise(): void;
  resumeCruise(): void;
  stopCruise(): void;
  getCurrentProgress(): number;
  getCurrentWaypoint(): CruiseWaypoint | null;
  setCallbacks?(callbacks: CruiseCallbacks): void;
}

/**
 * Pure viewing mode 回调集合：在 enter/exit 等动作时通知 UI。
 */
export interface PureViewingCallbacks {
  onUIVisibilityChange?: (visible: boolean) => void;
  onHUDDisabled?: (disabled: boolean) => void;
  onAutoRotateChange?: (enabled: boolean) => void;
  onAmbientModeChange?: (enabled: boolean) => void;
}

export interface PureViewingMode {
  enter(): void;
  exit(): void;
  isActive(): boolean;
  setTarget(bodyId: string): void;
  setAutoRotate(enabled: boolean): void;
  setAmbientMode(enabled: boolean): void;
  setCallbacks?(callbacks: PureViewingCallbacks): void;
}

export const EVENT_TYPES: Record<EventType, { label: string; icon: string }> = {
  solar_eclipse: { label: '日食', icon: '🌑' },
  lunar_eclipse: { label: '月食', icon: '🌒' },
  conjunction: { label: '合相', icon: '⭐' },
  opposition: { label: '冲日', icon: '🌍' },
  transit: { label: '凌日', icon: '🪐' },
  moon_phase: { label: '月相', icon: '🌙' },
  solstice: { label: '至点', icon: '☀️' },
  equinox: { label: '分点', icon: '⚖️' },
};

export const CRUISES: Cruise[] = [
  {
    id: 'cruise-solar-system-tour',
    name: '太阳系环游',
    description: '从太阳出发，依次探访八大行星的壮丽旅程',
    waypoints: [
      { bodyId: 'sun', name: '太阳', position: { x: 0, y: 0, z: 0 }, duration: 30, pauseDuration: 10 },
      { bodyId: 'mercury', name: '水星', position: { x: 0.39, y: 0, z: 0 }, duration: 45, pauseDuration: 10 },
      { bodyId: 'venus', name: '金星', position: { x: 0.72, y: 0, z: 0 }, duration: 45, pauseDuration: 15 },
      { bodyId: 'earth', name: '地球', position: { x: 1, y: 0, z: 0 }, duration: 60, pauseDuration: 20 },
      { bodyId: 'mars', name: '火星', position: { x: 1.52, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 90, pauseDuration: 20 },
      { bodyId: 'saturn', name: '土星', position: { x: 9.5, y: 0, z: 0 }, duration: 90, pauseDuration: 20 },
      { bodyId: 'uranus', name: '天王星', position: { x: 19.2, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
      { bodyId: 'neptune', name: '海王星', position: { x: 30.1, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
    ],
    totalDuration: 600,
    recommendedTime: '白天',
    featured: true,
  },
  {
    id: 'cruise-moon-landing',
    name: '登月之旅',
    description: '从地球出发，飞越地月系统，体验月球表面',
    waypoints: [
      { bodyId: 'earth', name: '地球', position: { x: 1, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
      { bodyId: 'moon', name: '月球', position: { x: 1.00257, y: 0, z: 0.00257 }, duration: 120, pauseDuration: 30 },
    ],
    totalDuration: 210,
    recommendedTime: '夜晚',
    featured: true,
  },
  {
    id: 'cruise-ring-world',
    name: '光环世界',
    description: '近距离欣赏土星壮观的环系',
    waypoints: [
      { bodyId: 'saturn', name: '土星', position: { x: 9.5, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'saturn-rings-inner', name: '内环', position: { x: 9.5, y: 0.007, z: 0 }, duration: 60, pauseDuration: 20 },
      { bodyId: 'saturn-rings-outer', name: '外环', position: { x: 9.5, y: 0.02, z: 0 }, duration: 60, pauseDuration: 20 },
      { bodyId: 'titan', name: '土卫六', position: { x: 9.5008, y: 0, z: 0.0008 }, duration: 60, pauseDuration: 15 },
    ],
    totalDuration: 210,
    recommendedTime: '任意时间',
    featured: true,
  },
  {
    id: 'cruise-red-planet',
    name: '红色星球',
    description: '探索火星表面的峡谷和火山',
    waypoints: [
      { bodyId: 'mars', name: '火星轨道', position: { x: 1.52, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'mars-surface', name: '火星表面', position: { x: 1.52, y: 0.00003, z: 0 }, duration: 120, pauseDuration: 40 },
    ],
    totalDuration: 190,
    recommendedTime: '白天',
    featured: true,
  },
  {
    id: 'cruise-gas-giants',
    name: '气态巨行星',
    description: '探访木星和土星的壮丽风暴',
    waypoints: [
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
      { bodyId: 'jupiter-great-red-spot', name: '大红斑', position: { x: 5.2, y: 0.00007, z: 0 }, duration: 60, pauseDuration: 20 },
      { bodyId: 'saturn', name: '土星', position: { x: 9.5, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 265,
    recommendedTime: '夜晚',
    featured: true,
  },
  {
    id: 'cruise-asteroid-belt',
    name: '小行星带',
    description: '穿越火星和木星之间的小行星区域',
    waypoints: [
      { bodyId: 'mars', name: '火星', position: { x: 1.52, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'asteroid-belt-inner', name: '小行星带内侧', position: { x: 2.2, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
      { bodyId: 'asteroid-belt-outer', name: '小行星带外侧', position: { x: 2.8, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 60, pauseDuration: 10 },
    ],
    totalDuration: 225,
    recommendedTime: '任意时间',
    featured: false,
  },
  {
    id: 'cruise-ganymede',
    name: '木卫四之旅',
    description: '探访太阳系最大的卫星木卫四',
    waypoints: [
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'ganymede', name: '木卫四', position: { x: 5.20015, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-europa',
    name: '欧罗巴冰世界',
    description: '探索木卫二的冰层和地下海洋',
    waypoints: [
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'europa', name: '木卫二', position: { x: 5.200067, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-titan',
    name: '泰坦迷雾',
    description: '探索土卫六的甲烷湖泊',
    waypoints: [
      { bodyId: 'saturn', name: '土星', position: { x: 9.5, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'titan', name: '土卫六', position: { x: 9.5008, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-outer-planets',
    name: '远日行星',
    description: '探访天王星和海王星的冰巨星世界',
    waypoints: [
      { bodyId: 'saturn', name: '土星', position: { x: 9.5, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'uranus', name: '天王星', position: { x: 19.2, y: 0, z: 0 }, duration: 90, pauseDuration: 20 },
      { bodyId: 'neptune', name: '海王星', position: { x: 30.1, y: 0, z: 0 }, duration: 90, pauseDuration: 20 },
    ],
    totalDuration: 235,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-venus-express',
    name: '金星快车',
    description: '近距离观察金星浓厚的大气层',
    waypoints: [
      { bodyId: 'earth', name: '地球', position: { x: 1, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'venus', name: '金星', position: { x: 0.72, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '白天',
    featured: false,
  },
  {
    id: 'cruise-mercury-flyby',
    name: '水星飞掠',
    description: '探访离太阳最近的行星',
    waypoints: [
      { bodyId: 'sun', name: '太阳', position: { x: 0, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'mercury', name: '水星', position: { x: 0.39, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
    ],
    totalDuration: 110,
    recommendedTime: '白天',
    featured: false,
  },
  {
    id: 'cruise-earth-moon-system',
    name: '地月系统',
    description: '欣赏地球和月球的美丽舞姿',
    waypoints: [
      { bodyId: 'earth', name: '地球', position: { x: 1, y: 0, z: 0 }, duration: 60, pauseDuration: 20 },
      { bodyId: 'moon', name: '月球', position: { x: 1.00257, y: 0, z: 0.00257 }, duration: 60, pauseDuration: 20 },
      { bodyId: 'earth-moon-lagrange', name: '拉格朗日点', position: { x: 1.005, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
    ],
    totalDuration: 210,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-sun-corona',
    name: '日冕探秘',
    description: '近距离观察太阳的日冕层',
    waypoints: [
      { bodyId: 'sun', name: '太阳', position: { x: 0, y: 0, z: 0 }, duration: 90, pauseDuration: 30 },
    ],
    totalDuration: 120,
    recommendedTime: '日食期间',
    featured: false,
  },
  {
    id: 'cruise-kuiper-belt',
    name: '柯伊伯带',
    description: '探访太阳系边缘的神秘区域',
    waypoints: [
      { bodyId: 'neptune', name: '海王星', position: { x: 30.1, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'kuiper-belt-inner', name: '柯伊伯带内侧', position: { x: 35, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
      { bodyId: 'kuiper-belt-outer', name: '柯伊伯带外侧', position: { x: 45, y: 0, z: 0 }, duration: 60, pauseDuration: 15 },
    ],
    totalDuration: 165,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-pluto',
    name: '冥王星之旅',
    description: '探访曾经的第九大行星',
    waypoints: [
      { bodyId: 'neptune', name: '海王星', position: { x: 30.1, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'pluto', name: '冥王星', position: { x: 39.5, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-io',
    name: '木卫一炼狱',
    description: '探索太阳系最活跃的火山卫星',
    waypoints: [
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'io', name: '木卫一', position: { x: 5.200042, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-callisto',
    name: '木卫四遗迹',
    description: '探访木卫四布满陨石坑的表面',
    waypoints: [
      { bodyId: 'jupiter', name: '木星', position: { x: 5.2, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'callisto', name: '木卫四', position: { x: 5.200188, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-triton',
    name: '海卫一秘境',
    description: '探索海王星最大的卫星',
    waypoints: [
      { bodyId: 'neptune', name: '海王星', position: { x: 30.1, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'triton', name: '海卫一', position: { x: 30.100035, y: 0, z: 0 }, duration: 90, pauseDuration: 25 },
    ],
    totalDuration: 145,
    recommendedTime: '夜晚',
    featured: false,
  },
  {
    id: 'cruise-saturn-moons',
    name: '土星卫星群',
    description: '探访土星的众多卫星',
    waypoints: [
      { bodyId: 'saturn', name: '土星', position: { x: 9.5, y: 0, z: 0 }, duration: 30, pauseDuration: 5 },
      { bodyId: 'titan', name: '土卫六', position: { x: 9.5008, y: 0, z: 0 }, duration: 45, pauseDuration: 15 },
      { bodyId: 'enceladus', name: '土卫二', position: { x: 9.500023, y: 0, z: 0 }, duration: 45, pauseDuration: 15 },
      { bodyId: 'rhea', name: '土卫五', position: { x: 9.500053, y: 0, z: 0 }, duration: 45, pauseDuration: 15 },
    ],
    totalDuration: 195,
    recommendedTime: '夜晚',
    featured: false,
  },
];

export class EventsServiceImpl implements EventsService {
  private events: CelestialEvent[] = [];
  private subscribers: Array<(event: CelestialEvent) => void> = [];
  private readonly eventSearchFn?: (windowStart: Date, windowEnd: Date) => EventResult[];

  constructor(eventSearchFn?: (windowStart: Date, windowEnd: Date) => EventResult[]) {
    this.eventSearchFn = eventSearchFn;
  }

  /**
   * E-19: 实时调用 eventSearchFn 计算事件窗口；未提供则返回空数组。
   * 内部缓存最近一次搜索结果以便 getEvent/getUpcomingEvents/getPastEvents 复用。
   */
  search(options: EventSearchOptions): CelestialEvent[] {
    let results: CelestialEvent[];

    if (this.eventSearchFn) {
      const windowStart = options.startDate ?? new Date(0);
      const windowEnd = options.endDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      results = this.eventSearchFn(windowStart, windowEnd);
      this.events = results;
    } else {
      results = this.events;
    }

    if (options.types?.length) {
      results = results.filter((e) => options.types!.includes(e.type));
    }

    const startDate = options.startDate;
    if (startDate) {
      results = results.filter((e) => e.startDate >= startDate);
    }

    const endDate = options.endDate;
    if (endDate) {
      results = results.filter((e) => e.endDate <= endDate);
    }

    const body = options.body;
    if (body) {
      results = results.filter((e) => e.bodies.includes(body));
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  getEvent(id: string): CelestialEvent | null {
    return this.events.find((e) => e.id === id) || null;
  }

  getUpcomingEvents(limit: number = 10): CelestialEvent[] {
    const now = new Date();
    return this.events
      .filter((e) => e.startDate > now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, limit);
  }

  getPastEvents(limit: number = 10): CelestialEvent[] {
    const now = new Date();
    return this.events
      .filter((e) => e.endDate < now)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
      .slice(0, limit);
  }

  subscribe(callback: (event: CelestialEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  private notify(event: CelestialEvent): void {
    this.subscribers.forEach((callback) => callback(event));
  }

  addEvent(event: CelestialEvent): void {
    this.events.push(event);
    this.notify(event);
  }
}

export class CruiseServiceImpl implements CruiseService {
  private cruises: Cruise[] = CRUISES;
  private currentCruise: Cruise | null = null;
  private currentWaypointIndex = 0;
  private isPaused = false;
  private progress = 0;
  private elapsedTime = 0;
  private callbacks: CruiseCallbacks = {};
  private lastWaypointIndex = -1;

  /**
   * FR-TOUR-003：从静态 JSON 文件加载巡航配置。
   *
   * 巡航配置为静态只读文件（data/cruises/cruises.json），不再硬编码在源码中。
   * 调用此方法后，cruises 列表替换为 JSON 文件中的配置。
   *
   * @param cruiseData 从 JSON 文件解析的 Cruise 数组
   */
  loadCruisesFromJson(cruiseData: Cruise[]): void {
    if (!Array.isArray(cruiseData)) {
      throw new Error('loadCruisesFromJson: cruiseData 必须是数组');
    }
    this.cruises = cruiseData;
  }

  /**
   * FR-TOUR-003：异步从 URL 加载巡航配置 JSON。
   *
   * @param url 巡航配置 JSON 的 URL（如 /data/cruises/cruises.json）
   */
  async loadCruisesFromUrl(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`加载巡航配置失败: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as Cruise[];
    this.loadCruisesFromJson(data);
  }

  getAllCruises(): Cruise[] {
    return [...this.cruises];
  }

  getCruise(id: string): Cruise | null {
    return this.cruises.find((c) => c.id === id) || null;
  }

  getFeaturedCruises(): Cruise[] {
    return this.cruises.filter((c) => c.featured);
  }

  setCallbacks(callbacks: CruiseCallbacks): void {
    this.callbacks = callbacks;
  }

  startCruise(id: string): void {
    const cruise = this.getCruise(id);
    if (!cruise) {
      throw new Error(`Cruise not found: ${id}`);
    }

    this.currentCruise = cruise;
    this.currentWaypointIndex = 0;
    this.isPaused = false;
    this.progress = 0;
    this.elapsedTime = 0;
    this.lastWaypointIndex = -1;
  }

  pauseCruise(): void {
    if (this.currentCruise && !this.isPaused) {
      this.isPaused = true;
    }
  }

  resumeCruise(): void {
    if (this.currentCruise && this.isPaused) {
      this.isPaused = false;
    }
  }

  stopCruise(): void {
    this.currentCruise = null;
    this.currentWaypointIndex = 0;
    this.isPaused = false;
    this.progress = 0;
    this.elapsedTime = 0;
    this.lastWaypointIndex = -1;
  }

  /**
   * E-22: 使用 elapsedTime / totalDuration 计算进度（不再依赖 Date.now()）。
   */
  getCurrentProgress(): number {
    if (!this.currentCruise) {
      return 0;
    }

    if (this.isPaused) {
      return this.progress;
    }

    const totalMs = this.currentCruise.totalDuration * 60 * 1000;
    if (totalMs <= 0) {
      return 0;
    }
    this.progress = Math.min(100, (this.elapsedTime / totalMs) * 100);
    return this.progress;
  }

  getCurrentWaypoint(): CruiseWaypoint | null {
    if (!this.currentCruise || this.currentWaypointIndex >= this.currentCruise.waypoints.length) {
      return null;
    }
    const waypoint = this.currentCruise.waypoints[this.currentWaypointIndex];
    return waypoint ?? null;
  }

  /**
   * E-22: update(deltaTime) 推进 elapsedTime、计算当前 waypoint，
   * 在 waypoint 切换时触发 onCameraChange/onClockChange/onScaleChange/onLayerVisibilityChange 回调。
   */
  update(deltaTime: number): void {
    if (!this.currentCruise || this.isPaused) {
      return;
    }

    this.elapsedTime += deltaTime;
    let accumulatedTime = 0;
    let newIndex = this.currentWaypointIndex;

    for (let i = 0; i < this.currentCruise.waypoints.length; i++) {
      const waypoint = this.currentCruise.waypoints[i];
      if (!waypoint) continue;
      const waypointTotal = (waypoint.duration + waypoint.pauseDuration) * 60 * 1000;

      if (this.elapsedTime < accumulatedTime + waypointTotal) {
        newIndex = i;
        break;
      }

      accumulatedTime += waypointTotal;
      // If we've passed all waypoints, finish
      if (i === this.currentCruise.waypoints.length - 1) {
        this.stopCruise();
        return;
      }
    }

    this.currentWaypointIndex = newIndex;

    // Trigger callbacks only when waypoint changes
    if (newIndex !== this.lastWaypointIndex) {
      this.lastWaypointIndex = newIndex;
      const waypoint = this.getCurrentWaypoint();
      if (waypoint) {
        this.invokeWaypointCallbacks(waypoint);
      }
    }
  }

  private invokeWaypointCallbacks(waypoint: CruiseWaypoint): void {
    if (this.callbacks.onCameraChange) {
      this.callbacks.onCameraChange(
        waypoint.cameraTarget ?? null,
        waypoint.cameraPosition ?? null,
        waypoint.cameraDirection ?? null,
      );
    }
    if (this.callbacks.onClockChange) {
      this.callbacks.onClockChange(waypoint.timeSetting ?? null, waypoint.timeMultiplier ?? null);
    }
    if (this.callbacks.onScaleChange) {
      this.callbacks.onScaleChange(waypoint.scaleMode ?? null);
    }
    if (this.callbacks.onLayerVisibilityChange) {
      this.callbacks.onLayerVisibilityChange(waypoint.layerVisibility ?? null);
    }
  }
}

export class PureViewingModeImpl implements PureViewingMode {
  private active = false;
  private targetBodyId: string | null = null;
  private autoRotate = true;
  private ambientMode = false;
  private callbacks: PureViewingCallbacks = {};

  setCallbacks(callbacks: PureViewingCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * E-23: enter() 触发 UI 隐藏 + HUD 禁用回调。
   */
  enter(): void {
    this.active = true;
    this.callbacks.onUIVisibilityChange?.(false);
    this.callbacks.onHUDDisabled?.(true);
  }

  /**
   * E-23: exit() 触发 UI 恢复可见。
   */
  exit(): void {
    this.active = false;
    this.callbacks.onUIVisibilityChange?.(true);
    this.callbacks.onHUDDisabled?.(false);
  }

  isActive(): boolean {
    return this.active;
  }

  setTarget(bodyId: string): void {
    this.targetBodyId = bodyId;
  }

  getTarget(): string | null {
    return this.targetBodyId;
  }

  /**
   * E-23: setAutoRotate 在 active 状态下触发 onAutoRotateChange 回调。
   */
  setAutoRotate(enabled: boolean): void {
    const changed = this.autoRotate !== enabled;
    this.autoRotate = enabled;
    if (changed && this.active) {
      this.callbacks.onAutoRotateChange?.(enabled);
    }
  }

  getAutoRotate(): boolean {
    return this.autoRotate;
  }

  /**
   * E-23: setAmbientMode 在 active 状态下触发 onAmbientModeChange 回调。
   */
  setAmbientMode(enabled: boolean): void {
    const changed = this.ambientMode !== enabled;
    this.ambientMode = enabled;
    if (changed && this.active) {
      this.callbacks.onAmbientModeChange?.(enabled);
    }
  }

  getAmbientMode(): boolean {
    return this.ambientMode;
  }
}

export const createEventsService = (
  eventSearchFn?: (windowStart: Date, windowEnd: Date) => EventResult[],
): EventsService => {
  return new EventsServiceImpl(eventSearchFn);
};

export const createCruiseService = (): CruiseService => {
  return new CruiseServiceImpl();
};

export const createPureViewingMode = (): PureViewingMode => {
  return new PureViewingModeImpl();
};

/**
 * 推荐相机参数（用于 jumpToEventMax 返回值）。
 */
export interface EventCameraRecommendation {
  bodyId: string;
  position: Vec3d;
  direction: { yaw: number; pitch: number; roll: number };
  fov: number;
}

/**
 * jumpToEventMax 返回值：peak 时刻的时钟值 + 推荐相机。
 */
export interface JumpToEventResult {
  eventId: string;
  clock: Date;
  camera: EventCameraRecommendation;
}

/**
 * FR-EVENT: 计算 event 在 peak 时刻的时钟和推荐相机参数。
 * - clock 使用 event.peakDate
 * - camera.bodyId 取 event.bodies 中除 'sun' 之外的第一个，没有则取 bodies[0]
 * - camera.position 给一个简单的偏置位置（bodyId 视点前方 1e6 米）
 * - camera.direction 默认 yaw=0/pitch=0/roll=0
 */
export function jumpToEventMax(event: CelestialEvent): JumpToEventResult {
  const targetBodyId = event.bodies.find((b) => b !== 'sun') ?? event.bodies[0] ?? 'earth';
  const position: Vec3d = {
    x: event.coordinates?.x ?? 1e6,
    y: event.coordinates?.y ?? 0,
    z: event.coordinates?.z ?? 0,
  };
  const camera: EventCameraRecommendation = {
    bodyId: targetBodyId,
    position,
    direction: { yaw: 0, pitch: 0, roll: 0 },
    fov: 60,
  };
  return {
    eventId: event.id,
    clock: event.peakDate,
    camera,
  };
}

/**
 * FR-EVENT: 事件时间线播放器。
 * - startTimeline(eventIds, onTick): 注册一组 event id 和 tick 回调，进入 active 状态。
 * - tick(index): 推进当前指针，调用 onTick，返回是否仍在范围内。
 * - stopTimeline(): 退出 active 状态，清空回调。
 */
export class EventTimelinePlayer {
  private eventIds: string[] = [];
  private currentIndex = 0;
  private active = false;
  private onTickFn: ((eventId: string, index: number, total: number) => void) | null = null;

  startTimeline(
    eventIds: string[],
    onTick: (eventId: string, index: number, total: number) => void,
  ): void {
    this.eventIds = [...eventIds];
    this.onTickFn = onTick;
    this.currentIndex = 0;
    this.active = true;
    if (this.eventIds.length > 0) {
      const first = this.eventIds[0];
      if (first !== undefined) {
        this.onTickFn?.(first, 0, this.eventIds.length);
      }
    }
  }

  stopTimeline(): void {
    this.active = false;
    this.eventIds = [];
    this.onTickFn = null;
    this.currentIndex = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getEventIds(): string[] {
    return [...this.eventIds];
  }

  /**
   * 前进到下一帧。返回 true 表示仍在范围内；false 表示已到末尾并自动停止。
   */
  tick(): boolean {
    if (!this.active) {
      return false;
    }
    this.currentIndex += 1;
    if (this.currentIndex >= this.eventIds.length) {
      this.stopTimeline();
      return false;
    }
    const id = this.eventIds[this.currentIndex];
    if (id !== undefined) {
      this.onTickFn?.(id, this.currentIndex, this.eventIds.length);
    }
    return true;
  }

  /**
   * 跳转到指定 index。返回 true 表示成功；false 表示 index 越界。
   */
  seekTo(index: number): boolean {
    if (!this.active || index < 0 || index >= this.eventIds.length) {
      return false;
    }
    this.currentIndex = index;
    const id = this.eventIds[index];
    if (id !== undefined) {
      this.onTickFn?.(id, index, this.eventIds.length);
    }
    return true;
  }
}


