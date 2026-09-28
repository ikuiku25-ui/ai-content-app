/**
 * 画面上の操作パネル：視点プリセット、事業者ごとの表示切替、深さ強調スライダー、駅の情報。
 * 表示切替とスライダーの状態は、この端末のブラウザに覚えておく（次に開いたときも同じ状態）。
 */
const STORE_KEY = 'aichi-rail-settings';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {}; // プライベートブラウズなどで使えないときは、毎回初期状態で始める
  }
}
function saveSettings(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* 保存できなくても表示には影響しない */
  }
}

export function createUI({ companies, lines, lineColor, onViewChange, onCompanyToggle, onDepthScale, onInfoClose }) {
  const settings = { hidden: [], depth: 1, ...loadSettings() };
  const $ = (id) => document.getElementById(id);

  // iPhone Safari で、パネルの上をピンチしたときにページ全体が拡大されるのを防ぐ
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---- 視点
  document.querySelectorAll('#views button').forEach((b) =>
    b.addEventListener('click', () => onViewChange(b.dataset.view)));

  // ---- 表示設定パネル（スマホでは閉じた状態で始める）
  const panel = $('settings');
  const toggleBtn = $('settings-toggle');
  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
  };
  setOpen(innerWidth > 700);
  toggleBtn.addEventListener('click', () => setOpen(!panel.classList.contains('open')));

  const list = $('companies');
  for (const [company, info] of Object.entries(companies)) {
    const own = lines.filter((l) => l.company === company);
    // 地下鉄は路線ごとの色、他社は代表色を見本にする
    const swatches = (company === 'subway' ? own.map((l) => lineColor.get(l.id)) : [info.color])
      .map((c) => `<i style="background:${c}"></i>`).join('');
    const label = document.createElement('label');
    label.className = 'company';
    label.innerHTML = `<input type="checkbox"><span class="sw">${swatches}</span><span>${info.label}</span>`;
    const input = label.querySelector('input');
    input.checked = !settings.hidden.includes(company);
    input.addEventListener('change', () => {
      settings.hidden = input.checked ? settings.hidden.filter((c) => c !== company) : [...settings.hidden, company];
      saveSettings(settings);
      onCompanyToggle(company, input.checked);
    });
    list.appendChild(label);
  }

  const slider = $('depth');
  const out = $('depth-value');
  slider.value = settings.depth;
  out.textContent = `×${Number(settings.depth).toFixed(1)}`;
  slider.addEventListener('input', () => {
    settings.depth = Number(slider.value);
    out.textContent = `×${settings.depth.toFixed(1)}`;
    saveSettings(settings);
    onDepthScale(settings.depth);
  });

  // ---- 駅の情報
  const info = $('info');
  $('info-close').addEventListener('click', onInfoClose);

  return {
    hiddenCompanies: () => [...settings.hidden],
    depthScale: () => Number(settings.depth),
    setActiveView(name) {
      document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    },
    showInfo({ title, rows }) {
      $('info-title').textContent = title;
      const levels = [...new Set(rows.map((r) => r.level))];
      $('info-summary').textContent = `${rows.length}路線・${levels.join('／')}`;
      const body = $('info-rows');
      body.replaceChildren(...rows.map((r) => {
        const li = document.createElement('li');
        li.innerHTML = `<i style="background:${r.color}"></i><span class="ln"></span><span class="lv lv-${r.level}">${r.level}</span>`;
        // 駅名がグループ名と違うとき（栄町・名鉄名古屋など）は駅名も書く
        li.querySelector('.ln').textContent =
          `${r.company} ${r.line}${r.station !== title ? `（${r.station}）` : ''}`;
        return li;
      }));
      info.hidden = false;
      if (innerWidth <= 700) setOpen(false); // スマホでは設定パネルを閉じて情報を見やすく
    },
    hideInfo() {
      info.hidden = true;
    },
  };
}
