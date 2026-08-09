/**
 * 無料サンプル記事がオフラインで読めるかを、Service Workerの事前保存リストから判定する。
 *
 * 「サンプル記事を一度も開かないままオフラインにすると読めない」不具合の再発を防ぐための確認。
 * ページを開いた時に保存されるかどうかではなく、インストール時点で保存対象に
 * 入っているかを見る。ここが抜けていると、機内モードでサンプル記事が開けない。
 *
 *   node tools/check-offline-precache.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ai-content-app');

const swSource = readFileSync(join(APP_DIR, 'sw.js'), 'utf8');
const article = JSON.parse(readFileSync(join(APP_DIR, 'content', 'lesson-01.json'), 'utf8'));

/** sw.js の配列リテラルから、事前保存されるパスを取り出す */
function precachedPaths(constantName) {
  const match = swSource.match(new RegExp(`${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));
}

const precached = new Set([...precachedPaths('SHELL_ASSETS'), ...precachedPaths('CONTENT_ASSETS')]);

// 無料サンプルの表示に必要なファイル一式
const required = ['content/lesson-01.json'];
for (const block of article.blocks) {
  if (block.type === 'figure' && block.src) required.push(block.src);
}

const missing = required.filter((path) => !precached.has(path));

if (missing.length) {
  console.error('NG: 無料サンプルがオフラインで読めません。事前保存されていないファイル:');
  for (const path of missing) console.error(`  - ${path}`);
  process.exit(1);
}

console.log(`OK: 無料サンプルに必要な${required.length}件はすべて事前保存の対象です`);
for (const path of required) console.log(`  - ${path}`);
