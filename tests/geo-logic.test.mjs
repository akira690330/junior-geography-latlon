import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wrapLon, zoneOfLon, formatLat, formatLon, classifyPoint,
  subsolarLon, localClock, routeInfo, timeAtB, formatZone, subsolarLat, isDaylight,
  zoneFromClocks, lonOfZone, sameZone, makeLonQuestion, checkLonAnswer,
} from '../src/geo-logic.mjs';

test('wrapLon 把經度收斂到 [-180, 180)', () => {
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-190), 170);
  assert.equal(wrapLon(180), -180);
  assert.equal(wrapLon(0), 0);
  assert.equal(wrapLon(540), -180);
});

test('zoneOfLon 以標準經線為中心(±7.5°)', () => {
  assert.equal(zoneOfLon(0), 0);
  assert.equal(zoneOfLon(7.4), 0);
  assert.equal(zoneOfLon(7.6), 1);
  assert.equal(zoneOfLon(121.5), 8); // 台北用 120°E 標準時間
  assert.equal(zoneOfLon(-74), -5); // 紐約
  assert.equal(zoneOfLon(-118.2), -8); // 洛杉磯
  assert.equal(zoneOfLon(174.8), 12); // 奧克蘭
  assert.equal(zoneOfLon(-180), -12);
});

test('formatZone 顯示 UTC±n', () => {
  assert.equal(formatZone(8), 'UTC+8');
  assert.equal(formatZone(-5), 'UTC−5');
  assert.equal(formatZone(0), 'UTC±0');
});

test('formatLat / formatLon', () => {
  assert.equal(formatLat(23.5), '23.5°N');
  assert.equal(formatLat(-33.9), '33.9°S');
  assert.equal(formatLat(0), '0°');
  assert.equal(formatLon(121.5), '121.5°E');
  assert.equal(formatLon(-74), '74°W');
  assert.equal(formatLon(0), '0°');
  assert.equal(formatLon(-180), '180°');
});

test('classifyPoint 依康軒版:東西半球以 20°W 與 160°E 劃分', () => {
  const taipei = classifyPoint(25, 121.5);
  assert.equal(taipei.ns, '北半球');
  assert.equal(taipei.ew, '東經');
  assert.equal(taipei.hemisphereEW, '東半球');
  assert.equal(taipei.latBand, '低緯度');
  assert.equal(taipei.zone5, '溫帶'); // 25°N 在北回歸線(23.5°N,經過嘉義)以北
  assert.equal(classifyPoint(22.6, 120.3).zone5, '熱帶'); // 高雄

  // 西經 10°(倫敦附近)屬於東半球,但是是西經
  const west10 = classifyPoint(51, -10);
  assert.equal(west10.ew, '西經');
  assert.equal(west10.hemisphereEW, '東半球');
  assert.equal(west10.latBand, '中緯度');
  assert.equal(west10.zone5, '溫帶');

  // 東經 170° 屬於東經,但是西半球
  const east170 = classifyPoint(-40, 170);
  assert.equal(east170.ew, '東經');
  assert.equal(east170.hemisphereEW, '西半球');
  assert.equal(east170.ns, '南半球');

  const polar = classifyPoint(75, 0);
  assert.equal(polar.latBand, '高緯度');
  assert.equal(polar.zone5, '寒帶');
  assert.equal(polar.special, '本初經線');

  assert.equal(classifyPoint(0, 50).special, '赤道');
  assert.equal(classifyPoint(10, -180).special, '180°經線(國際換日線附近)');
});

test('subsolarLon:倫敦 12:00 時太陽在 0°,每小時西移 15°', () => {
  assert.equal(subsolarLon(12 * 60), 0);
  assert.equal(subsolarLon(0), -180);
  assert.equal(subsolarLon(13 * 60), -15);
  assert.equal(subsolarLon(6 * 60), 90);
});

test('localClock 依時區換算當地時間與日期偏移', () => {
  // 倫敦 22:00 → 台北(+8)隔天 06:00
  assert.deepEqual(localClock(22 * 60, 8), { dayOffset: 1, hour: 6, minute: 0 });
  // 倫敦 03:30 → 紐約(-5)前一天 22:30
  assert.deepEqual(localClock(3 * 60 + 30, -5), { dayOffset: -1, hour: 22, minute: 30 });
  assert.deepEqual(localClock(720, 0), { dayOffset: 0, hour: 12, minute: 0 });
  // utc 分鐘數可以超過一天(連續播放時)
  assert.deepEqual(localClock(1440 + 60, 0), { dayOffset: 1, hour: 1, minute: 0 });
});

test('routeInfo 台北→洛杉磯:往東 +8 小時日期 −1,往西 −16 小時,結果一致', () => {
  const east = routeInfo(121.5, -118.2, 'east');
  assert.equal(east.zones, 8);
  assert.equal(east.hourShift, 8);
  assert.equal(east.crossesDateLine, true);
  assert.equal(east.dateDelta, -1);
  assert.equal(east.netHours, -16);

  const west = routeInfo(121.5, -118.2, 'west');
  assert.equal(west.zones, 16);
  assert.equal(west.hourShift, -16);
  assert.equal(west.crossesDateLine, false);
  assert.equal(west.dateDelta, 0);
  assert.equal(west.netHours, -16);
  assert.equal(east.shorter, true);
  assert.equal(west.shorter, false);
});

test('routeInfo 倫敦→台北:往東 8 個時區,不過換日線', () => {
  const east = routeInfo(0, 121.5, 'east');
  assert.equal(east.zones, 8);
  assert.equal(east.crossesDateLine, false);
  assert.equal(east.netHours, 8);
  const west = routeInfo(0, 121.5, 'west');
  assert.equal(west.zones, 16);
  assert.equal(west.crossesDateLine, true); // 往西經過 180°
  assert.equal(west.dateDelta, 1);
  assert.equal(west.netHours, 8); // −16 + 24
});

test('routeInfo 倫敦→紐約:往西 5 個時區 −5 小時', () => {
  const west = routeInfo(0, -74, 'west');
  assert.equal(west.zones, 5);
  assert.equal(west.hourShift, -5);
  assert.equal(west.netHours, -5);
  assert.equal(west.shorter, true);
  const east = routeInfo(0, -74, 'east');
  assert.equal(east.netHours, -5);
  assert.equal(east.crossesDateLine, true);
});

test('routeInfo 同一時區:0 個時區', () => {
  const r = routeInfo(116.4, 121.5, 'east'); // 北京→台北
  assert.equal(r.zones, 0);
  assert.equal(r.netHours, 0);
});

test('timeAtB 以 A 地時間與路線結果算出 B 地時間與日期', () => {
  const r = routeInfo(121.5, -118.2, 'east');
  // 台北 10/10 08:00 → 洛杉磯 10/9 16:00
  assert.deepEqual(timeAtB({ hour: 8, minute: 0 }, r), { dayOffset: -1, hour: 16, minute: 0 });
  const w = routeInfo(121.5, -118.2, 'west');
  assert.deepEqual(timeAtB({ hour: 8, minute: 0 }, w), { dayOffset: -1, hour: 16, minute: 0 });
  // 台北 20:00 → 倫敦 12:00 同一天
  const l = routeInfo(121.5, 0, 'west');
  assert.deepEqual(timeAtB({ hour: 20, minute: 0 }, l), { dayOffset: 0, hour: 12, minute: 0 });
});

test('subsolarLat:春秋分直射赤道,夏至北回歸線,冬至南回歸線', () => {
  assert.equal(subsolarLat('equinox'), 0);
  assert.equal(subsolarLat('june'), 23.5);
  assert.equal(subsolarLat('december'), -23.5);
  assert.equal(subsolarLat('unknown'), 0);
});

test('isDaylight:太陽直射點 90° 內是白天', () => {
  // UTC 04:00 太陽在 120°E:台北是中午,倫敦(凌晨 4 點)還是黑夜
  assert.equal(isDaylight(25, 121.5, 4 * 60, 'equinox'), true);
  assert.equal(isDaylight(51.5, -0.1, 4 * 60, 'equinox'), false);
  // UTC 16:00 太陽在 60°W:台北是半夜 0 點
  assert.equal(isDaylight(25, 121.5, 16 * 60, 'equinox'), false);
});

test('isDaylight:夏至時北極圈內整天都是白天,冬至時整天是黑夜', () => {
  [0, 6, 12, 18].forEach((h) => {
    assert.equal(isDaylight(80, 20, h * 60, 'june'), true);
    assert.equal(isDaylight(80, 20, h * 60, 'december'), false);
  });
});

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('zoneFromClocks:由兩地時鐘算出時差(含日期)', () => {
  // 倫敦 10/10 22:00,某地 10/11 06:00 → 晚 8 小時
  assert.equal(zoneFromClocks({ dayOffset: 0, hour: 22 }, { dayOffset: 1, hour: 6 }), 8);
  // 倫敦 04:00,某地前一天 23:00 → 早 5 小時
  assert.equal(zoneFromClocks({ dayOffset: 0, hour: 4 }, { dayOffset: -1, hour: 23 }), -5);
  assert.equal(zoneFromClocks({ dayOffset: 0, hour: 12 }, { dayOffset: 0, hour: 12 }), 0);
});

test('lonOfZone / sameZone', () => {
  assert.equal(lonOfZone(8), 120);
  assert.equal(lonOfZone(-5), -75);
  assert.equal(sameZone(12, -12), true); // 換日線兩側的半個時區算同一個時區編號
  assert.equal(sameZone(8, 9), false);
});

test('makeLonQuestion 時差題:倫敦 22:00 → 台北隔天 06:00', () => {
  const cities = [{ id: 'taipei', zone: 8 }, { id: 'newyork', zone: -5 }];
  const q = makeLonQuestion(seq(0, 0.1, 22.5 / 24), cities);
  assert.equal(q.kind, 'diff');
  assert.equal(q.targetId, 'taipei');
  assert.equal(q.zone, 8);
  assert.deepEqual(q.london, { dayOffset: 0, hour: 22, minute: 0 });
  assert.deepEqual(q.other, { dayOffset: 1, hour: 6, minute: 0 });
  assert.equal(zoneFromClocks(q.london, q.other), q.zone);
});

test('makeLonQuestion 正午題:某地正是 12:00,倫敦時間由時區推出', () => {
  const cities = [{ id: 'taipei', zone: 8 }, { id: 'newyork', zone: -5 }];
  const q = makeLonQuestion(seq(0.99, 0.9, 0.3), cities);
  assert.equal(q.kind, 'noon');
  assert.equal(q.targetId, 'newyork');
  assert.equal(q.other.hour, 12);
  assert.equal(q.london.hour, 17); // 紐約 12:00 = 倫敦 17:00
  assert.equal(zoneFromClocks(q.london, q.other), q.zone);
});

test('makeLonQuestion 不會出現時區 0 的城市,且每題的時差與時區吻合', () => {
  const cities = [{ id: 'london', zone: 0 }, { id: 'tokyo', zone: 9 }, { id: 'la', zone: -8 }];
  for (let i = 0; i < 200; i++) {
    const q = makeLonQuestion(Math.random, cities.filter((c) => c.zone !== 0));
    assert.notEqual(q.zone, 0);
    assert.equal(zoneFromClocks(q.london, q.other), q.zone);
  }
});

test('checkLonAnswer 點在正確時區內就算對', () => {
  const q = { zone: 8 };
  assert.deepEqual(checkLonAnswer(q, 121.5), { correct: true, clickedZone: 8 });
  assert.equal(checkLonAnswer(q, 113).correct, true); // 112.5° 起算 UTC+8 的範圍
  assert.equal(checkLonAnswer(q, 135).correct, false); // UTC+9
  assert.equal(checkLonAnswer({ zone: 12 }, -176).correct, true); // 換日線另一側的 UTC−12
  assert.equal(checkLonAnswer({ zone: -5 }, -74).correct, true);
});
