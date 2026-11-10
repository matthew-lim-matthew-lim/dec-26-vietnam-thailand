// Trip site: click a dot on the map to see that stop, then step to the next one.
(() => {
  const CITY = { saigon: { name: 'Saigon', color: '#c2410c' }, hatien: { name: 'Ha Tien', color: '#15803d' },
    phuquoc: { name: 'Phu Quoc', color: '#0e7490' }, bangkok: { name: 'Bangkok', color: '#7c3aed' } };
  // Where each night is spent (index = day number - 1).
  const SLEEP = ['saigon', 'saigon', 'saigon', 'hatien', 'phuquoc', 'phuquoc', 'phuquoc', 'phuquoc',
    'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok', 'bangkok'];
  const BASES = [
    { city: 'saigon', lat: 10.7769, lon: 106.7009, dates: '19–22 Dec', nights: 3, hotel: 'Hotel in District 1', day: 0 },
    { city: 'hatien', lat: 10.3815, lon: 104.4875, dates: '22–23 Dec', nights: 1, hotel: 'Riverside hotel in Ha Tien, near the ferry', day: 3, by: 'u' },
    { city: 'phuquoc', lat: 10.175, lon: 103.965, dates: '23–27 Dec', nights: 4, hotel: 'Resort on Long Beach', day: 4, by: 'b' },
    { city: 'bangkok', lat: 13.725, lon: 100.515, dates: '27 Dec – 3 Jan', nights: 7, hotel: 'Hotel in Bang Rak, by the river', day: 8 },
  ];
  const MODES = {
    w: { icon: '🚶', name: 'Walk' }, d: { icon: '🚕', name: 'Grab or taxi' }, t: { icon: '🚇', name: 'Train' },
    u: { icon: '🚌', name: 'Bus' }, b: { icon: '⛴️', name: 'Boat' }, s: { icon: '🛵', name: 'Scooter' }, f: { icon: '✈️', name: 'Flight' },
  };
  // Late-December sunrise and sunset (hours) for each city, for the day bar.
  const SUN = { saigon: [6.1, 17.6], hatien: [6.2, 17.75], phuquoc: [6.25, 17.85], bangkok: [6.6, 18.0] };
  const CAT_COLORS = ['#c2410c', '#0e7490', '#7c3aed', '#ca8a04', '#be185d', '#15803d', '#2563eb', '#9333ea', '#0f766e', '#64748b', '#b45309'];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mobile = () => window.matchMedia('(max-width: 860px)').matches;

  let trip = [], book = null, budget = null, media = {}, places = {}, steps = {}, spots = {}, day = null, stop = 0;
  // Google Maps Platform key. It only works on matthew-lim-matthew-lim.github.io (referrer restricted).
  const GKEY = 'AIzaSyC22mrrewNOFmwmXCY0waUHCl3sQ32IcR4';
  let map, layer, ghosts, arrows, legs = [], markers = new Map(), legMarkers = new Map(), selLeg = null;

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
    legs.forEach(({ a, b, color, i }) => {
      const sel = selLeg === i, dim = selLeg != null && !sel;
      const pa = map.project(a, z), pb = map.project(b, z);
      const len = pa.distanceTo(pb);
      if (len < 30) return;
      const ux = (pb.x - pa.x) / len, uy = (pb.y - pa.y) / len;
      const off = L.point(-uy * 7, ux * 7);
      const ang = Math.atan2(uy, ux) * 180 / Math.PI;
      // Solid line under the arrows, nudged by the same offset.
      const ends = [map.unproject(pa.add(off), z), map.unproject(pb.add(off), z)];
      if (sel) L.polyline(ends, { color: '#111827', weight: 15, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(arrows);
      L.polyline(ends, { color, weight: sel ? 10 : 8, opacity: dim ? 0.3 : 0.85, lineCap: 'round', interactive: false }).addTo(arrows);
      const n = Math.max(1, Math.floor((len - 40) / 22));
      // Each chevron is a tiny white polyline in the same layer as the line, so they always line up.
      const u = L.point(ux, uy), v = L.point(-uy, ux);
      const P = (pt) => map.unproject(pt, z);
      for (let k = 1; k <= n; k++) {
        const t = (20 + (k - 0.5) * ((len - 40) / n)) / len;
        const c = pa.add(pb.subtract(pa).multiplyBy(t)).add(off);
        L.polyline([P(c.subtract(u.multiplyBy(3)).add(v.multiplyBy(3.5))), P(c.add(u.multiplyBy(2))), P(c.subtract(u.multiplyBy(3)).subtract(v.multiplyBy(3.5)))],
          { color: '#fff', weight: 2.5, opacity: dim ? 0.4 : 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(arrows);
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


  // "8:30–9:45 am", "11 am – 1:30 pm", "7:30 pm – 12:30 am" -> [start, end] in hours (end may pass 24).
  function span(t) {
    const m = String(t).replace(/noon/g, '12 pm').replace(/midnight/g, '12 am')
      .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (!m) {
      const one = String(t).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
      if (!one) return null;
      const h = (+one[1] % 12) + (one[3] === 'pm' ? 12 : 0) + (+one[2] || 0) / 60;
      return [h, h + 0.25];
    }
    const h24 = (h, mm, ap) => (+h % 12) + (ap === 'pm' ? 12 : 0) + (+mm || 0) / 60;
    let b = h24(m[4], m[5], m[6]);
    let a = h24(m[1], m[2], m[3] || m[6]);
    if (!m[3] && a > b) a -= 12; // "11–1 pm" means 11 am to 1 pm
    if (b <= a) b += 24; // runs past midnight
    return [a, b];
  }
  const hm = (h) => { h = ((h % 24) + 24) % 24; const H = Math.floor(h), M = Math.round((h - H) * 60);
    return `${H % 12 || 12}${M ? ':' + String(M).padStart(2, '0') : ''} ${H < 12 ? 'am' : 'pm'}`; };

  // The whole day as one bar: night, sunrise, daylight, sunset, night, with each stop as a block on top.
  function renderBar(d) {
    const bar = $('#daybar');
    const [rise, set] = SUN[SLEEP[day]];
    const pc = (h) => `${(Math.max(0, Math.min(24, h)) / 24 * 100).toFixed(2)}%`;
    const sky = `linear-gradient(90deg,
      var(--night) 0, var(--night) ${pc(rise - 0.9)}, var(--dawn) ${pc(rise - 0.3)}, var(--sunrise) ${pc(rise + 0.2)},
      var(--day) ${pc(rise + 1.2)}, var(--day) ${pc(set - 1.2)}, var(--sunset) ${pc(set - 0.1)},
      var(--dusk) ${pc(set + 0.5)}, var(--night) ${pc(set + 1.2)}, var(--night) 100%)`;
    const color = CITY[SLEEP[day]].color;
    const lanes = [];
    const blocks = d.stops.map((st, i) => {
      const sp = span(st.time);
      if (!sp) return '';
      let lane = lanes.findIndex((end) => end <= sp[0] + 0.01);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = sp[1];
      const a = Math.max(0, sp[0]), b = Math.min(24, sp[1]);
      return `<button class="blk${st.hotel ? ' h' : ''}${st.flight ? ' f' : ''}${st.tour ? ' tour' : ''}" data-i="${i}" data-lane="${lane}"
        style="left:${pc(a)};width:calc(${pc(b - a)} - 1px);--c:${color}" title="${esc(st.time)} · ${esc(plain(st))}"
        aria-label="${esc(st.time)}: ${esc(plain(st))}"><span>${st.flight ? '✈️' : st.hotel ? '🏨' : st.n}</span></button>`;
    }).join('');
    const two = lanes.length > 1;
    bar.innerHTML = `<div class="now"><span></span></div><div class="sky${two ? ' two' : ''}" style="background:${sky}">${blocks}</div>
      <div class="ticks">${[0, 6, 12, 18, 24].map((h) => `<i style="left:${pc(h)}">${h === 12 ? 'noon' : h % 24 === 0 ? '12 am' : hm(h)}</i>`).join('')}
        <i class="sun" style="left:${pc(rise)}">🌅 ${hm(rise)}</i><i class="sun" style="left:${pc(set)}">🌇 ${hm(set)}</i></div>`;
    bar.hidden = false;
    bar.querySelectorAll('.blk').forEach((b) => b.addEventListener('click', () => go(day, +b.dataset.i)));
  }

  function renderOverview() {
    $('#daybar').hidden = true;
    layer.clearLayers(); markers.clear(); legMarkers.clear();
    renderGhosts(-1);
    const pts = BASES.map((b) => [b.lat, b.lon]);
    legs = [];
    for (let i = 1; i < BASES.length; i++) {
      const a = pts[i - 1], b = pts[i];
      legs.push({ a, b, color: '#64748b' });
      L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: pinIcon(MODES[BASES[i].by || 'f'].icon, '#64748b', 'mode'), interactive: false }).addTo(layer);
    }
    BASES.forEach((b) => {
      const c = CITY[b.city];
      L.marker([b.lat, b.lon], { icon: pinIcon(`🏨 ${c.name} · ${b.dates}`, c.color, 'big') })
        .on('click', () => go(b.day, 0)).addTo(layer);
    });
    map.fitBounds(pts, fitPad());
    drawArrows();
    $('#dayhead').innerHTML = `<h2>Whole trip</h2><p>Tap a city to open its first day, or pick a day above. Matthew flies from Sydney and Amy from Hong Kong; they meet in Saigon on 19 Dec, take the bus and ferry to Phu Quoc on 22–23 Dec, then both fly home from Bangkok on 3 Jan.</p>`;
    $('#card').classList.remove('tour');
    $('#card').innerHTML = `<div class="body">${BASES.map((b) => {
      const c = CITY[b.city];
      return `<p class="base"><span class="hotelchip" style="--c:${c.color}">🏨</span><span><b>${c.name}</b>, ${b.dates} (${b.nights} night${b.nights === 1 ? '' : 's'})<br><small class="muted">${b.hotel}</small></span></p>`;
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
    layer.clearLayers(); markers.clear(); legMarkers.clear();
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
        legs.push({ a, b, i, color: m === 'f' ? '#64748b' : color });
        const tip = s.commute ? `${s.commute.label} · ${s.commute.dur}` : MODES[m].name;
        const lm = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: pinIcon(MODES[m].icon, color, 'mode'), title: tip, zIndexOffset: -100 })
          .on('click', () => (s.commute ? goLeg(i) : go(day, i))).addTo(layer);
        legMarkers.set(i, lm);
      }
      prev = s;
    });
    drawArrows();

    groups.forEach((g) => {
      const nums = g.idx.map((i) => d.stops[i].n).join(',');
      const label = g.hotel ? `🏨<span>${nums}</span>` : nums;
      const cls = [g.hotel ? 'hotel' : '', g.idx.length > 1 || g.hotel ? 'wide' : ''].join(' ');
      const m = L.marker([g.lat, g.lon], { icon: pinIcon(label, color, cls), title: g.idx.map((i) => plain(d.stops[i])).join(' / ') });
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
    renderBar(d);
    $('#timeline').innerHTML = d.stops.map((s, i) => {
      const lm = legMode(s);
      const move = s.commute ? `<li><button class="move" data-leg="${i}">${s.commute.icon} ${esc(s.commute.label)} · ${esc(s.commute.dur)}</button></li>`
        : (lm === 'f' ? `<li><button class="move" data-fl="${i}">✈️ Flight</button></li>` : '');
      return `${move}<li><button class="stop${s.tour ? ' tour' : ''}" data-i="${i}"><span class="num" style="background:${color}">${s.hotel ? '🏨' : s.n}</span><span class="t">${esc(s.time)}</span><span>${label(s)}</span></button></li>`;
    }).join('');
    $('#timeline').querySelectorAll('.stop').forEach((b) => b.addEventListener('click', () => go(day, +b.dataset.i)));
    $('#timeline').querySelectorAll('.move[data-leg]').forEach((b) => b.addEventListener('click', () => goLeg(+b.dataset.leg)));
    $('#timeline').querySelectorAll('.move[data-fl]').forEach((b) => b.addEventListener('click', () => go(day, +b.dataset.fl)));
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

  // Step-by-step breakdown for tours and big sights (data/steps.json, keyed by stop name).
  // Guided tours and boat trips get a "Tour:" label and their own look everywhere they appear.
  const plain = (s) => (s.tour ? `Tour: ${s.what}` : s.what);
  const label = (s) => (s.tour ? `<span class="tourtag">Tour:</span> ${esc(s.what)}` : esc(s.what));

  function stepList(s) {
    const st = steps[s.what];
    if (!st) return '';
    return `<details class="steps" open><summary>${esc(st.label)} · ${st.steps.length} parts</summary><ol>
      ${st.steps.map((x) => `<li>${x.pid ? `<div class="sthumb" data-spid="${esc(x.pid)}"></div>` : ''}
        <div><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div></li>`).join('')}</ol></details>`;
  }

  function fillStepThumbs() {
    const w = Math.round(160 * (window.devicePixelRatio || 1));
    $('#card').querySelectorAll('.sthumb[data-spid]').forEach(async (el) => {
      try {
        const [p] = await placePhotos(el.dataset.spid);
        if (!p || !el.isConnected) { el.remove(); return; }
        el.innerHTML = `<img src="https://places.googleapis.com/v1/${esc(p.name)}/media?maxWidthPx=${w}&key=${GKEY}" alt="" loading="lazy" onerror="this.parentNode.remove()">`;
      } catch (e) { el.remove(); }
    });
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
      nextBtn = `<button class="next" data-go="next"><small>${how}</small>Next: ${next.n}. ${label(next)} →</button>`;
    } else if (nextDay) {
      nextBtn = `<button class="next" data-go="next"><small>End of the day</small>${esc(nextDay.title)} →</button>`;
    } else {
      nextBtn = `<button class="next" disabled><small>End of the trip</small>Home</button>`;
    }

    $('#card').classList.toggle('tour', !!s.tour);
    $('#card').innerHTML = `
      <div class="peek">
        <div class="when" style="color:${color}">${s.hotel ? '🏨 ' : ''}${s.n}. ${esc(s.time)}</div>
        <h3>${label(s)}</h3>
      </div>
      ${gallery(s)}
      <div class="body">
        ${s.lat == null ? '<p class="offmap">Not shown on the map.</p>' : ''}
        ${s.details ? `<p class="details">${esc(s.details)}</p>` : ''}
        ${stepList(s)}
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
    fillStepThumbs();
    // Desktop: start each stop at the top. Phones: keep the sheet where it is, so tapping Next or a
    // timeline row doesn't throw you back up.
    if (!mobile()) $('#panel').scrollTop = 0;
    $('#daybar').querySelectorAll('.blk').forEach((b) => b.classList.toggle('on', +b.dataset.i === stop));
    setNow(s.time);

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

  // Label a time above the day bar, kept inside the bar's width.
  function setNow(time) {
    const now = $('#daybar .now span'), sp = span(time);
    if (!now) return;
    now.parentNode.hidden = !sp;
    if (!sp) return;
    const mid = (Math.max(0, sp[0]) + Math.min(24, sp[1])) / 2 / 24 * 100;
    now.textContent = time;
    now.style.left = `${mid}%`;
    requestAnimationFrame(() => {
      const w = now.parentNode.clientWidth, half = now.offsetWidth / 2, x = mid / 100 * w;
      now.style.left = `${Math.min(w - half, Math.max(half, x))}px`;
    });
  }

  // A travel leg (the commute into stop i): highlight it in the list and on the map, and show its card.
  function goLeg(i) {
    const d = trip[day], s = d.stops[i], c = s.commute, from = d.stops[i - 1];
    const color = CITY[SLEEP[day]].color;
    selLeg = i;
    $('#card').classList.remove('tour');
    $('#card').innerHTML = `
      <div class="peek">
        <div class="when" style="color:${color}">${c.icon} ${esc(c.time)}</div>
        <h3>${esc(c.label)}</h3>
      </div>
      <div class="body">
        <dl class="facts">${[['How long', c.dur], ['From', c.from || (from && from.place)], ['To', s.place], ['How', (MODES[c.mode] || {}).name]]
          .filter((f) => f[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="links">${c.dir ? `<a href="${esc(c.dir)}" target="_blank" rel="noopener">🧭 Directions in Google Maps</a>` : ''}</div>
      </div>
      <div class="nav">
        <button data-to="${i - 1}" ${from ? '' : 'disabled'} aria-label="Previous stop">←</button>
        <button class="next" data-to="${i}"><small>Arrive</small>${s.n}. ${label(s)} →</button>
      </div>`;
    $('#card').querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => go(day, +b.dataset.to)));
    if (!mobile()) $('#panel').scrollTop = 0;
    $('#daybar').querySelectorAll('.blk').forEach((b) => b.classList.remove('on'));
    setNow(c.time);
    $('#timeline').querySelectorAll('.stop').forEach((b) => b.classList.remove('on'));
    $('#timeline').querySelectorAll('.move').forEach((b) => b.classList.toggle('on', +b.dataset.leg === i));
    document.querySelectorAll('.pin.on').forEach((p) => p.classList.remove('on'));
    drawArrows();
    const lm = legMarkers.get(i);
    if (lm) {
      lm.getElement()?.querySelector('.pin')?.classList.add('on');
      lm.setZIndexOffset(1000);
      const leg = legs.find((l) => l.i === i);
      map.fitBounds([leg.a, leg.b], { ...fitPad(), maxZoom: 16 });
    }
    history.replaceState(null, '', `#day${day + 1}/${i + 1}/leg`);
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
    const hadLeg = selLeg != null;
    selLeg = null;
    day = d; stop = s;
    if (dayChanged) { renderDays(); day < 0 ? renderOverview() : renderDay(); }
    if (day >= 0) {
      if (hadLeg && !dayChanged) {
        drawArrows();
        legMarkers.forEach((m) => m.setZIndexOffset(-100));
        $('#timeline').querySelectorAll('.move.on').forEach((b) => b.classList.remove('on'));
      }
      renderStop();
    }
    history.replaceState(null, '', day < 0 ? '#' : `#day${day + 1}/${stop + 1}`);
  }

  // Let a normal mouse wheel scroll the day picker sideways.
  function initDayWheel() {
    const el = $('#days');
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
    }, { passive: false });
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

  // "To book" page: everything that needs booking, with status for each person, estimates and links.
  let bookFilter = 'todo';
  function renderBook() {
    if (!book) return;
    const fmt = (n) => 'A$' + n.toLocaleString('en-AU');
    const URG = { now: ['Book now', 'now'], soon: ['Book soon', 'soon'], later: ['Closer to the time', 'later'] };
    // Each item has one status, or one per person; turn both into a list of slots.
    const slots = (it) => typeof it.status === 'string'
      ? [{ who: it.who || 'Matthew and Amy', st: it.status, price: it.price }]
      : Object.keys(it.status).map((w) => ({ who: w, st: it.status[w], price: (it.price || {})[w] || 0 }));
    const all = book.sections.flatMap((s) => s.items);
    const sl = all.flatMap(slots);
    const done = sl.filter((x) => x.st === 'booked');
    const left = sl.filter((x) => x.st !== 'booked');
    const leftCost = left.reduce((a, x) => a + (x.price || 0), 0);
    const doneCost = done.reduce((a, x) => a + (x.price || 0), 0);
    const card = (it) => {
      const ss = slots(it);
      const allDone = ss.every((x) => x.st === 'booked');
      if (bookFilter === 'todo' && allDone) return '';
      const [ul, uc] = URG[it.urgency] || URG.later;
      const pills = ss.map((x) => `<span class="bpill ${x.st === 'booked' ? 'ok' : ''}">${x.st === 'booked' ? '✓' : '○'} ${esc(x.who)} · ${x.st === 'booked' ? 'booked' : 'to book'}${x.price ? ' · ' + (x.st === 'booked' ? '' : '~') + fmt(x.price) : ''}</span>`).join('');
      const opts = (it.options || []).length ? `<div class="bopts"><small class="muted">Shortlist (about, for all nights)</small>${it.options.map((o) => `
        <div class="bopt"><div><b>${esc(o.name)}</b><small class="muted">${esc(o.note)}</small>
          <div class="links">${o.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div></div>
          <span class="num">~${fmt(o.price)}</span></div>`).join('')}</div>` : '';
      const links = (it.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
      const plan = it.day ? `<button class="inplan" data-d="${it.day - 1}">Day ${it.day} in the plan →</button>` : '';
      return `<article class="bcard${allDone ? ' done' : ''}">
        <div class="bhead"><div><h4>${esc(it.title)}</h4><small class="muted">${esc(it.date)}</small></div>
          ${allDone ? '<span class="burg ok">All booked</span>' : `<span class="burg ${uc}">${ul}</span>`}</div>
        <div class="bpills">${pills}</div>
        ${it.notes ? `<p>${esc(it.notes)}</p>` : ''}${opts}
        ${links || plan ? `<div class="links">${links}${plan}</div>` : ''}</article>`;
    };
    $('#bookView').innerHTML = `
      <h2>To book</h2>
      <p class="note">${esc(book.note)}</p>
      <div class="bsum">
        <div><b>${done.length} of ${sl.length}</b><small>booked</small></div>
        <div><b>${fmt(doneCost)}</b><small>spent on bookings</small></div>
        <div><b>~${fmt(leftCost)}</b><small>still to book</small></div>
      </div>
      <div class="bfilter" role="group" aria-label="Show">
        <button data-f="todo" class="${bookFilter === 'todo' ? 'on' : ''}">Still to book</button>
        <button data-f="all" class="${bookFilter === 'all' ? 'on' : ''}">Everything</button>
      </div>
      ${book.sections.map((s) => {
        const cards = s.items.map(card).join('');
        return cards ? `<section class="bsec"><h3>${esc(s.title)}</h3><div class="bgrid2">${cards}</div></section>` : '';
      }).join('')}
      <section class="bsec"><h3>No need to book</h3><ul class="nobook">${book.nobook.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
    $('#bookView').querySelectorAll('.bfilter button').forEach((b) => b.addEventListener('click', () => { bookFilter = b.dataset.f; renderBook(); }));
    $('#bookView').querySelectorAll('.inplan').forEach((b) => b.addEventListener('click', () => { setView('map'); go(+b.dataset.d, 0); }));
  }

  // "Popular on TikTok" page: the most-posted spots in each city, and where each sits in the plan.
  function renderSpots() {
    const where = (what) => {
      for (let d = 0; d < trip.length; d++) {
        const i = trip[d].stops.findIndex((x) => x.what === what);
        if (i >= 0) return { d, i, s: trip[d].stops[i] };
      }
      return null;
    };
    const cities = ['saigon', 'phuquoc', 'bangkok'];
    const all = cities.flatMap((c) => spots[c] || []);
    const inPlan = all.filter((x) => x.what && where(x.what)).length;
    $('#spotsView').innerHTML = `
      <h2>Popular on TikTok</h2>
      <p class="note">The most-posted spots in each place on this trip. ${inPlan} of ${all.length} are already in the plan; tap one to jump to it on the map.</p>
      ${cities.map((c) => {
        const { name, color } = CITY[c];
        return `<section class="spotcity"><h3><span class="dot" style="background:${color}"></span>${esc(name)}</h3><div class="spotgrid">
        ${(spots[c] || []).map((x) => {
          const w = x.what && where(x.what);
          const plan = w
            ? `<button class="inplan" data-d="${w.d}" data-i="${w.i}" style="--c:${color}">✓ Day ${w.d + 1} · ${esc(w.s.time)} →</button>`
            : `<p class="notplan">${esc(x.note || 'Not in the plan yet.')}</p>`;
          return `<article class="spot${w ? '' : ' out'}">
            <div class="sphoto"${x.pid ? ` data-spid="${esc(x.pid)}"` : ''}></div>
            <div class="sbody"><h4>${esc(x.name)}</h4><p>${esc(x.why)}</p>${plan}
              <div class="links"><a class="chip" href="${esc(x.maps)}" target="_blank" rel="noopener">📍 Google Maps</a>
              <a class="chip" href="https://www.tiktok.com/tag/${esc(x.tag)}" target="_blank" rel="noopener">🎬 #${esc(x.tag)}</a></div></div>
          </article>`;
        }).join('')}</div></section>`;
      }).join('')}`;
    $('#spotsView').querySelectorAll('.inplan').forEach((b) => b.addEventListener('click', () => {
      setView('map'); go(+b.dataset.d, +b.dataset.i);
    }));
  }

  let spotsFilled = false;
  function fillSpotPhotos() {
    if (spotsFilled) return;
    spotsFilled = true;
    const w = Math.round(Math.min(480, window.innerWidth) * (window.devicePixelRatio || 1));
    $('#spotsView').querySelectorAll('.sphoto[data-spid]').forEach(async (el) => {
      try {
        const [p] = await placePhotos(el.dataset.spid);
        if (!p) return;
        el.innerHTML = `<img src="https://places.googleapis.com/v1/${esc(p.name)}/media?maxWidthPx=${w}&key=${GKEY}" alt="" loading="lazy" onerror="this.remove()">`;
      } catch (e) { /* keep the blank tile */ }
    });
  }

  function setView(v) {
    document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#mapView').hidden = v !== 'map';
    $('#days').hidden = v !== 'map';
    $('#budgetView').hidden = v !== 'budget';
    $('#spotsView').hidden = v !== 'spots';
    $('#bookView').hidden = v !== 'book';
    document.body.classList.toggle('budget-on', v === 'budget' || v === 'spots' || v === 'book');
    if (v === 'book') window.scrollTo(0, 0);
    if (v === 'spots') { fillSpotPhotos(); window.scrollTo(0, 0); }
    if (v === 'map') map.invalidateSize();
  }

  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('keydown', (e) => {
    if ($('#mapView').hidden || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });


  Promise.all(['trip', 'budget', 'media', 'places', 'steps', 'tiktok', 'book'].map((f) => fetch(`data/${f}.json`).then((r) => r.json())))
    .then(([t, b, m, p, st, tk, bk]) => {
      trip = t; budget = b; media = m; places = p; steps = st; spots = tk; book = bk;
      trip.forEach((d) => d.stops.forEach((x) => { x.tour = /tour|boat/i.test((steps[x.what] || {}).label || ''); }));
      initMap(); initSheet(); initDayWheel(); renderBudget(); renderSpots(); renderBook();
      const h = location.hash.match(/^#day(\d+)\/(\d+)(\/leg)?/);
      if (location.hash === '#book') setView('book');
      if (h && trip[+h[1] - 1]) {
        const di = +h[1] - 1, si = Math.min(+h[2] - 1, trip[di].stops.length - 1);
        go(di, si);
        if (h[3] && trip[di].stops[si].commute) goLeg(si);
      }
      else go(-1, 0);
    })
    .catch((err) => { document.body.insertAdjacentHTML('beforeend', `<p style="padding:16px">Could not load the trip data: ${esc(err.message)}</p>`); });
})();
