// 教材內容:城市、圖層、任務、想一想。要改教學內容只需要改這個檔案。

const BASE_DATE_UTC = Date.UTC(2026, 9, 10); // 教材的「第 0 天」:10/10
const SUN_SCREEN_OFFSET = 55; // 地球畫面中,太陽在中央經線東側 55° 的位置
const MAX_PINNED_CLOCKS = 4;
const MODES = [1, 2, 3, 4];
const FLAT_MODES = [3, 4]; // 這些模式固定使用平面地圖
const BIG_TEXT_SCALE = 1.3; // 老師模式「大字」時,畫布文字的放大倍率

const SEASONS = [
  { id: 'equinox', label: '春分 / 秋分(直射赤道)' },
  { id: 'june', label: '夏至(直射北回歸線)' },
  { id: 'december', label: '冬至(直射南回歸線)' },
];

/** 老師模式的「課堂預設」:一鍵切換成某個講解畫面 */
const TEACHER_SCENES = {
  1: [
    { label: '只看赤道與本初經線', layers: ['equator', 'prime', 'ticks'] },
    { label: '南北半球', layers: ['equator', 'ns'] },
    { label: '東西經 vs 東西半球', layers: ['prime', 'dateLine', 'ewLon', 'ewHemi', 'ticks'] },
    { label: '緯度帶與五帶', layers: ['equator', 'latBands', 'fiveZones', 'ticks'] },
    { label: '空白地球(讓學生猜)', layers: [] },
  ],
  2: [
    { label: '只看晨昏線', layers: ['daynight'] },
    { label: '時區與當地時間', layers: ['zones', 'zoneNums', 'zoneTimes', 'daynight', 'cities'] },
    { label: '用日期上色看換日線', layers: ['zones', 'dateColor', 'zoneTimes', 'dateLine', 'daynight'] },
  ],
  3: [
    { label: '時區與換日線', layers: ['zones', 'zoneNums', 'dateLine', 'prime', 'cities'] },
    { label: '只看城市(不給時區提示)', layers: ['cities', 'dateLine'] },
  ],
  4: [
    { label: '給經度刻度(預設)', layers: ['prime', 'dateLine', 'grid15', 'ticks'] },
    { label: '對答案:顯示時區', layers: ['zones', 'zoneNums', 'prime', 'ticks'] },
    { label: '不給任何提示', layers: ['prime'] },
  ],
};

const CITIES = [
  { id: 'london', name: '倫敦', lat: 51.5, lon: -0.1, zone: 0 },
  { id: 'cairo', name: '開羅', lat: 30.0, lon: 31.2, zone: 2 },
  { id: 'moscow', name: '莫斯科', lat: 55.8, lon: 37.6, zone: 3 },
  { id: 'taipei', name: '台北', lat: 25.0, lon: 121.5, zone: 8 },
  { id: 'tokyo', name: '東京', lat: 35.7, lon: 139.7, zone: 9 },
  { id: 'sydney', name: '雪梨', lat: -33.9, lon: 151.2, zone: 10, label: { align: 'right' } },
  { id: 'auckland', name: '奧克蘭', lat: -36.9, lon: 174.8, zone: 12, label: { align: 'center', dy: 16 } },
  { id: 'saopaulo', name: '聖保羅', lat: -23.5, lon: -46.6, zone: -3 },
  { id: 'newyork', name: '紐約', lat: 40.7, lon: -74.0, zone: -5 },
  { id: 'la', name: '洛杉磯', lat: 34.0, lon: -118.2, zone: -8 },
];

const cityById = (id) => CITIES.find((c) => c.id === id);

const LAYER_GROUPS = [
  {
    title: '基本線',
    items: [
      { id: 'equator', label: '赤道 0°', swatch: '#e11d48' },
      { id: 'prime', label: '本初經線 0°', swatch: '#2563eb' },
      { id: 'dateLine', label: '180° 經線(國際換日線)', swatch: '#7c3aed' },
      { id: 'grid30', label: '經緯網 每 30°', swatch: '#94a3b8' },
      { id: 'grid15', label: '經緯網 每 15°', swatch: '#cbd5e1' },
      { id: 'ticks', label: '座標刻度數字', swatch: '#ffffff' },
      { id: 'cities', label: '城市', swatch: '#e4572e' },
    ],
  },
  {
    title: '半球與分區',
    items: [
      { id: 'ns', label: '南北半球', swatch: 'rgba(59,130,246,.45)' },
      { id: 'ewLon', label: '東經 / 西經(以 0°、180° 分)', swatch: 'rgba(16,185,129,.5)' },
      { id: 'ewHemi', label: '東半球 / 西半球(以 20°W、160°E 分)', swatch: 'rgba(245,158,11,.6)' },
      { id: 'latBands', label: '低緯 / 中緯 / 高緯(30°、60°)', swatch: 'rgba(234,179,8,.55)' },
      { id: 'fiveZones', label: '熱帶 / 溫帶 / 寒帶(回歸線、極圈)', swatch: 'rgba(234,88,12,.5)' },
    ],
  },
  {
    title: '時間與時區',
    items: [
      { id: 'zones', label: '24 個時區(每 15°)', swatch: 'rgba(59,130,246,.4)' },
      { id: 'zoneNums', label: '時區編號', swatch: '#ffffff' },
      { id: 'zoneTimes', label: '各時區當地時間', swatch: '#ffffff' },
      { id: 'dateColor', label: '依「日期」上色', swatch: 'rgba(244,114,182,.55)' },
      { id: 'daynight', label: '晝夜與晨昏線', swatch: '#1e293b' },
    ],
  },
];

const MODE_PRESETS = {
  1: ['equator', 'prime', 'grid30', 'ticks', 'cities'],
  2: ['zones', 'zoneNums', 'zoneTimes', 'daynight', 'prime', 'cities'],
  3: ['zones', 'zoneNums', 'dateLine', 'prime', 'cities'],
  4: ['prime', 'dateLine', 'grid15', 'ticks'], // 不顯示時區與城市,才需要自己算
};

const MODE_META = {
  1: {
    tab: '① 認識經緯線',
    short: '① 經緯線',
    title: '認識經緯線',
    intro: '拖曳地球轉一轉,點一下地圖讀座標;再把地球「展開」成平面地圖,看看經線和緯線有什麼改變。',
  },
  2: {
    tab: '② 看見時間流動',
    short: '② 時間',
    title: '看見時間流動',
    intro: '太陽固定在右邊,地球由西向東自轉。拖曳地球或按播放,看晨昏線掃過各個城市,想想為什麼東邊的時間比較早。',
  },
  3: {
    tab: '③ 東加西減演練',
    short: '③ 東加西減',
    title: '東加西減演練',
    intro: '選兩個地點,先猜對方現在幾點,再按「揭曉」。往東走加、往西走減;過了 180° 經線,日期要改。',
  },
  4: {
    tab: '④ 由時間找經度',
    short: '④ 找經度',
    title: '由時間找經度',
    intro: '反過來想:知道兩地的時間,就能推出這個地方的經度。時差 × 15° = 經度差;比倫敦晚在東邊、早在西邊。',
  },
};

const FOOTNOTE =
  '預設太陽直射赤道(春分、秋分),模式②可切換夏至、冬至。時間為各時區標準時間、不含日光節約時間。東西半球依康軒版:20°W 以東到 160°E 為東半球。';

/** 任務:test(evt) 回傳 true 就算完成。evt 由 main.js 的 emit() 送出 */
const TASKS = {
  1: [
    {
      id: 'equator-click',
      text: '打開「赤道」,然後在赤道上點一下',
      test: (e) => e.type === 'click' && st.layers.has('equator') && Math.abs(e.lat) <= 3,
    },
    {
      id: 'prime-click',
      text: '打開「本初經線」,在 0° 經線上點一下',
      test: (e) => e.type === 'click' && st.layers.has('prime') && Math.abs(wrapLon(e.lon)) <= 3,
    },
    {
      id: 'taipei-click',
      text: '點一下「台北」,讀出它的座標',
      test: (e) => e.type === 'click' && e.cityId === 'taipei',
    },
    {
      id: 'flatten',
      text: '把地球完全「展開」成平面地圖',
      test: (e) => e.type === 'morph' && st.t >= 0.99,
    },
    {
      id: 'east-but-west',
      text: '挑戰:找一個「東經」卻屬於「西半球」的位置(提示:打開東西半球)',
      test: (e) => {
        if (e.type !== 'click') return false;
        const c = classifyPoint(e.lat, e.lon);
        return c.ew === '東經' && c.hemisphereEW === '西半球';
      },
    },
  ],
  2: [
    {
      id: 'sunrise',
      text: '讓時間走動,看台北從黑夜進入白天(日出)',
      test: (e) => {
        if (e.type !== 'time') return false;
        const day = isCityInDay(cityById('taipei'));
        if (!day) st.flags.sawNight = true;
        return day && st.flags.sawNight === true;
      },
    },
    {
      id: 'london-noon',
      text: '把倫敦調到 12:00(太陽在 0° 正上方),讀出台北幾點',
      test: (e) => e.type === 'time' && Math.abs((((st.utcMin % 1440) + 1440) % 1440) - 720) <= 8,
    },
    {
      id: 'different-dates',
      text: '找到「兩個時鐘日期不同」的時刻',
      test: (e) => {
        if (e.type !== 'time' && e.type !== 'pin') return false;
        const dates = new Set(st.pinned.map((id) => localClock(st.utcMin, cityById(id).zone).dayOffset));
        return dates.size >= 2;
      },
    },
    {
      id: 'pin-sydney',
      text: '點地圖上的「雪梨」,把它加入時鐘',
      test: (e) => e.type === 'pin' && st.pinned.includes('sydney'),
    },
    {
      id: 'midnight-sun',
      text: '挑戰:把季節切到「夏至」,找出北極圈內一整天都是白天的證據',
      test: (e) => e.type === 'season' && st.season === 'june',
    },
  ],
  3: [
    {
      id: 'taipei-newyork',
      text: '選「台北 → 紐約」,先猜再揭曉',
      test: (e) => e.type === 'reveal' && e.pair === 'taipei>newyork',
    },
    {
      id: 'both-ways',
      text: '選「台北 → 洛杉磯」,往東和往西各揭曉一次,比較答案',
      test: (e) => {
        if (e.type !== 'reveal' || e.pair !== 'taipei>la') return false;
        const seen = (st.calc.seen[e.pair] ??= new Set());
        seen.add(e.direction);
        return seen.has('east') && seen.has('west');
      },
    },
    {
      id: 'cross-dateline',
      text: '找出一條「會跨過 180° 經線」的走法,看日期怎麼變',
      test: (e) => e.type === 'reveal' && e.route.crossesDateLine,
    },
  ],
};

TASKS[4] = [
  {
    id: 'lon-first',
    text: '解出第一題(點在正確的時區內)',
    test: (e) => e.type === 'lonCheck' && e.correct,
  },
  {
    id: 'lon-noon',
    text: '解出一題「某地正是中午 12:00」的題目',
    test: (e) => e.type === 'lonCheck' && e.correct && e.kind === 'noon',
  },
  {
    id: 'lon-three',
    text: '累積答對 3 題',
    test: (e) => e.type === 'lonCheck' && st.lonQuiz.solved >= 3,
  },
];

/** 想一想:demo 對應 main.js 的 DEMOS */
const QUIZZES = {
  1: [
    {
      q: '把地球攤成平面地圖時,北極點會變成什麼?',
      options: ['還是一個點', '一整條橫線(地圖最上緣)', '一個圓圈'],
      answer: 1,
      explain: '在球面上北極只是一個點;攤平後每條經線都要一樣長,所以北極被「拉長」成一條線。這就是平面地圖的變形。',
      demo: { label: '用地球展開驗證', action: 'flatten' },
    },
    {
      q: '東經 170° 的位置,屬於東半球還是西半球?',
      options: ['東半球', '西半球'],
      answer: 1,
      explain: '康軒版以 20°W 與 160°E 劃分東西半球。170°E 雖然是「東經」,卻在 160°E 以東,所以屬於西半球。東西經 ≠ 東西半球!',
      demo: { label: '把東西半球線打開', action: 'showHemisphere' },
    },
    {
      q: '從赤道往北極,地球上的緯線長度會怎樣?',
      options: ['越來越長', '都一樣長', '越來越短'],
      answer: 2,
      explain: '緯線是繞地球一圈的圓,越靠近極點圈越小。但平面地圖上每條緯線一樣長,所以高緯度的陸地(例如格陵蘭)看起來被放大了。',
      demo: { label: '展開地圖看緯線', action: 'flattenGrid' },
    },
  ],
  2: [
    {
      q: '太陽位置固定,地球自轉的方向是?',
      options: ['由西向東', '由東向西'],
      answer: 0,
      explain: '地球由西向東自轉。所以我們看到太陽「東升西落」,而且東邊的地方會先轉到面對太陽。',
      demo: { label: '播放自轉', action: 'play' },
    },
    {
      q: '倫敦正午 12:00 時,位在東邊的台北,時間比倫敦早還是晚?',
      options: ['早(比 12:00 小)', '晚(比 12:00 大)'],
      answer: 1,
      explain: '台北在倫敦東邊 8 個時區,先轉到太陽下方、先迎接日出,所以時間比較快:12:00 + 8 = 20:00。',
      demo: { label: '把倫敦調到 12:00', action: 'londonNoon' },
    },
    {
      q: '夏至(約 6 月 21 日)時,太陽直射在哪裡?',
      options: ['赤道', '北回歸線(23.5°N)', '南回歸線(23.5°S)'],
      answer: 1,
      explain: '夏至太陽直射北回歸線,北半球白天最長、北極圈內整天都是白天;冬至則直射南回歸線。台灣在北回歸線附近,所以夏至中午太陽幾乎在頭頂。',
      demo: { label: '切換到夏至', action: 'june' },
    },
    {
      q: '晨昏線掃過台北時,台北正在發生什麼?',
      options: ['日出或日落', '正中午', '半夜 12 點'],
      answer: 0,
      explain: '晨昏線是白天和黑夜的交界。地球自轉讓台北由夜進入晝時是日出,由晝進入夜時是日落。',
    },
  ],
  4: [
    {
      q: '倫敦 12:00 時,某地是 17:00。這個地方在倫敦的東邊還是西邊?',
      options: ['東邊', '西邊'],
      answer: 0,
      explain: '東邊先轉到太陽下方,時間比較快(晚)。某地比倫敦晚 5 小時,所以在東邊,約東經 75°。',
    },
    {
      q: '兩地的時間差 6 小時,經度大約差多少?',
      options: ['6°', '45°', '90°'],
      answer: 2,
      explain: '每 1 小時對應 15° 經度,6 小時 × 15° = 90°。',
    },
    {
      q: '某地的時間比倫敦早 3 小時,它的位置是?',
      options: ['東經 45°', '西經 45°'],
      answer: 1,
      explain: '比倫敦早(時間較慢)的在西邊;3 × 15° = 45°,所以是西經 45°。',
    },
  ],
  3: [
    {
      q: '從 A 地往「東」跨越 3 個時區,時間要怎麼算?',
      options: ['加 3 小時', '減 3 小時'],
      answer: 0,
      explain: '東邊較早看到太陽、時間較快 → 東加西減。',
    },
    {
      q: '往東越過國際換日線(180°),日期會怎樣?',
      options: ['多一天', '少一天', '不變'],
      answer: 1,
      explain: '往東越過換日線,日期減 1 天;往西越過,日期加 1 天。可以選台北→洛杉磯往東走驗證。',
    },
  ],
};
