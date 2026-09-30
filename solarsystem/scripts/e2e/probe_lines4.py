from playwright.sync_api import sync_playwright
import sys, json
sys.path.insert(0,'/tmp/sse2e')
import h
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,args=h.CHROME_ARGS+["--headless=new"])
    ctx=h.make_context(b,{"autoDemo":False},viewport={"width":1600,"height":900})
    page=ctx.new_page()
    h.boot(page)
    if page.locator(".sidebar .inspector__close").count(): page.click(".sidebar .inspector__close")
    h.js(page,"engine.setPaused(true); return null")
    page.wait_for_timeout(1500)
    def probe(tag):
        print(tag, json.dumps(page.evaluate("""() => {
          const e=window.__solarSystemEngine; const info=[];
          e.renderer.scene.traverseVisible(o=>{ if(o.isLine||o.isLineSegments) info.push({par:o.parent?(o.parent.name||o.parent.type):null, cnt:o.geometry.attributes.position.count}); });
          return {seg:e.renderer.renderer.info.render.lines, vis:info.length, pars:[...new Set(info.map(i=>i.par))], paths:e.statistics().orbitPaths};
        }"""), ensure_ascii=False))
    probe("fresh, no selection     :")
    h.js(page,"engine.selectBody('moon'); return null"); page.wait_for_timeout(2000)
    probe("moon selected           :")
    h.js(page,"engine.setOrbitVisibility(false); return null"); page.wait_for_timeout(1500)
    probe("moon selected, orbits OFF:")
    h.js(page,"engine.setOrbitVisibility(true); engine.clearSelection(); engine.selectBody('io'); return null"); page.wait_for_timeout(2500)
    probe("io selected             :")
    h.js(page,"engine.setOrbitVisibility(false); return null"); page.wait_for_timeout(1500)
    probe("io selected, orbits OFF :")
    h.js(page,"engine.setOrbitVisibility(true); return null"); page.wait_for_timeout(1000)
    # now toggle major orbits twice to see accumulation
    h.js(page,"return engine.toggleMajorOrbits()"); page.wait_for_timeout(1500); probe("major ON (1st)          :")
    h.js(page,"return engine.toggleMajorOrbits()"); page.wait_for_timeout(1500); probe("major OFF (2nd)         :")
    h.js(page,"return engine.toggleMajorOrbits()"); page.wait_for_timeout(1500); probe("major ON (3rd)          :")
    ctx.close(); b.close()
