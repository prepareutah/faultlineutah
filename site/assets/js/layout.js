// Shared header and footer. Loaded as a plain (blocking) script right after
// each page's <div id="site-header">, so the header paints with the page.
(function () {
  var NAV = [
    ["/ground.html", "Know Your Ground"],
    ["/faults.html", "Fault Lines"],
    ["/plan.html", "Make a Plan"],
    ["/brick.html", "Is It Brick?"],
    ["/magna.html", "Magna 2020"],
    ["/about.html", "About & Sources"],
  ];

  var LOGO =
    '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<rect width="40" height="40" rx="10" fill="var(--brand)"/>' +
    '<path d="M4 28 L12 15.5 L16.5 21 L22 12 L36 28 Z" fill="var(--brand-ink)"/>' +
    '<path d="M4 32.5 H18 L21 29 H36" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  var here = location.pathname.replace(/\/index\.html$/, "/");
  var links = NAV.map(function (n) {
    var cur = here === n[0] || here === n[0].replace(".html", "") ? ' aria-current="page"' : "";
    return '<li><a href="' + n[0] + '"' + cur + ">" + n[1] + "</a></li>";
  }).join("");

  var header = document.getElementById("site-header");
  if (header) {
    header.outerHTML =
      '<a class="skip" href="#main">Skip to content</a>' +
      '<header class="site-header"><div class="wrap">' +
      '<a class="brand" href="/" aria-label="FaultLine Utah home">' + LOGO +
      '<span class="brand-name">FaultLine Utah<span>Living on the Fault</span></span></a>' +
      '<nav aria-label="Main"><details class="nav"><summary>Menu</summary><ul>' + links + "</ul></details></nav>" +
      "</div></header>";
  }

  // Footer waits for the DOM so it can sit at the end of any page.
  document.addEventListener("DOMContentLoaded", function () {
    var slot = document.getElementById("site-footer");
    if (!slot) return;
    var cfg = window.FL_CONFIG || {};
    var signup = cfg.newsletterAction
      ? '<form method="post" target="_blank" action="' + cfg.newsletterAction + '">' +
        '<label class="skip" for="nl-email">Email</label>' +
        '<input id="nl-email" type="email" name="email" required placeholder="you@example.com" autocomplete="email">' +
        '<button class="btn" type="submit">Subscribe</button></form>'
      : '<p class="small">Coming soon: a short quarterly letter on Utah quakes, the basin, brick homes, and what to do this weekend.</p>';

    slot.outerHTML =
      '<footer class="site-footer no-print"><div class="wrap"><div class="cols">' +
      "<div><strong>FaultLine Utah</strong><p>Plain-language earthquake information for the people who live along the Wasatch Front.</p>" +
      "<p><strong>For education and preparedness only.</strong> Not an engineering assessment, inspection, insurance determination, real-estate disclosure, or earthquake prediction. " +
      "Talk to a licensed structural engineer about your building.</p>" +
      "<p><strong>Utah does not have a public earthquake early warning system yet.</strong> This site never sends alerts.</p></div>" +
      '<div><strong>Explore</strong><ul>' + links + "</ul></div>" +
      '<div class="newsletter"><strong>Living on the Fault newsletter</strong>' + signup +
      '<p class="small" style="margin-top:12px">Data from the Utah Geological Survey and the U.S. Geological Survey. ' +
      '<a href="/about.html#sources">Sources &amp; dates</a> · <a href="/about.html#privacy">Privacy</a></p></div>' +
      "</div></div></footer>";
  });
})();
