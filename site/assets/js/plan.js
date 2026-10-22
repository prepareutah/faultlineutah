// Make a Plan: answers -> a prioritized, printable checklist.
// Answers and checkmarks are kept in this browser only (localStorage), as a
// convenience; everything works without it.
import { QUESTIONS, TIERS, TASKS } from "./content/checklist.js";

const $ = (s) => document.querySelector(s);
const STORE = "fl:plan";

const saved = load();
const answers = saved.answers || {};
const done = new Set(saved.done || []);

// Hazard flags arrive from Know Your Ground as #fault=..&zone=..&liq=..
const hazard = {};
for (const [k, v] of new URLSearchParams(location.hash.slice(1))) hazard[k] = Number(v);
if (Object.keys(hazard).length) answers.hazard = hazard;
const h = answers.hazard || {};

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ answers, done: [...done] })); } catch { /* fine */ }
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

  $("#quiz").addEventListener("change", (e) => {
    const q = QUESTIONS.find((x) => x.id === e.target.name);
    if (!q) return;
    if (q.multi) {
      answers[q.id] = [...document.querySelectorAll(`input[name="${q.id}"]:checked`)].map((i) => i.value);
    } else {
      answers[q.id] = e.target.value;
    }
    save();
    renderPlan();
  });
}

function renderPlan() {
  const tasks = TASKS.filter((t) => t.when(answers, h));
  const answered = QUESTIONS.filter((q) => (q.multi ? answers[q.id]?.length : answers[q.id])).length;
  const count = tasks.filter((t) => done.has(t.id)).length;

  $("#hazard-note").innerHTML = answers.hazard
    ? '<div class="notice info"><p>Tuned to the address you looked up in <a href="/ground.html">Know Your Ground</a>. ' +
      '<button class="btn ghost" type="button" id="clear-hazard" style="min-height:0;padding:0">Remove that</button></p></div>'
    : '<p class="small muted">Tip: look up your address in <a href="/ground.html">Know Your Ground</a> first and this list will account for your ground.</p>';
  $("#clear-hazard")?.addEventListener("click", () => {
    delete answers.hazard;
    for (const k of Object.keys(h)) delete h[k];
    history.replaceState(null, "", location.pathname);
    save();
    renderPlan();
  });

  $("#plan").innerHTML = `
    <div class="print-only"><h1 style="font-size:20pt">My earthquake plan</h1><p>FaultLine Utah · faultlineutah.com · ${new Date().toLocaleDateString()}</p></div>
    <p><strong>${count} of ${tasks.length} done.</strong> ${answered < QUESTIONS.length ? `Answer the other ${QUESTIONS.length - answered} question${QUESTIONS.length - answered === 1 ? "" : "s"} to fine-tune the list.` : ""}</p>
    <div class="progress" aria-hidden="true"><div style="width:${tasks.length ? (100 * count) / tasks.length : 0}%"></div></div>
    ${TIERS.map(([tier, label, blurb]) => {
      const list = tasks.filter((t) => t.tier === tier);
      if (!list.length) return "";
      return `<div class="tier"><h3>${label}</h3><span class="muted small">${blurb}</span></div>
        <ul class="tasks">${list.map((t) => {
          const why = t.why?.(answers, h);
          return `<li class="task ${done.has(t.id) ? "done" : ""}">
            <input type="checkbox" id="t-${t.id}" data-id="${t.id}" ${done.has(t.id) ? "checked" : ""}>
            <label for="t-${t.id}"><strong>${t.title}</strong><span class="d">${t.detail}</span>${why ? `<span class="why">${why}</span>` : ""}</label>
          </li>`;
        }).join("")}</ul>`;
    }).join("")}`;
}

$("#plan").addEventListener("change", (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  e.target.checked ? done.add(id) : done.delete(id);
  save();
  renderPlan();
});

$("#print").addEventListener("click", () => print());
$("#reset").addEventListener("click", () => {
  if (!confirm("Clear your answers and checkmarks?")) return;
  for (const k of Object.keys(answers)) delete answers[k];
  for (const k of Object.keys(h)) delete h[k];
  done.clear();
  history.replaceState(null, "", location.pathname);
  save();
  renderQuiz();
  renderPlan();
});

save();
renderQuiz();
renderPlan();
