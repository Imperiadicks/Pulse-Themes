(() => {
  // защита от двойной загрузки (сохраняем семантику твоего файла)
  if (window.Library) return;

  const DEBUG = !!window.__DEBUG__;
  const log   = (...a) => DEBUG && console.log('[Library]', ...a);
  console.log('[Library] v1.3.1');

  // ==========================================================================
  // Внутренние helper'ы для извлечения обложек (fallback с DOM)
  // ==========================================================================
  const coverURL = () => {
    const mini = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img');
    if (mini?.src) return mini.src;

    const full = document.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]');
    if (full?.src) return full.src;

    const any = document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
    return any?.src || null;
  };

  const getHiResCover = () => {
    const img = document.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] img');
    return img?.src?.includes('/100x100') ? img.src.replace('/100x100', '/1000x1000') : null;
  };

  // ==========================================================================
  // EventEmitter
  // ==========================================================================
  class EventEmitter {
    #ev = Object.create(null);
    on   (e, fn) { (this.#ev[e] ??= []).push(fn); return this; }
    once (e, fn) { const g = (...a)=>{ this.off(e,g); fn(...a); }; return this.on(e,g); }
    off  (e, fn) { this.#ev[e] = (this.#ev[e] || []).filter(f=>f!==fn); return this; }
    emit (e, d ) { (this.#ev[e] || []).forEach(f=>f(d)); return this; }
    removeAll(e) { e ? delete this.#ev[e] : this.#ev = Object.create(null); }
  }

  // ==========================================================================
  // StylesManager
  // ==========================================================================
  class StylesManager {
    #bag = {};
    #id  = 'style';
    #flush() {
      let tag = document.getElementById(this.#id);
      if (!tag) { tag = document.createElement('style'); tag.id = this.#id; document.head.appendChild(tag); }
      tag.textContent = Object.values(this.#bag).join('\n\n');
    }
    add(id, css) { if (!id||!css) return; this.#bag[id] = String(css); this.#flush(); }
    remove(id)   { delete this.#bag[id]; this.#flush(); }
    clear()      { this.#bag = {}; this.#flush(); }
    has(id)      { return Object.hasOwn(this.#bag, id); }
    get keys()   { return Object.keys(this.#bag); }
    get size()   { return this.keys.length; }
  }

  // ==========================================================================
  // SettingsManager (расширенный, совместим с твоим API)
  // ==========================================================================
  class SettingsManager extends EventEmitter {
    #theme; #cur = {}; #prev = {};
    constructor(theme){ super(); this.#theme = theme; }
    #pick(obj, path) { return path.split('.').reduce((o,k)=>o?.[k], obj); }
    get(id)        { return this.#pick(this.#cur, id); }
    has(id)        { return this.#pick(this.#cur, id) !== undefined; }
    getAll()       { return structuredClone(this.#cur); }
    hasChanged(id) { return JSON.stringify(this.#pick(this.#cur,id)) !== JSON.stringify(this.#pick(this.#prev,id)); }
    onChange(id, cb){ this.on(`change:${id}`, cb); }
    defaults(obj)  { for (const [k,v] of Object.entries(obj)) if (!this.has(k)) this.#silentSet(k,v); this.emit('update', {settings:this}); }
    async update() {
      try {
        const url = `http://localhost:2007/get_handle?name=${encodeURIComponent(this.#theme.id)}`;
        const r   = await fetch(url, { cache:'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { data } = await r.json();
        if (!data?.sections) { log('settings: no sections'); return; }
        this.#prev = structuredClone(this.#cur);
        this.#cur  = this.#transform(data.sections);
        this.emit('update', {settings:this});
        for (const id of Object.keys(this.#cur))
          if (this.hasChanged(id)) this.emit(`change:${id}`, {settings:this});
      } catch(e){ console.error('[SettingsManager]', e); }
    }
    #transform(sections) {
      const out = {};
      for (const s of sections) {
        for (const it of s.items) {
          if (it.type==='text' && it.buttons) {
            out[it.id] = {};
            for (const b of it.buttons) out[it.id][b.id] = { value:b.text, default:b.defaultParameter };
          } else {
            const v = it.bool ?? it.input ?? it.filePath ?? it.selected ?? it.value;
            out[it.id] = { value:v, default:it.defaultParameter };
          }
        }
      }
      return out;
    }
    #silentSet(path,val){
      const keys = path.split('.'); let o=this.#cur;
      keys.slice(0,-1).forEach(k=>{ if(!o[k]) o[k] = {}; o=o[k]; });
      o[keys.at(-1)] = val;
    }
  }

  // ==========================================================================
  // UI helpers (alert/modal/confirm/prompt/toast/progressBar)
  // ==========================================================================
  const UIHelpers = {
    _el(tag, styleObj = {}, parent = document.body, html='') {
      const n = document.createElement(tag);
      Object.assign(n.style, styleObj);
      if (html) n.innerHTML = html;
      parent.appendChild(n); return n;
    },
    alert(msg, ms=2500) {
      const d = this._el('div', {
        position:'fixed',bottom:'20px',left:'50%',transform:'translateX(-50%)',
        background:'#222',color:'#fff',padding:'10px 22px',borderRadius:'8px',
        font:'14px/1 sans-serif',opacity:0,transition:'opacity .25s',zIndex:9999
      }, document.body, msg);
      requestAnimationFrame(()=>d.style.opacity=1);
      setTimeout(()=>{ d.style.opacity=0; setTimeout(()=>d.remove(),250); }, ms);
    },
    modal(html) {
      const wrap = this._el('div',{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',
        alignItems:'center',justifyContent:'center',zIndex:10000});
      const box  = this._el('div',{maxWidth:'80vw',maxHeight:'80vh',overflow:'auto',background:'#111',color:'#eee',
        padding:'24px',borderRadius:'12px',fontFamily:'sans-serif'},wrap,html);
      wrap.addEventListener('click',e=>e.target===wrap&&wrap.remove());
      const esc = e=>{ if(e.key==='Escape'){wrap.remove();document.removeEventListener('keydown',esc);} };
      document.addEventListener('keydown',esc);
      return { close: () => wrap.remove() };
    },
    confirm(text, ok='OK', cancel='Cancel') {
      return new Promise(res=>{
        const wrap=this._el('div',{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000});
        const panel=this._el('div',{background:'#222',color:'#fff',padding:'20px',borderRadius:'10px',minWidth:'260px',fontFamily:'sans-serif',textAlign:'center'},wrap);
        this._el('div',{marginBottom:'12px',fontSize:'15px'},panel,text);
        const row=this._el('div',{display:'flex',gap:'8px',justifyContent:'center'},panel);
        const mkBtn=(t,v)=>{const b=this._el('button',{padding:'6px 16px',background:'#444',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer'},row,t); b.onclick=()=>{wrap.remove();res(v);} };
        mkBtn(ok,true); mkBtn(cancel,false);
      });
    },
    prompt(label, placeholder='', ok='OK', cancel='Cancel'){
      return new Promise(res=>{
        const wrap=this._el('div',{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000});
        const panel=this._el('div',{background:'#222',color:'#fff',padding:'20px',borderRadius:'10px',minWidth:'260px',fontFamily:'sans-serif'},wrap);
        this._el('div',{marginBottom:'8px'},panel,label);
        const input=document.createElement('input');
        Object.assign(input.style,{width:'100%',padding:'6px',marginBottom:'12px',border:'1px solid #555',borderRadius:'6px',background:'#111',color:'#eee'});
        input.placeholder=placeholder; panel.appendChild(input); input.focus();
        const row=this._el('div',{display:'flex',gap:'8px',justifyContent:'right'},panel);
        const mk=(t,v)=>{const b=this._el('button',{padding:'6px 16px',background:'#444',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer'},row,t); b.onclick=()=>{wrap.remove();res(v);} };
        mk(cancel,null); mk(ok,null); row.lastChild.onclick = ()=>{wrap.remove();res(input.value);} ;
      });
    },
    toast(msg, ms=3000){
      const areaId='toast-area';
      let area=document.getElementById(areaId);
      if(!area){ area=this._el('div',{position:'fixed',top:'16px',right:'16px',display:'flex',flexDirection:'column',gap:'8px',zIndex:10000}); area.id=areaId; }
      const itm=this._el('div',{background:'#333',color:'#fff',padding:'10px 16px',borderRadius:'8px',font:'14px/1 sans-serif',opacity:0,transition:'opacity .2s'},area,msg);
      requestAnimationFrame(()=>itm.style.opacity=1);
      setTimeout(()=>{itm.style.opacity=0; setTimeout(()=>itm.remove(),200);},ms);
    },
    progressBar(initial=0){
      const bar=this._el('div',{position:'fixed',bottom:0,left:0,height:'4px',width:'0%',background:'#1db954',transition:'width .1s',zIndex:9999});
      const update=p=>bar.style.width=`${Math.min(100,Math.max(0,p))}%`;
      const finish=()=>{bar.remove();};
      update(initial); return {update,finish};
    }
  };

  // ==========================================================================
  // Library namespace + util
  // ==========================================================================
  const Library = (window.Library = window.Library || {});
  Library.versions = Library.versions || {};
  Library.util = Library.util || {};
  Library.ui   = Library.ui   || {};

  // util: debounce/throttle
  if (typeof Library.util.debounce !== 'function') {
    Library.util.debounce = function debounce(fn, wait = 200) {
      let t = null;
      return function (...args) {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    };
  }
  if (typeof Library.util.throttle !== 'function') {
    Library.util.throttle = function throttle(fn, wait = 100) {
      let last = 0, timer = null, ctx, args;
      return function throttled(...a) {
        const now = Date.now();
        const rem = wait - (now - last);
        ctx = this; args = a;
        if (rem <= 0) { last = now; fn.apply(ctx, args); }
        else if (!timer) {
          timer = setTimeout(() => { last = Date.now(); timer = null; fn.apply(ctx, args); }, rem);
        }
      };
    };
  }

  // util: coverURLFromTrack (универсально для ЯМ)
  if (typeof Library.util.coverURLFromTrack !== 'function') {
    Library.util.coverURLFromTrack = function coverURLFromTrack(track, size = '1000x1000') {
      if (!track) return '';
      let uri =
        track.coverUri ||
        track.cover_uri ||
        track.cover ||
        (track.album && (track.album.coverUri || track.album.cover)) ||
        track.image ||
        track.artwork ||
        '';

      if (uri && typeof uri === 'string') {
        if (uri.includes('%%')) uri = uri.replace('%%', size);
        if (uri.includes('/100x100')) uri = uri.replace('/100x100', `/${size}`);
        if (/^\/\//.test(uri)) uri = `https:${uri}`;
        if (/^avatars\.yandex\.net/.test(uri)) uri = `https://${uri}`;
      }
      return uri || getHiResCover() || coverURL() || '';
    };
  }

  // helper: текущий трек
  if (typeof Library.getCurrentTrack !== 'function') {
    Library.getCurrentTrack = function getCurrentTrack() {
      return (
        window.Theme?.player?.state?.track ||
        window.Theme?.player?.getCurrentTrack?.() ||
        null
      );
    };
  }

  // ==========================================================================
  // UI core: crossfade, setText, updateTrackUI, bindTrackUI, onTrack шина
  // ==========================================================================
  Library.initUI = function initUI(){ /* заглушка на будущее */ };

  // crossfade — плавная замена картинок в контейнере
  if (typeof Library.ui.crossfade !== 'function') {
    Library.ui.crossfade = function crossfade(elOrSel, url, { duration = 600, onStart=()=>{}, onLoad=()=>{}, onError=()=>{} } = {}) {
      if (!url) return;
      const el = typeof elOrSel === 'string' ? document.querySelector(elOrSel) : elOrSel;
      if (!el) return;

      // если URL тот же, но текущей картинки нет — всё равно ставим
      if (el.dataset?.bg === url) {
        const hasCurrent = el.querySelector('img._ui_cf.current');
        if (hasCurrent) return;
      }

      const reqId = ((el.dataset?.reqId ? parseInt(el.dataset.reqId, 10) : 0) + 1) || 1;
      el.dataset.reqId = String(reqId);
      onStart(url);

      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.overflow = 'hidden';

      const pre = new Image();
      pre.decoding = 'async';
      pre.loading = 'eager';
      pre.src = url;

      pre.onload = () => {
        if (el.dataset.reqId !== String(reqId)) return; // устаревший onload
        const prev = el.querySelector('img._ui_cf.current');

        const next = document.createElement('img');
        next.className = '_ui_cf current';
        next.alt = '';
        next.src = url;
        next.style.cssText = `
          position:absolute; inset:0;
          width:100%; height:100%;
          object-fit:cover;
          opacity:0; transition:opacity ${duration}ms ease;
          pointer-events:none; will-change:opacity;
        `;
        el.appendChild(next);

        requestAnimationFrame(() => {
          next.style.opacity = '1';
          if (prev) {
            prev.classList.remove('current');
            prev.classList.add('old');
            prev.style.transition = `opacity ${Math.max(300, duration - 150)}ms ease`;
            prev.style.opacity = '0';
            prev.addEventListener('transitionend', () => prev.remove(), { once: true });
            setTimeout(() => prev.isConnected && prev.remove(), Math.max(350, duration + 120));
          }
        });

        // лимит: не более 2 картинок
        const imgs = el.querySelectorAll('img._ui_cf');
        for (let i = 0; i < imgs.length - 2; i++) {
          if (imgs[i] !== next && imgs[i] !== prev) imgs[i].remove();
        }

        if (el.dataset) el.dataset.bg = url;
        onLoad(url);
      };

      pre.onerror = () => { onError(url); };
    };
  }

  // setText — простой текстовый апдейтер
  if (typeof Library.ui.setText !== 'function') {
    Library.ui.setText = function setText(elOrSel, text) {
      const el = typeof elOrSel === 'string' ? document.querySelector(elOrSel) : elOrSel;
      if (!el) return;
      el.textContent = text ?? '';
    };
  }

  // Единая шина событий смены трека (объединяет PlayerEvents и поллинг)
  const _trackListeners = new Set();
  Library.onTrack = function onTrack(handler, { immediate = true } = {}) {
    _trackListeners.add(handler);

    if (!Library._busInit) {
      Library._busInit = true;

      const emit = (t, tag='') => {
        if (!t) return;
        if (Library.debugUI) console.log('[onTrack:emit]', tag, t?.title || t?.name, t);
        for (const fn of _trackListeners) { try { fn(t); } catch (_) {} }
      };

      const tp = window.Theme?.player;
      if (tp?.on) {
        tp.on('trackChange', ({ state }) => emit(state?.track, 'event:trackChange'));
        tp.on('openPlayer',  ({ state }) => emit(state?.track, 'event:openPlayer'));
        tp.on('pageChange',  ({ state }) => emit(state?.track, 'event:pageChange'));
      }

      if (window.Player?.on) {
        window.Player.on('trackChange', ({ state }) => emit(state?.track, 'alias:trackChange'));
        window.Player.on('openPlayer',  ({ state }) => emit(state?.track, 'alias:openPlayer'));
      }

      // фолбэк-поллер
      let lastId = null;
      setInterval(() => {
        const s = tp?.state?.track || tp?.getCurrentTrack?.() || Library.getCurrentTrack?.();
        const id = s?.id || s?.trackId || s?.uuid || (s ? `${s.title}|${s?.album?.id || s?.albums?.[0]?.id || ''}` : null);
        if (!id) return;
        if (id !== lastId) { lastId = id; emit(s, 'poll'); }
      }, 800);

      const cur = tp?.getCurrentTrack?.() || tp?.state?.track || Library.getCurrentTrack?.();
      if (cur) setTimeout(() => emit(cur, 'initial'), 0);
    }

    if (immediate) {
      const tp = window.Theme?.player;
      const cur = tp?.getCurrentTrack?.() || tp?.state?.track || Library.getCurrentTrack?.();
      if (cur) handler(cur);
    }

    return () => _trackListeners.delete(handler);
  };

  // updateTrackUI — проставляет обложку/название/артиста
  if (typeof Library.ui.updateTrackUI !== 'function') {
    Library.ui.updateTrackUI = function updateTrackUI(map, track, opts = {}) {
      if (!map || !track) return;
      const { cover, title, artist } = map;
      const tTitle   = track?.title || track?.name || '—';
      const tArtists = Array.isArray(track?.artists)
        ? track.artists.map(a => a.name || a.title || a).filter(Boolean).join(', ')
        : track?.artist || track?.author || '';

      if (title)  Library.ui.setText(title,  tTitle);
      if (artist) Library.ui.setText(artist, tArtists);

      if (cover) {
        const url = Library.util.coverURLFromTrack(track, '1000x1000');
        if (url) {
          Library.ui.crossfade(cover, url, {
            duration: Number(opts.duration || 600),
            onStart: (u) => Library.debugUI && console.log('[updateTrackUI] start cover', u),
            onLoad:  ()  => Library.debugUI && console.log('[updateTrackUI] cover loaded'),
            onError: (u) => console.error('[updateTrackUI] cover error', u),
          });
        }
      }

      // раздать слушателям
      try { Library.onTrack(()=>{}); /* ensure bus init */ } catch {}
    };
  }

  // bindTrackUI — привязка к Theme.player событиям
  if (typeof Library.ui.bindTrackUI !== 'function') {
    Library.ui.bindTrackUI = function bindTrackUI(map, opts = {}) {
      const off = Library.onTrack((t) => Library.ui.updateTrackUI(map, t, opts), { immediate: true });
      return () => off && off();
    };
  }

  // ==========================================================================
  // PlayerEvents — полноценная обёртка над window.player (ЯМ)
  // ==========================================================================
  class PlayerEvents extends EventEmitter {
    #theme;
    state = {
      status : 'paused',
      page   : location.pathname,
      volume : 0,
      shuffle: false,
      repeat : 'none',
      progress:{ duration:0, position:0, loaded:0, played:0 },
      track   : {}
    };
    constructor(theme){ super(); this.#theme = theme; this.#wait(); this.#watchPage(); }
    #wait(){
      const iv = setInterval(()=>{
        if (window?.player?.state?.playerState &&
            window?.player?.state?.queueState?.currentEntity?.value?.entity?.data?.meta){
          clearInterval(iv); this.#hook();
        }
      }, 400);
    }
    #hook(){
      const ps = player.state.playerState;
      const qs = player.state.queueState;

      this.state.track  = qs.currentEntity.value.entity.data.meta;
      this.state.volume = ps.volume.value;
      this.emit('trackChange', { state:this.state });

      ps.status.onChange(s=>{
        this.state.status = s==='loadingMediaData' ? 'paused' : s;
        this.emit(s==='playing' ? 'play' : 'pause', { state:this.state });
        if (s==='loadingMediaData'){
          this.state.track = qs.currentEntity.value.entity.data.meta;
          this.emit('trackChange', { state:this.state });
        }
      });

      ps.event.onChange(ev=>{ if (ev==='audio-set-progress') this.emit('seek', { state:this.state }); });
      ps.progress.onChange(p=>{ this.state.progress = p; this.emit('progress', { state:this.state }); });
      ps.volume.onChange(v=>{ this.state.volume = Math.round(v*100)/100; this.emit('volume', { state:this.state }); });
      qs.shuffle.onChange(sh=>{ this.state.shuffle = sh; this.emit('shuffle', { state:this.state }); });
      qs.repeat.onChange(r=>{ this.state.repeat  = r; this.emit('repeat',  { state:this.state }); });
      qs.currentEntity.onChange(()=>{ this.state.track = qs.currentEntity.value.entity.data.meta; this.emit('trackChange', { state:this.state }); });

      // fullscreen / lyrics / queue
      const test = {
        player : n => n.querySelector?.('[data-test-id="FULLSCREEN_PLAYER_MODAL"]'),
        text   : n => n.querySelector?.('[data-test-id="SYNC_LYRICS_CONTENT"]'),
        queue  : n => n.querySelector?.('.PlayQueue_root__ponhw')
      };
      new MutationObserver(muts=>{
        muts.forEach(mu=>{
          mu.addedNodes.forEach(n=>{
            if (test.player(n)) this.emit('openPlayer',  { state:this.state });
            if (test.text  (n)) this.emit('openText',    { state:this.state });
            if (test.queue (n)) this.emit('openQueue',   { state:this.state });
          });
          mu.removedNodes.forEach(n=>{
            if (test.player(n)) this.emit('closePlayer', { state:this.state });
            if (test.text  (n)) this.emit('closeText',   { state:this.state });
            if (test.queue (n)) this.emit('closeQueue',  { state:this.state });
          });
        });
      }).observe(document.body,{ childList:true, subtree:true });
    }
    #watchPage(){
      const upd = () => {
        const p = location.pathname;
        if (p !== this.state.page){ this.state.page = p; this.emit('pageChange', { state:this.state }); }
      };
      ['pushState','replaceState'].forEach(fn=>{
        const o = history[fn];
        history[fn] = function(...a){ o.apply(this,a); upd(); };
      });
      addEventListener('popstate', upd);
    }
    getCurrentTrack() {
      if (this.state?.track?.title) return this.state.track;
      try {
        const src = coverURL();
        const titleEl = document.querySelector('[class*="TrackInfo_title"]');
        const artistEls = [...document.querySelectorAll('[class*="TrackInfo_artists"] a')];
        return {
          coverUri: src?.split('https://')[1]?.replace('100x100', '%%') || '',
          title: titleEl?.textContent || '',
          artists: artistEls.map(a => ({ name: a.textContent }))
        };
      } catch (e) {
        console.warn('[PlayerEvents] getCurrentTrack() fallback error:', e);
        return {};
      }
    }
  }

  // ==========================================================================
  // Theme (applyTheme, addAction, update, start, stop, destroy)
  // ==========================================================================
  class SonataState {
    constructor(){ this.events = {}; }
    on(event, handler){ this.events[event] ??= []; this.events[event].push(handler); }
    emit(event, payload){ (this.events[event] ?? []).forEach(fn => fn(payload)); }
  }

  class Theme {
    id; stylesManager; settingsManager; assetsManager; player;
    #ev = new EventEmitter(); #actions = {}; #loop = null; context = Object.create(null);

    constructor(id) {
      if (!id) throw Error('Theme id required');
      this.id = id;
      this.stylesManager   = new StylesManager();
      this.settingsManager = new SettingsManager(this);
      this.sonataState = new SonataState();
      this.playerState = this.sonataState;

      if (typeof AssetsManager !== 'undefined') this.assetsManager = new AssetsManager();
      this.player = new PlayerEvents(this);

      this.#watchPageChanges();
      log('Theme', id, 'init');
    }

    #watchPageChanges() {
      let lastURL = location.href;
      setInterval(() => {
        if (location.href !== lastURL) {
          lastURL = location.href;
          // хук для внешних виджетов, например SpotifyScreen.check()
          try { this.SpotifyScreen?.check?.(); } catch {}
        }
      }, 1000);
    }

    // события темы
    on (...a){ this.#ev.on (...a); }
    off(...a){ this.#ev.off(...a); }
    emit(...a){ this.#ev.emit(...a); }

    // context
    ctx = Object.create(null);
    setContext(k,v){ this.ctx[k]=v; }
    getContext(k){ return this.ctx[k]; }

    // actions
    addAction(id, fn){ this.#actions[id]=fn; }

    // применить тему: вызвать actions и нарисовать CSS
    applyTheme(){
      for(const id of Object.keys(this.#actions)){
        const changed = this.settingsManager.hasChanged(id);
        const val     = this.settingsManager.get(id);
        this.#actions[id]?.({value:val, changed, styles:this.stylesManager, settings:this.settingsManager, state:this.player.state });
      }
      this.stylesManager.clear();
      for(const [id,fn] of Object.entries(this.#actions))
        fn({value:this.settingsManager.get(id), changed:false, styles:this.stylesManager, settings:this.settingsManager, state:this.player.state });
    }

    // update(): тянем настройки и применяем тему
    async update(){ await this.settingsManager.update(); this.applyTheme(); }

    // циклическое обновление
    start(ms=2500){ if(this.#loop) return;
      const tick=async()=>{ try{ await this.update(); }finally{ this.#loop=setTimeout(tick,ms);} };
      tick();
    }
    stop(){ clearTimeout(this.#loop); this.#loop=null; }

    destroy(){ this.stop(); this.stylesManager.clear(); this.#actions={}; this.emit('destroy'); }
  }

  // ==========================================================================
  // Export
  // ==========================================================================
  window.Theme = Theme;
  const existing = window.Library || {};
  window.Library = Object.assign(existing, {
    EventEmitter, StylesManager, SettingsManager, UI: UIHelpers,
    PlayerEvents, Theme, coverURL, getHiResCover
  });

  console.log('Library loaded ✓');

  // ==========================================================================
  // Debug panel
  // ==========================================================================
  Library.debugUI = true;
  Library.debug = (() => {
    const BOX_ID = 'SM_DebugBox';
    function ensure() {
      let box = document.getElementById(BOX_ID);
      if (box) return box;
      box = document.createElement('div');
      box.id = BOX_ID;
      box.innerHTML = `
        <div class="hdr">
          <strong>UI Debug</strong>
          <div class="btns">
            <button data-act="clear" title="Очистить">✕</button>
            <button data-act="hide"  title="Скрыть">⤫</button>
          </div>
        </div>
        <div class="body"></div>
      `;
      Object.assign(box.style, {
        position: 'fixed', right: '12px', bottom: '12px', zIndex: 999999,
        width: '380px', maxWidth: '90vw', height: '220px', maxHeight: '50vh',
        borderRadius: '12px', overflow: 'hidden',
        background: 'rgba(20,20,25,.9)', color: '#ddd',
        font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        boxShadow: '0 8px 28px rgba(0,0,0,.45)', backdropFilter: 'blur(6px)'
      });
      const hdr = box.querySelector('.hdr');
      Object.assign(hdr.style, { display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,.06)', padding:'6px 8px' });
      const btns = box.querySelector('.btns');
      Object.assign(btns.style, { display:'flex', gap:'6px' });
      for (const b of btns.querySelectorAll('button')) {
        Object.assign(b.style, { background:'rgba(255,255,255,.08)', color:'#eee', border:'none', borderRadius:'6px', padding:'2px 6px', cursor:'pointer' });
      }
      const body = box.querySelector('.body');
      Object.assign(body.style, { padding:'6px 8px', height:'calc(100% - 34px)', overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word' });

      box.addEventListener('click', (e) => {
        const act = e.target?.dataset?.act;
        if (act === 'clear') body.textContent = '';
        if (act === 'hide')  box.style.display = 'none';
      });

      document.body.appendChild(box);
      return box;
    }
    function fmt(arg){ if (arg == null) return String(arg); if (typeof arg === 'string') return arg; try { return JSON.stringify(arg); } catch { return String(arg); } }
    function log(...args) {
      if (!Library.debugUI) return;
      const box = ensure();
      const body = box.querySelector('.body');
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString()}] ` + args.map(fmt).join(' ');
      body.appendChild(line);
      body.scrollTop = body.scrollHeight;
      try { console.log('[UI]', ...args); } catch {}
    }
    function clear(){ const box = document.getElementById(BOX_ID); if (box) box.querySelector('.body').textContent = ''; }
    function toggle(){ Library.debugUI = !Library.debugUI; const box = ensure(); box.style.display = Library.debugUI ? '' : 'none'; }
    return { log, clear, toggle, ensure };
  })();

})();
