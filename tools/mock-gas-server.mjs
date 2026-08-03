/**
 * GASと同じ応答を返す確認用サーバー（開発専用）。
 *
 * Google側の設定が終わる前に、アプリの解錠フローを検証するために使う。
 * 公開対象の ai-content-app/ には含めない。
 *
 *   node tools/mock-gas-server.mjs
 *
 * 本物のGASに合わせて OPTIONS には応答しない。
 * アプリ側が誤ってCORSプリフライトを起こす作りになっていたら、
 * ここで本番と同じように失敗する。
 */
import { createServer } from 'node:http';

const PORT = 8787;

const normalize = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// 検証用のコード台帳。キーは手書きせず正規化して作る（書き間違いを防ぐため）
const codes = new Map(
  [
    { code: 'AI-TEST-TEST-TEST', status: '有効', maxDevices: 3 },
    { code: 'AI-DEAD-DEAD-DEAD', status: '無効', maxDevices: 3 },
    { code: 'AI-ONE1-ONE1-ONE1', status: '有効', maxDevices: 1 },
  ].map((entry) => [normalize(entry.code), entry])
);

/** code(正規化済み) -> Set<deviceId> */
const activations = new Map();

const FIGURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 200">
  <rect width="480" height="200" rx="12" fill="#ffffff"/>
  <rect x="16" y="16" width="448" height="168" rx="10" fill="#eef0fe" stroke="#c7cbf7" stroke-width="2"/>
  <text x="240" y="108" text-anchor="middle" font-family="sans-serif" font-size="22"
        font-weight="700" fill="#4338ca">有料記事の図解（確認用）</text>
</svg>`;

const article = {
  title: '購入者向け記事：AIへの指示の組み立て方',
  subtitle: '購入者限定',
  updatedAt: '2026-08-03',
  blocks: [
    {
      type: 'paragraph',
      text: 'これは確認用サーバーが返しているダミー記事です。本番ではスプレッドシートのarticleシートの内容がここに入ります。',
    },
    { type: 'heading', text: '指示は「役割・条件・形式」で組み立てる' },
    {
      type: 'paragraph',
      text: '思ったような答えが返ってこないときは、頼み方が曖昧なことがほとんどです。3つの要素を足すだけで、結果は大きく変わります。',
    },
    {
      type: 'list',
      items: [
        '役割: 誰として答えてほしいか（例: 経験10年の編集者として）',
        '条件: 守ってほしい制約（例: 300字以内、専門用語を使わない）',
        '形式: どんな形で欲しいか（例: 箇条書きで5つ）',
      ],
    },
    {
      type: 'figure',
      src: 'data:image/svg+xml;base64,' + Buffer.from(FIGURE_SVG, 'utf8').toString('base64'),
      alt: '有料記事の図解（確認用）',
      caption: '図解もGAS経由で届く（画像はデータURIとして埋め込まれる）',
    },
    { type: 'note', text: 'この記事は解錠の動作確認用サンプルです。' },
  ],
};

const fail = (error, message) => ({ ok: false, error, message });

function handle(request) {
  if (!request || typeof request !== 'object') {
    return fail('bad_request', 'リクエストの形式が正しくありません。');
  }

  const key = normalize(request.code);
  const entry = codes.get(key);

  if (request.action === 'check') {
    if (!request.code) return fail('bad_request', 'コードが指定されていません。');
    if (!entry) return fail('invalid_code', 'このコードは登録されていません。');
    if (entry.status !== '有効') return fail('revoked', 'このコードは現在ご利用いただけません。');
    return { ok: true, valid: true };
  }

  if (request.action !== 'unlock') {
    return fail('bad_request', 'リクエストの形式が正しくありません。');
  }

  if (!request.code || !request.deviceId) {
    return fail('bad_request', 'コードが入力されていません。');
  }
  if (!entry) {
    return fail('invalid_code', 'このコードは登録されていません。入力内容をご確認ください。');
  }
  if (entry.status !== '有効') {
    return fail('revoked', 'このコードは現在ご利用いただけません。');
  }

  const devices = activations.get(key) ?? new Set();
  if (!devices.has(request.deviceId)) {
    if (devices.size >= entry.maxDevices) {
      return fail(
        'device_limit',
        `このコードで利用できる端末数の上限（${entry.maxDevices}台）に達しています。`
      );
    }
    devices.add(request.deviceId);
    activations.set(key, devices);
  }

  return { ok: true, article };
}

createServer((req, res) => {
  const send = (status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };

  if (req.method === 'GET') {
    send(200, { ok: true, service: 'mock-gas', ready: true });
    return;
  }

  if (req.method !== 'POST') {
    // 本物のGASと同じく、プリフライトには応答しない
    res.writeHead(405).end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      send(200, fail('bad_request', 'リクエストの形式が正しくありません。'));
      return;
    }
    const result = handle(parsed);
    console.log(`${parsed.action ?? '?'} ${parsed.code ?? ''} -> ${result.ok ? 'ok' : result.error}`);
    send(200, result);
  });
}).listen(PORT, () => {
  console.log(`確認用GASサーバー: http://localhost:${PORT}/exec`);
  console.log('  有効なコード:     AI-TEST-TEST-TEST（3台まで）');
  console.log('  無効化済みコード: AI-DEAD-DEAD-DEAD');
  console.log('  1台限定のコード:  AI-ONE1-ONE1-ONE1');
});
