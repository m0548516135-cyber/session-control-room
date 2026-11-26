// "המתחם" — realistic architectural campus for the control room.
// Same interface as world.js: createWorld(container, {onAgentClick, onBuildingClick}) -> {update, focus, colorFor}.
// Every building = one information source; every figure = one live session. Zero tokens: driven by /api/state.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createInteriors } from './interiors.js';

const SRC = {
  agents:  { he: 'מרכז השליטה',   color: 0xE8663A },
  media:   { he: 'סטודיו המדיה',  color: 0xF0609A },
  skills:  { he: 'מרכז הסקילים',  color: 0xE8B931 },
  web:     { he: 'מגדל האינטרנט', color: 0x3D74E8 },
  files:   { he: 'ספריית הקבצים', color: 0xE0A030 },
  browser: { he: 'ביתן הכרום',    color: 0xD9488C },
  write:   { he: 'סטודיו הכתיבה', color: 0x8E73E0 },
  shell:   { he: 'מרכז הפקודות',  color: 0x4A9A6A },
  mcp:     { he: 'שערי השירותים', color: 0x16A3A3 },
  tokens:  { he: 'תחנת הכוח',     color: 0x6FB04A },
};
const MODELS = {
  opus:   { he: 'Opus',   hat: 'crown',  color: 0xFFC107, scale: 1.18 },
  fable:  { he: 'Fable',  hat: 'star',   color: 0xD35CFF, scale: 1.12 },
  sonnet: { he: 'Sonnet', hat: 'cap',    color: 0x2C63D6, scale: 1.0 },
  haiku:  { he: 'Haiku',  hat: 'sprout', color: 0x3FBF5F, scale: .86 },
};
const modelKey = m => /opus/i.test(m || '') ? 'opus' : /fable/i.test(m || '') ? 'fable' : /haiku/i.test(m || '') ? 'haiku' : 'sonnet';
const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0);
const PALETTE = [0xFF4D4D, 0x2EC4FF, 0xFFD23F, 0x7CFF6B, 0xFF7AE6, 0xFF9F1C, 0x9B7BFF, 0x00E5B0, 0xFFFFFF, 0xFF5E9C];
const hex = c => '#' + c.toString(16).padStart(6, '0');
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
const AGENT_SCALE = 2.1;

// ---------- shared textures ----------
function windowTexture(seed = 1, lit = .55) {
  let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  const cols = 8, rows = 8, cw = 256 / cols, rh = 256 / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (r() > lit) continue;
    const warm = r() > .25;
    x.fillStyle = warm ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 50 | 0},${.55 + r() * .45})` : `rgba(190,225,255,${.5 + r() * .4})`;
    x.fillRect(i * cw + 3, j * rh + rh * .18, cw - 6, rh * .62);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function textSprite(text, { size = 40, color = '#fff', bg = 'rgba(14,18,22,.78)', border = null } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const font = `600 ${size}px "IBM Plex Sans Hebrew", sans-serif`;
  x.font = font; const w = Math.ceil(x.measureText(text).width) + size * 1.1, h = Math.ceil(size * 1.6);
  c.width = w; c.height = h; x.font = font; x.direction = 'rtl';
  x.fillStyle = bg; x.beginPath(); x.roundRect(2, 2, w - 4, h - 4, h / 2 - 2); x.fill();
  if (border) { x.strokeStyle = border; x.lineWidth = 5; x.stroke(); }
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, transparent: true }));
  sp.renderOrder = 10; sp.userData.ar = w / h; sp.scale.set(.017 * w / h, .017, 1);
  return sp;
}

// ---------- HUD (DOM overlay) ----------
const CSS = `
.cx{--g:rgba(14,18,22,.52);--gb:rgba(255,255,255,.14);--tx:#EEF2F4;--mu:#A9B4BA;--sun:#FFB547;--aq:#6FD8E8;
 position:absolute;inset:0;pointer-events:none;font-family:"IBM Plex Sans Hebrew",sans-serif;color:var(--tx);z-index:3}
.cx .pane{position:absolute;pointer-events:auto;background:var(--g);border:1px solid var(--gb);border-radius:14px;
 backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 8px 30px rgba(0,0,0,.25)}
.cx .modes{bottom:14px;right:14px;display:flex;gap:4px;padding:5px}
.cx button{font:500 13px "IBM Plex Sans Hebrew",sans-serif;color:var(--tx);background:transparent;border:0;border-radius:9px;padding:7px 12px;cursor:pointer}
.cx button:hover{background:rgba(255,255,255,.1)}
.cx button[aria-pressed=true]{background:rgba(111,216,232,.2);color:#fff;box-shadow:inset 0 0 0 1px rgba(111,216,232,.55)}
.cx button:focus-visible{outline:2px solid var(--aq);outline-offset:2px}
.cx .sun{bottom:14px;left:50%;transform:translateX(-50%);padding:8px 14px 9px;display:flex;align-items:center;gap:12px}
.cx .sun svg{display:block;cursor:grab;touch-action:none}
.cx .sun .t{font:600 22px "IBM Plex Mono",monospace;letter-spacing:.02em;min-width:64px;text-align:center}
.cx .sun .p{font-size:12px;color:var(--mu);margin-top:-2px;text-align:center}
.cx .sun button{font-size:12px;padding:5px 9px}
.cx .q{bottom:14px;left:14px;display:flex;gap:4px;padding:5px}
.cx .hint{top:14px;left:50%;transform:translateX(-50%);padding:7px 14px;font-size:13px;color:var(--mu);display:none}
.cx .hint b{color:var(--tx);font-family:"IBM Plex Mono",monospace;font-weight:600}
.cx .lbl{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;will-change:transform}
.cx .lbl .card{background:var(--g);border:1px solid var(--gb);border-radius:10px;padding:5px 10px 6px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
 text-align:center;max-width:220px;border-top:3px solid var(--c)}
.cx .lbl .n{font:400 25px/1 "Karantina","IBM Plex Sans Hebrew",sans-serif;letter-spacing:.03em;display:flex;gap:8px;align-items:baseline;justify-content:center}
.cx .lbl .n i{font:600 12px "IBM Plex Mono",monospace;font-style:normal;color:var(--c);filter:brightness(1.4)}
.cx .lbl .k{font-size:11.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;margin-top:2px;display:none}
.cx .lbl.hot .k,.cx .lbl:hover .k,.cx .lbl:focus-visible .k{display:block}
.cx .lbl:hover{z-index:2000!important}
.cx .lbl .stem{width:1px;height:38px;background:linear-gradient(var(--gb),rgba(255,255,255,.6))}
.cx .lbl .dot{width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c)}
.cx .lbl.hot .card{box-shadow:0 0 0 1px var(--c),0 0 22px color-mix(in srgb,var(--c) 60%,transparent)}
.cx .cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.35);display:none}
@media (max-width:720px){.cx .sun{bottom:64px}.cx .lbl .k{display:none}.cx .lbl .n{font-size:20px}}
@media (prefers-reduced-motion:reduce){.cx *{transition:none!important}}
`;

function phaseName(h) {
  if (h < 5 || h >= 20.5) return 'לילה';
  if (h < 7) return 'זריחה';
  if (h < 16.5) return 'יום';
  if (h < 18.3) return 'שקיעה';
  return 'דמדומים';
}
const fmtH = h => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// ---------- environment pieces ----------
function personMesh(color, small = false) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: .55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2A2F36, roughness: .8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xE6C3A1, roughness: .7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .62, 4, 10), cloth); body.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), skin); head.position.y = 1.72;
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .62, 3, 6), dark); l.position.set(s * .12, .42, 0); l.geometry.translate(0, -.0, 0); return l; });
  const halo = new THREE.Mesh(new THREE.RingGeometry(.5, .66, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = .04;
  [body, head, ...legs].forEach(m => { m.castShadow = true; });
  g.add(body, head, ...legs, halo);
  g.userData = { parts: [body, head], legs, halo };
  g.scale.setScalar(small ? AGENT_SCALE * .7 : AGENT_SCALE);
  return g;
}
function hatMesh(kind, color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: .3, metalness: kind === 'crown' ? .8 : .1, emissive: color, emissiveIntensity: .25 });
  const g = new THREE.Group(); let o;
  if (kind === 'crown') { o = new THREE.Mesh(new THREE.CylinderGeometry(.2, .17, .14, 8, 1, true), m); o.material.side = THREE.DoubleSide; }
  else if (kind === 'star') { o = new THREE.Mesh(new THREE.OctahedronGeometry(.16), m); o.position.y = .12; o.userData.spin = true; }
  else if (kind === 'cap') { o = new THREE.Mesh(new THREE.SphereGeometry(.185, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); }
  else { o = new THREE.Mesh(new THREE.ConeGeometry(.06, .22, 6), m); o.position.y = .08; }
  o.position.y += 1.84; g.add(o); return g;
}

// ---------- the world ----------
export function createWorld(container, { onAgentClick, onBuildingClick }) {
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  let quality = LS('cx-quality') || 'high';

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .6;
  container.appendChild(renderer.domElement);
  container.style.background = '#0E1216';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xC8D6E2, .0012);
  const camera = new THREE.PerspectiveCamera(48, 1, .3, 4000);
  camera.position.set(150, 95, 175);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, maxPolarAngle: Math.PI / 2.08, minDistance: 8, maxDistance: 520 });
  controls.target.set(0, 8, -5);
  window.__cam = { camera, controls, scene, renderer };

  // --- sky + light ---
  const sky = new Sky(); sky.scale.setScalar(3000); scene.add(sky);
  const skyU = sky.material.uniforms;
  Object.assign(skyU.turbidity, { value: 5 }); skyU.rayleigh.value = 1.6; skyU.mieCoefficient.value = .005; skyU.mieDirectionalG.value = .82;
  const envSky = new Sky(); envSky.scale.setScalar(3000); const envScene = new THREE.Scene(); envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null, envHour = -99;

  const sun = new THREE.DirectionalLight(0xFFF1DC, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 700 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xCFE3FF, 0x56604A, .5); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8FA8FF, 0); moon.position.set(120, 200, -160); scene.add(moon);

  const stars = (() => {
    const n = 1800, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * .48 + .02, th = u * Math.PI * 2, ph = Math.acos(1 - v * 2 * .5);
      p.set([Math.sin(ph) * Math.cos(th) * 2200, Math.cos(ph) * 2200, Math.sin(ph) * Math.sin(th) * 2200], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(s); return s;
  })();

  // --- materials (night-reactive) ---
  const nightMats = [];   // {m, k}  emissiveIntensity = night * k
  const winTex = [windowTexture(3, .42), windowTexture(11, .32), windowTexture(29, .5)];
  function glassMat(tint, repX, repY, seed = 0, k = 1.6) {
    // the texture holds an 8x8 grid of windows, so one window = one bay (3.4m) x one floor
    const t = winTex[seed % 3].clone(); t.needsUpdate = true; t.repeat.set(repX / 8, repY / 8);
    const m = new THREE.MeshStandardMaterial({ color: tint, metalness: .9, roughness: .06, envMapIntensity: 1.5, emissive: 0xFFFFFF, emissiveMap: t, emissiveIntensity: 0 });
    nightMats.push({ m, k }); return m;
  }
  const M = {
    slab: new THREE.MeshStandardMaterial({ color: 0xF1EFEA, roughness: .55 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xC9C5BD, roughness: .9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xA9A196, roughness: .85 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x9C7B57, roughness: .8 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x46703A, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x3A3D42, roughness: .95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9A6B43, roughness: .7 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8C949C, roughness: .35, metalness: .85 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x30353B, roughness: .5, metalness: .7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xFAFAF8, roughness: .4 }),
    clear: new THREE.MeshPhysicalMaterial({ color: 0xDDEEF2, metalness: 0, roughness: .03, transparent: true, opacity: .2, envMapIntensity: 1.2, depthWrite: false }),
    warm: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xFFD9A8, emissiveIntensity: .4 }),
    lampHead: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xFFD8A0, emissiveIntensity: 0 }),
  };
  nightMats.push({ m: M.warm, k: .55, base: .25 }, { m: M.lampHead, k: 6 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o; };

  // --- ground & plaza ---
  const ground = mesh(new THREE.CircleGeometry(2400, 64), M.grass, 0, 0, 0, false); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const paving = (() => {   // large-format stone slabs with slight tone variation
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      const v = 160 + Math.random() * 22 | 0; x.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      x.fillRect(j * 128 + (i % 2) * 64, i * 64, 128, 64); x.fillRect(j * 128 + (i % 2) * 64 - 512, i * 64, 128, 64);
    }
    x.strokeStyle = 'rgba(70,64,56,.55)'; x.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(0, i * 64); x.lineTo(512, i * 64); x.stroke();
      for (let j = 0; j <= 4; j++) { const xx = j * 128 + (i % 2) * 64; x.beginPath(); x.moveTo(xx, i * 64); x.lineTo(xx, i * 64 + 64); x.stroke(); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(250 / 8, 210 / 8); t.anisotropy = 8; return t;
  })();
  const plaza = mesh(new THREE.BoxGeometry(250, .3, 210), new THREE.MeshStandardMaterial({ map: paving, roughness: .85 }), 0, .15, 8, false); scene.add(plaza);
  const ring = mesh(new THREE.RingGeometry(178, 192, 128), M.asphalt, 0, .32, 0, false); ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const lawnPatches = [[-70, -12, 26, 60], [64, -18, 30, 40], [-10, 66, 50, 14], [70, 70, 34, 26]];
  lawnPatches.forEach(([x, z, w, d]) => scene.add(mesh(new THREE.BoxGeometry(w, .2, d), M.grass, x, .36, z, false)));

  // central command plaza: dark stone disc, LED rings, and a floating hologram ring with live numbers
  const PLAZA_R = 34;
  scene.add(mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 1.2, .5, 96), new THREE.MeshStandardMaterial({ color: 0x2A2F35, roughness: .5, metalness: .25 }), 0, .45, 0, false));
  const ledRings = [13, 22.5, 31.5].map((r, i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - .16, r + .16, 160), new THREE.MeshBasicMaterial({ color: 0x6FD8E8, transparent: true, opacity: .55, toneMapped: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = .72; scene.add(m); return m;
  });
  const holoC = document.createElement('canvas'); holoC.width = 2048; holoC.height = 128; const holoX = holoC.getContext('2d');
  const holoTex = new THREE.CanvasTexture(holoC); holoTex.colorSpace = THREE.SRGBColorSpace; holoTex.wrapS = THREE.RepeatWrapping; holoTex.repeat.set(2, 1);
  const holo = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 3, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  holo.position.y = 12; scene.add(holo);
  let holoText = '';
  function drawHolo(text) {
    if (text === holoText) return; holoText = text; const x = holoX;
    x.clearRect(0, 0, 2048, 128);
    const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(111,216,232,0)'); g.addColorStop(.5, 'rgba(111,216,232,.16)'); g.addColorStop(1, 'rgba(111,216,232,0)');
    x.fillStyle = g; x.fillRect(0, 0, 2048, 128);
    x.fillStyle = 'rgba(111,216,232,.9)'; x.fillRect(0, 6, 2048, 2); x.fillRect(0, 120, 2048, 2);
    x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#CFF6FF';
    x.font = '600 58px "IBM Plex Sans Hebrew", sans-serif'; x.fillText(text, 1024, 66);
    holoTex.needsUpdate = true;
  }
  drawHolo('חדר הבקרה · מחובר');
  const groundY = (x, z) => Math.hypot(x, z) < PLAZA_R ? .7 : .3;

  // --- buildings ---
  const buildings = {}, bClick = [];
  function register(key, group, door, labelY) {
    group.traverse(o => { if (o.isMesh) { o.userData.bkey = key; bClick.push(o); } });
    const pulse = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 40), new THREE.MeshBasicMaterial({ color: SRC[key].color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    pulse.rotation.x = -Math.PI / 2; pulse.position.set(door.x, .45, door.z); scene.add(pulse);
    buildings[key] = { group, door, labelPos: new THREE.Vector3(group.position.x, labelY, group.position.z), pulse, hot: 0, anim: [] };
    scene.add(group);
    return buildings[key];
  }

  // banded glass tower (white slabs every floor, reflective glass, lit windows at night, transparent lobby)
  function tower({ w, d, floors, fh = 3.7, tint = 0x6F8796, seed = 0, fins = false, crown = true }) {
    const g = new THREE.Group(), H = floors * fh;
    g.add(mesh(new THREE.BoxGeometry(w, H - fh, d), glassMat(tint, w / 3.4, floors - 1, seed), 0, fh + (H - fh) / 2, 0));
    const lobby = mesh(new THREE.BoxGeometry(w - .4, fh, d - .4), M.clear, 0, fh / 2 + .3, 0, false); lobby.renderOrder = 2; g.add(lobby);
    const ceil = mesh(new THREE.BoxGeometry(w - 1.2, .1, d - 1.2), M.warm, 0, fh - .1, 0, false); g.add(ceil);
    g.add(mesh(new THREE.BoxGeometry(w * .4, fh - .4, d * .4), M.concrete, 0, fh / 2 + .3, 0));   // core
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(w + .9, .38, d + .9), M.slab, floors + 1);
    for (let i = 0; i <= floors; i++) slabs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, .3 + i * fh, 0));
    slabs.castShadow = slabs.receiveShadow = true; g.add(slabs);
    if (fins) {
      const per = Math.round(w / 2.2), fm = new THREE.InstancedMesh(new THREE.BoxGeometry(.22, H - fh, .9), M.slab, per * 4); let k = 0;
      for (let side = 0; side < 4; side++) for (let i = 0; i < per; i++) {
        const t = (i + .5) / per - .5, m4 = new THREE.Matrix4();
        const pos = side === 0 ? [t * w, 0, d / 2 + .45] : side === 1 ? [t * w, 0, -d / 2 - .45] : side === 2 ? [w / 2 + .45, 0, t * d] : [-w / 2 - .45, 0, t * d];
        m4.makeRotationY(side >= 2 ? Math.PI / 2 : 0).setPosition(pos[0], fh + (H - fh) / 2, pos[2]); fm.setMatrixAt(k++, m4);
      }
      fm.castShadow = true; g.add(fm);
    }
    if (crown) g.add(mesh(new THREE.BoxGeometry(w * .5, 4, d * .5), M.darkMetal, 0, H + 2.2, 0));
    g.userData.H = H; return g;
  }

  // 1) command center (agents): slim hexagonal shaft, glass operations deck on top with screens inside
  let beacon; const deckScreens = [];
  // each wall screen inside the deck is a live status panel for one facility
  function drawDeckScreen(s, count, text) {
    const sig = count + '|' + text; if (sig === s.last) return; s.last = sig;
    const x = s.ctx, col = hex(SRC[s.key].color);
    x.fillStyle = '#0B1016'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = col; x.fillRect(0, 0, 512, 8);
    x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = '#EEF2F4'; x.font = '700 40px "IBM Plex Sans Hebrew", sans-serif'; x.fillText(SRC[s.key].he, 488, 62);
    x.textAlign = 'left'; x.direction = 'ltr'; x.fillStyle = col; x.font = '600 54px "IBM Plex Mono", monospace'; x.fillText(String(count), 24, 66);
    x.strokeStyle = col; x.globalAlpha = .8; x.lineWidth = 3; x.beginPath();   // little activity trace
    for (let i = 0; i <= 24; i++) { const v = Math.sin(i * .7 + s.seed) * .5 + Math.sin(i * 1.9 + s.seed * 3) * .3; x.lineTo(24 + i * 19.3, 150 - v * 36); }
    x.stroke(); x.globalAlpha = 1;
    x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = '#A9B4BA'; x.font = '500 26px "IBM Plex Sans Hebrew", sans-serif'; x.fillText(text.slice(0, 30), 488, 228);
    s.tex.needsUpdate = true;
  }
  {
    const g = new THREE.Group(), deckY = 58, deckR = 17, accent = SRC.agents.color;
    const lobby = mesh(new THREE.CylinderGeometry(11, 11, 6, 48, 1, true), M.clear.clone(), 0, 3.7, 0, false); lobby.material.side = THREE.DoubleSide; g.add(lobby);
    g.add(mesh(new THREE.CylinderGeometry(11.8, 11.8, .5, 48), M.slab, 0, 6.9, 0), mesh(new THREE.CylinderGeometry(10.4, 10.4, .1, 48), M.warm, 0, 6.5, 0, false));
    g.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 6, 16), M.concrete, 0, 3.7, 0));
    const shaft = mesh(new THREE.CylinderGeometry(6.2, 7.4, deckY - 7, 6), glassMat(0x4E6272, 13, (deckY - 7) / 3.7, 0), 0, 7 + (deckY - 7) / 2, 0); g.add(shaft);
    const seam = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, s = mesh(new THREE.BoxGeometry(.28, deckY - 7, .28), seam, Math.sin(a) * 6.85, 7 + (deckY - 7) / 2, Math.cos(a) * 6.85, false); g.add(s); }
    // operations deck
    g.add(mesh(new THREE.CylinderGeometry(deckR + 1.2, deckR - 4, 2.2, 64), M.slab, 0, deckY, 0));
    const band = mesh(new THREE.CylinderGeometry(deckR, deckR, 7, 64, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x9FC4D8, roughness: .04, metalness: .2, transparent: true, opacity: .32, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }), 0, deckY + 4.6, 0, false);
    band.renderOrder = 2; g.add(band);
    g.add(mesh(new THREE.CylinderGeometry(deckR - .5, deckR - .5, .1, 64), M.warm, 0, deckY + 7.9, 0, false));
    g.add(mesh(new THREE.CylinderGeometry(deckR + 1.6, deckR + .6, 1.1, 64), M.darkMetal, 0, deckY + 8.6, 0));
    const halo = mesh(new THREE.TorusGeometry(deckR + 1.7, .22, 8, 96), seam, 0, deckY + 8.6, 0, false); halo.rotation.x = Math.PI / 2; g.add(halo);
    // inside the deck: a ring of wall screens facing in, and consoles
    const keys = Object.keys(SRC);
    for (let i = 0; i < 12; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const a = i / 12 * Math.PI * 2, sc = mesh(new THREE.PlaneGeometry(6.5, 3.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), Math.sin(a) * (deckR - 1.4), deckY + 4.4, Math.cos(a) * (deckR - 1.4), false);
      sc.lookAt(0, deckY + 4.4, 0); g.add(sc);
      deckScreens.push({ ctx: c.getContext('2d'), tex, key: keys[i % keys.length], seed: i, last: '' });
      const desk = mesh(new THREE.BoxGeometry(5, .9, 1.4), M.darkMetal, Math.sin(a) * (deckR - 6), deckY + 1.6, Math.cos(a) * (deckR - 6)); desk.lookAt(0, deckY + 1.6, 0); g.add(desk);
    }
    g.add(mesh(new THREE.CylinderGeometry(.35, .6, 16, 8), M.metal, 0, deckY + 17, 0));
    beacon = mesh(new THREE.SphereGeometry(.9, 16, 10), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), 0, deckY + 25.5, 0, false); g.add(beacon);
    register('agents', g, new THREE.Vector3(0, 0, 16), deckY + 34);
  }
  // 2) web — tall finned tower
  { const g = tower({ w: 18, d: 18, floors: 30, fins: true, tint: 0x55697A, seed: 0 }); g.position.set(118, 0, -92);
    const ant = mesh(new THREE.CylinderGeometry(.25, .4, 22), M.metal, 0, g.userData.H + 15, 0); g.add(ant);
    const blink = mesh(new THREE.SphereGeometry(.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFF3B3B }), 0, g.userData.H + 26.5, 0, false); g.add(blink);
    const b = register('web', g, new THREE.Vector3(104, 0, -80), g.userData.H + 34); b.anim.push(t => blink.visible = Math.sin(t * 3) > 0); }
  // 3) files — long library with wooden louvers and a green roof
  { const g = new THREE.Group(), w = 58, d = 20, fh = 5.2;
    g.add(mesh(new THREE.BoxGeometry(w, fh * 2, d), glassMat(0x6A7E78, w / 3, 2, 2), 0, fh + .3, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 2, .6, d + 2), M.slab, 0, fh * 2 + .6, 0), mesh(new THREE.BoxGeometry(w - 1, .5, d - 1), M.grass, 0, fh * 2 + 1.1, 0));
    const lv = new THREE.InstancedMesh(new THREE.BoxGeometry(.35, fh * 2 - .4, .5), M.wood, 120); let k = 0;
    for (let i = 0; i < 60; i++) for (const s of [1, -1]) lv.setMatrixAt(k++, new THREE.Matrix4().setPosition(-w / 2 + .5 + i * (w - 1) / 59, fh + .3, s * (d / 2 + .5)));
    lv.castShadow = true; g.add(lv);
    const shelves = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2.6, .8), new THREE.MeshStandardMaterial({ color: 0x7B4A2E, roughness: .8 }), 12);
    for (let i = 0; i < 12; i++) shelves.setMatrixAt(i, new THREE.Matrix4().setPosition(-w / 2 + 5 + (i % 6) * 9.5, 1.6 + Math.floor(i / 6) * fh, 0));
    g.add(shelves);
    g.rotation.y = Math.PI / 2; g.position.set(-112, 0, 2);
    register('files', g, new THREE.Vector3(-98, 0, 2), 26); }
  // 4) browser — glass pavilion with a big live screen
  let screenCtx, screenTex, screenText = '';
  { const g = new THREE.Group(), w = 28, d = 20, h = 11;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), M.clear, 0, h / 2 + .3, 0, false));
    g.add(mesh(new THREE.BoxGeometry(w + 4, .8, d + 4), M.slab, 0, h + .7, 0));
    [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].forEach(([x, z]) => g.add(mesh(new THREE.BoxGeometry(.4, h, .4), M.darkMetal, x, h / 2 + .3, z)));
    g.add(mesh(new THREE.BoxGeometry(w - 4, .1, d - 4), M.warm, 0, h - .2, 0, false));
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; screenCtx = c.getContext('2d');
    screenTex = new THREE.CanvasTexture(c); screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), 0, 7.2, -d / 2 - .2, false);
    scr.rotation.y = Math.PI; g.add(scr);
    g.add(mesh(new THREE.BoxGeometry(18.8, 9.8, .4), M.darkMetal, 0, 7.2, -d / 2));
    g.position.set(98, 0, 34); g.rotation.y = -Math.PI / 2 + .35;
    register('browser', g, new THREE.Vector3(84, 0, 28), 24); }
  function drawScreen(text) {
    if (text === screenText) return; screenText = text; const x = screenCtx;
    const gr = x.createLinearGradient(0, 0, 1024, 512); gr.addColorStop(0, '#1A1F3A'); gr.addColorStop(1, '#5A1E4A');
    x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.roundRect(60, 60, 904, 70, 35); x.fill();
    x.fillStyle = '#fff'; x.font = '600 34px "IBM Plex Mono", monospace'; x.textAlign = 'left'; x.fillText('● ● ●', 90, 108);
    x.direction = 'rtl'; x.textAlign = 'right'; x.font = '700 64px "IBM Plex Sans Hebrew", sans-serif'; x.fillText('ביתן הכרום', 960, 250);
    x.font = '500 40px "IBM Plex Sans Hebrew", sans-serif'; x.fillStyle = '#F7C6E0'; x.fillText(text.slice(0, 34), 960, 340);
    screenTex.needsUpdate = true;
  }
  drawScreen('מחכה לפעולה');
  // 5) write — stacked cantilevered studio
  { const g = new THREE.Group();
    const boxes = [[26, 7, 16, 0, 0, 0], [22, 7, 14, 6, 7.3, 3], [18, 7, 12, -5, 14.6, -2]];
    boxes.forEach(([w, h, d, x, y, z], i) => { g.add(mesh(new THREE.BoxGeometry(w, h, d), glassMat(0x6F6A86, w / 3.2, 2, i), x, y + h / 2 + .3, z));
      g.add(mesh(new THREE.BoxGeometry(w + .8, .45, d + .8), M.slab, x, y + h + .4, z)); });
    g.position.set(-92, 0, 74); g.rotation.y = .5;
    register('write', g, new THREE.Vector3(-76, 0, 62), 32); }
  // 6) shell — data center: dark cladding, glowing server strip, rooftop fans
  { const g = new THREE.Group(), w = 44, d = 26, h = 11;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), M.darkMetal, 0, h / 2 + .3, 0));
    const strip = new THREE.MeshStandardMaterial({ color: 0x0A1A10, emissive: 0x3BFF8A, emissiveIntensity: 1.1 });
    for (const s of [1, -1]) g.add(mesh(new THREE.BoxGeometry(w - 4, 1.1, .2), strip, 0, h * .55, s * (d / 2 + .05), false));
    const fans = [];
    for (let i = 0; i < 6; i++) { const x = -15 + (i % 3) * 15, z = i < 3 ? -6 : 6;
      g.add(mesh(new THREE.BoxGeometry(7, 2, 7), M.metal, x, h + 1.3, z));
      const f = mesh(new THREE.BoxGeometry(5.6, .15, .6), M.darkMetal, x, h + 2.45, z); g.add(f); fans.push(f); }
    g.position.set(-128, 0, -86); g.rotation.y = .6;
    const b = register('shell', g, new THREE.Vector3(-110, 0, -72), 22); b.anim.push((t, dt) => fans.forEach(f => f.rotation.y += dt * (6 + b.hot * 14))); }
  // 7) mcp — logistics terminal: arched hangar, containers, gantry crane
  { const g = new THREE.Group();
    const hangar = mesh(new THREE.CylinderGeometry(12, 12, 34, 32, 1, true, -Math.PI / 2, Math.PI), M.metal, 0, .3, 0); hangar.rotation.z = Math.PI / 2; hangar.material = M.metal.clone(); hangar.material.side = THREE.DoubleSide; g.add(hangar);
    const cols = [0xC0392B, 0x2471A3, 0xD4AC0D, 0x1E8449, 0xE67E22];
    for (let i = 0; i < 10; i++) g.add(mesh(new THREE.BoxGeometry(12, 2.6, 2.5), new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: .6, metalness: .4 }), 24 + (i % 2) * 13, 1.6 + Math.floor(i / 4) * 2.6, -9 + (i % 4) * 2.8));
    const crane = new THREE.Group();
    [[-3, -8], [-3, 8], [33, -8], [33, 8]].forEach(([x, z]) => crane.add(mesh(new THREE.BoxGeometry(.8, 18, .8), new THREE.MeshStandardMaterial({ color: 0xE8A33A, roughness: .5 }), x, 9, z)));
    const beam = mesh(new THREE.BoxGeometry(38, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0xE8A33A }), 15, 18, 0); crane.add(beam);
    const trolley = mesh(new THREE.BoxGeometry(3, 2, 3), M.darkMetal, 15, 16.6, 0); crane.add(trolley);
    g.add(crane); g.position.set(42, 0, 112); g.rotation.y = -.25;
    const b = register('mcp', g, new THREE.Vector3(38, 0, 94), 30); b.anim.push(t => trolley.position.x = 15 + Math.sin(t * (.4 + b.hot)) * 14); }
  // 8) tokens — glass silo with a glowing level (today's tokens vs heaviest day)
  let tokenFluid;
  { const g = new THREE.Group(), r = 8, h = 46;
    g.add(mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), Object.assign(M.clear.clone(), { opacity: .28, side: THREE.DoubleSide }), 0, h / 2 + .3, 0, false));
    tokenFluid = mesh(new THREE.CylinderGeometry(r - .6, r - .6, 1, 40), new THREE.MeshStandardMaterial({ color: 0x8BE36A, emissive: 0x6FDC4A, emissiveIntensity: .9, transparent: true, opacity: .85 }), 0, .3, 0, false);
    tokenFluid.userData.level = .05; g.add(tokenFluid);
    for (let i = 0; i <= 6; i++) g.add(mesh(new THREE.TorusGeometry(r + .15, .18, 6, 48), M.slab, 0, .3 + i * h / 6, 0).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(r + 1, r + 1, 1.2, 48), M.darkMetal, 0, h + .9, 0));
    g.position.set(-30, 0, 108);
    register('tokens', g, new THREE.Vector3(-30, 0, 96), 56); }

  // 9) media — a black sound stage with an animated LED billboard facade
  let billboard;
  { const g = new THREE.Group(), w = 34, d = 22, h = 13;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x15171B, roughness: .6, metalness: .3 }), 0, h / 2 + .3, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 1.4, .7, d + 1.4), M.darkMetal, 0, h + .65, 0));
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const bb = mesh(new THREE.PlaneGeometry(w - 4, 10), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, h / 2 + .8, d / 2 + .05, false); g.add(bb);
    billboard = { x: c.getContext('2d'), tex, t: 0 };
    const film = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: SRC.media.color, emissiveIntensity: .6 });
    for (const s of [1, -1]) g.add(mesh(new THREE.BoxGeometry(.25, h - 1, .25), film, s * (w / 2 - 1), h / 2 + .3, d / 2 + .15, false));
    g.position.set(-46, 0, -124); g.rotation.y = .12;
    register('media', g, new THREE.Vector3(-44, 0, -108), 26); }
  function drawBillboard(t) {
    const x = billboard.x, g = x.createLinearGradient(0, 0, 1024, 384), h = (t * 20) % 360;
    g.addColorStop(0, `hsl(${h},80%,45%)`); g.addColorStop(1, `hsl(${(h + 70) % 360},80%,35%)`); x.fillStyle = g; x.fillRect(0, 0, 1024, 384);
    x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 12; i++) x.fillRect(i * 90 + ((t * 60) % 90), 0, 40, 26), x.fillRect(i * 90 + ((t * 60) % 90), 358, 40, 26);
    x.fillStyle = '#fff'; x.font = '700 92px "IBM Plex Sans Hebrew", sans-serif'; x.textAlign = 'center'; x.direction = 'rtl'; x.fillText('סטודיו המדיה', 512, 220);
    billboard.tex.needsUpdate = true;
  }
  drawBillboard(0);
  // 10) skills — a stack of glass capability modules; modules light up when a skill runs
  let skillCubes = [];
  { const g = new THREE.Group(), s = 5.2;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) {
      if ((i + j + k) % 3 === 2 && k > 1) continue;
      const m = new THREE.MeshStandardMaterial({ color: 0x5A6470, metalness: .85, roughness: .1, emissive: SRC.skills.color, emissiveIntensity: .05, envMapIntensity: 1.4 });
      const c = mesh(new THREE.BoxGeometry(s - .5, s - .5, s - .5), m, (i - 1) * s, .3 + s / 2 + k * s, (j - 1) * s); g.add(c); skillCubes.push(c);
    }
    g.add(mesh(new THREE.BoxGeometry(s * 3 + 2, .6, s * 3 + 2), M.slab, 0, .3, 0));
    g.position.set(46, 0, -128); g.rotation.y = .5;
    register('skills', g, new THREE.Vector3(42, 0, -110), 32); }

  // --- landscape: street trees, tree belt, lamps, lit streets ---
  const rnd = (() => { let s = 17; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4E7F3A, roughness: .9 }), leaf2 = new THREE.MeshStandardMaterial({ color: 0x5F8F44, roughness: .9 });
  const planter = new THREE.MeshStandardMaterial({ color: 0x3A3F45, roughness: .6, metalness: .3 });
  function treeAt(x, z) {   // street tree in a steel planter: clipped, upright, urban
    const g = new THREE.Group(), h = 3.4 + rnd();
    g.add(mesh(new THREE.BoxGeometry(2.4, .8, 2.4), planter, 0, .4, 0));
    g.add(mesh(new THREE.CylinderGeometry(.16, .22, h, 7), M.wood, 0, h / 2 + .6, 0));
    const crown = mesh(new THREE.SphereGeometry(1.9 + rnd() * .4, 14, 10), rnd() > .5 ? leaf : leaf2, 0, h + 1.6, 0); crown.scale.set(1, 1.25, 1); g.add(crown);
    g.position.set(x, groundY(x, z), z); scene.add(g);
  }
  // facility streets: from the plaza edge to each door, with LED edge lines in the facility's colour
  const streetAngles = [];
  Object.entries(buildings).forEach(([k, b]) => {
    if (k === 'agents') return;
    const a = new THREE.Vector2(0, 0), d = new THREE.Vector2(b.door.x, b.door.z), dir = d.clone().sub(a).normalize();
    const start = PLAZA_R + .5, len = a.distanceTo(d) - start; if (len <= 0) return;
    streetAngles.push(Math.atan2(dir.y, dir.x));
    const mid = dir.clone().multiplyScalar(start + len / 2), rot = -Math.atan2(dir.x, dir.y) + Math.PI;
    const road = mesh(new THREE.PlaneGeometry(8, len), M.asphalt, 0, 0, 0, false); road.rotation.x = -Math.PI / 2; road.rotation.z = rot; road.position.set(mid.x, .36, mid.y); scene.add(road);
    const edge = new THREE.MeshStandardMaterial({ color: 0x1A1D21, emissive: SRC[k].color, emissiveIntensity: .25 }); nightMats.push({ m: edge, k: 2.2, base: .25 });
    for (const off of [-4.2, 4.2]) {
      const s = mesh(new THREE.PlaneGeometry(.32, len), edge, 0, 0, 0, false); s.rotation.x = -Math.PI / 2; s.rotation.z = rot;
      const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(off); s.position.set(mid.x + n.x, .38, mid.y + n.y); scene.add(s);
    }
    for (let t = 6; t < len - 4; t += 14) for (const off of [-6.5, 6.5]) {
      const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(off), p = dir.clone().multiplyScalar(start + t).add(n); treeAt(p.x, p.y);
    }
  });
  // tree belt (instanced) between the facilities and the ring road
  { const N = 240, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3, .45, 5, 6), M.wood, N), crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.2, 1), leaf, N); let k = 0;
    for (let i = 0; i < N * 3 && k < N; i++) {
      const a = rnd() * Math.PI * 2, r = 140 + rnd() * 70, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(r - 185) < 12) continue;
      if (Object.values(buildings).some(b => Math.hypot(b.group.position.x - x, b.group.position.z - z) < 30)) continue;
      const s = .8 + rnd() * .8;
      trunk.setMatrixAt(k, new THREE.Matrix4().makeScale(s, s, s).setPosition(x, 2.5 * s, z));
      crown.setMatrixAt(k, new THREE.Matrix4().makeScale(s, s * (1 + rnd() * .5), s).setPosition(x, 6.5 * s, z)); k++;
    }
    trunk.count = crown.count = k; trunk.castShadow = crown.castShadow = true; scene.add(trunk, crown); }
  // lamps: a ring around the plaza + along every street. A few real lights on the plaza, the rest emissive + bloom.
  const lampSpots = [];
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; lampSpots.push([Math.cos(a) * (PLAZA_R + 2.5), Math.sin(a) * (PLAZA_R + 2.5)]); }
  Object.values(buildings).forEach(b => { const v = b.door.clone(), L = Math.hypot(v.x, v.z); for (let d = PLAZA_R + 12; d < L - 6; d += 16) { const t = d / L; lampSpots.push([v.x * t - v.z / L * 4.6, v.z * t + v.x / L * 4.6]); } });
  { const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08, .1, 4.6, 6), M.darkMetal, lampSpots.length), heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, .14, .3), M.lampHead, lampSpots.length);
    lampSpots.forEach(([x, z], i) => { const y = groundY(x, z); poles.setMatrixAt(i, new THREE.Matrix4().setPosition(x, y + 2.3, z)); heads.setMatrixAt(i, new THREE.Matrix4().makeRotationY(Math.atan2(x, z)).setPosition(x, y + 4.6, z)); });
    scene.add(poles, heads); }
  const plazaLights = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3, L = new THREE.PointLight(0xFFD6A0, 0, 45, 2); L.position.set(Math.cos(a) * 26, 6, Math.sin(a) * 26); scene.add(L); plazaLights.push(L); }
  const plazaGlow = new THREE.PointLight(0x5FE0FF, 0, 70, 2); plazaGlow.position.set(0, 3, 0); scene.add(plazaGlow);

  // --- data streams: a light line from every facility to the operations deck; packets run when it is used ---
  const DECK = new THREE.Vector3(0, 63, 0), streams = {};
  for (const [k, b] of Object.entries(buildings)) {
    if (k === 'agents') continue;
    const a = new THREE.Vector3(b.group.position.x, Math.max(12, b.labelPos.y - 16), b.group.position.z);
    // land on the outer rim of the operations deck (facing the facility), not in its middle
    const end = new THREE.Vector3(a.x, 0, a.z).normalize().multiplyScalar(18.8).setY(DECK.y + 1);
    const mid = a.clone().lerp(end, .5); mid.y = Math.max(a.y, end.y) + 22;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, end);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .16, 6, false), new THREE.MeshBasicMaterial({ color: SRC[k].color, transparent: true, opacity: .1, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(tube);
    const packets = [0, .25, .5, .75].map(o => { const m = new THREE.Mesh(new THREE.SphereGeometry(.65, 12, 8), new THREE.MeshBasicMaterial({ color: SRC[k].color, toneMapped: false, transparent: true })); m.userData.o = o; m.visible = false; scene.add(m); return m; });
    streams[k] = { curve, tube, packets };
  }

  // --- the city around (lights up at night) ---
  { const N = 420, cityMat = glassMat(0x4C5B68, 8, 24, 1, 1.3);
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, N);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = 330 + rnd() * 700, h = 14 + Math.pow(rnd(), 2.4) * (r < 600 ? 120 : 160), w = 14 + rnd() * 22;
      city.setMatrixAt(i, new THREE.Matrix4().makeRotationY(rnd() * Math.PI).scale(new THREE.Vector3(w, h, w * (.6 + rnd() * .6))).setPosition(Math.cos(a) * r, h / 2, Math.sin(a) * r));
    }
    city.receiveShadow = false; scene.add(city); }
  // cars on the ring road
  const cars = [];
  { const head = new THREE.MeshBasicMaterial({ color: 0xFFF4D6 }), tail = new THREE.MeshBasicMaterial({ color: 0xFF3030 });
    const bodyCols = [0xEDEDED, 0x222222, 0x8A1F1F, 0x1F3F8A, 0x9AA0A6];
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group(), lane = i % 2;
      g.add(mesh(new THREE.BoxGeometry(2, 1, 4.4), new THREE.MeshStandardMaterial({ color: bodyCols[i % 5], metalness: .6, roughness: .3 }), 0, .9, 0));
      g.add(mesh(new THREE.BoxGeometry(1.7, .7, 2.2), M.clear, 0, 1.7, -.2, false));
      const hl = mesh(new THREE.BoxGeometry(1.6, .2, .1), head, 0, .9, 2.25, false), tl = mesh(new THREE.BoxGeometry(1.6, .2, .1), tail, 0, .9, -2.25, false);
      g.add(hl, tl); g.userData = { a: rnd() * Math.PI * 2, r: lane ? 182 : 188, v: (lane ? 1 : -1) * (.045 + rnd() * .03), lights: [hl, tl] };
      scene.add(g); cars.push(g);
    }
  }
  // project pods: each live project gets a glass pod in its colour on the plaza edge; idle agents wait there
  const pods = new Map(); let podSlot = 0;
  const podAngles = [];
  for (let a = 0; a < 360; a += 15) { const r = a * Math.PI / 180; if (streetAngles.every(s => Math.abs(Math.atan2(Math.sin(r - s), Math.cos(r - s))) > .3)) podAngles.push(r); }
  function ensureCabana(project, color) {
    let c = pods.get(project); if (c) return c;
    const ang = podAngles[(podSlot++ * 5) % podAngles.length], R = PLAZA_R + 13, x = Math.cos(ang) * R, z = Math.sin(ang) * R, g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(9, .4, 9), M.darkMetal, 0, .5, 0));
    const glass = mesh(new THREE.BoxGeometry(8.4, 3.8, 8.4), M.clear.clone(), 0, 2.6, 0, false); g.add(glass);
    g.add(mesh(new THREE.BoxGeometry(9.4, .45, 9.4), new THREE.MeshStandardMaterial({ color, roughness: .5, emissive: color, emissiveIntensity: .35 }), 0, 4.75, 0));
    const glow = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: .8 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = .75; g.add(glow);
    g.add(mesh(new THREE.BoxGeometry(3, .9, 1.2), M.white, 0, 1.15, 1.5), mesh(new THREE.BoxGeometry(1.6, .6, 1.6), M.darkMetal, 0, 1, -1.6));
    const tag = textSprite(project.slice(0, 20), { size: 34, border: hex(color) }); tag.position.y = 6.6; tag.scale.multiplyScalar(.9); g.add(tag);
    g.position.set(x, 0, z); g.lookAt(0, 0, 0); scene.add(g);
    c = { g, door: new THREE.Vector3(Math.cos(ang) * (R - 6.5), 0, Math.sin(ang) * (R - 6.5)) }; pods.set(project, c); return c;
  }
  const cabanas = pods;

  // the HDR sky makes a very strong environment light: keep it for glass reflections, tame it everywhere else
  // so the sun, the shadows and the sunset colour actually read.
  const glassSet = new Set(nightMats.map(n => n.m));
  scene.traverse(o => { if (!o.isMesh) return; [].concat(o.material).forEach(m => { if (m && 'envMapIntensity' in m && !glassSet.has(m) && m.metalness < .5) m.envMapIntensity = .22; }); });

  // --- post-processing ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .2, .5, .92); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- HUD ---
  if (!document.getElementById('cx-style')) {
    const st = document.createElement('style'); st.id = 'cx-style'; st.textContent = CSS; document.head.appendChild(st);
    const fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=Karantina:wght@400;700&display=swap'; document.head.appendChild(fl);
  }
  const hud = document.createElement('div'); hud.className = 'cx'; container.appendChild(hud);
  hud.innerHTML = `
    <div class="pane modes" role="group" aria-label="תנועה במתחם">
      <button data-m="orbit" aria-pressed="true">מבט על</button><button data-m="walk" aria-pressed="false">הליכה</button><button data-m="tour" aria-pressed="false">סיור</button>
    </div>
    <div class="pane sun" aria-label="שעה במתחם">
      <svg width="170" height="56" viewBox="0 0 170 56" aria-hidden="true">
        <defs><linearGradient id="cxarc" x1="0" x2="1"><stop offset="0" stop-color="#3B4A7A"/><stop offset=".25" stop-color="#FF9A5A"/><stop offset=".5" stop-color="#FFE6A8"/><stop offset=".75" stop-color="#FF9A5A"/><stop offset="1" stop-color="#3B4A7A"/></linearGradient></defs>
        <path d="M10 50 A75 75 0 0 1 160 50" fill="none" stroke="url(#cxarc)" stroke-width="3" stroke-linecap="round" opacity=".9"/>
        <line x1="4" y1="50.5" x2="166" y2="50.5" stroke="rgba(255,255,255,.25)"/>
        <circle id="cxsun" r="7" fill="#FFB547" stroke="#fff" stroke-width="1.5"/>
      </svg>
      <div><div class="t" id="cxt">--:--</div><div class="p" id="cxp"></div></div>
      <button id="cxauto" aria-pressed="true" title="השמיים לפי השעה אצלך">לפי השעה</button>
    </div>
    <div class="pane q"><button id="cxq" title="אם התמונה מקרטעת — עבור למהיר">איכות: ${quality === 'high' ? 'גבוהה' : 'מהירה'}</button><button id="cxisl" title="חזרה לאי הישן">האי הישן</button></div>
    <div class="pane hint" id="cxhint"><b>W A S D</b> הליכה · <b>Shift</b> ריצה · <b>לחיצה</b> פותחת בניין · <b>Esc</b> יציאה</div>
    <div class="cross" id="cxcross"></div>`;
  const labels = {};
  for (const [k, b] of Object.entries(buildings)) {
    const el = document.createElement('div'); el.className = 'lbl'; el.style.setProperty('--c', hex(SRC[k].color)); el.tabIndex = 0;
    el.innerHTML = `<div class="card"><div class="n">${SRC[k].he}<i>0</i></div><div class="k">מחכה לפעולה</div></div><div class="stem"></div><div class="dot"></div>`;
    el.onclick = () => openFacility(k); el.onkeydown = e => { if (e.key === 'Enter') el.onclick(); };
    hud.appendChild(el); labels[k] = { el, n: el.querySelector('i'), k: el.querySelector('.k'), stem: el.querySelector('.stem') };
  }

  // --- time of day ---
  let autoTime = true, hour = 12;
  const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const sunEl = hud.querySelector('#cxsun'), tEl = hud.querySelector('#cxt'), pEl = hud.querySelector('#cxp'), autoBtn = hud.querySelector('#cxauto');
  let night = 0;
  function applyTime(h) {
    hour = (h + 24) % 24;
    const dayT = (hour - 6) / 12;                       // 0 at 06:00, 1 at 18:00
    const elev = Math.sin(dayT * Math.PI) * 68 - (dayT < 0 || dayT > 1 ? 14 : 0) * Math.min(1, Math.abs(dayT < 0 ? dayT : dayT - 1) * 4);
    const az = 90 - dayT * 180;                           // east (+x) at dawn, south (+z, facing the HQ) at noon, west at dusk
    const phi = THREE.MathUtils.degToRad(90 - elev), th = THREE.MathUtils.degToRad(az);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
    skyU.sunPosition.value.copy(dir); envSky.material.uniforms.sunPosition.value.copy(dir);
    ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].forEach(k => envSky.material.uniforms[k].value = skyU[k].value);
    night = clamp01((2 - elev) / 10);
    const low = clamp01(1 - elev / 22);              // warm light near the horizon
    skyU.rayleigh.value = lerp(1.2, 3.4, low * (1 - night)); skyU.turbidity.value = lerp(4, 11, low * (1 - night));
    sun.position.copy(dir).multiplyScalar(320); sun.target.position.set(0, 0, 0);
    sun.intensity = 4.2 * clamp01(elev / 8); sun.color.setRGB(1, lerp(.93, .55, low * low), lerp(.84, .3, low * low));
    hemi.intensity = lerp(.7, .08, night); moon.intensity = night * .45;
    renderer.toneMappingExposure = lerp(.62, .55, night);
    scene.fog.color.setRGB(lerp(.66, .03, night), lerp(.74, .05, night), lerp(.84, .1, night)).lerp(new THREE.Color(0xF0A070), low * (1 - night) * .35);
    scene.fog.density = lerp(.00055, .0011, night);
    stars.material.opacity = night;
    nightMats.forEach(({ m, k, base = 0 }) => m.emissiveIntensity = base + night * k);
    plazaLights.forEach(L => L.intensity = night * 140); plazaGlow.intensity = night * 220;
    ledRings.forEach(r => r.material.opacity = .25 + night * .6);
    bloom.strength = lerp(.12, .7, night);
    cars.forEach(c => c.userData.lights.forEach(l => l.scale.setScalar(1 + night * 1.5)));
    if (Math.abs(hour - envHour) > .2) {             // refresh reflections
      envHour = hour; const old = envRT; envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture; old && old.dispose();
    }
    // HUD
    const u = clamp01((hour - 5) / 15), ang = Math.PI * (1 - u), cx = 85 + Math.cos(ang) * 75, cy = 50 - Math.sin(ang) * 40;
    sunEl.setAttribute('cx', cx.toFixed(1)); sunEl.setAttribute('cy', cy.toFixed(1));
    sunEl.setAttribute('fill', night > .5 ? '#C9D4FF' : '#FFB547');
    tEl.textContent = fmtH(hour); pEl.textContent = phaseName(hour);
  }
  // drag the sun
  { const svg = hud.querySelector('.sun svg'); let drag = false;
    const fromEvt = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 170; const u = clamp01((x - 10) / 150); return 5 + u * 15 + (u >= 1 ? 4 : 0); };
    svg.addEventListener('pointerdown', e => { drag = true; svg.setPointerCapture(e.pointerId); autoTime = false; autoBtn.setAttribute('aria-pressed', 'false'); applyTime(fromEvt(e)); });
    svg.addEventListener('pointermove', e => drag && applyTime(fromEvt(e)));
    svg.addEventListener('pointerup', () => drag = false);
    autoBtn.onclick = () => { autoTime = !autoTime; autoBtn.setAttribute('aria-pressed', String(autoTime)); if (autoTime) applyTime(nowHour()); };
  }
  applyTime(nowHour());

  // --- quality ---
  function applyQuality() {
    renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
    bloom.enabled = quality === 'high' || night > .3;
    hud.querySelector('#cxq').textContent = 'איכות: ' + (quality === 'high' ? 'גבוהה' : 'מהירה'); resize();
  }
  hud.querySelector('#cxq').onclick = () => { quality = quality === 'high' ? 'fast' : 'high'; LS('cx-quality', quality); applyQuality(); };
  hud.querySelector('#cxisl').onclick = () => { LS('cr-world', 'island'); location.reload(); };

  // --- camera modes: orbit / walk / tour ---
  let mode = 'orbit';
  const plc = new PointerLockControls(camera, renderer.domElement);
  const keys = {}; addEventListener('keydown', e => keys[e.code] = true); addEventListener('keyup', e => keys[e.code] = false);
  const savedCam = { p: new THREE.Vector3(), t: new THREE.Vector3() };
  const tourCurve = new THREE.CatmullRomCurve3([
    [210, 120, 230], [70, 30, 90], [32, 6, 40], [-30, 4, 22], [-34, 30, -20], [-14, 61, 8], [12, 61, -6], [40, 75, -50], [150, 100, -150],
    [20, 90, -160], [-110, 45, -110], [-140, 22, 30], [-90, 30, 130], [40, 45, 165],
  ].map(p => new THREE.Vector3(...p)), true, 'catmullrom', .5);
  const tourLook = new THREE.CatmullRomCurve3([
    [0, 20, 0], [0, 10, 0], [0, 4, 0], [10, 3, -10], [0, 40, 0], [10, 61, -12], [-14, 61, 8], [118, 60, -92], [118, 60, -92],
    [0, 40, 0], [-128, 8, -86], [-112, 8, 2], [-30, 20, 108], [0, 20, 0],
  ].map(p => new THREE.Vector3(...p)), true, 'catmullrom', .5);
  let tourT = 0;
  function setMode(m) {
    if (m === mode) return;
    if (mode === 'walk') plc.unlock();
    if (mode === 'orbit') { savedCam.p.copy(camera.position); savedCam.t.copy(controls.target); }
    mode = m; controls.enabled = m === 'orbit';
    hud.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    hud.querySelector('#cxhint').style.display = m === 'walk' ? 'block' : 'none';
    hud.querySelector('#cxcross').style.display = m === 'walk' ? 'block' : 'none';
    if (m === 'walk') { camera.position.set(0, groundY(0, 36) + 1.7, 36); camera.lookAt(0, 3, -20); plc.lock(); }
    if (m === 'tour') tourT = 0;
    if (m === 'orbit') { camera.position.copy(savedCam.p); controls.target.copy(savedCam.t); camera.up.set(0, 1, 0); }
  }
  hud.querySelectorAll('.modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));

  // --- going inside a facility: fly to its door, then a 3D room replays the real actions done there ---
  let lastState = null;
  const interiors = createInteriors({
    renderer, container, SRC, hex, colorFor: p => colorFor(p),
    getEnv: () => envRT && envRT.texture, getState: () => lastState,
    onExit: () => { hud.style.display = ''; container.querySelectorAll(':scope > .hud').forEach(h => h.style.display = ''); controls.enabled = mode === 'orbit'; envHour = -99; applyTime(hour); resize(); },
  });
  function openFacility(k) {
    if (!interiors.has(k)) return onBuildingClick && onBuildingClick(k);   // tokens -> the detailed dialog
    if (mode === 'walk') plc.unlock();
    const b = buildings[k], door = b.door.clone(), out = door.clone().setY(0).normalize();
    flyTo(door.clone().add(out.multiplyScalar(-14)).setY(9), door.clone().setY(4), 1.1);
    setTimeout(() => { controls.enabled = false; hud.style.display = 'none'; container.querySelectorAll(':scope > .hud').forEach(h => h.style.display = 'none'); interiors.enter(k); }, 900);
  }
  plc.addEventListener('unlock', () => { if (mode === 'walk') setMode('orbit'); });
  renderer.domElement.addEventListener('pointerdown', () => { if (mode === 'tour') setMode('orbit'); });
  addEventListener('keydown', e => { if (e.code === 'Escape' && mode === 'tour') setMode('orbit'); });

  // fly-to for focus()
  let fly = null;
  function flyTo(pos, target, dur = 1.4) { if (mode !== 'orbit') setMode('orbit'); fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0, dur }; }

  // --- agents ---
  const agents = new Map(), colorOf = new Map(); let nextColor = 0; const clickables = [];
  const colorFor = p => { if (!colorOf.has(p)) colorOf.set(p, PALETTE[nextColor++ % PALETTE.length]); return colorOf.get(p); };
  const spotNear = (src, seed) => {
    const b = buildings[src];
    if (!b) { const a = seed * 2.4; return new THREE.Vector3(Math.cos(a) * 25, 0, Math.sin(a) * 25); }
    return b.door.clone().add(new THREE.Vector3(((seed * 7.3) % 1 - .5) * 8, 0, ((seed * 3.1) % 1 - .5) * 6));
  };
  // HQ crescent blocks the north: walk around its ends instead of through the glass
  // the command center tower stands in the middle: walk around it, not through it
  function waypoint(from, to) {
    const abx = to.x - from.x, abz = to.z - from.z, len2 = abx * abx + abz * abz;
    if (len2 < 1 || Math.hypot(from.x, from.z) < 13) return to;
    const t = clamp01(-(from.x * abx + from.z * abz) / len2), px = from.x + abx * t, pz = from.z + abz * t;
    if (Math.hypot(px, pz) > 13.5 || t >= .999) return to;
    let nx = px, nz = pz; if (Math.hypot(nx, nz) < .5) { nx = -abz; nz = abx; }
    const l = Math.hypot(nx, nz); return new THREE.Vector3(nx / l * 17, 0, nz / l * 17);
  }
  function ensureAgent(s) {
    let a = agents.get(s.id); if (a) return a;
    const color = colorFor(s.project), m = personMesh(color);
    const ang = Math.random() * Math.PI * 2; m.position.set(Math.cos(ang) * 26, .7, Math.sin(ang) * 26);
    const tag = textSprite(s.project.slice(0, 18), { size: 34, border: hex(color) }); tag.position.y = 2.6; tag.scale.multiplyScalar(1 / AGENT_SCALE); m.add(tag);
    const zz = textSprite('Zz', { size: 30, bg: 'rgba(14,18,22,.55)' }); zz.position.set(.6, 2.2, 0); zz.scale.multiplyScalar(1 / AGENT_SCALE); zz.visible = false; m.add(zz);
    const crate = mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5 }), 0, 1.25, .45); crate.visible = false; m.add(crate);
    scene.add(m); m.userData.parts.forEach(p => { p.userData.sid = s.id; clickables.push(p); });
    a = { id: s.id, mesh: m, tag, zz, crate, target: m.position.clone(), route: [], ri: 0, phase: 'walk', dwell: 0, step: 0, helpers: [] };
    agents.set(s.id, a); return a;
  }
  let liveCount = 0;
  function update(state, verb = r => r.tool) {
    lastState = state;
    const latest = {};
    state.sessions.forEach(s => (s.recent || []).forEach(r => { if (!latest[r.src] || r.t > latest[r.src].t) latest[r.src] = { ...r, project: s.project }; }));
    const totals = state.sources_total || {};
    for (const k of Object.keys(buildings)) {
      const L = labels[k];
      if (k === 'tokens') { L.k.textContent = `היום ${fmtTok(state.tokens?.today)} טוקנים`; L.n.textContent = fmtTok(state.tokens?.total); continue; }
      const r = latest[k], text = r ? (r.what || verb(r)) : 'מחכה לפעולה';
      L.k.textContent = text; L.k.title = text; L.n.textContent = String(totals[k] || 0);
      if (k === 'browser') drawScreen(text);
    }
    const tk = state.tokens || { today: 0, max_day: 1 };
    tokenFluid.userData.level = Math.max(.03, Math.min(1, (tk.today || 0) / Math.max(tk.max_day || 1, 1)));
    const live = state.sessions.filter(s => s.status !== 'closed' && s.total > 0).slice(0, 10);
    liveCount = live.filter(s => s.status === 'working').length;
    deckScreens.forEach(s => drawDeckScreen(s, s.key === 'tokens' ? fmtTok(tk.today) : (s.key === 'agents' ? liveCount : (totals[s.key] || 0)),
      s.key === 'tokens' ? 'טוקנים היום' : s.key === 'agents' ? 'סוכנים עובדים עכשיו' : (latest[s.key] ? (latest[s.key].what || verb(latest[s.key])) : 'מחכה לפעולה')));
    const lastAny = Object.values(latest).sort((a, b) => (a.t < b.t ? 1 : -1))[0];
    drawHolo(`${liveCount} סוכנים עובדים  ·  היום ${fmtTok(tk.today)} טוקנים  ·  ${lastAny ? (lastAny.what || verb(lastAny)).slice(0, 40) : 'הכל שקט'}`);
    const ids = new Set(live.map(s => s.id));
    for (const [id, a] of agents) if (!ids.has(id)) { scene.remove(a.mesh); a.helpers.forEach(h => scene.remove(h.mesh)); agents.delete(id); }
    const liveProjects = new Set(live.map(s => s.project));
    for (const [p, c] of cabanas) if (!liveProjects.has(p)) { scene.remove(c.g); cabanas.delete(p); }
    live.forEach((s, i) => {
      const a = ensureAgent(s);
      a.home = ensureCabana(s.project, colorFor(s.project)).door;
      a.status = s.status; a.recent = s.recent || []; a.seed = (i + 1) * .137; a.projectName = s.project;
      const mk = modelKey(s.model);
      if (a.model !== mk) { if (a.hat) a.mesh.remove(a.hat); a.model = mk; a.hat = hatMesh(MODELS[mk].hat, MODELS[mk].color); a.mesh.add(a.hat); a.mesh.scale.setScalar(AGENT_SCALE * MODELS[mk].scale); }
      const routeNow = [];
      a.recent.slice(-8).forEach(r => { if (buildings[r.src] && routeNow[routeNow.length - 1] !== r.src) routeNow.push(r.src); });
      if (routeNow.join() !== a.route.join()) { a.route = routeNow; if (a.ri >= routeNow.length) a.ri = 0; }
      const want = (s.helpers || []).slice(0, 4);
      while (a.helpers.length > want.length) scene.remove(a.helpers.pop().mesh);
      while (a.helpers.length < want.length) { const m = personMesh(colorFor(s.project), true); m.position.copy(a.mesh.position); scene.add(m); a.helpers.push({ mesh: m, target: m.position.clone() }); }
      a.helpers.forEach((h, j) => h.target = spotNear(want[j].src, a.seed + j * .31));
    });
    return [...colorOf.entries()].filter(([p]) => liveProjects.has(p));
  }

  function step(obj, target, dt, speed) {
    const goal = waypoint(obj.position, target);
    const d = goal.clone().sub(obj.position); d.y = 0; const dist = d.length();
    const legs = obj.userData.legs, t = performance.now() / 1000;
    if (dist > .3) {
      d.normalize(); obj.position.addScaledVector(d, Math.min(dist, speed * dt));
      const want = Math.atan2(d.x, d.z); obj.rotation.y += Math.atan2(Math.sin(want - obj.rotation.y), Math.cos(want - obj.rotation.y)) * Math.min(1, dt * 8);
      if (legs) legs.forEach((l, i) => l.rotation.x = Math.sin(t * 9 + i * Math.PI) * .55);
      obj.position.y = groundY(obj.position.x, obj.position.z);
      return goal === target && dist < .6;
    }
    if (legs) legs.forEach(l => l.rotation.x *= .8);
    obj.position.y = groundY(obj.position.x, obj.position.z); return goal === target;
  }

  // --- loop ---
  const clock = new THREE.Clock(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  let lastAuto = 0;
  // one frame of the world. Normally driven by requestAnimationFrame; a recorder can drive it with a fixed clock
  // (window.__rec set) so a video comes out perfectly smooth no matter how fast this machine renders.
  function tick() {
    if (window.__rec) clock.getDelta(); else stepFrame(Math.min(clock.getDelta(), .05), performance.now() / 1000);
    requestAnimationFrame(tick);
  }
  function stepFrame(dt, t) {
    if (autoTime && t - lastAuto > 30) { lastAuto = t; applyTime(nowHour()); }
    if (interiors.active) { interiors.frame(t, dt); return; }
    if (billboard && (billboard.t += dt) > .08) { drawBillboard(t); billboard.t = 0; }
    skillCubes.forEach((c, i) => c.material.emissiveIntensity = .05 + buildings.skills.hot * (.5 + .5 * Math.sin(t * 6 + i)) + night * .25);
    // camera
    if (fly) { fly.t += dt / fly.dur; const e = fly.t >= 1 ? 1 : 1 - Math.pow(1 - fly.t, 3);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (fly.t >= 1) fly = null; }
    if (mode === 'orbit') controls.update();
    else if (mode === 'walk' && plc.isLocked) {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 16 : 7) * dt;
      if (keys.KeyW || keys.ArrowUp) plc.moveForward(sp); if (keys.KeyS || keys.ArrowDown) plc.moveForward(-sp);
      if (keys.KeyD || keys.ArrowRight) plc.moveRight(sp); if (keys.KeyA || keys.ArrowLeft) plc.moveRight(-sp);
      camera.position.y = lerp(camera.position.y, groundY(camera.position.x, camera.position.z) + 1.7, Math.min(1, dt * 10));
    } else if (mode === 'tour') {
      tourT = (tourT + dt / 80) % 1;
      camera.position.copy(tourCurve.getPointAt(tourT)); camera.lookAt(tourLook.getPointAt(tourT));
    }
    // agents
    for (const a of agents.values()) {
      a.zz.visible = a.status === 'idle';
      if (a.status === 'idle') a.target = a.home ? a.home.clone() : spotNear(null, a.seed);
      else if (a.status === 'working') {
        if (!a.route.length) a.target = spotNear(null, a.seed);
        else if (a.phase === 'walk') a.target = spotNear(a.route[a.ri % a.route.length], a.seed);
        else {
          const src = a.route[a.ri % a.route.length]; buildings[src].hot = 1; a.dwell -= dt;
          a.mesh.userData.legs.forEach(l => l.rotation.x = 0); a.mesh.position.y = groundY(a.mesh.position.x, a.mesh.position.z) + Math.abs(Math.sin(t * 7)) * .12;
          if (a.dwell <= 0) { a.crate.material.color.setHex(SRC[src].color); a.crate.visible = true; a.ri = (a.ri + 1) % a.route.length; a.phase = 'walk'; }
        }
      }
      if (a.status !== 'working' || a.phase === 'walk') {
        const arrived = step(a.mesh, a.target, dt, a.status === 'idle' ? 6 : 14);
        if (arrived && a.status === 'working' && a.route.length) { a.phase = 'work'; a.dwell = 2.6; a.crate.visible = false; }
      }
      if (a.status !== 'working') a.crate.visible = false;
      if (a.crate.visible) a.crate.rotation.y += dt * 3;
      const halo = a.mesh.userData.halo; halo.material.opacity = a.status === 'working' ? .6 + Math.sin(t * 5) * .3 : .35;
      if (a.hat) a.hat.children.forEach(c => { if (c.userData.spin) c.rotation.y += dt * 2; });
      a.helpers.forEach(h => step(h.mesh, h.target, dt, 14));
    }
    // buildings
    for (const [k, b] of Object.entries(buildings)) {
      b.hot = Math.max(0, b.hot - dt * .7);
      b.pulse.material.opacity = b.hot * (.55 + .45 * Math.sin(t * 7)); b.pulse.scale.setScalar(1 + (1 - b.hot) * .4);
      b.anim.forEach(f => f(t, dt));
      labels[k].el.classList.toggle('hot', b.hot > .2);
    }
    const lv = tokenFluid.userData.level, h = 46 * lv; tokenFluid.scale.y = lerp(tokenFluid.scale.y, h, Math.min(1, dt * 2)); tokenFluid.position.y = .3 + tokenFluid.scale.y / 2;
    cars.forEach(c => { const u = c.userData; u.a += u.v * dt; c.position.set(Math.cos(u.a) * u.r, .3, Math.sin(u.a) * u.r); c.rotation.y = -u.a + (u.v > 0 ? Math.PI : 0); });
    // data streams: faint network always; packets fly into the command center while a facility is in use
    for (const [k, s] of Object.entries(streams)) {
      const hot = buildings[k].hot;
      s.tube.material.opacity = .07 + hot * .5 + night * .08;
      s.packets.forEach(p => { p.visible = hot > .05; if (p.visible) { p.position.copy(s.curve.getPointAt((t * .45 + p.userData.o) % 1)); p.scale.setScalar(.6 + hot * .8); } });
    }
    if (Object.values(buildings).some(b => b.hot > .05)) buildings.agents.hot = Math.max(buildings.agents.hot, .5);
    holo.rotation.y += dt * .06;
    beacon.visible = Math.sin(t * 2.2) > -.3;
    ledRings.forEach((r, i) => r.rotation.z += dt * (i % 2 ? -.05 : .04));
    // labels follow their buildings
    const W = container.clientWidth, H = container.clientHeight;
    camera.getWorldDirection(fwd);
    const vis = [];
    for (const [k, b] of Object.entries(buildings)) {
      const L = labels[k]; tmp.copy(b.labelPos);
      const dist = camera.position.distanceTo(tmp), behind = tmp.clone().sub(camera.position).dot(fwd) < 0;
      tmp.project(camera);
      const show = !behind && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15 && (mode !== 'walk' || dist < 160);
      L.el.style.display = show ? 'flex' : 'none';
      if (show) vis.push({ L, dist, x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H });
    }
    // declutter: nearer labels keep their place, farther ones climb up on a longer stem
    vis.sort((a, b) => a.dist - b.dist);
    const placed = [];
    for (const v of vis) {
      const cw = v.L.el.firstChild.offsetWidth || 150, ch = v.L.el.firstChild.offsetHeight || 40;
      let lift = 0;
      for (let pass = 0; pass < 6; pass++) {
        const top = v.y - 45 - lift - ch, r = { l: v.x - cw / 2 - 4, r: v.x + cw / 2 + 4, t: top - 4, b: top + ch + 4 };
        const hit = placed.find(p => r.l < p.r && r.r > p.l && r.t < p.b && r.b > p.t);
        if (!hit) { placed.push(r); break; }
        lift += r.b - hit.t + 2;
      }
      v.L.stem.style.height = (38 + lift) + 'px';
      v.L.el.style.transform = `translate(${v.x.toFixed(1)}px,${v.y.toFixed(1)}px) translate(-50%,-100%)`;
      v.L.el.style.opacity = String(clamp01(1.4 - v.dist / 420)); v.L.el.style.zIndex = String(1000 - Math.round(v.dist));
    }
    if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (typeof interiors !== 'undefined') interiors.resize();
  }
  new ResizeObserver(resize).observe(container); resize(); applyQuality();

  // --- picking ---
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  function pick(nx, ny) {
    ptr.set(nx, ny); ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(clickables, false)[0], bh = ray.intersectObjects(bClick, false)[0];
    if (hit && (!bh || hit.distance <= bh.distance)) return onAgentClick && onAgentClick(hit.object.userData.sid);
    if (bh) openFacility(bh.object.userData.bkey);
  }
  renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  renderer.domElement.addEventListener('pointerup', e => {
    const d0 = down; down = null;
    if (interiors.active) return;
    if (mode === 'walk') { if (plc.isLocked) pick(0, 0); return; }
    if (!d0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    pick((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  });

  function focus(project) {
    const a = [...agents.values()].find(x => x.projectName === project);
    if (a) flyTo(a.mesh.position.clone().add(new THREE.Vector3(14, 10, 18)), a.mesh.position.clone().setY(2));
  }

  tick();
  return { update, focus, colorFor, openFacility, heat: k => { if (buildings[k]) buildings[k].hot = 1; },
    // recording helpers: render one frame on a fixed clock; enter/leave a room without the fly/fade delays
    renderFrame: (dt, t) => stepFrame(dt, t),
    enterRoom: k => { controls.enabled = false; hud.style.display = 'none'; container.querySelectorAll(':scope > .hud').forEach(h => h.style.display = 'none'); interiors.enterNow(k); },
    exitRoom: () => interiors.exitNow(), get working() { return liveCount; }, setHour: h => { autoTime = false; autoBtn.setAttribute('aria-pressed', 'false'); applyTime(h); }, setMode };
}
