// 把 src/ 與 vendor/ 合併成一個可離線使用的 HTML 檔。
// 用法:node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

// geo-logic.mjs 是 ES module(為了讓 node 測試),放進一般 <script> 前要拿掉 export
const logic = read('src', 'geo-logic.mjs').replace(/^export \{[\s\S]*?\};?\s*$/m, '');

const app = [
  logic,
  read('src', 'scene-data.js'),
  read('src', 'projection.js'),
  read('src', 'renderer.js'),
  read('src', 'panel.js'),
  read('src', 'main.js'),
].join('\n');

const world = JSON.stringify(JSON.parse(read('vendor', 'countries-110m.json')));
const vendor = [
  read('vendor', 'd3.min.js'),
  read('vendor', 'topojson-client.min.js'),
  `const WORLD = ${world};`,
].join('\n;\n');

// 函式取代,避免內容中的 "$&" 之類被當成取代樣式
const html = read('src', 'index.template.html')
  .replace('/*INLINE:style*/', () => read('src', 'style.css'))
  .replace('/*INLINE:vendor*/', () => vendor.replace(/<\/script/gi, '<\\/script'))
  .replace('/*INLINE:app*/', () => app.replace(/<\/script/gi, '<\\/script'));

// 經緯度互動教材.html 給老師在本機直接開;index.html 是 GitHub Pages 網站的首頁(內容相同)
for (const name of ['經緯度互動教材.html', 'index.html']) {
  writeFileSync(join(root, name), html);
  console.log(`built ${name} (${(html.length / 1024).toFixed(0)} KB)`);
}
