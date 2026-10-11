/*
 * learn.js — the interactive lessons in "The Secret Mathematics of Mazes".
 * Every demo is drawn with board.js and computed with bfs.js, so the
 * pictures always follow the same movement rules as the real game.
 */
(function (root) {
  'use strict';

  const Graph = root.MazeGraph;
  const Board = root.MazeBoard;
  const Levels = root.MazeLevels;
  const $ = id => document.getElementById(id);

  /** Builds { maze, start, destination } from rows of S/D/./# characters. */
  function mazeFromRows(rows) {
    return Levels.parseLevel({ grid: rows });
  }

  /** Turns a string of moves like "RRDD" into a list of cells. */
  function routeFromMoves(start, moves) {
    const step = { U: 'up', D: 'down', L: 'left', R: 'right' };
    const cells = [{ ...start }];
    for (const letter of moves) {
      const dir = Graph.DIRECTION_BY_NAME[step[letter]];
      const last = cells[cells.length - 1];
      cells.push({ row: last.row + dir.dRow, col: last.col + dir.dCol });
    }
    return cells;
  }

  const cellName = cell => `row ${cell.row + 1}, column ${cell.col + 1}`;
  const chip = cell => `(${cell.row + 1},${cell.col + 1})`;

  function setPressed(selector, activeEl) {
    document.querySelectorAll(selector).forEach(btn => btn.setAttribute('aria-pressed', String(btn === activeEl)));
  }

  /* ============ A. Graph view ============ */
  function initGraphLesson() {
    const level = mazeFromRows(['S..#', '##.#', '...#', '.#.D']);
    const board = Board.createBoard($('graph-demo'), level, { label: 'A small 4 by 4 maze with walls' });
    board.drawGraph('graph');
    const vertices = level.maze.flat().filter(t => t !== Graph.WALL).length;
    const edges = Graph.listEdges(level.maze).length;
    $('graph-counts').innerHTML = `This maze has <strong>${vertices} vertices</strong> (open squares) and <strong>${edges} edges</strong> (connections).`;

    const setView = view => {
      board.element.classList.remove('view-maze', 'view-graph', 'view-both');
      board.element.classList.add('view-' + view);
      board.element.setAttribute('aria-label', view === 'maze'
        ? 'Maze view: a 4 by 4 maze with walls'
        : `Graph view: ${vertices} dots for the open squares joined by ${edges} lines`);
    };
    document.querySelectorAll('[data-graph-view]').forEach(btn => btn.addEventListener('click', () => {
      setPressed('[data-graph-view]', btn);
      setView(btn.dataset.graphView);
    }));
    setView('maze');
  }

  /* ============ B. Valid and invalid paths ============ */
  function initPathsLesson() {
    const level = mazeFromRows(['S..#', '##.#', '...#', '.#.D']);
    const board = Board.createBoard($('paths-demo'), level, { label: 'A maze with an example path drawn on it' });
    const examples = {
      1: Graph.findShortestPath(level.maze, level.start, level.destination).path,
      2: routeFromMoves(level.start, 'RDDRDR') // cuts straight through a wall
    };
    let current = 1;

    const show = id => {
      current = id;
      board.clearCellClass('bad-step', 'good-step');
      board.clearLabels();
      board.drawPath('example', examples[id], 'example-line', true);
      examples[id].forEach((cell, i) => { if (i > 0) board.setLabel(cell, i); });
      $('paths-feedback').textContent = '';
    };

    document.querySelectorAll('[data-path-example]').forEach(btn => btn.addEventListener('click', () => {
      setPressed('[data-path-example]', btn);
      show(Number(btn.dataset.pathExample));
    }));

    document.querySelectorAll('[data-path-answer]').forEach(btn => btn.addEventListener('click', () => {
      const path = examples[current];
      const valid = Graph.isValidPath(level.maze, path);
      const saysValid = btn.dataset.pathAnswer === 'yes';
      const verdict = saysValid === valid ? 'Correct! ' : 'Good thinking, but look again! ';
      if (valid) {
        path.forEach(cell => board.setCellClass(cell, 'good-step', true));
        $('paths-feedback').textContent = `${verdict}Path ${current} is allowed: every step moves to a neighbouring open square. It uses ${path.length - 1} moves.`;
      } else {
        const badIndex = path.findIndex((cell, i) => i > 0 && !Graph.isValidPath(level.maze, path.slice(0, i + 1)));
        const bad = path[badIndex];
        board.setCellClass(bad, 'bad-step', true);
        $('paths-feedback').textContent = `${verdict}Path ${current} is NOT allowed: step ${badIndex} goes into a wall at ${cellName(bad)}. Walls are not vertices, so there is no edge to travel along.`;
      }
    }));
    show(1);
  }

  /* ============ C. Predict the shortest path ============ */
  function initShortestLesson() {
    const level = mazeFromRows(['S.....', '.####.', '.####.', '.####D', '......']);
    const board = Board.createBoard($('shortest-demo'), level, { label: 'A maze with two routes, A and B, from Robo to the treasure' });
    const routeA = routeFromMoves(level.start, 'DDDDRRRRRU');
    const routeB = routeFromMoves(level.start, 'RRRRRDDD');
    const lenA = routeA.length - 1;
    const lenB = routeB.length - 1;
    const bfs = Graph.findShortestPath(level.maze, level.start, level.destination);

    const draw = () => {
      board.clearLabels();
      board.drawPath('routeA', routeA, 'route-a-line', false);
      board.drawPath('routeB', routeB, 'route-b-line', false);
      $('shortest-feedback').textContent = '';
      $('shortest-reset').hidden = true;
      document.querySelectorAll('[data-predict]').forEach(b => { b.disabled = false; });
    };

    document.querySelectorAll('[data-predict]').forEach(btn => btn.addEventListener('click', () => {
      const shorter = lenA < lenB ? 'A' : 'B';
      routeA.forEach((cell, i) => { if (i > 0 && i < routeA.length - 1) board.setLabel(cell, i); });
      routeB.forEach((cell, i) => { if (i > 0 && i < routeB.length - 1) board.setLabel(cell, i); });
      board.drawPath('routeA', routeA, 'route-a-line', true);
      board.drawPath('routeB', routeB, 'route-b-line', true);
      const right = btn.dataset.predict === shorter;
      $('shortest-feedback').innerHTML =
        `${right ? 'Great prediction!' : 'Good guess, and now we have counted!'} Route A uses <strong>${lenA}</strong> moves and Route B uses <strong>${lenB}</strong> moves, ` +
        `so Route ${shorter} is shorter by ${Math.abs(lenA - lenB)}. BFS agrees: the shortest path has <strong>${bfs.distance}</strong> moves.`;
      $('shortest-reset').hidden = false;
      document.querySelectorAll('[data-predict]').forEach(b => { b.disabled = true; });
    }));
    $('shortest-reset').addEventListener('click', draw);
    draw();
  }

  /* ============ D. Step-by-step BFS ============ */
  function initBfsLesson() {
    const level = mazeFromRows(['S..#..', '.#.#.#', '.#....', '.##.#.', '....#D']);
    const board = Board.createBoard($('bfs-demo'), level, { label: 'Breadth-first search running on a small maze' });
    const steps = Graph.bfsSteps(level.maze, level.start, level.destination);
    let index = 0;
    let timer = null;

    function render() {
      const snap = steps[index];
      board.clearCellClass('v-visited', 'v-frontier', 'v-current', 'v-path', 'v-new');
      board.clearLabels();
      board.clearLayer('path');
      const frontierKeys = new Set(snap.frontier.map(Graph.cellKey));
      let explored = 0;
      for (let r = 0; r < snap.distance.length; r++) {
        for (let c = 0; c < snap.distance[r].length; c++) {
          const d = snap.distance[r][c];
          if (d < 0) continue;
          const cell = { row: r, col: c };
          board.setLabel(cell, d);
          if (frontierKeys.has(Graph.cellKey(cell))) board.setCellClass(cell, 'v-frontier', true);
          else { board.setCellClass(cell, 'v-visited', true); explored += 1; }
        }
      }
      snap.discovered.forEach(cell => board.setCellClass(cell, 'v-new', true));
      if (snap.current) board.setCellClass(snap.current, 'v-current', true);
      if (snap.found) {
        snap.path.forEach(cell => board.setCellClass(cell, 'v-path', true));
        board.drawPath('path', snap.path, 'bfs-line', true);
      }

      let text;
      if (index === 0) text = 'Robo starts here. The start square joins the queue with distance 0 and is marked as visited.';
      else if (snap.found) text = `The treasure came out of the queue at distance ${snap.current && snap.distance[snap.current.row][snap.current.col]}! Following each square's parent back to the start gives a shortest path of ${snap.path.length - 1} moves.`;
      else if (snap.unreachable) text = 'The queue is empty and the treasure was never reached, so it is unreachable.';
      else {
        const d = snap.distance[snap.current.row][snap.current.col];
        text = `Take ${cellName(snap.current)} from the front of the queue (distance ${d}). ` +
          (snap.discovered.length
            ? `It has ${snap.discovered.length} new neighbour${snap.discovered.length > 1 ? 's' : ''}. They get distance ${d + 1} and join the back of the queue.`
            : 'No new neighbours: only walls or squares that were already visited.');
      }
      $('bfs-explain').textContent = `Step ${index} of ${steps.length - 1}: ${text}`;
      $('bfs-current').textContent = snap.current ? chip(snap.current) : '–';
      $('bfs-visited').textContent = explored;
      $('bfs-frontier').innerHTML = snap.frontier.length
        ? snap.frontier.map(c => `<span class="qchip">${chip(c)}</span>`).join('')
        : '(empty)';
      $('bfs-path').textContent = snap.found ? `${snap.path.length - 1} moves` : 'Not yet';
      $('bfs-step').disabled = index >= steps.length - 1;
    }

    function stopPlaying() {
      if (timer) root.clearInterval(timer);
      timer = null;
      const btn = $('bfs-play');
      btn.setAttribute('aria-pressed', 'false');
      btn.querySelector('span').textContent = 'Play';
      btn.querySelector('use').setAttribute('href', '#i-play');
    }

    $('bfs-step').addEventListener('click', () => {
      stopPlaying();
      if (index < steps.length - 1) { index += 1; render(); }
    });
    $('bfs-reset').addEventListener('click', () => { stopPlaying(); index = 0; render(); });
    $('bfs-play').addEventListener('click', () => {
      if (timer) { stopPlaying(); return; }
      if (index >= steps.length - 1) index = 0;
      const btn = $('bfs-play');
      btn.setAttribute('aria-pressed', 'true');
      btn.querySelector('span').textContent = 'Pause';
      btn.querySelector('use').setAttribute('href', '#i-pause');
      timer = root.setInterval(() => {
        if (index >= steps.length - 1) { stopPlaying(); return; }
        index += 1;
        render();
      }, 700);
    });
    render();
    return { stop: stopPlaying };
  }

  /* ============ E. Ripples / layers ============ */
  function initRippleLesson() {
    const level = mazeFromRows(['...#...', '.#...#.', '.#.#.#.', '...S...', '.#.#.#.', '.#...#.', '...#..D']);
    const board = Board.createBoard($('ripple-demo'), level, { label: 'A maze coloured by how many moves each square is from Robo' });
    const { distance } = Graph.breadthFirstSearch(level.maze, level.start, null);
    const goalDistance = distance[level.destination.row][level.destination.col];
    const maxDistance = Math.max(...distance.flat());
    const range = $('ripple-range');
    range.max = maxDistance;

    function render(d) {
      range.value = d;
      $('ripple-value').textContent = d;
      board.clearCellClass('ripple-now', 'ripple-done');
      board.clearLabels();
      let layerSize = 0;
      for (let r = 0; r < distance.length; r++) {
        for (let c = 0; c < distance[r].length; c++) {
          const dist = distance[r][c];
          if (dist < 0 || dist > d) continue;
          const cell = { row: r, col: c };
          board.setLabel(cell, dist);
          board.setCellClass(cell, dist === d ? 'ripple-now' : 'ripple-done', true);
          if (dist === d) layerSize += 1;
        }
      }
      let text = `Ripple ${d} has ${layerSize} square${layerSize === 1 ? '' : 's'}: every one of them is exactly ${d} move${d === 1 ? '' : 's'} from Robo.`;
      if (d === goalDistance) text += ` The treasure is in this ripple, and it was NOT in ripples 0 to ${d - 1}. So the shortest path is exactly ${d} moves!`;
      else if (d > goalDistance) text += ` (The treasure was already reached in ripple ${goalDistance}.)`;
      else text += ' No treasure yet. Keep spreading!';
      $('ripple-explain').textContent = text;
    }

    range.addEventListener('input', () => render(Number(range.value)));
    $('ripple-prev').addEventListener('click', () => render(Math.max(0, Number(range.value) - 1)));
    $('ripple-next').addEventListener('click', () => render(Math.min(maxDistance, Number(range.value) + 1)));
    render(0);
  }

  /* ============ F. Unequal costs ============ */
  function initCostLesson() {
    const mud = { moves: 2, seconds: 5 + 5 };
    const road = { moves: 4, seconds: 1 + 1 + 1 + 1 };
    const render = mode => {
      const mudEl = $('route-mud');
      const roadEl = $('route-road');
      if (mode === 'moves') {
        $('cost-caption').textContent = `Mud route: ${mud.moves} moves · Road route: ${road.moves} moves`;
        $('cost-feedback').innerHTML = `Counting <strong>moves</strong>, the mud route wins (${mud.moves} &lt; ${road.moves}). This is the route BFS would choose.`;
        mudEl.classList.add('winner'); roadEl.classList.remove('winner');
      } else {
        $('cost-caption').textContent = `Mud route: ${mud.seconds} seconds · Road route: ${road.seconds} seconds`;
        $('cost-feedback').innerHTML = `Counting <strong>seconds</strong>, the road route wins (${road.seconds} &lt; ${mud.seconds})! The path with the fewest moves is not always the quickest when moves cost different amounts, so plain BFS is not enough here.`;
        roadEl.classList.add('winner'); mudEl.classList.remove('winner');
      }
    };
    document.querySelectorAll('[data-cost-mode]').forEach(btn => btn.addEventListener('click', () => {
      setPressed('[data-cost-mode]', btn);
      render(btn.dataset.costMode);
    }));
    render('moves');
  }

  /* ============ Empirical check of the implementation ============ */

  /**
   * Independent shortest-distance computation: start with "infinity"
   * everywhere and repeatedly relax dist(v) = min(dist(v), dist(u) + 1)
   * over all edges until nothing changes. No queue, no BFS code reused.
   */
  function relaxationDistance(maze, start, destination) {
    const rows = maze.length, cols = maze[0].length;
    const open = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && maze[r][c] !== '#';
    const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
    if (!open(start.row, start.col)) return Infinity;
    dist[start.row][start.col] = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!open(r, c)) continue;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (open(r + dr, c + dc) && dist[r + dr][c + dc] + 1 < dist[r][c]) {
              dist[r][c] = dist[r + dr][c + dc] + 1;
              changed = true;
            }
          }
        }
      }
    }
    return dist[destination.row][destination.col];
  }

  function randomMaze(rows, cols, wallChance, random) {
    const maze = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (random() < wallChance ? '#' : '.')));
    const pick = () => ({ row: Math.floor(random() * rows), col: Math.floor(random() * cols) });
    const start = pick();
    let destination = pick();
    while (destination.row === start.row && destination.col === start.col) destination = pick();
    maze[start.row][start.col] = '.';
    maze[destination.row][destination.col] = '.';
    return { maze, start, destination };
  }

  /** Compares BFS with the relaxation method; also checks that each BFS path is a real path. */
  function runImplementationCheck(levels, randomCount, random) {
    let checked = 0, agreed = 0, unreachableCases = 0;
    const failures = [];
    const testOne = (maze, start, destination, label) => {
      checked += 1;
      const bfs = Graph.findShortestPath(maze, start, destination);
      const expected = relaxationDistance(maze, start, destination);
      let ok = bfs.distance === expected;
      if (bfs.reachable) {
        const p = bfs.path;
        ok = ok && Graph.isValidPath(maze, p) && p.length - 1 === bfs.distance &&
          p[0].row === start.row && p[0].col === start.col &&
          p[p.length - 1].row === destination.row && p[p.length - 1].col === destination.col;
      } else {
        unreachableCases += 1;
      }
      if (ok) agreed += 1; else failures.push(label);
    };
    levels.forEach(l => testOne(l.maze, l.start, l.destination, `Level ${l.id}`));
    for (let i = 0; i < randomCount; i++) {
      const rows = 3 + Math.floor(random() * 10);
      const cols = 3 + Math.floor(random() * 10);
      const m = randomMaze(rows, cols, 0.15 + random() * 0.3, random);
      testOne(m.maze, m.start, m.destination, `Random maze ${i + 1}`);
    }
    return { checked, agreed, unreachableCases, failures };
  }

  function initProofCheck(levels) {
    $('proof-check-btn').addEventListener('click', () => {
      const result = runImplementationCheck(levels, 500, Math.random);
      $('proof-check-result').innerHTML = result.failures.length === 0
        ? `Checked <strong>${result.checked}</strong> mazes (${result.unreachableCases} of them had an unreachable treasure). BFS agreed with the relaxation method <strong>every time</strong>, and every BFS path was a real path of the right length. This is evidence that the code is correct; the proof above is what shows the claim is true for every maze.`
        : `Mismatch found in: ${result.failures.slice(0, 5).join(', ')}. The implementation needs fixing!`;
    });
  }

  let bfsController = null;

  function init(levels) {
    initGraphLesson();
    initPathsLesson();
    initShortestLesson();
    bfsController = initBfsLesson();
    initRippleLesson();
    initCostLesson();
    initProofCheck(levels);
  }

  root.MazeLearn = {
    init,
    onLeave() { if (bfsController) bfsController.stop(); },
    relaxationDistance, randomMaze, runImplementationCheck, routeFromMoves, mazeFromRows
  };
})(window);
