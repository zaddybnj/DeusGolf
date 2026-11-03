# DeusGolf

Preview-play a real course in 2D with your own club distances. Until you edit the bag, carries are a long-hitting scratch placeholder: Driver 290, 3W 260, 5W 240, 4i 220, 5i 210, 6i 200, 7i 185, 8i 170, 9i 155, PW 140, GW 125, SW 105, LW 90, Putter.

The bag, per-hole miss side / layup / plan score, and saved rounds live in `localStorage` on this phone. There is no account. Open **Plan** to save a snapshot (course, tee, bag, notes, plan score) and, after the round, type each hole's score for a plan-versus-score comparison. **Edit bag** changes club names and carry yards.

## Clone and run locally

```bash
git clone https://github.com/zaddybnj/DeusGolf.git
cd DeusGolf
npm ci
npm run dev    # http://127.0.0.1:5173
```

Production build (the same command Netlify runs):

```bash
npm run build    # writes dist/
npm run preview  # serves the production build
```

## Netlify

This is a static Vite site. [`netlify.toml`](netlify.toml) sets the build command to `npm run build`, the publish directory to `dist`, Node.js 20, and an SPA fallback (`/*` → `/index.html`, status 200) so paths that are not real files still load the app.

Connect this GitHub repo in Netlify and deploy the `main` branch. No environment variables are required.

## Phone and install (PWA)

The site is a Progressive Web App aimed at a portrait phone. `npm run build` emits `manifest.webmanifest`, home-screen icons, and a service worker (`sw.js`) that precaches the app shell — including Los Verdes, which is bundled into the script — and serves `index.html` when a navigation is offline.

On a phone, use the browser’s Install / Add to Home Screen action (Safari: Share → Add to Home Screen). The layout keeps the hole map on screen with 44px club chips and a full-width Hit control. Tap or click the map to aim, drag to pan, and pinch, scroll, or use +/− to zoom. Fit restores the whole hole. Desktop stays a side-by-side layout.

Icons are generated with `python3 scripts/gen_pwa_icons.py` (no extra libraries) and committed under `public/icons/`.

## Courses

- **Los Verdes Golf Course** (Rancho Palos Verdes, CA) — real hole geometry from OpenStreetMap. All 18 holes have a fairway polygon (fairways are multipolygon relations; one closed way near hole 13 is included too). Greens, tees, and bunkers are the OSM ways nearest that hole's centerline. Par/handicap/yardages (White & Blue) are from the official scorecard (losverdesgc.com). Centerlines are still the short OSM ways (usually three nodes), so a dogleg's playing line is coarse even where the fairway outline is detailed. OSM has no water hazard on the course; the only stream in the extract is hundreds of yards off the nearest hole and is not drawn. Hole 4 has no bunker polygon within 42 yards of its centerline. One sand bunker about 65 yards off hole 1's tee is left out.
- Pebble Beach — sample with approximate shapes. Fairways there stay an approximated band.

## Importer

`scripts/import_osm.py` converts an OSM XML extract (OSM API `map` call, or Overpass) into `src/courses/*.json`, projecting each hole to yards with the tee at the origin and the tee→green axis pointing up. It reads `golf=*` ways and multipolygon relations (Los Verdes fairways are relations, not ways) and assigns each golf feature to the nearest hole centerline.

The app ships the already-imported `src/courses/losverdes.json`. Raw extracts matching `scripts/*.osm` are gitignored (Los Verdes is about 5 MB). To refresh geometry from OpenStreetMap:

```bash
curl -o scripts/losverdes.osm 'https://api.openstreetmap.org/api/0.6/map?bbox=-118.4065,33.7458,-118.3940,33.7635'
python3 scripts/import_osm.py scripts/losverdes.osm src/courses/losverdes.json
```

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL 1.0).
