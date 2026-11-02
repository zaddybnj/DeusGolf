// Pebble Beach sample — APPROXIMATE hand-made geometry, real scorecard yardages. Converted to the polygon format.
const raw=[[1,4,377,-20,'b'],[2,5,511,10,'b'],[3,4,390,-35,'b'],[4,4,326,5,'w'],[5,3,192,-10,'w'],[6,5,506,25,'w'],[7,3,106,0,'wb'],[8,4,427,20,'w'],[9,4,481,15,'w'],[10,4,446,15,'w'],[11,4,380,0,'b'],[12,3,201,0,'b'],[13,4,403,10,'b'],[14,5,572,-30,'b'],[15,4,396,0,'b'],[16,4,401,10,'b'],[17,3,177,-15,'w'],[18,5,543,-40,'w']];
const circle=(x,y,r)=>Array.from({length:16},(_,i)=>[x+r*Math.cos(i/16*6.283),y+r*Math.sin(i/16*6.283)]);
export const pebble={name:'Pebble Beach Golf Links (sample — approximate geometry)',attribution:'Approximate shapes; scorecard yardages.',tees:['Back'],holes:raw.map(([n,par,yds,bend,h])=>{
 const line=Array.from({length:11},(_,i)=>{const y=yds*i/10,t=i/10;return[bend*t*t,y]});const feats=[{t:'green',pts:circle(bend,yds,14),main:true},{t:'tee',pts:circle(0,0,5)}];
 if(h.includes('b'))feats.push({t:'bunker',pts:circle(bend+18,yds-8,7)},{t:'bunker',pts:circle(bend-14,yds+6,6)});
 if(h.includes('w'))feats.push({t:'water',pts:circle(bend+75,yds*.6,Math.max(40,yds*.25))});
 return{n,par,yds:{Back:yds},osmYds:yds,line,pin:[bend,yds],feats,real:{},fwApprox:true,approx:true}})};
