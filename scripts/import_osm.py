#!/usr/bin/env python3
"""Convert an OSM XML extract of a golf course into DeusGolf hole JSON.

Data © OpenStreetMap contributors, ODbL 1.0.

Fetch:
  curl -o scripts/losverdes.osm \\
    'https://api.openstreetmap.org/api/0.6/map?bbox=-118.4065,33.7458,-118.3940,33.7635'
Run:
  python3 scripts/import_osm.py scripts/losverdes.osm src/courses/losverdes.json

Each hole is projected to local yards: the hole centerline start (tee) is the
origin and the tee→green axis is +y.

Golf features are assigned to the nearest hole centerline, not to a box around
the straight tee→green axis. Los Verdes fairways are multipolygon relations
(one closed way is not enough), and a dogleg bunker can sit outside a ±90 yard
axis window while still being next to the centerline. Greens, tees, bunkers,
fairways, rough, and water use that nearest-centerline rule. Trees, cart paths,
and buildings still use the axis window so nearby context stays on the hole.
"""
import json
import math
import sys
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]

# Official scorecard, losverdesgc.com scorecard PDF (White / Blue).
BLUE = [489, 370, 180, 441, 189, 556, 380, 352, 410, 377, 305, 153, 420, 417, 445, 488, 225, 420]
WHITE = [465, 349, 167, 427, 149, 517, 367, 340, 400, 370, 292, 138, 367, 381, 436, 450, 207, 412]
PAR = [5, 4, 3, 4, 3, 5, 4, 4, 4, 4, 4, 3, 4, 4, 4, 5, 3, 4]

# Max yards from the centerline (or tee / green end) for a feature to count.
CAP = {
    'fairway': 25,
    'green': 30,
    'bunker': 42,
    'tee': 130,
    'rough': 45,
    'water': 50,
}
GOLF = {
    'green': 'green',
    'tee': 'tee',
    'bunker': 'bunker',
    'fairway': 'fairway',
    'rough': 'rough',
    'water_hazard': 'water',
    'lateral_water_hazard': 'water',
    'cartpath': 'path',
    'path': 'path',
}
CONTEXT = {'trees', 'path', 'building'}

root = ET.parse(src).getroot()
nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
lat0 = 33.755
Y = 1.0936133


def ll2yd(p):
    return (
        (p[1] + 118.4) * 111320 * math.cos(math.radians(lat0)) * Y,
        (p[0] - lat0) * 110574 * Y,
    )


def tags_of(el):
    return {t.get('k'): t.get('v') for t in el.findall('tag')}


def kind_of(tags):
    k = GOLF.get(tags.get('golf'))
    if not k and tags.get('natural') == 'water':
        k = 'water'
    if not k and tags.get('waterway') in ('river', 'stream', 'ditch', 'canal', 'drain'):
        k = 'water'
    if not k and (tags.get('natural') in ('wood', 'scrub') or tags.get('landuse') == 'forest'):
        k = 'trees'
    if not k and tags.get('building'):
        k = 'building'
    return k


def way_points(nd_refs):
    return [ll2yd(nodes[ref]) for ref in nd_refs if ref in nodes]


ways = {}
for way in root.iter('way'):
    refs = [nd.get('ref') for nd in way.findall('nd')]
    ways[way.get('id')] = (tags_of(way), way_points(refs))

holes = {}
features = []  # (kind, world_pts, id)
for wid, (tags, pts) in ways.items():
    if len(pts) < 2:
        continue
    if tags.get('golf') == 'hole' and tags.get('ref', '').isdigit():
        holes[int(tags['ref'])] = {'tags': tags, 'line': pts}
        continue
    k = kind_of(tags)
    if k and len(pts) >= (2 if k == 'path' else 3):
        features.append((k, pts, wid))

for rel in root.iter('relation'):
    tags = tags_of(rel)
    if tags.get('type') != 'multipolygon':
        continue
    k = kind_of(tags)
    if not k or k == 'path':
        continue
    outers = []
    for member in rel.findall('member'):
        if member.get('type') != 'way' or member.get('role') == 'inner':
            continue
        wid = member.get('ref')
        if wid not in ways:
            continue
        pts = ways[wid][1]
        if len(pts) >= 3:
            outers.append(pts)
    for i, pts in enumerate(outers):
        features.append((k, pts, f"{rel.get('id')}:{i}"))


def length(line):
    return sum(math.dist(a, b) for a, b in zip(line, line[1:]))


def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def line_dist(p, line):
    best = 1e9
    for a, b in zip(line, line[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        denom = dx * dx + dy * dy or 1
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denom))
        best = min(best, math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    return best


def feature_dist(kind, pts, line):
    c = centroid(pts)
    if kind == 'green':
        return math.dist(c, line[-1])
    if kind == 'tee':
        return math.dist(c, line[0])
    # Fairways are long; a vertex on the centerline is a stronger signal than the centroid.
    step = max(1, len(pts) // 40)
    return min(line_dist(p, line) for p in pts[::step])


assigned = {n: [] for n in holes}
for kind, pts, fid in features:
    if kind in CONTEXT:
        continue
    best_n, best_d = None, 1e9
    for n, hole in holes.items():
        d = feature_dist(kind, pts, hole['line'])
        if d < best_d:
            best_n, best_d = n, d
    if best_n is not None and best_d <= CAP[kind]:
        assigned[best_n].append((kind, pts, fid, round(best_d, 1)))

course = {
    'name': 'Los Verdes Golf Course — Rancho Palos Verdes, CA',
    'attribution': 'Hole geometry © OpenStreetMap contributors (ODbL). Scorecard: losverdesgc.com.',
    'tees': ['White', 'Blue'],
    'holes': [],
}

for n in range(1, 19):
    if n not in holes:
        raise SystemExit(f'missing hole {n}')
    hole = holes[n]
    line = hole['line']
    origin, end = line[0], line[-1]
    ang = math.atan2(end[0] - origin[0], end[1] - origin[1])
    ca, sa = math.cos(ang), math.sin(ang)

    def project(p, origin=origin, ca=ca, sa=sa):
        dx, dy = p[0] - origin[0], p[1] - origin[1]
        return [round(dx * ca - dy * sa, 1), round(dx * sa + dy * ca, 1)]

    center = [project(p) for p in line]
    ylen = center[-1][1]
    feats = []
    for kind, pts, fid, _dist in assigned[n]:
        feats.append({'t': kind, 'pts': [project(p) for p in pts], 'id': fid})

    for kind, pts, fid in features:
        if kind not in CONTEXT:
            continue
        local = [project(p) for p in pts]
        if any(-90 < x < 90 and -40 < y < ylen + 50 for x, y in local):
            feats.append({'t': kind, 'pts': local, 'id': fid})

    greens = [f for f in feats if f['t'] == 'green']
    pin = center[-1]
    if greens:
        def green_d(f, pin=center[-1]):
            c = centroid(f['pts'])
            return math.dist(c, pin)

        green = min(greens, key=green_d)
        green['main'] = True
        c = centroid(green['pts'])
        pin = [round(c[0], 1), round(c[1], 1)]

    real = {
        'green': bool(greens),
        'bunkers': sum(f['t'] == 'bunker' for f in feats),
        'tees': sum(f['t'] == 'tee' for f in feats),
        'fairway': any(f['t'] == 'fairway' for f in feats),
        'fairways': sum(f['t'] == 'fairway' for f in feats),
        'water': any(f['t'] == 'water' for f in feats),
    }
    course['holes'].append({
        'n': n,
        'par': PAR[n - 1],
        'yds': {'White': WHITE[n - 1], 'Blue': BLUE[n - 1]},
        'osmYds': round(length(line)),
        'hcp': int(hole['tags'].get('handicap', 0)),
        'line': center,
        'pin': pin,
        'feats': feats,
        'real': real,
        'fwApprox': not real['fairway'],
    })

with open(out, 'w') as fh:
    json.dump(course, fh, separators=(',', ':'))

print(f"{'H':>3} {'par':>3} {'osm':>5} {'fw':>3} {'bunk':>4} {'grn':>3} {'tee':>3} {'wtr':>3} {'approx':>6}")
for hole in course['holes']:
    real = hole['real']
    print(
        f"{hole['n']:3} {hole['par']:3} {hole['osmYds']:5} {real['fairways']:3} "
        f"{real['bunkers']:4} {int(real['green']):3} {real['tees']:3} {int(real['water']):3} "
        f"{str(hole['fwApprox']):>6}"
    )
fairway_holes = sum(h['real']['fairway'] for h in course['holes'])
print(f"holes with an OSM fairway polygon: {fairway_holes}/18")
print(f"bunker placements: {sum(h['real']['bunkers'] for h in course['holes'])}")
