// === SpotifyInfoGPT — fetch ChatGPT via onlysq proxy (v0.2) ===
(() => {
  const Theme  = window.Theme;
  const Screen = Theme?.SpotifyScreen;
  if (!Screen) { console.warn('[SpotifyInfoGPT] SpotifyScreen API not found'); return; }

  console.log('[SpotifyInfoGPT] load v0.2');

  // ——— endpoint как в script.js
  const ENDPOINT = 'https://api.onlysq.ru/ai/v2';

  // ——— настройки модели из handle (совместимо с твоей раскладкой)
  const sm = Theme?.settingsManager;
  const MODEL_MAP = { 1:'searchgpt', 2:'gpt-4o-mini', 3:'llama-3.3', 4:'gemini-2.0-flash', 5:'gemini-2.0-flash-mini' };
  let neuroSearch = sm?.get('gptSearch')?.value ?? false;
  let useStream   = sm?.get('useStream')?.value ?? false;
  let useModel    = MODEL_MAP[sm?.get('useModel')?.value] || 'gpt-4o-mini';

  sm?.on?.('change:gptSearch', ({settings}) => { neuroSearch = settings.get('gptSearch').value; clearUI(); refresh(); });
  sm?.on?.('change:useStream', ({settings}) => { useStream   = settings.get('useStream').value;   clearUI(); refresh(); });
  sm?.on?.('change:useModel',  ({settings}) => { useModel    = MODEL_MAP[settings.get('useModel').value] || useModel; clearUI(); refresh(); });

  // ——— DOM
  const $ = s => document.querySelector(s);
  const UI = {
    artist : () => $('.Search_Info'),
    track  : () => $('.GPT_Search_Info'),
    alert  : () => $('.Achtung_Alert'),
    box    : () => $('.GPT_Info_Container'),
    title  : () => $('.SM_GPT_Title'), // если захочешь использовать
  };
  function clearUI(){ UI.artist()?.replaceChildren(); UI.track()?.replaceChildren(); const a=UI.alert(); if (a) a.style.display='none'; }

  // ——— helpers
  function deriveAT() {
    const artist = ($('.SM_Artist')?.textContent || '').trim();
    const track  = ($('.SM_Track_Name')?.textContent || '').trim();
    return { artist, track };
  }
  function md2html(md=''){
    md = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    md = md.replace(/\[(.+?)\]\((https?:[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    md = md.replace(/^(#{1,6})\s+(.+)$/gm,(_,h,t)=>`<h${h.length}>${t}</h${h.length}>`);
    md = md.replace(/\*\*(.+?)\*\*|__(.+?)__/g,'<strong>$1$2</strong>');
    md = md.replace(/\*(.+?)\*|_(.+?)_/g,'<em>$1$2</em>');
    md = md.replace(/(^|\n)[ \t]*[-*+]\s+(.+)/g,'$1<ul><li>$2</li></ul>');
    md = md.replace(/(^|\n)[ \t]*\d+[.)]\s+(.+)/g,'$1<ol><li>$2</li></ol>');
    return md.replace(/\r?\n/g,'<br>');
  }
  const reArtist=/===\s*(Артист|Artist|Исполнитель)\s*===/i, reTrack=/===\s*(Трек|Track|Song|Песня)\s*===/i;
  function splitSections(txt){
    const aIdx=txt.search(reArtist), tIdx=txt.search(reTrack); let a='',t='';
    if(aIdx>=0&&tIdx>=0){ if(aIdx<tIdx){ a=txt.slice(aIdx,tIdx); t=txt.slice(tIdx);} else { t=txt.slice(tIdx,aIdx); a=txt.slice(aIdx);} }
    else if(aIdx>=0){ a=txt.slice(aIdx);} else if(tIdx>=0){ t=txt.slice(tIdx);} else { a=txt; }
    return { artistText:a.replace(reArtist,'').trim(), trackText:t.replace(reTrack,'').trim() };
  }

  function buildPrompt(artist, track){
    const artSafe = artist || '—';
    const trackKey= track ? `${artSafe} — ${track}` : '—';
    return [
      'Ты пишешь только по-русски.',
      'Ты — музыкальный справочник: давай факты, без выдумок.',
      'Если по точному написанию нет данных — честно напиши, что информации нет.',
      'Всегда разделяй ответ на секции "=== Артист ===" и "=== Трек ===".',
      '',
      '=== Артист ===', artSafe, '',
      '=== Трек ===',   trackKey
    ].join('\n');
  }

  let abortCtl=null, lastKey='', cache=new Map();
  function keyOf(a,t){ return `${(a||'').toLowerCase()}|${(t||'').toLowerCase()}`; }

  async function streamGPT(prompt, onChunk, signal){
    const res = await fetch(ENDPOINT, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ model: useModel, request:{ messages:[{role:'user', content:prompt}], stream:true } }),
      signal
    });
    if (!res.ok || !res.body) throw new Error('network');
    const rd=res.body.getReader(), dec=new TextDecoder('utf-8'); let acc='';
    for(;;){
      const {done,value}=await rd.read(); if(done) break;
      let chunk = dec.decode(value,{stream:true});
      for (let line of chunk.split('\n')){
        if(!(line=line.trim()) || line==='[DONE]') continue;
        if (line.startsWith('data:')) line=line.slice(5).trim();
        try{
          const js = JSON.parse(line);
          const piece = js.choices?.[0]?.delta?.content || '';
          acc += piece; onChunk(acc);
        }catch{}
      }
    }
  }

  async function fetchOnce(artist, track){
    const aBox=UI.artist(), tBox=UI.track(), alert=UI.alert(), box=UI.box();
    if(!aBox||!tBox) return;
    box && (box.style.display='block'); aBox.textContent='⏳'; tBox.textContent='';

    abortCtl && abortCtl.abort();
    abortCtl = new AbortController();

    try{
      const prompt = buildPrompt(artist, track);
      if (useStream){
        await streamGPT(prompt, (acc)=>{
          const {artistText, trackText} = splitSections(acc);
          aBox.innerHTML=md2html(artistText); tBox.innerHTML=md2html(trackText);
        }, abortCtl.signal);
      } else {
        const r = await fetch(ENDPOINT,{
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ model: useModel, request:{ messages:[{role:'user', content:prompt}] } }),
          signal: abortCtl.signal
        });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const txt = j?.choices?.[0]?.message?.content || '';
        const {artistText, trackText} = splitSections(txt);
        aBox.innerHTML=md2html(artistText); tBox.innerHTML=md2html(trackText);
      }
      alert.style.display='block';
    } catch(e){
      if(e.name==='AbortError') return;
      aBox.innerHTML='<b>Ошибка GPT</b>'; tBox.innerHTML=''; alert.style.display='none';
      console.warn('[SpotifyInfoGPT] error:', e);
    } finally { abortCtl=null; }
  }

  let pA='', pT='';
  function refresh(){
    const {artist, track} = deriveAT();
    if(!artist && !track) return;
    const k = keyOf(artist, track);
    if (k===lastKey) return;
    lastKey = k;

    clearUI();
    if (neuroSearch) {
      if (cache.has(k)) {
        const { artistText, trackText } = cache.get(k);
        UI.artist().innerHTML = md2html(artistText);
        UI.track().innerHTML  = md2html(trackText);
        UI.alert().style.display='block';
      } else {
        fetchOnce(artist, track);
      }
    } else {
      // режим Wiki остался прежним — если нужен, можно сюда вставить твою реализацию
      UI.box() && (UI.box().style.display='none');
    }
  }

  // подписки + сторож
  function bind(){
    const tp = Theme?.player;
    const Lib = window.Library || {};
    Lib.onTrack?.(() => refresh(), { immediate:true });
    tp?.on?.('trackChange', () => refresh());
    tp?.on?.('openPlayer',  () => refresh());
    tp?.on?.('pageChange',  () => refresh());
    setInterval(refresh, 1500);
  }

  Theme.SpotifyInfoGPT = {
    init(){ bind(); refresh(); },
    refresh(){ lastKey=''; refresh(); }
  };

  try { Theme.SpotifyInfoGPT.init(); } catch {}
})();
