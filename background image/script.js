const log = (...a) => console.log('[BG]', ...a);

const PLACEHOLDER='data:image/svg+xml;utf8,'+encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
  <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" stop-color="black" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="#222"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="#999" font-size="48" font-family="Arial, Helvetica, sans-serif">no cover</text>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`);

const candidateTargets = [
  '[class*="MainPage_vibe"]',
  '[class*="MainPage_root"]',
  '[class*="CommonLayout_content"]',
  '[class*="CommonLayout_root"]',
  'body'
];

const coverSelectors = [
  '[class*="PlayerBarDesktop_cover"] img',
  '[class*="PlayerBarDesktop_root"] img[alt]',
  '[class*="PlayerBarDesktop_root"] img',
  'img[src*="/100x100"]',
];

const cssOnce = () => {
  if (document.getElementById('bg-css')) return;
  const s = document.createElement('style'); s.id='bg-css';
  s.textContent = `
    .bg-layer{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
    .bg-cover{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat;opacity:0;transition:opacity 600ms ease}
    .bg-gradient{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg, rgba(0,0,0,.18) 0%, var(--color-dark-6, rgba(0,0,0,.82)) 100%)}
  `;
  document.head.appendChild(s);
};

const getTarget = () => {
  for (const sel of candidateTargets) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
};

const ensureLayers = () => {
  cssOnce();
  const target = getTarget();
  if (!target) return null;
  const st = getComputedStyle(target);
  if (st.position === 'static') target.style.position = 'relative';
  target.style.overflow = 'hidden';
  let layer = target.querySelector('.bg-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'bg-layer';
    const cover = document.createElement('div'); cover.className='bg-cover';
    const grad  = document.createElement('div'); grad.className='bg-gradient';
    layer.appendChild(cover); layer.appendChild(grad);
    target.prepend(layer);
    log('layers created on', target.tagName, target.className || '(no class)');
  }
  return layer;
};

const preload = (src) => new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=src;});

let currentURL='';
const setBackground = async (url) => {
  const layer = ensureLayers();
  if (!layer) { log('no target yet'); return; }
  const cover = layer.querySelector('.bg-cover');
  const next = url || PLACEHOLDER;
  if (next === currentURL) return;
  try {
    await preload(next);
    cover.style.opacity='0';
    requestAnimationFrame(()=>{
      cover.style.backgroundImage=`url("${next}")`;
      requestAnimationFrame(()=>{ cover.style.opacity='1'; });
    });
    currentURL = next;
    const t = getTarget();
    if (t) t.style.background = 'transparent';
    log('background applied:', next.slice(0,120));
  } catch(e) {
    log('image load error, fallback placeholder');
    if (next!==PLACEHOLDER) setBackground(PLACEHOLDER);
  }
};

const findCoverEl = () => {
  for (const s of coverSelectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
};

const normalize = (src) => {
  if (!src) return '';
  return src.includes('/100x100') ? src.replace('/100x100','/1000x1000') : src;
};

let coverObserver=null;
const watchCover = () => {
  const img = findCoverEl();
  if (!img) { log('cover img not found'); return; }
  if (coverObserver) coverObserver.disconnect();
  const apply = () => {
    const u = normalize(img.src || img.getAttribute('src'));
    if (u) setBackground(u);
  };
  apply();
  coverObserver = new MutationObserver(muts=>{
    for (const m of muts) {
      if (m.type==='attributes' && m.attributeName==='src') {
        const u = normalize(img.src || img.getAttribute('src'));
        log('cover changed ->', u);
        setBackground(u || PLACEHOLDER);
      }
    }
  });
  coverObserver.observe(img,{attributes:true,attributeFilter:['src']});
  log('cover watcher started');
};

let layoutObserver=null;
const watchLayout = () => {
  const root = document.body;
  if (layoutObserver) layoutObserver.disconnect();
  layoutObserver = new MutationObserver(()=>{
    const tgt = getTarget();
    if (tgt && !tgt.querySelector('.bg-layer')) {
      log('new target appeared, re-ensure layers');
      ensureLayers();
      setBackground(currentURL || PLACEHOLDER);
    }
  });
  layoutObserver.observe(root,{childList:true,subtree:true});
  log('layout watcher started');
};

const poll = () => {
  const el = findCoverEl();
  const u = normalize(el?.src || el?.getAttribute?.('src') || '');
  if (u && u !== currentURL) {
    log('poll detects new cover ->', u);
    setBackground(u);
  }
};

const tryHookPlayer = () => {
  try {
    if (window.Library && typeof window.Library.trackWatcher === 'function') {
      window.Library.trackWatcher(track=>{
        const u = normalize(track?.cover || track?.image || '');
        log('trackWatcher ->', u);
        setBackground(u || normalize(findCoverEl()?.src) || PLACEHOLDER);
      });
      log('trackWatcher connected');
    } else {
      log('trackWatcher not available');
    }
  } catch(e) {
    log('trackWatcher error');
  }
};

const hslVarsTick = () => {
  const section = document.querySelector('[class*="PlayerBarDesktop_root"]');
  if (!section) return;
  const baseHSLString = getComputedStyle(section).getPropertyValue('--player-average-color-background');
  if (!baseHSLString) return;
  const m = baseHSLString.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
  if (!m) return;
  const base = {h:+m[1],s:+m[2],l:+m[3]};
  const v=10, hsl=({h,s,l})=>`hsl(${h}, ${s}%, ${l}%)`, hsla=({h,s,l},a)=>`hsla(${h}, ${s}%, ${l}%, ${a})`;
  let vars='';
  for(let i=1;i<=v;i++){const l=base.l+(i*(80-base.l))/v;vars+=`--color-light-${i}: ${hsl({...base,l})};`;for(let j=1;j<=10;j++)vars+=`--color-light-${i}-${j}: ${hsla({...base,l},j/10)};`;}
  for(let i=1;i<=v;i++){const l=base.l-(i*base.l)/v;vars+=`--color-dark-${i}: ${hsl({...base,l})};`;for(let j=1;j<=10;j++)vars+=`--color-dark-${i}-${j}: ${hsla({...base,l},j/10)};`;}
  let s = document.getElementById('dynamic-colors-style'); if(!s){s=document.createElement('style');s.id='dynamic-colors-style';document.head.appendChild(s);}
  s.textContent=`:root{${vars}}`;
};

document.addEventListener('DOMContentLoaded', () => {
  log('init');
  ensureLayers();
  watchLayout();
  watchCover();
  tryHookPlayer();
  poll();
  setInterval(poll, 2000);
  setInterval(hslVarsTick, 1000);
});

setTimeout(()=>{ ensureLayers(); watchLayout(); watchCover(); poll(); },1500);
