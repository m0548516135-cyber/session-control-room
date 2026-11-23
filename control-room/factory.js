// Inside a building: every pavilion is its own little animated place, driven by REAL recent actions.
// Library = a librarian fetches the book from the shelf. Edit shop = the old line is struck and rewritten.
// Web tower = a search typed into a globe, or a site card (Instagram etc.). Chrome = real screenshots.
// All local drawing: costs zero tokens.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, a = {}, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const lerp = (a, b, t) => a + (b - a) * t;

const CFG = {
  files:   { name: 'ספריית הקבצים',  col: '#E0A030', does: 'הספרן שולף את הספר הנכון מהמדף וקורא בו' },
  web:     { name: 'מגדל האינטרנט',  col: '#3D74E8', does: 'מקליד חיפוש לכדור הארץ, או נכנס לאתר' },
  browser: { name: 'בית הכרום',      col: '#D9488C', does: 'הדפדפן האוטומטי: לוחץ, מצלם ובודק. התמונות אמיתיות' },
  shell:   { name: 'מפעל הפקודות',   col: '#4A9A6A', does: 'מקליד פקודה על המסך, מריץ אותה ושולח את הפלט הלאה' },
  write:   { name: 'סדנת הכתיבה',    col: '#8E73E0', does: 'השורה הישנה נמחקת והחדשה נכתבת במקומה' },
  mcp:     { name: 'נמל הכלים',      col: '#16A3A3', does: 'מנוף מעביר בקשה לספינה, והספינה חוזרת עם תשובה' },
  agents:  { name: 'מטה הסוכנים',    col: '#E8663A', does: 'כל סוכן משנה יוצא למשימה וחוזר עם דוח' },
};

export function openFactory(key, S, colorFor) {
  const cfg = CFG[key]; if (!cfg) return null;
  document.getElementById('factory')?.remove();
  const root = document.createElement('div'); root.id = 'factory'; root.className = 'factory'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', cfg.name);
  root.innerHTML = `<div class="fhead"><div><h2>בתוך ${esc(cfg.name)}</h2><div class="fsub">${esc(cfg.does)}. הכל לפי פעולות אמיתיות של הסשנים.</div></div><button class="fclose" aria-label="סגור">סגור</button></div>
    <div class="fscene"><svg viewBox="0 84 1240 300" preserveAspectRatio="xMidYMid meet" id="fsvg"></svg></div>
    <div class="fbottom"><div class="fstats" id="fstats"></div><div class="flog" id="flog"></div></div>`;
  document.body.appendChild(root);
  const svg = root.querySelector('#fsvg');

  // ---------- tiny engine ----------
  const tweens = [], tickers = [];
  const tw = (dur, fn, done) => tweens.push({ t: 0, dur, fn, done });
  const run = (steps, done) => { let i = 0; const next = () => { if (i >= steps.length) { done && done(); return; } const [d, f] = steps[i++]; tw(d, f, next); }; next(); };
  const T = (x, y, txt, o = {}) => { const t = el('text', { x, y, fill: o.fill || '#9AA7BC', 'font-size': o.size || 14, 'font-weight': o.w || 600, 'text-anchor': o.a || 'middle', 'font-family': o.mono ? 'Consolas,monospace' : 'Segoe UI,Arial,sans-serif', style: 'unicode-bidi:plaintext' }, o.p || svg); t.textContent = txt; return t; };
  const R = (x, y, w, h, fill, o = {}) => el('rect', { x, y, width: w, height: h, rx: o.rx || 0, fill, stroke: o.stroke || 'none', 'stroke-width': o.sw || 0, opacity: o.op ?? 1 }, o.p || svg);
  const G = (x = 0, y = 0, p) => el('g', { transform: `translate(${x} ${y})` }, p || svg);
  const mv = (g, x, y, s = 1) => g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
  const typed = (t, full, p) => { t.textContent = full.slice(0, Math.round(full.length * Math.min(1, p))); };
  const shotsP = fetch('/api/shots').then(r => r.json()).catch(() => []);
  let shots = []; shotsP.then(a => shots = a);
  const projColor = p => '#' + (colorFor(p) || 0xcccccc).toString(16).padStart(6, '0');

  // ---------- shared backdrop ----------
  const defs = el('defs', {}, svg);
  defs.innerHTML = `<linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1522"/><stop offset="1" stop-color="#162134"/></linearGradient><clipPath id="vp"><rect x="340" y="152" width="560" height="188" rx="6"/></clipPath>`;
  R(0, 0, 1240, 520, 'url(#sky)');
  R(0, 358, 1240, 40, '#0B1019');
  const banner = T(620, 106, '', { size: 16, fill: cfg.col, w: 700 });
  const stage = G(0, 0);

  // =====================================================================
  //  LIBRARY: shelves of books; the librarian pulls the right one and reads it
  // =====================================================================
  function library() {
    const cols = 30, rows = 3, books = [], boardY = r => 178 + r * 66;
    R(130, 120, 960, 210, '#141B27', { rx: 10, stroke: '#2B384C', p: stage });
    for (let r = 0; r < rows; r++) R(138, boardY(r), 944, 6, '#6B4A33', { p: stage });
    for (let i = 0; i < cols * rows; i++) {
      const r = Math.floor(i / cols), c = i % cols, h = 32 + (hash('h' + i) % 12), x = 148 + c * 30;
      const b = R(x, boardY(r) - h, 24, h, `hsl(${(i * 47) % 360} 50% 48%)`, { rx: 2, p: stage });
      R(x + 3, boardY(r) - h + 5, 18, 3, 'rgba(255,255,255,.35)', { p: stage }); books.push({ b, x, y: boardY(r) - h, h });
    }
    R(1110, 296, 110, 18, '#6B4A33', { p: stage }); R(1120, 314, 8, 44, '#523824', { p: stage }); R(1202, 314, 8, 44, '#523824', { p: stage });
    const open = G(1165, 296, stage); open.setAttribute('opacity', 0);
    R(-48, -34, 46, 34, '#F4EFE2', { rx: 3, p: open }); R(2, -34, 46, 34, '#F4EFE2', { rx: 3, p: open });
    const lines = Array.from({ length: 5 }, (_, i) => [R(-40, -28 + i * 6, 0, 2.5, '#9AA7BC', { p: open }), R(10, -28 + i * 6, 0, 2.5, '#9AA7BC', { p: open })]);
    const robot = G(600, 358, stage);
    R(-15, -34, 30, 34, cfg.col, { rx: 7, p: robot }); R(-11, -52, 22, 18, '#2B3A55', { rx: 6, p: robot }); el('circle', { cx: -4, cy: -43, r: 2.5, fill: '#7CF2A4' }, robot); el('circle', { cx: 4, cy: -43, r: 2.5, fill: '#7CF2A4' }, robot);
    const arm = el('line', { x1: 600, y1: 330, x2: 600, y2: 330, stroke: cfg.col, 'stroke-width': 5, 'stroke-linecap': 'round' }, stage);
    const tag = T(620, 345, '', { size: 12, fill: '#fff', p: stage });
    let rx = 600;
    return function play(r, done) {
      const name = r.d?.f || r.d?.q || short(r.what, 20), idx = hash(name) % (cols * rows), bk = books[idx], row = Math.floor(idx / cols), bx = bk.x + 12;
      const scan = r.tool === 'Grep' || r.tool === 'Glob', by = bk.y + bk.h;
      const steps = [];
      if (scan) steps.push([1.2, p => { beam.setAttribute('x', 140 + p * 930); beam.setAttribute('opacity', .55 * Math.sin(p * Math.PI)); }]);
      const beam = R(140, 120, 28, 210, '#FFF2B0', { op: 0, p: stage });
      steps.push([.8, p => { const x = lerp(rx, bx, p); mv(robot, x, 358); arm.setAttribute('x1', x); arm.setAttribute('x2', x); }, () => { rx = bx; }]);
      steps.push([.45, p => { arm.setAttribute('y1', 322); arm.setAttribute('y2', lerp(322, by + 4, p)); bk.b.setAttribute('y', lerp(bk.y, bk.y + 8, p)); }]);
      let held;
      steps.push([.9, p => { if (!held) { bk.b.setAttribute('opacity', .15); held = R(0, 0, 24, bk.h, bk.b.getAttribute('fill'), { rx: 2, p: stage }); tag.textContent = short(name, 22); }
        const x = lerp(bx, 1160, p); mv(robot, x, 358); arm.setAttribute('y2', lerp(by + 4, 322, Math.min(1, p * 3))); arm.setAttribute('x1', x); arm.setAttribute('x2', x);
        held.setAttribute('x', x - 12); held.setAttribute('y', 300 - bk.h - 6 + Math.sin(p * 12) * 1.5); tag.setAttribute('x', x); }]);
      steps.push([1.3, p => { held.setAttribute('opacity', 0); open.setAttribute('opacity', 1); lines.forEach(([a, b], i) => { const q = Math.max(0, Math.min(1, p * 5 - i * .7)); a.setAttribute('width', q * 34); b.setAttribute('width', q * 34); }); }]);
      steps.push([.9, p => { open.setAttribute('opacity', 1 - p); held.setAttribute('opacity', p); const x = lerp(1160, bx, p); mv(robot, x, 358); held.setAttribute('x', x - 12); tag.setAttribute('x', x); arm.setAttribute('x1', x); arm.setAttribute('x2', x); }]);
      steps.push([.4, p => { bk.b.setAttribute('y', lerp(bk.y + 8, bk.y, p)); bk.b.setAttribute('opacity', .15 + .85 * p); held.setAttribute('opacity', 1 - p); arm.setAttribute('y2', lerp(by + 4, 330, p)); }, () => { held.remove(); beam.remove(); tag.textContent = ''; rx = bx; lines.forEach(([a, b]) => { a.setAttribute('width', 0); b.setAttribute('width', 0); }); }]);
      run(steps, done);
    };
  }

  // =====================================================================
  //  WEB TOWER: a search typed into a globe, or a site card (Instagram, YouTube...)
  // =====================================================================
  function web() {
    R(60, 128, 520, 46, '#141B27', { rx: 23, stroke: cfg.col, sw: 2, p: stage });
    el('circle', { cx: 92, cy: 151, r: 9, fill: 'none', stroke: cfg.col, 'stroke-width': 3 }, stage); el('line', { x1: 99, y1: 158, x2: 108, y2: 167, stroke: cfg.col, 'stroke-width': 3 }, stage);
    const q = T(126, 158, '', { a: 'start', size: 17, fill: '#fff', w: 500 }); const cur = R(0, 140, 2, 22, cfg.col, { p: stage });
    const gx = 760, gy = 258, gr = 84;
    el('circle', { cx: gx, cy: gy, r: gr, fill: '#0F2A55', stroke: cfg.col, 'stroke-width': 3 }, stage);
    const mer = [0, 1, 2].map(() => el('ellipse', { cx: gx, cy: gy, rx: gr, ry: gr, fill: 'none', stroke: '#3D74E8', 'stroke-width': 1.5, opacity: .8 }, stage));
    [-45, 0, 45].forEach(dy => el('ellipse', { cx: gx, cy: gy + dy, rx: gr * Math.cos(Math.asin(dy / gr)), ry: 10, fill: 'none', stroke: '#2C5CA8', 'stroke-width': 1 }, stage));
    const rings = [0, 1, 2].map(() => el('circle', { cx: gx, cy: gy, r: gr, fill: 'none', stroke: '#BFD8FF', 'stroke-width': 2, opacity: 0 }, stage));
    let spin = 0, spinV = .6, radar = 0, radarOn = false;
    tickers.push(dt => { spin += dt * spinV; mer.forEach((m, i) => m.setAttribute('rx', Math.abs(Math.cos(spin + i * 1.05)) * gr + 1)); if (radarOn) { radar += dt; rings.forEach((r, i) => { const p = ((radar * .8) + i / 3) % 1; r.setAttribute('r', gr + p * 120); r.setAttribute('opacity', (1 - p) * .7); }); } else rings.forEach(r => r.setAttribute('opacity', 0)); });
    const cards = [0, 1, 2].map(i => { const g = G(960, 118 + i * 70, stage); g.setAttribute('opacity', 0); R(0, 0, 250, 58, '#141B27', { rx: 10, stroke: '#2B384C', p: g }); R(12, 12, 130, 8, '#C9D3E3', { rx: 4, p: g }); R(12, 28, 210, 6, '#4A5A72', { rx: 3, p: g }); R(12, 40, 170, 6, '#4A5A72', { rx: 3, p: g }); return g; });
    const site = G(930, 112, stage); site.setAttribute('opacity', 0);
    const siteLabel = T(145, 232, '', { p: site, size: 14, fill: '#fff' });
    const brand = (dom) => { site.querySelectorAll('.brand').forEach(n => n.remove()); const g = el('g', { class: 'brand' }, site); R(0, 0, 290, 220, '#141B27', { rx: 14, stroke: '#2B384C', p: g });
      if (/instagram/.test(dom)) { R(95, 20, 100, 100, 'url(#ig)', { rx: 26, p: g }); el('circle', { cx: 145, cy: 70, r: 24, fill: 'none', stroke: '#fff', 'stroke-width': 6 }, g); el('circle', { cx: 177, cy: 40, r: 5, fill: '#fff' }, g); [0, 1, 2].forEach(i => R(30 + i * 85, 135, 70, 70, 'url(#ig)', { rx: 8, op: .55 + i * .15, p: g })); }
      else if (/youtu/.test(dom)) { R(75, 36, 140, 98, '#FF0033', { rx: 24, p: g }); el('polygon', { points: '132,64 132,108 172,86', fill: '#fff' }, g); R(30, 152, 230, 10, '#4A5A72', { rx: 5, p: g }); R(30, 172, 170, 8, '#4A5A72', { rx: 4, p: g }); }
      else if (/github/.test(dom)) { el('circle', { cx: 145, cy: 82, r: 52, fill: '#E6EDF7' }, g); T(145, 100, 'GH', { p: g, size: 34, fill: '#10161F', w: 800 }); R(30, 152, 230, 10, '#4A5A72', { rx: 5, p: g }); R(30, 172, 170, 8, '#4A5A72', { rx: 4, p: g }); }
      else { el('circle', { cx: 145, cy: 82, r: 52, fill: cfg.col }, g); T(145, 100, (dom[0] || '?').toUpperCase(), { p: g, size: 44, fill: '#fff', w: 800 }); R(30, 152, 230, 10, '#4A5A72', { rx: 5, p: g }); R(30, 172, 170, 8, '#4A5A72', { rx: 4, p: g }); } };
    tickers.push(dt => { cur.setAttribute('x', 126 + q.getComputedTextLength() + 3); cur.setAttribute('opacity', Math.sin(performance.now() / 160) > 0 ? 1 : 0); });
    return function play(r, done) {
      const act = r.d?.a || '', isSearch = r.tool === 'WebSearch' || /search/.test(act), query = r.d?.q || '', url = r.d?.u || '';
      const dom = (url.match(/https?:\/\/([^/]+)/) || [, ''])[1].replace(/^www\./, '');
      q.textContent = ''; cards.forEach(c => c.setAttribute('opacity', 0)); site.setAttribute('opacity', 0);
      if (isSearch || !url) {
        const text = query || r.what;
        run([[1.5, p => typed(q, text, p)], [1.4, p => { radarOn = true; spinV = 3; }], ...cards.map((c, i) => [.45, p => { c.setAttribute('opacity', p); mv(c, lerp(900, 960, p), 118 + i * 70); }]), [.7, p => { }]],
          () => { radarOn = false; spinV = .6; done(); });
      } else {
        const label = short(url.replace(/^https?:\/\//, ''), 44);
        run([[1.1, p => typed(q, label, p)], [.9, p => { radarOn = true; spinV = 2.4; }], [.5, p => { if (p === 0 || !site.querySelector('.brand')) brand(dom); site.setAttribute('opacity', Math.min(1, p * 2)); siteLabel.textContent = short(dom, 28); }], [1.6, p => { }]],
          () => { radarOn = false; spinV = .6; done(); });
      }
    };
  }

  // =====================================================================
  //  CHROME: a monitor showing the REAL latest screenshots, cursor clicks, flash on capture
  // =====================================================================
  function chrome() {
    R(330, 112, 580, 236, '#0B0F16', { rx: 14, stroke: cfg.col, sw: 3, p: stage }); R(340, 122, 560, 26, '#1B2433', { rx: 6, p: stage });
    [0, 1, 2].forEach(i => el('circle', { cx: 354 + i * 16, cy: 135, r: 4.5, fill: ['#FF5F57', '#FEBC2E', '#28C840'][i] }, stage));
    const url = T(424, 140, '', { a: 'start', size: 13, mono: true, fill: '#C9D3E3' }); const load = R(340, 149, 0, 3, cfg.col, { p: stage });
    R(340, 152, 560, 188, '#E9EDF4', { rx: 6, p: stage });
    [0, 1, 2].forEach(i => R(354, 166 + i * 52, 150 + i * 50, 12, '#C2CAD8', { rx: 6, p: stage }));
    const view = el('image', { x: 340, y: 152, width: 560, height: 188, preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#vp)', opacity: 0 }, stage);
    const showShot = n => { const s = shots[n % Math.max(1, shots.length)]; if (s) { view.setAttribute('href', s.u); view.setAttribute('opacity', 1); } };
    const flash = R(340, 152, 560, 188, '#fff', { op: 0, p: stage });
    const thumbs = [0, 1, 2].map(i => { const g = G(110, 126 + i * 76, stage); R(0, 0, 164, 68, '#141B27', { rx: 8, stroke: '#2B384C', p: g }); const im = el('image', { x: 3, y: 3, width: 158, height: 62, preserveAspectRatio: 'xMidYMid slice', opacity: 0 }, g); return im; });
    T(192, 112, 'צילומים אחרונים', { size: 12 });
    const cursor = G(620, 250, stage); el('polygon', { points: '0,0 0,22 6,17 10,26 14,24 10,16 18,16', fill: '#fff', stroke: '#10161F', 'stroke-width': 1.5 }, cursor);
    const clickL = T(620, 200, '', { size: 12, fill: '#10161F', p: stage });
    const ripple = el('circle', { cx: 0, cy: 0, r: 0, fill: 'none', stroke: cfg.col, 'stroke-width': 3 }, stage);
    const code = G(350, 160, stage); code.setAttribute('opacity', 0); R(0, 0, 540, 172, 'rgba(8,12,18,.92)', { rx: 6, p: code }); const cl = [0, 1, 2, 3, 4, 5].map(i => R(14, 14 + i * 26, 0, 8, i % 2 ? '#4A9A6A' : '#4F8FE0', { rx: 4, p: code }));
    let cx = 620, cy = 250, shotN = 0;
    tickers.push(() => { shots.slice(0, 3).forEach((s, i) => { thumbs[i].setAttribute('href', s.u); thumbs[i].setAttribute('opacity', 1); }); });
    return function play(r, done) {
      const a = r.d?.a || '';
      if (/navigate/.test(a)) { const u = r.d?.u || r.what; load.setAttribute('width', 0); code.setAttribute('opacity', 0);
        run([[1.1, p => { typed(url, short(u.replace(/^https?:\/\//, ''), 46), p); load.setAttribute('width', 560 * p); }], [.6, p => { showShot(shotN++); }]], done);
      } else if (/click|type|fill|press|hover/.test(a)) { const tx = 400 + (hash(r.what) % 440), ty = 190 + (hash(r.what + 'y') % 130);
        run([[.8, p => { const x = lerp(cx, tx, p), y = lerp(cy, ty, p); mv(cursor, x, y); clickL.setAttribute('x', x + 20); clickL.setAttribute('y', y - 6); }, () => { cx = tx; cy = ty; clickL.textContent = short(r.d?.e || r.d?.t || 'לחיצה', 24); }],
          [.7, p => { ripple.setAttribute('cx', tx + 2); ripple.setAttribute('cy', ty + 2); ripple.setAttribute('r', p * 34); ripple.setAttribute('opacity', 1 - p); }], [.5, () => { }]], () => { clickL.textContent = ''; ripple.setAttribute('opacity', 0); done(); });
      } else if (/screenshot/.test(a)) {
        run([[.4, p => { flash.setAttribute('opacity', p * .9); }], [.7, p => { flash.setAttribute('opacity', .9 * (1 - p)); if (p > .05) showShot(0); }], [1, () => { }]], done);
      } else { code.setAttribute('opacity', 1); run([[1.8, p => cl.forEach((c, i) => c.setAttribute('width', Math.max(0, Math.min(1, p * 6 - i * .8)) * (120 + (i * 53) % 330)))], [.4, () => { }]], () => { code.setAttribute('opacity', 0); cl.forEach(c => c.setAttribute('width', 0)); done(); }); }
    };
  }

  // =====================================================================
  //  SHELL: a terminal types the command, a progress bar runs, the result box leaves on a belt
  // =====================================================================
  function shell() {
    R(250, 112, 520, 236, '#06100A', { rx: 14, stroke: cfg.col, sw: 3, p: stage }); R(250, 112, 520, 24, '#0F1C12', { rx: 12, p: stage });
    [0, 1, 2].forEach(i => el('circle', { cx: 268 + i * 16, cy: 124, r: 4.5, fill: ['#FF5F57', '#FEBC2E', '#28C840'][i] }, stage));
    T(300, 164, '$', { a: 'start', size: 17, mono: true, fill: '#7CF2A4' });
    const ln = [0, 1, 2].map(i => T(322, 164 + i * 24, '', { a: 'start', size: 15, mono: true, fill: '#7CF2A4' }));
    R(272, 296, 476, 10, '#16241A', { rx: 5, p: stage }); const bar = R(272, 296, 0, 10, cfg.col, { rx: 5, p: stage });
    const status = T(272, 334, '', { a: 'start', size: 14, mono: true, fill: '#7CF2A4' });
    [250, 770].forEach((x, i) => { const g = el('g', { transform: `translate(${x} 226)` }, stage); const gg = el('g', {}, g); el('circle', { r: 26, fill: 'none', stroke: cfg.col, 'stroke-width': 8, 'stroke-dasharray': '14 8' }, gg); el('circle', { r: 8, fill: cfg.col }, gg); let a = 0; tickers.push(dt => { a += dt * (i ? -60 : 60) * (running ? 3 : .5); gg.setAttribute('transform', `rotate(${a})`); }); });
    let running = false;
    R(790, 330, 300, 14, '#1C2A20', { rx: 7, p: stage }); R(1100, 150, 120, 200, '#141B27', { rx: 12, stroke: '#2B384C', p: stage }); T(1160, 176, 'פלט', { size: 14, fill: '#E6EDF7' });
    const outs = [0, 1, 2].map(i => T(1160, 214 + i * 40, '', { size: 12, fill: '#7CF2A4' }));
    const lastOut = [];
    return function play(r, done) {
      const cmd = r.d?.c || r.what; const wrap = []; for (let i = 0; i < cmd.length && wrap.length < 3; i += 44) wrap.push(cmd.slice(i, i + 44));
      ln.forEach(l => l.textContent = ''); status.textContent = ''; bar.setAttribute('width', 0); running = false;
      const box = G(790, 300, stage); R(0, 0, 40, 30, '#C79A62', { rx: 5, stroke: '#8A6A3F', sw: 2, p: box }); R(0, 0, 40, 8, projColor(r.project || ''), { rx: 4, p: box }); box.setAttribute('opacity', 0);
      run([[Math.min(2.2, .5 + cmd.length / 60), p => wrap.forEach((w, i) => { const part = Math.max(0, Math.min(1, p * wrap.length - i)); typed(ln[i], w, part); })], [1.3, p => { running = true; bar.setAttribute('width', 476 * p); }],
        [.3, p => { running = false; status.textContent = '✓ הסתיים'; box.setAttribute('opacity', 1); }], [1.1, p => mv(box, lerp(790, 1100, p), 300 - Math.sin(p * Math.PI) * 6)]],
        () => { box.remove(); lastOut.unshift(short(cmd.split(/\s+/)[0] + ' ' + (cmd.split(/\s+/)[1] || ''), 16)); lastOut.length = Math.min(3, lastOut.length); outs.forEach((o, i) => o.textContent = lastOut[i] ? '✓ ' + lastOut[i] : ''); done(); });
    };
  }

  // =====================================================================
  //  EDIT SHOP: the old line is struck through, the pencil writes the new one
  // =====================================================================
  function writer() {
    R(380, 112, 520, 238, '#F4EFE2', { rx: 6, p: stage }); for (let i = 0; i < 9; i++) R(396, 150 + i * 22, 488, 1.5, '#D8D1BF', { p: stage });
    R(380, 112, 520, 26, cfg.col, { rx: 6, p: stage }); const tab = T(394, 130, '', { a: 'start', size: 13, fill: '#fff', mono: true });
    const dyn = G(0, 0, stage); const pencil = G(900, 130, stage);
    el('polygon', { points: '0,0 70,-22 76,-14 6,10', fill: '#FFD23F' }, pencil); el('polygon', { points: '0,0 6,10 -10,10', fill: '#F2D5A5' }, pencil); el('polygon', { points: '-6,6 0,0 6,10', fill: '#2B2B2B' }, pencil);
    mv(pencil, 900, 140);
    return function play(r, done) {
      dyn.innerHTML = ''; tab.textContent = short(r.d?.f || 'קובץ', 26);
      if (r.d?.o || r.d?.n) {
        const old = r.d.o || '', neu = r.d.n || ''; [0, 1].forEach(i => R(396, 160 + i * 22 - 8, 200 + i * 130, 7, '#B8B2A0', { rx: 3, p: dyn }));
        const to = T(396, 232, '', { a: 'start', size: 15, mono: true, fill: '#C0392B', p: dyn }); to.textContent = short(old.replace(/\n/g, ' '), 54);
        const strike = el('line', { x1: 392, y1: 227, x2: 392, y2: 227, stroke: '#C0392B', 'stroke-width': 3 }, dyn);
        const tn = T(396, 258, '', { a: 'start', size: 15, mono: true, fill: '#1E8E3E', p: dyn }); const ok = T(860, 258, '', { size: 22, fill: '#1E8E3E', p: dyn });
        const sw = Math.min(480, short(old, 54).length * 8.6 + 6), nt = short(neu.replace(/\n/g, ' '), 54);
        run([[.9, p => { strike.setAttribute('x2', 392 + sw * p); mv(pencil, lerp(900, 392 + sw, p), lerp(140, 226, p)); }], [.5, () => { }], [1.4, p => { typed(tn, nt, p); mv(pencil, 396 + nt.length * 8.6 * p, 256 + Math.sin(p * 30) * 2); }], [.5, p => { ok.textContent = '✓'; }], [.5, p => mv(pencil, lerp(396 + nt.length * 8.6, 900, p), lerp(256, 140, p))]], done);
      } else {
        const n = Math.max(1, Math.min(8, Math.round((r.d?.l || 6) / 3))), counter = T(640, 340, '', { size: 14, fill: '#6B4FA8', p: dyn });
        const bars = Array.from({ length: n }, (_, i) => R(396, 166 + i * 22, 0, 8, '#4A3A7A', { rx: 4, p: dyn }));
        run([[2.4, p => { bars.forEach((b, i) => { const q = Math.max(0, Math.min(1, p * n - i)); b.setAttribute('width', q * (200 + (i * 71) % 270)); if (q > 0 && q < 1) mv(pencil, 396 + q * (200 + (i * 71) % 270), 166 + i * 22 + Math.sin(p * 60) * 2); }); }],
          [.6, p => { counter.textContent = r.d?.l ? `נכתבו ${r.d.l} שורות` : 'נכתב קובץ'; }], [.4, p => mv(pencil, 900, 140)]], done);
      }
    };
  }

  // =====================================================================
  //  HARBOR: crane loads the request onto a ship, the ship returns with the answer
  // =====================================================================
  function harbor() {
    R(0, 300, 1240, 90, '#12385E', { p: stage }); const waves = [0, 1, 2, 3].map(i => R(0, 312 + i * 18, 1240, 2, '#1E5A8C', { op: .7, p: stage }));
    tickers.push(() => waves.forEach((w, i) => w.setAttribute('x', Math.sin(performance.now() / 900 + i) * 14)));
    R(100, 282, 330, 26, '#6B5B4A', { p: stage }); [0, 1, 2].forEach(i => R(120 + i * 70, 242, 62, 40, ['#D2552B', '#2C63D6', '#E0A030'][i], { rx: 2, p: stage }));
    R(560, 122, 20, 160, '#8A97AB', { p: stage }); R(440, 122, 320, 14, '#A9B4C5', { p: stage }); const hookG = G(500, 136, stage); const rope = el('line', { x1: 0, y1: 0, x2: 0, y2: 40, stroke: '#2B3A55', 'stroke-width': 3 }, hookG);
    const ship = G(900, 300, stage); el('polygon', { points: '-130,0 130,0 105,40 -105,40', fill: '#7A4B30' }, ship); R(-10, -60, 8, 60, '#5A4030', { p: ship }); el('polygon', { points: '-2,-58 70,-10 -2,-10', fill: '#F4EFE2' }, ship);
    const cont = G(0, 0, stage); const cr = R(-34, 0, 68, 34, '#FFD23F', { rx: 3, p: cont }); const ct = T(0, 22, '', { size: 11, fill: '#10161F', p: cont });
    const setCont = (x, y, txt, col) => { mv(cont, x, y); cr.setAttribute('fill', col); ct.textContent = short(txt, 12); };
    setCont(-200, -200, '', '#FFD23F');
    return function play(r, done) {
      const label = r.d?.a || r.what, reply = '#4A9A6A';
      run([[.7, p => { const x = lerp(760, 190, p); mv(hookG, x, 136); rope.setAttribute('y2', lerp(40, 60, p)); setCont(x, 138 + 60, label, '#FFD23F'); cont.setAttribute('opacity', 0); }],
        [.5, p => { cont.setAttribute('opacity', 1); setCont(190, lerp(200, 150, p), label, '#FFD23F'); mv(hookG, 190, 136); rope.setAttribute('y2', lerp(60, 14, p)); }],
        [1, p => { const x = lerp(190, 880, p); mv(hookG, x, 136); setCont(x, 150, label, '#FFD23F'); }],
        [.5, p => { setCont(880, lerp(150, 252, p), label, '#FFD23F'); rope.setAttribute('y2', lerp(14, 70, p)); }],
        [.8, p => { rope.setAttribute('y2', 14); mv(ship, 900 + p * 420, 300); setCont(880 + p * 420, 252, label, '#FFD23F'); mv(hookG, lerp(880, 560, p), 136); }],
        [.8, p => { mv(ship, 1320 - p * 420, 300); setCont(1300 - p * 420, 252, 'תשובה', reply); }],
        [.7, p => { mv(hookG, lerp(560, 880, p), 136); }], [.6, p => { setCont(880, lerp(252, 150, p), 'תשובה', reply); rope.setAttribute('y2', lerp(70, 14, p)); }],
        [.9, p => { const x = lerp(880, 300, p); mv(hookG, x, 136); setCont(x, 150, 'תשובה', reply); }], [.5, p => { setCont(300, lerp(150, 262, p), 'תשובה', reply); }]],
        () => { cont.setAttribute('opacity', 0); done(); });
    };
  }

  // =====================================================================
  //  HQ: a hologram table; each sub-agent walks out to a flag, works, returns with a report
  // =====================================================================
  function hq() {
    el('ellipse', { cx: 620, cy: 306, rx: 150, ry: 26, fill: '#1B2433', stroke: cfg.col, 'stroke-width': 3 }, stage); const holo = el('polygon', { points: '620,170 660,230 620,290 580,230', fill: cfg.col, opacity: .55 }, stage);
    tickers.push(() => { const s = Math.abs(Math.sin(performance.now() / 700)); holo.setAttribute('points', `620,${170 + s * 6} ${660 - s * 8},230 620,${290 - s * 6} ${580 + s * 8},230`); });
    const flagsX = [150, 330, 910, 1090], flags = flagsX.map(x => { const g = G(x, 340, stage); R(-2, -110, 4, 110, '#8A97AB', { p: g }); const b = R(2, -110, 120, 24, '#2B3A55', { rx: 4, p: g }); const t = T(62, -93, '', { size: 12, fill: '#fff', p: g }); return { g, t }; });
    return function play(r, done) {
      const f = flags[hash(r.what + r.t) % 4], task = r.d?.q || r.what; f.t.textContent = short(task, 18);
      const bot = G(620, 340, stage); R(-12, -26, 24, 26, cfg.col, { rx: 6, p: bot }); R(-9, -42, 18, 16, '#2B3A55', { rx: 5, p: bot }); el('circle', { cx: 0, cy: -34, r: 2.5, fill: '#7CF2A4' }, bot); const scroll = R(-8, -62, 16, 14, '#F4EFE2', { rx: 3, p: bot }); scroll.setAttribute('opacity', 0);
      const fx = parseFloat(f.g.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]) + 30;
      run([[1.5, p => mv(bot, lerp(620, fx, p), 340 - Math.abs(Math.sin(p * 18)) * 6)], [1, p => { mv(bot, fx, 340 - Math.abs(Math.sin(p * 24)) * 10); }], [.2, () => scroll.setAttribute('opacity', 1)], [1.3, p => mv(bot, lerp(fx, 620, p), 340 - Math.abs(Math.sin(p * 18)) * 6)], [.6, p => { scroll.setAttribute('y', -62 - p * 110); scroll.setAttribute('opacity', 1 - p); }]],
        () => { bot.remove(); f.t.textContent = ''; done(); });
    };
  }

  const scenes = { files: library, web, browser: chrome, shell, write: writer, mcp: harbor, agents: hq };
  const playFn = scenes[key]();

  // ---------- real data + scheduling ----------
  let rows = [], seen = new Set(), queue = [], busy = false, replay = 0, idleT = 0;
  const gather = S => { const r = []; S.sessions.forEach(s => s.recent.forEach(a => { if (a.src === key) r.push({ ...a, project: s.project }); })); r.sort((a, b) => (a.t || '').localeCompare(b.t || '')); return r; };
  const sync = S => { rows = gather(S); rows.forEach(r => { const id = r.t + '|' + r.what; if (!seen.has(id)) { seen.add(id); if (seen.size > rows.length) queue.push(r); } }); if (queue.length > 4) queue = queue.slice(-4); renderLog(S); };
  function renderLog(S) {
    const byProj = {}; rows.forEach(r => byProj[r.project] = (byProj[r.project] || 0) + 1);
    document.getElementById('fstats').innerHTML = `<div class="fnum"><b>${S.sources_total[key] || 0}</b><span>פעולות ב-${S.window_days} ימים</span></div>` + Object.entries(byProj).map(([p, n]) => `<div class="fproj"><i style="background:${projColor(p)}"></i>${esc(p)}<em>${n}</em></div>`).join('');
    document.getElementById('flog').innerHTML = rows.slice().reverse().slice(0, 14).map(r => `<div class="frow"><span class="ft">${esc((r.t || '').slice(11, 16))}</span><i style="background:${projColor(r.project)}"></i><b>${esc(r.what)}</b><span class="fp">${esc(r.project)}</span></div>`).join('') || '<div class="empty">עוד לא קרה כאן כלום.</div>';
  }
  sync(S);
  let alive = true, last = performance.now(), raf = 0;
  function frame(now) {
    if (!alive) return; const dt = Math.min(.05, (now - last) / 1000); last = now;
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; t.t += dt; const p = Math.min(1, t.t / t.dur); t.fn(p); if (p >= 1) { tweens.splice(i, 1); t.done && t.done(); } }
    tickers.forEach(f => f(dt));
    if (!busy) { idleT -= dt; const nxt = queue.shift() || (idleT <= 0 && rows.length ? rows[replay++ % rows.length] : null);
      if (nxt) { busy = true; banner.textContent = nxt.what; playFn(nxt, () => { busy = false; idleT = .7; }); } }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const close = () => { alive = false; cancelAnimationFrame(raf); root.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey); root.querySelector('.fclose').onclick = close;
  return { update: S => { if (alive) sync(S); }, close };
}
