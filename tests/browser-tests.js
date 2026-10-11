/*
 * End-to-end browser tests: drives index.html in a real Chrome browser.
 *
 * Requires Playwright (not needed to PLAY the game, only for these tests):
 *   npx playwright install chromium        (or have Google Chrome installed)
 *   PLAYWRIGHT_PATH=/path/to/node_modules/playwright node tests/browser-tests.js
 * If PLAYWRIGHT_PATH is not set, require('playwright') is used.
 * Set SCREENSHOT_DIR to save screenshots of each screen.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const PAGE_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const SHOTS = process.env.SCREENSHOT_DIR || null;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${String(err && err.message).split('\n')[0]}`);
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
}

const gameState = page => page.evaluate(() => window.MazeGame.debugState());
const pause = ms => new Promise(r => setTimeout(r, ms));

/** Presses the keys of the BFS shortest path for the current level. */
async function playShortestPath(page) {
  const keys = await page.evaluate(() => {
    const id = window.MazeGame.debugState().levelId;
    const level = window.RobotMazeApp.levels.find(l => l.id === id);
    const { path } = window.MazeGraph.findShortestPath(level.maze, level.start, level.destination);
    const names = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    return path.slice(1).map((cell, i) => names[window.MazeGraph.directionBetween(path[i], cell)]);
  });
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForFunction(() => !window.MazeGame.debugState().animating);
  }
  return keys.length;
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  const errors = [];

  // Reduced motion makes animations instant so tests run quickly; one test below runs WITH motion.
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(PAGE_URL);
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('\nLoading & home');
  await test('page loads with no JavaScript errors and all 12 levels pass validation', async () => {
    const problems = await page.evaluate(() => window.RobotMazeApp.levelProblems);
    expect(Object.keys(problems).length === 0, 'level problems: ' + JSON.stringify(problems));
    expect((await page.evaluate(() => window.RobotMazeApp.levels.length)) === 12, 'expected 12 levels');
    expect(errors.length === 0, 'errors: ' + errors.join(' | '));
  });
  await test('home shows title, subtitle, three main buttons and progress stats', async () => {
    const text = await page.textContent('#screen-home');
    for (const s of ['ROBOT MAZE', 'CHALLENGE', 'Think like a robot. Discover the shortest path!', 'PLAY NOW', 'LEARN THE MATH', 'HOW TO PLAY',
      'Levels completed', 'Best score', 'Current level', 'Stars collected']) expect(text.includes(s), 'missing: ' + s);
    expect((await page.textContent('#home-levels')).trim() === '0 / 12', 'levels stat');
    await shot(page, 'desktop-home');
  });

  console.log('\nLevel selection & gameplay');
  await test('level 1 is open and level 2 is locked at the start', async () => {
    await page.click('#screen-home [data-nav="levels"]');
    expect(await page.isEnabled('[data-level="1"]'), 'level 1 should be enabled');
    expect(await page.isDisabled('[data-level="2"]'), 'level 2 should be locked');
    await shot(page, 'desktop-levels');
  });
  await test('shortest-path number shown in the game comes from BFS', async () => {
    await page.click('[data-level="1"]');
    await page.waitForSelector('#screen-game:not([hidden])');
    expect((await page.textContent('#g-shortest')).trim() === '4', 'shortest should be 4');
  });
  await test('robot moves along an empty corridor (arrow keys and WASD)', async () => {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('d');
    const s = await gameState(page);
    expect(s.moves === 2 && s.position.col === 2, JSON.stringify(s));
    expect(s.gems === 1, 'gem on (1,2) should be collected');
  });
  await test('robot cannot leave the grid; blocked moves do not count', async () => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // second press: edge
    const s = await gameState(page);
    expect(s.moves === 3 && s.position.row === 2, JSON.stringify(s));
    expect((await page.textContent('#game-message')).includes('edge'), 'edge message');
  });
  await test('undo restores position, move counter and gem', async () => {
    await page.click('#btn-undo');
    await page.click('#btn-undo');
    const s = await gameState(page);
    expect(s.moves === 1 && s.position.row === 1 && s.position.col === 1 && s.gems === 0, JSON.stringify(s));
  });
  await test('restart resets the level', async () => {
    await page.keyboard.press('ArrowRight');
    await page.click('#btn-restart');
    const s = await gameState(page);
    expect(s.moves === 0 && s.position.col === 0 && s.position.row === 1 && s.gems === 0, JSON.stringify(s));
    expect((await page.textContent('#g-moves')).trim() === '0', 'move display');
  });
  await test('on-screen direction buttons move the robot', async () => {
    await page.click('[data-move="right"]');
    expect((await gameState(page)).moves === 1, 'button move');
    await page.click('#btn-restart');
  });
  await test('hints: 3 stages, highlight a real neighbour, then a short path segment', async () => {
    await page.click('#btn-hint');
    expect((await page.textContent('#game-message')).includes('to the right'), 'hint 1 should say right');
    await page.click('#btn-hint');
    const next = await page.$eval('.hint-next', el => [Number(el.dataset.row), Number(el.dataset.col)]);
    expect(next[0] === 1 && next[1] === 1, 'hint 2 should highlight (1,1): ' + next);
    await page.click('#btn-hint');
    expect(await page.$('#game-board .layer-hint polyline'), 'hint 3 should draw a segment');
    expect((await gameState(page)).hintsUsed === 3, 'hint count');
    await shot(page, 'desktop-game-hints');
  });
  await test('Show-shortest-path button is hidden in Adventure mode', async () => {
    expect(await page.isHidden('#btn-showpath'), 'should be hidden');
  });
  await test('reaching the treasure opens the results panel with correct numbers', async () => {
    await playShortestPath(page);
    await page.waitForSelector('#results-dialog[open]');
    const grid = await page.textContent('#results-grid');
    expect(/Moves taken\s*4/.test(grid) && /Shortest possible moves\s*4/.test(grid) && /Extra moves\s*0/.test(grid), grid);
    expect(/Hints used\s*3/.test(grid), 'hints carried through restart');
    expect((await page.textContent('#results-title')).includes('shortest path'), 'title');
    await shot(page, 'desktop-results');
  });
  await test('keyboard controls do nothing while a dialog is open', async () => {
    const before = await gameState(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('a');
    const after = await gameState(page);
    expect(before.moves === after.moves && before.position.col === after.position.col, 'state changed under dialog');
  });
  await test('Next level works and level 2 is now unlocked', async () => {
    await page.click('#res-next');
    await page.waitForFunction(() => window.MazeGame.debugState().levelId === 2);
    expect(!(await page.isVisible('#results-dialog')), 'dialog closed');
  });
  await test('robot cannot enter a wall (level 2)', async () => {
    await page.keyboard.press('ArrowDown'); // (1,0) is a wall
    const s = await gameState(page);
    expect(s.moves === 0 && s.position.row === 0, JSON.stringify(s));
    expect((await page.textContent('#game-message')).includes('wall'), 'wall message');
  });

  console.log('\nPersistence');
  await test('progress survives a page reload', async () => {
    await page.reload();
    await page.waitForSelector('#screen-home:not([hidden])');
    expect((await page.textContent('#home-levels')).trim() === '1 / 12', 'levels completed after reload');
    expect((await page.textContent('#home-current')).trim() === '2', 'current level after reload');
  });
  await test('corrupted saved progress does not break the game', async () => {
    await page.evaluate(() => localStorage.setItem('robotMaze.progress.v1', '{oops'));
    await page.reload();
    await page.waitForSelector('#screen-home:not([hidden])');
    expect((await page.textContent('#home-levels')).trim() === '0 / 12', 'should fall back to defaults');
    await page.evaluate(() => localStorage.setItem('robotMaze.progress.v1', JSON.stringify({ unlockedLevel: 2, levels: { 1: { completed: true, bestStars: 3, bestScore: 200, bestMoves: 4, foundShortest: true } } })));
    await page.reload();
    await page.waitForSelector('#screen-home:not([hidden])');
  });

  console.log('\nModes');
  await test('Robot Race: player round, then BFS robot round, then comparison', async () => {
    await page.click('[data-open-mode="versus"]');
    await page.click('[data-level="1"]');
    for (const key of ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(key);
    await page.waitForSelector('#results-dialog[open]');
    expect((await page.textContent('#race-banner')).includes('BFS robot'), 'race banner');
    const grid = await page.textContent('#results-grid');
    expect(/Moves taken\s*6/.test(grid) && /Extra moves\s*2/.test(grid), grid);
    const msg = await page.textContent('#results-message');
    expect(!/fail|wrong|bad/i.test(msg), 'message should be encouraging: ' + msg);
    expect(await page.isVisible('#g-time-wrap'), 'timer visible in race mode');
    await page.click('#res-levels');
  });
  await test('Free Play: reveal the shortest path and see the explanation', async () => {
    await page.click('[data-mode="sandbox"]');
    expect(await page.isEnabled('[data-level="12"]'), 'all levels open in free play');
    await page.click('[data-level="10"]');
    await page.click('#btn-showpath');
    expect(await page.$('#game-board .layer-bfs polyline'), 'BFS path drawn');
    expect((await page.textContent('#discover-panel')).includes('30-move'), 'panel shows 30 moves');
    await shot(page, 'desktop-freeplay-path');
    await page.click('#btn-showpath');
    expect(!(await page.$('#game-board .layer-bfs polyline')), 'path hidden again');
  });

  console.log('\nFinal level');
  await test('the final level can be completed and shows MAZE MASTER', async () => {
    await page.evaluate(() => {
      const levels = {};
      for (let i = 1; i <= 11; i++) levels[i] = { completed: true, bestStars: 2, bestScore: 150, bestMoves: 10, foundShortest: i % 2 === 0 };
      localStorage.setItem('robotMaze.progress.v1', JSON.stringify({ unlockedLevel: 12, levels }));
    });
    await page.reload();
    await page.waitForSelector('#screen-home:not([hidden])');
    await page.click('#home-continue');
    await page.waitForFunction(() => window.MazeGame.debugState().levelId === 12);
    const moves = await playShortestPath(page);
    expect(moves === 22, 'final level shortest path should be 22, got ' + moves);
    await page.waitForSelector('#results-dialog[open]');
    expect((await page.textContent('#res-next')).includes('Finish'), 'finish button');
    await page.click('#res-next');
    await page.waitForSelector('#screen-complete:not([hidden])');
    expect((await page.textContent('#complete-title')).includes('MAZE MASTER!'), 'title');
    expect((await page.textContent('#final-levels')).trim() === '12 / 12', 'levels');
    for (const label of ['PLAY AGAIN', 'TRY FREE PLAY', 'EXPLORE THE MATHEMATICS']) {
      expect((await page.textContent('#screen-complete')).includes(label), label);
    }
    await shot(page, 'desktop-complete');
  });

  console.log('\nLearn the mathematics');
  await test('graph view draws one node per open square and one line per edge', async () => {
    await page.click('.topnav [data-nav="learn"]');
    await page.click('[data-graph-view="graph"]');
    const counts = await page.evaluate(() => ({
      nodes: document.querySelectorAll('#graph-demo .graph-node').length,
      edges: document.querySelectorAll('#graph-demo .graph-edge').length,
      floors: document.querySelectorAll('#graph-demo .floor').length
    }));
    const expected = await page.evaluate(() => {
      const l = window.MazeLevels.parseLevel({ grid: ['S..#', '##.#', '...#', '.#.D'] });
      return window.MazeGraph.listEdges(l.maze).length;
    });
    expect(counts.nodes === counts.floors && counts.edges === expected, JSON.stringify(counts));
    await page.locator('#learn-graphs').screenshot({ path: SHOTS ? path.join(SHOTS, 'learn-graph.png') : undefined });
  });
  await test('valid / invalid path example is judged correctly', async () => {
    await page.click('[data-path-example="2"]');
    await page.click('[data-path-answer="no"]');
    expect((await page.textContent('#paths-feedback')).includes('NOT allowed'), 'invalid path');
    expect(await page.$('#paths-demo .bad-step'), 'bad step marked');
  });
  await test('shortest-route prediction reveals both lengths', async () => {
    await page.click('[data-predict="A"]');
    const t = await page.textContent('#shortest-feedback');
    expect(t.includes('10') && t.includes('8'), t);
  });
  await test('BFS step-by-step reaches the treasure and never visits walls', async () => {
    for (let i = 0; i < 60 && await page.isEnabled('#bfs-step'); i++) await page.click('#bfs-step');
    expect((await page.textContent('#bfs-path')).includes('moves'), 'path found');
    expect(!(await page.$('#bfs-demo .wall.v-visited, #bfs-demo .wall.v-frontier')), 'wall marked as visited');
    await page.locator('#learn-bfs').screenshot({ path: SHOTS ? path.join(SHOTS, 'learn-bfs.png') : undefined });
  });
  await test('implementation check: BFS agrees with relaxation on 512 mazes', async () => {
    await page.click('#proof-check-btn');
    expect((await page.textContent('#proof-check-result')).includes('every time'), await page.textContent('#proof-check-result'));
  });

  console.log('\nDetective & results');
  await test('blocking the single gap makes the treasure unreachable (experiment 3)', async () => {
    await page.click('.topnav [data-nav="detective"]');
    await page.click('[data-exp="3"]');
    await page.click('#lab-board [data-row="0"][data-col="3"]'); // in a loop: still reachable
    expect((await page.textContent('#lab-reachable')).includes('Yes'), 'should still be reachable');
    await page.click('#lab-board [data-row="3"][data-col="3"]'); // the only gap
    expect((await page.textContent('#lab-reachable')).includes('No'), 'should be unreachable');
    expect((await page.textContent('#lab-shortest')).includes('No path'), 'stale shortest path shown');
    expect(!(await page.$('#lab-board .layer-bfs polyline')), 'stale BFS path still drawn');
  });
  await test('equal routes: two shortest paths are counted and both can be shown (experiment 4)', async () => {
    await page.click('[data-exp="4"]');
    expect((await page.textContent('#lab-count')).trim() === '2', 'two shortest paths');
    await page.click('#lab-next-path');
    expect((await page.textContent('#lab-message')).includes('2 of 2'), await page.textContent('#lab-message'));
  });
  await test('drawing my route in experiment 1 is compared with BFS and recorded', async () => {
    await page.click('[data-exp="1"]');
    const cells = await page.evaluate(() => {
      const l = window.MazeLearn.mazeFromRows(window.MazeDetective.EXPERIMENTS[0].grid);
      return window.MazeGraph.findShortestPath(l.maze, l.start, l.destination).path.slice(1);
    });
    for (const c of cells) await page.click(`#lab-board [data-row="${c.row}"][data-col="${c.col}"]`);
    expect((await page.textContent('#lab-message')).includes('IS a shortest path'), await page.textContent('#lab-message'));
    await shot(page, 'desktop-detective');
  });
  await test('notebook entries are saved and survive a reload; typing does not move the robot', async () => {
    await page.fill('#obs-3-prediction', 'wasd I think it will still be reachable');
    await page.waitForFunction(() => document.getElementById('obs-save-status').textContent.startsWith('Saved'));
    await page.reload();
    await page.click('.topnav [data-nav="detective"]');
    expect((await page.inputValue('#obs-3-prediction')).includes('still be reachable'), 'note lost');
  });
  await test('results table lists game and lab results; CSV export contains them', async () => {
    await page.click('.topnav [data-nav="data"]');
    const rows = await page.$$eval('#results-body tr', trs => trs.length);
    expect(rows >= 4, 'expected at least 4 rows, got ' + rows);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-results')]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv.includes('"mazeId"') && csv.includes('"shortestPath"'), 'header');
    expect(csv.includes('"L1"') && csv.includes('"L12"') && csv.includes('"LAB-E1"'), 'rows missing');
    expect(csv.trim().split('\r\n').length === rows + 1, 'row count mismatch');
    await shot(page, 'desktop-results-table');
  });
  await test('typing in a text field on the results screen is not captured by the game', async () => {
    await page.fill('#player-name', '');
    await page.type('#player-name', 'wasd S1');
    expect((await page.inputValue('#player-name')) === 'wasd S1', 'typing was blocked');
  });
  await test('reset progress asks for confirmation; cancel keeps, confirm clears', async () => {
    await page.click('.brand');
    await page.click('#reset-progress');
    await page.click('#confirm-cancel');
    expect((await page.textContent('#home-levels')).trim() !== '0 / 12', 'cancel should keep progress');
    await page.click('#reset-progress');
    await page.click('#confirm-ok');
    await page.waitForFunction(() => document.getElementById('home-levels').textContent.trim() === '0 / 12');
    const stored = await page.evaluate(() => localStorage.getItem('robotMaze.results.v1'));
    expect(stored && stored.includes('L12'), 'results should be kept after progress reset');
  });

  await test('no JavaScript errors happened during the whole run', async () => {
    expect(errors.length === 0, errors.join(' | '));
  });
  await context.close();

  console.log('\nAnimations (normal motion)');
  const motion = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const mpage = await motion.newPage();
  mpage.on('pageerror', err => errors.push(err.message));
  await mpage.goto(PAGE_URL);
  await test('rapid key presses during animations never skip squares or corrupt state', async () => {
    await mpage.click('#home-continue');
    for (let i = 0; i < 6; i++) await mpage.keyboard.press('ArrowRight'); // pressed much faster than 170 ms
    await mpage.waitForFunction(() => !window.MazeGame.debugState().animating);
    await pause(400);
    const s = await gameState(mpage);
    // Moves must equal the column reached (no teleporting), and the robot cannot pass the treasure.
    expect(s.moves === s.position.col && s.moves >= 2 && s.moves <= 4, JSON.stringify(s));
    const transform = await mpage.$eval('#game-board .sprite.robot', el => el.style.transform);
    expect(transform.includes(`${s.position.col * 100}%`), 'sprite position mismatch: ' + transform);
  });
  await motion.close();

  console.log('\nMobile');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const ppage = await phone.newPage();
  ppage.on('pageerror', err => errors.push(err.message));
  await ppage.goto(PAGE_URL);
  for (const screen of ['home', 'levels', 'learn', 'detective', 'data', 'howto']) {
    await test(`mobile ${screen} screen has no horizontal page scroll`, async () => {
      await ppage.evaluate(name => window.RobotMazeApp.showScreen(name), screen);
      expect(await noHorizontalScroll(ppage), 'page scrolls sideways');
      await shot(ppage, 'mobile-' + screen);
    });
  }
  await test('mobile game: board fits, d-pad is large enough to tap, swipe moves the robot', async () => {
    await ppage.evaluate(() => window.MazeGame.start(1, 'campaign'));
    expect(await noHorizontalScroll(ppage), 'page scrolls sideways');
    const box = await ppage.$eval('.dpad-btn', el => el.getBoundingClientRect().toJSON());
    expect(box.width >= 44 && box.height >= 44, 'd-pad too small');
    const board = await ppage.$eval('#game-board .board', el => el.getBoundingClientRect().toJSON());
    expect(board.right <= 390, 'board overflows');
    await ppage.tap('[data-move="right"]');
    expect((await gameState(ppage)).moves === 1, 'tap move');
    // Simulated swipe to the right on the board
    await ppage.evaluate(() => {
      const el = document.getElementById('game-board');
      const mk = (type, x) => {
        const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 100 });
        el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
      };
      mk('touchstart', 50); mk('touchend', 150);
    });
    expect((await gameState(ppage)).moves === 2, 'swipe move');
    await shot(ppage, 'mobile-game');
  });
  await phone.close();

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
