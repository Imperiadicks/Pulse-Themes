// ============================================================================
// Main.js — Core Suite (v5.0.0, 600+ lines)
// Проект: SpotCol / ЯМу Desktop
//
// Цели:
//   • Максимально продуманный «ядро»-модуль, интегрирующийся с Open-Blocker.js,
//     эффектами фона, прозрачности, Colorize2, трек/DOM/handle-вотчерами,
//     горячими клавишами, экспортом/импортом настроек и диагностикой.
//   • Ничего не «ломает» в Theme/Library: мягкая интеграция, полная совместимость.
//   • Работает автономно, но: если в окне есть window.OpenBlocker — использует его.
//   • Дружелюбные API и CLI: window.MainSuite / Theme.MainSuite.
//
// Принципы:
//   • Любые значения читаем через settingsManager (если он есть), без «липких» дефолтов.
//   • Все стили — через <style id="…"> (чисто добавляем/удаляем).
//   • Watcher’ы — интервал + mutation + события плеера (устойчиво в Electron).
//
// Внешние точки:
//   • window.MainSuite  — публичный API ядра
//   • window.OpenBlocker — если подключён Open-Blocker.js (рекомендуется)
//   • window.Library     — для Colorize2 и обложек
//   • window.Theme       — для settingsManager и плеера
//
// Горячие клавиши (по умолчанию):
//   • Ctrl+Alt+O — переключить Open-Blocker global
//   • Ctrl+Alt+T — переключить Прозрачность
//   • Ctrl+Alt+B — включить/выключить фон
//   • Ctrl+Alt+F — FullVibe on/off
//   • Ctrl+Alt+Z — Zoom на обложку on/off
//   • Ctrl+Alt+D — открыть/закрыть Debug HUD
// ============================================================================

(() => {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────────
  // 0) Константы/служебные утилиты
  // ────────────────────────────────────────────────────────────────────────────
  const VERSION = '3.0.0';
  const NS = 'MainSuite';
  const LOG = '[Main]';

  const U = {
    now: () => Date.now(),
    isObj: (x) => x && typeof x === 'object' && !Array.isArray(x),
    isFn: (x) => typeof x === 'function',
    isStr: (x) => typeof x === 'string',
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    clamp(n, a, b) { return Math.max(a, Math.min(b, n)); },
    once(fn) { let d=false; return (...a)=>{ if(d) return; d=true; try{ return fn(...a);}finally{ d=true;} }; },
    throttle(fn, ms) {
      let t=0, timer=null, pending=null;
      return (...a) => {
        const now=U.now(); const left=ms-(now-t);
        if (left<=0) { t=now; fn(...(pending||a)); pending=null; }
        else { pending=a; if(!timer){ timer=setTimeout(()=>{ t=U.now(); timer=null; fn(...(pending||[])); pending=null; }, left); } }
      };
    },
    debounce(fn, ms){ let h=null; return (...a)=>{ clearTimeout(h); h=setTimeout(()=>fn(...a), ms); }; },
    deepGet(obj, path, def){
      try { return String(path).split('.').reduce((o,p)=>o?.[p], obj) ?? def; } catch { return def; }
    },
    deepSet(obj, path, val){
      const parts = String(path).split('.'); let cur=obj;
      for(let i=0;i<parts.length-1;i++){ const p=parts[i]; if(!U.isObj(cur[p])) cur[p]={}; cur=cur[p]; }
      cur[parts[parts.length-1]] = val; return obj;
    },
    stableStringify(obj){
      const seen=new WeakSet();
      const norm=(o)=>{
        if (!U.isObj(o) && !Array.isArray(o)) return o;
        if (seen.has(o)) return '[Circular]';
        seen.add(o);
        if (Array.isArray(o)) return o.map(norm);
        const out={}; Object.keys(o).sort().forEach(k=> out[k]=norm(o[k])); return out;
      };
      return JSON.stringify(norm(obj));
    },
    log(...a){ console.log(LOG, ...a); },
    warn(...a){ console.warn(LOG, ...a); },
    err(...a){ console.error(LOG, ...a); },
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 1) settingsManager (handle) — безопасный доступ
  // ────────────────────────────────────────────────────────────────────────────
  const SM = (() => {
    const sm =
      window?.Theme?.settingsManager ||
      window?.SpotColЛичная?.settingsManager ||
      window?.settingsManager ||
      window?.SettingsManager || null;

    function getRaw(key){
      try{
        if (U.isFn(sm?.get)) {
          const v = sm.get(key);
          return U.isObj(v) && 'value' in v ? v.value : v;
        }
        const v = U.deepGet(sm?.settings, key);
        return U.isObj(v) && 'value' in v ? v.value : v;
      } catch { return undefined; }
    }

    function read(keys, def){
      const list = Array.isArray(keys)? keys: [keys];
      for (const k of list) {
        const v = getRaw(k);
        if (v !== undefined) return v;
      }
      return def;
    }

    async function update(){ try { await sm?.update?.(); } catch {} }

    function setDefaultOnce(key, value){
      try {
        if (getRaw(key) !== undefined) return;
        if (U.isFn(sm?.defaults)) sm.defaults({ [key]: { value } });
      } catch {}
    }

    return { sm, getRaw, read, update, setDefaultOnce };
  })();

  // ────────────────────────────────────────────────────────────────────────────
  // 2) CSS Manager — идempotent <style>
  // ────────────────────────────────────────────────────────────────────────────
  const CSS = {
    ensure(id){
      let st = document.getElementById(id);
      if(!st){ st=document.createElement('style'); st.id=id; document.head.appendChild(st); }
      return st;
    },
    set(id, css){ this.ensure(id).textContent = css; },
    remove(id){ document.getElementById(id)?.remove(); },
    has(id){ return !!document.getElementById(id); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 3) Локальные настройки ядра (персист в localStorage)
  // ────────────────────────────────────────────────────────────────────────────
  const STORE_KEY = 'MainSuite.prefs.v1';
  const Defaults = {
    transparency: false,
    background: true,
    fullvibe: false,
    zoom: true,
    hud: false,
    debugLog: 'info', // info|warn|error|silent
    hotkeysEnabled: true,
  };

  const Prefs = (() => {
    let cache = null;
    function load(){
      if (cache) return cache;
      try{
        cache = { ...Defaults, ...(JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}) };
      } catch { cache = { ...Defaults }; }
      return cache;
    }
    function save(){
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(cache)); } catch {}
    }
    function get(){ return load(); }
    function set(part){ cache = { ...load(), ...(part||{}) }; save(); return cache; }
    function reset(){ cache = { ...Defaults }; save(); return cache; }
    return { get, set, reset };
  })();

  // ────────────────────────────────────────────────────────────────────────────
  // 4) Эффекты: фон, FullVibe, Zoom, Colorize2
  // ────────────────────────────────────────────────────────────────────────────
  const Lib = window.Library || {};
  const coverFromTrack = (t) => (window.Library?.coverFromTrack?.(t) || t?.cover || '');
  const getCover = () => window.Library?.getHiResCover?.() || window.Library?.coverURL?.() || '';

  const Effects = (() => {
    // BG state (не делаем дубликат, уважаем уже существующие поля)
    const BG = {
      get last(){ return typeof window.lastBackgroundURL!=='undefined' ? window.lastBackgroundURL : window.__spotcol_lastBG || null; },
      set last(v){ if (typeof window.lastBackgroundURL!=='undefined') window.lastBackgroundURL = v; else window.__spotcol_lastBG = v; }
    };

    function findVibe(){
      return (
        document.querySelector('[class*="MainPage_vibe"]') ||
        document.querySelector('[class*="VibeBlock_vibe"]') ||
        document.querySelector('[data-test-id="MAIN_PAGE"]') ||
        document.body
      );
    }

    function makeLayer(url){
      const layer = document.createElement('div');
      layer.className = 'bg-layer';
      layer.style.cssText = `
        position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden;
        opacity:0; transition:opacity 900ms ease;
      `;
      const cover = document.createElement('div');
      cover.className = 'bg-cover';
      cover.style.cssText = `
        position:absolute; inset:0; background-image:url("${url}");
        background-size:cover; background-position:center; background-repeat:no-repeat;
      `;
      const grad = document.createElement('div');
      grad.className = 'bg-gradient';
      grad.style.cssText = `
        position:absolute; inset:0; background:var(--grad-main);
        mix-blend-mode:multiply; opacity:.9; transition:opacity 800ms ease 1500ms;
      `;
      layer.dataset.src = url;
      layer.appendChild(cover);
      layer.appendChild(grad);
      return layer;
    }

    function mountBackground(url){
      const tgt = findVibe(); if(!tgt||!url) return;
      tgt.style.position ||= 'relative';
      const cur = tgt.querySelector('.bg-layer');
      if (cur?.dataset?.src === url) return;

      const next = makeLayer(url);
      tgt.insertAdjacentElement('afterbegin', next);
      requestAnimationFrame(()=> next.style.opacity='1');
      if (cur){ cur.style.opacity='0'; setTimeout(()=>cur.remove(), 700); }
      BG.last = url;
    }

    function unmountBackground(){
      const tgt = findVibe();
      const cur = tgt?.querySelector('.bg-layer');
      if (cur){ cur.style.opacity='0'; setTimeout(()=>cur.remove(), 400); }
      BG.last = null;
    }

    function backgroundReplace(imageURL){
      if (!Main.flags.background()) return;
      if (!imageURL) return;
      if (imageURL === BG.last) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageURL;
      img.onload = () => mountBackground(imageURL);
    }

    function FullVibe(){
      const v = findVibe();
      if (v) v.style.setProperty('height', '88.35vh', 'important');
    }
    function RemoveFullVibe(){
      const v = findVibe();
      if (v) v.style.removeProperty('height');
    }

    function setupAvatarZoomEffect(){
      const img = document.querySelector('[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img');
      if (!img || img.dataset.zoomReady) return;
      Object.assign(img.style, { transition:'transform .25s ease, filter .25s ease', willChange:'transform' });
      const onMove = (e) => {
        const r = img.getBoundingClientRect();
        const dx = (e.clientX-(r.left+r.width/2))/(r.width/2);
        const dy = (e.clientY-(r.top+r.height/2))/(r.height/2);
        img.style.transform = `scale(1.05) translate(${dx*6}px, ${dy*6}px)`;
        img.style.filter = 'drop-shadow(0 10px 25px rgba(0,0,0,.45))';
      };
      const onLeave = () => { img.style.transform='scale(1)'; img.style.filter='drop-shadow(0 6px 18px rgba(0,0,0,.35))'; };
      img.addEventListener('mousemove', onMove);
      img.addEventListener('mouseleave', onLeave);
      img.dataset.zoomReady = '1';
    }
    function removeAvatarZoomEffect(){
      const img = document.querySelector('[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img');
      if (!img?.dataset.zoomReady) return;
      img.replaceWith(img.cloneNode(true));
    }

    function colorize(){
      try { window.Library?.colorize2?.recolor?.(true); } catch {}
    }

    function syncAll(){
      // background
      if (Main.flags.background()) {
        const url = getCover();
        if (url) mountBackground(url); else unmountBackground();
      } else { unmountBackground(); }
      // fullvibe
      if (Main.flags.fullvibe()) FullVibe(); else RemoveFullVibe();
      // zoom
      if (Main.flags.zoom()) setupAvatarZoomEffect(); else removeAvatarZoomEffect();
      // color
      colorize();
    }

    return {
      backgroundReplace,
      mountBackground,
      unmountBackground,
      FullVibe,
      RemoveFullVibe,
      setupAvatarZoomEffect,
      removeAvatarZoomEffect,
      colorize,
      syncAll
    };
  })();

  // ────────────────────────────────────────────────────────────────────────────
  // 5) Прозрачность (OFF по умолчанию, читает только реальные ключи)
  // ────────────────────────────────────────────────────────────────────────────
  const TRANSPARENCY_KEYS = ['Effects.transparency','togglePlayerBackground','Действия.togglePlayerBackground'];
  SM.setDefaultOnce('Effects.transparency', false);

  const Transparency = {
    isOn(){
      // приоритет: handle; если нет — prefs
      const h = SM.read(TRANSPARENCY_KEYS, undefined);
      if (typeof h === 'boolean') return h;
      return !!Prefs.get().transparency;
    },
    setOnLocal(v){
      Prefs.set({ transparency: !!v });
      Main.events.emit('transparency:local', { value: !!v });
      Transparency.apply();
    },
    apply(){
      const ID='spotcol-transparency';
      if (!Transparency.isOn()){ CSS.remove(ID); return; }
      CSS.set(ID, `
/* === SpotCol Transparency (safe) === */
[class*="PlayerBarDesktop_root"],
[class*="PlayerBar_root"],
[class*="MainPage_vibe"],
[class*="PlayQueue_root"],
[class*="FullscreenPlayerDesktopContent_info"],
[class*="FullscreenPlayerDesktopContent_syncLyrics"],
[class*="FullscreenPlayerDesktopControls"],
[class*="Content_root"],
[class*="Layout_root"],
[class*="Page_root"],
[class*="Card_root"],
[class*="Shelf_root"],
[class*="Sidebar_root"]{
  background:transparent!important; background-color:transparent!important;
  box-shadow:none!important; border:0!important;
}
[class*="overlay"],[class*="Backdrop"],[class*="backdrop"],
[class*="blur"],[style*="backdrop-filter"],[class*="frost"],[class*="glass"]{
  backdrop-filter:none!important; -webkit-backdrop-filter:none!important;
}
div[data-test-id="FULLSCREEN_PLAYER_MODAL"]{
  --brightness:1!important; --brightness-correction:1!important; background:transparent!important;
}`);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 6) Open-Blocker интеграция (если подключён Open-Blocker.js)
  // ────────────────────────────────────────────────────────────────────────────
  const OB = {
    get api(){ return window.OpenBlocker || null; },
    present(){ return !!OB.api; },
    setGlobal(v){ try { return OB.api?.setGlobal?.(!!v); } catch{} },
    toggleGlobal(){ try { return OB.api?.setGlobal?.(!OB.api?.health?.().globalEnabled); } catch{} },
    applyAll(force){ try { return OB.api?.applyAll?.(!!force); } catch{} },
    profile(name){ try { return OB.api?.applyProfile?.(name); } catch{} },
    enable(id){ try { return OB.api?.enable?.(id); } catch{} },
    disable(id){ try { return OB.api?.disable?.(id); } catch{} },
    exportPlain(){ try { return OB.api?.exportPlain?.(); } catch{} },
    exportHandle(){ try { return OB.api?.exportHandlePatch?.(); } catch{} },
    importPlain(json){ try { return OB.api?.importPlain?.(json); } catch{} },
    importHandle(json){ try { return OB.api?.importHandlePatch?.(json); } catch{} },
    health(){ try { return OB.api?.health?.(); } catch { return null; } },
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 7) События/шина (минимальный emitter)
  // ────────────────────────────────────────────────────────────────────────────
  const Emitter = class {
    constructor(){ this.m=new Map(); }
    on(ev, fn){ if(!this.m.has(ev)) this.m.set(ev,new Set()); this.m.get(ev).add(fn); return ()=>this.off(ev,fn); }
    off(ev, fn){ this.m.get(ev)?.delete(fn); }
    emit(ev, payload){ const s=this.m.get(ev); if(!s) return; [...s].forEach(fn=>{ try{ fn(payload); }catch(e){ U.err('emit',ev,e);} }); }
    once(ev, fn){ const off=this.on(ev, (p)=>{ off(); fn(p); }); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 8) Debug HUD — мини-панель
  // ────────────────────────────────────────────────────────────────────────────
  const HUD_ID = 'mainsuite-hud';
  const HUD = {
    open(){
      if (document.getElementById(HUD_ID)) return;
      const el=document.createElement('div'); el.id=HUD_ID;
      el.style.cssText=`
        position:fixed; right:10px; bottom:10px; z-index:2147483647;
        background:rgba(0,0,0,.7); color:#fff; font:12px/1.3 system-ui,Segoe UI,Roboto,sans-serif;
        border-radius:10px; padding:10px 12px; min-width:260px; backdrop-filter: blur(4px);
        box-shadow:0 10px 30px rgba(0,0,0,.35); user-select:none;
      `;
      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div><b>SpotCol ${VERSION}</b></div>
          <button id="hud-close" style="background:#ff5c5c;border:0;color:#000;padding:4px 8px;border-radius:6px;cursor:pointer;">✕</button>
        </div>
        <div style="display:grid;gap:6px;">
          <label style="display:flex;align-items:center;gap:8px;">
            <input id="hud-ob" type="checkbox"${OB.health()?.globalEnabled ? ' checked':''} />
            <span>Open-Blocker: Global</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input id="hud-trans" type="checkbox"${Transparency.isOn() ? ' checked':''} />
            <span>Прозрачность</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input id="hud-bg" type="checkbox"${Main.flags.background() ? ' checked':''} />
            <span>Фон (обложка)</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input id="hud-fv" type="checkbox"${Main.flags.fullvibe() ? ' checked':''} />
            <span>FullVibe</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input id="hud-zoom" type="checkbox"${Main.flags.zoom() ? ' checked':''} />
            <span>Zoom обложки</span>
          </label>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button data-hud="apply" style="padding:6px 10px;border-radius:6px;border:0;background:#7da6ff;color:#000;cursor:pointer;">Применить</button>
          <button data-hud="recolor" style="padding:6px 10px;border-radius:6px;border:0;background:#b4ffa1;color:#000;cursor:pointer;">Recolor</button>
          <button data-hud="sync" style="padding:6px 10px;border-radius:6px;border:0;background:#ffd37d;color:#000;cursor:pointer;">Sync All</button>
        </div>
        <div style="margin-top:10px;opacity:.8;">
          <div>Hotkeys: <code>Ctrl+Alt+O/T/B/F/Z/D</code></div>
        </div>
      `;
      document.documentElement.appendChild(el);
      el.querySelector('#hud-close')?.addEventListener('click', HUD.close);

      const set = (id, fn) => el.querySelector(id)?.addEventListener('change', (e)=>{
        try { fn(e.target.checked); } catch {}
      });

      set('#hud-ob', (v)=> OB.setGlobal?.(!!v));
      set('#hud-trans', (v)=> Transparency.setOnLocal(!!v));
      set('#hud-bg', (v)=> Main.flags.set('background', !!v));
      set('#hud-fv', (v)=> Main.flags.set('fullvibe', !!v));
      set('#hud-zoom', (v)=> Main.flags.set('zoom', !!v));

      el.querySelector('[data-hud="apply"]')?.addEventListener('click', ()=> {
        Transparency.apply(); Effects.syncAll(); if (OB.present()) OB.applyAll(true);
      });
      el.querySelector('[data-hud="recolor"]')?.addEventListener('click', ()=> Effects.colorize());
      el.querySelector('[data-hud="sync"]')?.addEventListener('click', ()=> Main.syncAll());
    },
    close(){ document.getElementById(HUD_ID)?.remove(); },
    toggle(){ document.getElementById(HUD_ID)? HUD.close(): HUD.open(); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 9) Горячие клавиши
  // ────────────────────────────────────────────────────────────────────────────
  const Hotkeys = {
    handler(e){
      if (!Prefs.get().hotkeysEnabled) return;
      if (!e.ctrlKey || !e.altKey) return;
      const k = e.key?.toLowerCase?.();
      switch (k) {
        case 'o': OB.toggleGlobal?.(); e.preventDefault(); break;
        case 't': Main.flags.toggle('transparency'); Transparency.apply(); e.preventDefault(); break;
        case 'b': Main.flags.toggle('background'); Effects.syncAll(); e.preventDefault(); break;
        case 'f': Main.flags.toggle('fullvibe'); Effects.syncAll(); e.preventDefault(); break;
        case 'z': Main.flags.toggle('zoom'); Effects.syncAll(); e.preventDefault(); break;
        case 'd': HUD.toggle(); e.preventDefault(); break;
        default: break;
      }
    },
    attach(){ window.addEventListener('keydown', Hotkeys.handler, { passive:false }); },
    detach(){ window.removeEventListener('keydown', Hotkeys.handler); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 10) Плеер/DOM вотчеры
  // ────────────────────────────────────────────────────────────────────────────
  function hookTrackEvents(){
    try {
      window.Library?.trackWatcher?.((track)=>{
        const url = coverFromTrack(track) || getCover();
        if (url) Effects.backgroundReplace(url);
        Effects.colorize();
      });
    } catch {}

    try {
      const p = window.Theme?.player || window.player;
      p?.on?.('trackChange', ({ state })=>{
        const t = state?.track;
        const url = coverFromTrack(t) || getCover();
        if (url) Effects.backgroundReplace(url);
        Effects.colorize();
      });
      p?.on?.('openPlayer', ({ state })=>{
        const t=state?.track; const url = coverFromTrack(t) || getCover();
        if (url) Effects.backgroundReplace(url);
        Effects.colorize();
      });
      p?.on?.('pageChange', ()=> Main.syncAll());
    } catch {}
  }

  function hookDom(){
    const root = document.querySelector('[class*="CommonLayout_root"]') || document.body;
    const mo = new MutationObserver(U.throttle(()=> {
      Transparency.apply();
      Effects.syncAll();
    }, 250));
    mo.observe(root, { childList:true, subtree:true });

    // Страхуем фон каждые 1.2с
    setInterval(()=> {
      if (!Main.flags.background()) return;
      const want=getCover(); if (!want) return;
      const tgt = document.querySelector('[class*="MainPage_vibe"],[class*="VibeBlock_vibe"],[data-test-id="MAIN_PAGE"]');
      const have = tgt?.querySelector?.('.bg-layer')?.dataset?.src;
      if (have !== want) Effects.mountBackground(want);
    }, 1200);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 11) Watcher по handle (минимально нужные ключи)
  // ────────────────────────────────────────────────────────────────────────────
  const WATCH_KEYS = [
    'OpenBlocker.enabled',
    'Effects.transparency','togglePlayerBackground','Действия.togglePlayerBackground',
    'Эффекты.enableBackgroundImage','enableBackgroundImage',
    'Эффекты.enableFullVibe','FullVibe',
    'Эффекты.enableAvatarZoom','enableAvatarZoom'
  ];

  function signature(){
    const obj = {};
    for (const k of WATCH_KEYS) obj[k] = SM.getRaw(k);
    return U.stableStringify(obj);
  }

  let lastSig = '';
  async function tickHandle(){
    await SM.update();
    const s = signature();
    if (s !== lastSig) {
      lastSig = s;
      Main.syncAll();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 12) Экспорт/импорт «пакета» настроек ядра (без handle)
  // ────────────────────────────────────────────────────────────────────────────
  function exportPrefs(){
    return JSON.stringify(Prefs.get(), null, 2);
  }
  function importPrefs(jsonOrObj){
    const obj = U.isStr(jsonOrObj)? JSON.parse(jsonOrObj): jsonOrObj;
    if (!U.isObj(obj)) throw new Error('Bad prefs');
    Prefs.set(obj);
    Main.syncAll();
    return Prefs.get();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 13) CLI
  // ────────────────────────────────────────────────────────────────────────────
  function cli(input){
    try{
      if (!U.isStr(input)) return 'usage: main help';
      const [cmd, ...rest] = input.trim().split(/\s+/);
      switch(cmd){
        case 'help': return [
          `MainSuite ${VERSION} — CLI`,
          'main get            — показать prefs',
          'main set {"zoom":false,"background":true}',
          'main export         — экспорт prefs (JSON)',
          'main import {...}   — импорт prefs (JSON)',
          'main hud            — открыть/закрыть HUD',
          'main sync           — Main.syncAll()',
          'main ob on|off      — глобал OB',
          'main ob apply       — OB.applyAll(true)',
          'main ob profile strict|minimal|personalFirst|discoveryBoost',
          'main trans on|off   — локально включить/выключить прозрачность',
          'main fullvibe on|off',
          'main zoom on|off',
          'main bg on|off',
        ].join('\n');

        case 'get': return Prefs.get();
        case 'set': {
          const json=rest.join(' '); return Prefs.set(JSON.parse(json));
        }
        case 'export': return exportPrefs();
        case 'import': {
          const json=rest.join(' '); return importPrefs(json);
        }
        case 'hud': HUD.toggle(); return 'ok';
        case 'sync': Main.syncAll(); return 'ok';

        case 'trans': {
          const v=(rest[0]||'').toLowerCase();
          if (v==='on') Transparency.setOnLocal(true);
          else if (v==='off') Transparency.setOnLocal(false);
          else return Transparency.isOn();
          return 'ok';
        }
        case 'fullvibe': {
          const v=(rest[0]||'').toLowerCase();
          if (v==='on') Main.flags.set('fullvibe', true);
          else if (v==='off') Main.flags.set('fullvibe', false);
          else return Main.flags.fullvibe();
          Effects.syncAll(); return 'ok';
        }
        case 'zoom': {
          const v=(rest[0]||'').toLowerCase();
          if (v==='on') Main.flags.set('zoom', true);
          else if (v==='off') Main.flags.set('zoom', false);
          else return Main.flags.zoom();
          Effects.syncAll(); return 'ok';
        }
        case 'bg': {
          const v=(rest[0]||'').toLowerCase();
          if (v==='on') Main.flags.set('background', true);
          else if (v==='off') Main.flags.set('background', false);
          else return Main.flags.background();
          Effects.syncAll(); return 'ok';
        }

        case 'ob': {
          const sub = (rest[0]||'').toLowerCase();
          if (!OB.present()) return 'OpenBlocker not loaded';
          if (sub==='on') return OB.setGlobal(true);
          if (sub==='off') return OB.setGlobal(false);
          if (sub==='apply') return OB.applyAll(true);
          if (sub==='profile') return OB.profile(rest[1]);
          return OB.health();
        }

        default: return `unknown cmd: ${cmd}`;
      }
    } catch(e){ return `cli error: ${e.message || e}`; }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 14) Главный объект API
  // ────────────────────────────────────────────────────────────────────────────
  const Main = {
    version: VERSION,
    events: new Emitter(),

    // feature flags (prefs + fallback на handle для отдельных кейсов)
    flags: {
      background(){ // local pref + handle fallback
        const h = SM.read(['Эффекты.enableBackgroundImage','enableBackgroundImage'], undefined);
        if (typeof h==='boolean') return h;
        return !!Prefs.get().background;
      },
      fullvibe(){
        const h = SM.read(['Эффекты.enableFullVibe','FullVibe'], undefined);
        if (typeof h==='boolean') return h;
        return !!Prefs.get().fullvibe;
      },
      zoom(){
        const h = SM.read(['Эффекты.enableAvatarZoom','enableAvatarZoom'], undefined);
        if (typeof h==='boolean') return h;
        return !!Prefs.get().zoom;
      },
      transparency(){ return Transparency.isOn(); },
      hud(){ return !!Prefs.get().hud; },
      set(key, value){
        const next = {}; next[key] = !!value; Prefs.set(next); Main.events.emit('flags:set', { key, value:!!value }); return !!value;
      },
      toggle(key){ return Main.flags.set(key, !Prefs.get()[key]); }
    },

    // действия
    applyTransparency(){ Transparency.apply(); },
    backgroundReplace(url){ Effects.backgroundReplace(url); },
    FullVibe(){ Effects.FullVibe(); },
    RemoveFullVibe(){ Effects.RemoveFullVibe(); },
    setupAvatarZoomEffect(){ Effects.setupAvatarZoomEffect(); },
    removeAvatarZoomEffect(){ Effects.removeAvatarZoomEffect(); },
    colorize(){ Effects.colorize(); },

    // синхронизация «всё вместе»
    syncAll(){
      Transparency.apply();
      Effects.syncAll();
      if (OB.present()) OB.applyAll();
      Main.events.emit('sync:all');
    },

    // prefs export/import
    exportPrefs, importPrefs,

    // CLI
    cli,

    // HUD/hotkeys
    HUD, Hotkeys
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 15) Экспорт в global/Theme
  // ────────────────────────────────────────────────────────────────────────────
  window.MainSuite = Main;
  if (window.Theme) window.Theme.MainSuite = Main;

  // ────────────────────────────────────────────────────────────────────────────
  // 16) Boot
  // ────────────────────────────────────────────────────────────────────────────
  (async () => {
    try {
      U.log(`boot ${VERSION}`);

      // Первичные хуки
      hookTrackEvents();
      hookDom();

      // Первичная синхронизация
      Main.syncAll();

      // HUD по prefs
      if (Main.flags.hud()) HUD.open();

      // Хоткеи
      Hotkeys.attach();

      // Watcher handle
      lastSig = signature();
      setInterval(tickHandle, 1000);
      ['visibilitychange','focus','pageshow'].forEach(ev => window.addEventListener(ev, tickHandle, { passive:true }));

      // Маленький баннер-пинг
      try{
        const el=document.createElement('div');
        el.textContent=`MainSuite ${VERSION} ready`;
        el.style.cssText=`
          position:fixed; left:10px; top:10px; z-index:2147483647;
          padding:6px 10px; background:rgba(0,0,0,.65); color:#fff;
          font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
          border-radius:6px; pointer-events:none; opacity:0; transition:.25s ease;
        `;
        document.documentElement.appendChild(el);
        requestAnimationFrame(()=> el.style.opacity='1');
        setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=> el.remove(), 300); }, 2200);
      } catch {}

      U.log('ready');
    } catch(e){
      U.err('init fail', e);
    }
  })();
})();
