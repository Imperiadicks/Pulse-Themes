
/*_____________________________________________________________________________________________*/
 /* ФУНКЦИИ ДЛЯ ПОМОЩИ */


/* Асинхронная загрузка изображения для коррекции */
function loadImage(url) {
  return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
  });
}

/* Получение коррекции яркости, для её нормализации */
async function getBrightnessCorrection(imageUrl, targetBrightness = 0.3) {
  // Загружаем изображение
  const img = await loadImage(imageUrl);

  // Создаем временный canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Уменьшаем размер для производительности
  const scale = 100 / Math.max(img.width, img.height);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  // Рисуем изображение
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Получаем данные пикселей
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Собираем яркости с учетом веса
  const brightnessList = [];
  for (let i = 0; i < pixels.length; i += 4) {
      const x = (i / 4) % canvas.width;
      const y = Math.floor((i / 4) / canvas.width);

      // Вес центральной области
      const dx = x / canvas.width - 0.5;
      const dy = y / canvas.height - 0.5;
      const weight = 1 - Math.sqrt(dx * dx + dy * dy) * 2;

      if (weight > 0) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          brightnessList.push(brightness * weight);
      }
  }

  // Сортируем и берем 90-й перцентиль
  brightnessList.sort((a, b) => a - b);
  const percentile = brightnessList[Math.floor(brightnessList.length * 0.9)];

  // Рассчитываем коэффициент с ограничениями
  let coefficient = targetBrightness / percentile;
  return Math.min(Math.max(coefficient, 0.4), 1);
}


/* Установка фона, яркости, коррекции и блюра */
function setPlayerBackground(settings, image) {
  const autoBlackout = settings.get('autoBlackout');
  const brightness = settings.get('brightness');
  const blur = settings.get('blur');

  const backgroundDiv = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (!backgroundDiv) return;

  backgroundImage = image ? `url("${image}")` : 'none';

  if (backgroundDiv.style.getPropertyValue('--background') == backgroundImage) return;
  if (backgroundDiv.style.getPropertyValue('--background-next')) return;

  backgroundDiv.style.setProperty('--background-next', backgroundImage);
  backgroundDiv.classList.add('animate');

  const onTransitionEnd = (event) => {
      if (event.propertyName !== 'opacity') return;

      backgroundDiv.style.setProperty('--background', backgroundImage);
      backgroundDiv.classList.remove('animate');
      backgroundDiv.style.removeProperty('--background-next');
      backgroundDiv.removeEventListener('transitionend', onTransitionEnd);
  };

  backgroundDiv.addEventListener('transitionend', onTransitionEnd);

  if (autoBlackout.value && image) {
      getBrightnessCorrection(image)
          .then(correction => {
              backgroundDiv.style.setProperty('--brightness-correction', correction);
          })
          .catch(console.error);
  } else {
      backgroundDiv.style.setProperty('--brightness-correction', 1);
  }

  if (brightness.value) {
      backgroundDiv.style.setProperty('--brightness', (brightness.value != undefined) ? (brightness.value / 100) : (brightness.default / 100));
  }

  if (blur.value != undefined) {
      backgroundDiv.style.setProperty('--blur', blur.value != undefined ? `${blur.value}px` : `${blur.default}px`);
  }
}


/* Установка "Улучшенного плеера" */
let controlsParents = {}

function clickCustomText(originalSyncLyricsButton, customText) {
  customText.onclick = () => {
      originalSyncLyricsButton.click();
  };
}

function setupSpotColЛичная(settings, styles) {
  const setting = settings.get('SpotColЛичная');
  let customControls = document.querySelector('.customPlayerControls');

  const controls = document.querySelector('.FullscreenPlayerDesktopControls_sonataControls__9AIki');
  const contextMenu = document.querySelector('.FullscreenPlayerDesktopControls_menuButton__R4cXl[data-test-id="FULLSCREEN_PLAYER_CONTEXT_MENU_BUTTON"]');
  const likeButton = document.querySelector('.FullscreenPlayerDesktopControls_likeButton__vpJ7S[data-test-id="LIKE_BUTTON"]');
  const playQueueButton = document.querySelector('.FullscreenPlayerDesktopControls_playQueueButton__reNOW[data-test-id="FULLSCREEN_PLAYER_QUEUE_BUTTON"]');
  const syncLyricsButton = document.querySelector('.FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]');

  if (!setting) return;
  if (!setting.value) {
      if (customControls) {
          if (controlsParents.playQueueButton) controlsParents.playQueueButton.appendChild(playQueueButton);
          if (controlsParents.controls) controlsParents.controls.appendChild(controls);
          if (controlsParents.contextMenu) controlsParents.contextMenu.appendChild(contextMenu);
          if (controlsParents.likeButton) controlsParents.likeButton.appendChild(likeButton);

          customControls.remove();
      }

      styles.remove('SpotColЛичная');
      styles.remove('playerButtonsBackground');
      styles.remove('playerButtonsInvertBackground');

      return;
  };

  const player = document.querySelector('.FullscreenPlayerDesktopContent_info__Dq69p');
  const timecode = player?.querySelector('div[data-test-id="TIMECODE_WRAPPER"]');

  if (timecode) timecode.classList.remove('ChangeTimecode_root_fullscreen__FA6r0');

  if (!customControls) {
      if (!controls) return;

      controlsParents = {
          'controls': controls.parentElement,
          'contextMenu': contextMenu.parentElement,
          'likeButton': likeButton.parentElement,
          'playQueueButton': playQueueButton.parentElement
      }

      customControls = document.createElement('div');
      customControls.classList.add('customPlayerControls');

      customControls.appendChild(playQueueButton);
      customControls.appendChild(contextMenu);
      customControls.appendChild(controls);
      customControls.appendChild(likeButton);

      const newCustomLyricsButton = document.createElement('button');
      newCustomLyricsButton.classList.add(
          'custom-text', 'cpeagBA1_PblpJn8Xgtv', 'iJVAJMgccD4vj4E4o068', 'zIMibMuH7wcqUoW7KH1B',
          'IlG7b1K0AD7E7AMx6F5p', 'nHWc2sto1C6Gm0Dpw_l0', 'SGYcNjvjmMsXeEVGUV2Z', 'qU2apWBO1yyEK0lZ3lPO',
          'FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g'
      );

      newCustomLyricsButton.innerHTML = '<span class="JjlbHZ4FaP9EAcR_1DxF"><svg class="J9wTKytjOWG73QMoN5WP o_v2ds2BaqtzAsRuCVjw"><use xlink:href="#syncLyrics"></use></svg></span>';

      if (syncLyricsButton) {
          clickCustomText(syncLyricsButton, newCustomLyricsButton);

          if (syncLyricsButton.querySelector('svg').classList.contains('SyncLyricsButton_icon_active__6WcWG')) {
              newCustomLyricsButton.querySelector('svg').classList.add('SyncLyricsButton_icon_active__6WcWG');
          }
      } else {
          newCustomLyricsButton.disabled = true;
      }

      customControls.appendChild(newCustomLyricsButton);

      player.appendChild(customControls);

      styles.add('SpotColЛичная', `
          .customPlayerControls {
              display: flex;
              justify-content: center;
              align-items: center;
          }
          
          div[data-test-id="FULLSCREEN_PLAYER_POSTER_CONTENT"] {
              display: none;
          }
  
          .SonataFullscreenControlsDesktop_sonataButton__qmSTF,
          .SonataFullscreenControlsDesktop_sonataButton__qmSTF:disabled,
          .FullscreenPlayerDesktopControls_menuButton__R4cXl,
          .FullscreenPlayerDesktopControls_likeButton__vpJ7S,
          .FullscreenPlayerDesktopControls_playQueueButton__reNOW,
          .FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g {
              background: transparent;
          }
          
          .SonataFullscreenControlsDesktop_sonataButton__qmSTF:not(:disabled):focus-visible,
          .SonataFullscreenControlsDesktop_sonataButton__qmSTF:not(:disabled):hover,
          .FullscreenPlayerDesktopControls_menuButton__R4cXl:not(:disabled):focus-visible,
          .FullscreenPlayerDesktopControls_menuButton__R4cXl:not(:disabled):hover,
          .FullscreenPlayerDesktopControls_menuButton_active__YZ8M8,
          .FullscreenPlayerDesktopControls_likeButton__vpJ7S:not(:disabled):focus-visible,
          .FullscreenPlayerDesktopControls_likeButton__vpJ7S:not(:disabled):hover,
          .FullscreenPlayerDesktopControls_playQueueButton__reNOW:not(:disabled):focus-visible,
          .FullscreenPlayerDesktopControls_playQueueButton__reNOW:not(:disabled):hover,
          .FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g:not(:disabled):focus-visible,
          .FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g:not(:disabled):hover {
              background: transparent;
          }
  
          .SonataFullscreenControlsDesktop_sonataButton__qmSTF[data-test-id="PLAY_BUTTON"],
          .SonataFullscreenControlsDesktop_sonataButton__qmSTF[data-test-id="PAUSE_BUTTON"] {
              border-style: solid;
              border-width: 3px;
              border-color: var(--ym-controls-color-secondary-text-enabled_variant);
          }
  
          .SonataFullscreenControlsDesktop_buttonContainer__mkxBw {
              min-width: fit-content;
          }
  
          .SonataFullscreenControlsDesktop_root__l4a2W {
              gap: 0;
          }
  
          .SonataFullscreenControlsDesktop_sonataButtons__BNse_ {
              gap: 4px;
              transform: scale(0.8);
          }
  
          .FullscreenPlayerDesktopControls_likeButton__vpJ7S svg,
          .FullscreenPlayerDesktopControls_menuButton__R4cXl svg,
          .FullscreenPlayerDesktopControls_playQueueButton__reNOW svg,
          .FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g svg {
              height: 28px;
              width: 28px;
          }
              
          .FullscreenPlayerDesktopControls_playQueueButton__reNOW,
          .FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g {
              margin-inline-end: 0;
              margin-block-end: 0;
              margin-block-start: 0;
              align-self: auto;
          }
  
          .ChangeTimecode_slider__P4qmT {
              --slider-thumb-box-shadow-color: transparent;
          }
  
          .FullscreenPlayerDesktopContent_fullscreenContent_enter__xMN2Y,
          .FullscreenPlayerDesktopContent_fullscreenContent_leave__6HeZ_ {
              animation-name: none;
          }
  
          .FullscreenPlayerDesktopContent_additionalContent__tuuy7 {
              transform: translate(50%);
              height: calc(100% - (var(--fullscreen-player-content-size-px)/2) - 8px - 32px);
              top: 32px;
          }
          
          .FullscreenPlayerDesktopContent_syncLyrics__6dTfH,
          .PlayQueue_root__ponhw {
              height: 100%;
          }
  
          .FullscreenPlayerDesktopContent_fullscreenContent__Nvety {
              transform: translate(calc(50dvw - var(--fullscreen-player-content-size-px)/2),calc(100dvh - var(--fullscreen-player-height-px)/2 + 32px));
          }
  
          .FullscreenPlayerDesktopContent_additionalContent_enter_active__a3nOf {
              animation-name: FullscreenPlayerDesktopContent_enter-fade-additional-content_custom;
          }
          
          .FullscreenPlayerDesktopContent_additionalContent_exit_active__vokVE {
              animation-name: FullscreenPlayerDesktopContent_leave-fade-additional-content_custom;
          }
  
          .custom-text {
              color: var(--ym-controls-color-secondary-text-enabled);
              transition: color 0.3s ease;
          }
  
          .custom-text svg {
              padding: 3px 2px 4px 2px;
          }
  
          .custom-text use:not(svg) {
              transform-origin: 0px 0px;
          }
  
          .custom-text[disabled] {
              color: var(--ym-controls-color-secondary-text-disabled);
              background: transparent;
          }
  
          @keyframes FullscreenPlayerDesktopContent_enter-fade-additional-content_custom {
              0% {
                  transform: translate(0dvw);
                  opacity: 0
              }
  
              50% {
                  transform: translate(26dvw);
              }
  
              to {
                  transform: translate(25dvw);
                  opacity: 1
              }
          }
  
          @keyframes FullscreenPlayerDesktopContent_leave-fade-additional-content_custom {
              0% {
                  transform: translate(25dvw);
                  opacity: 1
              }
  
              40% {
                  opacity: 0
              }
  
              to {
                  transform: translate(0dvw);
                  opacity: 0
              }
          }
  
          .ChangeTimecode_root_fullscreen__FA6r0 {
              grid-template: initial !important;
              column-gap: initial !important;
              row-gap: initial !important;
          }
  
          .FullscreenPlayerDesktopContent_meta__3jDTy {
              padding: 0;
          }
  
          .FullscreenPlayerDesktopContent_info__Dq69p {
              height: fit-content;
              width: fit-content;
          }
      `);
  }

  const playerButtonsBackground = settings.get('playerButtonsBackground');
  const playerButtonsInvertBackground = settings.get('playerButtonsInvertBackground');
  if (playerButtonsBackground.value) {
      styles.add('playerButtonsBackground', `
          .FullscreenPlayerDesktopContent_syncLyrics__6dTfH,
          .FullscreenPlayerDesktopContent_info__Dq69p,
          .PlayQueue_root__ponhw {
              padding: 16px;
              background-color: rgba(0, 0, 0, 0.35);
              backdrop-filter: blur(15px);
              border-radius: 16px;
          }
      `);

      if (playerButtonsInvertBackground.value) {
          styles.add('playerButtonsInvertBackground', `
              .FullscreenPlayerDesktopContent_syncLyrics__6dTfH,
              .FullscreenPlayerDesktopContent_info__Dq69p,
              .PlayQueue_root__ponhw {
                  backdrop-filter: invert(1) blur(15px);
              }
          `);
      } else {
          styles.remove('playerButtonsInvertBackground');
      }
  } else {
      styles.remove('playerButtonsBackground');
      styles.remove('playerButtonsInvertBackground');
  }
}


/* НАЧАЛО ТЕМЫ */
const SpotColЛичная = new Theme('SpotColЛичная');

SpotColЛичная.sonataState.on('openPlayer', ({ settings, styles, state }) => {
  const setting = settings.get('playerBackground');
  const backgroundImage = settings.get('backgroundImage');
  if (!setting) return;
  
  const image = setting.value ? 'https://'+state.track.coverUri.replace('%%', '1000x1000') : backgroundImage.value.replace(/\\/g, '/');
  setPlayerBackground(settings, image);
  
  setupSpotColЛичная(settings, styles);
});

SpotColЛичная.sonataState.on('trackChange', ({ state }) => {
  const setting = SpotColЛичная.settingsManager.get('playerBackground');
  if (!setting) return;

  if (setting.value) {
    const image = 'https://' + state.track.coverUri.replace('%%', '1000x1000');
    setPlayerBackground(SpotColЛичная.settingsManager, image);
  }

  // Отключение кнопочки, если текст недоступен
  const customLyricsButton = document.querySelector('.custom-text');
  const syncLyricsButton = document.querySelector('.FullscreenPlayerDesktopControls_syncLyricsButton__g6E6g[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]');

  if (customLyricsButton) {
      if (!syncLyricsButton) {
          customLyricsButton.querySelector('svg').classList.remove('SyncLyricsButton_icon_active__6WcWG');
          customLyricsButton.disabled = true;
      }
      else {
          customLyricsButton.disabled = false;
          clickCustomText(syncLyricsButton, customLyricsButton);

          if (syncLyricsButton.querySelector('svg').classList.contains('SyncLyricsButton_icon_active__6WcWG') && !customLyricsButton.querySelector('svg').classList.contains('SyncLyricsButton_icon_active__6WcWG')) {
              customLyricsButton.querySelector('svg').classList.add('SyncLyricsButton_icon_active__6WcWG');
          }
      }
  }
});

// Навсякий, чтобы не баговалось
SpotColЛичная.sonataState.on('openText', () => {
  const customLyricsButton = document.querySelector('.custom-text');
  if (customLyricsButton) customLyricsButton.querySelector('svg').classList.add('SyncLyricsButton_icon_active__6WcWG');
})
SpotColЛичная.sonataState.on('closeText', () => {
  const customLyricsButton = document.querySelector('.custom-text');
  if (customLyricsButton) customLyricsButton.querySelector('svg').classList.remove('SyncLyricsButton_icon_active__6WcWG');
})


SpotColЛичная.settingsManager.on('change:playerBackground', ({ settings, state }) => {
  const playerBackground = settings.get('playerBackground');
  const backgroundImage = settings.get('backgroundImage');

  if (!playerBackground) return;

  const image = playerBackground.value ? 'https://'+state.track.coverUri.replace('%%', '1000x1000') : backgroundImage.value.replace(/\\/g, '/');
  setPlayerBackground(settings, image);
});

SpotColЛичная.settingsManager.on('change:backgroundImage', ({ settings }) => {
  const playerBackground = settings.get('playerBackground');
  const backgroundImage = settings.get('backgroundImage');

  if (playerBackground.value) return;
  
  const image = backgroundImage.value.replace(/\\/g, '/');
  setPlayerBackground(settings, image);
});

SpotColЛичная.settingsManager.on('change:autoBlackout', async ({ settings, state }) => {
  const autoBlackout = settings.get('autoBlackout');
  const playerBackground = settings.get('playerBackground');
  if (!autoBlackout) return;

  const backgroundDiv = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (!backgroundDiv) return;
  if (!autoBlackout.value || !playerBackground.value) return backgroundDiv.style.setProperty('--brightness-correction', 1);

  if (!playerBackground.value) return;

  const image = 'https://'+state.track.coverUri.replace('%%', '100x100');
  if (!image) return;

  getBrightnessCorrection(image)
      .then(correction => {
          backgroundDiv.style.setProperty('--brightness-correction', correction);
      })
      .catch(console.error);
});

SpotColЛичная.settingsManager.on('change:brightness', ({ settings }) => {
  const brightness = settings.get('brightness');
  if (!brightness) return;

  const backgroundDiv = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (!backgroundDiv) return;
  backgroundDiv.style.setProperty('--brightness', (brightness.value != undefined) ? (brightness.value / 100) : (brightness.default / 100));
});

SpotColЛичная.settingsManager.on('change:blur', ({ settings }) => {
  const blur = settings.get('blur');
  if (!blur) return;

  const backgroundDiv = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (!backgroundDiv) return;
  backgroundDiv.style.setProperty('--blur', blur.value != undefined ? `${blur.value}px` : `${blur.default}px`);
});

SpotColЛичная.settingsManager.on('change:SpotColЛичная', ({ settings, styles }) => {
  setupSpotColЛичная(settings, styles);
});

SpotColЛичная.settingsManager.on('change:playerButtonsBackground', ({ settings, styles }) => {
  const SpotColЛичная = settings.get('SpotColЛичная');
  if (!SpotColЛичная) return;
  if (!SpotColЛичная.value)  return;
  
  const playerButtonsBackground = settings.get('playerButtonsBackground');
  const playerButtonsInvertBackground = settings.get('playerButtonsInvertBackground');

  if (playerButtonsBackground.value) {
      styles.add('playerButtonsBackground', `
          .FullscreenPlayerDesktopContent_syncLyrics__6dTfH,
          .FullscreenPlayerDesktopContent_info__Dq69p,
          .PlayQueue_root__ponhw {
              padding: 16px;
              background-color: rgba(0, 0, 0, 0.35);
              backdrop-filter: blur(15px);
              border-radius: 16px;
          }
      `);
      if (playerButtonsInvertBackground.value) {
          styles.add('playerButtonsInvertBackground', `
              .FullscreenPlayerDesktopContent_syncLyrics__6dTfH,
              .FullscreenPlayerDesktopContent_info__Dq69p,
              .PlayQueue_root__ponhw {
                  backdrop-filter: invert(1) blur(15px);
              }
          `);
      }
  } else {
      styles.remove('playerButtonsBackground');
      styles.remove('playerButtonsInvertBackground');
  }
});

SpotColЛичная.settingsManager.on('change:playerButtonsInvertBackground', ({ settings, styles }) => {
  const SpotColЛичная = settings.get('SpotColЛичная');
  if (!SpotColЛичная) return;
  if (!SpotColЛичная.value)  return;
  
  const playerButtonsBackground = settings.get('playerButtonsBackground');
  if (!playerButtonsBackground.value) return;
  
  const playerButtonsInvertBackground = settings.get('playerButtonsInvertBackground');
  if (playerButtonsInvertBackground.value) {
      styles.add('playerButtonsInvertBackground', `
          .FullscreenPlayerDesktopContent_syncLyrics__6dTfH,
          .FullscreenPlayerDesktopContent_info__Dq69p,
          .PlayQueue_root__ponhw {
              backdrop-filter: invert(1) blur(15px);
          }
      `);
  } else {
      styles.remove('playerButtonsInvertBackground');
  }
});
   SpotColЛичная.start(1000);