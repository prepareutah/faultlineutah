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
  if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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
    // Invisible, finger-width copies of the fault lines so they're easy to tap.
    map.addLayer({ id: "overview-hit", type: "line", source: "overview", maxzoom: FAULT_ZOOM,
      paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 } });
    map.addLayer({ id: "faults-hit", type: "line", source: "faults", minzoom: FAULT_ZOOM,
      paint: { "line-color": "#000", "line-opacity": 0, "line-width": 16 } });
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

  let pin = null;
  function setPin(lon, lat, { fly = true, zoom: z = 13 } = {}) {
    if (!pin) {
      const dot = document.createElement("div");
      dot.style.cssText = `width:22px;height:22px;border-radius:50%;background:${css("--brand")};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)`;
      dot.setAttribute("aria-label", "Selected location");
      pin = new maplibregl.Marker({ element: dot });
    }
    pin.setLngLat([lon, lat]).addTo(map);
    if (fly) map.jumpTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), z) });
  }

  return { map, setPin };
}

/** Legend markup for a page. kind: "faults" | "all". */
export function legendHTML(kind = "all") {
  const faults = FAULT_AGES.map(([, label], i) =>
    `<span><i class="line" style="background:var(--lvl-${4 - i})"></i>${label}</span>`).join("");
  if (kind === "faults") return faults;
  const liq = ["Very Low", "Low", "Moderate", "High", "Very High"].map((l, i) =>
    `<span><i style="background:var(--lvl-${i});opacity:.6"></i>${l}</span>`).join("");
  return `<div><strong>Faults</strong> ${faults}</div>` +
    `<div><strong>Liquefaction</strong> (zoom in) ${liq} <span>Paler shading: older 1994 regional map</span></div>` +
    `<div><span><i style="background:var(--accent);opacity:.4"></i>Fault rupture study zone (zoom in)</span></div>`;
}
