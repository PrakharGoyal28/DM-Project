/*
 * bfs.js — the mathematics core of Robot Maze Challenge.
 *
 * A maze is a 2-D array of single-character tiles. Every tile that is not a
 * wall is a VERTEX of a graph; two vertices are joined by an EDGE when their
 * cells are orthogonally adjacent (up / down / left / right).
 *
 * Everything in the game that needs to know "where can the robot go?" — player
 * movement, hints, the BFS visualiser and the graph drawing — calls the
 * functions in this file, so they all follow exactly the same movement rules.
 *
 * This file has no DOM dependencies and also runs under Node.js for testing.
 */
(function (root) {
  'use strict';

  const WALL = '#';

  // Four-directional movement. Diagonal moves are deliberately absent.
  const DIRECTIONS = Object.freeze([
    Object.freeze({ name: 'up', dRow: -1, dCol: 0 }),
    Object.freeze({ name: 'down', dRow: 1, dCol: 0 }),
    Object.freeze({ name: 'left', dRow: 0, dCol: -1 }),
    Object.freeze({ name: 'right', dRow: 0, dCol: 1 })
  ]);

  const DIRECTION_BY_NAME = Object.freeze(
    DIRECTIONS.reduce((map, dir) => { map[dir.name] = dir; return map; }, {})
  );

  function cellKey(cell) {
    return cell.row + ',' + cell.col;
  }

  function isInside(maze, row, col) {
    return row >= 0 && row < maze.length && col >= 0 && col < maze[row].length;
  }

  /** A cell is a vertex of the maze graph when it is inside the grid and not a wall. */
  function isOpen(maze, row, col) {
    return isInside(maze, row, col) && maze[row][col] !== WALL;
  }

  /** The vertices joined to `cell` by an edge, in a fixed order (up, down, left, right). */
  function getNeighbors(maze, cell) {
    const neighbors = [];
    for (const dir of DIRECTIONS) {
      const row = cell.row + dir.dRow;
      const col = cell.col + dir.dCol;
      if (isOpen(maze, row, col)) neighbors.push({ row, col });
    }
    return neighbors;
  }

  /** Name of the direction that leads from cell `from` to the adjacent cell `to`, or null. */
  function directionBetween(from, to) {
    const dRow = to.row - from.row;
    const dCol = to.col - from.col;
    const dir = DIRECTIONS.find(d => d.dRow === dRow && d.dCol === dCol);
    return dir ? dir.name : null;
  }

  /**
   * A FIFO queue backed by an array plus a moving head index.
   * Array.prototype.shift() is O(n) because it re-indexes the whole array;
   * advancing an index makes every dequeue O(1).
   */
  class Queue {
    constructor() {
      this.items = [];
      this.head = 0;
    }
    enqueue(item) { this.items.push(item); }
    dequeue() {
      const item = this.items[this.head];
      this.items[this.head] = undefined; // let the GC reclaim it
      this.head += 1;
      return item;
    }
    get size() { return this.items.length - this.head; }
    isEmpty() { return this.size === 0; }
    toArray() { return this.items.slice(this.head); }
  }

  function makeGrid(maze, fill) {
    return maze.map(row => Array.from({ length: row.length }, () => fill));
  }

  /**
   * Breadth-First Search over the whole reachable region.
   * Returns per-cell distances and parents. This is the shared engine behind
   * findShortestPath, the hint system and the reachability statistics.
   *
   * If `stopAt` is supplied the search stops as soon as that cell is reached,
   * exactly as described in the textbook algorithm.
   */
  function breadthFirstSearch(maze, start, stopAt) {
    const distance = makeGrid(maze, -1);
    const parent = makeGrid(maze, null);
    const queue = new Queue();
    let reachedCount = 0;

    if (!isOpen(maze, start.row, start.col)) {
      return { distance, parent, reachedCount, stoppedEarly: false };
    }

    distance[start.row][start.col] = 0; // mark the start as visited
    queue.enqueue({ row: start.row, col: start.col });
    reachedCount = 1;

    while (!queue.isEmpty()) {
      const current = queue.dequeue();
      if (stopAt && current.row === stopAt.row && current.col === stopAt.col) {
        return { distance, parent, reachedCount, stoppedEarly: true };
      }
      for (const next of getNeighbors(maze, current)) {
        if (distance[next.row][next.col] !== -1) continue; // already visited
        distance[next.row][next.col] = distance[current.row][current.col] + 1;
        parent[next.row][next.col] = current;
        reachedCount += 1;
        queue.enqueue(next);
      }
    }
    return { distance, parent, reachedCount, stoppedEarly: false };
  }

  /** Walk the parent links backwards from `destination`, then reverse. */
  function reconstructPath(parent, start, destination) {
    const path = [];
    let cell = { row: destination.row, col: destination.col };
    while (cell) {
      path.push(cell);
      if (cell.row === start.row && cell.col === start.col) break;
      cell = parent[cell.row][cell.col];
    }
    return path.reverse();
  }

  /**
   * findShortestPath(maze, start, destination)
   *
   * Returns { reachable, path, distance }.
   *  - path: array of {row, col} from start to destination inclusive, or [] if unreachable
   *  - distance: number of moves (path.length - 1), or Infinity if unreachable
   */
  function findShortestPath(maze, start, destination) {
    if (!isOpen(maze, start.row, start.col) || !isOpen(maze, destination.row, destination.col)) {
      return { reachable: false, path: [], distance: Infinity };
    }
    const search = breadthFirstSearch(maze, start, destination);
    if (search.distance[destination.row][destination.col] === -1) {
      return { reachable: false, path: [], distance: Infinity };
    }
    const path = reconstructPath(search.parent, start, destination);
    return { reachable: true, path, distance: path.length - 1 };
  }

  /** Statistics used by the game, the experiments and the results table. */
  function analyzeMaze(maze, start, destination) {
    let openCells = 0;
    for (let r = 0; r < maze.length; r++) {
      for (let c = 0; c < maze[r].length; c++) if (maze[r][c] !== WALL) openCells++;
    }
    const full = breadthFirstSearch(maze, start, null);
    const result = findShortestPath(maze, start, destination);
    return {
      openCells,
      reachableCells: full.reachedCount,
      reachable: result.reachable,
      shortestDistance: result.distance,
      shortestPath: result.path,
      shortestPathCount: result.reachable ? countShortestPaths(maze, start, destination) : 0
    };
  }

  /**
   * Counts how many different shortest paths exist. Uses the BFS layers:
   * the number of shortest routes to a cell is the sum of the counts of its
   * neighbours exactly one layer closer to the start.
   */
  function countShortestPaths(maze, start, destination) {
    const { distance } = breadthFirstSearch(maze, start, null);
    if (!isOpen(maze, destination.row, destination.col) || distance[destination.row][destination.col] === -1) return 0;
    const ways = makeGrid(maze, 0);
    ways[start.row][start.col] = 1;
    // Process cells layer by layer (in order of distance).
    const cells = [];
    for (let r = 0; r < maze.length; r++) {
      for (let c = 0; c < maze[r].length; c++) if (distance[r][c] > 0) cells.push({ row: r, col: c });
    }
    cells.sort((a, b) => distance[a.row][a.col] - distance[b.row][b.col]);
    for (const cell of cells) {
      for (const nb of getNeighbors(maze, cell)) {
        if (distance[nb.row][nb.col] === distance[cell.row][cell.col] - 1) {
          ways[cell.row][cell.col] += ways[nb.row][nb.col];
        }
      }
    }
    return ways[destination.row][destination.col];
  }

  /**
   * Records BFS as a list of snapshots for the step-by-step visualiser.
   * Each step = "take one cell from the front of the queue and look at its neighbours".
   * The same getNeighbors rule as findShortestPath is used, so the picture and
   * the real algorithm cannot disagree.
   */
  function bfsSteps(maze, start, destination) {
    const steps = [];
    const distance = makeGrid(maze, -1);
    const parent = makeGrid(maze, null);
    const queue = new Queue();
    distance[start.row][start.col] = 0;
    queue.enqueue({ row: start.row, col: start.col });

    const snapshot = (current, discovered, found) => ({
      current,
      discovered,
      frontier: queue.toArray().map(c => ({ row: c.row, col: c.col })),
      distance: distance.map(row => row.slice()),
      found,
      path: found ? reconstructPath(parent, start, destination) : []
    });

    steps.push(snapshot(null, [{ row: start.row, col: start.col }], false));

    while (!queue.isEmpty()) {
      const current = queue.dequeue();
      if (current.row === destination.row && current.col === destination.col) {
        steps.push(snapshot(current, [], true));
        return steps;
      }
      const discovered = [];
      for (const next of getNeighbors(maze, current)) {
        if (distance[next.row][next.col] !== -1) continue;
        distance[next.row][next.col] = distance[current.row][current.col] + 1;
        parent[next.row][next.col] = current;
        queue.enqueue(next);
        discovered.push(next);
      }
      steps.push(snapshot(current, discovered, false));
    }
    // Queue emptied without reaching the destination: it is unreachable.
    steps.push(Object.assign(snapshot(null, [], false), { unreachable: true }));
    return steps;
  }

  /** True when consecutive cells of `path` are joined by edges (no walls, no jumps). */
  function isValidPath(maze, path) {
    if (!path.length) return false;
    if (!isOpen(maze, path[0].row, path[0].col)) return false;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (!isOpen(maze, b.row, b.col)) return false;
      if (Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1) return false;
    }
    return true;
  }

  /** Every edge of the maze graph, each listed once (used for the Graph View drawing). */
  function listEdges(maze) {
    const edges = [];
    for (let r = 0; r < maze.length; r++) {
      for (let c = 0; c < maze[r].length; c++) {
        if (!isOpen(maze, r, c)) continue;
        for (const nb of getNeighbors(maze, { row: r, col: c })) {
          // Keep each undirected edge once: only from the "smaller" endpoint.
          if (nb.row > r || (nb.row === r && nb.col > c)) {
            edges.push([{ row: r, col: c }, nb]);
          }
        }
      }
    }
    return edges;
  }

  const api = {
    WALL, DIRECTIONS, DIRECTION_BY_NAME, Queue,
    cellKey, isInside, isOpen, getNeighbors, directionBetween,
    breadthFirstSearch, reconstructPath, findShortestPath, analyzeMaze,
    countShortestPaths, bfsSteps, isValidPath, listEdges
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MazeGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
