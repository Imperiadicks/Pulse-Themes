// === SpotifyScreen — panel + cover/title/artist + like + GPT slots (anchor-fixed) ===
(() => {
  const Theme = window.Theme;
  if (!Theme) { console.error('[SpotifyScreen] Theme is not available'); return; }
  console.log('[SpotifyScreen] load v1.3.1');

  const Lib = window.Library || {};
  const LOG = '[SpotifyScreen]';

  let $root, $cover, $title, $artist, $like, $origLike, likeObserver, keepAliveObs, reanchorObs;
  let $gptTitle, $gptText, $gptExtra, $gptActions, $alert;
  let uiBound = false;
  let prevLiked = null;
  let lastCover = '';
  let lastTrackKey = '';
  let watchdogIv = null;

  // ───────────────────────── DOM helpers ─────────────────────────
  function getContentContainer() {
    // приоритет — строго твой класс; дальше fallback'и
    return (
      document.querySelector('.CommonLayout_root__WC_W1') ||
      document.querySelector('.Content_rootOld__g85_m') ||
      document.querySelector('[class*="CommonLayout_content__"]') ||
      document.querySelector('[class*="Content_root"]') ||
      document.body
    );
  }
  function findPlayerBar() {
    return (
      document.querySelector('[data-test-id="PLAYERBAR_DESKTOP"]') ||
      document.querySelector('[class*="PlayerBarDesktop_root"]')
    );
  }
  function findTrackLikeButton() {
    const bar = findPlayerBar();
    if (!bar) return null;
    return (
      bar.querySelector('[data-test-id="PLAYERBAR_DESKTOP_LIKE_BUTTON"]') ||
      bar.querySelector('[data-test-id="LIKE_BUTTON"]')
    );
  }

  // ───────────────────────── build / mount ─────────────────────────
  function buildOnce() {
    if ($root && $root.isConnected) return;

    const root = document.createElement('div');
    root.className = 'Spotify_Screen';
    root.innerHTML = `
      <div class="SM_Cover"></div>

      <div class="SM_Title_Line">
        <div class="SM_Track_Name"></div>
        <div class="LikeTrack"></div>
      </div>

      <div class="SM_Artist"></div>

      <section class="SM_GPT" data-gpt="container">
        <header class="SM_GPT_Header">
          <div class="SM_GPT_Title" data-gpt="title"></div>
          <div class="SM_GPT_Actions" data-gpt="actions"></div>
        </header>
        <div class="SM_GPT_Body">
          <div class="SM_GPT_Text" data-gpt="text"></div>
          <div class="SM_GPT_Extra" data-gpt="extra" hidden></div>
        </div>
      </section>

      <footer class="Achtung_Alert" hidden>
        В сведениях иногда бывают неправильные результаты.
        Проверьте информацию подробнее, если изначально вам не всё равно!
      </footer>
    `;

    (getContentContainer() || document.body).insertAdjacentElement('afterbegin', root);

    $root     = root;
    $cover    = root.querySelector('.SM_Cover');
    $title    = root.querySelector('.SM_Track_Name');
    $artist   = root.querySelector('.SM_Artist');
    $gptTitle = root.querySelector('.SM_GPT_Title');
    $gptText  = root.querySelector('.SM_GPT_Text');
    $gptExtra = root.querySelector('.SM_GPT_Extra');
    $gptActions = root.querySelector('.SM_GPT_Actions');
    $alert    = root.querySelector('.Achtung_Alert');

    const likeSlot = root.querySelector('.LikeTrack');
    $like = createLikeClone();
    likeSlot.replaceWith($like);

    attachLikeObserver();
    ensureKeepAlive();
    ensureReanchor();
  }

  function ensureMounted() {
    if (!$root) return;
    const anchor = getContentContainer();
    if (!anchor) return;
    if ($root.parentElement !== anchor) {
      anchor.insertAdjacentElement('afterbegin', $root);
    }
  }

  // следим, чтобы узел ВСЕГДА был внутри целевого контейнера
  function ensureReanchor() {
    if (reanchorObs) return;
    reanchorObs = new MutationObserver(() => ensureMounted());
    reanchorObs.observe(document.body, { childList: true, subtree: true });
  }

  // ───────────────────────── Like (clone & sync) ─────────────────────────
  function isLiked(node) {
    if (!node) return false;
    if (node.getAttribute('aria-checked') !== null) {
      return node.getAttribute('aria-checked') === 'true';
    }
    return node.classList.contains('Like_active');
  }
  function syncLikeState() {
    if (!$origLike || !$like) return;
    const svgO = $origLike.querySelector('svg');
    const svgC = $like.querySelector('svg');
    if (svgO) {
      svgC ? svgC.replaceWith(svgO.cloneNode(true)) : $like.appendChild(svgO.cloneNode(true));
    }
    const liked = isLiked($origLike);
    $like.classList.toggle('Like_active', liked);
    if (liked !== prevLiked) {
      $like.classList.add('animate');
      setTimeout(() => $like && $like.classList.remove('animate'), 300);
      prevLiked = liked;
    }
  }
  function attachLikeObserver() {
    if (likeObserver) likeObserver.disconnect();
    $origLike = findTrackLikeButton();
    if (!$origLike) return;
    likeObserver = new MutationObserver(syncLikeState);
    likeObserver.observe($origLike, { attributes: true, childList: true, subtree: true });
    syncLikeState();
  }
  function createLikeClone() {
    $origLike = findTrackLikeButton();
    prevLiked = null;
    const clone = document.createElement('div');
    clone.className = 'LikeTrack';
    clone.addEventListener('click', () => $origLike?.click());
    if ($origLike) {
      const svgO = $origLike.querySelector('svg');
      if (svgO) clone.appendChild(svgO.cloneNode(true));
    }
    return clone;
  }

  // ───────────────────────── Track helpers ─────────────────────────
  function deriveCoverURL(track) {
    return (
      Lib.util?.coverURLFromTrack?.(track, '1000x1000') ||
      Lib.coverURL?.() ||
      track?.coverUrl ||
      track?.cover ||
      ''
    );
  }
  function deriveTitle(track)  { return track?.title || track?.name || ''; }
  function deriveArtist(track) {
    if (Array.isArray(track?.artists) && track.artists.length) {
      return track.artists.map(a => a.name || a.title || a).join(', ');
    }
    return track?.artist || track?.author || '';
  }
  function trackKey(track) {
    return [deriveTitle(track), deriveArtist(track), deriveCoverURL(track)].join(' | ');
  }
  function getCurrentTrackSafe() {
    return Theme?.player?.state?.track || Lib.getCurrentTrack?.() || null;
  }

  // мгновенное обновление
  function updateCover(url) {
    if (!url || !$cover) return;
    if (url === lastCover) return;
    lastCover = url;
    $cover.style.backgroundImage = `url("${url}")`;
  }
  function updateTexts(track) {
    if (!$title || !$artist) return;
    $title.textContent  = deriveTitle(track)  || '';
    $artist.textContent = deriveArtist(track) || '';
  }

  function onTrack(track, force=false) {
    if (!track) return;
    buildOnce(); ensureMounted();
    const key = trackKey(track);
    if (!force && key === lastTrackKey) return;
    lastTrackKey = key;

    updateCover(deriveCoverURL(track));
    updateTexts(track);

    try {
      Lib.ui?.updateTrackUI?.(
        { cover: '.SM_Cover', title: '.SM_Track_Name', artist: '.SM_Artist' },
        track,
        { duration: 600 }
      );
    } catch {}

    attachLikeObserver();

    try { window.Library?.colorize2?.recolor?.(true); } catch {}
    try { Theme?.backgroundReplace?.(deriveCoverURL(track)); } catch {}
  }

  function startWatchdog() {
    if (watchdogIv) return;
    watchdogIv = setInterval(() => {
      const t = getCurrentTrackSafe();
      if (t) onTrack(t, false);
    }, 800);
  }

  // ───────────────────────── bind bus ─────────────────────────
  function bindToTrackBusOnce() {
    if (uiBound) return;
    uiBound = true;

    try {
      Lib.initUI?.();
      Lib.onTrack?.((t) => onTrack(t, true), { immediate: true });
    } catch (e) {
      console.warn(LOG, 'onTrack bind failed', e);
    }

    const tp = Theme?.player;
    if (tp?.on) {
      tp.on('trackChange', ({ state }) => onTrack(state?.track, true));
      tp.on('openPlayer',  ({ state }) => onTrack(state?.track, true));
      tp.on('pageChange',  () => {
        ensureMounted();
        attachLikeObserver();
        const cur = tp?.state?.track || tp?.getCurrentTrack?.();
        if (cur) onTrack(cur, true);
      });
    }

    startWatchdog();
    const atStart = getCurrentTrackSafe();
    if (atStart) onTrack(atStart, true);
  }

  function ensureKeepAlive() {
    if (keepAliveObs) return;
    keepAliveObs = new MutationObserver(() => {
      if ($root && !getContentContainer()?.contains($root)) {
        (getContentContainer() || document.body).insertAdjacentElement('afterbegin', $root);
        attachLikeObserver();
      }
    });
    keepAliveObs.observe(document.body, { childList: true, subtree: true });
  }

  // ───────────────────────── Public API ─────────────────────────
  Theme.SpotifyScreen = {
    init() { buildOnce(); bindToTrackBusOnce(); },
    check(){ buildOnce(); attachLikeObserver(); },

    setGPTTitle(text)          { buildOnce(); $gptTitle.textContent = text ?? ''; },
    setGPTText(htmlOrText)     { buildOnce(); $gptText.innerHTML = htmlOrText ?? ''; },
    setGPTExtra(html, show=true){ buildOnce(); $gptExtra.innerHTML = html ?? ''; $gptExtra.hidden = !show; },
    setGPTActions(node)        { buildOnce(); $gptActions.replaceChildren(); if (node) $gptActions.appendChild(node); },
    showAlert(flag=true)       { buildOnce(); $alert.hidden = !flag; },
    hideAlert()                { buildOnce(); $alert.hidden = true; }
  };

  try { Theme.SpotifyScreen.init(); } catch {}
})();
