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

const NOMINATIM = "https://nominatim.openstreetmap.org";

function shortLabel(addr, fallback) {
  if (!addr) return fallback;
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const town = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county;
  return [street, town].filter(Boolean).join(", ") || fallback;
}

/** Address -> {lon, lat, label, zip}. Uses UGRC when a key is configured. */
export async function geocode(query) {
  const cfg = window.FL_CONFIG || {};
  if (cfg.ugrcKey) {
    const hit = await geocodeUGRC(query, cfg.ugrcKey).catch(() => null);
    if (hit) return hit;
  }
  const url = `${NOMINATIM}/search?` + new URLSearchParams({
    q: query, format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "us",
    viewbox: `${UTAH.west},${UTAH.north},${UTAH.east},${UTAH.south}`, bounded: "1",
  });
  const r = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!r.ok) throw new Error("geocoder " + r.status);
  const [hit] = await r.json();
  if (!hit) return null;
  return {
    lon: +hit.lon, lat: +hit.lat,
    label: shortLabel(hit.address, hit.display_name.split(",").slice(0, 2).join(",")),
    zip: hit.address?.postcode?.slice(0, 5) || null,
    approximate: !hit.address?.house_number,
  };
}

async function geocodeUGRC(query, apiKey) {
  // UGRC wants street and zone (city or ZIP) separately, so we need either
  // "123 Main St, Sandy" or a trailing ZIP. Anything else goes to Nominatim.
  const parts = query.split(",").map((s) => s.trim());
  const zip = query.match(/(\d{5})(?:-\d{4})?\s*$/)?.[1];
  if (parts.length < 2 && !zip) return null;
  const street = parts.length >= 2 ? parts[0] : query.replace(/\s*(UT|Utah)?\s*\d{5}(-\d{4})?\s*$/i, "");
  const zone = zip || parts[1].replace(/\b(UT|Utah)\b/i, "").trim();
  const url = `https://api.mapserv.utah.gov/api/v1/geocode/${encodeURIComponent(street)}/${encodeURIComponent(zone)}?` +
    new URLSearchParams({ apiKey, spatialReference: "4326" });
  const r = await fetch(url);
  if (!r.ok) return null;
  const res = (await r.json()).result;
  if (!res?.location) return null;
  return {
    lon: res.location.x, lat: res.location.y,
    label: res.matchAddress?.replace(/,\s*\d{5}$/, "") || query,
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
