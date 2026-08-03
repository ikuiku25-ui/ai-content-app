/**
 * AI学習アプリ — バックエンド（Google Apps Script）
 *
 * このスクリプトを貼り付けたスプレッドシートに、次の3枚のシートを用意すること。
 *   codes       … 発行済みコードの台帳
 *   activations … どのコードがどの端末で使われたかの記録（自動で増える）
 *   article     … 有料記事の本文
 *
 * デプロイ手順:
 *   デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *   次のユーザーとして実行: 自分
 *   アクセスできるユーザー: 全員
 *   発行されたURLをアプリの config.js に設定する
 */

const SHEET_CODES = 'codes';
const SHEET_ACTIVATIONS = 'activations';
const SHEET_ARTICLE = 'article';

// codesシートのmaxDevicesが空欄だったときに使う既定値
const DEFAULT_MAX_DEVICES = 3;

// コード生成に使う文字。紛らわしい 0/O、1/I/L は除いてある
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// ---- 入口 ---------------------------------------------------------------

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);

    if (request.action === 'unlock') return jsonResponse(unlock(request));
    if (request.action === 'check') return jsonResponse(check(request));

    return jsonResponse(failure('bad_request', 'リクエストの形式が正しくありません。'));
  } catch (error) {
    console.error(error);
    return jsonResponse(failure('server_error', 'サーバー側でエラーが発生しました。'));
  }
}

// 動作確認用。ブラウザでURLを開くとこれが返る
function doGet() {
  return jsonResponse({ ok: true, service: 'ai-content-app', ready: true });
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function failure(error, message) {
  return { ok: false, error: error, message: message };
}

// ---- 処理 ---------------------------------------------------------------

function unlock(request) {
  if (!request.code || !request.deviceId) {
    return failure('bad_request', 'コードが入力されていません。');
  }

  // 同時に複数の解錠が走ると端末数の数え間違いが起きるため、順番に処理する
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const entry = findCode(request.code);
    if (!entry) {
      return failure('invalid_code', 'このコードは登録されていません。入力内容をご確認ください。');
    }
    if (String(entry.row.status).trim() !== '有効') {
      return failure('revoked', 'このコードは現在ご利用いただけません。');
    }

    const registration = registerDevice(entry, request.deviceId);
    if (!registration.ok) return registration;

    return { ok: true, article: readArticle() };
  } finally {
    lock.releaseLock();
  }
}

function check(request) {
  if (!request.code) return failure('bad_request', 'コードが指定されていません。');

  const entry = findCode(request.code);
  if (!entry) return failure('invalid_code', 'このコードは登録されていません。');
  if (String(entry.row.status).trim() !== '有効') {
    return failure('revoked', 'このコードは現在ご利用いただけません。');
  }
  return { ok: true, valid: true };
}

/**
 * 端末を登録する。すでに登録済みの端末なら何度でも通す。
 * 新しい端末は上限台数まで。
 */
function registerDevice(entry, deviceId) {
  const sheet = getSheet(SHEET_ACTIVATIONS);
  const rows = readRows(SHEET_ACTIVATIONS);
  const now = new Date();

  const sameCode = rows.filter((r) => normalizeCode(r.code) === entry.normalized);
  const existingIndex = sameCode.findIndex((r) => String(r.deviceId) === String(deviceId));

  if (existingIndex >= 0) {
    // 再ダウンロード。最終利用日時だけ更新する
    const rowNumber = sameCode[existingIndex]._rowNumber;
    const lastUsedColumn = headerIndex(SHEET_ACTIVATIONS, 'lastUsedAt');
    if (lastUsedColumn > 0) sheet.getRange(rowNumber, lastUsedColumn).setValue(now);
    return { ok: true };
  }

  const maxDevices = Number(entry.row.maxDevices) > 0
    ? Number(entry.row.maxDevices)
    : DEFAULT_MAX_DEVICES;

  if (sameCode.length >= maxDevices) {
    return failure(
      'device_limit',
      'このコードで利用できる端末数の上限（' + maxDevices + '台）に達しています。'
    );
  }

  sheet.appendRow([entry.row.code, deviceId, now, now]);
  return { ok: true };
}

/**
 * 記事シートを読んで、アプリが描画できる形に組み立てる。
 */
function readArticle() {
  const rows = readRows(SHEET_ARTICLE);
  const article = { title: '', subtitle: '', updatedAt: '', blocks: [] };

  rows.forEach((row) => {
    const type = String(row.type || '').trim();
    const text = String(row.text || '').trim();

    if (type === 'title') {
      article.title = text;
      return;
    }
    if (type === 'subtitle') {
      article.subtitle = text;
      return;
    }

    if (type === 'heading' || type === 'paragraph' || type === 'note') {
      if (text) article.blocks.push({ type: type, text: text });
      return;
    }

    if (type === 'list') {
      const items = String(row.items || '')
        .split('\n')
        .map(function (item) { return item.trim(); })
        .filter(function (item) { return item.length > 0; });
      if (items.length) article.blocks.push({ type: 'list', items: items });
      return;
    }

    if (type === 'figure') {
      const dataUri = driveImageDataUri(row.src);
      // 読めない画像はブロックごと省く。記事全体が壊れるより良い
      if (dataUri) {
        article.blocks.push({
          type: 'figure',
          src: dataUri,
          alt: String(row.caption || '').trim(),
          caption: String(row.caption || '').trim(),
        });
      }
      return;
    }
    // 未知のtypeは無視する
  });

  article.updatedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  return article;
}

/**
 * GoogleドライブのファイルIDから画像を読み、データURIに変換する。
 * ドライブを公開せずに画像を渡せる。
 */
function driveImageDataUri(source) {
  const raw = String(source || '').trim();
  if (!raw) return null;

  // 共有URLが貼られていてもファイルIDを取り出せるようにする
  const match = raw.match(/[-\w]{25,}/);
  const fileId = match ? match[0] : raw;

  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (error) {
    console.error('画像を読めませんでした: ' + fileId);
    return null;
  }
}

// ---- シート操作 ---------------------------------------------------------

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('シートが見つかりません: ' + name);
  return sheet;
}

/**
 * 1行目を見出しとして、各行をオブジェクトの配列で返す。
 * _rowNumber には実際の行番号（1始まり）が入る。
 */
function readRows(sheetName) {
  const values = getSheet(sheetName).getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function (h) { return String(h).trim(); });

  return values.slice(1).map(function (row, index) {
    const record = { _rowNumber: index + 2 };
    headers.forEach(function (header, column) {
      if (header) record[header] = row[column];
    });
    return record;
  });
}

function headerIndex(sheetName, headerName) {
  const headers = getSheet(sheetName).getDataRange().getValues()[0] || [];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === headerName) return i + 1;
  }
  return -1;
}

/**
 * 入力ゆれを吸収する。小文字・ハイフンなし・空白混じりでも同じコードとして扱う。
 */
function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  const rows = readRows(SHEET_CODES);
  for (let i = 0; i < rows.length; i++) {
    if (normalizeCode(rows[i].code) === normalized) {
      return { row: rows[i], normalized: normalized };
    }
  }
  return null;
}

// ---- コード発行の補助 ---------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AI学習アプリ')
    .addItem('コードを発行', 'issueCode')
    .addSeparator()
    .addItem('シートを準備する（最初に1回）', 'setupSheets')
    .addToUi();
}

/**
 * 必要な3枚のシートを見出し付きで作る。既にあるシートには触れない。
 * 最初に1回だけ実行する。手作業での作り間違いを防ぐためのもの。
 */
function setupSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  const definitions = [
    { name: SHEET_CODES, headers: ['code', 'status', 'maxDevices', 'note', 'issuedAt'] },
    { name: SHEET_ACTIVATIONS, headers: ['code', 'deviceId', 'firstUsedAt', 'lastUsedAt'] },
    { name: SHEET_ARTICLE, headers: ['type', 'text', 'items', 'src', 'caption'] },
  ];

  const created = [];
  definitions.forEach(function (definition) {
    if (spreadsheet.getSheetByName(definition.name)) return;

    const sheet = spreadsheet.insertSheet(definition.name);
    sheet.appendRow(definition.headers);
    sheet.getRange(1, 1, 1, definition.headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    created.push(definition.name);
  });

  // 記事シートが空なら、書き方の見本を入れておく
  const articleSheet = spreadsheet.getSheetByName(SHEET_ARTICLE);
  if (articleSheet.getLastRow() <= 1) {
    articleSheet.appendRow(['title', 'ここに記事のタイトルを書きます', '', '', '']);
    articleSheet.appendRow(['subtitle', '購入者限定', '', '', '']);
    articleSheet.appendRow(['paragraph', 'ここに本文を書きます。1行が1ブロックです。', '', '', '']);
    articleSheet.appendRow(['heading', '見出しはこの行のように書きます', '', '', '']);
    articleSheet.appendRow(['list', '', '1つ目の項目\n2つ目の項目', '', '']);
    articleSheet.appendRow(['figure', '', '', 'GoogleドライブのファイルID', '図の説明']);
    articleSheet.appendRow(['note', '補足はこの行のように書きます', '', '', '']);
  }

  SpreadsheetApp.getUi().alert(
    created.length
      ? '次のシートを作成しました:\n\n' + created.join('\n')
      : '必要なシートはすべて揃っています。'
  );
}

/**
 * codesシートに新しいコードを1行追加する。
 */
function issueCode() {
  const code = generateCode();
  getSheet(SHEET_CODES).appendRow([code, '有効', DEFAULT_MAX_DEVICES, '', new Date()]);
  SpreadsheetApp.getUi().alert('新しいコードを発行しました:\n\n' + code);
}

function generateCode() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
    }
    groups.push(group);
  }
  return 'AI-' + groups.join('-');
}
