#!/usr/bin/env python3
"""Download public hazard data and write the small static files the site reads.

Run from the project root:  python3 scripts/build_data.py

Everything here runs offline, once. The live site never calls UGS; it only
reads the files written to site/data/. Re-run this when a source updates
(see README "Monthly data refresh").

Only the Python standard library is used, so there is nothing to install.
"""

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data")

UGS_FAULTS = "https://webmaps.geology.utah.gov/arcgis/rest/services/Hazards/quaternary_faults/MapServer/0"
UGS_EQ = "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_Earthquake_Hazards/FeatureServer"
UGS_LIQ = UGS_EQ + "/2"
UGS_SFR = UGS_EQ + "/3"

# Older regional liquefaction-potential map (1994 UGS contract reports from
# Utah State University mylars, digitized by UGRC). CC BY 4.0. Covers Box Elder,
# Cache, Davis, Salt Lake, Utah and Weber counties, including the central Salt
# Lake Valley that the newer 1:24,000 UGS map doesn't reach yet. The site uses
# it only where the newer map has no data.
UGRC_LIQ_1994 = "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/LiquefactionPotential/FeatureServer/0"
# PCODE legend isn't published by UGRC itself. It comes from the Mountainland
# Association of Governments' copy of this layer (item a3d5f816139b46ff96a2e4ae10a27a3c),
# and Utah DEM's and Utah County's copies agree for the codes they label:
#   1 very low, 2 very low to low, 3 low, 4 low to moderate, 5 moderate,
#   6 moderate to high, 7 high, 8 landslide, 9 tailings, 10 lake, 11 island.

MAGNA_EVENT = "https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=uu60363602&format=geojson"

# Tile size (degrees) for polygon layers. The browser loads only the tile an
# address falls in, plus neighbors for the map.
TILE = 0.1
# Faults are lines and sparser, so they use bigger tiles. The browser loads a
# 3x3 block around an address, which always covers at least ~40 km.
FAULT_TILE = 0.5
# Simplification tolerance in degrees (~9 m). UGS maps are 1:24,000 scale,
# whose accuracy standard is about 12 m, so this loses nothing real.
DETAIL = 0.00008


def get_json(url, params=None, tries=4):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FaultLineUtah-data-build"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # network hiccups are common on big pulls
            if attempt == tries - 1:
                raise
            print("  retry after error:", e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))


def fetch_all(layer_url, out_fields, offset_deg, page=1000):
    """Page through an ArcGIS layer, returning GeoJSON features in WGS84."""
    feats = []
    start = 0
    while True:
        d = get_json(layer_url + "/query", {
            "where": "1=1",
            "outFields": out_fields,
            "outSR": 4326,
            "maxAllowableOffset": offset_deg,
            "geometryPrecision": 5,
            "resultOffset": start,
            "resultRecordCount": page,
            "orderByFields": "OBJECTID",
            "f": "geojson",
        })
        batch = d.get("features", [])
        feats.extend(batch)
        print("  got", len(feats))
        if len(batch) < page:
            return feats
        start += page


def write(name, obj):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    return os.path.getsize(path)


def bbox(coords):
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        else:
            for cc in c:
                walk(cc)

    walk(coords)
    return min(xs), min(ys), max(xs), max(ys)


def tile_keys(b, size=TILE):
    x0, y0, x1, y1 = b
    for tx in range(math.floor(x0 / size), math.floor(x1 / size) + 1):
        for ty in range(math.floor(y0 / size), math.floor(y1 / size) + 1):
            yield tx, ty


def clip_ring(ring, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of one ring to a rectangle.

    Concave rings can leave zero-width slivers along the tile edge. They don't
    change point-in-polygon answers, and the map draws these layers as fills
    without outlines, so the slivers never show.
    """
    def clip(pts, inside, cross):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out

    def at_x(x):
        return lambda a, b: [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]

    def at_y(y):
        return lambda a, b: [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y]

    pts = ring[:-1] if ring[0] == ring[-1] else ring[:]
    for inside, cross in (
        (lambda p: p[0] >= x0, at_x(x0)),
        (lambda p: p[0] <= x1, at_x(x1)),
        (lambda p: p[1] >= y0, at_y(y0)),
        (lambda p: p[1] <= y1, at_y(y1)),
    ):
        if not pts:
            break
        pts = clip(pts, inside, cross)
    if len(pts) < 3:
        return None
    pts = [[round(p[0], 5), round(p[1], 5)] for p in pts]
    return pts + [pts[0]]


def clip_polygons(geom, rect):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        outer = clip_ring(poly[0], *rect)
        if not outer:
            continue
        holes = [h for h in (clip_ring(r, *rect) for r in poly[1:]) if h]
        out.append([outer] + holes)
    return out


def write_tiles(folder, feats):
    """Clip polygon features to TILE-degree squares, one file per square."""
    tiles = {}
    for f in feats:
        for tx, ty in tile_keys(bbox(f["geometry"]["coordinates"])):
            rect = (tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
            polys = clip_polygons(f["geometry"], rect)
            if polys:
                tiles.setdefault("%d_%d" % (tx, ty), []).append({
                    "type": "Feature",
                    "geometry": {"type": "MultiPolygon", "coordinates": polys},
                    "properties": f["properties"],
                })
    total = 0
    for k, fs in tiles.items():
        total += write("%s/%s.json" % (folder, k), {"type": "FeatureCollection", "features": fs})
    write("%s/index.json" % folder, sorted(tiles.keys()))
    return len(tiles), total


def write_line_tiles(folder, feats, size):
    """Lines are short relative to tiles, so each one is copied whole into
    every tile its bounding box touches instead of being clipped."""
    tiles = {}
    for f in feats:
        for tx, ty in tile_keys(bbox(f["geometry"]["coordinates"]), size):
            tiles.setdefault("%d_%d" % (tx, ty), []).append(f)
    total = 0
    for k, fs in tiles.items():
        total += write("%s/%s.json" % (folder, k), {"type": "FeatureCollection", "features": fs})
    write("%s/index.json" % folder, sorted(tiles.keys()))
    return len(tiles), total


def simplify_line(coords, tol):
    """Douglas-Peucker, for the coarse statewide overview only."""
    if len(coords) < 3:
        return coords
    (ax, ay), (bx, by) = coords[0], coords[-1]
    dx, dy = bx - ax, by - ay
    norm = math.hypot(dx, dy) or 1e-12
    best, idx = 0, 0
    for i in range(1, len(coords) - 1):
        px, py = coords[i]
        d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [coords[0], coords[-1]]
    return simplify_line(coords[:idx + 1], tol)[:-1] + simplify_line(coords[idx:], tol)


def overview_geometry(geom, tol):
    lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
    out = [[[round(x, 3), round(y, 3)] for x, y in simplify_line(l, tol)] for l in lines]
    return {"type": "MultiLineString", "coordinates": out}


def build_faults():
    print("Quaternary faults (UGS)")
    raw = fetch_all(UGS_FAULTS, "FaultNum,FaultZone,FaultName,SectionName,StrandName,FaultAge,SlipRate,"
                    "SlipSense,DipDirection,FaultClass,MappingConstraint,USGS_Link,Summary", DETAIL)
    summaries = {}
    feats = []
    for f in raw:
        if not f.get("geometry"):
            continue
        p = f["properties"]
        zone = p.get("FaultZone") or p.get("FaultName") or "Unnamed fault"
        if p.get("Summary") and zone not in summaries:
            summaries[zone] = p["Summary"]
        feats.append({
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {
                "zone": zone,
                "name": p.get("FaultName"),
                "section": p.get("SectionName"),
                "strand": p.get("StrandName"),
                "age": p.get("FaultAge"),
                "slip": p.get("SlipRate"),
                "sense": p.get("SlipSense"),
                "cls": p.get("FaultClass"),
                "constraint": p.get("MappingConstraint"),
                "link": p.get("USGS_Link"),
            },
        })
    n, size = write_line_tiles("faults", feats, FAULT_TILE)
    print("  faults/: %d features in %d tiles, %.0f KB total" % (len(feats), n, size / 1024))
    write("fault_summaries.json", summaries)

    # Coarse statewide copy (~100 m) for the zoomed-out map. Never used for distances.
    # Merged by zone + age so the file isn't mostly repeated property text.
    merged = {}
    for f in feats:
        key = (f["properties"]["zone"], f["properties"]["age"])
        lines = overview_geometry(f["geometry"], 0.0015)["coordinates"]
        merged.setdefault(key, []).extend(l for l in lines if len(l) > 1)
    overview = [{
        "type": "Feature",
        "geometry": {"type": "MultiLineString", "coordinates": lines},
        "properties": {"zone": zone, "age": age},
    } for (zone, age), lines in merged.items()]
    size = write("faults_overview.json", {"type": "FeatureCollection", "features": overview})
    print("  faults_overview.json %.0f KB" % (size / 1024))


def build_liquefaction():
    print("Liquefaction susceptibility (UGS)")
    raw = fetch_all(UGS_LIQ, "Hazard_Symbology_Text,LQSMappedScale", DETAIL, page=1000)
    feats = [{
        "type": "Feature",
        "geometry": f["geometry"],
        "properties": {"lvl": (f["properties"].get("Hazard_Symbology_Text") or "").replace(" Susceptibility", "")},
    } for f in raw if f.get("geometry")]
    n, size = write_tiles("liq", feats)
    print("  liq/: %d tiles, %.0f KB total" % (n, size / 1024))


def build_liquefaction_1994():
    print("Liquefaction potential, 1994 regional maps (UGRC)")
    raw = fetch_all(UGRC_LIQ_1994, "PCODE", DETAIL, page=1000)
    feats = [{"type": "Feature", "geometry": f["geometry"], "properties": {"c": f["properties"]["PCODE"]}}
             for f in raw if f.get("geometry")]
    n, size = write_tiles("liq94", feats)
    print("  liq94/: %d tiles, %.0f KB total" % (n, size / 1024))


def build_fault_zones():
    print("Surface fault rupture special study zones (UGS)")
    raw = fetch_all(UGS_SFR, "SFRHazardUnit", DETAIL, page=1000)
    feats = [{"type": "Feature", "geometry": f["geometry"], "properties": {}} for f in raw if f.get("geometry")]
    n, size = write_tiles("sfr", feats)
    print("  sfr/: %d tiles, %.0f KB total" % (n, size / 1024))


def build_magna():
    print("2020 Magna earthquake (USGS)")
    ev = get_json(MAGNA_EVENT)
    props = ev["properties"]
    shakemap = props["products"]["shakemap"][0]["contents"]
    dyfi = props["products"]["dyfi"][0]["contents"]

    # ShakeMap intensity grid (about 1.5 km cells).
    cov = get_json(shakemap["download/coverage_mmi_medium_res.covjson"]["url"])
    ax = cov["domain"]["axes"]
    rng = cov["ranges"]["MMI"]
    order = rng.get("axisNames", ["y", "x"])
    grid = {
        "x0": ax["x"]["start"], "x1": ax["x"]["stop"], "nx": ax["x"]["num"],
        "y0": ax["y"]["start"], "y1": ax["y"]["stop"], "ny": ax["y"]["num"],
        "order": order,
        "v": [None if v is None else round(v, 1) for v in rng["values"]],
    }
    size = write("magna/mmi_grid.json", grid)
    print("  mmi_grid.json %.0f KB" % (size / 1024))

    # Did You Feel It? 1 km cells: keep center, intensity, response count.
    d1 = get_json(dyfi["dyfi_geo_1km.geojson"]["url"])
    cells = []
    for f in d1["features"]:
        x0, y0, x1, y1 = bbox(f["geometry"]["coordinates"])
        p = f["properties"]
        cells.append([round((x0 + x1) / 2, 4), round((y0 + y1) / 2, 4), p["cdi"], p["nresp"]])
    size = write("magna/dyfi_1km.json", cells)
    print("  dyfi_1km.json %d cells, %.0f KB" % (len(cells), size / 1024))

    # Did You Feel It? by ZIP code.
    dz = get_json(dyfi["dyfi_zip.geojson"]["url"])
    zips = {}
    for f in dz["features"]:
        p = f["properties"]
        z = str(p["name"]).split("<br>")[0].strip()
        zips[z] = [p["cdi"], p["nresp"]]
    size = write("magna/dyfi_zip.json", zips)
    print("  dyfi_zip.json %d ZIPs, %.0f KB" % (len(zips), size / 1024))

    lon, lat, depth = ev["geometry"]["coordinates"]
    write("magna/event.json", {
        "mag": props["mag"], "time": props["time"], "lon": lon, "lat": lat, "depth_km": depth,
        "title": props["title"], "url": props["url"],
        "felt": props.get("felt"),
    })


def main():
    os.makedirs(OUT, exist_ok=True)
    build_faults()
    build_fault_zones()
    build_liquefaction()
    build_liquefaction_1994()
    build_magna()
    write("build_info.json", {"built": date.today().isoformat(), "sources": {
        "faults": UGS_FAULTS, "liquefaction": UGS_LIQ, "liquefaction_1994": UGRC_LIQ_1994,
        "fault_zones": UGS_SFR, "magna": MAGNA_EVENT}})
    print("Done ->", OUT)


if __name__ == "__main__":
    main()
