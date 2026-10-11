# Robot Maze Challenge

**Theme: Build a Game, Discover the Mathematics**

A browser game for children aged 7–11, built as a Discrete Mathematics project. Players guide Robo the robot through 12 handcrafted mazes to a treasure chest. Along the way the game shows that a maze is a **graph**, that routes through it are **paths**, and that **Breadth-First Search (BFS)** finds a **shortest path** whenever every move costs the same.

---

## 1. Project overview

| Part | What it does |
|---|---|
| **Adventure** | 12 levels (Beginner 1–4, Intermediate 5–8, Advanced 9–12), unlocked in order. |
| **Robot Race** | Player vs. algorithm. Round A: the child plays. Round B: a BFS robot walks a shortest path. Then the two routes are compared. |
| **Free Play** | Any level. *Discover the shortest path* reveals and explains the BFS route, and the player's own trail stays on screen for comparison. |
| **Learn the Math** | "The Secret Mathematics of Mazes": graphs (maze ↔ graph view), valid and invalid paths, predicting the shorter route, a step-by-step BFS visualiser, the BFS "ripple" layers, the unequal-cost caveat, and the conjecture with its proof. |
| **Math Detective** | An editable lab maze with five experiments, plus a notebook for predictions and observations (saved locally, exportable as CSV). |
| **Results** | Every finished maze is logged (open cells, reachable cells, shortest path, player path, hints, and more), with summary statistics and **CSV export**. |

Everything runs in the browser. There is no server, no account and no external API.

## 2. Game rules

- Robo starts on the **flag** square. The goal is the **treasure chest**.
- Robo moves one square **up, down, left or right**. Diagonal moves are not allowed.
- **Walls** (dark, striped squares) cannot be entered. Bumping a wall or the edge **does not count as a move**.
- **Gems** are optional bonus collectibles. (They are called *gems* rather than "stars" so they are not confused with the 1–3 **star rating**.)
- **Undo** steps back one move and restores the move counter and any gem collected on that move. **Restart** returns Robo to the start and resets moves, gems and the trail. Hints already used on this visit are kept, so the results data stays honest about how much help was given.
- **Hints** come in three stages: (1) a tip about which way to go, (2) the next useful square glows, (3) a short piece of a shortest path appears (at most 4 moves, and never more than half of the remaining way). Every hint is computed by BFS from Robo's *current* square, so a hint can never point into a wall.
- **Stars:** 1 for finding the treasure, +1 for using a shortest path, +1 for using no hints.
- **Points:** 100 for finishing, up to 50 for route length (−10 per extra move, never below 0), up to 30 for not using hints (−10 per hint), +20 per gem, +25 for beating a move limit (levels 8 and 12). **Speed is never scored.** Going over a move limit never fails the level; the child just misses that bonus.

**Controls:** arrow keys, **W A S D**, the on-screen arrow buttons, or swiping on the maze (touch screens). Game keys are ignored while a dialog is open or while typing in a text field.

## 3. Technologies used

- HTML5, CSS3 (CSS Grid, container query units, `<dialog>`), vanilla JavaScript (ES2017+). No frameworks or build step.
- Inline SVG for icons (paths adapted from the open-source Lucide icon set) and for path and graph overlays.
- Web Audio API for optional sound effects (generated tones, no sound files). Sound is **off by default**.
- LocalStorage for progress, results, notebook entries and settings.
- Google Fonts *Nunito* (optional: if offline, a rounded system font is used instead).
- Testing only: Node.js, and Playwright with Chrome for the browser tests.

### File structure

```
robot-maze-challenge/
├── index.html            all screens and dialogs, plus the inline SVG icon sprite
├── style.css             design tokens, layout, maze board, responsive and reduced-motion rules
├── js/
│   ├── bfs.js            graph model + BFS (no DOM; also runs in Node)
│   ├── levels.js         the 12 handcrafted levels + parsing + validation
│   ├── engine.js         game rules: move, undo, restart, hints, scoring (no DOM)
│   ├── storage.js        safe LocalStorage with repair of corrupted data
│   ├── audio.js          optional Web Audio sound effects
│   ├── board.js          maze renderer shared by every screen
│   ├── game.js           gameplay screen, Robot Race, results panel
│   ├── learn.js          interactive mathematics lessons
│   ├── data.js           results table, statistics, CSV export
│   ├── detective.js      detective lab, five experiments, notebook
│   └── app.js            navigation, home, level selection, dialogs, keyboard
├── assets/
│   ├── robot.svg  treasure.svg  gem.svg
└── tests/
    ├── run-tests.js      unit tests (Node)
    └── browser-tests.js  end-to-end tests (Playwright + Chrome)
```

The brief suggested a single `script.js`. The code is split into modules instead so that the **BFS logic, level data, game rules and rendering are separate**, as section 23 of the brief requires, and so the mathematical core can be unit-tested in Node. The files are plain `<script>` files rather than ES modules, so the game still works when `index.html` is opened directly from disk (`file://`).

## 4. How to run the game

**Option A (simplest):** double-click `index.html`, or open it in Chrome, Edge, Firefox or Safari.

**Option B (local server):**

```bash
cd robot-maze-challenge
python3 -m http.server 8000      # then open http://localhost:8000
# or: npx serve .
```

After the page has loaded once, every game feature works offline.

**Running the tests**

```bash
node tests/run-tests.js                     # 46 unit tests, needs only Node.js
# browser tests need Playwright and Google Chrome:
npm install playwright                      # or point PLAYWRIGHT_PATH at an existing copy
node tests/browser-tests.js                 # 41 end-to-end tests
SCREENSHOT_DIR=shots node tests/browser-tests.js   # also saves screenshots
```

## 5. Discrete Mathematics concepts

| Concept | Where children meet it |
|---|---|
| Graph, vertex, edge | Learn A: *Maze view ↔ Graph view* toggle, with live vertex and edge counts |
| Path (valid / invalid) | Learn B: two example paths; the game checks each one with `isValidPath` and shows the step that goes into a wall |
| Path length, shortest path | Learn C: predict Route A or Route B, then reveal the counts; the move counter and "shortest possible" in every level |
| Connectivity / reachability | Detective experiment 3: block squares until the treasure becomes unreachable; unreachable squares are dotted |
| Multiple shortest paths | Level 11 (16 shortest paths); Detective experiment 4 cycles through every shortest path |
| BFS, queue, frontier, visited set | Learn D: step-by-step visualiser showing the current square, the frontier (queue), visited squares with distances, and the final path |
| Distance layers | Learn E: "ripple" slider showing each layer *L_d* |
| Algorithm limits (weighted edges) | Learn F: mud vs. road example, where the fewest moves is not the quickest route |
| Conjecture, proof, evidence | Learn "The big claim", plus a button that runs an empirical check |

## 6. Graph representation

Each maze is stored as a **2-D JavaScript array** of characters (`'.'` open, `'#'` wall). The start, destination and gems are stored **separately** as `{row, col}` coordinates (`levels.js → parseLevel`).

- **Vertices** are all cells `(r, c)` with `maze[r][c] !== '#'`.
- **Edges** join `(r, c)` and `(r', c')` when both are vertices and `|r − r'| + |c − c'| = 1` (orthogonal neighbours).

This rule is written **once**, in `getNeighbors()` in `js/bfs.js`. The player's movement (`engine.js`), the hints, the BFS visualiser and the Graph View drawing (`listEdges()`) all call it, so the picture and the algorithm cannot disagree. A unit test also checks the handshake lemma (Σ degree = 2|E|) for every level.

Level format (from `js/levels.js`):

```
S..#.      S = start   D = destination (treasure)
##.#.      . = open    # = wall
..*..      * = optional gem
.#.#D
```

Before a level is offered, `validateLevel()` checks that the rows are rectangular, that every tile is known, that there is exactly one start and one destination, that the destination and every gem are reachable, that any move limit can be achieved, and that **BFS's distance equals the handcrafted `expectedShortest`**. A level that fails would be shown as "under repair" instead of being playable. All 12 currently pass.

| Level | Name | Size | Shortest (BFS) | Number of shortest paths | Teaching goal |
|---|---|---|---|---|---|
| 1 | Hello, Robo! | 3×5 | 4 | 1 | controls |
| 2 | Turn the Corner | 4×5 | 7 | 1 | walls, turning |
| 3 | Two Ways Round | 5×7 | 9 | 1 | two routes (9 vs 11) |
| 4 | Dead End Alley | 5×7 | 14 | 1 | a dead end |
| 5 | Robot Garden | 7×9 | 14 | 1 | bigger grid, many obstacles |
| 6 | Left or Right? | 7×9 | 15 | 1 | two routes (15 vs 17) |
| 7 | Maze of Dead Ends | 8×10 | 20 | 1 | several dead ends |
| 8 | Move Limit Challenge | 8×10 | 15 | 1 | move limit = 15 |
| 9 | Crossroads City | 9×11 | 18 | 1 | loops, many routes |
| 10 | The Narrow Gap | 11×11 | 30 | 3 | forced detour |
| 11 | Many Shortest Paths | 7×9 | 14 | 16 | multiple shortest paths |
| 12 | Grand Finale | 11×13 | 22 | 1 | everything; move limit = 24 |

The "shortest" and "number of shortest paths" columns are values **computed by the code** (`analyzeMaze`, `countShortestPaths`), not typed in. The game never shows a stored distance: it runs BFS when the level loads.

## 7. BFS implementation

`findShortestPath(maze, start, destination)` in `js/bfs.js`:

1. Puts the start cell in a **queue** and marks it **visited** (distance 0).
2. Repeatedly **dequeues** the front cell. If it is the destination, it stops.
3. Otherwise it looks at the cell's neighbours (`getNeighbors`, 4 directions). For every neighbour that is **not a wall and not yet visited**, it records `distance = current + 1` and `parent = current`, then **enqueues** it.
4. **Reconstructs** the path by following `parent` links back from the destination, then reversing.
5. Returns `{ reachable, path, distance }`. If the queue empties first: `{ reachable: false, path: [], distance: Infinity }`.

The queue is an array with a moving **head index**, so each dequeue is O(1). `Array.prototype.shift()` is O(n) and is never used. The whole search is O(|V| + |E|).

`analyzeMaze()` also reports the number of **open cells**, the number of **reachable cells**, the shortest distance, and how many shortest paths exist (counted with a dynamic-programming pass over the BFS layers). `bfsSteps()` records a snapshot after every dequeue (current cell, frontier, distances, newly discovered cells) and drives the step-by-step visualiser. It uses the same neighbour rule.

**Stale results cannot be shown.** In the gameplay screens the maze never changes, and BFS is recomputed whenever a level loads. In the Detective lab, where children can add and remove walls, every edit increments a `version` number. Cached BFS results belong to one version and are thrown away on any change, the drawn route is cut at any newly blocked square, and the overlays are redrawn.

## 8. Mathematical conjecture

> **Conjecture.** In a maze where every move costs one step, BFS finds a shortest path whenever the destination is reachable.

**Assumptions:** the maze is a finite graph G = (V, E) as defined above; movement is only along edges; every edge has cost 1; the destination is reachable from the start.

## 9. Proof of correctness

Let *dist(v)* be the minimum number of moves from the start *s* to *v*, and let the layer *L_d = { v : dist(v) = d }*. So *L₀ = {s}*.

**Claim (induction on d).** BFS dequeues every vertex of *L_d* before any vertex of *L_{d+1}*, and records distance *d* for each vertex in *L_d*.

- *Base case:* initially the queue contains only *s*, with recorded distance 0.
- *Inductive step:* assume the claim for all layers up to *d*. Every *w ∈ L_{d+1}* has a neighbour *v ∈ L_d* (the vertex before *w* on a shortest route). *w* cannot be discovered before layer *d* is processed, because any vertex dequeued earlier lies in a layer ≤ *d − 1*, and its neighbours are at distance ≤ *d*. So *w* is first discovered while BFS processes layer *d*, with recorded distance *d + 1*. Because the queue is first-in-first-out, every vertex of layer *d + 1* is enqueued behind all of layer *d*, so the layer order is preserved.

Every edge costs exactly 1, so "recorded distance" equals "number of moves", and each vertex's parent pointer is the last step of a minimum-length route. When BFS first dequeues the destination *t*, its recorded distance is *dist(t)*, and following the parent pointers produces a path of exactly *dist(t)* moves: **a shortest path.** ∎

**Visited set.** A vertex is marked visited when it is *discovered* and is never enqueued again. This prevents infinite loops in mazes with cycles and bounds the work by O(|V| + |E|).

**Completeness.** The maze is finite and each vertex enters the queue at most once, so BFS always terminates. If *t* is reachable, then *t ∈ L_k* for some *k*, and by the claim BFS discovers it. If the queue empties without reaching *t*, then *t* is unreachable, and the game reports exactly that.

**Limitation.** If moves had different costs (Learn F, the "mud" example), the path with the fewest moves need not be the cheapest, and plain BFS is not optimal. Dijkstra's algorithm is the usual tool for that case. The game does not claim BFS is best for every maze.

**Proof vs. testing.** The tests below give confidence that *our implementation* matches the algorithm. They cannot establish the claim for all mazes. Only the proof does that.

## 10. Experimental methodology (for the group)

1. **Prepare.** On the device used for the session, open **Results** and enter a *player code* (e.g. `S1`). Use codes, not real names, to protect children's privacy.
2. **Play.** The child plays Adventure or Robot Race levels without help from the group. Record observations; do not coach routes.
3. **Automatic logging.** Each finished maze adds a row: timestamp, player code, maze id/name, mode, grid size, open cells, reachable cells, BFS shortest path, player path length, extra moves, hints used, undos, seconds, whether a shortest path was found, and whether the solution had been revealed (Free Play).
4. **Change the code** before the next child.
5. **Detective notebook.** Children (or the group, on their behalf) record predictions and observations for the five experiments. Experiments 3 and 5 have genuinely different possible outcomes, so do not force a "correct" prediction.
6. **Export** (see below) and analyse in a spreadsheet.

**Questions the Results screen helps investigate** (it computes these live):
- How often do players find a shortest path? (overall %)
- How many extra moves do players make? (average)
- Does maze size matter? (grouped by open cells: under 30, 30–59, 60+)
- Do hints help? (shortest-path rate and extra moves, with vs. without hints)

> **Interpreting results.** Results from a small number of children are *exploratory*. They can suggest patterns and new questions but do not generalise to all children or all mazes. Levels are played in a fixed order, so learning effects and difficulty are confounded. Children who use hints may be the ones who were already stuck, so a with/without-hints comparison is not a controlled experiment.

## 11. How to collect and export results

- **Results → Export results (CSV)** downloads every recorded row (columns listed in `MazeStorage.RESULT_FIELDS`).
- **Detective → Download notebook (CSV)** downloads the five experiments with prediction / what happened / what I learned.
- Data are stored **per browser, per device** (LocalStorage). To combine sessions from several devices, export a CSV from each one and merge them in a spreadsheet.
- **Clear all results** (with confirmation) empties the table, e.g. between pilot runs and the real session. **Reset progress** on the home screen clears only campaign progress. Results and notebook entries are kept.

**No experimental data are included in this repository.** The tables above describe the mazes, not any players. The report's results section should be based only on data the group actually collects with the procedure above.

## 12. What has been tested

All of these tests were run and passed on the final code (Node 23, Chrome via Playwright on Linux):

**Unit tests (`node tests/run-tests.js`): 46 passed.**
- BFS: FIFO queue without `shift`, corridor distance, the brief's example maze (6 moves), paths start and end correctly and never touch walls, unreachable destinations, start = destination, multiple shortest paths (counts 2 and 6), no diagonal edges, the handshake lemma for Graph View, the visualiser never marks walls, dequeue order is non-decreasing (layer property).
- BFS agrees with an **exhaustive search** on 300 seeded random small mazes, including unreachable ones.
- All 12 levels validate; BFS = expected shortest for each; difficulty bands; educational properties (two routes in levels 3 and 6, dead ends in levels 4 and 7, more than one shortest path in level 11); the validator catches seven kinds of broken level.
- Engine: corridor moves, walls and edges don't count as moves, reaching the goal, gems, undo (position, moves, gems), restart, **hints from every open square of every level point to a neighbour that is one step closer**, following hints finishes every level in exactly the shortest number of moves, and the scoring rules are encouraging.
- Storage: defaults, save and reload, corrupted JSON, tampered values clamped, reset keeps results, sanitising of rows and notes, and the no-LocalStorage fallback.

**Browser tests (`node tests/browser-tests.js`): 41 passed.**
Page loads with no JS errors; home content; locked and unlocked levels; BFS-computed shortest value shown; arrow and WASD movement; edge and wall blocking; undo; restart; on-screen buttons; 3-stage hints; show-path hidden in Adventure; results panel numbers; **keys ignored while a dialog is open**; next-level progression; progress survives reload; corrupted progress recovers; Robot Race rounds A and B; Free Play reveal and hide; **level 12 completed in 22 moves, then the MAZE MASTER screen**; graph view node and edge counts match the maze; valid/invalid path lesson; route prediction; BFS stepper reaches the goal without visiting walls; in-page implementation check (12 levels + 500 random mazes vs. a Bellman–Ford-style relaxation); detective reachability after blocking the gap (and no stale path drawn); two equal shortest paths; route drawing compared and logged; notebook persists; **CSV export contains the game and lab rows**; typing in text fields is not captured; reset-progress confirmation (cancel and confirm); rapid key presses during real animations never skip squares; **mobile (390×844): no sideways scrolling on any screen, 44px+ touch targets, tap and swipe controls**.

Screens were also inspected visually from screenshots at desktop and phone sizes.

**Not tested:** real tablets and phones (only an emulated phone viewport), Safari and Firefox (only Chrome was automated), screen-reader use, and real children. A short pilot with one or two children before the main session is recommended.

## 13. Known limitations

- Progress and results live in one browser on one device. There is no syncing (by design: no server).
- The maze is presented to screen readers as one labelled image plus spoken status messages. A blind player could not realistically navigate it. Keyboard play, focus rings, text labels and non-colour cues (striped walls, dotted unreachable squares, lock icons, X marks) are supported.
- Only 4-directional, equal-cost moves. Portals and weighted tiles were not implemented, to keep the core game reliable. The weighted case is explained (Learn F) but not playable.
- Random mazes in Detective experiment 5 use a fixed wall density. They are for exploration, not a controlled study.
- If the device is offline on first load, the Nunito font is replaced by a system font.
- The home-screen "Best score" is the sum of each level's best score, so replaying can only raise it.

## 14. Possible future improvements

- Weighted "mud" tiles with a Dijkstra visualiser alongside BFS.
- A depth-first search (DFS) comparison that shows DFS does not always find a shortest path.
- A level editor that saves custom mazes, and sharing via a URL.
- Teacher mode: export and import sessions as JSON to merge devices automatically.
- Charts of the collected data on the Results screen.
- Narrated instructions for pre-readers.

---

## How the project meets the course requirements

| Requirement (brief §) | Where it is implemented |
|---|---|
| Playable game, not a worksheet (§2, §5, §7–9) | Adventure, Robot Race, Free Play; 12 levels; animations, gems, stars, sound |
| Maze as a graph (§6, §16A) | `bfs.js` (`getNeighbors`, `listEdges`); Learn A maze ↔ graph toggle |
| Paths and connectivity (§16B, §17 exp. 3) | `isValidPath`, Learn B, Detective experiment 3 |
| Shortest paths (§10, §12, §16C) | `findShortestPath`, "Discover the shortest path", Learn C |
| BFS from scratch, O(1) queue (§10) | `bfs.js` (`Queue`, `breadthFirstSearch`, `reconstructPath`) |
| Step-by-step BFS with frontier and visited (§16D) | Learn D (`bfsSteps`) with legend |
| Why BFS is shortest + equal-cost caveat (§16E–F) | Learn E ripples, Learn F mud vs. road |
| Hints based on the real maze (§11) | `engine.getHint` (BFS from the current square), 3 stages |
| Player vs. algorithm (§13) | Robot Race mode; "Watch the BFS robot" in every results panel |
| Scoring that rewards learning, not speed (§14) | `engine.scoreLevel`; How to Play explains the rules |
| Experiments + observation table (§17) | Detective lab (5 experiments) + notebook |
| Conjecture and proof (§18) | Learn "The big claim"; sections 8–9 above |
| Data collection and CSV (§19) | Results screen, `data.js` |
| Accessibility and responsiveness (§3, §20) | Large targets, keyboard, focus rings, non-colour cues, reduced motion, mute, phone layout (tested at 390px wide) |
| Robustness (§23) | Level validation, storage repair, animation tokens and move queue, version-tagged lab analysis |
| Testing (§24) | `tests/` (87 automated tests, listed in section 12) |
# DM-Project
