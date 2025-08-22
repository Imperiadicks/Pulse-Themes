(() => {
  console.log('[script] SpotColLoader v1.0.1');

  const ts = Date.now();
  const src = `https://raw.githubusercontent.com/Imperiadicks/SpotCol-Scripts/main/Assets/js/SpotCol.js?t=${ts}`;

  // Создаём скрытый тег <script>, чтобы обойти SPB
  const injectScript = (code) => {
    const s = document.createElement('script');
    s.textContent = code + `\n//# sourceURL=${src}`;
    document.documentElement.appendChild(s);
    s.remove();
  };

  fetch(src)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load script: ${res.status} ${res.statusText}`);
      return res.text();
    })
    .then(code => {
      console.log('[script] Script fetched, injecting...');
      injectScript(code);
      console.log('[script] SpotCol script injected successfully!');
    })
    .catch(err => {
      console.error('[script] Error loading SpotCol script:', err);
    });
})();
