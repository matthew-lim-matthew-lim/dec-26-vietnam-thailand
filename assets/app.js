// Trip site: click a dot on the map to see that stop, then step to the next one.
(() => {
  const CITY = { saigon: { name: 'Saigon', color: '#c2410c' }, phuquoc: { name: 'Phu Quoc', color: '#0e7490' }, bangkok: { name: 'Bangkok', color: '#7c3aed' } };
  // Where each night is spent (index = day number - 1).
  const SLEEP = ['saigon', 'saigon', 'saigon', 'phuquoc', 'phuquoc', 'phuquoc', 'phuquoc', 'phuquoc',
    'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok'];
  const BASES = [
    { city: 'saigon', lat: 10.7769, lon: 106.7009, dates: '19–22 Dec', day: 0 },
    { city: 'phuquoc', lat: 10.175, lon: 103.965, dates: '22–27 Dec', day: 3 },
    { city: 'bangkok', lat: 13.725, lon: 100.515, dates: '27 Dec – 3 Jan', day: 8 },
  ];
  const CAT_COLORS = ['#c2410c', '#0e7490', '#7c3aed', '#ca8a04', '#be185d', '#15803d', '#2563eb', '#9333ea', '#0f766e', '#64748b', '#b45309'];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let trip = [], budget = null, day = null, stop = 0;
  let map, layer, markers = new Map();

  function initMap() {
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function dayLabel(d) {
    const parts = d.tab.split(' '); // "D6 Thu 24 Dec"
    return { num: parts[0].slice(1), date: parts.slice(1).join(' ') };
  }

  function renderDays() {
    const el = $('#days');
    const all = `<button role="tab" data-day="-1" aria-selected="${day === -1}"><small>Whole trip</small><b>Overview</b></button>`;
    el.innerHTML = all + trip.map((d, i) => {
      const { num, date } = dayLabel(d);
      const c = CITY[SLEEP[i]];
      return `<button role="tab" data-day="${i}" aria-selected="${i === day}"><small>Day ${num} · ${esc(date)}</small><b><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</b></button>`;
    }).join('');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.day, 0)));
    const on = el.querySelector('[aria-selected=true]');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function pinIcon(text, color, cls = '') {
    return L.divIcon({ className: '', html: `<div class="pin ${cls}" style="background:${color}">${text}</div>`, iconSize: null, iconAnchor: [14, 14] });
  }

  function renderOverview() {
    layer.clearLayers(); markers.clear();
    const pts = BASES.map((b) => [b.lat, b.lon]);
    L.polyline(pts, { color: '#64748b', weight: 2, dashArray: '6 8' }).addTo(layer);
    BASES.forEach((b) => {
      const c = CITY[b.city];
      L.marker([b.lat, b.lon], { icon: pinIcon(`${c.name} · ${b.dates}`, c.color, 'big') })
        .on('click', () => go(b.day, 0)).addTo(layer);
    });
    map.fitBounds(pts, { padding: [60, 60] });
    $('#dayhead').innerHTML = `<h2>Whole trip</h2><p>Click a city to open its first day, or pick a day above. Matthew flies from Sydney and Amy from Hong Kong; they meet in Saigon on 19 Dec and both fly home direct from Bangkok on 3 Jan.</p>`;
    $('#card').innerHTML = `<div class="body">${BASES.map((b, i) => {
      const c = CITY[b.city];
      const n = [3, 5, 7][i];
      return `<p><span class="sw" style="background:${c.color}"></span><b>${c.name}</b>, ${b.dates} (${n} nights)</p>`;
    }).join('')}<p class="muted">Use the arrow keys or the Next button to step through each day.</p></div>`;
    $('#timeline').innerHTML = '';
  }

  function renderDay() {
    const d = trip[day];
    const color = CITY[SLEEP[day]].color;
    layer.clearLayers(); markers.clear();

    // One marker per place; a place visited more than once lists every stop number.
    const groups = new Map();
    d.stops.forEach((s, i) => {
      if (s.lat == null) return;
      const key = `${s.lat},${s.lon}`;
      if (!groups.has(key)) groups.set(key, { lat: s.lat, lon: s.lon, idx: [] });
      groups.get(key).idx.push(i);
    });

    // Route line in visiting order; boat legs dashed.
    let prev = null;
    d.stops.forEach((s) => {
      if (s.lat == null) return;
      if (prev && (prev.lat !== s.lat || prev.lon !== s.lon)) {
        const boat = s.commute && s.commute.mode === 'b';
        L.polyline([[prev.lat, prev.lon], [s.lat, s.lon]], { color, weight: 4, opacity: 0.75, dashArray: boat ? '8 8' : null }).addTo(layer);
      }
      prev = s;
    });

    groups.forEach((g) => {
      const label = g.idx.map((i) => d.stops[i].n).join(',');
      const m = L.marker([g.lat, g.lon], { icon: pinIcon(label, color, g.idx.length > 1 ? 'wide' : ''), title: g.idx.map((i) => d.stops[i].what).join(' / ') });
      m.on('click', () => {
        const later = g.idx.find((i) => i > stop);
        const pick = g.idx.includes(stop) ? (later ?? g.idx[0]) : g.idx[0];
        go(day, pick);
      });
      m.addTo(layer);
      g.idx.forEach((i) => markers.set(i, { m, label, g }));
    });

    const pts = [...groups.values()].map((g) => [g.lat, g.lon]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14);

    $('#dayhead').innerHTML = `<h2>${esc(d.title)}</h2><p>${esc(d.sub)}</p>`;
    $('#timeline').innerHTML = d.stops.map((s, i) => {
      const move = s.commute ? `<li class="move">${s.commute.icon} ${esc(s.commute.label)} · ${esc(s.commute.dur)}</li>` : '';
      return `${move}<li><button class="stop" data-i="${i}"><span class="num" style="background:${color}">${s.n}</span><span class="t">${esc(s.time)}</span><span>${esc(s.what)}</span></button></li>`;
    }).join('');
    $('#timeline').querySelectorAll('.stop').forEach((b) => b.addEventListener('click', () => go(day, +b.dataset.i)));
  }

  function renderStop() {
    const d = trip[day];
    const s = d.stops[stop];
    const color = CITY[SLEEP[day]].color;
    const next = d.stops[stop + 1];
    const nextDay = trip[day + 1];

    const facts = [
      ['How long', s.dur], ['Where', s.place], ['Opening hours', s.hours], ['Cost each', s.cost],
      s.book ? null : ['Booking', s.bookLabel],
    ].filter((f) => f && f[1]);

    const links = [
      `<a href="${esc(s.map)}" target="_blank" rel="noopener">📍 Google Maps</a>`,
      s.commute && s.commute.dir ? `<a href="${esc(s.commute.dir)}" target="_blank" rel="noopener">🧭 Directions here</a>` : '',
      s.book ? `<a href="${esc(s.book)}" target="_blank" rel="noopener">🎟️ ${esc(s.bookLabel)}</a>` : '',
      s.tiktok ? `<a href="${esc(s.tiktok)}" target="_blank" rel="noopener">🎬 #${esc(s.tag)} on TikTok</a>` : '',
    ].join('');

    let nextBtn;
    if (next) {
      const how = next.commute ? `${next.commute.icon} ${esc(next.commute.label)} · ${esc(next.commute.dur)}` : 'Same place';
      nextBtn = `<button class="next" data-go="next"><small>${how}</small>Next: ${next.n}. ${esc(next.what)} →</button>`;
    } else if (nextDay) {
      nextBtn = `<button class="next" data-go="nextday"><small>End of the day</small>Next: ${esc(nextDay.title)} →</button>`;
    } else {
      nextBtn = `<button class="next" disabled><small>End of the trip</small>Home</button>`;
    }

    $('#card').innerHTML = `
      <img src="${esc(s.img)}" alt="${esc(s.what)}" loading="lazy" onerror="this.style.display='none'">
      <div class="body">
        <div class="when" style="color:${color}">${s.n}. ${esc(s.time)}</div>
        <h3>${esc(s.what)}</h3>
        ${s.lat == null ? '<p class="offmap">Not shown on the map.</p>' : ''}
        ${s.details ? `<p class="details">${esc(s.details)}</p>` : ''}
        <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="links">${links}</div>
      </div>
      <div class="nav">
        <button data-go="prev" ${stop === 0 && day === 0 ? 'disabled' : ''} aria-label="Previous stop">←</button>
        ${nextBtn}
      </div>`;
    $('#card').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => step(b.dataset.go === 'prev' ? -1 : 1)));

    $('#timeline').querySelectorAll('.stop').forEach((b) => b.classList.toggle('on', +b.dataset.i === stop));
    document.querySelectorAll('.pin.on').forEach((p) => p.classList.remove('on'));
    const mk = markers.get(stop);
    if (mk) {
      const el = mk.m.getElement()?.querySelector('.pin');
      if (el) el.classList.add('on');
      mk.m.setZIndexOffset(1000);
      if (!map.getBounds().pad(-0.1).contains(mk.m.getLatLng())) map.panTo(mk.m.getLatLng());
    }
  }

  function step(dir) {
    if (day < 0) { if (dir > 0) go(0, 0); return; }
    const n = trip[day].stops.length;
    if (dir > 0) {
      if (stop < n - 1) go(day, stop + 1);
      else if (day < trip.length - 1) go(day + 1, 0);
    } else {
      if (stop > 0) go(day, stop - 1);
      else if (day > 0) go(day - 1, trip[day - 1].stops.length - 1);
    }
  }

  function go(d, s) {
    const dayChanged = d !== day;
    day = d; stop = s;
    if (dayChanged) { renderDays(); day < 0 ? renderOverview() : renderDay(); }
    if (day >= 0) renderStop();
    history.replaceState(null, '', day < 0 ? '#' : `#day${day + 1}/${stop + 1}`);
  }

  function renderBudget() {
    if (!budget) return;
    const cats = [];
    budget.items.forEach((it) => {
      let c = cats.find((x) => x.name === it.category);
      if (!c) { c = { name: it.category, total: 0 }; cats.push(c); }
      c.total += it.planned;
    });
    const total = cats.reduce((a, c) => a + c.total, 0);
    cats.forEach((c, i) => (c.color = CAT_COLORS[i % CAT_COLORS.length]));
    let acc = 0;
    const grad = cats.map((c) => { const a = acc; acc += (c.total / total) * 360; return `${c.color} ${a}deg ${acc}deg`; }).join(',');
    const fmt = (n) => 'A$' + n.toLocaleString('en-AU');
    $('#budgetView').innerHTML = `
      <h2>Budget</h2>
      <p class="note">${esc(budget.note)}</p>
      <div class="bgrid">
        <div class="donut" style="background:conic-gradient(${grad})" role="img" aria-label="Planned spend by category, total ${fmt(total)}">
          <div class="total"><div>${fmt(total)}<small>planned for two</small></div></div>
        </div>
        <table><thead><tr><th>Category</th><th class="num">Planned</th><th class="num">Share</th></tr></thead><tbody>
          ${cats.map((c) => `<tr><td><span class="sw" style="background:${c.color}"></span>${esc(c.name)}</td><td class="num">${fmt(c.total)}</td><td class="num">${Math.round((c.total / total) * 100)}%</td></tr>`).join('')}
          <tr><th>Total</th><th class="num">${fmt(total)}</th><th></th></tr>
        </tbody></table>
      </div>
      <table><thead><tr><th>Item</th><th>Category</th><th class="num">Planned</th><th>Notes</th></tr></thead><tbody>
        ${budget.items.map((it) => `<tr><td>${esc(it.item)}</td><td class="muted">${esc(it.category)}</td><td class="num">${fmt(it.planned)}</td><td class="muted">${esc(it.notes)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  function setView(v) {
    document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#mapView').hidden = v !== 'map';
    $('#days').hidden = v !== 'map';
    $('#budgetView').hidden = v !== 'budget';
    if (v === 'map') map.invalidateSize();
  }

  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('keydown', (e) => {
    if ($('#mapView').hidden || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  Promise.all([fetch('data/trip.json').then((r) => r.json()), fetch('data/budget.json').then((r) => r.json())])
    .then(([t, b]) => {
      trip = t; budget = b;
      initMap(); renderBudget();
      const m = location.hash.match(/^#day(\d+)\/(\d+)/);
      if (m && trip[+m[1] - 1]) go(+m[1] - 1, Math.min(+m[2] - 1, trip[+m[1] - 1].stops.length - 1));
      else go(-1, 0);
    })
    .catch((err) => { document.body.insertAdjacentHTML('beforeend', `<p style="padding:16px">Could not load the trip data: ${esc(err.message)}</p>`); });
})();
