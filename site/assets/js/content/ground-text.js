// Every word shown on a Know Your Ground result lives here, so wording can be
// edited (and reviewed by advisors) without touching the lookup code.
//
// Each card function returns:
//   level    0-4 (lowest to highest) or "none"; drives the color
//   pill     short label next to the color dot
//   headline one plain sentence
//   body     HTML paragraphs
//   science  HTML for the "Show the science" toggle
//   source   HTML source line
//
// House rules (product plan §4.1): bands, not decimals, in the main text.
// Never predict. Every card cites its source.

import { KM_PER_MI } from "../geo.js";

const mi = (km) => km / KM_PER_MI;
function miles(km) {
  const m = mi(km);
  if (m < 0.1) return "less than 0.1 mile";
  if (m < 1) return `about ${m.toFixed(1)} mile`;
  if (m < 10) return `about ${m.toFixed(1)} miles`;
  return `about ${Math.round(m)} miles`;
}
const both = (km) => `${mi(km).toFixed(2)} mi (${km.toFixed(2)} km)`;
const n = (x) => x.toLocaleString("en-US");

function faultName(p) {
  const parts = [p.zone];
  if (p.section) parts.push(p.section);
  return parts.join(", ");
}

const AGE_TEXT = {
  "<150": "in the last 150 years",
  "<15,000": "in the last 15,000 years",
  "<130,000": "in the last 130,000 years",
  "<750,000": "in the last 750,000 years",
  "<2,600,000": "in the last 2.6 million years",
};

// ---------------------------------------------------------------- Faults

export function faultCard({ any, young, wasatch }, inZone) {
  const d = young?.km ?? Infinity;
  let level, pill, headline;
  if (inZone) {
    level = 4; pill = "In a fault study zone";
    headline = "This spot is inside a mapped surface-fault-rupture study zone.";
  } else if (mi(d) < 0.5) {
    level = 4; pill = "Very close";
    headline = `A young, active fault is very close: ${miles(d)} ${young.dir ? "to the " + young.dir : "away"}.`;
  } else if (mi(d) < 3) {
    level = 3; pill = "Close";
    headline = `The nearest young, active fault is ${miles(d)} ${young.dir ? "to the " + young.dir : "away"}.`;
  } else if (mi(d) < 10) {
    level = 2; pill = "Within 10 miles";
    headline = `The nearest young, active fault is ${miles(d)} to the ${young.dir}.`;
  } else if (mi(d) < 25) {
    level = 1; pill = "Within 25 miles";
    headline = `The nearest young, active fault is ${miles(d)} to the ${young.dir}.`;
  } else {
    level = 0; pill = "None within 25 miles";
    headline = "No faults that moved in the last 15,000 years are mapped within about 25 miles.";
  }

  const body = [];
  if (young && mi(d) < 25) body.push(`<p><strong>${faultName(young.props)}</strong>${young.props.strand ? ` (${young.props.strand})` : ""}.</p>`);
  if (inZone) {
    body.push("<p>The Utah Geological Survey draws these zones around faults that could break the ground surface in a large earthquake. " +
      "Many Wasatch Front cities require a geologic fault study before new construction inside them. " +
      "If you own here, your city or county may already have a study on file.</p>");
  }
  body.push("<p>Being close to a fault matters most for <em>surface rupture</em>, where the ground itself cracks and steps. " +
    "Shaking is different: in a large Wasatch fault earthquake, strong shaking would reach across the whole valley, not just near the fault.</p>");
  if (wasatch && young && wasatch.km > young.km + 0.5 && mi(wasatch.km) < 30) {
    body.push(`<p class="muted">The Wasatch fault zone itself (${wasatch.props.section || "nearest section"}) is ${miles(wasatch.km)} to the ${wasatch.dir}.</p>`);
  }

  const rows = [];
  for (const [label, hit] of [["Nearest young fault (moved < 15,000 yr)", young], ["Nearest mapped Quaternary fault", any], ["Nearest Wasatch fault zone strand", wasatch]]) {
    if (!hit) continue;
    const p = hit.props;
    rows.push(`<dt>${label}</dt><dd>${faultName(p)}${p.strand ? ", " + p.strand : ""} — ${both(hit.km)}${hit.dir ? " " + hit.dir : ""}.<br>` +
      `Moved ${AGE_TEXT[p.age] || "(age undetermined)"}${p.slip ? "; slip rate " + p.slip : ""}${p.cls ? "; USGS " + p.cls : ""}.` +
      `${p.link ? ` <a href="${p.link}" target="_blank" rel="noopener">USGS report</a>` : ""}</dd>`);
  }
  const science = `<dl>${rows.join("")}</dl>` +
    "<p>Distances are measured to the mapped fault trace, which can be off by tens of meters where a fault is buried or inferred. " +
    "A study zone is the regulatory tool for site decisions, not this distance.</p>";

  return {
    level, pill, headline, body: body.join(""), science,
    source: 'Utah Geological Survey, <a href="https://geology.utah.gov/apps/qfaults/" target="_blank" rel="noopener">Utah Quaternary Fault and Fold Database</a> and surface-fault-rupture special study zones.',
  };
}

// ---------------------------------------------------------- Liquefaction

const LIQ = [
  ["Very low", "Very low liquefaction susceptibility here."],
  ["Low", "Low liquefaction susceptibility here."],
  ["Moderate", "Moderate liquefaction susceptibility here."],
  ["High", "High liquefaction susceptibility here."],
  ["Very high", "Very high liquefaction susceptibility here."],
];

export function liquefactionCard(liq) {
  const what = "<p>Liquefaction happens when strong shaking turns loose, water-soaked sand and silt soft, almost like quicksand. " +
    "The ground can sink, spread, or crack, which tilts foundations and breaks buried pipes.</p>";
  if (!liq) {
    return {
      level: "none", pill: "Not mapped",
      headline: "Liquefaction hasn't been mapped at this spot.",
      body: "<p>Liquefaction has been mapped for many Utah valleys, mostly where groundwater is shallow. " +
        "<strong>No map here doesn't mean no hazard.</strong> It means no one has published a map for this exact spot yet.</p>" + what,
      science: "<p>Point was outside every mapped susceptibility polygon. Maps are compiled at 1:24,000 scale.</p>",
      source: LIQ_SOURCE,
    };
  }
  if (liq.source === "1994") return liquefaction1994Card(liq, what);

  const [pill, headline] = LIQ[liq.level];
  const body = [what, liq.level >= 3 ? LIQ_HELPS : LIQ_LOWER];
  return {
    level: liq.level, pill, headline, body: body.join(""),
    science: `<p>UGS susceptibility class: <strong>${liq.label}</strong>. Susceptibility describes the soil's tendency to liquefy if shaken hard enough. ` +
      "It is not the probability that it will. Mapped at 1:24,000 scale; property-scale conditions can differ.</p>",
    source: LIQ_SOURCE,
  };
}

const LIQ_HELPS = "<p><strong>What helps:</strong> flexible gas and water connections, knowing how to shut off your utilities, " +
  "and asking a licensed engineer about the foundation before you build, buy, or remodel.</p>";
const LIQ_LOWER = "<p>Lower susceptibility is good news for the ground under you. It doesn't change how strongly the area would shake.</p>";
const LIQ_SOURCE = 'Utah Geological Survey, <a href="https://geology.utah.gov/apps/hazards/" target="_blank" rel="noopener">Geologic Hazards Portal</a>, liquefaction susceptibility.';

// The 1994 maps rated potential as the chance, in 100 years, of shaking strong
// enough to liquefy the ground.
const CHANCE_1994 = {
  1: "less than 5%", 2: "up to 10%", 3: "5 to 10%", 4: "5 to 50%",
  5: "10 to 50%", 6: "10% to more than 50%", 7: "more than 50%",
};
const OLDER_MAP = "<p class=\"muted\">This comes from regional maps published in 1994. They're less detailed than the Utah Geological Survey's newer maps, " +
  "which haven't reached this area yet. Treat it as a neighborhood-level picture, not a property-level one.</p>";

function liquefaction1994Card(liq, what) {
  const source = "Utah Geological Survey 1994 liquefaction-potential maps, digitized by the " +
    '<a href="https://gis.utah.gov/" target="_blank" rel="noopener">Utah Geospatial Resource Center</a> (CC BY 4.0).';
  if (liq.level == null) {
    const landslide = liq.code === 8
      ? "<p>Landslides can be triggered by earthquakes. The Utah Geological Survey's hazard maps show landslide areas in more detail.</p>" : "";
    return {
      level: "none", pill: liq.label,
      headline: `The 1994 regional map marks this spot as "${liq.label.toLowerCase()}" and doesn't rate its liquefaction.`,
      body: landslide + what + OLDER_MAP,
      science: `<p>1994 map class: ${liq.label} (code ${liq.code}), not rated for liquefaction potential.</p>`,
      source,
    };
  }
  return {
    level: liq.level, pill: liq.label,
    headline: `${liq.label} liquefaction potential here, on an older regional map.`,
    body: what + (liq.level >= 3 ? LIQ_HELPS : LIQ_LOWER) + OLDER_MAP,
    science: `<p>1994 map class: <strong>${liq.label}</strong>. The 1994 maps put the chance of ground shaking strong enough to cause liquefaction here, in any 100 years, at ${CHANCE_1994[liq.code]}. ` +
      "Where the map gives a range (such as \"low to moderate\"), this site scores it at the higher end.</p>",
    source,
  };
}

// ------------------------------------------------------ Design shaking

export function designCard(dv) {
  if (!dv) {
    return {
      level: "none", pill: "Unavailable",
      headline: "We couldn't reach the USGS building-code service just now.",
      body: "<p>Try again in a minute. Everything else on this page comes from data we keep on this site, so it's unaffected.</p>",
      science: "", source: DESIGN_SOURCE,
    };
  }
  const s = dv.sds;
  const [level, pill, word] =
    s >= 1.0 ? [4, "Very strong", "very strong"] :
    s >= 0.5 ? [3, "Strong", "strong"] :
    s >= 0.33 ? [2, "Moderate", "moderate"] :
    s >= 0.167 ? [1, "Low", "low-to-moderate"] : [0, "Very low", "light"];
  return {
    level, pill,
    headline: `New buildings here must be designed for ${word} shaking.`,
    body: "<p>This is the shaking that the national building-code standard says new buildings here must withstand without collapsing. " +
      "It's a design target, <strong>not a prediction</strong> of the next earthquake.</p>" +
      "<p>Older buildings were often built to weaker rules, or none. Unreinforced brick buildings are the biggest concern. " +
      '<a href="/brick.html">Check whether yours is brick.</a></p>',
    science: "<dl>" +
      `<dt>S<sub>DS</sub></dt><dd>${s.toFixed(2)} g (short-period design acceleration)</dd>` +
      (dv.sd1 != null ? `<dt>S<sub>D1</sub></dt><dd>${dv.sd1.toFixed(2)} g (1-second design acceleration)</dd>` : "") +
      (dv.pgam != null ? `<dt>PGA<sub>M</sub></dt><dd>${dv.pgam.toFixed(2)} g</dd>` : "") +
      (dv.sdc ? `<dt>Seismic Design Category</dt><dd>${dv.sdc}${/[DEF]/.test(dv.sdc) ? " (the high-seismic categories)" : ""}</dd>` : "") +
      "</dl><p>ASCE 7-22, Risk Category II (ordinary buildings), default site class (soil not known). " +
      "The edition Utah has adopted may use slightly different values. The 2023 USGS hazard model, which adds Salt Lake basin data, is not yet in these code values.</p>",
    source: DESIGN_SOURCE,
  };
}
const DESIGN_SOURCE = 'U.S. Geological Survey <a href="https://earthquake.usgs.gov/ws/designmaps/" target="_blank" rel="noopener">Seismic Design web services</a>, queried live.';

// ---------------------------------------------------------- Magna 2020

const MMI = [
  [0, "not felt"], [2, "weak"], [4, "light"], [5, "moderate"], [6, "strong"], [7, "very strong"], [8, "severe"], [9, "violent"],
];
export const mmiWord = (v) => MMI.reduce((w, [t, word]) => (v >= t - 0.5 ? word : w), "not felt");
const roman = (v) => ["I", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][Math.max(1, Math.round(v))];

export function magnaCard(m) {
  const distTxt = `${miles(m.epicenterKm)} from the epicenter`;
  if (m.mmi == null || m.mmi < 2) {
    return {
      level: 0, pill: "Barely felt",
      headline: "The 2020 Magna earthquake was barely felt here, if at all.",
      body: `<p>This spot is ${distTxt}. <a href="/magna.html">Read what Magna taught scientists</a>.</p>`,
      science: "", source: MAGNA_SOURCE,
    };
  }
  const r = Math.round(m.mmi);
  const level = r >= 7 ? 4 : r >= 6 ? 3 : r >= 5 ? 2 : r >= 4 ? 1 : 0;
  const word = mmiWord(m.mmi);
  const body = [`<p>On March 18, 2020, a magnitude ${m.event.mag} earthquake struck near Magna, ${distTxt}. ` +
    `USGS estimates shaking here was <strong>${word}</strong> (intensity ${roman(m.mmi)}).</p>`];
  const felt = m.zip || m.cell;
  if (m.zip) {
    body.push(`<p>In ZIP code ${m.zip.zip}, <strong>${n(m.zip.n)}</strong> people told the USGS what they felt. ` +
      `On average they described ${mmiWord(m.zip.cdi)} shaking.</p>`);
  } else if (m.cell) {
    body.push(`<p>Within about half a mile, ${n(m.cell.n)} ${m.cell.n === 1 ? "person" : "people"} told the USGS what they felt: ` +
      `on average, ${mmiWord(m.cell.cdi)} shaking.</p>`);
  }
  body.push("<p>Magna was a warning shot, not the big one. A magnitude 7 on the Wasatch fault would release roughly 90 times more energy " +
    "and shake harder and longer across the valley. " + '<a href="/magna.html">The Magna story</a>.</p>');
  const science = "<dl>" +
    `<dt>ShakeMap intensity</dt><dd>${m.mmi.toFixed(1)} MMI (≈1.5 km grid)</dd>` +
    (m.zip ? `<dt>DYFI, ZIP ${m.zip.zip}</dt><dd>CDI ${m.zip.cdi} from ${n(m.zip.n)} responses</dd>` : "") +
    (m.cell ? `<dt>DYFI, 1 km cell</dt><dd>CDI ${m.cell.cdi} from ${n(m.cell.n)} responses</dd>` : "") +
    `<dt>Epicenter</dt><dd>${both(m.epicenterKm)}; depth ${m.event.depth_km.toFixed(0)} km</dd>` +
    "</dl><p>ShakeMap blends seismic-station recordings with models; DYFI is people's own reports. They usually agree within about one intensity unit. " +
    (felt ? "" : "No Did You Feel It? reports were matched to this exact spot.") + "</p>";
  return { level, pill: word[0].toUpperCase() + word.slice(1), headline: `In 2020, Magna's shaking here was ${word}.`, body: body.join(""), science, source: MAGNA_SOURCE };
}
const MAGNA_SOURCE = 'U.S. Geological Survey, <a href="https://earthquake.usgs.gov/earthquakes/eventpage/uu60363602/executive" target="_blank" rel="noopener">M5.7 Magna event page</a>: ShakeMap and Did You Feel It?';

// ------------------------------------------------------- Basin (gated)

export const basinTeaser =
  "<p><strong>Why parts of the valley may shake longer.</strong> Recordings from Magna and other Utah quakes show that sites on deep basin sediments " +
  "shook several times more strongly at slow, rolling periods than sites on thin sediment. That matters most for taller buildings. " +
  "We're working with seismologists before showing what this means for individual addresses.</p>" +
  '<p><a href="/magna.html#basin">Read what scientists found</a></p>';
