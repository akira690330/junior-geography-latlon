// 主程式:狀態、事件、動畫迴圈。

function initialState() {
  return {
    mode: 1,
    t: 0, // 0 = 立體地球, 1 = 平面地圖
    anim: null,
    center: [110, 20], // 地球畫面中心 [經度, 緯度]
    layers: new Set(MODE_PRESETS[1]),
    utcMin: 4 * 60, // 倫敦 04:00 → 台北正好中午
    playing: false,
    speed: 60, // 每秒走幾分鐘
    pinned: ['taipei', 'london'],
    clicked: null,
    calc: {
      a: { id: 'taipei' }, b: { id: 'newyork' }, target: 'b', direction: 'east',
      hourA: 8, guessDay: null, guessHour: null, revealed: false, seen: {},
    },
    lonQuiz: null,
    season: 'equinox',
    teacher: false,
    lockLayers: false,
    bigText: false,
    doneTasks: new Set(),
    flags: {},
  };
}

let st = initialState();
let lastFrame = null;
let drag = null;
let rafId = 0;
let lastTick = 0;
let size = { W: 0, H: 0, dpr: 1 };

const canvas = $('map');
const ctx = canvas.getContext('2d');

// ---------- 計算器用的地點 ----------
function resolvePlace(slot) {
  if (slot.id) return { ...cityById(slot.id), id: slot.id };
  return { name: `自選點(${formatLat(slot.lat)}, ${formatLon(slot.lon)})`, lon: slot.lon, lat: slot.lat };
}

function currentRouteView() {
  if (st.mode !== 3) return null;
  const a = resolvePlace(st.calc.a);
  const b = resolvePlace(st.calc.b);
  return { a, b, aId: a.id, bId: b.id, route: routeInfo(a.lon, b.lon, st.calc.direction) };
}

function resetPrediction() {
  st.calc.revealed = false;
  st.calc.guessDay = null;
  st.calc.guessHour = null;
  renderCalc();
  requestFrame();
}

function changeDirection(direction) {
  st.calc.direction = direction;
  renderCalc();
  requestFrame();
  if (st.calc.revealed) emitReveal();
}

function revealAnswer() {
  st.calc.revealed = true;
  renderCalc();
  emitReveal();
}

function emitReveal() {
  const rv = currentRouteView();
  emit({ type: 'reveal', pair: `${rv.aId}>${rv.bId}`, direction: st.calc.direction, route: rv.route });
}

// ---------- 由時間找經度 ----------
function setLonQuiz(patch) {
  st.lonQuiz = { ...st.lonQuiz, ...patch };
  renderLon();
}

function newLonQuestion() {
  const pool = CITIES.filter((c) => c.zone !== 0);
  const previous = st.lonQuiz || { solved: 0 };
  st.lonQuiz = {
    question: makeLonQuestion(Math.random, pool),
    diffGuess: null, hint: false, checked: false, correct: false, clickedZone: null,
    solved: previous.solved,
  };
  st.clicked = null;
  renderLon();
  requestFrame();
}

function checkLonQuiz() {
  const quiz = st.lonQuiz;
  if (!st.clicked || (quiz.checked && quiz.correct)) return;
  const result = checkLonAnswer(quiz.question, st.clicked.lon);
  st.lonQuiz = {
    ...quiz, checked: true, correct: result.correct, clickedZone: result.clickedZone,
    solved: quiz.solved + (result.correct ? 1 : 0),
  };
  renderLon();
  requestFrame();
  emit({ type: 'lonCheck', correct: result.correct, kind: quiz.question.kind });
}

function assignPlace(slot, place) {
  st.calc[slot] = place;
  if (slot === 'a') st.calc.target = 'b';
  resetPrediction();
}

// ---------- 任務 ----------
function emit(evt) {
  const done = TASKS[st.mode].filter((task) => !st.doneTasks.has(task.id) && task.test(evt));
  if (!done.length) return;
  st.doneTasks = new Set([...st.doneTasks, ...done.map((t) => t.id)]);
  renderTasks();
}

// ---------- 圖層、時間、釘選 ----------
function toggleLayer(id, on) {
  if (st.lockLayers) return;
  const next = new Set(st.layers);
  if (on) next.add(id);
  else next.delete(id);
  st.layers = next;
  requestFrame();
  emit({ type: 'layer', id, on });
}

function setSeason(season) {
  st.season = season;
  if (ui.season) ui.season.value = season;
  updateClocks();
  emit({ type: 'season' });
  requestFrame();
}

// ---------- 老師模式 ----------
function applyBodyFlags() {
  document.body.classList.toggle('big', st.bigText);
  $('teacherBtn').setAttribute('aria-pressed', String(st.teacher));
}

function toggleTeacher() {
  st.teacher = !st.teacher;
  if (!st.teacher) {
    st.lockLayers = false;
    st.bigText = false;
  }
  applyBodyFlags();
  renderPanel();
  requestFrame();
}

function setTeacherOption(name, value) {
  st[name] = value;
  applyBodyFlags();
  renderPanel();
  requestFrame();
}

function applyScene(layers) {
  st.layers = new Set(layers);
  syncLayerChecks();
  requestFrame();
}

function randomQuestion() {
  const ids = CITIES.map((c) => c.id);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const a = pick(ids);
  const b = pick(ids.filter((id) => id !== a));
  st.calc = {
    ...st.calc,
    a: { id: a }, b: { id: b }, target: 'b',
    hourA: Math.floor(Math.random() * 24),
    direction: Math.random() < 0.5 ? 'east' : 'west',
  };
  resetPrediction();
}

function afterTimeChange(skipFrame = false) {
  syncTimeUI();
  updateClocks();
  emit({ type: 'time' });
  if (!skipFrame) requestFrame();
}

function setTimeOfDay(minutes) {
  st.utcMin = Math.floor(st.utcMin / 1440) * 1440 + minutes;
  afterTimeChange();
}

function togglePlay() {
  st.playing = !st.playing;
  syncTimeUI();
  requestFrame();
}

function togglePin(id) {
  st.pinned = st.pinned.includes(id)
    ? st.pinned.filter((x) => x !== id)
    : [...st.pinned, id].slice(-MAX_PINNED_CLOCKS);
  renderClocks();
  emit({ type: 'pin' });
  requestFrame();
}

// ---------- 展開動畫 ----------
function animateTo(target) {
  const dur = 2600 * Math.abs(target - st.t);
  if (dur < 40) {
    st.t = target;
    st.anim = null;
    onMorphChange();
    return;
  }
  st.anim = { from: st.t, to: target, start: performance.now(), dur };
  requestFrame();
}

function toggleMorph() {
  animateTo(st.t >= 0.5 ? 0 : 1);
}

function onMorphChange() {
  syncMorphUI();
  emit({ type: 'morph' });
  requestFrame();
}

const DEMOS = {
  flatten: () => animateTo(1),
  flattenGrid: () => {
    st.layers = new Set([...st.layers, 'grid15']);
    syncLayerChecks();
    animateTo(1);
  },
  showHemisphere: () => {
    st.layers = new Set([...st.layers, 'ewHemi', 'ewLon', 'ticks']);
    st.center = [170, 10];
    syncLayerChecks();
    animateTo(0);
  },
  play: () => {
    st.playing = true;
    syncTimeUI();
    requestFrame();
  },
  june: () => setSeason('june'),
  londonNoon: () => {
    st.playing = false;
    setTimeOfDay(720);
  },
};

function runDemo(action) {
  DEMOS[action]?.();
}

// ---------- 模式 ----------
function setMode(mode) {
  const previous = st.mode;
  st.mode = mode;
  st.layers = new Set(MODE_PRESETS[mode]);
  st.clicked = null;
  st.playing = false;
  canvas.classList.toggle('pick', FLAT_MODES.includes(mode));
  document.querySelector('.stage').classList.toggle('flat', FLAT_MODES.includes(mode));
  if (mode === 4 && !st.lonQuiz) newLonQuestion();
  if (FLAT_MODES.includes(mode)) animateTo(1);
  else if (FLAT_MODES.includes(previous)) animateTo(0);
  renderTabs();
  renderStageBar();
  renderPanel();
  requestFrame();
}

function viewCenter() {
  if (st.mode === 2) {
    return [wrapLon(subsolarLon(st.utcMin) - SUN_SCREEN_OFFSET), st.center[1]];
  }
  return st.center;
}

// ---------- 畫面與動畫迴圈 ----------
function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  size = { W: rect.width, H: rect.height, dpr };
  requestFrame();
}

function render() {
  if (size.W < 10 || size.H < 10) return;
  canvas.classList.toggle('scrollable', st.t > 0 || FLAT_MODES.includes(st.mode));
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  lastFrame = drawScene(ctx, stageGeometry(size.W, size.H, st.mode), viewCenter());
}

function requestFrame() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function tick(now) {
  rafId = 0;
  const dt = lastTick ? Math.min(100, now - lastTick) : 16;
  lastTick = now;
  let busy = false;

  if (st.anim) {
    busy = true;
    const { from, to, start, dur } = st.anim;
    const u = Math.min(1, Math.max(0, (now - start) / dur));
    st.t = from + (to - from) * u;
    if (u >= 1) st.anim = null;
    syncMorphUI();
    if (u >= 1) emit({ type: 'morph' });
  }
  if (st.playing) {
    busy = true;
    st.utcMin += (dt / 1000) * st.speed;
    afterTimeChange(true);
  }

  render();
  if (busy) rafId = requestAnimationFrame(tick);
  else lastTick = 0;
}

// ---------- 指標互動 ----------
function degreesPerPixel() {
  return 57.3 / stageGeometry(size.W, size.H, st.mode).radiusGlobe;
}

function rotateBy(dx, dy) {
  if (st.t > 0 || FLAT_MODES.includes(st.mode)) return;
  const k = degreesPerPixel();
  if (st.mode === 2) {
    st.utcMin += dx * k * 4; // 地球轉 1° = 4 分鐘
    st.center = [st.center[0], Math.max(-60, Math.min(60, st.center[1] + dy * k))];
    afterTimeChange();
    return;
  }
  st.center = [wrapLon(st.center[0] - dx * k), Math.max(-90, Math.min(90, st.center[1] + dy * k))];
  requestFrame();
}

function hitCity(x, y) {
  if (!st.layers.has('cities')) return null;
  const at = makePointer(lastFrame);
  let best = null;
  let bestDist = window.matchMedia('(pointer: coarse)').matches ? 26 : 16;
  CITIES.forEach((city) => {
    const p = at(city.lon, city.lat);
    if (!p) return;
    const dist = Math.hypot(p[0] - x, p[1] - y);
    if (dist < bestDist) {
      best = city;
      bestDist = dist;
    }
  });
  return best;
}

function onCityClick(city) {
  if (st.mode === 2) {
    togglePin(city.id);
  } else if (st.mode === 3) {
    assignPlace(st.calc.target, { id: city.id });
  } else if (st.mode === 4) {
    onMapClick(city.lon, city.lat);
  } else {
    st.clicked = { lon: city.lon, lat: city.lat, name: city.name };
    updateReadout();
    emit({ type: 'click', lat: city.lat, lon: city.lon, cityId: city.id });
    requestFrame();
  }
}

function onMapClick(lon, lat) {
  const point = { lon: Math.round(wrapLon(lon) * 10) / 10 + 0, lat: Math.round(lat * 10) / 10 + 0 };
  if (st.mode === 3) {
    assignPlace(st.calc.target, point);
    return;
  }
  if (st.mode === 4) {
    if (st.lonQuiz.checked && st.lonQuiz.correct) return; // 答對後要按「換一題」
    st.clicked = point;
    if (st.lonQuiz.checked) st.lonQuiz = { ...st.lonQuiz, checked: false };
    renderLon();
    requestFrame();
    return;
  }
  st.clicked = point;
  updateReadout();
  emit({ type: 'click', ...point });
  requestFrame();
}

function handleClick(e) {
  if (!lastFrame || lastFrame.kind === 'morph') return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const city = hitCity(x, y);
  if (city) {
    onCityClick(city);
    return;
  }
  const ll = invertPoint(lastFrame, x, y);
  if (ll) onMapClick(ll[0], ll[1]);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) {
    drag.moved = true;
    canvas.classList.add('dragging');
  }
  if (drag.moved) rotateBy(e.clientX - drag.lx, e.clientY - drag.ly);
  drag.lx = e.clientX;
  drag.ly = e.clientY;
});

const endDrag = (e) => {
  if (drag && !drag.moved && e.type === 'pointerup') handleClick(e);
  drag = null;
  canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

$('resetBtn').addEventListener('click', () => {
  st = initialState();
  applyBodyFlags();
  setMode(1);
});
$('teacherBtn').addEventListener('click', toggleTeacher);

// 鍵盤:方向鍵旋轉地球;模式二的左右鍵調整時間、空白鍵播放/暫停
const KEY_STEP = 40;
canvas.addEventListener('keydown', (e) => {
  const handled = () => e.preventDefault();
  if (st.mode === 2 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    st.utcMin += e.key === 'ArrowRight' ? 30 : -30;
    afterTimeChange();
    handled();
    return;
  }
  if (st.mode === 2 && e.key === ' ') {
    togglePlay();
    handled();
    return;
  }
  const moves = {
    ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP],
  };
  if (moves[e.key]) {
    rotateBy(...moves[e.key]);
    handled();
  }
});

new ResizeObserver(resize).observe(canvas);
setMode(1);
resize();
