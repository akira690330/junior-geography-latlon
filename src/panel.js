// 介面:右側面板、舞台下方控制列。所有文字都用 textContent 寫入,不使用 innerHTML。

const ui = {};
const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else if (value !== false && value != null) el.setAttribute(key, value);
  }
  kids.flat().forEach((kid) => {
    if (kid == null || kid === false) return;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  });
  return el;
}

/** 像 replaceChildren,但會略過 null / false(原生 replaceChildren 會把 null 變成文字 "null") */
function setChildren(el, ...kids) {
  el.replaceChildren(...kids.flat()
    .filter((kid) => kid != null && kid !== false)
    .map((kid) => (kid.nodeType ? kid : document.createTextNode(String(kid)))));
}

function svgEl(tag, attrs = {}, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  kids.forEach((k) => el.append(k));
  return el;
}

// ---------- 上方分頁與舞台控制列 ----------
function renderTabs() {
  $('modeTabs').replaceChildren(
    ...MODES.map((m) =>
      h('button', {
        class: 'mode-btn', type: 'button', role: 'tab',
        'aria-selected': String(st.mode === m),
        onclick: () => setMode(m),
        'aria-label': MODE_META[m].tab,
      }, h('span', { class: 'full', text: MODE_META[m].tab }), h('span', { class: 'short', text: MODE_META[m].short }))),
  );
}

function renderStageBar() {
  const bar = $('stageBar');
  bar.replaceChildren();
  Object.assign(ui, { morph: null, morphBtn: null, playBtn: null, timeLabel: null, timeSlider: null, speed: null, season: null });
  if (FLAT_MODES.includes(st.mode)) {
    bar.append(h('div', {
      class: 'hint',
      text: st.mode === 3
        ? '點地圖上的城市或任何位置,就能設定 A / B 地點(先在右側按「🎯」選擇要設定哪一個)。'
        : '在地圖上點出你算出的位置,再按右側的「檢查答案」。',
    }));
    return;
  }
  ui.morph = h('input', {
    type: 'range', min: 0, max: 1000, value: Math.round(st.t * 1000), 'aria-label': '展開地圖',
    oninput: (e) => { st.anim = null; st.t = Number(e.target.value) / 1000; onMorphChange(); },
  });
  ui.morphBtn = h('button', { class: 'primary-btn', type: 'button', onclick: toggleMorph });
  bar.append(h('div', { class: 'bar-row' },
    h('span', { class: 'end', text: '立體地球' }), ui.morph, h('span', { class: 'end', text: '平面地圖' }), ui.morphBtn));
  syncMorphUI();
  if (st.mode === 1) bar.append(h('div', { class: 'hint', text: '拖曳或按方向鍵旋轉地球;點一下讀出座標。' }));

  if (st.mode === 2) {
    ui.playBtn = h('button', { class: 'primary-btn', type: 'button', onclick: togglePlay });
    ui.timeLabel = h('span', { class: 'time-label' });
    ui.timeSlider = h('input', {
      type: 'range', min: 0, max: 1439, step: 5, 'aria-label': '倫敦時間',
      oninput: (e) => setTimeOfDay(Number(e.target.value)),
    });
    ui.speed = h('select', { 'aria-label': '播放速度', onchange: (e) => { st.speed = Number(e.target.value); } },
      [[30, '0.5 小時/秒'], [60, '1 小時/秒'], [120, '2 小時/秒'], [240, '4 小時/秒']].map(([v, t]) =>
        h('option', { value: v, selected: v === st.speed, text: t })));
    bar.append(h('div', { class: 'bar-row' }, ui.playBtn, ui.timeLabel, ui.timeSlider, ui.speed));
    ui.season = h('select', { 'aria-label': '季節', onchange: (e) => setSeason(e.target.value) },
      SEASONS.map((s) => h('option', { value: s.id, selected: st.season === s.id, text: s.label })));
    bar.append(h('div', { class: 'bar-row' }, h('span', { class: 'end', text: '季節' }), ui.season,
      h('span', { class: 'hint', text: '拖曳地球(往右拖時間往後)、← → 調時間、空白鍵播放。' })));
    syncTimeUI();
  }
}

function syncMorphUI() {
  if (!ui.morph) return;
  ui.morph.value = Math.round(st.t * 1000);
  ui.morphBtn.textContent = st.t >= 0.5 ? '還原成立體地球' : '展開成平面地圖';
}

function syncTimeUI() {
  if (!ui.timeSlider) return;
  const c = localClock(st.utcMin, 0);
  ui.timeLabel.textContent = `倫敦 ${clockText(c)}(${dateLabel(c.dayOffset)})`;
  ui.timeSlider.value = ((Math.floor(st.utcMin) % 1440) + 1440) % 1440;
  ui.playBtn.textContent = st.playing ? '⏸ 暫停' : '▶ 播放';
}

// ---------- 右側面板 ----------
function renderPanel() {
  const panel = $('panel');
  panel.replaceChildren();
  Object.assign(ui, { readout: null, clocks: null, clockViews: [], calc: null, lon: null });
  const meta = MODE_META[st.mode];
  panel.append(h('section', { class: 'card' }, h('h2', { text: meta.title }), h('p', { text: meta.intro })));
  if (st.teacher) panel.append(renderTeacherCard());

  ui.tasksCard = h('section', { class: 'card' });
  panel.append(ui.tasksCard);
  renderTasks();

  if (st.mode === 2) panel.append(renderClocksCard());
  if (st.mode === 3) panel.append(renderCalcCard());
  if (st.mode === 4) panel.append(renderLonCard());
  if (!FLAT_MODES.includes(st.mode)) panel.append(renderReadoutCard());
  panel.append(renderLayersCard(), renderQuizCard(), h('p', { class: 'footnote', text: FOOTNOTE }));
}

function renderTeacherCard() {
  const check = (label, name) => h('label', {},
    h('input', { type: 'checkbox', checked: st[name], onchange: (e) => setTeacherOption(name, e.target.checked) }), label);
  return h('section', { class: 'card teacher-card' },
    h('h3', { text: '老師模式' }),
    check('鎖定圖層(學生不能自己開關)', 'lockLayers'),
    check('大字(投影用)', 'bigText'),
    h('div', { class: 'hint', text: '課堂預設:一鍵切換成講解用的畫面' }),
    h('div', { class: 'scene-list' }, TEACHER_SCENES[st.mode].map((scene) =>
      h('button', { class: 'scene-btn', type: 'button', text: scene.label, onclick: () => applyScene(scene.layers) }))),
  );
}

function renderTasks() {
  const list = TASKS[st.mode];
  const done = list.filter((t) => st.doneTasks.has(t.id)).length;
  setChildren(ui.tasksCard,
    h('h3', {}, '任務', h('small', { text: `${done} / ${list.length}` })),
    h('ul', { class: 'tasks' }, list.map((t) => {
      const isDone = st.doneTasks.has(t.id);
      return h('li', { class: isDone ? 'done' : '' },
        h('span', { class: 'box', text: isDone ? '✓' : '' }), h('span', { text: t.text }));
    })),
    done === list.length ? h('div', { class: 'all-done', text: '🎉 任務全部完成!接著挑戰下面的「想一想」。' }) : null,
  );
}

// ---------- 點擊讀數 ----------
function renderReadoutCard() {
  ui.readout = h('div', { class: 'readout-empty' });
  const card = h('section', { class: 'card' }, h('h3', { text: '點一下地圖,讀出位置' }), ui.readout);
  updateReadout();
  return card;
}

function updateReadout() {
  if (!ui.readout) return;
  if (!st.clicked) {
    ui.readout.className = 'readout-empty';
    ui.readout.replaceChildren('在地球(或地圖)上點一下,這裡會顯示座標與所在的區域。');
    return;
  }
  const { lat, lon, name } = st.clicked;
  const c = classifyPoint(lat, lon);
  const rows = [
    name ? ['位置', name] : null,
    ['緯度', `${formatLat(lat)}${c.special === '赤道' ? '(赤道上)' : ''}`],
    ['經度', `${formatLon(lon)}${c.special && c.special !== '赤道' ? `(${c.special})` : ''}`],
    ['南北半球', c.ns],
    ['東西經', c.ew],
    ['東西半球', `${c.hemisphereEW}(20°W~160°E 為東半球)`],
    ['緯度帶', c.latBand],
    ['五帶', c.zone5],
    ['所在時區', formatZone(zoneOfLon(lon))],
  ].filter(Boolean);
  ui.readout.className = '';
  ui.readout.replaceChildren(h('dl', { class: 'readout-grid' },
    rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
}

// ---------- 圖層 ----------
function renderLayersCard() {
  ui.layerInputs = {};
  const groups = LAYER_GROUPS.map((group) =>
    h('div', { class: 'layer-group' }, h('h4', { text: group.title }),
      group.items.map((item) => {
        const input = h('input', {
          type: 'checkbox', checked: st.layers.has(item.id), disabled: st.lockLayers,
          onchange: (e) => toggleLayer(item.id, e.target.checked),
        });
        ui.layerInputs[item.id] = input;
        return h('label', { class: 'layer-item' }, input,
          h('span', { class: 'swatch', style: `background:${item.swatch}` }), item.label);
      })));
  return h('details', { class: 'card', open: st.mode === 1 }, h('summary', { text: st.lockLayers ? '圖層(老師已鎖定)' : '圖層:想看哪些線?' }), groups);
}

function syncLayerChecks() {
  Object.entries(ui.layerInputs || {}).forEach(([id, input]) => { input.checked = st.layers.has(id); });
}

// ---------- 想一想 ----------
function renderQuizCard() {
  const quizzes = QUIZZES[st.mode];
  return h('section', { class: 'card' }, h('h3', { text: '想一想(先選,再看答案)' }),
    quizzes.map((quiz) => renderQuiz(quiz)));
}

function renderQuiz(quiz) {
  const explain = h('div', { class: 'explain', hidden: true });
  const buttons = quiz.options.map((label, i) => h('button', {
    class: 'opt', type: 'button', text: label,
    onclick: () => {
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === quiz.answer) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
      });
      setChildren(explain,
        `${i === quiz.answer ? '✅ 答對了!' : '❌ 再想想。'}${quiz.explain}`,
        quiz.demo ? h('div', {}, h('button', {
          class: 'primary-btn', type: 'button', text: quiz.demo.label, onclick: () => runDemo(quiz.demo.action),
        })) : null,
      );
      explain.hidden = false;
    },
  }));
  return h('div', { class: 'quiz' }, h('div', { class: 'q', text: quiz.q }), h('div', { class: 'opts' }, buttons), explain);
}

// ---------- 時鐘(模式 2) ----------
function renderClocksCard() {
  ui.clocks = h('div', { class: 'clocks' });
  const card = h('section', { class: 'card' },
    h('h3', {}, '城市時鐘', h('small', { text: `點地圖上的城市加入 / 移除(最多 ${MAX_PINNED_CLOCKS} 個)` })), ui.clocks);
  renderClocks();
  return card;
}

function renderClocks() {
  if (!ui.clocks) return;
  ui.clockViews = st.pinned.map((id) => makeClock(cityById(id)));
  ui.clocks.replaceChildren(...ui.clockViews.map((v) => v.el));
  if (!st.pinned.length) ui.clocks.replaceChildren(h('p', { text: '還沒有城市。點地圖上的城市就會出現時鐘。' }));
  updateClocks();
}

function makeClock(city) {
  const tick = (i) => {
    const a = (i * Math.PI) / 6;
    return svgEl('line', {
      x1: Math.sin(a) * 23, y1: -Math.cos(a) * 23, x2: Math.sin(a) * 27, y2: -Math.cos(a) * 27,
      stroke: 'currentColor', 'stroke-width': 1.5,
    });
  };
  const hourHand = svgEl('line', { x1: 0, y1: 2, x2: 0, y2: -14, stroke: 'currentColor', 'stroke-width': 3.2, 'stroke-linecap': 'round' });
  const minHand = svgEl('line', { x1: 0, y1: 3, x2: 0, y2: -21, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' });
  const face = svgEl('svg', { viewBox: '-30 -30 60 60', width: 58, height: 58, 'aria-hidden': 'true' },
    svgEl('circle', { r: 29, fill: 'rgba(255,255,255,.18)', stroke: 'currentColor', 'stroke-width': 1.5 }),
    ...d3.range(12).map(tick), hourHand, minHand);
  const digital = h('div', { class: 'dg' });
  const date = h('div', { class: 'dt' });
  const el = h('div', { class: 'clock-card' }, face,
    h('div', {}, h('div', { class: 'nm', text: city.name }), h('div', { class: 'zn', text: formatZone(city.zone) }), digital, date),
    h('button', { type: 'button', text: '移除', onclick: () => togglePin(city.id) }));
  return {
    el,
    update() {
      const c = localClock(st.utcMin, city.zone);
      const day = isCityInDay(city);
      hourHand.setAttribute('transform', `rotate(${(c.hour % 12 + c.minute / 60) * 30})`);
      minHand.setAttribute('transform', `rotate(${c.minute * 6})`);
      digital.textContent = clockText(c);
      date.textContent = `${dateLabel(c.dayOffset)} ${day ? '☀ 白天' : '🌙 夜晚'}`;
      el.classList.toggle('day', day);
      el.classList.toggle('night', !day);
    },
  };
}

function updateClocks() {
  (ui.clockViews || []).forEach((v) => v.update());
}

// ---------- 東加西減計算器(模式 3) ----------
function renderCalcCard() {
  ui.calc = h('section', { class: 'card' });
  renderCalc();
  return ui.calc;
}

function placeSelect(slot) {
  const current = st.calc[slot];
  const options = CITIES.map((c) => h('option', { value: c.id, selected: current.id === c.id, text: c.name }));
  if (!current.id) options.push(h('option', { value: 'custom', selected: true, text: '自選點(地圖上點的)' }));
  return h('select', {
    'aria-label': `${slot} 地點`,
    onchange: (e) => {
      if (e.target.value === 'custom') return;
      st.calc[slot] = { id: e.target.value };
      resetPrediction();
    },
  }, options);
}

function placeRow(slot) {
  const label = slot === 'a' ? 'A 出發' : 'B 目的';
  return h('div', { class: 'place-row' }, h('label', { text: label }), placeSelect(slot),
    h('button', {
      class: `pick-btn${st.calc.target === slot ? ' active' : ''}`, type: 'button', title: '接著點地圖設定這個地點',
      onclick: () => { st.calc.target = slot; renderCalc(); },
      text: st.calc.target === slot ? '🎯 點地圖' : '🎯',
    }));
}

function hourOptions(selected, placeholder) {
  return [
    placeholder ? h('option', { value: '', selected: selected == null, text: placeholder }) : null,
    ...d3.range(24).map((hr) => h('option', { value: hr, selected: selected === hr, text: `${pad2(hr)}:00` })),
  ];
}

function renderCalc() {
  if (!ui.calc) return;
  const rv = currentRouteView();
  const { a, b } = rv;
  const east = routeInfo(a.lon, b.lon, 'east');
  const west = routeInfo(a.lon, b.lon, 'west');
  const dirBtn = (dir, r, text) => h('button', {
    type: 'button', 'aria-pressed': String(st.calc.direction === dir),
    onclick: () => changeDirection(dir),
    text: `${text}(${r.zones} 個時區)${r.shorter ? ' ★' : ''}`,
  });
  const guessReady = st.calc.guessDay != null && st.calc.guessHour != null;

  setChildren(ui.calc,
    h('h3', { text: '東加西減計算器' }),
    h('button', { class: 'rand-btn', type: 'button', text: '🎲 隨機出一題', onclick: randomQuestion }),
    placeRow('a'), placeRow('b'),
    h('div', { class: 'field' }, `${dateLabel(0)} 當天,A 地現在`,
      h('select', {
        'aria-label': 'A 地時間',
        onchange: (e) => { st.calc.hourA = Number(e.target.value); resetPrediction(); },
      }, hourOptions(st.calc.hourA))),
    h('div', { class: 'seg' }, dirBtn('east', east, '往東走 →'), dirBtn('west', west, '← 往西走')),
    h('div', { class: 'hint', text: '★ 是比較近的走法。兩種走法都可以算,答案會一樣喔!' }),
    h('div', { class: 'field' }, `先猜:${b.name}現在是`,
      h('select', {
        'aria-label': '猜日期',
        onchange: (e) => { st.calc.guessDay = e.target.value === '' ? null : Number(e.target.value); renderCalc(); },
      }, [
        h('option', { value: '', selected: st.calc.guessDay == null, text: '日期?' }),
        ...[-1, 0, 1].map((d) => h('option', { value: d, selected: st.calc.guessDay === d, text: dateLabel(d) })),
      ]),
      h('select', {
        'aria-label': '猜時間',
        onchange: (e) => { st.calc.guessHour = e.target.value === '' ? null : Number(e.target.value); renderCalc(); },
      }, hourOptions(st.calc.guessHour, '時間?'))),
    h('button', { class: 'primary-btn', type: 'button', disabled: !guessReady, onclick: revealAnswer, text: '揭曉答案' }),
    st.calc.revealed ? renderCalcResult(rv, east, west) : null,
  );
}

function renderCalcResult(rv, east, west) {
  const { a, b, route } = rv;
  const other = route.direction === 'east' ? west : east;
  const hourA = st.calc.hourA;
  const tb = timeAtB({ hour: hourA, minute: 0 }, route);
  const dirWord = route.direction === 'east' ? '東' : '西';
  const sign = route.hourShift > 0 ? '+' : route.hourShift < 0 ? '−' : '±';
  const raw = hourA + route.hourShift;
  const carry = raw >= 24 ? '超過 24 時 → 減 24,日期 +1' : raw < 0 ? '小於 0 時 → 加 24,日期 −1' : null;
  const answer = `${dateLabel(tb.dayOffset)} ${clockText(tb)}`;
  const right = st.calc.guessDay === tb.dayOffset && st.calc.guessHour === tb.hour;
  const otherTb = timeAtB({ hour: hourA, minute: 0 }, other);
  const otherWord = other.direction === 'east' ? '東' : '西';
  const otherSign = other.hourShift > 0 ? '+' : other.hourShift < 0 ? '−' : '±';

  const steps = [
    h('li', {}, h('strong', { text: '① 找時區:' }), `${a.name}在 ${formatZone(route.zoneA)},${b.name}在 ${formatZone(route.zoneB)}`),
    h('li', {}, h('strong', { text: '② 數時區:' }),
      route.zones === 0
        ? '兩地在同一個時區,時間相同。'
        : `往${dirWord}走,跨越 ${route.zones} 個時區(約 ${route.zones * 15}°)→ 東加西減 → ${sign}${route.zones} 小時`),
    h('li', {}, h('strong', { text: '③ 看換日線:' }),
      route.crossesDateLine
        ? `經過 180° 經線 → 日期 ${route.dateDelta > 0 ? '+1' : '−1'} 天`
        : '沒有經過 180° 經線 → 日期不變'),
    h('li', {}, h('strong', { text: '④ 算時間:' }),
      `${hourA} 時 ${route.hourShift >= 0 ? '+' : '−'} ${Math.abs(route.hourShift)} = ${raw} 時`,
      carry ? `(${carry})` : null,
      ` → ${b.name}是 ${answer}`),
  ];
  return h('div', {},
    h('ul', { class: 'steps' }, steps),
    h('div', { class: `verdict ${right ? 'ok' : 'no'}`,
      text: right ? `✅ 答對了!${b.name}是 ${answer}` : `❌ 差一點。正確答案是 ${answer}` }),
    h('div', { class: 'compare' },
      `換另一條路(往${otherWord}):跨 ${other.zones} 個時區 ${otherSign}${Math.abs(other.hourShift)} 小時,` +
      `${other.crossesDateLine ? `過換日線日期 ${other.dateDelta > 0 ? '+1' : '−1'}` : '不過換日線'},` +
      `結果 ${dateLabel(otherTb.dayOffset)} ${clockText(otherTb)}` +
      `${otherTb.dayOffset === tb.dayOffset && otherTb.hour === tb.hour ? ' —— 一模一樣!' : ' —— 不一樣?請檢查!'}`),
  );
}

// ---------- 由時間找經度(模式 4) ----------
function renderLonCard() {
  ui.lon = h('section', { class: 'card' });
  renderLon();
  return ui.lon;
}

function lonQuestionText(q) {
  const london = `倫敦現在是 ${dateLabel(q.london.dayOffset)} ${clockText(q.london)}`;
  return q.kind === 'noon'
    ? `${london};某地正好是中午 12:00(太陽在頭頂)。`
    : `${london};某地現在是 ${dateLabel(q.other.dayOffset)} ${clockText(q.other)}。`;
}

function diffOptionLabel(n) {
  if (n === 0) return '一樣(同一個時區)';
  return n > 0 ? `比倫敦晚 ${n} 小時` : `比倫敦早 ${-n} 小時`;
}

function conversionText(n) {
  if (n === 0) return '時差 0 小時 → 在 0° 經線(本初經線)附近。';
  const deg = Math.abs(n) * 15;
  return `${n > 0 ? '比倫敦晚 → 在東邊 → 東經' : '比倫敦早 → 在西邊 → 西經'}:${Math.abs(n)} × 15° = ${deg}°${deg === 180 ? '(換日線附近)' : ''}`;
}

function renderLonResult(quiz) {
  const q = quiz.question;
  const city = cityById(q.targetId);
  const diff = zoneFromClocks(q.london, q.other);
  const here = localClock(q.london.hour * 60, quiz.clickedZone);
  const steps = h('ul', { class: 'steps' },
    h('li', {}, h('strong', { text: '① 算時差:' }),
      q.kind === 'noon'
        ? `某地 12:00,倫敦 ${clockText(q.london)} → 某地比倫敦${diff > 0 ? '晚' : '早'} ${Math.abs(diff)} 小時`
        : `${clockText(q.other)}(${dateLabel(q.other.dayOffset)})與 ${clockText(q.london)}(${dateLabel(q.london.dayOffset)})相差 ${Math.abs(diff)} 小時,某地比較${diff > 0 ? '晚' : '早'}`),
    h('li', {}, h('strong', { text: '② 換成經度:' }), conversionText(diff)),
  );
  const wrongDiff = quiz.diffGuess != null && quiz.diffGuess !== diff;
  return h('div', {},
    h('div', { class: `verdict ${quiz.correct ? 'ok' : 'no'}`,
      text: quiz.correct
        ? `✅ 答對了!這個地方是${city.name}(${formatZone(q.zone)},標準經線 ${formatLon(lonOfZone(q.zone))})`
        : `❌ 你點的位置在 ${formatZone(quiz.clickedZone)},倫敦 ${clockText(q.london)} 時那裡會是 ${clockText(here)}(${dateLabel(here.dayOffset)}),跟題目不同。再試一次!` }),
    wrongDiff ? h('div', { class: 'compare', text: `你選的時差是「${diffOptionLabel(quiz.diffGuess)}」,正確是「${diffOptionLabel(diff)}」。` }) : null,
    quiz.correct ? steps : null,
  );
}

function renderLon() {
  if (!ui.lon || !st.lonQuiz) return;
  const quiz = st.lonQuiz;
  const diff = zoneFromClocks(quiz.question.london, quiz.question.other);
  const locked = quiz.checked && quiz.correct;
  setChildren(ui.lon,
    h('h3', {}, '由時間找經度', h('small', { text: `已答對 ${quiz.solved} 題` })),
    h('div', { class: 'big-question', text: lonQuestionText(quiz.question) }),
    h('p', { text: '這個地方大約在哪個經度?' }),
    h('div', { class: 'field' }, '① 算時差:',
      h('select', {
        'aria-label': '兩地時差', disabled: locked,
        onchange: (e) => { setLonQuiz({ diffGuess: e.target.value === '' ? null : Number(e.target.value) }); },
      }, [
        h('option', { value: '', selected: quiz.diffGuess == null, text: '時差?' }),
        ...d3.range(-12, 13).map((n) => h('option', { value: n, selected: quiz.diffGuess === n, text: diffOptionLabel(n) })),
      ])),
    quiz.diffGuess != null ? h('div', { class: 'hint', text: conversionText(quiz.diffGuess) }) : null,
    h('div', { class: 'field' }, '② 在地圖上點出位置:',
      h('strong', { text: st.clicked ? `${formatLon(st.clicked.lon)}(${formatZone(zoneOfLon(st.clicked.lon))})` : '還沒點' })),
    h('div', { class: 'seg' },
      h('button', { type: 'button', text: '💡 提示', onclick: () => setLonQuiz({ hint: true }) }),
      h('button', { type: 'button', text: '🎲 換一題', onclick: newLonQuestion })),
    quiz.hint ? h('div', { class: 'compare', text: `提示:兩地相差 ${Math.abs(diff)} 小時,某地比倫敦${diff > 0 ? '晚,在東邊(東經)' : '早,在西邊(西經)'}。每小時 15°。` }) : null,
    h('div', { class: 'field' }, h('button', {
      class: 'primary-btn', type: 'button', disabled: !st.clicked || locked, onclick: checkLonQuiz, text: '檢查答案' })),
    quiz.checked ? renderLonResult(quiz) : null,
  );
}
