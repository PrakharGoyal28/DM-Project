/*
 * Unit tests for the parts of Robot Maze Challenge that have no DOM:
 * BFS (bfs.js), level data (levels.js), game rules (engine.js) and
 * saved progress (storage.js).
 *
 * Run with:  node tests/run-tests.js
 */
'use strict';

const assert = require('assert');
const path = require('path');

const Graph = require(path.join(__dirname, '../js/bfs.js'));
const Levels = require(path.join(__dirname, '../js/levels.js'));
const Engine = require(path.join(__dirname, '../js/engine.js'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
const section = title => console.log(`\n${title}`);

const maze = rows => Levels.parseLevel({ grid: rows });

/* ------------------------------------------------------------------ BFS */
section('BFS / graph');

test('Queue is FIFO and does not use Array.shift', () => {
  const q = new Graph.Queue();
  [1, 2, 3].forEach(n => q.enqueue(n));
  assert.strictEqual(q.dequeue(), 1);
  q.enqueue(4);
  assert.deepStrictEqual([q.dequeue(), q.dequeue(), q.dequeue()], [2, 3, 4]);
  assert.ok(q.isEmpty());
  assert.ok(!/shift\(/.test(Graph.Queue.toString()), 'Queue should not call shift()');
});

test('straight corridor: distance equals corridor length', () => {
  const m = maze(['S....D']);
  const r = Graph.findShortestPath(m.maze, m.start, m.destination);
  assert.strictEqual(r.reachable, true);
  assert.strictEqual(r.distance, 5);
  assert.strictEqual(r.path.length, 6);
});

test('spec example maze has shortest path 6', () => {
  const m = maze(['S..#', '##.#', '...#', '.#.D']);
  const r = Graph.findShortestPath(m.maze, m.start, m.destination);
  assert.strictEqual(r.distance, 6);
  assert.ok(Graph.isValidPath(m.maze, r.path));
});

test('returned path starts at start, ends at destination, never touches a wall', () => {
  for (const data of Levels.LEVEL_DATA) {
    const l = Levels.parseLevel(data);
    const r = Graph.findShortestPath(l.maze, l.start, l.destination);
    assert.deepStrictEqual(r.path[0], l.start);
    assert.deepStrictEqual(r.path[r.path.length - 1], l.destination);
    assert.ok(Graph.isValidPath(l.maze, r.path), `level ${l.id} path invalid`);
    r.path.forEach(c => assert.notStrictEqual(l.maze[c.row][c.col], '#'));
  }
});

test('unreachable destination is reported, not crashed on', () => {
  const m = maze(['S.#..', '..#.D', '..#..']);
  const r = Graph.findShortestPath(m.maze, m.start, m.destination);
  assert.strictEqual(r.reachable, false);
  assert.strictEqual(r.distance, Infinity);
  assert.deepStrictEqual(r.path, []);
  const a = Graph.analyzeMaze(m.maze, m.start, m.destination);
  assert.strictEqual(a.reachableCells, 6);
  assert.strictEqual(a.openCells, 12);
  assert.strictEqual(a.shortestPathCount, 0);
});

test('start equal to destination gives a 0-move path', () => {
  const m = maze(['S..', '...']);
  const r = Graph.findShortestPath(m.maze, m.start, m.start);
  assert.strictEqual(r.distance, 0);
  assert.deepStrictEqual(r.path, [m.start]);
});

test('multiple shortest paths: counted correctly and BFS returns one of them', () => {
  const m = maze(['S....', '.###.', '.###.', '....D']);
  assert.strictEqual(Graph.countShortestPaths(m.maze, m.start, m.destination), 2);
  const r = Graph.findShortestPath(m.maze, m.start, m.destination);
  assert.strictEqual(r.distance, 7);
  // open 3x3 grid: C(4,2) = 6 monotone paths corner to corner
  const open = maze(['S..', '...', '..D']);
  assert.strictEqual(Graph.countShortestPaths(open.maze, open.start, open.destination), 6);
});

test('no diagonal moves: a diagonal gap is not an edge', () => {
  const m = maze(['S#', '#D']);
  assert.strictEqual(Graph.findShortestPath(m.maze, m.start, m.destination).reachable, false);
});

test('neighbours exclude walls and out-of-grid cells', () => {
  const m = maze(['S#', '..']);
  const n = Graph.getNeighbors(m.maze, { row: 0, col: 0 });
  assert.deepStrictEqual(n, [{ row: 1, col: 0 }]);
});

test('graph edges match the neighbour rule (graph view uses same rules as BFS)', () => {
  for (const data of Levels.LEVEL_DATA) {
    const l = Levels.parseLevel(data);
    const edges = Graph.listEdges(l.maze);
    let degreeSum = 0;
    for (let r = 0; r < l.rows; r++) {
      for (let c = 0; c < l.cols; c++) {
        if (Graph.isOpen(l.maze, r, c)) degreeSum += Graph.getNeighbors(l.maze, { row: r, col: c }).length;
      }
    }
    assert.strictEqual(edges.length * 2, degreeSum, `level ${l.id}: handshake lemma failed`);
    edges.forEach(([a, b]) => {
      assert.strictEqual(Math.abs(a.row - b.row) + Math.abs(a.col - b.col), 1);
      assert.ok(Graph.isOpen(l.maze, a.row, a.col) && Graph.isOpen(l.maze, b.row, b.col));
    });
  }
});

test('BFS step recorder never marks walls as visited and ends with the same path', () => {
  const m = maze(['S..#..', '.#.#.#', '.#....', '.##.#.', '....#D']);
  const steps = Graph.bfsSteps(m.maze, m.start, m.destination);
  const last = steps[steps.length - 1];
  assert.ok(last.found);
  for (const s of steps) {
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      if (m.maze[r][c] === '#') assert.strictEqual(s.distance[r][c], -1);
    }
  }
  const direct = Graph.findShortestPath(m.maze, m.start, m.destination);
  assert.strictEqual(last.path.length - 1, direct.distance);
});

test('BFS distances are non-decreasing in dequeue order (layer property)', () => {
  const l = Levels.parseLevel(Levels.LEVEL_DATA[11]);
  const steps = Graph.bfsSteps(l.maze, l.start, l.destination);
  let prev = 0;
  for (const s of steps) {
    if (!s.current) continue;
    const d = s.distance[s.current.row][s.current.col];
    assert.ok(d >= prev, 'dequeued distance decreased');
    prev = d;
  }
});

/** Independent check: exhaustive DFS over simple paths on small grids. */
function bruteForceShortest(m, start, goal) {
  let best = Infinity;
  const seen = new Set();
  const dfs = (cell, len) => {
    if (len >= best) return;
    if (cell.row === goal.row && cell.col === goal.col) { best = len; return; }
    for (const nb of Graph.getNeighbors(m, cell)) {
      const k = Graph.cellKey(nb);
      if (seen.has(k)) continue;
      seen.add(k); dfs(nb, len + 1); seen.delete(k);
    }
  };
  seen.add(Graph.cellKey(start));
  dfs(start, 0);
  return best;
}

test('BFS matches exhaustive search on 300 random small mazes (incl. unreachable)', () => {
  let seed = 12345;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let unreachable = 0;
  for (let i = 0; i < 300; i++) {
    const rows = 2 + Math.floor(random() * 4), cols = 2 + Math.floor(random() * 4);
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (random() < 0.3 ? '#' : '.')));
    const start = { row: 0, col: 0 }, goal = { row: rows - 1, col: cols - 1 };
    grid[0][0] = '.'; grid[rows - 1][cols - 1] = '.';
    const expected = bruteForceShortest(grid, start, goal);
    const got = Graph.findShortestPath(grid, start, goal).distance;
    if (expected === Infinity) unreachable += 1;
    assert.strictEqual(got, expected, `maze ${i}: ${JSON.stringify(grid)}`);
  }
  assert.ok(unreachable > 0, 'test set should include unreachable mazes');
});

/* ------------------------------------------------------------------ levels */
section('Handcrafted levels');

test('there are at least 12 levels with ids 1..12', () => {
  assert.ok(Levels.LEVEL_DATA.length >= 12);
  Levels.LEVEL_DATA.forEach((l, i) => assert.strictEqual(l.id, i + 1));
});

for (const data of Levels.LEVEL_DATA) {
  test(`level ${data.id} "${data.name}" validates; BFS = expected (${data.expectedShortest})`, () => {
    assert.deepStrictEqual(Levels.validateLevel(data), []);
    const l = Levels.parseLevel(data);
    const r = Graph.findShortestPath(l.maze, l.start, l.destination);
    assert.strictEqual(r.distance, data.expectedShortest);
    for (const field of ['objective', 'lesson', 'difficulty', 'name']) assert.ok(data[field], `missing ${field}`);
    if (data.moveLimit !== undefined) assert.ok(data.moveLimit >= r.distance, 'move limit not achievable');
  });
}

test('difficulty bands: 1-4 beginner, 5-8 intermediate, 9-12 advanced', () => {
  Levels.LEVEL_DATA.forEach(l => {
    const expected = l.id <= 4 ? 'Beginner' : l.id <= 8 ? 'Intermediate' : 'Advanced';
    assert.strictEqual(l.difficulty, expected);
  });
});

test('educational properties hold (two routes, dead ends, multiple shortest paths)', () => {
  const lvl = id => Levels.parseLevel(Levels.LEVEL_DATA[id - 1]);
  const deadEnds = l => {
    let n = 0;
    for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) {
      const cell = { row: r, col: c };
      if (!Graph.isOpen(l.maze, r, c) || Engine.sameCell(cell, l.start) || Engine.sameCell(cell, l.destination)) continue;
      if (Graph.getNeighbors(l.maze, cell).length === 1) n += 1;
    }
    return n;
  };
  assert.ok(deadEnds(lvl(4)) >= 1, 'level 4 needs a dead end');
  assert.ok(deadEnds(lvl(7)) >= 3, 'level 7 needs several dead ends');
  assert.ok(Graph.countShortestPaths(lvl(11).maze, lvl(11).start, lvl(11).destination) > 1, 'level 11 needs several shortest paths');
  // Levels 3 and 6: blocking the first step of the shortest route still leaves a second, longer route.
  for (const id of [3, 6]) {
    const l = lvl(id);
    const p = Graph.findShortestPath(l.maze, l.start, l.destination);
    const blocked = l.maze.map(row => row.slice());
    blocked[p.path[1].row][p.path[1].col] = '#';
    const alt = Graph.findShortestPath(blocked, l.start, l.destination);
    assert.ok(alt.reachable && alt.distance > p.distance, `level ${id} needs a second, longer route`);
  }
});

test('validateLevel catches broken levels', () => {
  assert.ok(Levels.validateLevel({ grid: ['S..', '###', '..D'] }).some(p => /not reachable/.test(p)));
  assert.ok(Levels.validateLevel({ grid: ['S..', '...'] }).some(p => /destination/.test(p)));
  assert.ok(Levels.validateLevel({ grid: ['S.D', '..'] }).some(p => /length/.test(p)));
  assert.ok(Levels.validateLevel({ grid: ['S.X.D'] }).some(p => /Unknown tile/.test(p)));
  assert.ok(Levels.validateLevel({ grid: ['S..D'], expectedShortest: 5 }).some(p => /expectedShortest/.test(p)));
  assert.ok(Levels.validateLevel({ grid: ['S..D'], moveLimit: 2 }).some(p => /impossible/.test(p)));
  assert.ok(Levels.validateLevel({ grid: ['S.D', '###', '*..'] }).some(p => /Gem/.test(p)));
});

/* ------------------------------------------------------------------ engine */
section('Game rules (engine)');

const corridor = () => Levels.parseLevel({ id: 99, grid: ['S.*.D', '.#...'] });

test('robot moves through an empty corridor', () => {
  const s = Engine.createGameState(corridor());
  assert.ok(Engine.tryMove(s, 'right').moved);
  assert.deepStrictEqual(s.position, { row: 0, col: 1 });
  assert.strictEqual(s.moves, 1);
});

test('robot cannot enter a wall, and the move counter does not change', () => {
  const s = Engine.createGameState(corridor());
  Engine.tryMove(s, 'down');               // (1,0)
  const r = Engine.tryMove(s, 'right');    // (1,1) is a wall
  assert.strictEqual(r.moved, false);
  assert.strictEqual(r.reason, 'wall');
  assert.strictEqual(s.moves, 1);
  assert.deepStrictEqual(s.position, { row: 1, col: 0 });
});

test('robot cannot move outside the grid', () => {
  const s = Engine.createGameState(corridor());
  for (const dir of ['up', 'left']) {
    const r = Engine.tryMove(s, dir);
    assert.strictEqual(r.moved, false);
    assert.strictEqual(r.reason, 'edge');
  }
  assert.strictEqual(s.moves, 0);
  assert.strictEqual(Engine.tryMove(s, 'diagonal').moved, false);
});

test('robot reaches the destination; further moves are ignored', () => {
  const s = Engine.createGameState(corridor());
  let last;
  for (let i = 0; i < 4; i++) last = Engine.tryMove(s, 'right');
  assert.ok(last.reachedGoal);
  assert.ok(s.reachedGoal);
  assert.strictEqual(s.moves, 4);
  assert.strictEqual(Engine.tryMove(s, 'left').moved, false);
  assert.strictEqual(Engine.undoMove(s), false, 'undo after finishing is not allowed');
});

test('gems are collected once', () => {
  const s = Engine.createGameState(corridor());
  Engine.tryMove(s, 'right');
  assert.ok(Engine.tryMove(s, 'right').collectedGem);
  Engine.tryMove(s, 'left');
  assert.strictEqual(Engine.tryMove(s, 'right').collectedGem, false);
  assert.strictEqual(s.collectedGems.size, 1);
});

test('undo restores position, move count and gems', () => {
  const s = Engine.createGameState(corridor());
  Engine.tryMove(s, 'right');
  Engine.tryMove(s, 'right'); // gem
  assert.strictEqual(s.collectedGems.size, 1);
  assert.ok(Engine.undoMove(s));
  assert.deepStrictEqual(s.position, { row: 0, col: 1 });
  assert.strictEqual(s.moves, 1);
  assert.strictEqual(s.collectedGems.size, 0);
  assert.strictEqual(s.trail.length, 2);
  assert.ok(Engine.undoMove(s));
  assert.deepStrictEqual(s.position, { row: 0, col: 0 });
  assert.strictEqual(Engine.undoMove(s), false, 'nothing left to undo');
  assert.strictEqual(s.undos, 2);
});

test('restart resets position, moves, gems, trail and history (hints are kept)', () => {
  let s = Engine.createGameState(corridor());
  Engine.tryMove(s, 'right'); Engine.tryMove(s, 'right');
  s.hintsUsed = 2;
  s = Engine.restartLevel(s);
  assert.deepStrictEqual(s.position, { row: 0, col: 0 });
  assert.strictEqual(s.moves, 0);
  assert.strictEqual(s.collectedGems.size, 0);
  assert.strictEqual(s.history.length, 0);
  assert.strictEqual(s.trail.length, 1);
  assert.strictEqual(s.hintsUsed, 2);
});

test('hints always point to an open neighbour on a shortest path, from every square of every level', () => {
  for (const data of Levels.LEVEL_DATA) {
    const l = Levels.parseLevel(data);
    const dist = Graph.breadthFirstSearch(l.maze, l.destination, null).distance; // distance TO goal
    for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) {
      if (!Graph.isOpen(l.maze, r, c) || (r === l.destination.row && c === l.destination.col)) continue;
      const s = Engine.createGameState(l);
      s.position = { row: r, col: c };
      for (const stage of [1, 2, 3]) {
        const h = Engine.getHint(s, stage);
        assert.ok(h, `no hint at level ${l.id} (${r},${c})`);
        assert.ok(Graph.isOpen(l.maze, h.nextCell.row, h.nextCell.col), 'hint points into a wall');
        assert.strictEqual(Math.abs(h.nextCell.row - r) + Math.abs(h.nextCell.col - c), 1, 'hint is not a neighbour');
        assert.strictEqual(dist[h.nextCell.row][h.nextCell.col], dist[r][c] - 1, 'hint does not reduce distance');
        assert.ok(Graph.isValidPath(l.maze, h.segment), 'hint segment invalid');
        assert.ok(h.segment.length <= 5, 'hint reveals too much');
      }
    }
  }
});

test('following hints from the start completes every level in the shortest number of moves', () => {
  for (const data of Levels.LEVEL_DATA) {
    const l = Levels.parseLevel(data);
    const s = Engine.createGameState(l);
    let guard = 0;
    while (!s.reachedGoal && guard++ < 500) Engine.tryMove(s, Engine.getHint(s, 1).direction);
    assert.ok(s.reachedGoal, `level ${l.id} not completed`);
    assert.strictEqual(s.moves, data.expectedShortest);
  }
});

test('scoring rewards shortest path and no hints, but never goes negative', () => {
  const best = Engine.scoreLevel({ moves: 10, shortest: 10, hintsUsed: 0, gemsCollected: 1, moveLimit: 10 });
  assert.strictEqual(best.stars, 3);
  assert.strictEqual(best.score, 100 + 50 + 30 + 20 + 25);
  assert.strictEqual(best.limitMet, true);
  const long = Engine.scoreLevel({ moves: 40, shortest: 10, hintsUsed: 9, gemsCollected: 0 });
  assert.strictEqual(long.stars, 1);
  assert.strictEqual(long.score, 100);
  assert.strictEqual(long.extraMoves, 30);
  assert.strictEqual(long.limitMet, null);
  const hinted = Engine.scoreLevel({ moves: 10, shortest: 10, hintsUsed: 1, gemsCollected: 0 });
  assert.strictEqual(hinted.stars, 2);
  assert.ok(Engine.encouragement(5).length > 0);
  assert.ok(!/fail|wrong|bad/i.test([0, 1, 3, 10, 50].map(Engine.encouragement).join(' ')), 'messages must be encouraging');
});

/* ------------------------------------------------------------------ storage */
section('Saved progress (storage)');

function freshStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  global.localStorage = {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k)
  };
  delete require.cache[require.resolve('../js/storage.js')];
  return { Storage: require('../js/storage.js'), data };
}

test('missing storage data gives default progress', () => {
  const { Storage } = freshStorage();
  const p = Storage.loadProgress();
  assert.strictEqual(p.unlockedLevel, 1);
  assert.deepStrictEqual(p.levels, {});
});

test('progress is saved and reloaded; next level unlocks', () => {
  const { Storage } = freshStorage();
  const p = Storage.loadProgress();
  Storage.recordLevelCompletion(p, 1, { stars: 2, score: 170, moves: 6, extraMoves: 2 });
  Storage.recordLevelCompletion(p, 1, { stars: 3, score: 150, moves: 4, extraMoves: 0 });
  const reloaded = Storage.loadProgress();
  assert.strictEqual(reloaded.unlockedLevel, 2);
  assert.deepStrictEqual(reloaded.levels[1], { completed: true, bestStars: 3, bestScore: 170, bestMoves: 4, foundShortest: true });
  const sum = Storage.summarizeProgress(reloaded);
  assert.strictEqual(sum.levelsCompleted, 1);
  assert.strictEqual(sum.totalStars, 3);
});

test('corrupted JSON is handled gracefully', () => {
  const { Storage } = freshStorage({ 'robotMaze.progress.v1': '{not json', 'robotMaze.results.v1': '[[[' });
  assert.strictEqual(Storage.loadProgress().unlockedLevel, 1);
  assert.deepStrictEqual(Storage.loadResults(), []);
});

test('tampered values are clamped and repaired', () => {
  const { Storage } = freshStorage({
    'robotMaze.progress.v1': JSON.stringify({
      unlockedLevel: 999,
      levels: { 1: { completed: true, bestStars: 50, bestScore: -5, bestMoves: 'x' }, 5: { completed: true }, 3: 'junk', 77: { completed: true } }
    })
  });
  const p = Storage.loadProgress();
  assert.strictEqual(p.unlockedLevel, 12);
  assert.strictEqual(p.levels[1].bestStars, 3);
  assert.strictEqual(p.levels[1].bestScore, 0);
  assert.ok(!p.levels[3] && !p.levels[77]);
  assert.ok(p.levels[5]);
});

test('reset progress clears levels but keeps results', () => {
  const { Storage } = freshStorage();
  const p = Storage.loadProgress();
  Storage.recordLevelCompletion(p, 1, { stars: 1, score: 100, moves: 9, extraMoves: 5 });
  Storage.addResult({ mazeId: 'L1', mazeName: 'x', mode: 'campaign', playerPath: 9, shortestPath: 4, foundShortest: false });
  Storage.resetProgress();
  assert.deepStrictEqual(Storage.loadProgress().levels, {});
  assert.strictEqual(Storage.loadResults().length, 1);
});

test('results rows are sanitised; observations keep only known keys', () => {
  const { Storage } = freshStorage();
  Storage.addResult({ mazeId: 'L2', playerPath: '7', hintsUsed: -3, foundShortest: 'yes' });
  Storage.addResult({ nothing: true });
  const rows = Storage.loadResults();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].hintsUsed, 0);
  assert.strictEqual(rows[0].foundShortest, false);
  Storage.saveObservations({ exp1: { prediction: 'p', happened: 'h', learned: 'l' }, evil: { prediction: 1 } });
  assert.deepStrictEqual(Object.keys(Storage.loadObservations()), ['exp1']);
});

test('works with no localStorage at all (in-memory fallback)', () => {
  global.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  delete require.cache[require.resolve('../js/storage.js')];
  const Storage = require('../js/storage.js');
  assert.strictEqual(Storage.isPersistent, false);
  const p = Storage.loadProgress();
  Storage.recordLevelCompletion(p, 1, { stars: 1, score: 100, moves: 4, extraMoves: 0 });
  assert.strictEqual(Storage.loadProgress().unlockedLevel, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
