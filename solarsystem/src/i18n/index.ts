/**
 * Localization.
 *
 * All user-visible strings live here; nothing is hard-coded inside components.
 * Chinese and English are both first-class, and the language can be switched at
 * runtime from the HUD or fixed for an installation in exhibition.config.json.
 */
export type Language = 'zh-CN' | 'en-US'

export interface Dictionary {
  appTitle: string
  appSubtitle: string
  enterSystem: string
  loadingTitle: string
  sourcesNote: string
  realtimeBadge: string
  autoDemo: string
  autoDemoHint: string
  simTime: string
  speed: string
  speedPaused: string
  speedRealtime: string
  jumpTo: string
  jumpGo: string
  jumpPlaceholder: string
  jumpInvalid: string
  stepBack: string
  stepForward: string
  reverse: string
  pause: string
  play: string
  now: string
  timeJumped: string
  search: string
  searchPlaceholder: string
  searchEmpty: string
  searchNoResult: string
  target: string
  flyTo: string
  clearSelection: string
  camera: string
  cameraOrbit: string
  cameraFollow: string
  cameraSurface: string
  cameraFree: string
  cameraOverview: string
  freeFlightHint: string
  scale: string
  scaleScientific: string
  scaleVisible: string
  scaleExhibition: string
  scaleEnhancedWarning: string
  scaleNonLinearWarning: string
  layers: string
  orbits: string
  showAllOrbits: string
  labels: string
  minorBodies: string
  starfield: string
  atmosphere: string
  filters: string
  filterMainBelt: string
  filterNearEarth: string
  filterTrojan: string
  filterCentaur: string
  filterTno: string
  filterComet: string
  quality: string
  qualityAuto: string
  scientificMode: string
  performance: string
  legend: string
  legendStar: string
  legendPlanet: string
  legendDwarf: string
  legendMoon: string
  legendAsteroid: string
  legendComet: string
  legendTno: string
  objects: string
  groupStar: string
  groupPlanets: string
  groupDwarfs: string
  groupMoons: string
  groupMinor: string
  infoBasic: string
  infoOrbit: string
  infoPhysical: string
  infoAbout: string
  fieldCategory: string
  fieldOfficialName: string
  fieldParent: string
  fieldRadius: string
  fieldDiameter: string
  fieldMass: string
  fieldDensity: string
  fieldGravity: string
  fieldEscapeVelocity: string
  fieldAlbedo: string
  fieldSemiMajorAxis: string
  fieldEccentricity: string
  fieldInclination: string
  fieldPeriod: string
  fieldPeriapsis: string
  fieldApoapsis: string
  fieldRotationPeriod: string
  fieldAxialTilt: string
  fieldDiscovered: string
  fieldDiscoverer: string
  fieldDistanceFromSun: string
  fieldDistanceFromParent: string
  fieldDistanceFromCamera: string
  fieldVelocity: string
  fieldJulianDate: string
  fieldPosition: string
  fieldDataMode: string
  fieldDataSource: string
  fieldSatellites: string
  fieldRings: string
  fieldAbsoluteMagnitude: string
  fieldClass: string
  fieldBucket: string
  fieldMoid: string
  fieldFirstObservation: string
  valueUnknown: string
  valueYes: string
  valueNo: string
  typeStar: string
  typePlanet: string
  typeDwarfPlanet: string
  typeMoon: string
  typeAsteroid: string
  typeComet: string
  typeTno: string
  typeCentaur: string
  positionModelEphemeris: string
  positionModelKepler: string
  positionModelOrigin: string
  phaseConvention: string
  phasePublished: string
  proceduralSurface: string
  tour: string
  tourStart: string
  tourNext: string
  tourPrevious: string
  tourExit: string
  tourFinished: string
  tourStepOf: string
  tourStop: string
  settings: string
  close: string
  language: string
  statistics: string
  statBodies: string
  statMinorBodies: string
  statStars: string
  statOrbits: string
  statLabels: string
  statQuality: string
  statCamera: string
  statDrawn: string
  contextLost: string
  contextRestored: string
  minorBodySelected: string
  selectHint: string
  doubleClickHint: string
  dragHint: string
  pinchHint: string
  keysHint: string
  noMinorCatalog: string
  loadingFailed: string
  retry: string
  visitMoon: string
  zoomIn: string
  zoomOut: string
  positionUnavailable: string
  scientificModeOff: string
  narrationSun: string
  narrationMercury: string
  narrationVenus: string
  narrationEarth: string
  narrationMars: string
  narrationJupiter: string
  narrationSaturn: string
  narrationUranus: string
  narrationNeptune: string
  narrationPluto: string
  narrationMoon: string
  narrationGeneric: string
  resetView: string
  fullscreen: string
  orbitPlaneHint: string
  cometTails: string
  cometTailHint: string
  tourRoute: string
  runtimeErrorTitle: string
  runtimeErrorDetail: string
  minorBudgetNote: string
  loadingTextures: string
  splashLead: string
  splashLiveBackground: string
}

export const zhCN: Dictionary = {
  appTitle: '太阳系 · 真实三维导览',
  appSubtitle: 'SOLAR SYSTEM EXPLORER',
  enterSystem: '进入太阳系',
  loadingTitle: 'SOLAR SYSTEM / INITIALIZING ASTRONOMICAL DATA',
  sourcesNote: '数据来源：NASA/JPL（行星轨道根数、小天体数据库、卫星平均轨道要素）、NASA/NSSDC（行星与卫星物理参数）、HYG 星表（真实恒星背景）。比例与坐标约定见 README。',
  realtimeBadge: '实时位置',
  autoDemo: '【自动演示模式】',
  autoDemoHint: '检测到长时间无操作，正在自动漫游；任意操作即可退出。',
  simTime: '模拟时间',
  speed: '速度',
  speedPaused: '暂停',
  speedRealtime: '实时',
  jumpTo: '跳转日期',
  jumpGo: '跳转',
  jumpPlaceholder: '2026-09-29 或 JD 2461312.5',
  jumpInvalid: '无法识别的日期格式',
  stepBack: '后退',
  stepForward: '前进',
  reverse: '倒放',
  pause: '暂停',
  play: '播放',
  now: '回到当前时刻',
  timeJumped: '已跳转到指定时刻',
  search: '搜索',
  searchPlaceholder: '搜索太阳系天体（Earth / Europa / 67P / Eris）',
  searchEmpty: '输入名称、编号或别名开始搜索',
  searchNoResult: '没有匹配的天体',
  target: '锁定目标',
  flyTo: '飞向该天体',
  clearSelection: '取消选择',
  camera: '视角',
  cameraOrbit: '自由视角',
  cameraFollow: '跟随',
  cameraSurface: '近天体',
  cameraFree: '自由飞行',
  cameraOverview: '太阳系全景',
  freeFlightHint: 'W A S D 平移，Q E 升降，Shift 加速，滚轮调节速度',
  scale: '尺度',
  scaleScientific: '科学尺度',
  scaleVisible: '科普尺度',
  scaleExhibition: '展览尺度',
  scaleEnhancedWarning: '天体尺寸已视觉增强',
  scaleNonLinearWarning: '距离为非线性映射，非真实比例',
  layers: '显示层',
  orbits: '轨道',
  showAllOrbits: '显示全部主要轨道',
  labels: '标签',
  minorBodies: '小天体',
  starfield: '恒星背景',
  atmosphere: '大气',
  filters: '筛选',
  filterMainBelt: '小行星带',
  filterNearEarth: '近地天体',
  filterTrojan: '特洛伊群',
  filterCentaur: '半人马小行星',
  filterTno: '海王星外天体',
  filterComet: '彗星',
  quality: '画质',
  qualityAuto: '自动',
  scientificMode: '科学模式',
  performance: '性能',
  legend: '图例',
  legendStar: '恒星',
  legendPlanet: '行星',
  legendDwarf: '矮行星',
  legendMoon: '卫星',
  legendAsteroid: '小行星',
  legendComet: '彗星',
  legendTno: '海王星外天体',
  objects: '天体列表',
  groupStar: '恒星',
  groupPlanets: '行星',
  groupDwarfs: '矮行星',
  groupMoons: '天然卫星',
  groupMinor: '小天体',
  infoBasic: '基本信息',
  infoOrbit: '轨道参数',
  infoPhysical: '物理特性',
  infoAbout: '科普介绍',
  fieldCategory: '天体类别',
  fieldOfficialName: '官方名称',
  fieldParent: '所属系统',
  fieldRadius: '平均半径',
  fieldDiameter: '直径',
  fieldMass: '质量',
  fieldDensity: '平均密度',
  fieldGravity: '表面重力',
  fieldEscapeVelocity: '逃逸速度',
  fieldAlbedo: '反照率',
  fieldSemiMajorAxis: '轨道半长轴',
  fieldEccentricity: '轨道离心率',
  fieldInclination: '轨道倾角',
  fieldPeriod: '公转周期',
  fieldPeriapsis: '近日点',
  fieldApoapsis: '远日点',
  fieldRotationPeriod: '自转周期',
  fieldAxialTilt: '自转轴倾角',
  fieldDiscovered: '发现时间',
  fieldDiscoverer: '发现者',
  fieldDistanceFromSun: '距太阳距离',
  fieldDistanceFromParent: '距母天体距离',
  fieldDistanceFromCamera: '距相机距离',
  fieldVelocity: '轨道速度',
  fieldJulianDate: '儒略日',
  fieldPosition: '当前模拟时间位置',
  fieldDataMode: '位置计算模式',
  fieldDataSource: '数据来源',
  fieldSatellites: '已编目卫星数',
  fieldRings: '行星环',
  fieldAbsoluteMagnitude: '绝对星等 H',
  fieldClass: '动力学分类',
  fieldBucket: '所属族',
  fieldMoid: '与地球最小轨道交点距离',
  fieldFirstObservation: '首次观测',
  valueUnknown: '暂无可靠数据',
  valueYes: '有',
  valueNo: '无',
  typeStar: '恒星',
  typePlanet: '行星',
  typeDwarfPlanet: '矮行星',
  typeMoon: '天然卫星',
  typeAsteroid: '小行星',
  typeComet: '彗星',
  typeTno: '海王星外天体',
  typeCentaur: '半人马小行星',
  positionModelEphemeris: '高精度历表（VSOP87 / ELP2000，Mode A）',
  positionModelKepler: '开普勒轨道传播（Mode B）',
  positionModelOrigin: '坐标原点',
  phaseConvention: '轨道相位：约定值（无公开平近点角）',
  phasePublished: '轨道相位：JPL 平均轨道要素',
  proceduralSurface: '表面贴图为程序化生成（无公开全球影像）',
  tour: '导览',
  tourStart: '开始导览',
  tourNext: '下一站',
  tourPrevious: '上一站',
  tourExit: '退出导览',
  tourFinished: '导览结束，已恢复自由探索',
  tourStepOf: '第 {current} / {total} 站',
  tourStop: '站点',
  settings: '设置',
  close: '关闭',
  language: '语言',
  statistics: '统计',
  statBodies: '已编目天体',
  statMinorBodies: '小天体',
  statStars: '恒星',
  statOrbits: '轨道线',
  statLabels: '标签',
  statQuality: '画质',
  statCamera: '视角',
  statDrawn: '当前渲染天体',
  contextLost: '图形上下文丢失，正在尝试恢复',
  contextRestored: '图形上下文已恢复',
  minorBodySelected: '已选择小天体',
  selectHint: '单击选择天体，双击飞向天体',
  doubleClickHint: '双击目标可飞抵观测',
  dragHint: '拖动旋转，滚轮缩放',
  pinchHint: '单指旋转，双指缩放/平移',
  keysHint: '键盘：W A S D / Q E 自由飞行',
  noMinorCatalog: '小天体目录未加载，其余功能不受影响',
  loadingFailed: '数据加载失败',
  retry: '重试',
  visitMoon: '查看月球',
  zoomIn: '放大',
  zoomOut: '缩小',
  positionUnavailable: '该天体此刻的位置暂不可用，位置与速度不显示推算值。',
  scientificModeOff: '开启“科学模式”可显示位置计算模式、尺度放大倍率、LOD 与数据来源等科学读数。',
  narrationSun: '太阳是太阳系唯一的恒星，提供全部主要光照。其质量约占太阳系总质量的 99.86%，自转周期约 609 小时（赤道更快）。',
  narrationMercury: '水星是距太阳最近的行星，轨道离心率 0.206，表面几乎没有大气，昼夜温差极端。',
  narrationVenus: '金星拥有浓密的二氧化碳大气与硫酸云层，逆向自转，是太阳系最热的行星表面。',
  narrationEarth: '地球是目前已知唯一存在液态水海洋与生命的行星，自转轴倾角 23.44°，一颗天然卫星。',
  narrationMars: '火星表面覆盖氧化铁尘埃，拥有两颗小卫星与太阳系最高的火山。轨道离心率较大，季节变化显著。',
  narrationJupiter: '木星是太阳系质量最大的行星，自转最快，拥有四颗伽利略卫星与一个暗弱的环系。',
  narrationSaturn: '土星以壮观的环系著称，环位于赤道面内；土卫六拥有浓密大气，土卫二存在冰下海洋的证据。',
  narrationUranus: '天王星自转轴几乎与轨道面平行，环与卫星系统随之近乎垂直运行。',
  narrationNeptune: '海王星是距太阳最远的行星，风速可达超音速；海卫一为逆行轨道，可能为被俘获的柯伊伯带天体。',
  narrationPluto: '冥王星是柯伊伯带中最著名的矮行星，与冥卫一构成潮汐锁定的双天体系统。',
  narrationMoon: '月球是地球唯一的天然卫星，轨道半长轴 384 400 km，潮汐锁定使其永远以同一面朝向地球。',
  narrationGeneric: '该天体由公开轨道根数传播计算，详细参数见“轨道参数”与“物理特性”标签页。',
  resetView: '复位视角',
  fullscreen: '全屏',
  orbitPlaneHint: '轨道面：黄道 J2000',
  cometTails: '彗发与彗尾',
  cometTailHint: '尘埃尾沿轨道外侧弯曲，离子尾始终背离太阳。',
  tourRoute: '{total} 站的导览路线：太阳 → 行星 → 地月系统 → 小行星带 → 巨行星 → 外层太阳系。',
  runtimeErrorTitle: 'SOLAR SYSTEM / 运行时错误',
  runtimeErrorDetail: '展项组件发生异常，已阻止整页空白。请重试；若反复出现，请查看控制台堆栈并检查显卡驱动与浏览器硬件加速设置。',
  minorBudgetNote: '画质档位限制了同时绘制的小天体数量，云中天体为均匀抽样。',
  loadingTextures: '正在加载行星表面贴图（按画质档位选择分辨率）…',
  splashLead: '以真实天体历表与轨道根数驱动的三维太阳系。可自由操控时间、视角与尺度，逐层深入太阳、行星、卫星与已编目的小天体世界。',
  splashLiveBackground: '背景为实时渲染的太阳系场景',
}

export const enUS: Dictionary = {
  appTitle: 'Real-Time Solar System',
  appSubtitle: 'SOLAR SYSTEM EXPLORER',
  enterSystem: 'Enter the solar system',
  loadingTitle: 'SOLAR SYSTEM / INITIALIZING ASTRONOMICAL DATA',
  sourcesNote: 'Sources: NASA/JPL (planetary elements, Small-Body Database, satellite mean elements), NASA/NSSDC (planetary and satellite physical parameters), HYG catalogue (stellar background). See the README for the scale and coordinate conventions.',
  realtimeBadge: 'real-time positions',
  autoDemo: '[ AUTO DEMO ]',
  autoDemoHint: 'No interaction detected — running the guided tour. Touch anything to exit.',
  simTime: 'Simulation time',
  speed: 'Speed',
  speedPaused: 'Paused',
  speedRealtime: 'Real time',
  jumpTo: 'Jump to date',
  jumpGo: 'Go',
  jumpPlaceholder: '2026-09-29 or JD 2461312.5',
  jumpInvalid: 'Unrecognised date format',
  stepBack: 'Step back',
  stepForward: 'Step forward',
  reverse: 'Reverse',
  pause: 'Pause',
  play: 'Play',
  now: 'Back to now',
  timeJumped: 'Jumped to the requested instant',
  search: 'Search',
  searchPlaceholder: 'Search solar-system bodies (Earth / Europa / 67P / Eris)',
  searchEmpty: 'Type a name, number or alias to search',
  searchNoResult: 'No matching body',
  target: 'Target',
  flyTo: 'Fly to this body',
  clearSelection: 'Clear selection',
  camera: 'Camera',
  cameraOrbit: 'Orbit',
  cameraFollow: 'Follow',
  cameraSurface: 'Near object',
  cameraFree: 'Free flight',
  cameraOverview: 'Solar system overview',
  freeFlightHint: 'W A S D translate, Q E up/down, Shift boost, wheel adjusts speed',
  scale: 'Scale',
  scaleScientific: 'Scientific',
  scaleVisible: 'Visible',
  scaleExhibition: 'Exhibition',
  scaleEnhancedWarning: 'Body sizes are visually enhanced',
  scaleNonLinearWarning: 'Distances use a non-linear mapping',
  layers: 'Layers',
  orbits: 'Orbits',
  showAllOrbits: 'Show all major orbits',
  labels: 'Labels',
  minorBodies: 'Small bodies',
  starfield: 'Starfield',
  atmosphere: 'Atmospheres',
  filters: 'Filters',
  filterMainBelt: 'Asteroid belt',
  filterNearEarth: 'Near-Earth objects',
  filterTrojan: 'Trojans',
  filterCentaur: 'Centaurs',
  filterTno: 'Trans-Neptunian objects',
  filterComet: 'Comets',
  quality: 'Quality',
  qualityAuto: 'Auto',
  scientificMode: 'Scientific mode',
  performance: 'Performance',
  legend: 'Legend',
  legendStar: 'Star',
  legendPlanet: 'Planet',
  legendDwarf: 'Dwarf planet',
  legendMoon: 'Moon',
  legendAsteroid: 'Asteroid',
  legendComet: 'Comet',
  legendTno: 'Trans-Neptunian object',
  objects: 'Catalog',
  groupStar: 'Star',
  groupPlanets: 'Planets',
  groupDwarfs: 'Dwarf planets',
  groupMoons: 'Natural satellites',
  groupMinor: 'Small bodies',
  infoBasic: 'Overview',
  infoOrbit: 'Orbit',
  infoPhysical: 'Physical',
  infoAbout: 'About',
  fieldCategory: 'Category',
  fieldOfficialName: 'Official name',
  fieldParent: 'System',
  fieldRadius: 'Mean radius',
  fieldDiameter: 'Diameter',
  fieldMass: 'Mass',
  fieldDensity: 'Mean density',
  fieldGravity: 'Surface gravity',
  fieldEscapeVelocity: 'Escape velocity',
  fieldAlbedo: 'Albedo',
  fieldSemiMajorAxis: 'Semi-major axis',
  fieldEccentricity: 'Eccentricity',
  fieldInclination: 'Inclination',
  fieldPeriod: 'Orbital period',
  fieldPeriapsis: 'Perihelion',
  fieldApoapsis: 'Aphelion',
  fieldRotationPeriod: 'Rotation period',
  fieldAxialTilt: 'Axial tilt',
  fieldDiscovered: 'Discovered',
  fieldDiscoverer: 'Discoverer',
  fieldDistanceFromSun: 'Distance from Sun',
  fieldDistanceFromParent: 'Distance from parent',
  fieldDistanceFromCamera: 'Distance from camera',
  fieldVelocity: 'Orbital speed',
  fieldJulianDate: 'Julian Date',
  fieldPosition: 'Position at the displayed time',
  fieldDataMode: 'Position model',
  fieldDataSource: 'Data source',
  fieldSatellites: 'Catalogued satellites',
  fieldRings: 'Ring system',
  fieldAbsoluteMagnitude: 'Absolute magnitude H',
  fieldClass: 'Dynamical class',
  fieldBucket: 'Family',
  fieldMoid: 'Earth MOID',
  fieldFirstObservation: 'First observation',
  valueUnknown: 'no reliable data',
  valueYes: 'yes',
  valueNo: 'no',
  typeStar: 'Star',
  typePlanet: 'Planet',
  typeDwarfPlanet: 'Dwarf planet',
  typeMoon: 'Natural satellite',
  typeAsteroid: 'Asteroid',
  typeComet: 'Comet',
  typeTno: 'Trans-Neptunian object',
  typeCentaur: 'Centaur',
  positionModelEphemeris: 'High-accuracy ephemeris (VSOP87 / ELP2000, Mode A)',
  positionModelKepler: 'Keplerian propagation (Mode B)',
  positionModelOrigin: 'Origin',
  phaseConvention: 'Orbit phase: convention value (no published mean anomaly)',
  phasePublished: 'Orbit phase: JPL mean elements',
  proceduralSurface: 'Surface map generated procedurally (no published global imagery)',
  tour: 'Guided tour',
  tourStart: 'Start the tour',
  tourNext: 'Next stop',
  tourPrevious: 'Previous stop',
  tourExit: 'Exit tour',
  tourFinished: 'Tour finished, free exploration restored',
  tourStepOf: 'Stop {current} of {total}',
  tourStop: 'stop',
  settings: 'Settings',
  close: 'Close',
  language: 'Language',
  statistics: 'Statistics',
  statBodies: 'Catalogued bodies',
  statMinorBodies: 'Small bodies',
  statStars: 'Stars',
  statOrbits: 'Orbit paths',
  statLabels: 'Labels',
  statQuality: 'Quality',
  statCamera: 'Camera',
  statDrawn: 'Bodies drawn',
  contextLost: 'Graphics context lost — attempting to restore',
  contextRestored: 'Graphics context restored',
  minorBodySelected: 'Small body selected',
  selectHint: 'Click to select, double-click to fly there',
  doubleClickHint: 'Double-click a target to fly to it',
  dragHint: 'Drag to rotate, wheel to zoom',
  pinchHint: 'One finger rotates, two fingers zoom and pan',
  keysHint: 'Keys: W A S D / Q E for free flight',
  noMinorCatalog: 'The minor-body catalog did not load; everything else still works',
  loadingFailed: 'Failed to load the data',
  retry: 'Retry',
  visitMoon: 'Visit the Moon',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  positionUnavailable: 'The position of this object is unavailable for the displayed instant; no derived value is shown.',
  scientificModeOff: 'Enable "Scientific mode" to show the position model, scale magnification, LOD tier and data provenance.',
  narrationSun: 'The Sun is the only star in the solar system and provides essentially all of its light. It holds about 99.86 % of the system mass and rotates in roughly 609 hours.',
  narrationMercury: 'Mercury is the innermost planet, with an eccentricity of 0.206 and almost no atmosphere, producing extreme day/night temperature contrasts.',
  narrationVenus: 'Venus has a dense carbon-dioxide atmosphere and sulphuric-acid clouds, rotates retrograde, and has the hottest planetary surface in the system.',
  narrationEarth: 'The Earth is the only place known to host liquid-water oceans and life. Its 23.44° axial tilt drives the seasons, and it has one natural satellite.',
  narrationMars: 'Mars is covered in iron-oxide dust, has two small moons and the tallest volcano in the solar system. Its noticeable eccentricity produces strong seasonal effects.',
  narrationJupiter: 'Jupiter is the most massive planet and rotates fastest, with four Galilean moons and a faint ring system.',
  narrationSaturn: 'Saturn is famous for its rings, which lie in the planet equatorial plane. Titan has a dense atmosphere and Enceladus shows evidence of a subsurface ocean.',
  narrationUranus: 'Uranus rotates almost on its side, so its rings and moons orbit nearly perpendicular to the ecliptic.',
  narrationNeptune: 'Neptune is the outermost planet, with supersonic winds. Triton orbits retrograde and is probably a captured Kuiper-belt object.',
  narrationPluto: 'Pluto is the best known dwarf planet of the Kuiper belt and forms a tidally locked pair with Charon.',
  narrationMoon: 'The Moon is the Earth\'s only natural satellite. Its semi-major axis is 384 400 km and it is tidally locked, so the same face always points at the Earth.',
  narrationGeneric: 'This body is propagated from published orbital elements; see the Orbit and Physical tabs for its parameters.',
  resetView: 'Reset view',
  fullscreen: 'Full screen',
  orbitPlaneHint: 'Orbit plane: ecliptic J2000',
  cometTails: 'Coma and tails',
  cometTailHint: 'The dust tail curves away along the orbit while the ion tail always points away from the Sun.',
  tourRoute: 'A {total}-stop route: Sun → planets → Earth-Moon → asteroid belt → giant planets → outer system.',
  runtimeErrorTitle: 'SOLAR SYSTEM / RUNTIME ERROR',
  runtimeErrorDetail: 'A component failed; the page was kept alive instead of going blank. Retry, and if it recurs check the console stack, the GPU driver and hardware acceleration.',
  minorBudgetNote: 'The quality level caps how many small bodies are drawn at once; the cloud is an even sample of the filtered set.',
  loadingTextures: 'Loading planetary surface maps (resolution follows the quality level)…',
  splashLead: 'A three-dimensional solar system driven by real ephemerides and osculating elements. Control time, camera and scale freely, and explore the Sun, planets, moons and catalogued small bodies.',
  splashLiveBackground: 'The background is the live solar-system scene',
}

export const DICTIONARIES: Record<Language, Dictionary> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

export function createTranslator(language: Language) {
  const dictionary = DICTIONARIES[language]
  return (key: keyof Dictionary, variables?: Record<string, string | number>): string => {
    const template = dictionary[key] ?? key
    if (!variables) return template
    return Object.entries(variables).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
      template,
    )
  }
}

export type Translate = ReturnType<typeof createTranslator>