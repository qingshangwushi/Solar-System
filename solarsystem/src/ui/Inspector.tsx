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
import { useRef, useState } from 'react'
import type { BodyDescription, MinorBodyDescription } from '../engine/SolarSystemEngine'
import type { Translate } from '../i18n'
import { useFocusTrap } from './useFocusTrap'
import { formatJulianDate } from '../astronomy/TimeSystem'
import { formatDistance, formatEarthRadii, formatScientific } from '../astronomy/Units'
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
  /** Localized display name of a catalogued body, used for the "system" field. */
  resolveBodyName?: (id: string) => string | null
  onClose: () => void
  onFlyTo: () => void
}

export function Inspector(props: InspectorProps) {
  const { t, language } = props
  const [tab, setTab] = useState<Tab>('basic')
  const panelRef = useRef<HTMLElement | null>(null)
  useFocusTrap(panelRef, Boolean(props.description || props.minorDescription))

  if (!props.description && !props.minorDescription) return null

  if (props.minorDescription) {
    const { record, distanceFromSunKm, speedKmS, heliocentricKm, julianDate, positionKnown } = props.minorDescription
    return (
      <aside
        className="inspector"
        aria-label={record.name}
        role="dialog"
        aria-modal="false"
        ref={panelRef}
      >
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
            <Row
              field={
                heliocentricKm
                  ? { label: 'X', value: formatScientific(heliocentricKm.x, 4, 'km') }
                  : { label: 'X', value: t('valueUnknown'), missing: true }
              }
            />
            <Row
              field={
                heliocentricKm
                  ? { label: 'Y', value: formatScientific(heliocentricKm.y, 4, 'km') }
                  : { label: 'Y', value: t('valueUnknown'), missing: true }
              }
            />
            <Row
              field={
                heliocentricKm
                  ? { label: 'Z', value: formatScientific(heliocentricKm.z, 4, 'km') }
                  : { label: 'Z', value: t('valueUnknown'), missing: true }
              }
            />
            {/* The Julian Date of the displayed instant, never a value borrowed from
                another object's description (P2-3). */}
            <Row field={{ label: t('fieldJulianDate'), value: formatJulianDate(julianDate) }} />
          </dl>
          {!positionKnown && <p className="note note--warn">{t('positionUnavailable')}</p>}
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
    <aside className="inspector" aria-label={body.name} role="dialog" aria-modal="false" ref={panelRef}>
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
                  body.parentId ? props.resolveBodyName?.(body.parentId) ?? body.parentId : null,
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
                <Row
                  field={{
                    // The unit system includes Earth radii; it is the readable scale
                    // for a satellite system (the Moon is 60.3 R⊕ away).
                    label: t('fieldDistanceFromParent'),
                    value: `${formatDistance(description.distanceFromParentKm, language)} · ${formatEarthRadii(description.distanceFromParentKm, language)}`,
                  }}
                />
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
            {/*
              The toggle in the settings panel now has a visible consequence: the
              extended read-outs (position model, scale magnification, LOD tier,
              on-screen size and provenance) only appear in scientific mode (P2-5).
            */}
            {props.scientificMode ? (
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
                <Row field={{ label: 'a (semi-major)', value: `${description.body.orbitSummary?.semiMajorAxisAu ?? '—'} AU` }} />
                <Row field={{ label: 'e', value: `${description.body.orbitSummary?.eccentricity ?? '—'}` }} />
                <Row field={{ label: 'camera', value: `${description.cameraDistanceUnits.toFixed(3)} render units` }} />
                <Row field={text(t('fieldDataSource'), body.source, t('valueUnknown'))} />
              </dl>
            ) : (
              <p className="note">{t('scientificModeOff')}</p>
            )}
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
            <p>{narration(body.id, t)}</p>
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

/**
 * Short, factual descriptions per body, resolved through the i18n layer so the
 * component holds no user-visible prose of its own (§54).
 */
function narration(id: string, t: Translate): string {
  const key = NARRATION_KEYS[id]
  return key ? t(key) : t('narrationGeneric')
}

const NARRATION_KEYS: Record<string, keyof import('../i18n').Dictionary> = {
  sun: 'narrationSun',
  mercury: 'narrationMercury',
  venus: 'narrationVenus',
  earth: 'narrationEarth',
  mars: 'narrationMars',
  jupiter: 'narrationJupiter',
  saturn: 'narrationSaturn',
  uranus: 'narrationUranus',
  neptune: 'narrationNeptune',
  pluto: 'narrationPluto',
  moon: 'narrationMoon',
}

export { formatDistance }