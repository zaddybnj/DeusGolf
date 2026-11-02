#!/usr/bin/env python3
"""Convert an OSM XML extract of a golf course into DeusGolf hole JSON.
Data © OpenStreetMap contributors, ODbL 1.0.
Fetch:  curl -o scripts/losverdes.osm 'https://api.openstreetmap.org/api/0.6/map?bbox=-118.4065,33.7458,-118.3940,33.7635'
Run:    python3 scripts/import_osm.py scripts/losverdes.osm src/courses/losverdes.json
Each hole is projected to local yards: hole centerline start (tee) at origin, tee->green axis = +y."""
import sys,json,math,xml.etree.ElementTree as ET
src,out=sys.argv[1],sys.argv[2]
# Official scorecard, losverdesgc.com/wp-content/uploads/sites/24/2020/08/LosVerdes-Scorecard-Inside.pdf
BLUE=[489,370,180,441,189,556,380,352,410,377,305,153,420,417,445,488,225,420]
WHITE=[465,349,167,427,149,517,367,340,400,370,292,138,367,381,436,450,207,412]
PAR=[5,4,3,4,3,5,4,4,4,4,4,3,4,4,4,5,3,4]
r=ET.parse(src).getroot()
N={n.get('id'):(float(n.get('lat')),float(n.get('lon'))) for n in r.iter('node')}
lat0=33.755;Y=1.0936133
def ll2m(p):return((p[1]+118.4)*111320*math.cos(math.radians(lat0))*Y,(p[0]-lat0)*110574*Y)
feats=[];holes={}
for w in r.iter('way'):
  t={x.get('k'):x.get('v') for x in w.findall('tag')};pts=[ll2m(N[n.get('ref')]) for n in w.findall('nd') if n.get('ref') in N]
  if not pts:continue
  g=t.get('golf')
  if g=='hole':holes[int(t['ref'])]=dict(t=t,line=pts);continue
  k={'green':'green','tee':'tee','bunker':'bunker','fairway':'fairway','rough':'rough','water_hazard':'water','lateral_water_hazard':'water','cartpath':'path','path':'path'}.get(g)
  if not k and t.get('natural')=='water':k='water'
  if not k and t.get('natural') in('wood','scrub') or t.get('landuse')=='forest':k='trees'
  if not k and t.get('building'):k='building'
  if k:feats.append((k,pts,w.get('id')))
def L(l):return sum(math.dist(a,b) for a,b in zip(l,l[1:]))
course={'name':'Los Verdes Golf Course — Rancho Palos Verdes, CA','attribution':'Hole geometry © OpenStreetMap contributors (ODbL). Scorecard: losverdesgc.com.','tees':['White','Blue'],'holes':[]}
for n in range(1,19):
  h=holes[n];line=h['line'];o=line[0];e=line[-1];a=math.atan2(e[0]-o[0],e[1]-o[1]);ca,sa=math.cos(a),math.sin(a)
  P=lambda p:[round((p[0]-o[0])*ca-(p[1]-o[1])*sa,1),round((p[0]-o[0])*sa+(p[1]-o[1])*ca,1)]
  cl=[P(p) for p in line];ylen=cl[-1][1]
  fs=[]
  for k,pts,i in feats:
    q=[P(p) for p in pts]
    if any(-90<x<90 and -40<y<ylen+50 for x,y in q):fs.append({'t':k,'pts':q,'id':i})
  # pin = centroid of green polygon containing/nearest centerline end
  gr=[f for f in fs if f['t']=='green'];pin=cl[-1];real={}
  if gr:
    g=min(gr,key=lambda f:min(math.dist(p,cl[-1]) for p in f['pts']));pin=[round(sum(p[i] for p in g['pts'])/len(g['pts']),1) for i in(0,1)];g['main']=True;real['green']=True
  real['bunkers']=sum(f['t']=='bunker' for f in fs);real['tees']=sum(f['t']=='tee' and math.dist(f['pts'][0],[0,0])<120 for f in fs)
  real['fairway']=any(f['t']=='fairway' for f in fs);real['water']=any(f['t']=='water' for f in fs)
  course['holes'].append({'n':n,'par':PAR[n-1],'yds':{'White':WHITE[n-1],'Blue':BLUE[n-1]},'osmYds':round(L(line)),'hcp':int(h['t'].get('handicap',0)),
    'line':cl,'pin':pin,'feats':fs,'real':real,'fwApprox':not real['fairway']})
json.dump(course,open(out,'w'),separators=(',',':'))
for h in course['holes']:print(h['n'],h['par'],h['yds'],'osm',h['osmYds'],h['real'])
