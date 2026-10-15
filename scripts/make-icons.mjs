// Renders public/icon.svg to the PNG sizes iOS and Android want.
// Usage: node scripts/make-icons.mjs  (needs Playwright + Chromium)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself, so fill the square edge to edge.
  const square = svg.replace('rx="112"', 'rx="0"');
  await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${square}`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
