// Make a Plan: the questions and every task they can produce.
//
// Edit freely. Each task has:
//   id      stable key (saved checkmarks use it, so don't rename casually)
//   tier    "now" (this weekend), "soon" (this month), "later" (bigger projects)
//   title   one line
//   detail  one or two sentences
//   when    (a, h) => true/false. a = answers, h = hazard flags from Know Your Ground
//   why     optional (a, h) => text shown when a task was added because of an answer
//
// Guidance follows Be Ready Utah, FEMA/Ready.gov, and the Utah Seismic Safety
// Commission's "Putting Down Roots in Earthquake Country". Have the structural
// engineer advisor review the "later" tier before launch.

export const QUESTIONS = [
  { id: "tenure", text: "Do you own or rent?", options: [["own", "Own"], ["rent", "Rent"]] },
  {
    id: "home", text: "What kind of place?",
    options: [["house", "House or townhome"], ["apt", "Apartment or condo"], ["mobile", "Mobile or manufactured home"], ["business", "A business"]],
  },
  {
    id: "built", text: "About when was it built?",
    options: [["pre1975", "Before 1975"], ["1975", "1975 to 1999"], ["2000", "2000 or later"], ["unsure", "Not sure"]],
  },
  {
    id: "brick", text: "Is it brick?",
    hint: 'Not sure? <a href="/brick.html">Here\'s how to tell.</a>',
    options: [["solid", "Yes, solid brick"], ["maybe", "Brick outside, not sure what's behind it"], ["no", "No"], ["unsure", "Not sure"]],
  },
  {
    id: "people", text: "Who's in your household?", multi: true,
    options: [["kids", "Kids"], ["older", "Older adults"], ["medical", "Someone with medical needs or a disability"], ["pets", "Pets"], ["adults", "Just adults"]],
  },
  {
    id: "power", text: "Does anyone depend on electricity for medical equipment or medication?",
    options: [["yes", "Yes"], ["no", "No"]],
  },
];

export const TIERS = [
  ["now", "This weekend", "Free or close to it. These prevent the most injuries."],
  ["soon", "This month", "A trip to the store and an evening of planning."],
  ["later", "Bigger projects", "Worth planning for. Some need a professional."],
];

const has = (a, q, v) => (Array.isArray(a[q]) ? a[q].includes(v) : a[q] === v);
const owns = (a) => a.tenure === "own";
const oldOrUnknown = (a) => a.built === "pre1975" || a.built === "unsure" || !a.built;
const maybeURM = (a) => (a.brick === "solid" || a.brick === "maybe" || a.brick === "unsure") && oldOrUnknown(a);

export const TASKS = [
  // ---------------- this weekend ----------------
  {
    id: "drill", tier: "now", title: "Practice Drop, Cover, and Hold On",
    detail: "Drop to your hands and knees, cover your head and neck under a sturdy table or against an inside wall, and hold on until the shaking stops. Practice it once with everyone at home.",
    when: () => true,
  },
  {
    id: "heater", tier: "now", title: "Strap the water heater",
    detail: "Two metal straps into the wall studs, top and bottom third. A falling water heater can break its gas line and start a fire, and it holds 40+ gallons of drinking water you'll want afterward.",
    when: (a) => a.home !== "apt" || owns(a),
  },
  {
    id: "heater-ask", tier: "now", title: "Ask your landlord whether the water heater is strapped",
    detail: "If you can see it, look for two metal straps. If it isn't strapped, ask in writing. Straps cost about $30.",
    when: (a) => a.tenure === "rent",
  },
  {
    id: "furniture", tier: "now", title: "Anchor tall furniture and the TV",
    detail: "Bookcases, dressers, and TVs are the things that fall on people. Furniture straps and anti-tip kits take minutes and cost a few dollars; renters can use them too.",
    when: () => true,
    why: (a) => (has(a, "people", "kids") ? "Especially important with kids: tip-overs injure children even without earthquakes." : ""),
  },
  {
    id: "beds", tier: "now", title: "Make the beds safe",
    detail: "Nothing heavy or glass hanging over a bed: no framed glass, mirrors, or shelves. Move beds away from windows and brick chimneys if you can.",
    when: () => true,
  },
  {
    id: "shoes", tier: "now", title: "Keep shoes and a flashlight by every bed",
    detail: "Broken glass causes many of the injuries after a quake. An earthquake may wake you, as Magna woke many people at 7:09 a.m.",
    when: () => true,
  },
  {
    id: "gas", tier: "now", title: "Find the gas shutoff, and know when to use it",
    detail: "Find the valve on the gas meter and keep a wrench nearby. Turn it off only if you smell gas or hear hissing. Once it's off, only the gas company should turn it back on, and that can take days.",
    when: (a) => a.home !== "apt",
  },
  {
    id: "contact", tier: "now", title: "Pick an out-of-state contact",
    detail: "Local calls jam after a big quake, but texts and long-distance calls often get through. Choose one person everyone checks in with, and write the number down.",
    when: () => true,
  },
  {
    id: "meet", tier: "now", title: "Agree on a meeting place",
    detail: "One spot near home and one outside the neighborhood, in case you can't get home.",
    when: () => true,
  },
  {
    id: "exits", tier: "now", title: "Know two ways out of the building",
    detail: "Find both stairwells. Don't use elevators after a quake.",
    when: (a) => a.home === "apt" || a.home === "business",
  },

  // ---------------- this month ----------------
  {
    id: "water", tier: "soon", title: "Store water: aim for two weeks",
    detail: "One gallon per person per day, plus extra for pets. Start with three days if two weeks feels like a lot. A big Wasatch quake could cut water service for much longer than a few days.",
    when: () => true,
  },
  {
    id: "kit", tier: "soon", title: "Build a kit you can grab",
    detail: "Food that doesn't need cooking, a first-aid kit, a battery or crank radio, flashlights, batteries, cash in small bills, phone chargers, and copies of IDs and insurance papers.",
    when: () => true,
  },
  {
    id: "meds", tier: "soon", title: "Keep a two-week supply of medications",
    detail: "Plus a written list of prescriptions, doses, and doctors. Ask your pharmacist about an emergency refill.",
    when: (a) => has(a, "people", "medical") || has(a, "people", "older"),
    why: () => "Added because someone in your household has medical needs.",
  },
  {
    id: "power", tier: "soon", title: "Plan for power-dependent equipment",
    detail: "Get a backup battery or other power source for oxygen, CPAP, refrigerated medication, or mobility devices. Ask your power company whether it has a medical-needs program.",
    when: (a) => a.power === "yes",
    why: () => "Added because someone depends on electricity for their health.",
  },
  {
    id: "buddy", tier: "soon", title: "Set up a check-in buddy",
    detail: "A neighbor who will check on an older or disabled household member, with a key or a plan to get in. Keep mobility aids and glasses within reach of the bed.",
    when: (a) => has(a, "people", "older") || has(a, "people", "medical"),
  },
  {
    id: "kids", tier: "soon", title: "Learn your kids' school reunification plan",
    detail: "Ask each school how and where they release students after a disaster, and who's on the pickup list. Put a comfort item and a family photo in each child's kit.",
    when: (a) => has(a, "people", "kids"),
  },
  {
    id: "pets", tier: "soon", title: "Pack for your pets",
    detail: "A carrier or leash, two weeks of food and water, medications, and a current photo. Make sure tags or microchip details are up to date; scared animals run.",
    when: (a) => has(a, "people", "pets"),
  },
  {
    id: "extinguisher", tier: "soon", title: "Get a fire extinguisher and learn to use it",
    detail: "Fires after earthquakes are a major threat, and fire crews will be stretched thin.",
    when: () => true,
  },
  {
    id: "insurance", tier: "soon", title: "Check your insurance",
    detail: "Standard homeowners and renters policies don't cover earthquake damage. Ask your agent what an earthquake policy or endorsement would cost, and what the deductible means in dollars.",
    when: (a) => a.home !== "business",
  },
  {
    id: "inventory", tier: "soon", title: "Video your belongings",
    detail: "Walk through each room filming your stuff, and store the video in the cloud. It makes any claim far easier.",
    when: () => true,
  },
  {
    id: "landlord", tier: "soon", title: "Ask your landlord five questions",
    detail: "Is the building unreinforced brick? Has it been retrofitted? Is the water heater strapped? Where are the gas and water shutoffs? What's the plan if the building can't be lived in?",
    when: (a) => a.tenure === "rent",
  },
  {
    id: "mobile", tier: "soon", title: "Check your home's support system",
    detail: "Manufactured homes can slide off their supports. Look for an engineered earthquake bracing system under the home, and ask a licensed installer if there isn't one.",
    when: (a) => a.home === "mobile",
  },
  {
    id: "business-7", tier: "soon", title: "Work through the 7 Steps to an Earthquake Resilient Business",
    detail: "Be Ready Utah's free guide covers staff communication, securing inventory and equipment, backing up records, and reopening.",
    when: (a) => a.home === "business",
  },
  {
    id: "business-shelves", tier: "soon", title: "Secure shelving, inventory, and equipment",
    detail: "Anchor tall shelving to the structure, add lips or straps to shelves, and keep heavy stock low.",
    when: (a) => a.home === "business",
  },

  // ---------------- bigger projects ----------------
  {
    id: "urm-engineer", tier: "later", title: "Have a structural engineer look at the building",
    detail: "Unreinforced brick buildings are the most dangerous kind in a Utah earthquake. An engineer can tell you whether yours is unreinforced and what a retrofit would involve.",
    when: (a) => maybeURM(a) && (owns(a) || a.home === "business"),
    why: () => "Added because your building may be unreinforced brick built before 1975.",
  },
  {
    id: "urm-retrofit", tier: "later", title: "Plan a brick retrofit, starting with the roof",
    detail: "The usual priorities are tying the roof to the walls, bracing parapets, and bracing or removing the chimney. Salt Lake City's Fix the Bricks program put the average at about $20,000.",
    when: (a) => a.brick === "solid" && a.built === "pre1975" && owns(a),
    why: () => "Added because you told us it's solid brick built before 1975.",
  },
  {
    id: "urm-renter", tier: "later", title: "If it's unreinforced brick, plan around it",
    detail: "Ask whether the landlord has plans to retrofit. Meanwhile, keep beds and couches away from brick walls and chimneys, and know which exit avoids falling brick (often not the front door under a parapet).",
    when: (a) => maybeURM(a) && a.tenure === "rent",
    why: () => "Added because your building may be unreinforced brick.",
  },
  {
    id: "chimney", tier: "later", title: "Brace or remove an old brick chimney",
    detail: "Brick chimneys were among the most common damage in the Magna earthquake. A contractor can brace it, or replace the top with a lightweight flue.",
    when: (a) => owns(a) && a.home === "house" && oldOrUnknown(a),
  },
  {
    id: "bolting", tier: "later", title: "Ask whether the house is bolted to its foundation",
    detail: "Older wood-frame houses sometimes sit on their foundations without enough anchor bolts. A licensed contractor or engineer can check, and the fix is usually straightforward.",
    when: (a) => owns(a) && a.home === "house" && a.brick === "no" && a.built !== "2000",
  },
  {
    id: "gas-valve", tier: "later", title: "Consider flexible gas connectors and an automatic shutoff valve",
    detail: "Flexible connectors on appliances bend instead of breaking. An earthquake-actuated valve shuts off gas automatically during strong shaking. Use a licensed plumber.",
    when: (a, h) => owns(a) && a.home !== "apt" && (h.liq >= 3 || h.zone === 1 || h.fault >= 3),
    why: (a, h) => (h.liq >= 3 ? "Added because your address has high liquefaction susceptibility, where the ground can move and break pipes."
      : "Added because your address is close to an active fault."),
  },
  {
    id: "liq-foundation", tier: "later", title: "Before you build, buy, or remodel: ask about the soil",
    detail: "On high-susceptibility ground, a geotechnical engineer can say whether the foundation needs anything special. Many cities require a study for new construction here.",
    when: (a, h) => h.liq >= 3,
    why: () => "Added because your address has high liquefaction susceptibility.",
  },
  {
    id: "fault-zone", tier: "later", title: "Check fault-study requirements before adding on",
    detail: "Inside a surface-fault-rupture study zone, many cities require a geologic study before additions or new buildings. Your city's planning office can tell you what's on file.",
    when: (a, h) => h.zone === 1 && owns(a),
    why: () => "Added because your address is inside a fault rupture study zone.",
  },
  {
    id: "business-continuity", tier: "later", title: "Write a one-page continuity plan",
    detail: "Who decides what, how you'll reach staff and customers, where you'd work if the building is closed, and how you'll make payroll. FEMA's QuakeSmart toolkit has templates.",
    when: (a) => a.home === "business",
  },
];
