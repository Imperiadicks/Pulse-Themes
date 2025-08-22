// ============================================================================
// Main.js — Open-Blocker Suite (v4.0.0, RADICAL • 600+ lines)
// Авторский рефакторинг под твой проект SpotCol/YamSpot.
// Фокус: ИДЕАЛЬНО продуманный Open-Blocker с экспортом/импортом, профилями,
// манифестом, категориями, валидацией применения, ретраями, телеметрией,
// событиями, режимом dry-run, diff-применением и совместимостью с handle.
//
// ❗ Ничего «внешнего» не требует (кроме fetch raw CSS), не лезет в Theme/Library,
// но автоматически подцепится, если есть window.Theme.settingsManager.
// Все публичные API экспортируются как window.OpenBlocker и Theme.OpenBlocker.
// ============================================================================

(() => {
  'use strict';

  const VERSION = '1.0.0';
  const NAMESPACE = 'OpenBlocker';
  const GH_BASE = 'https://raw.githubusercontent.com/Imperiadicks/SpotCol-Scripts/main/Assets/blocker-css';
  const MANIFEST_URL = `${GH_BASE}/manifest.json`; // опционально; будет fallback, если нет
  const MAX_PARALLEL_FETCHES = 5;                   // ограничение на одновременные загрузки CSS
  const DEFAULT_FETCH_TIMEOUT = 12000;              // мс
  const DEFAULT_RETRY = { attempts: 3, backoffMs: 600, factor: 1.8 };
  const LOG_PREFIX = '[OB]';
  const PODCASTS_PROTECT_STYLE_ID = 'ob-protect-podcasts-visibility';

  // ----------------------------------------------------------------------------
  // 0) БАЗОВЫЕ УТИЛИТЫ
  // ----------------------------------------------------------------------------
  const U = {
    now: () => Date.now(),
    clamp(n, min, max) { return Math.max(min, Math.min(max, n)); },
    isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); },
    isBool(x) { return typeof x === 'boolean'; },
    isStr(x) { return typeof x === 'string'; },
    isFn(x) { return typeof x === 'function'; },
    noop() {},
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    djb2(str) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
      return (h >>> 0).toString(16);
    },
    stableStringify(obj) {
      const seen = new WeakSet();
      const norm = (o) => {
        if (!U.isObj(o) && !Array.isArray(o)) return o;
        if (seen.has(o)) return '[Circular]';
        seen.add(o);
        if (Array.isArray(o)) return o.map(norm);
        const out = {};
        Object.keys(o).sort().forEach(k => out[k] = norm(o[k]));
        return out;
      };
      return JSON.stringify(norm(obj));
    },
    deepGet(obj, path, def) {
      try {
        const parts = String(path).split('.');
        let cur = obj;
        for (const p of parts) cur = cur?.[p];
        return cur === undefined ? def : cur;
      } catch { return def; }
    },
    deepSet(obj, path, val) {
      const parts = String(path).split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!U.isObj(cur[p])) cur[p] = {};
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = val;
      return obj;
    },
    merge(target, src) {
      if (!U.isObj(target) || !U.isObj(src)) return src;
      for (const k of Object.keys(src)) {
        const sv = src[k];
        if (U.isObj(sv)) {
          if (!U.isObj(target[k])) target[k] = {};
          U.merge(target[k], sv);
        } else {
          target[k] = sv;
        }
      }
      return target;
    },
    throttle(fn, ms) {
      let last = 0, timer = null, pendingArgs = null;
      return (...args) => {
        const now = U.now();
        const remain = ms - (now - last);
        if (remain <= 0) {
          last = now;
          fn(...(pendingArgs || args));
          pendingArgs = null;
        } else {
          pendingArgs = args;
          if (!timer) {
            timer = setTimeout(() => {
              last = U.now();
              timer = null;
              fn(...(pendingArgs || []));
              pendingArgs = null;
            }, remain);
          }
        }
      };
    },
    debounce(fn, ms) {
      let t = null;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    },
    withTimeout(promise, ms, label = 'timeout') {
      let t;
      const timeout = new Promise((_, rej) => (t = setTimeout(() => rej(new Error(label)), ms)));
      return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
    },
    async retry(fn, { attempts, backoffMs, factor } = DEFAULT_RETRY) {
      let lastErr;
      let delay = backoffMs;
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn(i);
        } catch (e) {
          lastErr = e;
          if (i < attempts - 1) {
            await U.sleep(delay);
            delay = Math.ceil(delay * factor);
          }
        }
      }
      throw lastErr;
    },
    parallelLimit(items, limit, worker) {
      return new Promise((resolve, reject) => {
        let i = 0, active = 0, done = 0, results = new Array(items.length);
        const next = () => {
          while (active < limit && i < items.length) {
            const idx = i++, it = items[idx];
            active++;
            Promise.resolve(worker(it, idx))
              .then(res => { results[idx] = res; })
              .catch(reject)
              .finally(() => {
                active--; done++;
                if (done === items.length) resolve(results);
                else next();
              });
          }
        };
        next();
      });
    },
    log(...a) { console.log(LOG_PREFIX, ...a); },
    warn(...a) { console.warn(LOG_PREFIX, ...a); },
    error(...a) { console.error(LOG_PREFIX, ...a); },
  };

  // ----------------------------------------------------------------------------
  // 1) ПРОСТОЙ EMITTER (события)
  // ----------------------------------------------------------------------------
  class Emitter {
    constructor() { this._m = new Map(); }
    on(ev, fn) {
      if (!this._m.has(ev)) this._m.set(ev, new Set());
      this._m.get(ev).add(fn);
      return () => this.off(ev, fn);
    }
    off(ev, fn) {
      const s = this._m.get(ev);
      if (s) s.delete(fn);
    }
    emit(ev, payload) {
      const s = this._m.get(ev);
      if (!s || s.size === 0) return;
      for (const fn of [...s]) {
        try { fn(payload); } catch (e) { U.error('emit error', ev, e); }
      }
    }
    once(ev, fn) {
      const off = this.on(ev, (p) => { off(); fn(p); });
    }
  }

  // ----------------------------------------------------------------------------
  // 2) CSS-МЕНЕДЖЕР
  // ----------------------------------------------------------------------------
  const CSS = {
    ensure(id) {
      let st = document.getElementById(id);
      if (!st) {
        st = document.createElement('style');
        st.id = id;
        document.head.appendChild(st);
      }
      return st;
    },
    set(id, css) {
      this.ensure(id).textContent = css;
    },
    remove(id) {
      document.getElementById(id)?.remove();
    },
    has(id) {
      return !!document.getElementById(id);
    },
    count(prefix = '') {
      const list = [...document.querySelectorAll('style[id]')].map(x => x.id);
      return prefix ? list.filter(id => id.startsWith(prefix)).length : list.length;
    }
  };

  // ----------------------------------------------------------------------------
  // 3) HTTP (fetch с ретраями/таймаутом/кэшем)
  // ----------------------------------------------------------------------------
  const HttpCache = new Map(); // key -> { text, ts }
  async function fetchText(url, { timeout = DEFAULT_FETCH_TIMEOUT, useCache = true, cacheTtl = 120000 } = {}) {
    const key = `${url}`;
    const now = U.now();
    if (useCache && HttpCache.has(key)) {
      const c = HttpCache.get(key);
      if (now - c.ts < cacheTtl) return c.text;
    }
    const run = async () => {
      const resp = await U.withTimeout(fetch(url, { cache: 'no-store' }), timeout, 'fetch-timeout');
      if (!resp.ok) throw new Error(`HTTP ${resp.status} @ ${url}`);
      return await resp.text();
    };
    const text = await U.retry(run, DEFAULT_RETRY);
    if (useCache) HttpCache.set(key, { text, ts: now });
    return text;
  }

  // ----------------------------------------------------------------------------
  // 4) МАНИФЕСТ МОДУЛЕЙ + КАТЕГОРИИ (fallback, если нет manifest.json)
  // ----------------------------------------------------------------------------
  const FALLBACK_MANIFEST = {
    version: 1,
    categories: {
      core: ['globaltabs', 'relevantnow', 'instyle', 'waves'],
      discovery: ['newreleases', 'editorialnewreleases', 'mixedblock', 'newplaylists', 'charttracks', 'chartalbums'],
      personal: ['personalartists', 'personalplaylists', 'smartopenplaylist', 'likesandhistory', 'continuelisten'],
      editorial: ['editorialartists', 'artistrecommends', 'nonmusiceditorialcompilation', 'openplaylist', 'recommendedplaylists'],
      extras: ['donations', 'concerts', 'userprofile', 'trailers', 'betabutton', 'neuromusic', 'barbelow', 'vibeanimation', 'mixesgrid'],
      audio: ['podcasts']
    },
    modules: {
      donations:       { id: 'donations',       path: 'donations.css',       title: 'Donations' },
      concerts:        { id: 'concerts',        path: 'concerts.css',        title: 'Concerts' },
      userprofile:     { id: 'userprofile',     path: 'userprofile.css',     title: 'User Profile' },
      trailers:        { id: 'trailers',        path: 'trailers.css',        title: 'Trailers' },
      betabutton:      { id: 'betabutton',      path: 'betabutton.css',      title: 'Beta Button' },
      vibeanimation:   { id: 'vibeanimation',   path: 'vibeanimation.css',   title: 'Vibe Animation' },
      globaltabs:      { id: 'globaltabs',      path: 'globaltabs.css',      title: 'Global Tabs' },
      relevantnow:     { id: 'relevantnow',     path: 'relevantnow.css',     title: 'Relevant Now' },
      instyle:         { id: 'instyle',         path: 'instyle.css',         title: 'In Style' },
      likesandhistory: { id: 'likesandhistory', path: 'likesandhistory.css', title: 'Likes & History' },
      neuromusic:      { id: 'neuromusic',      path: 'neuromusic.css',      title: 'Neuro Music' },
      newreleases:     { id: 'newreleases',     path: 'newreleases.css',     title: 'New Releases' },
      personalartists: { id: 'personalartists', path: 'personalartists.css', title: 'Personal Artists' },
      personalplaylists:{id:'personalplaylists',path:'personalplaylists.css', title: 'Personal Playlists' },
      recommendedplaylists:{id:'recommendedplaylists',path:'recommendedplaylists.css', title: 'Recommended Playlists' },
      smartopenplaylist:{ id:'smartopenplaylist',path:'smartopenplaylist.css', title:'Smart Open Playlist' },
      waves:           { id: 'waves',           path: 'waves.css',           title: 'Waves' },
      charttracks:     { id: 'charttracks',     path: 'charttracks.css',     title: 'Chart Tracks' },
      artistrecommends:{ id:'artistrecommends', path:'artistrecommends.css', title:'Artist Recommends' },
      barbelow:        { id: 'barbelow',        path: 'barbelow.css',        title: 'Bar Below' },
      podcasts:        { id: 'podcasts',        path: 'podcasts.css',        title: 'Podcasts' },
      chartalbums:     { id: 'chartalbums',     path: 'chartalbums.css',     title: 'Chart Albums' },
      continuelisten:  { id: 'continuelisten',  path: 'continuelisten.css',  title: 'Continue Listen' },
      editorialartists:{ id:'editorialartists', path:'editorialartists.css', title:'Editorial Artists' },
      editorialnewreleases:{id:'editorialnewreleases',path:'editorialnewreleases.css', title:'Editorial New Releases'},
      mixedblock:      { id: 'mixedblock',      path: 'mixedblock.css',      title: 'Mixed Block' },
      mixesgrid:       { id: 'mixesgrid',       path: 'mixesgrid.css',       title: 'Mixes Grid' },
      newplaylists:    { id: 'newplaylists',    path: 'newplaylists.css',    title: 'New Playlists' },
      nonmusiceditorialcompilation:{id:'nonmusiceditorialcompilation',path:'nonmusiceditorialcompilation.css',title:'Non-Music Editorial Compilation'},
      openplaylist:    { id: 'openplaylist',    path: 'openplaylist.css',    title: 'Open Playlist' }
    }
  };

  async function loadManifest() {
    try {
      const text = await fetchText(MANIFEST_URL, { cacheTtl: 60000 });
      const data = JSON.parse(text);
      // простая валидация
      if (!U.isObj(data) || !U.isObj(data.modules)) throw new Error('Bad manifest');
      return data;
    } catch (e) {
      U.warn('manifest fallback:', e.message);
      return FALLBACK_MANIFEST;
    }
  }

  // ----------------------------------------------------------------------------
  // 5) СОСТОЯНИЕ OB + НАСТРОЙКИ + ТЕЛЕМЕТРИЯ
  // ----------------------------------------------------------------------------
  const State = {
    manifest: null,      // { modules, categories, version }
    globalEnabled: false,
    modules: new Map(),  // id -> { enabled:boolean, reason?:string, cssId:string }
    overrides: {         // локальные переопределения (над handle)
      allow: new Set(),  // форс-включить
      block: new Set()   // форс-выключить
    },
    // сохранённые источники CSS (id->css), чтобы не грузить повторно при diff-применении
    sources: new Map(),
    // валидация применённых слоёв
    applied: new Set(),  // id модулей, реально присутствующих в DOM
    // телеметрия
    metrics: {
      lastApplyTs: 0,
      lastSig: '',
      fetchOk: 0, fetchFail: 0,
      applyOk: 0, applyFail: 0,
      removed: 0
    },
    // конфигурация
    config: {
      baseUrl: GH_BASE,
      fetchTimeout: DEFAULT_FETCH_TIMEOUT,
      retry: DEFAULT_RETRY,
      parallel: MAX_PARALLEL_FETCHES,
      podcastsProtect: true,  // включать защиту видимости «Подкасты»
      dryRun: false,          // если true — ничего не инжектим, только считаем diff
      logLevel: 'info'        // info|warn|error|silent
    }
  };

  const Log = {
    ok(...a) { if (State.config.logLevel === 'info') U.log(...a); },
    info(...a) { if (State.config.logLevel === 'info') U.log(...a); },
    warn(...a) { if (State.config.logLevel !== 'silent') U.warn(...a); },
    err(...a) { if (State.config.logLevel !== 'silent') U.error(...a); }
  };

  // ----------------------------------------------------------------------------
  // 6) КЛЮЧИ HANDLE + СВЯЗКА С settingsManager
  // ----------------------------------------------------------------------------
  const Handle = {
    sm:
      window?.Theme?.settingsManager ||
      window?.SpotColЛичная?.settingsManager ||
      window?.settingsManager ||
      window?.SettingsManager || null,

    // ключи: глобальный включатель + алиасы модулей
    keyGlobal: ['OpenBlocker.enabled', 'OB.enabled', 'blocker.enabled'],
    keyAliasesFor(id) {
      return [`OpenBlocker.${id}`, `OB.${id}`, `blocker.${id}`, id];
    },

    getRaw(key) {
      try {
        const sm = this.sm;
        if (!sm) return undefined;
        if (U.isFn(sm.get)) {
          const v = sm.get(key);
          return v && typeof v === 'object' && 'value' in v ? v.value : v;
        }
        const v = U.deepGet(sm.settings, key);
        return v && typeof v === 'object' && 'value' in v ? v.value : v;
      } catch { return undefined; }
    },
    read(keys, def) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        const v = this.getRaw(k);
        if (v !== undefined) return v;
      }
      return def;
    },
    bool(keys, def = false) {
      const v = this.read(keys, undefined);
      if (v === undefined) return def;
      return !!v;
    },
    async update() {
      try { await this.sm?.update?.(); } catch {}
    }
  };

  // ----------------------------------------------------------------------------
  // 7) БАЗОВЫЕ РАСЧЕТЫ СОСТОЯНИЯ (global + module -> enabled?)
  // ----------------------------------------------------------------------------
  function computeModuleEnabled(id) {
    // локальные форсы
    if (State.overrides.allow.has(id)) return true;
    if (State.overrides.block.has(id)) return false;

    // явное значение в handle
    const exp = Handle.read(Handle.keyAliasesFor(id), undefined);
    if (U.isBool(exp)) return exp;

    // иначе глобальный флаг
    return !!State.globalEnabled;
  }

  function computeAllEnabled() {
    const res = {};
    for (const id of Object.keys(State.manifest.modules)) {
      res[id] = computeModuleEnabled(id);
    }
    return res;
  }

  function signature() {
    const obj = {
      g: !!State.globalEnabled,
      oA: [...State.overrides.allow].sort(),
      oB: [...State.overrides.block].sort()
    };
    // значения модулей из handle (только явные)
    const exp = {};
    for (const id of Object.keys(State.manifest.modules)) {
      const v = Handle.read(Handle.keyAliasesFor(id), null);
      if (v !== null && v !== undefined) exp[id] = !!v;
    }
    obj.e = exp;
    return U.stableStringify(obj);
  }

  // ----------------------------------------------------------------------------
  // 8) ПРИМЕНЕНИЕ (diff, загрузка CSS, инжект/удаление)
  // ----------------------------------------------------------------------------
  const OBEvents = new Emitter();

  function cssIdFor(id) {
    return `ob-css-${id}`;
  }

  async function ensurePodcastsVisible(forceOn) {
    const id = PODCASTS_PROTECT_STYLE_ID;
    if (forceOn) {
      CSS.set(id, `
        /* OB Protect: Podcasts visibility */
        [class*="Podcasts_root"],
        [data-block-id*="podcast"],
        [data-test-id*="podcast"],
        a[href*="/podcasts"] { display: initial !important; visibility: visible !important; }
      `);
    } else {
      CSS.remove(id);
    }
  }

  async function fetchCssFor(id, path) {
    const url = `${State.config.baseUrl}/${encodeURIComponent(path)}`;
    // кеш на уровне State.sources
    if (State.sources.has(id)) return State.sources.get(id);

    const text = await fetchText(url, {
      timeout: State.config.fetchTimeout,
      useCache: true,
      cacheTtl: 5 * 60_000
    });
    State.sources.set(id, text);
    return text;
  }

  async function applyDiff({ enableIds = [], disableIds = [] }) {
    const results = { enabled: [], disabled: [], errors: [] };

    // особая обработка подкастов
    const podcastsGoingToEnable = enableIds.includes('podcasts') || (State.config.podcastsProtect && State.globalEnabled);
    await ensurePodcastsVisible(podcastsGoingToEnable);

    // Ограничиваем параллелизм, чтобы не положить среду
    await U.parallelLimit(enableIds, State.config.parallel, async (id) => {
      try {
        const mod = State.manifest.modules[id];
        if (!mod) throw new Error(`Unknown module: ${id}`);
        const css = await fetchCssFor(id, mod.path);
        if (!State.config.dryRun) CSS.set(cssIdFor(id), css);
        State.applied.add(id);
        State.metrics.applyOk++;
        results.enabled.push(id);
        OBEvents.emit('module:enabled', { id });
      } catch (e) {
        State.metrics.applyFail++;
        results.errors.push({ id, error: String(e.message || e) });
        Log.err('apply enable fail', id, e);
      }
    });

    for (const id of disableIds) {
      try {
        if (!State.config.dryRun) CSS.remove(cssIdFor(id));
        State.applied.delete(id);
        State.metrics.removed++;
        results.disabled.push(id);
        OBEvents.emit('module:disabled', { id });
      } catch (e) {
        results.errors.push({ id, error: String(e.message || e) });
        Log.err('apply disable fail', id, e);
      }
    }

    OBEvents.emit('apply:diff', { enableIds, disableIds, results });
    return results;
  }

  async function applyAll(force = false) {
    if (!State.manifest) {
      State.manifest = await loadManifest();
    }
    // глобальный флаг
    State.globalEnabled = Handle.bool(Handle.keyGlobal, State.globalEnabled);

    // список ожидаемых состояний
    const expected = computeAllEnabled();

    // текущие состояния (в DOM)
    const currentlyOn = new Set([...State.applied]); // копия
    const mustOn = new Set();
    const mustOff = new Set();

    for (const id of Object.keys(expected)) {
      if (expected[id]) {
        mustOn.add(id);
      } else {
        mustOff.add(id);
      }
    }

    const toEnable = [];
    const toDisable = [];

    // diff enable
    for (const id of mustOn) {
      if (force || !currentlyOn.has(id) || !CSS.has(cssIdFor(id))) {
        toEnable.push(id);
      }
    }
    // diff disable
    for (const id of mustOff) {
      if (currentlyOn.has(id) || CSS.has(cssIdFor(id))) {
        toDisable.push(id);
      }
    }

    // применяем
    const res = await applyDiff({ enableIds: toEnable, disableIds: toDisable });

    State.metrics.lastApplyTs = U.now();
    State.metrics.lastSig = signature();

    OBEvents.emit('apply:complete', {
      toEnable, toDisable, res, metrics: { ...State.metrics }
    });

    return res;
  }

  // ----------------------------------------------------------------------------
  // 9) ПУБЛИЧНЫЙ API: enable/disable/toggle, категории, профили, экспорт/импорт
  // ----------------------------------------------------------------------------
  function listModules() {
    const m = State.manifest?.modules || {};
    return Object.keys(m).sort();
  }

  function listCategories() {
    const c = State.manifest?.categories || {};
    return Object.keys(c).sort();
  }

  function modulesByCategory(cat) {
    const c = State.manifest?.categories || {};
    return (c[cat] || []).slice();
  }

  function getState(id) {
    const enabled = computeModuleEnabled(id);
    const applied = State.applied.has(id) && CSS.has(cssIdFor(id));
    const explicit = Handle.read(Handle.keyAliasesFor(id), null);
    const forced = State.overrides.allow.has(id) ? 'allow' :
                   State.overrides.block.has(id) ? 'block' : null;
    return { id, enabled, applied, explicit, forced };
  }

  function getStates() {
    const res = {};
    for (const id of listModules()) res[id] = getState(id);
    return res;
  }

  function setGlobal(value) {
    State.globalEnabled = !!value;
    OBEvents.emit('global:set', { value: !!value });
    return applyAll();
  }

  function enable(id, reason = 'manual') {
    State.overrides.block.delete(id);
    State.overrides.allow.add(id);
    OBEvents.emit('module:override', { id, action: 'allow', reason });
    return applyAll();
  }

  function disable(id, reason = 'manual') {
    State.overrides.allow.delete(id);
    State.overrides.block.add(id);
    OBEvents.emit('module:override', { id, action: 'block', reason });
    return applyAll();
  }

  function toggle(id, reason = 'manual') {
    const st = computeModuleEnabled(id);
    return st ? disable(id, reason) : enable(id, reason);
  }

  function clearOverrides() {
    State.overrides.allow.clear();
    State.overrides.block.clear();
    OBEvents.emit('override:clear');
    return applyAll();
  }

  function enableCategory(cat, reason = 'category') {
    for (const id of modulesByCategory(cat)) {
      State.overrides.block.delete(id);
      State.overrides.allow.add(id);
    }
    OBEvents.emit('category:allow', { cat, ids: modulesByCategory(cat) });
    return applyAll();
  }

  function disableCategory(cat, reason = 'category') {
    for (const id of modulesByCategory(cat)) {
      State.overrides.allow.delete(id);
      State.overrides.block.add(id);
    }
    OBEvents.emit('category:block', { cat, ids: modulesByCategory(cat) });
    return applyAll();
  }

  function enableAll(reason = 'bulk') {
    for (const id of listModules()) {
      State.overrides.block.delete(id);
      State.overrides.allow.add(id);
    }
    OBEvents.emit('bulk:allow', { ids: listModules() });
    return applyAll();
  }

  function disableAll(reason = 'bulk') {
    for (const id of listModules()) {
      State.overrides.allow.delete(id);
      State.overrides.block.add(id);
    }
    OBEvents.emit('bulk:block', { ids: listModules() });
    return applyAll();
  }

  // ---- Профили (наборы включений) -------------------------------------------
  const Profiles = {
    // минимальный незашумлённый набор
    minimal() {
      return {
        global: false,
        allow: ['globaltabs', 'relevantnow', 'instyle', 'waves', 'podcasts'],
        block: []
      };
    },
    // «персональный контент первым делом»
    personalFirst() {
      return {
        global: false,
        allow: ['personalartists','personalplaylists','likesandhistory','continuelisten','podcasts'],
        block: []
      };
    },
    // «всё, что повышает discovery»
    discoveryBoost() {
      return {
        global: false,
        allow: ['newreleases','editorialnewreleases','mixedblock','newplaylists','charttracks','chartalbums','recommendedplaylists','openplaylist','podcasts'],
        block: []
      };
    },
    // «жёсткий шумоподавитель» — включаем глобальный и блокируем лишнее
    strict() {
      return {
        global: true, // всё включено по умолчанию
        allow: [],
        block: ['donations','trailers','betabutton','vibeanimation','barbelow'] // явные блокировки
      };
    }
  };

  function applyProfile(profile) {
    if (U.isStr(profile) && U.isFn(Profiles[profile])) {
      profile = Profiles[profile]();
    }
    if (!U.isObj(profile)) throw new Error('Bad profile');
    // применяем
    State.globalEnabled = !!profile.global;
    State.overrides.allow = new Set(profile.allow || []);
    State.overrides.block = new Set(profile.block || []);
    OBEvents.emit('profile:applied', { profile });
    return applyAll(true);
  }

  // ---- Экспорт/импорт --------------------------------------------------------
  function exportPlain() {
    // без handle-формата: только overrides + global
    const out = {
      version: VERSION,
      global: !!State.globalEnabled,
      allow: [...State.overrides.allow].sort(),
      block: [...State.overrides.block].sort()
    };
    return JSON.stringify(out, null, 2);
  }

  function importPlain(jsonOrObj) {
    const obj = U.isStr(jsonOrObj) ? JSON.parse(jsonOrObj) : jsonOrObj;
    if (!U.isObj(obj)) throw new Error('Bad import object');
    if (obj.global !== undefined) State.globalEnabled = !!obj.global;
    State.overrides.allow = new Set(Array.isArray(obj.allow) ? obj.allow : []);
    State.overrides.block = new Set(Array.isArray(obj.block) ? obj.block : []);
    OBEvents.emit('import:plain', { obj });
    return applyAll(true);
  }

  function exportHandlePatch() {
    // готовим «патч» для handle: ключи OpenBlocker.enabled + OpenBlocker.<id>
    const patch = {};
    patch['OpenBlocker.enabled'] = { value: !!State.globalEnabled };
    for (const id of listModules()) {
      // если модуль переопределён, пишем явное значение; иначе — ничего (пусть наследуется)
      if (State.overrides.allow.has(id)) {
        patch[`OpenBlocker.${id}`] = { value: true };
      } else if (State.overrides.block.has(id)) {
        patch[`OpenBlocker.${id}`] = { value: false };
      }
    }
    return JSON.stringify(patch, null, 2);
  }

  function importHandlePatch(jsonOrObj) {
    const obj = U.isStr(jsonOrObj) ? JSON.parse(jsonOrObj) : jsonOrObj;
    if (!U.isObj(obj)) throw new Error('Bad handle patch');
    // применяем только те ключи, которые понимаем
    if ('OpenBlocker.enabled' in obj) {
      const v = obj['OpenBlocker.enabled'];
      State.globalEnabled = !!(U.isObj(v) ? v.value : v);
    }
    const allow = new Set(State.overrides.allow);
    const block = new Set(State.overrides.block);
    for (const id of listModules()) {
      const key = `OpenBlocker.${id}`;
      if (key in obj) {
        const v = obj[key];
        const bool = !!(U.isObj(v) ? v.value : v);
        if (bool) { allow.add(id); block.delete(id); }
        else { block.add(id); allow.delete(id); }
      }
    }
    State.overrides.allow = allow;
    State.overrides.block = block;
    OBEvents.emit('import:handle', { obj });
    return applyAll(true);
  }

  // ---- Валидация/здоровье ----------------------------------------------------
  function health() {
    const issues = [];
    // проверим присутствие стилевых слоёв для включенных модулей
    const expected = computeAllEnabled();
    for (const id of Object.keys(expected)) {
      const should = !!expected[id];
      const has = CSS.has(cssIdFor(id));
      if (should && !has) issues.push({ id, type: 'missing-style' });
      if (!should && has) issues.push({ id, type: 'stale-style' });
    }
    // проверим защиту подкастов
    if (State.config.podcastsProtect && expected.podcasts && !CSS.has(PODCASTS_PROTECT_STYLE_ID)) {
      issues.push({ id: 'podcasts', type: 'missing-podcast-protect' });
    }
    return {
      ok: issues.length === 0,
      issues,
      metrics: { ...State.metrics },
      globalEnabled: !!State.globalEnabled,
      overrides: {
        allow: [...State.overrides.allow],
        block: [...State.overrides.block]
      }
    };
  }

  async function reconcile() {
    // резинхронизация с DOM и handle (мягкая)
    await Handle.update();
    const s = signature();
    if (s !== State.metrics.lastSig) {
      Log.info('signature changed → reapply');
      await applyAll();
    } else {
      // мягкая валидация DOM
      const h = health();
      if (!h.ok) {
        Log.warn('health discrepancies → fixing', h.issues);
        await applyAll();
      }
    }
  }

  // ---- Конфиг ----------------------------------------------------------------
  function setConfig(partial) {
    if (!U.isObj(partial)) return getConfig();
    U.merge(State.config, partial);
    OBEvents.emit('config:changed', { config: getConfig() });
    return getConfig();
  }
  function getConfig() {
    return JSON.parse(JSON.stringify(State.config));
  }

  // ---- Вспомогательные шорткаты ---------------------------------------------
  function on(event, fn) { return OBEvents.on(event, fn); }
  function off(event, fn) { return OBEvents.off(event, fn); }

  // ----------------------------------------------------------------------------
  // 10) ИНИЦИАЛИЗАЦИЯ / ВОТЧЕРЫ
  // ----------------------------------------------------------------------------
  async function init() {
    Log.info(`Open-Blocker ${VERSION} boot`);
    State.manifest = await loadManifest();

    // первоначальное чтение global
    State.globalEnabled = Handle.bool(Handle.keyGlobal, State.globalEnabled);

    // первая сборка
    await applyAll(true);

    // вотчер handle — безопасный, интервалный
    setInterval(() => { reconcile().catch(e => Log.err('reconcile err', e)); }, 1000);

    // событие «готовности»
    OBEvents.emit('ready', { version: VERSION, modules: listModules() });

    // небольшой баннер-пинг (чтобы было видно запуск без DevTools)
    try {
      const el = document.createElement('div');
      el.textContent = `OB ${VERSION} ready`;
      el.style.cssText = `
        position: fixed; left: 10px; top: 10px; z-index: 2147483647;
        padding: 6px 10px; background: rgba(0,0,0,.65); color: #fff;
        font: 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        border-radius: 6px; pointer-events: none; opacity: 0; transition: .25s ease;
      `;
      document.documentElement.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = '1'));
      setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2200);
    } catch {}
  }

  // ----------------------------------------------------------------------------
  // 11) ПУБЛИЧНЫЙ ОБЪЕКТ API
  // ----------------------------------------------------------------------------
  const API = {
    // версия/инфо
    version: VERSION,
    listModules,
    listCategories,
    modulesByCategory,
    getState,
    getStates,
    health,
    // включение/выключение
    setGlobal,
    enable,
    disable,
    toggle,
    clearOverrides,
    enableCategory,
    disableCategory,
    enableAll,
    disableAll,
    // профили
    Profiles,
    applyProfile,
    // применение/ресинх
    applyAll,
    reconcile,
    // экспорт/импорт
    exportPlain,
    importPlain,
    exportHandlePatch,
    importHandlePatch,
    // конфиг
    setConfig,
    getConfig,
    // события
    on, off,
    // низкоуровневое
    _state: State,
    _manifest: () => State.manifest
  };

  // ----------------------------------------------------------------------------
  // 12) ЭКСПОРТ В ГЛОБАЛ
  // ----------------------------------------------------------------------------
  window.OpenBlocker = API;
  if (window.Theme) {
    window.Theme.OpenBlocker = API;
  }

  // ----------------------------------------------------------------------------
  // 13) СТАРТ
  // ----------------------------------------------------------------------------
  (async () => {
    try {
      await init();
    } catch (e) {
      Log.err('init fail', e);
    }
  })();

  // ----------------------------------------------------------------------------
  // 14) ДОПОЛНИТЕЛЬНЫЙ РАЗДЕЛ: CLI-УТИЛИТЫ (для удобства через консоль)
  // ----------------------------------------------------------------------------
  // Примеры:
  // OpenBlocker.cli('profile strict')
  // OpenBlocker.cli('global on')
  // OpenBlocker.cli('enable podcasts')
  // OpenBlocker.cli('disable donations')
  // OpenBlocker.cli('category enable discovery')
  // OpenBlocker.cli('export plain')
  // OpenBlocker.cli('export handle')
  // OpenBlocker.cli('import plain {"global":false,"allow":["podcasts"],"block":[]}')
  // OpenBlocker.cli('dryrun on')
  // OpenBlocker.cli('config {"logLevel":"info"}')
  API.cli = async function cli(input) {
    try {
      if (!U.isStr(input)) return 'usage: see comments';
      const [cmd, ...rest] = input.trim().split(/\s+/);
      switch (cmd) {
        case 'version':
          return VERSION;

        case 'global': {
          const v = (rest[0] || '').toLowerCase();
          if (v === 'on' || v === 'true' || v === '1') return setGlobal(true);
          if (v === 'off' || v === 'false' || v === '0') return setGlobal(false);
          return getState('__global');
        }

        case 'enable': {
          const id = rest[0];
          return enable(id);
        }
        case 'disable': {
          const id = rest[0];
          return disable(id);
        }
        case 'toggle': {
          const id = rest[0];
          return toggle(id);
        }
        case 'category': {
          const action = rest[0];
          const cat = rest[1];
          if (action === 'enable') return enableCategory(cat);
          if (action === 'disable') return disableCategory(cat);
          throw new Error('category action = enable|disable');
        }
        case 'profile': {
          const name = rest[0];
          return applyProfile(name);
        }
        case 'export': {
          const kind = (rest[0] || 'plain').toLowerCase();
          if (kind === 'plain') return exportPlain();
          if (kind === 'handle') return exportHandlePatch();
          throw new Error('export kind = plain|handle');
        }
        case 'import': {
          const kind = (rest[0] || 'plain').toLowerCase();
          const json = rest.slice(1).join(' ');
          if (kind === 'plain') return importPlain(json);
          if (kind === 'handle') return importHandlePatch(json);
          throw new Error('import kind = plain|handle');
        }
        case 'apply':
          return applyAll(true);

        case 'reconcile':
          return reconcile();

        case 'list':
          return listModules();

        case 'health':
          return health();

        case 'config': {
          const json = rest.join(' ');
          if (!json) return getConfig();
          try { return setConfig(JSON.parse(json)); }
          catch { throw new Error('bad json'); }
        }

        case 'dryrun': {
          const v = (rest[0] || '').toLowerCase();
          if (v === 'on' || v === 'true' || v === '1') { setConfig({ dryRun: true }); return getConfig(); }
          if (v === 'off' || v === 'false' || v === '0') { setConfig({ dryRun: false }); return getConfig(); }
          return getConfig();
        }

        default:
          return `unknown cmd: ${cmd}`;
      }
    } catch (e) {
      return `cli error: ${e.message || e}`;
    }
  };

  // ----------------------------------------------------------------------------
  // 15) ДОП. ЗАЩИТА ПОДКАСТОВ (минимальный контроль внешних вмешательств)
  // ----------------------------------------------------------------------------
  // Иногда сторонние стили/эксперименты скрывают раздел подкастов. Этот observer
  // мягко возвращает видимость, если включён модуль podcasts.
  try {
    const mo = new MutationObserver(U.throttle(() => {
      const enabled = computeModuleEnabled('podcasts');
      if (enabled && State.config.podcastsProtect) {
        if (!CSS.has(PODCASTS_PROTECT_STYLE_ID)) {
          ensurePodcastsVisible(true);
        }
      }
    }, 600));
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  } catch {}

  // ----------------------------------------------------------------------------
  // 16) ДОК-СТРОКА (быстрый self-help в консоли)
  // ----------------------------------------------------------------------------
  Object.defineProperty(API, 'help', {
    get() {
      return [
        `Open-Blocker ${VERSION} — API`,
        'open: OpenBlocker.getState(id) / getStates() / listModules() / listCategories()',
        'control: setGlobal(bool), enable(id), disable(id), toggle(id), clearOverrides()',
        'category: enableCategory(name), disableCategory(name)',
        'bulk: enableAll(), disableAll()',
        'profiles: applyProfile("minimal"|"personalFirst"|"discoveryBoost"|"strict")',
        'apply: applyAll(force=true), reconcile()',
        'export/import: exportPlain(), importPlain(json), exportHandlePatch(), importHandlePatch(json)',
        'config: setConfig({ logLevel:"info"|... , dryRun:false, baseUrl, parallel, podcastsProtect })',
        'events: on("ready"|"apply:complete"|...)',
        'cli examples:',
        '  OpenBlocker.cli("profile strict")',
        '  OpenBlocker.cli("global on")',
        '  OpenBlocker.cli("enable podcasts")',
        '  OpenBlocker.cli("export handle")',
      ].join('\n');
    }
  });
})();
