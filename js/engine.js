/*
 * engine.js — the rules of the game, with no DOM code.
 *
 * Holds the state of one attempt at a level (position, moves, undo history,
 * collected gems, hints) and the pure functions that change it. The UI in
 * game.js calls these functions and then draws the result, which keeps the
 * rules testable in Node.js.
 */
(function (root) {
  'use strict';

  const Graph = (typeof module !== 'undefined' && module.exports) ? require('./bfs.js') : root.MazeGraph;

  const sameCell = (a, b) => Boolean(a && b) && a.row === b.row && a.col === b.col;
  const copyCell = cell => ({ row: cell.row, col: cell.col });

  /** Fresh state for a parsed level (see MazeLevels.parseLevel). */
  function createGameState(level, carriedHints) {
    return {
      level,
      position: copyCell(level.start),
      moves: 0,
      history: [],               // snapshots for UNDO
      trail: [copyCell(level.start)],
      collectedGems: new Set(),  // keys "row,col"
      hintsUsed: carriedHints || 0,
      undos: 0,
      reachedGoal: false
    };
  }

  /**
   * Attempts to move one square. Walls and the edge of the grid block the
   * move, and a blocked move does not change the move counter.
   * Returns { moved, reason?, collectedGem?, reachedGoal? }.
   */
  function tryMove(state, directionName) {
    if (state.reachedGoal) return { moved: false, reason: 'finished' };
    const dir = Graph.DIRECTION_BY_NAME[directionName];
    if (!dir) return { moved: false, reason: 'invalid-direction' };

    const row = state.position.row + dir.dRow;
    const col = state.position.col + dir.dCol;
    const maze = state.level.maze;
    if (!Graph.isInside(maze, row, col)) return { moved: false, reason: 'edge' };
    if (!Graph.isOpen(maze, row, col)) return { moved: false, reason: 'wall' };

    state.history.push({ position: copyCell(state.position), collectedGems: [...state.collectedGems] });
    state.position = { row, col };
    state.moves += 1;
    state.trail.push({ row, col });

    let collectedGem = false;
    const key = Graph.cellKey(state.position);
    if (state.level.gems.some(g => sameCell(g, state.position)) && !state.collectedGems.has(key)) {
      state.collectedGems.add(key);
      collectedGem = true;
    }
    state.reachedGoal = sameCell(state.position, state.level.destination);
    return { moved: true, collectedGem, reachedGoal: state.reachedGoal };
  }

  /** Steps back one move, restoring position, move counter and gems. */
  function undoMove(state) {
    if (state.reachedGoal || state.history.length === 0) return false;
    const snapshot = state.history.pop();
    state.position = snapshot.position;
    state.collectedGems = new Set(snapshot.collectedGems);
    state.moves -= 1;
    state.trail.pop();
    state.undos += 1;
    return true;
  }

  /**
   * Restarts the level. Position, moves, gems, trail and undo history reset.
   * Hints already used on this visit are kept, so the results table stays
   * honest about how much help a player received.
   */
  function restartLevel(state) {
    return createGameState(state.level, state.hintsUsed);
  }

  const DIRECTION_WORDS = { up: 'up', down: 'down', left: 'to the left', right: 'to the right' };

  /**
   * Hint for the robot's CURRENT square, built from a real BFS shortest path,
   * so it can never point into a wall.
   *   stage 1: a message about which way to head
   *   stage 2: highlights the next useful square
   *   stage 3: reveals a short piece (up to 4 moves) of a shortest path
   */
  function getHint(state, stage) {
    const { maze, destination } = state.level;
    const result = Graph.findShortestPath(maze, state.position, destination);
    if (!result.reachable || result.path.length < 2) return null;
    const nextCell = result.path[1];
    const direction = Graph.directionBetween(state.position, nextCell);
    const previous = state.trail.length > 1 ? state.trail[state.trail.length - 2] : null;
    const isBacktrack = sameCell(previous, nextCell);

    let message;
    if (stage <= 1) {
      message = isBacktrack
        ? `Hmm, this way might be a dead end. Try going back ${DIRECTION_WORDS[direction]}!`
        : `Try moving toward the open passage ${DIRECTION_WORDS[direction]}!`;
    } else if (stage === 2) {
      message = 'Look for the glowing square — that is a great next step!';
    } else {
      message = 'Here is a short piece of a shortest path. Can you finish the rest?';
    }
    return {
      stage: Math.min(3, Math.max(1, stage)),
      direction,
      nextCell,
      // At most 4 moves, and never more than half of the remaining way.
      segment: result.path.slice(0, 1 + Math.min(4, Math.ceil(result.distance / 2))),
      remainingMoves: result.distance,
      message
    };
  }

  /**
   * Scoring rewards finishing, efficiency, independence and exploration
   * (gems) — never raw speed — and longer routes lose only a little.
   */
  function scoreLevel({ moves, shortest, hintsUsed, gemsCollected, moveLimit }) {
    const extraMoves = Math.max(0, moves - shortest);
    const base = 100;
    const routeBonus = Math.max(0, 50 - 10 * extraMoves);
    const hintBonus = Math.max(0, 30 - 10 * hintsUsed);
    const gemBonus = 20 * gemsCollected;
    const limitMet = moveLimit !== undefined ? moves <= moveLimit : null;
    const limitBonus = limitMet ? 25 : 0;
    const stars = 1 + (extraMoves === 0 ? 1 : 0) + (hintsUsed === 0 ? 1 : 0);
    return {
      moves, shortest, extraMoves, hintsUsed, gemsCollected, limitMet,
      base, routeBonus, hintBonus, gemBonus, limitBonus,
      score: base + routeBonus + hintBonus + gemBonus + limitBonus,
      stars
    };
  }

  /** Friendly, never-negative feedback about the route length. */
  function encouragement(extraMoves) {
    if (extraMoves === 0) return 'Amazing! You used the fewest moves possible. Nobody can do it in fewer!';
    if (extraMoves <= 2) return 'So close! Just a tiny detour. Can you find a shorter way?';
    if (extraMoves <= 6) return 'Great exploring! Exploring helps us discover better routes.';
    return 'You found the treasure! Every extra step taught you something about this maze.';
  }

  const api = { createGameState, tryMove, undoMove, restartLevel, getHint, scoreLevel, encouragement, sameCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MazeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
