// Inside the facilities: a modern 3D room per building, replaying the REAL recent actions done there.
// One shared room shell (dark floor, LED grid, wall screen, side log) + a themed centerpiece per facility.
// Zero tokens: everything comes from /api/state (action tool, text and the small "d" details).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const DOES = {
  files: 'שליפת קבצים מהכספת וקריאה בהם',
  write: 'עריכה: השורה הישנה יוצאת, החדשה נכתבת',
  web: 'חיפושים ואתרים שנקראו מהאינטרנט',
  browser: 'הדפדפן האוטומטי: צילומי המסך כאן אמיתיים',
  shell: 'פקודות שרצו על המחשב שלך',
  mcp: 'בקשות שעברו דרך השירותים המחוברים',
  media: 'יצירה וניתוח מדיה בכלים החיצוניים',
  skills: 'סקילים שהופעלו',
  agents: 'סוכני משנה שיצאו למשימה',
};
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const clamp01 = v => Math.max(0, Math.min(1, v));

const CSS = `
.ix{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:"IBM Plex Sans Hebrew",sans-serif;color:#EEF2F4;display:none}
.ix.on{display:block}
.ix .pane{position:absolute;pointer-events:auto;background:rgba(14,18,22,.58);border:1px solid rgba(255,255,255,.14);border-radius:14px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.ix .top{top:14px;right:14px;left:14px;display:flex;align-items:center;gap:14px;padding:10px 14px;border-top:3px solid var(--c)}
.ix .top h3{margin:0;font:400 30px/1 "Karantina","IBM Plex Sans Hebrew",sans-serif;letter-spacing:.03em}
.ix .top p{margin:0;font-size:13px;color:#A9B4BA;flex:1}
.ix .top button,.ix .log button{font:600 13px "IBM Plex Sans Hebrew",sans-serif;color:#EEF2F4;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:7px 12px;cursor:pointer}
.ix .top button:hover{background:rgba(255,255,255,.16)}
.ix button:focus-visible{outline:2px solid #6FD8E8;outline-offset:2px}
.ix .log{top:78px;right:14px;bottom:14px;width:300px;padding:10px;overflow:auto}
.ix .log h4{margin:2px 4px 8px;font-size:12px;color:#A9B4BA;font-weight:500}
.ix .row{display:grid;grid-template-columns:42px 1fr;gap:6px;padding:7px 6px;border-radius:9px;font-size:12.5px;line-height:1.35;border:1px solid transparent}
.ix .row time{font:500 11px "IBM Plex Mono",monospace;color:#7F8B92;padding-top:2px}
.ix .row b{font-weight:600;display:block;word-break:break-word}
.ix .row i{font-style:normal;font-size:11px;padding:1px 7px;border-radius:99px;display:inline-block;margin-top:3px;background:color-mix(in srgb,var(--p) 25%,transparent);border:1px solid var(--p)}
.ix .row.now{background:rgba(255,255,255,.07);border-color:var(--c)}
.ix .empty{padding:14px 6px;color:#A9B4BA;font-size:13px}
.ix .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .45s;pointer-events:none}
@media (max-width:720px){.ix .log{top:auto;height:34%;width:auto;left:14px}.ix .top p{display:none}.ix .top h3{flex:1}}
`;

export function createInteriors({ renderer, container, SRC, hex, colorFor, getEnv, getState, onExit }) {
  if (!document.getElementById('ix-style')) { const s = document.createElement('style'); s.id = 'ix-style'; s.textContent = CSS; document.head.appendChild(s); }
  const ui = document.createElement('div'); ui.className = 'ix'; container.appendChild(ui);
  ui.innerHTML = `<div class="pane top"><h3></h3><p></p><button class="out">חזרה לעיר</button></div>
    <div class="pane log" aria-live="polite"><h4>הפעולות האחרונות כאן (אמיתיות)</h4><div class="rows"></div></div>`;
  const fade = document.createElement('div'); fade.className = 'fade'; container.appendChild(fade);
  ui.querySelector('.out').onclick = () => exit();
  addEventListener('keydown', e => { if (e.code === 'Escape' && api.active) exit(); });

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x06080B); scene.fog = new THREE.Fog(0x06080B, 45, 110);
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enabled: false, enableDamping: true, minDistance: 6, maxDistance: 34, maxPolarAngle: Math.PI / 2.05 });
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .45, .82); composer.addPass(bloom); composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight(0xBFD4FF, 0x232A33, 1.3));
  const key = new THREE.DirectionalLight(0xFFFFFF, 2); key.position.set(8, 18, 12); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -26, right: 26, top: 20, bottom: -20 }); key.shadow.camera.updateProjectionMatrix(); scene.add(key);
  const accentL = new THREE.PointLight(0xffffff, 60, 40, 2); accentL.position.set(0, 9, -6); scene.add(accentL);

  const M = {
    floor: new THREE.MeshStandardMaterial({ color: 0x0D1115, roughness: .22, metalness: .55 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x1C232C, roughness: .7 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8C949C, roughness: .3, metalness: .85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1B2128, roughness: .5, metalness: .6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xE8EAEC, roughness: .5 }),
    panel: new THREE.MeshBasicMaterial({ color: 0xF4F7FA, toneMapped: false }),
  };
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  function canvasPlane(w, h, pw, ph) {
    const c = document.createElement('canvas'); c.width = pw; c.height = ph; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
    return { mesh: m, x: c.getContext('2d'), tex, W: pw, H: ph };
  }
  function person(color) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(.3, .7, 4, 10), new THREE.MeshStandardMaterial({ color, roughness: .5 }), 0, 1.25, 0);
    const head = mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xE6C3A1, roughness: .7 }), 0, 1.85, 0);
    const legs = [-1, 1].map(s => mesh(new THREE.CapsuleGeometry(.1, .7, 3, 6), M.dark, s * .13, .45, 0));
    const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .64, 32), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: .9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .03;
    g.add(body, head, ...legs, ring); g.userData = { body, legs, ring }; g.scale.setScalar(1.6); return g;
  }
  const setPersonColor = (p, c) => { p.userData.body.material.color.setHex(c); p.userData.ring.material.color.setHex(c); };

  // ---------- shared room shell ----------
  const shell = new THREE.Group(); scene.add(shell);
  shell.add(mesh(new THREE.BoxGeometry(48, .4, 34), M.floor, 0, -.2, 0));
  const grid = new THREE.GridHelper(48, 24, 0xffffff, 0x1C252E); grid.material.transparent = true; grid.material.opacity = .28; grid.position.y = .01; shell.add(grid);
  shell.add(mesh(new THREE.BoxGeometry(48, 16, .4), M.wall, 0, 8, -17), mesh(new THREE.BoxGeometry(.4, 16, 34), M.wall, -24, 8, 0), mesh(new THREE.BoxGeometry(.4, 16, 34), M.wall, 24, 8, 0));
  for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), M.panel); p.rotation.x = Math.PI / 2; p.position.set(-18 + (i % 3) * 18, 15.9, -8 + Math.floor(i / 3) * 14); shell.add(p); }
  const strips = []; const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.16, 15, .1), stripMat); s.position.set(-22 + i * 5.5, 8, -16.75); shell.add(s); strips.push(s); }
  const main = canvasPlane(26, 9.75, 1600, 600); main.mesh.position.set(0, 9.4, -16.7); shell.add(main.mesh);
  shell.add(mesh(new THREE.BoxGeometry(26.8, 10.5, .3), M.dark, 0, 9.4, -16.9));   // screen bezel

  function drawMain(st) {
    const x = main.x, W = main.W, H = main.H, col = st.color;
    x.clearRect(0, 0, W, H); x.fillStyle = 'rgba(8,11,15,.96)'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W * .8, 0, 10, W * .8, 0, W * .8); g.addColorStop(0, col + '55'); g.addColorStop(1, 'transparent'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = col; x.fillRect(0, 0, W, 10);
    x.direction = 'rtl'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#A9B4BA'; x.font = '500 38px "IBM Plex Sans Hebrew", sans-serif'; x.fillText(st.kicker || '', W - 60, 84);
    x.fillStyle = '#FFFFFF'; x.font = '700 76px "IBM Plex Sans Hebrew", sans-serif';
    const full = st.title || '', shown = full.slice(0, Math.round(full.length * clamp01(st.p ?? 1)));
    x.fillText(short(shown, 34), W - 60, 210);
    if ((st.p ?? 1) < 1 && Math.sin(performance.now() / 120) > 0) { const w = x.measureText(short(shown, 34)).width; x.fillStyle = col; x.fillRect(W - 66 - w - 14, 150, 8, 70); }
    (st.lines || []).forEach((ln, i) => {
      const he = /[֐-׿]/.test(ln.t || ''), y = 310 + i * 66, txt = short(ln.t, 58);
      x.direction = he ? 'rtl' : 'ltr'; x.textAlign = he ? 'right' : 'left';
      x.font = he ? '500 42px "IBM Plex Sans Hebrew", sans-serif' : '500 44px "IBM Plex Mono", monospace';
      const ax = he ? W - 60 : 60; x.fillStyle = ln.c || '#C9D3DC'; x.fillText(txt, ax, y);
      if (ln.strike) { const w = x.measureText(txt).width; x.fillRect(he ? ax - w : ax, y - 14, w, 5); }
    });
    if (st.bar != null) { x.fillStyle = '#1E262E'; x.fillRect(60, H - 90, W - 120, 22); x.fillStyle = col; x.fillRect(60, H - 90, (W - 120) * clamp01(st.bar), 22); }
    if (st.project) { x.direction = 'rtl'; x.textAlign = 'right'; x.font = '600 34px "IBM Plex Sans Hebrew", sans-serif'; const w = x.measureText(st.project).width;
      x.fillStyle = st.pcol + '44'; x.strokeStyle = st.pcol; x.lineWidth = 3; x.beginPath(); x.roundRect(W - 60 - w - 40, H - 56 - 24, w + 40, 52, 26); x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.fillText(st.project, W - 80, H - 42); }
    main.tex.needsUpdate = true;
  }

  // ---------- themed centerpieces ----------
  const theme = new THREE.Group(); scene.add(theme);
  const tweens = [];
  const T = (dur, fn, done) => tweens.push({ t: 0, dur, fn, done });
  const STATION = new THREE.Vector3(0, 0, 2);   // where the agent works (overridden per theme)
  const BUILD = {
    files(col) {   // the vault: walls of drawers; the file's drawer slides out and its card floats to the reading table
      const drawers = []; const dm = new THREE.MeshStandardMaterial({ color: 0x252C34, roughness: .35, metalness: .7 });
      for (const side of [-1, 1]) for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) {
        const d = mesh(new THREE.BoxGeometry(1.7, 1.1, 1.6), dm, side * 19, 1 + r * 1.3, -12 + c * 2.1); d.userData.home = d.position.x; theme.add(d); drawers.push(d);
        const led = new THREE.Mesh(new THREE.BoxGeometry(.05, .12, .9), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: .35 })); led.position.set(side * 18.1, 1 + r * 1.3, -12 + c * 2.1); theme.add(led); d.userData.led = led;
      }
      const table = mesh(new THREE.CylinderGeometry(3, 3.2, 1, 48), M.dark, 0, .5, 1); theme.add(table);
      const glow = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 48), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 1.02, 1); theme.add(glow);
      const card = canvasPlane(5, 2.2, 600, 264); card.mesh.position.set(0, 3.2, 1); card.mesh.visible = false; theme.add(card.mesh);
      STATION.set(0, 0, 4.6);
      return (r, done) => {
        const name = r.d?.f || r.d?.q || short(r.what, 30), d = drawers[hash(name) % drawers.length], side = Math.sign(d.position.x);
        card.x.clearRect(0, 0, 600, 264); card.x.fillStyle = 'rgba(10,14,18,.85)'; card.x.fillRect(0, 0, 600, 264); card.x.fillStyle = hex(col); card.x.fillRect(0, 0, 600, 8);
        card.x.direction = 'ltr'; card.x.textAlign = 'center'; card.x.fillStyle = '#fff'; card.x.font = '600 40px "IBM Plex Mono", monospace'; card.x.fillText(short(name, 24), 300, 120);
        card.x.fillStyle = '#A9B4BA'; card.x.font = '500 28px "IBM Plex Sans Hebrew", sans-serif'; card.x.direction = 'rtl'; card.x.fillText(r.tool === 'Grep' || r.tool === 'Glob' ? 'חיפוש בתוך הקבצים' : 'נשלף מהכספת', 300, 190); card.tex.needsUpdate = true;
        d.userData.led.material.opacity = 1;
        T(.8, p => d.position.x = d.userData.home - side * 2.2 * ease(p));
        T(1.6, p => { card.mesh.visible = true; const a = new THREE.Vector3(d.position.x, d.position.y, d.position.z), b = new THREE.Vector3(0, 3.2, 1); card.mesh.position.lerpVectors(a, b, ease(p)); card.mesh.lookAt(camera.position); card.mesh.scale.setScalar(.3 + .7 * p); },
          () => T(1.6, () => {}, () => { card.mesh.visible = false; T(.6, p => d.position.x = d.userData.home - side * 2.2 * (1 - p), () => { d.userData.led.material.opacity = .35; done(); }); }));
      };
    },
    write(col) {   // editing wall: the old line is struck out in red, the new one is typed in green
      const desk = mesh(new THREE.BoxGeometry(8, .3, 3), M.dark, 0, 2.2, 2); theme.add(desk, mesh(new THREE.BoxGeometry(.3, 2.1, .3), M.metal, -3.5, 1.05, 2), mesh(new THREE.BoxGeometry(.3, 2.1, .3), M.metal, 3.5, 1.05, 2));
      const kb = new THREE.Mesh(new THREE.BoxGeometry(3, .1, 1), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: .6 })); kb.position.set(0, 2.42, 2.3); theme.add(kb);
      const pages = []; for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), new THREE.MeshBasicMaterial({ color: 0xEEF2F4, transparent: true, opacity: .14, side: THREE.DoubleSide, toneMapped: false })); p.position.set(-9 + (i % 7) * 3, 1.3 + Math.floor(i / 7) * 2.2, -8); theme.add(p); pages.push(p); }
      STATION.set(0, 0, 4.4);
      return (r, done, screen) => {
        const pg = pages[hash(r.d?.f || r.what) % pages.length]; pg.material.opacity = .9; pg.material.color.setHex(col);
        T(3.6, p => { kb.material.opacity = .4 + .6 * Math.abs(Math.sin(p * 40)); screen(p); }, () => { pg.material.opacity = .14; pg.material.color.setHex(0xEEF2F4); done(); });
      };
    },
    web(col) {   // hologram globe; a search beams from the globe to the wall
      const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 3), new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: .55, toneMapped: false })); globe.position.set(0, 6, -2); theme.add(globe);
      const core = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 24), new THREE.MeshStandardMaterial({ color: 0x0B1A30, emissive: col, emissiveIntensity: .25, roughness: .3 })); core.position.copy(globe.position); theme.add(core);
      const rings = [0, 1].map(i => { const t = new THREE.Mesh(new THREE.TorusGeometry(5.4 + i * .9, .05, 6, 96), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); t.position.copy(globe.position); t.rotation.x = Math.PI / 2 + (i ? .4 : -.3); theme.add(t); return t; });
      theme.add(mesh(new THREE.CylinderGeometry(2.5, 3, .8, 48), M.dark, 0, .4, -2));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1, 8), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true })); beam.visible = false; theme.add(beam);
      let speed = .25; theme.userData.idle = (t, dt) => { globe.rotation.y += dt * speed; rings[0].rotation.z += dt * speed * .7; rings[1].rotation.z -= dt * speed * .5; };
      STATION.set(-5, 0, 3);
      return (r, done, screen) => {
        speed = 1.6; const a = globe.position.clone(), b = new THREE.Vector3(0, 9.4, -16.4), mid = a.clone().lerp(b, .5), len = a.distanceTo(b);
        beam.position.copy(mid); beam.lookAt(b); beam.rotateX(Math.PI / 2);
        T(3.6, p => { screen(p); beam.visible = p > .15; beam.scale.set(1, len * Math.min(1, (p - .15) * 4), 1); beam.material.opacity = .9 * Math.sin(p * Math.PI); }, () => { beam.visible = false; speed = .25; done(); });
      };
    },
    browser(col) {   // curved wall of real screenshots; a cursor moves and clicks
      // real screenshots saved by the browser automation; the server is single-threaded, so retry if it was busy
      const shots = []; let tries = 0;
      const loadShots = () => fetch('/api/shots').then(r => r.json()).then(a => a.slice(0, 6).forEach(s => new THREE.TextureLoader().load(s.u, t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; /* inner face of the cylinder: flip back */ shots.push(t); if (!scr.material.map) show(t); })))
        .catch(() => { if (++tries < 4) setTimeout(loadShots, 2500); });
      const show = t => { scr.material.map = t; scr.material.color.setHex(0xffffff); scr.material.needsUpdate = true; };
      const scr = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 7.5, 48, 1, true, Math.PI - .6, 1.2), new THREE.MeshBasicMaterial({ color: 0x222833, side: THREE.BackSide, toneMapped: false }));
      scr.position.set(0, 4.6, 6); theme.add(scr);
      const cursor = new THREE.Mesh(new THREE.ConeGeometry(.25, .7, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); cursor.rotation.z = Math.PI; theme.add(cursor);
      const ripple = new THREE.Mesh(new THREE.RingGeometry(.2, .35, 32), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true })); theme.add(ripple); ripple.visible = false;
      let n = 0; STATION.set(4, 0, 4); loadShots();
      return (r, done, screen) => {
        if (shots.length) show(shots[n++ % shots.length]);
        const ang = Math.PI + (hash(r.what) % 100 / 100 - .5) * .9, h = 2.5 + (hash(r.what + 'y') % 100) / 100 * 4;
        const at = new THREE.Vector3(Math.sin(ang) * 13.6, h, 6 + Math.cos(ang) * 13.6);
        const from = cursor.position.clone();
        T(3.6, p => { screen(p); cursor.position.lerpVectors(from, at, ease(Math.min(1, p * 2))); if (p > .55 && p < .9) { ripple.visible = true; ripple.position.copy(at); ripple.lookAt(0, h, 6); ripple.scale.setScalar(1 + (p - .55) * 10); ripple.material.opacity = 1 - (p - .55) / .35; } else ripple.visible = false; }, done);
      };
    },
    shell(col) {   // server racks with blinking LEDs + a terminal that types the command
      const racks = []; const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, .08, .05), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 10 * 2 * 24);
      let k = 0; const c = new THREE.Color();
      for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
        const x = side * (6 + (i % 2) * 0) , z = -13 + i * 2.6, rack = mesh(new THREE.BoxGeometry(2.2, 6.5, 2.2), M.dark, side * 14, 3.25, z); theme.add(rack); racks.push(rack);
        for (let j = 0; j < 24; j++) { leds.setMatrixAt(k, new THREE.Matrix4().setPosition(side * 14 - side * 1.12, .6 + (j % 12) * .48, z - .6 + Math.floor(j / 12) * 1.2)); leds.setColorAt(k++, c.setHex(Math.random() > .3 ? col : 0x2E8BFF)); }
      }
      theme.add(leds); let busy = 0;
      theme.userData.idle = (t, dt) => { if (Math.random() < dt * (8 + busy * 40)) { const i = Math.random() * leds.count | 0; leds.setColorAt(i, c.setHex(Math.random() > .5 ? col : (Math.random() > .5 ? 0x2E8BFF : 0x111111))); leds.instanceColor.needsUpdate = true; } };
      const term = mesh(new THREE.BoxGeometry(5, 3, .3), M.dark, 0, 2.6, 0); theme.add(term);
      STATION.set(0, 0, 3);
      return (r, done, screen) => { busy = 1; T(3.6, p => screen(p), () => { busy = 0; done(); }); };
    },
    mcp(col, rows) {   // service gates: one arch per connected service; the request passes through its gate
      const names = [...new Set(rows.map(r => serviceOf(r.tool)))].slice(0, 5); while (names.length < 3) names.push(['Gmail', 'Drive', 'Supabase'][names.length]);
      const gates = names.map((nm, i) => {
        const x = (i - (names.length - 1) / 2) * 8.5, arch = new THREE.Mesh(new THREE.TorusGeometry(2.8, .22, 12, 48, Math.PI), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: .5 }));
        arch.position.set(x, 0, -6); theme.add(arch, mesh(new THREE.BoxGeometry(6.4, .2, 2), M.dark, x, .1, -6));
        const lab = canvasPlane(5, 1.1, 500, 110); lab.x.fillStyle = '#fff'; lab.x.font = '600 56px "IBM Plex Sans Hebrew", sans-serif'; lab.x.textAlign = 'center'; lab.x.fillText(nm, 250, 76); lab.tex.needsUpdate = true;
        lab.mesh.position.set(x, 3.8, -6); theme.add(lab.mesh); return { nm, arch, x };
      });
      const pkt = new THREE.Mesh(new THREE.BoxGeometry(.8, .8, .8), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); pkt.visible = false; theme.add(pkt);
      STATION.set(0, 0, 4);
      return (r, done, screen) => {
        const g = gates.find(g => g.nm === serviceOf(r.tool)) || gates[hash(r.tool) % gates.length]; g.arch.material.opacity = 1;
        T(3.6, p => { screen(p); pkt.visible = true; pkt.rotation.y += .1; pkt.position.set(lerp(0, g.x, ease(Math.min(1, p * 1.6))), 1.4, lerp(3, -14, ease(p))); }, () => { pkt.visible = false; g.arch.material.opacity = .5; done(); });
      };
    },
    media(col) {   // a studio: cyclorama, camera on a tripod, softboxes that flash on each generation
      const cyc = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 4.4, 48, 1, true, Math.PI * .6, Math.PI * .8), new THREE.MeshStandardMaterial({ color: 0xF2F2F2, roughness: .9, side: THREE.BackSide })); cyc.position.set(0, 2.2, 0); theme.add(cyc);
      const cam = new THREE.Group(); cam.add(mesh(new THREE.BoxGeometry(1.4, 1, 2), M.dark, 0, 3.6, 0), mesh(new THREE.CylinderGeometry(.45, .55, 1.2, 24).rotateX(Math.PI / 2), M.metal, 0, 3.6, -1.5));
      [[-.5, -.4], [.5, -.4], [0, .6]].forEach(([x, z]) => { const l = mesh(new THREE.CylinderGeometry(.05, .05, 3.4), M.metal, x * 1.2, 1.6, z * 1.2); l.rotation.z = x * .25; l.rotation.x = z * .25; cam.add(l); });
      cam.position.set(0, 0, 6); theme.add(cam);
      const softs = [-1, 1].map(s => { const b = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0xFFF3E0, toneMapped: false, side: THREE.DoubleSide })); b.position.set(s * 7, 5, 3); b.lookAt(0, 3, -2); theme.add(b, mesh(new THREE.CylinderGeometry(.06, .06, 5), M.metal, s * 7, 2.5, 3)); return b; });
      const rec = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFF2020, toneMapped: false })); rec.position.set(.5, 4.25, 6.5); theme.add(rec);
      theme.userData.idle = t => { rec.visible = Math.sin(t * 4) > 0; };
      STATION.set(2.5, 0, 7);
      return (r, done, screen) => T(3.6, p => { screen(p); const f = (p * 6) % 1 < .12 ? 3 : 1; softs.forEach(s => s.material.color.setScalar(f)); }, () => { softs.forEach(s => s.material.color.setHex(0xFFF3E0)); done(); });
    },
    skills(col, rows) {   // a wall of skill tiles; the skill that ran lights up
      const names = [...new Set(rows.map(r => r.d?.q || '').filter(Boolean))].slice(0, 12); ['watch', 'ig-human', 'frontend-design', 'security-audit', 'video-watch', 'depth'].forEach(n => names.length < 12 && !names.includes(n) && names.push(n));
      const tiles = names.map((nm, i) => {
        const t = canvasPlane(5.2, 2.2, 520, 220), x = -8.4 + (i % 4) * 5.6, y = 3 + Math.floor(i / 4) * 2.7;
        t.mesh.position.set(x, y, -9); theme.add(t.mesh);
        const draw = on => { const c = t.x; c.clearRect(0, 0, 520, 220); c.fillStyle = on ? hex(col) : 'rgba(20,26,32,.9)'; c.beginPath(); c.roundRect(4, 4, 512, 212, 26); c.fill(); c.strokeStyle = hex(col); c.lineWidth = 4; c.stroke();
          c.fillStyle = on ? '#111' : '#EEF2F4'; c.font = '600 46px "IBM Plex Mono", monospace'; c.textAlign = 'center'; c.fillText(short(nm, 16), 260, 128); t.tex.needsUpdate = true; };
        draw(false); return { nm, draw, mesh: t.mesh };
      });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .8, metalness: .6, roughness: .2 })); star.position.set(0, 3, 1); theme.add(star);
      theme.userData.idle = (t, dt) => { star.rotation.y += dt; star.position.y = 3 + Math.sin(t * 1.5) * .3; };
      STATION.set(0, 0, 4);
      return (r, done, screen) => { const tl = tiles.find(x => x.nm === r.d?.q) || tiles[hash(r.what) % tiles.length]; tl.draw(true);
        T(3.6, p => { screen(p); tl.mesh.position.z = -9 + Math.sin(p * Math.PI) * 1.2; }, () => { tl.draw(false); done(); }); };
    },
    agents(col) {   // the ops table: a sub-agent leaves through the door carrying its mission
      const table = mesh(new THREE.CylinderGeometry(4.5, 4.7, 1.1, 64), M.dark, 0, .55, -2); theme.add(table);
      for (let i = 0; i < 26; i++) { const h = .3 + (hash('b' + i) % 100) / 100 * 1.6, b = new THREE.Mesh(new THREE.BoxGeometry(.4, h, .4), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: .55 })); b.position.set(Math.cos(i * 2.4) * (i % 4 + .5), 1.1 + h / 2, -2 + Math.sin(i * 2.4) * (i % 4 + .5)); theme.add(b); }
      const runner = person(col); runner.scale.setScalar(1.1); runner.visible = false; theme.add(runner);
      const tag = canvasPlane(4.6, .9, 600, 118); tag.mesh.position.y = 3.4; runner.add(tag.mesh);
      STATION.set(5.5, 0, 2);
      return (r, done, screen) => {
        tag.x.clearRect(0, 0, 600, 118); tag.x.fillStyle = 'rgba(10,14,18,.85)'; tag.x.fillRect(0, 0, 600, 118); tag.x.fillStyle = '#fff'; tag.x.font = '600 44px "IBM Plex Sans Hebrew", sans-serif'; tag.x.textAlign = 'center'; tag.x.direction = 'rtl'; tag.x.fillText(short(r.d?.q || 'משימה', 20), 300, 76); tag.tex.needsUpdate = true;
        runner.visible = true;
        T(3.6, p => { screen(p); runner.position.set(lerp(4, 0, p), 0, lerp(0, 16, ease(p))); runner.rotation.y = 0; runner.userData.legs.forEach((l, i) => l.rotation.x = Math.sin(p * 40 + i * Math.PI) * .6); tag.mesh.lookAt(camera.position); }, () => { runner.visible = false; done(); });
      };
    },
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  // connectors are sometimes stored under an opaque id instead of a name: recognise the service by what the action does
  const BY_ACTION = [[/sql|migration|branch|edge_function|supabase|get_project|list_tables/, 'Supabase'], [/account|trade|position|order|watchlist|screener|alert/, 'IBKR'],
    [/gmail|thread|draft|label|message/, 'Gmail'], [/spreadsheet|sheet/, 'Sheets'], [/drive|file_content|search_files/, 'Drive'], [/deploy|vercel|project_domain/, 'Vercel'],
    [/zapier/, 'Zapier'], [/calendar|event/, 'Calendar'], [/ccd_|turn/, 'Claude'], [/doc/, 'Docs']];
  function serviceOf(tool) {
    const p = String(tool || '').split('__'), s = (p[1] || '').replace(/^claude_ai_/, ''), act = (p[2] || '').toLowerCase();
    if (!/^[0-9a-f-]{16,}$/.test(s) && !/^ccd_/.test(s)) return s.replace(/_/g, ' ');
    const hit = BY_ACTION.find(([rx]) => rx.test(s.toLowerCase() + ' ' + act));
    return hit ? hit[1] : 'שירות';
  }

  // ---------- playback ----------
  let cur = null, play = null, agent = null, queue = [], qi = 0, busy = false;
  const rowsEl = ui.querySelector('.rows');
  function rowsFor(k) {
    const st = getState(); if (!st) return [];
    const out = []; st.sessions.forEach(s => (s.recent || []).forEach(r => { if (r.src === k) out.push({ ...r, project: s.project }); }));
    return out.sort((a, b) => (a.t < b.t ? -1 : 1)).slice(-14);
  }
  function renderLog() {
    rowsEl.replaceChildren();
    if (!queue.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'עוד לא קרה כאן כלום בסשנים הפתוחים. כשסוכן ישתמש במתקן הזה, תראה את זה קורה כאן.'; rowsEl.appendChild(e); return; }
    [...queue].reverse().forEach((r, i) => {
      const d = document.createElement('div'); d.className = 'row' + (queue.length - 1 - i === qi ? ' now' : ''); d.style.setProperty('--p', hex(colorFor(r.project)));
      const t = document.createElement('time'); t.textContent = (r.t || '').slice(11, 16);
      const b = document.createElement('div'); const w = document.createElement('b'); w.textContent = r.what || r.tool; const pj = document.createElement('i'); pj.textContent = r.project;
      b.append(w, pj); d.append(t, b); rowsEl.appendChild(d);
    });
  }
  function screenFor(k, r) {
    const col = hex(SRC[k].color), base = { color: col, kicker: SRC[k].he + ' · ' + (r.t || '').slice(11, 16), title: r.what || r.tool, project: r.project, pcol: hex(colorFor(r.project)) };
    if (k === 'write' && r.d?.o != null) return p => drawMain({ ...base, p: Math.min(1, p * 2.2), lines: [{ t: '- ' + (r.d.o || '').split('\n')[0], c: '#FF7A7A', strike: p > .35 }, { t: '+ ' + (r.d.n || '').split('\n')[0].slice(0, Math.round(58 * clamp01((p - .4) * 2))), c: '#7CF2A4' }, { t: r.d.f || '', c: '#7F8B92' }] });
    if (k === 'write') return p => drawMain({ ...base, p: Math.min(1, p * 2.2), lines: [{ t: (r.d?.f || '') + (r.d?.l ? `  ·  ${r.d.l} lines` : ''), c: '#7CF2A4' }], bar: p });
    if (k === 'shell') return p => drawMain({ ...base, p: Math.min(1, p * 2.2), lines: [{ t: '$ ' + (r.d?.c || '').slice(0, Math.round(150 * clamp01(p * 1.8))), c: '#7CF2A4' }], bar: clamp01((p - .55) * 2.3) });
    if (k === 'web') return p => drawMain({ ...base, p: Math.min(1, p * 2.2), lines: [{ t: r.d?.q ? '🔍 ' + r.d.q : (r.d?.u || ''), c: '#9CC3FF' }] });
    if (k === 'media') return p => drawMain({ ...base, p: Math.min(1, p * 2.2), lines: [{ t: (r.d?.a || r.tool).replace(/_/g, ' '), c: '#F7C6E0' }, { t: r.d?.q || r.d?.u || '', c: '#C9D3DC' }], bar: p });
    return p => drawMain({ ...base, p: Math.min(1, p * 2.2), lines: [{ t: r.d?.f || r.d?.q || r.d?.u || r.d?.a || r.tool, c: '#C9D3DC' }] });
  }
  function next() {
    if (!api.active) return;
    const fresh = rowsFor(cur); if (fresh.length && (!queue.length || fresh[fresh.length - 1].t !== queue[queue.length - 1].t)) { queue = fresh; qi = Math.max(0, queue.length - 4); }
    if (!queue.length) { busy = false; agent.position.copy(STATION); agent.lookAt(0, 0, -16); drawMain({ color: hex(SRC[cur].color), kicker: SRC[cur].he, title: 'מחכה לפעולה', lines: [{ t: DOES[cur] || '', c: '#7F8B92' }] }); renderLog(); setTimeout(() => api.active && !busy && next(), 4000); return; }
    busy = true; const r = queue[qi % queue.length]; renderLog();
    setPersonColor(agent, colorFor(r.project));
    const from = agent.position.clone(), to = STATION.clone();
    T(1, p => { agent.position.lerpVectors(from, to, ease(p)); agent.userData.legs.forEach((l, i) => l.rotation.x = Math.sin(p * 30 + i * Math.PI) * .5); agent.lookAt(to.x, 0, to.z); },
      () => { agent.userData.legs.forEach(l => l.rotation.x = 0); agent.lookAt(0, 0, -16);
        const sc = screenFor(cur, r); T(3.6, p => sc(p));   // the wall screen always tells what is happening
        play(r, () => { qi = (qi + 1) % queue.length; next(); }, () => {}); });
  }

  // ---------- enter / exit ----------
  function enter(k) {
    cur = k; tweens.length = 0; theme.clear(); theme.userData = {}; delete theme.userData.idle;
    const col = SRC[k].color; stripMat.color.setHex(col); grid.material.color?.setHex?.(col); accentL.color.setHex(col);
    scene.environment = getEnv();
    queue = rowsFor(k); qi = Math.max(0, queue.length - 4);
    play = (BUILD[k] || BUILD.shell)(col, queue);
    agent = person(col); agent.position.set(0, 0, 14); theme.add(agent);
    ui.style.setProperty('--c', hex(col)); ui.querySelector('h3').textContent = SRC[k].he; ui.querySelector('p').textContent = DOES[k] || '';
    // the log panel covers the right side, so aim a little to its left (wider screens = smaller shift)
    const wide = container.clientWidth > 720, sx = wide ? 6.5 : 0;
    camera.position.set(4 + sx, wide ? 10 : 14, wide ? 25 : 44); controls.target.set(sx, 5, -4); controls.enabled = true;
    api.active = true; ui.classList.add('on'); resize(); next();
  }
  function exit() { if (!api.active) return; fade.style.opacity = 1; setTimeout(() => { api.active = false; controls.enabled = false; ui.classList.remove('on'); tweens.length = 0; onExit(); fade.style.opacity = 0; }, 450); }
  function resize() { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  function frame(t, dt) {
    renderer.toneMappingExposure = 1.05;   // the city sets its own exposure by time of day; rooms are lit indoors
    controls.update();
    for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; w.t += dt / w.dur; w.fn(Math.min(1, w.t)); if (w.t >= 1) { tweens.splice(i, 1); w.done && w.done(); } }
    theme.userData.idle && theme.userData.idle(t, dt);
    strips.forEach((s, i) => s.scale.y = .6 + .4 * Math.abs(Math.sin(t * .8 + i * .7)));
    composer.render();
  }
  const api = {
    enterNow: k => enter(k),
    exitNow: () => { api.active = false; controls.enabled = false; ui.classList.remove('on'); tweens.length = 0; onExit(); },
    active: false, enter: k => { fade.style.opacity = 1; setTimeout(() => { enter(k); fade.style.opacity = 0; }, 450); }, exit, frame, resize,
    has: k => k in BUILD,
  };
  return api;
}
