(() => {
  const GH_ROOT = 'https://raw.githubusercontent.com/Imperiadicks/SpotCol-Scripts/main/Assets/';
  const JS_BASE = GH_ROOT + 'js/';
  const CSS_BASE = GH_ROOT + 'css/';

  console.log('SPOTCOL v1.0.14');

  const scripts = [
    'Library.js',
    'colorize 2.js',
    // 'BetterPlayer.js',
    'Main.js',
    'SpotifyScreen.js',
    'SpotifyInfoGPT.js',
    "Open-Blocker.js"
  ];

  const styles = [
    'SpotCol.css',
    'Colorize 2.css',
    'BetterPlayer.css',
    'main.css',
    'navbar.css',
    'SpotifyScreen.css',
    'user.css',
    'Rotating Cover Art.css'
  ];

  async function loadScript(name) {
    const url = JS_BASE + encodeURIComponent(name);
    console.log(`[SpotCol] 📦 Загружаю JS: ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const code = await res.text();
      const run = Function(code);
      run.call(window);
      console.log(`[SpotCol] ✅ Выполнен: ${name}`);
    } catch (e) {
      console.error(`[SpotCol] ❌ Ошибка загрузки JS: ${name}`, e);
    }
  }

async function loadCss(name) {
  const url = CSS_BASE + encodeURIComponent(name);
  console.log(`[SpotCol] 🎨 Загружаю CSS: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const css = await res.text();

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 0));

    const kebab = '--' + name
      .replace(/\.css$/i, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase() + '-css-version';

    const fallback = '--' + name
      .replace(/\.css$/i, '')
      .replace(/[^a-zA-Z0-9]/g, '-') + '-css-version';

    let version = getComputedStyle(document.documentElement).getPropertyValue(kebab)?.trim();
    if (!version) version = getComputedStyle(document.documentElement).getPropertyValue(fallback)?.trim();

    version = version?.replace(/^['"]|['"]$/g, '');

    if (version) {
      console.log(`%c[SpotCol] 📘 ${name} версия: ${version}`, 'color: #3498db');
    } else {
      console.log(`%c[SpotCol] ⚠️ ${name} версия: не указана`, 'color: #e67e22');
    }
  } catch (e) {
    console.error(`[SpotCol] ❌ Ошибка загрузки CSS: ${name}`, e);
  }
}

  (async () => {
    await Promise.all(styles.map(loadCss));
    for (const script of scripts) await loadScript(script);
    console.log('[SpotCol] 🟢 Все модули загружены и активированы');
  })();
})();
