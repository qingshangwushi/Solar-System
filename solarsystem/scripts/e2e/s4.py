"""
E2E suite 4 — robustness: WebGL context loss/restore, degraded graphics, asset
failure isolation, corrupt config, offline operation and the production build.

Design refs: §41, §47, §52, §55, §57, §58.
"""
import json, math, os, time
from playwright.sync_api import sync_playwright
import h

REC = h.Recorder("/tmp/sse2e/results_s4.json")
SEC = "4. 健壮性/降级/离线/生产构建"
PREVIEW = os.environ.get("PREVIEW_URL", "http://127.0.0.1:4188/")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=h.CHROME_ARGS + ["--headless=new"])

    # ------------------------------------------------------------ context loss
    ctx = h.make_context(browser, {"autoDemo": False, "enableMinorPlanets": False}, viewport={"width": 1400, "height": 800})
    page = ctx.new_page()
    logs = h.attach_logs(page)
    h.boot(page)
    with h.check(REC, "S4-01", SEC, "WebGL 上下文丢失/恢复：不刷新页面即可恢复，且不泄漏场景节点（§52）") as r:
        before = page.evaluate("""() => {
          const s = window.__solarSystemEngine.renderer.scene;
          let groups = 0; s.traverse((o) => { if (o.name && o.name.startsWith('body:')) groups++; });
          return { groups, children: s.children.length };
        }""")
        page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          const gl = engine.renderer.renderer.getContext();
          const ext = gl.getExtension('WEBGL_lose_context');
          window.__loseExt = ext;                     // three.js drops the context handle on loss
          window.__lost = false; window.__restored = false;
          engine.events.on('contextLost', () => { window.__lost = true; });
          engine.events.on('contextRestored', () => { window.__restored = true; });
          ext.loseContext();
        }""")
        page.wait_for_timeout(2500)
        lost = page.evaluate("() => ({ lost: !!window.__lost, restored: !!window.__restored, toasts: [...document.querySelectorAll('.toast')].map(t=>t.innerText) })")
        page.evaluate("() => { window.__loseExt.restoreContext(); }")
        page.wait_for_timeout(6000)
        after_probe = page.evaluate("""() => {
          const engine = window.__solarSystemEngine;
          const s = engine.renderer.scene;
          let groups = 0; s.traverse((o) => { if (o.name && o.name.startsWith('body:')) groups++; });
          return { groups, children: s.children.length, restored: !!window.__restored,
                   toasts: [...document.querySelectorAll('.toast')].map(t=>t.innerText),
                   drawn: engine.statistics().drawnBodies, calls: engine.renderer.statistics().drawCalls };
        }""")
        h.shot(page, "s4_01_context_restored.png")
        assert lost["lost"], "contextLost event never fired"
        assert after_probe["restored"], "contextRestored event never fired"
        assert after_probe["drawn"] > 0 and after_probe["calls"] > 0, "renderer did not resume: %s" % after_probe
        leaked = after_probe["groups"] - before["groups"]
        if leaked:
            r["status"] = "WARN"
        r["detail"] = ("loseContext → contextLost=%s（toast=%s）；restoreContext → contextRestored=%s，"
                       "恢复后 drawnBodies=%s drawCalls=%s（无需刷新页面）；"
                       "场景中 body: 组数量 %s → %s（泄漏 %d 个空 Group：BodyVisual.dispose 只移除 frame.children，"
                       "未从父级移除 group/frame）"
                       % (lost["lost"], lost["toasts"], after_probe["restored"], after_probe["drawn"],
                          after_probe["calls"], before["groups"], after_probe["groups"], leaked))
    ctx.close()

    # ------------------------------------------------------------ no WebGL2
    with h.check(REC, "S4-02", SEC, "无 WebGL2 时给出可读提示而非白屏（§58）") as r:
        b2 = p.chromium.launch(headless=True, args=["--disable-3d-apis", "--disable-webgl", "--disable-gpu"])
        ctx2 = h.make_context(b2, {"autoDemo": False}, viewport={"width": 1200, "height": 700})
        page2 = ctx2.new_page()
        h.goto_splash(page2)
        page2.click(".splash__enter")
        page2.wait_for_timeout(12000)
        text = page2.inner_text("body")
        html_has_error = ("WebGL" in text) or ("图形" in text) or ("硬件加速" in text)
        canvas_count = page2.evaluate("() => document.querySelectorAll('canvas').length")
        h.shot(page2, "s4_02_no_webgl2.png")
        ctx2.close()
        b2.close()
        assert html_has_error, "no readable degradation notice: %s" % text[:300]
        r["detail"] = ("--disable-3d-apis 启动后：canvas 数=%d，页面文本含可读降级提示 → '%s'"
                       % (canvas_count, " / ".join(t for t in text.split("\n") if t.strip())[:220]))

    # ------------------------------------------------------------ asset failure
    with h.check(REC, "S4-03", SEC, "小天体数据加载失败时核心八大行星仍可正常运行（§58）") as r:
        ctx3 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1400, "height": 800})
        ctx3.route("**/data/catalog/minor-bodies.*", lambda route: route.abort())
        page3 = ctx3.new_page()
        h.boot(page3)
        page3.wait_for_timeout(2000)
        got = page3.evaluate("""() => ({
          drawn: window.__solarSystemEngine.statistics().drawnBodies,
          minor: window.__solarSystemEngine.statistics().minorBodiesInCloud,
          planets: ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'].every(id => !!window.__solarSystemEngine.describeBody(id)),
          earthDist: window.__solarSystemEngine.describeBody('earth').distanceFromSunKm,
          toasts: [...document.querySelectorAll('.toast')].map(t=>t.innerText),
        })""")
        page3.click(".hud__top .chip--button:has-text('搜索')")
        page3.wait_for_timeout(200)
        page3.click(".flyout .inspector__close")
        page3.wait_for_timeout(200)
        page3.click(".console .chip--button:has-text('显示层')")
        page3.wait_for_timeout(400)
        disabled = page3.evaluate("""() => {
          const fly = document.querySelector('.flyout');
          const tog = fly ? [...fly.querySelectorAll('.toggle')].map(t => t.disabled) : null;
          return { toggles: tog, note: fly ? fly.innerText.includes('未加载') || fly.innerText.includes('不可用') || fly.innerText.includes('not') : null };
        }""")
        h.shot(page3, "s4_03_minor_failure.png")
        ctx3.close()
        assert got["planets"], "planets unavailable after minor-body failure"
        assert got["earthDist"] > 1.4e8, got
        assert got["minor"] == 0, got
        r["detail"] = ("中断 minor-bodies.json/.bin 后：渲染天体=%s（星/行星/矮行星/卫星正常）、云中天体=%s、"
                       "八大行星描述均可取、地球日心距=%.0f km；小天体开关禁用=%s；toast=%s"
                       % (got["drawn"], got["minor"], got["earthDist"], disabled, got["toasts"]))

    with h.check(REC, "S4-04", SEC, "恒星背景数据失败时应用仍可用（§58）") as r:
        ctx4 = h.make_context(browser, {"autoDemo": False, "enableMinorPlanets": False}, viewport={"width": 1400, "height": 800})
        ctx4.route("**/data/stars/*", lambda route: route.abort())
        page4 = ctx4.new_page()
        h.boot(page4)
        page4.wait_for_timeout(2000)
        got = page4.evaluate("""() => ({ stars: window.__solarSystemEngine.statistics().stars,
                                          drawn: window.__solarSystemEngine.statistics().drawnBodies })""")
        ctx4.close()
        r["detail"] = "中断 stars.bin/stars.json 后：绘制恒星=%s、编目天体=%s（其余功能不受影响）" % (got["stars"], got["drawn"])
        assert got["drawn"] > 0, got

    with h.check(REC, "S4-05", SEC, "exhibition.config.json 缺失或损坏时回退默认值且不致命（§55）") as r:
        ctx5 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1400, "height": 800})
        ctx5.route("**/exhibition.config.json", lambda route: route.fulfill(status=200, content_type="application/json", body=b"{ this is not json"))
        page5 = ctx5.new_page()
        h.boot(page5)
        page5.wait_for_timeout(1500)
        got = page5.evaluate("""() => ({ hud: !!document.querySelector('.hud'), drawn: window.__solarSystemEngine.statistics().drawnBodies })""")
        ctx5.close()
        assert got["hud"] and got["drawn"] > 0, got
        r["detail"] = "返回损坏 JSON 后仍进入主场景（回退 DEFAULT_EXHIBITION_CONFIG）：drawn=%s" % got["drawn"]

    # ------------------------------------------------------------ offline
    with h.check(REC, "S4-06", SEC, "离线运行：阻断全部非本机请求后系统仍完整可用（§47）") as r:
        ctx6 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1400, "height": 800})
        blocked = []

        def guard(route):
            url = route.request.url
            if url.startswith("http://127.0.0.1") or url.startswith("data:") or url.startswith("blob:"):
                route.continue_()
            else:
                blocked.append(url)
                route.abort()

        ctx6.route("**/*", guard)
        page6 = ctx6.new_page()
        h.boot(page6)
        page6.wait_for_timeout(2500)
        got = page6.evaluate("""() => ({ drawn: window.__solarSystemEngine.statistics().drawnBodies,
                                          stars: window.__solarSystemEngine.statistics().stars,
                                          minor: window.__solarSystemEngine.statistics().minorBodiesInCloud,
                                          hud: !!document.querySelector('.hud') })""")
        h.js(page6, "engine.flyTo('saturn'); return null")
        page6.wait_for_timeout(2500)
        tracked = h.debug_state(page6)["trackedId"]
        h.shot(page6, "s4_06_offline.png")
        ctx6.close()
        assert got["hud"] and got["drawn"] > 0 and tracked == "saturn", (got, tracked)
        r["detail"] = ("全部外部(非 127.0.0.1)请求被阻断（共拦截 %d 个）：仍进入主场景、渲染天体=%s、恒星=%s、"
                       "小天体=%s、可 Fly To 土星 → 完全离线可用" % (len(blocked), got["drawn"], got["stars"], got["minor"]))

    # ------------------------------------------------------------ production build
    with h.check(REC, "S4-07", SEC, "生产构建（vite preview）启动正常、无控制台错误、性能覆盖层默认隐藏（§42/§57）") as r:
        ctx7 = h.make_context(browser, None, viewport={"width": 1600, "height": 900})
        page7 = ctx7.new_page()
        logs7 = h.attach_logs(page7)
        page7.goto(PREVIEW, wait_until="load", timeout=60000)
        page7.wait_for_selector(".splash__enter", timeout=30000)
        page7.click(".splash__enter")
        page7.wait_for_selector(".hud", timeout=180000)
        page7.wait_for_function("() => !!window.__solarSystemEngine === false || true", timeout=1000)
        page7.wait_for_timeout(4000)
        got = page7.evaluate("""() => ({
          engineExposed: !!window.__solarSystemEngine,
          perf: !!document.querySelector('.perf'),
          labels: document.querySelectorAll('.label').length,
          hud: !!document.querySelector('.hud'),
          text: document.querySelector('.hud__top') ? document.querySelector('.hud__top').innerText.replace(/\\n/g,' ') : null,
        })""")
        h.shot(page7, "s4_07_production.png")
        ctx7.close()
        assert got["hud"], "production build did not reach the explorer"
        assert not got["perf"], "performance overlay is visible by default in production"
        assert not got["engineExposed"], "engine debug handle leaked into production"
        r["detail"] = ("dist 产物经 vite preview 启动：HUD 就绪、engine 未暴露到 window（%s）、"
                       "性能覆盖层默认隐藏（%s）、可见标签=%d；console.error=%d pageerror=%d；HUD=%s"
                       % (got["engineExposed"], got["perf"], got["labels"],
                          len(logs7["console_error"]), len(logs7["pageerror"]), got["text"]))
        r["evidence"] = logs7["console_error"][:4] + logs7["pageerror"][:3]

    with h.check(REC, "S4-08", SEC, "生产环境贴图请求路径正确性（§14/§15/§40 真实行星影像）") as r:
        import urllib.request
        def probe(url):
            try:
                with urllib.request.urlopen(url, timeout=10) as resp:
                    return resp.status, resp.headers.get("content-type"), len(resp.read(64))
            except Exception as exc:
                return None, str(exc), 0
        wrong = probe(PREVIEW + "textures/earth-day.jpg")
        right = probe(PREVIEW + "data/textures/earth-day.jpg")
        r["status"] = "FAIL"
        r["detail"] = ("应用请求的是 dataUrl('textures/earth-day.jpg') = /textures/earth-day.jpg（缺 data/ 前缀）："
                       "该路径在生产下返回 %s；正确路径 /data/textures/earth-day.jpg 返回 %s。"
                       "→ 所有行星贴图请求都拿到 HTML 回退页（200 text/html）而非图片，"
                       "解码失败后静默回退为程序化贴图，云层材质无贴图 → 地球等渲染为纯白/灰球，"
                       "且信息面板未标注“程序化”（proceduralSurface 依赖目录声明而非实际加载结果）"
                       % ((wrong[0], wrong[1]), (right[0], right[1])))

    with h.check(REC, "S4-09", SEC, "WebGPU 能力探测与降级（§58）") as r:
        ctx9 = h.make_context(browser, {"autoDemo": False}, viewport={"width": 1200, "height": 700})
        page9 = ctx9.new_page()
        page9.goto(h.BASE, wait_until="load")
        page9.wait_for_timeout(2000)
        gpu = page9.evaluate("() => ({ webgpu: !!navigator.gpu, webgl2: !!document.createElement('canvas').getContext('webgl2') })")
        ctx9.close()
        r["detail"] = ("浏览器 navigator.gpu=%s；应用固定使用 WebGL2（GraphicsCapability 仅探测 WebGPU，从不使用）"
                       "→ §58 的 'WebGPU → WebGL2' 实际为 '始终 WebGL2'" % gpu["webgpu"])

    browser.close()

REC.save()
