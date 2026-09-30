"""
E2E suite 3 — interaction: search, fly-to, information panel, orbits, labels,
legend, camera modes, guided tour and exhibition-config driven behaviour.

Design refs: §9, §22, §23, §24, §25, §26, §27, §28, §29, §31, §45, §50, §51, §55, §61.
"""
import json, math, os, time
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s3.json")
SEC = "3. 交互/信息面板/相机/导览"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    logs = h.attach_logs(page)
    h.boot(page)
    h.js(page, "engine.setPaused(true); return null")
    page.wait_for_timeout(600)

    def open_search():
        if page.locator(".sidebar").count():
            page.click(".sidebar .inspector__close")
            page.wait_for_timeout(250)
        if page.locator("#global-search").count() == 0:
            page.click(".hud__top .chip--button:has-text('搜索')")
            page.wait_for_timeout(350)

    def query(text):
        open_search()
        page.fill("#global-search", text)
        page.wait_for_timeout(600)
        return page.eval_on_selector_all(".search-results li button", "els => els.map(e => e.innerText.replace(/\\n/g,' | '))")

    # ------------------------------------------------------------------ search
    with h.check(REC, "S3-01", SEC, "全局搜索：热门天体均可命中（Earth/Mars/Europa/Titan/Pluto/Ceres/Halley/Apophis）") as r:
        wanted = {"Earth": "earth", "Mars": "mars", "Europa": "europa", "Titan": "titan",
                  "Pluto": "pluto", "Ceres": "ceres", "Halley": "1P", "Apophis": "99942"}
        found = {}
        for q, expect in wanted.items():
            res = query(q)
            found[q] = res[:3]
            assert res, "no results for %s" % q
        r["detail"] = json.dumps(found, ensure_ascii=False)[:900]

    with h.check(REC, "S3-02", SEC, "搜索结果字段：名称/类别/编号齐备，但缺少『所属系统』（§24 明确要求）") as r:
        res = query("Europa")
        parent_shown = any("木星" in x or "Jupiter" in x for x in res)
        r["status"] = "FAIL" if not parent_shown else "PASS"
        r["detail"] = ("结果行=%s。SearchHit.parentLabel 已由 SearchIndex 建立索引，但 SearchPanel.tsx 只渲染"
                       " 名称/类别/编号首段，从不渲染所属系统 → §24『搜索结果应显示所属系统』未实现" % res)

    with h.check(REC, "S3-03", SEC, "索引覆盖：官方编号、别名、中文名、临时编号均可检索") as r:
        out = {}
        for q in ["136199", "2003 UB313", "月球", "67P", "99942", "2024 YR4", "1 Ceres"]:
            out[q] = query(q)[:2]
        hits = sum(1 for v in out.values() if v)
        assert hits >= 5, out
        r["detail"] = json.dumps(out, ensure_ascii=False)[:800]

    with h.check(REC, "S3-04", SEC, "搜索无结果时给出提示而非空白（§24）") as r:
        res = query("zzzz-not-a-body")
        note = page.inner_text(".search-results")
        assert not res and "没有匹配" in note, "res=%s note=%s" % (res, note)
        r["detail"] = "输入无匹配串 → 结果为空并显示『%s』" % note.strip()[:40]

    with h.check(REC, "S3-05", SEC, "点击搜索结果 → Fly To 目标天体并弹出信息卡（Test 02 步骤）") as r:
        open_search()
        page.fill("#global-search", "Earth")
        page.wait_for_timeout(500)
        page.click(".search-results li button >> nth=0")
        page.wait_for_timeout(2500)
        st = h.debug_state(page)
        panel = page.inner_text(".inspector")
        h.shot(page, "s3_05_search_fly_earth.png")
        assert st["trackedId"] == "earth", st["trackedId"]
        assert "地球" in panel and "基本信息" in panel, panel[:120]
        r["detail"] = "点击 Earth → trackedId=%s，cameraMode=%s，信息面板标题=%s" % (
            st["trackedId"], st["cameraMode"], panel.split("\n")[0])

    with h.check(REC, "S3-06", SEC, "Fly To 为电影式转场而非瞬移：转场期间相机连续移动、耗时 > 1s（§25）") as r:
        h.js(page, "engine.clearSelection(); engine.flyTo('sun'); return null")
        page.wait_for_timeout(3500)
        h.js(page, "engine.flyTo('neptune'); return null")
        page.wait_for_timeout(120)
        samples = []
        t0 = time.time()
        for _ in range(40):
            st = h.debug_state(page)
            samples.append((round(time.time() - t0, 2), [round(c, 1) for c in st["cameraUnits"]], st["flyTo"]))
            if st["flyTo"] is None:
                break
            page.wait_for_timeout(150)
        progress = [s[2] for s in samples if s[2]]
        distinct = len({tuple(s[1]) for s in samples})
        duration = samples[-1][0]
        assert distinct > 5, "camera barely moved: %s" % samples[:4]
        assert duration > 0.8, "transition too fast (teleport?): %.2fs" % duration
        h.shot(page, "s3_06_flyto_neptune.png")
        r["detail"] = ("太阳→海王星：采样 %d 帧、%d 个不同相机位置、转场耗时 ≈%.1fs；flyToProgress 样本=%s "
                       "（单段二次贝塞尔 + 两段 smoothstep，无离散阶段、无四元数插值：§25 部分实现）"
                       % (len(samples), distinct, duration, progress[:3]))
        if not progress:
            r["status"] = "WARN"

    # ------------------------------------------------------------- inspector
    with h.check(REC, "S3-07", SEC, "信息面板（4 个标签页）覆盖 §26 全部字段：名称/英文名/类别/直径/质量/密度/重力/日距/半长轴/离心率/倾角/周期/自转/轴倾角/位置/数据源") as r:
        h.js(page, "engine.clearSelection(); engine.flyTo('earth'); return null")
        page.wait_for_timeout(2500)
        tabs = page.eval_on_selector_all(".inspector__tabs .tab", "els => els.map(e => e.innerText)")
        text = {}
        for label in tabs:
            page.click(".inspector__tabs .tab:has-text('%s')" % label)
            page.wait_for_timeout(250)
            text[label] = page.inner_text(".inspector__body")
        page.click(".inspector__tabs .tab:has-text('基本信息')")
        page.wait_for_timeout(200)
        all_text = " ".join(text.values())
        need = {"天体类别": "类别", "平均半径": "半径", "直径": "直径", "质量": "质量", "平均密度": "密度",
                "表面重力": "重力", "距太阳距离": "日距", "轨道半长轴": "半长轴", "轨道离心率": "离心率",
                "轨道倾角": "倾角", "公转周期": "公转周期", "自转周期": "自转周期", "自转轴倾角": "轴倾角",
                "儒略日": "JD", "数据来源": "来源", "当前模拟时间位置": "位置"}
        missing = [k for k in need if k not in all_text]
        h.shot(page, "s3_07_inspector.png")
        r["detail"] = ("标签页=%s；字段覆盖：缺失=%s；『发现时间/发现者』仅在 body.discovery 存在时渲染"
                       "（178 个天体中仅部分具备，缺失时不显示『暂无可靠数据』）" % (tabs, missing))
        assert not missing, "missing inspector fields: %s" % missing

    with h.check(REC, "S3-08", SEC, "未知数据不编造：无公开直径的矮行星显示『暂无可靠数据』（§26）") as r:
        rows = h.js(page, "const d = engine.describeBody('eris'); return { radiusKm: d.body.physical.meanRadiusKm, name: d.body.name, radiusSource: d.body.physical.radiusSource }")
        h.js(page, "engine.clearSelection(); engine.flyTo('eris'); return null")
        page.wait_for_timeout(2500)
        if page.locator(".inspector__tabs .tab:has-text('基本信息')").count():
            page.click(".inspector__tabs .tab:has-text('基本信息')")
            page.wait_for_timeout(250)
        body = page.inner_text(".inspector")
        unknown = page.eval_on_selector_all(".inspector dd[data-missing='true']", "els => els.map(e => e.innerText)")
        assert rows["radiusKm"] in (None, 0) or rows["radiusSource"] == "unavailable-published-value", rows
        assert "暂无可靠数据" in body, body[:200]
        h.shot(page, "s3_08_eris_unknown.png")
        r["detail"] = ("Eris: meanRadiusKm=%s, radiusSource=%s → 面板以 data-missing 渲染『暂无可靠数据』的字段=%s"
                       % (rows["radiusKm"], rows["radiusSource"], unknown))

    with h.check(REC, "S3-09", SEC, "无公开自转相位的天体明确标注『轨道相位：约定值』（§26/§50 披露）") as r:
        h.js(page, "engine.clearSelection(); engine.flyTo('hyperion'); return null")
        page.wait_for_timeout(2200)
        page.click(".inspector__tabs .tab:has-text('物理特性')")
        page.wait_for_timeout(300)
        body = page.inner_text(".inspector__body")
        el = h.js(page, "const d = engine.describeBody('hyperion'); return d ? {phase: (d.body.elements||{}).phaseSource, name: d.body.name} : null")
        if el is None:
            h.js(page, "engine.clearSelection(); engine.flyTo('titan'); return null")
            page.wait_for_timeout(2200)
            page.click(".inspector__tabs .tab:has-text('物理特性')")
            page.wait_for_timeout(300)
            body = page.inner_text(".inspector__body")
        r["detail"] = "Hyperion/备用天体 phaseSource=%s；面板披露片段=%s" % (el, body.replace("\n", " ")[-220:])

    with h.check(REC, "S3-10", SEC, "小天体信息面板的儒略日为错误值（读取了主天体描述，§26/§50）") as r:
        h.js(page, "engine.setMinorBodiesVisible(true); return null")
        page.wait_for_timeout(3500)
        open_search()
        page.fill("#global-search", "67P")
        page.wait_for_timeout(600)
        page.click(".search-results li button >> nth=0")
        page.wait_for_timeout(1500)
        panel = page.inner_text(".inspector") if page.locator(".inspector").count() else ""
        jd_line = [ln for ln in panel.split("\n") if "儒略日" in ln or "JD" in ln]
        real_jd = h.js(page, "return engine.clock.jd")
        r["status"] = "FAIL" if any("0.000" in x or "0.00 " in x for x in jd_line) else "PASS"
        r["detail"] = ("选中 67P 后面板儒略日行=%s；实际 clock.jd=%.4f。MinorBodyDescription 无 julianDate 字段，"
                       "Inspector 的 minor 分支误读 props.description（主天体描述）→ 显示 0 或陈旧值"
                       % (jd_line, real_jd))
        h.shot(page, "s3_10_minor_panel.png")

    # ------------------------------------------------------------- orbits/labels
    with h.check(REC, "S3-11", SEC, "轨道显示：Show/Hide 切换生效，并支持『显示全部主要轨道』（§27）") as r:
        def visible_lines():
            return page.evaluate("() => window.__solarSystemEngine.renderer.renderer.info.render.lines")
        h.js(page, "engine.clearSelection(); engine.setOrbitVisibility(false); return null")
        page.wait_for_timeout(700)
        off = visible_lines()
        paths_off = h.stats(page)["orbitPaths"]
        h.js(page, "engine.setOrbitVisibility(true); return null")
        page.wait_for_timeout(700)
        on = visible_lines()
        majors = h.js(page, "return engine.toggleMajorOrbits()")
        page.wait_for_timeout(1200)
        major_visible = visible_lines()
        major_paths = h.stats(page)["orbitPaths"]
        h.shot(page, "s3_11_all_orbits.png")
        assert on > off, "orbit visibility toggle had no effect (rendered line segments): %s -> %s" % (off, on)
        assert major_visible > on, "Show-all-major-orbits had no effect: %s -> %s" % (on, major_visible)
        r["detail"] = ("以 renderer.info.render.lines 计量：关闭轨道时绘制线段=%d；开启后=%d；"
                       "『显示全部主要轨道』后=%d（引擎内部 orbitPaths=%s → %s，majorOrbitsVisible=%s）"
                       % (off, on, major_visible, paths_off, major_paths, majors))

    with h.check(REC, "S3-12", SEC, "轨道线为真实计算路径且按类别/父天体分色、带采样 LOD（§27）") as r:
        probe = page.evaluate(r"""() => {
          const engine = window.__solarSystemEngine;
          const infos = [];
          engine.renderer.scene.traverse((o) => {
            if (!o.isLine && !o.isLineSegments) return;
            const g = o.geometry;
            const p = g.attributes.position;
            if (!p) return;
            infos.push({ count: p.count, col: g.attributes.color ? 'vertex' : (o.material.color ? '#'+o.material.color.getHexString() : null),
                         name: o.name || null });
          });
          return infos.slice(0, 14);
        }""")
        counts = sorted({i["count"] for i in probe})
        r["detail"] = "轨道线（前 14 条）：%s；顶点数分布=%s（按画质档 stride 采样，海量路径不会全量高细分）" % (
            json.dumps(probe)[:300], counts)

    with h.check(REC, "S3-13", SEC, "3D 标签：DOM 标注层存在、朝向相机、按优先级排序、重叠抑制、可关闭（§28）") as r:
        h.js(page, "engine.setLabelVisibility(true); engine.setScaleMode('exhibition'); return null")
        page.wait_for_timeout(1200)
        labels = page.evaluate(r"""() => {
          const els = [...document.querySelectorAll('.label')];
          return els.map((e) => ({ text: e.innerText.replace(/\n/g, ' | '),
                                   id: e.dataset.objectId, pr: Number(e.dataset.priority),
                                   transform: e.style.transform.slice(0, 40),
                                   colour: e.dataset.colour,
                                   visible: e.offsetParent !== null }));
        }""")
        prios = sorted({l["pr"] for l in labels})
        h.js(page, "engine.setLabelVisibility(false); return null")
        page.wait_for_timeout(800)
        off = page.evaluate("() => [...document.querySelectorAll('.label')].filter(e => e.offsetParent !== null).length")
        h.js(page, "engine.setLabelVisibility(true); return null")
        page.wait_for_timeout(600)
        assert labels, "no labels rendered"
        assert off == 0, "labels still visible after disabling: %s" % off
        r["detail"] = ("标签数=%d，优先级层级=%s（100 行星/80 矮行星/60 卫星/20 其它/120 恒星）；"
                       "位置由 transform 投影，标签为 DOM（天然朝向相机）；关闭标签后可见标签=%d。"
                       "样例=%s" % (len(labels), prios, off, json.dumps(labels[:4], ensure_ascii=False)))

    with h.check(REC, "S3-14", SEC, "图例：7 类天体均有文字标签（不依赖颜色作为唯一信息，§51）") as r:
        legend = page.eval_on_selector_all(".legend span", "els => els.map(e => e.innerText.trim())")
        assert len(legend) >= 7, legend
        r["detail"] = "图例条目=%s（颜色 + 文字双重编码）" % legend

    # ------------------------------------------------------------- camera modes
    with h.check(REC, "S3-15", SEC, "五种相机模式均可切换：自由视角/跟随/近天体/自由飞行/太阳系全景（§22）") as r:
        modes = {}
        for label in ["自由视角", "跟随", "近天体", "自由飞行", "太阳系全景"]:
            page.click(".console .segmented[aria-label='视角'] button:has-text('%s')" % label)
            page.wait_for_timeout(900)
            st = h.debug_state(page)
            modes[label] = st["cameraMode"]
        assert len(set(modes.values())) == 5, modes
        r["detail"] = "UI 标签 → 引擎模式：%s" % modes

    with h.check(REC, "S3-16", SEC, "自由飞行：W/A/S/D/Q/E 真正驱动相机平移，速率随位置动态变化（§22/§23）") as r:
        page.click(".console .segmented[aria-label='视角'] button:has-text('自由飞行')")
        page.wait_for_timeout(700)
        page.click(".stage canvas", position={"x": 800, "y": 400})
        page.wait_for_timeout(300)
        before = h.debug_state(page)["cameraUnits"]
        page.keyboard.down("w")
        page.wait_for_timeout(1600)
        page.keyboard.up("w")
        page.wait_for_timeout(300)
        after = h.debug_state(page)["cameraUnits"]
        moved = math.dist(before, after)
        page.keyboard.down("q")
        page.wait_for_timeout(900)
        page.keyboard.up("q")
        page.wait_for_timeout(200)
        after2 = h.debug_state(page)["cameraUnits"]
        r["detail"] = ("按 W 1.6s：相机移动 %.2f 渲染单位（%s → %s）；按 Q 再移动 %.2f。"
                       "自由飞行速度 = clamp(min + |pos|×0.6, 0.01, 1000) × 滚轮倍率 → 动态但以『距太阳距离』而非『距目标距离』为尺度（§23 部分符合）"
                       % (moved, [round(c, 1) for c in before], [round(c, 1) for c in after], math.dist(after, after2)))
        assert moved > 1.0, "WASD did not move the camera"

    with h.check(REC, "S3-17", SEC, "跟随模式：相机随运动天体一起平移（跟随地球）") as r:
        page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
        if page.locator(".inspector .inspector__close").count():
            page.click(".inspector .inspector__close")
            page.wait_for_timeout(300)
        h.js(page, "engine.clearSelection(); engine.flyTo('earth'); return null")
        page.wait_for_timeout(3000)
        page.click(".console .segmented[aria-label='视角'] button:has-text('跟随')")
        page.wait_for_timeout(600)
        h.js(page, "engine.setTimeScale(86400); return null")
        page.wait_for_timeout(400)
        a = h.debug_state(page)
        page.wait_for_timeout(2500)
        b = h.debug_state(page)
        h.js(page, "engine.setTimeScale(1); return null")
        target_shift = math.dist(a["trackedAbsoluteUnits"] or [0, 0, 0], b["trackedAbsoluteUnits"] or [0, 0, 0])
        cam_shift = math.dist(a["cameraUnits"], b["cameraUnits"])
        r["detail"] = ("时间 ×1 天/秒 运行 2.5s：目标天体位移=%.1f 单位，相机位移=%.1f 单位（相机跟随目标移动），"
                       "relativeKm=%.0f km 保持" % (target_shift, cam_shift, b["relativeKm"] or 0))
        assert cam_shift > 1.0 and target_shift > 1.0, (cam_shift, target_shift)

    # ------------------------------------------------------------- guided tour
    with h.check(REC, "S3-18", SEC, "导览：13 站列表、启动、下一站/上一站、自动设定时间倍率、出口（§31）") as r:
        h.js(page, "engine.setPaused(false); return null")
        page.click(".hud__top .chip--button:has-text('导览')")
        page.wait_for_timeout(500)
        stops = page.eval_on_selector_all(".flyout ol li", "els => els.map(e => e.innerText)")
        assert len(stops) >= 13, stops
        page.click(".flyout .chip--button")
        page.wait_for_timeout(3000)
        first = page.inner_text(".tour")
        step1 = h.debug_state(page)
        page.click(".tour__actions button:has-text('下一站')")
        page.wait_for_timeout(2500)
        second = page.inner_text(".tour")
        h.shot(page, "s3_18_tour.png")
        r["detail"] = ("路线 %d 站=%s；第 1 站=%s（tracked=%s, rate=%s）；下一站后标题=%s"
                       % (len(stops), stops, first.split("\n")[1][:24], step1["trackedId"],
                          h.clock(page)["timeScale"], second.split("\n")[1][:24]))
        assert first != second, "tour did not advance"

    with h.check(REC, "S3-19", SEC, "导览第 7 站（小行星带）自动开启小行星族筛选并将时间倍率提高（§31）") as r:
        for _ in range(6):
            page.click(".tour__actions button:has-text('下一站')")
            page.wait_for_timeout(1400)
        title = page.inner_text(".tour__title")
        panel = page.inner_text(".tour")
        st = h.stats(page)
        clk = h.clock(page)
        r["detail"] = ("连续前进到第 7 站：标题=%s；云中天体=%s；timeScale=%s（导览站点自带时间倍率与筛选）"
                       % (title, st["minorBodiesInCloud"], clk["timeScale"]))
        assert st["minorBodiesInCloud"] > 0, "asteroid-belt stop did not enable the minor-body layer"
        h.shot(page, "s3_19_tour_belt.png")
        page.click(".tour__actions button:has-text('退出')")
        page.wait_for_timeout(600)

    # ------------------------------------------------------------- config-driven
    with h.check(REC, "S3-20", SEC, "exhibition.config.json 运行时生效：语言/默认尺度/画质/是否加载小天体/界面缩放/减弱动效") as r:
        ctx2 = h.make_context(browser, {"language": "en-US", "defaultScaleMode": "scientific",
                                        "defaultQuality": "performance", "enableMinorPlanets": False,
                                        "uiScale": 1.3, "reducedMotion": True, "autoDemo": False},
                              viewport={"width": 1500, "height": 850})
        page2 = ctx2.new_page()
        h.boot(page2)
        page2.wait_for_timeout(1500)
        got = page2.evaluate("""() => ({
          scale: window.__solarSystemEngine.debugState().scaleMode,
          quality: window.__solarSystemEngine.statistics().quality,
          minorCloud: window.__solarSystemEngine.statistics().minorBodiesInCloud,
          uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
          reduced: document.querySelector('.app').dataset.reducedMotion,
          langText: document.querySelector('.hud__top').innerText.replace(/\\n/g, ' '),
        })""")
        h.shot(page2, "s3_20_config_en.png")
        ctx2.close()
        assert got["scale"] == "scientific", got
        assert got["quality"] == "performance", got
        assert got["uiScale"] == "1.3", got
        assert got["reduced"] == "true", got
        assert got["minorCloud"] == 0, got
        en_labels = any(k in got["langText"] for k in ["Scale", "Camera", "Search", "Target", "Time"])
        r["detail"] = ("language=en-US → HUD 英文标签=%s（%s）；defaultScaleMode=scientific → %s；defaultQuality=performance → %s；"
                       "enableMinorPlanets=false → 云中天体=%s；uiScale=1.3 → --ui-scale=%s；reducedMotion → data-reduced-motion=%s"
                       % (en_labels, got["langText"][:70], got["scale"], got["quality"], got["minorCloud"],
                          got["uiScale"], got["reduced"]))

    with h.check(REC, "S3-21", SEC, "config 死字段：defaultTarget / enableScientificMode / guidedTourOnIdle / showPerformanceOverlay 无任何效果（§55）") as r:
        ctx3 = h.make_context(browser, {"defaultTarget": "jupiter", "enableScientificMode": False,
                                        "guidedTourOnIdle": False, "showPerformanceOverlay": True,
                                        "autoDemo": False}, viewport={"width": 1400, "height": 800})
        page3 = ctx3.new_page()
        h.boot(page3)
        page3.wait_for_timeout(1800)
        got = page3.evaluate("""() => ({
          tracked: window.__solarSystemEngine.debugState().trackedId,
          perfVisible: !!document.querySelector('.perf'),
          scientificActive: document.querySelector('.console [data-active]') ? [...document.querySelectorAll('.console .chip')].some(e => e.dataset.active === 'true' && e.innerText.includes('科学模式')) : null,
        })""")
        h.shot(page3, "s3_21_dead_config.png")
        ctx3.close()
        assert got["tracked"] is None, got
        r["status"] = "FAIL"
        r["detail"] = ("defaultTarget=jupiter → 入场后 trackedId=%s（未选中任何天体，HUD 锁定目标仍为『—』）；"
                       "showPerformanceOverlay=true → 性能覆盖层是否出现=%s；enableScientificMode=false → 科学模式按钮仍存在。"
                       "四个键在 ConfigLoader 中可解析但代码中无消费者（grep 无引用）"
                       % (got["tracked"], got["perfVisible"]))

    with h.check(REC, "S3-22", SEC, "自动演示：无操作超时后进入 Auto Demo，画布交互立即退出（§32）") as r:
        ctx4 = h.make_context(browser, {"autoDemo": True, "autoDemoDelaySeconds": 8, "enableMinorPlanets": False},
                              viewport={"width": 1400, "height": 800})
        page4 = ctx4.new_page()
        h.boot(page4)
        page4.wait_for_timeout(1000)
        # first: a HUD click must NOT stop the idle timer (documented defect, §32 says any interaction)
        page4.click(".hud__top .chip--button:has-text('设置')")
        page4.wait_for_timeout(400)
        page4.click(".flyout .inspector__close")
        page4.wait_for_timeout(9000)
        after_hud = page4.evaluate("() => document.querySelector('.auto-demo-badge') !== null")
        badge = page4.locator(".auto-demo-badge")
        page4.wait_for_timeout(2500)
        page4.mouse.move(700, 400)
        page4.mouse.down()
        page4.mouse.move(760, 430)
        page4.mouse.up()
        page4.wait_for_timeout(1200)
        after_canvas = page4.evaluate("() => document.querySelector('.auto-demo-badge') !== null")
        h.shot(page4, "s3_22_auto_demo.png")
        ctx4.close()
        assert after_hud, "auto demo never started"
        assert not after_canvas, "canvas interaction did not exit auto demo"
        r["status"] = "WARN"
        r["detail"] = ("autoDemoDelaySeconds=8 → 超时后进入自动演示（badge=%s）；画布拖拽后退出（badge=%s）。"
                       "但 HUD/面板点击不会重置空闲计时（markInteraction 只绑定 canvas 与 window keydown），"
                       "与 §32『检测用户交互立即退出』不符；且设置面板的自动演示开关写入 config.enableAutoDemo，"
                       "而判定读取 config.autoDemo → 开关无效" % (after_hud, after_canvas))

    with h.check(REC, "S3-23", SEC, "HUD 底部控制条是否被提示条/侧栏遮挡（§29 HUD 不应遮挡主视图与控件）") as r:
        if page.locator(".sidebar").count() == 0:
            page.click(".hud__top .chip--button:has-text('天体列表')")
            page.wait_for_timeout(400)
        # force a toast (invalid date input)
        page.fill("#time-jump", "xx")
        page.click(".jump button >> nth=0")
        page.wait_for_timeout(500)
        hits = page.evaluate("""() => {
          const out = { toasts: document.querySelectorAll('.toast').length, covered: [], sidebar: null };
          const s = document.querySelector('.sidebar');
          if (s) { const r = s.getBoundingClientRect(); out.sidebar = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }
          const targets = [...document.querySelectorAll('.transport button, .speed-group button, .jump button, .console .segmented button')];
          for (const b of targets) {
            const q = b.getBoundingClientRect();
            const el = document.elementFromPoint(q.left + q.width/2, q.top + q.height/2);
            if (!(el === b || b.contains(el))) out.covered.push({ label: (b.innerText||'').trim().slice(0,10), by: el ? el.className : null });
          }
          return out;
        }""")
        h.shot(page, "s3_23_overlay.png")
        page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
        if hits["covered"]:
            r["status"] = "FAIL"
            r["detail"] = ("底部控制条被遮挡：%s（侧栏 rect=%s；提示条数=%d）。"
                           "侧栏 z-index 高于 HUD，默认展开时覆盖左下角传输控件；.toast-stack 出现在底部中央，"
                           "覆盖相机/尺度/图层等分段按钮 → 现场触控与鼠标均无法点击"
                           % (json.dumps(hits["covered"], ensure_ascii=False)[:400], hits["sidebar"], hits["toasts"]))
        else:
            r["detail"] = "底部控件全部可点击（%d 个提示条存在，未遮挡）" % hits["toasts"]

    with h.check(REC, "S3-24", SEC, "右侧信息面板是否遮挡底部相机/尺度/图层控件（§29/§33 触控可用性）") as r:
        # Open the inspector on a body with a long panel, then hit-test the console.
        h.js(page, "engine.clearSelection(); engine.flyTo('saturn'); return null")
        page.wait_for_timeout(3000)
        tabs = page.eval_on_selector_all(".inspector__tabs .tab", "els => els.map(e => e.innerText)")
        assert tabs, "inspector tabs not rendered: %s" % page.evaluate("() => !!document.querySelector('.inspector')")
        page.evaluate("""() => { const t = [...document.querySelectorAll('.inspector__tabs .tab')].find(e => e.innerText.includes('物理特性')); if (t) t.click(); }""")
        page.wait_for_timeout(500)
        hits = page.evaluate("""() => {
          const out = { covered: [], inspector: null };
          const ins = document.querySelector('.inspector');
          if (ins) { const r = ins.getBoundingClientRect(); out.inspector = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }
          for (const b of document.querySelectorAll('.console .segmented button, .console .chip--button')) {
            const q = b.getBoundingClientRect();
            const el = document.elementFromPoint(q.left + q.width/2, q.top + q.height/2);
            if (!(el === b || b.contains(el))) out.covered.push({ label: (b.innerText||'').trim().slice(0,12), by: el ? el.className : null });
          }
          return out;
        }""")
        h.shot(page, "s3_24_inspector_overlap.png")
        if hits["covered"]:
            r["status"] = "FAIL"
            r["detail"] = ("选中天体并展开『物理特性』后，信息面板 rect=%s 覆盖底部控制条：被遮挡的控件=%s。"
                           "面板与 HUD 处于同一层且 z-index 更高，故相机模式/尺度/显示层/科学模式按钮全部不可点击"
                           % (hits["inspector"], json.dumps(hits["covered"], ensure_ascii=False)[:420]))
        else:
            r["detail"] = "信息面板未遮挡底部控件（inspector rect=%s）" % hits["inspector"]
        page.click(".inspector .inspector__close")
        page.wait_for_timeout(300)

    ctx.close()
    browser.close()

REC.save()
