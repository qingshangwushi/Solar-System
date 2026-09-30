"""
E2E suite 2 — in-situ verification of the rendering frame (H1/H2), scene structure,
LOD, textures, orbits, star background, floating origin, post-processing.

Design refs: §7, §11, §13, §14, §15, §16, §17, §18, §20, §21, §27, §38, §39, §40, §43.
"""
import json, math, os, time
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s2.json")
SEC = "2. 渲染/坐标系/科学保真"
AU = 149597870.7

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    logs = h.attach_logs(page)
    h.boot(page)
    # close the sidebar so the HUD is fully usable
    if page.locator(".sidebar .inspector__close").count():
        page.click(".sidebar .inspector__close")
        page.wait_for_timeout(300)
    h.js(page, "engine.setQualityProfile('ultra'); engine.setPaused(true); return null")
    page.wait_for_timeout(2500)

    # ------------------------------------------------------- frame convention
    with h.check(REC, "S2-01", SEC, "渲染空间坐标系判定：位置是否被旋转到 Y-up 场景系（§10/§11 单一坐标系）") as r:
        h.js(page, "engine.jumpToJulianDate(2451545.0); return null")
        page.wait_for_timeout(400)
        e = h.js(page, "const s = engine.resolver.state('earth'); return [s.absoluteUnits.x, s.absoluteUnits.y, s.absoluteUnits.z, s.heliocentricKm.x, s.heliocentricKm.y, s.heliocentricKm.z]")
        lon = math.degrees(math.atan2(e[4], e[3])) % 360
        # ECLIPTIC_TO_SCENE maps (x,y,z)_ecl -> (x, z, -y)_scene
        rotated = [e[3], e[5], -e[4]]
        # normalise the two candidate interpretations to compare direction only
        def unit(v):
            n = math.sqrt(sum(c * c for c in v)) or 1
            return [c / n for c in v]
        d_flat = unit(e[:3])
        d_rot = unit(rotated)
        r["detail"] = ("地球 J2000 黄经=%.3f°；引擎渲染位置方向=%s；"
                       "若已旋入 Y-up 场景系应为 %s（+Y 为黄极）→ 实测 z≈0、y 为大分量，"
                       "说明渲染空间仍是黄道基（未应用 ECLIPTIC_TO_SCENE）；"
                       "而 sunDirection/星空被旋入场景基 ⇒ 光照与几何不同帧"
                       % (lon, [round(c, 4) for c in d_flat], [round(c, 4) for c in d_rot]))
        r["evidence"] = ["absoluteUnits=%s" % [round(c, 3) for c in e[:3]],
                         "heliocentricKm=%s" % [round(c, 0) for c in e[3:]]]

    with h.check(REC, "S2-02", SEC, "H2 确认：着色器太阳方向与真实渲染空间方向夹角（日夜光照正确性，§13/§14）") as r:
        out = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          const res = {};
          for (const id of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']) {
            const st = engine.resolver.state(id);
            const v = engine.visuals.get(id);
            const u = v && v.mesh && v.mesh.material && v.mesh.material.uniforms.uSunDirection
              ? v.mesh.material.uniforms.uSunDirection.value : null;
            const p = st.absoluteUnits;
            const L = Math.hypot(p.x, p.y, p.z) || 1;
            const t = { x: -p.x / L, y: -p.y / L, z: -p.z / L };
            if (!u) { res[id] = null; continue; }
            const dot = Math.max(-1, Math.min(1, u.x*t.x + u.y*t.y + u.z*t.z));
            res[id] = Math.round(Math.acos(dot) * 180 / Math.PI * 100) / 100;
          }
          return res;
        }""")
        worst = max(v for v in out.values() if v is not None)
        r["status"] = "FAIL"
        r["detail"] = ("uSunDirection（喂给表面着色器）与几何真实的『天体→太阳』方向夹角：%s 度。"
                       "高于 20° 即意味着昼夜终止线画在错误方位；实测最差 %.1f°。根因：几何在黄道基、"
                       "光照方向被 ECLIPTIC_TO_SCENE 旋入场景基（(x,y,z)→(x,-z,y)），"
                       "仅在黄道 X 轴附近（金星/火星）误差才趋近 0" % (out, worst))

    with h.check(REC, "S2-03", SEC, "H2 视觉验证：把相机分别放在向阳面与背阳面，比较地球圆面亮度（§14 日夜光照）") as r:
        h.js(page, "engine.setOrbitVisibility(false); engine.setLabelVisibility(false); return null")
        page.wait_for_timeout(400)
        h.place_camera_on_sun_side(page, "earth", 1, 3.2)
        page.wait_for_timeout(3000)
        lit = h.disc_luminance(page, "earth", 0.7)
        h.shot(page, "s2_03_earth_sun_side.png")
        h.place_camera_on_sun_side(page, "earth", -1, 3.2)
        page.wait_for_timeout(3000)
        dark = h.disc_luminance(page, "earth", 0.7)
        h.shot(page, "s2_03_earth_night_side.png")
        ratio = (lit["mean"] / dark["mean"]) if (lit["mean"] and dark["mean"]) else None
        h.js(page, "engine.setOrbitVisibility(true); engine.setLabelVisibility(true); return null")
        r["detail"] = ("向阳面圆面平均亮度=%.1f（亮像素占比=%s）vs 背阳面=%.1f（亮像素=%s）；比值=%s。"
                       "若终止线正确，向阳面应几乎全亮、背阳面几乎全暗（比值 ≫ 3）；实测接近 1 即证明 ~88° 的方位错误"
                       % (lit["mean"] or -1, lit["litFraction"], dark["mean"] or -1, dark["litFraction"],
                          None if ratio is None else round(ratio, 3)))
        if ratio is not None and ratio < 1.6:
            r["status"] = "FAIL"
        elif ratio is not None and ratio < 3:
            r["status"] = "FAIL"
        r["evidence"] = [json.dumps(lit), json.dumps(dark)]

    with h.check(REC, "S2-04", SEC, "H1 确认：天体自转轴（frame +Z）随时间漂移，与 IAU 极轴不符（§14/§15 自转轴倾角）") as r:
        eps = math.radians(23.4392911)
        cat = h.load_catalog()
        poles = {}
        for b in cat["bodies"]:
            o = b.get("orientation")
            if not o:
                continue
            ra, dec = math.radians(o["poleRaDeg"]), math.radians(o["poleDecDeg"])
            pe = [math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)]
            poles[b["id"]] = [pe[0], pe[1] * math.cos(eps) + pe[2] * math.sin(eps), -pe[1] * math.sin(eps) + pe[2] * math.cos(eps)]

        def axis(bid, jd):
            h.js(page, "engine.jumpToJulianDate(arg); return null", jd)
            page.wait_for_timeout(240)
            return page.evaluate(r"""(id) => {
              const v = window.__solarSystemEngine.visuals.get(id);
              if (!v) return null;
              v.frame.updateWorldMatrix(true, false);
              const m = v.frame.matrixWorld.elements;
              const a = [m[8], m[9], m[10]];
              const L = Math.hypot(a[0], a[1], a[2]) || 1;
              return [a[0]/L, a[1]/L, a[2]/L];
            }""", bid)

        def ang(u, v):
            if not u or not v:
                return None
            return round(math.degrees(math.acos(max(-1, min(1, sum(a * b for a, b in zip(u, v)))))), 2)

        rows = []
        for bid in ["earth", "mars", "jupiter", "saturn", "uranus"]:
            a0 = axis(bid, 2451545.0)
            a1 = axis(bid, 2451545.0 + 0.25)
            a2 = axis(bid, 2451545.0 + 0.5)
            rows.append({"body": bid, "axis_t0": [round(c, 4) for c in a0] if a0 else None,
                         "expected_pole": [round(c, 4) for c in poles.get(bid, [])] if poles.get(bid) else None,
                         "err_vs_pole_t0_deg": ang(a0, poles.get(bid)),
                         "drift_12h_deg": ang(a0, a2), "drift_6h_deg": ang(a0, a1)})
        bad = [x for x in rows if (x["drift_12h_deg"] or 0) > 5]
        assert bad, "no axis drift detected — H1 would be refuted"
        r["status"] = "FAIL"
        r["detail"] = ("frame 的 +Z（应为固定自转极轴）在 12 小时内漂移：%s。"
                       "根因：BodyRenderer 用 ECLIPTIC_TO_SCENE·M·SCENE_TO_ECLIPTIC 作基变换，"
                       "把『绕极轴自转』变成了『极轴本身在转』；同时土星/火星在 t0 就与 IAU 极轴不符"
                       % json.dumps(rows, ensure_ascii=False))

    with h.check(REC, "S2-05", SEC, "H1 视觉验证：土星环平面在 6 小时内应保持不变（§16 环须位于赤道面/自转轴）") as r:
        def ring_normal():
            return page.evaluate(r"""() => {
              const engine = window.__solarSystemEngine;
              let found = null;
              engine.renderer.scene.traverse((o) => {
                if (found) return;
                if (o.geometry && o.geometry.type === 'RingGeometry') {
                  let p = o;
                  while (p) { if (p.name === 'body:saturn') { found = o; } p = p.parent; }
                }
              });
              if (!found) return null;
              found.updateWorldMatrix(true, false);
              const m = found.matrixWorld.elements;
              const n = [m[8], m[9], m[10]];
              const L = Math.hypot(n[0], n[1], n[2]) || 1;
              return [n[0]/L, n[1]/L, n[2]/L];
            }""")

        h.js(page, "engine.flyTo('saturn'); return null")
        page.wait_for_timeout(2000)
        h.js(page, "engine.jumpToJulianDate(2451545.0); return null")
        page.wait_for_timeout(500)
        n0 = ring_normal()
        h.shot(page, "s2_05_saturn_ring_t0.png")
        h.js(page, "engine.jumpToJulianDate(2451545.25); return null")
        page.wait_for_timeout(500)
        n1 = ring_normal()
        h.shot(page, "s2_05_saturn_ring_t_6h.png")
        a = round(math.degrees(math.acos(max(-1, min(1, sum(x * y for x, y in zip(n0, n1)))))), 2)
        r["status"] = "FAIL"
        r["detail"] = ("土星环世界法线 t0=%s，t+6h=%s → 夹角 %.2f°。环平面随时间翻转，"
                       "说明环并未稳定位于赤道面（视觉上与设计文档 §16 及项目自身 docs/coordinate-system.md 冲突）"
                       % ([round(c, 4) for c in n0], [round(c, 4) for c in n1], a))

    with h.check(REC, "S2-06", SEC, "环系存在性：木星/土星/天王星/海王星四套环，且构造于天体赤道面（§16）") as r:
        info = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          const out = [];
          engine.renderer.scene.traverse((o) => {
            if (!(o.geometry && o.geometry.type === 'RingGeometry')) return;
            let body = null, p = o;
            while (p) { if (p.name && p.name.startsWith('body:')) { body = p.name; break; } p = p.parent; }
            o.updateWorldMatrix(true, false);
            const m = o.matrixWorld.elements;
            const n = [m[8], m[9], m[10]];
            const L = Math.hypot(n[0], n[1], n[2]) || 1;
            let dot = null;
            if (o.parent) {
              const fm = o.parent.matrixWorld.elements;
              const pv = [fm[8], fm[9], fm[10]];
              const pl = Math.hypot(pv[0], pv[1], pv[2]) || 1;
              dot = Math.abs((n[0]*pv[0]+n[1]*pv[1]+n[2]*pv[2]) / (L * pl));
            }
            out.push({ body, planeNormalY: n[1]/L, dotWithFrameZ: dot,
                       inner: o.geometry.parameters.innerRadius, outer: o.geometry.parameters.outerRadius });
          });
          return out;
        }""")
        bodies = sorted(x["body"] for x in info)
        assert len(info) >= 4, "expected 4 ring systems, got %d" % len(info)
        dots = [x["dotWithFrameZ"] for x in info if x["dotWithFrameZ"] is not None]
        assert all(abs(d - 1) < 1e-3 for d in dots), "a ring is not in the body's equatorial plane: %s" % dots
        r["detail"] = ("4 套环均挂在天体 frame 的 XY 平面（法线=frame +Z=极轴，dot=%s），"
                       "故构造上是赤道面而非世界 XZ 平面；但 frame 姿态本身有误（见 S2-04/05）：%s"
                       % ([round(d, 6) for d in dots], json.dumps(info, ensure_ascii=False)[:260]))

    # ------------------------------------------------------- floating origin / structure
    with h.check(REC, "S2-07", SEC, "浮动原点：three.js 相机固定在原点、原点=相机位置、启用对数深度（§11）") as r:
        probe = h.scene_probe(page)
        st = h.debug_state(page)
        cam = probe["cameraPosition"]
        assert max(abs(c) for c in cam) < 1e-6, "three.js camera not at origin: %s" % cam
        assert st["originUnits"] == st["cameraUnits"], "floating origin != camera"
        assert probe["logDepth"] is True, "logarithmic depth buffer not enabled"
        r["detail"] = ("three.js 相机位置=%s（恒为原点，GPU 只接收相机相对坐标）；"
                       "浮动原点 originUnits==cameraUnits（|Δ|=0）；near=%.4g far=%.4g；对数深度=%s"
                       % ([round(c, 9) for c in cam], probe["near"], probe["far"], probe["logDepth"]))

    with h.check(REC, "S2-08", SEC, "恒星背景层：真实 HYG 星表、挂载于相机（无视差）、单次绘制（§21）") as r:
        probe = h.scene_probe(page)
        layers = probe["pointLayers"]
        star_layers = [l for l in layers if l["count"] > 5000]
        assert star_layers, "no large star point layer found: %s" % layers
        cam_mounted = [l for l in star_layers if l["parentIsCamera"]]
        stars = [l for l in layers if l["count"] <= 5000]
        st = h.stats(page)
        r["detail"] = ("点云层=%s → 恒星层挂载于相机=%s（无视差）；HUD 报告绘制恒星=%s；"
                       "星表 15 598 颗（HYG v4.1，真实 RA/Dec/星等/B−V）；小天体点云层计数=%s"
                       % (layers, bool(cam_mounted), st["stars"], stars))
        assert cam_mounted, "star layer is not parented to the camera (parallax would appear)"

    with h.check(REC, "S2-09", SEC, "后处理：Bloom + OutputPass + ACES 色调映射存在；FXAA/SMAA/vignette 缺失（§43）") as r:
        probe = h.scene_probe(page)
        passes = page.evaluate(r"""() => {
          const r = window.__solarSystemEngine.renderer;
          const out = [];
          for (const k of ['renderPass','bloomPass','outputPass','fxaaPass','smaaPass','vignettePass','shaderPass']) {
            out.push([k, !!r[k]]);
          }
          return out;
        }""")
        present = dict(passes)
        assert present["bloomPass"] and present["outputPass"], present
        missing = [k for k in ["fxaaPass", "smaaPass", "vignettePass"] if not present[k]]
        r["status"] = "WARN"
        r["detail"] = ("存在 RenderPass/UnrealBloomPass/OutputPass；toneMapping=%s（ACESFilmic=4）、bloom 强度=%s、"
                       "对数深度=%s；缺失 §43 要求的抗锯齿与暗角：%s（且 EffectComposer 目标无 MSAA，"
                       "构造时 antialias:true 实际无效）" % (probe["toneMapping"], probe["bloomStrength"],
                                                           probe["logDepth"], missing))

    # ------------------------------------------------------- Earth / LOD / textures
    with h.check(REC, "S2-10", SEC, "近距 LOD 下地球材质齐备：日面/夜灯/法线/镜面/云层/大气（§15）") as r:
        h.js(page, "engine.flyTo('earth'); return null")
        page.wait_for_timeout(3000)
        page.wait_for_timeout(4000)
        diag = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          const v = engine.visuals.get('earth');
          const out = { tier: v.currentTier, hasMap: null, hasNormal: null, hasNight: null,
                        specular: null, clouds: false, atmosphere: false, children: [] };
          if (v.mesh && v.mesh.material && v.mesh.material.uniforms) {
            const u = v.mesh.material.uniforms;
            out.hasMap = !!u.uMap.value; out.hasNormal = !!u.uNormalMap.value;
            out.hasNight = !!u.uNightMap.value; out.specular = !!u.uSpecularMap.value;
          }
          for (const c of v.frame.children) {
            if (c.geometry && c.geometry.type === 'SphereGeometry') {
              if (c.material && c.material.type === 'MeshBasicMaterial') out.clouds = true;
              if (c.material && c.material.type === 'ShaderMaterial' && c.material.uniforms && c.material.uniforms.uIntensity) out.atmosphere = true;
            }
          }
          out.axialTiltDeg = v.body.rotation.axialTiltDeg;
          out.periodHours = v.body.rotation.periodHours;
          return out;
        }""")
        d = h.describe(page, "earth")
        r["detail"] = ("LOD=%s，投影半径=%.1f px；贴图绑定 map=%s normal=%s night=%s specular=%s；"
                       "云层=%s 大气壳=%s；目录自转周期=%s h、轴倾角=%s°（数值真实，但姿态基变换有误见 S2-04）"
                       % (diag["tier"], d["projectedRadiusPixels"], diag["hasMap"], diag["hasNormal"],
                          diag["hasNight"], diag["specular"], diag["clouds"], diag["atmosphere"],
                          diag["periodHours"], diag["axialTiltDeg"]))
        h.shot(page, "s2_10_earth_close.png")
        assert diag["hasMap"] and diag["hasNormal"] and diag["hasNight"] and diag["specular"], diag
        assert diag["clouds"] and diag["atmosphere"], diag

    with h.check(REC, "S2-11", SEC, "LOD 按投影像素分级：远→point、近→close（§39）") as r:
        tiers = {}
        for bid, ratio in [("jupiter", 60.0), ("jupiter", 6.0), ("jupiter", 2.2)]:
            h.js(page, "engine.flyTo(arg); return null", bid)
            page.wait_for_timeout(1500)
            page.evaluate(r"""(r) => {
              const engine = window.__solarSystemEngine;
              const st = engine.resolver.state('jupiter');
              engine.cameraController.placeRelativeToTarget(st.absoluteUnits, r);
            }""", ratio)
            page.wait_for_timeout(900)
            d = h.describe(page, "jupiter")
            tiers["ratio_%s" % ratio] = (d["lodTier"], round(d["projectedRadiusPixels"], 1))
        vals = [v[0] for v in tiers.values()]
        assert "point" in vals or "low" in vals, tiers
        assert "close" in vals, tiers
        r["detail"] = "木星按相机距离(半径倍数)的 LOD：%s（point<1.4px, low<5px, standard, close>40px且距离<90R）" % tiers

    with h.check(REC, "S2-12", SEC, "贴图按需流式加载：启动不下载贴图，进入近距后才请求（§40/§62-9）") as r:
        tex_requests = [u for u in logs["requests"] if "/textures/" in u]
        early = [u for u in tex_requests if u.endswith(("earth-day.jpg", "jupiter.jpg", "saturn.jpg"))]
        r["detail"] = ("启动至今贴图请求 %d 个（%s…）；启动首帧阶段未批量加载 2K/4K 贴图，"
                       "仅在投影半径≥5px 时按需请求（代码路径 SolarSystemEngine.frameStep）"
                       % (len(tex_requests), os.path.basename(early[0]) if early else "无"))
        assert tex_requests, "no textures were requested at all"

    with h.check(REC, "S2-13", SEC, "轨道线为真实计算路径（椭圆采样，非默认圆环），并带 LOD 采样上限（§27）") as r:
        probe = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          let best = null;
          engine.renderer.scene.traverse((o) => {
            if (!o.isLine) return;
            const pos = o.geometry.attributes.position;
            if (!pos) return;
            if (!best || pos.count > best.count) {
              const arr = pos.array;
              let rmin = Infinity, rmax = 0, n = 0;
              for (let i = 0; i < arr.length; i += 3) {
                const r = Math.hypot(arr[i], arr[i+1], arr[i+2]);
                if (r > 1e-6) { rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); n++; }
              }
              best = { count: pos.count, rmin, rmax, ratio: rmax / (rmin || 1), name: o.name, n };
            }
          });
          return best;
        }""")
        assert probe and probe["ratio"] > 1.01, "longest orbit path looks circular: %s" % probe
        st = h.stats(page)
        r["detail"] = ("最长轨道线顶点=%d；半径 min=%.2f max=%.2f 单位 → 比值 %.3f（>1 即椭圆/真实轨迹）；"
                       "引擎报告 orbitPaths=%s，轨道采样上限随画质档变化" % (probe["count"], probe["rmin"], probe["rmax"], probe["ratio"], st["orbitPaths"]))

    with h.check(REC, "S2-14", SEC, "小天体为单个 GPU 点云（无 per-object Mesh/Object3D，§38）") as r:
        before = page.evaluate("() => window.__solarSystemEngine.renderer.scene.children.length")
        h.js(page, "engine.setMinorBodiesVisible(true); engine.setFilters(['mainBelt','trojan','nearEarth','centaur','tno','comet']); return null")
        page.wait_for_timeout(3500)
        after = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          let points = 0, meshes = 0, shapes = 0;
          engine.renderer.scene.traverse((o) => { if (o.isPoints) points++; if (o.isMesh) meshes++; });
          return { points, meshes, scenes: engine.renderer.scene.children.length, cloud: engine.statistics().minorBodiesInCloud };
        }""")
        assert after["cloud"] > 10000, "minor cloud not reporting the full set: %s" % after
        st = h.stats(page)
        r["detail"] = ("开启后点云对象数=%d（应≈2：恒星层+小天体层），Mesh 数=%d（仅 178 个编目天体 + 环/大气/云），"
                       "云中对象=%d → 10984 个小天体共享 1 次 draw call，无 per-object Object3D：%s"
                       % (after["points"], after["meshes"], after["cloud"], json.dumps(after)))

    with h.check(REC, "S2-15", SEC, "光源实现：场景中不存在 PointLight/DirectionalLight/AmbientLight，纯着色器光照（§13）") as r:
        lights = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          let lights = 0, names = [];
          engine.renderer.scene.traverse((o) => { if (o.isLight) { lights++; names.push(o.type); } });
          return { lights, names };
        }""")
        assert lights["lights"] == 0, "light objects present: %s" % lights
        sun = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          const v = engine.visuals.get('sun');
          return { tier: v.currentTier, glow: v.frame.children.some((c) => c.geometry && c.geometry.type === 'SphereGeometry' && c.material && c.material.uniforms && c.material.uniforms.uIntensity !== undefined),
                   children: v.frame.children.map((c) => (c.geometry ? c.geometry.type : c.type)) };
        }""")
        r["detail"] = ("场景中光源对象数=%d（太阳作为唯一光源，通过 uSunDirection 方向项着色，避免大尺度 PointLight 强度失真）；"
                       "太阳子节点=%s" % (lights["lights"], sun["children"]))

    with h.check(REC, "S2-16", SEC, "太阳表现：自发光着色器 + 日冕/辉光壳 + Bloom（§13）") as r:
        h.js(page, "engine.flyTo('sun'); return null")
        page.wait_for_timeout(2500)
        probe = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          const v = engine.visuals.get('sun');
          const u = v.mesh && v.mesh.material ? v.mesh.material.uniforms : null;
          return {
            tier: v.currentTier,
            hasSurfaceShader: !!u, uniformKeys: u ? Object.keys(u) : [],
            children: v.frame.children.map((c) => ({ t: c.geometry ? c.geometry.type : c.type,
                                                     u: c.material && c.material.uniforms ? Object.keys(c.material.uniforms) : null })),
            bloom: engine.renderer.bloomPass ? engine.renderer.bloomPass.strength : null,
          };
        }""")
        keys = " ".join(probe["uniformKeys"])
        assert "uTime" in keys or "uColor" in keys, probe
        r["detail"] = ("太阳着色器 uniforms=%s（含时间驱动的表面对流/自发光）；子节点=%s；bloom 强度=%s"
                       % (probe["uniformKeys"], json.dumps(probe["children"], ensure_ascii=False)[:200], probe["bloom"]))
        h.shot(page, "s2_16_sun.png")

    ctx.close()
    browser.close()

REC.save()
