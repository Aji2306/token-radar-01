// dashboard/app.js: Client-side logic for Token Radar static dashboard.

(function() {
  if (!window.RADAR) {
    document.body.innerHTML = '<div style="padding: 2rem; color: #ef4444; font-family: monospace;">ERROR: window.RADAR data not loaded. Ensure data.js is present.</div>';
    return;
  }

  const radar = window.RADAR;
  const watchlistSet = new Set(radar.watchlist || []);

  // State
  let currentSort = { column: 'rank', ascending: true };
  let searchTerm = '';
  let selectedCategory = '';
  let watchlistOnly = false;

  // DOM Elements
  const metaBar = document.getElementById('meta-bar');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const watchlistToggle = document.getElementById('watchlist-toggle');
  const tableBody = document.getElementById('table-body');
  const visibleCountEl = document.getElementById('visible-count');
  const totalCountEl = document.getElementById('total-count');
  const watchlistCountEl = document.getElementById('watchlist-count');
  const viewBoard = document.getElementById('view-board');
  const viewDetail = document.getElementById('view-detail');
  const detailContent = document.getElementById('detail-content');

  totalCountEl.textContent = radar.rows.length;
  watchlistCountEl.textContent = watchlistSet.size;

  // Render Header Meta
  metaBar.innerHTML = `
    <div class="meta-item">As of: <span>${radar.as_of}</span></div>
    <div class="meta-item">Floor TVL: <span>$${(radar.floor_usd || 50000000).toLocaleString()}</span></div>
    <div class="meta-item">Watchlist: <span>${watchlistSet.size} protocols</span></div>
    <div class="meta-item">Board Rows: <span>${radar.rows.length}</span></div>
  `;

  // Populate Category Dropdown
  const categories = Array.from(new Set(radar.rows.map(r => r.category).filter(Boolean))).sort();
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });

  function formatMoney(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toLocaleString();
  }

  function renderBoard() {
    // Filter
    let filtered = radar.rows.filter(r => {
      if (watchlistOnly && !watchlistSet.has(r.slug)) return false;
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = r.name.toLowerCase().includes(q);
        const matchSlug = r.slug.toLowerCase().includes(q);
        const matchCat = (r.category || '').toLowerCase().includes(q);
        const matchChains = (r.chains || []).some(c => c.toLowerCase().includes(q));
        if (!matchName && !matchSlug && !matchCat && !matchChains) return false;
      }
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let valA = a[currentSort.column];
      let valB = b[currentSort.column];
      if (valA === null || valA === undefined) valA = currentSort.ascending ? Infinity : -Infinity;
      if (valB === null || valB === undefined) valB = currentSort.ascending ? Infinity : -Infinity;

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return currentSort.ascending ? cmp : -cmp;
      } else {
        const cmp = valA - valB;
        return currentSort.ascending ? cmp : -cmp;
      }
    });

    visibleCountEl.textContent = filtered.length;

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No matching protocols found.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const isWatchlist = watchlistSet.has(r.slug);
      const changeClass = r.change_7d > 0 ? 'positive' : r.change_7d < 0 ? 'negative' : '';
      const changeStr = r.change_7d !== null ? (r.change_7d > 0 ? `+${r.change_7d.toFixed(1)}%` : `${r.change_7d.toFixed(1)}%`) : 'N/A';

      const chainsArr = r.chains || [];
      let chainsStr = 'N/A';
      if (chainsArr.length > 0) {
        if (chainsArr.length <= 3) {
          chainsStr = chainsArr.join(', ');
        } else {
          chainsStr = chainsArr.slice(0, 3).join(', ') + ` +${chainsArr.length - 3} more`;
        }
      }

      tr.innerHTML = `
        <td class="num font-mono">#${r.rank}</td>
        <td><a href="#/detail/${r.slug}" class="protocol-link">${r.name}</a></td>
        <td>${r.category || 'N/A'}</td>
        <td title="${chainsArr.join(', ')}">${chainsStr}</td>
        <td class="num">${formatMoney(r.tvl_usd)}</td>
        <td class="num ${changeClass}">${changeStr}</td>
        <td class="num">${r.age_days !== null ? r.age_days : 'N/A'}</td>
        <td class="num" style="color: var(--accent); font-weight: 700;">${formatMoney(r.implied_value_usd)}</td>
        <td>${isWatchlist ? '<span class="badge watchlist">Watchlist</span>' : '<span class="badge">Radar</span>'}</td>
      `;
      frag.appendChild(tr);
    });
    tableBody.appendChild(frag);
  }

  function renderDetail(slug) {
    const r = radar.rows.find(row => row.slug === slug);
    if (!r) {
      detailContent.innerHTML = `<div style="padding: 2rem; color: var(--red);">Protocol not found: ${slug}</div>`;
      viewBoard.classList.add('hidden');
      viewDetail.classList.remove('hidden');
      return;
    }

    const isWatchlist = watchlistSet.has(r.slug);
    const changeClass = r.change_7d > 0 ? 'positive' : r.change_7d < 0 ? 'negative' : '';
    const changeStr = r.change_7d !== null ? (r.change_7d > 0 ? `+${r.change_7d.toFixed(2)}%` : `${r.change_7d.toFixed(2)}%`) : 'N/A';

    let stepsHtml = '';
    if (r.farm_steps && r.farm_steps.length > 0) {
      stepsHtml = `<ol class="farm-steps-list">` + r.farm_steps.map(s => `<li>${s}</li>`).join('') + `</ol>`;
    } else {
      stepsHtml = `<p style="color: var(--text-secondary);">No farm steps generated for this protocol.</p>`;
    }

    detailContent.innerHTML = `
      <div class="detail-header">
        <div class="detail-title-row">
          <div>
            <h2>${r.name}</h2>
            <p style="color: var(--text-secondary); margin-top: 0.25rem;">Slug: <code>${r.slug}</code> &bull; Category: ${r.category || 'N/A'} &bull; Chains: ${(r.chains || []).join(', ')}</p>
          </div>
          <div class="implied-display">
            Implied Value: ${formatMoney(r.implied_value_usd)}
          </div>
        </div>
        
        <div style="margin-top: 1rem;">
          ${isWatchlist ? '<span class="badge watchlist">Official Watchlist Member</span>' : '<span class="badge">Early Radar Discovery</span>'}
        </div>

        <div class="detail-grid">
          <div class="stat-card">
            <div class="stat-label">Board Rank</div>
            <div class="stat-value">#${r.rank}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Value Locked (TVL)</div>
            <div class="stat-value">${formatMoney(r.tvl_usd)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">7d TVL Growth</div>
            <div class="stat-value ${changeClass}">${changeStr}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Protocol Age (Days)</div>
            <div class="stat-value">${r.age_days !== null ? r.age_days + ' days' : 'N/A'}</div>
          </div>
        </div>
      </div>

      <div class="section-card">
        <h3>Airdrop Farming Strategy & Action Plan</h3>
        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Follow these concrete, step-by-step instructions to interact with ${r.name}, maximize activity metrics, and position your wallet for a potential future token launch.</p>
        ${stepsHtml}
      </div>

      <div class="section-card">
        <h3>Valuation Model & Metrics Breakdown</h3>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">Implied value is derived dynamically using TVL base multiples, 7-day growth momentum, protocol age maturity weighting, and category adjustments.</p>
        <ul style="list-style: disc; padding-left: 1.5rem; color: var(--text-secondary); display: grid; gap: 0.5rem;">
          <li>Base Multiple Valuation: TVL &times; 0.28 coefficient</li>
          <li>Growth Momentum Factor: 7d change clamped [-60%, +120%]</li>
          <li>Maturity Weighting: Tracked since ${r.listed_at || 'unknown date'} (${r.age_days || 365} days tracked with no token)</li>
        </ul>
      </div>

      <div class="disclaimer-box">
        <strong>Important Note:</strong> This protocol records no token (<code>gecko_id</code> and <code>symbol</code> are null in DefiLlama records). Valuation is an entry estimate and analytical claim for informational and research purposes. It does not guarantee token issuance or airdrop distributions.
      </div>
    `;

    viewBoard.classList.add('hidden');
    viewDetail.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleRoute() {
    const hash = window.location.hash || '#/';
    if (hash.startsWith('#/detail/')) {
      const slug = hash.replace('#/detail/', '');
      renderDetail(slug);
    } else {
      viewDetail.classList.add('hidden');
      viewBoard.classList.remove('hidden');
      renderBoard();
    }
  }

  // Event Listeners for Board Controls
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderBoard();
  });

  categoryFilter.addEventListener('change', (e) => {
    selectedCategory = e.target.value;
    renderBoard();
  });

  watchlistToggle.addEventListener('change', (e) => {
    watchlistOnly = e.target.checked;
    renderBoard();
  });

  // Table Sorting
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSort.column === col) {
        currentSort.ascending = !currentSort.ascending;
      } else {
        currentSort.column = col;
        currentSort.ascending = (col === 'rank' || col === 'name' || col === 'category');
      }
      renderBoard();
    });
  });

  window.addEventListener('hashchange', handleRoute);
  handleRoute();

})();
