/**
 * Information panel (right side).
 *
 * Four tabs: overview, orbit, physical and an explanatory text. Every value comes
 * from the catalog or from a live re-computation for the displayed instant; a field
 * with no published value renders as the localized "no reliable data" string, and
 * the panel always discloses the position model, the data source and any display
 * convention that was applied (scale magnification, orbit-phase convention,
 * procedural surface map).
 */
import { useState } from 'react'
import type { BodyDescription, MinorBodyDescription } from '../engine/SolarSystemEngine'
import type { Translate } from '../i18n'
import { formatJulianDate } from '../astronomy/TimeSystem'
import { formatDistance, formatScientific } from '../astronomy/Units'
import { formatMagnification, SCALE_MODES, type ScaleMode } from '../data/ScaleModel'
import {
  bucketKey,
  distanceField,
  numberField,
  periodField,
  rotationPeriodField,
  scientificField,
  text,
  typeColour,
  typeKey,
  type Field,
} from './formatters'

type Tab = 'basic' | 'orbit' | 'physical' | 'about'

export interface InspectorProps {
  t: Translate
  language: 'zh-CN' | 'en-US'
  description: BodyDescription | null
  minorDescription: MinorBodyDescription | null
  scaleMode: ScaleMode
  radiusMagnification: number
  scientificMode: boolean
  onClose: () => void
  onFlyTo: () => void
}

export function Inspector(props: InspectorProps) {
  const { t, language } = props
  const [tab, setTab] = useState<Tab>('basic')

  if (!props.description && !props.minorDescription) return null

  if (props.minorDescription) {
    const { record, distanceFromSunKm, speedKmS, heliocentricKm } = props.minorDescription
    return (
      <aside className="inspector" aria-label={record.name}>
        <div className="inspector__head">
          <h2>{record.name}</h2>
          <span>{record.id}</span>
          <button type="button" className="inspector__close" aria-label={t('close')} onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="inspector__body">
          <h3 className="section-title">{t('infoOrbit')}</h3>
          <dl className="kv">
            <Row field={text(t('fieldClass'), record.classLabel, t('valueUnknown'))} />
            <Row field={text(t('fieldBucket'), t(bucketKey(record.bucket)), t('valueUnknown'))} />
            <Row field={numberField(t('fieldSemiMajorAxis'), record.semiMajorAxisAu, 6, 'AU', t('valueUnknown'))} />
            <Row field={numberField(t('fieldEccentricity'), record.eccentricity, 6, undefined, t('valueUnknown'))} />
            <Row field={numberField(t('fieldInclination'), record.inclinationDeg, 3, '°', t('valueUnknown'))} />
            <Row field={numberField('Ω', record.longitudeAscendingNodeDeg, 3, '°', t('valueUnknown'))} />
            <Row field={numberField('ω', record.argumentOfPeriapsisDeg, 3, '°', t('valueUnknown'))} />
            <Row field={periodField(t('fieldPeriod'), record.periodDays, language, t('valueUnknown'))} />
            <Row field={numberField(t('fieldPeriapsis'), record.perihelionDistanceAu, 6, 'AU', t('valueUnknown'))} />
            <Row field={numberField(t('fieldApoapsis'), record.aphelionDistanceAu, 6, 'AU', t('valueUnknown'))} />
            <Row field={numberField('Tp', record.perihelionJD, 3, 'JD', t('valueUnknown'))} />
          </dl>

          <h3 className="section-title">{t('infoPhysical')}</h3>
          <dl className="kv">
            <Row field={numberField(t('fieldDiameter'), record.diameterKm, 2, 'km', t('valueUnknown'))} />
            <Row field={numberField(t('fieldAbsoluteMagnitude'), record.absoluteMagnitude, 2, undefined, t('valueUnknown'))} />
            <Row
              field={record.albedo === null ? { label: t('fieldAlbedo'), value: t('valueUnknown'), missing: true } : numberField(t('fieldAlbedo'), record.albedo, 3)}
            />
            <Row field={rotationPeriodField(t('fieldRotationPeriod'), record.rotationPeriodHours, t('valueUnknown'))} />
            <Row field={distanceField(t('fieldMoid'), record.moidAu === null ? null : record.moidAu * 149_597_870.7, language, t('valueUnknown'))} />
            <Row field={text(t('fieldFirstObservation'), record.firstObservation, t('valueUnknown'))} />
          </dl>

          <h3 className="section-title">{t('fieldPosition')}</h3>
          <dl className="kv">
            <Row field={distanceField(t('fieldDistanceFromSun'), distanceFromSunKm, language, t('valueUnknown'))} />
            <Row field={numberField(t('fieldVelocity'), speedKmS, 3, 'km/s', t('valueUnknown'))} />
            <Row field={{ label: 'X', value: formatScientific(heliocentricKm.x, 4, 'km') }} />
            <Row field={{ label: 'Y', value: formatScientific(heliocentricKm.y, 4, 'km') }} />
            <Row field={{ label: 'Z', value: formatScientific(heliocentricKm.z, 4, 'km') }} />
            <Row field={{ label: t('fieldJulianDate'), value: formatJulianDate(props.description?.julianDate ?? 0) }} />
          </dl>
          <p className="note">
            {t('fieldDiameter')} / {t('fieldAlbedo')} · {t('valueUnknown')} = {t('valueUnknown')}
          </p>
          <p className="note">{record.classLabel} · JPL SBDB</p>
        </div>
      </aside>
    )
  }

  const description = props.description!
  const body = description.body
  const orbit = body.orbitSummary ?? {}
  const physical = body.physical

  return (
    <aside className="inspector" aria-label={body.name}>
      <div className="inspector__head">
        <h2 style={{ color: typeColour(body.type) }}>
          {language === 'zh-CN' && body.nameZh ? body.nameZh : body.name}
        </h2>
        <span>
          {language === 'zh-CN' && body.nameZh ? `${body.name} · ` : ''}
          {t(typeKey(body.type))}
        </span>
        <button type="button" className="inspector__close" aria-label={t('close')} onClick={props.onClose}>
          ×
        </button>
      </div>

      <div className="inspector__tabs" role="tablist">
        {(['basic', 'orbit', 'physical', 'about'] as Tab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            className="tab"
            role="tab"
            aria-selected={tab === entry}
            data-active={tab === entry}
            onClick={() => setTab(entry)}
          >
            {tabLabel(entry, t)}
          </button>
        ))}
      </div>

      <div className="inspector__body" role="tabpanel">
        {tab === 'basic' && (
          <>
            <dl className="kv">
              <Row field={text(t('fieldCategory'), t(typeKey(body.type)), t('valueUnknown'))} />
              <Row field={text(t('fieldOfficialName'), body.officialName, t('valueUnknown'))} />
              <Row
                field={text(
                  t('fieldParent'),
                  body.parentId ? parentName(body.parentId, language) : null,
                  t('valueUnknown'),
                )}
              />
              <Row field={numberField(t('fieldRadius'), physical.meanRadiusKm, physical.meanRadiusKm && physical.meanRadiusKm < 100 ? 3 : 1, 'km', t('valueUnknown'))} />
              <Row field={numberField(t('fieldDiameter'), physical.meanRadiusKm ? physical.meanRadiusKm * 2 : null, 1, 'km', t('valueUnknown'))} />
              <Row field={scientificField(t('fieldMass'), physical.massKg, 'kg', t('valueUnknown'))} />
              <Row field={numberField(t('fieldDensity'), physical.densityKgM3, 1, 'kg/m³', t('valueUnknown'))} />
              <Row field={numberField(t('fieldGravity'), physical.surfaceGravityMs2, 3, 'm/s²', t('valueUnknown'))} />
              <Row field={numberField(t('fieldEscapeVelocity'), physical.escapeVelocityKmS, 3, 'km/s', t('valueUnknown'))} />
              <Row field={numberField(t('fieldAlbedo'), physical.bondAlbedo ?? physical.geometricAlbedo, 3, undefined, t('valueUnknown'))} />
            </dl>

            <h3 className="section-title">{t('fieldPosition')}</h3>
            <dl className="kv">
              <Row field={distanceField(t('fieldDistanceFromSun'), description.distanceFromSunKm, language, t('valueUnknown'))} />
              {description.distanceFromParentKm !== null && (
                <Row field={distanceField(t('fieldDistanceFromParent'), description.distanceFromParentKm, language, t('valueUnknown'))} />
              )}
              <Row
                field={
                  description.cameraDistanceKm !== null
                    ? distanceField(t('fieldDistanceFromCamera'), description.cameraDistanceKm, language, t('valueUnknown'))
                    : {
                        label: t('fieldDistanceFromCamera'),
                        value: `${description.cameraDistanceUnits.toFixed(1)} ${language === 'zh-CN' ? '渲染单位（非线性尺度）' : 'render units (non-linear scale)'}`,
                      }
                }
              />
              <Row field={numberField(t('fieldVelocity'), description.velocityKmS, 3, 'km/s', t('valueUnknown'))} />
              <Row field={{ label: t('fieldJulianDate'), value: formatJulianDate(description.julianDate) }} />
            </dl>
          </>
        )}

        {tab === 'orbit' && (
          <>
            <dl className="kv">
              <Row
                field={
                  orbit.semiMajorAxisAu
                    ? numberField(t('fieldSemiMajorAxis'), orbit.semiMajorAxisAu, 6, 'AU (au)')
                    : numberField(t('fieldSemiMajorAxis'), orbit.semiMajorAxisKm ?? null, 1, 'km', t('valueUnknown'))
                }
              />
              <Row field={numberField(t('fieldEccentricity'), orbit.eccentricity, 6, undefined, t('valueUnknown'))} />
              <Row field={numberField(t('fieldInclination'), orbit.inclinationDeg, 4, '°', t('valueUnknown'))} />
              <Row field={periodField(t('fieldPeriod'), orbit.periodDays, language, t('valueUnknown'))} />
              <Row field={numberField(t('fieldPeriapsis'), orbit.perihelionKm, 0, 'km', t('valueUnknown'))} />
              <Row field={numberField(t('fieldApoapsis'), orbit.aphelionKm, 0, 'km', t('valueUnknown'))} />
              <Row field={numberField('v̄', orbit.meanOrbitalVelocityKmS, 3, 'km/s', t('valueUnknown'))} />
              {orbit.referencePlane && <Row field={{ label: 'frame', value: orbit.referencePlane }} />}
              {body.documentedSatelliteCount !== undefined && (
                <Row field={numberField(t('fieldSatellites'), body.documentedSatelliteCount, 0, undefined, t('valueUnknown'))} />
              )}
              <Row field={text(t('fieldRings'), body.rings ? t('valueYes') : body.type === 'planet' ? t('valueNo') : null, t('valueUnknown'))} />
            </dl>
            {body.rings && (
              <p className="note">
                {body.rings.note} · {body.rings.innerRadiusFactor}–{body.rings.outerRadiusFactor} R
              </p>
            )}
          </>
        )}

        {tab === 'physical' && (
          <>
            <dl className="kv">
              <Row field={rotationPeriodField(t('fieldRotationPeriod'), body.rotation.periodHours, t('valueUnknown'))} />
              <Row field={numberField(t('fieldAxialTilt'), body.rotation.axialTiltDeg, 3, '°', t('valueUnknown'))} />
              {body.orientation && (
                <>
                  <Row field={numberField('pole R.A.', body.orientation.poleRaDeg, 3, '°', t('valueUnknown'))} />
                  <Row field={numberField('pole Dec.', body.orientation.poleDecDeg, 3, '°', t('valueUnknown'))} />
                </>
              )}
              <Row field={numberField('flattening', physical.flattening, 5, undefined, t('valueUnknown'))} />
              <Row field={scientificField('GM', physical.gmKm3S2, 'km³/s²', t('valueUnknown'))} />
              <Row field={numberField('geometric albedo', physical.geometricAlbedo, 3, undefined, t('valueUnknown'))} />
            </dl>

            <h3 className="section-title">{t('scientificMode')}</h3>
            <dl className="kv">
              <Row field={{ label: t('fieldDataMode'), value: positionModelLabel(body.positionModel, t) }} />
              <Row
                field={{
                  label: 'scale',
                  value: SCALE_MODES[props.scaleMode][language === 'zh-CN' ? 'labelZh' : 'labelEn'],
                }}
              />
              <Row field={{ label: 'radius', value: formatMagnification(props.radiusMagnification, language) }} />
              <Row field={{ label: 'LOD', value: description.lodTier }} />
              <Row field={{ label: 'on-screen', value: `${description.projectedRadiusPixels.toFixed(1)} px` }} />
              <Row field={text(t('fieldDataSource'), body.source, t('valueUnknown'))} />
            </dl>
            {body.elements?.phaseSource === 'convention' && <p className="note note--warn">{t('phaseConvention')}</p>}
            {body.elements?.phaseSource === 'jpl-mean-elements' && <p className="note">{t('phasePublished')}</p>}
            {description.proceduralSurface && <p className="note note--warn">{t('proceduralSurface')}</p>}
            {body.orientation?.rotationPhaseSource === 'convention-zero-at-j2000' && (
              <p className="note">
                {language === 'zh-CN'
                  ? '自转相位：以 J2000 为约定零点；自转速率与极轴指向为真实数据。'
                  : 'Rotation phase: convention zero at J2000; the rotation rate and pole direction are real data.'}
              </p>
            )}
          </>
        )}

        {tab === 'about' && (
          <div className="prose">
            <p>{narration(body.id, language)}</p>
            {body.discovery && (
              <p>
                {t('fieldDiscovered')}: {body.discovery.date ?? t('valueUnknown')} · {t('fieldDiscoverer')}:{' '}
                {body.discovery.discoverer ?? t('valueUnknown')}
              </p>
            )}
            <p className="note">{body.source}</p>
          </div>
        )}

        <button type="button" className="chip chip--button" style={{ marginTop: '0.8rem' }} onClick={props.onFlyTo}>
          {t('flyTo')}
        </button>
      </div>
    </aside>
  )
}

function Row({ field }: { field: Field }) {
  return (
    <>
      <dt>{field.label}</dt>
      <dd data-missing={field.missing ? 'true' : undefined}>{field.value}</dd>
    </>
  )
}

function tabLabel(tab: Tab, t: Translate): string {
  switch (tab) {
    case 'basic':
      return t('infoBasic')
    case 'orbit':
      return t('infoOrbit')
    case 'physical':
      return t('infoPhysical')
    case 'about':
      return t('infoAbout')
  }
}

function positionModelLabel(model: string, t: Translate): string {
  if (model === 'ephemeris') return t('positionModelEphemeris')
  if (model === 'kepler') return t('positionModelKepler')
  return t('positionModelOrigin')
}

function parentName(parentId: string, language: 'zh-CN' | 'en-US'): string {
  const names: Record<string, { zh: string; en: string }> = {
    sun: { zh: '太阳', en: 'Sun' },
    earth: { zh: '地球', en: 'Earth' },
    mars: { zh: '火星', en: 'Mars' },
    jupiter: { zh: '木星', en: 'Jupiter' },
    saturn: { zh: '土星', en: 'Saturn' },
    uranus: { zh: '天王星', en: 'Uranus' },
    neptune: { zh: '海王星', en: 'Neptune' },
    pluto: { zh: '冥王星', en: 'Pluto' },
  }
  const entry = names[parentId]
  if (!entry) return parentId
  return language === 'zh-CN' ? entry.zh : entry.en
}

/**
 * Short, factual descriptions per body. Written from the published values rather
 * than from marketing copy, and kept inside the i18n layer's language switch.
 */
function narration(id: string, language: 'zh-CN' | 'en-US'): string {
  const zh: Record<string, string> = {
    sun: '太阳是太阳系唯一的恒星，提供全部主要光照。其质量约占太阳系总质量的 99.86%，自转周期约 609 小时（赤道更快）。',
    mercury: '水星是距太阳最近的行星，轨道离心率 0.206，表面几乎没有大气，昼夜温差极端。',
    venus: '金星拥有浓密的二氧化碳大气与硫酸云层，逆向自转，是太阳系最热的行星表面。',
    earth: '地球是目前已知唯一存在液态水海洋与生命的行星，自转轴倾角 23.44°，一颗天然卫星。',
    mars: '火星表面覆盖氧化铁尘埃，拥有两颗小卫星与太阳系最高的火山。轨道离心率较大，季节变化显著。',
    jupiter: '木星是太阳系质量最大的行星，自转最快，拥有四颗伽利略卫星与一个暗弱的环系。',
    saturn: '土星以壮观的环系著称，环位于赤道面内；土卫六拥有浓密大气，土卫二存在冰下海洋的证据。',
    uranus: '天王星自转轴几乎与轨道面平行，环与卫星系统随之近乎垂直运行。',
    neptune: '海王星是距太阳最远的行星，风速可达超音速；海卫一为逆行轨道，可能为被俘获的柯伊伯带天体。',
    pluto: '冥王星是柯伊伯带中最著名的矮行星，与冥卫一构成潮汐锁定的双天体系统。',
    moon: '月球是地球唯一的天然卫星，轨道半长轴 384 400 km，潮汐锁定使其永远以同一面朝向地球。',
  }
  const en: Record<string, string> = {
    sun: 'The Sun is the only star in the solar system and provides essentially all of its light. It holds about 99.86 % of the system mass and rotates in roughly 609 hours.',
    mercury: 'Mercury is the innermost planet, with an eccentricity of 0.206 and almost no atmosphere, producing extreme day/night temperature contrasts.',
    venus: 'Venus has a dense carbon-dioxide atmosphere and sulphuric-acid clouds, rotates retrograde, and has the hottest planetary surface in the system.',
    earth: 'The Earth is the only place known to host liquid-water oceans and life. Its 23.44° axial tilt drives the seasons, and it has one natural satellite.',
    mars: 'Mars is covered in iron-oxide dust, has two small moons and the tallest volcano in the solar system. Its noticeable eccentricity produces strong seasonal effects.',
    jupiter: 'Jupiter is the most massive planet and rotates fastest, with four Galilean moons and a faint ring system.',
    saturn: 'Saturn is famous for its rings, which lie in the planet equatorial plane. Titan has a dense atmosphere and Enceladus shows evidence of a subsurface ocean.',
    uranus: 'Uranus rotates almost on its side, so its rings and moons orbit nearly perpendicular to the ecliptic.',
    neptune: 'Neptune is the outermost planet, with supersonic winds. Triton orbits retrograde and is probably a captured Kuiper-belt object.',
    pluto: 'Pluto is the best known dwarf planet of the Kuiper belt and forms a tidally locked pair with Charon.',
    moon: 'The Moon is the Earth\'s only natural satellite. Its semi-major axis is 384 400 km and it is tidally locked, so the same face always points at the Earth.',
  }
  const table = language === 'zh-CN' ? zh : en
  return (
    table[id] ??
    (language === 'zh-CN'
      ? '该天体由公开轨道根数传播计算，详细参数见“轨道参数”与“物理特性”标签页。'
      : 'This body is propagated from published orbital elements; see the Orbit and Physical tabs for its parameters.')
  )
}

export { formatDistance }