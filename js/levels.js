/*
 * levels.js — handcrafted campaign data plus level parsing and validation.
 *
 * Tile legend:
 *   S = start (Robo)     D = destination (treasure chest)
 *   . = open floor       # = wall
 *   * = optional gem (bonus collectible)
 *
 * `expectedShortest` is the answer we worked out by hand. It is NOT what the
 * game shows the player — the game always recomputes the distance with BFS.
 * The value is kept only so validateLevel() and the test suite can check that
 * the handcrafted level and the algorithm agree.
 */
(function (root) {
  'use strict';

  const Graph = (typeof module !== 'undefined' && module.exports) ? require('./bfs.js') : root.MazeGraph;

  const DIFFICULTY = Object.freeze({ BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' });

  const LEVEL_DATA = [
    {
      id: 1, name: 'Hello, Robo!', difficulty: DIFFICULTY.BEGINNER,
      grid: [
        '.....',
        'S.*.D',
        '.....'
      ],
      expectedShortest: 4,
      objective: 'Help Robo reach the treasure chest!',
      lesson: 'Learn the controls. Each step moves Robo one square.'
    },
    {
      id: 2, name: 'Turn the Corner', difficulty: DIFFICULTY.BEGINNER,
      grid: [
        'S..#.',
        '##.#.',
        '..*..',
        '.#.#D'
      ],
      expectedShortest: 7,
      objective: 'Walls block the way. Turn corners to reach the treasure!',
      lesson: 'Walls are not part of the path. Robo has to go around them.'
    },
    {
      id: 3, name: 'Two Ways Round', difficulty: DIFFICULTY.BEGINNER,
      grid: [
        'S......',
        '.#####.',
        '.#####.',
        '.#####D',
        '.*.....'
      ],
      expectedShortest: 9,
      objective: 'There are two ways to the treasure. Which one is shorter?',
      lesson: 'Different paths can join the same start and finish, and they can have different lengths.'
    },
    {
      id: 4, name: 'Dead End Alley', difficulty: DIFFICULTY.BEGINNER,
      grid: [
        'S..#...',
        '.#.#.#.',
        '.#...#.',
        '.####*.',
        '...#..D'
      ],
      expectedShortest: 14,
      objective: 'Watch out! One corridor goes nowhere. Find the way through!',
      lesson: 'A dead end is a place with only one way in. Turning back costs extra moves.'
    },
    {
      id: 5, name: 'Robot Garden', difficulty: DIFFICULTY.INTERMEDIATE,
      grid: [
        'S..#.....',
        '.#.#.###.',
        '.#...#...',
        '.###.#.#.',
        '...#...#.',
        '#*.#.###.',
        '...#....D'
      ],
      expectedShortest: 14,
      objective: 'A bigger maze with lots of walls. Explore and find the treasure!',
      lesson: 'Bigger mazes have more vertices (squares) and more edges (connections).'
    },
    {
      id: 6, name: 'Left or Right?', difficulty: DIFFICULTY.INTERMEDIATE,
      grid: [
        '.....S...',
        '.#######.',
        '.#.....#.',
        '.#.###.#.',
        '.#.#D#.#.',
        '.#.#.#.#.',
        '*........'
      ],
      expectedShortest: 15,
      objective: 'Go left or go right? Count the moves for each way!',
      lesson: 'Two routes of different lengths: one of them is a shortest path.'
    },
    {
      id: 7, name: 'Maze of Dead Ends', difficulty: DIFFICULTY.INTERMEDIATE,
      grid: [
        'S.#.......',
        '.##.####.#',
        '...#*..#..',
        '.#.#.#.##.',
        '.#...#....',
        '.####.#.#.',
        '...*#.#.#.',
        '###.#...#D'
      ],
      expectedShortest: 20,
      objective: 'This maze is full of dead ends. Can you find the one true way?',
      lesson: 'Exploring a dead end is not a mistake — it teaches you which way NOT to go.'
    },
    {
      id: 8, name: 'Move Limit Challenge', difficulty: DIFFICULTY.INTERMEDIATE,
      grid: [
        'S...#.....',
        '.##.#.###.',
        '.#..*...#.',
        '.#.####.#.',
        '...#..#...',
        '##.#.##.#.',
        '*..#....#D',
        '####.####.'
      ],
      expectedShortest: 15,
      moveLimit: 15,
      objective: 'Can you reach the treasure in 15 moves or fewer?',
      lesson: 'With a move limit, you must find a shortest path — no extra steps allowed!'
    },
    {
      id: 9, name: 'Crossroads City', difficulty: DIFFICULTY.ADVANCED,
      grid: [
        'S....#.....',
        '.###.#.###.',
        '.#...*...#.',
        '.#.#####.#.',
        '...#...#...',
        '##.#.#.###.',
        '...#.#.....',
        '.###.#####.',
        '....*.....D'
      ],
      expectedShortest: 18,
      objective: 'Many roads lead to the treasure. Which is the shortest?',
      lesson: 'When a maze has loops, there are many possible routes to compare.'
    },
    {
      id: 10, name: 'The Narrow Gap', difficulty: DIFFICULTY.ADVANCED,
      grid: [
        'S....*.....',
        '.###.###.#.',
        '.#.......#.',
        '.#.#####.#.',
        '.....#.....',
        '##########.',
        'D.#........',
        '.##.#####.#',
        '.*..#.....#',
        '.####.###.#',
        '..........#'
      ],
      expectedShortest: 30,
      objective: 'The treasure is close, but a big wall is in the way. Find the narrow gap!',
      lesson: 'Close on the map does not mean close by path. A wall can force a long detour.'
    },
    {
      id: 11, name: 'Many Shortest Paths', difficulty: DIFFICULTY.ADVANCED,
      grid: [
        'S.....#..',
        '.##.#.#.#',
        '.*.......',
        '.#.##.#.#',
        '.........',
        '#.#.##.#.',
        '.......*D'
      ],
      expectedShortest: 14,
      objective: 'Lots of routes here are equally short. Can you find one of them?',
      lesson: 'A maze can have more than one shortest path. BFS finds one of them.'
    },
    {
      id: 12, name: 'Grand Finale', difficulty: DIFFICULTY.ADVANCED,
      grid: [
        'S..#........#',
        '.#.#.######.#',
        '.#...#..*.#..',
        '.#####.##.##.',
        '...*.#..#....',
        '###.##.##.###',
        '.......#..*..',
        '.#####.#####.',
        '.#...#.......',
        '.#.#.#######.',
        '...#........D'
      ],
      expectedShortest: 22,
      moveLimit: 24,
      objective: 'The final maze! Can you reach the treasure in 24 moves or fewer?',
      lesson: 'Use everything you learned: avoid dead ends, compare routes, think like BFS.'
    }
  ];

  const VALID_TILES = new Set(['S', 'D', '.', '#', '*']);

  /**
   * Converts the string rows of a level into the structure the game uses.
   * The maze itself is a 2-D array of characters; start, destination and gems
   * are stored separately and their squares become plain floor ('.').
   */
  function parseLevel(level) {
    const maze = level.grid.map(row => row.split(''));
    let start = null;
    let destination = null;
    const gems = [];
    const starts = [];
    const destinations = [];
    maze.forEach((row, r) => row.forEach((tile, c) => {
      if (tile === 'S') { starts.push({ row: r, col: c }); maze[r][c] = '.'; }
      else if (tile === 'D') { destinations.push({ row: r, col: c }); maze[r][c] = '.'; }
      else if (tile === '*') { gems.push({ row: r, col: c }); maze[r][c] = '.'; }
    }));
    start = starts[0] || null;
    destination = destinations[0] || null;
    return {
      ...level,
      rows: maze.length,
      cols: maze[0] ? maze[0].length : 0,
      maze, start, destination, gems,
      _startCount: starts.length,
      _destinationCount: destinations.length
    };
  }

  /**
   * Checks a level before it is offered to players. Returns a list of problems
   * (empty list = level is valid). The BFS distance is compared with the
   * handcrafted expectation so a typo in a maze can never ship silently.
   */
  function validateLevel(level) {
    const problems = [];
    if (!Array.isArray(level.grid) || level.grid.length === 0) return ['Grid is empty.'];
    const width = level.grid[0].length;
    level.grid.forEach((row, r) => {
      if (row.length !== width) problems.push(`Row ${r} has length ${row.length}, expected ${width}.`);
      [...row].forEach((tile, c) => {
        if (!VALID_TILES.has(tile)) problems.push(`Unknown tile "${tile}" at (${r}, ${c}).`);
      });
    });
    const parsed = parseLevel(level);
    if (parsed._startCount !== 1) problems.push(`Expected exactly one start, found ${parsed._startCount}.`);
    if (parsed._destinationCount !== 1) problems.push(`Expected exactly one destination, found ${parsed._destinationCount}.`);
    if (problems.length) return problems;

    const analysis = Graph.analyzeMaze(parsed.maze, parsed.start, parsed.destination);
    if (!analysis.reachable && !level.allowUnreachable) problems.push('Destination is not reachable.');
    if (analysis.reachable && level.expectedShortest !== undefined && analysis.shortestDistance !== level.expectedShortest) {
      problems.push(`BFS shortest path is ${analysis.shortestDistance}, but expectedShortest is ${level.expectedShortest}.`);
    }
    if (level.moveLimit !== undefined && level.moveLimit < analysis.shortestDistance) {
      problems.push(`Move limit ${level.moveLimit} is impossible: shortest path is ${analysis.shortestDistance}.`);
    }
    const reach = Graph.breadthFirstSearch(parsed.maze, parsed.start, null).distance;
    parsed.gems.forEach(g => {
      if (reach[g.row][g.col] === -1) problems.push(`Gem at (${g.row}, ${g.col}) cannot be reached.`);
    });
    return problems;
  }

  const api = { DIFFICULTY, LEVEL_DATA, parseLevel, validateLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MazeLevels = api;
})(typeof window !== 'undefined' ? window : globalThis);
