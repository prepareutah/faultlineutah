// Data loading and spatial math for Know Your Ground.
// Everything except geocoding and code design values is answered from the
// static files in /data, so an address never leaves the browser for those.

const DATA = "/data";
const LIQ_TILE = 0.1;
const FAULT_TILE = 0.5;

// Rough Utah bounding box. Good enough to say "outside our coverage".
export const UTAH = { west: -114.06, south: 36.99, east: -109.03, north: 42.01 };

const cache = new Map();
export function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(DATA + path).then((r) => {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

export function inUtah(lon, lat) {
  return lon >= UTAH.west && lon <= UTAH.east && lat >= UTAH.south && lat <= UTAH.north;
}

const key = (lon, lat, size) => `${Math.floor(lon / size)}_${Math.floor(lat / size)}`;

async function tile(folder, k) {
  const index = await loadJSON(`/${folder}/index.json`);
  if (!index.includes(k)) return [];
  return (await loadJSON(`/${folder}/${k}.json`)).features;
}

// ---------- geometry ----------

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(geom, x, y) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  return polys.some((p) => ringContains(p[0], x, y) && !p.slice(1).some((h) => ringContains(h, x, y)));
}

// Equirectangular projection around the query point, in km. Accurate to well
// under 1% at the distances shown here (< 60 km).
function projector(lon0, lat0) {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.574;
  return ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky];
}

// Closest point to the origin on segment a-b, in projected km.
function closestOnSegment([ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return [ax + t * dx, ay + t * dy];
}

/** Distance (km) from the projection origin to a line, and the compass direction to it. */
function lineDistance(geom, project) {
  const lines = geom.type === "MultiLineString" ? geom.coordinates : [geom.coordinates];
  let best = { km: Infinity, x: 0, y: 0 };
  for (const line of lines) {
    let prev = project(line[0]);
    for (let i = 1; i < line.length; i++) {
      const cur = project(line[i]);
      const [x, y] = closestOnSegment(prev, cur);
      const km = Math.hypot(x, y);
      if (km < best.km) best = { km, x, y };
      prev = cur;
    }
  }
  return best;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const compass = (x, y) => COMPASS[Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) / 45) % 8];

export const KM_PER_MI = 1.609344;

// ---------- hazard queries ----------

const LIQ_ORDER = ["Very Low", "Low", "Moderate", "High", "Very High"];

// 1994 regional map codes (see scripts/build_data.py). Split classes such as
// "low to moderate" take the higher level so we never understate. Codes 8-11
// weren't rated for liquefaction, so they have no level.
export const LIQ_1994 = {
  1: [0, "Very low"], 2: [1, "Very low to low"], 3: [1, "Low"], 4: [2, "Low to moderate"],
  5: [2, "Moderate"], 6: [3, "Moderate to high"], 7: [3, "High"],
  8: [null, "Landslide area"], 9: [null, "Mine tailings"], 10: [null, "Lake or lakeshore"], 11: [null, "Island"],
};

/**
 * Liquefaction at a point, or null if neither map covers it:
 *   {source: "ugs", level: 0-4, label}           newer 1:24,000 UGS map (preferred)
 *   {source: "1994", level: 0-3 | null, label}   older regional map, used only where UGS has no data
 */
export async function liquefactionAt(lon, lat) {
  const k = key(lon, lat, LIQ_TILE);
  let best = null;
  for (const f of await tile("liq", k)) {
    if (!polygonContains(f.geometry, lon, lat)) continue;
    const level = LIQ_ORDER.indexOf(f.properties.lvl);
    if (level > (best?.level ?? -1)) best = { source: "ugs", level, label: f.properties.lvl };
  }
  if (best) return best;
  for (const f of await tile("liq94", k)) {
    if (!polygonContains(f.geometry, lon, lat)) continue;
    const [level, label] = LIQ_1994[f.properties.c] || [null, "Not rated"];
    return { source: "1994", level, label, code: f.properties.c };
  }
  return null;
}

/** True if the point is inside a UGS surface-fault-rupture special study zone. */
export async function inFaultRuptureZone(lon, lat) {
  const feats = await tile("sfr", key(lon, lat, LIQ_TILE));
  return feats.some((f) => polygonContains(f.geometry, lon, lat));
}

/** Faults in the 3x3 block of fault tiles around a point (at least ~40 km out). */
export async function faultsNear(lon, lat) {
  const tx = Math.floor(lon / FAULT_TILE), ty = Math.floor(lat / FAULT_TILE);
  const keys = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) keys.push(`${tx + dx}_${ty + dy}`);
  const seen = new Set();
  const out = [];
  for (const feats of await Promise.all(keys.map((k) => tile("faults", k)))) {
    for (const f of feats) {
      const id = f.properties.zone + JSON.stringify(f.geometry.coordinates[0]);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(f);
    }
  }
  return out;
}

// "Young" = moved in the last 15,000 years. These are the faults UGS and USGS
// treat as most likely to produce the next large surface-rupturing quake.
export const isYoung = (age) => age === "<15,000" || age === "<150";

/**
 * Nearest mapped fault overall, nearest young fault, and nearest Wasatch
 * fault zone strand. Each is {km, dir, props} or null if none within the
 * search area.
 */
export async function nearestFaults(lon, lat) {
  const project = projector(lon, lat);
  const feats = await faultsNear(lon, lat);
  let any = null, young = null, wasatch = null;
  for (const f of feats) {
    const { km, x, y } = lineDistance(f.geometry, project);
    const hit = { km, dir: km < 0.05 ? null : compass(x, y), props: f.properties };
    if (!any || km < any.km) any = hit;
    if (isYoung(f.properties.age) && (!young || km < young.km)) young = hit;
    if (/^Wasatch fault zone/i.test(f.properties.zone) && (!wasatch || km < wasatch.km)) wasatch = hit;
  }
  return { any, young, wasatch, feats };
}

/** What the 2020 Magna earthquake did here: ShakeMap intensity + Did You Feel It? */
export async function magnaAt(lon, lat, zip) {
  const [grid, cells, zips, event] = await Promise.all([
    loadJSON("/magna/mmi_grid.json"),
    loadJSON("/magna/dyfi_1km.json"),
    loadJSON("/magna/dyfi_zip.json"),
    loadJSON("/magna/event.json"),
  ]);

  let mmi = null;
  if (lon >= grid.x0 && lon <= grid.x1 && lat >= grid.y0 && lat <= grid.y1) {
    const ix = Math.round(((lon - grid.x0) / (grid.x1 - grid.x0)) * (grid.nx - 1));
    const iy = Math.round(((lat - grid.y0) / (grid.y1 - grid.y0)) * (grid.ny - 1));
    mmi = grid.v[iy * grid.nx + ix];
  }

  // Nearest 1 km "Did You Feel It?" cell whose center is within ~0.75 km.
  const project = projector(lon, lat);
  let cell = null;
  for (const [cx, cy, cdi, n] of cells) {
    const [x, y] = project([cx, cy]);
    const d = Math.hypot(x, y);
    if (d < 0.75 && (!cell || d < cell.km)) cell = { km: d, cdi, n };
  }

  const z = zip && zips[zip] ? { zip, cdi: zips[zip][0], n: zips[zip][1] } : null;
  const [ex, ey] = project([event.lon, event.lat]);
  return { mmi, cell, zip: z, event, epicenterKm: Math.hypot(ex, ey) };
}

/**
 * Building-code design values from the USGS web service (ASCE 7-22, Risk
 * Category II, default site class). Coordinates are rounded to ~100 m before
 * leaving the browser; the values don't change at that scale.
 */
export async function designValues(lon, lat) {
  // The older /ws/designmaps/ URL redirects here, and the redirect lacks CORS
  // headers, so browsers must call this address directly.
  const url = "https://earthquake.usgs.gov/ws/building-codes/asce7-22/calculate?" + new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3),
    riskCategory: "II", siteClass: "Default", title: "FaultLine Utah",
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("USGS " + r.status);
    const d = (await r.json()).response.data;
    return { sds: d.sds, sd1: d.sd1, pgam: d.pgam, ss: d.ss, s1: d.s1, sdc: d.sdc };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- geocoding ----------
//
// Order: UGRC Web API (only if a key is configured) -> UGRC's open "Masquerade"
// locator (Utah's own address points and road centerlines, no key needed) ->
// OpenStreetMap Nominatim. If none matches, UGRC's suggestions become
// "Did you mean...?" choices.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const MASQUERADE = "https://masquerade.ugrc.utah.gov/arcgis/rest/services/UtahLocator/GeocodeServer";

function shortLabel(addr, fallback) {
  if (!addr) return fallback;
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const town = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county;
  return [street, town].filter(Boolean).join(", ") || fallback;
}

// "350 N STATE ST, SALT LAKE CITY" -> "350 N State St, Salt Lake City"
function tidy(label) {
  const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const [street, ...rest] = label.split(",");
  const words = street.trim().split(/\s+/).map((w) => (/^\d/.test(w) || /^[NSEW]$/.test(w) ? w : title(w)));
  const town = title(rest.join(",").trim());
  return town ? `${words.join(" ")}, ${town}` : words.join(" ");
}

// Cities whose names start with a compass word, so "...4500 S South Jordan"
// isn't split after "South".
const DIRECTION_CITIES = [
  "north salt lake", "north ogden", "north logan", "south salt lake", "south jordan", "south ogden",
  "south weber", "west valley city", "west valley", "west jordan", "west haven", "west point",
  "west bountiful", "east carbon",
];
const STREET_END = /^(n|s|e|w|north|south|east|west|st|street|ave|avenue|rd|road|dr|drive|ln|lane|way|cir|circle|ct|court|blvd|boulevard|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|cv|cove|row|sq|square|hollow|holw|run|rdg|ridge|xing|crossing|pt|point|bnd|bend|plz|plaza)\.?$/i;

/**
 * Split a typed Utah address into {street, city, zip}. Handles commas or none:
 * "1234 east 4500 south holladay ut 84117" -> street "1234 east 4500 south",
 * city "holladay", zip "84117".
 */
export function parseAddress(text) {
  let rest = text.replace(/\s+/g, " ").replace(/,?\s*(usa|united states)\.?$/i, "").trim();
  const zip = rest.match(/\b(\d{5})(?:-\d{4})?$/)?.[1] || null;
  if (zip) rest = rest.slice(0, rest.lastIndexOf(zip)).trim();
  rest = rest.replace(/[,\s]+(ut|utah)\.?$/i, "").replace(/,\s*$/, "").trim();

  if (rest.includes(",")) {
    const [street, ...city] = rest.split(",");
    return { street: street.trim(), city: city.join(" ").trim() || null, zip };
  }
  const lower = rest.toLowerCase();
  const known = DIRECTION_CITIES.find((c) => lower.endsWith(" " + c));
  if (known) return { street: rest.slice(0, -known.length).trim(), city: rest.slice(-known.length), zip };

  // Otherwise guess: the street ends at the last compass word or street
  // type, and anything after it is the city. "whole" keeps the unsplit text
  // in case the guess is wrong ("350 N State" is a street, not "350 N" in "State").
  const words = rest.split(" ");
  let cut = -1;
  for (let i = 1; i < words.length; i++) if (STREET_END.test(words[i])) cut = i;
  if (cut === -1 || cut === words.length - 1) return { street: rest, city: null, zip };
  return { street: words.slice(0, cut + 1).join(" "), city: words.slice(cut + 1).join(" "), zip, whole: rest };
}

async function getJSON(url, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "Accept-Language": "en" } });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Address -> one of:
 *   {lon, lat, label, zip, approximate}   a match
 *   {choices: ["350 N STATE ST, OREM", ...]}   ambiguous; let the person pick
 *   {needsTown: true}                      a street with no city or ZIP
 *   null                                   nothing found
 */
export async function geocode(query) {
  const cfg = window.FL_CONFIG || {};
  const parts = parseAddress(query);
  const zones = [parts.zip, parts.city].filter(Boolean);
  const hasNumber = /^\d+\s/.test(parts.street);
  let reached = 0, tried = 0;
  const attempt = async (fn) => {
    tried++;
    try { const v = await fn(); reached++; return v; } catch { return null; }
  };

  for (const zone of zones) {
    const hit = (cfg.ugrcKey && await attempt(() => geocodeUGRC(parts.street, zone, cfg.ugrcKey))) ||
      await attempt(() => geocodeMasquerade(`${parts.street}, ${zone}`));
    if (hit) return { ...hit, zip: hit.zip || parts.zip };
  }

  // Utah grid addresses repeat in every town, so with no city or ZIP, offer
  // the matches UGRC knows about rather than guessing one. If the city was
  // only a guess, treat the whole text as the street.
  const noTown = !zones.length || (parts.whole && !parts.zip);
  const street = parts.whole && !parts.zip ? parts.whole : parts.street;
  const choices = hasNumber ? (await attempt(() => suggest(street))) || [] : [];
  if (noTown && hasNumber && !parts.whole) return choices.length ? { choices } : { needsTown: true };
  if (noTown && choices.length) return { choices };

  // A landmark ("Liberty Park") or an address UGRC didn't recognize.
  const osm = await attempt(() => geocodeNominatim(query));
  if (osm && !osm.approximate) return osm;
  if (choices.length) return { choices };
  if (!osm && reached === 0 && tried > 0) throw new Error("No geocoder responded");
  return osm;
}

async function geocodeMasquerade(singleLine) {
  const d = await getJSON(`${MASQUERADE}/findAddressCandidates?` + new URLSearchParams({
    SingleLine: singleLine, outSR: "4326", maxLocations: "1", f: "json",
  }));
  const c = d.candidates?.[0];
  if (!c || c.score < 80) return null;
  return {
    lon: c.location.x, lat: c.location.y, label: tidy(c.address), zip: null,
    approximate: c.score < 90,
  };
}

async function suggest(text) {
  const d = await getJSON(`${MASQUERADE}/suggest?` + new URLSearchParams({ text, maxSuggestions: "6", f: "json" }), 8000);
  // Only street addresses: the suggester also returns districts, cities and ZIPs.
  return (d.suggestions || []).map((s) => s.text).filter((t) => /^\d/.test(t)).slice(0, 5).map(tidy);
}

async function geocodeNominatim(query) {
  const q = /\b(ut|utah)\b/i.test(query) ? query : query + ", Utah";
  const [hit] = await getJSON(`${NOMINATIM}/search?` + new URLSearchParams({
    q, format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "us",
    viewbox: `${UTAH.west},${UTAH.north},${UTAH.east},${UTAH.south}`, bounded: "1",
  }));
  if (!hit) return null;
  const a = hit.address || {};
  const town = a.city || a.town || a.village || a.hamlet || a.county;
  // A street with no house number is "approximate"; a named place (a park, a
  // school) is where it says it is.
  const isStreet = hit.category === "highway";
  return {
    lon: +hit.lon, lat: +hit.lat,
    label: hit.name && !a.house_number && !isStreet ? [hit.name, town].filter(Boolean).join(", ")
      : shortLabel(a, hit.display_name.split(",").slice(0, 2).join(",")),
    zip: a.postcode?.slice(0, 5) || null,
    approximate: isStreet,
  };
}

async function geocodeUGRC(street, zone, apiKey) {
  const d = await getJSON(`https://api.mapserv.utah.gov/api/v1/geocode/${encodeURIComponent(street)}/${encodeURIComponent(zone)}?` +
    new URLSearchParams({ apiKey, spatialReference: "4326" }));
  const res = d.result;
  if (!res?.location) return null;
  return {
    lon: res.location.x, lat: res.location.y,
    label: tidy(res.matchAddress?.replace(/,\s*\d{5}$/, "") || street),
    zip: (res.matchAddress?.match(/\d{5}$/) || [null])[0],
    approximate: res.score < 80,
  };
}

/** Point -> {label, zip} for "use my location" and map taps. */
export async function reverseGeocode(lon, lat) {
  try {
    const url = `${NOMINATIM}/reverse?` + new URLSearchParams({
      lat: lat.toFixed(5), lon: lon.toFixed(5), format: "jsonv2", addressdetails: "1", zoom: "17",
    });
    const r = await fetch(url, { headers: { "Accept-Language": "en" } });
    const d = await r.json();
    return { label: shortLabel(d.address, "Selected spot"), zip: d.address?.postcode?.slice(0, 5) || null };
  } catch {
    return { label: "Selected spot", zip: null };
  }
}
