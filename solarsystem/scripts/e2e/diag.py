"""Diagnostic probes for the E2E verification (findings confirmation)."""
import json, math, sys
from playwright.sync_api import sync_playwright
import h

OUT = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    logs = h.attach_logs(page)
    h.goto_splash(page)

    # ---- splash facts text (before the catalog exists) ----
    OUT["splash_facts"] = page.inner_text(".splash__facts")
    OUT["engine_during_splash"] = page.evaluate("() => !!window.__solarSystemEngine")

    h.enter(page)
    page.wait_for_timeout(1500)

    # ---- what is on top of the transport buttons? ----
    OUT["transport_hit_test"] = page.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.transport button').forEach((b) => {
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
        out.push({
          label: (b.innerText || b.title || '').trim(),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          topElement: el ? (el.className || el.tagName) : null,
          isSelfOrChild: el === b || b.contains(el),
        });
      });
      return out;
    }""")
    OUT["sidebar_rect"] = page.evaluate("""() => {
      const s = document.querySelector('.sidebar');
      const c = document.querySelector('.console');
      const f = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
      return { sidebar: f(s), console: f(c), hudBottom: f(document.querySelector('.hud__bottom')) };
    }""")

    # ---- frame convention: earth absoluteUnits at J2000 vs expected ecliptic coords ----
    h.js(page, "engine.setPaused(true); engine.jumpToJulianDate(2451545.0); return null")
    page.wait_for_timeout(600)
    earth_abs = h.js(page, "const s = engine.resolver.state('earth'); return [s.absoluteUnits.x, s.absoluteUnits.y, s.absoluteUnits.z, s.heliocentricKm.x, s.heliocentricKm.y, s.heliocentricKm.z]")
    au = 149597870.7
    d = h.describe(page, "earth")
    r_km = d["distanceFromSunKm"]
    lon = math.degrees(math.atan2(earth_abs[4], earth_abs[3])) % 360
    OUT["earth_j2000"] = {
        "absoluteUnits": earth_abs[:3],
        "heliocentricKm": earth_abs[3:],
        "radiusKm": round(r_km),
        "eclipticLongitudeDeg": round(lon, 3),
        "abs_units_y_over_au": round(earth_abs[1] / (au / 1000.0), 4),
        "abs_units_z_over_au": round(earth_abs[2] / (au / 1000.0), 4),
    }

    # ---- H2: sun-direction uniform vs true render-space direction ----
    OUT["sun_direction"] = page.evaluate(r"""() => {
      const engine = window.__solarSystemEngine;
      const out = {};
      for (const id of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']) {
        const st = engine.resolver.state(id);
        const v = engine.visuals.get(id);
        const u = v && v.mesh && v.mesh.material && v.mesh.material.uniforms && v.mesh.material.uniforms.uSunDirection
          ? v.mesh.material.uniforms.uSunDirection.value : null;
        const p = st.absoluteUnits;
        const L = Math.hypot(p.x, p.y, p.z) || 1;
        const truth = { x: -p.x / L, y: -p.y / L, z: -p.z / L };
        if (!u) { out[id] = null; continue; }
        const dot = Math.max(-1, Math.min(1, u.x*truth.x + u.y*truth.y + u.z*truth.z));
        out[id] = { uniform: [u.x, u.y, u.z], truth: [truth.x, truth.y, truth.z],
                    angleDeg: Math.acos(dot) * 180 / Math.PI,
                    tier: v.currentTier, meshVisible: v.mesh ? v.mesh.visible : null };
      }
      return out;
    }""")

    # ---- H1: frame world +Z stability over 6 hours ----
    def frame_axis(body_id, jd):
        h.js(page, "engine.jumpToJulianDate(arg); return null", jd)
        page.wait_for_timeout(260)
        return page.evaluate(r"""(id) => {
          const engine = window.__solarSystemEngine;
          const v = engine.visuals.get(id);
          if (!v) return null;
          v.frame.updateWorldMatrix(true, false);
          const m = v.frame.matrixWorld.elements;
          const a = [m[8], m[9], m[10]];
          const L = Math.hypot(a[0], a[1], a[2]) || 1;
          return [a[0]/L, a[1]/L, a[2]/L];
        }""", body_id)

    axes = {}
    for bid in ["earth", "jupiter", "saturn", "uranus", "mars"]:
        a0 = frame_axis(bid, 2451545.0)
        a1 = frame_axis(bid, 2451545.0 + 6.0 / 24.0)
        a2 = frame_axis(bid, 2451545.0 + 12.0 / 24.0)
        def ang(u, v):
            if not u or not v:
                return None
            dot = max(-1, min(1, sum(x*y for x, y in zip(u, v))))
            return round(math.degrees(math.acos(dot)), 3)
        axes[bid] = {"axis_t0": [round(x, 4) for x in a0] if a0 else None,
                     "angle_t0_to_t6h": ang(a0, a1), "angle_t0_to_t12h": ang(a0, a2),
                     "angle_t6h_to_t12h": ang(a1, a2)}
    OUT["frame_axis_stability"] = axes

    # expected IAU pole for each body, in ecliptic coords, for comparison
    cat = h.load_catalog()
    eps = math.radians(23.4392911)
    poles = {}
    for b in cat["bodies"]:
        if b["id"] not in ("earth", "jupiter", "saturn", "uranus", "mars"):
            continue
        o = b.get("orientation")
        if not o:
            poles[b["id"]] = None
            continue
        ra, dec = math.radians(o["poleRaDeg"]), math.radians(o["poleDecDeg"])
        pe = [math.cos(dec)*math.cos(ra), math.cos(dec)*math.sin(ra), math.sin(dec)]
        # EQJ -> ECL (rotate by +eps about X)
        pecl = [pe[0], pe[1]*math.cos(eps) + pe[2]*math.sin(eps), -pe[1]*math.sin(eps) + pe[2]*math.cos(eps)]
        poles[b["id"]] = {"poleRaDeg": o["poleRaDeg"], "poleDecDeg": o["poleDecDeg"],
                          "poleEqj": [round(x, 4) for x in pe], "poleEcl": [round(x, 4) for x in pecl]}
    OUT["expected_poles"] = poles

    # ---- minor body selection while the cloud is hidden ----
    page.wait_for_timeout(300)
    minor_hidden = page.evaluate(r"""() => {
      const engine = window.__solarSystemEngine;
      const before = engine.describeMinorBody(0);
      engine.selectMinorBody(0);
      const after = engine.describeMinorBody(0);
      return { before: before ? [before.heliocentricKm.x, before.heliocentricKm.y, before.heliocentricKm.z, before.distanceFromSunKm] : null,
               after: after ? [after.heliocentricKm.x, after.heliocentricKm.y, after.heliocentricKm.z, after.distanceFromSunKm] : null };
    }""")
    page.wait_for_timeout(1200)
    minor_hidden["cameraAfter"] = h.debug_state(page)
    OUT["minor_select_hidden_cloud"] = minor_hidden

    # now enable the cloud and re-check
    h.js(page, "engine.setMinorBodiesVisible(true); return null")
    page.wait_for_timeout(3000)
    OUT["minor_select_visible_cloud"] = page.evaluate(r"""() => {
      const engine = window.__solarSystemEngine;
      const out = [];
      for (const i of [0, 100, 5000, 9000]) {
        const d = engine.describeMinorBody(i);
        out.push({ i, name: d.record.name, r_au: Math.hypot(d.heliocentricKm.x, d.heliocentricKm.y, d.heliocentricKm.z) / 149597870.7,
                   q: d.record.perihelionDistanceAu, Q: d.record.aphelionDistanceAu });
      }
      return out;
    }""")

    ctx.close()
    browser.close()

open("/tmp/sse2e/diag.json","w").write(json.dumps(OUT, ensure_ascii=False, indent=2))
print(json.dumps({k: OUT[k] for k in ["transport_hit_test","sidebar_rect","earth_j2000","sun_direction","frame_axis_stability"]}, ensure_ascii=False, indent=2))
