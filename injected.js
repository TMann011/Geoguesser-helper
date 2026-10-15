(function () {
    'use strict';

    if (window._geoInkwellInjected) return;
    window._geoInkwellInjected = true;

    console.log("[GeoInkwell] Master Interceptor v12.2 Hardened Duel, Re-Scan & Pin Engine Initialized.");

    let currentActiveRoundNumber = 1;
    let lastExtractedLat = null;
    let lastExtractedLng = null;
    let lastExtractedCountryCode = '';
    let currentPanoId = null;
    let currentSourcePriority = 0; // 3 = Authoritative StreetView / SignalR Round, 2 = Duel API / Active Round, 1 = Fiber / DOM, 0 = Generic
    let lastRoundUpdateTime = 0;
    let customVisualCoins = 999999;
    let customVisualTitle = "Master Geoguessr 👑";
    let customVisualLevel = 100;
    let customVisualDivision = "Champion Division 🏆";

    let activeCapturedMapInstance = null;
    let activeCapturedStreetViewInstance = null;
    window._geoInkwellActiveStreetView = null;
    window._geoInkwellCachedGameData = null;

    // --- WEBPACK RUNTIME INTROSPECTION (NEXT.JS / LEAFLET / MAPBOX EXTRACTION) ---
    function checkAndHookMapModule(exp) {
        if (!exp) return;
        const candidates = [exp, exp.Map, exp.default, exp.default?.Map, exp.mapboxgl, exp.mapboxgl?.Map].filter(Boolean);
        for (const c of candidates) {
            if (typeof c === 'function' && c.prototype) {
                if (typeof c.prototype.setView === 'function' || typeof c.prototype.latLngToContainerPoint === 'function') {
                    if (!window.L) {
                        window.L = exp.default || exp;
                    }
                    hookLeafletClass(c);
                }
                if (typeof c.prototype.flyTo === 'function' || typeof c.prototype.project === 'function') {
                    hookMapboxClass(c);
                }
            }
        }
    }

    function hookWebpackArray(chunkArray) {
        if (!chunkArray || chunkArray._geoinkwellHooked) return;
        chunkArray._geoinkwellHooked = true;

        const probeChunk = function (webpackRequire) {
            try {
                if (webpackRequire && webpackRequire.c) {
                    window.__geoinkwell_webpack_require = webpackRequire;
                    for (const moduleId in webpackRequire.c) {
                        const mod = webpackRequire.c[moduleId];
                        if (mod && mod.exports) {
                            checkAndHookMapModule(mod.exports);
                        }
                    }
                }
            } catch (e) {}
        };

        const origPush = chunkArray.push.bind(chunkArray);
        chunkArray.push = function (...args) {
            const res = origPush(...args);
            try {
                origPush([
                    ['geoinkwell_probe_' + Math.random().toString(36).slice(2)],
                    {},
                    probeChunk
                ]);
            } catch (e) {}
            return res;
        };

        try {
            chunkArray.push([
                ['geoinkwell_init_probe_' + Math.random().toString(36).slice(2)],
                {},
                probeChunk
            ]);
        } catch (e) {}
    }

    try {
        if (window.webpackChunk_N_E && Array.isArray(window.webpackChunk_N_E)) {
            hookWebpackArray(window.webpackChunk_N_E);
        } else {
            let chunkHolder = window.webpackChunk_N_E;
            Object.defineProperty(window, 'webpackChunk_N_E', {
                configurable: true,
                enumerable: true,
                get() { return chunkHolder; },
                set(val) {
                    chunkHolder = val;
                    if (val && Array.isArray(val)) {
                        hookWebpackArray(val);
                    }
                }
            });
        }
    } catch (e) {}

    // --- LEAFLET & MAPBOX GLOBAL ENGINE HOOKS & CAPTURE ---
    function hookLeafletClass(MapClass) {
        if (!MapClass || MapClass._inkwellHooked) return;
        try {
            const origInit = MapClass.prototype.initialize;
            if (typeof origInit === 'function') {
                MapClass.prototype.initialize = function (id, options) {
                    const res = origInit.apply(this, arguments);
                    try {
                        const container = this._container || (typeof id === 'string' ? document.getElementById(id) : id);
                        if (container && (container.id === 'hud-interactive-map' || container.closest('#geoinkwell-hud'))) {
                            return res;
                        }
                        activeCapturedMapInstance = { type: 'leaflet', map: this, element: container };
                        window._geoInkwellCapturedMap = activeCapturedMapInstance;
                        if (container) {
                            container._leaflet_map = this;
                            container._geoInkwellMap = this;
                        }
                        console.log("[GeoInkwell] Direct Leaflet Map instance captured via constructor hook!");
                    } catch (e) {}
                    return res;
                };
            }

            // Hook only safe prototype methods to capture already-created map instances dynamically
            const safeMethods = ['setView', 'panTo', 'invalidateSize'];
            for (const m of safeMethods) {
                const orig = MapClass.prototype[m];
                if (typeof orig === 'function' && !orig._geoInkwellWrapped) {
                    const wrapped = function (...args) {
                        try {
                            const container = this._container;
                            if (container && !isExtensionHudElement(container)) {
                                if (!activeCapturedMapInstance || activeCapturedMapInstance.map !== this) {
                                    activeCapturedMapInstance = { type: 'leaflet', map: this, element: container };
                                    window._geoInkwellCapturedMap = activeCapturedMapInstance;
                                    container._leaflet_map = this;
                                    container._geoInkwellMap = this;
                                }
                            }
                        } catch (e) {}
                        return orig.apply(this, args);
                    };
                    wrapped._geoInkwellWrapped = true;
                    MapClass.prototype[m] = wrapped;
                }
            }

            MapClass._inkwellHooked = true;
        } catch (e) {}
    }

    function hookMapboxClass(MapClass) {
        if (!MapClass || MapClass._inkwellHooked) return;
        try {
            const origInit = MapClass.prototype._setup || MapClass.prototype.initialize;
            if (typeof origInit === 'function') {
                MapClass.prototype._setup = function () {
                    const res = origInit.apply(this, arguments);
                    try {
                        const container = this._container || (typeof this.getContainer === 'function' ? this.getContainer() : null);
                        if (container && (container.id === 'hud-interactive-map' || container.closest('#geoinkwell-hud'))) {
                            return res;
                        }
                        activeCapturedMapInstance = { type: 'mapbox', map: this, element: container };
                        window._geoInkwellCapturedMap = activeCapturedMapInstance;
                        if (container) container._geoInkwellMap = this;
                        console.log("[GeoInkwell] Direct Mapbox Map instance captured via constructor hook!");
                    } catch (e) {}
                    return res;
                };
            }
            MapClass._inkwellHooked = true;
        } catch (e) {}
    }

    function hookLeafletGlobal() {
        try {
            if (window.L && window.L.Map) {
                hookLeafletClass(window.L.Map);
            }
        } catch (e) {}
    }
    hookLeafletGlobal();
    if (!window.L) {
        let origL = window.L;
        try {
            Object.defineProperty(window, 'L', {
                configurable: true,
                enumerable: true,
                get() { return origL; },
                set(val) {
                    origL = val;
                    hookLeafletGlobal();
                }
            });
        } catch (e) {}
    }

    // --- DOM ROUND NUMBER DETECTION & GROUND TRUTH ---
    function detectDomRoundNumber() {
        try {
            const roundSelectors = [
                '[data-qa="round-number"]',
                '[data-qa*="round"]',
                '[class*="round-number"]',
                '[class*="round-indicator"]',
                '[class*="game_round"]',
                '[class*="duel-header__round"]',
                '[class*="status__round"]',
                '[class*="header__round"]',
                '[class*="round_roundNumber"]',
                '[class*="game-layout__status"]',
                '[class*="status_section"]'
            ];

            for (const sel of roundSelectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    if (el.closest('#geoinkwell-hud')) continue;
                    const text = (el.innerText || el.textContent || '').trim();
                    if (!text) continue;

                    // Match "Round 2", "Rd 2", "R 2", "Round #2"
                    const m1 = text.match(/\b(?:round|rd|r)\s*#?\s*(\d+)\b/i);
                    if (m1 && m1[1]) {
                        const num = parseInt(m1[1], 10);
                        if (num >= 1 && num <= 100) return num;
                    }

                    // Match "2/5", "2 / 5"
                    const m2 = text.match(/\b(\d+)\s*\/\s*(\d+)\b/);
                    if (m2 && m2[1]) {
                        const num = parseInt(m2[1], 10);
                        if (num >= 1 && num <= 100) return num;
                    }

                    // Match "Round 2 of 5"
                    const m3 = text.match(/\b(?:round|rd)\s*#?\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
                    if (m3 && m3[1]) {
                        const num = parseInt(m3[1], 10);
                        if (num >= 1 && num <= 100) return num;
                    }
                }
            }

            // Fallback: Headings & Status Divs
            const headers = document.querySelectorAll('h1, h2, h3, h4, [class*="status"], [class*="badge"], [class*="round"]');
            for (const h of headers) {
                if (h.closest('#geoinkwell-hud')) continue;
                const text = (h.innerText || h.textContent || '').trim();
                const m1 = text.match(/\b(?:round|rd)\s*#?\s*(\d+)\b/i);
                if (m1 && m1[1]) {
                    const num = parseInt(m1[1], 10);
                    if (num >= 1 && num <= 100) return num;
                }
                const m2 = text.match(/\b(\d+)\s*\/\s*(\d+)\b/);
                if (m2 && m2[1]) {
                    const num = parseInt(m2[1], 10);
                    if (num >= 1 && num <= 100) return num;
                }
            }
        } catch (e) {}
        return null;
    }

    function setNewActiveRound(newRoundNum) {
        if (!newRoundNum || isNaN(newRoundNum)) return;
        if (newRoundNum === currentActiveRoundNumber && lastExtractedLat !== null) return;

        console.log(`[GeoInkwell] ADVANCING ROUND STATE: Round ${currentActiveRoundNumber} -> Round ${newRoundNum}`);
        currentActiveRoundNumber = newRoundNum;
        lastExtractedLat = null;
        lastExtractedLng = null;
        lastExtractedCountryCode = '';
        currentPanoId = null;
        currentSourcePriority = 0;
        lastRoundUpdateTime = 0;
        activeCapturedMapInstance = null;

        window.postMessage({
            type: 'GEOINKWELL_ROUND_CHANGED',
            payload: { roundNumber: currentActiveRoundNumber }
        }, '*');

        // Trigger immediate targeted scans for new round
        setTimeout(() => {
            scanGoogleStreetViewGlobal();
            scanStreetViewReactFiber();
        }, 120);
        setTimeout(() => {
            scanGoogleStreetViewGlobal();
            scanStreetViewReactFiber();
        }, 500);
        setTimeout(() => {
            scanGoogleStreetViewGlobal();
            scanStreetViewReactFiber();
            scanAllDomReactFiber(true);
        }, 1100);
    }

    // Monitor round progression via MutationObserver
    try {
        const roundObserver = new MutationObserver(() => {
            const detected = detectDomRoundNumber();
            if (detected !== null && detected !== currentActiveRoundNumber) {
                setNewActiveRound(detected);
            }
        });
        if (document.body) {
            roundObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) roundObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
            });
        }
    } catch (e) {}

    function isDummyLocation(lat, lng) {
        if (isNaN(lat) || isNaN(lng)) return true;
        if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return true; // Null Island
        // GeoGuessr default initial StreetView component fallback at Alcatraz (37.826655, -122.422890)
        if (lat >= 37.820 && lat <= 37.835 && lng >= -122.430 && lng <= -122.415) return true;
        // San Francisco Center fallback (37.7749, -122.4194)
        if (lat >= 37.770 && lat <= 37.785 && lng >= -122.425 && lng <= -122.410) return true;
        // Mini-map corner/bounds Mercator fallbacks
        if (lat <= -55.0 || lat >= 72.0) return true;
        if (Math.abs(lat - 76.418477) < 0.2 && Math.abs(lng - 178.369279) < 0.2) return true;
        return false;
    }

    function isExtensionHudElement(el) {
        if (!el || typeof el !== 'object') return false;
        try {
            if (el.id === 'geoinkwell-hud' || el.id === 'hud-interactive-map') return true;
            if (typeof el.closest === 'function' && el.closest('#geoinkwell-hud')) return true;
        } catch (e) {}
        return false;
    }

    function isGuessMapElement(el) {
        if (!el || typeof el !== 'object') return false;
        if (isExtensionHudElement(el)) return true;
        try {
            if (typeof el.closest === 'function') {
                if (el.closest('[class*="guess-map"]') || el.closest('[data-qa*="guess-map"]') || el.closest('[class*="GuessMap"]') || el.closest('[class*="game-map"]') || el.closest('[class*="minimap"]') || el.closest('[class*="map-canvas"]')) return true;
            }
            const cls = el.className ? String(el.className) : '';
            if (cls.includes('guess-map') || cls.includes('game-map') || cls.includes('minimap') || cls.includes('leaflet-container') || cls.includes('mapboxgl-map')) return true;
        } catch (e) {}
        return false;
    }

    function findGameMapElement() {
        const selectors = [
            '[data-qa="guess-map"]',
            '[data-qa="guess-map-canvas"]',
            '[class*="guess-map_canvas"]',
            '[class*="guess-map__canvas"]',
            '[class*="guess-map_container"]',
            '[class*="guess-map__container"]',
            '[class*="guess-map"]',
            '[class*="GuessMap"]',
            '[class*="game-map"]',
            '[class*="minimap"]',
            '.leaflet-container',
            '.mapboxgl-map'
        ];
        for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
                if (!isExtensionHudElement(el)) {
                    return el;
                }
            }
        }
        return null;
    }

    function getActiveRoundIndex(obj, roundsLength) {
        if (!obj || roundsLength <= 0) return Math.max(0, roundsLength - 1);

        // Ground Truth 1: Player Guesses Array Length (Completed guesses count deterministically = current round index)
        const playerGuesses = obj.player?.guesses || obj.guesses || (obj.players && obj.players[0]?.guesses);
        if (Array.isArray(playerGuesses)) {
            const completedCount = playerGuesses.length;
            if (completedCount >= 0 && completedCount < roundsLength) {
                return completedCount;
            }
        }

        // Ground Truth 2: Explicit currentRoundNumber or round property
        let rNum = null;
        if (typeof obj.currentRoundNumber === 'number') rNum = obj.currentRoundNumber;
        else if (typeof obj.currentRoundNumber === 'string') rNum = parseInt(obj.currentRoundNumber, 10);
        else if (typeof obj.currentRound === 'number') rNum = obj.currentRound;
        else if (typeof obj.currentRound === 'string') rNum = parseInt(obj.currentRound, 10);
        else if (obj.currentRound && typeof obj.currentRound === 'object') {
            if (typeof obj.currentRound.roundNumber === 'number') rNum = obj.currentRound.roundNumber;
            else if (typeof obj.currentRound.number === 'number') rNum = obj.currentRound.number;
        }
        else if (typeof obj.round === 'number') rNum = obj.round;
        else if (typeof obj.roundNumber === 'number') rNum = obj.roundNumber;

        // Ground Truth 3: Detected DOM round number
        if (rNum === null || isNaN(rNum)) {
            const domR = detectDomRoundNumber();
            if (domR !== null) rNum = domR;
            else rNum = currentActiveRoundNumber;
        }

        if (rNum !== null && !isNaN(rNum)) {
            const idx = rNum - 1;
            if (idx >= 0 && idx < roundsLength) return idx;
        }

        // Duels: Latest round is usually the active round
        return Math.max(0, roundsLength - 1);
    }

    // --- UNIVERSAL FETCH & XHR NETWORK INTERCEPTOR ---
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (url.includes('/api/') || url.includes('_next/data/') || url.includes('/maps/') || url.includes('geoguessr') || url.includes('duels') || url.includes('game') || url.includes('challenge')) {
                const clone = response.clone();
                clone.text().then(text => {
                    try {
                        const data = JSON.parse(text);
                        window._geoInkwellCachedGameData = data;
                        handleDuelPayload(data, 'Fetch API Game Payload');
                        scanObjectForCoordinates(data, 'Fetch API Object');
                    } catch (e) {
                        scanStringForCoordinates(text, 'Fetch API Text Net');
                    }
                }).catch(() => {});
            }
        } catch (e) {}
        return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            try {
                if (this._url && (this._url.includes('/api/') || this._url.includes('_next/data/') || this._url.includes('geoguessr') || this._url.includes('duels') || this._url.includes('game') || this._url.includes('challenge'))) {
                    try {
                        const data = JSON.parse(this.responseText);
                        window._geoInkwellCachedGameData = data;
                        handleDuelPayload(data, 'XHR Request Game Payload');
                        scanObjectForCoordinates(data, 'XHR Request Object');
                    } catch (e) {
                        scanStringForCoordinates(this.responseText, 'XHR Text Net');
                    }
                }
            } catch (e) {}
        });
        return originalSend.apply(this, arguments);
    };

    // --- WEBSOCKET REAL-TIME INTERCEPTOR (SIGNALR & DUELS HARDENED PROXY) ---
    if (window.WebSocket && !window.WebSocket._inkwellHooked) {
        const OriginalWebSocket = window.WebSocket;

        const InkwellWebSocket = function (...args) {
            const ws = new OriginalWebSocket(...args);
            try {
                ws.addEventListener('message', function (event) {
                    parseWebSocketPayload(event.data);
                });
            } catch (e) {}
            return ws;
        };

        try {
            Object.setPrototypeOf(InkwellWebSocket, OriginalWebSocket);
            InkwellWebSocket.prototype = OriginalWebSocket.prototype;
            InkwellWebSocket._inkwellHooked = true;
            window.WebSocket = InkwellWebSocket;
        } catch (e) {}
    }

    function handleDuelPayload(obj, source) {
        if (!obj || typeof obj !== 'object') return false;

        const duelObj = obj.duel || obj.game || obj.gameState || obj;

        let rNum = duelObj.currentRoundNumber || duelObj.roundNumber || duelObj.round || obj.currentRoundNumber || obj.roundNumber;
        if (typeof rNum === 'string') rNum = parseInt(rNum, 10);

        if (typeof rNum === 'number' && !isNaN(rNum) && rNum >= 1 && rNum !== currentActiveRoundNumber) {
            setNewActiveRound(rNum);
        }

        // Direct Panorama Object (e.g. RoundStarted or single-round payload)
        const directPano = obj.panorama || duelObj.panorama || obj.currentRound?.panorama || duelObj.currentRound?.panorama;
        if (directPano && typeof directPano === 'object') {
            const rawLat = directPano.lat !== undefined ? directPano.lat : directPano.latitude;
            const rawLng = directPano.lng !== undefined ? directPano.lng : directPano.longitude;
            if (rawLat !== undefined && rawLng !== undefined) {
                const lat = parseFloat(rawLat);
                const lng = parseFloat(rawLng);
                if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    broadcastLocation(lat, lng, directPano.countryCode || '', `${source} (Direct Panorama)`, directPano.panoId || directPano.pano || '', directPano.heading || 0, directPano.pitch || 0, 3);
                    return true;
                }
            }
        }

        // Rounds Array Traversal
        const rounds = duelObj.rounds || duelObj.duelRounds || obj.rounds;
        if (Array.isArray(rounds) && rounds.length > 0) {
            const targetIdx = getActiveRoundIndex(duelObj, rounds.length);
            const activeRound = rounds[targetIdx];
            if (activeRound) {
                const target = activeRound.panorama || activeRound;
                const rawLat = target.lat !== undefined ? target.lat : target.latitude;
                const rawLng = target.lng !== undefined ? target.lng : target.longitude;
                if (rawLat !== undefined && rawLng !== undefined) {
                    const lat = parseFloat(rawLat);
                    const lng = parseFloat(rawLng);
                    if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                        const countryCode = target.countryCode || activeRound.countryCode || '';
                        broadcastLocation(lat, lng, countryCode, `${source} (Active Round ${targetIdx + 1})`, target.panoId || target.pano || '', target.heading || 0, target.pitch || 0, 3);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function parseWebSocketPayload(rawData) {
        if (!rawData) return;

        let strData = '';
        if (typeof rawData === 'string') {
            strData = rawData;
        } else if (rawData instanceof ArrayBuffer) {
            try { strData = new TextDecoder('utf-8').decode(new Uint8Array(rawData)); } catch (e) {}
        } else if (window.Blob && rawData instanceof Blob) {
            try {
                rawData.text().then(text => parseWebSocketPayload(text)).catch(() => {});
            } catch (e) {}
            return;
        }

        if (!strData) return;

        // Split SignalR Record Separator (\u001e)
        const packets = strData.split('\u001e');
        for (const pkt of packets) {
            const trimmed = pkt.trim();
            if (!trimmed) continue;
            let success = false;
            try {
                const parsed = JSON.parse(trimmed);
                window._geoInkwellCachedGameData = parsed;

                // SignalR Invocation packet (type: 1)
                if (parsed.type === 1 && Array.isArray(parsed.arguments)) {
                    for (const arg of parsed.arguments) {
                        if (handleDuelPayload(arg, `WebSocket SignalR [${parsed.target || 'Duel'}]`)) {
                            success = true;
                            break;
                        }
                    }
                }

                if (!success) {
                    success = handleDuelPayload(parsed, 'WebSocket Duel State');
                }

                if (!success) {
                    success = scanObjectForCoordinates(parsed, 'WebSocket SignalR Packet');
                }
            } catch (e) {}

            if (!success) {
                scanStringForCoordinates(trimmed, 'WebSocket Fallback Net');
            }
        }
    }

    function scanStringForCoordinates(str, source) {
        if (!str || typeof str !== 'string' || str.length < 20) return false;
        try {
            const latMatches = str.match(/"lat(?:itude)?"\s*:\s*(-?\d+\.\d+)/gi);
            const lngMatches = str.match(/"lng|longitude"\s*:\s*(-?\d+\.\d+)/gi);

            if (latMatches && lngMatches) {
                const lats = latMatches.map(m => parseFloat(m.replace(/[^0-9.-]/g, ''))).filter(n => !isNaN(n) && Math.abs(n) <= 90);
                const lngs = lngMatches.map(m => parseFloat(m.replace(/[^0-9.-]/g, ''))).filter(n => !isNaN(n) && Math.abs(n) <= 180);

                if (lats.length > 0 && lngs.length > 0) {
                    const lat = lats[lats.length - 1];
                    const lng = lngs[lngs.length - 1];
                    if (!isDummyLocation(lat, lng)) {
                        broadcastLocation(lat, lng, null, `${source} (Regex Parser)`, '', 0, 0, 1);
                        return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    // --- STREETVIEW & GOOGLE MAPS INTERCEPTOR ---
    function ensurePanoInstanceHooked(instance) {
        if (!instance || typeof instance !== 'object') return;
        activeCapturedStreetViewInstance = instance;
        window._geoInkwellActiveStreetView = instance;

        if (instance._inkwellListenersAttached) return;
        instance._inkwellListenersAttached = true;

        function checkInstanceLocation(eventLabel) {
            try {
                const pos = typeof instance.getPosition === 'function' ? instance.getPosition() : null;
                if (pos) {
                    const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                    const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                    const panoId = typeof instance.getPano === 'function' ? instance.getPano() : '';
                    if (lat && lng && !isDummyLocation(lat, lng)) {
                        broadcastLocation(lat, lng, null, `StreetView ${eventLabel}`, panoId, 0, 0, 3);
                    }
                }
            } catch (e) {}
        }

        if (typeof instance.addListener === 'function') {
            try {
                instance.addListener('position_changed', () => checkInstanceLocation('position_changed'));
                instance.addListener('status_changed', () => checkInstanceLocation('status_changed'));
                instance.addListener('pano_changed', () => checkInstanceLocation('pano_changed'));
            } catch (e) {}
        }
    }

    function hookGoogleMaps() {
        if (window.google && window.google.maps) {
            if (window.google.maps.StreetViewPanorama && window.google.maps.StreetViewPanorama.prototype._inkwellHooked) return;
            if (window.google.maps.StreetViewPanorama) {
                const OriginalPano = window.google.maps.StreetViewPanorama;

                const InkwellPano = function (container, options) {
                    const instance = new OriginalPano(container, options);
                    try {
                        ensurePanoInstanceHooked(instance);
                        if (options && options.position) {
                            const lat = typeof options.position.lat === 'function' ? options.position.lat() : options.position.lat;
                            const lng = typeof options.position.lng === 'function' ? options.position.lng() : options.position.lng;
                            if (lat && lng && !isDummyLocation(lat, lng)) {
                                broadcastLocation(lat, lng, null, 'Google StreetView Constructor', options.pano || '', 0, 0, 3);
                            }
                        }
                    } catch (e) {}
                    return instance;
                };

                Object.setPrototypeOf(InkwellPano, OriginalPano);
                InkwellPano.prototype = OriginalPano.prototype;

                const origSetPosition = OriginalPano.prototype.setPosition;
                OriginalPano.prototype.setPosition = function (latLng) {
                    ensurePanoInstanceHooked(this);
                    if (latLng) {
                        const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
                        const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
                        const panoId = typeof this.getPano === 'function' ? this.getPano() : '';
                        if (lat && lng && !isDummyLocation(lat, lng)) {
                            broadcastLocation(lat, lng, null, 'Google StreetView setPosition Hook', panoId, 0, 0, 3);
                        }
                    }
                    return origSetPosition.apply(this, arguments);
                };

                const origSetPano = OriginalPano.prototype.setPano;
                OriginalPano.prototype.setPano = function (pano) {
                    ensurePanoInstanceHooked(this);
                    try {
                        if (pano && typeof pano === 'string') {
                            currentPanoId = pano;
                        }
                        const pos = typeof this.getPosition === 'function' ? this.getPosition() : null;
                        if (pos) {
                            const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                            const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                            if (lat && lng && !isDummyLocation(lat, lng)) {
                                broadcastLocation(lat, lng, null, 'Google StreetView setPano Hook', pano || '', 0, 0, 3);
                            }
                        }
                    } catch (e) {}
                    return origSetPano.apply(this, arguments);
                };

                const origSetOptions = OriginalPano.prototype.setOptions;
                OriginalPano.prototype.setOptions = function (opts) {
                    ensurePanoInstanceHooked(this);
                    if (opts) {
                        if (opts.position) {
                            const lat = typeof opts.position.lat === 'function' ? opts.position.lat() : opts.position.lat;
                            const lng = typeof opts.position.lng === 'function' ? opts.position.lng() : opts.position.lng;
                            if (lat && lng && !isDummyLocation(lat, lng)) {
                                broadcastLocation(lat, lng, null, 'Google StreetView setOptions Hook', opts.pano || '', 0, 0, 3);
                            }
                        }
                        if (opts.pano) currentPanoId = opts.pano;
                    }
                    if (origSetOptions) return origSetOptions.apply(this, arguments);
                };

                const origSetVisible = OriginalPano.prototype.setVisible;
                OriginalPano.prototype.setVisible = function (flag) {
                    ensurePanoInstanceHooked(this);
                    if (origSetVisible) return origSetVisible.apply(this, arguments);
                };

                OriginalPano.prototype._inkwellHooked = true;
                window.google.maps.StreetViewPanorama = InkwellPano;
                console.log("[GeoInkwell] Successfully hooked Google StreetView Constructor & Prototypes.");
            }

            // Hook Google Maps StreetViewService for direct service-level queries
            if (window.google.maps.StreetViewService && !window.google.maps.StreetViewService.prototype._inkwellHooked) {
                const origGetPano = window.google.maps.StreetViewService.prototype.getPanorama;
                if (typeof origGetPano === 'function') {
                    window.google.maps.StreetViewService.prototype.getPanorama = function (request, callback) {
                        const wrappedCb = function (data, status) {
                            try {
                                if (status === 'OK' && data && data.location && data.location.latLng) {
                                    const loc = data.location;
                                    const lat = typeof loc.latLng.lat === 'function' ? loc.latLng.lat() : loc.latLng.lat;
                                    const lng = typeof loc.latLng.lng === 'function' ? loc.latLng.lng() : loc.latLng.lng;
                                    if (lat && lng && !isDummyLocation(lat, lng)) {
                                        broadcastLocation(lat, lng, null, 'StreetViewService.getPanorama', loc.pano || '', 0, 0, 3);
                                    }
                                }
                            } catch (e) {}
                            if (typeof callback === 'function') return callback.apply(this, arguments);
                        };
                        return origGetPano.call(this, request, wrappedCb);
                    };
                }

                const origGetPanoById = window.google.maps.StreetViewService.prototype.getPanoramaById;
                if (typeof origGetPanoById === 'function') {
                    window.google.maps.StreetViewService.prototype.getPanoramaById = function (pano, callback) {
                        const wrappedCb = function (data, status) {
                            try {
                                if (status === 'OK' && data && data.location && data.location.latLng) {
                                    const loc = data.location;
                                    const lat = typeof loc.latLng.lat === 'function' ? loc.latLng.lat() : loc.latLng.lat;
                                    const lng = typeof loc.latLng.lng === 'function' ? loc.latLng.lng() : loc.latLng.lng;
                                    if (lat && lng && !isDummyLocation(lat, lng)) {
                                        broadcastLocation(lat, lng, null, 'StreetViewService.getPanoramaById', loc.pano || pano || '', 0, 0, 3);
                                    }
                                }
                            } catch (e) {}
                            if (typeof callback === 'function') return callback.apply(this, arguments);
                        };
                        return origGetPanoById.call(this, pano, wrappedCb);
                    };
                }
                window.google.maps.StreetViewService.prototype._inkwellHooked = true;
            }

            // Hook Google Maps Map prototype getStreetView / setStreetView
            if (window.google.maps.Map && !window.google.maps.Map.prototype._inkwellHooked) {
                const origGetStreetView = window.google.maps.Map.prototype.getStreetView;
                if (typeof origGetStreetView === 'function') {
                    window.google.maps.Map.prototype.getStreetView = function () {
                        const pano = origGetStreetView.apply(this, arguments);
                        if (pano) ensurePanoInstanceHooked(pano);
                        return pano;
                    };
                }
                const origSetStreetView = window.google.maps.Map.prototype.setStreetView;
                if (typeof origSetStreetView === 'function') {
                    window.google.maps.Map.prototype.setStreetView = function (pano) {
                        if (pano) ensurePanoInstanceHooked(pano);
                        return origSetStreetView.apply(this, arguments);
                    };
                }
                window.google.maps.Map.prototype._inkwellHooked = true;
            }
        }
    }
    setInterval(hookGoogleMaps, 1000);

    try {
        if (window.google && window.google.maps) {
            hookGoogleMaps();
        } else {
            let origGoogle = window.google;
            Object.defineProperty(window, 'google', {
                configurable: true,
                enumerable: true,
                get() { return origGoogle; },
                set(val) {
                    origGoogle = val;
                    if (val && val.maps) setTimeout(hookGoogleMaps, 0);
                }
            });
        }
    } catch (e) {}

    function scanGoogleStreetViewGlobal() {
        try {
            // Direct query of captured StreetView instance
            const activeInst = window._geoInkwellActiveStreetView || activeCapturedStreetViewInstance;
            if (activeInst && typeof activeInst.getPosition === 'function') {
                const pos = activeInst.getPosition();
                if (pos) {
                    const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                    const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                    const panoId = typeof activeInst.getPano === 'function' ? activeInst.getPano() : '';
                    if (lat && lng && !isDummyLocation(lat, lng)) {
                        broadcastLocation(lat, lng, null, 'Captured StreetView Instance', panoId, 0, 0, 3);
                        return true;
                    }
                }
            }

            const els = document.querySelectorAll('.gm-style, [class*="street-view"], [class*="pano"], [class*="game"], [class*="duel"]');
            for (const el of els) {
                if (isGuessMapElement(el)) continue;
                for (const k in el) {
                    try {
                        const target = el[k];
                        if (target && typeof target === 'object') {
                            if (typeof target.getPosition === 'function') {
                                ensurePanoInstanceHooked(target);
                                const pos = target.getPosition();
                                if (pos) {
                                    const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                                    const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                                    const panoId = typeof target.getPano === 'function' ? target.getPano() : '';
                                    if (lat && lng && !isDummyLocation(lat, lng)) {
                                        broadcastLocation(lat, lng, null, 'DOM Google StreetView Instance', panoId, 0, 0, 3);
                                        return true;
                                    }
                                }
                            }
                            if (target.location || target.position || target.__gm) {
                                const loc = target.location || target.position || (target.__gm ? target.__gm.location : null);
                                if (loc && loc.latLng) {
                                    const lat = typeof loc.latLng.lat === 'function' ? loc.latLng.lat() : loc.latLng.lat;
                                    const lng = typeof loc.latLng.lng === 'function' ? loc.latLng.lng() : loc.latLng.lng;
                                    if (lat && lng && !isDummyLocation(lat, lng)) {
                                        broadcastLocation(lat, lng, null, 'DOM StreetView Internal State', loc.pano || '', 0, 0, 3);
                                        return true;
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
        return false;
    }
    setInterval(scanGoogleStreetViewGlobal, 1500);

    // --- REACT FIBER SCANNER ---
    function scanAllDomReactFiber(isDeep = false) {
        try {
            const candidates = document.querySelectorAll('main, #app, #__next, [class*="game"], [class*="duel"], [class*="panorama"], [class*="street-view"], [class*="canvas"], [class*="layout"], [class*="page"], [data-qa]');
            const limit = isDeep ? Math.min(candidates.length, 100) : Math.min(candidates.length, 35);

            for (let i = 0; i < limit; i++) {
                const el = candidates[i];
                if (isGuessMapElement(el)) continue;

                for (const k in el) {
                    if (k.startsWith('__reactFiber$') || k.startsWith('__reactProps$')) {
                        try {
                            let fiber = el[k];
                            let depth = 0;
                            while (fiber && depth < 25) {
                                if (fiber.memoizedProps) scanObjectForCoordinates(fiber.memoizedProps, 'React Fiber Props');
                                if (fiber.memoizedState) scanObjectForCoordinates(fiber.memoizedState, 'React Fiber State');
                                if (fiber.pendingProps) scanObjectForCoordinates(fiber.pendingProps, 'React Fiber Pending');
                                fiber = fiber.return;
                                depth++;
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}
    }
    setInterval(scanAllDomReactFiber, 2200);

    // --- FORCED DEEP RESCANNER PRIMITIVE (PURGES ALL STALE LOCATIONS) ---
    function forceDeepScanAllSources() {
        console.log("[GeoInkwell] FORCED DEEP RESCAN ACTIVATED for Active Round...");

        // Re-detect round number ground truth
        const domR = detectDomRoundNumber();
        if (domR !== null) currentActiveRoundNumber = domR;

        lastExtractedLat = null;
        lastExtractedLng = null;
        currentPanoId = null;
        currentSourcePriority = 0;
        lastRoundUpdateTime = 0;

        // Source 1: Authoritative Active StreetView Panorama instance
        const activeInst = window._geoInkwellActiveStreetView || activeCapturedStreetViewInstance;
        if (activeInst && typeof activeInst.getPosition === 'function') {
            try {
                const pos = activeInst.getPosition();
                if (pos) {
                    const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                    const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                    const panoId = typeof activeInst.getPano === 'function' ? activeInst.getPano() : '';
                    if (lat && lng && !isDummyLocation(lat, lng)) {
                        broadcastLocation(lat, lng, null, 'Forced Rescan StreetView Instance', panoId, 0, 0, 3, true);
                        return;
                    }
                }
            } catch (e) {}
        }

        // Source 2: Cached Network Game Payload re-evaluation
        if (window._geoInkwellCachedGameData) {
            try {
                if (handleDuelPayload(window._geoInkwellCachedGameData, 'Forced Rescan Game Cache')) return;
                if (scanObjectForCoordinates(window._geoInkwellCachedGameData, 'Forced Rescan Cached Object')) return;
            } catch (e) {}
        }

        // Source 3: Next.js Page Props
        if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
            try {
                if (scanObjectForCoordinates(window.__NEXT_DATA__.props, 'Forced Rescan Next Data')) return;
            } catch (e) {}
        }

        // Source 4: DOM Google StreetView instance
        if (scanGoogleStreetViewGlobal()) return;

        // Source 5: Global window.google.maps instances
        try {
            if (window.google && window.google.maps) {
                for (const key in window.google.maps) {
                    const item = window.google.maps[key];
                    if (item && typeof item === 'object' && typeof item.getPosition === 'function') {
                        const pos = item.getPosition();
                        if (pos) {
                            const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                            const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                            if (lat && lng && !isDummyLocation(lat, lng)) {
                                broadcastLocation(lat, lng, null, 'Forced Rescan Window StreetView', '', 0, 0, 3, true);
                                return;
                            }
                        }
                    }
                }
            }
        } catch (e) {}

        // Source 6: StreetView React Fiber & All DOM React Fiber
        if (scanStreetViewReactFiber()) return;
        scanAllDomReactFiber(true);
    }

    // --- CLIENT-SIDE VISUAL PROFILE MODIFIER ---
    function updateClientSideProfileVisuals() {
        const coinEls = document.querySelectorAll('[class*="coin"], [class*="currency"], [data-qa="user-coins"]');
        coinEls.forEach(el => {
            if (el && el.children.length === 0) el.innerText = customVisualCoins.toLocaleString();
        });

        const titleEls = document.querySelectorAll('[class*="user-title"], [data-qa="user-title"], [class*="profile-title"]');
        titleEls.forEach(el => {
            if (el && customVisualTitle) el.innerText = customVisualTitle;
        });

        const levelEls = document.querySelectorAll('[class*="level-number"], [class*="user-level"], [data-qa="user-level"]');
        levelEls.forEach(el => {
            if (el) el.innerText = `Lvl ${customVisualLevel}`;
        });

        const divisionEls = document.querySelectorAll('[class*="division-badge"], [class*="rank-title"], [data-qa="user-division"]');
        divisionEls.forEach(el => {
            if (el && customVisualDivision) el.innerText = customVisualDivision;
        });
    }
    setInterval(updateClientSideProfileVisuals, 2500);

    // --- CORE UNIVERSAL OBJECT SCANNER ---
    function scanObjectForCoordinates(obj, source, depth = 0, visited = new WeakSet()) {
        if (!obj || typeof obj !== 'object' || depth > 8) return false;

        try {
            if (visited.has(obj)) return false;
            visited.add(obj);
        } catch (e) {
            return false;
        }

        if (typeof Element !== 'undefined' && obj instanceof Element) return false;
        if (typeof Node !== 'undefined' && obj instanceof Node) return false;

        // Reject guesses, scores, player inputs, and map bounding boxes
        if (obj.distance !== undefined || obj.score !== undefined || obj.timeSpent !== undefined || obj.isGuess || obj.myGuess || obj.opGuess) {
            return false;
        }

        // Priority 1: Duel / Game Containers with Rounds Array
        const duelContainer = obj.duel || obj.game || obj.gameState || obj;
        const roundsArray = duelContainer.rounds || duelContainer.duelRounds;
        if (Array.isArray(roundsArray) && roundsArray.length > 0) {
            const activeIdx = getActiveRoundIndex(duelContainer, roundsArray.length);
            const targetRound = roundsArray[activeIdx];
            if (targetRound) {
                const target = targetRound.panorama || targetRound;
                const rawLat = target.lat !== undefined ? target.lat : target.latitude;
                const rawLng = target.lng !== undefined ? target.lng : target.longitude;
                if (rawLat !== undefined && rawLng !== undefined) {
                    const lat = parseFloat(rawLat);
                    const lng = parseFloat(rawLng);
                    if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                        const countryCode = target.countryCode || targetRound.countryCode || '';
                        broadcastLocation(lat, lng, countryCode, `${source} (Active Round ${activeIdx + 1})`, target.panoId || target.pano || '', target.heading || 0, target.pitch || 0, 2);
                        return true;
                    }
                }
            }
        }

        // Priority 2: Direct Active Round Object
        if (obj.currentRound && typeof obj.currentRound === 'object') {
            const target = obj.currentRound.panorama || obj.currentRound;
            const rawLat = target.lat !== undefined ? target.lat : target.latitude;
            const rawLng = target.lng !== undefined ? target.lng : target.longitude;
            if (rawLat !== undefined && rawLng !== undefined) {
                const lat = parseFloat(rawLat);
                const lng = parseFloat(rawLng);
                if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    const countryCode = target.countryCode || obj.currentRound.countryCode || '';
                    broadcastLocation(lat, lng, countryCode, `${source} (Current Round Sub-Object)`, target.panoId || target.pano || '', 0, 0, 2);
                    return true;
                }
            }
        }

        // Priority 3: Panorama Object with PanoId
        if (obj.panoId || obj.pano || obj.panorama) {
            const target = obj.panorama && typeof obj.panorama === 'object' ? obj.panorama : obj;
            const rawLat = target.lat !== undefined ? target.lat : target.latitude;
            const rawLng = target.lng !== undefined ? target.lng : target.longitude;
            if (rawLat !== undefined && rawLng !== undefined) {
                const lat = parseFloat(rawLat);
                const lng = parseFloat(rawLng);
                if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    const countryCode = target.countryCode || obj.countryCode || (target.country ? target.country.code || target.country : '');
                    broadcastLocation(lat, lng, countryCode, source, target.panoId || target.pano || obj.panoId || '', target.heading || 0, target.pitch || 0, 2);
                    return true;
                }
            }
        }

        // Priority 4: Direct Lat/Lng Properties
        if (obj.location || obj.position || obj.latLng || obj.point) {
            const loc = obj.location || obj.position || obj.latLng || obj.point;
            if (loc && typeof loc === 'object') {
                const rawLat = loc.lat !== undefined ? loc.lat : loc.latitude;
                const rawLng = loc.lng !== undefined ? loc.lng : loc.longitude;
                if (rawLat !== undefined && rawLng !== undefined) {
                    const lat = typeof rawLat === 'function' ? rawLat() : parseFloat(rawLat);
                    const lng = typeof rawLng === 'function' ? rawLng() : parseFloat(rawLng);
                    if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                        broadcastLocation(lat, lng, obj.countryCode || '', source, obj.panoId || '', 0, 0, 2);
                        return true;
                    }
                }
            }
        }

        // Priority 5: Blacklist Property Traversal
        const skipKeys = new Set([
            'guess', 'guesses', 'pin', 'player', 'opponent', 'myGuess', 'opGuess', 'score', 
            'distance', 'bounds', 'polygon', 'bbox', 'center', '_owner', '_reactFiber', 
            '_reactProps', '_reactContainer', '_leaflet', '_mapbox', 'window', 'document', 
            'parent', 'previousRounds', 'pastRounds', 'completedRounds', 'gameHistory', 'history',
            'player1', 'player2', 'team1', 'team2', 'stateNode', 'child', 'return', 'sibling',
            'dependencies', 'context', 'currentTheme', 'meta'
        ]);

        try {
            for (const key in obj) {
                if (skipKeys.has(key)) continue;
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const val = obj[key];
                    if (val && typeof val === 'object') {
                        if (scanObjectForCoordinates(val, source, depth + 1, visited)) return true;
                    } else if (typeof val === 'string' && val.length > 20 && (val.startsWith('{') || val.startsWith('['))) {
                        try {
                            const parsedVal = JSON.parse(val);
                            if (parsedVal && typeof parsedVal === 'object') {
                                if (scanObjectForCoordinates(parsedVal, source + ' (Parsed JSON)', depth + 1, visited)) return true;
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}

        return false;
    }

    const WORLD_BBOX_CLASSIFIER = [
        [17.8, 18.6, -67.3, -65.2, 'PR'],
        [17.6, 18.4, -65.1, -64.5, 'VI'],
        [32.2, 32.4, -64.9, -64.6, 'BM'],
        [12.0, 12.4, -69.2, -68.7, 'CW'],
        [17.5, 20.0, -72.0, -68.3, 'DO'],
        [59.7, 83.7, -73.1, -11.3, 'GL'],
        [51.2, 71.4, -179.9, -129.9, 'US'],
        [18.9, 28.5, -178.4, -154.8, 'US'],
        [24.5, 49.4, -125.0, -66.9, 'US'],
        [41.6, 83.2, -141.0, -52.6, 'CA'],
        [14.5, 32.8, -118.4, -86.7, 'MX'],
        [13.7, 17.9, -92.3, -88.2, 'GT'],
        [13.1, 14.5, -90.2, -87.6, 'SV'],
        [8.0, 11.3, -86.0, -82.5, 'CR'],
        [7.2, 9.7, -83.1, -77.1, 'PA'],
        [-4.3, 12.5, -79.1, -66.8, 'CO'],
        [-1.5, 0.7, -92.0, -89.2, 'EC'],
        [-5.0, 1.5, -81.1, -75.1, 'EC'],
        [-18.4, -0.03, -81.4, -68.6, 'PE'],
        [-22.9, -9.6, -69.7, -57.4, 'BO'],
        [-56.0, -17.5, -75.7, -66.8, 'CL'],
        [-35.0, -30.0, -58.5, -53.0, 'UY'],
        [-55.1, -21.7, -73.6, -53.5, 'AR'],
        [-33.8, 5.3, -74.0, -34.7, 'BR'],
        [63.3, 66.6, -24.6, -13.4, 'IS'],
        [61.3, 62.4, -7.8, -6.2, 'FO'],
        [49.8, 60.9, -8.7, 1.8, 'GB'],
        [51.4, 55.4, -10.7, -5.9, 'IE'],
        [54.0, 54.4, -4.8, -4.3, 'IM'],
        [49.1, 49.3, -2.3, -2.0, 'JE'],
        [49.4, 49.5, -2.7, -2.5, 'GG'],
        [27.6, 29.5, -18.2, -13.3, 'ES'],
        [32.6, 33.2, -17.3, -16.2, 'PT'],
        [36.9, 39.8, -31.3, -25.0, 'PT'],
        [36.9, 42.2, -9.6, -6.1, 'PT'],
        [36.1, 36.2, -5.4, -5.3, 'GI'],
        [42.4, 42.7, 1.4, 1.8, 'AD'],
        [35.9, 43.8, -9.3, 3.4, 'ES'],
        [43.7, 43.8, 7.4, 7.5, 'MC'],
        [41.3, 51.1, -5.2, 9.6, 'FR'],
        [49.4, 50.2, 5.7, 6.6, 'LU'],
        [49.4, 51.6, 2.5, 6.4, 'BE'],
        [50.7, 53.6, 3.3, 7.3, 'NL'],
        [47.0, 47.3, 9.4, 9.6, 'LI'],
        [45.8, 47.9, 5.9, 10.5, 'CH'],
        [47.2, 55.1, 5.8, 15.1, 'DE'],
        [43.8, 44.0, 12.4, 12.6, 'SM'],
        [35.7, 36.1, 14.1, 14.6, 'MT'],
        [36.6, 47.1, 6.6, 18.6, 'IT'],
        [46.3, 49.1, 9.5, 17.2, 'AT'],
        [54.5, 57.8, 8.0, 15.2, 'DK'],
        [76.4, 80.9, 10.0, 33.6, 'SJ'],
        [57.9, 71.2, 4.5, 31.1, 'NO'],
        [55.3, 69.1, 11.0, 24.2, 'SE'],
        [59.8, 60.5, 19.5, 21.1, 'AX'],
        [59.7, 70.1, 20.5, 31.6, 'FI'],
        [57.5, 59.7, 21.7, 28.3, 'EE'],
        [55.6, 58.1, 20.9, 28.3, 'LV'],
        [53.8, 56.5, 20.9, 26.9, 'LT'],
        [49.0, 54.9, 14.1, 24.2, 'PL'],
        [48.5, 51.1, 12.0, 18.9, 'CZ'],
        [47.7, 49.7, 16.8, 22.6, 'SK'],
        [45.7, 48.6, 16.1, 22.9, 'HU'],
        [45.4, 46.9, 13.3, 16.6, 'SI'],
        [42.3, 46.6, 13.4, 19.5, 'HR'],
        [42.5, 45.3, 15.7, 19.7, 'BA'],
        [41.8, 43.6, 18.4, 20.4, 'ME'],
        [41.8, 43.3, 20.0, 21.8, 'XK'],
        [40.8, 42.4, 20.4, 23.1, 'MK'],
        [42.2, 46.2, 18.8, 23.1, 'RS'],
        [39.6, 42.7, 19.2, 21.1, 'AL'],
        [34.8, 41.8, 19.3, 28.3, 'GR'],
        [41.2, 44.3, 22.3, 28.7, 'BG'],
        [43.6, 48.3, 20.2, 29.7, 'RO'],
        [44.3, 52.4, 22.1, 40.3, 'UA'],
        [35.8, 42.2, 25.6, 44.9, 'TR'],
        [34.5, 35.8, 32.2, 34.7, 'CY'],
        [31.2, 32.6, 34.2, 35.6, 'PS'],
        [29.4, 33.4, 34.2, 35.9, 'IL'],
        [33.0, 34.7, 35.1, 36.7, 'LB'],
        [29.1, 33.4, 34.9, 39.3, 'JO'],
        [25.7, 26.3, 50.3, 50.7, 'BH'],
        [24.5, 26.2, 50.7, 51.7, 'QA'],
        [22.6, 26.1, 51.5, 56.4, 'AE'],
        [28.5, 30.1, 46.5, 48.5, 'KW'],
        [16.6, 26.4, 52.0, 59.9, 'OM'],
        [16.3, 32.2, 34.4, 55.7, 'SA'],
        [41.0, 43.6, 39.9, 46.8, 'GE'],
        [38.8, 41.3, 43.4, 46.7, 'AM'],
        [38.3, 41.9, 44.7, 50.9, 'AZ'],
        [39.1, 43.3, 69.2, 80.3, 'KG'],
        [40.9, 55.5, 46.4, 87.4, 'KZ'],
        [41.5, 52.2, 87.7, 120.0, 'MN'],
        [24.0, 45.6, 122.9, 154.0, 'JP'],
        [33.1, 38.7, 124.6, 131.0, 'KR'],
        [21.8, 25.4, 119.9, 122.1, 'TW'],
        [22.1, 22.6, 113.8, 114.4, 'HK'],
        [4.6, 21.2, 116.9, 126.6, 'PH'],
        [5.6, 20.5, 97.3, 105.7, 'TH'],
        [10.4, 14.7, 102.3, 107.7, 'KH'],
        [13.9, 22.5, 100.0, 107.7, 'LA'],
        [8.5, 23.4, 102.1, 109.5, 'VN'],
        [1.15, 1.48, 103.59, 104.05, 'SG'],
        [1.2, 7.4, 99.6, 119.3, 'MY'],
        [-11.0, 6.0, 95.0, 141.0, 'ID'],
        [6.7, 37.1, 68.1, 97.4, 'IN'],
        [5.9, 9.9, 79.6, 81.9, 'LK'],
        [20.5, 26.7, 88.0, 92.7, 'BD'],
        [26.7, 28.3, 88.7, 92.2, 'BT'],
        [41.1, 81.9, 19.5, 180.0, 'RU'],
        [13.2, 13.7, 144.6, 144.9, 'GU'],
        [14.1, 20.6, 145.1, 145.9, 'MP'],
        [-14.4, -14.1, -170.9, -170.5, 'AS'],
        [-10.6, -10.4, 105.5, 105.8, 'CX'],
        [-12.2, -12.1, 96.8, 97.0, 'CC'],
        [-47.3, -34.4, 166.4, 178.6, 'NZ'],
        [-43.7, -10.0, 112.9, 153.7, 'AU'],
        [-21.4, -20.8, 55.2, 55.9, 'RE'],
        [-25.7, -11.9, 43.2, 50.5, 'MG'],
        [-2.9, -1.0, 28.8, 30.9, 'RW'],
        [-1.5, 4.3, 29.5, 35.1, 'UG'],
        [-4.7, 4.7, 33.9, 41.9, 'KE'],
        [-29.0, -16.9, 11.7, 25.3, 'NA'],
        [-26.9, -17.7, 19.9, 29.4, 'BW'],
        [-27.4, -25.7, 30.7, 32.2, 'SZ'],
        [-30.7, -28.5, 27.0, 29.5, 'LS'],
        [-34.9, -22.1, 16.4, 32.9, 'ZA'],
        [4.7, 11.2, -3.3, 1.2, 'GH'],
        [4.2, 13.9, 2.6, 14.7, 'NG'],
        [12.3, 16.7, -17.6, -11.3, 'SN'],
        [30.2, 37.6, 7.5, 11.6, 'TN'],
        [21.9, 31.7, 24.7, 36.9, 'EG']
    ];

    function lookupCountryByCoords(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return '';
        for (let i = 0; i < WORLD_BBOX_CLASSIFIER.length; i++) {
            const b = WORLD_BBOX_CLASSIFIER[i];
            if (lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]) {
                return b[4];
            }
        }
        return '';
    }

    function broadcastLocation(lat, lng, countryCode, sourceName, panoId = '', heading = 0, pitch = 0, priority = 1, isRescan = false) {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);

        if (isNaN(parsedLat) || isNaN(parsedLng)) return;
        if (isDummyLocation(parsedLat, parsedLng)) return;

        const isSignificantDistance = (lastExtractedLat === null || 
                                       Math.abs(lastExtractedLat - parsedLat) > 0.0005 || 
                                       Math.abs(lastExtractedLng - parsedLng) > 0.0005);

        const isNewPano = (panoId && currentPanoId && panoId !== currentPanoId);

        // If coordinates changed significantly, allow update from any valid source
        if (!isSignificantDistance && !isNewPano && !isRescan) {
            if (priority < currentSourcePriority) return;
        }

        if (countryCode) {
            lastExtractedCountryCode = String(countryCode).toUpperCase();
        }
        let effectiveCountryCode = countryCode ? String(countryCode).toUpperCase() : (lastExtractedCountryCode || '');
        if (!effectiveCountryCode) {
            effectiveCountryCode = lookupCountryByCoords(parsedLat, parsedLng);
            if (effectiveCountryCode) lastExtractedCountryCode = effectiveCountryCode;
        }

        lastExtractedLat = parsedLat;
        lastExtractedLng = parsedLng;
        currentSourcePriority = isSignificantDistance ? priority : Math.max(currentSourcePriority, priority);
        if (panoId) currentPanoId = panoId;
        lastRoundUpdateTime = Date.now();

        console.log(`[GeoInkwell] ACTIVE ROUND LOCATION ACCEPTED [Prio ${priority}] via [${sourceName}]: ${parsedLat}, ${parsedLng}`);

        window.postMessage({
            type: 'GEOINKWELL_LOCATION_FOUND',
            payload: {
                lat: parsedLat,
                lng: parsedLng,
                countryCode: effectiveCountryCode,
                panoId: panoId || currentPanoId || '',
                heading: heading || 0,
                pitch: pitch || 0,
                source: sourceName,
                roundNumber: currentActiveRoundNumber,
                isRescan: !!isRescan
            }
        }, '*');
    }

    function scanStreetViewReactFiber() {
        try {
            const els = document.querySelectorAll('[class*="panorama"], [class*="street-view"], .gm-style, [class*="game"]');
            for (const el of els) {
                if (isGuessMapElement(el)) continue;
                for (const k in el) {
                    if (k.startsWith('__reactFiber$') || k.startsWith('__reactProps$')) {
                        try {
                            let fiber = el[k];
                            let depth = 0;
                            while (fiber && depth < 25) {
                                const props = fiber.memoizedProps || fiber.pendingProps;
                                const state = fiber.memoizedState;

                                if (props) {
                                    const target = props.position || props.location || props.panorama || props.latLng;
                                    if (target && typeof target === 'object') {
                                        const rawLat = target.lat !== undefined ? target.lat : target.latitude;
                                        const rawLng = target.lng !== undefined ? target.lng : target.longitude;
                                        if (rawLat !== undefined && rawLng !== undefined) {
                                            const lat = typeof rawLat === 'function' ? rawLat() : parseFloat(rawLat);
                                            const lng = typeof rawLng === 'function' ? rawLng() : parseFloat(rawLng);
                                            if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                                                broadcastLocation(lat, lng, props.countryCode || '', 'React Panorama Fiber Props', props.panoId || target.panoId || '', 0, 0, 3);
                                                return true;
                                            }
                                        }
                                    }
                                }

                                if (state && typeof state === 'object') {
                                    const target = state.position || state.location || state.panorama || state.latLng;
                                    if (target && typeof target === 'object') {
                                        const rawLat = target.lat !== undefined ? target.lat : target.latitude;
                                        const rawLng = target.lng !== undefined ? target.lng : target.longitude;
                                        if (rawLat !== undefined && rawLng !== undefined) {
                                            const lat = typeof rawLat === 'function' ? rawLat() : parseFloat(rawLat);
                                            const lng = typeof rawLng === 'function' ? rawLng() : parseFloat(rawLng);
                                            if (!isDummyLocation(lat, lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                                                broadcastLocation(lat, lng, '', 'React Panorama Fiber State', target.panoId || '', 0, 0, 3);
                                                return true;
                                            }
                                        }
                                    }
                                }

                                fiber = fiber.return;
                                depth++;
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}
        return false;
    }
    setInterval(scanStreetViewReactFiber, 1500);

    // Periodic Heartbeat Sync (Relaxed, Non-Spamming)
    setInterval(() => {
        if (lastExtractedLat !== null && lastExtractedLng !== null && !isDummyLocation(lastExtractedLat, lastExtractedLng)) {
            if (Date.now() - lastRoundUpdateTime > 8000) {
                window.postMessage({
                    type: 'GEOINKWELL_LOCATION_FOUND',
                    payload: {
                        lat: lastExtractedLat,
                        lng: lastExtractedLng,
                        countryCode: lastExtractedCountryCode || '',
                        source: 'Heartbeat Sync',
                        roundNumber: currentActiveRoundNumber,
                        isRescan: false
                    }
                }, '*');
            }
        }
    }, 5000);

    // LISTEN FOR WINDOW MESSAGES
    window.addEventListener('message', function (event) {
        if (!event.data) return;

        if (event.data.type === 'GEOINKWELL_REQUEST_CURRENT_LOCATION') {
            if (lastExtractedLat !== null && lastExtractedLng !== null && !isDummyLocation(lastExtractedLat, lastExtractedLng)) {
                broadcastLocation(lastExtractedLat, lastExtractedLng, '', 'Sync Request Broadcast', currentPanoId, 0, 0, 2);
            } else {
                forceDeepScanAllSources();
            }
        }
        if (event.data.type === 'GEOINKWELL_EXECUTE_AUTOPIN') {
            const { lat, lng, autoSubmit } = event.data.payload || {};
            executeMapPinAndGuess(lat, lng, autoSubmit !== false);
        }
        if (event.data.type === 'GEOINKWELL_CENTER_MAP') {
            const { lat, lng } = event.data.payload || {};
            centerMapOnLocation(lat, lng);
        }
        if (event.data.type === 'GEOINKWELL_SET_COINS') {
            customVisualCoins = event.data.payload.amount || 999999;
            updateClientSideProfileVisuals();
        }
        if (event.data.type === 'GEOINKWELL_SET_TITLE') {
            customVisualTitle = event.data.payload.title || "Master Geoguessr 👑";
            updateClientSideProfileVisuals();
        }
        if (event.data.type === 'GEOINKWELL_MANUAL_REFRESH') {
            forceDeepScanAllSources();
        }
        if (event.data.type === 'GEOINKWELL_SET_LEVEL') {
            customVisualLevel = event.data.payload.level || 100;
            customVisualDivision = event.data.payload.division || "Champion Division 🏆";
            updateClientSideProfileVisuals();
        }
    });

    // --- HARDENED IN-GAME MAP INSTANCE RESOLUTION ---
    function getMapInstance() {
        if (window._geoInkwellCapturedMap && window._geoInkwellCapturedMap.map) {
            const cap = window._geoInkwellCapturedMap;
            if (cap.element && document.body.contains(cap.element) && !isExtensionHudElement(cap.element)) {
                return cap;
            }
        }

        if (activeCapturedMapInstance && activeCapturedMapInstance.map) {
            if (activeCapturedMapInstance.element && document.body.contains(activeCapturedMapInstance.element) && !isExtensionHudElement(activeCapturedMapInstance.element)) {
                return activeCapturedMapInstance;
            }
            activeCapturedMapInstance = null;
        }

        // Webpack require cache inspection fallback
        if (window.__geoinkwell_webpack_require && window.__geoinkwell_webpack_require.c) {
            try {
                for (const mid in window.__geoinkwell_webpack_require.c) {
                    const mod = window.__geoinkwell_webpack_require.c[mid];
                    if (mod && mod.exports) checkAndHookMapModule(mod.exports);
                }
            } catch (e) {}
        }

        const outerMap = findGameMapElement();
        const candidateContainers = outerMap
            ? [outerMap, ...outerMap.querySelectorAll('.leaflet-container, .mapboxgl-map, [data-qa*="map"], [class*="map"], canvas, div')]
            : Array.from(document.querySelectorAll('[data-qa="guess-map"], [data-qa="guess-map-canvas"], [class*="guess-map"], [class*="GuessMap"], [class*="game-map"], .leaflet-container, .mapboxgl-map'));

        for (const el of candidateContainers) {
            if (isExtensionHudElement(el)) continue;

            // Direct Leaflet Property Check
            if (el._leaflet_map && typeof el._leaflet_map.setView === 'function') {
                activeCapturedMapInstance = { type: 'leaflet', map: el._leaflet_map, element: el };
                return activeCapturedMapInstance;
            }
            if (el.leafletMap && typeof el.leafletMap.setView === 'function') {
                activeCapturedMapInstance = { type: 'leaflet', map: el.leafletMap, element: el };
                return activeCapturedMapInstance;
            }
            if (el._geoInkwellMap && typeof el._geoInkwellMap.setView === 'function') {
                activeCapturedMapInstance = { type: 'leaflet', map: el._geoInkwellMap, element: el };
                return activeCapturedMapInstance;
            }

            // Direct Mapbox Property Check
            if (el._map && (typeof el._map.flyTo === 'function' || typeof el._map.jumpTo === 'function')) {
                activeCapturedMapInstance = { type: 'mapbox', map: el._map, element: el };
                return activeCapturedMapInstance;
            }
            if (el.mapboxMap && (typeof el.mapboxMap.flyTo === 'function' || typeof el.mapboxMap.jumpTo === 'function')) {
                activeCapturedMapInstance = { type: 'mapbox', map: el.mapboxMap, element: el };
                return activeCapturedMapInstance;
            }

            // Leaflet internal event listeners context check (flat & nested)
            if (el._leaflet_events && typeof el._leaflet_events === 'object') {
                try {
                    for (const evKey in el._leaflet_events) {
                        const h = el._leaflet_events[evKey];
                        if (!h) continue;
                        if (h.ctx && (typeof h.ctx.setView === 'function' || typeof h.ctx.panTo === 'function')) {
                            activeCapturedMapInstance = { type: 'leaflet', map: h.ctx, element: el };
                            return activeCapturedMapInstance;
                        }
                        if (h.fn && h.fn._map && typeof h.fn._map.setView === 'function') {
                            activeCapturedMapInstance = { type: 'leaflet', map: h.fn._map, element: el };
                            return activeCapturedMapInstance;
                        }
                        if (typeof h === 'object') {
                            for (const subKey in h) {
                                const sub = h[subKey];
                                if (sub && sub.ctx && (typeof sub.ctx.setView === 'function' || typeof sub.ctx.panTo === 'function')) {
                                    activeCapturedMapInstance = { type: 'leaflet', map: sub.ctx, element: el };
                                    return activeCapturedMapInstance;
                                }
                            }
                        }
                    }
                } catch (e) {}
            }

            // Global Leaflet Map registry lookup by _leaflet_id
            if (el._leaflet_id && window.L && window.L.Map && window.L.Map._instances) {
                const inst = window.L.Map._instances[el._leaflet_id];
                if (inst && !isExtensionHudElement(inst._container)) {
                    activeCapturedMapInstance = { type: 'leaflet', map: inst, element: el };
                    return activeCapturedMapInstance;
                }
            }

            // Deep React Fiber State, Props & Hook Search (Traverse both ancestors and descendants)
            for (const k in el) {
                if (k.startsWith('__reactFiber$') || k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$')) {
                    try {
                        let rootFiber = el[k];
                        // Ascend up to 25 levels to encompass parent GuessMap components
                        let climb = rootFiber;
                        let climbSteps = 0;
                        while (climb && climb.return && climbSteps < 25) {
                            climb = climb.return;
                            climbSteps++;
                            const cName = climb.type?.name || climb.type?.displayName || '';
                            if (cName.includes('GuessMap') || cName.includes('Map') || cName.includes('Canvas')) {
                                rootFiber = climb;
                            }
                        }

                        const queue = [rootFiber];
                        const visited = new Set();
                        let count = 0;

                        while (queue.length > 0 && count < 150) {
                            const fiber = queue.shift();
                            count++;
                            if (!fiber || visited.has(fiber)) continue;
                            visited.add(fiber);

                            // Check stateNode
                            if (fiber.stateNode) {
                                const sn = fiber.stateNode;
                                if (typeof sn.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: sn, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (typeof sn.flyTo === 'function' || typeof sn.jumpTo === 'function') {
                                    activeCapturedMapInstance = { type: 'mapbox', map: sn, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (sn._map && typeof sn._map.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: sn._map, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (sn.map && typeof sn.map.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: sn.map, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (sn.leafletMap && typeof sn.leafletMap.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: sn.leafletMap, element: el };
                                    return activeCapturedMapInstance;
                                }
                            }

                            // Check memoizedProps
                            if (fiber.memoizedProps) {
                                const p = fiber.memoizedProps;
                                if (p.map && typeof p.map.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: p.map, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (p.leaflet && typeof p.leaflet.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: p.leaflet, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (p.leafletMap && typeof p.leafletMap.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: p.leafletMap, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (p.value && typeof p.value.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: p.value, element: el };
                                    return activeCapturedMapInstance;
                                }
                                if (p.value && p.value.map && typeof p.value.map.setView === 'function') {
                                    activeCapturedMapInstance = { type: 'leaflet', map: p.value.map, element: el };
                                    return activeCapturedMapInstance;
                                }
                            }

                            // Check hooks chain in memoizedState
                            let hook = fiber.memoizedState;
                            let hDepth = 0;
                            while (hook && hDepth < 35) {
                                hDepth++;
                                if (hook.memoizedState) {
                                    const m = hook.memoizedState;
                                    if (m.current && typeof m.current.setView === 'function') {
                                        activeCapturedMapInstance = { type: 'leaflet', map: m.current, element: el };
                                        return activeCapturedMapInstance;
                                    }
                                    if (m.current && (typeof m.current.flyTo === 'function' || typeof m.current.jumpTo === 'function')) {
                                        activeCapturedMapInstance = { type: 'mapbox', map: m.current, element: el };
                                        return activeCapturedMapInstance;
                                    }
                                    if (typeof m.setView === 'function') {
                                        activeCapturedMapInstance = { type: 'leaflet', map: m, element: el };
                                        return activeCapturedMapInstance;
                                    }
                                    if (m.map && typeof m.map.setView === 'function') {
                                        activeCapturedMapInstance = { type: 'leaflet', map: m.map, element: el };
                                        return activeCapturedMapInstance;
                                    }
                                    if (Array.isArray(m) && m.length > 0 && m[0] && typeof m[0].setView === 'function') {
                                        activeCapturedMapInstance = { type: 'leaflet', map: m[0], element: el };
                                        return activeCapturedMapInstance;
                                    }
                                }
                                hook = hook.next;
                            }

                            if (fiber.return && count < 60) queue.push(fiber.return);
                            if (fiber.child && count < 90) queue.push(fiber.child);
                            if (fiber.sibling && count < 90) queue.push(fiber.sibling);
                        }
                    } catch (e) {}
                }
            }
        }

        // Global Leaflet Map instances iterator fallback
        if (window.L && window.L.Map && window.L.Map._instances) {
            for (const id in window.L.Map._instances) {
                const inst = window.L.Map._instances[id];
                if (inst._container && !isExtensionHudElement(inst._container)) {
                    activeCapturedMapInstance = { type: 'leaflet', map: inst, element: inst._container };
                    return activeCapturedMapInstance;
                }
            }
        }

        // Trigger mousemove on outerMap to provoke prototype method hook if map exists
        if (outerMap) {
            try {
                outerMap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
                if (activeCapturedMapInstance) return activeCapturedMapInstance;
            } catch (e) {}
        }

        return null;
    }

    // EXPAND COLLAPSED GUESS MAP CONTAINER SAFELY (NON-DESTRUCTIVE)
    function expandMapContainer() {
        const outerMap = findGameMapElement();
        if (!outerMap) return null;

        const rect = outerMap.getBoundingClientRect();
        const isCollapsed = rect.width < 280 || rect.height < 200;

        // Dispatch pointer and hover events to trigger GeoGuessr's native expand handler
        ['mouseenter', 'mouseover', 'pointerenter', 'pointerover'].forEach(evt => {
            try {
                outerMap.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, composed: true, view: window }));
            } catch (e) {}
        });

        // Trigger GeoGuessr map size toggle button if collapsed
        if (isCollapsed) {
            const sizeToggle = document.querySelector('[data-qa="guess-map-size-toggle"]') ||
                               outerMap.querySelector('[data-qa="guess-map-size-toggle"]') ||
                               outerMap.querySelector('[data-qa*="size-toggle"]') ||
                               outerMap.querySelector('button[class*="size-toggle"]') ||
                               outerMap.querySelector('button[class*="toggle"]') ||
                               document.querySelector('button[class*="guess-map__toggle"]') ||
                               outerMap.querySelector('[data-qa*="expand"], [class*="expand"], [aria-label*="expand" i], [title*="expand" i]');
            if (sizeToggle && !isExtensionHudElement(sizeToggle)) {
                try { sizeToggle.click(); } catch (e) {}
            }
        }

        const instanceData = getMapInstance();
        if (instanceData && instanceData.map) {
            try {
                if (instanceData.type === 'leaflet' && typeof instanceData.map.invalidateSize === 'function') {
                    instanceData.map.invalidateSize({ animate: false });
                }
                if (instanceData.type === 'mapbox' && typeof instanceData.map.resize === 'function') {
                    instanceData.map.resize();
                }
            } catch (e) {}
        }
        return outerMap;
    }

    // LAYER 1: DIRECT REACT FIBER PIN METHOD & HOOK STATE INJECTION
    function placePinViaReactFiber(targetLat, targetLng) {
        const outerMap = findGameMapElement();
        const candidateEls = outerMap
            ? [outerMap, ...outerMap.querySelectorAll('*')]
            : Array.from(document.querySelectorAll('[data-qa="guess-map"], [class*="guess-map"], [class*="GuessMap"], [class*="game-map"], .leaflet-container, .mapboxgl-map'));
        let success = false;

        const hybrid = { lat: targetLat, lng: targetLng, latitude: targetLat, longitude: targetLng };
        const latFn = function () { return targetLat; };
        latFn.valueOf = function () { return targetLat; };
        latFn.toString = function () { return String(targetLat); };
        const lngFn = function () { return targetLng; };
        lngFn.valueOf = function () { return targetLng; };
        lngFn.toString = function () { return String(targetLng); };
        hybrid.getLat = latFn;
        hybrid.getLng = lngFn;

        const methodNames = [
            'onMarkerLocationChanged', 'onMarkerLocationChange', 'onMarkerPositionChange',
            'onMarkerPositionChanged', 'onGuessCoordinatesChanged', 'onMarkerPlaced',
            'onPinPlaced', 'onLocationSelected', 'onCoordinateSelect', 'onSelectLocation',
            'onPin', 'setPin', 'onGuess', 'handleMapClick', 'onMapClick', 'onGuessLocation',
            'onPlaceGuess', 'setSelectedCoordinates', 'setGuessCoordinates', 'setMarker',
            'setGuess', 'handleMarkerPlaced', 'handlePin', 'handleGuess', 'makeGuess',
            'onSelectCoordinates', 'setTargetCoordinates', 'onTargetSelected', 'setGuessLatLng',
            'setSelectedLocation', 'onSetPin', 'setPinLocation', 'handleCoordinateSelection',
            'updateGuess', 'setLocalGuess', 'setMarkerPosition', 'setCoordinates',
            'setMarkerCoordinates', 'setMarkerLocation'
        ];

        function tryFiber(fiber, visitedFibers = new Set(), depth = 0) {
            if (!fiber || depth > 50 || visitedFibers.has(fiber)) return false;
            visitedFibers.add(fiber);

            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props && typeof props === 'object') {
                for (const m of methodNames) {
                    if (typeof props[m] === 'function') {
                        let called = false;
                        try {
                            props[m]({ lat: targetLat, lng: targetLng });
                            called = true;
                        } catch (e) {}

                        if (!called) {
                            try {
                                props[m]({ latLng: { lat: targetLat, lng: targetLng } });
                                called = true;
                            } catch (e) {}
                        }

                        if (!called) {
                            try {
                                props[m]({ latlng: { lat: targetLat, lng: targetLng } });
                                called = true;
                            } catch (e) {}
                        }

                        if (called) {
                            console.log(`[GeoInkwell] Executed React Fiber map pin handler [${m}].`);
                            success = true;
                            return true;
                        }
                    }
                }
            }

            // Check hook state dispatches (useState/useReducer)
            let hook = fiber.memoizedState;
            while (hook) {
                if (hook.queue && typeof hook.queue.dispatch === 'function') {
                    if (hook.memoizedState && typeof hook.memoizedState === 'object') {
                        if ('lat' in hook.memoizedState || 'latLng' in hook.memoizedState || 'latitude' in hook.memoizedState || 'lng' in hook.memoizedState || 'markerLocation' in hook.memoizedState) {
                            try {
                                hook.queue.dispatch({ lat: targetLat, lng: targetLng });
                                console.log("[GeoInkwell] Dispatched coordinates via React useState hook queue.");
                                success = true;
                                return true;
                            } catch (e) {}
                        }
                    }
                }
                hook = hook.next;
            }

            if (fiber.return && tryFiber(fiber.return, visitedFibers, depth + 1)) return true;
            if (fiber.child && tryFiber(fiber.child, visitedFibers, depth + 1)) return true;
            if (fiber.sibling && tryFiber(fiber.sibling, visitedFibers, depth + 1)) return true;

            return false;
        }

        for (const el of candidateEls) {
            if (isExtensionHudElement(el)) continue;
            for (const k in el) {
                if (k.startsWith('__reactFiber$') || k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$')) {
                    try {
                        if (tryFiber(el[k])) return true;
                    } catch (e) {}
                }
            }
        }

        return success;
    }

    function centerMapOnLocation(targetLat, targetLng) {
        expandMapContainer();

        setTimeout(() => {
            const instanceData = getMapInstance();
            if (instanceData && instanceData.map) {
                if (instanceData.type === 'leaflet') {
                    const map = instanceData.map;
                    try { if (typeof map.invalidateSize === 'function') map.invalidateSize({ animate: false }); } catch (e) {}
                    const currentZoom = (typeof map.getZoom === 'function' ? map.getZoom() : 3) || 3;
                    try { if (typeof map.setView === 'function') map.setView([targetLat, targetLng], Math.max(currentZoom, 4), { animate: true }); } catch (e) {}
                } else if (instanceData.type === 'mapbox') {
                    const map = instanceData.map;
                    try { if (typeof map.resize === 'function') map.resize(); } catch (e) {}
                    const currentZoom = (typeof map.getZoom === 'function' ? map.getZoom() : 3) || 3;
                    try { if (typeof map.jumpTo === 'function') map.jumpTo({ center: [targetLng, targetLat], zoom: Math.max(currentZoom, 4) }); } catch (e) {}
                }
            }
        }, 80);
    }

    function isButtonEnabled(btn) {
        if (!btn) return false;
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
        const cls = btn.className ? String(btn.className) : '';
        if (cls.includes('disabled') || cls.includes('button--disabled') || cls.includes('button_disabled__')) return false;
        return true;
    }

    function dispatchNativeSpacebar() {
        try {
            const evOpts = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true, view: window };
            window.dispatchEvent(new KeyboardEvent('keydown', evOpts));
            document.dispatchEvent(new KeyboardEvent('keydown', evOpts));
            if (document.activeElement && typeof document.activeElement.dispatchEvent === 'function') {
                document.activeElement.dispatchEvent(new KeyboardEvent('keydown', evOpts));
            }
            window.dispatchEvent(new KeyboardEvent('keyup', evOpts));
            document.dispatchEvent(new KeyboardEvent('keyup', evOpts));
            if (document.activeElement && typeof document.activeElement.dispatchEvent === 'function') {
                document.activeElement.dispatchEvent(new KeyboardEvent('keyup', evOpts));
            }
        } catch (e) {}
    }

    // MULTI-LAYER HARDENED PIN PLACER & GUESS SUBMITTER
    function executeMapPinAndGuess(targetLat, targetLng, autoSubmit = true) {
        if (targetLat === null || targetLat === undefined || targetLng === null || targetLng === undefined || isNaN(targetLat) || isNaN(targetLng)) {
            console.error("[GeoInkwell] executeMapPinAndGuess aborted: invalid coordinates", targetLat, targetLng);
            return;
        }

        // ABSOLUTE SAFETY SHIELD: NEVER GUESS (0, 0) IN THE MIDDLE OF THE OCEAN
        if (Math.abs(targetLat) < 0.001 && Math.abs(targetLng) < 0.001) {
            console.error("[GeoInkwell] Refusing to place pin at Null Island (0, 0)!");
            return;
        }

        console.log(`[GeoInkwell] EXECUTING MULTI-LAYER PIN PLACEMENT: ${targetLat}, ${targetLng} (AutoSubmit: ${autoSubmit})`);

        // 1. Expand the in-game map immediately
        expandMapContainer();

        function triggerFullPinDispatch() {
            // Layer 1: React Fiber Handler Dispatch
            placePinViaReactFiber(targetLat, targetLng);

            // Check if Guess button already enabled by React Fiber
            const guessBtnAfterFiber = findGuessButton();
            if (isButtonEnabled(guessBtnAfterFiber)) {
                console.log("[GeoInkwell] Guess button enabled by React Fiber handler; pin successfully placed!");
                return;
            }

            // Layer 2: Leaflet / Mapbox Native Map Engine Dispatch
            const inst = getMapInstance();
            const outerMap = findGameMapElement();
            const targetEl = (inst && inst.element) || outerMap;
            const rect = targetEl ? targetEl.getBoundingClientRect() : { left: 0, top: 0, width: 320, height: 240 };

            let mapPanned = false;
            let pixelX = rect.left + rect.width / 2;
            let pixelY = rect.top + rect.height / 2;

            if (inst && inst.map) {
                try {
                    if (inst.type === 'leaflet') {
                        const map = inst.map;
                        if (typeof map.invalidateSize === 'function') {
                            try { map.invalidateSize({ animate: false }); } catch (e) {}
                        }

                        // Pan / Center map onto target so target coordinates sit directly at the center
                        const curZoom = (typeof map.getZoom === 'function' ? map.getZoom() : 3) || 3;
                        const zoom = Math.max(curZoom, 4);
                        if (typeof map.setView === 'function') {
                            try { map.setView([targetLat, targetLng], zoom, { animate: false }); mapPanned = true; } catch (e) {}
                        } else if (typeof map.panTo === 'function') {
                            try { map.panTo([targetLat, targetLng], { animate: false }); mapPanned = true; } catch (e) {}
                        }

                        // Safe coordinates object with native fallbacks
                        const latLngObj = {
                            lat: targetLat,
                            lng: targetLng,
                            wrap: function () { return this; },
                            distanceTo: function () { return 0; },
                            equals: function (o) { return o && o.lat === this.lat && o.lng === this.lng; }
                        };

                        let cp = null;
                        if (typeof map.latLngToContainerPoint === 'function') {
                            try { cp = map.latLngToContainerPoint([targetLat, targetLng]); } catch (e) {}
                            if (!cp || isNaN(cp.x) || isNaN(cp.y)) {
                                try { cp = map.latLngToContainerPoint(latLngObj); } catch (e) {}
                            }
                        }
                        if (!cp || isNaN(cp.x) || isNaN(cp.y)) {
                            cp = { x: rect.width / 2, y: rect.height / 2 };
                        }

                        let lp = cp;
                        if (typeof map.latLngToLayerPoint === 'function') {
                            try { lp = map.latLngToLayerPoint([targetLat, targetLng]) || cp; } catch (e) {}
                        }

                        pixelX = rect.left + Math.max(5, Math.min(rect.width - 5, cp.x));
                        pixelY = rect.top + Math.max(5, Math.min(rect.height - 5, cp.y));

                        const clickEventPayload = {
                            latlng: latLngObj,
                            latLng: latLngObj,
                            layerPoint: lp,
                            containerPoint: cp,
                            originalEvent: new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                clientX: pixelX,
                                clientY: pixelY,
                                screenX: pixelX,
                                screenY: pixelY,
                                button: 0,
                                buttons: 0,
                                view: window
                            }),
                            type: 'click',
                            target: map,
                            sourceTarget: map
                        };

                        // Invoke Leaflet fire safely
                        try { map.fire('click', clickEventPayload); } catch (e) {}
                        console.log(`[GeoInkwell] Fired Leaflet engine click at (${pixelX.toFixed(1)}, ${pixelY.toFixed(1)}).`);
                    } else if (inst.type === 'mapbox') {
                        const map = inst.map;
                        if (typeof map.resize === 'function') {
                            try { map.resize(); } catch (e) {}
                        }
                        const curZoom = (typeof map.getZoom === 'function' ? map.getZoom() : 3) || 3;
                        if (typeof map.jumpTo === 'function') {
                            try { map.jumpTo({ center: [targetLng, targetLat], zoom: Math.max(curZoom, 4) }); mapPanned = true; } catch (e) {}
                        }
                        const pt = (typeof map.project === 'function') ? map.project([targetLng, targetLat]) : { x: rect.width / 2, y: rect.height / 2 };
                        pixelX = rect.left + Math.max(5, Math.min(rect.width - 5, pt.x));
                        pixelY = rect.top + Math.max(5, Math.min(rect.height - 5, pt.y));

                        map.fire('click', {
                            point: pt,
                            lngLat: { lng: targetLng, lat: targetLat },
                            originalEvent: new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                clientX: pixelX,
                                clientY: pixelY,
                                button: 0,
                                buttons: 0,
                                view: window
                            })
                        });
                        console.log(`[GeoInkwell] Fired Mapbox engine click at (${pixelX.toFixed(1)}, ${pixelY.toFixed(1)}).`);
                    }
                } catch (e) {}
            }

            // Check if Guess button already enabled by Map Engine
            const guessBtnAfterMap = findGuessButton();
            if (isButtonEnabled(guessBtnAfterMap)) {
                console.log("[GeoInkwell] Guess button enabled by native map engine; pin successfully placed!");
                return;
            }

            if (!mapPanned) {
                // Map engine was not found or unpanned!
                // NEVER click container center (which defaults to 0,0 in the ocean).
                // Calculate exact Web Mercator pixel projection on the unpanned world canvas:
                const mapW = Math.max(200, rect.width || 320);
                const mapH = Math.max(150, rect.height || 240);
                const cx = rect.left + mapW / 2;
                const cy = rect.top + mapH / 2;

                const normLng = targetLng / 360;
                const sinLat = Math.sin((targetLat * Math.PI) / 180);
                const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
                const mercY = 0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI);

                const worldSpanX = mapW * 0.92;
                const worldSpanY = mapH * 0.92;
                pixelX = cx + (normLng * worldSpanX);
                pixelY = cy + ((mercY - 0.5) * worldSpanY);

                pixelX = Math.max(rect.left + 10, Math.min(rect.left + mapW - 10, pixelX));
                pixelY = Math.max(rect.top + 10, Math.min(rect.top + mapH - 10, pixelY));
                console.log(`[GeoInkwell] Fallback Mercator calculated click target: (${pixelX.toFixed(1)}, ${pixelY.toFixed(1)})`);
            }

            // Layer 3: Direct W3C Synthetic Pointer & Mouse Event Sequence
            if (outerMap && !isExtensionHudElement(outerMap)) {
                const elUnderPoint = document.elementFromPoint(pixelX, pixelY);
                const targetNode = (elUnderPoint && !isExtensionHudElement(elUnderPoint))
                    ? elUnderPoint
                    : (outerMap.querySelector('.leaflet-container, .leaflet-pane, .mapboxgl-map, canvas') || outerMap);

                const baseOpts = {
                    clientX: pixelX,
                    clientY: pixelY,
                    screenX: pixelX,
                    screenY: pixelY,
                    pageX: pixelX,
                    pageY: pixelY,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    button: 0,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true
                };

                try { targetNode.dispatchEvent(new PointerEvent('pointerdown', { ...baseOpts, buttons: 1 })); } catch (e) {}
                try { targetNode.dispatchEvent(new MouseEvent('mousedown', { ...baseOpts, buttons: 1 })); } catch (e) {}
                try { targetNode.dispatchEvent(new PointerEvent('pointerup', { ...baseOpts, buttons: 0 })); } catch (e) {}
                try { targetNode.dispatchEvent(new MouseEvent('mouseup', { ...baseOpts, buttons: 0 })); } catch (e) {}
                try { targetNode.dispatchEvent(new MouseEvent('click', { ...baseOpts, buttons: 0 })); } catch (e) {}

                // Also fire directly onto .leaflet-container if distinct from targetNode
                const leafletEl = outerMap.querySelector('.leaflet-container');
                if (leafletEl && leafletEl !== targetNode && !isExtensionHudElement(leafletEl)) {
                    try { leafletEl.dispatchEvent(new MouseEvent('click', { ...baseOpts, buttons: 0 })); } catch (e) {}
                }
            }
        }

        function safePinDispatch() {
            try {
                triggerFullPinDispatch();
            } catch (err) {
                console.error("[GeoInkwell] Pin dispatch error trapped:", err);
            }
        }

        // Fire initial placement immediately
        safePinDispatch();

        // Fire settle placement at 140ms after expansion transition settles
        setTimeout(() => {
            expandMapContainer();
            safePinDispatch();

            // Layer 4: Auto-Submit Guess Button Trigger & Spacebar Dispatcher
            if (autoSubmit) {
                let attempts = 0;
                let hasSubmitted = false;
                const interval = setInterval(() => {
                    attempts++;
                    if (hasSubmitted) {
                        clearInterval(interval);
                        return;
                    }

                    const guessBtn = findGuessButton();
                    const enabled = isButtonEnabled(guessBtn);

                    if (enabled) {
                        hasSubmitted = true;
                        console.log("[GeoInkwell] Active guess button enabled! Submitting verified guess...");
                        
                        try { guessBtn.click(); } catch (e) {}
                        try { guessBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
                        try { guessBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
                        try { guessBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
                        try { guessBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
                        try { guessBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
                        dispatchNativeSpacebar();

                        clearInterval(interval);
                        return;
                    }

                    // Reseat pin placement at attempts 2, 5, 8
                    if (attempts === 2 || attempts === 5 || attempts === 8) {
                        safePinDispatch();
                    }

                    // Never forcibly remove disabled from guessBtn to prevent 0-point ocean penalty!
                    if (attempts > 25) {
                        console.warn("[GeoInkwell] Guess button did not become enabled within timeout. Aborting auto-submit to protect against 0-point ocean penalty.");
                        clearInterval(interval);
                    }
                }, 80);
            }
        }, 140);
    }

    function findGuessButton() {
        let btn = document.querySelector('[data-qa="perform-guess"]') || 
                  document.querySelector('[data-qa="guess-button"]') || 
                  document.querySelector('[data-qa="submit-guess"]') ||
                  document.querySelector('button[class*="guess-map__guess-button"]') ||
                  document.querySelector('button[class*="GuessButton"]') ||
                  document.querySelector('button[class*="guess-button"]') ||
                  document.querySelector('button[class*="button_variantPrimary"]');

        if (btn && !isExtensionHudElement(btn)) return btn;

        // Check inside game map container
        const outerMap = findGameMapElement();
        if (outerMap) {
            const innerBtn = outerMap.querySelector('[data-qa*="guess"], button[class*="guess"], button[class*="button_variantPrimary"], button');
            if (innerBtn && !isExtensionHudElement(innerBtn)) return innerBtn;
        }

        const candidateButtons = document.querySelectorAll('button, [role="button"], [data-qa*="guess"]');
        for (const b of candidateButtons) {
            if (isExtensionHudElement(b)) continue;
            const text = (b.innerText || b.textContent || '').trim().toUpperCase();
            if (text === 'GUESS' || text === 'MAKE GUESS' || text === 'PLACE GUESS' || text === 'CONFIRM GUESS' || (text.includes('GUESS') && !text.includes('PIN'))) {
                return b;
            }
        }
        return null;
    }
})();
