// Site settings the project manager can change without touching other code.
window.FL_CONFIG = {
  // Optional free key from https://developer.mapserv.utah.gov (UGRC Web API).
  // Without it, address search uses UGRC's open "Masquerade" locator (same
  // state address data, no key), then OpenStreetMap as a backup. A key is the
  // right long-term choice if traffic grows.
  ugrcKey: "",

  // Newsletter signup. Paste the provider's form "action" URL here
  // (Buttondown: https://buttondown.com/api/emails/embed-subscribe/YOURNAME).
  // Empty shows "coming soon" instead of a form.
  newsletterAction: "",

  // Per-address basin-depth note. Stays off until a seismologist advisor has
  // reviewed the bands and wording (product plan §4.3 and §10 decision gate).
  basinNoteEnabled: false,

  contactEmail: "hello@faultlineutah.com",
};
