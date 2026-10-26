'use strict';
(()=>{
const canvas=document.querySelector('#taste-globe');if(!canvas)return;
const ctx=canvas.getContext('2d');if(!ctx)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let points=[],rotation=-.2,tilt=.17,paused=reduced.matches,visible=false,dragging=false,lastX=0,lastY=0,frame=0,lastTime=0,size=0;
const places=[{name:'London',lon:-.12,lat:51.5,detail:'Jazz. Design. A night worth making.'},{name:'Tokyo',lon:139.7,lat:35.7,detail:'Listening rooms. Architecture. New directions.'},{name:'New York',lon:-74,lat:40.7,detail:'Art. Music. Something unexpected.'},{name:'Paris',lon:2.35,lat:48.85,detail:'Design. Galleries. An unhurried afternoon.'}];let selected=0;
function project(lon,lat){const a=lon*Math.PI/180+rotation,b=lat*Math.PI/180,x=Math.cos(b)*Math.sin(a),y=Math.sin(b),z=Math.cos(b)*Math.cos(a);return[x,y*Math.cos(tilt)-z*Math.sin(tilt),y*Math.sin(tilt)+z*Math.cos(tilt)];}
function draw(t){frame=0;if(!visible||document.hidden)return;const dt=Math.min(40,t-lastTime||16);lastTime=t;if(!paused&&!dragging&&!document.body.classList.contains('motion-paused')&&!reduced.matches)rotation+=dt*.000055;
ctx.clearRect(0,0,size,size);const r=size*.40,c=size*.5;const glow=ctx.createRadialGradient(c,c,r*.4,c,c,r*1.2);glow.addColorStop(0,'#19201d');glow.addColorStop(.75,'#131715');glow.addColorStop(1,'#101111');ctx.fillStyle=glow;ctx.fillRect(0,0,size,size);
for(const [lon,lat] of points){const [x,y,z]=project(lon,lat);if(z<0)continue;const warm=Math.abs(lon-places[selected].lon)<20&&Math.abs(lat-places[selected].lat)<18;ctx.fillStyle=warm?`rgba(255,177,68,${.35+z*.65})`:`rgba(211,220,213,${.12+z*.65})`;ctx.beginPath();ctx.arc(c+x*r,c-y*r,(.45+z*.55)*size/560,0,Math.PI*2);ctx.fill();}
for(let i=0;i<places.length;i++){const p=places[i],[x,y,z]=project(p.lon,p.lat);if(z<0)continue;const px=c+x*r,py=c-y*r;ctx.strokeStyle='#ffb94f';ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,i===selected?9:3,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffb94f';ctx.beginPath();ctx.arc(px,py,2,0,Math.PI*2);ctx.fill();}
if(!paused&&!reduced.matches)frame=requestAnimationFrame(draw);}
function render(){if(!frame)frame=requestAnimationFrame(draw);}
function resize(){size=canvas.clientWidth;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=size*dpr;canvas.height=size*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);render();}
new ResizeObserver(resize).observe(canvas);new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible){lastTime=0;render();}else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'100px'}).observe(canvas);
fetch(new URL('assets/globe-points.json',document.currentScript.src)).then(r=>{if(!r.ok)throw Error();return r.json();}).then(p=>{points=p;render();}).catch(()=>{canvas.setAttribute('aria-label','Globe unavailable. Explore cultural connections with Igor.');});
const button=document.querySelector('#globe-pause');function sync(){button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Resume rotation':'Pause rotation';button.setAttribute('aria-label',button.textContent);render();}button.addEventListener('click',()=>{paused=!paused;sync();});sync();
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!dragging)return;rotation+=(e.clientX-lastX)*.008;tilt=Math.max(-.7,Math.min(.7,tilt+(e.clientY-lastY)*.004));lastX=e.clientX;lastY=e.clientY;render();});function release(){dragging=false;render();}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();rotation+=e.key==='ArrowLeft'?-.13:e.key==='ArrowRight'?.13:0;tilt=Math.max(-.7,Math.min(.7,tilt+(e.key==='ArrowUp'?.08:e.key==='ArrowDown'?-.08:0)));render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});
setInterval(()=>{if(!visible||paused||dragging||reduced.matches)return;selected=(selected+1)%places.length;document.querySelector('#globe-location-name').textContent=places[selected].name;document.querySelector('#globe-location-detail').textContent=places[selected].detail;},7000);
})();
