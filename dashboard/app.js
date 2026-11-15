(function () {
  'use strict';
  var D = window.RADAR;
  var view = document.getElementById('view');

  // ---------- formatting ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUSD(n) {
    if (n == null) return '-';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function fmtFull(n) { return n == null ? '' : '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtPct(x) {
    if (x == null) return '-';
    var v = Number(x);
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function pctClass(x) { return x == null ? '' : (x >= 0 ? 'pos' : 'neg'); }
  function fmtDays(d) { return d == null ? '-' : d + 'd'; }

  // ---------- header / footer ----------
  document.getElementById('meta-asof').textContent = 'Snapshot ' + D.as_of;
  document.getElementById('meta-counts').textContent =
    D.board_size + ' pre-token ranked · ' + D.watchlist_covered + '/' + D.watchlist_size + ' watchlist';
  document.getElementById('foot-source').textContent = 'Source: ' + D.source;

  // ---------- keyboard ----------
  document.addEventListener('keydown', function(e) {
    if (e.key === '/') {
      var q = document.getElementById('f-q');
      if (q && document.activeElement !== q) {
        e.preventDefault();
        q.focus();
      }
    } else if (e.key === 'Escape') {
      var q = document.getElementById('f-q');
      if (q && document.activeElement === q) {
        q.value = '';
        q.dispatchEvent(new Event('input'));
        q.blur();
      }
    }
  });

  // ---------- routing ----------
  function parseHash() {
    var h = location.hash || '#/board';
    var m = h.match(/^#\/([^?]*)(?:\?(.*))?$/);
    var path = (m && m[1]) || 'board';
    var params = {};
    if (m && m[2]) {
      m[2].split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { path: path, params: params };
  }
  function boardHash(st) {
    var parts = [];
    ['q', 'cat', 'chain', 'wl', 'tvl', 'sort', 'dir'].forEach(function (k) {
      if (st[k] && st[k] !== '' && !(k === 'wl' && st[k] === '0') && !(k === 'sort' && st[k] === 'rank') && !(k === 'dir' && st[k] === 'asc') && !(k === 'tvl' && st[k] === '0')) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(st[k]));
      }
    });
    return '#/board' + (parts.length ? '?' + parts.join('&') : '');
  }
  function setNav(name) {
    var links = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-nav') === name);
    }
  }

  // ---------- shared bits ----------
  var CATS = (function () {
    var s = {};
    D.rows.forEach(function (r) { if (r.category) s[r.category] = 1; });
    return Object.keys(s).sort();
  })();
  var CHAINS = (function () {
    var s = {};
    D.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { s[c] = 1; }); });
    return Object.keys(s).sort();
  })();
  var MEDIAN_IMPLIED = (function () {
    var v = D.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  })();

  function confBadge(c) { return '<span class="conf ' + esc(c) + '">' + esc(c) + '</span>'; }
  function wlTag(r) { return r.watchlist ? '<span class="wl">WL</span>' : ''; }
  function chainsTxt(r) { return (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + (r.chains.length - 3) : ''); }

  // ---------- board ----------
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    name: function (a, b) { return a.name < b.name ? -1 : 1; },
    category: function (a, b) { return String(a.category) < String(b.category) ? -1 : 1; },
    tvl_usd: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    change_7d: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
    implied_value_usd: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    est_airdrop_usd: function (a, b) { return b.est_airdrop_usd - a.est_airdrop_usd; }
  };

  function boardState(params) {
    return {
      q: params.q || '', cat: params.cat || '', chain: params.chain || '',
      wl: params.wl === '1' ? '1' : '0', tvl: params.tvl || '0',
      sort: SORTS[params.sort] ? params.sort : 'rank',
      dir: params.dir === 'desc' ? 'desc' : 'asc'
    };
  }

  function renderBoard(params) {
    setNav('board');
    var st = boardState(params);

    var kpis =
      '<div class="kpis">' +
      '<div class="kpi"><div class="k-label">Total implied value ranked</div><div class="k-value">' + fmtUSD(D.total_implied_usd) + '</div><div class="k-sub">across ' + D.board_size + ' pre-token protocols</div></div>' +
      '<div class="kpi"><div class="k-label">Pre-token protocols</div><div class="k-value">' + D.pre_token_count + '</div><div class="k-sub">record no token in the snapshot</div></div>' +
      '<div class="kpi"><div class="k-label">Watchlist covered</div><div class="k-value">' + D.watchlist_covered + '/' + D.watchlist_size + '</div><div class="k-sub">every watchlist slug is ranked</div></div>' +
      '<div class="kpi"><div class="k-label">Median implied value</div><div class="k-value">' + fmtUSD(MEDIAN_IMPLIED) + '</div><div class="k-sub">floor for ranking: ' + fmtUSD(D.floor_usd) + ' TVL</div></div>' +
      '</div>';

    var catOpts = '<option value="">All categories</option>' + CATS.map(function (c) {
      return '<option' + (st.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="">All chains</option>' + CHAINS.map(function (c) {
      return '<option' + (st.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var tvlOpts = [['0', 'Any TVL'], ['50000000', '≥ $50M TVL'], ['100000000', '≥ $100M TVL'], ['500000000', '≥ $500M TVL'], ['1000000000', '≥ $1B TVL']].map(function (p) {
      return '<option value="' + p[0] + '"' + (st.tvl === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('');

    var filters =
      '<div class="filters">' +
      '<input type="search" id="f-q" placeholder="Search name or slug" value="' + esc(st.q) + '" aria-label="Search">' +
      '<span class="chip">/ to search</span>' +
      '<select id="f-cat" aria-label="Category">' + catOpts + '</select>' +
      '<select id="f-chain" aria-label="Chain">' + chainOpts + '</select>' +
      '<select id="f-tvl" aria-label="Minimum TVL">' + tvlOpts + '</select>' +
      '<label class="toggle"><input type="checkbox" id="f-wl"' + (st.wl === '1' ? ' checked' : '') + '> Watchlist only</label>' +
      '<button class="btn-reset" id="f-reset">Reset</button>' +
      '<button class="btn-reset" id="f-csv">Download CSV</button>' +
      '<span class="result-count" id="f-count"></span>' +
      '<div id="f-sort-caption" style="margin-top:4px;font-size:0.9em;color:#888;"></div>' +
      '</div>';

    var wl = D.rows.filter(function(r) { return r.watchlist; }).sort(function(a,b) { return a.rank - b.rank; });
    var wlPanel = '<div class="panel"><h3>Watchlist (' + D.watchlist_size + ')</h3><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">' +
      wl.map(function(r) {
        return '<a href="#/protocol/' + esc(r.slug) + '" class="mini-chip">' + esc(r.name) + ' #' + r.rank + '</a>';
      }).join('') + '</div></div>';

    view.innerHTML = kpis + filters + wlPanel + '<div class="tablewrap"><table class="board"><thead><tr>' +
      '<th data-sort="rank" class="num">#</th>' +
      '<th data-sort="name">Protocol</th>' +
      '<th data-sort="category">Category</th>' +
      '<th>Chains</th>' +
      '<th data-sort="tvl_usd" class="num">TVL</th>' +
      '<th data-sort="change_7d" class="num">7d</th>' +
      '<th data-sort="implied_value_usd" class="num">Implied value</th>' +
      '<th data-sort="est_airdrop_usd" class="num">Est. airdrop</th>' +
      '<th>Confidence</th>' +
      '</tr></thead><tbody id="tbody"></tbody></table></div>';

    function currentRows() {
      var q = st.q.trim().toLowerCase();
      var minTvl = Number(st.tvl) || 0;
      var rows = D.rows.filter(function (r) {
        if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
        if (st.cat && r.category !== st.cat) return false;
        if (st.chain && (r.chains || []).indexOf(st.chain) < 0) return false;
        if (st.wl === '1' && !r.watchlist) return false;
        if (minTvl && (r.tvl_usd || 0) < minTvl) return false;
        return true;
      });
      rows.sort(SORTS[st.sort]);
      if (st.dir === 'desc') rows.reverse();
      return rows;
    }

    function renderRows() {
      var rows = currentRows();
      var html = rows.map(function (r) {
        return '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num">' + r.rank + '</td>' +
          '<td class="namecell">' + esc(r.name) + wlTag(r) + '</td>' +
          '<td>' + esc(r.category || '-') + '</td>' +
          '<td title="' + esc((r.chains || []).join(', ')) + '">' + esc(chainsTxt(r)) + '</td>' +
          '<td class="num" title="' + fmtFull(r.tvl_usd) + '">' + fmtUSD(r.tvl_usd) + '</td>' +
          '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
          '<td class="num" title="' + fmtFull(r.implied_value_usd) + '">' + fmtUSD(r.implied_value_usd) + '</td>' +
          '<td class="num" title="' + fmtFull(r.est_airdrop_usd) + '">' + fmtUSD(r.est_airdrop_usd) + '</td>' +
          '<td>' + confBadge(r.confidence) + '</td>' +
          '</tr>';
      }).join('');
      document.getElementById('tbody').innerHTML = html;

      var totalImplied = rows.reduce(function(sum, r) { return sum + (r.implied_value_usd || 0); }, 0);
      document.getElementById('f-count').textContent = rows.length + ' of ' + D.rows.length + ' - ' + fmtUSD(totalImplied) + ' shown';

      var colNames = { rank: 'rank', name: 'protocol name', category: 'category', tvl_usd: 'TVL', change_7d: '7d change', implied_value_usd: 'implied value', est_airdrop_usd: 'est. airdrop' };
      var sortDir = '';
      if (['rank', 'name', 'category'].indexOf(st.sort) >= 0) {
        sortDir = (st.dir === 'desc' ? 'descending' : 'ascending');
      } else {
        sortDir = (st.dir === 'desc' ? 'lowest first' : 'highest first');
      }
      document.getElementById('f-sort-caption').textContent = 'Sorted by ' + colNames[st.sort] + ', ' + sortDir;

      var ths = document.querySelectorAll('table.board th[data-sort]');
      for (var i = 0; i < ths.length; i++) {
        ths[i].classList.remove('sorted-asc', 'sorted-desc');
        if (ths[i].getAttribute('data-sort') === st.sort) {
          ths[i].classList.add(st.dir === 'desc' ? 'sorted-desc' : 'sorted-asc');
        }
      }
    }

    function push() { location.hash = boardHash(st); }
    var deb;
    document.getElementById('f-q').addEventListener('input', function (e) {
      st.q = e.target.value;
      clearTimeout(deb); deb = setTimeout(push, 250); renderRows();
    });
    document.getElementById('f-cat').addEventListener('change', function (e) { st.cat = e.target.value; push(); });
    document.getElementById('f-chain').addEventListener('change', function (e) { st.chain = e.target.value; push(); });
    document.getElementById('f-tvl').addEventListener('change', function (e) { st.tvl = e.target.value; push(); });
    document.getElementById('f-wl').addEventListener('change', function (e) { st.wl = e.target.checked ? '1' : '0'; push(); });
    document.getElementById('f-reset').addEventListener('click', function () { location.hash = '#/board'; });
    document.getElementById('f-csv').addEventListener('click', function () {
      var rows = currentRows();
      var csv = 'rank,name,slug,category,chains,tvl_usd,change_7d,implied_value_usd,est_airdrop_usd,confidence,watchlist\n';
      csv += rows.map(function(r) {
        return [r.rank, '"' + r.name + '"', r.slug, '"' + (r.category || '') + '"', '"' + (r.chains || []).join('|') + '"', r.tvl_usd, r.change_7d, r.implied_value_usd, r.est_airdrop_usd, r.confidence, r.watchlist ? 1 : 0].join(',');
      }).join('\n');
      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'token-radar.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
    var heads = document.querySelectorAll('table.board th[data-sort]');
    for (var i = 0; i < heads.length; i++) {
      heads[i].addEventListener('click', function () {
        var k = this.getAttribute('data-sort');
        if (st.sort === k) { st.dir = st.dir === 'asc' ? 'desc' : 'asc'; }
        else { st.sort = k; st.dir = k === 'rank' || k === 'name' || k === 'category' ? 'asc' : 'desc'; }
        push();
      });
    }
    document.getElementById('tbody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (tr && tr.getAttribute('data-slug')) location.hash = '#/protocol/' + tr.getAttribute('data-slug');
    });
    renderRows();
  }

  // ---------- detail ----------
  function barRow(label, value, max, color) {
    var w = Math.max(2, Math.round((value / max) * 100));
    return '<div class="barrow"><span class="blabel">' + esc(label) + '</span>' +
      '<svg class="bartrack" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="0" y="0" width="100" height="10" rx="3" fill="#0d1a2e"/>' +
      '<rect x="0" y="0" width="' + w + '" height="10" rx="3" fill="' + color + '"/></svg>' +
      '<span class="bval">' + fmtUSD(value) + '</span></div>';
  }

  function stepChips(txt) {
    var chips = [];
    var money = txt.match(/\$[\d,]+(?:\s?[-–to]+\s?\$?[\d,]+)?/);
    if (money) chips.push('<span class="mini cost">' + esc(money[0]) + '</span>');
    var time = txt.match(/~?\d+(?:\s?[-–]\s?\d+)?\s?(?:minutes?|hours?|days?|weeks?)/i);
    if (time) chips.push('<span class="mini">' + esc(time[0]) + '</span>');
    var gas = txt.match(/~\$\d+(?:\.\d+)? gas/i);
    if (gas && chips.indexOf('<span class="mini cost">' + esc(gas[0]) + '</span>') < 0) {
      chips.push('<span class="mini cost">' + esc(gas[0]) + '</span>');
    }
    return chips.length ? '<div class="chips">' + chips.join('') + '</div>' : '';
  }

  function renderDetail(slug) {
    setNav('board');
    var r = null, idx = -1;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { r = D.rows[i]; idx = i; break; }
    if (!r) { view.innerHTML = '<div class="panel"><p>Unknown protocol slug: ' + esc(slug) + '</p><p class="backrow"><a href="#/board">Back to the board</a></p></div>'; return; }
    
    var prev = idx > 0 ? D.rows[idx - 1] : null;
    var next = idx < D.rows.length - 1 ? D.rows[idx + 1] : null;
    var nav = '<div class="nav-links">' +
      (prev ? '<a href="#/protocol/' + esc(prev.slug) + '">← Rank #' + prev.rank + ' ' + esc(prev.name) + '</a>' : '<span>← First</span>') +
      (next ? '<a href="#/protocol/' + esc(next.slug) + '">Rank #' + next.rank + ' ' + esc(next.name) + ' →</a>' : '<span>Last →</span>') +
      '</div>';
      
    var m = r.model || {};
    var base = m.base || 0, afterMom = base * (m.momentum || 1), afterAge = afterMom * (m.age_boost || 1);
    var max = Math.max(afterAge, r.implied_value_usd);

    var steps = (r.farm_steps || []).map(function (s, idx) {
      return '<div class="step"><span class="n">' + (idx + 1) + '</span><span class="txt">' + esc(s) + stepChips(s) + '</span></div>';
    }).join('');

    view.innerHTML =
      '<div class="hero">' +
      '<div class="crumbs"><a href="#/board">Board</a> / ' + esc(r.category || '-') + ' / ' + esc(r.slug) + '</div>' +
      nav +
      '<h2>' + esc(r.name) + wlTag(r) + '</h2>' +
      '<div class="sub">' + esc(r.category || '-') + ' · ' + esc((r.chains || []).join(', ')) + ' · rank #' + r.rank + ' of ' + D.rows.length + '</div>' +
      '<div class="big">' + fmtUSD(r.implied_value_usd) + '</div>' +
      '<div class="big-label">Implied launch value (' + fmtFull(r.implied_value_usd) + ')</div>' +
      '<div class="statgrid">' +
      '<div class="stat"><div class="s-label">TVL</div><div class="s-value">' + fmtUSD(r.tvl_usd) + '</div></div>' +
      '<div class="stat"><div class="s-label">7d change</div><div class="s-value ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</div></div>' +
      '<div class="stat"><div class="s-label">Est. airdrop pool (8%)</div><div class="s-value">' + fmtUSD(r.est_airdrop_usd) + '</div></div>' +
      '<div class="stat"><div class="s-label">Listed</div><div class="s-value">' + esc(r.listed_at || 'unknown') + '</div></div>' +
      '<div class="stat"><div class="s-label">Days tracked, no token</div><div class="s-value">' + fmtDays(r.days_since_listed) + '</div></div>' +
      '<div class="stat"><div class="s-label">Confidence</div><div class="s-value">' + confBadge(r.confidence) + '</div></div>' +
      '</div></div>' +
      '<div class="bars"><h3>How the implied value is built</h3>' +
      barRow('TVL base × ' + (m.category_multiple != null ? m.category_multiple : '?') + ' multiple (' + (m.calibration_count || 0) + ' calibration protocols)', base, max, '#4cc9f0') +
      barRow('× momentum ' + (m.momentum != null ? m.momentum : '?'), afterMom, max, '#4cc9f0') +
      barRow('× age boost ' + (m.age_boost != null ? m.age_boost : '?'), afterAge, max, '#34f5a2') +
      '<p class="note">Clamped to $5M-$50B. Multiples are medians of mcap/TVL over tokened protocols in the same category, computed from this snapshot.</p>' +
      '</div>' +
      '<div class="steps"><h3>Farm plan (' + (r.farm_steps || []).length + ' steps)</h3>' + steps +
      '<p class="note">' + esc(r.name) + ' records no token in the sealed snapshot. Smart-contract risk applies to every step; size positions accordingly.</p></div>' +
      '<p class="backrow" style="margin-top:16px"><a href="#/board">Back to the board</a></p>';
  }

  // ---------- methodology ----------
  function renderMethodology() {
    setNav('methodology');
    var cats = Object.keys(D.category_medians).map(function (k) { return D.category_medians[k]; })
      .sort(function (a, b) { return a.category < b.category ? -1 : 1; });
    var rows = cats.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.count + '</td>' +
        '<td class="num">' + c.median.toFixed(3) + '</td>' +
        '<td>' + (c.fallback ? 'global median (fewer than 3 tokened)' : 'category median') + '</td></tr>';
    }).join('');
    view.innerHTML =
      '<div class="panel"><h3>The value model</h3>' +
      '<div class="formula">implied_value = clamp(TVL × category_multiple × momentum × age_boost, $5M, $50B)\n' +
      'category_multiple = median(mcap / TVL) over tokened protocols in the same category with TVL ≥ $10M (clamped 0.02-5)\n' +
      'momentum = 1 + 0.5 × clamp(change_7d, -25, 50) / 100   (range 0.875-1.25)\n' +
      'age_boost = 1 + 0.5 × ln(1 + days_tracked / 365)\n' +
      'est_airdrop = 8% of implied value (farmer cohort share, context only)</div>' +
      '<p class="note">Every number is computed from the sealed snapshot at build time; nothing is hardcoded per protocol. ' +
      'Global fallback multiple: ' + D.global_median_multiple.toFixed(3) + ' (median over all tokened protocols with TVL ≥ $10M). ' +
      'Pre-token means the snapshot records no token: gecko_id and symbol are both empty.</p></div>' +
      '<div class="panel"><h3>Board stats</h3>' +
      '<ul><li>Q1 implied value: ' + fmtUSD(D.stats.q1_implied_usd) + '</li>' +
      '<li>Median implied value: ' + fmtUSD(D.stats.median_implied_usd) + '</li>' +
      '<li>Q3 implied value: ' + fmtUSD(D.stats.q3_implied_usd) + '</li>' +
      '<li>Confidence: ' + D.stats.confidence_counts.high + ' High, ' + D.stats.confidence_counts.medium + ' Medium, ' + D.stats.confidence_counts.low + ' Low</li></ul></div>' +
      '<div class="panel"><h3>Category multiples (' + cats.length + ' categories)</h3>' +
      '<table class="plain"><thead><tr><th>Category</th><th class="num">Tokened with TVL ≥ $10M</th><th class="num">Median mcap/TVL</th><th>Basis</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<div class="panel"><h3>Confidence tiers</h3>' +
      '<p>High: at least 8 calibration protocols in the category and TVL above the ' + fmtUSD(D.floor_usd) + ' floor. ' +
      'Medium: at least 3 calibration protocols. Low: everything else. Confidence describes how well the category multiple is grounded, never whether a token will launch.</p></div>';
  }

  // ---------- already launched ----------
  function renderLaunched() {
    setNav('launched');
    var rows = D.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }).map(function (r) {
      var ratio = r.tvl_usd ? (r.mcap_usd / r.tvl_usd) : null;
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.category || '-') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 3).join(', ')) + '</td>' +
        '<td class="num">' + fmtUSD(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtUSD(r.mcap_usd) + '</td>' +
        '<td class="num">' + (ratio == null ? '-' : ratio.toFixed(2)) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td></tr>';
    }).join('');
    view.innerHTML =
      '<div class="panel"><h3>Already launched (' + D.live.length + ' protocols with a token)</h3>' +
      '<p class="note">These protocols carry a token in the snapshot. Their mcap/TVL ratios are what calibrate the category multiples used on the board.</p>' +
      '<div class="tablewrap"><table class="plain"><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap/TVL</th><th class="num">7d</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  // ---------- router ----------
  function route() {
    var h = parseHash();
    var p = h.path;
    if (p.indexOf('protocol/') === 0) renderDetail(p.slice('protocol/'.length));
    else if (p === 'methodology') renderMethodology();
    else if (p === 'launched') renderLaunched();
    else renderBoard(h.params);
  }
  window.addEventListener('hashchange', route);
  route();
})();
