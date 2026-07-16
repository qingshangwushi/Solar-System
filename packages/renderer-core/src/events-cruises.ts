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

export interface CruiseWaypoint {
  bodyId: string;
  name: string;
  position: Vec3d;
  duration: number;
  pauseDuration: number;
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
}

export interface PureViewingMode {
  enter(): void;
  exit(): void;
  isActive(): boolean;
  setTarget(bodyId: string): void;
  setAutoRotate(enabled: boolean): void;
  setAmbientMode(enabled: boolean): void;
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
  
  constructor() {
    this.generateSampleEvents();
  }
  
  private generateSampleEvents(): void {
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    
    this.events = [
      {
        id: 'eclipse-2024-solar',
        type: 'solar_eclipse',
        title: '2024年4月8日日食',
        description: '北美洲可见的全食带日食',
        startDate: new Date(now.getTime() + 1000 * oneDay),
        endDate: new Date(now.getTime() + 1000 * oneDay + 3 * 60 * 60 * 1000),
        peakDate: new Date(now.getTime() + 1000 * oneDay + 1.5 * 60 * 60 * 1000),
        visibility: '北美洲',
        bodies: ['sun', 'moon', 'earth'],
        magnitude: 1.05,
        duration: 195,
      },
      {
        id: 'eclipse-2024-lunar',
        type: 'lunar_eclipse',
        title: '2024年9月17日月食',
        description: '全球可见的月偏食',
        startDate: new Date(now.getTime() + 2000 * oneDay),
        endDate: new Date(now.getTime() + 2000 * oneDay + 4 * 60 * 60 * 1000),
        peakDate: new Date(now.getTime() + 2000 * oneDay + 2 * 60 * 60 * 1000),
        visibility: '全球',
        bodies: ['moon', 'earth', 'sun'],
        magnitude: 0.12,
        duration: 240,
      },
      {
        id: 'conjunction-venus-jupiter-2024',
        type: 'conjunction',
        title: '金星木星合相',
        description: '两颗最亮行星近距离相遇',
        startDate: new Date(now.getTime() + 500 * oneDay),
        endDate: new Date(now.getTime() + 502 * oneDay),
        peakDate: new Date(now.getTime() + 501 * oneDay),
        visibility: '傍晚西方',
        bodies: ['venus', 'jupiter'],
      },
      {
        id: 'opposition-mars-2024',
        type: 'opposition',
        title: '火星冲日',
        description: '火星离地球最近，亮度最高',
        startDate: new Date(now.getTime() + 800 * oneDay),
        endDate: new Date(now.getTime() + 802 * oneDay),
        peakDate: new Date(now.getTime() + 801 * oneDay),
        visibility: '整夜可见',
        bodies: ['mars', 'earth', 'sun'],
      },
      {
        id: 'solstice-summer-2024',
        type: 'solstice',
        title: '夏至',
        description: '北半球白天最长的一天',
        startDate: new Date(now.getTime() + 160 * oneDay),
        endDate: new Date(now.getTime() + 160 * oneDay + 24 * 60 * 60 * 1000),
        peakDate: new Date(now.getTime() + 160 * oneDay + 12 * 60 * 60 * 1000),
        visibility: '全球',
        bodies: ['earth', 'sun'],
      },
      {
        id: 'equinox-autumn-2024',
        type: 'equinox',
        title: '秋分',
        description: '昼夜等长',
        startDate: new Date(now.getTime() + 280 * oneDay),
        endDate: new Date(now.getTime() + 280 * oneDay + 24 * 60 * 60 * 1000),
        peakDate: new Date(now.getTime() + 280 * oneDay + 12 * 60 * 60 * 1000),
        visibility: '全球',
        bodies: ['earth', 'sun'],
      },
      {
        id: 'moon-full-harvest',
        type: 'moon_phase',
        title: '秋分满月',
        description: '秋季丰收月',
        startDate: new Date(now.getTime() + 275 * oneDay),
        endDate: new Date(now.getTime() + 276 * oneDay),
        peakDate: new Date(now.getTime() + 275 * oneDay + 12 * 60 * 60 * 1000),
        visibility: '整夜可见',
        bodies: ['moon'],
      },
      {
        id: 'transit-mercury-2024',
        type: 'transit',
        title: '水星凌日',
        description: '水星从太阳表面掠过',
        startDate: new Date(now.getTime() + 600 * oneDay),
        endDate: new Date(now.getTime() + 600 * oneDay + 5 * 60 * 60 * 1000),
        peakDate: new Date(now.getTime() + 600 * oneDay + 2.5 * 60 * 60 * 1000),
        visibility: '欧洲、非洲、亚洲',
        bodies: ['mercury', 'sun'],
      },
    ];
  }
  
  search(options: EventSearchOptions): CelestialEvent[] {
    let results = this.events;
    
    if (options.types?.length) {
      results = results.filter((e) => options.types!.includes(e.type));
    }
    
    if (options.startDate) {
      results = results.filter((e) => e.startDate >= options.startDate);
    }
    
    if (options.endDate) {
      results = results.filter((e) => e.endDate <= options.endDate);
    }
    
    if (options.body) {
      results = results.filter((e) => e.bodies.includes(options.body));
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
  private startTime = 0;
  private elapsedTime = 0;
  
  getAllCruises(): Cruise[] {
    return [...this.cruises];
  }
  
  getCruise(id: string): Cruise | null {
    return this.cruises.find((c) => c.id === id) || null;
  }
  
  getFeaturedCruises(): Cruise[] {
    return this.cruises.filter((c) => c.featured);
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
    this.startTime = Date.now();
    this.elapsedTime = 0;
  }
  
  pauseCruise(): void {
    if (this.currentCruise && !this.isPaused) {
      this.isPaused = true;
      this.elapsedTime += Date.now() - this.startTime;
    }
  }
  
  resumeCruise(): void {
    if (this.currentCruise && this.isPaused) {
      this.isPaused = false;
      this.startTime = Date.now();
    }
  }
  
  stopCruise(): void {
    this.currentCruise = null;
    this.currentWaypointIndex = 0;
    this.isPaused = false;
    this.progress = 0;
    this.startTime = 0;
    this.elapsedTime = 0;
  }
  
  getCurrentProgress(): number {
    if (!this.currentCruise) {
      return 0;
    }
    
    if (this.isPaused) {
      return this.progress;
    }
    
    const currentTotal = this.elapsedTime + Date.now() - this.startTime;
    this.progress = Math.min(100, (currentTotal / (this.currentCruise.totalDuration * 60 * 1000)) * 100);
    return this.progress;
  }
  
  getCurrentWaypoint(): CruiseWaypoint | null {
    if (!this.currentCruise || this.currentWaypointIndex >= this.currentCruise.waypoints.length) {
      return null;
    }
    const waypoint = this.currentCruise.waypoints[this.currentWaypointIndex];
    return waypoint ?? null;
  }
  
  update(deltaTime: number): void {
    if (!this.currentCruise || this.isPaused) {
      return;
    }
    
    this.elapsedTime += deltaTime;
    let accumulatedTime = 0;
    
    for (let i = 0; i < this.currentCruise.waypoints.length; i++) {
      const waypoint = this.currentCruise.waypoints[i];
      const waypointTotal = (waypoint.duration + waypoint.pauseDuration) * 60 * 1000;
      
      if (this.elapsedTime < accumulatedTime + waypointTotal) {
        this.currentWaypointIndex = i;
        return;
      }
      
      accumulatedTime += waypointTotal;
    }
    
    this.stopCruise();
  }
}

export class PureViewingModeImpl implements PureViewingMode {
  private active = false;
  private targetBodyId: string | null = null;
  private autoRotate = true;
  private ambientMode = false;
  
  enter(): void {
    this.active = true;
  }
  
  exit(): void {
    this.active = false;
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
  
  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }
  
  getAutoRotate(): boolean {
    return this.autoRotate;
  }
  
  setAmbientMode(enabled: boolean): void {
    this.ambientMode = enabled;
  }
  
  getAmbientMode(): boolean {
    return this.ambientMode;
  }
}

export const createEventsService = (): EventsService => {
  return new EventsServiceImpl();
};

export const createCruiseService = (): CruiseService => {
  return new CruiseServiceImpl();
};

export const createPureViewingMode = (): PureViewingMode => {
  return new PureViewingModeImpl();
};


