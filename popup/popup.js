document.addEventListener('DOMContentLoaded', () => {
    let currentCoords = null;
    let currentAddressInfo = null;
    let currentRound = 1;
    let isLegitMode = false;

    // Full Country Meta Database matching content.js engine
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

    // Full Country Meta Database matching content.js engine
    const countryDb = {
        'US': { name: 'United States', flag: '🇺🇸', continent: 'North America', region: 'Americas', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Outer', script: 'Latin', callingCode: '+1', tld: '.us', bollard: 'Yellow reflectors / Delineators', carMeta: 'Yellow Center Lines', cameraGen: 'Gen 3/4' },
        'CA': { name: 'Canada', flag: '🇨🇦', continent: 'North America', region: 'Americas', drivingSide: 'RIGHT', roadLines: 'Yellow Center / White Dashed', script: 'Latin', callingCode: '+1', tld: '.ca', bollard: 'Green/White delineators', carMeta: 'Bilingual Stop Signs / Trans-Canada', cameraGen: 'Gen 3/4' },
        'MX': { name: 'Mexico', flag: '🇲🇽', continent: 'North America', region: 'Central America', drivingSide: 'RIGHT', roadLines: 'Yellow Center Line', script: 'Latin', callingCode: '+52', tld: '.mx', bollard: 'White square post red dot', carMeta: 'Octagonal Utility Poles / Cacti', cameraGen: 'Gen 3' },
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

    function getCountryMeta(code, lat = null, lng = null) {
        let upper = (code || '').toUpperCase().trim();
        if ((!upper || upper === 'GLOBAL' || upper === 'GLOBAL TERRITORY') && typeof lat === 'number' && typeof lng === 'number') {
            const classified = lookupCountryByCoords(lat, lng);
            if (classified) upper = classified;
        }

        const fallbackContinent = (typeof lat === 'number' && typeof lng === 'number') ? getContinentFromCoords(lat, lng) : 'Global';
        const englishName = getEnglishCountryName(upper) || (countryDb[upper] && countryDb[upper].name) || (upper && upper !== 'GLOBAL' && upper !== 'GLOBAL TERRITORY' ? upper : 'Global Territory');
        const flag = (countryDb[upper] && countryDb[upper].flag && countryDb[upper].flag !== '🌐') ? countryDb[upper].flag : getFlagEmoji(upper);
        const entry = countryDb[upper] || {};

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

    const metaData = [
        { country: 'Ghana 🇬🇭', detail: 'Black roof tape on car rack' },
        { country: 'Kenya 🇰🇪', detail: 'Snorkel on front right of car' },
        { country: 'Nigeria 🇳🇬', detail: 'Police escort vehicle behind/front' },
        { country: 'Mongolia 🇲🇳', detail: 'Camping gear / Bars on car' },
        { country: 'Kyrgyzstan 🇰🇬', detail: 'Heavy roof rack / Red plates' },
        { country: 'South Africa 🇿🇦', detail: 'Outer bars / Red soil / Left drive' },
        { country: 'Japan 🇯🇵', detail: 'Low camera height / Yellow plates' },
        { country: 'Switzerland 🇨🇭', detail: 'Low camera / Small front plates' },
        { country: 'Iceland 🇮🇸', detail: 'Yellow bollards / No trees / Barren' },
        { country: 'Australia 🇦🇺', detail: 'Stobie poles / Red soil / Left drive' },
        { country: 'Israel 🇮🇱', detail: 'Yellow license plates / Hebrew script' },
        { country: 'Thailand 🇹🇭', detail: 'Yellow front plates / Thai script' },
        { country: 'Guatemala 🇬🇹', detail: 'Side mirrors visible on car' },
        { country: 'Senegal 🇸🇳', detail: 'Roof rack with black strips' },
        { country: 'Uganda 🇺🇬', detail: 'White side mirrors / Lush green' },
        { country: 'Colombia 🇨🇴', detail: 'Yellow commercial plates' },
        { country: 'Norway 🇳🇴', detail: 'Green license plates on vans/commercial' },
        { country: 'Denmark 🇩🇰', detail: 'Yellow commercial front/rear plates' },
        { country: 'Netherlands 🇳🇱', detail: 'Yellow plates front & rear' },
        { country: 'United Kingdom 🇬🇧', detail: 'Yellow rear plates / White front' },
        { country: 'Sweden 🇸🇪', detail: 'Side marker lights on car' }
    ];

    renderMetaList(metaData);

    document.getElementById('meta-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = metaData.filter(m => m.country.toLowerCase().includes(query) || m.detail.toLowerCase().includes(query));
        renderMetaList(filtered);
    });

    function renderMetaList(items) {
        const listEl = document.getElementById('meta-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'meta-item';
            div.innerHTML = `<span class="country">${item.country}</span> <span class="detail">${item.detail}</span>`;
            listEl.appendChild(div);
        });
    }

    function sendToActiveTab(message, callback) {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, message, (res) => {
                        if (chrome.runtime.lastError) {}
                        if (typeof callback === 'function') callback(res);
                    });
                } else if (typeof callback === 'function') {
                    callback(null);
                }
            });
        } catch (e) {
            if (typeof callback === 'function') callback(null);
        }
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

    function updatePopupDisplay(coords, addressInfo, roundNumber) {
        if (roundNumber) {
            currentRound = roundNumber;
            const roundPill = document.getElementById('popup-round-pill');
            if (roundPill) roundPill.innerText = `ROUND #${currentRound}`;
        }

        const coordsEl = document.getElementById('popup-coords');
        const countryEl = document.getElementById('popup-country');
        const hemiEl = document.getElementById('popup-hemisphere');
        const sunEl = document.getElementById('popup-sun');
        const continentEl = document.getElementById('popup-continent');
        const scriptEl = document.getElementById('popup-script');
        const roadLinesEl = document.getElementById('popup-roadlines');
        const cameraEl = document.getElementById('popup-camera');
        const stateEl = document.getElementById('popup-state');
        const cityEl = document.getElementById('popup-city');
        const drivingEl = document.getElementById('popup-driving');
        const bollardEl = document.getElementById('popup-bollard');
        const carEl = document.getElementById('popup-car');
        const tldEl = document.getElementById('popup-tld');
        const addressEl = document.getElementById('popup-address');
        const gmapsLink = document.getElementById('popup-link-gmaps');

        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
            if (addressEl) addressEl.innerText = "Waiting for game round...";
            if (coordsEl) coordsEl.innerText = "0.000000, 0.000000";
            if (hemiEl) hemiEl.innerText = "---";
            if (sunEl) sunEl.innerText = "---";
            if (continentEl) continentEl.innerText = "---";
            if (scriptEl) scriptEl.innerText = "---";
            if (roadLinesEl) roadLinesEl.innerText = "---";
            if (cameraEl) cameraEl.innerText = "---";
            if (stateEl) stateEl.innerText = "---";
            if (cityEl) cityEl.innerText = "---";
            if (countryEl) countryEl.innerText = "---";
            if (drivingEl) drivingEl.innerText = "---";
            if (bollardEl) bollardEl.innerText = "---";
            if (carEl) carEl.innerText = "---";
            if (tldEl) tldEl.innerText = "---";
            return;
        }

        currentCoords = coords;
        if (coords.roundNumber) {
            currentRound = coords.roundNumber;
            const roundPill = document.getElementById('popup-round-pill');
            if (roundPill) roundPill.innerText = `ROUND #${currentRound}`;
        }

        if (coordsEl) coordsEl.innerText = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        if (gmapsLink) gmapsLink.href = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;

        const hemiInfo = getHemisphereInfo(coords.lat, coords.lng);
        if (hemiEl) hemiEl.innerText = hemiInfo.label;
        if (sunEl) sunEl.innerText = hemiInfo.sun;

        if (addressInfo) {
            currentAddressInfo = addressInfo;
        } else if (currentAddressInfo) {
            addressInfo = currentAddressInfo;
        }

        const effectiveCode = (coords && coords.countryCode) || (addressInfo && addressInfo.countryCode) || (coords && lookupCountryByCoords(coords.lat, coords.lng)) || '';
        const meta = getCountryMeta(effectiveCode, coords ? coords.lat : null, coords ? coords.lng : null);

        if (continentEl) continentEl.innerText = meta.continentRegion;
        if (scriptEl) scriptEl.innerText = meta.scriptPhone;
        if (roadLinesEl) roadLinesEl.innerText = meta.roadLines;
        if (cameraEl) cameraEl.innerText = meta.cameraGen;

        let displayCountry = '';
        let displayFlag = '';
        if (addressInfo && addressInfo.country && addressInfo.country !== '---' && !addressInfo.country.includes('Global')) {
            displayCountry = addressInfo.country;
            displayFlag = addressInfo.flag || (meta.flag !== '🌐' ? meta.flag : '');
        } else if (meta.name && meta.name !== 'Global' && meta.name !== 'Global Territory') {
            displayCountry = meta.name;
            displayFlag = meta.flag;
        }

        if (countryEl) {
            if (displayCountry) {
                countryEl.innerText = (displayFlag && displayFlag !== '🌐') ? `${displayFlag} ${displayCountry}` : displayCountry;
            } else {
                countryEl.innerText = `${meta.flag} ${meta.name}`;
            }
        }

        if (drivingEl) drivingEl.innerText = meta.drivingSide;
        if (bollardEl) bollardEl.innerText = meta.bollard;
        if (carEl) carEl.innerText = meta.carMeta;
        if (tldEl) tldEl.innerText = meta.tld;

        const effectiveCountryLabel = displayCountry || meta.name;
        const effectiveFlagLabel = (displayFlag && displayFlag !== '🌐') ? displayFlag : meta.flag;
        const fallback = `${effectiveFlagLabel} ${effectiveCountryLabel} [${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]`;
        const baselineState = (addressInfo && addressInfo.state) || effectiveCountryLabel || '---';
        const baselineCity = (addressInfo && addressInfo.city) || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;

        if (addressInfo && addressInfo.address) {
            const addrText = ensureAddressHasCountry(addressInfo.address, effectiveCountryLabel, effectiveFlagLabel);
            if (addressEl) addressEl.innerText = addrText;
            if (stateEl) stateEl.innerText = addressInfo.state || baselineState;
            if (cityEl) cityEl.innerText = addressInfo.city || baselineCity;
        } else {
            // INSTANT ZERO-WAIT PRESENTATION: Never block or hide location behind resolving text
            if (addressEl) addressEl.innerText = fallback;
            if (stateEl) stateEl.innerText = baselineState;
            if (cityEl) cityEl.innerText = baselineCity;
        }
    }

    // Load initial settings and data from storage
    chrome.storage.local.get([
        'lastCoordinates', 'lastAddressInfo', 'currentActiveRound', 
        'autoPinOnRound', 'autoPinEnabled', 'autoPinDelay', 
        'autoCenterMapOnRound', 'isLegitMode', 'inputCoins', 'inputLevel', 'selectTitle', 'selectDivision'
    ], (res) => {
        if (res) {
            const chkAutoCenter = document.getElementById('chk-popup-autocenter');
            const btnMode = document.getElementById('popup-btn-mode-toggle');

            if (chkAutoCenter && typeof res.autoCenterMapOnRound === 'boolean') chkAutoCenter.checked = res.autoCenterMapOnRound;

            if (typeof res.isLegitMode === 'boolean') {
                isLegitMode = res.isLegitMode;
                if (btnMode) btnMode.innerText = isLegitMode ? 'MODE: LEGIT PRACTICE' : 'MODE: FULL TACTICAL';
            }

            if (res.autoPinDelayMs !== undefined) {
                const selDelay = document.getElementById('sel-popup-autopin-delay');
                if (selDelay) selDelay.value = String(res.autoPinDelayMs);
            }

            if (res.inputCoins) document.getElementById('input-coins').value = res.inputCoins;
            if (res.inputLevel) document.getElementById('input-level').value = res.inputLevel;
            if (res.selectTitle) document.getElementById('select-title').value = res.selectTitle;
            if (res.selectDivision) document.getElementById('select-division').value = res.selectDivision;

            updatePopupDisplay(res.lastCoordinates, res.lastAddressInfo, res.currentActiveRound);
        }
    });

    // Query active tab directly for live synchronization
    sendToActiveTab({ action: 'GET_STATE' }, (tabState) => {
        if (tabState) {
            if (typeof tabState.currentActiveRound === 'number') currentRound = tabState.currentActiveRound;
            if (typeof tabState.isLegitMode === 'boolean') {
                isLegitMode = tabState.isLegitMode;
                const btnMode = document.getElementById('popup-btn-mode-toggle');
                if (btnMode) btnMode.innerText = isLegitMode ? 'MODE: LEGIT PRACTICE' : 'MODE: FULL TACTICAL';
            }
            const chkAutoCenter = document.getElementById('chk-popup-autocenter');
            if (chkAutoCenter && typeof tabState.autoCenterMapOnRound === 'boolean') chkAutoCenter.checked = tabState.autoCenterMapOnRound;

            if (tabState.autoPinDelayMs !== undefined) {
                const selDelay = document.getElementById('sel-popup-autopin-delay');
                if (selDelay) selDelay.value = String(tabState.autoPinDelayMs);
            }

            updatePopupDisplay(tabState.currentCoordinates, tabState.lastAddressInfo, tabState.currentActiveRound);
        }
    });

    // Real-Time Live Storage Observer (Updates popup automatically if rounds or coordinates advance)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        let coords = currentCoords;
        let addrInfo = currentAddressInfo;
        let rNum = currentRound;

        if (changes.lastCoordinates) coords = changes.lastCoordinates.newValue;
        if (changes.lastAddressInfo) addrInfo = changes.lastAddressInfo.newValue;
        if (changes.currentActiveRound) rNum = changes.currentActiveRound.newValue;

        if (changes.autoCenterMapOnRound) {
            const chk = document.getElementById('chk-popup-autocenter');
            if (chk) chk.checked = !!changes.autoCenterMapOnRound.newValue;
        }
        if (changes.isLegitMode) {
            isLegitMode = !!changes.isLegitMode.newValue;
            const btnMode = document.getElementById('popup-btn-mode-toggle');
            if (btnMode) btnMode.innerText = isLegitMode ? 'MODE: LEGIT PRACTICE' : 'MODE: FULL TACTICAL';
        }
        if (changes.autoPinDelayMs) {
            const selDelay = document.getElementById('sel-popup-autopin-delay');
            if (selDelay) selDelay.value = String(changes.autoPinDelayMs.newValue);
        }

        if (changes.lastCoordinates || changes.lastAddressInfo || changes.currentActiveRound) {
            updatePopupDisplay(coords, addrInfo, rNum);
        }
    });

    // Control Event Listeners
    document.getElementById('popup-btn-rescan').addEventListener('click', () => {
        sendToActiveTab({ action: 'TRIGGER_RESCAN' });
        const addrEl = document.getElementById('popup-address');
        if (addrEl) addrEl.innerText = "Rescanning active round location...";
    });

    // 9-Tier Guess Actions
    const btnAutoPin = document.getElementById('popup-btn-autopin');
    if (btnAutoPin) {
        btnAutoPin.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: '5k', stealth: false });
        });
    }

    const precisionBtn = document.getElementById('popup-btn-precisionpin');
    if (precisionBtn) {
        precisionBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'precision', stealth: true });
        });
    }

    const masterBtn = document.getElementById('popup-btn-masterpin') || document.getElementById('popup-btn-stealthpin');
    if (masterBtn) {
        masterBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'master', stealth: true });
        });
    }

    const goldBtn = document.getElementById('popup-btn-goldpin');
    if (goldBtn) {
        goldBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'gold', stealth: true });
        });
    }

    const proBtn = document.getElementById('popup-btn-propin');
    if (proBtn) {
        proBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'pro', stealth: true });
        });
    }

    const silverBtn = document.getElementById('popup-btn-silverpin');
    if (silverBtn) {
        silverBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'silver', stealth: true });
        });
    }

    const regionBtn = document.getElementById('popup-btn-regionpin');
    if (regionBtn) {
        regionBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'regional', stealth: true });
        });
    }

    const casualBtn = document.getElementById('popup-btn-casualpin');
    if (casualBtn) {
        casualBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'casual', stealth: true });
        });
    }

    const countryBtn = document.getElementById('popup-btn-countrypin');
    if (countryBtn) {
        countryBtn.addEventListener('click', () => {
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: 'country', stealth: true });
        });
    }

    // Custom Plonk Offset Button
    const customPinBtn = document.getElementById('popup-btn-custom-pin');
    if (customPinBtn) {
        customPinBtn.addEventListener('click', () => {
            const selectEl = document.getElementById('popup-custom-offset-amount');
            const distMeters = selectEl ? parseInt(selectEl.value, 10) : 0;
            sendToActiveTab({ action: 'TRIGGER_AUTOPIN', tier: distMeters, stealth: distMeters > 0 });
        });
    }

    document.getElementById('popup-btn-center-map').addEventListener('click', () => {
        sendToActiveTab({ action: 'TRIGGER_CENTER_MAP' });
    });

    document.getElementById('popup-btn-copy').addEventListener('click', () => {
        if (currentCoords && typeof currentCoords.lat === 'number' && typeof currentCoords.lng === 'number') {
            const text = `${currentCoords.lat}, ${currentCoords.lng}`;
            navigator.clipboard.writeText(text);
            alert("Coordinates copied to clipboard!");
        } else {
            alert("No active round coordinates found yet.");
        }
    });

    // Settings listeners
    document.getElementById('chk-popup-autocenter').addEventListener('change', (e) => {
        const val = e.target.checked;
        chrome.storage.local.set({ autoCenterMapOnRound: val });
        sendToActiveTab({ action: 'UPDATE_SETTINGS', autoCenterMapOnRound: val });
    });

    const selPopupDelay = document.getElementById('sel-popup-autopin-delay');
    if (selPopupDelay) {
        selPopupDelay.addEventListener('change', (e) => {
            const delayVal = parseInt(e.target.value, 10);
            chrome.storage.local.set({ autoPinDelayMs: delayVal });
            sendToActiveTab({ action: 'UPDATE_SETTINGS', autoPinDelayMs: delayVal });
        });
    }

    document.getElementById('popup-btn-mode-toggle').addEventListener('click', () => {
        isLegitMode = !isLegitMode;
        const btnMode = document.getElementById('popup-btn-mode-toggle');
        if (btnMode) btnMode.innerText = isLegitMode ? 'MODE: LEGIT PRACTICE' : 'MODE: FULL TACTICAL';
        chrome.storage.local.set({ isLegitMode });
        sendToActiveTab({ action: 'UPDATE_SETTINGS', isLegitMode });
    });

    // Preset Chip Buttons for Coins and Level
    document.querySelectorAll('.btn-chip[data-coins]').forEach(btn => {
        btn.addEventListener('click', () => {
            const coins = parseInt(btn.getAttribute('data-coins'), 10);
            const input = document.getElementById('input-coins');
            if (input) input.value = coins;
            chrome.storage.local.set({ inputCoins: coins });
        });
    });

    document.querySelectorAll('.btn-chip[data-level]').forEach(btn => {
        btn.addEventListener('click', () => {
            const lvl = parseInt(btn.getAttribute('data-level'), 10);
            const input = document.getElementById('input-level');
            if (input) input.value = lvl;
            chrome.storage.local.set({ inputLevel: lvl });
        });
    });

    // Apply Cosmetics Listener
    document.getElementById('btn-apply-cosmetics').addEventListener('click', () => {
        const coins = parseInt(document.getElementById('input-coins').value, 10) || 999999;
        const level = parseInt(document.getElementById('input-level').value, 10) || 100;
        const title = document.getElementById('select-title').value;
        const division = document.getElementById('select-division').value;

        chrome.storage.local.set({ inputCoins: coins, inputLevel: level, selectTitle: title, selectDivision: division });

        sendToActiveTab({
            action: 'APPLY_COSMETICS',
            coins,
            level,
            title,
            division
        });

        alert(`Visual Profile Applied!\nLevel: ${level}\nDivision: ${division}\nCoins: ${coins.toLocaleString()}\nTitle Badge: ${title}`);
    });
});
