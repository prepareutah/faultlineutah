// Make a Plan: the questions, every task they can produce, the supply
// calculator, and the household plan sheet.
//
// Edit freely. Each task has:
//   id      stable key (saved checkmarks use it, so don't rename casually)
//   tier    "now" (this weekend), "soon" (this month), "later" (bigger projects)
//   title   one line
//   detail  one or two sentences
//   when    (a, h) => true/false. a = answers, h = hazard flags from Know Your Ground
//   why     optional (a, h) => text shown when a task was added because of an answer
//
// Answers (a): tenure, home, built, brick, needs[], power, car, days,
// and counts adults, kids, babies, dogs, cats.
//
// Guidance follows Be Ready Utah, FEMA/Ready.gov, the CDC, and the Utah Seismic
// Safety Commission's "Putting Down Roots in Earthquake Country". Have the
// structural engineer advisor review the "later" tier before launch.

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
    id: "needs", text: "Does anyone need extra help?", multi: true,
    options: [["older", "Older adults"], ["medical", "Medical needs or a disability"], ["mobility", "Uses a wheelchair or walker"], ["none", "No"]],
  },
  {
    id: "power", text: "Does anyone depend on electricity for medical equipment or medication?",
    options: [["yes", "Yes"], ["no", "No"]],
  },
  { id: "car", text: "Do you have a car?", options: [["yes", "Yes"], ["no", "No"]] },
];

// Household counts, shown as +/- steppers.
export const COUNTS = [
  ["adults", "Adults and teens", 1, 0, 20],
  ["kids", "Children", 0, 0, 20],
  ["babies", "Babies (under 2)", 0, 0, 10],
  ["dogs", "Dogs", 0, 0, 10],
  ["cats", "Cats and other small pets", 0, 0, 10],
];

// How long to prepare for. Utah emergency managers suggest two weeks for a
// major Wasatch earthquake; many Utah families keep three months of food.
export const DURATIONS = [
  [3, "3 days", "The basic kit"],
  [14, "2 weeks", "Recommended for a big Wasatch quake"],
  [30, "30 days", "Deeper readiness"],
  [90, "3 months", "Long-term storage"],
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
const days = (a) => a.days || 14;
const kids = (a) => (a.kids || 0) + (a.babies || 0) > 0;
const pets = (a) => (a.dogs || 0) + (a.cats || 0) > 0;
const people = (a) => Math.max(1, (a.adults ?? 1) + (a.kids || 0) + (a.babies || 0));

export const TASKS = [
  // ---------------- this weekend ----------------
  {
    id: "drill", tier: "now", title: "Practice Drop, Cover, and Hold On",
    detail: "Drop to your hands and knees, cover your head and neck under a sturdy table or against an inside wall, and hold on until the shaking stops. Practice it once with everyone at home.",
    when: (a) => !has(a, "needs", "mobility"),
  },
  {
    id: "drill-lock", tier: "now", title: "Practice Lock, Cover, and Hold On",
    detail: "For wheelchair and walker users: lock your wheels or get as low as you safely can, cover your head and neck with your arms or a book, and hold on until the shaking stops. Practice it, along with Drop, Cover, and Hold On for everyone else.",
    when: (a) => has(a, "needs", "mobility"),
    why: () => "Added because someone uses a wheelchair or walker.",
  },
  {
    id: "heater", tier: "now", title: "Strap the water heater",
    detail: "Two metal straps into the wall studs, top and bottom third. A falling water heater can break its gas line and start a fire, and it holds 40+ gallons of drinking water you'll want afterward.",
    when: (a) => a.tenure !== "rent" && a.home !== "apt",
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
    why: (a) => (kids(a) ? "Especially important with kids: tip-overs injure children even without earthquakes." : ""),
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
    id: "mobility-bed", tier: "now", title: "Keep mobility aids within reach of the bed",
    detail: "Wheelchair, walker, cane, glasses, and hearing aids where you can reach them in the dark, secured so they won't slide away or be buried.",
    when: (a) => has(a, "needs", "mobility") || has(a, "needs", "older"),
  },
  {
    id: "gas", tier: "now", title: "Find the gas shutoff, and know when to use it",
    detail: "Find the valve on the gas meter and keep a wrench nearby. Turn it off only if you smell gas or hear hissing. Once it's off, only the gas company should turn it back on, and that can take days.",
    when: (a) => a.home !== "apt",
  },
  {
    id: "apt-manager", tier: "now", title: "Ask your building manager about the plan",
    detail: "Where does the building meet after a quake? Who shuts off gas and water? Is there a list of residents who'll need help getting out?",
    when: (a) => a.home === "apt",
    why: () => "Added because you live in an apartment or condo.",
  },
  {
    id: "contact", tier: "now", title: "Pick an out-of-state contact",
    detail: "Local calls jam after a big quake, but texts and long-distance calls often get through. Choose one person everyone checks in with, and write the number down.",
    when: () => true,
  },
  {
    id: "meet", tier: "now", title: "Agree on two meeting places",
    detail: "One spot near home and one outside the neighborhood, in case you can't get home. Write them on your household plan sheet.",
    when: () => true,
  },
  {
    id: "exits", tier: "now", title: "Know two ways out of the building",
    detail: "Find both stairwells. Don't use elevators after a quake.",
    when: (a) => a.home === "apt" || a.home === "business",
  },
  {
    id: "kids-drill", tier: "now", title: "Practice with the kids, including at night",
    detail: "Make it a game: where's the safest spot in each room? Practice once in the dark with flashlights so it isn't scary for real.",
    when: (a) => (a.kids || 0) > 0,
    why: () => "Added because you have children at home.",
  },

  // ---------------- this month ----------------
  {
    id: "water", tier: "soon", title: "Store water for your timeframe",
    detail: "One gallon per person per day, plus water for pets. Your supply list below has the total. A big Wasatch quake could cut water service for weeks.",
    when: () => true,
  },
  {
    id: "kit", tier: "soon", title: "Build a kit you can grab",
    detail: "Food that doesn't need cooking, a first-aid kit, a battery or crank radio, flashlights, batteries, cash in small bills, phone chargers, and copies of IDs and insurance papers. See your supply list.",
    when: () => true,
  },
  {
    id: "meds", tier: "soon", title: "Keep extra medications on hand",
    detail: "At least two weeks' supply, plus a written list of prescriptions, doses, and doctors. Ask your pharmacist or insurer about an emergency or 90-day refill.",
    when: (a) => has(a, "needs", "medical") || has(a, "needs", "older"),
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
    detail: "A neighbor who will check on an older or disabled household member, with a key or a plan to get in.",
    when: (a) => has(a, "needs", "older") || has(a, "needs", "medical") || has(a, "needs", "mobility"),
  },
  {
    id: "kids", tier: "soon", title: "Learn your kids' school reunification plan",
    detail: "Ask each school and daycare how and where they release children after a disaster, and who's on the pickup list. Put a comfort item and a family photo in each child's kit.",
    when: (a) => (a.kids || 0) > 0,
  },
  {
    id: "baby", tier: "soon", title: "Pack a baby kit",
    detail: "Formula or baby food, bottles, diapers, wipes, a change of clothes, and medicine for your timeframe. If you use powdered formula, store extra water for mixing it.",
    when: (a) => (a.babies || 0) > 0,
    why: () => "Added because you have a baby or toddler.",
  },
  {
    id: "pets", tier: "soon", title: "Pack for your pets",
    detail: "A carrier or leash, food and water for your timeframe, medications, and a current photo. Make sure tags or microchip details are up to date; scared animals run.",
    when: (a) => pets(a),
  },
  {
    id: "car-kit", tier: "soon", title: "Keep a small kit in the car",
    detail: "Water, snacks, sturdy shoes, a blanket, a flashlight, and a phone charger. Keep the tank at least half full; gas stations need power to pump.",
    when: (a) => a.car === "yes",
    why: () => "Added because you have a car.",
  },
  {
    id: "no-car", tier: "soon", title: "Plan how you'd get around without a car",
    detail: "Know the walking route to your meeting places and to the nearest school or church likely to become a shelter. Ask a neighbor with a car to include you.",
    when: (a) => a.car === "no",
    why: () => "Added because you don't have a car.",
  },
  {
    id: "extinguisher", tier: "soon", title: "Get a fire extinguisher and learn to use it",
    detail: "Fires after earthquakes are a major threat, and fire crews will be stretched thin.",
    when: () => true,
  },
  {
    id: "sanitation", tier: "soon", title: "Plan a toilet that doesn't need water",
    detail: "A bucket with a tight lid, heavy-duty bags, and kitty litter or sawdust. After a big quake, don't flush until you know the sewer lines are intact.",
    when: (a) => days(a) >= 14,
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
    id: "renters-ins", tier: "soon", title: "Get renters insurance if you don't have it",
    detail: "It's usually inexpensive and covers your belongings and temporary housing for many disasters. Ask whether earthquake coverage can be added.",
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

  // ---------------- 30 days and longer ----------------
  {
    id: "water-big", tier: "soon", title: "Store water in larger containers",
    detail: "Food-grade 5-gallon jugs or 55-gallon barrels, kept out of sunlight and away from gasoline and chemicals. Replace stored tap water every six months.",
    when: (a) => days(a) >= 30,
    why: (a) => `Added because you're preparing for ${days(a) >= 90 ? "three months" : "30 days"}.`,
  },
  {
    id: "water-treat", tier: "soon", title: "Learn to make water safe",
    detail: "Keep a filter rated for bacteria and protozoa, or unscented household bleach: about 8 drops per gallon of clear water for 6% bleach, then wait 30 minutes (see the CDC's chart). Your water heater's tank is a backup supply.",
    when: (a) => days(a) >= 30,
  },
  {
    id: "cooking", tier: "soon", title: "Plan to cook without power",
    detail: "A camp stove and fuel, used outdoors only. Never cook or heat with a grill, camp stove, or generator indoors or in a garage; carbon monoxide kills.",
    when: (a) => days(a) >= 30,
  },
  {
    id: "winter", tier: "soon", title: "Plan for a winter outage",
    detail: "A Wasatch quake could hit in January. Keep sleeping bags or heavy blankets, warm layers, and hats for everyone. Pick the one room you'd gather in to stay warm.",
    when: (a) => days(a) >= 14,
  },
  {
    id: "power-backup", tier: "later", title: "Add backup power",
    detail: "Battery power stations and solar chargers are safe indoors. A generator must run outdoors, at least 20 feet from doors and windows, with a carbon monoxide alarm inside.",
    when: (a) => days(a) >= 30 || a.power === "yes",
  },
  {
    id: "rotate", tier: "soon", title: "Set a twice-a-year rotation reminder",
    detail: "When the clocks change in spring and fall, swap stored water, check expiration dates, test flashlights, and update medications and kids' clothing sizes.",
    when: (a) => days(a) >= 14,
  },
  {
    id: "food-3mo", tier: "later", title: "Build a three-month food supply, a little at a time",
    detail: "Buy a few extra of the things you already eat each shopping trip. Store them cool and dark, and eat the oldest first. Add long-keeping staples like rice, beans, and oats over time.",
    when: (a) => days(a) >= 90,
    why: () => "Added because you're preparing for three months.",
  },
  {
    id: "cert", tier: "later", title: "Take CERT training",
    detail: "Community Emergency Response Team classes teach light search and rescue, first aid, and fire safety. Many Utah cities offer them free.",
    when: (a) => days(a) >= 30,
  },
  {
    id: "neighbors", tier: "later", title: "Get to know your neighbors' skills and needs",
    detail: "Who's a nurse? Who has a generator? Who lives alone or uses oxygen? Neighbors are the first responders after a big quake.",
    when: (a) => days(a) >= 30,
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
    why: (a, h) => (h.liq >= 3 ? "Added because your address has high liquefaction potential, where the ground can move and break pipes."
      : "Added because your address is close to an active fault."),
  },
  {
    id: "liq-foundation", tier: "later", title: "Before you build, buy, or remodel: ask about the soil",
    detail: "On high-susceptibility ground, a geotechnical engineer can say whether the foundation needs anything special. Many cities require a study for new construction here.",
    when: (a, h) => h.liq >= 3,
    why: () => "Added because your address has high liquefaction potential.",
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

// ------------------------------------------------------------ supplies

const n = (x) => Math.ceil(x).toLocaleString("en-US");

/**
 * Supply list for the household and timeframe: [{group, items: [[item, amount]]}].
 * Amounts are rough planning numbers, not prescriptions.
 */
export function supplies(a) {
  const d = days(a), adults = a.adults ?? 1, k = a.kids || 0, b = a.babies || 0;
  const dogs = a.dogs || 0, cats = a.cats || 0, p = people(a);
  const water = p * d + dogs * 0.5 * d + cats * 0.1 * d + (b && d ? 0.25 * b * d : 0);
  const calories = (adults * 2000 + k * 1600 + b * 900) * d;
  const out = [];

  out.push({
    group: "Water", items: [
      ["Drinking and cooking water", `${n(water)} gallons`],
      ...(d >= 30 ? [["Storage", `${water > 110 ? `${Math.ceil(water / 55)} x 55-gallon barrels, or ` : ""}${Math.ceil(water / 5)} x 5-gallon jugs`]] : []),
      ...(d >= 30 ? [["Water filter or unscented bleach", "1, plus a dropper"]] : []),
      ["Water heater reserve (if strapped)", "about 40 gallons"],
    ],
  });
  out.push({
    group: "Food", items: [
      ["Food you'll actually eat", `about ${n(calories / d)} calories a day for the household (${n(calories)} total)`],
      ["Manual can opener, utensils, plates", "1 set"],
      ...(d >= 30 ? [["Camp stove and fuel (outdoor use only)", `fuel for ${d} days of simple meals`]] : []),
      ...(dogs + cats ? [["Pet food", `${d} days for ${dogs + cats} pet${dogs + cats > 1 ? "s" : ""}`]] : []),
    ],
  });
  if (b) {
    out.push({
      group: "Baby", items: [
        ["Diapers", `about ${n(b * 8 * d)}`],
        ["Formula or baby food", `${d} days`],
        ["Wipes, bottles, a change of clothes", "for each baby"],
      ],
    });
  }
  out.push({
    group: "Health", items: [
      ["First-aid kit", "1"],
      ["Prescription medications", `${Math.max(d, 14)}-day supply, plus a written list`],
      ["Glasses, hearing-aid batteries, other personal items", "spares"],
      ["Hand sanitizer, soap, wipes", `${d >= 30 ? "a large supply" : "a few days' worth"}`],
    ],
  });
  out.push({
    group: "Light, power and news", items: [
      ["Flashlight or headlamp", `${p}, one per person`],
      ["Batteries", "2 spare sets for each device"],
      ["Battery or hand-crank radio", "1"],
      ["Phone power bank", `${Math.max(1, adults)}`],
    ],
  });
  if (d >= 3) {
    out.push({
      group: "Sanitation", items: [
        ["Bucket with a tight lid", d >= 30 ? "2" : "1"],
        ["Heavy-duty trash bags", `about ${n(Math.max(10, (p * d) / 2))}`],
        ["Kitty litter or sawdust", d >= 30 ? "a large bag" : "a small bag"],
        ["Toilet paper", `about ${n(Math.max(2, (p * d) / 5))} rolls`],
      ],
    });
  }
  out.push({
    group: "Warmth and safety", items: [
      ["Sturdy shoes and work gloves", `${p} pairs`],
      ["Sleeping bag or heavy blanket", `${p}`],
      ["Whistle", `${p}`],
      ["Wrench for the gas shutoff", a.home === "apt" ? "skip if your building handles it" : "1"],
      ["Fire extinguisher", "1"],
    ],
  });
  out.push({
    group: "Money and papers", items: [
      ["Cash in small bills", d >= 30 ? "enough for two weeks of essentials" : "enough for a few days"],
      ["Copies of IDs, insurance, prescriptions", "in a waterproof bag, plus photos in the cloud"],
      ["This plan and your contact list", "printed"],
    ],
  });
  return out;
}

// ---------------------------------------------------- household plan sheet

// [id, label, show when (answers) => bool]
export const SHEET = [
  ["contact-out", "Out-of-state contact (name and phone)", () => true],
  ["contact-local", "Local contact (name and phone)", () => true],
  ["meet-near", "Meeting place near home", () => true],
  ["meet-far", "Meeting place outside the neighborhood", () => true],
  ["shutoffs", "Where the gas, water, and electrical shutoffs are", (a) => a.home !== "apt"],
  ["building", "Building manager and where the building meets", (a) => a.home === "apt"],
  ["school", "School or daycare pickup plan", (a) => kids(a)],
  ["medical", "Medications, allergies, and medical needs", () => true],
  ["doctor", "Doctor and pharmacy (names and phones)", () => true],
  ["pets", "Vet, and pet microchip numbers", (a) => pets(a)],
  ["insurance", "Insurance company and phone", () => true],
  ["notes", "Other notes", () => true],
];
