from playwright.sync_api import sync_playwright
import sys, json
sys.path.insert(0,'/tmp/sse2e')
import h
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,args=h.CHROME_ARGS+["--headless=new"])
    ctx=h.make_context(b,{"autoDemo":False},viewport={"width":1600,"height":900})
    page=ctx.new_page()
    h.boot(page)
    h.js(page,"engine.clearSelection(); engine.flyTo('moon'); return null")
    page.wait_for_timeout(3500)
    print(json.dumps(page.evaluate("""() => {
      const btn=document.querySelector('.inspector .inspector__close');
      if(!btn) return {none:true};
      const r=btn.getBoundingClientRect();
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      const stack=document.elementsFromPoint(cx,cy).slice(0,6).map(e=>({c:e.className||e.tagName, z:getComputedStyle(e).zIndex, pe:getComputedStyle(e).pointerEvents}));
      const ins=document.querySelector('.inspector');
      const ir=ins.getBoundingClientRect();
      return {rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],
              inspector:[Math.round(ir.left),Math.round(ir.top),Math.round(ir.right),Math.round(ir.bottom)],
              stack, labels: document.querySelectorAll('.label').length,
              topAtCenter: (()=>{const e=document.elementFromPoint(cx,cy); return e? (e.className||e.tagName):null;})()};
    }"""), ensure_ascii=False))
    ctx.close(); b.close()
