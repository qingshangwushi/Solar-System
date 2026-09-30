"""
E2E suite 7 — corrected re-verification of three cases whose first-pass result was
a harness artefact (star-layer parenting, LOD tiers, orbit show/hide).
"""
import json, math, os
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s7.json")
SEC = "7. 复核（修正测试方法）"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])
    ctx = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    h.boot(page)
    if page.locator(".sidebar .inspector__close").count():
        page.click(".sidebar .inspector__close")
    h.js(page, "engine.setPaused(true); engine.setQualityProfile('ultra'); return null")
    page.wait_for_timeout(2500)

    with h.check(REC, "S7-01", SEC, "复核(§21) 恒星背景层挂载于相机且不从场景根遍历（无视差）") as r:
        probe = page.evaluate(r"""() => {
          const e = window.__solarSystemEngine;
          const cam = e.renderer.camera;
          const kids = cam.children.map((c) => ({ type: c.type, isPoints: !!c.isPoints,
              count: c.geometry && c.geometry.attributes.position ? c.geometry.attributes.position.count : 0,
              frustumCulled: c.frustumCulled,
              depthTest: c.material ? c.material.depthTest : null,
              depthWrite: c.material ? c.material.depthWrite : null,
              renderOrder: c.renderOrder }));
          const inScene = cam.parent !== null;
          // does moving the camera change the star layer's local position?
          const before = cam.children.filter((c) => c.isPoints).map((c) => [c.position.x, c.position.y, c.position.z]);
          return { kids, cameraInScene: inScene, starLocalPos: before,
                   sceneChildren: e.renderer.scene.children.map((c) => c.name || c.type),
                   stars: e.statistics().stars };
        }""")
        star = [k for k in probe["kids"] if k["isPoints"] and k["count"] > 5000]
        assert star, "no star layer among the camera's children: %s" % probe["kids"]
        assert star[0]["frustumCulled"] is False, star[0]
        assert star[0]["depthTest"] is False, star[0]
        # camera translation must not move the layer (unit sphere at the camera)
        h.js(page, "engine.clearSelection(); engine.flyTo('neptune'); return null")
        page.wait_for_timeout(3000)
        after = page.evaluate(r"""() => {
          const cam = window.__solarSystemEngine.renderer.camera;
          const p = cam.children.find((c) => c.isPoints && c.geometry.attributes.position.count > 5000);
          return { local: [p.position.x, p.position.y, p.position.z], world: (() => { p.updateWorldMatrix(true, false);
                   const m = p.matrixWorld.elements; return [m[12], m[13], m[14]]; })(),
                   camPos: [cam.position.x, cam.position.y, cam.position.z],
                   stars: window.__solarSystemEngine.statistics().stars };
        }""")
        assert after["local"] == [0, 0, 0] and after["world"] == [0, 0, 0], after
        r["detail"] = ("恒星层是相机的子节点（相机本身不在场景图中，故 scene.traverse 看不到它——首轮 S2-08 因此误报）："
                       "点数=%d，frustumCulled=%s，depthTest=%s；飞到海王星后其世界坐标仍为 (0,0,0) 与相机重合 "
                       "→ 无视差，符合 §21『近似无限远』；场景根子节点=%s"
                       % (star[0]["count"], star[0]["frustumCulled"], star[0]["depthTest"], probe["sceneChildren"]))

    with h.check(REC, "S7-02", SEC, "复核(§39) LOD 按投影尺寸分级：远→point/low，近→standard/close") as r:
        rows = {}
        for ratio in [3000.0, 120.0, 30.0, 2.2]:
            h.js(page, "engine.clearSelection(); engine.flyTo('jupiter'); return null")
            page.wait_for_timeout(1800)
            page.evaluate(r"""(r) => {
              const e = window.__solarSystemEngine;
              const cc = e.cameraController;
              cc.cancelFlyTo();                       // otherwise the fly-to overrides the placement
              cc.setMode('orbit'); cc.trackedId = 'jupiter';
              const st = e.resolver.state('jupiter');
              cc.setTrackedRadius(st.radiusUnits);
              cc.placeRelativeToTarget(st.absoluteUnits, r);
            }""", ratio)
            page.wait_for_timeout(1400)
            d = h.describe(page, "jupiter")
            vis = page.evaluate("""() => { const e = window.__solarSystemEngine; const v = e.visuals.get('jupiter');
                return { tier: v.currentTier, mesh: v.mesh ? v.mesh.visible : null, marker: v.marker ? v.marker.visible : null,
                         children: v.frame.children.filter((c) => c.visible).map((c) => c.geometry ? c.geometry.type : c.type) }; }""")
            rows["ratio_%g" % ratio] = {"px": round(d["projectedRadiusPixels"], 2), "tier": vis["tier"],
                                        "meshVisible": vis["mesh"], "visibleParts": vis["children"]}
        tiers = [v["tier"] for v in rows.values()]
        assert len(set(tiers)) >= 3, rows
        assert tiers[0] in ("point", "low"), rows
        assert tiers[-1] == "close", rows
        assert "point" in tiers or "low" in tiers, rows
        r["detail"] = ("木星 LOD 分级（相机距离以天体半径倍数计）：%s → 四档 point/low/standard/close 由投影像素与"
                       "距离比共同决定，环/大气/云层仅在 close 档可见（首轮 S2-11 未取消 flyTo，导致距离未生效而误报）"
                       % json.dumps(rows, ensure_ascii=False))

    with h.check(REC, "S7-03", SEC, "复核(§27) 日心轨道 Show/Hide 与『显示全部主要轨道』生效；但卫星(母天体相对)轨道不受该开关控制") as r:
        def lines():
            return page.evaluate("""() => {
              const e = window.__solarSystemEngine;
              const info = []; e.renderer.scene.traverseVisible((o) => { if (o.isLine || o.isLineSegments) info.push(o.parent ? (o.parent.name || o.parent.type) : null); });
              return { segments: e.renderer.renderer.info.render.lines, lines: info.length,
                       parents: [...new Set(info)], paths: e.statistics().orbitPaths };
            }""")
        h.js(page, "engine.setMinorBodiesVisible(false); engine.clearSelection(); engine.setOrbitVisibility(true); return null")
        page.wait_for_timeout(1200)
        h.js(page, "engine.selectBody('earth'); return null")
        page.wait_for_timeout(1500)
        sel_on = lines()
        h.js(page, "engine.setOrbitVisibility(false); return null")
        page.wait_for_timeout(1200)
        sel_off = lines()
        h.js(page, "engine.setOrbitVisibility(true); engine.clearSelection(); return null")
        page.wait_for_timeout(1000)
        base = lines()
        major = h.js(page, "return engine.toggleMajorOrbits()")
        page.wait_for_timeout(1500)
        all_on = lines()
        h.js(page, "return engine.toggleMajorOrbits()")
        page.wait_for_timeout(1500)
        all_off = lines()
        # satellite (parent-relative) path - the case the toggle does NOT cover
        h.js(page, "engine.clearSelection(); engine.setOrbitVisibility(true); engine.selectBody('io'); return null")
        page.wait_for_timeout(2500)
        moon_on = lines()
        h.js(page, "engine.setOrbitVisibility(false); return null")
        page.wait_for_timeout(1500)
        moon_off = lines()
        h.js(page, "engine.setOrbitVisibility(true); return null")
        page.wait_for_timeout(600)
        assert sel_on["segments"] > 0 and sel_off["segments"] == 0, (sel_on, sel_off)
        assert all_on["paths"] > base["paths"] and all_off["segments"] == 0, (base, all_on, all_off)
        assert moon_off["segments"] == moon_on["segments"], "satellite path unexpectedly hidden: %s" % moon_off
        r["status"] = "FAIL"
        r["detail"] = ("(a) 日心轨道：选中地球 显示=%d 段 → 隐藏=%d 段（开关对日心路径有效）；"
                       "(b) 显示全部主要轨道：轨道数 %d → %d（开/关正确互斥，关后线段=0）；"
                       "(c) 卫星轨道（母天体相对，挂在 body:%s 组下）：显示=%d 段 → 『隐藏轨道』后仍为 %d 段 "
                       "→ OrbitRenderer.setVisible 只切换自身 orbits 组的可见性，而卫星/局部路径挂在母天体 group 上"
                       "（OrbitRenderer.ts:95 与 :157/:168；SolarSystemEngine.ts:909），因此该开关无法隐藏卫星轨迹"
                       % (sel_on["segments"], sel_off["segments"], base["paths"], all_on["paths"],
                          moon_on["parents"][0] if moon_on["parents"] else "?", moon_on["segments"], moon_off["segments"]))

    ctx.close()
    browser.close()

REC.save()
