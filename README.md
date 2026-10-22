# FaultLine Utah

**Living on the Fault.** Plain-language earthquake information for Utah, at faultlineutah.com.

- **Know Your Ground** (`ground.html`): address lookup for nearby faults, fault-rupture study zones, liquefaction, building-code shaking, and what the 2020 Magna earthquake did there.
- **Fault Lines** (`faults.html`): statewide fault map.
- **Make a Plan** (`plan.html`): six questions produce a prioritized, printable prep checklist, tuned by the lookup's results.
- **Is It Brick?** (`brick.html`): unreinforced-masonry self-check.
- **Magna 2020** (`magna.html`): the story, and what scientists learned about the fault and basin.
- **About & Sources** (`about.html`): sources, privacy, and the disclaimer.

It's a plain static site: HTML, CSS, and JavaScript, with no build step and nothing to install. All hazard data is pre-downloaded into `site/data/`, so the live site never depends on state servers being up.

## Folders

```
site/                  ← the website; this folder is what gets published
  *.html               one file per page
  assets/css/site.css  all styling (colors at the top, light and dark)
  assets/js/config.js  settings you can change (see below)
  assets/js/content/   ← the words: result-card text and the checklist
  assets/js/*.js       app code (lookup, map, checklist)
  data/                hazard data built by scripts/build_data.py
scripts/
  build_data.py        downloads and prepares the hazard data
  serve.py             local preview server
```

## Preview it on this Mac

```bash
python3 scripts/serve.py
```

Then open http://localhost:8737. Press Ctrl+C in the terminal to stop it.

## Change the words

| What | Where |
|---|---|
| Result cards on Know Your Ground | `site/assets/js/content/ground-text.js` |
| Checklist questions and tasks | `site/assets/js/content/checklist.js` |
| Page text | the matching `site/*.html` file |
| Header menu and footer | `site/assets/js/layout.js` |

Each content file has instructions at the top. Text between quotes can be edited freely; keep the quotes and commas.

## Settings (`site/assets/js/config.js`)

- `ugrcKey`: free API key for Utah's own address geocoder (see to-do list). Much better at Utah grid addresses than the fallback.
- `newsletterAction`: the signup form URL from your newsletter provider. Empty shows "coming soon."
- `basinNoteEnabled`: keep `false` until a seismologist has reviewed the basin bands and wording.
- `contactEmail`: shown on About.

## Refresh the data

```bash
python3 scripts/build_data.py
```

It takes about a minute. Run it every few months, or whenever UGS announces updated fault or hazard maps. The About page shows the date automatically.

## Publish it

Any static host works. Two good free options:

- **Cloudflare Pages** or **Netlify**: create a project, choose "deploy without Git / drag and drop," and upload the `site` folder. Build command: none. Output folder: `site`.
- Then add the custom domain `faultlineutah.com` in the host's dashboard and follow its DNS instructions at your domain registrar.

HTTPS is required for "use my location" to work; both hosts provide it automatically.

## To-do before public launch (project manager)

**Accounts and setup**
- [ ] Register **faultlineutah.com** (it was unregistered as of Oct 22, 2026). Consider faultlineutah.org too.
- [ ] Get a free **UGRC API key** at https://developer.mapserv.utah.gov and paste it into `config.js`. Restrict it to faultlineutah.com in the UGRC dashboard.
- [ ] Choose a newsletter provider (Buttondown, Substack, Ghost) and paste its form URL into `config.js`.
- [ ] Set up the `hello@faultlineutah.com` mailbox, or change `contactEmail`.
- [ ] Pick a host (Cloudflare Pages or Netlify) and publish.

**Expert review** (product plan §4.5: nothing on basin effects goes public before a seismologist reviews it)
- [ ] Seismologist: the wording in `content/ground-text.js`; the Magna page's fault and basin sections; the 43% / M6.75 / 50-year figure; the "about 90 times the energy" comparison; the Wasatch section table on `faults.html`; and which ASCE 7 edition to show (the site uses ASCE 7-22 with the default site class).
- [ ] Structural engineer: `brick.html` (header-brick guidance, the pre-1975 rule of thumb, retrofit priorities), plus the "Bigger projects" tasks in `content/checklist.js`, including the chimney and foundation-bolting advice.
- [ ] Lawyer: disclaimer wording, privacy section, data-license attributions.

**Data licenses** (product plan §4.2: confirm in writing)
- [ ] UGS hazard layers (faults, rupture zones, liquefaction): confirm terms of use and preferred attribution.
- [ ] USGS (Magna data, design values): public domain; attribution is already shown.
- [ ] Basemap: OpenFreeMap is free with OpenStreetMap attribution (already shown).
- [ ] Nominatim geocoding is fine for light use only (about 1 request per second); switching to the UGRC key covers launch traffic.

**Content to add**
- [ ] Your illustrations for "Is It Brick?" (the brick diagrams are placeholders drawn in code).
- [ ] A share image (`og:image`) for links posted on social media.
- [ ] Spanish version (plan v2).

## Known limits

- **Liquefaction uses two maps.** The newer 1:24,000 UGS susceptibility map comes first, but it doesn't yet cover much of the central Salt Lake Valley. There, the site falls back to UGS's 1994 regional liquefaction-potential maps (digitized by UGRC, CC BY 4.0), and the result card says it's an older, less detailed map. UGRC doesn't publish that layer's code legend; the codes come from the Mountainland Association of Governments' copy of the layer, cross-checked against Utah DEM and Utah County copies and known places (Utah Lake, Antelope Island, the Kennecott tailings). Ask the seismologist advisor to confirm this approach.
- **Address search** uses OpenStreetMap until the UGRC key is added, and OSM lacks many Utah house numbers. Results show "approximate match" when that happens.
- Know Your Ground covers Utah only; outside the state it says so.
