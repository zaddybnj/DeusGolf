import {pebble} from './course.js';
import lv from './courses/losverdes.json';
const COURSES={losverdes:lv,pebble};
// Placeholder bag: long-hitting scratch golfer (carry yards)
const CLUBS={Driver:290,'3W':260,'5W':240,'4i':220,'5i':210,'6i':200,'7i':185,'8i':170,'9i':155,PW:140,'GW 52°':125,'SW 56°':105,'LW 60°':90,Putter:0};
const $=id=>document.getElementById(id),cv=$('map'),c=cv.getContext('2d');
let course=lv,tee=lv.tees[0],h=0,club='Driver',ball,aim,shots,trail,done,scores={},S,ox,oy,cxv;
const H=()=>course.holes[h],dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function along(line,d){for(let i=1;i<line.length;i++){const s=dist(line[i-1],line[i]);if(d<=s){const t=d/s;return[line[i-1][0]+(line[i][0]-line[i-1][0])*t,line[i-1][1]+(line[i][1]-line[i-1][1])*t]}d-=s}return line.at(-1)}
const teePos=()=>{const g=H();return along(g.line,Math.max(0,g.osmYds-g.yds[tee]))};
function segD(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)}
const lineD=(p,l)=>Math.min(...l.slice(1).map((b,i)=>segD(p,l[i],b)));
function inPoly(p,q){let r=false;for(let i=0,j=q.length-1;i<q.length;j=i++){const[a,b]=q[i],[e,f]=q[j];if((b>p[1])!==(f>p[1])&&p[0]<(e-a)*(p[1]-b)/(f-b)+a)r=!r}return r}
// synthetic fairway: band along centerline from 35% to green-25yd, used only where OSM has no fairway polygon
const synthFw=g=>{const L=g.osmYds,a=g.par===3?1e9:Math.min(190,L*.35);return p=>{const y=p[1];return y>a&&y<L-25&&lineD(p,g.line)<18}};
function lie(p){const g=H();for(const t of['water','bunker'])if(g.feats.some(f=>f.t===t&&inPoly(p,f.pts)))return t;
 if(g.feats.some(f=>f.t==='green'&&inPoly(p,f.pts)))return'green';if(dist(p,g.pin)<3)return'green';
 if(g.feats.some(f=>f.t==='tee'&&inPoly(p,f.pts)))return'tee';
 if(g.feats.some(f=>f.t==='fairway'&&inPoly(p,f.pts))||(g.fwApprox&&synthFw(g)(p)))return'fairway';
 if(g.feats.some(f=>f.t==='trees'&&inPoly(p,f.pts)))return'trees';return lineD(p,g.line)<45?'rough':'deep rough'}
function view(){const W=cv.clientWidth,Hh=cv.clientHeight;cv.width=W*devicePixelRatio;cv.height=Hh*devicePixelRatio;c.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
 const g=H(),xs=g.line.map(p=>p[0]),y1=g.osmYds+35,x0=Math.min(...xs)-70,x1=Math.max(...xs)+70;S=Math.min((Hh-30)/(y1+30),W/(x1-x0));ox=W/2-(x0+x1)/2*S;oy=Hh-15-20*S;cxv={W,Hh}}
const P=p=>[ox+p[0]*S,oy-p[1]*S],U=(x,y)=>[(x-ox)/S,(oy-y)/S];
const COL={rough:'#7fb35a',fairway:'#9fd277',green:'#c4ef95',tee:'#b8e08e',bunker:'#ecdca4',water:'#3b7dc4',trees:'#3f6e34',path:'#c9c9c0',building:'#a99',};
function poly(q,fill,stroke){c.beginPath();q.forEach((p,i)=>c[i?'lineTo':'moveTo'](...P(p)));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.stroke()}}
function draw(){const g=H();c.fillStyle='#4e7d3a';c.fillRect(0,0,cxv.W,cxv.Hh);
 c.lineCap=c.lineJoin='round';c.strokeStyle=COL.rough;c.lineWidth=90*S;c.beginPath();g.line.forEach((p,i)=>c[i?'lineTo':'moveTo'](...P(p)));c.stroke();
 if(g.fwApprox){
  c.save();c.setLineDash([]);c.strokeStyle='#9fd277bb';c.lineWidth=36*S;c.beginPath();let on=0;const a=g.par===3?1e9:Math.min(190,g.osmYds*.35);
  for(let d=0;d<=g.osmYds;d+=4){const p=along(g.line,d);if(p[1]>a&&p[1]<g.osmYds-25){c[on?'lineTo':'moveTo'](...P(p));on=1}}c.stroke();c.restore()}
 for(const t of['trees','path','building','rough','fairway','tee','green','bunker','water'])for(const f of g.feats.filter(f=>f.t===t)){
  if(t==='path'){c.strokeStyle=COL.path;c.lineWidth=Math.max(1,2.5*S);c.beginPath();f.pts.forEach((p,i)=>c[i?'lineTo':'moveTo'](...P(p)));c.stroke();continue}
  c.lineWidth=1;poly(f.pts,COL[t]+(f.main||t==='bunker'||t==='water'?'':'d0'),t==='green'||t==='bunker'?'#0002':null)}
 c.setLineDash([2,6]);c.strokeStyle='#fff6';c.lineWidth=1;c.beginPath();g.line.forEach((p,i)=>c[i?'lineTo':'moveTo'](...P(p)));c.stroke();c.setLineDash([]);
 const[fx,fy]=P(g.pin);c.strokeStyle='#d22';c.lineWidth=2;c.beginPath();c.moveTo(fx,fy);c.lineTo(fx,fy-22);c.stroke();c.fillStyle='#d22';c.fillRect(fx,fy-22,10,7);
 const tp=P(teePos());c.fillStyle='#fff';c.fillRect(tp[0]-4,tp[1]-2,8,4);
 c.strokeStyle='#fff';c.setLineDash([4,4]);c.lineWidth=1.5;c.beginPath();trail.forEach((p,i)=>c[i?'lineTo':'moveTo'](...P(p)));c.stroke();c.setLineDash([]);
 if(!done){const d=CLUBS[club]||dist(ball,g.pin),an=Math.atan2(aim[0]-ball[0],aim[1]-ball[1]),t=[ball[0]+Math.sin(an)*d,ball[1]+Math.cos(an)*d];
  c.strokeStyle='#ff0a';c.beginPath();c.moveTo(...P(ball));c.lineTo(...P(t));c.stroke();c.strokeStyle='#ff0';c.beginPath();c.arc(...P(t),7,0,7);c.stroke()}
 c.fillStyle='#fff';c.beginPath();c.arc(...P(ball),4.5,0,7);c.fill();c.strokeStyle='#000';c.lineWidth=1;c.stroke();
 // scale bar
 c.fillStyle='#fff';c.font='12px system-ui';c.fillRect(12,cxv.Hh-20,100*S,3);c.fillText('100 yds',12,cxv.Hh-26)}
const autoAim=()=>{const g=H(),d=CLUBS[club];if(!d||dist(ball,g.pin)<=d+10)return[...g.pin];let best=g.pin,bd=1e9;for(let k=0;k<=g.osmYds;k+=3){const p=along(g.line,k),e=Math.abs(dist(p,ball)-d);if(p[1]>ball[1]&&e<bd){bd=e;best=p}}return[...best]};
function start(){ball=teePos();shots=0;trail=[[...ball]];done=false;club=H().par===3?(H().yds[tee]>175?'5i':'7i'):'Driver';aim=autoAim();$('log').innerHTML='';view();draw();info()}
function hit(){if(done)return;const g=H(),L=lie(ball);let d=CLUBS[club];
 if(club==='Putter'){const r=dist(ball,g.pin)*3;shots++;if(r<3||Math.random()<Math.max(.15,1-r/40)){finish();return}d=r/3*(.8+Math.random()*.4)}
 else{d*=({rough:.9,'deep rough':.75,bunker:.7,trees:.5}[L]||1)*(.94+Math.random()*.1);shots++}
 const an=Math.atan2(aim[0]-ball[0],aim[1]-ball[1])+(Math.random()-.5)*(club==='Putter'?.05:.12),prev=[...ball];ball=[ball[0]+Math.sin(an)*d,ball[1]+Math.cos(an)*d];
 let nl=lie(ball),msg=`${club}: ${d.toFixed(0)} yds → ${nl}`;if(nl==='water'){shots++;ball=prev;msg+=' — penalty, replay'}
 trail.push([...ball]);if(lie(ball)==='green')club='Putter';else if(dist(ball,g.pin)<100)club='SW 56°';aim=autoAim();log(msg);draw();info()}
function finish(){done=true;scores[h]=shots;ball=[...H().pin];trail.push([...ball]);const d=shots-H().par;log(`Holed! ${shots} strokes (${['Eagle','Birdie','Par','Bogey','Double'][d+2]||(d>0?'+'+d:d)})`);draw();info()}
function log(m){$('log').innerHTML=`<p>${m}</p>`+$('log').innerHTML}
function info(){const g=H(),r=g.real;$('course').textContent=course.name;
 const src=g.approx?'<span class="warn">Approximate shapes</span>':`<span class="ok">OSM: green ✓ · ${r.bunkers} bunkers · tees ✓</span>${g.fwApprox?' <span class="warn">fairway approximated</span>':' · fairway ✓'}`;
 $('hole').innerHTML=`<h2>Hole ${g.n} <small>Par ${g.par} · HCP ${g.hcp||'–'}</small></h2><div>${g.yds[tee]} yds (${tee}) · mapped ${g.osmYds}</div><div class="big2">To pin: <b>${dist(ball,g.pin).toFixed(0)}</b> yds</div><div>Lie: ${lie(ball)} · Strokes: ${shots}</div><div class="src">${src}</div>`;
 $('clubs').innerHTML=Object.entries(CLUBS).map(([k,v])=>`<button data-c="${k}" class="${k===club?'on':''}">${k}${v?' '+v:''}</button>`).join('');
 $('tee').innerHTML=course.tees.map(t=>`<option ${t===tee?'selected':''}>${t}</option>`).join('');
 const t=Object.entries(scores);$('card').innerHTML=t.length?`<table><tr>${t.map(([i])=>`<th>${+i+1}</th>`).join('')}<th>Tot</th></tr><tr>${t.map(([,s])=>`<td>${s}</td>`).join('')}<td>${t.reduce((a,[,s])=>a+s,0)}</td></tr></table>`:'';
 $('attr').innerHTML=course.attribution.replace('OpenStreetMap contributors','<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>')}
$('clubs').onclick=e=>{if(e.target.dataset.c){club=e.target.dataset.c;aim=autoAim();draw();info()}};
cv.onclick=e=>{const r=cv.getBoundingClientRect();aim=U(e.clientX-r.left,e.clientY-r.top);draw()};
$('hit').onclick=hit;$('reset').onclick=start;
$('next').onclick=()=>{h=(h+1)%course.holes.length;start()};$('prev').onclick=()=>{h=(h+course.holes.length-1)%course.holes.length;start()};
$('courseSel').onchange=e=>{course=COURSES[e.target.value];tee=course.tees[0];h=0;scores={};start()};
$('tee').onchange=e=>{tee=e.target.value;start()};
addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();hit()}});
addEventListener('resize',()=>{view();draw()});
start();
