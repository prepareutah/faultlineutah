// Know Your Ground: address -> plain-language hazard cards + map.
//
// The location lives only in the URL hash (#@lat,lon), which browsers never
// send to a server. Nothing about a search is stored except, for this tab
// only, the label to show and the flags the prep checklist uses.
import {
  inUtah, geocode, reverseGeocode, nearestFaults, inFaultRuptureZone,
  liquefactionAt, magnaAt, designValues,
} from "./geo.js";
import { hazardMap, legendHTML } from "./map.js";
import { faultCard, liquefactionCard, designCard, magnaCard, basinTeaser } from "./content/ground-text.js";

const $ = (s) => document.querySelector(s);
const results = $("#results");
const status = $("#status");
const form = $("#lookup");
const input = $("#address");

const WASATCH_FRONT = { west: -112.45, south: 39.85, east: -111.45, north: 41.45 };

const ICONS = {
  fault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h7l2-3 2 3h7"/><path d="M12 14V4"/><path d="m9 7 3-3 3 3"/></svg>',
  liq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
  design: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M4 21h16"/></svg>',
  magna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5"/></svg>',
};

const CARDS = [
  ["fault", "Fault lines"],
  ["liq", "Liquefaction (the ground)"],
  ["design", "Building-code shaking"],
  ["magna", "What Magna did here"],
];

const { map, setPin } = hazardMap($("#map"), {
  center: [-111.93, 40.68], zoom: 9.3,
  onPick: (lon, lat) => run(lon, lat),
});
$("#legend").innerHTML = legendHTML();

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.classList.toggle("error", isError);
}

function cardShell(id, title) {
  return `<article class="result" id="card-${id}" aria-busy="true">
    <header><div class="icon">${ICONS[id]}</div><div style="flex:1">
      <h3>${title}</h3><p class="headline skeleton">Looking this up…</p></div></header>
    <div class="body"><p class="skeleton">&nbsp;</p></div></article>`;
}

function fillCard(id, c) {
  const el = $(`#card-${id}`);
  if (!el) return;
  const lvl = c.level === "none" ? "none" : c.level;
  const meter = c.level === "none" ? "" :
    `<div class="meter" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= c.level ? "on lvl-" + lvl : ""}"></i>`).join("")}</div>
     <div class="meter-labels" aria-hidden="true"><span>Lower</span><span>Higher</span></div>`;
  el.removeAttribute("aria-busy");
  el.querySelector(".headline").outerHTML =
    `<p class="headline">${c.headline}</p><p style="margin:6px 0 0"><span class="pill lvl-${lvl}"><span>${c.pill}</span></span></p>`;
  el.querySelector(".body").outerHTML = `${meter}<div class="body">${c.body}</div>` +
    (c.science ? `<details class="science"><summary>Show the science</summary><div class="sci">${c.science}</div></details>` : "") +
    `<p class="source">Source: ${c.source}</p>`;
}

function failCard(id, what) {
  fillCard(id, {
    level: "none", pill: "Unavailable", headline: `We couldn't load ${what} just now.`,
    body: "<p>Please try again. If it keeps happening, let us know.</p>", science: "", source: "—",
  });
}

let runId = 0;

async function run(lon, lat, known = {}) {
  const id = ++runId;
  history.replaceState(null, "", `#@${lat.toFixed(5)},${lon.toFixed(5)}`);
  setPin(lon, lat);

  if (!inUtah(lon, lat)) {
    results.innerHTML = `<div class="notice"><p><strong>That spot looks like it's outside Utah.</strong> ` +
      "Know Your Ground covers Utah only, with the most detail along the Wasatch Front.</p></div>";
    setStatus("");
    return;
  }

  const label = known.label || session("label:" + lat.toFixed(5) + lon.toFixed(5)) || "Selected spot";
  results.innerHTML =
    `<h2 class="place">${escapeHTML(label)}</h2>` +
    `<p class="place-sub">${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°W${known.approximate ? " · approximate match, check the pin on the map" : ""}</p>` +
    CARDS.map(([cid, title]) => cardShell(cid, title)).join("") +
    (inBox(lon, lat, WASATCH_FRONT) ? `<div class="notice info" id="basin">${basinTeaser}</div>` : "") +
    nextSteps() +
    '<p class="small muted" style="margin-top:18px"><strong>For education and preparedness only.</strong> Not an engineering assessment, inspection, insurance determination, ' +
    "real-estate disclosure, or earthquake prediction. Consult a licensed structural engineer about your building.</p>";
  setStatus("");
  results.querySelector(".place").scrollIntoView?.({ behavior: "smooth", block: "nearest" });

  // Label + ZIP (the ZIP picks the Magna "Did You Feel It?" summary).
  const place = known.label ? Promise.resolve(known) : reverseGeocode(lon, lat);
  place.then((p) => {
    if (id !== runId) return;
    if (!known.label && p.label) results.querySelector(".place").textContent = p.label;
    session("label:" + lat.toFixed(5) + lon.toFixed(5), p.label);
  });

  const flags = {};
  const jobs = [
    Promise.all([nearestFaults(lon, lat), inFaultRuptureZone(lon, lat)]).then(([nf, zone]) => {
      if (id !== runId) return;
      const c = faultCard(nf, zone);
      fillCard("fault", c);
      flags.fault = c.level;
      flags.zone = zone ? 1 : 0;
    }).catch(() => failCard("fault", "fault data")),

    liquefactionAt(lon, lat).then((liq) => {
      if (id !== runId) return;
      fillCard("liq", liquefactionCard(liq));
      flags.liq = liq?.level ?? -1;
    }).catch(() => failCard("liq", "liquefaction data")),

    designValues(lon, lat).catch(() => null).then((dv) => {
      if (id !== runId) return;
      fillCard("design", designCard(dv));
    }),

    place.then((p) => magnaAt(lon, lat, p.zip)).then((m) => {
      if (id !== runId) return;
      fillCard("magna", magnaCard(m));
    }).catch(() => failCard("magna", "the Magna data")),
  ];

  await Promise.all(jobs);
  if (id !== runId) return;
  session("flags", JSON.stringify(flags));
  const planLink = results.querySelector("#plan-link");
  if (planLink) planLink.href = "/plan.html#" + new URLSearchParams(flags);
}

function nextSteps() {
  return `<h2 style="font-size:1.35rem">What to do next</h2><div class="next-steps">
    <a class="card link" id="plan-link" href="/plan.html"><h3>Make your plan</h3><p>Six questions, then a prep list in priority order, tuned to this spot.</p><span class="go">Start →</span></a>
    <a class="card link" href="/brick.html"><h3>Is your building brick?</h3><p>Unreinforced brick is Utah's biggest earthquake risk. Here's how to tell.</p><span class="go">Check →</span></a>
    <button class="card link" type="button" onclick="print()" style="text-align:left;font:inherit;cursor:pointer"><h3>Save or print</h3><p>Keep a copy of these results as a PDF.</p><span class="go">Print →</span></button>
  </div>`;
}

// ---------- inputs ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return input.focus();
  const btn = form.querySelector("button");
  btn.disabled = true;
  setStatus("Finding that address…");
  try {
    const hit = await geocode(/\b(ut|utah)\b/i.test(q) ? q : q + ", Utah");
    if (!hit) {
      setStatus("We couldn't find that address. Try adding the city, or tap the map instead.", true);
      return;
    }
    session("label:" + hit.lat.toFixed(5) + hit.lon.toFixed(5), hit.label);
    await run(hit.lon, hit.lat, hit);
  } catch {
    setStatus("The address search isn't responding. Try again, or tap your spot on the map.", true);
  } finally {
    btn.disabled = false;
  }
});

$("#locate").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("Your browser can't share its location. Type an address instead.", true);
  setStatus("Asking your device for its location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => run(pos.coords.longitude, pos.coords.latitude),
    () => setStatus("Location wasn't shared. Type an address or tap the map instead.", true),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

$("#tapmap").addEventListener("click", () => {
  setStatus("Tap or click your spot on the map.");
  $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
});

// ---------- helpers ----------

function inBox(lon, lat, b) {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// sessionStorage can be missing or throw (private mode); everything works without it.
function session(k, v) {
  try {
    if (v === undefined) return sessionStorage.getItem("fl:" + k);
    sessionStorage.setItem("fl:" + k, v);
  } catch { /* fine */ }
  return null;
}

// ---------- start ----------

function fromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const at = h.match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return run(+at[2], +at[1]);
  const q = h.match(/^q=(.+)/);
  if (q) {
    input.value = q[1];
    history.replaceState(null, "", location.pathname);
    form.requestSubmit();
  }
}
// Don't wait for the map: its "load" event waits on every basemap tile, which
// can take a long time on a slow phone. The pin and results work without it.
fromHash();
