// Local-only planner state. Nothing here is an account or a server.

const BAG_KEY = 'deusgolf.bag.v1';
const NOTES_KEY = 'deusgolf.notes.v1';
const ROUNDS_KEY = 'deusgolf.rounds.v1';
const MAX_ROUNDS = 30;

export const DEFAULT_BAG = [
  { id: 'driver', name: 'Driver', carry: 290 },
  { id: '3w', name: '3W', carry: 260 },
  { id: '5w', name: '5W', carry: 240 },
  { id: '4i', name: '4i', carry: 220 },
  { id: '5i', name: '5i', carry: 210 },
  { id: '6i', name: '6i', carry: 200 },
  { id: '7i', name: '7i', carry: 185 },
  { id: '8i', name: '8i', carry: 170 },
  { id: '9i', name: '9i', carry: 155 },
  { id: 'pw', name: 'PW', carry: 140 },
  { id: 'gw', name: 'GW 52°', carry: 125 },
  { id: 'sw', name: 'SW 56°', carry: 105 },
  { id: 'lw', name: 'LW 60°', carry: 90 },
  { id: 'putter', name: 'Putter', carry: 0 },
];

const memory = new Map();

function storage() {
  try {
    if (typeof localStorage === 'undefined') throw new Error('no localStorage');
    const probe = '__deusgolf__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return {
      getItem: key => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: key => memory.delete(key),
    };
  }
}

function readJSON(key) {
  try {
    const raw = storage().getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode: keep the in-memory copy via the fallback */
  }
}

function cleanName(value, fallback) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || fallback;
}

function cleanCarry(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 400) return fallback;
  return n;
}

export function defaultBag() {
  return DEFAULT_BAG.map(club => ({ ...club }));
}

export function loadBag() {
  const saved = readJSON(BAG_KEY);
  const byId = new Map(Array.isArray(saved) ? saved.filter(c => c && c.id).map(c => [c.id, c]) : []);
  return DEFAULT_BAG.map(club => {
    const row = byId.get(club.id);
    if (!row) return { ...club };
    return {
      id: club.id,
      name: cleanName(row.name, club.name),
      carry: club.id === 'putter' ? 0 : cleanCarry(row.carry, club.carry),
    };
  });
}

export function saveBag(bag) {
  writeJSON(BAG_KEY, loadShape(bag));
}

function loadShape(bag) {
  const byId = new Map(Array.isArray(bag) ? bag.map(c => [c.id, c]) : []);
  return DEFAULT_BAG.map(club => {
    const row = byId.get(club.id);
    if (!row) return { ...club };
    return {
      id: club.id,
      name: cleanName(row.name, club.name),
      carry: club.id === 'putter' ? 0 : cleanCarry(row.carry, club.carry),
    };
  });
}

export function holeNote(courseId, holeN) {
  const all = readJSON(NOTES_KEY);
  const note = all && all[courseId] ? all[courseId][String(holeN)] : null;
  return {
    layup: String(note?.layup || '').slice(0, 80),
    miss: note?.miss === 'left' || note?.miss === 'right' ? note.miss : '',
    plan: Number.isInteger(note?.plan) ? Math.min(15, Math.max(1, note.plan)) : null,
  };
}

export function saveHoleNote(courseId, holeN, note) {
  const all = readJSON(NOTES_KEY) || {};
  if (!all[courseId] || typeof all[courseId] !== 'object') all[courseId] = {};
  const clean = {
    layup: String(note.layup || '').slice(0, 80),
    miss: note.miss === 'left' || note.miss === 'right' ? note.miss : '',
  };
  if (Number.isInteger(note.plan)) clean.plan = Math.min(15, Math.max(1, note.plan));
  const key = String(holeN);
  if (!clean.layup && !clean.miss && clean.plan == null) delete all[courseId][key];
  else all[courseId][key] = clean;
  writeJSON(NOTES_KEY, all);
  return holeNote(courseId, holeN);
}

function cleanSnapshotClub(club) {
  if (!club || typeof club.id !== 'string') return null;
  const name = cleanName(club.name, '');
  if (!name) return null;
  const carry = club.id === 'putter' ? 0 : cleanCarry(club.carry, null);
  if (carry == null) return null;
  return { id: club.id, name, carry };
}

function cleanRound(round) {
  if (!round || typeof round.id !== 'string' || !round.id) return null;
  if (!Array.isArray(round.holes)) return null;
  const holes = [];
  for (const hole of round.holes) {
    const n = Number(hole?.n);
    const par = Number(hole?.par);
    const plan = Number(hole?.plan);
    if (!Number.isInteger(n) || !Number.isInteger(par) || par < 3 || par > 6) continue;
    holes.push({
      n,
      par,
      yds: Number.isFinite(Number(hole.yds)) ? Math.round(Number(hole.yds)) : 0,
      layup: String(hole.layup || '').slice(0, 80),
      miss: hole.miss === 'left' || hole.miss === 'right' ? hole.miss : '',
      plan: Number.isInteger(plan) ? Math.min(15, Math.max(1, plan)) : par,
    });
  }
  if (!holes.length) return null;
  const actual = {};
  if (round.actual && typeof round.actual === 'object') {
    for (const [key, value] of Object.entries(round.actual)) {
      const score = Number(value);
      if (Number.isInteger(score) && score >= 1 && score <= 15) actual[String(key)] = score;
    }
  }
  return {
    id: round.id,
    savedAt: typeof round.savedAt === 'string' ? round.savedAt : new Date().toISOString(),
    courseId: String(round.courseId || ''),
    courseName: String(round.courseName || 'Course').slice(0, 120),
    tee: String(round.tee || '').slice(0, 24),
    bag: Array.isArray(round.bag) ? round.bag.map(cleanSnapshotClub).filter(Boolean) : [],
    holes,
    actual,
  };
}

export function loadRounds() {
  const saved = readJSON(ROUNDS_KEY);
  if (!Array.isArray(saved)) return [];
  return saved.map(cleanRound).filter(Boolean).slice(0, MAX_ROUNDS);
}

export function saveRounds(rounds) {
  writeJSON(ROUNDS_KEY, rounds.map(cleanRound).filter(Boolean).slice(0, MAX_ROUNDS));
}

export function addRound(round) {
  const clean = cleanRound(round);
  if (!clean) return loadRounds();
  const rounds = [clean, ...loadRounds()].slice(0, MAX_ROUNDS);
  saveRounds(rounds);
  return rounds;
}

export function replaceRound(round) {
  const clean = cleanRound(round);
  if (!clean) return loadRounds();
  const rounds = loadRounds().map(item => (item.id === clean.id ? clean : item));
  saveRounds(rounds);
  return rounds;
}

export function deleteRound(id) {
  const rounds = loadRounds().filter(round => round.id !== id);
  saveRounds(rounds);
  return rounds;
}

export function scoreOf(round, holeN) {
  if (!round?.actual) return null;
  const value = round.actual[holeN] ?? round.actual[String(holeN)];
  return value == null ? null : value;
}

export function compareRound(round) {
  let planAll = 0;
  let planScored = 0;
  let actual = 0;
  let n = 0;
  const holes = round.holes.map(hole => {
    planAll += hole.plan;
    const shot = scoreOf(round, hole.n);
    if (shot != null) {
      planScored += hole.plan;
      actual += shot;
      n += 1;
    }
    return { ...hole, actual: shot, delta: shot == null ? null : shot - hole.plan };
  });
  return { planAll, planScored, actual, n, total: round.holes.length, holes };
}

export function compareLabel(cmp) {
  if (!cmp.n) return `Plan ${cmp.planAll}. No scores yet.`;
  const delta = cmp.actual - cmp.planScored;
  const rel = delta === 0 ? 'even with the plan' : delta > 0 ? `${delta} over plan` : `${-delta} under plan`;
  if (cmp.n === cmp.total) return `Plan ${cmp.planAll}. Score ${cmp.actual}. ${rel}.`;
  return `Plan ${cmp.planAll}. ${cmp.n} of ${cmp.total} holes scored ${cmp.actual} against plan ${cmp.planScored} (${rel}).`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
