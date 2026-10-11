/*
 * game.js — the gameplay screen: draws the level, handles input, animations,
 * hints, undo/restart, the Robot Race and the end-of-level results panel.
 * The rules themselves live in engine.js; the maths lives in bfs.js.
 */
(function (root) {
  'use strict';

  const Graph = root.MazeGraph;
  const Engine = root.MazeEngine;
  const Board = root.MazeBoard;
  const Sound = root.MazeAudio;

  const MODES = Object.freeze({
    campaign: { label: 'Adventure', allowShowPath: false, saveProgress: true, race: false },
    versus: { label: 'Robot Race', allowShowPath: false, saveProgress: true, race: true },
    sandbox: { label: 'Free Play', allowShowPath: true, saveProgress: false, race: false }
  });

  const KEY_TO_DIRECTION = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
  };

  const $ = id => document.getElementById(id);
  const moveDuration = () => (Board.prefersReducedMotion() ? 0 : 170);

  let app = null;      // callbacks supplied by app.js
  let levels = [];     // parsed, validated campaign levels

  // Everything about the level currently on screen. Replaced on every start().
  let session = null;
  // Incremented whenever a level starts or the screen is left; delayed
  // callbacks compare against it so they never act on a stale level.
  let sessionToken = 0;

  function init(appCallbacks, parsedLevels) {
    app = appCallbacks;
    levels = parsedLevels;

    document.querySelectorAll('[data-move]').forEach(btn => {
      btn.addEventListener('click', () => requestMove(btn.dataset.move));
    });
    $('btn-undo').addEventListener('click', undo);
    $('btn-restart').addEventListener('click', restart);
    $('btn-hint').addEventListener('click', giveHint);
    $('btn-showpath').addEventListener('click', toggleShortestPath);

    $('res-replay').addEventListener('click', () => { closeResults(); start(session.level.id, session.modeName); });
    $('res-levels').addEventListener('click', () => { closeResults(); app.showScreen('levels'); });
    $('res-watch').addEventListener('click', () => {
      closeResults();
      runBfsRobot(() => openResults());
    });
    $('res-next').addEventListener('click', () => {
      const { level, modeName } = session;
      closeResults();
      if (level.id >= levels.length) app.showCompletion();
      else start(level.id + 1, modeName);
    });
    $('results-dialog').addEventListener('close', () => {
      if (session && session.phase === 'results') {
        setMessage('Treasure found! Press Restart level to play again, or choose another maze.');
      }
    });

    attachSwipe($('game-board'));
  }

  /* ---------------------------------------------------------------- start */

  function start(levelId, modeName) {
    const level = levels.find(l => l.id === levelId);
    if (!level) return;
    leave();
    const token = ++sessionToken;
    const mode = MODES[modeName] || MODES.campaign;

    // BFS is run here, from the real maze. The displayed shortest length is
    // never copied from level data.
    const analysis = Graph.analyzeMaze(level.maze, level.start, level.destination);

    const board = Board.createBoard($('game-board'), level, {
      label: `Maze for level ${level.id}: ${level.rows} rows by ${level.cols} columns. Robo starts at the flag; the treasure chest is the goal.`
    });
    const robot = board.addSprite('robot', 'assets/robot.svg', 'Robo the robot');
    robot.moveTo(level.start, true);

    session = {
      token, level, mode, modeName, analysis, board, robot,
      ghost: null,
      state: Engine.createGameState(level),
      phase: 'play',          // play → goal → (race) → results
      animating: false,
      moveQueue: [],
      startedAt: null,
      elapsedMs: 0,
      timerId: null,
      pathShown: false,
      solutionShown: false,
      result: null
    };

    $('game-level-title').textContent = `Level ${level.id}: ${level.name}`;
    const diff = $('game-difficulty');
    diff.textContent = level.difficulty;
    diff.dataset.difficulty = level.difficulty.toLowerCase();
    $('game-mode').textContent = mode.label;
    $('game-objective').querySelector('span').textContent = level.objective;
    $('g-shortest').textContent = analysis.shortestDistance;
    $('g-time-wrap').hidden = !mode.race;
    $('g-time').textContent = '0:00';
    $('btn-showpath').hidden = !mode.allowShowPath;
    setShowPathButton(false);
    $('discover-panel').hidden = true;
    $('side-note').textContent = mode.allowShowPath
      ? 'Free Play: you can reveal the shortest path at any time.'
      : 'Try the maze yourself first! The shortest path is revealed after you finish.';

    const banner = $('race-banner');
    banner.hidden = !mode.race;
    if (mode.race) {
      banner.innerHTML = `${Board.iconMarkup('zap')} <strong>Round A: your turn!</strong> Reach the treasure. Then the BFS robot takes its turn.`;
    }

    setMessage(level.lesson);
    updateStats();
    setControlsEnabled(true);
    app.showScreen('game');
  }

  /** Stops timers and invalidates pending callbacks (called when leaving the game). */
  function leave() {
    sessionToken += 1;
    if (!session) return;
    stopTimer();
    if (session.raceInterval) root.clearInterval(session.raceInterval);
    session.animating = false;
    session.moveQueue = [];
  }

  /* -------------------------------------------------------------- moving */

  const MAX_QUEUED_MOVES = 3;

  function requestMove(direction) {
    if (!session || session.phase !== 'play') return;
    if (session.animating) {
      // Remember a few moves pressed during an animation instead of dropping
      // them; they are applied one by one once each animation has finished.
      if (session.moveQueue.length < MAX_QUEUED_MOVES) session.moveQueue.push(direction);
      return;
    }
    performMove(direction);
  }

  function performMove(direction) {
    const { state, robot } = session;
    const outcome = Engine.tryMove(state, direction);
    if (!outcome.moved) {
      if (outcome.reason === 'wall' || outcome.reason === 'edge') {
        Sound.play('bump');
        robot.pulse('bump-' + direction, 320);
        setMessage(outcome.reason === 'wall'
          ? 'Bonk! That is a wall. Try a different way!'
          : 'That is the edge of the maze. Try another way!');
      }
      return;
    }

    if (session.startedAt === null) startTimer();
    clearHint();
    Sound.play(outcome.collectedGem ? 'gem' : 'move');
    robot.moveTo(state.position, false, direction);
    robot.pulse('hop', 240);
    drawTrail();
    updateStats();

    if (outcome.collectedGem) setMessage(`You found a gem! (+20 points) ${gemSummary()}`);
    else if (outcome.reachedGoal) setMessage('Amazing! You reached the treasure!');
    else if (state.level.moveLimit && state.moves === state.level.moveLimit + 1) {
      setMessage('You have passed the move limit. That is okay: keep exploring, or restart to try for the bonus!');
    }

    const duration = moveDuration();
    if (duration === 0) { afterMove(outcome); return; } // reduced motion: no animation to wait for
    session.animating = true;
    const token = session.token;
    root.setTimeout(() => {
      if (token !== sessionToken || !session) return;
      session.animating = false;
      afterMove(outcome);
    }, duration);
  }

  function afterMove(outcome) {
    if (outcome.reachedGoal) {
      session.moveQueue = [];
      finishLevel();
      return;
    }
    const queued = session.moveQueue.shift();
    if (queued) requestMove(queued);
  }

  function undo() {
    if (!session || session.phase !== 'play' || session.animating) return;
    if (!Engine.undoMove(session.state)) {
      setMessage('Robo is already at the start: nothing to undo.');
      return;
    }
    clearHint();
    session.robot.moveTo(session.state.position, false);
    drawTrail();
    updateStats();
    setMessage('Undo! Robo stepped back one square.');
  }

  function restart() {
    if (!session) return;
    if (session.phase !== 'play') {
      // After finishing (or during the race) "restart" means play the level again.
      closeResults();
      start(session.level.id, session.modeName);
      return;
    }
    session.moveQueue = [];
    session.state = Engine.restartLevel(session.state);
    stopTimer();
    session.startedAt = null;
    session.elapsedMs = 0;
    $('g-time').textContent = '0:00';
    clearHint();
    session.robot.moveTo(session.level.start, true);
    session.board.refresh(session.level); // brings collected gems back
    drawTrail();
    updateStats();
    setMessage('Fresh start! Every try teaches you more about the maze.');
  }

  /* --------------------------------------------------------------- hints */

  function giveHint() {
    if (!session || session.phase !== 'play') return;
    const { state, board } = session;
    const stage = Math.min(3, state.hintsUsed + 1);
    const hint = Engine.getHint(state, stage);
    if (!hint) return;
    state.hintsUsed += 1;
    Sound.play('hint');
    clearHint();
    if (stage >= 2) board.setCellClass(hint.nextCell, 'hint-next', true);
    if (stage >= 3) board.drawPath('hint', hint.segment, 'hint-line', true);
    const costNote = state.hintsUsed === 1 ? ' (Using hints means one less star, but that is okay!)' : '';
    setMessage(`Hint ${stage}: ${hint.message}${costNote}`);
    updateStats();
  }

  function clearHint() {
    if (!session) return;
    session.board.clearCellClass('hint-next');
    session.board.clearLayer('hint');
  }

  /* ------------------------------------------------- shortest path reveal */

  function toggleShortestPath() {
    if (!session || !session.mode.allowShowPath) return;
    session.pathShown = !session.pathShown;
    if (session.pathShown) {
      session.solutionShown = true;
      showShortestPath(true);
    } else {
      session.board.clearLayer('bfs');
      $('discover-panel').hidden = true;
    }
    setShowPathButton(session.pathShown);
  }

  function showShortestPath(animate) {
    const { analysis, board } = session;
    board.drawPath('bfs', analysis.shortestPath, 'bfs-line', animate);
    const panel = $('discover-panel');
    panel.hidden = false;
    const extra = analysis.shortestPathCount > 1
      ? ` This maze has <strong>${analysis.shortestPathCount}</strong> different shortest paths. BFS shows one of them.`
      : '';
    panel.innerHTML = `
      <h3>${Board.iconMarkup('bot')} BFS found a ${analysis.shortestDistance}-move path</h3>
      <p>BFS checked every square 1 move from the start, then every square 2 moves away, and so on.
      It first reached the treasure in ripple number <strong>${analysis.shortestDistance}</strong>, so no route can use fewer moves.${extra}</p>
      <p>Your route so far (dotted line): <strong>${session.state.moves}</strong> moves.</p>`;
  }

  function setShowPathButton(on) {
    const btn = $('btn-showpath');
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('span').textContent = on ? 'Hide the shortest path' : 'Discover the shortest path';
  }

  /* ---------------------------------------------------------- finishing */

  function finishLevel() {
    const { state, level, analysis, mode } = session;
    session.phase = 'goal';
    stopTimer();
    setControlsEnabled(false);
    Sound.play('goal');
    session.robot.pulse('celebrate', 1000);
    session.board.setCellClass(level.destination, 'goal-reached', true);

    const result = Engine.scoreLevel({
      moves: state.moves,
      shortest: analysis.shortestDistance,
      hintsUsed: state.hintsUsed,
      gemsCollected: state.collectedGems.size,
      moveLimit: level.moveLimit
    });
    result.seconds = Math.round(session.elapsedMs / 1000);
    session.result = result;

    app.recordResult({
      mazeId: `L${level.id}`, mazeName: level.name, mode: session.modeName,
      rows: level.rows, cols: level.cols,
      openCells: analysis.openCells, reachableCells: analysis.reachableCells,
      shortestPath: analysis.shortestDistance, playerPath: state.moves,
      extraMoves: result.extraMoves, hintsUsed: state.hintsUsed, undos: state.undos,
      seconds: result.seconds, foundShortest: result.extraMoves === 0,
      solutionShown: session.solutionShown
    });
    if (mode.saveProgress) app.recordCompletion(level.id, result);

    const token = session.token;
    root.setTimeout(() => {
      if (token !== sessionToken) return;
      if (mode.race) runBfsRobot(() => openResults());
      else openResults();
    }, Board.prefersReducedMotion() ? 150 : 900);
  }

  /** Round B: a purple BFS robot walks the shortest path, drawing it as it goes. */
  function runBfsRobot(onDone) {
    const { board, analysis, level } = session;
    const token = session.token;
    session.phase = 'race';
    setControlsEnabled(false);
    if (session.ghost) session.ghost.remove();
    const ghost = board.addSprite('ghost', 'assets/robot.svg', 'BFS robot');
    session.ghost = ghost;
    ghost.moveTo(level.start, true);
    const path = analysis.shortestPath;

    const banner = $('race-banner');
    banner.hidden = false;
    banner.innerHTML = `${Board.iconMarkup('bot')} <strong>Round B: the BFS robot's turn!</strong> Watch it follow a shortest path.
      <button type="button" class="btn btn-small btn-ghost" id="race-skip">Skip</button>`;

    let step = 0;
    const finish = () => {
      if (session.raceInterval) root.clearInterval(session.raceInterval);
      session.raceInterval = null;
      if (token !== sessionToken) return;
      board.drawPath('bfs', path, 'bfs-line', false);
      ghost.moveTo(path[path.length - 1], true);
      banner.innerHTML = `${Board.iconMarkup('bot')} BFS robot: <strong>${analysis.shortestDistance} moves</strong>. You: <strong>${session.state.moves} moves</strong>.`;
      if (!session.mode.race) banner.hidden = true;
      session.phase = 'results';
      onDone();
    };
    $('race-skip').addEventListener('click', finish);

    if (Board.prefersReducedMotion()) { finish(); return; }
    session.raceInterval = root.setInterval(() => {
      if (token !== sessionToken) { root.clearInterval(session.raceInterval); return; }
      step += 1;
      if (step >= path.length) { finish(); return; }
      ghost.moveTo(path[step], false, Graph.directionBetween(path[step - 1], path[step]));
      board.drawPath('bfs', path.slice(0, step + 1), 'bfs-line', false);
      Sound.play('step');
    }, 200);
  }

  function openResults() {
    const { result, level, analysis, mode, modeName } = session;
    session.phase = 'results';
    Sound.play('complete');

    const isShortest = result.extraMoves === 0;
    $('results-title').textContent = isShortest ? 'You found a shortest path!' : 'You found the treasure!';
    $('results-message').textContent = Engine.encouragement(result.extraMoves);

    const starsEl = $('results-stars');
    starsEl.innerHTML = [1, 2, 3].map(n =>
      `<span class="result-star ${n <= result.stars ? 'earned' : ''}">${Board.iconMarkup('star')}</span>`).join('');
    starsEl.setAttribute('aria-label', `${result.stars} out of 3 stars`);
    starsEl.setAttribute('role', 'img');

    const maxMoves = Math.max(result.moves, result.shortest, 1);
    $('results-compare').innerHTML = `
      <div class="bar-row"><span class="bar-label">${Board.iconMarkup('route')} Your route</span>
        <span class="bar-track"><span class="bar-fill bar-player" style="width:${(result.moves / maxMoves) * 100}%"></span></span>
        <span class="bar-num">${result.moves}</span></div>
      <div class="bar-row"><span class="bar-label">${Board.iconMarkup('bot')} Shortest route (BFS)</span>
        <span class="bar-track"><span class="bar-fill bar-bfs" style="width:${(result.shortest / maxMoves) * 100}%"></span></span>
        <span class="bar-num">${result.shortest}</span></div>`;

    const timeRow = mode.race
      ? `<div><dt>Time taken</dt><dd>${Math.floor(result.seconds / 60)}:${String(result.seconds % 60).padStart(2, '0')}</dd></div>` : '';
    const limitRow = level.moveLimit !== undefined
      ? `<div><dt>Move limit (${level.moveLimit})</dt><dd>${result.limitMet ? 'Beaten! +25' : 'Not this time'}</dd></div>` : '';
    $('results-grid').innerHTML = `
      <div><dt>Level completed</dt><dd>${level.id}. ${level.name}</dd></div>
      <div><dt>Moves taken</dt><dd>${result.moves}</dd></div>
      <div><dt>Shortest possible moves</dt><dd>${result.shortest}</dd></div>
      <div><dt>Extra moves</dt><dd>${result.extraMoves}</dd></div>
      <div><dt>Hints used</dt><dd>${result.hintsUsed}</dd></div>
      <div><dt>Gems</dt><dd>${result.gemsCollected} / ${level.gems.length}</dd></div>
      <div><dt>Stars earned</dt><dd>${result.stars} / 3</dd></div>
      ${timeRow}${limitRow}
      <div class="total"><dt>Total score</dt><dd>${result.score}</dd></div>`;

    const notes = [];
    if (analysis.shortestPathCount > 1) notes.push(`Did you know? This maze has ${analysis.shortestPathCount} different shortest paths.`);
    if (!mode.saveProgress) notes.push('Free Play results are saved in the Results table but do not change your Adventure progress.');
    $('results-note').textContent = notes.join(' ');

    const isLast = level.id >= levels.length;
    const nextBtn = $('res-next');
    nextBtn.querySelector('span').textContent = isLast ? (modeName === 'sandbox' ? 'Finish' : 'Finish the adventure') : 'Next level';
    $('res-watch').hidden = false;

    const dialog = $('results-dialog');
    if (!dialog.open) dialog.showModal();
    celebrate(dialog.querySelector('.confetti-zone'));
  }

  function closeResults() {
    const dialog = $('results-dialog');
    if (dialog.open) dialog.close();
  }

  /* ------------------------------------------------------------ helpers */

  function celebrate(zone) {
    if (!zone) return;
    zone.innerHTML = '';
    if (Board.prefersReducedMotion()) return;
    const colors = ['#3b82f6', '#8b5cf6', '#22c55e', '#facc15', '#f97316', '#ec4899'];
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
      zone.appendChild(piece);
    }
    root.setTimeout(() => { zone.innerHTML = ''; }, 3200);
  }

  function drawTrail() {
    session.board.drawPath('trail', session.state.trail, 'trail-line', false);
    // Collected gems disappear from the board; undo can bring them back.
    for (const gem of session.level.gems) {
      session.board.setCellClass(gem, 'gem-taken', session.state.collectedGems.has(Graph.cellKey(gem)));
    }
    if (session.pathShown) showShortestPath(false);
  }

  function gemSummary() {
    return `${session.state.collectedGems.size} of ${session.level.gems.length} gems collected.`;
  }

  function updateStats() {
    const { state, level } = session;
    $('g-moves').textContent = state.moves;
    $('g-gems').textContent = `${state.collectedGems.size} / ${level.gems.length}`;
    $('g-hints').textContent = state.hintsUsed;
    const meter = $('limit-meter');
    meter.hidden = level.moveLimit === undefined;
    if (level.moveLimit !== undefined) {
      $('limit-count').textContent = `${state.moves} / ${level.moveLimit}`;
      const fill = $('limit-fill');
      fill.style.width = Math.min(100, (state.moves / level.moveLimit) * 100) + '%';
      fill.classList.toggle('over', state.moves > level.moveLimit);
    }
    $('btn-undo').disabled = session.phase !== 'play' || state.history.length === 0;
  }

  function setControlsEnabled(enabled) {
    document.querySelectorAll('[data-move], #btn-hint, #btn-showpath').forEach(btn => { btn.disabled = !enabled; });
    $('btn-undo').disabled = !enabled || session.state.history.length === 0;
  }

  function setMessage(text) { $('game-message').textContent = text; }

  function startTimer() {
    session.startedAt = Date.now();
    const token = session.token;
    session.timerId = root.setInterval(() => {
      if (token !== sessionToken) return;
      session.elapsedMs = Date.now() - session.startedAt;
      const seconds = Math.floor(session.elapsedMs / 1000);
      $('g-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }, 500);
  }

  function stopTimer() {
    if (session && session.timerId) {
      root.clearInterval(session.timerId);
      session.timerId = null;
      if (session.startedAt !== null) session.elapsedMs = Date.now() - session.startedAt;
    }
  }

  /** Swipe on the maze to move (touch screens). */
  function attachSwipe(element) {
    let startX = 0, startY = 0, tracking = false;
    element.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    element.addEventListener('touchend', event => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // a tap, not a swipe
      if (Math.abs(dx) > Math.abs(dy)) requestMove(dx > 0 ? 'right' : 'left');
      else requestMove(dy > 0 ? 'down' : 'up');
    }, { passive: true });
  }

  /** Returns true when the key was used by the game. */
  function handleKey(event) {
    const direction = KEY_TO_DIRECTION[event.key];
    if (!direction || !session) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    requestMove(direction);
    return true;
  }

  // Exposed for automated tests and debugging.
  function debugState() {
    if (!session) return null;
    const { state, phase, analysis } = session;
    return {
      levelId: session.level.id, mode: session.modeName, phase,
      position: { ...state.position }, moves: state.moves, hintsUsed: state.hintsUsed,
      gems: state.collectedGems.size, shortest: analysis.shortestDistance,
      animating: session.animating
    };
  }

  root.MazeGame = { MODES, init, start, leave, handleKey, debugState };
})(window);
