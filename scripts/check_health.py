#!/usr/bin/env python3
"""Monthly health check for faultlineutah.com.

Checks (1) the site's own pages and data, (2) every outside service the
address lookup and map depend on, with a real query, and (3) every outbound
link on the site. Writes a Markdown report to health-report.md.

Run from the project root:  python3 scripts/check_health.py
Exit code: 0 if everything works, 1 if something is broken. Moved links
(redirects) are reported but don't fail the check.
"""

import glob
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SITE = "https://faultlineutah.com"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) FaultLineUtah-health-check (+https://faultlineutah.com)"
PAGES = ["/", "/ground.html", "/faults.html", "/plan.html", "/brick.html", "/magna.html", "/about.html", "/privacy.html",
         "/data/faults/index.json", "/data/liq/index.json", "/data/magna/event.json",
         "/assets/vendor/maplibre-gl-4.7.1/maplibre-gl.js", "/assets/vendor/jspdf-2.5.1/jspdf.umd.min.js"]

# These sites refuse automated requests (403) even though the pages work in a
# browser, so a 403 from them is "couldn't check", not "broken".
BOT_BLOCKERS = ("doi.org", "cdc.gov", "fema.gov", "wiley.com", "geoscienceworld.org", "slc.gov")

# Links in the code that aren't meant to be visited (placeholders, API bases).
SKIP_LINKS = ("YOURNAME", "earthquake.usgs.gov/ws/", "masquerade.ugrc.utah.gov", "api.mapserv.utah.gov",
              "nominatim.openstreetmap.org/search", "nominatim.openstreetmap.org/reverse", "tiles.openfreemap.org",
              "faultlineutah.com", "w3.org")


def fetch(url, timeout=30):
    """Returns (status, final_url, body bytes). Status 0 means no response."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.geturl(), r.read()
    except urllib.error.HTTPError as e:
        return e.code, url, b""
    except Exception as e:  # DNS failure, timeout, TLS error...
        return 0, url, str(e).encode()


def get_json(url):
    status, _, body = fetch(url)
    if status != 200:
        raise RuntimeError(f"HTTP {status}")
    return json.loads(body)


# Each service check returns a short success note or raises with the problem.
def usgs_design():
    d = get_json("https://earthquake.usgs.gov/ws/building-codes/asce7-22/calculate?latitude=40.761&longitude=-111.891"
                 "&riskCategory=II&siteClass=Default&title=health-check")
    return f"SDS {d['response']['data']['sds']} g for downtown SLC"


def ugrc_locator():
    q = urllib.parse.urlencode({"SingleLine": "350 N State St, Salt Lake City", "outSR": 4326, "maxLocations": 1, "f": "json"})
    c = get_json("https://masquerade.ugrc.utah.gov/arcgis/rest/services/UtahLocator/GeocodeServer/findAddressCandidates?" + q)["candidates"]
    if not c:
        raise RuntimeError("no match for the State Capitol")
    return f"matched {c[0]['address']}"


def ugrc_suggest():
    s = get_json("https://masquerade.ugrc.utah.gov/arcgis/rest/services/UtahLocator/GeocodeServer/suggest?text=350+N+State&f=json")
    if not s.get("suggestions"):
        raise RuntimeError("no suggestions")
    return f"{len(s['suggestions'])} suggestions"


def nominatim():
    r = get_json("https://nominatim.openstreetmap.org/search?q=Liberty+Park,+Salt+Lake+City,+Utah&format=jsonv2&limit=1")
    if not r:
        raise RuntimeError("no result for Liberty Park")
    return "found Liberty Park"


def basemap(style):
    def check():
        d = get_json(f"https://tiles.openfreemap.org/styles/{style}")
        return f"{len(d['layers'])} layers"
    return check


def arcgis(url):
    def check():
        d = get_json(url + "?f=json")
        if "error" in d:
            raise RuntimeError(d["error"].get("message", "service error"))
        return d.get("name") or d.get("serviceDescription", "")[:40] or "ok"
    return check


SERVICES = [
    ("USGS building-code values (lookup card)", usgs_design),
    ("UGRC address search (lookup)", ugrc_locator),
    ("UGRC address suggestions (lookup)", ugrc_suggest),
    ("OpenStreetMap address search (backup)", nominatim),
    ("Basemap, light (OpenFreeMap)", basemap("positron")),
    ("Basemap, dark (OpenFreeMap)", basemap("dark")),
    ("UGS fault service (data build)", arcgis("https://webmaps.geology.utah.gov/arcgis/rest/services/Hazards/quaternary_faults/MapServer/0")),
    ("UGS earthquake hazards service (data build)", arcgis("https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_Earthquake_Hazards/FeatureServer")),
    ("UGRC 1994 liquefaction service (data build)", arcgis("https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/LiquefactionPotential/FeatureServer/0")),
]


def site_links():
    found = set()
    for path in glob.glob("site/*.html") + glob.glob("site/assets/js/**/*.js", recursive=True):
        with open(path) as f:
            for url in re.findall(r"https?://[^\"'\s<>)`]+", f.read()):
                url = url.rstrip(".,;")
                if url.rstrip("/") == "https://nominatim.openstreetmap.org":  # API base in geo.js
                    continue
                if "${" not in url and not any(s in url for s in SKIP_LINKS):
                    found.add(url)
    return sorted(found)


def main():
    broken, moved, notes = [], [], []

    for p in PAGES:
        status, _, body = fetch(SITE + p)
        if status != 200:
            broken.append(f"Site page `{p}` returned {status or 'no response'}.")
        elif p.endswith(".html") or p == "/":
            if b"FaultLine Utah" not in body:
                broken.append(f"Site page `{p}` loaded but looks wrong (no site name).")

    for name, check in SERVICES:
        try:
            notes.append(f"- ✓ {name}: {check()}")
        except Exception as e:
            broken.append(f"{name} isn't working: {e}")

    links = site_links()
    for url in links:
        status, final, _ = fetch(url)
        host = urllib.parse.urlparse(url).hostname or ""
        if status == 200:
            if final.rstrip("/") != url.rstrip("/"):
                moved.append(f"{url} now goes to {final}")
        elif status == 403 and any(host.endswith(b) for b in BOT_BLOCKERS):
            notes.append(f"- (couldn't check, the site blocks automated visits) {url}")
        else:
            broken.append(f"Link {url} returned {status or 'no response: ' + final}.")

    report = ["## FaultLine Utah health check", ""]
    if broken:
        report += ["### Broken", ""] + [f"- {b}" for b in broken] + [""]
    if moved:
        report += ["### Links that moved (still work through a redirect; worth updating)", ""] + [f"- {m}" for m in moved] + [""]
    report += [f"### Checked: {len(PAGES)} site files, {len(SERVICES)} services, {len(links)} links", ""] + notes
    with open("health-report.md", "w") as f:
        f.write("\n".join(report) + "\n")
    print("\n".join(report))
    print(f"\nbroken={len(broken)} moved={len(moved)}")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
