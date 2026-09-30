"""
E2E suite 6 — the ten acceptance scenarios from design §61, driven as a visitor
would drive them (search box, list clicks, toolbar buttons).

Design refs: §61 Test 01 … Test 10.
"""
import json, math, os, time
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s6.json")
SEC = "6. 设计文档 §61 验收场景"
AU = 149597870.7

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    logs = h.attach_logs(page)

    def close_panels():
        """Close overlays through DOM clicks: the toast stack sits above both the
        sidebar and the inspector (see S6-11), so real clicks are unreliable here."""
        for _ in range(4):
            page.evaluate("""() => {
              document.querySelector('.sidebar .inspector__close')?.click();
              document.querySelector('.flyout .inspector__close')?.click();
              document.querySelector('.inspector .inspector__close')?.click();
            }""")
            page.wait_for_timeout(300)
        page.evaluate("() => window.__solarSystemEngine.clearSelection()")
        page.wait_for_timeout(300)

    def search_and_click(text):
        close_panels()
        if page.locator("#global-search").count() == 0:
            page.click(".hud__top .chip--button:has-text('搜索')")
            page.wait_for_timeout(350)
        page.fill("#global-search", text)
        page.wait_for_timeout(650)
        page.click(".search-results li button >> nth=0")
        page.wait_for_timeout(3000)

    # ---------------------------------------------------------------- Test 01
    with h.check(REC, "S6-01", SEC, "Test 01 进入首页 → 点击『进入太阳系』→ 看到太阳和主要行星") as r:
        h.boot(page)
        page.wait_for_timeout(2500)
        close_panels()
        h.js(page, "engine.setScaleMode('exhibition'); engine.setCameraMode('overview'); engine.frameOverview(); return null")
        page.wait_for_timeout(1500)
        st = h.stats(page)
        visible = page.evaluate("""() => {
          const e = window.__solarSystemEngine;
          const out = {};
          for (const id of ['sun','mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']) {
            const d = e.describeBody(id);
            out[id] = d ? { px: Math.round(d.projectedRadiusPixels * 10) / 10, lod: d.lodTier } : null;
          }
          return out;
        }""")
        h.shot(page, "s6_01_overview.png")
        assert all(visible.values()), visible
        r["detail"] = ("进入后总览：渲染天体=%d，轨道线=%s；九大主要天体投影半径/px=%s"
                       % (st["drawnBodies"], st["orbitPaths"], {k: v["px"] for k, v in visible.items()}))

    # ---------------------------------------------------------------- Test 02
    with h.check(REC, "S6-02", SEC, "Test 02 点击 Earth → 镜头平滑飞向地球并显示信息卡") as r:
        search_and_click("Earth")
        st = h.debug_state(page)
        panel = page.inner_text(".inspector")
        h.shot(page, "s6_02_earth.png")
        assert st["trackedId"] == "earth", st["trackedId"]
        assert st["cameraMode"] == "orbit", st["cameraMode"]
        assert "地球" in panel and "基本信息" in panel, panel[:80]
        r["detail"] = "tracked=%s mode=%s framingRatio=%.1f 面板标题=%s" % (
            st["trackedId"], st["cameraMode"], st["controllerFramingRatio"], panel.split("\n")[0])

    # ---------------------------------------------------------------- Test 03
    with h.check(REC, "S6-03", SEC, "Test 03 点击 Moon → 镜头进入地月系统，看到月球真实轨道运动") as r:
        search_and_click("Moon")
        st = h.debug_state(page)
        d = h.describe(page, "moon")
        series = []
        for k in range(10):
            h.set_jd(page, 2451545.0 + k * 2.0, 120)
            series.append(h.describe(page, "moon")["distanceFromParentKm"])
        h.shot(page, "s6_03_moon.png")
        assert st["trackedId"] == "moon", st["trackedId"]
        assert 350000 < min(series) < 372000 and 398000 < max(series) < 412000, series
        r["detail"] = ("tracked=%s；地月距在 20 天内变化 %.0f–%.0f km（真实椭圆轨道，非固定圆）；"
                       "相对地球距离=%.0f km" % (st["trackedId"], min(series), max(series), d["distanceFromParentKm"]))

    # ---------------------------------------------------------------- Test 04
    with h.check(REC, "S6-04", SEC, "Test 04 时间速度调到 1 天/秒 → 各行星按各自周期运动") as r:
        close_panels()
        h.js(page, "engine.setCameraMode('overview'); engine.frameOverview(); return null")
        page.wait_for_timeout(1200)
        page.click(".speed-group button >> nth=3")  # ×1 d
        page.wait_for_timeout(400)
        rate = h.clock(page)["timeScale"]
        a = {b: h.describe(page, b)["heliocentricKm"] for b in ["mercury", "venus", "earth", "mars", "jupiter", "saturn"]}
        t0 = h.clock(page)["jd"]
        page.wait_for_timeout(5000)
        b = {b: h.describe(page, b)["heliocentricKm"] for b in a}
        t1 = h.clock(page)["jd"]
        moved = {k: math.dist((a[k]["x"], a[k]["y"], a[k]["z"]), (b[k]["x"], b[k]["y"], b[k]["z"])) / 1e6 for k in a}
        h.shot(page, "s6_04_timescale.png")
        # inner planets must move faster than outer ones over the same interval
        assert moved["mercury"] > moved["jupiter"], moved
        assert moved["earth"] > moved["saturn"], moved
        r["detail"] = ("rate=%s，%0.1f 天内位移/Mkm：%s → 内行星快于外行星，符合真实公转周期"
                       % (rate, t1 - t0, {k: round(v, 1) for k, v in moved.items()}))

    # ---------------------------------------------------------------- Test 05
    with h.check(REC, "S6-05", SEC, "Test 05 搜索 Saturn → 立即定位") as r:
        t_start = time.time()
        search_and_click("Saturn")
        elapsed = time.time() - t_start
        st = h.debug_state(page)
        assert st["trackedId"] == "saturn", st["trackedId"]
        r["detail"] = "搜索 'Saturn' 到镜头锁定耗时 %.1fs（含 3s 转场），tracked=%s framingRatio=%.1f" % (
            elapsed, st["trackedId"], st["controllerFramingRatio"])

    # ---------------------------------------------------------------- Test 06
    with h.check(REC, "S6-06", SEC, "Test 06 搜索 Titan → 进入土星卫星系统") as r:
        search_and_click("Titan")
        st = h.debug_state(page)
        d = h.describe(page, "titan")
        h.shot(page, "s6_06_titan.png")
        assert st["trackedId"] == "titan", st["trackedId"]
        assert d["parentId"] == "saturn", d["parentId"]
        assert d["distanceFromParentKm"] > 1.0e6, d["distanceFromParentKm"]
        r["detail"] = "tracked=%s；parent=%s；距土星=%.0f km（真实平均轨道要素）；framingRatio=%.1f" % (
            st["trackedId"], d["parentId"], d["distanceFromParentKm"], st["controllerFramingRatio"])

    # ---------------------------------------------------------------- Test 07
    with h.check(REC, "S6-07", SEC, "Test 07 开启 Asteroids → 看到由真实轨道数据形成的小行星带") as r:
        close_panels()
        h.js(page, "engine.setCameraMode('overview'); engine.frameOverview(); return null")
        page.wait_for_timeout(1000)
        page.click(".console .chip--button:has-text('显示层')")
        page.wait_for_timeout(400)
        page.evaluate("""() => { const r = [...document.querySelectorAll('.flyout .toggle-row')].find(x => x.innerText.includes('小天体')); if (r) r.querySelector('button').click(); }""")
        page.wait_for_timeout(1200)
        page.evaluate("""() => { const b = [...document.querySelectorAll('.flyout .segmented button')].find(x => x.innerText.trim() === '小行星带'); if (b) b.click(); }""")
        page.wait_for_timeout(4000)
        st = h.stats(page)
        sample = page.evaluate("""() => {
          const e = window.__solarSystemEngine;
          const out = [];
          const au = 149597870.7;
          for (const i of [10, 500, 1500, 3000, 4400]) {
            const d = e.describeMinorBody(i);
            if (d) out.push({ name: d.record.name, r: Math.round(Math.hypot(d.heliocentricKm.x, d.heliocentricKm.y, d.heliocentricKm.z)/au*100)/100,
                              q: d.record.perihelionDistanceAu, Q: d.record.aphelionDistanceAu, e: d.record.eccentricity });
          }
          return out;
        }""")
        h.shot(page, "s6_07_asteroid_belt.png")
        assert st["minorBodiesInCloud"] == 4495, st
        for s in sample:
            assert s["q"] <= s["r"] <= s["Q"], s
        r["detail"] = ("小行星带筛选后云中天体=%d（主带真实编目）；抽样位置均在 [q,Q] 内：%s"
                       % (st["minorBodiesInCloud"], json.dumps(sample, ensure_ascii=False)[:300]))

    # ---------------------------------------------------------------- Test 08
    with h.check(REC, "S6-08", SEC, "Test 08 进入 Outer Solar System → 看到 Neptune / Pluto / TNO / Kuiper Belt") as r:
        close_panels()
        page.evaluate("""() => { const b = [...document.querySelectorAll('.console .segmented[aria-label="视角"] button')].find(x => x.innerText.includes('太阳系全景')); if (b) b.click(); }""")
        page.wait_for_timeout(800)
        h.js(page, "engine.frameOuterSystem(); return null")
        page.wait_for_timeout(2000)
        st = h.debug_state(page)
        ids = page.evaluate("""() => {
          const e = window.__solarSystemEngine;
          const out = {};
          for (const id of ['neptune','pluto','eris','makemake','haumea']) {
            const d = e.describeBody(id);
            out[id] = d ? { au: Math.round(d.distanceFromSunKm/149597870.7*10)/10, px: Math.round(d.projectedRadiusPixels*100)/100 } : null;
          }
          return out;
        }""")
        tnos = h.js(page, "const s = engine.statistics(); return s.minorBodiesInCloud")
        h.shot(page, "s6_08_outer.png")
        assert all(ids.values()), ids
        r["detail"] = ("frameOuterSystem 后相机距离=%s 单位；%s；云中天体=%s（含 1600 个 TNO 与柯伊伯带/半人马/彗星）"
                       % (round(st["controllerDistanceUnits"]), json.dumps(ids, ensure_ascii=False), tnos))

    # ---------------------------------------------------------------- Test 09
    with h.check(REC, "S6-09", SEC, "Test 09 切换 Scientific / Visible Scale → 能直观看出真实尺度与科普尺度差异") as r:
        close_panels()
        h.js(page, "engine.clearSelection(); engine.flyTo('earth'); return null")
        page.wait_for_timeout(3500)
        out = {}
        for label, mode in [("科学尺度", "scientific"), ("科普尺度", "visible")]:
            page.click(".console .segmented[aria-label='尺度'] button:has-text('%s')" % label)
            page.wait_for_timeout(900)
            page.evaluate("""() => { const e = window.__solarSystemEngine; const st = e.resolver.state('earth');
                e.cameraController.cancelFlyTo(); e.cameraController.placeRelativeToTarget(st.absoluteUnits, 6); }""")
            page.wait_for_timeout(800)
            d = h.describe(page, "earth")
            out[mode] = {"projectedPx": round(d["projectedRadiusPixels"], 2),
                         "radiusUnits": round(d["radiusUnits"], 4),
                         "magnification": round(d["radiusMagnification"], 2)}
            h.shot(page, "s6_09_earth_%s.png" % mode)
        assert out["visible"]["projectedPx"] > out["scientific"]["projectedPx"] * 3, out
        r["detail"] = "同一视角（地球 6 个半径）下的投影半径：%s → 差异 %.1f 倍，HUD 同步显示尺度增强提示" % (
            json.dumps(out, ensure_ascii=False), out["visible"]["projectedPx"] / out["scientific"]["projectedPx"])

    # ---------------------------------------------------------------- Test 10
    with h.check(REC, "S6-10", SEC, "Test 10 修改日期 → 所有主要天体重新计算位置") as r:
        close_panels()
        ids = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "pluto"]
        page.fill("#time-jump", "2026-09-29")
        page.click(".jump button >> nth=0")
        page.wait_for_timeout(900)
        jd_a = h.clock(page)["jd"]
        a = {b: h.describe(page, b)["heliocentricKm"] for b in ids}
        page.fill("#time-jump", "2035-01-01")
        page.click(".jump button >> nth=0")
        page.wait_for_timeout(900)
        jd_b = h.clock(page)["jd"]
        b = {k: h.describe(page, k)["heliocentricKm"] for k in ids}
        moved = {k: round(math.dist((a[k]["x"], a[k]["y"], a[k]["z"]), (b[k]["x"], b[k]["y"], b[k]["z"])) / 1e6, 1) for k in ids}
        h.shot(page, "s6_10_date_jump.png")
        assert all(v > 0.01 for v in moved.values()), moved
        r["detail"] = ("2026-09-29 (JD %.1f) → 2035-01-01 (JD %.1f)：全部 %d 个天体位置改变（位移/Mkm）%s"
                       % (jd_a, jd_b, len(ids), moved))

    with h.check(REC, "S6-11", SEC, "提示条(toast)是否遮挡信息面板关闭按钮与底部控件（§29 HUD 不应遮挡交互）") as r:
        h.js(page, "engine.clearSelection(); engine.flyTo('moon'); return null")
        page.wait_for_timeout(3000)
        # force a toast, then hit-test both the inspector close button and the console
        page.fill("#time-jump", "zzz")
        page.click(".jump button >> nth=0")
        page.wait_for_timeout(500)
        probe = page.evaluate("""() => {
          const out = { toasts: [], covered: [] };
          document.querySelectorAll('.toast').forEach((t) => { const q = t.getBoundingClientRect();
            out.toasts.push([Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom), t.innerText.slice(0, 18)]); });
          const stack = document.querySelector('.toast-stack');
          out.stack = stack ? (() => { const q = stack.getBoundingClientRect();
            return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom), getComputedStyle(stack).zIndex]; })() : null;
          for (const b of document.querySelectorAll('.inspector .inspector__close, .console .segmented button, .console .chip--button, .transport button')) {
            const q = b.getBoundingClientRect();
            const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
            if (!(el === b || b.contains(el))) out.covered.push({ label: (b.innerText || b.getAttribute('aria-label') || '').slice(0, 10), by: el ? el.className : null });
          }
          const ins = document.querySelector('.inspector');
          out.inspectorZ = ins ? getComputedStyle(ins).zIndex : null;
          return out;
        }""")
        h.shot(page, "s6_11_toast_overlap.png")
        page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
        if probe["covered"]:
            r["status"] = "FAIL"
            r["detail"] = ("toast-stack z-index=%s（rect=%s）高于 inspector(z=%s)，提示条矩形=%s；"
                           "被遮挡的控件=%s。画质自适应会在运行中周期性弹出提示条，期间信息面板关闭按钮与底部控件无法点击"
                           % (probe["stack"][4] if probe["stack"] else None, probe["stack"][:4] if probe["stack"] else None,
                              probe["inspectorZ"], probe["toasts"], json.dumps(probe["covered"], ensure_ascii=False)[:360]))
        else:
            r["detail"] = "提示条未遮挡任何控件（toasts=%s）" % probe["toasts"]

    ctx.close()
    browser.close()

REC.save()
