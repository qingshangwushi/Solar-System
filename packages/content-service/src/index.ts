import type { BodyId, AssetTier } from '@solar-system/body-renderers';

export type RealityTier = 'R1' | 'R2' | 'R3' | 'R4';

export type PrecisionLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface BasicParams {
  size: string;
  massOrGm?: string;
  density?: string;
  gravity?: string;
  temperatureRange?: string;
  orbitalPeriod: string;
  rotationPeriod: string;
  satelliteCount?: string | null;
  assetTier: AssetTier;
  precision: PrecisionLevel;
}

export interface ContentSection {
  key: string;
  titleZh: string;
  bodyZh: string;
  realityTier: RealityTier;
}

export interface ContentCard {
  bodyId: BodyId;
  basicParams: BasicParams;
  sections: ContentSection[];
  sources: string[];
  proceduralAppearanceNote?: string | null;
}

export interface ContentService {
  getContent(bodyId: BodyId): ContentCard | null;
  getAllBodyIds(): BodyId[];
  search(query: string): BodyId[];
  getRealityTierDescription(tier: RealityTier): string;
  getPrecisionDescription(precision: PrecisionLevel): string;
}

export const REALITY_TIER_DESCRIPTIONS: Record<RealityTier, string> = {
  R1: '确定性计算或可重复几何结果',
  R2: '公开观测数据或处理后的观测数据',
  R3: '科学模型和统计推演',
  R4: '为提升观感加入的影视增强',
};

export const PRECISION_DESCRIPTIONS: Record<PrecisionLevel, string> = {
  P0: '数据不足，仅显示目录信息',
  P1: '平均轨道根数或低精度拟合',
  P2: '有限时间段数值星历或较完整摄动模型',
  P3: '高精度星历，适合科学模式',
  P4: '核心天体高精度星历，经过基准对照验证',
};

export const DEFAULT_CONTENT_DATA: Record<BodyId, ContentCard> = {
  10: {
    bodyId: 10,
    basicParams: {
      size: '半径约 695,700 公里',
      massOrGm: '1.3271244×10^20 km³/s²',
      density: '1.408 g/cm³',
      gravity: '274 m/s²',
      temperatureRange: '中心约 1.57×10^7 K，表面约 5,778 K',
      orbitalPeriod: '银河年约 2.25 亿年',
      rotationPeriod: '约 25.4 地球日（赤道），约 35 地球日（极区）',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '太阳是太阳系的中心天体，是一颗黄矮星。它占据了太阳系总质量的约 99.86%，为地球和其他行星提供光和热。',
        realityTier: 'R2',
      },
      {
        key: 'structure',
        titleZh: '内部结构',
        bodyZh: '太阳由核心、辐射层、对流层、光球层、色球层和日冕组成。核心是核聚变发生的地方，温度高达 1500 万度。',
        realityTier: 'R3',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '光球层是我们看到的太阳表面，温度约 5800K。色球层是一层稀薄的气体层，日冕是太阳的外层大气，温度可达数百万度。',
        realityTier: 'R2',
      },
      {
        key: 'activity',
        titleZh: '太阳活动',
        bodyZh: '太阳活动包括黑子、耀斑、日珥和日冕物质抛射。这些活动会影响地球的磁场和大气层，引发极光和地磁暴。',
        realityTier: 'R2',
      },
      {
        key: 'lifeCycle',
        titleZh: '生命周期',
        bodyZh: '太阳目前处于主序星阶段，年龄约 46 亿年，预计还将继续燃烧约 50 亿年，之后将演变为红巨星，最终成为白矮星。',
        realityTier: 'R3',
      },
    ],
    sources: ['NASA', 'ESA', 'IAU'],
  },
  199: {
    bodyId: 199,
    basicParams: {
      size: '半径约 2,440 公里',
      massOrGm: '2.2032×10^13 km³/s²',
      density: '5.427 g/cm³',
      gravity: '3.7 m/s²',
      temperatureRange: '白天约 427°C，夜晚约 -173°C',
      orbitalPeriod: '约 88 地球日',
      rotationPeriod: '约 58.6 地球日',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '水星是太阳系中最小的行星，也是离太阳最近的行星。它的表面布满陨石坑，外观类似月球。',
        realityTier: 'R2',
      },
      {
        key: 'surface',
        titleZh: '表面特征',
        bodyZh: '水星表面有大量撞击坑，包括直径约 1550 公里的卡路里盆地。此外还有山脉、峡谷和平原。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气',
        bodyZh: '水星几乎没有大气层，只有极其稀薄的气体。这导致昼夜温差极大，是太阳系中温差最大的行星。',
        realityTier: 'R2',
      },
      {
        key: 'orbit',
        titleZh: '轨道特征',
        bodyZh: '水星的轨道偏心率很大，并且存在轨道共振现象。它的自转周期与公转周期存在 3:2 的共振关系。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA MESSENGER', 'ESA BepiColombo', 'JPL'],
  },
  299: {
    bodyId: 299,
    basicParams: {
      size: '半径约 6,052 公里',
      massOrGm: '3.24859×10^14 km³/s²',
      density: '5.243 g/cm³',
      gravity: '8.87 m/s²',
      temperatureRange: '表面约 465°C（平均）',
      orbitalPeriod: '约 224.7 地球日',
      rotationPeriod: '约 243 地球日（逆向）',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '金星是太阳系中最热的行星，表面温度超过 460°C。它被厚厚的二氧化碳大气所笼罩，产生了极强的温室效应。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '金星的大气主要由二氧化碳组成，气压是地球的 92 倍。浓厚的硫酸云层遮挡了其表面，使其成为太阳系中最亮的行星。',
        realityTier: 'R2',
      },
      {
        key: 'surface',
        titleZh: '表面',
        bodyZh: '通过雷达探测，金星表面有大量火山平原、火山和山脉。麦克斯韦山脉是金星上最高的山脉，高度超过 11 公里。',
        realityTier: 'R2',
      },
      {
        key: 'rotation',
        titleZh: '自转',
        bodyZh: '金星是太阳系中唯一逆向自转的行星，自转周期约为 243 地球日，比公转周期还要长。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA Magellan', 'ESA Venus Express', 'JPL'],
  },
  399: {
    bodyId: 399,
    basicParams: {
      size: '半径约 6,371 公里',
      massOrGm: '3.986004418×10^14 km³/s²',
      density: '5.514 g/cm³',
      gravity: '9.8 m/s²',
      temperatureRange: '-88°C 至 58°C',
      orbitalPeriod: '约 365.25 地球日',
      rotationPeriod: '约 24 小时',
      satelliteCount: '1',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '地球是太阳系中唯一已知存在生命的行星。它拥有液态水、适宜的温度和保护生命的磁场。',
        realityTier: 'R2',
      },
      {
        key: 'structure',
        titleZh: '内部结构',
        bodyZh: '地球由地核、地幔和地壳组成。地核分为内核和外核，地幔是地球体积最大的部分，地壳是我们生活的表面。',
        realityTier: 'R3',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '地球大气层由氮气、氧气和其他气体组成，保护地球免受太阳辐射，并维持适宜的温度。',
        realityTier: 'R2',
      },
      {
        key: 'surface',
        titleZh: '表面特征',
        bodyZh: '地球表面约 71% 被水覆盖，其余是陆地。有五大洲和四大洋，地形多样，包括山脉、平原、沙漠和海洋。',
        realityTier: 'R2',
      },
      {
        key: 'magneticField',
        titleZh: '磁场',
        bodyZh: '地球拥有强大的磁场，形成磁层保护地球免受太阳风的侵害，并产生极光现象。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA', 'USGS', 'NOAA', 'JPL'],
  },
  499: {
    bodyId: 499,
    basicParams: {
      size: '半径约 3,390 公里',
      massOrGm: '4.282837×10^13 km³/s²',
      density: '3.9335 g/cm³',
      gravity: '3.71 m/s²',
      temperatureRange: '-125°C 至 20°C',
      orbitalPeriod: '约 687 地球日',
      rotationPeriod: '约 24.6 小时',
      satelliteCount: '2',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '火星是太阳系中与地球最相似的行星。它拥有四季变化、极地冰盖和稀薄的大气，是人类探索的重要目标。',
        realityTier: 'R2',
      },
      {
        key: 'surface',
        titleZh: '表面特征',
        bodyZh: '火星表面呈红色，主要由氧化铁组成。有巨大的火山如奥林帕斯山，以及巨大的峡谷如水手峡谷。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气',
        bodyZh: '火星大气稀薄，主要由二氧化碳组成，气压仅为地球的约 0.6%。这导致火星表面温度极低。',
        realityTier: 'R2',
      },
      {
        key: 'polarCaps',
        titleZh: '极地冰盖',
        bodyZh: '火星南北两极都有冰盖，主要由水冰和干冰组成。夏季时干冰会升华，冬季时会重新凝结。',
        realityTier: 'R2',
      },
      {
        key: 'water',
        titleZh: '水',
        bodyZh: '火星上存在水冰，主要分布在极地和地下。历史上可能存在液态水，形成了河流和湖泊的痕迹。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA Mars Science Laboratory', 'ESA Mars Express', 'JPL'],
  },
  599: {
    bodyId: 599,
    basicParams: {
      size: '半径约 69,911 公里',
      massOrGm: '1.266865349×10^17 km³/s²',
      density: '1.326 g/cm³',
      gravity: '24.79 m/s²',
      temperatureRange: '云层顶部约 -145°C，核心约 20,000 K',
      orbitalPeriod: '约 11.9 地球年',
      rotationPeriod: '约 9.9 小时',
      satelliteCount: '95+',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '木星是太阳系中最大的行星，是一颗气态巨行星。它的质量是其他所有行星质量总和的 2.5 倍。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '木星大气主要由氢和氦组成，有明显的云带和风暴系统。大红斑是一个持续了数百年的巨大风暴。',
        realityTier: 'R2',
      },
      {
        key: 'interior',
        titleZh: '内部',
        bodyZh: '木星内部没有固体表面，从液态氢过渡到金属氢，中心可能有一个岩石核心。',
        realityTier: 'R3',
      },
      {
        key: 'rings',
        titleZh: '环系',
        bodyZh: '木星拥有一个微弱的环系，主要由尘埃组成，不如土星环壮观。',
        realityTier: 'R2',
      },
      {
        key: 'moons',
        titleZh: '卫星系统',
        bodyZh: '木星拥有众多卫星，其中伽利略卫星（木卫一、木卫二、木卫三、木卫四）是最著名的。木卫二可能存在地下海洋。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA Galileo', 'ESA JUICE', 'JPL'],
  },
  699: {
    bodyId: 699,
    basicParams: {
      size: '半径约 58,232 公里',
      massOrGm: '3.7931187×10^16 km³/s²',
      density: '0.687 g/cm³',
      gravity: '10.44 m/s²',
      temperatureRange: '云层顶部约 -178°C，核心约 15,000 K',
      orbitalPeriod: '约 29.4 地球年',
      rotationPeriod: '约 10.7 小时',
      satelliteCount: '146+',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '土星是太阳系中最美丽的行星，以其壮观的环系而闻名。它是太阳系中密度最小的行星，可以漂浮在水面上。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '土星大气主要由氢和氦组成，有明显的云带和风暴。北极有一个独特的六边形风暴系统。',
        realityTier: 'R2',
      },
      {
        key: 'rings',
        titleZh: '环系',
        bodyZh: '土星环是太阳系中最壮观的环系，由冰块和岩石碎片组成，分为多个主环和环缝。环的厚度极薄，只有几十米到几公里。',
        realityTier: 'R2',
      },
      {
        key: 'interior',
        titleZh: '内部',
        bodyZh: '土星内部与木星类似，没有固体表面，从液态氢过渡到金属氢，中心可能有一个岩石核心。',
        realityTier: 'R3',
      },
      {
        key: 'moons',
        titleZh: '卫星系统',
        bodyZh: '土星拥有众多卫星，其中土卫六（泰坦）是太阳系中第二大卫星，拥有浓厚的大气和液态甲烷湖泊。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA Cassini', 'ESA', 'JPL'],
  },
  799: {
    bodyId: 799,
    basicParams: {
      size: '半径约 25,362 公里',
      massOrGm: '5.793939×10^15 km³/s²',
      density: '1.27 g/cm³',
      gravity: '8.69 m/s²',
      temperatureRange: '云层顶部约 -224°C，核心约 5,000 K',
      orbitalPeriod: '约 84 地球年',
      rotationPeriod: '约 17.2 小时',
      satelliteCount: '28+',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '天王星是太阳系中唯一"躺倒"旋转的行星，自转轴倾斜约 98°。它呈现出淡蓝色，主要由水、氨和甲烷组成。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '天王星大气主要由氢、氦和甲烷组成，甲烷吸收红光，使行星呈现蓝色。大气活动相对平静。',
        realityTier: 'R2',
      },
      {
        key: 'rotation',
        titleZh: '自转',
        bodyZh: '天王星的自转轴倾斜约 98°，几乎是躺着旋转的。这导致极端的季节变化，每个极区会经历长达 42 年的连续日照或黑暗。',
        realityTier: 'R2',
      },
      {
        key: 'rings',
        titleZh: '环系',
        bodyZh: '天王星拥有一个暗弱的环系，由岩石和冰块组成，不如土星环壮观但同样复杂。',
        realityTier: 'R2',
      },
      {
        key: 'moons',
        titleZh: '卫星系统',
        bodyZh: '天王星的卫星以莎士比亚作品中的角色命名，主要卫星包括泰坦尼亚、奥伯龙、乌姆布里尔、艾瑞尔和米兰达。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA Voyager 2', 'ESA', 'JPL'],
  },
  899: {
    bodyId: 899,
    basicParams: {
      size: '半径约 24,622 公里',
      massOrGm: '6.836534×10^15 km³/s²',
      density: '1.638 g/cm³',
      gravity: '11.15 m/s²',
      temperatureRange: '云层顶部约 -214°C，核心约 7,000 K',
      orbitalPeriod: '约 164.8 地球年',
      rotationPeriod: '约 16.1 小时',
      satelliteCount: '16+',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '海王星是太阳系最远的行星，是一颗冰巨星。它拥有太阳系中最强的风暴，风速可达每小时 2100 公里。',
        realityTier: 'R2',
      },
      {
        key: 'atmosphere',
        titleZh: '大气层',
        bodyZh: '海王星大气主要由氢、氦和甲烷组成，呈现深蓝色。大气活动剧烈，有巨大的风暴系统。',
        realityTier: 'R2',
      },
      {
        key: 'weather',
        titleZh: '天气',
        bodyZh: '海王星拥有太阳系中最强的风暴，风速可达每小时 2100 公里，是音速的 1.5 倍以上。',
        realityTier: 'R2',
      },
      {
        key: 'rings',
        titleZh: '环系',
        bodyZh: '海王星拥有一个暗弱的环系，由尘埃和岩石碎片组成，包含多个环弧。',
        realityTier: 'R2',
      },
      {
        key: 'moons',
        titleZh: '卫星系统',
        bodyZh: '海王星的卫星中，海卫一是最大的，也是唯一逆行的大型卫星。它可能是被海王星捕获的柯伊伯带天体。',
        realityTier: 'R2',
      },
    ],
    sources: ['NASA Voyager 2', 'ESA', 'JPL'],
  },
  301: {
    bodyId: 301,
    basicParams: {
      size: '半径约 1,737 公里',
      massOrGm: '4.9048695×10^12 km³/s²',
      density: '3.344 g/cm³',
      gravity: '1.62 m/s²',
      temperatureRange: '-173°C 至 127°C',
      orbitalPeriod: '约 27.3 地球日',
      rotationPeriod: '约 27.3 地球日（同步自转）',
      assetTier: 'S',
      precision: 'P4',
    },
    sections: [
      {
        key: 'overview',
        titleZh: '概述',
        bodyZh: '月球是地球唯一的天然卫星，是距离地球最近的天体。它的表面布满陨石坑，没有大气和液态水。',
        realityTier: 'R2',
      },
      {
        key: 'surface',
        titleZh: '表面特征',
        bodyZh: '月球表面分为高地和月海。高地是古老的撞击坑区域，月海是由玄武岩填充的巨大盆地。',
        realityTier: 'R2',
      },
      {
        key: 'phases',
        titleZh: '月相',
        bodyZh: '月球围绕地球公转时，由于太阳照射角度的变化，产生了新月、上弦月、满月、下弦月等月相变化。',
        realityTier: 'R1',
      },
      {
        key: 'libration',
        titleZh: '天平动',
        bodyZh: '由于月球轨道的椭圆形状和自转轴的倾斜，我们可以看到月球表面的 59%，这种现象称为天平动。',
        realityTier: 'R2',
      },
      {
        key: 'origin',
        titleZh: '起源',
        bodyZh: '目前最被广泛接受的月球起源理论是大碰撞假说：约 45 亿年前，一颗火星大小的天体与原始地球碰撞，形成了月球。',
        realityTier: 'R3',
      },
    ],
    sources: ['NASA Apollo', 'ESA SMART-1', 'JPL'],
  },
};

export class ContentServiceImpl implements ContentService {
  private contentData: Record<BodyId, ContentCard>;
  
  constructor(data?: Record<BodyId, ContentCard>) {
    this.contentData = data || DEFAULT_CONTENT_DATA;
  }
  
  getContent(bodyId: BodyId): ContentCard | null {
    return this.contentData[bodyId] || null;
  }
  
  getAllBodyIds(): BodyId[] {
    return Object.keys(this.contentData).map((k) => parseInt(k, 10));
  }
  
  search(query: string): BodyId[] {
    const normalizedQuery = query.toLowerCase().trim();
    const results: BodyId[] = [];
    
    for (const [bodyId, content] of Object.entries(this.contentData)) {
      const id = parseInt(bodyId, 10);
      const sections = content.sections;
      
      for (const section of sections) {
        if (section.titleZh.toLowerCase().includes(normalizedQuery) ||
            section.bodyZh.toLowerCase().includes(normalizedQuery)) {
          results.push(id);
          break;
        }
      }
    }
    
    return results;
  }
  
  getRealityTierDescription(tier: RealityTier): string {
    return REALITY_TIER_DESCRIPTIONS[tier] || '未知等级';
  }
  
  getPrecisionDescription(precision: PrecisionLevel): string {
    return PRECISION_DESCRIPTIONS[precision] || '未知精度';
  }
  
  addContent(content: ContentCard): void {
    this.contentData[content.bodyId] = content;
  }
  
  removeContent(bodyId: BodyId): void {
    delete this.contentData[bodyId];
  }
}

export const createContentService = (data?: Record<BodyId, ContentCard>): ContentService => {
  return new ContentServiceImpl(data);
};
