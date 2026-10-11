// 繪圖:把目前狀態畫到 canvas。這裡只讀取 st,不修改它。

const PAL = {
  ocean: '#cfe6f7',
  land: '#f3ecd3',
  border: 'rgba(120,110,80,.35)',
  grid30: 'rgba(30,64,120,.30)',
  grid15: 'rgba(30,64,120,.16)',
  equator: '#e11d48',
  prime: '#2563eb',
  dateLine: '#7c3aed',
  tropic: '#ea580c',
  polar: '#0891b2',
  lat30: '#a16207',
  hemiEdge: '#d97706',
  stdMeridian: 'rgba(30,64,120,.45)',
  rim: '#5b7a99',
  ink: '#0f172a',
  city: '#e4572e',
  night: 'rgba(15,23,60,.50)',
  terminator: '#fbbf24',
  route: '#0d9488',
};

const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
const DATE_COLORS = [
  'rgba(96,165,250,.40)',
  'rgba(250,204,21,.42)',
  'rgba(244,114,182,.38)',
  'rgba(74,222,128,.38)',
];
const ZONE_COLORS = ['rgba(59,130,246,.16)', 'rgba(250,204,21,.22)'];

const GEO = buildStaticGeo();

function buildStaticGeo() {
  const N = [0, 90];
  const S = [0, -90];
  const parallel = (lat) => ({ type: 'LineString', coordinates: d3.range(-180, 181, 2).map((l) => [l, lat]) });
  const meridian = (lon) => ({ type: 'LineString', coordinates: d3.range(-90, 91, 2).map((p) => [lon, p]) });
  const cap = (center, r) => d3.geoCircle().center(center).radius(r).precision(2)();
  const ringOf = (center, r) => cap(center, r).coordinates[0];
  const annulus = (center, outer, inner) => ({
    type: 'Polygon',
    coordinates: [ringOf(center, outer), ringOf(center, inner).slice().reverse()],
  });
  const grid = (step) =>
    d3.geoGraticule().extent([[-180, -90 + 1e-6], [180, 90 - 1e-6]]).step([step, step])();

  const zones = d3.range(-12, 13).map((z) => {
    const a = Math.max(-180, 15 * z - 7.5);
    const b = Math.min(180, 15 * z + 7.5);
    return { z, geo: d3.geoGraticule().extent([[a, -90], [b, 90]]).outline() };
  });

  return {
    sphere: { type: 'Sphere' },
    land: topojson.feature(WORLD, WORLD.objects.land),
    borders: topojson.mesh(WORLD, WORLD.objects.countries, (a, b) => a !== b),
    grid30: grid(30),
    grid15: grid(15),
    equator: parallel(0),
    prime: meridian(0),
    dateLines: [meridian(179.999), meridian(-179.999)],
    lat30: [parallel(30), parallel(-30), parallel(60), parallel(-60)],
    tropics: [parallel(23.5), parallel(-23.5)],
    polar: [parallel(66.5), parallel(-66.5)],
    hemiEdges: [meridian(-20), meridian(160)],
    stdMeridians: d3.range(-11, 12).map((z) => meridian(15 * z)),
    zones,
    nsN: cap(N, 90), nsS: cap(S, 90),
    lonE: cap([90, 0], 90), lonW: cap([-90, 0], 90),
    hemiE: cap([70, 0], 90), hemiW: cap([-110, 0], 90),
    bandLow: annulus(N, 120, 60),
    bandMid: [annulus(N, 60, 30), annulus(S, 60, 30)],
    bandHigh: [cap(N, 30), cap(S, 30)],
    zoneTropic: annulus(N, 113.5, 66.5),
    zoneTemperate: [annulus(N, 66.5, 23.5), annulus(S, 66.5, 23.5)],
    zonePolar: [cap(N, 23.5), cap(S, 23.5)],
  };
}

// ---------- 小工具 ----------
const pad2 = (n) => String(n).padStart(2, '0');
const dateLabel = (dayIndex) => {
  const d = new Date(BASE_DATE_UTC + dayIndex * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const clockText = (c) => `${pad2(c.hour)}:${pad2(c.minute)}`;
const zoneSign = (z) => (z === 0 ? '0' : z > 0 ? `+${z}` : `−${-z}`);
const asList = (g) => (Array.isArray(g) ? g : [g]);

function isCityInDay(city) {
  return isDaylight(city.lat, city.lon, st.utcMin, st.season);
}

/** 老師模式「大字」:畫布上的文字與圖例放大 */
const isNarrow = () => size.W < 560;
const textScale = () => (st.bigText ? BIG_TEXT_SCALE : 1) * (isNarrow() ? 0.88 : 1);

function traceSphere(ctx, frame, path) {
  ctx.beginPath();
  if (!frame.outline) {
    path(GEO.sphere);
    return;
  }
  frame.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function fillGeo(ctx, path, geo, color) {
  ctx.beginPath();
  asList(geo).forEach((g) => path(g));
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeGeo(ctx, path, geo, color, width = 1, dash = null) {
  ctx.beginPath();
  asList(geo).forEach((g) => path(g));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash || []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPill(ctx, x, y, text, o = {}) {
  const size = (o.size || 12) * textScale();
  ctx.font = `600 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + 12;
  const h = size + 8;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = o.bg || 'rgba(255,255,255,.9)';
  ctx.fill();
  ctx.strokeStyle = o.border || 'rgba(100,116,139,.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = o.color || PAL.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function drawHaloText(ctx, x, y, text, o = {}) {
  ctx.font = `${o.weight || 600} ${(o.size || 13) * textScale()}px ${FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || PAL.ink;
  ctx.fillText(text, x, y);
}

function drawSun(ctx, x, y, r, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25);
    ctx.lineTo(x + Math.cos(a) * r * 1.65, y + Math.sin(a) * r * 1.65);
    ctx.stroke();
  }
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, '#fff7c2');
  grad.addColorStop(1, '#fbbf24');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// ---------- 圖層 ----------
// 每個分區圖層的顏色與圖例名稱,畫面與圖例共用同一份
const TINTS = {
  ns: [['北半球', 'rgba(59,130,246,.18)'], ['南半球', 'rgba(249,115,22,.18)']],
  ewLon: [['東經', 'rgba(16,185,129,.20)'], ['西經', 'rgba(168,85,247,.20)']],
  ewHemi: [['東半球', 'rgba(245,158,11,.24)'], ['西半球', 'rgba(59,130,246,.22)']],
  latBands: [['低緯度 0°~30°', 'rgba(239,68,68,.20)'], ['中緯度 30°~60°', 'rgba(234,179,8,.26)'], ['高緯度 60°~90°', 'rgba(59,130,246,.26)']],
  fiveZones: [['熱帶', 'rgba(239,68,68,.22)'], ['溫帶', 'rgba(34,197,94,.24)'], ['寒帶', 'rgba(59,130,246,.26)']],
};
const TINT_GEO = {
  ns: [GEO.nsN, GEO.nsS],
  ewLon: [GEO.lonE, GEO.lonW],
  ewHemi: [GEO.hemiE, GEO.hemiW],
  latBands: [GEO.bandLow, GEO.bandMid, GEO.bandHigh],
  fiveZones: [GEO.zoneTropic, GEO.zoneTemperate, GEO.zonePolar],
};

function drawTints(ctx, path, L) {
  Object.keys(TINTS).forEach((id) => {
    if (!L.has(id)) return;
    TINTS[id].forEach(([, color], i) => fillGeo(ctx, path, TINT_GEO[id][i], color));
  });
}

function drawZones(ctx, path, L) {
  if (!L.has('zones') && !L.has('dateColor')) return;
  GEO.zones.forEach(({ z, geo }) => {
    const color = L.has('dateColor')
      ? DATE_COLORS[mod4(localClock(st.utcMin, z).dayOffset)]
      : ZONE_COLORS[Math.abs(z) % 2];
    fillGeo(ctx, path, geo, color);
  });
  if (L.has('zones')) strokeGeo(ctx, path, GEO.stdMeridians, PAL.stdMeridian, 1, [3, 4]);
}
const mod4 = (n) => ((n % 4) + 4) % 4;

function drawLines(ctx, path, L, kind) {
  if (L.has('grid15')) strokeGeo(ctx, path, GEO.grid15, PAL.grid15, 0.8);
  if (L.has('grid30')) strokeGeo(ctx, path, GEO.grid30, PAL.grid30, 0.9);
  if (L.has('latBands')) strokeGeo(ctx, path, GEO.lat30, PAL.lat30, 1.6, [6, 4]);
  if (L.has('fiveZones')) {
    strokeGeo(ctx, path, GEO.tropics, PAL.tropic, 2);
    strokeGeo(ctx, path, GEO.polar, PAL.polar, 2);
  }
  if (L.has('ewHemi')) strokeGeo(ctx, path, GEO.hemiEdges, PAL.hemiEdge, 2.2, [7, 4]);
  if (L.has('dateLine')) strokeGeo(ctx, path, GEO.dateLines, PAL.dateLine, kind === 'flat' ? 3 : 2.4);
  if (L.has('prime')) strokeGeo(ctx, path, GEO.prime, PAL.prime, 2.4);
  if (L.has('equator')) strokeGeo(ctx, path, GEO.equator, PAL.equator, 2.4);
}

function drawDayNight(ctx, path, at) {
  const sunLon = subsolarLon(st.utcMin);
  const sunLat = subsolarLat(st.season);
  const night = d3.geoCircle().center([wrapLon(sunLon + 180), -sunLat]).radius(90).precision(1)();
  fillGeo(ctx, path, night, PAL.night);
  strokeGeo(ctx, path, night, PAL.terminator, 2.2, [7, 5]);
  strokeGeo(ctx, path, { type: 'LineString', coordinates: d3.range(-90, 91, 2).map((p) => [sunLon, p]) },
    'rgba(245,158,11,.9)', 1.6, [2, 5]);
  const p = at(sunLon, sunLat);
  if (p) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

function drawTicks(ctx, frame, at) {
  const lonStep = d3.range(-150, 181, isNarrow() ? 60 : 30); // 手機畫面窄,刻度隔一個才不會擠在一起
  const centerLon = frame.kind === 'globe' ? frame.center[0] : 0;
  lonStep.forEach((lon) => {
    const p = at(lon, 0);
    if (p) drawHaloText(ctx, p[0], p[1] + 13, formatLon(lon), { size: 11.5, align: 'center', color: '#334155' });
  });
  [-60, -30, 30, 60].forEach((lat) => {
    const p = at(centerLon, lat);
    if (p) drawHaloText(ctx, p[0] + 4, p[1] - 8, formatLat(lat), { size: 11.5, color: '#334155' });
  });
}

function drawZoneLabels(ctx, frame, at, L) {
  const globe = frame.kind === 'globe';
  const topLat = globe ? 12 : 80;
  const botLat = globe ? -12 : -80;
  const limit = Math.PI / 2 - 0.35; // 太靠近邊緣的標籤會擠在一起,不畫
  for (let z = -12; z <= 12; z++) {
    if (isNarrow() && !globe && z % 2 !== 0) continue; // 手機平面圖只標偶數時區
    const lon = z === 12 ? 176 : z === -12 ? -176 : 15 * z;
    if (L.has('zoneTimes')) {
      const p = at(lon, topLat, limit);
      if (p) {
        // 平面圖最左右的 ±12 兩個半時區,標籤往地圖外側挪,才不會互相擋住
        if (!globe && Math.abs(z) === 12) p[0] += z > 0 ? 24 : -24;
        const c = localClock(st.utcMin, z);
        const noon = c.hour === 12 && c.minute < 30;
        const midnight = c.hour === 0 && c.minute < 30;
        drawPill(ctx, p[0], p[1], clockText(c), {
          size: globe ? 12 : 11,
          bg: noon ? '#fde68a' : midnight ? '#1e293b' : undefined,
          color: midnight ? '#fff' : undefined,
          border: noon ? '#d97706' : undefined,
        });
      }
    }
    if (L.has('zoneNums')) {
      const p = at(lon, botLat, limit);
      if (p && !globe && Math.abs(z) === 12) p[0] += z > 0 ? 24 : -24;
      if (p) drawPill(ctx, p[0], p[1], zoneSign(z), { size: globe ? 12 : 11, bg: 'rgba(255,255,255,.82)' });
    }
  }
}

function legendRows(L) {
  const rows = Object.keys(TINTS).filter((id) => L.has(id)).map((id) => TINTS[id]);
  if (L.has('dateColor')) {
    const days = [...new Set(d3.range(-12, 13).map((z) => localClock(st.utcMin, z).dayOffset))].sort((a, b) => a - b);
    rows.push(days.map((d) => [`${dateLabel(d)} 日`, DATE_COLORS[mod4(d)]]));
  }
  return rows;
}

function drawLegend(ctx, rows) {
  if (!rows.length) return;
  const k = textScale();
  ctx.font = `600 ${13 * k}px ${FONT}`;
  const rowH = 24 * k;
  const widths = rows.map((row) => row.reduce((w, [label]) => w + 22 * k + ctx.measureText(label).width + 12, 10));
  const w = Math.max(...widths);
  const h = rows.length * rowH + 8;
  ctx.beginPath();
  ctx.roundRect(10, 10, w, h, 10);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,116,139,.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  rows.forEach((row, r) => {
    let x = 20;
    const y = 14 + r * rowH + rowH / 2;
    row.forEach(([label, color]) => {
      ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.8)');
      ctx.fillRect(x, y - 7 * k, 14 * k, 14 * k);
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.strokeRect(x, y - 7 * k, 14 * k, 14 * k);
      ctx.fillStyle = PAL.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 20 * k, y + 0.5);
      x += 22 * k + ctx.measureText(label).width + 12;
    });
  });
}

function drawCities(ctx, at, W) {
  const rv = st.mode === 3 ? currentRouteView() : null;
  CITIES.forEach((city) => {
    const p = at(city.lon, city.lat);
    if (!p) return;
    const pinned = st.mode === 2 && st.pinned.includes(city.id);
    const tag = rv ? (rv.aId === city.id ? 'A' : rv.bId === city.id ? 'B' : null) : null;
    drawCityDot(ctx, p, pinned || tag ? 7 : 4.5, pinned, tag);
    const label = city.label || (p[0] > W - 80 ? { align: 'right' } : {});
    const align = label.align || 'left';
    const dx = align === 'center' ? 0 : align === 'right' ? -10 : 10;
    drawHaloText(ctx, p[0] + dx, p[1] + (label.dy || -1), city.name, { size: 13, align });
  });
}

function drawCityDot(ctx, p, r, ring, tag) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = tag ? '#0f766e' : PAL.city;
  ctx.fill();
  ctx.lineWidth = ring ? 3 : 1.5;
  ctx.strokeStyle = ring ? '#fbbf24' : '#fff';
  ctx.stroke();
  if (tag) {
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${r + 2}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, p[0], p[1] + 0.5);
  }
}

function drawCustomPlaces(ctx, at, rv) {
  [['A', rv.a, rv.aId], ['B', rv.b, rv.bId]].forEach(([tag, place, id]) => {
    if (id) return; // 城市已由 drawCities 畫過
    const p = at(place.lon, place.lat);
    if (p) drawCityDot(ctx, p, 8, false, tag);
  });
}

function drawRoute(ctx, frame, at, W) {
  const rv = currentRouteView();
  if (!rv) return;
  drawCustomPlaces(ctx, at, rv);
  const r = rv.route;
  if (r.degrees === 0) return;
  const sign = r.direction === 'east' ? 1 : -1;
  const pointAt = (f) => [
    wrapLon(rv.a.lon + sign * r.degrees * f),
    rv.a.lat + (rv.b.lat - rv.a.lat) * f,
  ];
  const n = Math.max(8, Math.ceil(r.degrees / 2));
  const coords = d3.range(0, n + 1).map((i) => pointAt(i / n));
  const path = d3.geoPath(frame.proj, ctx);
  const line = { type: 'LineString', coordinates: coords };
  strokeGeo(ctx, path, line, 'rgba(255,255,255,.95)', 7);
  strokeGeo(ctx, path, line, PAL.route, 3.5);

  const end = at(...pointAt(1));
  const before = at(...pointAt(0.97));
  if (end && before) {
    const ang = Math.atan2(end[1] - before[1], end[0] - before[0]);
    ctx.save();
    ctx.translate(end[0], end[1]);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-14, 8);
    ctx.closePath();
    ctx.fillStyle = PAL.route;
    ctx.fill();
    ctx.restore();
  }
  const mid = at(...pointAt(0.5));
  if (mid) {
    const word = r.direction === 'east' ? '往東' : '往西';
    const sgn = r.hourShift > 0 ? '+' : r.hourShift < 0 ? '−' : '±';
    const midX = Math.min(W - 110, Math.max(110, mid[0]));
    drawPill(ctx, midX, mid[1] - 18, `${word} 跨 ${r.zones} 個時區 ${sgn}${Math.abs(r.hourShift)} 小時`, {
      size: 13, bg: '#ccfbf1', border: PAL.route, color: '#115e59',
    });
  }
  if (r.crossesDateLine) {
    const f = r.direction === 'east' ? (180 - rv.a.lon) / r.degrees : (rv.a.lon + 180) / r.degrees;
    const lat = rv.a.lat + (rv.b.lat - rv.a.lat) * Math.min(1, Math.max(0, f));
    const edgeLon = r.direction === 'east' ? 178 : -178;
    const p = at(edgeLon, lat);
    if (p) {
      const left = p[0] > W / 2;
      drawPill(ctx, p[0] + (left ? -70 : 70), p[1] + 38, `過換日線 日期 ${r.dateDelta > 0 ? '+1' : '−1'}`, {
        size: 12.5, bg: '#ede9fe', border: PAL.dateLine, color: '#5b21b6',
      });
    }
  }
}

function drawLonQuizAnswer(ctx, path, at, W) {
  const quiz = st.lonQuiz;
  if (!quiz || !quiz.checked || !quiz.correct) return;
  const q = quiz.question;
  GEO.zones.filter(({ z }) => sameZone(z, q.zone)).forEach(({ geo }) => {
    fillGeo(ctx, path, geo, 'rgba(34,197,94,.30)');
    strokeGeo(ctx, path, geo, '#15803d', 2.4);
  });
  const city = cityById(q.targetId);
  const p = at(city.lon, city.lat);
  if (!p) return;
  drawCityDot(ctx, p, 7, false, null);
  const right = p[0] > W - 80;
  drawHaloText(ctx, p[0] + (right ? -12 : 12), p[1], city.name, { size: 14, align: right ? 'right' : 'left' });
}

function drawClickMarker(ctx, at) {
  if (!st.clicked) return;
  const p = at(st.clicked.lon, st.clicked.lat);
  if (!p) return;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p[0] - 15, p[1]); ctx.lineTo(p[0] - 4, p[1]);
  ctx.moveTo(p[0] + 4, p[1]); ctx.lineTo(p[0] + 15, p[1]);
  ctx.moveTo(p[0], p[1] - 15); ctx.lineTo(p[0], p[1] - 4);
  ctx.moveTo(p[0], p[1] + 4); ctx.lineTo(p[0], p[1] + 15);
  ctx.stroke();
}

function drawGlobeFinish(ctx, frame, g) {
  const R = frame.proj.scale();
  const [cx, cy] = frame.proj.translate();
  const shade = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)');
  shade.addColorStop(1, 'rgba(15,40,80,0.20)');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.strokeStyle = PAL.rim;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  if (st.mode === 2 && st.layers.has('daynight')) {
    const space = g.W - (cx + R);
    const sunR = Math.min(34, Math.max(12, space * 0.16));
    const sx = cx + R + space / 2;
    ctx.strokeStyle = 'rgba(245,158,11,.75)';
    ctx.lineWidth = 2;
    [-0.5, 0, 0.5].forEach((k) => {
      const y = cy + k * R * 0.9;
      ctx.beginPath();
      ctx.moveTo(sx - sunR * 1.8, y);
      ctx.lineTo(cx + R * 0.92 + 4, y);
      ctx.stroke();
    });
    const sy = cy - (subsolarLat(st.season) / 90) * R * 0.7;
    drawSun(ctx, sx, sy, sunR);
    drawHaloText(ctx, sx, sy + sunR * 2.3, '太陽光', { size: 12, align: 'center', color: '#92400e' });
  }
}

function drawFlatFinish(ctx, frame) {
  const path = d3.geoPath(frame.proj, ctx);
  traceSphere(ctx, frame, path);
  ctx.strokeStyle = PAL.rim;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (st.mode === 2 && st.layers.has('daynight')) {
    const top = frame.proj([subsolarLon(st.utcMin), 90]);
    if (top) {
      const y = Math.max(20, top[1] - 22);
      drawSun(ctx, top[0], y, 10);
    }
  }
}

/** 主繪圖。center = 地球畫面中心 [lon, lat] */
function drawScene(ctx, g, center) {
  ctx.clearRect(0, 0, g.W, g.H);
  const frame = { ...buildProjection(st.t, center, g), center };
  const path = d3.geoPath(frame.proj, ctx);
  const at = makePointer(frame);
  const L = st.layers;
  const steady = frame.kind !== 'morph';

  traceSphere(ctx, frame, path);
  ctx.fillStyle = PAL.ocean;
  ctx.fill();
  fillGeo(ctx, path, GEO.land, PAL.land);
  strokeGeo(ctx, path, GEO.borders, PAL.border, 0.6);
  drawTints(ctx, path, L);
  drawZones(ctx, path, L);
  drawLines(ctx, path, L, frame.kind);
  if (st.mode === 2 && L.has('daynight')) drawDayNight(ctx, path, at);

  if (steady) {
    if (L.has('ticks')) drawTicks(ctx, frame, at);
    if (L.has('zoneNums') || L.has('zoneTimes')) drawZoneLabels(ctx, frame, at, L);
    drawLegend(ctx, legendRows(L));
    if (L.has('cities')) drawCities(ctx, at, g.W);
    if (st.mode === 3) drawRoute(ctx, frame, at, g.W);
    if (st.mode === 4) drawLonQuizAnswer(ctx, path, at, g.W);
    drawClickMarker(ctx, at);
  }

  if (frame.kind === 'globe') drawGlobeFinish(ctx, frame, g);
  else drawFlatFinish(ctx, frame);
  return frame;
}
