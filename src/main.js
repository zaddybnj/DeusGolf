import {registerSW} from 'virtual:pwa-register';
import {pebble} from './course.js';
import lv from './courses/losverdes.json';
import {esc, loadBag, saveBag} from './store.js';
import {mountPlanner} from './plan.js';

registerSW({immediate: true});

const COURSES = {losverdes: lv, pebble};
const $ = id => document.getElementById(id);
const cv = $('map'), c = cv.getContext('2d');
const MIN_Z = 0.85, MAX_Z = 10;
const COL = {
  rough: '#7fb35a', fairway: '#9fd277', green: '#c4ef95', tee: '#b8e08e', bunker: '#ecdca4',
  water: '#3b7dc4', trees: '#3f6e34', path: '#c9c9c0', building: '#a99',
};

let course = lv, tee = lv.tees[0], h = 0, club = 'driver', ball, aim, shots, trail, done, scores = {};
let bag = loadBag();
let planner = null;
let S = 1, sc = 1, ox = 0, oy = 0, cxv = {W: 1, H: 1};
let zoom = 1, panX = 0, panY = 0;
const coarse = matchMedia('(pointer: coarse)').matches;

const H = () => course.holes[h];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const carryOf = id => bag.find(c => c.id === id)?.carry || 0;
const clubName = id => bag.find(c => c.id === id)?.name || id;

function closestClub(yards) {
  const list = bag.filter(c => c.id !== 'putter' && c.carry > 0);
  if (!list.length) return 'putter';
  return list.reduce((best, c) => Math.abs(c.carry - yards) < Math.abs(best.carry - yards) ? c : best).id;
}

function along(line, d) {
  for (let i = 1; i < line.length; i++) {
    const s = dist(line[i - 1], line[i]);
    if (d <= s) {
      const t = d / s;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    d -= s;
  }
  return line.at(-1);
}

const teePos = () => {
  const g = H();
  return along(g.line, Math.max(0, g.osmYds - g.yds[tee]));
};

function segD(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const lineD = (p, l) => Math.min(...l.slice(1).map((b, i) => segD(p, l[i], b)));

function inPoly(p, q) {
  let r = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [a, b] = q[i], [e, f] = q[j];
    if ((b > p[1]) !== (f > p[1]) && p[0] < (e - a) * (p[1] - b) / (f - b) + a) r = !r;
  }
  return r;
}

// synthetic fairway: band along centerline from 35% to green-25yd, used only where OSM has no fairway polygon
const synthFw = g => {
  const L = g.osmYds, a = g.par === 3 ? 1e9 : Math.min(190, L * .35);
  return p => {
    const y = p[1];
    return y > a && y < L - 25 && lineD(p, g.line) < 18;
  };
};

function lie(p) {
  const g = H();
  for (const t of ['water', 'bunker']) if (g.feats.some(f => f.t === t && inPoly(p, f.pts))) return t;
  if (g.feats.some(f => f.t === 'green' && inPoly(p, f.pts))) return 'green';
  if (dist(p, g.pin) < 3) return 'green';
  if (g.feats.some(f => f.t === 'tee' && inPoly(p, f.pts))) return 'tee';
  if (g.feats.some(f => f.t === 'fairway' && inPoly(p, f.pts)) || (g.fwApprox && synthFw(g)(p))) return 'fairway';
  if (g.feats.some(f => f.t === 'trees' && inPoly(p, f.pts))) return 'trees';
  return lineD(p, g.line) < 45 ? 'rough' : 'deep rough';
}

function layout() {
  const g = H();
  const xs = g.line.map(p => p[0]);
  const y1 = g.osmYds + 35;
  const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70;
  // Same fit as the original map when the canvas is tall; shrink the inset if it is not.
  const inset = cxv.H > 80 ? 30 : Math.max(8, cxv.H * 0.12);
  S = Math.min((cxv.H - inset) / (y1 + inset), cxv.W / (x1 - x0));
  ox = cxv.W / 2 - (x0 + x1) / 2 * S;
  oy = cxv.H - (cxv.H > 80 ? 15 : inset / 2) - 20 * S;
  sc = S * zoom;
}

function syncCanvas() {
  const W = cv.clientWidth, Hgt = cv.clientHeight;
  const dpr = devicePixelRatio || 1;
  const bw = Math.max(1, Math.round(W * dpr)), bh = Math.max(1, Math.round(Hgt * dpr));
  if (cv.width !== bw || cv.height !== bh) {
    cv.width = bw;
    cv.height = bh;
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  cxv = {W, H: Hgt};
}

function view() {
  syncCanvas();
  if (cxv.W < 2 || cxv.H < 2) return;
  layout();
}

const P = p => [ox + p[0] * sc + panX, oy - p[1] * sc + panY];
const U = (x, y) => [(x - ox - panX) / sc, (oy + panY - y) / sc];

function zoomAt(sx, sy, factor) {
  if (!S) return;
  sc = S * zoom;
  const wx = (sx - ox - panX) / sc;
  const wy = (oy + panY - sy) / sc;
  const next = Math.min(MAX_Z, Math.max(MIN_Z, zoom * factor));
  if (Math.abs(next - zoom) < 1e-4) return;
  zoom = next;
  sc = S * zoom;
  panX = sx - ox - wx * sc;
  panY = sy - oy + wy * sc;
}

function fitView() {
  zoom = 1;
  panX = 0;
  panY = 0;
  view();
  draw();
}

function poly(q, fill, stroke) {
  c.beginPath();
  q.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...P(p)));
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}

function draw() {
  if (!ball || !trail || cxv.W < 2 || cxv.H < 2) return;
  sc = S * zoom;
  const g = H();
  const ballR = coarse ? 6.5 : 4.5;
  const aimR = coarse ? 11 : 7;
  c.fillStyle = '#4e7d3a';
  c.fillRect(0, 0, cxv.W, cxv.H);
  c.lineCap = c.lineJoin = 'round';
  c.strokeStyle = COL.rough;
  c.lineWidth = 90 * sc;
  c.beginPath();
  g.line.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...P(p)));
  c.stroke();
  if (g.fwApprox) {
    c.save();
    c.setLineDash([]);
    c.strokeStyle = '#9fd277bb';
    c.lineWidth = 36 * sc;
    c.beginPath();
    let on = 0;
    const a = g.par === 3 ? 1e9 : Math.min(190, g.osmYds * .35);
    for (let d = 0; d <= g.osmYds; d += 4) {
      const p = along(g.line, d);
      if (p[1] > a && p[1] < g.osmYds - 25) {
        c[on ? 'lineTo' : 'moveTo'](...P(p));
        on = 1;
      }
    }
    c.stroke();
    c.restore();
  }
  for (const t of ['trees', 'building', 'rough', 'fairway', 'path', 'tee', 'green', 'bunker', 'water']) {
    for (const f of g.feats.filter(f => f.t === t)) {
      if (t === 'path') {
        c.strokeStyle = COL.path;
        c.lineWidth = Math.max(1, 2.5 * sc);
        c.beginPath();
        f.pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...P(p)));
        c.stroke();
        continue;
      }
      c.lineWidth = 1;
      const solid = f.main || t === 'bunker' || t === 'water' || t === 'fairway';
      poly(f.pts, COL[t] + (solid ? '' : 'd0'), t === 'green' || t === 'bunker' || t === 'fairway' ? '#0002' : null);
    }
  }
  c.setLineDash([2, 6]);
  c.strokeStyle = '#fff6';
  c.lineWidth = 1;
  c.beginPath();
  g.line.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...P(p)));
  c.stroke();
  c.setLineDash([]);
  const [fx, fy] = P(g.pin);
  const flagH = coarse ? 28 : 22;
  c.strokeStyle = '#d22';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(fx, fy);
  c.lineTo(fx, fy - flagH);
  c.stroke();
  c.fillStyle = '#d22';
  c.fillRect(fx, fy - flagH, coarse ? 13 : 10, coarse ? 9 : 7);
  const tp = P(teePos());
  c.fillStyle = '#fff';
  c.fillRect(tp[0] - 4, tp[1] - 2, 8, 4);
  c.strokeStyle = '#fff';
  c.setLineDash([4, 4]);
  c.lineWidth = 1.5;
  c.beginPath();
  trail.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...P(p)));
  c.stroke();
  c.setLineDash([]);
  if (!done) {
    const d = carryOf(club) || dist(ball, g.pin);
    const an = Math.atan2(aim[0] - ball[0], aim[1] - ball[1]);
    const t = [ball[0] + Math.sin(an) * d, ball[1] + Math.cos(an) * d];
    c.strokeStyle = '#ff0a';
    c.beginPath();
    c.moveTo(...P(ball));
    c.lineTo(...P(t));
    c.stroke();
    c.strokeStyle = '#ff0';
    c.lineWidth = coarse ? 2.5 : 1.5;
    c.beginPath();
    c.arc(...P(t), aimR, 0, 7);
    c.stroke();
  }
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(...P(ball), ballR, 0, 7);
  c.fill();
  c.strokeStyle = '#000';
  c.lineWidth = 1;
  c.stroke();
  const choices = [100, 50, 25, 10, 5];
  const maxPx = Math.min(140, cxv.W * 0.42);
  const yards = choices.find(y => y * sc <= maxPx) || 5;
  c.fillStyle = '#fff';
  c.font = '12px system-ui';
  c.fillRect(12, cxv.H - 18, yards * sc, 3);
  c.fillText(yards + ' yds', 12, cxv.H - 24);
}

const autoAim = () => {
  const g = H(), d = carryOf(club);
  if (!ball) return [...g.pin];
  if (!d || dist(ball, g.pin) <= d + 10) return [...g.pin];
  let best = g.pin, bd = 1e9;
  for (let k = 0; k <= g.osmYds; k += 3) {
    const p = along(g.line, k), e = Math.abs(dist(p, ball) - d);
    if (p[1] > ball[1] && e < bd) { bd = e; best = p; }
  }
  return [...best];
};

function start() {
  zoom = 1;
  panX = 0;
  panY = 0;
  ball = teePos();
  shots = 0;
  trail = [[...ball]];
  done = false;
  club = H().par === 3 ? closestClub(H().yds[tee] > 175 ? 210 : 185) : closestClub(400);
  aim = autoAim();
  $('log').innerHTML = '';
  view();
  draw();
  info();
}

function hit() {
  if (done) return;
  const g = H(), L = lie(ball);
  let d = carryOf(club);
  if (club === 'putter') {
    const r = dist(ball, g.pin) * 3;
    shots++;
    if (r < 3 || Math.random() < Math.max(.15, 1 - r / 40)) { finish(); return; }
    d = r / 3 * (.8 + Math.random() * .4);
  } else {
    d *= ({rough: .9, 'deep rough': .75, bunker: .7, trees: .5}[L] || 1) * (.94 + Math.random() * .1);
    shots++;
  }
  const an = Math.atan2(aim[0] - ball[0], aim[1] - ball[1]) + (Math.random() - .5) * (club === 'putter' ? .05 : .12);
  const prev = [...ball];
  ball = [ball[0] + Math.sin(an) * d, ball[1] + Math.cos(an) * d];
  let nl = lie(ball), msg = `${clubName(club)}: ${d.toFixed(0)} yds → ${nl}`;
  if (nl === 'water') { shots++; ball = prev; msg += ' — penalty, replay'; }
  trail.push([...ball]);
  if (lie(ball) === 'green') club = 'putter';
  else if (dist(ball, g.pin) < 100) club = bag.some(c => c.id === 'sw') ? 'sw' : closestClub(105);
  aim = autoAim();
  log(msg);
  draw();
  info();
}

function finish() {
  done = true;
  scores[h] = shots;
  ball = [...H().pin];
  trail.push([...ball]);
  const d = shots - H().par;
  log(`Holed! ${shots} strokes (${['Eagle', 'Birdie', 'Par', 'Bogey', 'Double'][d + 2] || (d > 0 ? '+' + d : d)})`);
  draw();
  info();
}

function log(m) {
  const p = document.createElement('p');
  p.textContent = m;
  $('log').prepend(p);
}

function renderClubs() {
  const el = $('clubs');
  const left = el.scrollLeft;
  el.innerHTML = bag.map(item =>
    `<button type="button" data-c="${item.id}" class="${item.id === club ? 'on' : ''}" aria-pressed="${item.id === club}">${esc(item.name)}${item.carry ? ' ' + item.carry : ''}</button>`
  ).join('');
  el.scrollLeft = left;
  const on = el.querySelector('.on');
  if (!on) return;
  const box = el.getBoundingClientRect();
  const b = on.getBoundingClientRect();
  if (b.left < box.left + 4) el.scrollLeft -= box.left - b.left + 8;
  else if (b.right > box.right - 4) el.scrollLeft += b.right - box.right + 8;
}

function info() {
  const g = H(), r = g.real;
  $('course').textContent = course.name;
  let src;
  if (g.approx) src = '<span class="warn">Approximate shapes</span>';
  else {
    const bits = ['green ✓', `${r.bunkers} bunkers`, 'tees ✓'];
    if (!g.fwApprox) bits.push('fairway ✓');
    if (r.water) bits.push('water ✓');
    src = `<span class="ok">OSM: ${bits.join(' · ')}</span>${g.fwApprox ? ' <span class="warn">fairway approximated</span>' : ''}`;
  }
  $('hole').innerHTML = `<div class="hole-top"><h2>Hole ${g.n} <small>Par ${g.par} · HCP ${g.hcp || '–'}</small></h2><div class="yds">${g.yds[tee]} yds · ${tee}</div></div><div class="status"><div class="big2">To pin <b>${dist(ball, g.pin).toFixed(0)}</b></div><div class="lie">Lie <b>${lie(ball)}</b> · ${shots}</div></div><div class="src">${src}</div>`;
  renderClubs();
  $('tee').innerHTML = course.tees.map(t => `<option ${t === tee ? 'selected' : ''}>${t}</option>`).join('');
  const t = Object.entries(scores);
  $('card').innerHTML = t.length
    ? `<p class="card-label">Preview</p><table><tr>${t.map(([i]) => `<th>${+i + 1}</th>`).join('')}<th>Tot</th></tr><tr>${t.map(([, s]) => `<td>${s}</td>`).join('')}<td>${t.reduce((a, [, s]) => a + s, 0)}</td></tr></table>`
    : '';
  $('attr').innerHTML = course.attribution.replace(
    'OpenStreetMap contributors',
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
  );
  const hitBtn = $('hit');
  hitBtn.disabled = done;
  hitBtn.textContent = done ? 'Holed' : 'Hit';
  if (planner) planner.sync();
}

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

const pointers = new Map();
let gesture = 'none';

function pinchDist(pts) {
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

cv.addEventListener('pointerdown', e => {
  if (e.button != null && e.button !== 0) return;
  cv.setPointerCapture(e.pointerId);
  const [x, y] = canvasPos(e);
  pointers.set(e.pointerId, {x, y, ox: x, oy: y});
  if (pointers.size >= 2) gesture = 'pinch';
});

cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const [x, y] = canvasPos(e);
  if (pointers.size >= 2) {
    gesture = 'pinch';
    const before = [...pointers.values()];
    const prev = pinchDist(before);
    p.x = x;
    p.y = y;
    const next = pinchDist([...pointers.values()]);
    if (prev > 0 && next > 0) {
      const pts = [...pointers.values()];
      zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, next / prev);
      draw();
    }
    return;
  }
  const moved = Math.hypot(x - p.ox, y - p.oy);
  if (gesture === 'pan' || moved > 8) {
    gesture = 'pan';
    panX += x - p.x;
    panY += y - p.y;
    p.x = x;
    p.y = y;
    cv.style.cursor = 'grabbing';
    draw();
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  if (pointers.size > 0) return;
  if (gesture === 'none') {
    const [x, y] = canvasPos(e);
    if (Math.hypot(x - p.ox, y - p.oy) <= 8) {
      aim = U(x, y);
      draw();
    }
  }
  gesture = 'none';
  cv.style.cursor = 'crosshair';
}

cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', e => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    gesture = 'none';
    cv.style.cursor = 'crosshair';
  }
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const [x, y] = canvasPos(e);
  zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
  draw();
}, {passive: false});

$('clubs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || !btn.dataset.c) return;
  club = btn.dataset.c;
  aim = autoAim();
  draw();
  info();
});
$('hit').onclick = hit;
$('reset').onclick = start;
$('next').onclick = () => { h = (h + 1) % course.holes.length; start(); };
$('prev').onclick = () => { h = (h + course.holes.length - 1) % course.holes.length; start(); };
$('courseSel').onchange = e => { course = COURSES[e.target.value]; tee = course.tees[0]; h = 0; scores = {}; start(); };
$('tee').onchange = e => { tee = e.target.value; start(); };
$('zoomIn').onclick = () => { zoomAt(cxv.W / 2, cxv.H / 2, 1.25); draw(); };
$('zoomOut').onclick = () => { zoomAt(cxv.W / 2, cxv.H / 2, 0.8); draw(); };
$('fit').onclick = fitView;

addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  if (planner && planner.sheetOpen()) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  hit();
});

function applyViewport() {
  const vv = window.visualViewport;
  const active = document.activeElement;
  const editing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (vv && (editing || (planner && planner.sheetOpen()))) {
    document.body.style.height = `${Math.round(vv.height)}px`;
  } else {
    document.body.style.height = '';
  }
  if (planner) planner.placeSheet();
  view();
  draw();
}

addEventListener('resize', applyViewport);
if (window.visualViewport) {
  visualViewport.addEventListener('resize', applyViewport);
  visualViewport.addEventListener('scroll', applyViewport);
}
document.addEventListener('focusin', applyViewport);
document.addEventListener('focusout', () => setTimeout(applyViewport, 0));

$('hint').textContent = coarse
  ? 'Tap the map to aim. Drag to pan, pinch or +/− to zoom.'
  : 'Click the map to aim. Drag to pan, scroll to zoom. Space or Hit to swing.';

planner = mountPlanner({
  getBag: () => bag,
  setBag(next) {
    bag = next;
    saveBag(bag);
    if (!done) aim = autoAim();
    renderClubs();
    draw();
  },
  getContext: () => ({
    courseId: $('courseSel').value,
    courseName: course.name,
    tee,
    holes: course.holes,
    hole: H(),
  }),
  onLayout: applyViewport,
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  if (matchMedia('(display-mode: standalone)').matches) return;
  e.preventDefault();
  deferredPrompt = e;
  $('install').hidden = false;
});
$('install').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('install').hidden = true;
};
window.addEventListener('appinstalled', () => { $('install').hidden = true; });

start();
requestAnimationFrame(() => { view(); draw(); });
