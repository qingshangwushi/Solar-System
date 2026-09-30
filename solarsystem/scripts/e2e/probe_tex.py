from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0,'/tmp/sse2e')
import h, json
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,args=h.CHROME_ARGS+["--headless=new"])
    ctx=h.make_context(b,{"autoDemo":False},viewport={"width":1200,"height":700})
    page=ctx.new_page()
    log=[]
    page.on("response", lambda r: log.append(("resp", r.status, r.url)) if ("texture" in r.url or ".jpg" in r.url or ".png" in r.url) else None)
    page.on("requestfailed", lambda r: log.append(("failed", r.failure, r.url)))
    h.boot(page)
    if page.locator(".sidebar .inspector__close").count(): page.click(".sidebar .inspector__close")
    h.js(page,"engine.setQualityProfile('high'); engine.setPaused(true); engine.flyTo('earth'); return null")
    page.wait_for_timeout(9000)
    print(json.dumps([l for l in log if 'texture' in l[2] or '.jpg' in l[2]], indent=1)[:3000])
    print("counts:", len(log))
    ctx.close(); b.close()
