// Trip site: click a dot on the map to see that stop, then step to the next one.
(() => {
  const CITY = { saigon: { name: 'Saigon', color: '#c2410c' }, phuquoc: { name: 'Phu Quoc', color: '#0e7490' }, bangkok: { name: 'Bangkok', color: '#7c3aed' } };
  // Where each night is spent (index = day number - 1).
  const SLEEP = ['saigon', 'saigon', 'saigon', 'phuquoc', 'phuquoc', 'phuquoc', 'phuquoc', 'phuquoc',
    'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok'];
  const BASES = [
    { city: 'saigon', lat: 10.7769, lon: 106.7009, dates: '19–22 Dec', nights: 3, hotel: 'Hotel in District 1', day: 0 },
    { city: 'phuquoc', lat: 10.175, lon: 103.965, dates: '22–27 Dec', nights: 5, hotel: 'Resort on Long Beach', day: 3 },
    { city: 'bangkok', lat: 13.725, lon: 100.515, dates: '27 Dec – 3 Jan', nights: 7, hotel: 'Hotel in Bang Rak, by the river', day: 8 },
  ];
  const MODES = {
    w: { icon: '🚶', name: 'Walk' }, d: { icon: '🚕', name: 'Grab or taxi' }, t: { icon: '🚇', name: 'Train' },
    b: { icon: '⛴️', name: 'Boat' }, s: { icon: '🛵', name: 'Scooter' }, f: { icon: '✈️', name: 'Flight' },
  };
  const CAT_COLORS = ['#c2410c', '#0e7490', '#7c3aed', '#ca8a04', '#be185d', '#15803d', '#2563eb', '#9333ea', '#0f766e', '#64748b', '#b45309'];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mobile = () => window.matchMedia('(max-width: 860px)').matches;

  let trip = [], budget = null, media = {}, places = {}, day = null, stop = 0;
  // Google Maps Platform key. It only works on matthew-lim-matthew-lim.github.io (referrer restricted).
  const GKEY = 'AIzaSyC22mrrewNOFmwmXCY0waUHCl3sQ32IcR4';
  let map, layer, ghosts, arrows, legs = [], markers = new Map();

  function initMap() {
    map = L.map('map', { zoomControl: !mobile(), scrollWheelZoom: true, tap: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    ghosts = L.layerGroup().addTo(map);
    arrows = L.layerGroup().addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('zoomend', drawArrows);
  }

  // Chevrons every ~24px along each leg, pointing from one stop to the next. Each leg is nudged a
  // few pixels to the right of its direction so an out-and-back trip shows as two parallel trails.
  function drawArrows() {
    arrows.clearLayers();
    const z = map.getZoom();
    legs.forEach(({ a, b, color }) => {
      const pa = map.project(a, z), pb = map.project(b, z);
      const len = pa.distanceTo(pb);
      if (len < 30) return;
      const ux = (pb.x - pa.x) / len, uy = (pb.y - pa.y) / len;
      const off = L.point(-uy * 7, ux * 7);
      const ang = Math.atan2(uy, ux) * 180 / Math.PI;
      // Solid line under the arrows, nudged by the same offset.
      L.polyline([map.unproject(pa.add(off), z), map.unproject(pb.add(off), z)],
        { color, weight: 8, opacity: 0.85, lineCap: 'round', interactive: false }).addTo(arrows);
      const n = Math.max(1, Math.floor((len - 40) / 22));
      // Each chevron is a tiny white polyline in the same layer as the line, so they always line up.
      const u = L.point(ux, uy), v = L.point(-uy, ux);
      const P = (pt) => map.unproject(pt, z);
      for (let k = 1; k <= n; k++) {
        const t = (20 + (k - 0.5) * ((len - 40) / n)) / len;
        const c = pa.add(pb.subtract(pa).multiplyBy(t)).add(off);
        L.polyline([P(c.subtract(u.multiplyBy(3)).add(v.multiplyBy(3.5))), P(c.add(u.multiplyBy(2))), P(c.subtract(u.multiplyBy(3)).subtract(v.multiplyBy(3.5)))],
          { color: '#fff', weight: 2.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(arrows);
      }
    });
  }

  // Keep the dots clear of the bottom sheet on phones.
  function fitPad() {
    if (!mobile()) return { padding: [40, 40] };
    const sheet = $('#panel').getBoundingClientRect().height;
    return { paddingTopLeft: [30, 30], paddingBottomRight: [30, Math.min(sheet, window.innerHeight * 0.5) + 20] };
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

  function pinIcon(html, color, cls = '') {
    return L.divIcon({ className: 'pin-wrap', html: `<div class="pin ${cls}" style="--c:${color}">${html}</div>`, iconSize: [0, 0] });
  }

  function renderOverview() {
    layer.clearLayers(); markers.clear();
    renderGhosts(-1);
    const pts = BASES.map((b) => [b.lat, b.lon]);
    legs = [];
    for (let i = 1; i < BASES.length; i++) {
      const a = pts[i - 1], b = pts[i];
      legs.push({ a, b, color: '#64748b' });
      L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: pinIcon('✈️', '#64748b', 'mode'), interactive: false }).addTo(layer);
    }
    BASES.forEach((b) => {
      const c = CITY[b.city];
      L.marker([b.lat, b.lon], { icon: pinIcon(`🏨 ${c.name} · ${b.dates}`, c.color, 'big') })
        .on('click', () => go(b.day, 0)).addTo(layer);
    });
    map.fitBounds(pts, fitPad());
    drawArrows();
    $('#dayhead').innerHTML = `<h2>Whole trip</h2><p>Tap a city to open its first day, or pick a day above. Matthew flies from Sydney and Amy from Hong Kong; they meet in Saigon on 19 Dec and both fly home direct from Bangkok on 3 Jan.</p>`;
    $('#card').innerHTML = `<div class="body">${BASES.map((b) => {
      const c = CITY[b.city];
      return `<p class="base"><span class="hotelchip" style="--c:${c.color}">🏨</span><span><b>${c.name}</b>, ${b.dates} (${b.nights} nights)<br><small class="muted">${b.hotel}</small></span></p>`;
    }).join('')}</div>
      <div class="nav"><button class="next" data-go="next"><small>Start here</small>Day 1: ${esc(trip[0].title.split(': ')[1] || trip[0].title)} →</button></div>`;
    $('#card').querySelector('[data-go]').addEventListener('click', () => go(0, 0));
    $('#timeline').innerHTML = `<li class="legend">${Object.values(MODES).map((m) => `<span>${m.icon} ${m.name}</span>`).join('')}<span>🏨 Hotel</span></li>`;
  }

  function legMode(s) {
    if (s.flight) return 'f';
    return s.commute ? s.commute.mode : null;
  }

  // Every other day's stops, faded, so the rest of the trip stays in view. Tap one to jump to that day.
  function renderGhosts(skipDay) {
    ghosts.clearLayers();
    const here = new Set(skipDay >= 0 ? trip[skipDay].stops.filter((s) => s.lat != null).map((s) => `${s.lat},${s.lon}`) : []);
    const places = new Map();
    trip.forEach((d, di) => {
      if (di === skipDay) return;
      const color = CITY[SLEEP[di]].color;
      let prev = null;
      d.stops.forEach((s, si) => {
        if (s.lat == null) return;
        if (prev && (prev.lat !== s.lat || prev.lon !== s.lon) && !s.flight) {
          L.polyline([[prev.lat, prev.lon], [s.lat, s.lon]], { color, weight: 2, opacity: 0.25, dashArray: '2 6', interactive: false }).addTo(ghosts);
        }
        prev = s;
        const key = `${s.lat},${s.lon}`;
        if (here.has(key)) return;
        if (!places.has(key)) places.set(key, { lat: s.lat, lon: s.lon, color, hotel: s.hotel, days: [], first: [di, si], names: new Set() });
        const g = places.get(key);
        if (!g.days.includes(di + 1)) g.days.push(di + 1);
        g.names.add(s.what);
        if (s.hotel) g.hotel = true;
      });
    });
    places.forEach((g) => {
      const label = (g.hotel ? '🏨 ' : '') + 'D' + (g.days.length > 3 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days.join(','));
      L.marker([g.lat, g.lon], { icon: pinIcon(label, g.color, 'ghost'), zIndexOffset: -500, title: `Day ${g.days.join(', ')}: ${[...g.names].join(' / ')}` })
        .on('click', () => go(g.first[0], g.first[1])).addTo(ghosts);
    });
  }

  function renderDay() {
    const d = trip[day];
    const color = CITY[SLEEP[day]].color;
    layer.clearLayers(); markers.clear();
    renderGhosts(day);

    // One marker per place; a place visited more than once lists every stop number.
    const groups = new Map();
    d.stops.forEach((s, i) => {
      if (s.lat == null) return;
      const key = `${s.lat},${s.lon}`;
      if (!groups.has(key)) groups.set(key, { lat: s.lat, lon: s.lon, idx: [], hotel: false });
      const g = groups.get(key);
      g.idx.push(i);
      if (s.hotel) g.hotel = true;
    });

    // Route legs in visiting order, drawn as a trail of arrows with a travel-mode icon on each leg.
    legs = [];
    let prev = null;
    d.stops.forEach((s, i) => {
      if (s.lat == null) return;
      if (prev && (prev.lat !== s.lat || prev.lon !== s.lon)) {
        const m = legMode(s) || 'd';
        const a = [prev.lat, prev.lon], b = [s.lat, s.lon];
        legs.push({ a, b, color: m === 'f' ? '#64748b' : color });
        const tip = s.commute ? `${s.commute.label} · ${s.commute.dur}` : MODES[m].name;
        L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: pinIcon(MODES[m].icon, color, 'mode'), title: tip, zIndexOffset: -100 })
          .on('click', () => go(day, i)).addTo(layer);
      }
      prev = s;
    });
    drawArrows();

    groups.forEach((g) => {
      const nums = g.idx.map((i) => d.stops[i].n).join(',');
      const label = g.hotel ? `🏨<span>${nums}</span>` : nums;
      const cls = [g.hotel ? 'hotel' : '', g.idx.length > 1 || g.hotel ? 'wide' : ''].join(' ');
      const m = L.marker([g.lat, g.lon], { icon: pinIcon(label, color, cls), title: g.idx.map((i) => d.stops[i].what).join(' / ') });
      m.on('click', () => {
        const later = g.idx.find((i) => i > stop);
        const pick = g.idx.includes(stop) ? (later ?? g.idx[0]) : g.idx[0];
        go(day, pick);
      });
      m.addTo(layer);
      g.idx.forEach((i) => markers.set(i, { m }));
    });

    const pts = [...groups.values()].map((g) => [g.lat, g.lon]);
    if (pts.length > 1) map.fitBounds(pts, { ...fitPad(), maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14);

    $('#dayhead').innerHTML = `<h2>${esc(d.title)}</h2><p>${esc(d.sub)}</p>`;
    $('#timeline').innerHTML = d.stops.map((s, i) => {
      const lm = legMode(s);
      const move = s.commute ? `<li class="move">${s.commute.icon} ${esc(s.commute.label)} · ${esc(s.commute.dur)}</li>`
        : (lm === 'f' ? `<li class="move">✈️ Flight</li>` : '');
      return `${move}<li><button class="stop" data-i="${i}"><span class="num" style="background:${color}">${s.hotel ? '🏨' : s.n}</span><span class="t">${esc(s.time)}</span><span>${esc(s.what)}</span></button></li>`;
    }).join('');
    $('#timeline').querySelectorAll('.stop').forEach((b) => b.addEventListener('click', () => go(day, +b.dataset.i)));
  }

  function gallery(s) {
    // Real Google Maps photos of this place. Meals at generic spots, hotels and flights get none.
    const p = places[s.place];
    if (!p || s.hotel || s.flight) return '';
    return `<div class="gallery" data-pid="${esc(p.id)}" aria-label="Photos of ${esc(p.name)}"><div class="gph"></div><div class="gph"></div></div>
      <div class="gcount">Loading photos from Google Maps…</div>`;
  }

  async function placePhotos(id) {
    const ck = `ph:${id}`;
    try {
      const c = JSON.parse(localStorage.getItem(ck) || 'null');
      if (c && Date.now() - c.t < 12 * 3600e3) return c.p;
    } catch (e) { /* storage unavailable */ }
    const r = await fetch(`https://places.googleapis.com/v1/places/${id}?fields=photos&key=${GKEY}`);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const p = (j.photos || []).slice(0, 6).map((x) => ({
      name: x.name,
      by: (x.authorAttributions || []).map((a) => ({ n: a.displayName, u: a.uri })),
    }));
    try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), p })); } catch (e) { /* ignore */ }
    return p;
  }

  async function fillGallery() {
    const g = $('#card .gallery[data-pid]');
    if (!g) return;
    const count = g.nextElementSibling;
    try {
      const pics = await placePhotos(g.dataset.pid);
      if (!g.isConnected) return;
      if (!pics.length) { g.remove(); count.remove(); return; }
      const w = Math.min(1200, Math.round(Math.min(window.innerWidth, 420) * (window.devicePixelRatio || 1)));
      g.innerHTML = pics.map((p, i) => `<figure>
        <img src="https://places.googleapis.com/v1/${esc(p.name)}/media?maxWidthPx=${w}&key=${GKEY}" alt="Photo ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}" onerror="this.parentNode.remove()">
        ${p.by.length ? `<figcaption>${p.by.map((a) => `<a href="${esc(a.u)}" target="_blank" rel="noopener">${esc(a.n)}</a>`).join(', ')}</figcaption>` : ''}
      </figure>`).join('');
      count.textContent = `${pics.length} photos from Google Maps${pics.length > 1 ? ' · swipe →' : ''}`;
    } catch (e) {
      if (g.isConnected) { g.remove(); count.remove(); }
    }
  }

  function videos(s) {
    const v = (media[s.tag] || {}).videos || [];
    if (!v.length) return s.tiktok ? `<a class="tt-more" href="${esc(s.tiktok)}" target="_blank" rel="noopener">🎬 Browse #${esc(s.tag)} on TikTok</a>` : '';
    return `<details class="videos"><summary>🎬 Watch ${v.length} TikTok${v.length > 1 ? 's' : ''}</summary>
      <div class="vids" data-ids="${v.map((x) => x.id).join(',')}"></div>
      ${s.tiktok ? `<a class="tt-more" href="${esc(s.tiktok)}" target="_blank" rel="noopener">More on #${esc(s.tag)}</a>` : ''}</details>`;
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
    ].join('');

    let nextBtn;
    if (next) {
      const lm = legMode(next);
      const how = next.commute ? `${next.commute.icon} ${esc(next.commute.label)} · ${esc(next.commute.dur)}` : (lm === 'f' ? '✈️ Flight' : 'Same place');
      nextBtn = `<button class="next" data-go="next"><small>${how}</small>Next: ${next.n}. ${esc(next.what)} →</button>`;
    } else if (nextDay) {
      nextBtn = `<button class="next" data-go="next"><small>End of the day</small>${esc(nextDay.title)} →</button>`;
    } else {
      nextBtn = `<button class="next" disabled><small>End of the trip</small>Home</button>`;
    }

    $('#card').innerHTML = `
      <div class="peek">
        <div class="when" style="color:${color}">${s.hotel ? '🏨 ' : ''}${s.n}. ${esc(s.time)}</div>
        <h3>${esc(s.what)}</h3>
      </div>
      ${gallery(s)}
      <div class="body">
        ${s.lat == null ? '<p class="offmap">Not shown on the map.</p>' : ''}
        ${s.details ? `<p class="details">${esc(s.details)}</p>` : ''}
        <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="links">${links}</div>
        ${videos(s)}
      </div>
      <div class="nav">
        <button data-go="prev" ${stop === 0 && day === 0 ? 'disabled' : ''} aria-label="Previous stop">←</button>
        ${nextBtn}
      </div>`;
    $('#card').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => step(b.dataset.go === 'prev' ? -1 : 1)));
    const det = $('#card').querySelector('details.videos');
    if (det) det.addEventListener('toggle', () => {
      const box = det.querySelector('.vids');
      if (det.open && !box.childElementCount) {
        box.innerHTML = box.dataset.ids.split(',').map((id) =>
          `<iframe src="https://www.tiktok.com/embed/v2/${id}" loading="lazy" allow="encrypted-media; fullscreen" allowfullscreen title="TikTok video"></iframe>`).join('');
      }
    });
    fillGallery();
    $('#panel').scrollTop = 0;

    $('#timeline').querySelectorAll('.stop').forEach((b) => b.classList.toggle('on', +b.dataset.i === stop));
    document.querySelectorAll('.pin.on').forEach((p) => p.classList.remove('on'));
    const mk = markers.get(stop);
    if (mk) {
      const el = mk.m.getElement()?.querySelector('.pin');
      if (el) el.classList.add('on');
      mk.m.setZIndexOffset(1000);
      const ll = mk.m.getLatLng();
      if (mobile()) {
        // Centre the dot in the part of the map above the sheet.
        const sheet = Math.min($('#panel').getBoundingClientRect().height, window.innerHeight * 0.5);
        const p = map.latLngToContainerPoint(ll);
        const size = map.getSize();
        const visible = p.x > 30 && p.x < size.x - 30 && p.y > 30 && p.y < size.y - sheet - 30;
        if (!visible) map.panBy(p.subtract(L.point(size.x / 2, (size.y - sheet) / 2)), { animate: true });
      } else if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll);
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

  // Bottom sheet on phones: tap or drag the handle to expand or shrink.
  function initSheet() {
    const panel = $('#panel'), handle = $('#handle');
    const set = (open) => { panel.classList.toggle('open', open); handle.setAttribute('aria-expanded', open); };
    handle.addEventListener('click', () => set(!panel.classList.contains('open')));
    let y0 = null;
    handle.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    handle.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dy) > 30) set(dy < 0);
      y0 = null;
    });
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
        <div class="tablewrap"><table><thead><tr><th>Category</th><th class="num">Planned</th><th class="num">Share</th></tr></thead><tbody>
          ${cats.map((c) => `<tr><td><span class="sw" style="background:${c.color}"></span>${esc(c.name)}</td><td class="num">${fmt(c.total)}</td><td class="num">${Math.round((c.total / total) * 100)}%</td></tr>`).join('')}
          <tr><th>Total</th><th class="num">${fmt(total)}</th><th></th></tr>
        </tbody></table></div>
      </div>
      <div class="items">${budget.items.map((it) => `<div class="item"><div><b>${esc(it.item)}</b><small class="muted">${esc(it.category)}${it.notes ? ' · ' + esc(it.notes) : ''}</small></div><span class="num">${fmt(it.planned)}</span></div>`).join('')}</div>`;
  }

  function setView(v) {
    document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#mapView').hidden = v !== 'map';
    $('#days').hidden = v !== 'map';
    $('#budgetView').hidden = v !== 'budget';
    document.body.classList.toggle('budget-on', v === 'budget');
    if (v === 'map') map.invalidateSize();
  }

  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('keydown', (e) => {
    if ($('#mapView').hidden || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  Promise.all(['trip', 'budget', 'media', 'places'].map((f) => fetch(`data/${f}.json`).then((r) => r.json())))
    .then(([t, b, m, p]) => {
      trip = t; budget = b; media = m; places = p;
      initMap(); initSheet(); renderBudget();
      const h = location.hash.match(/^#day(\d+)\/(\d+)/);
      if (h && trip[+h[1] - 1]) go(+h[1] - 1, Math.min(+h[2] - 1, trip[+h[1] - 1].stops.length - 1));
      else go(-1, 0);
    })
    .catch((err) => { document.body.insertAdjacentHTML('beforeend', `<p style="padding:16px">Could not load the trip data: ${esc(err.message)}</p>`); });
})();
