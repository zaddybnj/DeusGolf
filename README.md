# DeusGolf

Preview-play a real course in 2D with your own club distances (currently placeholder carries for a long-hitting scratch golfer: Dr 290, 3W 260, 5W 240, 4i 220, 5i 210, 6i 200, 7i 185, 8i 170, 9i 155, PW 140, GW 125, SW 105, LW 90, Putter).

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

## Courses

- **Los Verdes Golf Course** (Rancho Palos Verdes, CA) — real hole geometry from OpenStreetMap: all 18 hole centerlines, greens, tees, bunkers, cart paths. OSM has fairway polygons only near holes 13–14, so fairways elsewhere are an approximated band along the centerline (labeled in the UI). Par/handicap/yardages (White & Blue) from the official scorecard (losverdesgc.com).
- Pebble Beach — sample with approximate shapes.

## Importer

`scripts/import_osm.py` converts an OSM XML extract (OSM API `map` call, or Overpass) into `src/courses/*.json`, projecting each hole to yards with the tee at the origin and the tee→green axis pointing up.

The app ships the already-imported `src/courses/losverdes.json`. Raw extracts matching `scripts/*.osm` are gitignored (Los Verdes is about 5 MB). To refresh geometry from OpenStreetMap:

```bash
curl -o scripts/losverdes.osm 'https://api.openstreetmap.org/api/0.6/map?bbox=-118.4065,33.7458,-118.3940,33.7635'
python3 scripts/import_osm.py scripts/losverdes.osm src/courses/losverdes.json
```

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL 1.0).
