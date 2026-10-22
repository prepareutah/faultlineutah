// Builds the "Our Earthquake Plan" PDF directly with jsPDF, so exporting
// never goes through the browser's print dialog.
//
// buildPlanPDF(jsPDF, plan) returns a jsPDF document. `plan` is plain data:
//   { title, date, subtitle, tuned: [..], tiers: [{label, blurb, tasks: [{title, detail, why, done}]}],
//     supplies: [{group, items: [[item, amount]]}], sheet: [[label, value]], footer }

const C = {
  brand: [27, 77, 92], accent: [185, 83, 44], ink: [30, 42, 50], muted: [86, 99, 108],
  line: [221, 213, 199], soft: [239, 234, 224], white: [255, 255, 255],
};
const PAGE = { w: 612, h: 792, m: 50 }; // US Letter, points
const WIDTH = PAGE.w - PAGE.m * 2;

// The built-in PDF fonts only cover basic Latin, so swap typographic characters.
const clean = (s) => String(s ?? "")
  .replace(/<[^>]+>/g, "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-").replace(/…/g, "...").replace(/ /g, " ")
  .replace(/[^\x20-\x7E\n]/g, "");

export function buildPlanPDF(jsPDF, plan) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = PAGE.m;

  const color = (c, kind = "text") => (kind === "text" ? doc.setTextColor(...c) : kind === "fill" ? doc.setFillColor(...c) : doc.setDrawColor(...c));
  const font = (family, style, size) => { doc.setFont(family, style); doc.setFontSize(size); };
  const lines = (text, width) => doc.splitTextToSize(clean(text), width);
  const lh = (size) => size * 1.32;

  function newPage() {
    doc.addPage();
    y = PAGE.m;
    font("helvetica", "bold", 8);
    color(C.muted);
    doc.text(clean(plan.title).toUpperCase(), PAGE.m, y - 18);
    color(C.line, "draw");
    doc.setLineWidth(0.5);
    doc.line(PAGE.m, y - 12, PAGE.w - PAGE.m, y - 12);
    y += 4;
  }
  const room = (h) => { if (y + h > PAGE.h - PAGE.m - 24) newPage(); };

  // ---------- cover header ----------
  color(C.brand, "fill");
  doc.rect(0, 0, PAGE.w, 118, "F");
  color(C.accent, "draw");
  doc.setLineWidth(3);
  doc.line(PAGE.m, 96, PAGE.m + 60, 96);
  font("helvetica", "bold", 9);
  color(C.white);
  doc.text("FAULTLINE UTAH   |   LIVING ON THE FAULT", PAGE.m, 38);
  font("times", "bold", 28);
  doc.text(clean(plan.title), PAGE.m, 74);
  font("helvetica", "normal", 10);
  doc.text(clean(plan.subtitle), PAGE.m, 112 - 2);
  font("helvetica", "normal", 9);
  doc.text(clean(plan.date), PAGE.w - PAGE.m, 38, { align: "right" });
  y = 148;

  if (plan.tuned.length) {
    font("helvetica", "bold", 8);
    color(C.muted);
    doc.text("TUNED FOR", PAGE.m, y);
    y += 12;
    // Each item is its own rounded tag, wrapped whole.
    font("helvetica", "bold", 9);
    let x = PAGE.m;
    y += 4;
    for (const t of plan.tuned) {
      const w = doc.getTextWidth(clean(t)) + 16;
      if (x + w > PAGE.w - PAGE.m) { x = PAGE.m; y += 22; }
      color(C.soft, "fill");
      color(C.line, "draw");
      doc.setLineWidth(0.6);
      doc.roundedRect(x, y - 11, w, 17, 8.5, 8.5, "FD");
      color(C.ink);
      doc.text(clean(t), x + 8, y + 1);
      x += w + 6;
    }
    y += 22;
  }

  function heading(text, blurb) {
    room(60);
    y += 10;
    font("times", "bold", 17);
    color(C.brand);
    doc.text(clean(text), PAGE.m, y);
    color(C.accent, "draw");
    doc.setLineWidth(2);
    doc.line(PAGE.m, y + 6, PAGE.m + 36, y + 6);
    y += 20;
    if (blurb) {
      font("helvetica", "italic", 9.5);
      color(C.muted);
      for (const l of lines(blurb, WIDTH)) { doc.text(l, PAGE.m, y); y += lh(9.5); }
      y += 4;
    }
  }

  // ---------- action list ----------
  for (const tier of plan.tiers) {
    if (!tier.tasks.length) continue;
    heading(tier.label, tier.blurb);
    for (const t of tier.tasks) {
      const textX = PAGE.m + 22, textW = WIDTH - 22;
      font("helvetica", "bold", 11);
      const tl = lines(t.title, textW);
      font("helvetica", "normal", 9.5);
      const dl = lines(t.detail, textW);
      font("helvetica", "bold", 8.5);
      const wl = t.why ? lines(t.why, textW) : [];
      const h = tl.length * lh(11) + dl.length * lh(9.5) + wl.length * lh(8.5) + 12;
      room(h);
      // Checkbox
      color(C.brand, "draw");
      color(C.brand, "fill");
      doc.setLineWidth(1);
      doc.roundedRect(PAGE.m, y - 9, 11, 11, 2, 2, t.done ? "FD" : "S");
      if (t.done) {
        color(C.white, "draw");
        doc.setLineWidth(1.6);
        doc.line(PAGE.m + 2.5, y - 3.5, PAGE.m + 4.8, y - 1);
        doc.line(PAGE.m + 4.8, y - 1, PAGE.m + 8.8, y - 7);
      }
      font("helvetica", "bold", 11);
      color(t.done ? C.muted : C.ink);
      for (const l of tl) { doc.text(l, textX, y); y += lh(11); }
      font("helvetica", "normal", 9.5);
      color(C.muted);
      for (const l of dl) { doc.text(l, textX, y); y += lh(9.5); }
      if (wl.length) {
        font("helvetica", "bold", 8.5);
        color(C.accent);
        for (const l of wl) { doc.text(l, textX, y); y += lh(8.5); }
      }
      y += 8;
    }
  }

  // ---------- supply list ----------
  heading(plan.suppliesTitle, plan.suppliesBlurb);
  const colX = PAGE.m + WIDTH * 0.55;
  for (const g of plan.supplies) {
    room(17 + 2 * lh(10) + 16);
    color(C.soft, "fill");
    doc.rect(PAGE.m, y - 11, WIDTH, 17, "F");
    font("helvetica", "bold", 9);
    color(C.brand);
    doc.text(clean(g.group).toUpperCase(), PAGE.m + 6, y);
    y += 16;
    for (const [item, amount] of g.items) {
      font("helvetica", "normal", 10);
      const il = lines(item, colX - PAGE.m - 24);
      const al = lines(amount, PAGE.w - PAGE.m - colX);
      const h = Math.max(il.length, al.length) * lh(10) + 4;
      room(h);
      font("helvetica", "normal", 10);
      color(C.brand, "draw");
      doc.setLineWidth(0.8);
      doc.rect(PAGE.m + 6, y - 8, 8, 8, "S");
      color(C.ink);
      il.forEach((l, i) => doc.text(l, PAGE.m + 22, y + i * lh(10)));
      font("helvetica", "bold", 10);
      al.forEach((l, i) => doc.text(l, colX, y + i * lh(10)));
      y += h;
      color(C.line, "draw");
      doc.setLineWidth(0.4);
      doc.line(PAGE.m + 22, y - lh(10) + 6, PAGE.w - PAGE.m, y - lh(10) + 6);
    }
    y += 8;
  }

  // ---------- household plan sheet ----------
  // Two columns, with long fields across the page, so it fits on one page.
  newPage();
  heading("Our household plan", "Fill this in together, keep a copy in your kit, and give one to your out-of-state contact.");
  y += 10;
  const GAP = 18, COL = (WIDTH - GAP) / 2;
  const wide = (label) => /medical|notes|shutoffs|pickup/i.test(label);
  function field(label, value, x, w, rows) {
    font("helvetica", "bold", 8);
    color(C.muted);
    doc.text(clean(label).toUpperCase(), x, y);
    font("helvetica", "normal", 10.5);
    const vl = value ? lines(value, w - 4) : [];
    color(C.line, "draw");
    doc.setLineWidth(0.6);
    for (let i = 0; i < Math.max(rows, vl.length); i++) {
      const ly = y + 18 + i * 18;
      if (vl[i]) { color(C.ink); doc.text(vl[i], x + 2, ly); }
      doc.line(x, ly + 5, x + w, ly + 5);
    }
    return 18 + Math.max(rows, vl.length) * 18;
  }
  const rows = [];
  for (const [label, value] of plan.sheet) {
    const last = rows[rows.length - 1];
    if (!wide(label) && last && last.length === 1 && !wide(last[0][0])) last.push([label, value]);
    else rows.push([[label, value]]);
  }
  for (const row of rows) {
    const rowsFor = (label) => (wide(label) ? 3 : 2);
    font("helvetica", "normal", 10.5);
    const need = Math.max(...row.map(([label, value]) => 18 + Math.max(rowsFor(label), value ? lines(value, COL).length : 0) * 18));
    room(need + 10);
    if (row.length === 1 && wide(row[0][0])) {
      y += field(row[0][0], row[0][1], PAGE.m, WIDTH, 3) + 10;
    } else {
      const hs = row.map(([label, value], i) => field(label, value, PAGE.m + i * (COL + GAP), COL, 2));
      y += Math.max(...hs) + 10;
    }
  }

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font("helvetica", "normal", 7.5);
    color(C.muted);
    doc.text(clean(plan.footer), PAGE.m, PAGE.h - 28, { maxWidth: WIDTH - 60 });
    doc.text(`${i} / ${pages}`, PAGE.w - PAGE.m, PAGE.h - 28, { align: "right" });
  }
  return doc;
}
