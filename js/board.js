/*
 * board.js — draws a maze. Used by the game, the home preview, the
 * mathematics lessons and the detective lab, so every maze looks the same.
 *
 * Layout trick: the board has `aspect-ratio: cols / rows`, cells sit in a CSS
 * grid, the SVG overlay uses viewBox "0 0 cols rows" (1 unit = 1 cell) and
 * sprites are exactly one cell big and positioned with translate(col*100%,
 * row*100%). Nothing depends on pixel sizes, so resizing never breaks it.
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const Graph = root.MazeGraph;

  function iconMarkup(name, extraClass) {
    return `<svg class="icon ${extraClass || ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  }

  function prefersReducedMotion() {
    return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * createBoard(container, mazeInfo, options)
   * mazeInfo: { maze, start?, destination?, gems? }
   * options:  { label, interactive, showStart, showGoal }
   */
  function createBoard(container, mazeInfo, options = {}) {
    const maze = mazeInfo.maze;
    const rows = maze.length;
    const cols = maze[0].length;
    const layers = new Map();
    const cellEls = [];

    container.innerHTML = '';
    const board = document.createElement('div');
    board.className = 'board' + (options.compact ? ' board-compact' : '');
    board.style.setProperty('--rows', rows);
    board.style.setProperty('--cols', cols);
    board.style.aspectRatio = `${cols} / ${rows}`;
    board.setAttribute('role', 'img');
    board.setAttribute('aria-label', options.label || `Maze with ${rows} rows and ${cols} columns`);

    const grid = document.createElement('div');
    grid.className = 'board-grid';
    for (let r = 0; r < rows; r++) {
      cellEls.push([]);
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.dataset.row = r;
        cell.dataset.col = c;
        const label = document.createElement('span');
        label.className = 'cell-label';
        cell.appendChild(label);
        grid.appendChild(cell);
        cellEls[r].push(cell);
      }
    }
    board.appendChild(grid);

    const overlay = document.createElementNS(SVG_NS, 'svg');
    overlay.setAttribute('class', 'board-overlay');
    overlay.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.setAttribute('aria-hidden', 'true');
    board.appendChild(overlay);

    const sprites = document.createElement('div');
    sprites.className = 'board-sprites';
    board.appendChild(sprites);
    container.appendChild(board);

    function paintCell(r, c) {
      const el = cellEls[r][c];
      const open = maze[r][c] !== Graph.WALL;
      el.classList.toggle('wall', !open);
      el.classList.toggle('floor', open);
    }

    function paintAll() {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) paintCell(r, c);
    }

    function decorate(cell, className, html) {
      if (!cell) return;
      const el = cellEls[cell.row][cell.col];
      el.classList.add(className);
      const deco = document.createElement('span');
      deco.className = 'cell-deco';
      deco.innerHTML = html;
      el.appendChild(deco);
    }

    function clearDecorations() {
      board.querySelectorAll('.cell-deco').forEach(el => el.remove());
      board.querySelectorAll('.is-start, .is-goal, .is-gem').forEach(el => el.classList.remove('is-start', 'is-goal', 'is-gem'));
    }

    function placeMarkers(info) {
      clearDecorations();
      if (options.showStart !== false && info.start) decorate(info.start, 'is-start', iconMarkup('flag', 'start-flag') + '<span class="sr-only">Start</span>');
      if (options.showGoal !== false && info.destination) {
        decorate(info.destination, 'is-goal', '<img class="tile-img goal-img" src="assets/treasure.svg" alt=""><span class="sr-only">Treasure</span>');
      }
      (info.gems || []).forEach(g => decorate(g, 'is-gem', '<img class="tile-img gem-img" src="assets/gem.svg" alt=""><span class="sr-only">Gem</span>'));
    }

    paintAll();
    placeMarkers(mazeInfo);

    function getLayer(name) {
      if (!layers.has(name)) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', `layer layer-${name}`);
        overlay.appendChild(g);
        layers.set(name, g);
      }
      return layers.get(name);
    }

    const api = {
      element: board,
      rows, cols,

      cell(r, c) { return cellEls[r] ? cellEls[r][c] : null; },

      /** Re-reads the maze array (used when the detective lab edits walls). */
      refresh(info) { paintAll(); placeMarkers(info || mazeInfo); },

      setCellClass(cell, className, on) {
        const el = cellEls[cell.row] && cellEls[cell.row][cell.col];
        if (el) el.classList.toggle(className, on !== false);
      },

      clearCellClass(...classNames) {
        for (const name of classNames) board.querySelectorAll('.' + name).forEach(el => el.classList.remove(name));
      },

      setLabel(cell, text) {
        const el = cellEls[cell.row][cell.col].querySelector('.cell-label');
        el.textContent = text === undefined || text === null ? '' : String(text);
      },

      clearLabels() { board.querySelectorAll('.cell-label').forEach(el => { el.textContent = ''; }); },

      /** Draws a polyline through the centres of `cells` on a named layer. */
      drawPath(layerName, cells, className, animate) {
        const layer = getLayer(layerName);
        layer.innerHTML = '';
        if (!cells || cells.length === 0) return null;
        const points = cells.map(p => `${p.col + 0.5},${p.row + 0.5}`).join(' ');
        const line = document.createElementNS(SVG_NS, 'polyline');
        line.setAttribute('points', points);
        line.setAttribute('class', className || 'path-line');
        if (animate && !prefersReducedMotion()) {
          // pathLength=1 lets CSS animate the dash offset from 1 to 0. It is
          // removed afterwards because it would also rescale dotted styles.
          line.setAttribute('pathLength', '1');
          line.classList.add('draw-in');
          line.addEventListener('animationend', () => {
            line.classList.remove('draw-in');
            line.removeAttribute('pathLength');
          }, { once: true });
        }
        layer.appendChild(line);
        if (cells.length === 1) {
          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('cx', cells[0].col + 0.5);
          dot.setAttribute('cy', cells[0].row + 0.5);
          dot.setAttribute('r', 0.12);
          dot.setAttribute('class', (className || 'path-line') + '-dot');
          layer.appendChild(dot);
        }
        return line;
      },

      /** Draws graph vertices and edges using the SAME edge rule as BFS. */
      drawGraph(layerName) {
        const layer = getLayer(layerName);
        layer.innerHTML = '';
        for (const [a, b] of Graph.listEdges(maze)) {
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', a.col + 0.5); line.setAttribute('y1', a.row + 0.5);
          line.setAttribute('x2', b.col + 0.5); line.setAttribute('y2', b.row + 0.5);
          line.setAttribute('class', 'graph-edge');
          layer.appendChild(line);
        }
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!Graph.isOpen(maze, r, c)) continue;
            const node = document.createElementNS(SVG_NS, 'circle');
            node.setAttribute('cx', c + 0.5); node.setAttribute('cy', r + 0.5);
            node.setAttribute('r', 0.2);
            node.setAttribute('class', 'graph-node');
            layer.appendChild(node);
          }
        }
      },

      clearLayer(name) { if (layers.has(name)) layers.get(name).innerHTML = ''; },

      /** Adds a one-cell sprite (robot, ghost robot…). Returns a small controller. */
      addSprite(className, imageSrc, altText) {
        const sprite = document.createElement('div');
        sprite.className = 'sprite ' + className;
        sprite.innerHTML = `<div class="sprite-body"><img src="${imageSrc}" alt="${altText || ''}"></div>`;
        sprites.appendChild(sprite);
        let facingLeft = false;
        return {
          element: sprite,
          moveTo(cell, instant, direction) {
            if (instant) sprite.classList.add('no-transition');
            sprite.style.transform = `translate(${cell.col * 100}%, ${cell.row * 100}%)`;
            if (direction === 'left') facingLeft = true;
            if (direction === 'right') facingLeft = false;
            sprite.classList.toggle('facing-left', facingLeft);
            if (instant) {
              void sprite.offsetWidth; // flush so the jump is not animated
              sprite.classList.remove('no-transition');
            }
          },
          pulse(className, duration) {
            sprite.classList.remove(className);
            void sprite.offsetWidth;
            sprite.classList.add(className);
            root.setTimeout(() => sprite.classList.remove(className), duration || 300);
          },
          remove() { sprite.remove(); }
        };
      },

      onCellClick(handler) {
        grid.addEventListener('click', event => {
          const el = event.target.closest('[data-row]');
          if (el) handler({ row: Number(el.dataset.row), col: Number(el.dataset.col) }, event);
        });
      }
    };
    return api;
  }

  root.MazeBoard = { createBoard, iconMarkup, prefersReducedMotion };
})(window);
