/*
 * detective.js — "Be a Math Detective": five experiments that share one
 * editable lab maze, plus the observation notebook.
 *
 * The lab maze can change at any moment (walls built or removed, a new
 * random maze), so every BFS result is tied to a `version` number. Any edit
 * bumps the version, which throws away cached results and redraws, so a
 * stale "shortest path" can never be shown for a maze that has changed.
 */
(function (root) {
  'use strict';

  const Graph = root.MazeGraph;
  const Board = root.MazeBoard;
  const Storage = root.MazeStorage;
  const Data = root.MazeData;
  const Learn = root.MazeLearn;
  const $ = id => document.getElementById(id);

  const EXPERIMENTS = [
    {
      id: 1, short: 'My path vs BFS',
      question: 'Did you find the shortest path?',
      instructions: 'Choose "Tap to draw my route", then tap squares one by one from Robo to the treasure. When you arrive, compare your route with the BFS shortest path. (Tap the last square again to take a step back.)',
      grid: ['S...#...', '.##.#.#.', '.#..#.#.', '.#.##.#.', '...#..#.', '.#...#..', '...#...D'],
      tool: 'route'
    },
    {
      id: 2, short: 'Dead ends',
      question: 'What happens if the robot follows the wrong corridor?',
      instructions: 'The corridor along the top and down the right side looks tempting. Press "Follow the wrong corridor" to watch Robo try it, then count the cost.',
      grid: ['S........', '.#######.', '.#.....#.', '.#.###.#.', '...#D..#.'],
      deadEnd: { row: 4, col: 8 },
      tool: 'walls'
    },
    {
      id: 3, short: 'Block a square',
      question: 'Can the robot still reach the treasure?',
      instructions: 'Predict first! Then tap an open square to turn it into a wall. Watch whether the treasure is still reachable, and how the shortest path changes. Try different squares: the answer depends on which one you block!',
      grid: ['S.....', '.####.', '......', '###.##', '......', '.####.', '.....D'],
      tool: 'walls'
    },
    {
      id: 4, short: 'Equal routes',
      question: 'Can there be more than one shortest path?',
      instructions: 'Show a BFS shortest path, then press "Show another shortest path". How many different shortest paths can you find? Try adding or removing walls to change the number.',
      grid: ['S....', '.###.', '.###.', '....D'],
      tool: 'walls'
    },
    {
      id: 5, short: 'Bigger mazes',
      question: 'Does the shortest path always become longer when the maze becomes bigger?',
      instructions: 'Make random mazes of different sizes. Robo and the treasure are placed at random. Each maze is added to the table below so you can look for a pattern (or a surprise!).',
      grid: ['S....', '.#.#.', '.....', '.#.#.', '....D'],
      tool: 'walls',
      sizes: [5, 8, 11, 14]
    }
  ];

  let app = null;
  const lab = {
    experiment: null,
    maze: null, start: null, destination: null,
    board: null, robot: null,
    tool: 'walls',
    route: [],
    showPath: false,
    pathIndex: 0,
    version: 0,
    cache: null,           // { version, analysis, allShortest }
    animationTimer: null,
    sizeLog: [],
    randomSnapshot: null,  // the random maze as generated, so "Reset" can restore it
    routeRecordedVersion: -1
  };

  /* ------------------------------------------------------------ analysis */

  function analysis() {
    if (!lab.cache || lab.cache.version !== lab.version) {
      lab.cache = {
        version: lab.version,
        analysis: Graph.analyzeMaze(lab.maze, lab.start, lab.destination),
        allShortest: null
      };
    }
    return lab.cache.analysis;
  }

  /** Lists up to `limit` different shortest paths by walking the BFS layers backwards. */
  function allShortestPaths(limit) {
    if (lab.cache && lab.cache.version === lab.version && lab.cache.allShortest) return lab.cache.allShortest;
    const { distance } = Graph.breadthFirstSearch(lab.maze, lab.start, null);
    const paths = [];
    const goal = lab.destination;
    if (distance[goal.row][goal.col] === -1) return paths;
    const walk = (cell, suffix) => {
      if (paths.length >= limit) return;
      if (distance[cell.row][cell.col] === 0) { paths.push([cell, ...suffix]); return; }
      for (const nb of Graph.getNeighbors(lab.maze, cell)) {
        if (distance[nb.row][nb.col] === distance[cell.row][cell.col] - 1) walk(nb, [cell, ...suffix]);
      }
    };
    walk(goal, []);
    analysis(); // make sure the cache belongs to this version
    lab.cache.allShortest = paths;
    return paths;
  }

  /** Called after ANY change to the maze: invalidate, repair the route, redraw. */
  function mazeChanged() {
    lab.version += 1;
    lab.cache = null;
    lab.pathIndex = 0;
    // Cut the drawn route at the first square that is no longer open.
    const firstBlocked = lab.route.findIndex(c => !Graph.isOpen(lab.maze, c.row, c.col));
    if (firstBlocked !== -1) lab.route = lab.route.slice(0, firstBlocked);
    if (lab.route.length === 0) lab.route = [{ ...lab.start }];
    render();
  }

  /* ------------------------------------------------------------- render */

  function render() {
    const a = analysis();
    lab.board.refresh(lab);
    $('lab-open').textContent = a.openCells;
    $('lab-reach').textContent = a.reachableCells;
    $('lab-reachable').innerHTML = a.reachable
      ? `<span class="yes">${Board.iconMarkup('check')} Yes</span>`
      : `<span class="no">${Board.iconMarkup('x')} No</span>`;
    $('lab-shortest').textContent = a.reachable ? a.shortestDistance : 'No path';
    $('lab-count').textContent = a.reachable ? a.shortestPathCount : '0';
    $('lab-route').textContent = lab.route.length - 1;

    // Squares Robo cannot reach get a dotted pattern (not only a colour).
    const dist = Graph.breadthFirstSearch(lab.maze, lab.start, null).distance;
    lab.board.clearCellClass('unreachable');
    for (let r = 0; r < lab.maze.length; r++) {
      for (let c = 0; c < lab.maze[r].length; c++) {
        if (Graph.isOpen(lab.maze, r, c) && dist[r][c] === -1) lab.board.setCellClass({ row: r, col: c }, 'unreachable', true);
      }
    }

    lab.board.drawPath('route', lab.route, 'trail-line route-draw', false);
    if (lab.showPath && a.reachable) {
      const paths = allShortestPaths(500);
      lab.board.drawPath('bfs', paths[lab.pathIndex % paths.length] || a.shortestPath, 'bfs-line', false);
    } else {
      lab.board.clearLayer('bfs');
    }
    const btn = $('lab-show-path');
    btn.setAttribute('aria-pressed', String(lab.showPath));
    btn.querySelector('span').textContent = lab.showPath ? 'Hide the shortest path' : 'Show a BFS shortest path';
    $('lab-next-path').disabled = !a.reachable || a.shortestPathCount < 2;
    lab.robot.moveTo(lab.start, true);
  }

  /* ---------------------------------------------------------- loading */

  function loadExperiment(id) {
    stopAnimation();
    const exp = EXPERIMENTS.find(e => e.id === id);
    lab.experiment = exp;
    lab.randomSnapshot = null;
    document.querySelectorAll('[data-exp]').forEach(btn => btn.setAttribute('aria-pressed', String(Number(btn.dataset.exp) === id)));
    $('lab-question').innerHTML = `<span class="exp-number">Experiment ${exp.id}</span> ${exp.question}`;
    $('lab-instructions').textContent = exp.instructions;
    loadGrid(exp.grid);
    setTool(exp.tool);
    lab.showPath = false;
    setMessage('');
    renderExtra();
    render();
  }

  function loadGrid(rows) {
    const parsed = Learn.mazeFromRows(rows);
    lab.maze = parsed.maze;
    lab.start = parsed.start;
    lab.destination = parsed.destination;
    lab.route = [{ ...lab.start }];
    lab.version += 1;
    lab.cache = null;
    lab.pathIndex = 0;
    lab.board = Board.createBoard($('lab-board'), lab, { label: 'Detective lab maze. Tap squares to change it.' });
    lab.robot = lab.board.addSprite('robot', 'assets/robot.svg', 'Robo');
    lab.board.onCellClick(handleCellClick);
  }

  function loadRandom(size) {
    const random = Math.random;
    let attempt;
    for (let i = 0; i < 200; i++) {
      attempt = Learn.randomMaze(size, size, 0.28, random);
      if (Graph.findShortestPath(attempt.maze, attempt.start, attempt.destination).reachable) break;
    }
    lab.randomSnapshot = { size, maze: attempt.maze.map(row => row.slice()), start: attempt.start, destination: attempt.destination };
    showRandomMaze(lab.randomSnapshot);
    const a = analysis();
    lab.sizeLog.push({ size, openCells: a.openCells, shortest: a.shortestDistance });
    renderExtra();
    setMessage(`New ${size}×${size} maze: the shortest path is ${a.shortestDistance} moves.`);
  }

  function showRandomMaze(snapshot) {
    stopAnimation();
    lab.maze = snapshot.maze.map(row => row.slice());
    lab.start = { ...snapshot.start };
    lab.destination = { ...snapshot.destination };
    lab.route = [{ ...lab.start }];
    lab.showPath = false;
    lab.board = Board.createBoard($('lab-board'), lab, { label: `Random ${snapshot.size} by ${snapshot.size} maze` });
    lab.robot = lab.board.addSprite('robot', 'assets/robot.svg', 'Robo');
    lab.board.onCellClick(handleCellClick);
    setTool(lab.tool);
    mazeChanged();
  }

  /* -------------------------------------------------------- interaction */

  function handleCellClick(cell) {
    if (lab.animationTimer) return;
    if (lab.tool === 'walls') toggleWall(cell);
    else extendRoute(cell);
  }

  function toggleWall(cell) {
    const isEnd = Graph.isOpen(lab.maze, cell.row, cell.col) &&
      ((cell.row === lab.start.row && cell.col === lab.start.col) || (cell.row === lab.destination.row && cell.col === lab.destination.col));
    if (isEnd) { setMessage('Robo and the treasure must stay on open squares.'); return; }
    const before = analysis();
    const wasWall = lab.maze[cell.row][cell.col] === Graph.WALL;
    lab.maze[cell.row][cell.col] = wasWall ? '.' : Graph.WALL;
    mazeChanged();
    const after = analysis();
    let text = wasWall ? 'Wall removed. ' : 'Wall built. ';
    if (before.reachable && !after.reachable) text += 'Oh! Now Robo cannot reach the treasure: there is no path at all.';
    else if (!before.reachable && after.reachable) text += `The treasure is reachable again! Shortest path: ${after.shortestDistance} moves.`;
    else if (after.reachable && after.shortestDistance !== before.shortestDistance) text += `The shortest path changed from ${before.shortestDistance} to ${after.shortestDistance} moves.`;
    else if (after.reachable) text += `Still reachable, and the shortest path is still ${after.shortestDistance} moves.`;
    else text += 'The treasure is still unreachable.';
    setMessage(text);
  }

  function extendRoute(cell) {
    const last = lab.route[lab.route.length - 1];
    const atGoal = last.row === lab.destination.row && last.col === lab.destination.col;
    if (cell.row === last.row && cell.col === last.col && lab.route.length > 1) {
      lab.route.pop();
      render();
      setMessage('Stepped back one square.');
      return;
    }
    if (atGoal) { setMessage('Your route already reached the treasure! Clear it to draw a new one.'); return; }
    if (!Graph.isOpen(lab.maze, cell.row, cell.col)) { setMessage('That is a wall. Routes can only use open squares.'); return; }
    if (Math.abs(cell.row - last.row) + Math.abs(cell.col - last.col) !== 1) {
      setMessage('Tap a square right next to the end of your route (up, down, left or right).');
      return;
    }
    lab.route.push({ ...cell });
    render();
    if (cell.row === lab.destination.row && cell.col === lab.destination.col) routeFinished();
    else setMessage(`Your route: ${lab.route.length - 1} moves so far.`);
  }

  function routeFinished() {
    const a = analysis();
    const moves = lab.route.length - 1;
    const extra = moves - a.shortestDistance;
    setMessage(extra === 0
      ? `You reached the treasure in ${moves} moves. That IS a shortest path. BFS also needs ${a.shortestDistance}!`
      : `You reached the treasure in ${moves} moves. BFS found a path with ${a.shortestDistance}, so you took ${extra} extra moves. Press "Show a BFS shortest path" to compare!`);
    if (lab.routeRecordedVersion === lab.version) return; // one row per maze version
    lab.routeRecordedVersion = lab.version;
    app.recordResult({
      mazeId: `LAB-E${lab.experiment.id}`, mazeName: `Detective lab: ${lab.experiment.short}`, mode: 'lab',
      rows: lab.maze.length, cols: lab.maze[0].length,
      openCells: a.openCells, reachableCells: a.reachableCells,
      shortestPath: a.shortestDistance, playerPath: moves, extraMoves: Math.max(0, extra),
      hintsUsed: 0, undos: 0, seconds: 0, foundShortest: extra === 0, solutionShown: lab.showPath
    });
  }

  /** Experiment 2: animate Robo into the dead end, back out, then along a shortest path. */
  function followWrongCorridor() {
    const exp = lab.experiment;
    if (!exp.deadEnd || lab.animationTimer) return;
    const toDeadEnd = Graph.findShortestPath(lab.maze, lab.start, exp.deadEnd);
    const toGoal = Graph.findShortestPath(lab.maze, lab.start, lab.destination);
    if (!toDeadEnd.reachable || !toGoal.reachable) {
      setMessage('The maze has changed too much for this demo. Press "Reset this maze" to try again.');
      return;
    }
    const back = toDeadEnd.path.slice(0, -1).reverse();
    const route = [...toDeadEnd.path, ...back, ...toGoal.path.slice(1)];
    const wasted = (toDeadEnd.path.length - 1) * 2;
    const total = route.length - 1;
    lab.route = [route[0]];
    let i = 0;
    const step = () => {
      i += 1;
      if (i >= route.length) {
        stopAnimation();
        setMessage(`Robo walked ${toDeadEnd.distance} moves into the dead end and ${toDeadEnd.distance} moves back: ${wasted} wasted moves! Total: ${total} moves, but the shortest path is only ${toGoal.distance}.`);
        return;
      }
      lab.route.push(route[i]);
      lab.board.drawPath('route', lab.route, 'trail-line route-draw', false);
      lab.robot.moveTo(route[i], false, Graph.directionBetween(route[i - 1], route[i]));
      $('lab-route').textContent = lab.route.length - 1;
      if (i === toDeadEnd.path.length - 1) setMessage('Uh oh, a dead end! Robo has to turn around…');
    };
    setMessage('Robo follows the long corridor…');
    if (Board.prefersReducedMotion()) {
      while (i < route.length) step();
      return;
    }
    lab.animationTimer = root.setInterval(step, 160);
  }

  function stopAnimation() {
    if (lab.animationTimer) root.clearInterval(lab.animationTimer);
    lab.animationTimer = null;
  }

  function setTool(tool) {
    lab.tool = tool;
    document.querySelectorAll('[data-lab-tool]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.labTool === tool)));
    lab.board.element.classList.toggle('tool-route', tool === 'route');
  }

  function setMessage(text) { $('lab-message').textContent = text; }

  /** Extra controls that belong to a particular experiment. */
  function renderExtra() {
    const exp = lab.experiment;
    const extra = $('lab-extra');
    if (exp.deadEnd) {
      extra.innerHTML = `<button type="button" class="btn btn-gold btn-small" id="lab-wrong">${Board.iconMarkup('route')} Follow the wrong corridor</button>`;
      $('lab-wrong').addEventListener('click', followWrongCorridor);
    } else if (exp.sizes) {
      const rows = lab.sizeLog.map((entry, i) =>
        `<tr><td>${i + 1}</td><td>${entry.size}×${entry.size}</td><td>${entry.openCells}</td><td>${entry.shortest}</td></tr>`).join('');
      extra.innerHTML = `
        <p class="field-label">Make a random maze:</p>
        <div class="size-buttons">${exp.sizes.map(s => `<button type="button" class="btn btn-small btn-ghost" data-size="${s}">${Board.iconMarkup('shuffle')} ${s}×${s}</button>`).join('')}</div>
        <div class="table-scroll"><table class="mini-table">
          <thead><tr><th scope="col">#</th><th scope="col">Size</th><th scope="col">Open squares</th><th scope="col">Shortest path</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">No mazes yet. Try a few sizes!</td></tr>'}</tbody>
        </table></div>`;
      extra.querySelectorAll('[data-size]').forEach(btn => btn.addEventListener('click', () => loadRandom(Number(btn.dataset.size))));
    } else if (exp.id === 1) {
      extra.innerHTML = `<p class="small-print">Want a bigger test? Play any level in Free Play. The results table compares your route with BFS every time.</p>
        <button type="button" class="btn btn-small btn-success" id="lab-goto-play">${Board.iconMarkup('play')} Play in Free Play</button>`;
      $('lab-goto-play').addEventListener('click', () => app.openLevels('sandbox'));
    } else {
      extra.innerHTML = '';
    }
  }

  /* ------------------------------------------------------- observations */

  function initObservations() {
    const saved = Storage.loadObservations();
    const body = $('observation-body');
    body.innerHTML = EXPERIMENTS.map(exp => {
      const note = saved['exp' + exp.id] || { prediction: '', happened: '', learned: '' };
      const field = (name, label) =>
        `<td><label class="sr-only" for="obs-${exp.id}-${name}">${label} for experiment ${exp.id}</label>
         <textarea id="obs-${exp.id}-${name}" data-obs="${exp.id}" data-field="${name}" rows="2" maxlength="500">${Data.escapeHTML(note[name])}</textarea></td>`;
      return `<tr><th scope="row"><span class="exp-number">${exp.id}</span> ${exp.question}</th>
        ${field('prediction', 'My prediction')}${field('happened', 'What happened')}${field('learned', 'What I learned')}</tr>`;
    }).join('');

    let saveTimer = null;
    body.addEventListener('input', () => {
      $('obs-save-status').textContent = 'Saving…';
      root.clearTimeout(saveTimer);
      saveTimer = root.setTimeout(() => {
        Storage.saveObservations(collectObservations());
        $('obs-save-status').textContent = Storage.isPersistent ? 'Saved on this device.' : 'Saved until you close this page (storage unavailable).';
      }, 400);
    });

    $('export-observations').addEventListener('click', () => {
      const notes = collectObservations();
      const rows = EXPERIMENTS.map(exp => {
        const n = notes['exp' + exp.id];
        return [exp.id, exp.question, n.prediction, n.happened, n.learned];
      });
      const player = app.settings.playerName;
      Data.downloadText(`robot-maze-notebook${player ? '-' + player.replace(/[^\w-]+/g, '_') : ''}.csv`,
        Data.toCSV(['experiment', 'question', 'prediction', 'what_happened', 'what_i_learned'], rows));
      app.toast('Notebook downloaded as CSV.');
    });
  }

  function collectObservations() {
    const notes = {};
    EXPERIMENTS.forEach(exp => { notes['exp' + exp.id] = { prediction: '', happened: '', learned: '' }; });
    document.querySelectorAll('[data-obs]').forEach(area => {
      notes['exp' + area.dataset.obs][area.dataset.field] = area.value;
    });
    return notes;
  }

  /* --------------------------------------------------------------- init */

  function init(appCallbacks) {
    app = appCallbacks;
    $('exp-tabs').innerHTML = EXPERIMENTS.map(exp =>
      `<button type="button" class="exp-tab" data-exp="${exp.id}" aria-pressed="false"><span class="exp-number">${exp.id}</span> ${exp.short}</button>`).join('');
    document.querySelectorAll('[data-exp]').forEach(btn => btn.addEventListener('click', () => loadExperiment(Number(btn.dataset.exp))));
    document.querySelectorAll('[data-lab-tool]').forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.labTool)));

    $('lab-show-path').addEventListener('click', () => { lab.showPath = !lab.showPath; render(); });
    $('lab-next-path').addEventListener('click', () => {
      const paths = allShortestPaths(500);
      lab.showPath = true;
      lab.pathIndex = (lab.pathIndex + 1) % paths.length;
      render();
      const a = analysis();
      setMessage(`Showing shortest path ${lab.pathIndex + 1} of ${paths.length >= 500 ? '500+' : a.shortestPathCount}. Every one has ${a.shortestDistance} moves!`);
    });
    $('lab-clear-route').addEventListener('click', () => {
      stopAnimation();
      lab.route = [{ ...lab.start }];
      render();
      setMessage('Route cleared.');
    });
    $('lab-reset').addEventListener('click', () => {
      if (lab.randomSnapshot) { showRandomMaze(lab.randomSnapshot); setMessage('Maze reset.'); }
      else loadExperiment(lab.experiment.id);
    });

    initObservations();
    loadExperiment(1);
  }

  root.MazeDetective = { init, onLeave: stopAnimation, EXPERIMENTS };
})(window);
