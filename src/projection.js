// 投影:立體地球 ↔ 平面地圖 的變形。
// 第 1 階段:正射投影(地球) → 方位等距投影(整個球面攤成圓盤,背面在外圈)
// 第 2 階段:圓盤 → 等距圓柱投影(從背面剪開、拉成長方形)
// 兩個階段都是「逐點線性內插」,所以每條經緯線都會連續地移動。

const DEG = Math.PI / 180;

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.min(1, Math.max(0, u));
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

const lerpProjection = (rawFrom, rawTo) =>
  d3.geoProjectionMutator((k) => (x, y) => {
    const p = rawFrom(x, y);
    const q = rawTo(x, y);
    return [p[0] + k * (q[0] - p[0]), p[1] + k * (q[1] - p[1])];
  });

/** 依畫布大小與模式,算出各階段用的尺寸 */
function stageGeometry(W, H, mode) {
  const m = Math.min(W, H);
  return {
    W,
    H,
    cy: H / 2,
    cxGlobe: mode === 2 ? W * 0.44 : W / 2,
    radiusGlobe: m * 0.42,
    scaleDisc: (m * 0.44) / Math.PI,
    scaleFlat: Math.min((W * 0.92) / (2 * Math.PI), (H * 0.9) / Math.PI),
  };
}

/**
 * t = 0 立體地球, t = 1 平面地圖。
 * center = 地球畫面中心的 [經度, 緯度]。
 * 回傳 { kind: 'globe' | 'flat' | 'morph', proj }。
 */
function buildProjection(t, center, g) {
  const rotate = [-center[0], -center[1]];

  if (t <= 0) {
    return {
      kind: 'globe',
      proj: d3.geoOrthographic()
        .rotate(rotate).scale(g.radiusGlobe).translate([g.cxGlobe, g.cy])
        .clipAngle(90).precision(0.4),
    };
  }
  if (t >= 1) {
    return {
      kind: 'flat',
      proj: d3.geoEquirectangular()
        .rotate([0, 0]).scale(g.scaleFlat).translate([g.W / 2, g.cy]).precision(0.4),
    };
  }

  const e = easeInOut(t);
  if (e <= 0.5) {
    const s = e / 0.5;
    // 往外擴張可見範圍,但要保持「離中心越遠、畫面上越遠」(不折返)
    const clipDeg = s < 0.5 ? Math.acos(Math.max(-1, -s / (1 - s))) / DEG : 179.9;
    const proj = lerpProjection(d3.geoOrthographicRaw, d3.geoAzimuthalEquidistantRaw)(s)
      // 一邊擴張,一邊把地球轉正(緯度傾斜歸零),攤平後赤道才會是直線
      .rotate([rotate[0], lerp(rotate[1], 0, s)])
      .scale(lerp(g.radiusGlobe, g.scaleDisc, s))
      .translate([lerp(g.cxGlobe, g.W / 2, s), g.cy])
      .clipAngle(Math.min(179.9, clipDeg))
      .precision(0.5);
    return { kind: 'morph', proj };
  }

  const u = (e - 0.5) / 0.5;
  const scale = lerp(g.scaleDisc, g.scaleFlat, u);
  const proj = lerpProjection(d3.geoAzimuthalEquidistantRaw, d3.geoEquirectangularRaw)(u)
    .rotate([lerp(rotate[0], 0, u), 0])
    .scale(scale)
    .translate([g.W / 2, g.cy])
    .clipAngle(null)
    .precision(0.5);
  return {
    kind: 'morph',
    proj,
    outline: morphOutline(d3.geoAzimuthalEquidistantRaw, d3.geoEquirectangularRaw, u, scale, [g.W / 2, g.cy]),
  };
}

/**
 * 第 2 階段的球面外框。d3 的 Sphere 在「剛好攤成圓盤」時會退化成菱形,
 * 所以直接沿著經緯度矩形(±180°、±90°)的邊界取樣,再套同一個內插公式。
 */
function morphOutline(rawFrom, rawTo, k, scale, [tx, ty]) {
  const inset = 1e-5; // 背面中心(對蹠點)在圓盤上是一個奇異點,要貼近它取樣
  const lonMax = Math.PI - inset;
  const latMax = Math.PI / 2;
  const steps = 72;
  const sweep = (a, b) => d3.range(steps + 1).map((i) => lerp(a, b, i / steps));
  // 緯度在 0° 附近用等比間距加密:背面的點在圓盤外圈會「展開」成一段圓弧,
  // 外框要跟著這段圓弧走,海洋才會填滿整個圓盤。
  const positive = [];
  for (let p = inset; p < latMax; p *= 1.12) positive.push(p);
  positive.push(latMax);
  const lats = [...positive.map((p) => -p).reverse(), 0, ...positive];
  const edge = [
    ...sweep(-lonMax, lonMax).map((l) => [l, latMax]),
    ...[...lats].reverse().map((p) => [lonMax, p]),
    ...sweep(lonMax, -lonMax).map((l) => [l, -latMax]),
    ...lats.map((p) => [-lonMax, p]),
  ];
  return edge.map(([l, p]) => {
    const a = rawFrom(l, p);
    const b = rawTo(l, p);
    return [tx + scale * lerp(a[0], b[0], k), ty - scale * lerp(a[1], b[1], k)];
  });
}

/** 回傳 (lon, lat) → [x, y] | null(看不到時為 null)。只在 globe / flat 時可用 */
function makePointer(frame) {
  const { kind, proj, center } = frame;
  return (lon, lat, limit = Math.PI / 2 - 0.06) => {
    if (kind === 'morph') return null;
    if (kind === 'globe' && d3.geoDistance([lon, lat], center) > limit) return null;
    const p = proj([lon, lat]);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
  };
}

/** 螢幕座標 → [lon, lat] | null(點在地球或地圖外面時) */
function invertPoint(frame, x, y) {
  const { kind, proj } = frame;
  if (kind === 'morph' || !proj.invert) return null;
  const ll = proj.invert([x, y]);
  if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null;
  if (Math.abs(ll[1]) > 90 || Math.abs(ll[0]) > 180) return null;
  // 正射投影在球外會得到鏡像值,再投影回來比對即可排除
  const back = proj(ll);
  if (!back || Math.hypot(back[0] - x, back[1] - y) > 1.5) return null;
  return ll;
}
