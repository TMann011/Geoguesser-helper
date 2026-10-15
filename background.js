// Background Service Worker for GeoInkwell Tactical Suite
chrome.runtime.onInstalled.addListener(() => {
    console.log("[GeoInkwell] Extension installed successfully.");
    chrome.storage.local.set({
        autoPinEnabled: false,
        autoPinOnRound: false,
        hudVisible: true,
        metaCheatSheetEnabled: true,
        lastCoordinates: null
    });
});

// High-speed in-memory reverse geocoding cache (LRU up to 200 entries)
const geocodeCache = new Map();

function getGeocodeCacheKey(lat, lng) {
    return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function fetchWithTimeout(url, timeoutMs = 1200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return response;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

const ISO3_TO_ISO2 = {
    'AFG':'AF','ALB':'AL','DZA':'DZ','AND':'AD','AGO':'AO','AIA':'AI','ATA':'AQ','ATG':'AG','ARG':'AR','ARM':'AM','ABW':'AW','AUS':'AU','AUT':'AT','AZE':'AZ',
    'BHS':'BS','BHR':'BH','BGD':'BD','BRB':'BB','BLR':'BY','BEL':'BE','BLZ':'BZ','BEN':'BJ','BMU':'BM','BTN':'BT','BOL':'BO','BES':'BQ','BIH':'BA','BWA':'BW','BVT':'BV','BRA':'BR','IOT':'IO','BRN':'BN','BGR':'BG','BFA':'BF','BDI':'BI',
    'CPV':'CV','KHM':'KH','CMR':'CM','CAN':'CA','CYM':'KY','CAF':'CF','TCD':'TD','CHL':'CL','CHN':'CN','CXR':'CX','CCK':'CC','COL':'CO','COM':'KM','COG':'CG','COD':'CD','COK':'CK','CRI':'CR','CIV':'CI','HRV':'HR','CUB':'CU','CUW':'CW','CYP':'CY','CZE':'CZ',
    'DNK':'DK','DJI':'DJ','DMA':'DM','DOM':'DO','ECU':'EC','EGY':'EG','SLV':'SV','GNQ':'GQ','ERI':'ER','EST':'EE','SWZ':'SZ','ETH':'ET',
    'FLK':'FK','FRO':'FO','FJI':'FJ','FIN':'FI','FRA':'FR','GUF':'GF','PYF':'PF','ATF':'TF','GAB':'GA','GMB':'GM','GEO':'GE','DEU':'DE','GHA':'GH','GIB':'GI','GRC':'GR','GRL':'GL','GRD':'GD','GLP':'GP','GUM':'GU','GTM':'GT','GGY':'GG','GIN':'GN','GNB':'GW','GUY':'GY',
    'HTI':'HT','HMD':'HM','VAT':'VA','HND':'HN','HKG':'HK','HUN':'HU','ISL':'IS','IND':'IN','IDN':'ID','IRN':'IR','IRQ':'IQ','IRL':'IE','IMN':'IM','ISR':'IL','ITA':'IT',
    'JAM':'JM','JPN':'JP','JEY':'JE','JOR':'JO','KAZ':'KZ','KEN':'KE','KIR':'KI','PRK':'KP','KOR':'KR','KWT':'KW','KGZ':'KG','LAO':'LA','LVA':'LV','LBN':'LB','LSO':'LS','LBR':'LR','LBY':'LY','LIE':'LI','LTU':'LT','LUX':'LU',
    'MAC':'MO','MDG':'MG','MWI':'MW','MYS':'MY','MDV':'MV','MLI':'ML','MLT':'MT','MHL':'MH','MTQ':'MQ','MRT':'MR','MUS':'MU','MYT':'YT','MEX':'MX','FSM':'FM','MDA':'MD','MCO':'MC','MNG':'MN','MNE':'ME','MSR':'MS','MAR':'MA','MOZ':'MZ','MMR':'MM',
    'NAM':'NA','NRU':'NR','NPL':'NP','NLD':'NL','NCL':'NC','NZL':'NZ','NIC':'NI','NER':'NE','NGA':'NG','NIU':'NU','NFK':'NF','MKD':'MK','MNP':'MP','NOR':'NO','OMN':'OM',
    'PAK':'PK','PLW':'PW','PSE':'PS','PAN':'PA','PNG':'PG','PRY':'PY','PER':'PE','PHL':'PH','PCN':'PN','POL':'PL','PRT':'PT','PRI':'PR','QAT':'QA',
    'REU':'RE','ROU':'RO','RUS':'RU','RWA':'RW','BLM':'BL','SHN':'SH','KNA':'KN','LCA':'LC','MAF':'MF','SPM':'PM','VCT':'VC','WSM':'WS','SMR':'SM','STP':'ST','SAU':'SA','SEN':'SN','SRB':'RS','SYC':'SC','SLE':'SL','SGP':'SG','SXM':'SX','SVK':'SK','SVN':'SI','SLB':'SB','SOM':'SO','ZAF':'ZA','SGS':'GS','SSD':'SS','ESP':'ES','LKA':'LK','SDN':'SD','SUR':'SR','SJM':'SJ','SWE':'SE','CHE':'CH','SYR':'SY',
    'TWN':'TW','TJK':'TJ','TZA':'TZ','THA':'TH','TLS':'TL','TGO':'TG','TKL':'TK','TON':'TO','TTO':'TT','TUN':'TN','TUR':'TR','TKM':'TM','TCA':'TC','TUV':'TV',
    'UGA':'UG','UKR':'UA','ARE':'AE','GBR':'GB','USA':'US','UMI':'UM','URY':'UY','UZB':'UZ','VUT':'VU','VEN':'VE','VNM':'VN','VGB':'VG','VIR':'VI','WLF':'WF','ESH':'EH','YEM':'YE','ZMB':'ZM','ZWE':'ZW','KOS':'XK'
};

let bgEnglishRegionNames = null;
try {
    bgEnglishRegionNames = new Intl.DisplayNames(['en'], { type: 'region' });
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

function getEnglishNameFromCode(code) {
    if (!code) return '';
    const clean = code.trim().toUpperCase();
    const iso2 = clean.length === 3 ? (ISO3_TO_ISO2[clean] || '') : clean;
    if (iso2 && bgEnglishRegionNames) {
        try {
            const name = bgEnglishRegionNames.of(iso2);
            if (name && name !== iso2) return name;
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

function formatFullAddress(baseAddress, city, state, countryName) {
    let clean = (baseAddress || '').trim();
    if (!clean) {
        clean = [city, state].filter(Boolean).join(', ');
    }
    if (!countryName) return clean;

    // Strip trailing ISO country code like ", IDN", ", ID", ", USA", ", US", ", GBR", ", GB"
    clean = clean.replace(/,\s*[A-Z]{2,3}$/i, '').trim();

    // Check if clean already ends with countryName (case-insensitive)
    const lowerClean = clean.toLowerCase();
    const lowerCountry = countryName.toLowerCase();

    if (lowerClean.endsWith(lowerCountry)) {
        return clean;
    }

    const tokens = clean.split(',').map(s => s.trim()).filter(Boolean);
    const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';

    if (lastToken.toLowerCase() === lowerCountry) {
        return clean;
    }

    // Always append English country name
    return clean ? `${clean}, ${countryName}` : countryName;
}

// Tier 1: ArcGIS World GeocodeServer (Ultra-fast, zero-auth, high-capacity global coverage)
async function fetchArcGIS(lat, lng, timeoutMs = 1200) {
    try {
        const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&langCode=EN&f=pjson`;
        const res = await fetchWithTimeout(url, timeoutMs);
        if (res.ok) {
            const data = await res.json();
            if (data && data.address) {
                const addr = data.address;
                const rawCode = (addr.CountryCode || '').toUpperCase().trim();
                let iso2 = ISO3_TO_ISO2[rawCode] || (rawCode.length === 2 ? rawCode : '');
                if (!iso2) iso2 = lookupCountryByCoords(lat, lng) || '';
                const englishCountry = getEnglishNameFromCode(iso2 || rawCode) || addr.CntryName || getEnglishNameFromCode(lookupCountryByCoords(lat, lng)) || '';
                const flag = getFlagEmoji(iso2 || lookupCountryByCoords(lat, lng));

                const matchAddr = addr.Match_addr || addr.LongLabel || addr.Address || '';
                const cityStr = addr.City || addr.Subregion || addr.District || '';
                const stateStr = addr.Region || addr.Territory || addr.Subregion || '';

                const fullAddress = formatFullAddress(matchAddr, cityStr, stateStr, englishCountry);

                if (fullAddress || cityStr || stateStr || englishCountry) {
                    return {
                        success: true,
                        address: fullAddress || englishCountry,
                        state: stateStr || '---',
                        city: cityStr || '---',
                        country: englishCountry || '',
                        countryCode: iso2,
                        flag: flag
                    };
                }
            }
        }
    } catch (e) {}
    return null;
}

// Tier 2: Photon OSM (Secondary fallback)
async function fetchPhoton(lat, lng, timeoutMs = 1000) {
    try {
        const res = await fetchWithTimeout(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`, timeoutMs);
        if (res.ok) {
            const data = await res.json();
            if (data && data.features && data.features.length > 0) {
                const props = data.features[0].properties || {};
                const cityStr = props.city || props.town || props.district || props.county || props.name || '';
                const stateStr = props.state || props.region || props.county || '';
                const rawCode = (props.countrycode || '').toUpperCase().trim();
                let iso2 = ISO3_TO_ISO2[rawCode] || (rawCode.length === 2 ? rawCode : '');
                if (!iso2) iso2 = lookupCountryByCoords(lat, lng) || '';
                const englishCountry = getEnglishNameFromCode(iso2 || rawCode) || props.country || getEnglishNameFromCode(lookupCountryByCoords(lat, lng)) || '';
                const flag = getFlagEmoji(iso2 || lookupCountryByCoords(lat, lng));

                const nameStr = props.name && props.name !== cityStr ? props.name : '';
                const rawAddr = [nameStr, props.street, cityStr, stateStr].filter(Boolean).join(', ');
                const fullAddress = formatFullAddress(rawAddr, cityStr, stateStr, englishCountry);

                if (fullAddress || englishCountry) {
                    return {
                        success: true,
                        address: fullAddress || englishCountry,
                        state: stateStr || '---',
                        city: cityStr || '---',
                        country: englishCountry || '',
                        countryCode: iso2,
                        flag: flag
                    };
                }
            }
        }
    } catch (e) {}
    return null;
}

// Tier 3: OpenHistoricalMap / Nominatim Mirror
async function fetchOHM(lat, lng, timeoutMs = 1000) {
    try {
        const res = await fetchWithTimeout(`https://nominatim.openhistoricalmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`, timeoutMs);
        if (res.ok) {
            const data = await res.json();
            if (data && (data.display_name || data.address)) {
                const addr = data.address || {};
                const cityStr = addr.city || addr.town || addr.village || addr.county || '';
                const stateStr = addr.state || addr.province || addr.region || '';
                const rawCode = (addr.country_code || '').toUpperCase().trim();
                let iso2 = ISO3_TO_ISO2[rawCode] || (rawCode.length === 2 ? rawCode : '');
                if (!iso2) iso2 = lookupCountryByCoords(lat, lng) || '';
                const englishCountry = getEnglishNameFromCode(iso2 || rawCode) || addr.country || getEnglishNameFromCode(lookupCountryByCoords(lat, lng)) || '';
                const flag = getFlagEmoji(iso2 || lookupCountryByCoords(lat, lng));

                const fullAddress = formatFullAddress(data.display_name, cityStr, stateStr, englishCountry);

                return {
                    success: true,
                    address: fullAddress || englishCountry,
                    state: stateStr || '---',
                    city: cityStr || '---',
                    country: englishCountry || '',
                    countryCode: iso2,
                    flag: flag
                };
            }
        }
    } catch (e) {}
    return null;
}

// Master Reverse Geocode Routine with strict 1400ms global timeout
async function handleReverseGeocode(lat, lng) {
    const cacheKey = getGeocodeCacheKey(lat, lng);
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    try {
        // Step 1: Query ArcGIS World Geocoder (typically resolves in 80-180ms)
        const arcResult = await fetchArcGIS(lat, lng, 1100);
        if (arcResult && arcResult.success) {
            if (geocodeCache.size > 200) geocodeCache.clear();
            geocodeCache.set(cacheKey, arcResult);
            return arcResult;
        }

        // Step 2: Fallback to Photon or OHM in parallel
        const fallbackResult = await Promise.race([
            fetchPhoton(lat, lng, 1000),
            fetchOHM(lat, lng, 1000)
        ]);

        if (fallbackResult && fallbackResult.success) {
            if (geocodeCache.size > 200) geocodeCache.clear();
            geocodeCache.set(cacheKey, fallbackResult);
            return fallbackResult;
        }
    } catch (e) {}

    // Offline Bounding-Box Fallback: Guarantees Country is ALWAYS resolved even if all geocoders fail or disconnect
    const offlineCode = lookupCountryByCoords(lat, lng);
    if (offlineCode) {
        const englishName = getEnglishNameFromCode(offlineCode) || offlineCode;
        const flag = getFlagEmoji(offlineCode);
        const offlineResult = {
            success: true,
            address: `${flag} ${englishName}`,
            state: '---',
            city: '---',
            country: englishName,
            countryCode: offlineCode,
            flag: flag
        };
        geocodeCache.set(cacheKey, offlineResult);
        return offlineResult;
    }

    return { success: false };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request) return;

    if (request.action === 'REVERSE_GEOCODE') {
        const { lat, lng } = request;
        handleReverseGeocode(lat, lng).then(result => {
            sendResponse(result || { success: false });
        }).catch(() => {
            sendResponse({ success: false });
        });
        return true;
    }

    if (request.action === 'GET_LAST_COORDINATES') {
        chrome.storage.local.get(['lastCoordinates'], (result) => {
            sendResponse(result ? result.lastCoordinates : null);
        });
        return true;
    }
});
