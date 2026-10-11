// 經緯度與時區的純運算邏輯(不依賴瀏覽器,可由 node 直接測試)。
// 教學版本:康軒版國一地理。東西半球以 20°W 與 160°E 劃分。

const DEG_PER_ZONE = 15;
const MIN_PER_DAY = 1440;
const HEMISPHERE_WEST_EDGE = -20; // 20°W
const HEMISPHERE_EAST_EDGE = 160; // 160°E
const LINE_TOLERANCE = 1; // 點擊到線附近 1° 內視為「在線上」

const mod = (n, m) => ((n % m) + m) % m;
const round1 = (n) => Number(Math.abs(n).toFixed(1));

/** 把經度收斂到 [-180, 180) */
function wrapLon(lon) {
  return mod(lon + 180, 360) - 180 + 0;
}

/** 以標準經線(0°、15°、30°…)為中心、±7.5° 為一個時區 */
function zoneOfLon(lon) {
  return Math.round(wrapLon(lon) / DEG_PER_ZONE) + 0;
}

function formatZone(zone) {
  if (zone === 0) return 'UTC±0';
  return zone > 0 ? `UTC+${zone}` : `UTC−${-zone}`;
}

function formatLat(lat) {
  const v = round1(lat);
  if (v === 0) return '0°';
  return `${v}°${lat > 0 ? 'N' : 'S'}`;
}

function formatLon(lon) {
  const w = wrapLon(lon);
  const v = round1(w);
  if (v === 0 || v === 180) return `${v}°`;
  return `${v}°${w > 0 ? 'E' : 'W'}`;
}

/** 把一個座標點分類成國一課本會用到的各種名詞 */
function classifyPoint(lat, lon) {
  const w = wrapLon(lon);
  const absLat = Math.abs(lat);
  let special = null;
  if (absLat <= LINE_TOLERANCE * 0.5) special = '赤道';
  else if (Math.abs(w) <= LINE_TOLERANCE * 0.5) special = '本初經線';
  else if (Math.abs(Math.abs(w) - 180) <= LINE_TOLERANCE * 0.5) {
    special = '180°經線(國際換日線附近)';
  }
  return {
    ns: lat > 0 ? '北半球' : lat < 0 ? '南半球' : '赤道上',
    ew: w > 0 ? '東經' : w < 0 ? '西經' : '0°經線',
    hemisphereEW:
      w >= HEMISPHERE_WEST_EDGE && w < HEMISPHERE_EAST_EDGE ? '東半球' : '西半球',
    latBand: absLat < 30 ? '低緯度' : absLat < 60 ? '中緯度' : '高緯度',
    zone5: absLat < 23.5 ? '熱帶' : absLat < 66.5 ? '溫帶' : '寒帶',
    special,
  };
}

/** 春分/秋分假設:太陽直射赤道。UTC 12:00 時直射 0°,每小時西移 15° */
function subsolarLon(utcMinutes) {
  return wrapLon(-(utcMinutes / 60 - 12) * DEG_PER_ZONE);
}

const SEASON_LAT = { equinox: 0, june: 23.5, december: -23.5 };

/** 太陽直射緯度:春秋分 0°、夏至 23.5°N、冬至 23.5°S */
function subsolarLat(season) {
  return SEASON_LAT[season] ?? 0;
}

/** 某地此刻是不是白天(離太陽直射點小於 90°) */
function isDaylight(lat, lon, utcMinutes, season) {
  const toRad = Math.PI / 180;
  const sunLat = subsolarLat(season) * toRad;
  const dLon = (lon - subsolarLon(utcMinutes)) * toRad;
  const phi = lat * toRad;
  return Math.sin(phi) * Math.sin(sunLat) + Math.cos(phi) * Math.cos(sunLat) * Math.cos(dLon) > 0;
}

/** 由 UTC 分鐘數(可超過一天)換算某時區的當地時間與日期偏移 */
function localClock(utcMinutes, zone) {
  const total = utcMinutes + zone * 60;
  const dayOffset = Math.floor(total / MIN_PER_DAY);
  const rem = total - dayOffset * MIN_PER_DAY;
  return { dayOffset, hour: Math.floor(rem / 60), minute: Math.floor(rem % 60) };
}

/**
 * 從 A 地走到 B 地的「東加西減」計算。
 * direction: 'east' | 'west'
 * 回傳需要跨越的時區數、時間加減、是否跨越 180° 經線與日期變化。
 */
function routeInfo(lonA, lonB, direction) {
  const a = wrapLon(lonA);
  const b = wrapLon(lonB);
  const zA = zoneOfLon(a);
  const zB = zoneOfLon(b);
  const isEast = direction === 'east';

  const degEast = mod(b - a, 360);
  const degrees = isEast ? degEast : mod(360 - degEast, 360);
  const eastZones = mod(zB - zA, 24);
  const westZones = mod(zA - zB, 24);
  const rawZones = isEast ? eastZones : westZones;
  // 同一時區卻要繞行大半個地球 → 其實是繞了 24 個時區
  const zones = rawZones === 0 && degrees > 180 ? 24 : rawZones;

  const crossesDateLine = isEast ? a + degrees >= 180 : a - degrees < -180;
  const dateDelta = crossesDateLine ? (isEast ? -1 : 1) : 0;
  const hourShift = isEast ? zones : -zones;

  const otherDegrees = 360 - degrees;
  const shorter = degrees < otherDegrees || (degrees === otherDegrees && isEast);

  return {
    direction,
    zoneA: zA,
    zoneB: zB,
    zones,
    degrees,
    hourShift,
    crossesDateLine,
    dateDelta,
    netHours: hourShift + 24 * dateDelta,
    shorter,
  };
}

/** A 地時間 + 路線結果 → B 地時間與日期偏移(相對 A 地當天) */
function timeAtB(timeA, route) {
  const total = timeA.hour * 60 + timeA.minute + route.netHours * 60;
  const dayOffset = Math.floor(total / MIN_PER_DAY);
  const rem = total - dayOffset * MIN_PER_DAY;
  return { dayOffset, hour: Math.floor(rem / 60), minute: rem % 60 };
}

/** 兩地時鐘(含日期偏移)相差幾小時 = 兩地相差幾個時區(某地比倫敦晚為正) */
function zoneFromClocks(clockLondon, clockOther) {
  const days = (clockOther.dayOffset ?? 0) - (clockLondon.dayOffset ?? 0);
  return clockOther.hour - clockLondon.hour + 24 * days;
}

/** 時區的標準經線(東加西減:每 1 小時 15°) */
function lonOfZone(zone) {
  return zone * DEG_PER_ZONE;
}

/** UTC+12 與 UTC−12 在換日線兩側,視為同一個時區編號 */
function sameZone(a, b) {
  return mod(a - b, 24) === 0;
}

/**
 * 出一題「由時間找經度」。rand 是 0~1 的亂數函式(測試時可傳入固定序列)。
 * kind 'diff':給兩地時間。 kind 'noon':某地正是中午 12:00,問倫敦的時間。
 * cities 要先排除時區 0 的城市(與倫敦同一時區就沒有題目可出)。
 */
function makeLonQuestion(rand, cities) {
  const target = cities[Math.floor(rand() * cities.length)];
  const kind = rand() < 0.5 ? 'diff' : 'noon';
  const hourLondon = kind === 'noon' ? mod(12 - target.zone, 24) : Math.floor(rand() * 24);
  const other = localClock(hourLondon * 60, target.zone);
  return {
    kind,
    targetId: target.id,
    zone: target.zone,
    london: { dayOffset: 0, hour: hourLondon, minute: 0 },
    other: { dayOffset: other.dayOffset, hour: other.hour, minute: other.minute },
  };
}

/** 學生點的位置落在正確時區內就算對 */
function checkLonAnswer(question, lon) {
  const clickedZone = zoneOfLon(lon);
  return { correct: sameZone(clickedZone, question.zone), clickedZone };
}

export {
  wrapLon, zoneOfLon, formatZone, formatLat, formatLon, classifyPoint,
  subsolarLon, subsolarLat, isDaylight, localClock, routeInfo, timeAtB,
  zoneFromClocks, lonOfZone, sameZone, makeLonQuestion, checkLonAnswer,
};
