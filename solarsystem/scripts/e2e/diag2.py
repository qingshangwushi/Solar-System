"""Focused diagnostic: why is Earth rendered as a flat, fully lit grey ball?"""
import json
from playwright.sync_api import sync_playwright
import h

OUT = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    reqs = []
    page.on("response", lambda r: reqs.append((r.url.split("/data/")[-1], r.status)) if "/data/textures/" in r.url else None)
    h.boot(page)
    if page.locator(".sidebar .inspector__close").count():
        page.click(".sidebar .inspector__close")
        page.wait_for_timeout(300)
    h.js(page, "engine.setQualityProfile('ultra'); engine.setPaused(true); engine.jumpToJulianDate(2451545.0); return null")
    page.wait_for_timeout(1500)

    # make Earth big and let textures settle
    h.js(page, "engine.clearSelection(); engine.flyTo('earth'); return null")
    page.wait_for_timeout(2500)
    page.evaluate("""() => { const e = window.__solarSystemEngine; const st = e.resolver.state('earth');
        e.cameraController.cancelFlyTo(); e.cameraController.setMode('orbit');
        e.cameraController.trackedId = 'earth'; e.cameraController.setTrackedRadius(st.radiusUnits);
        e.cameraController.placeRelativeToTarget(st.absoluteUnits, 3.0); }""")
    page.wait_for_timeout(6000)

    OUT["texture_responses"] = reqs
    OUT["material"] = page.evaluate(r"""() => {
      const e = window.__solarSystemEngine;
      const v = e.visuals.get('earth');
      const u = v.mesh.material.uniforms;
      const tex = (t) => t && t.value ? { image: t.value.image ? [t.value.image.width, t.value.image.height] : null,
                                          src: t.value.source && t.value.source.data ? (t.value.source.data.src || t.value.source.data.currentSrc || 'canvas') : 'n/a' } : null;
      return {
        tier: v.currentTier, procedural: e.describeBody('earth').proceduralSurface,
        uniforms: { uAmbient: u.uAmbient.value, uSpecularStrength: u.uSpecularStrength ? u.uSpecularStrength.value : null,
                    uHasNightMap: u.uHasNightMap.value, uHasNormalMap: u.uHasNormalMap.value, uHasSpecularMap: u.uHasSpecularMap.value,
                    uSunDirection: [u.uSunDirection.value.x, u.uSunDirection.value.y, u.uSunDirection.value.z] },
        maps: { map: tex(u.uMap), night: tex(u.uNightMap), normal: tex(u.uNormalMap), specular: tex(u.uSpecularMap) },
        frameChildren: v.frame.children.map((c) => ({ type: c.type, geo: c.geometry ? c.geometry.type : null,
            visible: c.visible, renderOrder: c.renderOrder, blending: c.material ? c.material.blending : null,
            transparent: c.material ? c.material.transparent : null,
            opacity: c.material && 'opacity' in c.material ? c.material.opacity : null,
            uniforms: c.material && c.material.uniforms ? Object.keys(c.material.uniforms) : null })),
      };
    }""")

    def measure(tag, atmosphere):
        h.js(page, "engine.setAtmosphereVisibility(arg); return null", atmosphere)
        page.wait_for_timeout(700)
        h.place_camera_on_sun_side(page, "earth", 1, 3.0)
        page.wait_for_timeout(1200)
        a = h.disc_luminance(page, "earth", 0.55)
        h.shot(page, "diag2_earth_%s_sun.png" % tag)
        h.place_camera_on_sun_side(page, "earth", -1, 3.0)
        page.wait_for_timeout(1200)
        b = h.disc_luminance(page, "earth", 0.55)
        h.shot(page, "diag2_earth_%s_night.png" % tag)
        return {"sunSide": a, "nightSide": b,
                "ratio": round((a["mean"] or 0) / (b["mean"] or 1e-6), 3)}

    OUT["atmosphere_on"] = measure("atmo_on", True)
    OUT["atmosphere_off"] = measure("atmo_off", False)

    # What is the true vs shader lambert on the visible disc centre?
    OUT["lambert_probe"] = page.evaluate(r"""() => {
      const e = window.__solarSystemEngine;
      const v = e.visuals.get('earth');
      const st = e.resolver.state('earth');
      const u = v.mesh.material.uniforms.uSunDirection.value;
      const p = st.absoluteUnits;
      const L = Math.hypot(p.x, p.y, p.z) || 1;
      const truth = { x: -p.x / L, y: -p.y / L, z: -p.z / L };
      const camDir = (() => {
        const c = e.cameraController.absolutePosition;
        const d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
        const n = Math.hypot(d.x, d.y, d.z) || 1;
        return { x: d.x / n, y: d.y / n, z: d.z / n };
      })();
      const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
      return {
        angleUniformVsTruth: Math.acos(Math.max(-1, Math.min(1, dot(u, truth)))) * 180 / Math.PI,
        lambertAtCentreUsingShaderUniform: dot(camDir, u),
        lambertAtCentreUsingTruth: dot(camDir, truth),
      };
    }""")

    ctx.close()
    browser.close()

open("/tmp/sse2e/diag2.json", "w").write(json.dumps(OUT, ensure_ascii=False, indent=2))
print(json.dumps(OUT, ensure_ascii=False, indent=2)[:6000])
