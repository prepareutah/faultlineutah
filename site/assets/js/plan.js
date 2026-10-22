// Make a Plan: timeframe + household + a few questions -> a prioritized
// checklist, a supply list with amounts, a household plan sheet, and a PDF.
// Everything is kept in this browser only (localStorage), as a convenience;
// the page works without it.
import { QUESTIONS, COUNTS, DURATIONS, TIERS, TASKS, supplies, SHEET } from "./content/checklist.js";
import { buildPlanPDF } from "./plan-pdf.js";

const $ = (s) => document.querySelector(s);
const STORE = "fl:plan";
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const saved = load();
const answers = { days: 14, adults: 1, kids: 0, babies: 0, dogs: 0, cats: 0, ...(saved.answers || {}) };
migrate(answers);
const done = new Set(saved.done || []);
const have = new Set(saved.have || []);
const sheet = saved.sheet || {};

// Hazard flags arrive from Know Your Ground as #fault=..&zone=..&liq=..
const fromLookup = {};
for (const [k, v] of new URLSearchParams(location.hash.slice(1))) fromLookup[k] = Number(v);
if (Object.keys(fromLookup).length) answers.hazard = fromLookup;
const h = () => answers.hazard || {};

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ answers, done: [...done], have: [...have], sheet }));
  } catch { /* fine */ }
}
// Answers saved by the first version of this page used one "people" list.
function migrate(a) {
  if (!Array.isArray(a.people)) return;
  if (a.people.includes("kids") && !a.kids) a.kids = 1;
  if (a.people.includes("pets") && !a.dogs && !a.cats) a.dogs = 1;
  a.needs = a.people.filter((p) => p === "older" || p === "medical");
  delete a.people;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const durationLabel = () => DURATIONS.find(([d]) => d === answers.days)?.[1] || `${answers.days} days`;

// ---------------------------------------------------------------- inputs

function renderDuration() {
  $("#duration").innerHTML = DURATIONS.map(([d, label, blurb]) => `
    <label class="dur"><input type="radio" name="days" value="${d}" ${answers.days === d ? "checked" : ""}>
      <span><strong>${label}</strong><small>${blurb}</small></span></label>`).join("");
}

function renderCounts() {
  $("#counts").innerHTML = COUNTS.map(([id, label, , min, max]) => `
    <div class="count">
      <span class="count-label" id="lbl-${id}">${label}</span>
      <span class="stepper" role="group" aria-labelledby="lbl-${id}">
        <button type="button" data-step="${id}" data-d="-1" aria-label="One fewer" ${answers[id] <= min ? "disabled" : ""}>−</button>
        <output aria-live="polite">${answers[id]}</output>
        <button type="button" data-step="${id}" data-d="1" aria-label="One more" ${answers[id] >= max ? "disabled" : ""}>+</button>
      </span>
    </div>`).join("");
}

function renderQuiz() {
  $("#quiz").innerHTML = QUESTIONS.map((q) => `
    <div class="q"><fieldset>
      <legend>${q.text}</legend>
      ${q.hint ? `<p class="small muted" style="margin:-4px 0 8px">${q.hint}</p>` : ""}
      <div class="choices">
        ${q.options.map(([v, label]) => {
          const checked = q.multi ? (answers[q.id] || []).includes(v) : answers[q.id] === v;
          return `<label><input type="${q.multi ? "checkbox" : "radio"}" name="${q.id}" value="${v}" ${checked ? "checked" : ""}><span>${label}</span></label>`;
        }).join("")}
      </div>
    </fieldset></div>`).join("");
}

// -------------------------------------------------------------- outputs

function tunedFor() {
  const a = answers, out = [];
  const pick = (id) => QUESTIONS.find((q) => q.id === id).options.find(([v]) => v === a[id])?.[1];
  out.push(`Ready for ${durationLabel()}`);
  const who = [plural(a.adults, "adult"), a.kids && plural(a.kids, "child", "children"), a.babies && plural(a.babies, "baby", "babies"),
    a.dogs && plural(a.dogs, "dog"), a.cats && plural(a.cats, "cat or small pet", "cats or small pets")].filter(Boolean);
  out.push(who.join(", "));
  for (const id of ["tenure", "home", "built"]) if (a[id] && a[id] !== "unsure") out.push(pick(id));
  if (a.brick === "solid" || a.brick === "maybe") out.push("Brick");
  for (const nd of a.needs || []) if (nd !== "none") out.push(QUESTIONS.find((q) => q.id === "needs").options.find(([v]) => v === nd)[1]);
  if (a.power === "yes") out.push("Power-dependent medical needs");
  if (a.car) out.push(a.car === "yes" ? "Has a car" : "No car");
  const hz = h();
  if (hz.liq >= 3) out.push("High liquefaction at your address");
  if (hz.zone === 1) out.push("In a fault study zone");
  else if (hz.fault >= 3) out.push("Near an active fault");
  return out;
}

const tasksFor = () => TASKS.filter((t) => t.when(answers, h()));

function renderPlan() {
  const tasks = tasksFor();
  const answered = QUESTIONS.filter((q) => (q.multi ? answers[q.id]?.length : answers[q.id])).length;
  const count = tasks.filter((t) => done.has(t.id)).length;

  $("#tuned").innerHTML = tunedFor().map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  $("#hazard-note").innerHTML = answers.hazard
    ? '<div class="notice info"><p>Tuned to the address you looked up in <a href="/ground.html">Know Your Ground</a>. ' +
      '<button class="btn ghost" type="button" id="clear-hazard" style="min-height:0;padding:0">Remove that</button></p></div>'
    : '<p class="small muted">Tip: look up your address in <a href="/ground.html">Know Your Ground</a> first and this plan will account for the ground under you.</p>';

  $("#actions-body").innerHTML = `
    <p><strong>${count} of ${tasks.length} done.</strong> ${answered < QUESTIONS.length ? `Answer the other ${QUESTIONS.length - answered} question${QUESTIONS.length - answered === 1 ? "" : "s"} to fine-tune the list.` : ""}</p>
    <div class="progress" aria-hidden="true"><div style="width:${tasks.length ? (100 * count) / tasks.length : 0}%"></div></div>
    ${TIERS.map(([tier, label, blurb]) => {
      const list = tasks.filter((t) => t.tier === tier);
      if (!list.length) return "";
      return `<div class="tier"><h3>${label}</h3><span class="muted small">${blurb}</span></div>
        <ul class="tasks">${list.map((t) => {
          const why = t.why?.(answers, h());
          return `<li class="task ${done.has(t.id) ? "done" : ""}">
            <input type="checkbox" id="t-${t.id}" data-task="${t.id}" ${done.has(t.id) ? "checked" : ""}>
            <label for="t-${t.id}"><strong>${t.title}</strong><span class="d">${t.detail}</span>${why ? `<span class="why">${why}</span>` : ""}</label>
          </li>`;
        }).join("")}</ul>`;
    }).join("")}`;

  const groups = supplies(answers);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const got = groups.reduce((n, g) => n + g.items.filter(([item]) => have.has(g.group + ":" + item)).length, 0);
  $("#supplies-body").innerHTML = `
    <p><strong>For ${durationLabel()}, ${tunedFor()[1]}.</strong> ${got} of ${total} on hand. Amounts are rough planning numbers; adjust for your family.</p>
    <div class="supply-groups">${groups.map((g) => `
      <div class="supply-group"><h3>${g.group}</h3><ul>${g.items.map(([item, amount]) => {
        const key = esc(g.group + ":" + item);
        return `<li><label><input type="checkbox" data-have="${key}" ${have.has(g.group + ":" + item) ? "checked" : ""}>
          <span class="s-item">${esc(item)}</span><span class="s-amt">${esc(amount)}</span></label></li>`;
      }).join("")}</ul></div>`).join("")}</div>`;
}

function renderSheet() {
  $("#sheet-body").innerHTML = SHEET.filter(([, , show]) => show(answers)).map(([id, label]) => `
    <label class="sheet-field"><span>${label}</span>
      <textarea rows="${id === "notes" || id === "medical" ? 3 : 2}" data-sheet="${id}">${esc(sheet[id])}</textarea></label>`).join("");
}

function renderAll() {
  renderDuration();
  renderCounts();
  renderQuiz();
  renderPlan();
  renderSheet();
}

// ---------------------------------------------------------------- events

$("#duration").addEventListener("change", (e) => {
  answers.days = Number(e.target.value);
  save();
  renderPlan();
});

$("#counts").addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  const [id, , , min, max] = COUNTS.find(([c]) => c === b.dataset.step);
  answers[id] = Math.min(max, Math.max(min, answers[id] + Number(b.dataset.d)));
  save();
  renderCounts();
  renderPlan();
  renderSheet();
  document.querySelector(`[data-step="${id}"][data-d="${b.dataset.d}"]`)?.focus();
});

$("#quiz").addEventListener("change", (e) => {
  const q = QUESTIONS.find((x) => x.id === e.target.name);
  if (!q) return;
  if (q.multi) {
    // "No" clears the others, and picking anything else clears "No".
    const boxes = document.querySelectorAll(`input[name="${q.id}"]`);
    if (e.target.checked) {
      boxes.forEach((i) => {
        if (e.target.value === "none" ? i.value !== "none" : i.value === "none") i.checked = false;
      });
    }
    answers[q.id] = [...document.querySelectorAll(`input[name="${q.id}"]:checked`)].map((i) => i.value);
  } else {
    answers[q.id] = e.target.value;
  }
  save();
  renderPlan();
  renderSheet();
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.task) {
    e.target.checked ? done.add(e.target.dataset.task) : done.delete(e.target.dataset.task);
    save();
    renderPlan();
  } else if (e.target.dataset.have) {
    e.target.checked ? have.add(e.target.dataset.have) : have.delete(e.target.dataset.have);
    save();
    renderPlan();
  }
});

$("#sheet-body").addEventListener("input", (e) => {
  if (!e.target.dataset.sheet) return;
  sheet[e.target.dataset.sheet] = e.target.value;
  save();
});

document.addEventListener("click", (e) => {
  if (e.target.id !== "clear-hazard") return;
  delete answers.hazard;
  history.replaceState(null, "", location.pathname);
  save();
  renderPlan();
});

$("#reset").addEventListener("click", () => {
  if (!confirm("Clear your answers, checkmarks, and plan sheet?")) return;
  for (const k of Object.keys(answers)) delete answers[k];
  Object.assign(answers, { days: 14, adults: 1, kids: 0, babies: 0, dogs: 0, cats: 0 });
  done.clear();
  have.clear();
  for (const k of Object.keys(sheet)) delete sheet[k];
  history.replaceState(null, "", location.pathname);
  save();
  renderAll();
});

// ------------------------------------------------------------------- PDF

function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSPDF;
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => reject(new Error("Couldn't load the PDF tool"));
    document.head.append(s);
  });
}

function planData() {
  const tasks = tasksFor();
  const tuned = tunedFor();
  return {
    title: "Our Earthquake Plan",
    subtitle: `Ready for ${durationLabel()}  |  ${tuned[1]}`,
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    tuned: tuned.slice(2),
    tiers: TIERS.map(([tier, label, blurb]) => ({
      label, blurb,
      tasks: tasks.filter((t) => t.tier === tier).map((t) => ({ title: t.title, detail: t.detail, why: t.why?.(answers, h()) || "", done: done.has(t.id) })),
    })),
    suppliesTitle: `Supplies for ${durationLabel()}`,
    suppliesBlurb: "Rough planning amounts. Check off what you have; build the rest over time.",
    supplies: supplies(answers),
    sheet: SHEET.filter(([, , show]) => show(answers)).map(([id, label]) => [label, sheet[id] || ""]),
    footer: "faultlineutah.com  |  For education and preparedness only. Not an engineering assessment.",
  };
}

$("#pdf").addEventListener("click", async () => {
  const btn = $("#pdf");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Making your PDF…";
  $("#pdf-status").textContent = "";
  try {
    const jsPDF = await loadJsPDF();
    buildPlanPDF(jsPDF, planData()).save("FaultLine-Utah-earthquake-plan.pdf");
  } catch {
    $("#pdf-status").textContent = "Sorry, the PDF couldn't be made just now. Check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

save();
renderAll();
