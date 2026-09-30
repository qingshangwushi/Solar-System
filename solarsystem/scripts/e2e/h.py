# Shared harness for the Solar System Explorer E2E verification.
import json, os, time, math, traceback
from contextlib import contextmanager

BASE = os.environ.get("APP_URL", "http://127.0.0.1:5199/")
SHOTS = "/tmp/sse2e/shots"
OUTDIR = "/tmp/sse2e"
CONFIG_PATH = "/Users/chenchao/Documents/projects/github/Solar-System/solarsystem/public/exhibition.config.json"
CATALOG_DIR = "/Users/chenchao/Documents/projects/github/Solar-System/solarsystem/public/data/catalog"
os.makedirs(SHOTS, exist_ok=True)


def load_catalog():
    """Loads the versioned catalog artefact named by the manifest.

    The catalogue is written as ``catalog-vYYYYMMDD.json`` (the manifest carries a
    ``catalogFile`` field); the old hard-coded ``catalog.json`` no longer exists.
    """
    with open(os.path.join(CATALOG_DIR, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    name = manifest.get("catalogFile") or "catalog.json"
    with open(os.path.join(CATALOG_DIR, name), encoding="utf-8") as fh:
        return json.load(fh)

CHROME_ARGS = [
    "--use-gl=angle",
    "--use-angle=metal",
    "--ignore-gpu-blocklist",
    "--enable-gpu",
    "--enable-unsafe-swiftshader",
]

LAUNCH_ARGS_HEADLESS_SW = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
]


def base_config():
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


class Recorder:
    """Collects PASS/FAIL results and writes them to a JSON file."""

    def __init__(self, path, section_default=""):
        self.path = path
        self.results = []
        self.section_default = section_default

    def add(self, tid, section, name, status, detail="", evidence=None):
        self.results.append({
            "id": tid,
            "section": section,
            "name": name,
            "status": status,
            "detail": detail,
            "evidence": evidence or [],
            "at": time.strftime("%H:%M:%S"),
        })
        line = "[%s] %-9s %s :: %s" % (status, tid, name, detail.replace("\n", " ")[:280])
        print(line, flush=True)

    def save(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(self.results, fh, ensure_ascii=False, indent=2)
        counts = {}
        for r in self.results:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
        print("SAVED %s -> %s" % (self.path, counts), flush=True)


@contextmanager
def check(rec, tid, section, name, ok_status="PASS"):
    """Record PASS when the block completes, FAIL when it raises.

    The block may override the outcome by setting holder["status"] (e.g. WARN)."""
    holder = {"detail": "", "evidence": [], "status": ok_status}
    try:
        yield holder
    except Exception as exc:  # noqa: BLE001 - test harness must keep going
        detail = "%s: %s" % (type(exc).__name__, exc)
        tb = traceback.format_exc().strip().splitlines()
        rec.add(tid, section, name, "FAIL", detail, tb[-3:])
    else:
        rec.add(tid, section, name, holder.get("status", ok_status),
                holder.get("detail", ""), holder.get("evidence", []))


def make_context(browser, config_patch=None, viewport=None, touch=False):
    """New context, optionally serving a patched exhibition.config.json."""
    ctx = browser.new_context(
        viewport=viewport or {"width": 1600, "height": 900},
        has_touch=touch,
        device_scale_factor=1,
    )
    if config_patch is not None:
        cfg = dict(base_config())
        cfg.update(config_patch)
        payload = json.dumps(cfg, ensure_ascii=False).encode("utf-8")
        ctx.route(
            "**/exhibition.config.json",
            lambda route: route.fulfill(status=200, content_type="application/json", body=payload),
        )
    return ctx


def attach_logs(page):
    logs = {"console_error": [], "pageerror": [], "requestfailed": [], "requests": []}
    page.on("console", lambda m: logs["console_error"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: logs["pageerror"].append(str(e)))
    page.on("requestfailed", lambda r: logs["requestfailed"].append("%s %s" % (r.url, r.failure)))
    page.on("request", lambda r: logs["requests"].append(r.url))
    return logs


def goto_splash(page, timeout=60000):
    page.goto(BASE, wait_until="load", timeout=timeout)
    page.wait_for_selector(".splash__enter", timeout=30000)
    page.wait_for_timeout(400)


def enter(page, timeout=240000, expect_ready=True):
    """Click the splash entry button and wait for the explorer to be ready."""
    page.click(".splash__enter")
    if not expect_ready:
        return
    page.wait_for_selector(".hud", timeout=timeout)
    page.wait_for_function("() => !!window.__solarSystemEngine", timeout=timeout)
    page.wait_for_timeout(1200)


def boot(page, timeout=240000, config_patch=None):
    goto_splash(page)
    enter(page, timeout=timeout)


# --------------------------------------------------------------------- engine JS

def js(page, code, arg=None):
    """Evaluate code in the page with `engine` in scope (dev builds only)."""
    if arg is None:
        return page.evaluate("() => { const engine = window.__solarSystemEngine; " + code + " }")
    return page.evaluate("(arg) => { const engine = window.__solarSystemEngine; " + code + " }", arg)


def debug_state(page):
    return js(page, "return engine ? engine.debugState() : null")


def describe(page, body_id):
    return js(page, "return engine ? engine.describeBody(arg) : null", body_id)


def describe_minor(page, index):
    return js(page, "return engine ? engine.describeMinorBody(arg) : null", index)


def stats(page):
    return js(page, "return engine ? engine.statistics() : null")


def clock(page):
    return js(page, "return engine ? { jd: engine.clock.jd, timeScale: engine.clock.timeScale, paused: engine.clock.paused } : null")


def state_store(page):
    """Read the Zustand store through the React app: only what is on window."""
    return js(page, "return engine ? null : null")


def scene_probe(page):
    """Traverse the three.js scene for structural assertions."""
    return page.evaluate(r"""() => {
      const engine = window.__solarSystemEngine;
      if (!engine) return null;
      const r = engine.renderer;
      const scene = r.scene;
      const camera = r.camera;
      const out = {
        cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
        near: camera.near, far: camera.far,
        toneMapping: r.renderer.toneMapping,
        toneMappingExposure: r.renderer.toneMappingExposure,
        logDepth: r.renderer.capabilities.logarithmicDepthBuffer,
        hasBloom: !!r.bloomPass, hasOutput: !!r.outputPass,
        bloomStrength: r.bloomPass ? r.bloomPass.strength : null,
        children: [],
        starParentsCamera: null,
        starPointCount: 0,
        ringMeshes: [],
        bodyGroups: 0,
        labelLayer: !!document.querySelector('.label-layer'),
      };
      scene.traverse((o) => {
        if (o.isPoints && o.geometry && o.geometry.attributes.position) {
          out.starPointCount = Math.max(out.starPointCount, o.geometry.attributes.position.count);
        }
      });
      // find Points objects and their parent chain to detect a camera-mounted star layer
      const points = [];
      scene.traverse((o) => { if (o.isPoints) points.push(o); });
      out.pointLayers = points.map((p) => ({
        count: p.geometry.attributes.position.count,
        parentIsCamera: p.parent === camera,
        parentType: p.parent ? p.parent.type : null,
        frustumCulled: p.frustumCulled,
        name: p.name || null,
      }));
      let groups = 0, rings = 0;
      scene.traverse((o) => {
        if (o.name && o.name.startsWith('body:')) groups++;
      });
      scene.traverse((o) => {
        if (o.geometry && o.geometry.type === 'RingGeometry') {
          rings++;
          o.updateWorldMatrix(true, false);
          const m = o.matrixWorld.elements;
          const n = [m[8], m[9], m[10]];
          const nl = Math.hypot(n[0], n[1], n[2]) || 1;
          const normal = [n[0]/nl, n[1]/nl, n[2]/nl];
          let bodyName = null, p = o;
          while (p) { if (p.name && p.name.startsWith('body:')) { bodyName = p.name; break; } p = p.parent; }
          let poleDot = null;
          const par = o.parent;
          if (par) {
            const fm = par.matrixWorld.elements;
            const pv = [fm[8], fm[9], fm[10]];
            const pl = Math.hypot(pv[0], pv[1], pv[2]) || 1;
            poleDot = Math.abs((normal[0]*pv[0] + normal[1]*pv[1] + normal[2]*pv[2]) / pl);
          }
          out.ringMeshes.push({ body: bodyName, normalY: normal[1], poleDot: poleDot,
                                framedIn: par ? par.name : null, scale: [par ? par.scale.x : null] });
        }
      });
      out.bodyGroups = groups;
      out.ringCount = rings;
      return out;
    }""")


def renderer_info(page):
    return page.evaluate(r"""() => {
      const engine = window.__solarSystemEngine;
      if (!engine) return null;
      const info = engine.renderer.renderer.info;
      return {
        calls: info.render.calls, triangles: info.render.triangles, points: info.render.points,
        lines: info.render.lines, geometries: info.memory.geometries, textures: info.memory.textures,
        programs: info.programs ? info.programs.length : null,
      };
    }""")


def start_fps_probe(page):
    page.evaluate("""() => {
      window.__fpsProbe = { frames: 0, t0: performance.now(), stop: false, longFrames: 0, last: performance.now(), maxGap: 0 };
      const step = () => {
        const probe = window.__fpsProbe;
        if (!probe || probe.stop) return;
        const now = performance.now();
        const gap = now - probe.last;
        probe.last = now;
        probe.maxGap = Math.max(probe.maxGap, gap);
        if (gap > 33.4) probe.longFrames++;
        probe.frames++;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }""")


def read_fps(page):
    return page.evaluate("""() => {
      const probe = window.__fpsProbe;
      if (!probe) return null;
      const elapsed = (performance.now() - probe.t0) / 1000;
      probe.stop = true;
      return { fps: probe.frames / elapsed, elapsed, frames: probe.frames, longFrames: probe.longFrames, maxGap: probe.maxGap };
    }""")


def shot(page, name, full=False):
    path = os.path.join(SHOTS, name)
    page.screenshot(path=path, full_page=full)
    return path


def image_stats(path):
    """Fraction of non-black pixels and mean luminance, using PIL if available."""
    try:
        from PIL import Image
    except Exception:
        return None
    img = Image.open(path).convert("L")
    img.thumbnail((400, 400))
    px = list(img.getdata())
    total = len(px)
    nonblack = sum(1 for p in px if p > 12)
    return {"mean": sum(px) / total, "nonblack_fraction": nonblack / total, "pixels": total}


def au_to_km(au):
    return au * 149597870.7


def disc_luminance(page, body_id, box_fraction=0.7):
    """Mean luminance of the pixels inside a body's screen disc.

    Sampled inside a rAF callback so the engine has just rendered the frame
    (the composer's output is not preserved after compositing)."""
    return page.evaluate("""([id, frac]) => new Promise((resolve) => {
      requestAnimationFrame(() => {
        const engine = window.__solarSystemEngine;
        const c = document.querySelector('.stage canvas');
        const d = engine.describeBody(id);
        const tw = 400, th = Math.max(1, Math.round(400 * c.height / c.width));
        const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
        const g = tmp.getContext('2d');
        g.drawImage(c, 0, 0, tw, th);
        const cssW = c.getBoundingClientRect().width || c.clientWidth || tw;
        const radiusTmp = (d.projectedRadiusPixels || 0) * tw / cssW;
        const half = Math.max(2, Math.round(radiusTmp * frac));
        const cx = Math.round(tw / 2), cy = Math.round(th / 2);
        const x0 = Math.max(0, cx - half), y0 = Math.max(0, cy - half);
        const w = Math.min(tw - x0, half * 2), hh = Math.min(th - y0, half * 2);
        let sum = 0, n = 0, lit = 0, maxv = 0;
        if (w > 0 && hh > 0) {
          const px = g.getImageData(x0, y0, w, hh).data;
          for (let i = 0; i < px.length; i += 4) {
            const v = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
            sum += v; n++; if (v > 24) lit++; if (v > maxv) maxv = v;
          }
        }
        resolve({ mean: n ? sum / n : null, litFraction: n ? lit / n : null, max: maxv,
                  radiusPixels: d.projectedRadiusPixels, samples: n,
                  cameraDistUnits: engine.debugState().controllerDistanceUnits });
      });
    })""", [body_id, box_fraction])


def place_camera_on_sun_side(page, body_id, sign=1, ratio=4.5):
    """Put the camera between the Sun and the body (sign=1) or behind it (sign=-1)."""
    return page.evaluate("""([id, sign, ratio]) => {
      const engine = window.__solarSystemEngine;
      const st = engine.resolver.state(id);
      const cc = engine.cameraController;
      cc.setMode('orbit');
      cc.trackedId = id;
      cc.setTrackedRadius(st.radiusUnits);
      const p = st.absoluteUnits;
      const L = Math.hypot(p.x, p.y, p.z) || 1;
      const dir = { x: sign * -p.x / L, y: sign * -p.y / L, z: sign * -p.z / L };
      cc.azimuth = Math.atan2(dir.x, dir.z);
      cc.elevation = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      cc.placeRelativeToTarget(p, ratio);
      return { dir, radiusUnits: st.radiusUnits };
    }""", [body_id, sign, ratio])


def set_jd(page, jd, settle_ms=140):
    """Jump the simulation clock and wait for at least one resolver frame.

    jumpToJulianDate only sets the clock; body states are resolved once per
    animation frame, so reading immediately returns the *previous* instant."""
    js(page, "engine.jumpToJulianDate(arg); return null", jd)
    page.wait_for_timeout(settle_ms)
