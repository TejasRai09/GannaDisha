/* Varietal plot map — 146k quadrilateral plots on satellite imagery.
   Geometry and attributes arrive as typed arrays and are handed to deck.gl as
   binary attributes, so nothing is ever materialised as per-feature JS objects. */

const DATA = 'data/';
const VERT = 4;                 // every plot is a quad
const A = 18;                   // int32 stride in attrs.bin
const M = 2;                    // float32 stride in measures.bin
const GI = 6, GF = 3;           // grower record strides

// attrs.bin column order, mirrors build_web.py
const AI = {
  village: 0, society: 1, gate: 2, variety: 3, crop_category: 4, crop_type: 5,
  field_staff: 6, village_staff: 7, zonal_incharge: 8, zonal_manager: 9,
  zone_head: 10, region: 11, soil_type: 12, land_type: 13, plant_method: 14,
  crop_condition: 15, grower_start: 16, grower_count: 17
};

const FILTERS = [
  ['region', 'Region'], ['society', 'Society'], ['gate', 'Gate & centre'],
  ['village', 'Village'], ['variety', 'Variety'], ['crop_category', 'Crop category'],
  ['crop_type', 'Crop type'], ['field_staff', 'Field staff']
];

const PALETTE = [
  [78, 168, 222], [126, 231, 135], [244, 162, 97], [231, 111, 81], [176, 137, 224],
  [42, 195, 178], [240, 200, 87], [237, 120, 176], [131, 192, 92], [94, 137, 214],
  [216, 92, 92], [102, 208, 226], [201, 168, 106], [154, 124, 186], [88, 186, 148],
  [230, 145, 120], [120, 155, 235], [186, 210, 92], [226, 130, 210], [72, 180, 200],
  [205, 118, 74], [140, 200, 170], [178, 146, 226], [212, 180, 140], [110, 175, 118]
];
const RAMP = [[13, 60, 90], [23, 110, 140], [42, 165, 160], [140, 205, 135], [240, 210, 100], [235, 145, 70]];

const state = {
  meta: null, geom: null, attrs: null, meas: null, gi: null, gf: null,
  n: 0, startIdx: null, visible: null, colorBy: 'variety',
  filters: {}, opacity: 0.75, outlines: true, labels: true,
  selected: -1, colorKeyOf: null, catSpec: null, rampStops: null
};

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-IN');
const fmt1 = n => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

/* ------------------------------------------------------------------ load */

async function fetchBin(name, Type, onProgress) {
  const res = await fetch(DATA + name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const buf = await res.arrayBuffer();
  onProgress && onProgress();
  return new Type(buf);
}

async function load() {
  const steps = 6;
  let done = 0;
  const tick = msg => {
    done++;
    $('load-fill').style.width = `${(done / steps) * 100}%`;
    if (msg) $('load-msg').textContent = msg;
  };

  $('load-msg').textContent = 'Loading plot index…';
  state.meta = await (await fetch(DATA + 'meta.json')).json();
  tick('Loading plot geometry…');

  const [geom, attrs, meas, gi, gf] = await Promise.all([
    fetchBin('geom.bin', Float64Array, () => tick()),
    fetchBin('attrs.bin', Int32Array, () => tick()),
    fetchBin('measures.bin', Float32Array, () => tick()),
    fetchBin('growers_i.bin', Int32Array, () => tick()),
    fetchBin('growers_f.bin', Float32Array, () => tick())
  ]);

  Object.assign(state, { geom, attrs, meas, gi, gf, n: state.meta.n });
  state.startIdx = new Uint32Array(state.n + 1);
  for (let i = 0; i <= state.n; i++) state.startIdx[i] = i * VERT;
  state.visible = new Uint8Array(state.n).fill(1);
  $('load-msg').textContent = 'Drawing map…';
}

/* ---------------------------------------------------------------- colour */

function shade(rgb, f) { return rgb.map(c => Math.max(0, Math.min(255, Math.round(c * f)))); }

// Cycle the base palette through lightness bands so large categorical sets
// (332 villages, hundreds of staff) still resolve into distinguishable colours.
function catColor(i) {
  const p = PALETTE[i % PALETTE.length];
  const band = Math.floor(i / PALETTE.length) % 4;
  return [p, shade(p, 0.68), shade(p, 1.22), shade(p, 0.85)][band];
}

function rampColor(t) {
  t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
}

function buildColorKey() {
  const cb = state.colorBy;
  state.catSpec = null;

  if (cb === 'none') { state.colorKeyOf = null; return; }

  if (cb === 'area') {
    const brk = [0.1, 0.2, 0.35, 0.6, 1.0];
    state.colorKeyOf = i => {
      const ha = state.meas[i * M];
      let k = 0; while (k < brk.length && ha > brk[k]) k++;
      return rampColor(k / brk.length);
    };
    state.rampStops = brk;
    return;
  }

  const col = AI[cb];
  const names = state.meta.dicts[cb];
  // Colour slots are assigned on the full dataset so a category keeps the same
  // colour as filters change; the legend re-counts against what is visible.
  const counts = new Int32Array(names.length);
  for (let i = 0; i < state.n; i++) counts[state.attrs[i * A + col]]++;
  const rank = Array.from(names.keys()).sort((a, b) => counts[b] - counts[a]);
  const slot = new Int32Array(names.length);
  rank.forEach((cat, r) => slot[cat] = r);

  state.colorKeyOf = i => catColor(slot[state.attrs[i * A + col]]);
  state.catSpec = { col, names, slot };
}

function buildColors() {
  const n = state.n, alpha = Math.round(state.opacity * 255);
  const fill = new Uint8Array(n * VERT * 4);
  const line = new Uint8Array(n * VERT * 4);
  const keyOf = state.colorKeyOf;

  for (let i = 0; i < n; i++) {
    const vis = state.visible[i];
    const c = keyOf ? keyOf(i) : [78, 168, 222];
    const a = vis ? alpha : 0;
    const la = vis ? Math.min(255, alpha + 70) : 0;
    const lc = shade(c, 1.35);
    for (let v = 0; v < VERT; v++) {
      const o = (i * VERT + v) * 4;
      fill[o] = c[0]; fill[o + 1] = c[1]; fill[o + 2] = c[2]; fill[o + 3] = a;
      line[o] = lc[0]; line[o + 1] = lc[1]; line[o + 2] = lc[2]; line[o + 3] = la;
    }
  }
  return { fill, line };
}

/* --------------------------------------------------------------- filters */

function passes(i, skip) {
  for (const [key] of FILTERS) {
    if (key === skip) continue;
    const want = state.filters[key];
    if (want === undefined || want === -1) continue;
    if (state.attrs[i * A + AI[key]] !== want) return false;
  }
  return true;
}

function applyFilters() {
  let count = 0, ha = 0, growers = 0;
  for (let i = 0; i < state.n; i++) {
    const ok = passes(i, null) ? 1 : 0;
    state.visible[i] = ok;
    if (ok) { count++; ha += state.meas[i * M]; growers += state.attrs[i * A + AI.grower_count]; }
  }
  $('stats').innerHTML = `
    <div><b>${fmt(count)}</b><span>Plots shown</span></div>
    <div><b>${fmt1(ha)}</b><span>Hectares</span></div>
    <div><b>${fmt(growers)}</b><span>Grower records</span></div>
    <div><b>${fmt(new Set(visibleVillages()).size)}</b><span>Villages</span></div>`;
  refreshFilterOptions();
  drawLegend();
  render();
}

function visibleVillages() {
  const out = [];
  for (let i = 0; i < state.n; i++) if (state.visible[i]) out.push(state.attrs[i * A + AI.village]);
  return out;
}

function refreshFilterOptions() {
  for (const [key, label] of FILTERS) {
    const sel = $('f_' + key);
    if (!sel) continue;
    const present = new Set();
    for (let i = 0; i < state.n; i++) if (passes(i, key)) present.add(state.attrs[i * A + AI[key]]);
    const names = state.meta.dicts[key];
    const cur = state.filters[key] ?? -1;
    const opts = [...present].sort((a, b) => (names[a] || '').localeCompare(names[b] || ''));
    sel.innerHTML = `<option value="-1">All ${label.toLowerCase()} (${opts.length})</option>` +
      opts.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${esc(names[c] || '(blank)')}</option>`).join('');
  }
}

function buildFilterUI() {
  $('filters').innerHTML = FILTERS.map(([key, label]) =>
    `<div class="filter"><label class="lbl">${label}</label><select id="f_${key}"></select></div>`).join('');
  for (const [key] of FILTERS) {
    state.filters[key] = -1;
    $('f_' + key).onchange = e => {
      state.filters[key] = +e.target.value;
      applyFilters();
    };
  }
}

/* ---------------------------------------------------------------- render */

let map, overlay;

function polygonData(colors) {
  return {
    length: state.n,
    startIndices: state.startIdx,
    attributes: {
      getPolygon: { value: state.geom, size: 2 },
      getFillColor: { value: colors.fill, size: 4 }
    }
  };
}

function pathData(colors) {
  return {
    length: state.n,
    startIndices: state.startIdx,
    attributes: {
      getPath: { value: state.geom, size: 2 },
      getColor: { value: colors.line, size: 4 }
    }
  };
}

function labelData() {
  if (!state.labels) return [];
  const seen = new Set(visibleVillages().map(v => state.meta.dicts.village[v]));
  return state.meta.villages.filter(v => seen.has(v.name));
}

function render() {
  const colors = buildColors();
  const z = map ? map.getZoom() : 11;
  const layers = [
    new deck.SolidPolygonLayer({
      id: 'plots',
      data: polygonData(colors),
      _normalize: false,
      filled: true,
      extruded: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 150],
      onHover: onHover,
      onClick: onClick
    })
  ];

  if (state.outlines && z >= 12) {
    layers.push(new deck.PathLayer({
      id: 'edges',
      data: pathData(colors),
      _pathType: 'loop',
      widthUnits: 'meters',
      widthMinPixels: 0.6,
      widthMaxPixels: 2.5,
      getWidth: z >= 16 ? 1.2 : 2.5,
      pickable: false
    }));
  }

  if (state.selected >= 0) {
    layers.push(new deck.PathLayer({
      id: 'sel',
      data: [{ path: plotRing(state.selected) }],
      getPath: d => d.path,
      _pathType: 'loop',
      getColor: [255, 255, 255],
      widthUnits: 'pixels',
      getWidth: 3,
      widthMinPixels: 3
    }));
  }

  if (state.labels && z >= 11.5 && z < 16) {
    layers.push(new deck.TextLayer({
      id: 'villages',
      data: labelData(),
      getPosition: d => [d.x, d.y],
      getText: d => d.name,
      getSize: 12,
      getColor: [255, 255, 255, 230],
      outlineWidth: 3,
      outlineColor: [0, 0, 0, 200],
      fontSettings: { sdf: true, buffer: 8 },
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      billboard: true,
      sizeUnits: 'pixels',
      pickable: false
    }));
  }

  overlay.setProps({ layers });
}

function plotRing(i) {
  const g = state.geom, o = i * 8;
  return [[g[o], g[o + 1]], [g[o + 2], g[o + 3]], [g[o + 4], g[o + 5]], [g[o + 6], g[o + 7]]];
}

/* ------------------------------------------------------------ interaction */

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function dictVal(field, i) {
  return state.meta.dicts[field][state.attrs[i * A + AI[field]]] || '—';
}

function onHover(info) {
  const tip = $('tooltip');
  const i = info.index;
  if (i < 0 || !info.picked || !state.visible[i]) { tip.classList.add('hidden'); return; }
  const gc = state.attrs[i * A + AI.grower_count];
  const first = state.attrs[i * A + AI.grower_start];
  const name = state.meta.grower_dicts.grower[state.gi[first * GI]] || '—';
  tip.innerHTML = `
    <div class="t-title">${esc(dictVal('village', i))}</div>
    <div class="t-row">Grower <b>${esc(name)}</b>${gc > 1 ? ` +${gc - 1} more` : ''}</div>
    <div class="t-row">Variety <b>${esc(dictVal('variety', i))}</b></div>
    <div class="t-row">Area <b>${state.meas[i * M].toFixed(3)} ha</b></div>`;
  tip.classList.remove('hidden');
  const pad = 14;
  tip.style.left = Math.min(info.x + pad, window.innerWidth - 275) + 'px';
  tip.style.top = Math.min(info.y + pad, window.innerHeight - 110) + 'px';
}

function onClick(info) {
  const i = info.index;
  if (i < 0 || !info.picked || !state.visible[i]) return;
  showDetail(i);
}

function showDetail(i) {
  state.selected = i;
  const start = state.attrs[i * A + AI.grower_start];
  const count = state.attrs[i * A + AI.grower_count];
  const gd = state.meta.grower_dicts;
  const epoch = new Date(state.meta.epoch);

  const growers = [];
  for (let k = start; k < start + count; k++) {
    const days = state.gf[k * GF + 2];
    let date = '—';
    if (days >= 0) {
      const d = new Date(epoch.getTime() + days * 864e5);
      date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    growers.push(`
      <div class="grower">
        <span class="g-share">${state.gf[k * GF + 1].toFixed(0)}% share</span>
        <div class="g-name">${esc(gd.grower[state.gi[k * GI]] || '—')}</div>
        <div class="g-meta">
          S/o ${esc(gd.father[state.gi[k * GI + 1]] || '—')} &middot; Code ${state.gi[k * GI + 5]}<br>
          ${esc(gd.variety[state.gi[k * GI + 2]] || '—')} &middot;
          ${esc(gd.crop_type[state.gi[k * GI + 3]] || '—')} &middot;
          ${state.gf[k * GF].toFixed(3)} ha<br>
          Surveyed ${date}
        </div>
      </div>`);
  }

  const rows = [
    ['Society', dictVal('society', i)], ['Gate &amp; centre', dictVal('gate', i)],
    ['Region', dictVal('region', i)], ['Soil type', dictVal('soil_type', i)],
    ['Land type', dictVal('land_type', i)], ['Planting method', dictVal('plant_method', i)],
    ['Crop condition', dictVal('crop_condition', i)], ['Crop category', dictVal('crop_category', i)]
  ];
  const staff = [
    ['Field staff', dictVal('field_staff', i)], ['Village staff', dictVal('village_staff', i)],
    ['Zonal incharge', dictVal('zonal_incharge', i)], ['Zonal manager', dictVal('zonal_manager', i)],
    ['Zone head', dictVal('zone_head', i)]
  ];
  const ring = plotRing(i);
  const centre = [ring.reduce((s, p) => s + p[0], 0) / 4, ring.reduce((s, p) => s + p[1], 0) / 4];

  $('detail-body').innerHTML = `
    <h2>${esc(dictVal('village', i))}</h2>
    <div class="d-sub">Plot ${i + 1} of ${fmt(state.n)} &middot; ${centre[1].toFixed(5)}, ${centre[0].toFixed(5)}</div>
    <div class="d-grid">
      <div><b>${state.meas[i * M].toFixed(3)} ha</b><span>Mapped area</span></div>
      <div><b>${count}</b><span>Grower${count > 1 ? 's' : ''}</span></div>
      <div><b>${esc(dictVal('variety', i))}</b><span>Variety</span></div>
      <div><b>${esc(dictVal('crop_type', i))}</b><span>Crop type</span></div>
    </div>
    <h3>Growers on this plot</h3>${growers.join('')}
    <h3>Plot record</h3><table>${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>
    <h3>Staff hierarchy</h3><table>${staff.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
  $('detail').classList.remove('hidden');
  render();
}

/* ---------------------------------------------------------------- search */

function buildSearchIndex() {
  const idx = [];
  state.meta.villages.forEach(v => idx.push({ kind: 'village', name: v.name, sub: `${fmt(v.n)} plots · ${fmt1(v.ha)} ha`, x: v.x, y: v.y, z: 14.5 }));

  // First plot per grower name gives the search result somewhere to fly to.
  const seen = new Map();
  for (let i = 0; i < state.n; i++) {
    const s = state.attrs[i * A + AI.grower_start], c = state.attrs[i * A + AI.grower_count];
    for (let k = s; k < s + c; k++) {
      const code = state.gi[k * GI];
      if (!seen.has(code)) seen.set(code, i);
    }
  }
  const gnames = state.meta.grower_dicts.grower;
  seen.forEach((plot, code) => {
    const name = gnames[code];
    if (!name) return;
    const ring = plotRing(plot);
    idx.push({
      kind: 'grower', name, plot,
      sub: dictVal('village', plot),
      x: ring.reduce((s, p) => s + p[0], 0) / 4,
      y: ring.reduce((s, p) => s + p[1], 0) / 4,
      z: 17.5
    });
  });

  const staffSeen = new Set();
  for (let i = 0; i < state.n; i++) {
    const c = state.attrs[i * A + AI.field_staff];
    if (staffSeen.has(c)) continue;
    staffSeen.add(c);
    const ring = plotRing(i);
    idx.push({
      kind: 'staff', name: state.meta.dicts.field_staff[c] || '', sub: 'Field staff',
      x: ring.reduce((s, p) => s + p[0], 0) / 4, y: ring.reduce((s, p) => s + p[1], 0) / 4,
      z: 15, staffCode: c
    });
  }
  state.searchIdx = idx;
}

function runSearch(q) {
  const box = $('results');
  q = q.trim().toUpperCase();
  if (q.length < 2) { box.classList.remove('show'); return; }

  const hits = [];
  for (const e of state.searchIdx) {
    const p = e.name.toUpperCase().indexOf(q);
    if (p >= 0) { hits.push({ e, score: (p === 0 ? 0 : 1) + (e.kind === 'village' ? 0 : 0.5) }); }
    if (hits.length > 400) break;
  }
  hits.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));

  box.innerHTML = hits.slice(0, 30).map((h, i) =>
    `<div class="row" data-i="${i}">
       <span class="r-kind">${h.e.kind}</span>
       <div class="r-main">${esc(h.e.name)}</div>
       <div class="r-sub">${esc(h.e.sub)}</div>
     </div>`).join('') || '<div class="row"><div class="r-sub">No match</div></div>';
  box.classList.toggle('show', true);

  box.querySelectorAll('.row[data-i]').forEach(el => {
    el.onclick = () => {
      const e = hits[+el.dataset.i].e;
      map.flyTo({ center: [e.x, e.y], zoom: e.z, duration: 1400 });
      if (e.kind === 'grower') setTimeout(() => showDetail(e.plot), 1450);
      if (e.kind === 'staff') {
        state.filters.field_staff = e.staffCode;
        $('f_field_staff').value = e.staffCode;
        applyFilters();
      }
      box.classList.remove('show');
      $('search').value = e.name;
    };
  });
}

/* ---------------------------------------------------------------- export */

function exportCSV() {
  const rows = [];
  const cap = 60000;
  rows.push(['village', 'society', 'gate', 'region', 'variety', 'crop_type', 'crop_category',
    'mapped_ha', 'growers', 'field_staff', 'centre_lat', 'centre_lon',
    'lat1', 'lon1', 'lat2', 'lon2', 'lat3', 'lon3', 'lat4', 'lon4'].join(','));

  let written = 0;
  for (let i = 0; i < state.n && written < cap; i++) {
    if (!state.visible[i]) continue;
    const g = state.geom, o = i * 8;
    const cx = (g[o] + g[o + 2] + g[o + 4] + g[o + 6]) / 4;
    const cy = (g[o + 1] + g[o + 3] + g[o + 5] + g[o + 7]) / 4;
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    rows.push([
      q(dictVal('village', i)), q(dictVal('society', i)), q(dictVal('gate', i)),
      q(dictVal('region', i)), q(dictVal('variety', i)), q(dictVal('crop_type', i)),
      q(dictVal('crop_category', i)), state.meas[i * M].toFixed(4),
      state.attrs[i * A + AI.grower_count], q(dictVal('field_staff', i)),
      cy.toFixed(6), cx.toFixed(6),
      g[o + 1], g[o], g[o + 3], g[o + 2], g[o + 5], g[o + 4], g[o + 7], g[o + 6]
    ].join(','));
    written++;
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'varietal-plots.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  if (written >= cap) alert(`Export capped at ${fmt(cap)} plots. Narrow the filters to export the rest.`);
}

/* ---------------------------------------------------------------- legend */

function drawLegend() {
  const title = { variety: 'Variety', crop_type: 'Crop type', crop_category: 'Crop category',
    village: 'Village', society: 'Society', region: 'Region', field_staff: 'Field staff',
    area: 'Plot size (ha)', none: 'Plots' }[state.colorBy];

  if (state.colorBy === 'none') {
    $('legend').innerHTML = `<div class="lg-title">${title}</div>
      <div class="lg-row"><i style="background:rgb(78,168,222)"></i><span>Mapped plot</span></div>`;
    return;
  }

  if (state.colorBy === 'area') {
    const s = state.rampStops;
    const css = RAMP.map(c => `rgb(${c.join(',')})`).join(',');
    $('legend').innerHTML = `<div class="lg-title">${title}</div>
      <div class="lg-ramp" style="background:linear-gradient(90deg,${css})"></div>
      <div class="lg-ends"><span>&lt;${s[0]} ha</span><span>&gt;${s[s.length - 1]} ha</span></div>`;
    return;
  }

  const { col, names, slot } = state.catSpec;
  const counts = new Int32Array(names.length);
  for (let i = 0; i < state.n; i++) if (state.visible[i]) counts[state.attrs[i * A + col]]++;

  const shown = Array.from(names.keys()).filter(c => counts[c] > 0).sort((a, b) => counts[b] - counts[a]);
  const top = shown.slice(0, 14);
  let html = `<div class="lg-title">${title}</div>` + top.map(c =>
    `<div class="lg-row"><i style="background:rgb(${catColor(slot[c]).join(',')})"></i>
     <span>${esc(names[c] || '(blank)')}</span><span class="lg-n">${fmt(counts[c])}</span></div>`).join('');
  if (shown.length > top.length) {
    html += `<div class="lg-row"><i style="background:#5a6473"></i>
      <span>+${shown.length - top.length} more</span></div>`;
  }
  $('legend').innerHTML = html;
}

/* ------------------------------------------------------------------ init */

// Esri's imagery for this district stops at z18 — beyond that it serves a
// "Map data not yet available" placeholder rather than a 404, so the source
// maxzoom is pinned to 18 and MapLibre overzooms the real tile instead.
const RASTER = {
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 18, attr: 'Imagery © Esri, Maxar, Earthstar Geographics' },
  streets: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors' },
  plain: { url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', max: 20, attr: '© CARTO, © OpenStreetMap contributors' },
  labels: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', max: 18, attr: 'Labels © Esri' }
};

function initMap() {
  const b = state.meta.bounds;
  const sources = {}, layers = [];
  for (const [k, v] of Object.entries(RASTER)) {
    sources[k] = { type: 'raster', tiles: [v.url], tileSize: 256, maxzoom: v.max, attribution: v.attr };
    layers.push({
      id: k, type: 'raster', source: k,
      layout: { visibility: k === 'satellite' ? 'visible' : 'none' },
      paint: { 'raster-fade-duration': 200 }
    });
  }

  map = new maplibregl.Map({
    container: 'map',
    style: { version: 8, sources, layers, glyphs: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/{fontstack}/{range}.pbf' },
    bounds: [[b[0], b[1]], [b[2], b[3]]],
    fitBoundsOptions: { padding: 40 },
    maxZoom: 21,
    attributionControl: { compact: true }
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

  overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);

  map.on('zoom', () => { clearTimeout(map._t); map._t = setTimeout(render, 60); });
  map.on('mousemove', e => {
    $('readout').textContent =
      `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}  ·  z${map.getZoom().toFixed(1)}`;
  });
}

function wireUI() {
  $('colorby').onchange = e => {
    state.colorBy = e.target.value;
    buildColorKey(); drawLegend(); render();
  };
  $('opacity').oninput = e => {
    state.opacity = e.target.value / 100;
    $('opval').textContent = e.target.value + '%';
    render();
  };
  $('outlines').onchange = e => { state.outlines = e.target.checked; render(); };
  $('labels').onchange = e => { state.labels = e.target.checked; render(); };
  $('collapse').onclick = () => { document.body.classList.add('collapsed'); setTimeout(() => map.resize(), 240); };
  $('expand').onclick = () => { document.body.classList.remove('collapsed'); setTimeout(() => map.resize(), 240); };
  $('detail-close').onclick = () => { $('detail').classList.add('hidden'); state.selected = -1; render(); };
  $('export').onclick = exportCSV;
  $('reset').onclick = () => {
    for (const [k] of FILTERS) { state.filters[k] = -1; const s = $('f_' + k); if (s) s.value = '-1'; }
    $('search').value = '';
    applyFilters();
    const b = state.meta.bounds;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 900 });
  };

  let timer;
  $('search').oninput = e => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => runSearch(v), 130);
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) $('results').classList.remove('show');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('results').classList.remove('show');
      $('detail').classList.add('hidden');
      state.selected = -1; render();
    }
  });

  document.querySelectorAll('#basemaps button').forEach(btn => {
    btn.onclick = () => {
      const bm = btn.dataset.bm;
      document.querySelectorAll('#basemaps button').forEach(b => b.classList.toggle('on', b === btn));
      for (const k of ['satellite', 'streets', 'plain']) {
        map.setLayoutProperty(k, 'visibility',
          (k === bm || (bm === 'hybrid' && k === 'satellite')) ? 'visible' : 'none');
      }
      map.setLayoutProperty('labels', 'visibility', bm === 'hybrid' ? 'visible' : 'none');
    };
  });
}

async function main() {
  try {
    // On a phone the drawer would otherwise cover the map on first paint.
    if (window.innerWidth < 820) document.body.classList.add('collapsed');
    await load();
    initMap();
    buildFilterUI();
    buildColorKey();
    buildSearchIndex();
    wireUI();
    applyFilters();
    drawLegend();
    map.once('load', () => {
      render();
      $('loading').classList.add('done');
    });
  } catch (err) {
    $('load-msg').innerHTML = `<span style="color:#e76f51">Failed to load: ${esc(err.message)}</span><br>
      <span style="font-size:11px">Run this through the local server (serve.py), not by opening the file directly.</span>`;
    console.error(err);
  }
}

main();
