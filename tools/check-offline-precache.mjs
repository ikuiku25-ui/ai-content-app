/**
 * 無料記事がオフラインで読めるかを、Service Workerの事前保存リストから判定する。
 *
 * 「記事を一度も開かないままオフラインにすると読めない」不具合の再発を防ぐための確認。
 * ページを開いた時に保存されるかではなく、インストール時点で保存対象に入っているかを見る。
 *
 * 目次（content/index.json）に載っている全記事と、その記事が使う図解を対象とする。
 * 記事を増やしたら sw.js の CONTENT_ASSETS にも追加する必要があり、その漏れをここで拾う。
 *
 *   node tools/check-offline-precache.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ai-content-app');

const readJson = (relativePath) => JSON.parse(readFileSync(join(APP_DIR, relativePath), 'utf8'));

const swSource = readFileSync(join(APP_DIR, 'sw.js'), 'utf8');

/** sw.js の配列リテラルから、事前保存されるパスを取り出す */
function precachedPaths(constantName) {
  const match = swSource.match(new RegExp(`${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));
}

const precached = new Set([...precachedPaths('SHELL_ASSETS'), ...precachedPaths('CONTENT_ASSETS')]);

// 目次そのものが無いと一覧を出せない
const required = new Set(['content/index.json']);

const index = readJson('content/index.json');
const articles = index.articles ?? [];

if (!articles.length) {
  console.error('NG: content/index.json に記事が1本もありません');
  process.exit(1);
}

for (const entry of articles) {
  const articlePath = `content/${entry.id}.json`;
  required.add(articlePath);

  // 記事が読めなければ、図解の確認以前に公開できない
  let article;
  try {
    article = readJson(articlePath);
  } catch {
    console.error(`NG: 目次にある記事ファイルが読めません: ${articlePath}`);
    process.exit(1);
  }

  for (const block of article.blocks ?? []) {
    if (block.type === 'figure' && block.src) required.add(block.src);
  }
}

const missing = [...required].filter((path) => !precached.has(path));

if (missing.length) {
  console.error('NG: 無料記事がオフラインで読めません。sw.js の CONTENT_ASSETS に不足:');
  for (const path of missing) console.error(`  - ${path}`);
  process.exit(1);
}

// 画面が読み込むCSSとJSも、事前保存されていないとオフラインで動かない。
// ページにスクリプトを足して sw.js への追加を忘れる、という見落としを拾う。
const htmlFiles = [...precached].filter((path) => path.endsWith('.html'));
const missingAssets = [];

for (const htmlFile of htmlFiles) {
  const html = readFileSync(join(APP_DIR, htmlFile), 'utf8');
  const refs = [
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
  ];

  for (const ref of refs) {
    // 外部URLは対象外
    if (/^https?:/.test(ref)) continue;
    const path = ref.replace(/^\.\//, '');
    if (!precached.has(path)) missingAssets.push(`${htmlFile} → ${path}`);
  }
}

if (missingAssets.length) {
  console.error('NG: 画面が読み込むファイルが事前保存されていません。sw.js の SHELL_ASSETS に不足:');
  for (const item of missingAssets) console.error(`  - ${item}`);
  process.exit(1);
}

console.log(`OK: 記事${articles.length}本に必要な${required.size}件はすべて事前保存の対象です`);
for (const path of required) console.log(`  - ${path}`);
console.log(`OK: ${htmlFiles.length}枚の画面が読み込むCSS/JSも、すべて事前保存の対象です`);
