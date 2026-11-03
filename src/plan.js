import {
  addRound,
  compareLabel,
  compareRound,
  defaultBag,
  deleteRound,
  esc,
  holeNote,
  loadRounds,
  replaceRound,
  saveHoleNote,
} from './store.js';

const $ = id => document.getElementById(id);

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function shortCourse(round) {
  if (round.courseId === 'losverdes') return 'Los Verdes';
  if (round.courseId === 'pebble') return 'Pebble (sample)';
  return round.courseName;
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function deltaText(delta) {
  if (delta == null) return '';
  if (delta === 0) return 'E';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function noteBits(hole) {
  const bits = [];
  if (hole.yds) bits.push(`${hole.yds} yds`);
  if (hole.miss === 'left') bits.push('Miss left');
  if (hole.miss === 'right') bits.push('Miss right');
  if (hole.layup && hole.layup.trim()) bits.push(hole.layup.trim());
  return bits.join(' · ');
}

function chipText(note) {
  const bits = [];
  if (note.miss === 'left') bits.push('Miss left');
  if (note.miss === 'right') bits.push('Miss right');
  if (note.layup && note.layup.trim()) bits.push(note.layup.trim());
  return bits.join(' · ');
}

export function mountPlanner({ getBag, setBag, getContext, onLayout }) {
  const sheet = $('sheet');
  const bagPane = $('paneBag');
  const roundsPane = $('paneRounds');
  const layup = $('layup');
  const planVal = $('planVal');
  const noteChip = $('noteChip');
  let tab = 'rounds';
  let openId = null;
  let shownKey = '';
  let deleteArmed = '';

  function context() {
    return getContext();
  }

  function currentNote() {
    const ctx = context();
    return holeNote(ctx.courseId, ctx.hole.n);
  }

  function writeNote(patch) {
    const ctx = context();
    const prev = holeNote(ctx.courseId, ctx.hole.n);
    const next = saveHoleNote(ctx.courseId, ctx.hole.n, { ...prev, ...patch });
    paintStrategy(next, ctx.hole.par, false);
    return next;
  }

  function paintStrategy(note, par, replaceLayup) {
    for (const button of document.querySelectorAll('.miss button')) {
      const on = button.dataset.miss === note.miss && note.miss !== '';
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    planVal.textContent = String(note.plan ?? par);
    const text = chipText(note);
    noteChip.hidden = !text;
    noteChip.textContent = text;
    if (replaceLayup && document.activeElement !== layup) layup.value = note.layup;
  }

  function sync() {
    const ctx = context();
    const key = `${ctx.courseId}:${ctx.hole.n}`;
    const note = holeNote(ctx.courseId, ctx.hole.n);
    const holeChanged = key !== shownKey;
    shownKey = key;
    paintStrategy(note, ctx.hole.par, holeChanged);
  }

  function livePlan() {
    const ctx = context();
    const total = ctx.holes.reduce((sum, hole) => sum + (holeNote(ctx.courseId, hole.n).plan ?? hole.par), 0);
    const name = ctx.courseId === 'losverdes' ? 'Los Verdes' : ctx.courseId === 'pebble' ? 'Pebble (sample)' : ctx.courseName;
    return `${name} · ${ctx.tee} · plan ${total}`;
  }

  function renderBag() {
    const bag = getBag();
    bagPane.innerHTML = `<p class="sheet-lead">Carry yards for a full swing. Saved on this phone. The scratch bag starts at Driver 290 until you change it.</p>
      <button type="button" id="resetBag" class="ghost">Reset to scratch bag</button>
      <div class="bag-list">${bag.map(club => `<label class="bag-row"><span class="sr" id="lab-${club.id}">${esc(club.name)} carry</span>
        <input data-name="${club.id}" maxlength="24" aria-label="${esc(club.name)} name" value="${esc(club.name)}" autocomplete="off">
        <input data-carry="${club.id}" inputmode="numeric" aria-labelledby="lab-${club.id}" ${club.id === 'putter' ? 'disabled value="" placeholder="—"' : `value="${club.carry}"`}>
      </label>`).join('')}</div>`;
  }

  function renderRoundList() {
    openId = null;
    const rounds = loadRounds();
    const items = rounds.length
      ? rounds.map(round => {
        const cmp = compareRound(round);
        return `<button type="button" class="round-row" data-open="${esc(round.id)}">
          <span class="round-title">${esc(shortCourse(round))} · ${esc(round.tee)}</span>
          <span class="round-sub">${esc(when(round.savedAt))} · ${esc(compareLabel(cmp))}</span>
        </button>`;
      }).join('')
      : '<p class="sheet-lead">No saved rounds yet. Set a miss side, layup, and plan score on each hole, then save a snapshot.</p>';
    roundsPane.innerHTML = `<p class="sheet-lead" id="livePlan"></p>
      <button type="button" id="savePlan" class="big save">Save this plan</button>
      <p class="sheet-note">Saves the course, tee, bag, miss side, layup, and plan score for every hole. You can enter real scores after the round.</p>
      <div class="round-list">${items}</div>`;
    $('livePlan').textContent = livePlan();
  }

  function renderRoundDetail(id) {
    const round = loadRounds().find(item => item.id === id);
    if (!round) {
      renderRoundList();
      return;
    }
    openId = id;
    deleteArmed = '';
    const cmp = compareRound(round);
    const bagLine = round.bag.map(club => `${club.name}${club.carry ? ` ${club.carry}` : ''}`).join(' · ');
    const rows = cmp.holes.map(hole => {
      const bits = noteBits(hole);
      return `<tr data-plan="${hole.plan}">
        <th scope="row">${hole.n}</th>
        <td>${hole.par}</td>
        <td>${hole.plan}</td>
        <td><input data-score="${hole.n}" inputmode="numeric" aria-label="Hole ${hole.n} score" value="${hole.actual ?? ''}"></td>
        <td class="delta ${hole.delta == null ? '' : hole.delta > 0 ? 'over' : hole.delta < 0 ? 'under' : 'even'}">${deltaText(hole.delta)}</td>
      </tr>${bits ? `<tr class="note-row"><td colspan="5">${esc(bits)}</td></tr>` : ''}`;
    }).join('');
    roundsPane.innerHTML = `<button type="button" class="text-btn back" data-back="1">Back</button>
      <h3 class="round-heading">${esc(shortCourse(round))} · ${esc(round.tee)}</h3>
      <p class="cmp" id="cmpSummary">${esc(compareLabel(cmp))}</p>
      <details class="bag-snap"><summary>Bag in this plan</summary><p>${esc(bagLine)}</p></details>
      <div class="score-scroll"><table class="score-table">
        <thead><tr><th scope="col">Hole</th><th scope="col">Par</th><th scope="col">Plan</th><th scope="col">Score</th><th scope="col">+/-</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <button type="button" id="deleteRound" class="ghost danger">Delete round</button>`;
  }

  function showTab(next) {
    tab = next;
    const bagOn = tab === 'bag';
    $('tabBag').classList.toggle('on', bagOn);
    $('tabRounds').classList.toggle('on', !bagOn);
    $('tabBag').setAttribute('aria-selected', bagOn ? 'true' : 'false');
    $('tabRounds').setAttribute('aria-selected', bagOn ? 'false' : 'true');
    bagPane.hidden = !bagOn;
    roundsPane.hidden = bagOn;
    if (bagOn) renderBag();
    else if (openId) renderRoundDetail(openId);
    else renderRoundList();
  }

  function layout() {
    if (onLayout) onLayout();
    else placeSheet();
  }

  function open(nextTab) {
    sheet.hidden = false;
    $('planBtn').setAttribute('aria-expanded', 'true');
    showTab(nextTab || tab);
    layout();
    $('sheetClose').focus();
  }

  function close() {
    sheet.hidden = true;
    $('planBtn').setAttribute('aria-expanded', 'false');
    layout();
    $('planBtn').focus();
  }

  function placeSheet() {
    const vv = window.visualViewport;
    if (sheet.hidden || !vv) {
      sheet.style.top = '';
      sheet.style.height = '';
      return;
    }
    sheet.style.top = `${vv.offsetTop}px`;
    sheet.style.height = `${Math.round(vv.height)}px`;
  }

  document.querySelector('.miss').addEventListener('click', event => {
    const button = event.target.closest('button[data-miss]');
    if (!button) return;
    const note = currentNote();
    writeNote({ miss: note.miss === button.dataset.miss ? '' : button.dataset.miss });
  });

  $('planMinus').addEventListener('click', () => {
    const ctx = context();
    const note = currentNote();
    const plan = Math.max(1, (note.plan ?? ctx.hole.par) - 1);
    writeNote({ plan });
  });
  $('planPlus').addEventListener('click', () => {
    const ctx = context();
    const note = currentNote();
    const plan = Math.min(15, (note.plan ?? ctx.hole.par) + 1);
    writeNote({ plan });
  });

  layup.addEventListener('input', () => {
    writeNote({ layup: layup.value });
  });
  layup.addEventListener('blur', () => {
    layup.value = currentNote().layup;
  });

  $('planBtn').addEventListener('click', () => open('rounds'));
  $('editBag').addEventListener('click', () => open('bag'));
  $('sheetClose').addEventListener('click', close);
  sheet.querySelector('[data-close]').addEventListener('click', close);

  $('tabBag').addEventListener('click', () => showTab('bag'));
  $('tabRounds').addEventListener('click', () => {
    openId = null;
    showTab('rounds');
  });

  bagPane.addEventListener('input', event => {
    const nameInput = event.target.closest('input[data-name]');
    const carryInput = event.target.closest('input[data-carry]');
    if (nameInput) {
      const cleaned = nameInput.value.replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      const bag = getBag().map(club => club.id === nameInput.dataset.name ? { ...club, name: cleaned } : club);
      setBag(bag);
      nameInput.setAttribute('aria-label', `${cleaned} name`);
      return;
    }
    if (carryInput) {
      const n = Number(carryInput.value);
      if (!Number.isInteger(n) || n < 1 || n > 400) return;
      const bag = getBag().map(club => club.id === carryInput.dataset.carry ? { ...club, carry: n } : club);
      setBag(bag);
    }
  });
  bagPane.addEventListener('focusout', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const bag = getBag();
    if (input.dataset.name) {
      const club = bag.find(item => item.id === input.dataset.name);
      if (club) input.value = club.name;
    }
    if (input.dataset.carry) {
      const club = bag.find(item => item.id === input.dataset.carry);
      if (club) input.value = String(club.carry);
    }
  });
  bagPane.addEventListener('click', event => {
    const button = event.target.closest('#resetBag');
    if (!button) return;
    if (button.dataset.arm !== '1') {
      button.dataset.arm = '1';
      button.textContent = 'Tap again to restore the scratch bag';
      setTimeout(() => {
        if (button.dataset.arm === '1') {
          button.dataset.arm = '';
          button.textContent = 'Reset to scratch bag';
        }
      }, 2500);
      return;
    }
    setBag(defaultBag());
    renderBag();
  });

  roundsPane.addEventListener('click', event => {
    const save = event.target.closest('#savePlan');
    if (save) {
      const ctx = context();
      const round = {
        id: uid(),
        savedAt: new Date().toISOString(),
        courseId: ctx.courseId,
        courseName: ctx.courseName,
        tee: ctx.tee,
        bag: getBag().map(club => ({ ...club })),
        holes: ctx.holes.map(hole => {
          const note = holeNote(ctx.courseId, hole.n);
          const yds = hole.yds?.[ctx.tee] ?? Object.values(hole.yds || {})[0] ?? 0;
          return {
            n: hole.n,
            par: hole.par,
            yds,
            layup: note.layup,
            miss: note.miss,
            plan: note.plan ?? hole.par,
          };
        }),
        actual: {},
      };
      addRound(round);
      renderRoundDetail(round.id);
      return;
    }
    const openBtn = event.target.closest('[data-open]');
    if (openBtn) {
      renderRoundDetail(openBtn.dataset.open);
      return;
    }
    if (event.target.closest('[data-back]')) {
      renderRoundList();
      return;
    }
    const del = event.target.closest('#deleteRound');
    if (del) {
      if (deleteArmed !== openId) {
        deleteArmed = openId;
        del.textContent = 'Tap again to delete';
        return;
      }
      deleteRound(openId);
      renderRoundList();
    }
  });

  roundsPane.addEventListener('input', event => {
    const input = event.target.closest('input[data-score]');
    if (!input || !openId) return;
    const raw = input.value.trim();
    let score = null;
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 15) return;
      score = n;
    }
    const rounds = loadRounds();
    const round = rounds.find(item => item.id === openId);
    if (!round) return;
    if (score == null) delete round.actual[String(input.dataset.score)];
    else round.actual[String(input.dataset.score)] = score;
    replaceRound(round);
    const saved = loadRounds().find(item => item.id === openId);
    const cmp = compareRound(saved);
    const hole = cmp.holes.find(item => item.n === Number(input.dataset.score));
    const row = input.closest('tr');
    const cell = row.querySelector('.delta');
    cell.textContent = deltaText(hole.delta);
    cell.className = `delta ${hole.delta == null ? '' : hole.delta > 0 ? 'over' : hole.delta < 0 ? 'under' : 'even'}`;
    $('cmpSummary').textContent = compareLabel(cmp);
  });

  roundsPane.addEventListener('focusout', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.score || !openId) return;
    const round = loadRounds().find(item => item.id === openId);
    const score = round ? round.actual[String(input.dataset.score)] : null;
    input.value = score == null ? '' : String(score);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !sheet.hidden) {
      event.preventDefault();
      close();
    }
  });

  if (window.visualViewport) {
    visualViewport.addEventListener('resize', placeSheet);
    visualViewport.addEventListener('scroll', placeSheet);
  }

  return { sync, open, close, placeSheet, sheetOpen: () => !sheet.hidden };
}
