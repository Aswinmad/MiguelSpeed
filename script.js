  const THEMES = ['light','dark','auto'];
const ICONS  = { light: 'light_mode', dark: 'dark_mode', auto: 'routine' };
let currentTheme = localStorage.getItem('ms_theme') || 'auto';

function applyTheme(t) {
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
  document.body.classList.toggle('dark', dark);
  document.getElementById('themeIcon').textContent = ICONS[t];
}
applyTheme(currentTheme);
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
  if (currentTheme === 'auto') applyTheme('auto');
});

document.getElementById('themeBtn').addEventListener('click', () => {
  const idx = THEMES.indexOf(currentTheme);
  currentTheme = THEMES[(idx + 1) % THEMES.length];
  localStorage.setItem('ms_theme', currentTheme);
  applyTheme(currentTheme);
});

document.getElementById('logoBtn').addEventListener('click', () => showScreen('screen-home'));

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active','visible'));
  const el = document.getElementById(id);
  el.classList.add('active');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
}

const setProgress = pct => { document.getElementById('progressBar').style.width = pct + '%'; };
const resetProgress = () => setProgress(0);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fmt(val, unit) {
  if (val >= 100) return Math.round(val) + unit;
  if (val >= 10)  return val.toFixed(1) + unit;
  return val.toFixed(2) + unit;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3400);
}

function makeRandomBuffer(bytes) {
  const buf = new Uint8Array(bytes);
  for (let off = 0; off < bytes; off += 65536)
    crypto.getRandomValues(buf.subarray(off, Math.min(off + 65536, bytes)));
  return buf;
}

function rateSpeed(mbps) {
  if (mbps >= 25) return ['great','Great'];
  if (mbps >= 5)  return ['good','Good'];
  return ['poor','Slow'];
}
function ratePing(ms) {
  if (ms <= 40)  return ['great','Excellent'];
  if (ms <= 100) return ['good','Good'];
  return ['poor','High'];
}
function setRating(id, cls, lbl) {
  const el = document.getElementById(id);
  el.className = 'rating ' + cls;
  el.textContent = lbl;
}

async function measurePing() {
  const endpoint = 'https://www.google.com/generate_204';
  const samples = 8, times = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    try { await fetch(endpoint + '?_=' + Date.now(), { cache: 'no-store', mode: 'no-cors' }); } catch(_) {}
    times.push(performance.now() - t0);
    await sleep(60);
  }
  times.sort((a,b) => a - b);
  return Math.round(times.slice(0, 5).reduce((a,b) => a + b) / 5);
}

async function measureDownload(onProgress, onLive) {
  const SIZE = 10_000_000; // 10 MB per stream
  const STREAMS = 3;
  const TOTAL = SIZE * STREAMS;
  let loaded = 0;
  const start = performance.now();
  let lastLive = start;

  const readers = await Promise.all(
    Array.from({ length: STREAMS }, (_, i) =>
      fetch(`https://httpbin.org/bytes/${SIZE}?_=${Date.now()}_${i}`, { cache: 'no-store' })
        .then(r => r.body.getReader())
        .catch(() => null)
    )
  );

  await Promise.all(readers.map(async reader => {
    if (!reader) return;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.length;
      const now = performance.now();
      onProgress(Math.min(loaded / TOTAL * 100, 99));
      if (now - lastLive > 250) {
        const sec = (now - start) / 1000;
        if (sec > 0.3) onLive(fmt(loaded / sec / 1_000_000, ' MB/s'));
        lastLive = now;
      }
    }
  }));

  const sec = (performance.now() - start) / 1000;
  return { MBps: loaded / sec / 1_000_000, Mbps: loaded * 8 / sec / 1_000_000 };
}

async function measureUpload(onProgress, onLive) {
  const CHUNK = 512_000; // 512 KB — safely under any limit
  const ROUNDS = 12, PARALLEL = 2;
  const TOTAL = CHUNK * ROUNDS * PARALLEL;
  let uploaded = 0;
  const start = performance.now();
  let lastLive = start;

  for (let r = 0; r < ROUNDS; r++) {
    const data = makeRandomBuffer(CHUNK);
    await Promise.all(Array.from({ length: PARALLEL }, () =>
      fetch(`https://httpbin.org/post?_=${Date.now()}${Math.random()}`, {
        method: 'POST', body: data.slice(),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/octet-stream' }
      }).catch(() => {})
    ));
    uploaded += CHUNK * PARALLEL;
    const now = performance.now();
    onProgress(Math.min(uploaded / TOTAL * 100, 99));
    if (now - lastLive > 250) {
      const sec = (now - start) / 1000;
      if (sec > 0.3) onLive(fmt(uploaded / sec / 1_000_000, ' MB/s'));
      lastLive = now;
    }
  }

  const sec = (performance.now() - start) / 1000;
  return { MBps: uploaded / sec / 1_000_000, Mbps: uploaded * 8 / sec / 1_000_000 };
}

const history = JSON.parse(localStorage.getItem('ms_history') || '[]');
function saveHistory(dl, ul, ping) {
  history.unshift({ dl, ul, ping, t: Date.now() });
  if (history.length > 5) history.length = 5;
  localStorage.setItem('ms_history', JSON.stringify(history));
}
function renderHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '';
  const rows = history.slice(1);
  if (!rows.length) {
    list.innerHTML = '<div style="color:var(--sub);font-size:0.8rem;padding:2px 4px">Run multiple tests to see history.</div>';
    return;
  }
  rows.forEach((h, i) => {
    const d = new Date(h.t);
    const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    const row = document.createElement('div');
    row.className = 'history-row glass';
    row.style.animationDelay = (i * 0.05) + 's';
    row.innerHTML = `
      <span class="history-time">${time}</span>
      <div class="history-vals">
        <div class="history-val"><span class="hv-num">${fmt(h.dl.MBps,' MB/s')}</span><span class="hv-lbl">Download</span></div>
        <div class="history-val"><span class="hv-num">${fmt(h.ul.MBps,' MB/s')}</span><span class="hv-lbl">Upload</span></div>
        <div class="history-val"><span class="hv-num">${h.ping}ms</span><span class="hv-lbl">Ping</span></div>
      </div>`;
    list.appendChild(row);
  });
}

async function runTest() {
  showScreen('screen-checking');
  resetProgress();
  const phase = document.getElementById('phaseLabel');
  const live  = document.getElementById('liveSpeed');

  // 1. Ping
  phase.textContent = '(Measuring Ping)';
  live.textContent = '';
  let pingPct = 0;
  const pingTick = setInterval(() => { pingPct = Math.min(pingPct + 3, 88); setProgress(pingPct); }, 100);
  let pingMs = 0;
  try { pingMs = await measurePing(); } catch(e) { showToast('Ping failed — check connection'); }
  clearInterval(pingTick);
  setProgress(100); await sleep(280);

  // 2. Download
  phase.textContent = '(Download Speed)';
  live.textContent = 'Starting…';
  resetProgress();
  let dl = { MBps: 0, Mbps: 0 };
  try {
    dl = await measureDownload(pct => setProgress(pct), spd => { live.textContent = spd; });
  } catch(e) { showToast('Download test failed — check connection'); }
  live.textContent = fmt(dl.MBps, ' MB/s');
  setProgress(100); await sleep(300);

  // 3. Upload
  phase.textContent = '(Upload Speed)';
  live.textContent = 'Starting…';
  resetProgress();
  let ul = { MBps: 0, Mbps: 0 };
  try {
    ul = await measureUpload(pct => setProgress(pct), spd => { live.textContent = spd; });
  } catch(e) { showToast('Upload test failed — check connection'); }
  live.textContent = fmt(ul.MBps, ' MB/s');
  setProgress(100); await sleep(300);

  // Populate results
  document.getElementById('dlMain').textContent   = fmt(dl.MBps, 'MB/s');
  document.getElementById('dlSub').textContent    = fmt(dl.Mbps, ' Mb/s');
  document.getElementById('ulMain').textContent   = fmt(ul.MBps, 'MB/s');
  document.getElementById('ulSub').textContent    = fmt(ul.Mbps, ' Mb/s');
  document.getElementById('pingMain').textContent = pingMs + 'ms';
  document.getElementById('pingSub').textContent  = pingMs <= 40 ? 'Low latency' : pingMs <= 100 ? 'Average latency' : 'High latency';

  setRating('dlRating',   ...rateSpeed(dl.Mbps));
  setRating('ulRating',   ...rateSpeed(ul.Mbps));
  setRating('pingRating', ...ratePing(pingMs));

  saveHistory(dl, ul, pingMs);
  renderHistory();
  showScreen('screen-results');
}

document.getElementById('startBtn').addEventListener('click', runTest);
document.getElementById('retestBtn').addEventListener('click', runTest);

// boot animation
requestAnimationFrame(() => requestAnimationFrame(() =>
  document.getElementById('screen-home').classList.add('visible')
));