/**
 * Guided tour.
 *
 * The route follows the exhibition script: Sun, the inner planets, the Earth-Moon
 * system, the asteroid belt, the giant planets, then the outer solar system.
 * Narration is written from the catalogued values rather than from marketing copy;
 * the tour only changes the camera, the time rate and the layer filters, so the
 * science on screen stays consistent with free exploration.
 */
export interface TourStop {
  id: string
  /** Catalogued body to fly to. */
  targetId: string | null
  /** Special framing that is not a single body. */
  special?: 'asteroidBelt' | 'kuiperBelt'
  /** Simulation seconds per real second while the stop is active. */
  timeScale: number
  /** Layer filters to enable for this stop. */
  filters?: string[]
  title: { zh: string; en: string }
  narration: { zh: string; en: string }
}

export const TOUR_STOPS: TourStop[] = [
  {
    id: 'sun',
    targetId: 'sun',
    timeScale: 86400,
    title: { zh: '01 太阳', en: '01 The Sun' },
    narration: {
      zh: '太阳是太阳系唯一的恒星，质量约 1.989×10³⁰ kg，占太阳系总质量的 99.86%。本系统中太阳是唯一光源，行星的昼夜由真实太阳方向决定。',
      en: 'The Sun is the only star in the solar system: about 1.989×10^30 kg, or 99.86 % of the system mass. It is the only light source in this scene — every planet day/night terminator is computed from the real Sun direction.',
    },
  },
  {
    id: 'mercury',
    targetId: 'mercury',
    timeScale: 86400,
    title: { zh: '02 水星', en: '02 Mercury' },
    narration: {
      zh: '水星轨道半长轴 0.387 AU、离心率 0.206，是八大行星中偏心率最大的轨道。自转周期 1407.6 小时，公转周期 87.97 天。',
      en: 'Mercury orbits at 0.387 au with an eccentricity of 0.206 — the most eccentric planetary orbit. It rotates in 1407.6 hours and completes an orbit in 87.97 days.',
    },
  },
  {
    id: 'venus',
    targetId: 'venus',
    timeScale: 86400,
    title: { zh: '03 金星', en: '03 Venus' },
    narration: {
      zh: '金星自转周期为 −5832.6 小时（逆向自转），自转轴倾角 177.36°，因此自转方向与公转方向相反。轨道倾角 3.39°。',
      en: 'Venus rotates retrograde with a period of −5832.6 hours and an axial tilt of 177.36°, so its spin opposes its orbital motion. Orbital inclination 3.39°.',
    },
  },
  {
    id: 'earth',
    targetId: 'earth',
    timeScale: 3600,
    title: { zh: '04 地球', en: '04 The Earth' },
    narration: {
      zh: '地球轨道半长轴 1.000 AU、离心率 0.0167、轨道倾角 0.000°；自转轴倾角 23.44° 造成四季。地球使用高精度历表（VSOP87/ELP2000）计算位置。',
      en: 'The Earth orbits at 1.000 au with e = 0.0167 and i = 0.000°; its 23.44° axial tilt drives the seasons. Its position comes from the high-accuracy ephemeris (VSOP87 / ELP2000).',
    },
  },
  {
    id: 'moon',
    targetId: 'moon',
    timeScale: 3600,
    title: { zh: '05 月球', en: '05 The Moon' },
    narration: {
      zh: '月球轨道半长轴 384 400 km、离心率 0.0554、轨道倾角 5.16°（相对黄道），公转周期 27.322 天，轨道几何与相位来自 JPL 平均轨道要素。',
      en: 'The Moon orbits at 384 400 km with e = 0.0554 and i = 5.16° to the ecliptic, period 27.322 days. Geometry and phase come from JPL mean orbital elements.',
    },
  },
  {
    id: 'mars',
    targetId: 'mars',
    timeScale: 86400,
    title: { zh: '06 火星', en: '06 Mars' },
    narration: {
      zh: '火星轨道离心率 0.0934、轨道倾角 1.85°，自转周期 24.62 小时，自转轴倾角 25.19°。已编目卫星 {marsSatellites} 颗：火卫一与火卫二。',
      en: 'Mars has e = 0.0934, i = 1.85°, a 24.62-hour rotation and a 25.19° axial tilt. {marsSatellites} satellites are catalogued: Phobos and Deimos.',
    },
  },
  {
    id: 'asteroidBelt',
    targetId: null,
    special: 'asteroidBelt',
    timeScale: 10 * 86400,
    filters: ['mainBelt', 'trojan'],
    title: { zh: '07 小行星带', en: '07 The asteroid belt' },
    narration: {
      zh: '小行星带不是一条环形装饰，而是由真实轨道根数（JPL SBDB）生成的 {beltCount} 个天体，按视距与筛选动态渲染，使用 GPU 点云与 Worker 轨道计算。',
      en: 'The belt is not a decorative ring: it is {beltCount} bodies propagated from real osculating elements (JPL SBDB), rendered as a GPU point cloud with the Kepler solve running in a Web Worker.',
    },
  },
  {
    id: 'jupiter',
    targetId: 'jupiter',
    timeScale: 10 * 86400,
    title: { zh: '08 木星', en: '08 Jupiter' },
    narration: {
      zh: '木星质量 1.898×10²⁷ kg，自转周期仅 9.925 小时，是太阳系自转最快的行星。伽利略卫星的轨道平面取自木星赤道面（Laplace 面）。',
      en: 'Jupiter masses 1.898×10^27 kg and rotates in just 9.925 hours — the fastest spin in the system. Its Galilean moons are propagated in the Laplace plane, close to the planet equator.',
    },
  },
  {
    id: 'saturn',
    targetId: 'saturn',
    timeScale: 10 * 86400,
    title: { zh: '09 土星', en: '09 Saturn' },
    narration: {
      zh: '土星环位于土星赤道面内，方向由 IAU 极轴（R.A. 40.59°、Dec. +83.54°）决定；环的内外边界为 1.11–2.27 个土星半径，来自公开环系数据。',
      en: 'Saturn rings lie in the planet equatorial plane, oriented by the IAU pole (R.A. 40.59°, Dec. +83.54°). The 1.11–2.27 planetary-radius extent is the published ring geometry.',
    },
  },
  {
    id: 'uranus',
    targetId: 'uranus',
    timeScale: 30 * 86400,
    title: { zh: '10 天王星', en: '10 Uranus' },
    narration: {
      zh: '天王星自转轴倾角 97.77°，几乎“躺着”自转，环系与卫星因此近乎垂直于黄道面运动。',
      en: 'Uranus is tilted 97.77°, essentially rotating on its side, so its rings and moons orbit almost perpendicular to the ecliptic.',
    },
  },
  {
    id: 'neptune',
    targetId: 'neptune',
    timeScale: 30 * 86400,
    title: { zh: '11 海王星', en: '11 Neptune' },
    narration: {
      zh: '海王星轨道半长轴 30.07 AU，公转周期 164.8 年。轨道倾角仅 1.77°，与 1846 年由勒维耶预测位置后被发现的历史相符。',
      en: 'Neptune orbits at 30.07 au with a 164.8-year period and i = 1.77° — the planet found in 1846 where Le Verrier predicted it would be.',
    },
  },
  {
    id: 'pluto',
    targetId: 'pluto',
    timeScale: 30 * 86400,
    title: { zh: '12 冥王星', en: '12 Pluto' },
    narration: {
      zh: '冥王星轨道离心率 0.2444、轨道倾角 17.14°，与海王星处于 3:2 平运动共振。冥卫一（Charon）质量比高达 0.12，构成双行星系统。',
      en: 'Pluto has e = 0.2444 and i = 17.14°, locked in a 3:2 mean-motion resonance with Neptune. Charon is massive enough (mass ratio 0.12) for the pair to be a double system.',
    },
  },
  {
    id: 'kuiperBelt',
    targetId: null,
    special: 'kuiperBelt',
    timeScale: 30 * 86400,
    filters: ['tno', 'centaur', 'comet'],
    title: { zh: '13 柯伊伯带与海外天体', en: '13 Kuiper belt and beyond' },
    narration: {
      zh: '海王星轨道之外是海王星外天体（TNO）、半人马小行星与长周期彗星。本系统中共 {tnoCount} 个 TNO、{centaurCount} 个半人马小行星与 {cometCount} 颗彗星使用真实轨道根数传播，其中包含 {hyperbolicCount} 个双曲轨道天体。',
      en: 'Beyond Neptune lie the trans-Neptunian objects, Centaurs and long-period comets. The catalog holds {tnoCount} TNOs, {centaurCount} Centaurs and {cometCount} comets propagated from real elements, including {hyperbolicCount} hyperbolic orbits.',
    },
  },
]

export const AUTO_DEMO_STOPS = ['sun', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'neptune', 'pluto']

/**
 * Numbers the narration quotes. They are substituted at render time from the loaded
 * catalogue, because hard-coding them made the tour contradict its own data: the
 * asteroid-belt stop claimed "about 11 000 bodies" while its filters
 * (`mainBelt` + `trojan`) select 6 053, and the Kuiper-belt stop quoted counts that a
 * data refresh could silently invalidate (§4/§60).
 */
export interface TourCounts {
  marsSatellites: number
  beltCount: number
  tnoCount: number
  centaurCount: number
  cometCount: number
  hyperbolicCount: number
}

/** Derives the narration counts from the generated catalogue statistics. */
export function tourCountsFromStatistics(
  statistics: {
    minorBodiesByBucket: Record<string, number>
    satellitesByParent: Record<string, number>
    hyperbolicMinorBodies: number
  } | null,
): TourCounts {
  const buckets = statistics?.minorBodiesByBucket ?? {}
  const satellites = statistics?.satellitesByParent ?? {}
  return {
    marsSatellites: satellites.mars ?? 0,
    // Exactly the objects the asteroid-belt stop puts on screen.
    beltCount: (buckets.mainBelt ?? 0) + (buckets.trojan ?? 0),
    tnoCount: buckets.tno ?? 0,
    centaurCount: buckets.centaur ?? 0,
    cometCount: buckets.comet ?? 0,
    hyperbolicCount: statistics?.hyperbolicMinorBodies ?? 0,
  }
}

/** Narration with the catalogue-derived numbers substituted in. */
export function tourNarration(stop: TourStop, language: 'zh-CN' | 'en-US', counts: TourCounts): string {
  const template = language === 'zh-CN' ? stop.narration.zh : stop.narration.en
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (counts as unknown as Record<string, unknown>)[key]
    return typeof value === 'number' ? value.toLocaleString('en-US') : match
  })
}

/** Seconds without input before the exhibition switches to the auto demo. */
export const DEFAULT_IDLE_SECONDS = 150