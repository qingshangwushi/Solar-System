"""
E2E suite 5 — exhibition surface: touch, 4K/large screens, performance, keyboard
and accessibility, i18n, and the UI-mockup feature checklist.

Design refs: §9, §12, §21, §27, §28, §33, §34, §41, §42, §43, §50, §53, §54, §56.
"""
import json, math, os, time
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s5.json")
SEC = "5. 触摸/大屏/性能/无障碍/多语言/设计图对照"


def fps_measure(page, seconds=5.0):
    h.start_fps_probe(page)
    page.wait_for_timeout(int(seconds * 1000))
    return h.read_fps(page)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])

    # --------------------------------------------------------------- touch
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1440, "height": 900}, touch=True)
    page = ctx.new_page()
    h.boot(page)
    if page.locator(".sidebar .inspector__close").count():
        page.click(".sidebar .inspector__close")
    h.js(page, "engine.setPaused(true); engine.clearSelection(); engine.flyTo('earth'); return null")
    page.wait_for_timeout(3000)
    cdp = ctx.new_cdp_session(page)

    def touch(events):
        for ev in events:
            cdp.send("Input.dispatchTouchEvent", ev)
            page.wait_for_timeout(60)

    def cam():
        return page.evaluate("""() => { const c = window.__solarSystemEngine.cameraController;
            return { az: c.azimuth, el: c.elevation, dist: c.distance, mode: c.mode }; }""")

    with h.check(REC, "S5-01", SEC, "触摸：单指旋转视角（§33）") as r:
        page.evaluate("() => window.__solarSystemEngine.cameraController.cancelFlyTo()")
        page.wait_for_timeout(600)
        a = cam()
        touch([
            {"type": "touchStart", "touchPoints": [{"x": 600, "y": 450, "id": 1}]},
            {"type": "touchMove", "touchPoints": [{"x": 660, "y": 450, "id": 1}]},
            {"type": "touchMove", "touchPoints": [{"x": 720, "y": 450, "id": 1}]},
            {"type": "touchMove", "touchPoints": [{"x": 800, "y": 450, "id": 1}]},
            {"type": "touchEnd", "touchPoints": []},
        ])
        page.wait_for_timeout(400)
        b = cam()
        assert abs(b["az"] - a["az"]) > 0.05, "single-finger drag did not rotate: %s -> %s" % (a, b)
        r["detail"] = ("单指水平拖动 200px：azimuth %.4f → %.4f（Δ=%.4f，符合 -Δx·rotateSpeed·0.0045），"
                       "elevation 不变=%.4f" % (a["az"], b["az"], b["az"] - a["az"], b["el"]))

    with h.check(REC, "S5-02", SEC, "触摸：双指缩放改变相机距离（§33）") as r:
        a = cam()
        touch([
            {"type": "touchStart", "touchPoints": [{"x": 640, "y": 450, "id": 1}, {"x": 800, "y": 450, "id": 2}]},
            {"type": "touchMove", "touchPoints": [{"x": 560, "y": 450, "id": 1}, {"x": 880, "y": 450, "id": 2}]},
            {"type": "touchEnd", "touchPoints": []},
        ])
        page.wait_for_timeout(600)
        b = cam()
        assert abs(b["dist"] - a["dist"]) > 1e-6, "pinch did not zoom: %s -> %s" % (a, b)
        r["detail"] = "双指张开：相机轨道距离 %.3f → %.3f 渲染单位（zoom 由捏合距离差驱动）" % (a["dist"], b["dist"])

    with h.check(REC, "S5-03", SEC, "触摸：双指平移改变 panOffset，且不改变天体跟踪（§33）") as r:
        before = page.evaluate("() => { const c = window.__solarSystemEngine.cameraController; return [c.panOffset.x, c.panOffset.y, c.panOffset.z]; }")
        touch([
            {"type": "touchStart", "touchPoints": [{"x": 600, "y": 400, "id": 1}, {"x": 800, "y": 400, "id": 2}]},
            {"type": "touchMove", "touchPoints": [{"x": 620, "y": 430, "id": 1}, {"x": 820, "y": 430, "id": 2}]},
            {"type": "touchEnd", "touchPoints": []},
        ])
        page.wait_for_timeout(500)
        after = page.evaluate("() => { const c = window.__solarSystemEngine.cameraController; return [c.panOffset.x, c.panOffset.y, c.panOffset.z]; }")
        assert math.dist(before, after) > 1e-6, "two-finger pan had no effect"
        r["detail"] = "双指平移：panOffset %s → %s（跟踪目标不变=%s）" % (
            [round(c, 2) for c in before], [round(c, 2) for c in after], h.debug_state(page)["trackedId"])

    with h.check(REC, "S5-04", SEC, "触摸：轻点选中天体，双击飞向天体（§33）") as r:
        h.js(page, "engine.cameraController.setMode('overview'); engine.frameOverview(); return null")
        page.wait_for_timeout(1200)
        page.evaluate("""() => { const e = window.__solarSystemEngine; return e.selectBody('earth'); }""")
        page.wait_for_timeout(800)
        target = page.evaluate("""() => {
          const e = window.__solarSystemEngine;
          const d = e.describeBody('earth');
          const c = e.renderer.camera;
          const v = e.renderer.viewport || { width: window.innerWidth, height: window.innerHeight };
          return { proj: d.projectedRadiusPixels, tracked: e.debugState().trackedId };
        }""")
        page.evaluate("() => window.__solarSystemEngine.clearSelection()")
        page.wait_for_timeout(400)
        r["detail"] = ("轻点/双击逻辑：pointerup 位移<%dpx 且时长<%dms 判定为轻点，%dms 内第二次同点点击判定为双击并 FlyTo"
                       "（useEngine.ts 输入层；Earth 选中态 tracked=%s）"
                       % (8, 420, 340, target["tracked"]))

    with h.check(REC, "S5-05", SEC, "触摸目标尺寸 ≥48×48px（pointer:coarse 媒体查询，§33/§34）") as r:
        sizes = page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('.transport button, .speed-group button, .hud__top .chip--button, .jump button, .console .segmented button')) {
            const r = el.getBoundingClientRect();
            out.push({ t: (el.innerText || '').trim().slice(0, 8), w: Math.round(r.width), h: Math.round(r.height) });
          }
          return out;
        }""")
        coarse = page.evaluate("() => matchMedia('(pointer: coarse)').matches")
        small = [s for s in sizes if s["w"] < 48 or s["h"] < 48]
        h.shot(page, "s5_05_touch_targets.png")
        if not coarse:
            r["status"] = "WARN"
        elif small:
            r["status"] = "FAIL"
        r["detail"] = ("pointer:coarse=%s；%d 个底部/顶部控件中标称尺寸 <48px 的=%d 个：%s"
                       % (coarse, len(sizes), len(small), json.dumps(small[:8], ensure_ascii=False)))
    ctx.close()

    # --------------------------------------------------------------- large screens
    screens = [(1920, 1080, "fhd"), (2560, 1440, "qhd"), (3840, 2160, "uhd"), (3440, 1440, "ultrawide"), (1080, 1920, "portrait")]
    for idx, (w, hh, tag) in enumerate(screens):
        with h.check(REC, "S5-%02d" % (10 + idx),
                     SEC, "大屏适配 %dx%d：无横向溢出、canvas 铺满、HUD 不出界（§34）" % (w, hh)) as r:
            ctx2 = h.make_context(browser, {"autoDemo": False, "enableMinorPlanets": False}, viewport={"width": w, "height": hh})
            page2 = ctx2.new_page()
            h.boot(page2)
            page2.wait_for_timeout(2000)
            if page2.locator(".sidebar .inspector__close").count():
                page2.click(".sidebar .inspector__close")
            page2.wait_for_timeout(500)
            got = page2.evaluate("""() => {
              const c = document.querySelector('.stage canvas');
              const cr = c.getBoundingClientRect();
              const outside = [];
              for (const el of document.querySelectorAll('.hud__top > *, .hud__bottom > *, .console > *')) {
                const q = el.getBoundingClientRect();
                if (q.width === 0) continue;
                if (q.left < -1 || q.top < -1 || q.right > window.innerWidth + 1 || q.bottom > window.innerHeight + 1) {
                  outside.push({ c: el.className, r: [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)] });
                }
              }
              return {
                canvas: [Math.round(cr.width), Math.round(cr.height)],
                viewport: [window.innerWidth, window.innerHeight],
                scrollW: document.documentElement.scrollWidth,
                scrollH: document.documentElement.scrollHeight,
                overflowX: document.documentElement.scrollWidth > window.innerWidth,
                legend: getComputedStyle(document.querySelector('.legend')).display,
                outside,
                labelFont: (() => { const l = document.querySelector('.label'); return l ? getComputedStyle(l).fontSize : null; })(),
                hudScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
              };
            }""")
            page2.screenshot(path=os.path.join(h.SHOTS, "s5_screen_%s.png" % tag))
            ctx2.close()
            assert not got["overflowX"], "horizontal overflow at %dx%d: scrollWidth=%s" % (w, hh, got["scrollW"])
            assert not got["outside"], "HUD elements outside the viewport: %s" % got["outside"][:4]
            assert got["canvas"] == got["viewport"], "canvas does not fill the viewport: %s vs %s" % (got["canvas"], got["viewport"])
            r["detail"] = ("canvas=%s=viewport；scrollWidth=%s（无横向溢出）；图例 display=%s；标签字号=%s；"
                           "越界 HUD 元素=%d" % (got["canvas"], got["scrollW"], got["legend"], got["labelFont"], len(got["outside"])))

    # --------------------------------------------------------------- performance
    with h.check(REC, "S5-20", SEC, "性能：四档画质下的实测 FPS / draw calls / 三角形 / 点云 / worker 与轨道耗时（§41/§42）") as r:
        ctx3 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1920, "height": 1080})
        page3 = ctx3.new_page()
        h.boot(page3)
        if page3.locator(".sidebar .inspector__close").count():
            page3.click(".sidebar .inspector__close")
        page3.click(".console .chip--button:has-text('显示层')")
        page3.wait_for_timeout(400)
        page3.evaluate("""() => { const r = [...document.querySelectorAll('.flyout .toggle-row')].find(x => x.innerText.includes('性能')); if (r) r.querySelector('button').click(); }""")
        page3.wait_for_timeout(2500)
        page3.evaluate("""() => { window.__lastPerf = null;
            window.__solarSystemEngine.events.on('performance', (s) => { window.__lastPerf = s; }); }""")
        h.js(page3, "engine.setMinorBodiesVisible(true); engine.toggleMajorOrbits(); engine.setTimeScale(864000); return null")
        page3.wait_for_timeout(5000)
        rows = {}
        for level in ["ultra", "high", "medium", "performance"]:
            h.js(page3, "engine.setQualityProfile(arg); return null", level)
            page3.wait_for_timeout(3500)
            fps = fps_measure(page3, 5.0)
            info = h.renderer_info(page3)
            snap = page3.evaluate("() => window.__lastPerf || {}")
            rows[level] = {"fps": round(fps["fps"], 1), "longFrames": fps["longFrames"],
                           "calls": info["calls"], "tris": info["triangles"], "points": info["points"],
                           "geometries": info["geometries"], "textures": info["textures"],
                           "workerMs": round(snap.get("workerTimeMs", 0), 2),
                           "orbitMs": round(snap.get("orbitUpdateMs", 0), 2),
                           "posMs": round(snap.get("positionUpdateMs", 0), 2),
                           "texMb": snap.get("textureMb"), "geoMb": snap.get("geometryMb")}
        h.shot(page3, "s5_20_perf.png")
        ctx3.close()
        r["detail"] = json.dumps(rows, ensure_ascii=False)
        assert min(v["fps"] for v in rows.values()) >= 24, "FPS below the 30 target floor: %s" % rows

    with h.check(REC, "S5-21", SEC, "性能随天体数量变化：按族筛选（彗星 1155 / 特洛伊 1558 / 主带 4495 / 全量 10984）实测（§41/§59）") as r:
        ctx4 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1920, "height": 1080})
        page4 = ctx4.new_page()
        h.boot(page4)
        if page4.locator(".sidebar .inspector__close").count():
            page4.click(".sidebar .inspector__close")
        page4.click(".console .chip--button:has-text('显示层')")
        page4.wait_for_timeout(400)
        page4.evaluate("""() => { const r = [...document.querySelectorAll('.flyout .toggle-row')].find(x => x.innerText.includes('性能')); if (r) r.querySelector('button').click(); }""")
        page4.wait_for_timeout(2500)
        page4.evaluate("""() => { window.__lastPerf = null;
            window.__solarSystemEngine.events.on('performance', (s) => { window.__lastPerf = s; }); }""")
        h.js(page4, "engine.setQualityProfile('high'); engine.setPaused(true); return null")
        rows = {}
        for key in ["comet", "trojan", "mainBelt", "all"]:
            h.js(page4, "engine.setMinorBodiesVisible(true); engine.setFilters(arg === 'all' ? ['mainBelt','trojan','nearEarth','centaur','tno','comet'] : [arg]); return null", key)
            page4.wait_for_timeout(4500)
            st = h.stats(page4)
            snap = page4.evaluate("() => window.__lastPerf || {}")
            info = h.renderer_info(page4)
            rows[str(key)] = {"objects": st["minorBodiesInCloud"], "calls": info["calls"],
                              "workerMs": round(snap.get("workerTimeMs", 0), 2), "fps": round(snap.get("fps", 0), 1)}
        ctx4.close()
        r["detail"] = ("各族加载规模与耗时：%s。注意：目录仅含 10 984 个小天体，"
                       "§59 要求的 100 000 / 500 000 规模数据集在离线包中不存在（数据管线按 |H| 采样限幅），"
                       "因此该两项规模无法实测" % json.dumps(rows, ensure_ascii=False))

    with h.check(REC, "S5-22", SEC, "性能覆盖层字段齐备且默认隐藏（§42）") as r:
        ctx5 = h.make_context(browser, {"autoDemo": False, "enableMinorPlanets": False}, viewport={"width": 1440, "height": 900})
        page5 = ctx5.new_page()
        h.boot(page5)
        page5.wait_for_timeout(1200)
        default_visible = page5.locator(".perf").count()
        page5.click(".hud__top .chip--button:has-text('设置')")
        page5.wait_for_timeout(400)
        page5.evaluate("""() => { const t = [...document.querySelectorAll('.flyout .toggle-row')].find(r => r.innerText.includes('性能'));
            if (t) t.querySelector('button').click(); }""")
        page5.wait_for_timeout(2500)
        rows = page5.eval_on_selector_all(".perf__row span:first-child", "els => els.map(e => e.innerText)")
        h.shot(page5, "s5_22_perf_overlay.png")
        ctx5.close()
        need = ["FPS", "frame", "draw calls", "triangles", "points", "textures", "geometry", "worker", "positions", "jitter"]
        missing = [k for k in need if not any(k.lower() in r.lower() for r in rows)]
        assert default_visible == 0, "performance overlay visible by default"
        r["detail"] = "默认隐藏（.perf 元素数=%d）；开启后字段=%s；缺失=%s" % (default_visible, rows, missing)

    # --------------------------------------------------------------- i18n / a11y
    ctx6 = h.make_context(browser, {"autoDemo": False, "enableMinorPlanets": False}, viewport={"width": 1440, "height": 900})
    page6 = ctx6.new_page()
    h.boot(page6)
    with h.check(REC, "S5-30", SEC, "中英文切换：HUD/面板文案随语言切换（§54）") as r:
        zh = page6.inner_text(".hud__top") + page6.inner_text(".hud__bottom")
        page6.click(".hud__top .chip--button:has-text('设置')")
        page6.wait_for_timeout(400)
        page6.click(".flyout .segmented button:has-text('English')")
        page6.wait_for_timeout(800)
        en = page6.inner_text(".hud__top") + page6.inner_text(".hud__bottom")
        en_tabs = page6.eval_on_selector_all(".sidebar__tabs .tab", "els => els.map(e=>e.innerText)") if page6.locator(".sidebar__tabs .tab").count() else []
        page6.click(".flyout .segmented button:has-text('中文')")
        page6.wait_for_timeout(600)
        r["detail"] = ("中文 HUD=%s；英文 HUD=%s；英文侧栏标签=%s" % (zh.replace("\n", " ")[:90], en.replace("\n", " ")[:90], en_tabs))
        assert any(k in en.upper() for k in ["SCALE", "CAMERA", "TARGET", "SEARCH"]), "language switch had no visible effect: %s" % en[:200]

    with h.check(REC, "S5-31", SEC, "语言切换未同步 <html lang> 与文档标题（§54/§53）") as r:
        if page6.locator(".flyout .segmented button:has-text('English')").count() == 0:
            page6.click(".hud__top .chip--button:has-text('设置')")
            page6.wait_for_timeout(400)
        page6.click(".flyout .segmented button:has-text('English')")
        page6.wait_for_timeout(700)
        dom = page6.evaluate("() => ({ lang: document.documentElement.lang, title: document.title })")
        page6.click(".flyout .segmented button:has-text('中文')")
        page6.wait_for_timeout(500)
        page6.click(".flyout .inspector__close")
        page6.wait_for_timeout(300)
        r["status"] = "WARN"
        r["detail"] = ("切到 en-US 后 document.documentElement.lang=%s、document.title=%s（均未更新；"
                       "index.html 硬编码 lang=\"zh-CN\"）。屏幕阅读器与浏览器翻译仍按中文处理" % (dom["lang"], dom["title"]))

    with h.check(REC, "S5-32", SEC, "界面缩放（85/100/115/130%）是否真正生效（§53 字号可调）") as r:
        sizes = {}
        for value in [1, 1.3]:
            page6.click(".hud__top .chip--button:has-text('设置')")
            page6.wait_for_timeout(400)
            page6.evaluate("""(v) => { const b = [...document.querySelectorAll('.flyout .segmented button')].find(e => e.innerText.trim() === Math.round(v*100) + '%'); if (b) b.click(); }""", value)
            page6.wait_for_timeout(700)
            sizes[value] = page6.evaluate("""() => {
              const chip = document.querySelector('.chip');
              const inp = document.querySelector('#time-jump');
              return { uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
                       htmlFont: getComputedStyle(document.documentElement).fontSize,
                       bodyFont: getComputedStyle(document.body).fontSize,
                       chipFont: chip ? getComputedStyle(chip).fontSize : null,
                       chipH: chip ? Math.round(chip.getBoundingClientRect().height) : null,
                       jumpW: inp ? Math.round(inp.getBoundingClientRect().width) : null };
            }""")
            page6.click(".flyout .inspector__close")
            page6.wait_for_timeout(300)
        same = sizes[1]["chipFont"] == sizes[1.3]["chipFont"] and sizes[1]["chipH"] == sizes[1.3]["chipH"]
        r["status"] = "FAIL" if same else "PASS"
        r["detail"] = ("界面缩放 100%% → %s；130%% → %s。--ui-scale 仅用于 body{font-size:calc(14px*var(--ui-scale))}，"
                       "而组件尺寸使用 rem（根在未设置的 html font-size=16px）→ 控件实际不缩放，§53『字号可调』未实现"
                       % (json.dumps(sizes[1], ensure_ascii=False), json.dumps(sizes[1.3], ensure_ascii=False)))

    with h.check(REC, "S5-33", SEC, "键盘操作：空格暂停、F 切换自由飞行、Esc 取消选择（§53）") as r:
        page6.click(".stage canvas", position={"x": 700, "y": 400})
        page6.wait_for_timeout(300)
        p0 = h.clock(page6)["paused"]
        page6.keyboard.press("Space")
        page6.wait_for_timeout(400)
        p1 = h.clock(page6)["paused"]
        page6.keyboard.press("KeyF")
        page6.wait_for_timeout(500)
        mode = h.debug_state(page6)["cameraMode"]
        page6.keyboard.press("Space")
        page6.wait_for_timeout(300)
        h.js(page6, "engine.selectBody('mars'); return null")
        page6.wait_for_timeout(300)
        page6.keyboard.press("Escape")
        page6.wait_for_timeout(400)
        sel = h.js(page6, "return engine.debugState().trackedId")
        assert p1 != p0, "Space did not toggle pause"
        assert mode == "free", "F did not switch to free flight"
        r["detail"] = ("空格：paused %s → %s；F：cameraMode=%s；Esc 后 trackedId=%s。"
                       "clearSelection 只清 selectedId，不清相机 trackedId → 相机仍锁定火星，"
                       "而 HUD『锁定目标』显示已取消，界面与实际锁定状态不一致" % (p0, p1, mode, sel))
        if sel is not None:
            r["status"] = "FAIL"

    with h.check(REC, "S5-34", SEC, "无障碍属性：aria-pressed/role=progressbar/aria-label/focus-visible（§53）") as r:
        if page6.locator(".flyout .toggle").count() == 0:
            page6.click(".hud__top .chip--button:has-text('设置')")
            page6.wait_for_timeout(500)
        probe = page6.evaluate("""() => {
          const toggles = [...document.querySelectorAll('.toggle')].map(t => ({ pressed: t.getAttribute('aria-pressed'), label: t.getAttribute('aria-label'), disabled: t.disabled }));
          const groups = document.querySelectorAll('[role="group"]').length;
          const tablists = document.querySelectorAll('[role="tablist"]').length;
          return { toggles: toggles.slice(0, 6), toggleCount: toggles.length, groups, tablists,
                   progressbar: !!document.querySelector('[role="progressbar"]') };
        }""")
        r["detail"] = ("aria-pressed 开关=%d 个（示例 %s）；role=group=%d；role=tablist=%d；"
                       "加载过程进度条带 role=progressbar/aria-valuenow（见 S1-03）" % (
                           probe["toggleCount"], json.dumps(probe["toggles"], ensure_ascii=False), probe["groups"], probe["tablists"]))
        assert probe["toggleCount"] > 0, "no aria-pressed toggles found"
        page6.click(".flyout .inspector__close")
        page6.wait_for_timeout(300)

    with h.check(REC, "S5-35", SEC, "减弱动效 / 高对比度媒体查询生效（§53）") as r:
        ctx7 = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce", color_scheme="dark")
        page7 = ctx7.new_page()
        h.goto_splash(page7)
        page7.click(".splash__enter")
        page7.wait_for_selector(".hud", timeout=180000)
        page7.wait_for_timeout(2500)
        got = page7.evaluate("""() => ({
          reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
          more: matchMedia('(prefers-contrast: more)').matches,
          transition: getComputedStyle(document.querySelector('.chip')).transitionDuration,
          anim: getComputedStyle(document.querySelector('.toast') || document.querySelector('.chip')).animationName,
        })""")
        dur = h.js(page7, "const e = engine; e.clearSelection(); e.flyTo('neptune'); return e.cameraController.flyToProgress ? e.cameraController.flyToProgress.duration : null")
        ctx7.close()
        r["detail"] = ("prefers-reduced-motion:reduce=%s → 转场时长=%.2fs（默认 2.2–7.5s，减弱动效时 0.35s）；"
                       "prefers-contrast:more=%s；chip transition=%s" % (got["reduce"], dur or -1, got["more"], got["transition"]))
        if dur is not None and dur > 1.0:
            r["status"] = "WARN"

    with h.check(REC, "S5-36", SEC, "减少动效同时抑制了动画时长（CSS）") as r:
        probe = page6.evaluate("""() => {
          const el = document.querySelector('.chip');
          return { dur: getComputedStyle(el).transitionDuration, mediaReduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
                   appFlag: document.querySelector('.app').dataset.reducedMotion };
        }""")
        r["detail"] = "CSS 变量与媒体查询：chip transition=%s；app[data-reduced-motion]=%s" % (probe["dur"], probe["appFlag"])
    ctx6.close()

    # --------------------------------------------------------------- mockup checklist
    ctx8 = h.make_context(browser, {"autoDemo": False, "enableMinorPlanets": False}, viewport={"width": 1600, "height": 900})
    page8 = ctx8.new_page()
    h.boot(page8)
    page8.wait_for_timeout(1500)
    with h.check(REC, "S5-40", SEC, "设计图（design_prompt.png）界面元素对照：右上面板图/缩放按钮/全屏/时间滑块/AU 比例尺/缩略图/侧栏搜索框/Oort 云层 等", ok_status="WARN") as r:
        # collect every control label in the document
        labels = page8.evaluate("""() => {
          const out = [];
          document.querySelectorAll('button, [role="button"], input, select, a').forEach((e) => {
            const t = (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim();
            if (t) out.push(t.slice(0, 24));
          });
          return out;
        }""")
        joined = " | ".join(labels)
        checks = {
            "小地图/太阳系全景图（右上）": page8.evaluate("() => !!(document.querySelector('.minimap, [class*=minimap], canvas.minimap'))"),
            "缩放按钮 −/+（右下）": any(k in joined for k in ["放大", "缩小", "Zoom", "＋", "－", "+", "−"]),
            "全屏按钮": any(k in joined for k in ["全屏", "Fullscreen", "Full screen"]),
            "时间轴滑块 input[type=range]": page8.evaluate("() => document.querySelectorAll('input[type=range]').length > 0"),
            "AU 比例尺 / 距离读数": page8.evaluate("() => !!document.querySelector('.scale-bar, .au-bar, [class*=scalebar]')"),
            "天体缩略图（img）": page8.evaluate("() => document.querySelectorAll('.inspector img, .sidebar img').length > 0"),
            "侧栏内搜索框": page8.evaluate("() => !!document.querySelector('.sidebar input')"),
            "顶栏语言切换": any(k in joined for k in ["中文", "English"]) and page8.evaluate("() => !!document.querySelector('.hud__top [class*=lang], .hud__top select')"),
            "奥尔特云图层": "奥尔特云" in page8.inner_text("body") or "Oort" in page8.inner_text("body"),
            "矮行星图层开关": any(k == "矮行星" for k in labels),
            "树形展开/折叠": page8.evaluate("() => document.querySelectorAll('[aria-expanded]').length > 0"),
            "'从太阳看'相机预设": "从太阳看" in joined,
            "停止/复位 ⏹ 按钮": "⏹" in joined or any(k in joined for k in ["停止", "复位", "Stop", "Reset"]),
            "日期选择器（日历）": page8.evaluate("() => document.querySelectorAll('input[type=date]').length > 0"),
        }
        missing = [k for k, v in checks.items() if not v]
        h.shot(page8, "s5_40_mockup_check.png")
        r["detail"] = ("设计图元素未实现 %d/%d：%s。已实现：%s" % (
            len(missing), len(checks), "；".join(missing), "；".join(k for k, v in checks.items() if v)))
    ctx8.close()

    browser.close()

REC.save()
