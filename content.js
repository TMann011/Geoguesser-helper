(function () {
    'use strict';

    console.log("[GeoInkwell Content Script] Initializing v12.0 Master Tactical Duels & Auto-Pin Engine...");

    function safeAppendToHead(element) {
        if (!element) return;
        try {
            const parent = document.head || document.documentElement || document.body;
            if (parent && typeof parent.appendChild === 'function') {
                parent.appendChild(element);
                return;
            }
        } catch (e) {}

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                try {
                    const p = document.head || document.documentElement || document.body;
                    if (p && typeof p.appendChild === 'function') {
                        p.appendChild(element);
                    }
                } catch (e) {}
            });
        }
    }

    let currentCoordinates = null;
    let reverseGeocodeData = null;
    let lastAddressInfo = null;
    let hintLevel = 0;
    let isLegitMode = false;
    let autoCenterMapOnRound = false;
    let autoPinOnRound = false;
    let autoPinDelay = 1500;
    let audioContext = null;
    let roundHistory = [];
    let currentTheme = 'cyberpunk';
    let activeMapProvider = 'gmaps_satellite'; // 'gmaps_satellite' | 'gmaps' | 'osm'
    let currentActiveRound = 1;
    let isExecutingPin = false;
    let lastCenteredLat = null;
    let lastCenteredLng = null;
    let autoPinTimeoutId = null;
    let lastAudioPingTime = 0;
    const AUDIO_PING_MIN_INTERVAL = 3000;
    let lastAudioPingRound = null;
    let lastAutoPinnedRound = null;
    let lastAutoPinnedLat = null;
    let lastAutoPinnedLng = null;

    function playAudioPing(frequency = 880, duration = 0.15, force = false) {
        const now = Date.now();
        if (!force && (now - lastAudioPingTime < AUDIO_PING_MIN_INTERVAL)) {
            return;
        }
        lastAudioPingTime = now;
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
            gain.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start();
            osc.stop(audioContext.currentTime + duration);
        } catch (e) {}
    }

    function safeStorageSet(data) {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set(data, () => {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {}
                });
            }
        } catch (e) {}
    }

    function injectMainWorldScript() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && typeof chrome.runtime.getURL === 'function') {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('injected.js');
                script.onload = function() { this.remove(); };
                safeAppendToHead(script);
            }
        } catch (e) {}
    }
    injectMainWorldScript();

    // Load stored settings on startup
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['autoPinOnRound', 'autoPinEnabled', 'autoPinDelay', 'autoCenterMapOnRound', 'isLegitMode', 'currentTheme'], (res) => {
                if (res) {
                    if (typeof res.autoPinOnRound === 'boolean') {
                        autoPinOnRound = res.autoPinOnRound;
                    } else {
                        autoPinOnRound = false;
                    }
                    if (typeof res.autoPinDelay === 'number') autoPinDelay = res.autoPinDelay;
                    if (typeof res.autoCenterMapOnRound === 'boolean') autoCenterMapOnRound = res.autoCenterMapOnRound;
                    if (typeof res.isLegitMode === 'boolean') isLegitMode = res.isLegitMode;
                    if (res.currentTheme) currentTheme = res.currentTheme;

                    const c2 = document.getElementById('chk-autocenter');
                    if (c2) c2.checked = autoCenterMapOnRound;
                    const hud = document.getElementById('geoinkwell-hud');
                    if (hud && currentTheme) hud.className = `theme-${currentTheme}`;
                }
            });
        }
    } catch (e) {}

    // Listen for location events from injected script
    window.addEventListener('message', (event) => {
        if (!event.data) return;

        // Round Progression Event
        if (event.data.type === 'GEOINKWELL_ROUND_CHANGED') {
            const newR = event.data.payload.roundNumber || (currentActiveRound + 1);
            currentActiveRound = newR;
            currentCoordinates = null;
            reverseGeocodeData = null;
            lastAddressInfo = null;
            lastFetchedLat = null;
            lastFetchedLng = null;
            lastResolvedLat = null;
            lastResolvedLng = null;
            lastResolvedRoundNumber = null;
            isResolvingAddress = false;
            lastAudioPingRound = null;
            lastAutoPinnedRound = null;
            lastAutoPinnedLat = null;
            lastAutoPinnedLng = null;
            safeStorageSet({ lastAddressInfo: null, currentActiveRound, lastCoordinates: null });
            if (autoPinTimeoutId) {
                clearTimeout(autoPinTimeoutId);
                autoPinTimeoutId = null;
            }

            playAudioPing(659.25, 0.2, true); // E5 chord note on round progression

            const roundPill = document.getElementById('hud-round-pill');
            if (roundPill) roundPill.innerText = `ROUND #${currentActiveRound}`;

            const addressEl = document.getElementById('hud-address');
            const coordsEl = document.getElementById('hud-coords');
            const hemiEl = document.getElementById('hud-hemisphere');
            const sunEl = document.getElementById('hud-sun');
            const continentEl = document.getElementById('hud-continent');
            const scriptEl = document.getElementById('hud-script');
            const stateEl = document.getElementById('hud-state');
            const cityEl = document.getElementById('hud-city');
            const countryEl = document.getElementById('hud-country');
            const drivingEl = document.getElementById('hud-driving');
            const bollardEl = document.getElementById('hud-bollard');
            const carEl = document.getElementById('hud-car');

            if (addressEl) addressEl.innerText = `Acquiring Round ${currentActiveRound} target...`;
            if (coordsEl) coordsEl.innerHTML = `<span style="color:#00FFB0;">Acquiring active target...</span>`;
            if (hemiEl) hemiEl.innerText = '---';
            if (sunEl) sunEl.innerText = '---';
            if (continentEl) continentEl.innerText = '---';
            if (scriptEl) scriptEl.innerText = '---';
            if (stateEl) stateEl.innerText = '---';
            if (cityEl) cityEl.innerText = '---';
            if (countryEl) countryEl.innerText = '---';
            if (drivingEl) drivingEl.innerText = '---';
            if (bollardEl) bollardEl.innerText = '---';
            if (carEl) carEl.innerText = '---';

            lastAddressInfo = null;
            safeStorageSet({ lastAddressInfo: null });

            showToast(`⚔️ Round #${currentActiveRound} Started!`);
        }

        // Location Found Event
        if (event.data.type === 'GEOINKWELL_LOCATION_FOUND') {
            const newCoords = event.data.payload;
            if (!newCoords || typeof newCoords.lat !== 'number' || typeof newCoords.lng !== 'number') return;

            // Synchronize round state
            if (newCoords.roundNumber && newCoords.roundNumber !== currentActiveRound) {
                currentActiveRound = newCoords.roundNumber;
                lastAudioPingRound = null;
                lastAutoPinnedRound = null;
                lastResolvedRoundNumber = null;
                lastAddressInfo = null;
                safeStorageSet({ lastAddressInfo: null });
                isResolvingAddress = false;
                const roundPill = document.getElementById('hud-round-pill');
                if (roundPill) roundPill.innerText = `ROUND #${currentActiveRound}`;
            }

            const isSignificantDelta = !currentCoordinates || 
                                       Math.abs(currentCoordinates.lat - newCoords.lat) > 0.0001 || 
                                       Math.abs(currentCoordinates.lng - newCoords.lng) > 0.0001;

            if (isSignificantDelta || newCoords.isRescan) {
                currentCoordinates = newCoords;
                hintLevel = 0;
                safeStorageSet({ lastCoordinates: currentCoordinates, currentActiveRound });
                
                // Audio Ping: ONLY on initial round location discovery or explicit manual rescan (prevents navigation ping spam)
                if (lastAudioPingRound !== currentActiveRound || newCoords.isRescan) {
                    lastAudioPingRound = currentActiveRound;
                    playAudioPing(1046.5, 0.18, false);
                }

                // ADDRESS RESOLUTION LOCK: Resolve address AT MOST ONCE per round until explicit manual rescan!
                const isRescan = !!newCoords.isRescan;
                const isNewRoundForResolve = (lastResolvedRoundNumber !== currentActiveRound);
                if ((isRescan || isNewRoundForResolve) && !isResolvingAddress) {
                    lastResolvedRoundNumber = currentActiveRound;
                    fetchAddressInfo(currentCoordinates.lat, currentCoordinates.lng, currentActiveRound, isRescan);
                }

                logRoundToHistory(currentCoordinates);
                updateHudDisplay(currentCoordinates);

                // Auto-Center In-Game Map to location on NEW round only (if enabled)
                if (autoCenterMapOnRound && !isLegitMode) {
                    if (lastCenteredLat !== currentCoordinates.lat || lastCenteredLng !== currentCoordinates.lng) {
                        lastCenteredLat = currentCoordinates.lat;
                        lastCenteredLng = currentCoordinates.lng;
                        window.postMessage({
                            type: 'GEOINKWELL_CENTER_MAP',
                            payload: currentCoordinates
                        }, '*');
                    }
                }
            } else {
                updateHudDisplay(newCoords);
            }
        }
    });

    // Handle background / popup extension messages
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request) return;

            if (request.action === 'TRIGGER_AUTOPIN') {
                const tier = request.tier || (request.stealth ? 'master' : '5k');
                triggerAutoPinAndGuess(tier);
                if (typeof sendResponse === 'function') sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'GET_STATE') {
                if (typeof sendResponse === 'function') {
                    sendResponse({
                        currentCoordinates,
                        currentActiveRound,
                        autoPinOnRound,
                        autoPinDelay,
                        autoCenterMapOnRound,
                        isLegitMode,
                        lastAddressInfo
                    });
                }
                return true;
            }

            if (request.action === 'TRIGGER_RESCAN') {
                triggerManualScan();
                if (typeof sendResponse === 'function') sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'TRIGGER_CENTER_MAP') {
                if (currentCoordinates) {
                    window.postMessage({ type: 'GEOINKWELL_CENTER_MAP', payload: currentCoordinates }, '*');
                    showToast("In-Game Map Centered on Target!");
                }
                if (typeof sendResponse === 'function') sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'UPDATE_SETTINGS') {
                if (typeof request.autoPinOnRound === 'boolean') {
                    autoPinOnRound = request.autoPinOnRound;
                    safeStorageSet({ autoPinOnRound, autoPinEnabled: autoPinOnRound });
                    const c1 = document.getElementById('chk-autopin-round');
                    if (c1) c1.checked = autoPinOnRound;
                }
                if (typeof request.autoPinDelay === 'number') {
                    autoPinDelay = request.autoPinDelay;
                    safeStorageSet({ autoPinDelay });
                    const s1 = document.getElementById('sel-autopin-delay');
                    if (s1) s1.value = String(autoPinDelay);
                }
                if (typeof request.autoCenterMapOnRound === 'boolean') {
                    autoCenterMapOnRound = request.autoCenterMapOnRound;
                    safeStorageSet({ autoCenterMapOnRound });
                    const c2 = document.getElementById('chk-autocenter');
                    if (c2) c2.checked = autoCenterMapOnRound;
                }
                if (typeof request.isLegitMode === 'boolean') {
                    isLegitMode = request.isLegitMode;
                    safeStorageSet({ isLegitMode });
                    const btn = document.getElementById('hud-mode-toggle');
                    const hintSec = document.getElementById('hud-hint-section');
                    const coordsEl = document.getElementById('hud-coords');
                    if (btn) btn.innerText = isLegitMode ? 'MODE: LEGIT PRACTICE' : 'MODE: FULL TACTICAL';
                    if (hintSec) hintSec.style.display = isLegitMode ? 'block' : 'none';
                    if (coordsEl) coordsEl.style.filter = isLegitMode ? 'blur(4px)' : 'none';
                }
                if (typeof sendResponse === 'function') sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'APPLY_COSMETICS') {
                window.postMessage({ type: 'GEOINKWELL_SET_COINS', payload: { amount: request.coins } }, '*');
                window.postMessage({ type: 'GEOINKWELL_SET_TITLE', payload: { title: request.title } }, '*');
                window.postMessage({ type: 'GEOINKWELL_SET_LEVEL', payload: { level: request.level, division: request.division } }, '*');
                if (typeof sendResponse === 'function') sendResponse({ status: 'ok' });
                return true;
            }
        });
    } catch (e) {}

    // Request immediate sync from main world interceptor until coordinates arrive
    window.postMessage({ type: 'GEOINKWELL_REQUEST_CURRENT_LOCATION' }, '*');
    const syncInterval = setInterval(() => {
        if (!currentCoordinates) {
            window.postMessage({ type: 'GEOINKWELL_REQUEST_CURRENT_LOCATION' }, '*');
        } else {
            clearInterval(syncInterval);
        }
    }, 1000);

    function logRoundToHistory(coords) {
        const rNum = coords.roundNumber || currentActiveRound;
        const existingIdx = roundHistory.findIndex(h => h.roundNum === rNum);
        if (existingIdx >= 0) {
            roundHistory[existingIdx].lat = coords.lat;
            roundHistory[existingIdx].lng = coords.lng;
            if (coords.countryCode) roundHistory[existingIdx].countryCode = coords.countryCode;
        } else {
            const item = {
                id: Date.now(),
                roundNum: rNum,
                lat: coords.lat,
                lng: coords.lng,
                countryCode: coords.countryCode,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
            roundHistory.unshift(item);
            if (roundHistory.length > 25) roundHistory.pop();
        }
        updateHistoryUI();
    }

    function updateHistoryUI() {
        const historyList = document.getElementById('hud-history-list');
        if (!historyList) return;

        historyList.innerHTML = '';
        if (roundHistory.length === 0) {
            historyList.innerHTML = '<div class="hud-label" style="font-style:italic;">No rounds logged in current session.</div>';
            return;
        }

        roundHistory.forEach((r) => {
            const div = document.createElement('div');
            div.className = 'hud-history-item';
            div.innerHTML = `
                <span>R#${r.roundNum} ${r.countryCode || 'Global'} (${r.lat.toFixed(3)}, ${r.lng.toFixed(3)})</span>
                <a class="btn-hist-gmaps" href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener noreferrer">Maps</a>
            `;
            historyList.appendChild(div);
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.altKey && e.key === '1') {
            if (currentCoordinates) {
                navigator.clipboard.writeText(`${currentCoordinates.lat}, ${currentCoordinates.lng}`);
                showToast("Coordinates copied to clipboard!");
            }
        }
        if (e.altKey && e.key === '2') {
            triggerAutoPinAndGuess('5k'); // 5K Exact Pin
        }
        if (e.altKey && e.key === '3') {
            toggleHud();
        }
        if (e.altKey && e.key === '4') {
            triggerAutoPinAndGuess('master'); // Master (~4.95K)
        }
        if (e.altKey && e.key === '5') {
            triggerAutoPinAndGuess('pro'); // Pro (~4.7K)
        }
        if (e.altKey && e.key === '6') {
            triggerAutoPinAndGuess('regional'); // Region (~4.2K)
        }
        if (e.altKey && e.key === '7') {
            triggerAutoPinAndGuess('casual'); // Casual (~3.6K)
        }
        if (e.altKey && e.key === '8') {
            triggerAutoPinAndGuess('gold'); // Gold (~4.88K)
        }
        if (e.altKey && e.key === '9') {
            triggerAutoPinAndGuess('silver'); // Silver (~4.5K)
        }
        if (e.altKey && e.key === '0') {
            triggerAutoPinAndGuess('precision'); // Precision (~4.99K)
        }
        if (e.altKey && (e.key === 'p' || e.key === 'P')) {
            const sel = document.getElementById('sel-custom-offset-amount');
            const customVal = sel ? parseFloat(sel.value) : 0;
            triggerAutoPinAndGuess(customVal);
        }
        if (e.altKey && (e.key === 'r' || e.key === 'R')) {
            triggerManualScan();
        }
        if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            if (currentCoordinates) {
                window.postMessage({ type: 'GEOINKWELL_CENTER_MAP', payload: currentCoordinates }, '*');
                showToast("In-Game Map Centered on Target!");
            }
        }
        if (e.altKey && (e.key === 'h' || e.key === 'H')) {
            revealNextHint();
        }
    });

    let lastFetchedLat = null;
    let lastFetchedLng = null;
    let lastResolvedLat = null;
    let lastResolvedLng = null;
    let lastResolvedRoundNumber = null;
    let isResolvingAddress = false;

    function triggerManualScan() {
        showToast("Scanning active game round...");
        currentCoordinates = null;
        reverseGeocodeData = null;
        lastFetchedLat = null;
        lastFetchedLng = null;
        lastResolvedLat = null;
        lastResolvedLng = null;
        lastResolvedRoundNumber = null;
        isResolvingAddress = false;
        lastAudioPingRound = null;
        lastAutoPinnedRound = null;
        lastAutoPinnedLat = null;
        lastAutoPinnedLng = null;
        if (autoPinTimeoutId) {
            clearTimeout(autoPinTimeoutId);
            autoPinTimeoutId = null;
        }

        const addressEl = document.getElementById('hud-address');
        const stateEl = document.getElementById('hud-state');
        const cityEl = document.getElementById('hud-city');
        const countryEl = document.getElementById('hud-country');
        const coordsEl = document.getElementById('hud-coords');
        const hemiEl = document.getElementById('hud-hemisphere');
        const sunEl = document.getElementById('hud-sun');
        const continentEl = document.getElementById('hud-continent');
        const scriptEl = document.getElementById('hud-script');

        if (addressEl) addressEl.innerText = "Rescanning active round location...";
        if (stateEl) stateEl.innerText = "Scanning...";
        if (cityEl) cityEl.innerText = "Scanning...";
        if (countryEl) countryEl.innerText = "Scanning...";
        if (hemiEl) hemiEl.innerText = "Scanning...";
        if (sunEl) sunEl.innerText = "Scanning...";
        if (continentEl) continentEl.innerText = "Scanning...";
        if (scriptEl) scriptEl.innerText = "Scanning...";
        if (coordsEl) coordsEl.innerHTML = `<span style="color:#FFD700;">Scanning active memory...</span>`;

        window.postMessage({ type: 'GEOINKWELL_MANUAL_REFRESH' }, '*');

        // Multi-tier retry pings for resilient resolution
        setTimeout(() => {
            if (!currentCoordinates) {
                window.postMessage({ type: 'GEOINKWELL_REQUEST_CURRENT_LOCATION' }, '*');
            }
        }, 500);
        setTimeout(() => {
            if (!currentCoordinates) {
                window.postMessage({ type: 'GEOINKWELL_MANUAL_REFRESH' }, '*');
            }
        }, 1200);
    }

    function askBackgroundGeocode(lat, lng) {
        return new Promise((resolve) => {
            let finished = false;
            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    resolve(null);
                }
            }, 1500);

            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && typeof chrome.runtime.sendMessage === 'function') {
                    chrome.runtime.sendMessage({ action: 'REVERSE_GEOCODE', lat, lng }, (res) => {
                        if (finished) return;
                        finished = true;
                        clearTimeout(timer);
                        if (chrome.runtime.lastError || !res || !res.success) {
                            resolve(null);
                        } else {
                            resolve(res);
                        }
                    });
                } else {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timer);
                    resolve(null);
                }
            } catch (e) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve(null);
            }
        });
    }

    function ensureAddressHasCountry(addrStr, countryName, flag) {
        let clean = (addrStr || '').trim();
        if (!countryName) return clean;

        if (flag && clean.startsWith(flag)) {
            clean = clean.slice(flag.length).trim();
        }

        clean = clean.replace(/,\s*[A-Z]{2,3}$/i, '').trim();

        const lowerClean = clean.toLowerCase();
        const lowerCountry = countryName.toLowerCase();

        if (!lowerClean.endsWith(lowerCountry)) {
            const tokens = clean.split(',').map(s => s.trim()).filter(Boolean);
            const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
            if (lastToken.toLowerCase() !== lowerCountry) {
                clean = clean ? `${clean}, ${countryName}` : countryName;
            }
        }

        return (flag && flag !== '🌐') ? `${flag} ${clean}` : clean;
    }

    async function fetchAddressInfo(lat, lng, boundRound = currentActiveRound, force = false) {
        if (isResolvingAddress && !force) return;
        isResolvingAddress = true;

        lastFetchedLat = lat;
        lastFetchedLng = lng;

        const addressEl = document.getElementById('hud-address');
        const stateEl = document.getElementById('hud-state');
        const cityEl = document.getElementById('hud-city');
        const countryEl = document.getElementById('hud-country');

        const meta = getCountryMeta(currentCoordinates ? currentCoordinates.countryCode : '', lat, lng);
        const guaranteedCountry = (meta.name && meta.name !== 'Global' && meta.name !== 'Global Territory') ? meta.name : (getEnglishNameFromCode(lookupCountryByCoords(lat, lng)) || '');
        const guaranteedFlag = (meta.flag && meta.flag !== '🌐') ? meta.flag : getFlagEmoji(lookupCountryByCoords(lat, lng));
        const fallbackCountryStr = (guaranteedFlag && guaranteedFlag !== '🌐') ? `${guaranteedFlag} ${guaranteedCountry}` : guaranteedCountry;
        const fallbackAddr = `${guaranteedFlag ? guaranteedFlag + ' ' : ''}${guaranteedCountry || 'Location'} [${lat.toFixed(5)}, ${lng.toFixed(5)}]`;
        const fallbackState = guaranteedCountry || '---';
        const fallbackCity = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

        try {
            const bgData = await askBackgroundGeocode(lat, lng);
            if (currentActiveRound !== boundRound) return;

            if (bgData && bgData.success && bgData.address) {
                const resolvedFlag = bgData.flag || guaranteedFlag || '🌐';
                const resolvedCountry = bgData.country || guaranteedCountry || '';
                const displayCountryStr = (resolvedFlag && resolvedFlag !== '🌐') ? `${resolvedFlag} ${resolvedCountry}` : resolvedCountry;

                // Guarantee country name and flag are present in the target location / street address
                const displayAddressStr = ensureAddressHasCountry(bgData.address, resolvedCountry, resolvedFlag);

                if (stateEl && bgData.state) stateEl.innerText = bgData.state;
                if (cityEl && bgData.city) cityEl.innerText = bgData.city;
                if (addressEl && displayAddressStr) addressEl.innerText = displayAddressStr;
                if (countryEl && displayCountryStr) countryEl.innerText = displayCountryStr;

                lastAddressInfo = {
                    address: displayAddressStr,
                    rawAddress: bgData.address,
                    state: bgData.state || fallbackState,
                    city: bgData.city || fallbackCity,
                    country: resolvedCountry,
                    countryCode: bgData.countryCode || '',
                    flag: resolvedFlag
                };
                lastResolvedLat = lat;
                lastResolvedLng = lng;
                safeStorageSet({ lastAddressInfo });
                return;
            }
        } catch (e) {
        } finally {
            isResolvingAddress = false;
        }

        // Deterministic Fallback if network resolve fails or returns no address: ALWAYS show Country!
        if (currentActiveRound !== boundRound) return;
        if (addressEl) addressEl.innerText = fallbackAddr;
        if (countryEl) countryEl.innerText = fallbackCountryStr || '🌐 Global';
        if (stateEl) stateEl.innerText = fallbackState;
        if (cityEl) cityEl.innerText = fallbackCity;

        lastAddressInfo = {
            address: fallbackAddr,
            state: fallbackState,
            city: fallbackCity,
            country: guaranteedCountry,
            flag: guaranteedFlag
        };
        lastResolvedLat = lat;
        lastResolvedLng = lng;
        safeStorageSet({ lastAddressInfo });
    }

    function createHudOverlay() {
        if (document.getElementById('geoinkwell-hud')) return;

        const hud = document.createElement('div');
        hud.id = 'geoinkwell-hud';
        hud.className = `theme-${currentTheme}`;
        hud.innerHTML = `
            <div class="hud-header" id="hud-drag-handle">
                <div class="hud-title">
                    <span class="hud-round-pill" id="hud-round-pill">ROUND #1</span>
                    <span class="brand">INKWELL</span> GEO MASTER v12.0
                </div>
                <div class="hud-controls">
                    <button id="hud-rescan-btn" class="hud-rescan-prominent" title="Force Rescan Round (Alt+R)">↻ RESCAN</button>
                    <button id="hud-theme-toggle" title="Cycle Theme">THEME</button>
                    <button id="hud-mode-toggle" title="Toggle Mode">MODE: FULL</button>
                    <button id="hud-toggle-btn" title="Minimize">–</button>
                </div>
            </div>
            <div class="hud-body" id="hud-body-content">
                <div class="hud-section highlight-box">
                    <div class="hud-label">TARGET LOCATION & STREET ADDRESS</div>
                    <div class="hud-value-box main-address" id="hud-address">Start game round to resolve location...</div>
                </div>

                <div class="hud-section">
                    <div class="hud-label">COORDINATES & BEARING</div>
                    <div class="hud-value-box coords" id="hud-coords">Waiting for game round...</div>
                </div>

                <div class="hud-grid-2">
                    <div class="hud-section">
                        <div class="hud-label">HEMISPHERE & QUADRANT</div>
                        <div class="hud-value" id="hud-hemisphere">---</div>
                    </div>
                    <div class="hud-section">
                        <div class="hud-label">SUN ORIENTATION (COMPASS)</div>
                        <div class="hud-value" id="hud-sun">---</div>
                    </div>
                </div>

                <div class="hud-grid-2">
                    <div class="hud-section">
                        <div class="hud-label">CONTINENT & MACRO-REGION</div>
                        <div class="hud-value" id="hud-continent">---</div>
                    </div>
                    <div class="hud-section">
                        <div class="hud-label">SCRIPT & PHONE PREFIX</div>
                        <div class="hud-value" id="hud-script">---</div>
                    </div>
                </div>

                <div class="hud-grid-2">
                    <div class="hud-section">
                        <div class="hud-label">COUNTRY / FLAG</div>
                        <div class="hud-value" id="hud-country">---</div>
                    </div>
                    <div class="hud-section">
                        <div class="hud-label">DRIVE SIDE & ROAD LINES</div>
                        <div class="hud-value" id="hud-driving">---</div>
                    </div>
                </div>

                <div class="hud-grid-2">
                    <div class="hud-section">
                        <div class="hud-label">STATE / PREFECTURE</div>
                        <div class="hud-value" id="hud-state">---</div>
                    </div>
                    <div class="hud-section">
                        <div class="hud-label">COUNTY / CITY / DISTRICT</div>
                        <div class="hud-value" id="hud-city">---</div>
                    </div>
                </div>

                <div class="hud-grid-2">
                    <div class="hud-section">
                        <div class="hud-label">BOLLARD / META GUIDE</div>
                        <div class="hud-value" id="hud-bollard">---</div>
                    </div>
                    <div class="hud-section">
                        <div class="hud-label">CAR META & CAMERA GEN</div>
                        <div class="hud-value" id="hud-car">---</div>
                    </div>
                </div>

                <div class="hud-section hint-box" id="hud-hint-section" style="display:none;">
                    <div class="hud-label">LEGIT PRACTICE HINTS [<span id="hint-level-txt">Level 0/4</span>]</div>
                    <div class="hud-hint-text" id="hud-hint-display">Click 'Reveal Hint' or press Alt+H for progressive clues.</div>
                    <button class="hud-btn secondary" id="btn-reveal-hint" style="margin-top:6px; width:100%;">Reveal Next Hint (Alt+H)</button>
                </div>

                <div class="hud-toggle-bar" style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="display:flex; align-items:center; gap:4px;">
                        <input type="checkbox" id="chk-autocenter"> Auto-Center Map
                    </label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:10px;">
                        Delay:
                        <select id="sel-hud-autopin-delay" style="background:#0A0F18; color:#00FFB0; border:1px solid rgba(0,255,176,0.3); border-radius:3px; padding:1px 3px; font-size:10px;">
                            <option value="0">0s (Instant)</option>
                            <option value="500">500ms</option>
                            <option value="1000">1.0s</option>
                            <option value="1500" selected>1.5s</option>
                            <option value="2000">2.0s</option>
                            <option value="3000">3.0s</option>
                            <option value="5000">5.0s</option>
                        </select>
                    </label>
                </div>

                <div class="hud-land-badge">🛡️ LAND-LOCK: ACTIVE (WATER PLONKS BLOCKED)</div>

                <div class="hud-actions-grid-3">
                    <button class="hud-btn primary" id="btn-autopin" title="Alt+2">5K EXACT</button>
                    <button class="hud-btn precision" id="btn-precisionpin" title="Alt+0">PRECISION ~4.99K</button>
                    <button class="hud-btn master" id="btn-masterpin" title="Alt+4">MASTER ~4.97K</button>
                    <button class="hud-btn gold" id="btn-goldpin" title="Alt+8">GOLD ~4.88K</button>
                    <button class="hud-btn pro" id="btn-propin" title="Alt+5">PRO ~4.7K</button>
                    <button class="hud-btn silver" id="btn-silverpin" title="Alt+9">SILVER ~4.5K</button>
                    <button class="hud-btn region" id="btn-regionpin" title="Alt+6">REGION ~4.2K</button>
                    <button class="hud-btn casual" id="btn-casualpin" title="Alt+7">CASUAL ~3.6K</button>
                    <button class="hud-btn country" id="btn-countrypin">COUNTRY ~2.8K</button>
                </div>

                <div class="hud-custom-amount-box">
                    <div class="hud-label" style="margin-bottom:3px;">CUSTOM OFFSET AMOUNT & TARGET</div>
                    <div class="hud-custom-row">
                        <select id="sel-custom-offset-amount" class="hud-amount-select">
                            <option value="0">Exact Target (0m / 5,000 pts)</option>
                            <option value="0.05">50m Offset (~4,998 pts)</option>
                            <option value="0.1">100m Offset (~4,995 pts)</option>
                            <option value="0.25">250m Offset (~4,985 pts)</option>
                            <option value="0.5">500m Offset (~4,970 pts)</option>
                            <option value="1.0">1.0 km Offset (~4,930 pts)</option>
                            <option value="2.0">2.0 km Offset (~4,890 pts)</option>
                            <option value="5.0">5.0 km Offset (~4,750 pts)</option>
                            <option value="10.0">10 km Offset (~4,600 pts)</option>
                            <option value="25.0">25 km Offset (~4,350 pts)</option>
                            <option value="50.0">50 km Offset (~4,100 pts)</option>
                            <option value="100.0">100 km Offset (~3,600 pts)</option>
                            <option value="200.0">200 km Offset (~2,800 pts)</option>
                        </select>
                        <button class="hud-btn-sub" id="btn-custom-amount-pin" title="Alt+P" style="flex:1;">🎯 PLONK</button>
                        <button class="hud-btn-sub" id="btn-center-map" title="Alt+C" style="flex:1;">📍 CENTER</button>
                    </div>
                </div>

                <!-- EMBEDDED MAP PREVIEW CONTAINER -->
                <div class="hud-section" style="margin-top:10px;">
                    <div class="hud-label-row">
                        <span class="hud-label">LIVE MAP PREVIEW</span>
                        <div class="hud-map-provider-toggle">
                            <button id="btn-map-sat" class="active">🛰️ Sat</button>
                            <button id="btn-map-gmaps-layer">📍 G-Map</button>
                            <button id="btn-map-osm-layer">🗺️ OSM</button>
                        </div>
                    </div>
                    <div id="hud-interactive-map" class="hud-map-container">
                        <iframe id="hud-map-iframe" src="about:blank" frameborder="0" loading="lazy"></iframe>
                    </div>
                </div>

                <div class="hud-ext-maps">
                    <a class="hud-mini-btn" id="btn-map-gmaps" href="#" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>
                    <a class="hud-mini-btn" id="btn-map-osm" href="#" target="_blank" rel="noopener noreferrer">OpenStreetMap ↗</a>
                    <a class="hud-mini-btn" id="btn-map-bing" href="#" target="_blank" rel="noopener noreferrer">Bing Maps ↗</a>
                </div>

                <div class="hud-section history-box" style="margin-top:10px;">
                    <div class="hud-label">SESSION ROUND HISTORY LOG</div>
                    <div class="hud-history-list" id="hud-history-list">
                        <div class="hud-label" style="font-style:italic;">No rounds logged yet.</div>
                    </div>
                </div>
            </div>
        `;

        const targetContainer = document.body || document.documentElement;
        if (targetContainer) {
            targetContainer.appendChild(hud);
        }

        document.getElementById('hud-rescan-btn').addEventListener('click', triggerManualScan);
        document.getElementById('btn-autopin').addEventListener('click', () => triggerAutoPinAndGuess('5k'));
        document.getElementById('btn-precisionpin').addEventListener('click', () => triggerAutoPinAndGuess('precision'));
        document.getElementById('btn-masterpin').addEventListener('click', () => triggerAutoPinAndGuess('master'));
        document.getElementById('btn-goldpin').addEventListener('click', () => triggerAutoPinAndGuess('gold'));
        document.getElementById('btn-propin').addEventListener('click', () => triggerAutoPinAndGuess('pro'));
        document.getElementById('btn-silverpin').addEventListener('click', () => triggerAutoPinAndGuess('silver'));
        document.getElementById('btn-regionpin').addEventListener('click', () => triggerAutoPinAndGuess('regional'));
        document.getElementById('btn-casualpin').addEventListener('click', () => triggerAutoPinAndGuess('casual'));
        document.getElementById('btn-countrypin').addEventListener('click', () => triggerAutoPinAndGuess('country'));

        const btnCustomPlonk = document.getElementById('btn-custom-amount-pin');
        if (btnCustomPlonk) {
            btnCustomPlonk.addEventListener('click', () => {
                const sel = document.getElementById('sel-custom-offset-amount');
                const km = sel ? parseFloat(sel.value) : 0;
                triggerAutoPinAndGuess(km);
            });
        }

        const selDelay = document.getElementById('sel-hud-autopin-delay');
        if (selDelay) {
            selDelay.value = String(autoPinDelay);
            selDelay.addEventListener('change', (e) => {
                autoPinDelay = parseInt(e.target.value, 10) || 0;
                safeStorageSet({ autoPinDelay });
                showToast(`Auto-Pin Delay set to ${autoPinDelay}ms`);
            });
        }

        document.getElementById('btn-center-map').addEventListener('click', () => {
            if (currentCoordinates) {
                window.postMessage({ type: 'GEOINKWELL_CENTER_MAP', payload: currentCoordinates }, '*');
                showToast("In-Game Map Centered on Target!");
            }
        });

        document.getElementById('btn-reveal-hint').addEventListener('click', revealNextHint);
        
        const chkAutoCenter = document.getElementById('chk-autocenter');
        if (chkAutoCenter) chkAutoCenter.checked = autoCenterMapOnRound;

        if (chkAutoCenter) {
            chkAutoCenter.addEventListener('change', (e) => {
                autoCenterMapOnRound = e.target.checked;
                safeStorageSet({ autoCenterMapOnRound });
                showToast(`Auto-Center Map: ${autoCenterMapOnRound ? 'ENABLED' : 'DISABLED'}`);
            });
        }

        document.getElementById('hud-theme-toggle').addEventListener('click', cycleTheme);
        document.getElementById('hud-mode-toggle').addEventListener('click', toggleLegitMode);
        document.getElementById('hud-toggle-btn').addEventListener('click', toggleHud);

        // Map layer toggle listeners
        document.getElementById('btn-map-sat').addEventListener('click', () => setMapProvider('gmaps_satellite'));
        document.getElementById('btn-map-gmaps-layer').addEventListener('click', () => setMapProvider('gmaps'));
        document.getElementById('btn-map-osm-layer').addEventListener('click', () => setMapProvider('osm'));

        makeElementDraggable(hud, document.getElementById('hud-drag-handle'));
    }

    function setMapProvider(provider) {
        activeMapProvider = provider;
        document.querySelectorAll('.hud-map-provider-toggle button').forEach(b => b.classList.remove('active'));
        if (provider === 'gmaps_satellite') document.getElementById('btn-map-sat').classList.add('active');
        if (provider === 'gmaps') document.getElementById('btn-map-gmaps-layer').classList.add('active');
        if (provider === 'osm') document.getElementById('btn-map-osm-layer').classList.add('active');

        if (currentCoordinates) {
            updateEmbeddedMap(currentCoordinates.lat, currentCoordinates.lng);
        }
    }

    function updateEmbeddedMap(lat, lng) {
        const iframe = document.getElementById('hud-map-iframe');
        if (!iframe) return;

        let srcUrl = '';
        if (activeMapProvider === 'gmaps_satellite') {
            srcUrl = `https://maps.google.com/maps?q=${lat},${lng}&t=k&z=15&output=embed`;
        } else if (activeMapProvider === 'gmaps') {
            srcUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed`;
        } else if (activeMapProvider === 'osm') {
            srcUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01},${lat-0.01},${lng+0.01},${lat+0.01}&layer=mapnik&marker=${lat},${lng}`;
        }

        if (iframe.src !== srcUrl) {
            iframe.src = srcUrl;
        }

        // Update external map buttons
        const gmapsBtn = document.getElementById('btn-map-gmaps');
        const osmBtn = document.getElementById('btn-map-osm');
        const bingBtn = document.getElementById('btn-map-bing');

        if (gmapsBtn) gmapsBtn.href = `https://www.google.com/maps?q=${lat},${lng}`;
        if (osmBtn) osmBtn.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
        if (bingBtn) bingBtn.href = `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=16`;
    }

    function cycleTheme() {
        const themes = ['cyberpunk', 'crimson', 'amber', 'matrix'];
        const idx = (themes.indexOf(currentTheme) + 1) % themes.length;
        currentTheme = themes[idx];
        const hud = document.getElementById('geoinkwell-hud');
        if (hud) {
            hud.className = `theme-${currentTheme}`;
        }
        safeStorageSet({ currentTheme });
        showToast(`Theme Switched to ${currentTheme.toUpperCase()}`);
    }

    function updateHudDisplay(data) {
        createHudOverlay();

        const addressEl = document.getElementById('hud-address');
        const coordsEl = document.getElementById('hud-coords');
        const hemiEl = document.getElementById('hud-hemisphere');
        const sunEl = document.getElementById('hud-sun');
        const continentEl = document.getElementById('hud-continent');
        const scriptEl = document.getElementById('hud-script');
        const stateEl = document.getElementById('hud-state');
        const cityEl = document.getElementById('hud-city');
        const countryEl = document.getElementById('hud-country');
        const drivingEl = document.getElementById('hud-driving');
        const bollardEl = document.getElementById('hud-bollard');
        const carEl = document.getElementById('hud-car');

        const headingDir = getCardinalHeading(data.heading || 0);
        if (coordsEl) {
            coordsEl.innerHTML = `<span style="color:#00FFB0;">${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}</span> <span style="color:#FFD700; font-size:10px;">[${headingDir}]</span>`;
        }

        const hemiInfo = getHemisphereInfo(data.lat, data.lng);
        if (hemiEl) hemiEl.innerText = hemiInfo.label;
        if (sunEl) sunEl.innerText = hemiInfo.sun;

        const countryMeta = getCountryMeta(data.countryCode, data.lat, data.lng);
        if (continentEl) continentEl.innerText = countryMeta.continentRegion;
        if (scriptEl) scriptEl.innerText = countryMeta.scriptPhone;
        
        let displayCountry = '';
        let displayFlag = '';

        if (lastAddressInfo && lastAddressInfo.country && lastAddressInfo.country !== '---' && !lastAddressInfo.country.includes('Global')) {
            displayCountry = lastAddressInfo.country;
            displayFlag = lastAddressInfo.flag || (countryMeta.flag !== '🌐' ? countryMeta.flag : '');
        } else if (countryMeta.name && countryMeta.name !== 'Global' && countryMeta.name !== 'Global Territory') {
            displayCountry = countryMeta.name;
            displayFlag = countryMeta.flag;
        }

        const fallbackAddr = displayCountry ? `${displayFlag ? displayFlag + ' ' : ''}${displayCountry} [${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}]` : `[${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}]`;
        const fallbackState = (countryMeta.name && countryMeta.name !== 'Global' && countryMeta.name !== 'Global Territory') ? countryMeta.name : '---';
        const fallbackCity = `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`;

        if (countryEl) {
            if (displayCountry) {
                countryEl.innerText = (displayFlag && displayFlag !== '🌐') ? `${displayFlag} ${displayCountry}` : displayCountry;
            } else {
                countryEl.innerText = '🌐 Global Territory';
            }
        }
        if (drivingEl) drivingEl.innerText = `${countryMeta.drivingSide} | ${countryMeta.roadLines}`;
        if (bollardEl) bollardEl.innerText = countryMeta.bollard;
        if (carEl) carEl.innerText = `${countryMeta.carMeta} [${countryMeta.cameraGen}]`;

        // INSTANT ZERO-WAIT LOCATION PRESENTATION (0ms Latency)
        if (lastAddressInfo && lastAddressInfo.address) {
            const addrText = ensureAddressHasCountry(lastAddressInfo.address, displayCountry, displayFlag);
            if (addressEl) addressEl.innerText = addrText;
            if (stateEl) stateEl.innerText = lastAddressInfo.state || fallbackState;
            if (cityEl) cityEl.innerText = lastAddressInfo.city || fallbackCity;
        } else {
            if (addressEl) {
                const labelCountry = displayCountry || (countryMeta.name !== 'Global' ? countryMeta.name : '');
                addressEl.innerHTML = `<span style="color:#00FFB0; font-weight:bold;">${displayFlag ? displayFlag + ' ' : ''}${labelCountry ? labelCountry : 'Acquiring country...'}</span> <span style="color:#8892B0; font-size:11px;">[${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}]</span>`;
            }
            if (stateEl) stateEl.innerText = fallbackState;
            if (cityEl) cityEl.innerText = fallbackCity;
        }

        // Update Embedded Map Iframe & External Links
        updateEmbeddedMap(data.lat, data.lng);
    }

    function getCardinalHeading(heading) {
        const dirs = ['N ↑', 'NE ↗', 'E →', 'SE ↘', 'S ↓', 'SW ↙', 'W ←', 'NW ↖'];
        const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
        return dirs[index];
    }

    function revealNextHint() {
        if (!currentCoordinates) {
            showToast("No active game round detected.");
            return;
        }

        hintLevel = Math.min(hintLevel + 1, 4);
        const hintTxtEl = document.getElementById('hud-hint-display');
        const hintLvlEl = document.getElementById('hint-level-txt');
        if (hintLvlEl) hintLvlEl.innerText = `Level ${hintLevel}/4`;

        const lat = currentCoordinates.lat;
        const lng = currentCoordinates.lng;
        const hemiInfo = getHemisphereInfo(lat, lng);
        const meta = getCountryMeta(currentCoordinates.countryCode, lat, lng);

        let text = "";
        switch (hintLevel) {
            case 1:
                text = `<b>Hint 1 (Hemisphere & Sun):</b> 🌐 ${hemiInfo.latHemi} Hemisphere, ${hemiInfo.lngHemi} Hemisphere (${hemiInfo.quadrant}) | ${hemiInfo.sun}`;
                break;
            case 2:
                text = `<b>Hint 2 (Continent & Driving):</b> 🗺️ ${meta.continentRegion} | Drives on <b>${meta.drivingSide}</b> | Lines: ${meta.roadLines}`;
                break;
            case 3:
                text = `<b>Hint 3 (Meta Guide & Script):</b> 🔤 ${meta.scriptPhone} | Bollard: ${meta.bollard} | Car/Camera: ${meta.carMeta} [${meta.cameraGen}]`;
                break;
            case 4:
                const stateName = (lastAddressInfo && lastAddressInfo.state) || (reverseGeocodeData && (reverseGeocodeData.principalSubdivision || reverseGeocodeData.address?.state || reverseGeocodeData.address?.prefecture || reverseGeocodeData.address?.province)) || meta.name;
                const cityStr = (lastAddressInfo && lastAddressInfo.city) || (reverseGeocodeData && (reverseGeocodeData.locality || reverseGeocodeData.city || reverseGeocodeData.address?.town || reverseGeocodeData.address?.county)) || meta.name;
                const displayCountry = (lastAddressInfo && lastAddressInfo.country && !lastAddressInfo.country.includes('Global')) ? lastAddressInfo.country : meta.name;
                const displayFlag = (lastAddressInfo && lastAddressInfo.flag) || meta.flag;
                text = `<b>Hint 4 (Target Location):</b> ${displayFlag} <b>${displayCountry}</b> → <b>${stateName}</b> (${cityStr}) [${lat.toFixed(2)}, ${lng.toFixed(2)}]`;
                break;
        }

        if (hintTxtEl) hintTxtEl.innerHTML = text;
        showToast(`Hint ${hintLevel} Unlocked!`);
    }

    const WATER_BBOX_EXCLUSIONS = [
        // North Atlantic Open Waters
        [20.0, 58.0, -55.0, -15.0],
        // South Atlantic Open Waters
        [-55.0, 0.0, -40.0, 10.0],
        // North Pacific Open Waters
        [15.0, 52.0, -175.0, -130.0],
        [15.0, 48.0, 142.0, 175.0],
        // South Pacific Open Waters
        [-55.0, -5.0, -170.0, -80.0],
        // Central Indian Ocean
        [-45.0, 5.0, 55.0, 95.0],
        // Mediterranean Central Basin
        [33.5, 39.0, 14.0, 27.0],
        // Black Sea Central Basin
        [42.2, 44.5, 31.0, 39.0],
        // Red Sea Central Basin
        [16.0, 26.0, 36.5, 41.0],
        // Gulf of Mexico Central Basin
        [22.5, 27.5, -94.5, -86.0],
        // Caribbean Sea Central Basin
        [12.5, 17.5, -80.0, -68.0],
        // Tasman Sea Central Basin
        [-43.0, -32.0, 155.0, 168.0],
        // North Sea Central Basin
        [54.5, 58.5, 1.5, 6.0],
        // Baltic Sea Central Basin
        [56.0, 59.0, 18.0, 21.0]
    ];

    function isWaterExclusionCoordinate(lat, lng) {
        for (let i = 0; i < WATER_BBOX_EXCLUSIONS.length; i++) {
            const w = WATER_BBOX_EXCLUSIONS[i];
            if (lat >= w[0] && lat <= w[1] && lng >= w[2] && lng <= w[3]) {
                return true;
            }
        }
        return false;
    }

    function findCountryBounds(lat, lng, countryCode) {
        if (countryCode) {
            for (let i = 0; i < WORLD_BBOX_CLASSIFIER.length; i++) {
                if (WORLD_BBOX_CLASSIFIER[i][4] === countryCode) {
                    return WORLD_BBOX_CLASSIFIER[i];
                }
            }
        }
        for (let i = 0; i < WORLD_BBOX_CLASSIFIER.length; i++) {
            const b = WORLD_BBOX_CLASSIFIER[i];
            if (lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]) {
                return b;
            }
        }
        return null;
    }

    function applyGeographicJitter(lat, lng, tier = '5k') {
        const isNumeric = (typeof tier === 'number') || (!isNaN(parseFloat(tier)) && isFinite(tier));
        const mode = isNumeric ? 'custom' : (typeof tier === 'string' ? tier.toLowerCase().trim() : '5k');

        if (mode === '5k' || mode === 'exact' || (isNumeric && parseFloat(tier) <= 0)) {
            return { lat, lng, tier: '5k', distanceKm: 0, estScore: '5,000', isLandLocked: true };
        }

        let minKm = 0.2;
        let maxKm = 0.8;
        let estScore = '~4,970';

        if (isNumeric) {
            const targetKm = Math.max(0.01, parseFloat(tier));
            minKm = targetKm * 0.9;
            maxKm = targetKm * 1.1;
            if (targetKm <= 0.06) estScore = '~4,998';
            else if (targetKm <= 0.15) estScore = '~4,992';
            else if (targetKm <= 0.4) estScore = '~4,980';
            else if (targetKm <= 0.8) estScore = '~4,960';
            else if (targetKm <= 1.5) estScore = '~4,920';
            else if (targetKm <= 3.0) estScore = '~4,870';
            else if (targetKm <= 6.0) estScore = '~4,750';
            else if (targetKm <= 12.0) estScore = '~4,600';
            else if (targetKm <= 30.0) estScore = '~4,300';
            else if (targetKm <= 60.0) estScore = '~4,050';
            else if (targetKm <= 120.0) estScore = '~3,500';
            else estScore = '~2,800';
        } else if (mode === 'precision' || mode === 'champion') {
            minKm = 0.04;
            maxKm = 0.12;
            estScore = '~4,995';
        } else if (mode === 'master' || mode === 'stealth') {
            minKm = 0.18;
            maxKm = 0.65;
            estScore = '~4,970';
        } else if (mode === 'gold') {
            minKm = 1.2;
            maxKm = 2.8;
            estScore = '~4,880';
        } else if (mode === 'pro') {
            minKm = 3.5;
            maxKm = 7.5;
            estScore = '~4,700';
        } else if (mode === 'silver') {
            minKm = 10.0;
            maxKm = 18.0;
            estScore = '~4,500';
        } else if (mode === 'regional' || mode === 'region') {
            minKm = 25.0;
            maxKm = 45.0;
            estScore = '~4,200';
        } else if (mode === 'casual') {
            minKm = 60.0;
            maxKm = 110.0;
            estScore = '~3,600';
        } else if (mode === 'country') {
            minKm = 140.0;
            maxKm = 240.0;
            estScore = '~2,800';
        }

        let targetDistKm = minKm + Math.random() * (maxKm - minKm);

        // Land-Locking & Island Span Clamping
        const targetCountry = lookupCountryByCoords(lat, lng);
        const bbox = findCountryBounds(lat, lng, targetCountry);

        let inlandBearing = Math.random() * 2 * Math.PI;
        if (bbox) {
            const centerLat = (bbox[0] + bbox[1]) / 2;
            const centerLng = (bbox[2] + bbox[3]) / 2;
            const dLat = centerLat - lat;
            const dLng = (centerLng - lng) * Math.cos(lat * Math.PI / 180);
            if (Math.abs(dLat) > 0.01 || Math.abs(dLng) > 0.01) {
                inlandBearing = Math.atan2(dLng, dLat);
            }

            // Island / Narrow Landmass Radius Clamping
            const spanLatKm = (bbox[1] - bbox[0]) * 111.132;
            const spanLngKm = (bbox[3] - bbox[2]) * 111.132 * Math.cos(lat * Math.PI / 180);
            const safeLandRadiusKm = Math.max(0.4, Math.min(spanLatKm, spanLngKm) * 0.42);
            if (targetDistKm > safeLandRadiusKm) {
                targetDistKm = safeLandRadiusKm * (0.65 + Math.random() * 0.3);
            }
        }

        const latRad = (lat * Math.PI) / 180;
        const cosLat = Math.max(0.15, Math.abs(Math.cos(latRad)));

        let chosenLat = lat;
        let chosenLng = lng;
        let chosenDistKm = 0;
        let foundLand = false;

        // Multi-sample candidate evaluation with water rejection
        for (let attempt = 0; attempt < 36; attempt++) {
            let attemptDistKm = targetDistKm;
            let bearing = 0;

            if (attempt < 16) {
                // Biased search: weight towards inland direction
                const deviation = (Math.random() - 0.5) * Math.PI * 1.2;
                bearing = inlandBearing + deviation;
            } else {
                // Fallback inland thrust: directly towards continent center, shrinking distance
                const scale = Math.max(0.2, 1.0 - (attempt - 15) * 0.04);
                attemptDistKm = targetDistKm * scale;
                bearing = inlandBearing + (Math.random() - 0.5) * 0.4;
            }

            const deltaLat = (attemptDistKm / 111.132) * Math.cos(bearing);
            const deltaLng = (attemptDistKm / (111.132 * cosLat)) * Math.sin(bearing);

            let candLat = lat + deltaLat;
            let candLng = lng + deltaLng;

            candLat = Math.max(-85.0, Math.min(85.0, candLat));
            while (candLng > 180.0) candLng -= 360.0;
            while (candLng < -180.0) candLng += 360.0;

            // Reject open oceanic water basins
            if (isWaterExclusionCoordinate(candLat, candLng)) {
                continue;
            }

            // Verify country consistency if target was inside classified territory
            if (targetCountry) {
                const candCountry = lookupCountryByCoords(candLat, candLng);
                if (candCountry !== targetCountry) {
                    continue;
                }
            }

            // Verify bounding box boundaries if available
            if (bbox) {
                if (candLat < bbox[0] || candLat > bbox[1] || candLng < bbox[2] || candLng > bbox[3]) {
                    continue;
                }
            }

            // Land Candidate Validated!
            chosenLat = candLat;
            chosenLng = candLng;
            chosenDistKm = attemptDistKm;
            foundLand = true;
            break;
        }

        // Absolute Land Guarantee: If surrounded by open water (narrow pier/cliff), clamp to 40m along road
        if (!foundLand) {
            const microDistKm = 0.04;
            const deltaLat = (microDistKm / 111.132) * Math.cos(inlandBearing);
            const deltaLng = (microDistKm / (111.132 * cosLat)) * Math.sin(inlandBearing);
            chosenLat = lat + deltaLat;
            chosenLng = lng + deltaLng;
            chosenDistKm = microDistKm;
            estScore = '~4,998';
        }

        return {
            lat: chosenLat,
            lng: chosenLng,
            tier: mode,
            distanceKm: chosenDistKm,
            estScore,
            isLandLocked: true
        };
    }

    function triggerAutoPinAndGuess(tier = '5k') {
        if (isExecutingPin) return;

        if (!currentCoordinates || (Math.abs(currentCoordinates.lat) < 0.001 && Math.abs(currentCoordinates.lng) < 0.001)) {
            showToast("Acquiring active target from memory...");
            triggerManualScan();
            setTimeout(() => {
                if (currentCoordinates && !(Math.abs(currentCoordinates.lat) < 0.001 && Math.abs(currentCoordinates.lng) < 0.001)) {
                    triggerAutoPinAndGuess(tier);
                } else {
                    showToast("No active round coordinates detected yet.");
                }
            }, 650);
            return;
        }

        isExecutingPin = true;
        lastAutoPinnedRound = currentActiveRound;
        lastAutoPinnedLat = currentCoordinates.lat;
        lastAutoPinnedLng = currentCoordinates.lng;
        if (autoPinTimeoutId) {
            clearTimeout(autoPinTimeoutId);
            autoPinTimeoutId = null;
        }
        setTimeout(() => { isExecutingPin = false; }, 1200);

        const jitter = applyGeographicJitter(currentCoordinates.lat, currentCoordinates.lng, tier);
        const distText = jitter.distanceKm < 1.0 ? `${(jitter.distanceKm * 1000).toFixed(0)}m` : `${jitter.distanceKm.toFixed(1)}km`;

        if (jitter.tier === '5k') {
            showToast("🎯 5K Exact Pin Placed (5,000 pts) [🛡️ LAND LOCKED]!");
        } else if (jitter.tier === 'precision') {
            showToast(`💎 Precision Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'master' || jitter.tier === 'stealth') {
            showToast(`👑 Master Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'gold') {
            showToast(`🥇 Gold Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'pro') {
            showToast(`⚡ Pro Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'silver') {
            showToast(`🥈 Silver Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'regional' || jitter.tier === 'region') {
            showToast(`🗺️ Region Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'casual') {
            showToast(`☕ Casual Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else if (jitter.tier === 'country') {
            showToast(`🌐 Country Pin (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        } else {
            showToast(`🎯 Custom Plonk (${jitter.estScore} pts, ${distText} offset) [🛡️ LAND LOCKED]!`);
        }

        playAudioPing(1318.5, 0.2);

        window.postMessage({
            type: 'GEOINKWELL_EXECUTE_AUTOPIN',
            payload: {
                lat: jitter.lat,
                lng: jitter.lng,
                autoSubmit: true,
                tier: jitter.tier,
                distanceKm: jitter.distanceKm,
                originalLat: currentCoordinates.lat,
                originalLng: currentCoordinates.lng
            }
        }, '*');
    }

    function toggleLegitMode() {
        isLegitMode = !isLegitMode;
        const btn = document.getElementById('hud-mode-toggle');
        const hintSec = document.getElementById('hud-hint-section');
        const coordsEl = document.getElementById('hud-coords');

        if (btn) btn.innerText = isLegitMode ? 'MODE: LEGIT PRACTICE' : 'MODE: FULL TACTICAL';
        if (hintSec) hintSec.style.display = isLegitMode ? 'block' : 'none';
        if (coordsEl) coordsEl.style.filter = isLegitMode ? 'blur(4px)' : 'none';

        safeStorageSet({ isLegitMode });
        showToast(`Switched to ${isLegitMode ? 'Legit Practice Mode' : 'Full Tactical Mode'}`);
    }

    function toggleHud() {
        const bodyContent = document.getElementById('hud-body-content');
        if (bodyContent) {
            bodyContent.style.display = bodyContent.style.display === 'none' ? 'block' : 'none';
        }
    }

    function makeElementDraggable(elmnt, dragHandle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isDragging = false;
        let animationFrameId = null;

        const handle = dragHandle || elmnt;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) {
                return;
            }

            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;

            elmnt.style.right = 'auto';
            elmnt.classList.add('is-dragging');
            isDragging = true;

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();

            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            if (animationFrameId) return;

            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;
                if (!isDragging) return;

                let newTop = elmnt.offsetTop - pos2;
                let newLeft = elmnt.offsetLeft - pos1;

                const maxLeft = Math.max(10, window.innerWidth - elmnt.offsetWidth - 10);
                const maxTop = Math.max(10, window.innerHeight - 60);

                newLeft = Math.max(10, Math.min(newLeft, maxLeft));
                newTop = Math.max(10, Math.min(newTop, maxTop));

                elmnt.style.top = newTop + "px";
                elmnt.style.left = newLeft + "px";
            });
        }

        function closeDragElement() {
            isDragging = false;
            elmnt.classList.remove('is-dragging');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function showToast(message) {
        try {
            const toast = document.createElement('div');
            toast.className = 'geoinkwell-toast';
            toast.innerText = message;
            safeAppendToHead(toast);
            setTimeout(() => { try { toast.remove(); } catch (e) {} }, 2500);
        } catch (e) {}
    }

    let englishRegionNames = null;
    try {
        englishRegionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch (e) {}

    function getFlagEmoji(countryCode) {
        if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) return '🌐';
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        try {
            return String.fromCodePoint(...codePoints);
        } catch (e) {
            return '🌐';
        }
    }

    function getEnglishCountryName(code) {
        if (!code || typeof code !== 'string') return '';
        const clean = code.trim().toUpperCase();
        if (clean.length === 2 && englishRegionNames) {
            try {
                const name = englishRegionNames.of(clean);
                if (name && name !== clean) return name;
            } catch (e) {}
        }
        return '';
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

    function getHemisphereInfo(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
            return {
                label: '---',
                latHemi: '---',
                lngHemi: '---',
                quadrant: '---',
                sun: '---'
            };
        }
        const isNorth = lat >= 0;
        const isEast = lng >= 0;
        const latHemi = isNorth ? 'Northern' : 'Southern';
        const lngHemi = isEast ? 'Eastern' : 'Western';
        const quadrant = (isNorth ? 'N' : 'S') + (isEast ? 'E' : 'W');

        let sun = '';
        if (lat > 23.44) {
            sun = '☀️ South (Look S)';
        } else if (lat < -23.44) {
            sun = '☀️ North (Look N)';
        } else {
            sun = '☀️ Tropics (Overhead)';
        }

        return {
            label: `🌐 ${latHemi} (${quadrant})`,
            latHemi,
            lngHemi,
            quadrant,
            sun
        };
    }

    function getContinentFromCoords(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return 'Global';
        if (lat > 10 && lng >= -170 && lng <= -50) return 'North America';
        if (lat <= 12 && lat >= -60 && lng >= -90 && lng <= -30) return 'South America';
        if (lat >= 35 && lat <= 72 && lng >= -25 && lng <= 45) return 'Europe';
        if (lat >= 10 && lat <= 75 && lng >= 45 && lng <= 180) return 'Asia';
        if (lat >= -35 && lat <= 38 && lng >= -20 && lng <= 55) return 'Africa';
        if (lat <= -10 && lat >= -50 && lng >= 110 && lng <= 180) return 'Oceania';
        return 'Global';
    }

    function getCountryMeta(code, lat = null, lng = null) {
        const db = {
            'US': { name: 'United States', flag: '🇺🇸', continent: 'North America', region: 'Americas', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Outer', script: 'Latin', callingCode: '+1', tld: '.us', bollard: 'Yellow reflectors / Delineators', carMeta: 'Yellow Center Lines', cameraGen: 'Gen 3/4' },
            'CA': { name: 'Canada', flag: '🇨🇦', continent: 'North America', region: 'Americas', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Dashed', script: 'Latin', callingCode: '+1', tld: '.ca', bollard: 'Green/White delineators', carMeta: 'Bilingual Stop Signs / Trans-Canada', cameraGen: 'Gen 3/4' },
            'MX': { name: 'Mexico', flag: '🇲🇽', continent: 'North America', region: 'Central America', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+52', tld: '.mx', bollard: 'White post yellow top', carMeta: 'Octagonal Utility Poles / Cacti', cameraGen: 'Gen 3' },
            'GT': { name: 'Guatemala', flag: '🇬🇹', continent: 'North America', region: 'Central America', drivingSide: 'RIGHT', roadLines: 'White/Yellow Lines', script: 'Latin', callingCode: '+502', tld: '.gt', bollard: 'Concrete guide markers', carMeta: 'Roof Mirrors Visible on Car', cameraGen: 'Gen 3' },
            'CR': { name: 'Costa Rica', flag: '🇨🇷', continent: 'North America', region: 'Central America', drivingSide: 'RIGHT', roadLines: 'White/Yellow Lines', script: 'Latin', callingCode: '+506', tld: '.cr', bollard: 'Metal guard posts', carMeta: 'Lush Greenery / No Front Plates', cameraGen: 'Gen 3/4' },
            'PA': { name: 'Panama', flag: '🇵🇦', continent: 'North America', region: 'Central America', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+507', tld: '.pa', bollard: 'Metal posts', carMeta: 'Yellow Taxi Plates', cameraGen: 'Gen 3/4' },
            'DO': { name: 'Dominican Republic', flag: '🇩🇴', continent: 'North America', region: 'Caribbean', drivingSide: 'RIGHT', roadLines: 'White Lines', script: 'Latin', callingCode: '+1-809', tld: '.do', bollard: 'Concrete markers', carMeta: 'Yellow/White Plates / Palm Trees', cameraGen: 'Gen 3' },
            'PR': { name: 'Puerto Rico', flag: '🇵🇷', continent: 'North America', region: 'Caribbean', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+1-787', tld: '.pr', bollard: 'Yellow reflectors', carMeta: 'US Interstate Shields in Spanish', cameraGen: 'Gen 3' },
            'VI': { name: 'US Virgin Islands', flag: '🇻🇮', continent: 'North America', region: 'Caribbean', drivingSide: 'LEFT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+1-340', tld: '.vi', bollard: 'Delineators', carMeta: 'Drives on LEFT with US cars', cameraGen: 'Gen 3' },
            'BM': { name: 'Bermuda', flag: '🇧🇲', continent: 'North America', region: 'Atlantic', drivingSide: 'LEFT', roadLines: 'White Lines', script: 'Latin', callingCode: '+1-441', tld: '.bm', bollard: 'Stone walls', carMeta: 'Narrow roads / Left Drive', cameraGen: 'Gen 3' },
            'CW': { name: 'Curacao', flag: '🇨🇼', continent: 'North America', region: 'Caribbean', drivingSide: 'RIGHT', roadLines: 'White Lines', script: 'Latin', callingCode: '+599', tld: '.cw', bollard: 'Dutch markers', carMeta: 'Colorful Dutch Buildings / Cacti', cameraGen: 'Gen 3/4' },
            'GL': { name: 'Greenland', flag: '🇬🇱', continent: 'North America', region: 'Arctic', drivingSide: 'RIGHT', roadLines: 'Unpaved / No Markings', script: 'Latin', callingCode: '+299', tld: '.gl', bollard: 'Wood markers', carMeta: 'Colorful Wooden Houses / Fjords', cameraGen: 'Gen 3/4' },
            'BR': { name: 'Brazil', flag: '🇧🇷', continent: 'South America', region: 'Latin America', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Shoulder', script: 'Latin', callingCode: '+55', tld: '.com.br', bollard: 'Black/White guide post', carMeta: 'Back of Road Signs Black / Red Soil', cameraGen: 'Gen 3/4' },
            'AR': { name: 'Argentina', flag: '🇦🇷', continent: 'South America', region: 'Southern Cone', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Dashed', script: 'Latin', callingCode: '+54', tld: '.com.ar', bollard: 'White post black top orange dot', carMeta: 'Black Car Frame / Open Pampas / Black Plates', cameraGen: 'Gen 3/4' },
            'CL': { name: 'Chile', flag: '🇨🇱', continent: 'South America', region: 'Andes / Pacific', drivingSide: 'RIGHT', roadLines: 'White Solid / Yellow Center', script: 'Latin', callingCode: '+56', tld: '.cl', bollard: 'White post yellow reflector', carMeta: 'White Road Signs / Andes Peaks', cameraGen: 'Gen 3/4' },
            'CO': { name: 'Colombia', flag: '🇨🇴', continent: 'South America', region: 'Andes / Northern', drivingSide: 'RIGHT', roadLines: 'Yellow Center / Double Yellow', script: 'Latin', callingCode: '+57', tld: '.com.co', bollard: 'White post red band', carMeta: 'Yellow Commercial License Plates', cameraGen: 'Gen 3/4' },
            'PE': { name: 'Peru', flag: '🇵🇪', continent: 'South America', region: 'Andes / Pacific', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+51', tld: '.pe', bollard: 'White post black stripe', carMeta: 'Black/White Striped Pole Bases', cameraGen: 'Gen 3/4' },
            'UY': { name: 'Uruguay', flag: '🇺🇾', continent: 'South America', region: 'Southern Cone', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Dashed', script: 'Latin', callingCode: '+598', tld: '.uy', bollard: 'White post yellow reflector', carMeta: 'Rolling Green Pastures / Blue Plates', cameraGen: 'Gen 3/4' },
            'BO': { name: 'Bolivia', flag: '🇧🇴', continent: 'South America', region: 'Altiplano', drivingSide: 'RIGHT', roadLines: 'White/Yellow Lines', script: 'Latin', callingCode: '+591', tld: '.bo', bollard: 'Metal markers', carMeta: 'Dirt Roads / Indigenous Dress / Red Brick', cameraGen: 'Gen 3' },
            'EC': { name: 'Ecuador', flag: '🇪🇨', continent: 'South America', region: 'Andes / Equator', drivingSide: 'RIGHT', roadLines: 'Yellow Center / Chevron Signs', script: 'Latin', callingCode: '+593', tld: '.ec', bollard: 'White posts', carMeta: 'Yellow Chevron Arrows / Mountain Passes', cameraGen: 'Gen 3/4' },
            'GB': { name: 'United Kingdom', flag: '🇬🇧', continent: 'Europe', region: 'British Isles', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Kerb', script: 'Latin', callingCode: '+44', tld: '.co.uk', bollard: 'White cylinder red reflector', carMeta: 'Yellow Rear License Plates / Left Drive', cameraGen: 'Gen 3/4' },
            'UK': { name: 'United Kingdom', flag: '🇬🇧', continent: 'Europe', region: 'British Isles', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Kerb', script: 'Latin', callingCode: '+44', tld: '.co.uk', bollard: 'White cylinder red reflector', carMeta: 'Yellow Rear License Plates / Left Drive', cameraGen: 'Gen 3/4' },
            'IE': { name: 'Ireland', flag: '🇮🇪', continent: 'Europe', region: 'British Isles', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Shoulder', script: 'Latin', callingCode: '+353', tld: '.ie', bollard: 'Green/White bollard', carMeta: 'Yellow Dashed Shoulder Lines / Left Drive', cameraGen: 'Gen 3/4' },
            'FR': { name: 'France', flag: '🇫🇷', continent: 'Europe', region: 'Western Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center / Long Dashes', script: 'Latin', callingCode: '+33', tld: '.fr', bollard: 'White post red reflective band', carMeta: 'Blue EU License Band / D-Road Yellow Posts', cameraGen: 'Gen 3/4' },
            'DE': { name: 'Germany', flag: '🇩🇪', continent: 'Europe', region: 'Western Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+49', tld: '.de', bollard: 'Black cap two white dots', carMeta: 'Blurry Street View / Gen 2 Halo Blur', cameraGen: 'Gen 2/3/4' },
            'IT': { name: 'Italy', flag: '🇮🇹', continent: 'Europe', region: 'Southern Europe', drivingSide: 'RIGHT', roadLines: 'White Continuous / Dashed', script: 'Latin', callingCode: '+39', tld: '.it', bollard: 'Black top cap red reflector', carMeta: 'Small Front License Plates / Blue EU Bands Both Ends', cameraGen: 'Gen 3/4' },
            'ES': { name: 'Spain', flag: '🇪🇸', continent: 'Europe', region: 'Iberian Peninsula', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+34', tld: '.es', bollard: 'Black top cap white rectangle', carMeta: 'Yellow/Red Kilometer Posts / Wide Shoulders', cameraGen: 'Gen 3/4' },
            'PT': { name: 'Portugal', flag: '🇵🇹', continent: 'Europe', region: 'Iberian Peninsula', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+351', tld: '.pt', bollard: 'White post black band', carMeta: 'Yellow Right Side License Strip / Calcada Pavement', cameraGen: 'Gen 3/4' },
            'NL': { name: 'Netherlands', flag: '🇳🇱', continent: 'Europe', region: 'Western Europe', drivingSide: 'RIGHT', roadLines: 'White Continuous Outer / Red Asphalt', script: 'Latin', callingCode: '+31', tld: '.nl', bollard: 'Red/White reflector post', carMeta: 'Yellow License Plates Front/Back / Red Bike Lanes', cameraGen: 'Gen 3/4' },
            'BE': { name: 'Belgium', flag: '🇧🇪', continent: 'Europe', region: 'Western Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+32', tld: '.be', bollard: 'Red reflector cap', carMeta: 'Red Text License Plates / Orange Highway Lamps', cameraGen: 'Gen 3/4' },
            'CH': { name: 'Switzerland', flag: '🇨🇭', continent: 'Europe', region: 'Alpine Central', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+41', tld: '.ch', bollard: 'White post black slanted bar', carMeta: 'Low Camera Height / Small Front Plates / Alps', cameraGen: 'Low Cam (Gen 3/4)' },
            'AT': { name: 'Austria', flag: '🇦🇹', continent: 'Europe', region: 'Alpine Central', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+43', tld: '.at', bollard: 'Black top cap curved reflector', carMeta: 'Blue EU License Band / Coat of Arms Plates', cameraGen: 'Gen 3/4' },
            'SE': { name: 'Sweden', flag: '🇸🇪', continent: 'Europe', region: 'Nordic / Scandinavia', drivingSide: 'RIGHT', roadLines: 'White Dashed / Short Dashes (1m)', script: 'Latin', callingCode: '+46', tld: '.se', bollard: 'White post black top dot', carMeta: 'Side Marker Lights / Short Dashes / Pine Forests', cameraGen: 'Gen 3/4' },
            'NO': { name: 'Norway', flag: '🇳🇴', continent: 'Europe', region: 'Nordic / Scandinavia', drivingSide: 'RIGHT', roadLines: 'Solid Yellow Center Line', script: 'Latin', callingCode: '+47', tld: '.no', bollard: 'White post yellow reflector', carMeta: 'Green License Plates (EV/Vans) / Yellow Center Line / Fjords', cameraGen: 'Gen 3/4' },
            'FI': { name: 'Finland', flag: '🇫🇮', continent: 'Europe', region: 'Nordic / Scandinavia', drivingSide: 'RIGHT', roadLines: 'White Dashes / Yellow Center (Hist)', script: 'Latin', callingCode: '+358', tld: '.fi', bollard: 'White post with orange reflector', carMeta: 'Birch Trees / White & Orange Bollards', cameraGen: 'Gen 3/4' },
            'DK': { name: 'Denmark', flag: '🇩🇰', continent: 'Europe', region: 'Nordic / Scandinavia', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+45', tld: '.dk', bollard: 'Yellow reflector cap', carMeta: 'Yellow Commercial Plates / Red Mailboxes', cameraGen: 'Gen 3/4' },
            'IS': { name: 'Iceland', flag: '🇮🇸', continent: 'Europe', region: 'Nordic / Arctic', drivingSide: 'RIGHT', roadLines: 'Solid Yellow Side Markers', script: 'Latin', callingCode: '+354', tld: '.is', bollard: 'Yellow post diagonal cap', carMeta: 'Yellow Bollards / No Trees / Volcanic Terrain', cameraGen: 'Gen 3/4' },
            'FO': { name: 'Faroe Islands', flag: '🇫🇴', continent: 'Europe', region: 'Nordic / Atlantic', drivingSide: 'RIGHT', roadLines: 'White Dashed', script: 'Latin', callingCode: '+298', tld: '.fo', bollard: 'Wood guide posts', carMeta: 'Grass Roofs / Green Hills / No Trees', cameraGen: 'Gen 3/4' },
            'PL': { name: 'Poland', flag: '🇵🇱', continent: 'Europe', region: 'Eastern Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+48', tld: '.pl', bollard: 'Red band black rectangle', carMeta: 'Holey Concrete Utility Poles / Red/White Bollards', cameraGen: 'Gen 3/4' },
            'CZ': { name: 'Czech Republic', flag: '🇨🇿', continent: 'Europe', region: 'Central Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+420', tld: '.cz', bollard: 'White post two orange dots', carMeta: 'Blue EU License Band / Yellow Road Numbers', cameraGen: 'Gen 3/4' },
            'SK': { name: 'Slovakia', flag: '🇸🇰', continent: 'Europe', region: 'Central Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+421', tld: '.sk', bollard: 'White post orange reflector', carMeta: 'Blue EU License Band / Mountain Views', cameraGen: 'Gen 3/4' },
            'HU': { name: 'Hungary', flag: '🇭🇺', continent: 'Europe', region: 'Central Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+36', tld: '.hu', bollard: 'White post red band', carMeta: 'Distinct Hungarian Language / Utility Poles with Hole', cameraGen: 'Gen 3/4' },
            'RO': { name: 'Romania', flag: '🇷🇴', continent: 'Europe', region: 'Eastern Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+40', tld: '.ro', bollard: 'White post red reflector', carMeta: 'White/Red Curbs / Concrete Poles', cameraGen: 'Gen 3/4' },
            'BG': { name: 'Bulgaria', flag: '🇧🇬', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic', callingCode: '+359', tld: '.bg', bollard: 'White post red/white band', carMeta: 'Cyrillic Script / Winter Coverage (Bare Trees)', cameraGen: 'Gen 3/4' },
            'UA': { name: 'Ukraine', flag: '🇺🇦', continent: 'Europe', region: 'Eastern Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic', callingCode: '+380', tld: '.ua', bollard: 'Black bottom red top band', carMeta: 'Red/White Curb Stripes / Cyrillic Script', cameraGen: 'Gen 3/4' },
            'RU': { name: 'Russia', flag: '🇷🇺', continent: 'Europe', region: 'Northern Eurasia', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic', callingCode: '+7', tld: '.ru', bollard: 'Black base slanted black line', carMeta: 'Cyrillic Script / Blue Highway Signs / Long Antenna', cameraGen: 'Gen 3/4' },
            'GR': { name: 'Greece', flag: '🇬🇷', continent: 'Europe', region: 'Balkans / Aegean', drivingSide: 'RIGHT', roadLines: 'White Continuous / Dashed', script: 'Greek', callingCode: '+30', tld: '.gr', bollard: 'White post red reflector', carMeta: 'Greek Script / Olive Trees / Blue EU Plates', cameraGen: 'Gen 3/4' },
            'TR': { name: 'Turkey', flag: '🇹🇷', continent: 'Europe', region: 'Anatolia', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+90', tld: '.tr', bollard: 'White post red reflector', carMeta: 'Turkish Letters (g, s, i) / Red Crescent', cameraGen: 'Gen 3/4' },
            'HR': { name: 'Croatia', flag: '🇭🇷', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+385', tld: '.hr', bollard: 'Black top cap red reflector', carMeta: 'Blue EU License Band / Dalmatian Coast', cameraGen: 'Gen 3/4' },
            'SI': { name: 'Slovenia', flag: '🇸🇮', continent: 'Europe', region: 'Central / Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+386', tld: '.si', bollard: 'Red reflector post', carMeta: 'Green Alpine Hills / Blue EU Plates', cameraGen: 'Gen 3/4' },
            'RS': { name: 'Serbia', flag: '🇷🇸', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic / Latin', callingCode: '+381', tld: '.rs', bollard: 'White post red band', carMeta: 'Cyrillic and Latin Road Signs', cameraGen: 'Gen 3/4' },
            'BA': { name: 'Bosnia and Herzegovina', flag: '🇧🇦', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin / Cyrillic', callingCode: '+387', tld: '.ba', bollard: 'White post red band', carMeta: 'Yellow House Numbers / Minarets', cameraGen: 'Gen 3/4' },
            'ME': { name: 'Montenegro', flag: '🇲🇪', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin / Cyrillic', callingCode: '+382', tld: '.me', bollard: 'White post red reflector', carMeta: 'Mountain Canyons / Blue Coastline', cameraGen: 'Gen 3/4' },
            'AL': { name: 'Albania', flag: '🇦🇱', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+355', tld: '.al', bollard: 'White post red band', carMeta: 'Red License Plate Band (Left & Right)', cameraGen: 'Gen 3/4' },
            'MK': { name: 'North Macedonia', flag: '🇲🇰', continent: 'Europe', region: 'Balkans', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic', callingCode: '+389', tld: '.mk', bollard: 'White post red band', carMeta: 'Cyrillic Signs / Red Left Plate Stripe', cameraGen: 'Gen 3/4' },
            'EE': { name: 'Estonia', flag: '🇪🇪', continent: 'Europe', region: 'Baltic States', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+372', tld: '.ee', bollard: 'White post white reflector', carMeta: 'Blue EU License Band / Pine Forests', cameraGen: 'Gen 3/4' },
            'LV': { name: 'Latvia', flag: '🇱🇻', continent: 'Europe', region: 'Baltic States', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+371', tld: '.lv', bollard: 'White post red reflector', carMeta: 'Blue EU License Band / Long Macron Letters', cameraGen: 'Gen 3/4' },
            'LT': { name: 'Lithuania', flag: '🇱🇹', continent: 'Europe', region: 'Baltic States', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+370', tld: '.lt', bollard: 'White post red rectangle', carMeta: 'Blue EU License Band / Wooden Crosses', cameraGen: 'Gen 3/4' },
            'LU': { name: 'Luxembourg', flag: '🇱🇺', continent: 'Europe', region: 'Western Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+352', tld: '.lu', bollard: 'White post red reflector', carMeta: 'Yellow License Plates Front/Back', cameraGen: 'Gen 3/4' },
            'MC': { name: 'Monaco', flag: '🇲🇨', continent: 'Europe', region: 'Western Europe', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+377', tld: '.mc', bollard: 'Metal posts', carMeta: 'Dense Luxury High Rises / Blue Road Signs', cameraGen: 'Gen 3/4' },
            'AD': { name: 'Andorra', flag: '🇦🇩', continent: 'Europe', region: 'Pyrenees', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+376', tld: '.ad', bollard: 'White post red band', carMeta: 'Mountain Valleys / Catalan Signs', cameraGen: 'Gen 3/4' },
            'SM': { name: 'San Marino', flag: '🇸🇲', continent: 'Europe', region: 'Italian Peninsula', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+378', tld: '.sm', bollard: 'White post red cap', carMeta: 'Blue/White Coat of Arms / Mount Titano', cameraGen: 'Gen 3/4' },
            'MT': { name: 'Malta', flag: '🇲🇹', continent: 'Europe', region: 'Mediterranean', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Latin', callingCode: '+356', tld: '.mt', bollard: 'Stone walls', carMeta: 'Drives on LEFT / Limestone Buildings', cameraGen: 'Gen 3/4' },
            'CY': { name: 'Cyprus', flag: '🇨🇾', continent: 'Europe', region: 'Mediterranean', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Greek / English', callingCode: '+357', tld: '.cy', bollard: 'Delineators', carMeta: 'Drives on LEFT / Yellow Rear Plates / Greek', cameraGen: 'Gen 3/4' },
            'JP': { name: 'Japan', flag: '🇯🇵', continent: 'Asia', region: 'East Asia', drivingSide: 'LEFT', roadLines: 'White Dashed / Orange Center', script: 'Kanji / Kana', callingCode: '+81', tld: '.jp', bollard: 'White post red reflective tape', carMeta: 'Low Camera Height / Yellow Plates (Kei) / Left Drive', cameraGen: 'Low Cam (Gen 3/4)' },
            'KR': { name: 'South Korea', flag: '🇰🇷', continent: 'Asia', region: 'East Asia', drivingSide: 'RIGHT', roadLines: 'Yellow Center / Blue Bus Lanes', script: 'Hangul', callingCode: '+82', tld: '.kr', bollard: 'Yellow post yellow reflector', carMeta: 'Hangul Script / Yellow Commercial Plates / Blue Bus Lanes', cameraGen: 'Gen 3/4' },
            'TW': { name: 'Taiwan', flag: '🇹🇼', continent: 'Asia', region: 'East Asia', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Outer', script: 'Traditional Chinese', callingCode: '+886', tld: '.tw', bollard: 'Yellow/Black utility stripes', carMeta: 'Traditional Chinese / Scooter Waiting Boxes', cameraGen: 'Gen 3/4' },
            'HK': { name: 'Hong Kong', flag: '🇭🇰', continent: 'Asia', region: 'East Asia', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Zigzags', script: 'Chinese / English', callingCode: '+852', tld: '.hk', bollard: 'Metal barriers', carMeta: 'Yellow Rear Plates / Left Drive / English & Chinese', cameraGen: 'Gen 3/4' },
            'MN': { name: 'Mongolia', flag: '🇲🇳', continent: 'Asia', region: 'East Asia', drivingSide: 'RIGHT', roadLines: 'Dirt Tracks / No Markings', script: 'Cyrillic', callingCode: '+976', tld: '.mn', bollard: 'Red reflector post', carMeta: 'Roof Rack with Camping Gear / Open Steppe / Yurts', cameraGen: 'Gen 3 (Roof Rack)' },
            'TH': { name: 'Thailand', flag: '🇹🇭', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'LEFT', roadLines: 'Yellow Center / White Dashed', script: 'Thai', callingCode: '+66', tld: '.co.th', bollard: 'White cylinder black band', carMeta: 'Thai Script / Yellow Front Plates / Left Drive', cameraGen: 'Gen 3/4' },
            'MY': { name: 'Malaysia', flag: '🇲🇾', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'LEFT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+60', tld: '.my', bollard: 'White post red square', carMeta: 'Black License Plates / White Shoulder Curb / Left Drive', cameraGen: 'Gen 3/4' },
            'ID': { name: 'Indonesia', flag: '🇮🇩', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'LEFT', roadLines: 'White Dashed / Yellow Center', script: 'Latin', callingCode: '+62', tld: '.co.id', bollard: 'Black/White striped post', carMeta: 'Black Plates 3-Sections / Blue Mosque Roofs / Left Drive', cameraGen: 'Gen 3/4' },
            'PH': { name: 'Philippines', flag: '🇵🇭', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+63', tld: '.ph', bollard: 'White post yellow reflector', carMeta: 'Green License Plates / English Signs / Jeepneys', cameraGen: 'Gen 3/4' },
            'SG': { name: 'Singapore', flag: '🇸🇬', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'LEFT', roadLines: 'White Dashed Center', script: 'English / Chinese', callingCode: '+65', tld: '.sg', bollard: 'Curved reflective post', carMeta: 'Super Modern Infrastructure / Left Drive', cameraGen: 'Gen 3/4' },
            'VN': { name: 'Vietnam', flag: '🇻🇳', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'RIGHT', roadLines: 'Yellow Center / Solid Yellow', script: 'Latin (Diacritics)', callingCode: '+84', tld: '.vn', bollard: 'White post red top', carMeta: 'Abundant Motorbikes / Diacritics (o, u, d)', cameraGen: 'Gen 3/4' },
            'KH': { name: 'Cambodia', flag: '🇰🇭', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'RIGHT', roadLines: 'White/Yellow Lines', script: 'Khmer', callingCode: '+855', tld: '.kh', bollard: 'Concrete posts', carMeta: 'Khmer Script / Red Soil / Beer Billboards', cameraGen: 'Gen 3/4' },
            'LA': { name: 'Laos', flag: '🇱🇦', continent: 'Asia', region: 'Southeast Asia', drivingSide: 'RIGHT', roadLines: 'White/Yellow Lines', script: 'Lao', callingCode: '+856', tld: '.la', bollard: 'Metal posts', carMeta: 'Lao Script / Yellow License Plates', cameraGen: 'Gen 3/4' },
            'IN': { name: 'India', flag: '🇮🇳', continent: 'Asia', region: 'South Asia', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Devanagari / English', callingCode: '+91', tld: '.in', bollard: 'Black/White striped curbs', carMeta: 'Drives on LEFT / Tuk-tuks / Devanagari Signs', cameraGen: 'Gen 3/4' },
            'LK': { name: 'Sri Lanka', flag: '🇱🇰', continent: 'Asia', region: 'South Asia', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Sinhala / Tamil', callingCode: '+94', tld: '.lk', bollard: 'Concrete posts', carMeta: 'Low Camera Height / Sinhala & Tamil Script / Left Drive', cameraGen: 'Low Cam (Gen 3/4)' },
            'BD': { name: 'Bangladesh', flag: '🇧🇩', continent: 'Asia', region: 'South Asia', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Bengali', callingCode: '+880', tld: '.bd', bollard: 'Black/White striped posts', carMeta: 'Bengali Script / Green CNG Auto-rickshaws / Left Drive', cameraGen: 'Gen 3/4' },
            'BT': { name: 'Bhutan', flag: '🇧🇹', continent: 'Asia', region: 'South Asia', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Dzongkha', callingCode: '+975', tld: '.bt', bollard: 'Concrete painted posts', carMeta: 'Dzongkha Script / Himalayan Architecture / Red Plates', cameraGen: 'Gen 3/4' },
            'KZ': { name: 'Kazakhstan', flag: '🇰🇿', continent: 'Asia', region: 'Central Asia', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic', callingCode: '+7', tld: '.kz', bollard: 'White guide post black top', carMeta: 'Gen 4 Only / Long White Plates / Flat Steppe', cameraGen: 'Gen 4 Only' },
            'KG': { name: 'Kyrgyzstan', flag: '🇰🇬', continent: 'Asia', region: 'Central Asia', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Cyrillic', callingCode: '+996', tld: '.kg', bollard: 'White post red band', carMeta: 'Heavy Roof Rack / Red Left License Strip / Mountains', cameraGen: 'Gen 3 (Roof Rack)' },
            'IL': { name: 'Israel', flag: '🇮🇱', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Hebrew / Arabic', callingCode: '+972', tld: '.co.il', bollard: 'White post red triangle', carMeta: 'Yellow License Plates / Hebrew Script', cameraGen: 'Gen 3/4' },
            'AE': { name: 'United Arab Emirates', flag: '🇦🇪', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed / Yellow Outer', script: 'Arabic / English', callingCode: '+971', tld: '.ae', bollard: 'Reflective metal markers', carMeta: 'Modern Desert Freeways / Arabic & English', cameraGen: 'Gen 3/4' },
            'QA': { name: 'Qatar', flag: '🇶🇦', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed / Yellow Outer', script: 'Arabic / English', callingCode: '+974', tld: '.qa', bollard: 'Reflective markers', carMeta: 'Modern Urban Highways / Maroon License Plates', cameraGen: 'Gen 3/4' },
            'SA': { name: 'Saudi Arabia', flag: '🇸🇦', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic', callingCode: '+966', tld: '.sa', bollard: 'Yellow reflectors', carMeta: 'Arabic Freeways / Desert Dunes', cameraGen: 'Gen 3/4' },
            'OM': { name: 'Oman', flag: '🇴🇲', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed / Yellow Shoulder', script: 'Arabic / English', callingCode: '+968', tld: '.om', bollard: 'White post red band', carMeta: 'Mountain Ranges / Clean Roads / Yellow Taxi Roofs', cameraGen: 'Gen 3/4' },
            'KW': { name: 'Kuwait', flag: '🇰🇼', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic / English', callingCode: '+965', tld: '.kw', bollard: 'Metal guard posts', carMeta: 'Desert Freeways / Blue Highway Signs', cameraGen: 'Gen 3/4' },
            'BH': { name: 'Bahrain', flag: '🇧🇭', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic / English', callingCode: '+973', tld: '.bh', bollard: 'Reflective posts', carMeta: 'Causeway Bridges / Modern Buildings', cameraGen: 'Gen 3/4' },
            'JO': { name: 'Jordan', flag: '🇯🇴', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic / English', callingCode: '+962', tld: '.jo', bollard: 'Black/White striped curbs', carMeta: 'Black & White Curbs / Desert Landscape', cameraGen: 'Gen 3/4' },
            'LB': { name: 'Lebanon', flag: '🇱🇧', continent: 'Asia', region: 'Middle East', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic / French', callingCode: '+961', tld: '.lb', bollard: 'Concrete barriers', carMeta: 'Blue License Plates / Mediterranean Hills', cameraGen: 'Gen 3' },
            'ZA': { name: 'South Africa', flag: '🇿🇦', continent: 'Africa', region: 'Southern Africa', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Outer', script: 'Latin', callingCode: '+27', tld: '.co.za', bollard: 'White red/yellow strips', carMeta: 'Outer Metal Bars on Car / Yellow Outer Lines / Left Drive', cameraGen: 'Gen 3/4' },
            'BW': { name: 'Botswana', flag: '🇧🇼', continent: 'Africa', region: 'Southern Africa', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Outer', script: 'Latin', callingCode: '+267', tld: '.bw', bollard: 'Metal posts', carMeta: 'White Front & Blue Rear Plates / Dry Bushveld / Left Drive', cameraGen: 'Gen 3/4' },
            'SZ': { name: 'Eswatini', flag: '🇸🇿', continent: 'Africa', region: 'Southern Africa', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Latin', callingCode: '+268', tld: '.sz', bollard: 'White post red strip', carMeta: 'Lush Green Hills / Left Drive', cameraGen: 'Gen 3/4' },
            'LS': { name: 'Lesotho', flag: '🇱🇸', continent: 'Africa', region: 'Southern Africa', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Latin', callingCode: '+266', tld: '.ls', bollard: 'Stone road edges', carMeta: 'High Mountain Plateaus / Blankets / Left Drive', cameraGen: 'Gen 3/4' },
            'NA': { name: 'Namibia', flag: '🇳🇦', continent: 'Africa', region: 'Southern Africa', drivingSide: 'LEFT', roadLines: 'White/Yellow Lines', script: 'Latin', callingCode: '+264', tld: '.na', bollard: 'Metal markers', carMeta: 'Red Sand Dunes / Salt Roads / Left Drive', cameraGen: 'Gen 3/4' },
            'KE': { name: 'Kenya', flag: '🇰🇪', continent: 'Africa', region: 'East Africa', drivingSide: 'LEFT', roadLines: 'White Broken Center / Yellow Outer', script: 'Latin', callingCode: '+254', tld: '.co.ke', bollard: 'Red reflector on white post', carMeta: 'Snorkel on Front Right of Car / Left Drive', cameraGen: 'Gen 3 (Snorkel)' },
            'UG': { name: 'Uganda', flag: '🇺🇬', continent: 'Africa', region: 'East Africa', drivingSide: 'LEFT', roadLines: 'White Broken Center', script: 'Latin', callingCode: '+256', tld: '.ug', bollard: 'Concrete markers', carMeta: 'White Mirror Tops / Lush Greenery / Left Drive', cameraGen: 'Gen 3 (White Mirrors)' },
            'RW': { name: 'Rwanda', flag: '🇷🇼', continent: 'Africa', region: 'East Africa', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+250', tld: '.rw', bollard: 'Concrete posts', carMeta: 'Hilly Terraces / Clean Roads / Yellow Plate Strip', cameraGen: 'Gen 3/4' },
            'MG': { name: 'Madagascar', flag: '🇲🇬', continent: 'Africa', region: 'East Africa', drivingSide: 'RIGHT', roadLines: 'White/Yellow Lines', script: 'Latin', callingCode: '+261', tld: '.mg', bollard: 'Wood markers', carMeta: 'Red Earth / Baobabs / French Signs', cameraGen: 'Gen 3' },
            'GH': { name: 'Ghana', flag: '🇬🇭', continent: 'Africa', region: 'West Africa', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+233', tld: '.gh', bollard: 'Black cap yellow reflector', carMeta: 'Ghana Black Roof Tape on Front Right Rack', cameraGen: 'Gen 3 (Roof Tape)' },
            'NG': { name: 'Nigeria', flag: '🇳🇬', continent: 'Africa', region: 'West Africa', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+234', tld: '.ng', bollard: 'Black/White striped posts', carMeta: 'Police Follow Car Escort / Blue Light', cameraGen: 'Gen 3 (Follow Car)' },
            'SN': { name: 'Senegal', flag: '🇸🇳', continent: 'Africa', region: 'West Africa', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Latin', callingCode: '+221', tld: '.sn', bollard: 'Reflective markers', carMeta: 'Roof Rack with Black Cross-Strips / French Signs', cameraGen: 'Gen 3 (Roof Rack)' },
            'TN': { name: 'Tunisia', flag: '🇹🇳', continent: 'Africa', region: 'North Africa', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic / French', callingCode: '+216', tld: '.tn', bollard: 'Red top markers', carMeta: 'Black Plates with Arabic / Olive Groves', cameraGen: 'Gen 3/4' },
            'EG': { name: 'Egypt', flag: '🇪🇬', continent: 'Africa', region: 'North Africa', drivingSide: 'RIGHT', roadLines: 'White Dashed Center', script: 'Arabic', callingCode: '+20', tld: '.eg', bollard: 'White/Black markers', carMeta: 'Arabic Script / Blue License Plates', cameraGen: 'Gen 3/4' },
            'AU': { name: 'Australia', flag: '🇦🇺', continent: 'Oceania', region: 'Australasia', drivingSide: 'LEFT', roadLines: 'Broken White Center / Solid White Outer', script: 'Latin', callingCode: '+61', tld: '.com.au', bollard: 'White guide post red reflector', carMeta: 'Stobie Poles / Red Dirt / Left Drive', cameraGen: 'Gen 3/4' },
            'NZ': { name: 'New Zealand', flag: '🇳🇿', continent: 'Oceania', region: 'Australasia', drivingSide: 'LEFT', roadLines: 'Solid White Center / Broken White', script: 'Latin', callingCode: '+64', tld: '.co.nz', bollard: 'White post red band continuous', carMeta: 'White Center Lines / Lush Hills / Left Drive', cameraGen: 'Gen 3/4' },
            'GU': { name: 'Guam', flag: '🇬🇺', continent: 'Oceania', region: 'Micronesia', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+1-671', tld: '.gu', bollard: 'Metal posts', carMeta: 'US Road Signs / Tropical Pacific', cameraGen: 'Gen 3' },
            'MP': { name: 'Northern Mariana Islands', flag: '🇲🇵', continent: 'Oceania', region: 'Micronesia', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+1-670', tld: '.mp', bollard: 'Metal posts', carMeta: 'US Road Signs / Tropical Island', cameraGen: 'Gen 3' },
            'AS': { name: 'American Samoa', flag: '🇦🇸', continent: 'Oceania', region: 'Polynesia', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+1-684', tld: '.as', bollard: 'Wood posts', carMeta: 'US Signs / Tropical Volcanic Mountains', cameraGen: 'Gen 3' },
            'CX': { name: 'Christmas Island', flag: '🇨🇽', continent: 'Oceania', region: 'Indian Ocean', drivingSide: 'LEFT', roadLines: 'White Lines', script: 'Latin', callingCode: '+61', tld: '.cx', bollard: 'Metal posts', carMeta: 'Red Crabs / Left Drive / Australian Signs', cameraGen: 'Gen 3' },
            'CC': { name: 'Cocos Islands', flag: '🇨🇨', continent: 'Oceania', region: 'Indian Ocean', drivingSide: 'LEFT', roadLines: 'White Lines', script: 'Latin', callingCode: '+61', tld: '.cc', bollard: 'Metal posts', carMeta: 'Palm Trees / Coral Atolls / Left Drive', cameraGen: 'Gen 3' },
            'RE': { name: 'Reunion', flag: '🇷🇪', continent: 'Africa', region: 'Indian Ocean', drivingSide: 'RIGHT', roadLines: 'White Lines', script: 'Latin', callingCode: '+262', tld: '.re', bollard: 'French D-Road markers', carMeta: 'French Signs / Volcanic Peaks', cameraGen: 'Gen 3/4' }
        };

        let upper = (code || '').toUpperCase().trim();
        if ((!upper || upper === 'GLOBAL' || upper === 'GLOBAL TERRITORY') && typeof lat === 'number' && typeof lng === 'number') {
            const classified = lookupCountryByCoords(lat, lng);
            if (classified) upper = classified;
        }

        const fallbackContinent = (typeof lat === 'number' && typeof lng === 'number') ? getContinentFromCoords(lat, lng) : 'Global';
        const englishName = getEnglishCountryName(upper) || (db[upper] && db[upper].name) || (upper && upper !== 'GLOBAL' && upper !== 'GLOBAL TERRITORY' ? upper : 'Global Territory');
        const flag = (db[upper] && db[upper].flag && db[upper].flag !== '🌐') ? db[upper].flag : getFlagEmoji(upper);
        const entry = db[upper] || {};

        const continent = entry.continent || fallbackContinent;
        const region = entry.region || 'Global';
        const continentRegion = (continent && region && region !== 'Global') ? `${continent} (${region})` : continent;
        const drivingSide = entry.drivingSide || 'RIGHT';
        const roadLines = entry.roadLines || (drivingSide === 'LEFT' ? 'White Center / Outer Lines' : 'Standard Lines');
        const script = entry.script || 'Latin';
        const callingCode = entry.callingCode || '---';
        const scriptPhone = (script && callingCode && callingCode !== '---') ? `${script} (${callingCode})` : script;

        return {
            name: englishName,
            flag: flag,
            continent: continent,
            region: region,
            continentRegion: continentRegion,
            drivingSide: drivingSide,
            roadLines: roadLines,
            script: script,
            callingCode: callingCode,
            scriptPhone: scriptPhone,
            tld: entry.tld || (upper && upper !== 'GLOBAL' && upper !== 'GLOBAL TERRITORY' ? `.${upper.toLowerCase()}` : '.com'),
            bollard: entry.bollard || 'Standard Guide Post',
            carMeta: entry.carMeta || 'Standard Street View',
            cameraGen: entry.cameraGen || 'Gen 3/4'
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createHudOverlay);
    } else {
        createHudOverlay();
    }
})();
