/**
 * WolfyLibrary - Библиотека для облегчения создания аддонов для Яндекс.Музыки
 * @author WolfySoCute
 * @version 2.1.0
 * @namespace WolfyLibrary
 */

/**
 * Менеджер для управления CSS стилями темы
 * @class
 * @classdesc Позволяет добавлять, удалять и комбинировать CSS стили с возможностью управления по идентификаторам
 */
class StylesManager {
	constructor() {
		/**
		 * Хранилище стилей в формате { [id]: css }
		 * @private
		 * @type {Object.<string, string>}
		 * @example
		 * {
		 *   "button-style": "button { color: red; }",
		 *   "text-style": "p { font-size: 14px; }"
		 * }
		 */
		this._styles = {};
	}

	/**
	 * Добавляет или обновляет CSS стиль
	 * @param {string} id - Уникальный идентификатор стиля (используется для последующего обновления/удаления)
	 * @param {string} style - CSS правила
	 * @throws {TypeError} Если id не строка или style не строка
	 * @example
	 * stylesManager.add('primary-button', 'button.primary { background: blue; }');
	 */
	add(id, style) {
		this._styles[id] = style;
	}

	/**
	 * Удаляет стиль по идентификатору
	 * @param {string} id - Идентификатор стиля для удаления
	 * @returns {boolean} true если стиль был удален, false если стиль не найден
	 * @example
	 * stylesManager.remove('outdated-style');
	 */
	remove(id) {
		if (this._styles[id]) {
			delete this._styles[id];
			return true;
		}
		return false;
	}

	/**
	 * Полностью очищает все сохраненные стили
	 * @example
	 * stylesManager.clear();
	 */
	clear() {
		this._styles = {};
	}

	/**
	 * Возвращает все стили объединенные в одну строку
	 * @readonly
	 * @type {string}
	 * @example
	 * const css = stylesManager.result;
	 * // Возвращает: "button { color: red; }\n\np { font-size: 14px; }"
	 */
	get result() {
		return Object.values(this._styles).join('\n\n');
	}
}

/**
 * Базовый класс для работы с событиями (подписка, отписка, вызов).
 * @template T - Тип событий (строка или union-тип конкретных событий).
 * @template D - Тип данных, передаваемых в событие.
 */
class EventEmitter {
	constructor() {
		/** @type {Object.<T, Array<function(D): void>>} */
		this.events = {};
	}

	/**
	 * Подписаться на событие.
	 * @param {T} eventName - Название события.
	 * @param {function(D): void} callback - Функция-обработчик.
	 */
	on(eventName, callback) {
		if (!this.events[eventName]) this.events[eventName] = [];
		this.events[eventName].push(callback);
	}

	/**
	 * Отписаться от события.
	 * @param {T} eventName - Название события.
	 * @param {function(D): void} callback - Функция-обработчик.
	 */
	off(eventName, callback) {
		if (!this.events[eventName]) return;
		this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
	}

	/**
	 * Вызвать событие.
	 * @param {T} eventName - Название события.
	 * @param {D} data - Данные для передачи подписчикам.
	 */
	emit(eventName, data) {
		if (!this.events[eventName]) return;
		this.events[eventName].forEach(callback => callback(data));
	}

	/**
	 * Подписаться на событие один раз (автоматически отпишется после первого вызова).
	 * @param {T} eventName - Название события.
	 * @param {function(D): void} callback - Функция-обработчик.
	 */
	once(eventName, callback) {
		const onceCallback = (data) => {
			callback(data);
			this.off(eventName, onceCallback);
		};
		this.on(eventName, onceCallback);
	}

	/**
	 * Удалить все подписки на событие.
	 * @param {T} eventName - Название события.
	 */
	removeAllListeners(eventName) {
		delete this.events[eventName];
	}
}

/**
 * Менеджер для работы с настройками темы
 * @class
 * @extends {EventEmitter<SettingsEvent,EventData>}
 * @classdesc Обеспечивает загрузку, преобразование и отслеживание изменений настроек темы.
 * Поддерживает систему событий для реагирования на изменения.
 * 
 * @example
 * // Подписка на изменения
 * settingsManager.on('update', ({ settings, styles, state }) => {
 *   console.log('Все настройки обновлены');
 * });
 * 
 * settingsManager.on('change:color', ({ settings, styles, state }) => {
 *   console.log('Настройка изменилась:', settings.value);
 * });
 */
class SettingsManager extends EventEmitter {
	/**
	 * @param {Theme} theme - Экземпляр основного класса
	 */
	constructor(theme) {
		super();
		/**
		 * Экземпляр основного класса
		 * @type {Theme}
		 */
		this.theme = theme;

		/**
		 * Текущие настройки в преобразованном формате
		 * @type {Object.<string, Setting | TextFields>}
		 */
		this.settings = {};

		/**
		 * Предыдущие значения настроек (для сравнения изменений)
		 * @type {Object.<string, Setting | TextFields>}
		 */
		this.old_settings = {};
	}

	/**
	 * Загружает и обновляет настройки с сервера
	 * @async
	 * @throws {Error} При ошибке сети или неверном формате данных
	 * @emits SettingsManager#update При любом обновлении настроек
	 * @emits SettingsManager#change:[id] При изменении конкретной настройки
	 * @example
	 * await settingsManager.update();
	 */
	async update() {
		try {
			const response = await fetch(`http://127.0.0.1:2007/get_handle?name=${this.theme.id}`);
			if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);

			const { data } = await response.json();
			if (!data?.sections) {
				console.warn("Структура данных не соответствует ожидаемой");
				return null;
			}

			this.old_settings = this.settings;
			this.settings = this.transformJSON(data);

			this.emit('update', {
				settings: this.theme.settingsManager,
				styles: this.theme.stylesManager,
				state: this.theme.player.state
			});

			for (const id in this.settings) {
				if (this.hasChanged(id)) {
					this.emit(`change:${id}`, {
						settings: this.theme.settingsManager,
						styles: this.theme.stylesManager,
						state: this.theme.player.state
					});
				}
			}
		} catch (error) {
			console.error(error);
			return null;
		}
	}

	/**
	 * Преобразует сложную структуру настроек из API в плоский объект
	 * @private
	 * @param {Object} input - Исходные данные от API
	 * @param {Array} input.sections - Секции настроек
	 * @returns {Object.<string, Setting | TextFields>} Преобразованные настройки
	 * @example
	 * // Возвращает:
	 * {
	 *   "volume": { value: 80, default: 50 },
	 *   "theme.color": { value: "dark", default: "light" }
	 * }
	 */
	transformJSON(input) {
		const result = {};

		try {
			input.sections.forEach(section => {
				section.items.forEach(item => {
					if (item.type === "text" && item.buttons) {
						result[item.id] = {};
						item.buttons.forEach(button => {
							result[item.id][button.id] = {
								value: button.text,
								default: button.defaultParameter
							};
						});
					} else {
						result[item.id] = {
							value: item.bool != undefined ? item.bool :
								item.filePath != undefined ? item.filePath :
									item.input != undefined ? item.input :
										item.selected != undefined ? item.selected :
											item.value,
							default: item.defaultParameter
						};
					}
				});
			});
		} catch (error) {
			console.error("Failed to transform JSON:", error);
		}

		return result;
	}

	/**
	 * Получает значение настройки по пути
	 * @param {string} id - Путь к настройке через точки (например 'theme.color')
	 * @returns {Setting | TextFields | undefined} Значение настройки или undefined если не найдено
	 * @example
	 * const volume = settingsManager.get('volume');
	 * const color = settingsManager.get('theme.color');
	 */
	get(id) {
		const keys = id.split('.');
		let value = this.settings;

		for (const key of keys) {
			value = value[key];
		}

		return value;
	}

	/**
	 * Проверяет изменилось ли значение настройки
	 * @param {string} id - Путь к настройке через точки
	 * @returns {boolean} true если значение изменилось
	 * @example
	 * if (settingsManager.hasChanged('theme.color')) {
	 *   console.log('Цвет темы изменился!');
	 * }
	 */
	hasChanged(id) {
		const hasSettings = Object.keys(this.settings).length > 0;
		if (!hasSettings) return true;

		const keys = id.split('.');
		let value = this.settings;
		let oldValue = this.old_settings;

		for (const key of keys) {
			if (value === undefined || oldValue === undefined) return true;
			value = value[key];
			oldValue = oldValue[key];
		}

		return value?.value !== oldValue?.value;
	};
}

/**
 * Менеджер для работы с ассетами (файлами) темы.
 * @class
 * @classdesc Позволяет получать содержимое файлов и ссылки на них, а также список всех доступных файлов.
 */
class AssetsManager {
	constructor() {
		/**
		 * Базовый URL для доступа к ассетам.
		 * @private
		 * @type {string}
		 */
		this._urlBase = 'http://127.0.0.1:2007/assets';
	}

	/**
	 * Получает содержимое файла.
	 * @async
	 * @param {string} fileName - Имя файла, содержимое которого нужно получить.
	 * @returns {Promise<string|void>} Содержимое файла в виде строки, либо в json если файл JSON.
	 * @throws {Error} Если произошла ошибка сети или файл не найден.
	 * @example
	 * const content = await assetsManager.getContent('info.json');
	 * console.log(content);
	 */
	async getContent(fileName) {
		try {
			const response = await fetch(`${this._urlBase}/${fileName}`);
			if (!response.ok) {
				throw new Error(`Ошибка сети: ${response.status}`);
			}

			const contentType = response.headers.get("Content-Type");

			if (contentType && contentType.includes("application/json")) {
				return await response.json();
			} else {
				return await response.text();
			}
		} catch (error) {
			console.error("Ошибка при получении данных:", error);
			throw error;
		}
	}

	/**
	 * Получает ссылку на файл.
	 * @param {string} fileName - Имя файла.
	 * @returns {string} Полный URL файла.
	 * @example
	 * const link = assetsManager.getLink('image.png');
	 * console.log(link); // http://127.0.0.1:2007/assets/image.png
	 */
	getLink(fileName) {
		return `${this._urlBase}/${fileName}`;
	}

	/**
	 * Получает список всех доступных файлов.
	 * @async
	 * @returns {Promise<string[]>} Массив имен файлов.
	 * @throws {Error} Если произошла ошибка сети.
	 * @example
	 * const files = await assetsManager.files;
	 * console.log(files); // ['style.css', 'image.png', 'data.json']
	 */
	get files() {
		return fetch(this._urlBase)
			.then(response => {
				if (!response.ok) {
					throw new Error(`Ошибка сети: ${response.status}`);
				}

				return response.json();
			})
			.then(data => { return data.files })
			.catch((reason) => {
				console.error("Ошибка при получении данных:", reason);
			});
	}
}

/**
 * Класс для работы с событиями плеера.
 * @extends {EventEmitter<PlayerEvent,EventData>}
 */
class PlayerEvents extends EventEmitter {
	/**
	 * @param {Theme} theme - Экземпляр основного класса
	 */
	constructor(theme) {
		super();
		/**
		 * Менеджер настроек
		 * @type {SettingsManager}
		 */
		this.settingsManager = theme.settingsManager;

		/**
		 * Менеджер стилей
		 * @type {StylesManager}
		 */
		this.stylesManager = theme.stylesManager;

		/**
		 * Текущее состояние плеера
		 * @type {PlayerState}
		 */
		this.state = {
			speed: 1,
			status: "paused",
			page: '',
			volume: 0,
			progress: {
				duration: 0,
				loaded: 0,
				position: 0,
				played: 0
			},
			shuffle: false,
			repeat: '',
			track: {
				albums: [],
				artists: [],
				available: true,
				availableForOptions: [],
				availableForPremiumUsers: true,
				availableFullWithoutPermission: false,
				coverUri: "",
				derivedColors: { average: '', waveText: '', miniPlayer: '', accent: '' },
				disclaimers: [],
				durationMs: 0,
				fade: { inStart: 0, inStop: 0, outStart: 0, outStop: 0 },
				fileSize: 0,
				id: "",
				lyricsAvailable: true,
				lyricsInfo: { hasAvailableSyncLyrics: true, hasAvailableTextLyrics: true },
				major: { id: 0, name: '' },
				ogImage: "",
				previewDurationMs: 0,
				r128: { i: 0, tp: 0 },
				realId: "",
				rememberPosition: true,
				specialAudioResources: [],
				storageDir: "",
				title: "",
				trackSharingFlag: "",
				trackSource: "",
				type: "",
				version: ""
			}
		}

		this._registerEvents();
	}

	/**
	 * Генерирует кастомное событие с данными.
	 * @private
	 * @param {PlayerEvent} eventName - Название события.
	 */
	_dispatchCustomEvent(eventName) {
		this.emit(eventName, {
			settings: this.settingsManager,
			styles: this.stylesManager,
			state: this.state
		});
	}

	/**
	 * Инициализирует отслеживание событий плеера
	 * @private
	 */
	_registerEvents() {
		const start = setInterval(() => {
			if (window?.player && window?.player?.state?.queueState?.currentEntity?.value?.entity?.data?.meta) {
				clearInterval(start);
				const playerState = window.player.state.playerState;
				const queueState = window.player.state.queueState;

				this.state.track = queueState.currentEntity.value.entity.data.meta;
				this.state.page = window.location.pathname;
				console.log(this.state.page);

				playerState.event.onChange((event => {
					if (event == 'audio-set-progress') {
						this._dispatchCustomEvent('seek');
					}
				}));

				playerState.progress.onChange((progress => {
					this.state.progress = progress;
					this._dispatchCustomEvent('progressChange');
				}));

				playerState.status.onChange((status => {
					this.state.status = status
					switch (status) {
						case "playing":
							this._dispatchCustomEvent('play');
							break;
						case "paused":
						case "ended":
							this._dispatchCustomEvent('pause');
							break;
						case "loadingMediaData":
							this.state.status = "paused";
							this.state.track = queueState.currentEntity.value.entity.data.meta;

							this._dispatchCustomEvent('trackChange');
							break;
						default:
							return;
					}
				}));

				playerState.volume.onChange((volume => {
					this.state.volume = Math.round(100 * volume) / 100;
					this._dispatchCustomEvent('volumeChange');
				}));

				queueState.shuffle.onChange((shuffle => {
					this.state.shuffle = shuffle;
					this._dispatchCustomEvent('shuffleChange');
				}));

				queueState.repeat.onChange((repeat => {
					this.state.repeat = repeat;
					this._dispatchCustomEvent('repeatChange');
				}));



				/* НАЧАЛО ЧАСТИ ИВЕНТОВ ПЛЕЕРА */
				const playerCheck = (node) => {
					if (node.querySelector) return !node?.matches('[data-floating-ui-portal]') ? node.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"]') : null;
				};
				const textCheck = (node) => {
					return node.querySelector ? node.querySelector('[data-test-id="SYNC_LYRICS_CONTENT"]') : null;
				};
				const queueCheck = (node) => {
					return node.querySelector ? node.querySelector('.PlayQueue_root__ponhw') : null;
				};

				const handleMutations = (mutations) => {
					for (const mutation of mutations) {
						for (const node of mutation.addedNodes) {
							const playerElement = playerCheck(node);
							const textElement = textCheck(node);
							const queueElement = queueCheck(node);

							if (playerElement) this._dispatchCustomEvent('openPlayer');
							else if (textElement) this._dispatchCustomEvent('openText');
							else if (queueElement) this._dispatchCustomEvent('openQueue');
						}

						for (const node of mutation.removedNodes) {
							const playerElement = playerCheck(node);
							const textElement = textCheck(node);
							const queueElement = queueCheck(node);

							if (playerElement) this._dispatchCustomEvent('closePlayer');
							else if (textElement) this._dispatchCustomEvent('closeText');
							else if (queueElement) this._dispatchCustomEvent('closeQueue');

						}
					}
				};

				const observer = new MutationObserver(handleMutations);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				/* КОНЕЦ ЧАСТИ ИВЕНТОВ ПЛЕЕРА */



				/* НАЧАЛО ЧАСТИ ИВЕНТА СМЕНЫ СТРАНИЦЫ */
				const pushState = history.pushState;
				const replaceState = history.replaceState;

				const self = this; // Сохранить ссылку на экземпляр класса. Костыль, но иначе вылезает ошибка

				history.pushState = function (...args) {
					pushState.apply(this, args);
					self.state.page = window.location.pathname;
					self._dispatchCustomEvent('pageChange');
				};

				history.replaceState = function (...args) {
					replaceState.apply(this, args);
					self.state.page = window.location.pathname;
					self._dispatchCustomEvent('pageChange');
				};

				// Назад/вперёд
				window.addEventListener('popstate', () => {
					self.state.page = window.location.pathname;
					self._dispatchCustomEvent('pageChange');
				});
				/* КОНЕЦ ЧАСТИ ИВЕНТА СМЕНЫ СТРАНИЦЫ */
			}
		});
	};
}

/**
 * Основной класс темы
 * @class
 * @classdesc Предоставляет API для создания тем, управления стилями и реагирования на события
 */
class Theme {
	/**
	 * @param {string} id - Уникальный идентификатор темы (папки)
	 */
	constructor(id) {
		/**
		 * Идентификатор темы
		 * @type {string}
		 */
		this.id = id;

		/**
		 * Коллекция зарегистрированных действий темы
		 * @type {Object.<string, ThemeAction>}
		 * @example
		 * {
		 *   'theme.color': ({ settings, changed, styles }) => {
		 *     if (changed) {
		 *       const color = settings.get('theme.color').value;
		 *       styles.add('main-color', `body { color: ${color}; }`);
		 *     }
		 *   },
		 *   'volume': ({ settings, changed, styles, state }) => {
		 *     // Логика обработки изменения volume
		 *   }
		 * }
		 */
		this.actions = {};

		/**
		 * Менеджер стилей
		 * @type {StylesManager}
		 */
		this.stylesManager = new StylesManager();

		/**
		 * Менеджер ассетов
		 * @type {AssetsManager}
		 */
		this.assetsManager = new AssetsManager();

		/**
		 * Менеджер настроек
		 * @type {SettingsManager}
		 */
		this.settingsManager = new SettingsManager(this);

		/**
		 * Обработчик событий плеера
		 * @type {PlayerEvents}
		 */
		this.player = new PlayerEvents(this);
	}

	/**
	 * Применяет текущую тему
	 */
	applyTheme() {
		for (const id in this.actions) {
			if (this.actions[id]) {
				this.actions[id]({
					setting: this.settingsManager.get(id),
					changed: this.settingsManager.hasChanged(id),
					styles: this.stylesManager,
					settings: this.settingsManager,
					state: this.player.state
				});
			}
		}

		this.applyStyles();
	}

	/**
	 * Внедряет стили в DOM
	 */
	applyStyles() {
		let themeStylesElement = document.getElementById(`${this.id}-styles`);
		if (!themeStylesElement) {
			themeStylesElement = document.createElement('style');
			themeStylesElement.id = `${this.id}-styles`;
			document.head.appendChild(themeStylesElement);
		}

		themeStylesElement.textContent = this.stylesManager.result;
	}

	/**
	 * Добавляет обработчик для изменения настройки
	 * @param {string} id - Идентификатор настройки
	 * @param {ThemeAction} callback - Функция-обработчик
	 * @example
	 * theme.addAction('theme.color', (setting, changed, styles) => {
	 *   if (changed) {
	 *     const color = setting.value;
	 *     styles.add('main-theme', `body { background: ${color}; }`);
	 *   }
	 * });
	 */
	addAction(id, callback) {
		this.actions[id] = callback;
	}

	/**
	 * Обновляет настройки и переприменяет тему
	 * @async
	 */
	async update() {
		await this.settingsManager.update();
		if (!this.settingsManager.settings) return;

		this.applyTheme();
	}

	/**
	 * Запускает периодическое обновление темы
	 * @param {number} interval - Интервал обновления в миллисекундах
	 */
	start(interval) {
		setInterval(() => this.update(), interval);
		this.update();
	}
}

/**
 * Информация о прогрессе воспроизведения
 * @typedef {Object} ProgressInfo
 * @property {number} duration - Полная длительность трека в секундах
 * @property {number} loaded - Загруженная часть трека в секундах
 * @property {number} position - Текущая позиция в секундах
 * @property {number} played - Проигранная часть трека в секундах
 */

/**
 * Полная информация о музыкальном треке
 * @typedef {Object} TrackInfo
 * @property {string} id - Уникальный идентификатор трека
 * @property {string} realId - Оригинальный ID трека (может совпадать с id)
 * @property {string} title - Название трека
 * @property {MajorInfo} major - Информация о лейбле/дистрибьюторе
 * @property {boolean} available - Доступен ли трек для прослушивания
 * @property {boolean} availableForPremiumUsers - Доступен только для премиум пользователей
 * @property {boolean} availableFullWithoutPermission - Доступен ли трек полностью без ограничений
 * @property {string[]} availableForOptions - Доступные опции (например, ['bookmate'])
 * @property {Object[]} disclaimers - Предупреждения/ограничения для трека
 * @property {string} storageDir - Директория хранения трека
 * @property {number} durationMs - Длительность трека в миллисекундах
 * @property {number} fileSize - Размер файла трека в байтах
 * @property {R128Info} r128 - Информация о громкости по стандарту R128
 * @property {FadeInfo} fade - Настройки фейдов (плавного появления/исчезновения)
 * @property {number} previewDurationMs - Длительность превью трека
 * @property {ArtistInfo[]} artists - Массив исполнителей
 * @property {AlbumInfo[]} albums - Массив альбомов
 * @property {string} coverUri - URI обложки трека
 * @property {DerivedColors} derivedColors - Автоматически вычисленные цвета для интерфейса
 * @property {string} ogImage - URI изображения для OpenGraph
 * @property {boolean} lyricsAvailable - Доступны ли тексты песни
 * @property {string} type - Тип контента (music/podcast/etc)
 * @property {boolean} rememberPosition - Запоминать ли позицию прослушивания
 * @property {string} trackSharingFlag - Флаг доступности шаринга (COVER_ONLY и др.)
 * @property {LyricsInfo} lyricsInfo - Информация о доступности текстов
 * @property {string} trackSource - Источник трека (OWN - собственный и др.)
 * @property {string[]} specialAudioResources - Специальные аудио ресурсы (smart_preview и др.)
 */

/**
 * Информация о лейбле/дистрибьюторе
 * @typedef {Object} MajorInfo
 * @property {number} id - ID лейбла
 * @property {string} name - Название лейбла
 */

/**
 * Информация о громкости по стандарту R128
 * @typedef {Object} R128Info
 * @property {number} i - Integrated loudness (LUFS)
 * @property {number} tp - True peak (dBTP)
 */

/**
 * Настройки фейдов трека
 * @typedef {Object} FadeInfo
 * @property {number} inStart - Начало фейда в секундах
 * @property {number} inStop - Конец фейда в секундах
 * @property {number} outStart - Начало затухания в секундах
 * @property {number} outStop - Конец затухания в секундах
 */

/**
 * Информация об исполнителе
 * @typedef {Object} ArtistInfo
 * @property {number} id - ID исполнителя
 * @property {string} name - Имя исполнителя
 * @property {boolean} various - Является ли сборником
 * @property {boolean} composer - Является ли композитором
 * @property {boolean} available - Доступен ли исполнитель
 * @property {ArtistCover} cover - Обложка исполнителя
 * @property {string[]} genres - Жанры исполнителя
 * @property {Object[]} disclaimers - Ограничения для исполнителя
 */

/**
 * Обложка исполнителя
 * @typedef {Object} ArtistCover
 * @property {string} type - Тип обложки (from-album-cover и др.)
 * @property {string} uri - URI обложки
 * @property {string} prefix - Префикс URI
 */

/**
 * Информация об альбоме
 * @typedef {Object} AlbumInfo
 * @property {number} id - ID альбома
 * @property {string} title - Название альбома
 * @property {string} type - Тип альбома (single/album и др.)
 * @property {string} metaType - Тип метаданных (music)
 * @property {number} year - Год выпуска
 * @property {string} releaseDate - Дата релиза в ISO формате
 * @property {string} coverUri - URI обложки альбома
 * @property {string} ogImage - URI изображения для OpenGraph
 * @property {string} genre - Основной жанр
 * @property {number} trackCount - Количество треков
 * @property {number} likesCount - Количество лайков
 * @property {boolean} recent - Является ли новым
 * @property {boolean} veryImportant - Является ли важным
 * @property {ArtistInfo[]} artists - Исполнители альбома
 * @property {LabelInfo[]} labels - Лейблы альбома
 * @property {boolean} available - Доступен ли альбом
 * @property {boolean} availableForPremiumUsers - Доступен только для премиум пользователей
 * @property {string[]} availableForOptions - Доступные опции
 * @property {boolean} availableForMobile - Доступен ли на мобильных устройствах
 * @property {boolean} availablePartially - Доступен ли частично
 * @property {Object[]} bests - Лучшие треки
 * @property {Object[]} disclaimers - Ограничения
 * @property {boolean} listeningFinished - Был ли дослушан до конца
 * @property {TrackPosition} trackPosition - Позиция трека в альбоме
 */

/**
 * Информация о лейбле
 * @typedef {Object} LabelInfo
 * @property {number} id - ID лейбла
 * @property {string} name - Название лейбла
 */

/**
 * Позиция трека в альбоме
 * @typedef {Object} TrackPosition
 * @property {number} volume - Номер диска
 * @property {number} index - Номер трека
 */

/**
 * Автоматически вычисленные цвета для интерфейса
 * @typedef {Object} DerivedColors
 * @property {string} average - Средний цвет
 * @property {string} waveText - Цвет текста для волны
 * @property {string} miniPlayer - Цвет для мини-плеера
 * @property {string} accent - Акцентный цвет
 */

/**
 * Информация о текстах песни
 * @typedef {Object} LyricsInfo
 * @property {boolean} hasAvailableSyncLyrics - Доступны ли синхронизированные тексты
 * @property {boolean} hasAvailableTextLyrics - Доступен ли обычный текст
 */

/**
 * Функция-обработчик действия темы
 * @callback ThemeAction
 * @param {ActionArgs} data - Вся доступная информация
 * @returns {void}
 * @example
 * function handleThemeColorChange({ setting, changed, styles, settings, state }) {
 *   if (changed) {
 *     const color = settings.get('theme.color').value;
 *     styles.add('main-theme', `body { background: ${color}; }`);
 *   }
 * }
 */

/**
 * Аргументы для обработчика
 * @typedef {Object} ActionArgs
 * @property {Setting | TextFields} setting - Текущая настройка
 * @property {boolean} changed - Флаг изменения значения настройки
 * @property {StylesManager} styles - Менеджер стилей темы
 * @property {SettingsManager} settings - Менеджер настроек темы
 * @property {PlayerState} state - Текущее состояние плеера
 */

/**
 * Текущее состояние плеера
 * @typedef {Object} PlayerState
 * @property {string} status - Статус ('playing', 'paused' и т.п.)
 * @property {string} page - Страница
 * @property {number} volume - Уровень громкости (0-1)
 * @property {TrackProgress} progress - Прогресс воспроизведения
 * @property {boolean} shuffle - Режим перемешивания
 * @property {string} repeat - Режим повтора ('none', 'one', 'all')
 * @property {TrackInfo} track - Информация о текущем треке
 */

/**
 * Настройка
 * @typedef {Object} Setting
 * @property {string | boolean | number} value - Текущее значение
 * @property {string | boolean | number} default - Значение по умолчанию
 */

/**
 * Контейнер текстовых полей.
 * @typedef {Object.<string, Object.<string, { value: string, default: string }>>} TextFields
 */

/**
 * Доступные события плеера.
 * @typedef {(
 *   'play' | 'pause' | 'seek' | 'trackChange' | 'volumeChange' |
 *   'shuffleChange' | 'repeatChange' | 'progressChange' |
 *   'openPlayer' | 'closePlayer' | 'openText' | 'closeText' |
 *   'openQueue' | 'closeQueue' | 'pageChange'
 * )} PlayerEvent
 */

/**
 * Данные, передаваемые в события плеера.
 * @typedef {Object} EventData
 * @property {SettingsManager} settings - Менеджер настроек.
 * @property {StylesManager} styles - Менеджер стилей.
 * @property {PlayerState} state - Текущее состояние плеера.
 */

/**
 * Доступные события плеера.
 * @typedef {(
 *   'update' | 'change:[id]'
 * )} SettingsEvent
 */

/**
 * Событие полного обновления настроек
 * @event SettingsManager#update
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие изменения конкретной настройки
 * @event SettingsManager#change:[id]
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 * @example
 * // Для настройки с id 'volume' будет событие 'change:volume'
 * settingsManager.on('change:volume', ({ settings, styles, state }) => {
 *   console.log(setting.value, setting.default);
 * });
 */



/**
 * Событие начала проигрывания трека
 * @event PlayerEvents#play
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие паузы трека
 * @event PlayerEvents#pause
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие перемотки трека
 * @event PlayerEvents#seek
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие смены трека
 * @event PlayerEvents#trackChange
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие изменения громкости
 * @event PlayerEvents#volumeChange
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие изменения режима перемешивания
 * @event PlayerEvents#shuffleChange
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие изменения режима повтора
 * @event PlayerEvents#repeatChange
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие изменения прогресса трека (вызывается пока трек играет)
 * @event PlayerEvents#changeProgress
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие открытия плеера
 * @event PlayerEvents#openPlayer
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие закрытие плеера
 * @event PlayerEvents#closePlayer
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие открытия текста
 * @event PlayerEvents#openText
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие закрытия текста
 * @event PlayerEvents#closeText
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие открытия очереди
 * @event PlayerEvents#openQueue
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */

/**
 * Событие закрытия очереди
 * @event PlayerEvents#closeQueue
 * @type {Object}
 * @param {EventData} data - Менеджер настроек.
 */
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

SpotColЛичная.player.on('openPlayer', ({ settings, styles, state }) => {
  const setting = settings.get('playerBackground');
  const backgroundImage = settings.get('backgroundImage');
  if (!setting) return;
  
  const image = setting.value ? 'https://'+state.track.coverUri.replace('%%', '1000x1000') : backgroundImage.value.replace(/\\/g, '/');
  setPlayerBackground(settings, image);
  
  setupSpotColЛичная(settings, styles);
});

SpotColЛичная.player.on('trackChange', ({ settings, state }) => {
  const setting = settings.get('playerBackground');
  if (!setting) return;
  if (setting.value) {
      const image = 'https://'+state.track.coverUri.replace('%%', '1000x1000');
      setPlayerBackground(settings, image);
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
SpotColЛичная.player.on('openText', () => {
  const customLyricsButton = document.querySelector('.custom-text');
  if (customLyricsButton) customLyricsButton.querySelector('svg').classList.add('SyncLyricsButton_icon_active__6WcWG');
})
SpotColЛичная.player.on('closeText', () => {
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

    //WolfyLibrary Theme: SpotColЛичная (v5.0)
/*_____________________________________________________________________________________________*/

   SpotColЛичная.stylesManager.add(
     'spotify-like-wrapper',
     `.LikeTrack{flex:0 0 42px;
     display:flex;
     align-items:center;
     justify-content:center;
     cursor:pointer;
     top: 10px
     right: 14px}
      @keyframes likePulse{0%{transform:scale(1);}45%{transform:scale(1.25);}100%{transform:scale(1);} }
      .LikeTrack.animate{animation:likePulse .35s ease-out;}

      `
     
   );
   
/*_____________________________________________________________________________________________*/
   (function(theme){
     let $root,$bg,$cover,$track,$artist,$like,$origLike,observer;
     let prevLiked=null;
   

/*_____________________________________________________________________________________________*/


     const isLiked=node=>{
       if(!node) return false;
       if(node.getAttribute('aria-checked')!==null) return node.getAttribute('aria-checked')==='true';
       return node.classList.contains('Like_active') || !!node.querySelector('svg[class*="_active"],svg[class*="-active"],svg .LikeIcon_active');
     };

/*_____________________________________________________________________________________________*/


     const syncState=()=>{
       if(!$origLike||!$like) return;
       const svgO=$origLike.querySelector('svg');
       const svgC=$like.querySelector('svg');
       if(svgO){
         svgC?svgC.replaceWith(svgO.cloneNode(true)):$like.appendChild(svgO.cloneNode(true));
       }

/*_____________________________________________________________________________________________*/
       const liked=isLiked($origLike);
       $like.classList.toggle('Like_active',liked);
       if(liked!==prevLiked){
         $like.classList.add('animate');
         setTimeout(()=>{$like&&$like.classList.remove('animate');},350);
         prevLiked=liked;
       }
     };

/*_____________________________________________________________________________________________*/


     const attachObserver=()=>{
       if(observer) observer.disconnect();
       if(!$origLike) return;
       observer=new MutationObserver(syncState);
       observer.observe($origLike,{attributes:true,childList:true,subtree:true});
     };

/*_____________________________________________________________________________________________*/


     const findOriginalLike=()=>{
       const sels=[
         '.FullscreenPlayerDesktopControls_likeButton__vpJ7S[data-test-id="LIKE_BUTTON"]',
         '.PlayerBarDesktop_root__d2Hwi [data-test-id="LIKE_BUTTON"]',
         '[data-test-id="PLAYERBAR_DESKTOP_LIKE_BUTTON"]',
         '[data-test-id="LIKE_BUTTON"]'];
       return sels.map(q=>document.querySelector(q)).find(Boolean)||null;
     };

/*_____________________________________________________________________________________________*/


     const createClone=()=>{
       $origLike=findOriginalLike();
       prevLiked=null;
       if(!$origLike) return el('div','LikeTrack');
       const clone=$origLike.cloneNode(true);
       clone.classList.add('LikeTrack');
       clone.removeAttribute('data-test-id');
       clone.addEventListener('click',()=>{$origLike.click();});
       attachObserver();
       syncState();
       return clone;
     };

/*_____________________________________________________________________________________________*/


     const build=()=>{
       if($root) return;
       $root=el('div','Spotify_Screen',document.body);
       $bg  =el('div','SM_Background',$root);
       $cover=el('div','SM_Cover',$root);

/*_____________________________________________________________________________________________*/


       const row=el('div','SM_Title_Line',$root);
       $track=el('div','SM_Track_Name',row);
       $like =createClone();
       row.appendChild($like);
       $artist=el('div','SM_Artist',$root);
   
/*_____________________________________________________________________________________________*/


       const info =el('div','All_Info_Container',$root);
       const art  =el('div','Artist_Info_Container',info);
       el('div','Info_Title',art,'Сведения об исполнителе');
       el('div','Search_Info',art);
       const gpt =el('div','GPT_Info_Container',info);
       el('div','GPT_Info_Title',gpt,'Сведения о треке');
       el('div','GPT_Search_Info',gpt);
       el('div','Achtung_Alert',info,'В сведениях иногда бывают неправильные результаты. Проверяйте информацию подробнее, если изначально вам не всё равно!');
     };

/*_____________________________________________________________________________________________*/


     const update=state=>{
       build();
       if(!$origLike||!document.contains($origLike)){
         const fresh=createClone();
         $like.replaceWith(fresh);$like=fresh;
       }

/*_____________________________________________________________________________________________*/


       const t=state.track||{};
       const img=t.coverUri?`https://${t.coverUri.replace('%%','1000x1000')}`:'http://127.0.0.1:2007/Assets/no-cover-image.png';
       [$bg,$cover].forEach(n=>n.style.background=`url(${img}) center/cover no-repeat`);
       $track.textContent=t.title||'';
       $artist.textContent=(t.artists||[]).map(a=>a.name).join(', ');
       syncState();
       $root.style.display='block';
     };

/*_____________________________________________________________________________________________*/


     theme.player.on('openPlayer',({state})=>update(state));
     theme.player.on('trackChange',({state})=>update(state));
   
     function el(tag,cls,parent=document.body,txt){const n=document.createElement(tag);n.classList.add(cls);if(txt)n.textContent=txt;parent.appendChild(n);return n;}
   })(SpotColЛичная);
   
/*_____________________________________________________________________________________________*/

/*_____________________________________________________________________________________________*/
/*                                  Wiki / GPT-ФАКТЫ                                           */
/*  – Читает флаги из SpotColЛичная.settingsManager                                           */
/*  – Wiki возвращает HTML, вставляем через innerHTML                                        */
/*  – GPT ответ конвертируем из markdown в HTML                                              */
/*_____________________________________________________________________________________________*/
(() => {
  const sm = SpotColЛичная.settingsManager;
  const modelMap = {1:'searchgpt',2:'gpt-4o-mini',3:'llama-3.3',4:'gemini-2.0-flash',5:'gemini-2.0-flash-mini'};
  let neuroSearch = sm.get('gptSearch')?.value ?? false;
  let useStream   = sm.get('useStream')?.value   ?? false;
  let useModel    = modelMap[ sm.get('useModel')?.value ] || 'gpt-4o-mini';

  sm.on('change:gptSearch', ({settings})=>{
    neuroSearch = settings.get('gptSearch').value; clearUI(); refresh();
  });
  sm.on('change:useStream', ({settings})=>{
    useStream   = settings.get('useStream').value;   clearUI(); refresh();
  });
  sm.on('change:useModel', ({settings})=>{
    useModel = modelMap[ settings.get('useModel').value ] || useModel;
    clearUI(); refresh();
  });

  const selArtist = '.SM_Artist';
  const selTrack  = '.SM_Track_Name';
  const $         = s=>document.querySelector(s);
  const UI = {
    artist : ()=>$('.Search_Info'),
    track  : ()=>$('.GPT_Search_Info'),
    alert  : ()=>$('.Achtung_Alert'),
    box    : ()=>$('.GPT_Info_Container')
  };

  function clearUI(){
    const a=UI.artist(), t=UI.track(), b=UI.box(), al=UI.alert();
    if(a){ a.innerHTML=''; }
    if(t){ t.innerHTML=''; }
    if(al){ al.style.display='none'; }
  }

/* ---------- markdown → html ---------- */
function md2html(md = '') {
  // 1. экранируем HTML-символы
  md = md.replace(/&/g,'&amp;')
         .replace(/</g,'&lt;')
         .replace(/>/g,'&gt;');

  // 2. заголовки #####  →  <h5>
  md = md.replace(/^(######)\s+(.+)$/gm, '<h6>$2</h6>')
         .replace(/^(#####)\s+(.+)$/gm , '<h5>$2</h5>')
         .replace(/^(####)\s+(.+)$/gm  , '<h4>$2</h4>')
         .replace(/^(###)\s+(.+)$/gm   , '<h3>$2</h3>')
         .replace(/^(##)\s+(.+)$/gm    , '<h2>$2</h2>')
         .replace(/^(#)\s+(.+)$/gm     , '<h1>$2</h1>');

  // 3. жирный / курсив
  md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
         .replace(/__(.+?)__/g    , '<strong>$1</strong>')
         .replace(/\*(.+?)\*/g    , '<em>$1</em>')
         .replace(/_(.+?)_/g      , '<em>$1</em>');

  // 4. маркированные списки
  md = md.replace(/(^|\n)[ \t]*[-*+]\s+(.+)/g, '$1<ul><li>$2</li></ul>');

  // 5. нумерованные списки
  md = md.replace(/(^|\n)[ \t]*\d+[.)]\s+(.+)/g, '$1<ol><li>$2</li></ol>');

  // 6. переносы строк  → <br>
  md = md.replace(/\r?\n/g,'<br>');

  return md;
}


  async function fetchWiki(artist){
    const out = UI.artist(), alert = UI.alert();
    if(!out) return;
    try {
      const url = 'https://ru.wikipedia.org/w/api.php?action=query&format=json&origin=*'
                + '&titles='+encodeURIComponent(artist)
                + '&prop=extracts&exintro';  // убрали explaintext
      const res = await fetch(url); if(!res.ok) throw 0;
      const j   = await res.json();
      const page= Object.values(j.query.pages)[0] || {};
      const html = page.extract || '<i>Нет информации</i>';
      out.innerHTML = html;
      alert.style.display = page.extract ? 'block' : 'none';
    } catch {
      out.innerHTML = '<b>Ошибка Wiki</b>';
      alert.style.display = 'none';
    }
  }

  let ctl = null;
  async function streamOnlySQ(prompt, target){
    const res = await fetch('https://api.onlysq.ru/ai/v2',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model: useModel,
        request: { messages:[{role:'user',content:prompt}], stream:true }
      }),
      signal: ctl.signal
    });
    if(!res.ok||!res.body) throw 0;
    const rd = res.body.getReader(), dec = new TextDecoder('utf-8');
    let acc = '';
    while(true){
      const {done,value} = await rd.read(); if(done) break;
      const chunk = dec.decode(value,{stream:true});
      for(let line of chunk.split('\n')){
        line=line.trim(); if(!line||line==='[DONE]') continue;
        if(line.startsWith('data:')) line=line.slice(5).trim();
        try {
          const js = JSON.parse(line);
          const piece = js.choices?.[0]?.delta?.content || '';
          acc += piece;
          target.innerHTML = md2html(acc);
        } catch {}
      }
    }
  }

  async function fetchGPT(artist, track){
    const artEl = UI.artist(), trEl = UI.track(), alert=UI.alert(), box=UI.box();
    if(!artEl||!trEl) return;
    box&&(box.style.display='block');
    artEl.innerHTML='⏳ Loading…'; trEl.innerHTML='';

    ctl&&ctl.abort();
    ctl=new AbortController();
    try {
      if(useStream){
        await Promise.all([
          streamOnlySQ(`**Артист**: ${artist}`, artEl),
          streamOnlySQ(`**Трек**: ${track}`, trEl)
        ]);
      } else {
       const prompt =
  `Расскажи кратко (4–6 предложений) даже если точных сведений нет.\n` +
   `1) Артист: ${artist || '—'}\n` +
  `2) Трек  : ${track  || '—'}\n\n` +
   `Если достоверной информации нет – напиши «Информация не найдена».\n` +
  `Не проси уточнений.`;
        const r = await fetch('https://api.onlysq.ru/ai/v2',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ model: useModel, request:{ messages:[{role:'user',content:prompt}] } }),
          signal: ctl.signal
        });
        const j = await r.json();
        const txt = j.choices?.[0]?.message?.content || '';
        // разделим по маркеру
        const parts = txt.split(/===\s*Трек\s*===/i);
        const artMd = (parts[0]||'').replace(/===\s*Артист\s*===/i,'').trim();
        const trMd  = (parts[1]||'').trim();
        artEl.innerHTML = md2html(artMd);
        trEl.innerHTML  = md2html(trMd);
      }
      alert.style.display = 'block';
    } catch {
      artEl.innerHTML = '<b>Ошибка GPT</b>';
      trEl.innerHTML  = '';
      alert.style.display = 'none';
    }
  }

  let prevA='', prevT='';
  function refresh(){
    const a = ($(selArtist)?.textContent||'').trim();
    const t = ($(selTrack )?.textContent||'').trim();
    if(!a && !t) return;
    prevA=a; prevT=t;
    clearUI();
    if(neuroSearch){
      fetchGPT(a, t);
    } else {
      fetchWiki(a);
      UI.box() && (UI.box().style.display='none');
    }
  }

  setInterval(()=>{
    const a = ($(selArtist)?.textContent||'').trim();
    const t = ($(selTrack )?.textContent||'').trim();
    if(a!==prevA||t!==prevT) refresh();
  },1200);

})();


/*_____________________________________________________________________________________________*/

/*───────────────────────────────────────────────────────────────────────────*
 *  ReachText  v6 – bar-button fully works                                   *
 *───────────────────────────────────────────────────────────────────────────*/
(() => {

  /* === ПАРАМЕТРЫ === */
  var TRACE=false, GAP=28;
  
  /* === ЛОГ === */
  function log(){ if(!TRACE)return; console.log.apply(console,['%c[RT]','color:#7cf'].concat([].slice.call(arguments))); }
  function err(){ console.error.apply(console,['%c[RT]','color:#f55'].concat([].slice.call(arguments))); }
  
  /* === УТИЛЫ === */
  var $=s=>document.querySelector(s), delay=ms=>new Promise(r=>setTimeout(r,ms));
  function create(tag,cls,html){var n=document.createElement(tag);if(cls)n.className=cls;if(html!==undefined)n.innerHTML=html;return n;}
  
  /* === ОЖИДАНИЕ PLAYER === */
  waitPlayer().then(init).catch(err);
  function waitPlayer(max){max=max||100;return new Promise((res,rej)=>{var c=0,iv=setInterval(()=>{if(window.player?.state?.playerState){clearInterval(iv);res();}if(++c>max){clearInterval(iv);rej('timeout');}},100);});}
  
  /* === ГЛОБАЛЬНОЕ СОСТОЯНИЕ === */
  var last={title:null,synced:null,artists:'',meta:null};
  var lines=[],timer=null,fsOn=JSON.parse(localStorage.getItem('reachLyricsVisible')||'true');
  
  /* быстрые ссылки */
  var info={
    get p(){return player.state.currentMediaPlayer.value?.audioPlayerState?.progress?.value},
    get m(){return player.state.queueState.currentEntity.value?.entity?.entityData?.meta},
    get ok(){return !!info.p && !!info.m}
  };
  
  /* === START === */
  function init(){
    log('boot');
    player.state.playerState.event.onChange(async ev=>{
      if(ev==='audio-canplay')                                  await onTrack();
      if(['audio-resumed','audio-set-progress','audio-updating-progress'].includes(ev)) update();
      if(['audio-paused','audio-end','audio-ended'].includes(ev)) clr();
    });
    $('[data-test-id="FULLSCREEN_PLAYER_BUTTON"]')?.addEventListener('mouseup',()=>fsOn&&injectFS());
  }
  
  /* === НОВЫЙ ТРЕК === */
  async function onTrack(){
    if(!info.ok) return;
    var m=info.m;
    if(m.title===last.title) return;
  
    last={title:m.title,artists:m.artists.map(a=>a.name).join(', '),synced:null,meta:m};
    lines=[];clr();updateSyncButton();
    log('trk',last.title);
  
    /* если sync уже есть — ничего не качаем */
    if(m.lyricsInfo.hasAvailableSyncLyrics){attachBarBtn();return;}
  
    /* заранее ставим флаг, чтобы меню создалось сразу */
    m.lyricsInfo.hasAvailableSyncLyrics=true;
    m.lyricsInfo.hasAvailableLyrics=true;
  
    /* качаем LRCLib */
    try{
      var url='https://lrclib.net/api/search?track_name='+encodeURIComponent(m.title)+
              '&artist_name='+encodeURIComponent(last.artists);
      var js=await (await fetch(url)).json();
      if(!js.length){log('LRCLib none');attachBarBtn();return;}
      last.synced=js[0].syncedLyrics||null;
      if(!last.synced){log('LRCLib plain');attachBarBtn();return;}
  
      applyNative(parseLRC(last.synced));      // отдаём движку
      if(document.querySelector('.FullscreenPlayerDesktop_root__pXx5o')) injectFS();
      updateSyncButton(); attachBarBtn();
      log('LRCLib OK');
    }catch(e){err(e);}
  }
  
  /* === АКТИВИРУЕМ КНОПКУ В БАРЕ + ОБРАБОТЧИК КЛИКА === */
  function attachBarBtn(){
    var btn=$('[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]');
    if(!btn) return;
    if(btn.dataset.rtAttached) return;         // уже
    btn.dataset.rtAttached='1';
    btn.addEventListener('click',function(){
      /* штатное событие — открывает/закрывает правую панель */
      player.state.lyricsState?.event?.emit('open');
    });
  }
  
  /* === КНОПКА / МЕНЮАКТУАЛЬНОСТЬ === */
  function updateSyncButton(){
    var bar=$('[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]');
    if(bar){var on=!!last.synced;bar.classList.toggle('HbaqudSqu7Q3mv3zMPGr',on);bar.toggleAttribute('disabled',!on);}
    var mi=document.querySelector('[data-test-id="SHOW_LYRICS_BUTTON"]');
    if(mi){mi.classList.toggle('dXW0Y',!!last.synced);mi.toggleAttribute('disabled',!last.synced);}
  }
  
  /* === ВСТРАИВАЕМ В FULLSCREEN (белый zoom) === */
  async function injectFS(){
    await delay(60);
    var fs=$('.FullscreenPlayerDesktopContent_root__tKNGK');if(!fs||!last.synced) return;
    if(fs.querySelector('.ReachText_container')) return;
  
    var eye=create('button','','👁');eye.style.cssText='position:absolute;top:24px;right:24px;background:0;border:0;font-size:22px;color:#fff';
    eye.onclick=()=>{fsOn=!fsOn;localStorage.setItem('reachLyricsVisible',fsOn);fs.querySelector('.ReachText_container')?.remove();fsOn&&injectFS();};
    fs.appendChild(eye);
  
    var wrap=create('div','ReachText_container');
    wrap.innerHTML='<div class="ReachText_scroll"></div><style>\
      .ReachText_container{position:absolute;inset:0 0 96px 0;pointer-events:auto;display:flex;justify-content:center;align-items:center}\
      .ReachText_scroll{max-height:80%;overflow-y:auto;overscroll-behavior:contain;padding:0 48px;text-align:center;font-size:26px;line-height:1.35}\
      .ReachText_line{margin-bottom:'+GAP+'px;white-space:pre-wrap;color:rgba(255,255,255,.35);transform:scale(.9);transition:color .35s,transform .35s}\
      .ReachText_line.active{font-weight:700}\
    </style>';
    fs.appendChild(wrap);
  
    lines=parseLRC(last.synced).map(o=>{var n=create('div','ReachText_line',o.text);wrap.firstChild.appendChild(n);return Object.assign(o,{node:n});});
    update();
  }
  
  /* === СИНХРОНИЗАЦИЯ SCROLL + ЭФФЕКТ === */
  function update(){
    if(!lines.length) return; clr();
    var pos=info.p.position*1000, idx=lines.findIndex(l=>l.ts>pos), cur=Math.max(0,idx-1);
    lines.forEach(function(l,i){var d=Math.abs(i-cur);l.node.style.transform='scale('+(d?Math.max(.75,1-d*.1):1.2)+')';l.node.style.color='rgba(255,255,255,'+(d?Math.max(.35,1-d*.25):1)+')';l.node.style.fontWeight=d?'400':'700';l.node.classList.toggle('active',i===cur);});
    var box=$('.ReachText_scroll'), n=lines[cur]?.node; if(n&&box) box.scrollTo({top:n.offsetTop-200,behavior:'smooth'});
    var next=lines[idx]; next&&(timer=setTimeout(update,next.ts-pos));
  }
  function clr(){timer&&clearTimeout(timer);timer=null;}
  
  /* === ПЕРЕДАЧА В НАТИВНЫЙ РЕНДЕРЕР === */
  function applyNative(arr){
    if(!player.state.lyricsState?.setLyrics) return;
    var body=arr.map(o=>({startTime:o.ts/1000,text:o.text}));
    try{player.state.lyricsState.setLyrics({type:'LRC',lyrics:body});}catch(e){err('native set',e);}
  }
  
  /* === LRC → массив === */
  function parseLRC(t){return(t||'').split('\n').map(function(s){var m=s.match(/\[(\d{2}):(\d{2}).(\d{2})]/);if(!m)return null;return{ts:(+m[1]*60+ +m[2])*1000+(+m[3])*10,text:s.replace(/\[.+?]/,'').trim()};}).filter(Boolean);}
  
  })();
  

   SpotColЛичная.start(1000);

/*_____________________________________________________________________________________________*/
/* ------------------------------------------------------------------
            *Colorize - v3.0*
 * ------------------------------------------------------------------ */

(() => {
    /* ---------- Константы & утилиты -------------------------------- */
  
    const CANVAS = document.createElement('canvas');
    const CTX    = CANVAS.getContext('2d');
    const CACHE  = new Map();                 // src → {h,s,l}
  
    const L_MIN = 20, L_MAX = 80, S_MIN = 25, SAMPLE_SIZE = 64;
  
    const rgbToHsl = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0, s = 0, l = (max + min) / 2;
      if (d) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
          case g: h = ((b - r) / d + 2);               break;
          case b: h = ((r - g) / d + 4);               break;
        }
        h /= 6;
      }
      return { h: Math.round(h * 360), s: +(s * 100).toFixed(1), l: +(l * 100).toFixed(1) };
    };
  
    const H = o => `hsl(${o.h},${o.s}%,${o.l}%)`;
    const HA = (o, a = 1) => `hsla(${o.h},${o.s}%,${o.l}%,${a})`;
  
    const fallbackHSL = () => {
      const root = document.querySelector('[class*="PlayerBarDesktop_root"]');
      if (!root) return { h: 0, s: 0, l: 50 };
      const raw = getComputedStyle(root)
        .getPropertyValue('--player-average-color-background')
        .trim();
      const m = raw.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
      return m ? { h: +m[1], s: +m[2], l: +m[3] } : { h: 0, s: 0, l: 50 };
    };
  
    /* ---------- Читаем «средний» цвет обложки ---------------------- */
  
    const getAvgHSL = src => {
      if (CACHE.has(src)) return Promise.resolve(CACHE.get(src));
  
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
  
        img.onload = () => {
          try {
            CANVAS.width = CANVAS.height = SAMPLE_SIZE;
            CTX.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
            const { data } = CTX.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  
            let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const { s, l } = rgbToHsl(r, g, b);
              if (l >= L_MIN && l <= L_MAX && s >= S_MIN) {
                rSum += r; gSum += g; bSum += b; cnt++;
              }
            }
  
            if (!cnt) {                       // ни один пиксель не прошёл фильтр
              for (let i = 0; i < data.length; i += 4) {
                rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
              }
              cnt = data.length / 4;
            }
  
            const avg = rgbToHsl(rSum / cnt, gSum / cnt, bSum / cnt);
            CACHE.set(src, avg);
            resolve(avg);
          } catch {
            /* Canvas «tainted» (нет CORS) */
            const fb = fallbackHSL();
            CACHE.set(src, fb);
            resolve(fb);
          }
        };
  
        img.onerror = () => resolve(fallbackHSL());
        img.src = src;
      });
    };
  
    /* ---------- Генерируем палитру & пишем переменные -------------- */
  
    const genPalette = (base, steps = 10) => {
      const vars = {};
      for (let i = 1; i <= steps; i++) {
        const lHi = base.l + (i * (80 - base.l)) / steps;
        const lLo = base.l - (i * base.l)        / steps;
  
        vars[`--color-light-${i}`] = H({ ...base, l: lHi });
        vars[`--color-dark-${i}`]  = H({ ...base, l: lLo });
  
        for (let j = 1; j <= 10; j++) {
          vars[`--color-light-${i}-${j}`] = HA({ ...base, l: lHi }, j / 10);
          vars[`--color-dark-${i}-${j}`]  = HA({ ...base, l: lLo }, j / 10);
        }
      }
      return vars;
    };
  
    const setRootVars = obj => {
      const st = document.documentElement.style;
      for (const k in obj) st.setProperty(k, obj[k]);
    };
  
    /* ---------- Главная функция раскраски -------------------------- */
  
    let currentSrc = '';
  
    const recolor = async () => {
      const img = document.querySelector('[class*="PlayerBarDesktop_coverContainer"] img');
      if (!img?.src || img.src === currentSrc) return;
  
      currentSrc = img.src;
      const base = await getAvgHSL(img.src);
  
      // собственная палитра
      setRootVars(genPalette(base));
  
      // ключевые YM-переменные
      setRootVars({
        '--ym-background-color-primary-enabled-content' : 'var(--color-dark-3)',
        '--ym-background-color-primary-enabled-basic'   : 'var(--color-dark-8)',
        '--ym-surface-color-primary-enabled-list'       : 'var(--color-light-1-4)',
        '--ym-controls-color-primary-text-enabled'      : 'var(--color-light-10-5)',
        '--ym-controls-color-primary-text-hovered'      : 'var(--color-light-7)'
      });
  
      // фон «вибы»
      const vibe = document.querySelector('[class*="MainPage_vibe"]');
      if (vibe) {
        vibe.style.background =
          `linear-gradient(180deg,rgba(0,0,0,.2) 0%,var(--color-dark-3) 100%),` +
          `url(${img.src}) center/cover no-repeat`;
      }
    };
  
    /* ---------- Точное наблюдение за <img> ------------------------- */
  
    const observeCover = () => {
      const img = document.querySelector('[class*="PlayerBarDesktop_coverContainer"] img');
      if (!img) return;
  
      const mo = new MutationObserver(recolor);
      mo.observe(img, { attributes: true, attributeFilter: ['src'] });
  
      // если DOM-элемент сменился — пересоздаём observer
      const bodyWatch = new MutationObserver(() => {
        const fresh = document.querySelector('[class*="PlayerBarDesktop_coverContainer"] img');
        if (fresh && fresh !== img) {
          mo.disconnect();
          bodyWatch.disconnect();
          observeCover();
          recolor();
        }
      });
      bodyWatch.observe(document.body, { childList: true, subtree: true });
    };
  
    /* ---------- Старт --------------------------------------------- */
  
    const init = () => { observeCover(); recolor(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();                     // скрипт вставлен после полной загрузки
    }
  })();
  

/**
 * Перенос фонового изображения с player-bar в main-vibe
 */
function updateBackgroundImage() {
  const imgs = document.querySelectorAll('[class*="PlayerBarDesktop_cover"]');
  for (const img of imgs) {
    if (img.src?.includes('/1000x1000')) {
      backgroundReplace(img.src);
      break; // после первого совпадения сразу выходим
    }
  }
}

function backgroundReplace(src) {
  const target = document.querySelector('[class*="MainPage_vibe"]');
  if (target) {
    target.style.background =
      `linear-gradient(180deg, rgba(0,0,0,0.2) 0%, var(--color-dark-6) 100%), 
       url(${src}) center/cover no-repeat`;
  }
}

/**
 * Добавляет эффект увеличения для аватарки
 * — логика 그대로 из Вашего скрипта :contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
 */
function setupAvatarZoomEffect() {
  const avatar = document.querySelector('[class*="PageHeaderCover_coverImage"]');
  if (!avatar) return;
  avatar.classList.add('avatar-zoom');
  avatar.addEventListener('mousemove', e => {
    const r = avatar.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 9;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 9;
    const tx = Math.max(-45, Math.min(45, -x * 11));
    const ty = Math.max(-45, Math.min(45, -y * 11));
    avatar.style.transform = `scale(1.8) translate(${tx}px,${ty}px)`;
  });
  avatar.addEventListener('mouseleave', () => {
    avatar.style.transform = '';
  });
}
/*--------------------------------------------*/

/*--------------------------------------------*/
const observer = new MutationObserver(() => {
    let pin = document.querySelector('.PinItem_root__WSoCn > a[aria-label="Плейлист Мне нравится"]');
    if (pin) {
        let parentPin = pin.closest('.PinItem_root__WSoCn');
        if (parentPin && parentPin.parentNode.firstChild !== parentPin) {
            parentPin.parentNode.insertBefore(parentPin, parentPin.parentNode.firstChild);
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });
/*--------------------------------------------*/
// Отключение тупого даблклика
/*--------------------------------------------*/
function disableDoubleClick() {
    const elements = document.querySelectorAll('.PlayerBar_root__cXUnU');

    elements.forEach(element => {
        element.addEventListener('dblclick', function(event) {
            event.preventDefault();
            event.stopPropagation();
        }, true);
    });
}

setInterval(disableDoubleClick, 1000);
/*--------------------------------------------*/

// Google Noto Sans Font
/*--------------------------------------------*/
const link1 = document.createElement('link');
link1.rel = 'preconnect';
link1.href = 'https://fonts.googleapis.com';
document.head.appendChild(link1);

const link2 = document.createElement('link');
link2.rel = 'preconnect';
link2.href = 'https://fonts.gstatic.com';
link2.crossOrigin = 'anonymous';
document.head.appendChild(link2);

const link3 = document.createElement('link');
link3.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap';
link3.rel = 'stylesheet';
document.head.appendChild(link3);
/*--------------------------------------------*/

/*--------------------------------------------*/
/*Управление handleEvents.json*/
/*--------------------------------------------*/
let settings = {};

let updateInterval;
let settingsDelay = 1000;

function log(text) {
    console.log('[Customizable LOG]: ', text)
}

async function getSettings() {
    try {
        const response = await fetch("http://localhost:2007/get_handle?name=SpotColЛичная");
        if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
        const data = await response.json();
        if (!data?.data?.sections) {
            console.warn("Структура данных не соответствует ожидаемой.");
            return {};
        }
        return Object.fromEntries(data.data.sections.map(({ title, items }) => [
            title,
            Object.fromEntries(items.map(item => [
                item.id,
                item.bool ?? item.input ?? Object.fromEntries(item.buttons?.map(b => [b.name, b.text]) || [])
            ]))
        ]));
    } catch (error) {
        console.error("Ошибка при получении данных:", error);
        return {};
    }
}

async function setSettings(newSettings) {
    setInterval(() => {
        
        if (Object.keys(settings).length === 0 || settings['Действия'].myBackgroundButton !== newSettings['Действия'].myBackgroundButton) {
            setNewBackground(newSettings['Действия'].myBackgroundButton);
        }
    },5000)
    let buttonimage = document.getElementById('Button-image');
        if (!buttonimage) {
            buttonimage = document.createElement('style');
            buttonimage.id = 'Button-image';
            document.head.appendChild(buttonimage);
        }

        buttonimage.textContent = `.Skeleton_header__1uiIw{
        background: ${newSettings['Действия'].myBackgroundButton ? '0;' : 'var(--ym-background-color-primary-enabled-content);'}
        }
        `;
            // Open Blocker
    const modules = [
        'donations', 'concerts', 'userprofile', 'trailers', 'betabutton',
        'vibeanimation', 'globaltabs', 'relevantnow', 'instyle', 'likesandhistory', 'neuromusic',
        'newreleases', 'personalartists', 'personalplaylists', 'recommendedplaylists', 'smartopenplaylist',
        'waves', 'charttracks', 'artistrecommends', 'barbelow', 'podcasts', 'chartalbums',
        'continuelisten', 'editorialartists', 'editorialnewreleases', 'mixedblock',
        'mixesgrid', 'newplaylists', 'nonmusiceditorialcompilation', 'openplaylist'
    ];    

    modules.forEach(module => {
        const settingKey = `OB${module.charAt(0) + module.slice(1)}`;
        const cssId = `openblocker-${module}`;
        const existingLink = document.getElementById(cssId);
        
        if (Object.keys(settings).length === 0 || settings['Open-Blocker'][settingKey] !== newSettings['Open-Blocker'][settingKey]) {
            if (newSettings['Open-Blocker'][settingKey]) {
                if (existingLink) {
                    existingLink.remove();
                }
            } else {
                if (!existingLink) {
                    fetch(`https://raw.githubusercontent.com/Open-Blocker-FYM/Open-Blocker/refs/heads/main/blocker-css/${module}.css`)
                        .then(response => response.text())
                        .then(css => {
                            const style = document.createElement("style");
                            style.id = cssId;
                            style.textContent = css;
                            document.head.appendChild(style);
                        })
                        .catch(error => console.error(`Ошибка загрузки CSS: ${module}`, error));
                }
            }
        }
    });
    let combinedStyle = document.getElementById('combined-style');
    if (!combinedStyle) {
        combinedStyle = document.createElement('style');
        combinedStyle.id = 'combined-style';
        document.head.appendChild(combinedStyle);
    }
    
    combinedStyle.textContent = `
        .PlayerBarDesktop_root__d2Hwi 
        {
            background: ${newSettings['Действия'].togglePlayerBackground ? '0' : '1;'} !important;
        }
        .Content_main__8_wIa 
        {
            background: ${newSettings['Действия'].togglePlayerBackground ? '0' : '1;'} !important;
        }
        .Spotify_Screen 
        {
        background: ${newSettings['Действия'].togglePlayerBackground ? '0' : '1;'} !important;
        }
        .All_Info_Container
        {
        background: ${newSettings['Действия'].togglePlayerBackground ? '0' : '1;'} !important;
        }
        .Artist_Info_Container
        {
        background: ${newSettings['Действия'].togglePlayerBackground ? '0' : '1;'} !important;
        }
        .LikesAndHistoryItem_root__oI1gk
        {
        background: ${newSettings['Действия'].togglePlayerBackground ? '0;' : '1;'} !important;
        }
        .MixCard_root__9tPLV
        {
        background: ${newSettings['Действия'].togglePlayerBackground ? '0;' : '1;'} !important;
        }
        .nHWc2sto1C6Gm0Dpw_l0
        {   
        backdrop-filter:${newSettings['Действия'].togglePlayerBackground ? 'blur (0px);' : 'blur (50px);'} !important;
        }
        .VibeContext_context__Z_82k
        {
        backdrop-filter:${newSettings['Действия'].togglePlayerBackground ? 'blur (0px);' : 'blur (5px);'}
        }
        .NewReleaseCard_root__IY5m_
        {
        border: ${newSettings['Действия'].togglePlayerBackground ? '0px;' : '1px;'} !important;
        background: ${newSettings['Действия'].togglePlayerBackground ? '0;' : '1;'} !important;
        }
        .VibeButton_button__tXFAm
        {
        border: ${newSettings['Действия'].togglePlayerBackground ? '0px;' : '1px;'} !important;
        background: ${newSettings['Действия'].togglePlayerBackground ? '0;' : '1;'} !important;
        }
        .NeuromusicButton_button__kT4GN
        {
        border: ${newSettings['Действия'].togglePlayerBackground ? '0px;' : '1px;'} !important;
        background: ${newSettings['Действия'].togglePlayerBackground ? '0;' : '1;'} !important;       
        }
        .GPT_Info_Container
        {
        background: ${newSettings['Действия'].togglePlayerBackground ? '0;' : '1;'} !important; 
        }
        `;
        let Newbutton = document.getElementById('New-Button');
        if (!Newbutton) {
            Newbutton = document.createElement('style');
            Newbutton.id = 'New-Button';
            document.head.appendChild(Newbutton);
        }

        Newbutton.textContent = `.MainPage_vibe__XEBbh{
        height: ${newSettings['Действия'].Newbuttona ? '89vh;' : '57vh'}
        }
        `;
    
        let buttonhide = document.getElementById('Button-hide');
        if (!buttonhide) {
            buttonhide = document.createElement('style');
            buttonhide.id = 'Button-hide';
            document.head.appendChild(buttonhide);
        }

        buttonhide.textContent = `body > div.WithTopBanner_root__P__x3 > div > div > aside > div > div.NavbarDesktop_scrollableContainer__HLc9D > div > nav > ol > li:nth-child(3) > a > div.zpkgiiHgDpbBThy6gavq {
        visibility: ${newSettings['Действия'].NewbuttonHide ? 'Visible;' : 'hidden;'}
        }
        body > div.WithTopBanner_root__P__x3 > div > div > aside > div > div.NavbarDesktop_scrollableContainer__HLc9D > div > nav > ol > li:nth-child(4) > a > div.zpkgiiHgDpbBThy6gavq {
           left: ${newSettings['Действия'].NewbuttonHide ? '175px;' : '125px'};
    }`;
    // Auto Play
    if (newSettings['Действия'].devAutoPlayOnStart && !window.hasRun) {
        document.querySelector(`section.PlayerBar_root__cXUnU * [data-test-id="PLAY_BUTTON"]`)
        ?.click();
        window.hasRun = true;
    }
    
    // Update theme settings delay
    if (Object.keys(settings).length === 0 || settings['Особое'].setInterval.text !== newSettings['Особое'].setInterval.text) {
        const newDelay = parseInt(newSettings['Особое'].setInterval.text, 10) || 1000;
        if (settingsDelay !== newDelay) {
            settingsDelay = newDelay;

            // Обновление интервала
            clearInterval(updateInterval);
            updateInterval = setInterval(update, settingsDelay);
        }
    }
}

async function update() {
    const newSettings = await getSettings();
    await setSettings(newSettings);
    settings = newSettings;
}

function init() {
    update();
    updateInterval = setInterval(update, settingsDelay);
}

init();
/* ------------------------------------------------------------------
 *  Fake Fullscreen for Yandex-Music  •  (Shift + F)
 * ------------------------------------------------------------------ */
(() => {
  const KEY_COMBO = { key: 'f', shiftKey: true, ctrlKey: false, altKey: false };

  let active = false;                 // режим выключен по умолчанию
  let overlay = null;                 // DOM-узел нашего оверлея
  const kept = new Map();             // originalParent → element (чтобы вернуть назад)

  /* ---------- вспомогалка: проверка комбинации ------------------- */
  const isKeyCombo = e =>
    e.key.toLowerCase() === KEY_COMBO.key &&
    !!e.shiftKey === KEY_COMBO.shiftKey &&
    !!e.ctrlKey  === KEY_COMBO.ctrlKey  &&
    !!e.altKey   === KEY_COMBO.altKey;

  /* ---------- включаем фейковый полноэкран ----------------------- */
  function enterFakeFS() {
    if (active) return;

    /* 1. Создаём оверлей */
    overlay = document.createElement('div');
    overlay.id = 'ym-fake-fs';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:2147483647;
      display:flex; flex-direction:column; gap:24px;
      background:var(--ym-background-color-primary-enabled-content, #000);
      padding:32px; box-sizing:border-box; overflow:auto;
      font-size:clamp(14px,1.4vw,22px);
    `;
    document.body.appendChild(overlay);

    /* 2. Переносим нужные элементы */
    const selectors = [
      '[class*="FullscreenPlayerDesktop_header__"]',
      '[class*="FullscreenPlayerDesktopContent_info__"]',
      '[class*="FullscreenPlayerDesktopContent_additionalContent__"]',
    ];

    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;

      kept.set(el, el.parentElement); // куда вернуть
      overlay.appendChild(el);        // физически перемещаем
      el.style.maxWidth = '100%';     // чтобы не сжимались
    });

    /* 3. Прячем scroll-бар страницы и PlayerBar */
    document.documentElement.classList.add('ym-hide-scroll');
    injectCSS();
    active = true;
  }

  /* ---------- выключаем режим ------------------------------------ */
  function exitFakeFS() {
    if (!active) return;

    /* Возвращаем узлы туда, откуда забрали */
    kept.forEach((parent, el) => {
      if (parent && parent.isConnected) parent.appendChild(el);
    });
    kept.clear();

    overlay?.remove();
    overlay = null;

    document.documentElement.classList.remove('ym-hide-scroll');
    active = false;
  }

  /* ---------- общая точка переключения --------------------------- */
  function toggleFS() {
    active ? exitFakeFS() : enterFakeFS();
  }

  /* ---------- глобальный слушатель клавиатуры ------------------- */
  window.addEventListener('keydown', e => {
    if (isKeyCombo(e)) {
      e.preventDefault();
      toggleFS();
    }
    if (active && e.key === 'Escape') exitFakeFS();  // ESC тоже выключает
  });

  /* ---------- встраиваем минимальный CSS ------------------------- */
  function injectCSS() {
    if (document.getElementById('ym-fake-fs-style')) return;

    const style = document.createElement('style');
    style.id = 'ym-fake-fs-style';
    style.textContent = `
      /* убираем системный скролл когда полноэкран */
      .ym-hide-scroll { overflow:hidden !important; height:100%; }

      /* скрываем Плеер-бар (низ) и шапку приложения */
      #ym-fake-fs + [class*="PlayerBarDesktop_root"],
      #ym-fake-fs + * [class*="PlayerBarDesktop_root"],
      .ym-hide-scroll [class*="AppHeader"] {
        display:none !important;
      }

      /* прячем другие блоки полноэкранника, кроме 3 нужных */
      #ym-fake-fs [class*="FullscreenPlayerDesktop"] > *:not([class*="FullscreenPlayerDesktop_header__"]):not([class*="FullscreenPlayerDesktopContent_info__"]):not([class*="FullscreenPlayerDesktopContent_additionalContent__"]) {
        display:none !important;
      }
    `;
    document.head.appendChild(style);
  }
})();
/* ------------------------------------------------------------------*/
