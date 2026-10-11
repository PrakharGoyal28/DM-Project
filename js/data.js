/*
 * data.js — the "Experimental Results" screen: a table of every finished
 * maze, simple summary statistics and CSV export. Rows are produced by the
 * game (game.js) and the detective lab (detective.js) and stored by storage.js.
 */
(function (root) {
  'use strict';

  const Storage = root.MazeStorage;
  const $ = id => document.getElementById(id);

  const MODE_LABELS = { campaign: 'Adventure', versus: 'Robot Race', sandbox: 'Free Play', lab: 'Detective lab' };

  /** RFC 4180 style CSV: quote every field, double any quotes inside. */
  function toCSV(headers, rows) {
    const escape = value => `"${String(value === undefined || value === null ? '' : value).replace(/"/g, '""')}"`;
    return [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\r\n');
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob(['﻿' + text], { type: mime || 'text/csv;charset=utf-8' }); // BOM helps Excel
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function resultsToCSV(rows) {
    const headers = Storage.RESULT_FIELDS;
    return toCSV(headers, rows.map(row => headers.map(field => row[field])));
  }

  const average = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const fmt = (value, digits = 1) => (value === null ? '–' : (Math.round(value * 10 ** digits) / 10 ** digits).toString());
  const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

  /** Summary statistics answering the questions suggested in the project brief. */
  function summarize(rows) {
    const total = rows.length;
    const shortestFound = rows.filter(r => r.foundShortest).length;
    const sizeGroup = r => (r.openCells < 30 ? 'Small (under 30 open squares)' : r.openCells < 60 ? 'Medium (30–59)' : 'Large (60 or more)');
    const groups = {};
    rows.forEach(r => { (groups[sizeGroup(r)] = groups[sizeGroup(r)] || []).push(r); });
    const noHints = rows.filter(r => r.hintsUsed === 0);
    const withHints = rows.filter(r => r.hintsUsed > 0);
    return {
      total,
      shortestFound,
      avgExtra: average(rows.map(r => r.extraMoves)),
      bySize: Object.entries(groups).map(([name, list]) => ({
        name, count: list.length,
        shortestRate: percent(list.filter(r => r.foundShortest).length, list.length),
        avgExtra: average(list.map(r => r.extraMoves))
      })),
      noHints: { count: noHints.length, rate: percent(noHints.filter(r => r.foundShortest).length, noHints.length), avgExtra: average(noHints.map(r => r.extraMoves)) },
      withHints: { count: withHints.length, rate: percent(withHints.filter(r => r.foundShortest).length, withHints.length), avgExtra: average(withHints.map(r => r.extraMoves)) }
    };
  }

  function render() {
    const rows = Storage.loadResults();
    const body = $('results-body');
    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="11" class="empty-row">No results yet. Finish a maze in any mode (or draw a route in the detective lab) and it will appear here.</td></tr>';
    } else {
      body.innerHTML = rows.slice().reverse().map(r => {
        const when = r.timestamp ? new Date(r.timestamp) : null;
        const whenText = when && !isNaN(when) ? when.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
        return `<tr>
          <td>${escapeHTML(whenText)}</td><td>${escapeHTML(r.player || '–')}</td>
          <td>${escapeHTML(r.mazeId)} ${escapeHTML(r.mazeName)}</td><td>${escapeHTML(MODE_LABELS[r.mode] || r.mode)}${r.solutionShown ? ' (path shown)' : ''}</td>
          <td>${r.openCells}</td><td>${r.reachableCells}</td><td>${r.shortestPath}</td><td>${r.playerPath}</td>
          <td>${r.extraMoves}</td><td>${r.hintsUsed}</td>
          <td>${r.foundShortest ? '<span class="yes">Yes</span>' : '<span class="no">No</span>'}</td></tr>`;
      }).join('');
    }

    const s = summarize(rows);
    const sizeRows = s.bySize.map(g => `<li>${g.name}: ${g.count} tries, shortest found ${g.shortestRate}, average extra moves ${fmt(g.avgExtra)}</li>`).join('');
    $('results-summary').innerHTML = `
      <div class="summary-card"><span class="summary-value">${s.total}</span><span class="summary-label">Mazes finished</span></div>
      <div class="summary-card"><span class="summary-value">${percent(s.shortestFound, s.total)}</span><span class="summary-label">How often a shortest path was found (${s.shortestFound} of ${s.total})</span></div>
      <div class="summary-card"><span class="summary-value">${fmt(s.avgExtra)}</span><span class="summary-label">Average extra moves</span></div>
      <div class="summary-card wide">
        <h3>Does maze size matter?</h3>
        ${sizeRows ? `<ul>${sizeRows}</ul>` : '<p>No data yet.</p>'}
        <h3>Do hints help?</h3>
        <ul>
          <li>No hints: ${s.noHints.count} tries, shortest found ${s.noHints.rate}, average extra moves ${fmt(s.noHints.avgExtra)}</li>
          <li>With hints: ${s.withHints.count} tries, shortest found ${s.withHints.rate}, average extra moves ${fmt(s.withHints.avgExtra)}</li>
        </ul>
      </div>`;
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function init(app) {
    const nameInput = $('player-name');
    nameInput.value = app.settings.playerName;
    nameInput.addEventListener('input', () => {
      app.settings.playerName = nameInput.value.trim().slice(0, 40);
      Storage.saveSettings(app.settings);
    });
    $('export-results').addEventListener('click', () => {
      const rows = Storage.loadResults();
      if (!rows.length) { app.toast('There are no results to export yet.'); return; }
      downloadText(`robot-maze-results-${new Date().toISOString().slice(0, 10)}.csv`, resultsToCSV(rows));
      app.toast(`Exported ${rows.length} result${rows.length === 1 ? '' : 's'} as CSV.`);
    });
    $('clear-results').addEventListener('click', async () => {
      const ok = await app.confirm({
        title: 'Clear all results?',
        text: 'This deletes every row in the results table on this device. Export a CSV first if you need it.',
        okLabel: 'Yes, clear results'
      });
      if (!ok) return;
      Storage.clearResults();
      render();
      app.toast('Results cleared.');
    });
  }

  root.MazeData = { init, render, toCSV, resultsToCSV, downloadText, summarize, escapeHTML };
})(window);
