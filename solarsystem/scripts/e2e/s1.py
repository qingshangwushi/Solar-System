"""
E2E suite 1 — boot, splash, loading, catalog integrity, time system, scale modes.
Design refs: §4, §5, §6, §7, §9, §10, §11, §12, §29, §30, §47, §57, §61 (Test 01/04/09/10), §62.
"""
import json, math, os, sys, time
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s1.json")
SEC = "1. 启动/目录/时间/尺度"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    logs = h.attach_logs(page)

    # ---------------------------------------------------------------- BOOT-01..05
    t0 = time.time()
    with h.check(REC, "S1-01", SEC, "首页/启动屏：标题、副标题、进入按钮、真实统计") as r:
        h.goto_splash(page)
        splash = page.inner_text(".splash")
        stats_text = page.inner_text(".splash__facts")
        assert "太阳系" in splash, "splash missing Chinese title"
        assert "进入太阳系" in splash, "splash missing enter button"
        h.shot(page, "s1_01_splash.png")
        assert "已编目天体" in stats_text, "splash facts row missing"
        if "—" in stats_text:
            r["status"] = "WARN"
            r["detail"] = ("标题/副标题/进入按钮正常；但统计行显示占位符 '—'（目录尚未加载，boot 只在 phase=loading 时执行）"
                           "→ SplashScreen 注释所称『显示真实目录统计』未兑现：%s" % stats_text.replace("\n", " | "))
        else:
            r["detail"] = "标题/副标题/按钮/统计均在；facts=%s" % stats_text.replace("\n", " | ")[:120]

    with h.check(REC, "S1-02", SEC, "启动屏背景是否运行 3D 场景（§30 建议 / 代码注释声称场景在后台运行）") as r:
        # The engine is created only when phase==='ready', so during splash no WebGL scene exists.
        engine_present = page.evaluate("() => !!window.__solarSystemEngine")
        canvas_blank = page.evaluate("""() => {
          const c = document.querySelector('.stage canvas');
          if (!c) return null;
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          if (!gl) return 'no-gl';
          const w = 64, hh = 48;
          const px = new Uint8Array(w * hh * 4);
          gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let nonblack = 0;
          for (let i = 0; i < px.length; i += 4) if (px[i] > 12 || px[i+1] > 12 || px[i+2] > 12) nonblack++;
          return { nonblack, total: w * hh };
        }""")
        st = h.image_stats(h.shot(page, "s1_02_splash_pixels.png"))
        assert not engine_present, "engine unexpectedly created during splash"
        r["detail"] = ("启动屏期间 engine 未创建（window.__solarSystemEngine=false）；"
                       "canvas 采样=%s；截图非黑像素比例=%s → 背景为静态黑色，未运行缓慢太阳系动画"
                       % (canvas_blank, None if st is None else round(st["nonblack_fraction"], 4)))
        r["status"] = "WARN"

    with h.check(REC, "S1-03", SEC, "点击进入 → 加载屏显示真实步骤与进度（§57）") as r:
        page.click(".splash__enter")
        page.wait_for_selector(".loading", timeout=15000)
        steps = page.eval_on_selector_all(".loading__list li", "els => els.map(e => [e.innerText, e.dataset.state])")
        bar = page.get_attribute(".loading__bar", "aria-valuenow")
        h.shot(page, "s1_03_loading.png")
        assert len(steps) == 5, "expected 5 loading steps, got %d" % len(steps)
        labels = " ".join(s[0] for s in steps)
        assert "目录" in labels or "catalog" in labels.lower(), "loading steps missing catalog stage"
        r["detail"] = "5 个真实步骤=%s；进度条 aria-valuenow=%s" % (steps, bar)

    with h.check(REC, "S1-04", SEC, "进入主场景：HUD/canvas/引擎就绪，WebGL2 可用，无控制台错误") as r:
        page.wait_for_selector(".hud", timeout=240000)
        page.wait_for_function("() => !!window.__solarSystemEngine", timeout=240000)
        page.wait_for_timeout(2000)
        info = page.evaluate("""() => {
          const c = document.createElement('canvas');
          const gl = c.getContext('webgl2');
          const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
          return {
            webgl2: !!gl,
            renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : null),
            canvas: document.querySelectorAll('.stage canvas').length,
            hud: !!document.querySelector('.hud'),
            labels: document.querySelectorAll('.label').length,
          };
        }""")
        assert info["webgl2"], "WebGL2 unavailable"
        assert info["canvas"] == 1, "expected 1 canvas"
        h.shot(page, "s1_04_ready.png")
        boot_seconds = time.time() - t0
        r["detail"] = ("WebGL2=%s renderer=%s；canvas=%d，label=%d；启动总耗时=%.1fs；console.error=%d，pageerror=%d"
                       % (info["webgl2"], info["renderer"], info["canvas"], info["labels"], boot_seconds,
                          len(logs["console_error"]), len(logs["pageerror"])))
        r["evidence"] = logs["console_error"][:5] + logs["pageerror"][:5]

    with h.check(REC, "S1-05", SEC, "无控制台错误 / 无网络失败（§47 离线优先）") as r:
        ext = [u for u in logs["requests"] if not u.startswith(h.BASE.rstrip("/"))]
        assert not logs["pageerror"], "page errors: %s" % logs["pageerror"][:3]
        assert not logs["console_error"], "console errors: %s" % logs["console_error"][:3]
        r["detail"] = "requests=%d 全部同源=%s；requestfailed=%d" % (len(logs["requests"]), not ext, len(logs["requestfailed"]))
        r["evidence"] = ["total requests=%d" % len(logs["requests"])] + ["non-local: %s" % ext[:5]]

    # ---------------------------------------------------------------- CATALOG
    with h.check(REC, "S1-06", SEC, "目录完整性：1 恒星 + 8 行星 + 5 矮行星 + 164 卫星，类型分布来自数据（§4）") as r:
        cat = page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          return null;
        }""")
        # catalog statistics are surfaced through the HUD statistics panel and the engine
        cat_stats = page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          const s = engine.statistics();
          return s;
        }""")
        manifest = json.load(open("/Users/chenchao/Documents/projects/github/Solar-System/solarsystem/public/data/catalog/manifest.json"))
        st = manifest["statistics"]
        assert st["byType"] == {"star": 1, "planet": 8, "dwarfPlanet": 5, "moon": 164}, st["byType"]
        r["detail"] = ("manifest: total=%d rendered=%d minor=%d stars=%d (named=%d)；byType=%s；buckets=%s；"
                       "engine drawnBodies=%s" % (st["totalBodies"], st["renderedBodies"], st["minorBodies"],
                                                  st["stars"], st["namedStars"], st["byType"], st["minorBodiesByBucket"],
                                                  cat_stats["drawnBodies"]))

    with h.check(REC, "S1-07", SEC, "三大类小行星族齐备（主带/近地/特洛伊/半人马/TNO/彗星），无 Oort 云与流星体分类（§4/§18 对比设计图）") as r:
        buckets = h.js(page, "return Array.from(engine.minorFilters ? engine.minorFilters : [])") or []
        filters = page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          return engine.constructor.name;
        }""")
        manifest = json.load(open("/Users/chenchao/Documents/projects/github/Solar-System/solarsystem/public/data/catalog/manifest.json"))
        bk = manifest["statistics"]["minorBodiesByBucket"]
        for key in ["mainBelt", "nearEarth", "trojan", "centaur", "tno", "comet"]:
            assert key in bk, "missing bucket %s" % key
        r["detail"] = ("族：%s；缺失对比设计图的『奥尔特云』与『流星体/行星际尘埃』分类" % bk)
        r["status"] = "WARN"

    with h.check(REC, "S1-08", SEC, "小天体位置服从真实轨道根数（抽样 240 个：日心距 ∈ [近日点, 远日点]）") as r:
        h.js(page, "engine.setMinorBodiesVisible(true); return null")
        page.wait_for_timeout(3500)
        sample = page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          const out = [];
          const n = 10984;
          let seed = 7;
          const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
          for (let k = 0; k < 240; k++) {
            const i = Math.floor(rnd() * n);
            const d = engine.describeMinorBody(i);
            if (!d) continue;
            out.push({ i, name: d.record.name, r: Math.hypot(d.heliocentricKm.x, d.heliocentricKm.y, d.heliocentricKm.z),
                       q: d.record.perihelionDistanceAu, Q: d.record.aphelionDistanceAu, e: d.record.eccentricity });
          }
          return out;
        }""")
        au = 149597870.7
        bad = []
        ecc_values = []
        for s in sample:
            if s["q"] is None or s["Q"] is None:
                continue
            lo, hi = s["q"] * au * 0.995, s["Q"] * au * 1.005
            if not (lo <= s["r"] <= hi):
                bad.append((s["name"], s["r"] / au, s["q"], s["Q"]))
            ecc_values.append(s["e"])
        assert len(sample) >= 200, "only sampled %d" % len(sample)
        assert not bad, "positions outside [q,Q]: %s" % bad[:5]
        r["detail"] = ("抽样 %d 个真实编目小天体，全部满足 日心距∈[q,Q]（按真实根数）；离心率范围 %.3f–%.3f（非圆形，非随机）"
                       % (len(sample), min(ecc_values), max(ecc_values)))

    with h.check(REC, "S1-09", SEC, "行星轨道为真实椭圆：地球 日心距 min/max ≈ 0.983/1.017 AU，水星 ≈ 0.307/0.467 AU（§7/§62-1）") as r:
        def sweep(body_id, jd0, days, n):
            vals = []
            for k in range(n):
                jd = jd0 + days * k / (n - 1)
                d = h.js(page, "engine.jumpToJulianDate(arg); return null", jd)
                desc = h.describe(page, body_id)
                vals.append(desc["distanceFromSunKm"] / 149597870.7)
            return vals
        jd0 = 2451545.0  # J2000
        earth = sweep("earth", jd0, 365.256, 72)
        mercury = sweep("mercury", jd0, 87.969, 72)
        r["detail"] = ("地球 %.4f–%.4f AU（公开 0.9833/1.0167）；水星 %.4f–%.4f AU（公开 0.3075/0.4667）"
                       % (min(earth), max(earth), min(mercury), max(mercury)))
        assert 0.980 < min(earth) < 0.986, "earth perihelion off: %.4f" % min(earth)
        assert 1.014 < max(earth) < 1.020, "earth aphelion off: %.4f" % max(earth)
        assert 0.305 < min(mercury) < 0.310, "mercury perihelion off: %.4f" % min(mercury)
        assert 0.463 < max(mercury) < 0.470, "mercury aphelion off: %.4f" % max(mercury)

    with h.check(REC, "S1-10", SEC, "行星尺度/周期正确：地球平均日心距 ≈1 AU，木星 ≈5.2 AU，海王星 ≈30 AU") as r:
        jd = 2451545.0
        h.set_jd(page, jd)
        got = {}
        for bid in ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]:
            got[bid] = h.describe(page, bid)["distanceFromSunKm"] / 149597870.7
        expect = {"mercury": (0.31, 0.47), "venus": (0.718, 0.729), "earth": (0.98, 1.02),
                  "mars": (1.38, 1.67), "jupiter": (4.95, 5.46), "saturn": (9.02, 10.05),
                  "uranus": (18.3, 20.1), "neptune": (29.8, 30.4)}
        bad = {k: (got[k], expect[k]) for k in got if not (expect[k][0] <= got[k] <= expect[k][1])}
        assert not bad, "out of published range: %s" % bad
        r["detail"] = "J2000 日心距/AU: " + ", ".join("%s=%.3f" % (k, v) for k, v in got.items())

    with h.check(REC, "S1-11", SEC, "矮行星与卫星层级：矮行星 5 个、月球 parent=earth、Titan parent=saturn（§17）") as r:
        checks = {}
        for bid in ["ceres", "pluto", "haumea", "makemake", "eris"]:
            d = h.describe(page, bid)
            checks[bid] = None if d is None else d["body"]["type"]
        moon = h.describe(page, "moon")
        titan = h.describe(page, "titan")
        assert all(checks.values()), "missing dwarf planets: %s" % checks
        assert moon["parentId"] == "earth", "moon parent=%s" % moon["parentId"]
        assert titan["parentId"] == "saturn", "titan parent=%s" % titan["parentId"]
        r["detail"] = "矮行星=%s；moon.parent=%s 距地=%s km；titan.parent=%s" % (
            checks, moon["parentId"], round(moon["distanceFromParentKm"]), titan["parentId"])

    # ---------------------------------------------------------------- TIME
    with h.check(REC, "S1-12", SEC, "时间推进：×1 天/秒 下儒略日按真实速率前进（§9/Test 04）") as r:
        h.js(page, "engine.setTimeScale(86400); return null")
        h.js(page, "engine.setPaused(false); return null")
        a = h.clock(page)
        page.wait_for_timeout(4000)
        b = h.clock(page)
        delta_days = b["jd"] - a["jd"]
        wall = 4.0
        assert 2.5 < delta_days < 6.0, "advanced %.3f days in %.1fs" % (delta_days, wall)
        r["detail"] = "4.0 s 内前进 %.2f 天（期望≈4 天，rate=86400 s/s），timeScale=%s" % (delta_days, b["timeScale"])

    with h.check(REC, "S1-13", SEC, "暂停：时间停止前进，按钮状态与 HUD 显示同步（§9）") as r:
        h.js(page, "engine.setPaused(true); return null")
        page.wait_for_timeout(300)
        a = h.clock(page)
        page.wait_for_timeout(2500)
        b = h.clock(page)
        assert abs(b["jd"] - a["jd"]) < 1e-9, "clock advanced while paused: %s" % (b["jd"] - a["jd"])
        active = page.eval_on_selector_all(".transport button", "els => els.map(e => [e.innerText.trim(), e.dataset.active])")
        h.shot(page, "s1_13_paused.png")
        r["detail"] = "暂停后 2.5 s 内 ΔJD=%.3e；transport=%s" % (b["jd"] - a["jd"], active)

    with h.check(REC, "S1-14", SEC, "反向运行：timeScale<0 且儒略日倒流（§9）") as r:
        h.js(page, "engine.setPaused(false); return null")
        h.js(page, "engine.setTimeScale(86400); return null")
        page.wait_for_timeout(600)
        a = h.clock(page)
        page.wait_for_timeout(1200)
        b = h.clock(page)
        assert b["jd"] > a["jd"], "did not advance"
        # The left sidebar is open by default and covers the transport buttons,
        # so close it before clicking (see S1-25).
        page.click(".sidebar .inspector__close")
        page.wait_for_timeout(300)
        page.click(".transport button[title='倒放']")
        page.wait_for_timeout(300)
        c = h.clock(page)
        page.wait_for_timeout(2000)
        d = h.clock(page)
        assert c["timeScale"] < 0, "timeScale not negative: %s" % c
        assert d["jd"] < c["jd"], "clock did not run backwards: %s -> %s" % (c["jd"], d["jd"])
        r["detail"] = "倒放后 timeScale=%s；2 s 内 ΔJD=%.3f 天（负向）" % (c["timeScale"], d["jd"] - c["jd"])

    with h.check(REC, "S1-15", SEC, "速度预设档位与设计文档一致（实时/1分/1时/1天/10天/30天/1年）") as r:
        labels = page.eval_on_selector_all(".speed-group button", "els => els.map(e => e.innerText.trim())")
        want = ["×1 s", "×1 min", "×1 h", "×1 d", "×10 d", "×30 d", "×1 yr", "暂停"]
        assert labels == want, "speed buttons=%s" % labels
        got = []
        for idx, value in enumerate([1, 60, 3600, 86400, 864000, 2592000, 31557600]):
            page.click(".speed-group button >> nth=%d" % idx)
            page.wait_for_timeout(150)
            got.append(h.clock(page)["timeScale"])
        assert got == [1, 60, 3600, 86400, 864000, 2592000, 31557600], got
        page.click(".speed-group button >> nth=7")
        page.wait_for_timeout(250)
        clk = h.clock(page)
        frozen_a = clk["jd"]
        page.wait_for_timeout(1500)
        frozen_b = h.clock(page)["jd"]
        assert clk["timeScale"] == 0, "speed preset did not set rate 0: %s" % clk
        assert abs(frozen_b - frozen_a) < 1e-9, "clock still advanced at rate 0"
        if clk["paused"] is not True:
            r["status"] = "WARN"
            r["detail"] = ("按钮=%s；timeScale 实测=%s；『暂停』档位确实冻结时间（rate=0，ΔJD=0），"
                           "但 SimulationClock.setRate(0) 未置 isPaused=true → paused 标志为 %s，"
                           "传输栏按钮仍显示 ❚❚、无高亮（状态不一致）" % (labels, got, clk["paused"]))
        else:
            r["detail"] = "按钮=%s；timeScale 实测=%s；暂停生效" % (labels, got)

    with h.check(REC, "S1-16", SEC, "日期跳转：2000-01-01 12:00 UTC → JD 2451545.0（Meeus 基准，§9）") as r:
        h.js(page, "engine.setPaused(true); return null")
        page.fill("#time-jump", "2000-01-01 12:00")
        page.click(".jump button >> nth=0")
        page.wait_for_timeout(400)
        jd = h.clock(page)["jd"]
        shown = page.inner_text(".time-readout")
        assert abs(jd - 2451545.0) < 1e-6, "JD=%.6f" % jd
        assert "2000-01-01" in shown, "readout=%s" % shown
        r["detail"] = "输入 '2000-01-01 12:00' → JD=%.5f（期望 2451545.0）；HUD=%s" % (jd, shown.replace("\n", " "))

    with h.check(REC, "S1-17", SEC, "日期跳转：1969-07-20（阿波罗 11 号）与 2035-01-01 均可跳转（§9）") as r:
        out = {}
        for text in ["1969-07-20", "2035-01-01", "2026-09-29", "JD 2461312.5"]:
            page.fill("#time-jump", text)
            page.click(".jump button >> nth=0")
            page.wait_for_timeout(250)
            out[text] = round(h.clock(page)["jd"], 4)
        assert abs(out["1969-07-20"] - 2440423.0) < 1e-6, out      # 1969-07-20 12:00 UTC
        assert abs(out["2035-01-01"] - 2464329.0) < 1e-6, out      # 2035-01-01 12:00 UTC
        assert abs(out["2026-09-29"] - 2461313.0) < 1e-6, out      # 2026-09-29 12:00 UTC
        assert abs(out["JD 2461312.5"] - 2461312.5) < 1e-6, out    # explicit JD
        r["detail"] = ("日期型输入按 12:00:00 UTC 解释（与设计图 2025-04-24 12:00:00 一致）；"
                       "实测 JD=%s；显式 JD/MJD 输入精确" % out)

    with h.check(REC, "S1-18", SEC, "非法日期被拒绝并提示，时间不变（§9）") as r:
        before = h.clock(page)["jd"]
        page.fill("#time-jump", "not-a-date")
        page.click(".jump button >> nth=0")
        page.wait_for_timeout(400)
        after = h.clock(page)["jd"]
        toast = page.locator(".toast").all_inner_texts()
        assert abs(after - before) < 1e-9, "clock changed on invalid input"
        assert any("无法识别" in t or "Unrecognised" in t for t in toast), "no error toast: %s" % toast
        h.shot(page, "s1_18_bad_date.png")
        r["detail"] = "输入 'not-a-date' → 时间不变，toast=%s" % toast

    with h.check(REC, "S1-19", SEC, "修改日期后全部主要天体重新计算位置（Test 10）") as r:
        def snapshot():
            return {b: h.describe(page, b)["heliocentricKm"] for b in
                    ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "pluto"]}
        h.set_jd(page, 2451545.0, 250)
        a = snapshot()
        h.set_jd(page, 2465000.0, 350)
        b = snapshot()
        moved = {k: math.dist((a[k]["x"], a[k]["y"], a[k]["z"]), (b[k]["x"], b[k]["y"], b[k]["z"])) / 1e6 for k in a}
        assert all(v > 0.1 for v in moved.values()), "some body did not move: %s" % moved
        r["detail"] = "J2000 → JD 2465000 位移/Mkm: " + ", ".join("%s=%.1f" % (k, v) for k, v in moved.items())

    with h.check(REC, "S1-20", SEC, "月球位置相对地球 ≈ 384 400 km（§17 真实轨道，非装饰）") as r:
        h.js(page, "engine.jumpToJulianDate(2451545.0); return null")
        vals = []
        for k in range(29):
            h.set_jd(page, 2451545.0 + k * 1.0, 60)
            vals.append(h.describe(page, "moon")["distanceFromParentKm"])
        r["detail"] = "一个朔望月内 地月距 %.0f–%.0f km（公开 356 500–406 700）" % (min(vals), max(vals))
        assert 350000 < min(vals) < 372000, "perigee off: %.0f" % min(vals)
        assert 398000 < max(vals) < 412000, "apogee off: %.0f" % max(vals)

    # ---------------------------------------------------------------- SCALE
    with h.check(REC, "S1-21", SEC, "三种尺度模式可切换，HUD 显示当前模式与增强/非线性提示（§12/Test 09）") as r:
        seq = [("科学尺度", "scientific"), ("科普尺度", "visible"), ("展览尺度", "exhibition")]
        seen = {}
        for label, mode in seq:
            page.click(".console .segmented[aria-label='尺度'] button:has-text('%s')" % label)
            page.wait_for_timeout(400)
            st = h.debug_state(page)
            chip = page.inner_text(".hud__top")
            warning = page.inner_text(".hud__bottom")
            seen[mode] = {"engine": st["scaleMode"], "labelShown": label in chip,
                          "enhancedWarn": "天体尺寸已视觉增强" in warning,
                          "nonLinearWarn": "非线性" in warning}
        assert seen["scientific"]["engine"] == "scientific", seen
        assert seen["visible"]["enhancedWarn"] and not seen["visible"]["nonLinearWarn"], seen
        assert seen["exhibition"]["enhancedWarn"] and seen["exhibition"]["nonLinearWarn"], seen
        h.shot(page, "s1_21_exhibition_scale.png")
        r["detail"] = json.dumps(seen, ensure_ascii=False)

    with h.check(REC, "S1-22", SEC, "科学尺度天体半径为真值（放大倍数=1），科普尺度为压缩幂律放大（§12 必须披露）") as r:
        h.js(page, "engine.selectBody('earth'); return null")
        page.wait_for_timeout(300)
        out = {}
        for mode in ["scientific", "visible", "exhibition"]:
            h.js(page, "engine.setScaleMode(arg); return null", mode)
            page.wait_for_timeout(500)
            d = h.describe(page, "earth")
            out[mode] = round(d["radiusMagnification"], 4)
        assert abs(out["scientific"] - 1.0) < 1e-6, out
        assert out["visible"] > 1 and out["exhibition"] > 1, out
        r["detail"] = "地球 radiusMagnification: %s（科学=真实 1.0；科普/展览为视觉增强）" % out

    with h.check(REC, "S1-23", SEC, "科学/科普尺度距离映射为真实线性（1 单位=1000 km），展览尺度为非线性（§12）") as r:
        h.js(page, "engine.jumpToJulianDate(2451545.0); engine.clearSelection(); engine.flyTo('earth'); return null")
        page.wait_for_timeout(2500)
        out = {}
        for mode in ["scientific", "visible", "exhibition"]:
            h.js(page, "engine.setScaleMode(arg); engine.clearSelection(); engine.flyTo('earth'); return null", mode)
            page.wait_for_timeout(1200)
            st = h.debug_state(page)
            assert st["trackedAbsoluteUnits"] is not None, "no tracked body in %s" % mode
            km = h.describe(page, "earth")["distanceFromSunKm"]
            # distanceFromSun in km is model-independent; check the scene mapping via absolute units
            absu = st["trackedAbsoluteUnits"]
            out[mode] = {"sceneUnits": round(math.dist(absu, [0, 0, 0]), 2), "km": round(km)}
        linear_err = abs(out["scientific"]["sceneUnits"] - out["scientific"]["km"] / 1000.0) / (out["scientific"]["km"] / 1000.0)
        r["detail"] = "地球日心位置（场景单位 / km）：%s；科学尺度线性误差=%.4f%%" % (
            {k: (v["sceneUnits"], v["km"]) for k, v in out.items()}, linear_err * 100)
        assert linear_err < 0.002, "scientific scale is not linear: %.5f" % linear_err
        assert out["scientific"]["sceneUnits"] != out["exhibition"]["sceneUnits"], "exhibition distance mapping identical to scientific"

    with h.check(REC, "S1-24", SEC, "切换尺度后相机视几何保持（可直观比较真实/科普差异，Test 09）") as r:
        h.js(page, "engine.clearSelection(); engine.flyTo('earth'); return null")
        page.wait_for_timeout(2500)
        page.click(".console .segmented[aria-label='尺度'] button:has-text('科学尺度')")
        page.wait_for_timeout(800)
        out = {}
        for mode in ["scientific", "visible", "exhibition"]:
            h.js(page, "engine.setScaleMode(arg); return null", mode)
            page.wait_for_timeout(600)
            h.js(page, "engine.clearSelection(); engine.flyTo('earth'); return null")
            page.wait_for_timeout(2200)
            page.evaluate("""() => { const e = window.__solarSystemEngine;
                const st = e.resolver.state('earth');
                e.cameraController.placeRelativeToTarget(st.absoluteUnits, 6); }""")
            page.wait_for_timeout(600)
            d = h.describe(page, "earth")
            out[mode] = {"projectedPx": round(d["projectedRadiusPixels"], 2),
                         "radiusUnits": round(d["radiusUnits"], 5),
                         "framingRatio": round(h.debug_state(page)["controllerFramingRatio"], 3)}
            h.shot(page, "s1_24_earth_%s.png" % mode)
        r["detail"] = ("把相机固定在『地球 6 个半径』处，比较同一视角下的投影半径：%s。"
                       "科学尺度下地球几乎为亚像素，科普/展览尺度被显著放大 → 观众可直观比较真实与增强尺度（Test 09）"
                       % json.dumps(out, ensure_ascii=False))
        assert out["visible"]["projectedPx"] > out["scientific"]["projectedPx"] * 3, out
        assert out["visible"]["radiusUnits"] != out["scientific"]["radiusUnits"], out

    with h.check(REC, "S1-25", SEC, "默认展开的左侧天体列表是否遮挡 HUD 时间传输栏（§29/§33 触摸可用性）") as r:
        if page.locator(".sidebar").count() == 0:
            page.click(".hud__top .chip--button:has-text('天体列表')")
            page.wait_for_timeout(500)
        hits = page.evaluate("""() => {
          const out = [];
          document.querySelectorAll('.transport button').forEach((b) => {
            const q = b.getBoundingClientRect();
            const el = document.elementFromPoint(q.left + q.width/2, q.top + q.height/2);
            out.push({ label: (b.innerText||'').trim(), covered: !(el === b || b.contains(el)),
                       top: el ? el.className : null });
          });
          return out;
        }""")
        covered = [x for x in hits if x["covered"]]
        sidebar = page.evaluate("() => { const s = document.querySelector('.sidebar'); return s ? getComputedStyle(s).display : 'absent'; }")
        if covered:
            r["status"] = "FAIL"
            r["detail"] = ("侧栏默认展开（display=%s）并以 z-index 覆盖传输按钮：%s → 时间前进/后退/暂停/倒放按钮无法点击，"
                           "展览现场默认状态下无法操作时间" % (sidebar, hits))
        else:
            r["detail"] = "传输按钮全部可点击：%s" % hits

    with h.check(REC, "S1-26", SEC, "全新会话默认状态：选中末开启层的小天体，信息面板数值为伪造（0 km）") as r:
        ctx2 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1400, "height": 800})
        page2 = ctx2.new_page()
        h.boot(page2)
        probe = page2.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          const i = 0;
          const rec0 = engine.describeMinorBody(i).record;
          engine.selectMinorBody(i);
          const d = engine.describeMinorBody(i);
          return {
            name: rec0.name, q: rec0.perihelionDistanceAu, Q: rec0.aphelionDistanceAu,
            x: d.heliocentricKm.x, y: d.heliocentricKm.y, z: d.heliocentricKm.z,
            distSun: d.distanceFromSunKm, speed: d.speedKmS,
            minorVisible: engine.statistics().minorBodiesInCloud,
          };
        }""")
        page2.wait_for_timeout(1500)
        panel = page2.inner_text(".inspector") if page2.locator(".inspector").count() else ""
        h.shot(page2, "s1_26_minor_fabricated.png")
        ctx2.close()
        assert probe["distSun"] == 0, "minor readout was not zero: %s" % probe
        r["status"] = "FAIL"
        r["detail"] = ("新会话默认状态（小天体层关闭）下从列表/搜索选中 %s（真实 q=%.2f–Q=%.2f AU）："
                       "日心位置=(%g,%g,%g) km、距太阳=%g km、速度=%.0f km/s → 面板『当前模拟时间位置』为伪造值，"
                       "而非 '暂无可靠数据'。根因：Worker 仅在 minorVisible 时传播，minorItems 初值为 (0,0,0)；"
                       "面板片段=%s"
                       % (probe["name"], probe["q"] or 0, probe["Q"] or 0, probe["x"], probe["y"], probe["z"],
                          probe["distSun"], probe["speed"], panel.replace("\n", " ")[:120]))

    with h.check(REC, "S1-27", SEC, "开启小天体层后同一对象的位置恢复真实（对照 §26 禁止编造）") as r:
        h.js(page, "engine.setMinorBodiesVisible(true); return null")
        page.wait_for_timeout(3500)
        probe = page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          const d = engine.describeMinorBody(0);
          const au = 149597870.7;
          return { name: d.record.name, r: Math.hypot(d.heliocentricKm.x, d.heliocentricKm.y, d.heliocentricKm.z)/au,
                   q: d.record.perihelionDistanceAu, Q: d.record.aphelionDistanceAu, speed: d.speedKmS };
        }""")
        assert probe["q"] <= probe["r"] <= probe["Q"], probe
        r["detail"] = "%s 开启后天体层：日心距=%.3f AU ∈ [%.3f, %.3f]，速度=%.3f km/s（真实）" % (
            probe["name"], probe["r"], probe["q"], probe["Q"], probe["speed"])

    with h.check(REC, "S1-28", SEC, "选中态与相机跟踪态一致性：切换尺度后相机被重置为全景，但面板/HUD 仍显示已选中") as r:
        h.js(page, "engine.clearSelection(); engine.selectBody('earth'); engine.flyTo('earth'); return null")
        page.wait_for_timeout(2500)
        before = h.debug_state(page)
        page.click(".console .segmented[aria-label='尺度'] button:has-text('展览尺度')")
        page.wait_for_timeout(1200)
        after = h.debug_state(page)
        panel = page.inner_text(".inspector") if page.locator(".inspector").count() else ""
        hud = page.inner_text(".hud__top")
        mismatch = (before["cameraMode"] != "overview") and (after["cameraMode"] == "overview") and ("地球" in panel or "地球" in hud)
        r["detail"] = ("切换尺度前 cameraMode=%s tracked=%s；切换后 cameraMode=%s tracked=%s；"
                       "而信息面板仍渲染『%s』、HUD 锁定目标仍为地球=%s。引擎 setScaleMode 在 cameraController.trackedId 为空时调用 "
                       "frameOverview() 并把 engine.trackedId 置空，但 store.selectedId 不变 → 相机已离开目标而界面仍宣称已选中"
                       % (before["cameraMode"], before["trackedId"], after["cameraMode"], after["trackedId"],
                          panel.split(chr(10))[0][:20], "锁定目标 地球" in hud.replace(chr(10), " ")))
        if mismatch:
            r["status"] = "WARN"

    ctx.close()
    browser.close()

REC.save()
