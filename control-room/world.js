// 3D "factory island": every session is a colored agent walking between buildings.
// Each building is one information source (files, web, Chrome, shell, ...). Zero tokens: driven by /api/state.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BUILDINGS = {
  files:   { he: 'ספריית הקבצים',   color: 0xE0A030, angle: 90 },
  web:     { he: 'מגדל האינטרנט',   color: 0x3D74E8, angle: 38 },
  browser: { he: 'בית הכרום',       color: 0xD9488C, angle: -14 },
  mcp:     { he: 'נמל הכלים',       color: 0x16A3A3, angle: -66 },
  shell:   { he: 'מפעל הפקודות',    color: 0x4A9A6A, angle: -118 },
  write:   { he: 'סדנת הכתיבה',     color: 0x8E73E0, angle: 142 },
  agents:  { he: 'מטה הסוכנים',     color: 0xE8663A, angle: -170 },
  tokens:  { he: 'אסם הטוקנים',     color: 0x6FB04A, angle: 116 },
};
const MODELS = {   // model -> look: size + hat, like cooks of different rank in a kitchen
  opus:   { he: 'Opus',   scale: 1.3,  hat: 'crown', color: 0xFFC107 },
  fable:  { he: 'Fable',  scale: 1.2,  hat: 'star',  color: 0xD35CFF },
  sonnet: { he: 'Sonnet', scale: 1.0,  hat: 'cap',   color: 0x2C63D6 },
  haiku:  { he: 'Haiku',  scale: .78,  hat: 'sprout', color: 0x3FBF5F },
};
const modelKey = m => /opus/i.test(m || '') ? 'opus' : /fable/i.test(m || '') ? 'fable' : /haiku/i.test(m || '') ? 'haiku' : 'sonnet';
const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0);
const PALETTE = [0xFF4D4D, 0x2EC4FF, 0xFFD23F, 0x7CFF6B, 0xFF7AE6, 0xFF9F1C, 0x9B7BFF, 0x00E5B0, 0xFFFFFF, 0xFF5E9C];
const RING = 46;

function textSprite(text, { size = 46, color = '#15201D', bg = 'rgba(255,255,255,.92)', border = null } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const font = `700 ${size}px "IBM Plex Sans Hebrew", sans-serif`;
  x.font = font;
  const w = Math.ceil(x.measureText(text).width) + size, h = Math.ceil(size * 1.6);
  c.width = w; c.height = h;
  x.font = font; x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = bg; x.beginPath(); x.roundRect(2, 2, w - 4, h - 4, h / 2.4); x.fill();
  if (border) { x.strokeStyle = border; x.lineWidth = 6; x.stroke(); }
  x.fillStyle = color; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / h * 2.2, 2.2, 1); s.renderOrder = 10;
  return s;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .75, ...extra });
const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; };

// ---- per-building working parts: each building visibly "does" its job ----
function decorate(key, g, { mat, box, add, white, dark, b }) {
  const u = g.userData; u.fx = {};
  if (key === 'files') {            // books hop out of the door and stack on a cart
    u.fx.books = [0xC0392B, 0x2C63D6, 0x3E7D5A, 0xE0A030, 0x8E73E0].map((c, i) => add(box(1.6, .6, 1.1, mat(c)), -4 + i * 2, 1, 6.2));
    add(box(11.5, .5, 3, dark), 0, .25, 6.4);
  } else if (key === 'web') {       // radar pulses climb the antenna
    u.fx.pulses = [0, 1, 2].map(i => { const r = add(new THREE.Mesh(new THREE.TorusGeometry(3, .18, 6, 28), new THREE.MeshBasicMaterial({ color: 0xBFD8FF, transparent: true, opacity: 0 })), 0, 24, 0); r.rotation.x = Math.PI / 2; r.userData.o = i / 3; return r; });
    u.fx.dish = add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), white), 0, 27, 0);
  } else if (key === 'browser') {   // a screen of scrolling "page" lines
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 5 === 0 ? '#D9488C' : '#C9D3DF'; x.fillRect(10, 8 + i * 15, 40 + ((i * 37) % 70), 7); }
    const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6), new THREE.MeshBasicMaterial({ map: t })); sc.position.set(0, 3.6, 6.95); g.add(sc);
    t.repeat.set(1, .5); u.fx.tex = t;
  } else if (key === 'shell') {     // conveyor belt with crates
    add(box(14, .5, 2.2, dark), 0, .5, 6.2);
    u.fx.crates = Array.from({ length: 6 }, (_, i) => { const m = add(box(1.4, 1.2, 1.4, mat(i % 2 ? 0xF2C14E : 0xE9E4D8)), 0, 1.4, 6.2); m.userData.p = i / 6; return m; });
  } else if (key === 'mcp') {       // crane carries a container between two stacks
    [-4.5, -2.1].forEach((x, i) => add(box(2.2, 1.6, 4, mat(i ? 0x2C63D6 : 0xD2552B)), x, 3.8, 5.4));
    u.fx.cont = add(box(2.2, 1.6, 4, mat(0xFFD23F)), 0, 12, 0);
  } else if (key === 'write') {     // a page that gets written line by line
    add(box(5, .3, 6.4, white), 0, .3, 7);
    u.fx.line = add(box(3.6, .2, .35, mat(0x2B3A35)), 0, .55, 5.4);
  } else if (key === 'tokens') {    // the grain level, plus little grains that drop in
    u.fx.fill = add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 13, 20), mat(0xF2C14E, { emissive: 0x6B4E00, emissiveIntensity: .35 })), 0, 2, 0);
    u.fx.fill.scale.y = .02;
    u.fx.grains = Array.from({ length: 6 }, (_, i) => { const m2 = add(new THREE.Mesh(new THREE.SphereGeometry(.45, 6, 5), mat(0xF2C14E)), 0, 14, 0); m2.userData.p = i / 6; return m2; });
  } else if (key === 'agents') {    // beacon rotates, spawning pad glows
    u.fx.beacon = add(new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 4), mat(0xFFD23F, { emissive: 0xFFB020, emissiveIntensity: .8 })), 0, 11, 0);
    u.fx.pad = add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .25, 20), mat(0x2B3A35)), 0, .15, 6.6);
  }
  const ticker = textSprite('מחכה לפעולה', { size: 28, bg: 'rgba(21,32,29,.82)', color: '#fff' });
  ticker.position.set(0, 1.2, 10.5); ticker.scale.multiplyScalar(1.1); g.add(ticker); u.ticker = ticker; ticker.userData.text = '';
}

function animateBuilding(key, b, t, dt) {
  const u = b.userData, f = u.fx || {}, hot = u.hot || 0, k = .3 + hot * 2.2;
  if (f.books) f.books.forEach((m, i) => { m.position.y = 1 + Math.abs(Math.sin(t * 2 * k + i * 1.3)) * (.5 + hot * 3); m.rotation.y = Math.sin(t * k + i) * .6 * hot; });
  if (f.pulses) f.pulses.forEach(r => { const p = (t * .5 * k + r.userData.o) % 1; r.scale.setScalar(.4 + p * 3.2); r.position.y = 24 + p * 6; r.material.opacity = (1 - p) * (.25 + hot * .7); });
  if (f.dish) f.dish.rotation.y += dt * 2 * k;
  if (f.tex) f.tex.offset.y -= dt * .15 * k;
  if (f.crates) f.crates.forEach(m => { m.userData.p = (m.userData.p + dt * .06 * k) % 1; m.position.x = -6.5 + m.userData.p * 13; m.rotation.y = hot * Math.sin(t * 6) * .2; });
  if (f.cont) { const s = Math.sin(t * .6 * k); f.cont.position.x = s * 3.2 - 1; f.cont.position.y = 9.5 + (Math.cos(t * 1.2 * k) + 1) * 1.8; f.cont.position.z = 1.5 + s * 2; }
  if (f.line) { const p = (t * .3 * k) % 1; f.line.scale.x = .15 + p * .85; f.line.position.x = -1.8 + p * 1.8 * .85; f.line.position.z = 5.4 + Math.floor((t * .3 * k) % 4) * .9 - 1.3; }
  if (f.fill) {
    const target = Math.max(.03, u.level || 0), h = 13 * f.fill.scale.y;
    f.fill.scale.y += (target - f.fill.scale.y) * Math.min(1, dt * 1.5); f.fill.position.y = 1.5 + 13 * f.fill.scale.y / 2;
    f.grains.forEach(m2 => { m2.userData.p = (m2.userData.p + dt * .5 * (.4 + (u.level || 0))) % 1; m2.position.set(Math.sin(m2.userData.p * 9) * 1.5, 15.5 - m2.userData.p * (13 - h * .9), Math.cos(m2.userData.p * 9) * 1.5); m2.visible = m2.position.y > 1.5 + h; });
  }
  if (f.beacon) { f.beacon.rotation.y += dt * 2.5 * k; f.beacon.position.y = 11 + Math.sin(t * 2) * .4; }
  if (f.pad) f.pad.material.emissive = new THREE.Color(0xFFB020), f.pad.material.emissiveIntensity = hot * .8;
}

function buildBuilding(key) {
  const b = BUILDINGS[key], g = new THREE.Group(), m = mat(b.color), white = mat(0xF4F1EA), dark = mat(0x2B3A35);
  const add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); g.add(o); return o; };
  if (key === 'files') {           // library: block + stacked "books"
    add(box(11, 7, 9, m), 0, 3.5, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(8.4, 4, 4), white), 0, 9, 0).rotation.y = Math.PI / 4;
    [0xC0392B, 0x2C63D6, 0x3E7D5A].forEach((c, i) => add(box(2.4, 3.4, .9, mat(c)), -3 + i * 3, 3, 4.8));
  } else if (key === 'web') {      // tower + antenna + spinning ring
    add(new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 20, 8), m), 0, 10, 0).castShadow = true;
    add(new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 7), dark), 0, 23.5, 0);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(5, .45, 8, 24), white), 0, 15, 0);
    ring.rotation.x = Math.PI / 2; g.userData.spin = ring;
  } else if (key === 'browser') {  // dome with window band
    add(new THREE.Mesh(new THREE.SphereGeometry(7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m), 0, 0, 0).castShadow = true;
    add(new THREE.Mesh(new THREE.TorusGeometry(7.05, .5, 6, 32), white), 0, 2.6, 0).rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.CircleGeometry(2, 20), mat(0xFFFFFF, { emissive: 0xFFD6EA, emissiveIntensity: .6 })), 0, 3, 6.6);
  } else if (key === 'shell') {    // factory + chimneys (smoke handled in tick)
    add(box(13, 6, 9, m), 0, 3, 0);
    add(box(13, 1.6, 9, dark), 0, 6.8, 0);
    g.userData.chimneys = [-4, 1].map(x => add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 8, 8), dark), x, 10, -2));
  } else if (key === 'mcp') {      // harbor + crane
    add(box(12, 3, 9, m), 0, 1.5, 0);
    add(box(1.2, 14, 1.2, mat(0xFFD23F)), 4, 10, 0);
    add(box(10, 1, 1, mat(0xFFD23F)), 0, 16.5, 0);
    add(box(2.5, 2.5, 2.5, mat(0xFF7A3D)), -4, 12, 0);
  } else if (key === 'write') {    // workshop + giant pencil
    add(box(9, 6, 9, m), 0, 3, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 10, 6), mat(0xFFD23F)), 3, 11, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 6), white), 3, 17.5, 0);
  } else if (key === 'tokens') {   // grain silo: glass tank whose fill = today's tokens
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 14, 20), new THREE.MeshStandardMaterial({ color: 0xDFF6FF, transparent: true, opacity: .32, roughness: .1 }));
    add(glass, 0, 8, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 1, 20), dark), 0, 1, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(4.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m), 0, 15, 0);
  } else if (key === 'agents') {   // HQ hexagon
    add(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 8, 6), m), 0, 4, 0).castShadow = true;
    add(new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 1, 6), white), 0, 8.5, 0);
  }
  decorate(key, g, { mat, box, add, white, dark, b });
  const pulse = new THREE.Mesh(new THREE.RingGeometry(7.5, 8.5, 40), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0 }));
  pulse.userData.pulseRing = true; pulse.rotation.x = -Math.PI / 2; pulse.position.y = .15; g.add(pulse); g.userData.pulse = pulse;
  const label = textSprite(b.he, { border: '#' + b.color.toString(16).padStart(6, '0') });
  label.position.set(0, key === 'web' ? 27.5 : 15.5, 0); label.scale.multiplyScalar(1.25); g.add(label);
  const count = textSprite('0', { size: 34, bg: 'rgba(21,32,29,.85)', color: '#fff' });
  count.position.set(0, key === 'web' ? 24.4 : 12.4, 0); count.scale.multiplyScalar(1.1); g.add(count); g.userData.count = count;
  const a = b.angle * Math.PI / 180;
  g.position.set(Math.cos(a) * RING, 0, -Math.sin(a) * RING);
  g.lookAt(0, 0, 0);
  g.userData.door = new THREE.Vector3(Math.cos(a) * (RING - 10), 0, -Math.sin(a) * (RING - 10));
  return g;
}

function makeHat(kind, color) {
  const m = mat(color, { roughness: .4 }), g = new THREE.Group();
  if (kind === 'crown') { const c = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.1, 5), m); c.position.y = 5.1; g.add(c); const r = new THREE.Mesh(new THREE.TorusGeometry(.95, .14, 6, 12), m); r.rotation.x = Math.PI / 2; r.position.y = 4.6; g.add(r); }
  if (kind === 'star') { const s = new THREE.Mesh(new THREE.OctahedronGeometry(.8), mat(color, { emissive: color, emissiveIntensity: .6 })); s.position.y = 5.5; s.userData.spin = true; g.add(s); }
  if (kind === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(1.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); c.position.y = 4.35; g.add(c); const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, .12, .9), m); b.position.set(0, 4.4, .9); g.add(b); }
  if (kind === 'sprout') { const s = new THREE.Mesh(new THREE.ConeGeometry(.28, 1, 4), m); s.position.y = 5.1; g.add(s); const l = new THREE.Mesh(new THREE.SphereGeometry(.35, 6, 5), m); l.position.set(.4, 5.2, 0); g.add(l); }
  return g;
}

function makeAgent(color, small = false) {
  const g = new THREE.Group(), m = mat(color, { roughness: .45 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1.6, 4, 10), m); body.position.y = 2; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), m); head.position.y = 4.1; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.5, .5, .5), mat(0x15201D, { roughness: .2 })); visor.position.set(0, 4.2, .85);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, .7), mat(0x2B3A35)); pack.position.set(0, 2.4, -1);
  g.add(body, head, visor, pack);
  if (small) g.scale.setScalar(.6);
  g.userData.parts = [body, head, visor, pack];
  return g;
}

// ---------- the wider island: roads, fountain, mountains, lighthouse, windmills, boat, birds, day/night ----------
const ISLAND = 110;
function buildEnvironment(scene, rand, lights) {
  const env = { lamps: [], drops: [], mills: [], birds: [] };
  const add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); scene.add(o); return o; };
  const sh = o => { o.castShadow = o.receiveShadow = true; return o; };

  add(new THREE.Mesh(new THREE.CircleGeometry(700, 64), mat(0x3FB6E8, { roughness: .25, metalness: .1 })), 0, -2.2, 0).rotation.x = -Math.PI / 2;
  add(sh(new THREE.Mesh(new THREE.CylinderGeometry(ISLAND + 6, ISLAND + 12, 3, 64), mat(0xF2D99A))), 0, -1.6, 0);
  add(sh(new THREE.Mesh(new THREE.CylinderGeometry(ISLAND, ISLAND + 2, 1, 64), mat(0x6CCB5F))), 0, -.5, 0);
  // plaza + ring road that links every building door
  add(sh(new THREE.Mesh(new THREE.CylinderGeometry(16, 16, .3, 40), mat(0xE9E4D8))), 0, .1, 0);
  const road = add(new THREE.Mesh(new THREE.RingGeometry(RING - 12.5, RING - 8.5, 72), mat(0xC9C2B3)), 0, .07, 0); road.rotation.x = -Math.PI / 2; road.receiveShadow = true;
  // fountain in the plaza
  add(sh(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6, 1.2, 24), mat(0xBFB7A6))), 0, .6, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, .2, 24), mat(0x58C4F0, { roughness: .1 })), 0, 1.15, 0);
  add(sh(new THREE.Mesh(new THREE.CylinderGeometry(.7, 1, 4, 10), mat(0xBFB7A6))), 0, 3, 0);
  const star = add(new THREE.Mesh(new THREE.OctahedronGeometry(1.4), mat(0xE8833A, { emissive: 0xE8833A, emissiveIntensity: .5 })), 0, 6.2, 0); env.star = star;
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xBFEFFF, transparent: true, opacity: .85 });
  for (let i = 0; i < 26; i++) { const d = add(new THREE.Mesh(new THREE.SphereGeometry(.22, 5, 4), dropMat), 0, 5, 0); d.userData = { a: i / 26 * Math.PI * 2, p: rand() }; env.drops.push(d); }
  // lamp posts along the ring road
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + .09, r = RING - 7.6;
    add(new THREE.Mesh(new THREE.CylinderGeometry(.15, .2, 4.6, 6), mat(0x2B3A35)), Math.cos(a) * r, 2.3, Math.sin(a) * r);
    const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0xFFF3C4, emissive: 0xFFD27A, emissiveIntensity: 0 })), Math.cos(a) * r, 4.8, Math.sin(a) * r);
    env.lamps.push(bulb);
  }
  // mountains on the far side
  [[200, 34, 15], [214, 44, 18], [228, 30, 13], [243, 38, 16], [256, 26, 12]].forEach(([deg, h, rad]) => {
    const a = deg * Math.PI / 180, r = ISLAND - 14;
    add(sh(new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mat(0x7A8B6F))), Math.cos(a) * r, h / 2 - .5, Math.sin(a) * r);
    add(new THREE.Mesh(new THREE.ConeGeometry(rad * .38, h * .38, 7), mat(0xF4F7F8)), Math.cos(a) * r, h - h * .19 - .5, Math.sin(a) * r);
  });
  // lighthouse with a sweeping beam
  { const a = -38 * Math.PI / 180, r = ISLAND + 3, x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let i = 0; i < 5; i++) add(sh(new THREE.Mesh(new THREE.CylinderGeometry(2.6 - i * .25, 2.85 - i * .25, 3.6, 14), mat(i % 2 ? 0xD84B3E : 0xF6F3EE))), x, 1.8 + i * 3.6, z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0xFFF6C9, emissive: 0xFFE38A, emissiveIntensity: .7 })), x, 20, z);
    const beam = add(new THREE.Mesh(new THREE.ConeGeometry(5, 34, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xFFF2B0, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false })), x, 20, z);
    beam.geometry.translate(0, -17, 0); beam.rotation.z = Math.PI / 2; env.beam = beam; env.beamPivot = new THREE.Vector3(x, 20, z); }
  // windmills
  [[160, 92], [312, 90], [20, 94]].forEach(([deg, r]) => {
    const a = deg * Math.PI / 180, x = Math.cos(a) * r, z = Math.sin(a) * r;
    add(sh(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 13, 8), mat(0xF1E9DA))), x, 6.5, z);
    add(new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 8), mat(0xC0563F)), x, 14.5, z);
    const hub = new THREE.Group(); hub.position.set(x, 13, z); hub.lookAt(0, 13, 0); hub.translateZ(2.4); scene.add(hub);
    const blades = new THREE.Group(); hub.add(blades);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, .2), mat(0xFFFFFF)); b.position.y = 4; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); blades.add(arm); }
    env.mills.push(blades);
  });
  // a boat circling the island
  { const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 8), mat(0x8C5A3C)); hull.position.y = .3; boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 7), mat(0x5A4030)); mast.position.y = 4; boat.add(mast);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 3), mat(0xFFFFFF)); sail.position.set(0, 4.5, .6); sail.scale.z = .15; boat.add(sail);
    scene.add(boat); env.boat = boat; }
  // birds
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group(), wm = mat(0x2B2B2B);
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.6, .12, .5), wm), r2 = l.clone(); l.position.x = -.8; r2.position.x = .8; b.add(l, r2);
    b.userData = { r: 40 + rand() * 50, h: 34 + rand() * 18, s: .12 + rand() * .1, o: rand() * 6.3, wl: l, wr: r2 }; scene.add(b); env.birds.push(b);
  }
  // stars for the night sky
  { const g = new THREE.BufferGeometry(), n = 500, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = rand() * Math.PI * 2, ph = rand() * Math.PI * .45, R = 480; p[i * 3] = Math.cos(th) * Math.sin(ph) * R; p[i * 3 + 1] = Math.cos(ph) * R * .6 + 40; p[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * R; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    env.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, depthWrite: false })); scene.add(env.stars); }

  // ---- magic: fireflies, floating crystals, night aurora, glowing rune ring ----
  { const n = 160, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), ph = [];
    for (let i = 0; i < n; i++) { const a = rand() * 6.28, r = 20 + rand() * 86; p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = 1 + rand() * 9; p[i * 3 + 2] = Math.sin(a) * r; ph.push(rand() * 6.28); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    env.fly = { pts: new THREE.Points(g, new THREE.PointsMaterial({ color: 0xFFF7B0, size: 1.1, transparent: true, opacity: .0, depthWrite: false, blending: THREE.AdditiveBlending })), ph, p }; scene.add(env.fly.pts); }
  env.crystals = [[-0, 0], [0, 0]].map((_, i) => { const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.1 + i * .5), new THREE.MeshStandardMaterial({ color: i ? 0x8E73E0 : 0x59E0FF, emissive: i ? 0x6B44E0 : 0x1FB6E0, emissiveIntensity: .9, flatShading: true })); scene.add(c); c.userData = { a: i * 3.14, r: 8 + i * 2.5 }; return c; });
  { const rune = new THREE.Mesh(new THREE.RingGeometry(14, 15.2, 64), new THREE.MeshBasicMaterial({ color: 0x9ED7FF, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); rune.rotation.x = -Math.PI / 2; rune.position.y = .25; scene.add(rune); env.rune = rune;
    const rune2 = new THREE.Mesh(new THREE.RingGeometry(12.4, 12.7, 6), rune.material); rune2.rotation.x = -Math.PI / 2; rune2.position.y = .28; scene.add(rune2); env.rune2 = rune2; }
  env.aurora = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.PlaneGeometry(420, 60, 24, 1), new THREE.MeshBasicMaterial({ color: [0x4DFFB0, 0x6B8CFF, 0xC86BFF][i], transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(-40 + i * 40, 120 + i * 14, -300 - i * 20); m.rotation.y = .15 * (i - 1); scene.add(m); return m; });

  const DAY = new THREE.Color(0x8FD3FF), DUSK = new THREE.Color(0xF7A26B), NIGHT = new THREE.Color(0x0C1530), sky = new THREE.Color();
  env.update = (t, dt) => {
    // day/night follows the real local clock
    const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
    const day = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));          // 0 at night, 1 at noon
    const dusk = Math.max(0, 1 - Math.abs(h - 18.5) / 1.5) + Math.max(0, 1 - Math.abs(h - 6) / 1.2);
    sky.copy(NIGHT).lerp(DAY, Math.min(1, day * 1.6)).lerp(DUSK, Math.min(.65, dusk * .65));
    scene.background.copy(sky); scene.fog.color.copy(sky);
    lights.sun.intensity = .25 + day * 2.1; lights.hemi.intensity = .35 + day * .85;
    const night = 1 - Math.min(1, day * 2.5);
    env.lamps.forEach(l => l.material.emissiveIntensity = night * 1.6);
    env.stars.material.opacity = night * .9;
    // motion
    env.star.rotation.y += dt * .9;
    { const f = env.fly, pos = f.pts.geometry.attributes.position; for (let i = 0; i < f.ph.length; i++) { pos.array[i * 3 + 1] = 2 + (Math.sin(t * .7 + f.ph[i]) + 1) * 4; pos.array[i * 3] += Math.cos(t * .4 + f.ph[i]) * dt * .8; pos.array[i * 3 + 2] += Math.sin(t * .5 + f.ph[i]) * dt * .8; } pos.needsUpdate = true; f.pts.material.opacity = .25 + night * .7; }
    env.crystals.forEach(c => { const u = c.userData; u.a += dt * (.5 + u.r * .02); c.position.set(Math.cos(u.a) * u.r, 11 + Math.sin(t * 1.3 + u.a) * 1.2, Math.sin(u.a) * u.r); c.rotation.y += dt; c.rotation.x += dt * .5; });
    env.rune.rotation.z += dt * .15; env.rune2.rotation.z -= dt * .25; env.rune.material.opacity = .25 + night * .55;
    env.aurora.forEach((m, i) => { m.material.opacity = night * (.12 + .08 * Math.sin(t * .6 + i * 2)); const pa = m.geometry.attributes.position; for (let k = 0; k < pa.count; k++) pa.setZ(k, Math.sin(pa.getX(k) * .03 + t * .5 + i) * 10); pa.needsUpdate = true; });
    env.drops.forEach(d => { d.userData.p = (d.userData.p + dt * .7) % 1; const p = d.userData.p, r = .6 + p * 4.2; d.position.set(Math.cos(d.userData.a) * r, 5.4 + p * 3 - p * p * 7.5, Math.sin(d.userData.a) * r); });
    env.mills.forEach((m, i) => m.rotation.z += dt * (.6 + i * .15));
    env.beam.rotation.y = t * .8; env.beam.material.opacity = .08 + night * .22;
    const ba = t * .05; env.boat.position.set(Math.cos(ba) * (ISLAND + 32), -1.6 + Math.sin(t * 1.4) * .25, Math.sin(ba) * (ISLAND + 32)); env.boat.rotation.y = -ba; env.boat.rotation.z = Math.sin(t * 1.1) * .05;
    env.birds.forEach(b => { const u = b.userData, a = t * u.s + u.o; b.position.set(Math.cos(a) * u.r, u.h + Math.sin(t + u.o) * 2, Math.sin(a) * u.r); b.rotation.y = -a; const f = Math.sin(t * 9 + u.o) * .5; u.wl.rotation.z = f; u.wr.rotation.z = -f; });
  };
  return env;
}

// a little house per live project; its agent rests here when waiting for you
function makeHouse(color, name) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5.5, 7), mat(0xF4EEE2)); body.position.y = 2.75; body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 4, 4), mat(color)); roof.position.y = 7.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, .3), mat(0x6B4A33)); door.position.set(0, 1.5, 3.55);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, .3), new THREE.MeshStandardMaterial({ color: 0xFFF3C4, emissive: 0xFFD27A, emissiveIntensity: .25 })); win.position.set(2.5, 3.4, 3.55);
  const sign = textSprite(name.slice(0, 18), { size: 30, border: '#' + color.toString(16).padStart(6, '0') }); sign.position.y = 11.5; sign.scale.multiplyScalar(1.05);
  g.add(body, roof, door, win, sign); g.userData.win = win;
  return g;
}

export function createWorld(container, { onAgentClick, onBuildingClick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8FD3FF);
  scene.fog = new THREE.Fog(0x8FD3FF, 190, 520);
  const camera = new THREE.PerspectiveCamera(42, 1, .5, 1400);
  camera.position.set(0, 105, 150);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.15; controls.minDistance = 25; controls.maxDistance = 330;
  controls.target.set(0, 4, 0);

  const hemi = new THREE.HemisphereLight(0xDFF4FF, 0x5C8A4A, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFF2D6, 2.2);
  sun.position.set(-80, 140, 60); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, far: 420 });
  scene.add(sun);

  const rand = (() => { let s = 7; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
  const env = buildEnvironment(scene, rand, { sun, hemi });
  const hq = textSprite('כיכר המזרקה', { size: 36 }); hq.position.set(0, 10.5, 0); hq.scale.multiplyScalar(.85); scene.add(hq);

  const buildings = {}, bClickables = [];
  for (const k of Object.keys(BUILDINGS)) {
    const b = buildBuilding(k); buildings[k] = b; scene.add(b);
    b.traverse(o => { if (o.isMesh && !o.userData.pulseRing) { o.userData.bkey = k; bClickables.push(o); } });
    const plen = RING - 12.5 - 16, path = new THREE.Mesh(new THREE.PlaneGeometry(4, plen), mat(0xE9E4D8));
    const a = BUILDINGS[k].angle * Math.PI / 180, r = 16 + plen / 2;
    path.rotation.x = -Math.PI / 2; path.rotation.z = a - Math.PI / 2;
    path.position.set(Math.cos(a) * r, .05, -Math.sin(a) * r); path.receiveShadow = true; scene.add(path);
  }
  // forest belt (skips the mountain side and keeps clear of the house ring) + clouds
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2, deg = (a * 180 / Math.PI) % 360, r = 84 + rand() * 22;
    if (deg > 192 && deg < 264 && r > 88) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 2.4, 6), mat(0x8C6B4A)); trunk.position.y = 1.2;
    const top = new THREE.Mesh(new THREE.ConeGeometry(2 + rand(), 5 + rand() * 3, 7), mat(rand() > .5 ? 0x3E9E4F : 0x52B85E));
    top.position.y = 5; top.castShadow = trunk.castShadow = true; t.add(trunk, top);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(t);
  }
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, flatShading: true, transparent: true, opacity: .92 });
    for (let j = 0; j < 4; j++) { const p = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 3, 8, 6), cm); p.position.set(j * 5 - 7, rand() * 2, rand() * 3); c.add(p); }
    c.position.set(-260 + rand() * 520, 62 + rand() * 24, -220 + rand() * 300); c.userData.v = .8 + rand(); scene.add(c); clouds.push(c);
  }
  const smoke = [];

  // ----- agents -----
  const agents = new Map();      // session id -> agent record
  const colorOf = new Map(); let nextColor = 0;
  const clickables = [];

  function ensureAgent(s) {
    let a = agents.get(s.id);
    if (a) return a;
    if (!colorOf.has(s.project)) colorOf.set(s.project, PALETTE[nextColor++ % PALETTE.length]);
    const mesh = makeAgent(colorOf.get(s.project));
    const ang = Math.random() * Math.PI * 2;
    mesh.position.set(Math.cos(ang) * 6, 0, Math.sin(ang) * 6);
    const tag = textSprite(s.project.slice(0, 18), { size: 34, border: '#' + colorOf.get(s.project).toString(16).padStart(6, '0') });
    tag.position.y = 7.4; tag.scale.multiplyScalar(1.15); mesh.add(tag);
    const zz = textSprite('Zz', { size: 30, bg: 'rgba(255,255,255,.0)', color: '#2B3A35' }); zz.position.set(1.6, 6, 0); zz.scale.multiplyScalar(.6); zz.visible = false; mesh.add(zz);
    scene.add(mesh);
    mesh.userData.parts.forEach(p => { p.userData.sid = s.id; clickables.push(p); });
    const crate = box(1.3, 1.3, 1.3, mat(0xffffff)); crate.position.set(0, 5.6, 0); crate.visible = false; mesh.add(crate);
    a = { id: s.id, mesh, tag, zz, crate, target: mesh.position.clone(), route: [], ri: 0, phase: 'walk', step: 0, dwell: 0, helpers: [], lastT: '' };
    agents.set(s.id, a);
    return a;
  }

  function spotNear(src, seed) {
    const b = buildings[src] || null;
    if (!b) { const a = seed * 2.4; return new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10); }
    const d = b.userData.door.clone(), off = ((seed * 7.3) % 1 - .5) * 6;
    return d.add(new THREE.Vector3(off, 0, ((seed * 3.1) % 1 - .5) * 4));
  }

  const houses = new Map(); let houseSlot = 0;
  function ensureHouse(project) {
    let h = houses.get(project); if (h) return h;
    const deg = 15 + (houseSlot++ % 9) * 40, a = deg * Math.PI / 180, r = 68;
    const g = makeHouse(colorOf.get(project), project);
    g.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r); g.lookAt(0, 0, 0); scene.add(g);
    h = { g, door: new THREE.Vector3(Math.cos(a) * (r - 6), 0, -Math.sin(a) * (r - 6)) }; houses.set(project, h); return h;
  }

  function setTicker(b, text) {
    const old = b.userData.ticker; if (old.userData.text === text) return;
    const fresh = textSprite(text, { size: 28, bg: 'rgba(21,32,29,.82)', color: '#fff' });
    fresh.position.copy(old.position); fresh.scale.copy(old.scale).multiplyScalar(1); fresh.userData.text = text;
    b.remove(old); old.material.map.dispose(); b.add(fresh); b.userData.ticker = fresh;
  }

  function update(state, verb = r => r.tool) {
    // each building's ticker shows the latest thing done there, from any session
    const latest = {};
    state.sessions.forEach(s => s.recent.forEach(r => { if (!latest[r.src] || r.t > latest[r.src].t) latest[r.src] = { ...r, project: s.project }; }));
    for (const [k, b] of Object.entries(buildings)) {
      if (k === 'tokens') { setTicker(b, `היום ${fmtTok(state.tokens?.today)} טוקנים`); continue; }
      const r = latest[k]; setTicker(b, r ? (r.what || verb(r)).slice(0, 46) : 'מחכה לפעולה');
    }
    // only sessions that are actually open: working, or waiting for you. Closed ones are gone from the island.
    const live = state.sessions.filter(s => s.status !== 'closed' && s.total > 0).slice(0, 10);
    const tk = state.tokens || { today: 0, max_day: 1 };
    buildings.tokens.userData.level = Math.min(1, (tk.today || 0) / Math.max(tk.max_day || 1, 1));
    buildings.tokens.userData.hot = Math.max(buildings.tokens.userData.hot || 0, live.some(s => s.status === 'working') ? .45 : 0);
    const ids = new Set(live.map(s => s.id));
    for (const [id, a] of agents) if (!ids.has(id)) { scene.remove(a.mesh); a.helpers.forEach(h => scene.remove(h.mesh)); agents.delete(id); }
    const liveProjects = new Set(live.map(s => s.project));
    for (const [p, h] of houses) if (!liveProjects.has(p)) { scene.remove(h.g); houses.delete(p); }
    live.forEach((s, i) => {
      const a = ensureAgent(s);
      a.home = ensureHouse(s.project).door;
      a.status = s.status; a.recent = s.recent; a.seed = (i + 1) * .137; a.projectName = s.project;
      const mk = modelKey(s.model);
      if (a.model !== mk) {
        if (a.hat) a.mesh.remove(a.hat);
        a.model = mk; a.hat = makeHat(MODELS[mk].hat, MODELS[mk].color); a.mesh.add(a.hat); a.bs = MODELS[mk].scale; a.mesh.scale.setScalar(a.bs);
      }
      const routeNow = [];
      s.recent.slice(-8).forEach(r => { if (buildings[r.src] && routeNow[routeNow.length - 1] !== r.src) routeNow.push(r.src); });
      if (routeNow.join() !== a.route.join()) { a.route = routeNow; if (a.ri >= routeNow.length) a.ri = 0; }
      const op = s.status === 'closed' ? .45 : 1;
      a.mesh.userData.parts.forEach(p => { p.material.transparent = op < 1; p.material.opacity = op; });
      // helpers = live subagents
      const want = (s.helpers || []).slice(0, 4);
      while (a.helpers.length > want.length) scene.remove(a.helpers.pop().mesh);
      while (a.helpers.length < want.length) {
        const m = makeAgent(colorOf.get(s.project), true); m.position.copy(a.mesh.position); scene.add(m);
        a.helpers.push({ mesh: m, target: m.position.clone() });
      }
      a.helpers.forEach((h, j) => h.target = spotNear(want[j].src, a.seed + j * .31));
    });
    const totals = state.sources_total || {};
    for (const [k, b] of Object.entries(buildings)) {
      const old = b.userData.count; const n = k === 'tokens' ? fmtTok(state.tokens?.total) : String(totals[k] || 0);
      if (old.userData.text !== n) {
        const fresh = textSprite(n, { size: 34, bg: 'rgba(21,32,29,.85)', color: '#fff' });
        fresh.position.copy(old.position); fresh.scale.copy(old.scale); fresh.userData.text = n;
        b.remove(old); b.add(fresh); b.userData.count = fresh;
      }
    }
    return [...colorOf.entries()].filter(([p]) => live.some(s => s.project === p));
  }

  // ----- loop -----
  const clock = new THREE.Clock();
  function step(obj, target, dt, speed) {
    const d = target.clone().sub(obj.position); d.y = 0;
    const dist = d.length();
    if (dist > .3) {
      d.normalize(); obj.position.addScaledVector(d, Math.min(dist, speed * dt));
      obj.rotation.y = Math.atan2(d.x, d.z);
      obj.position.y = Math.abs(Math.sin(performance.now() / 110)) * .35;
      return false;
    }
    obj.position.y = 0; return true;
  }
  function tick() {
    const dt = Math.min(clock.getDelta(), .05), t = performance.now() / 1000;
    controls.update();
    for (const a of agents.values()) {
      a.zz.visible = a.status === 'idle';
      if (a.status === 'idle') { a.target = a.home ? a.home.clone() : spotNear(null, a.seed); }
      else if (a.status === 'working') {
        if (!a.route.length) a.target = spotNear(null, a.seed);
        else if (a.phase === 'walk') { a.target = spotNear(a.route[a.ri % a.route.length], a.seed); }
        else {                                    // phase 'work': stand at the door, building lights up
          const src = a.route[a.ri % a.route.length]; buildings[src].userData.hot = 1;
          a.dwell -= dt; a.mesh.rotation.y += (Math.atan2(-a.mesh.position.x, -a.mesh.position.z) - a.mesh.rotation.y) * Math.min(1, dt * 6);
          a.mesh.position.y = Math.abs(Math.sin(t * 9)) * .5;
          if (a.dwell <= 0) { a.crate.material.color.setHex(BUILDINGS[src].color); a.crate.visible = true; a.ri = (a.ri + 1) % a.route.length; a.phase = 'walk'; }
        }
      }
      else { // closed: replay its last actions slowly so the island stays alive
        a.dwell -= dt;
        if (a.dwell <= 0 && a.recent && a.recent.length) { a.step = (a.step + 1) % a.recent.length; a.target = spotNear(a.recent[a.step].src, a.seed); a.dwell = 4.5; }
      }
      if (a.status !== 'working' || a.phase === 'walk') {
        const arrived = step(a.mesh, a.target, dt, a.status === 'closed' ? 5 : 13);
        if (arrived && a.status === 'working' && a.route.length) { a.phase = 'work'; a.dwell = 2.6; a.crate.visible = false; }
        if (arrived && a.status === 'closed') { const s = a.route[a.ri % (a.route.length || 1)]; if (s && buildings[s]) buildings[s].userData.hot = Math.max(buildings[s].userData.hot || 0, .6); }
      }
      if (a.status !== 'working') a.crate.visible = false;
      if (a.crate.visible) a.crate.rotation.y += dt * 3;
      const bs = a.bs || 1;
      a.mesh.scale.set(bs, bs * (a.status === 'idle' ? .85 + Math.sin(t * 1.5) * .03 : 1), bs);
      if (a.hat) a.hat.children.forEach(c => { if (c.userData.spin) { c.rotation.y += dt * 2; c.position.y = 5.5 + Math.sin(t * 2) * .2; } });
      a.helpers.forEach(h => step(h.mesh, h.target, dt, 13));
    }
    for (const [bk, b] of Object.entries(buildings)) {
      animateBuilding(bk, b, t, dt);
      const p = b.userData.pulse; b.userData.hot = Math.max(0, (b.userData.hot || 0) - dt * .8);
      p.material.opacity = b.userData.hot * (.5 + .5 * Math.sin(t * 8)); p.scale.setScalar(1 + (1 - b.userData.hot) * .25);
      if (b.userData.spin) b.userData.spin.rotation.z += dt * .8;
      if (b.userData.chimneys && Math.random() < dt * 2.2) b.userData.chimneys.forEach(c => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(.9, 6, 5), new THREE.MeshStandardMaterial({ color: 0xF2F2F2, transparent: true, opacity: .8, flatShading: true }));
        c.getWorldPosition(puff.position); puff.position.y += 4.5; puff.userData.life = 0; scene.add(puff); smoke.push(puff);
      });
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i]; s.userData.life += dt; s.position.y += dt * 3; s.scale.setScalar(1 + s.userData.life * 1.2); s.material.opacity = .8 - s.userData.life * .3;
      if (s.userData.life > 2.6) { scene.remove(s); smoke.splice(i, 1); }
    }
    clouds.forEach(c => { c.position.x += c.userData.v * dt * 3; if (c.position.x > 280) c.position.x = -280; });
    env.update(t, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  renderer.domElement.addEventListener('pointerup', e => {
    const d0 = down; down = null;
    if (!d0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(clickables, false)[0];
    if (hit) return onAgentClick(hit.object.userData.sid);
    const bh = ray.intersectObjects(bClickables, false)[0];
    if (bh && onBuildingClick) onBuildingClick(bh.object.userData.bkey);
  });

  function focus(project) {
    const a = [...agents.values()].find(x => x.projectName === project);
    if (a) { controls.target.copy(a.mesh.position); camera.position.set(a.mesh.position.x, 34, a.mesh.position.z + 42); }
  }

  tick();
  const colorFor = p => { if (!colorOf.has(p)) colorOf.set(p, PALETTE[nextColor++ % PALETTE.length]); return colorOf.get(p); };
  return { update, focus, colorFor };
}
