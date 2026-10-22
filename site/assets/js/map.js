// Shared MapLibre hazard map: faults, liquefaction, fault-rupture zones.
// Zoomed out it shows a light statewide fault overview; zoomed in it loads
// the detailed tiles for whatever is on screen.
import { loadJSON, isYoung } from "./geo.js";

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const DETAIL_ZOOM = 10.5;  // liquefaction + rupture zones appear
const FAULT_ZOOM = 9;      // detailed fault lines replace the overview
const MAX_TILES = 30;

const dark = matchMedia("(prefers-color-scheme: dark)");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const FAULT_AGES = [
  ["<15,000", "Moved in the last 15,000 years"],
  ["<130,000", "Last 130,000 years"],
  ["<750,000", "Last 750,000 years"],
  ["<2,600,000", "Last 2.6 million years"],
];

function faultColor() {
  return ["match", ["get", "age"],
    ["<150", "<15,000"], css("--lvl-4"),
    "<130,000", css("--lvl-3"),
    "<750,000", css("--lvl-2"),
    "<2,600,000", css("--lvl-1"),
    css("--lvl-none")];
}

// Older 1994 regional map, by its PCODE (see LIQ_1994 in geo.js). Unrated
// classes (landslide, tailings, lake, island) aren't drawn.
function liq94Color() {
  return ["match", ["get", "c"],
    1, css("--lvl-0"), [2, 3], css("--lvl-1"), [4, 5], css("--lvl-2"), [6, 7], css("--lvl-3"),
    "rgba(0,0,0,0)"];
}

function liqColor() {
  return ["match", ["get", "lvl"],
    "Very Low", css("--lvl-0"), "Low", css("--lvl-1"), "Moderate", css("--lvl-2"),
    "High", css("--lvl-3"), "Very High", css("--lvl-4"), css("--lvl-none")];
}

const empty = () => ({ type: "FeatureCollection", features: [] });

// Map layers switched together by each checkbox in the key.
const LAYER_GROUPS = {
  faults: ["overview", "faults-halo", "faults", "overview-hit", "faults-hit"],
  liq: ["liq94", "liq"],
  sfr: ["sfr"],
  magna: ["magna-casing", "magna-lines", "magna-labels", "magna-epi"],
};

// USGS ShakeMap colors for the whole-number intensity contours we keep.
const MAGNA_MMI = [[3, "weak", "#a0e5ff"], [4, "light", "#80ffff"], [5, "moderate", "#7cff90"], [6, "strong", "#ffff00"]];
const ROMAN = { 3: "III", 4: "IV", 5: "V", 6: "VI" };

function keyHTML() {
  const sw = (c, cls = "sw") => `<i class="${cls}" style="--c:${c}"></i>`;
  const faults = FAULT_AGES.map(([, label], i) =>
    `<li>${sw(`var(--lvl-${4 - i})`, "ln")}${label.replace("Moved in the last", "Last")}</li>`).join("");
  const liq = ["Very low", "Low", "Moderate", "High", "Very high"].map((l, i) =>
    `<li>${sw(`var(--lvl-${i})`)}${l}</li>`).join("");
  return `<button type="button" class="key-toggle" aria-expanded="true">Map key</button>
    <div class="key-body">
      <section><label class="key-head"><input type="checkbox" data-layer="faults" checked>Faults</label>
        <p class="key-sub">Colored by when they last moved</p><ul>${faults}</ul></section>
      <section class="needs-zoom"><label class="key-head"><input type="checkbox" data-layer="liq" checked>Liquefaction</label>
        <button type="button" class="zoom-hint">Zoom in to see</button>
        <ul class="key-grid">${liq}</ul><p class="key-sub">Paler shading: 1994 regional map</p></section>
      <section class="needs-zoom"><label class="key-head"><input type="checkbox" data-layer="sfr" checked>${sw("var(--accent)")}Fault study zones</label>
        <p class="key-sub">Where the ground could break along a fault</p>
        <button type="button" class="zoom-hint">Zoom in to see</button></section>
      <section><label class="key-head"><input type="checkbox" data-layer="magna">Magna 2020 shaking</label>
        <p class="key-sub">How strongly the M5.7 shook, from the USGS ShakeMap</p>
        <ul class="key-grid">${MAGNA_MMI.map(([v, word, c]) => `<li>${sw(c, "ln")}${ROMAN[v]} ${word}</li>`).join("")}</ul></section>
    </div>`;
}

// The key lives inside the map (top-left), so it stays visible while
// scrolling and in full screen. Open by default when the map has room.
class KeyControl {
  constructor({ onToggle, onZoomIn }) {
    this.onToggle = onToggle;
    this.onZoomIn = onZoomIn;
  }

  onAdd(map) {
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl map-key";
    el.innerHTML = keyHTML();
    const toggle = el.querySelector(".key-toggle");
    const setOpen = (open) => {
      el.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    // The map's own size isn't settled yet when controls are added, so go by the screen.
    setOpen(innerWidth >= 700);
    toggle.addEventListener("click", () => setOpen(!el.classList.contains("open")));
    el.addEventListener("change", (e) => e.target.dataset.layer && this.onToggle(e.target.dataset.layer, e.target.checked));
    el.querySelectorAll(".zoom-hint").forEach((b) => b.addEventListener("click", this.onZoomIn));
    // Keep scrolling and taps inside the key from moving the map.
    for (const t of ["wheel", "mousedown", "touchstart", "dblclick"]) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    const update = () => el.classList.toggle("zoomed-out", map.getZoom() < DETAIL_ZOOM);
    map.on("zoom", update);
    update();
    this.el = el;
    return el;
  }

  onRemove() {
    this.el.remove();
  }
}

// "Back to my spot": appears once there's a pin, and flies back to it.
class PinControl {
  constructor(getPin) {
    this.getPin = getPin;
  }

  onAdd(map) {
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl maplibregl-ctrl-group pin-ctrl";
    el.hidden = true;
    el.innerHTML = '<button type="button" title="Back to my spot" aria-label="Back to my spot">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>';
    el.querySelector("button").addEventListener("click", () => {
      const p = this.getPin();
      if (p) map.flyTo({ center: p.getLngLat(), zoom: Math.max(map.getZoom(), 13) });
    });
    this.el = el;
    return el;
  }

  onRemove() {
    this.el.remove();
  }
}

export function hazardMap(el, { center = [-111.89, 40.7], zoom = 9, interactive = true, onPick } = {}) {
  const map = new maplibregl.Map({
    container: el,
    style: dark.matches ? STYLE.dark : STYLE.light,
    center, zoom,
    attributionControl: false,
    cooperativeGestures: matchMedia("(pointer: coarse)").matches,
    interactive,
  });
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'Hazards: <a href="https://geology.utah.gov/">Utah Geological Survey</a>',
  }));
  const shown = { faults: true, liq: true, sfr: true, magna: false };
  function applyVisibility(group) {
    for (const id of LAYER_GROUPS[group]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", shown[group] ? "visible" : "none");
    }
  }
  let pin = null;
  const pinControl = new PinControl(() => pin);
  if (interactive) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.addControl(pinControl, "top-right");
    map.addControl(new KeyControl({
      onToggle: (group, on) => {
        shown[group] = on;
        applyVisibility(group);
      },
      onZoomIn: () => map.easeTo({ zoom: DETAIL_ZOOM + 0.5 }),
    }), "top-left");
  }
  // On phones, start the credits folded behind their (i) button so they don't
  // cover a third of the map. Tapping (i) shows them.
  // MapLibre expands them once, when the credit text first arrives.
  const attrib = el.querySelector(".maplibregl-ctrl-attrib");
  if (innerWidth < 700 && attrib) {
    const fold = new MutationObserver(() => {
      if (!attrib.classList.contains("maplibregl-compact-show")) return;
      attrib.classList.remove("maplibregl-compact-show");
      fold.disconnect();
    });
    fold.observe(attrib, { attributes: true, attributeFilter: ["class"] });
  }
  el.flMap = map; // handy for debugging from the browser console

  const loaded = { liq: new Map(), liq94: new Map(), sfr: new Map(), faults: new Map() };
  let indexes = null;

  function addLayers() {
    map.addSource("liq", { type: "geojson", data: empty() });
    map.addSource("liq94", { type: "geojson", data: empty() });
    map.addSource("sfr", { type: "geojson", data: empty() });
    map.addSource("faults", { type: "geojson", data: empty() });
    // Loaded here rather than by URL: MapLibre fetches URL data in a web
    // worker, where a site-relative path doesn't resolve.
    map.addSource("overview", { type: "geojson", data: empty() });
    loadJSON("/faults_overview.json").then((fc) => map.getSource("overview")?.setData(fc));

    // Hazard fills go under the basemap's roads, and fault lines under its
    // labels, so people can still find their own street.
    const layers = map.getStyle().layers;
    const underRoads = layers.find((l) => l["source-layer"] === "transportation")?.id;
    const underLabels = layers.find((l) => l.type === "symbol")?.id;

    // The 1994 map sits lighter, underneath the newer UGS map, which wins where both exist.
    map.addLayer({ id: "liq94", type: "fill", source: "liq94", minzoom: DETAIL_ZOOM,
      paint: { "fill-color": liq94Color(), "fill-opacity": 0.3, "fill-antialias": false } }, underRoads);
    map.addLayer({ id: "liq", type: "fill", source: "liq", minzoom: DETAIL_ZOOM,
      paint: { "fill-color": liqColor(), "fill-opacity": 0.6, "fill-antialias": false } }, underRoads);
    map.addLayer({ id: "sfr", type: "fill", source: "sfr", minzoom: DETAIL_ZOOM,
      paint: { "fill-color": css("--accent"), "fill-opacity": 0.28, "fill-antialias": false } }, underRoads);
    map.addLayer({ id: "overview", type: "line", source: "overview", maxzoom: FAULT_ZOOM,
      paint: { "line-color": faultColor(), "line-width": 1.4 } }, underLabels);
    map.addLayer({ id: "faults-halo", type: "line", source: "faults", minzoom: FAULT_ZOOM,
      paint: { "line-color": css("--surface"), "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 15, 7], "line-opacity": 0.7 } }, underLabels);
    map.addLayer({ id: "faults", type: "line", source: "faults", minzoom: FAULT_ZOOM,
      paint: { "line-color": faultColor(), "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 15, 4] } }, underLabels);
    // Magna 2020 (off until switched on in the key): intensity contours + epicenter.
    map.addSource("magna", { type: "geojson", data: empty() });
    map.addSource("magna-epi", { type: "geojson", data: empty() });
    loadJSON("/magna/cont_mmi.json").then((fc) => map.getSource("magna")?.setData(fc));
    loadJSON("/magna/event.json").then((ev) => map.getSource("magna-epi")?.setData({
      type: "Feature", geometry: { type: "Point", coordinates: [ev.lon, ev.lat] }, properties: {},
    }));
    // A dark outline keeps the pale USGS colors readable on the light basemap.
    map.addLayer({ id: "magna-casing", type: "line", source: "magna",
      paint: { "line-color": "#1e2a32", "line-width": 4.5, "line-opacity": 0.45 } }, underLabels);
    map.addLayer({ id: "magna-lines", type: "line", source: "magna",
      paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [3, 1.5] } }, underLabels);
    map.addLayer({ id: "magna-labels", type: "symbol", source: "magna",
      layout: { "symbol-placement": "line", "text-field": ["match", ["get", "mmi"], 3, "III", 4, "IV", 5, "V", 6, "VI", ""],
        "text-font": ["Noto Sans Bold"], "text-size": 12, "symbol-spacing": 220 },
      paint: { "text-color": css("--ink"), "text-halo-color": css("--surface"), "text-halo-width": 2 } });
    map.addLayer({ id: "magna-epi", type: "circle", source: "magna-epi",
      paint: { "circle-radius": 7, "circle-color": css("--accent"), "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });

    // Invisible, finger-width copies of the fault lines so they're easy to tap.
    map.addLayer({ id: "overview-hit", type: "line", source: "overview", maxzoom: FAULT_ZOOM,
      paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 } });
    map.addLayer({ id: "faults-hit", type: "line", source: "faults", minzoom: FAULT_ZOOM,
      paint: { "line-color": "#000", "line-opacity": 0, "line-width": 16 } });
    for (const group of Object.keys(LAYER_GROUPS)) applyVisibility(group);
    refreshSources();
    loadVisible();
  }

  function refreshSources() {
    for (const name of ["liq", "liq94", "sfr", "faults"]) {
      const src = map.getSource(name);
      if (!src) continue;
      const seen = new Set();
      const features = [];
      for (const fs of loaded[name].values()) {
        for (const f of fs) {
          // Fault lines are copied into every tile they touch; draw each once.
          if (name === "faults") {
            const id = f.properties.zone + JSON.stringify(f.geometry.coordinates[0]);
            if (seen.has(id)) continue;
            seen.add(id);
          }
          features.push(f);
        }
      }
      src.setData({ type: "FeatureCollection", features });
    }
  }

  async function loadVisible() {
    const z = map.getZoom();
    if (z < FAULT_ZOOM) return;
    indexes ??= {
      liq: new Set(await loadJSON("/liq/index.json")),
      liq94: new Set(await loadJSON("/liq94/index.json")),
      sfr: new Set(await loadJSON("/sfr/index.json")),
      faults: new Set(await loadJSON("/faults/index.json")),
    };
    const b = map.getBounds();
    const want = (folder, size) => {
      const keys = [];
      for (let x = Math.floor(b.getWest() / size); x <= Math.floor(b.getEast() / size); x++)
        for (let y = Math.floor(b.getSouth() / size); y <= Math.floor(b.getNorth() / size); y++)
          if (indexes[folder].has(`${x}_${y}`) && !loaded[folder].has(`${x}_${y}`)) keys.push(`${x}_${y}`);
      return keys.length > MAX_TILES ? [] : keys;
    };
    const jobs = want("faults", 0.5).map((k) => ["faults", k]);
    if (z >= DETAIL_ZOOM) {
      for (const folder of ["liq", "liq94", "sfr"]) jobs.push(...want(folder, 0.1).map((k) => [folder, k]));
    }
    if (!jobs.length) return;
    await Promise.all(jobs.map(async ([folder, k]) => {
      const fc = await loadJSON(`/${folder}/${k}.json`).catch(() => empty());
      loaded[folder].set(k, fc.features);
    }));
    refreshSources();
  }

  map.on("style.load", addLayers);
  map.on("moveend", loadVisible);
  dark.addEventListener?.("change", () => {
    map.setStyle(dark.matches ? STYLE.dark : STYLE.light);
  });

  // Fault popups.
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" });
  for (const layer of ["faults-hit", "overview-hit"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    map.on("click", layer, (e) => {
      const p = e.features[0].properties;
      const age = FAULT_AGES.find(([a]) => a === p.age)?.[1] || (p.age === "<150" ? "Moved in the last 150 years" : "Age not determined");
      const rows = [
        `<strong>${p.zone}</strong>`,
        p.section && p.section !== "null" ? p.section : "",
        p.strand && p.strand !== "null" ? `<span class="muted">${p.strand}</span>` : "",
        `${isYoung(p.age) ? "⚠︎ " : ""}${age}`,
        p.slip && p.slip !== "null" ? `<span class="muted">Slip rate ${p.slip}</span>` : "",
        p.link && p.link !== "null" ? `<a href="${p.link}" target="_blank" rel="noopener">USGS fault report</a>` : "",
      ].filter(Boolean);
      popup.setLngLat(e.lngLat).setHTML(rows.join("<br>")).addTo(map);
      e.preventDefault();
    });
  }

  if (onPick) {
    map.on("click", (e) => {
      if (e.defaultPrevented) return;
      if (map.queryRenderedFeatures(e.point, { layers: ["faults-hit", "overview-hit"].filter((l) => map.getLayer(l)) }).length) return;
      onPick(e.lngLat.lng, e.lngLat.lat);
    });
  }

  function setPin(lon, lat, { fly = true, zoom: z = 13 } = {}) {
    if (!pin) {
      const dot = document.createElement("div");
      dot.style.cssText = `width:22px;height:22px;border-radius:50%;background:${css("--brand")};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)`;
      dot.setAttribute("aria-label", "Selected location");
      pin = new maplibregl.Marker({ element: dot });
    }
    pin.setLngLat([lon, lat]).addTo(map);
    if (pinControl.el) pinControl.el.hidden = false;
    if (fly) map.jumpTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), z) });
  }

  return { map, setPin };
}
