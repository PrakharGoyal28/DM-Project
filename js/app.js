/*
 * app.js — starts the application and connects the screens:
 * navigation, home screen, level selection, dialogs, sound and keyboard.
 */
(function (root) {
  'use strict';

  const Graph = root.MazeGraph;
  const Levels = root.MazeLevels;
  const Storage = root.MazeStorage;
  const Board = root.MazeBoard;
  const Sound = root.MazeAudio;
  const Game = root.MazeGame;
  const $ = id => document.getElementById(id);

  const MODE_DESCRIPTIONS = {
    campaign: 'Adventure: play the mazes in order. Finish a maze to unlock the next one.',
    versus: 'Robot Race: Round A is you. Round B is the BFS robot. Compare your route with the shortest one!',
    sandbox: 'Free Play: every maze is open. You can reveal the shortest path at any time. (This does not change your Adventure progress.)'
  };

  /* --------------------------------------------- validate the campaign */
  // Every level is checked with BFS before it is offered. A level that fails
  // validation is shown as "under repair" instead of being playable.
  const levelProblems = {};
  const levels = Levels.LEVEL_DATA.map(data => {
    const problems = Levels.validateLevel(data);
    if (problems.length) {
      levelProblems[data.id] = problems;
      console.error(`Level ${data.id} failed validation:`, problems);
    }
    return Levels.parseLevel(data);
  });
  const playableLevels = levels.filter(l => !levelProblems[l.id]);

  const state = {
    screen: 'home',
    levelMode: 'campaign',
    progress: Storage.loadProgress(),
    settings: Storage.loadSettings(),
    previewTimer: null,
    toastTimer: null
  };

  /* ----------------------------------------------------- app callbacks */
  const app = {
    get settings() { return state.settings; },
    showScreen,
    openLevels(mode) {
      setLevelMode(mode);
      showScreen('levels');
    },
    showCompletion() {
      renderCompletion();
      showScreen('complete');
    },
    recordResult(row) {
      Storage.addResult({ ...row, timestamp: new Date().toISOString(), player: state.settings.playerName });
    },
    recordCompletion(levelId, result) {
      Storage.recordLevelCompletion(state.progress, levelId, result);
      renderHome();
    },
    confirm: confirmDialog,
    toast
  };

  /* -------------------------------------------------------- navigation */

  function showScreen(name, options = {}) {
    const target = document.querySelector(`[data-screen="${name}"]`);
    if (!target) return;
    if (state.screen !== name) leaveScreen(state.screen);
    document.querySelectorAll('.screen').forEach(section => { section.hidden = section !== target; });
    document.querySelectorAll('.topnav [data-nav]').forEach(btn => {
      const active = btn.dataset.nav === name || (name === 'game' && btn.dataset.nav === 'levels');
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    const previous = state.screen;
    state.screen = name;
    enterScreen(name);
    if (!options.fromHistory && previous !== name) {
      try { root.history.pushState({ screen: name }, ''); } catch (err) { /* file:// in some browsers */ }
    }
    root.scrollTo(0, 0);
    if (!options.keepFocus) $('main').focus({ preventScroll: true });
  }

  function leaveScreen(name) {
    if (name === 'game') Game.leave();
    if (name === 'home') stopPreview();
    if (name === 'learn') root.MazeLearn.onLeave();
    if (name === 'detective') root.MazeDetective.onLeave();
  }

  function enterScreen(name) {
    if (name === 'home') { renderHome(); startPreview(); }
    if (name === 'levels') renderLevels();
    if (name === 'data') root.MazeData.render();
  }

  root.addEventListener('popstate', event => {
    const name = event.state && event.state.screen;
    if (!name) return;
    // Re-entering a finished/abandoned game via Back is confusing: show the level list.
    showScreen(name === 'game' ? 'levels' : name, { fromHistory: true });
  });

  /* -------------------------------------------------------------- home */

  function renderHome() {
    const summary = Storage.summarizeProgress(state.progress);
    $('home-levels').textContent = `${summary.levelsCompleted} / ${levels.length}`;
    $('home-score').textContent = summary.bestScore;
    $('home-current').textContent = summary.currentLevel;
    $('home-stars').textContent = `${summary.totalStars} / ${levels.length * 3}`;
    $('home-continue-label').textContent = summary.levelsCompleted === 0
      ? 'Start Level 1'
      : `Continue: Level ${summary.currentLevel}`;
  }

  function startPreview() {
    stopPreview();
    const preview = Levels.parseLevel({ grid: ['S.#....', '.##.##.', '...#...', '.#...#D'] });
    const board = Board.createBoard($('home-preview'), preview, {
      label: 'Animated preview: Robo walks along a shortest path to the treasure', compact: true
    });
    const robot = board.addSprite('robot', 'assets/robot.svg', '');
    const path = Graph.findShortestPath(preview.maze, preview.start, preview.destination).path;
    robot.moveTo(path[0], true);
    if (Board.prefersReducedMotion()) {
      board.drawPath('bfs', path, 'bfs-line', false);
      return;
    }
    let step = 0;
    state.previewTimer = root.setInterval(() => {
      step += 1;
      if (step >= path.length + 3) { // short pause at the treasure, then loop
        step = 0;
        board.clearLayer('bfs');
        robot.moveTo(path[0], true);
        return;
      }
      if (step < path.length) {
        robot.moveTo(path[step], false, Graph.directionBetween(path[step - 1], path[step]));
        board.drawPath('bfs', path.slice(0, step + 1), 'bfs-line', false);
      }
    }, 420);
  }

  function stopPreview() {
    if (state.previewTimer) root.clearInterval(state.previewTimer);
    state.previewTimer = null;
  }

  /* ------------------------------------------------------ level select */

  function setLevelMode(mode) {
    state.levelMode = Game.MODES[mode] ? mode : 'campaign';
    document.querySelectorAll('[data-mode]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.levelMode)));
    $('mode-description').textContent = MODE_DESCRIPTIONS[state.levelMode];
  }

  function isUnlocked(levelId) {
    return state.levelMode === 'sandbox' || levelId <= state.progress.unlockedLevel;
  }

  function renderLevels() {
    setLevelMode(state.levelMode);
    const groups = [Levels.DIFFICULTY.BEGINNER, Levels.DIFFICULTY.INTERMEDIATE, Levels.DIFFICULTY.ADVANCED];
    $('level-groups').innerHTML = groups.map(difficulty => {
      const cards = levels.filter(l => l.difficulty === difficulty).map(level => {
        const record = state.progress.levels[level.id];
        const broken = Boolean(levelProblems[level.id]);
        const unlocked = isUnlocked(level.id) && !broken;
        const status = broken ? 'repair' : record ? 'done' : unlocked ? 'open' : 'locked';
        const statusText = { repair: 'Under repair', done: 'Completed', open: 'Ready to play', locked: 'Locked' }[status];
        const statusIcon = { repair: 'x', done: 'check', open: 'play', locked: 'lock' }[status];
        const stars = [1, 2, 3].map(n =>
          `<span class="card-star ${record && n <= record.bestStars ? 'earned' : ''}">${Board.iconMarkup('star')}</span>`).join('');
        const label = `Level ${level.id}, ${level.name}. ${difficulty}. ${statusText}.` +
          (record ? ` ${record.bestStars} of 3 stars.` : '') +
          (status === 'locked' ? ` Finish level ${level.id - 1} to unlock.` : '');
        return `<button type="button" class="level-card status-${status}" data-level="${level.id}" ${unlocked ? '' : 'disabled'} aria-label="${label}">
            <span class="level-number">${level.id}</span>
            <span class="level-name">${level.name}</span>
            <span class="level-status">${Board.iconMarkup(statusIcon)} ${statusText}</span>
            <span class="card-stars" aria-hidden="true">${stars}</span>
            ${record ? `<span class="level-best">Best: ${record.bestMoves} moves</span>` : `<span class="level-best">${level.rows}×${level.cols} maze</span>`}
          </button>`;
      }).join('');
      return `<section class="level-group" aria-label="${difficulty} levels">
          <h2 class="group-title" data-difficulty="${difficulty.toLowerCase()}">${difficulty}</h2>
          <div class="level-grid">${cards}</div>
        </section>`;
    }).join('');
  }

  function startLevel(levelId, mode) {
    if (levelProblems[levelId]) return;
    if (mode !== 'sandbox' && levelId > state.progress.unlockedLevel) return;
    Game.start(levelId, mode);
  }

  /* -------------------------------------------------------- completion */

  function renderCompletion() {
    const summary = Storage.summarizeProgress(state.progress);
    $('final-levels').textContent = `${summary.levelsCompleted} / ${levels.length}`;
    $('final-stars').textContent = `${summary.totalStars} / ${levels.length * 3}`;
    $('final-score').textContent = summary.bestScore;
    $('final-shortest').textContent = `${summary.shortestChallenges} / ${levels.length}`;
    Sound.play('complete');
  }

  /* ----------------------------------------------------- dialogs/toast */

  function confirmDialog({ title, text, okLabel }) {
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okLabel || 'Yes';
    dialog.returnValue = '';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
      dialog.showModal();
      $('confirm-cancel').focus();
    });
  }

  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    root.clearTimeout(state.toastTimer);
    state.toastTimer = root.setTimeout(() => el.classList.remove('show'), 2800);
  }

  function anyDialogOpen() {
    return Boolean(document.querySelector('dialog[open]'));
  }

  /* ------------------------------------------------------------- sound */

  function renderSoundButton() {
    const btn = $('sound-toggle');
    const on = state.settings.soundOn;
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('use').setAttribute('href', on ? '#i-sound' : '#i-mute');
    btn.querySelector('.sound-label').textContent = on ? 'Sound on' : 'Sound off';
  }

  /* -------------------------------------------------------------- wire */

  function wire() {
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-nav]');
      if (nav) { showScreen(nav.dataset.nav); return; }
      const modeOpen = event.target.closest('[data-open-mode]');
      if (modeOpen) { app.openLevels(modeOpen.dataset.openMode); return; }
      const card = event.target.closest('[data-level]');
      if (card && !card.disabled) startLevel(Number(card.dataset.level), state.levelMode);
    });

    document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
      setLevelMode(btn.dataset.mode);
      renderLevels();
    }));

    $('home-continue').addEventListener('click', () => {
      setLevelMode('campaign');
      startLevel(Math.min(state.progress.unlockedLevel, levels.length), 'campaign');
    });

    $('reset-progress').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Reset all progress?',
        text: 'This removes completed levels, stars and best scores on this device. Recorded experiment results and notebook entries are kept.',
        okLabel: 'Yes, reset progress'
      });
      if (!ok) return;
      Storage.resetProgress();
      state.progress = Storage.loadProgress();
      renderHome();
      toast('Progress reset. A fresh adventure awaits!');
    });

    $('sound-toggle').addEventListener('click', () => {
      state.settings.soundOn = !state.settings.soundOn;
      Sound.setEnabled(state.settings.soundOn);
      Storage.saveSettings(state.settings);
      renderSoundButton();
      if (state.settings.soundOn) Sound.play('gem');
    });

    $('final-play-again').addEventListener('click', () => app.openLevels('campaign'));
    $('final-free-play').addEventListener('click', () => app.openLevels('sandbox'));

    // Lesson chips scroll within the page instead of changing the URL.
    document.querySelectorAll('.chip-nav a').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      target.scrollIntoView({ behavior: Board.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      const heading = target.querySelector('h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }));

    // Game keys only act on the game screen, never while typing or while a dialog is open.
    document.addEventListener('keydown', event => {
      if (state.screen !== 'game' || anyDialogOpen()) return;
      if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (Game.handleKey(event)) event.preventDefault();
    });
  }

  function boot() {
    // Muted unless the player switched sound on before. Browsers keep audio
    // suspended until the first click/key press; audio.js resumes it then.
    Sound.setEnabled(state.settings.soundOn);
    renderSoundButton();
    Game.init(app, playableLevels);
    root.MazeLearn.init(playableLevels);
    root.MazeData.init(app);
    root.MazeDetective.init(app);
    wire();
    setLevelMode('campaign');
    try { root.history.replaceState({ screen: 'home' }, ''); } catch (err) { /* ignore */ }
    showScreen('home', { fromHistory: true, keepFocus: true });
    if (!Storage.isPersistent) toast('Progress cannot be saved in this browser mode, but you can still play!');
  }

  // Exposed for automated browser tests.
  root.RobotMazeApp = {
    levels, levelProblems, showScreen,
    getProgress: () => state.progress,
    reloadProgress() { state.progress = Storage.loadProgress(); renderHome(); }
  };

  boot();
})(window);
