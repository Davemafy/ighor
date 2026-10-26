'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const icons={"search":"<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><ellipse cx=\"12\" cy=\"12\" rx=\"4\" ry=\"9\"/><path d=\"M3 12h18M5 6.5h14M5 17.5h14\"/>","file":"<path d=\"M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h8M8 9h2\"/>","layout":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M9 4v16M9 10h12\"/>","spark":"<path d=\"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z\"/>","chat":"<path d=\"M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.7-4A8.5 8.5 0 1 1 21 11.5Z\"/>","list":"<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"1\"/><path d=\"M8 7h1M12 7h5M8 12h1M12 12h5M8 17h1M12 17h5\"/>","pause":"<path d=\"M8 5v14M16 5v14\"/>","play":"<path d=\"m8 4 12 8-12 8Z\"/>","edit":"<path d=\"m15 4 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7h.01M12 11v6\"/>","replay":"<path d=\"M3 10a9 9 0 1 1 2 8M3 4v6h6\"/>","arrowRight":"<path d=\"M4 12h15M13 5l7 7-7 7\"/>","arrowUpRight":"<path d=\"M6 18 18 6M6 6h12v12\"/>","chevronRight":"<path d=\"m9 5 7 7-7 7\"/>","plus":"<path d=\"M12 5v14M5 12h14\"/>","check":"<path d=\"m5 12 4.5 4.5L19 7\"/>","close":"<path d=\"m6 6 12 12M18 6 6 18\"/>","undo":"<path d=\"m9 5-5 5 5 5M4 10h10a6 6 0 0 1 6 6v3\"/>","playCircle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m10 8 6 4-6 4Z\"/>","attach":"<path d=\"m8 12 6.4-6.4a3.4 3.4 0 0 1 4.8 4.8l-8.7 8.7a5 5 0 0 1-7.1-7.1l9-9M6.5 13.5l7.6-7.6a1.6 1.6 0 0 1 2.3 2.3l-7.6 7.6\"/>"};
function icon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.spark}</svg>`;}
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const gifts=[{name:'Design book',file:'gift-book',description:'A sculptural design book, inspired by Alex’s interest in design.'},{name:'A record to keep',file:'gift-record',description:'A record for the jazz shelf. The artist and edition still need choosing.'},{name:'A warm little glow',file:'gift-lamp',description:'A sculptural dome lamp for a thoughtful corner.'}];
const plans=[{name:'Gallery visit',description:'Explore art and design together.',image:'/marketing/assets/photos/gallery-480.webp',alt:'Visitors viewing art in a quiet gallery'},{name:'A quiet dinner',description:'Good food in a relaxed setting.',image:'/marketing/assets/generated/quiet-dinner-320.webp',alt:'A candlelit dining room with warm amber light'},{name:'Time to wander',description:'End the night with music and a walk.',image:'/marketing/assets/photos/london-street-480.webp',alt:'An evening street in London'}];
const covers=[{title:'Gift shortlist',copy:'A few considered options, with room to compare and choose.'},{title:'A night for Alex',copy:'A gift, an evening, and an invitation. Three pieces of one thoughtful idea.'},{title:'Creative direction',copy:'Bring references together into a direction you can discuss and refine.'},{title:'The weekend brief',copy:'Turn a loose weekend idea into a plan shaped around what you love.'},{title:'Cultural connections',copy:'Explore the connections between music, design, places and more.'},{title:'A listening room',copy:'Follow a musical interest toward a new listening experience.'},{title:'The launch plan',copy:'Connect the research, creative direction and drafts behind your next launch.'},{title:'Three days away',copy:'A considered starting point for a trip, ready for the practical details.'},{title:'For the whole group',copy:'Bring different interests into one plan with space for everyone.'},{title:'Your next chapter',copy:'Start with a thought. Explore what it could become.'}];
const coverSrc=i=>`/marketing/assets/covers/c${String(i+1).padStart(2,'0')}.webp`;
$$('[data-gifts]').forEach(el=>{el.innerHTML=gifts.map((g,i)=>`<button data-dialog="gift-${i}" aria-label="Inspect ${g.name.toLowerCase()}"><img src="/marketing/assets/generated/${g.file}-320.webp" srcset="/marketing/assets/generated/${g.file}-160.webp 160w, /marketing/assets/generated/${g.file}-320.webp 320w, /marketing/assets/generated/${g.file}-640.webp 640w" sizes="(max-width:767px) 27vw, 15vw" alt="${g.name}" width="320" height="280" loading="lazy" decoding="async"></button>`).join('');});
function responsiveImageSet(src){const photo=src.includes('/photos/');return src+' '+(photo?480:320)+'w, '+src.replace(photo?'-480.webp':'-320.webp',photo?'-800.webp':'-640.webp')+' '+(photo?800:640)+'w';}
function renderPlans(root=document){
 $$('[data-plan]',root).forEach(el=>{const revised=!!el.closest('.revision-section')||el.dataset.updated==='true';const revisedCopy=['Choose a quieter time to explore together.','Ask for a relaxed table, away from the music.','An unhurried walk to end the evening.'];el.innerHTML=`<div class="plan-items">${plans.map((p,i)=>`<div class="plan-item"><img src="${p.image}" srcset="${responsiveImageSet(p.image)}" sizes="(max-width:767px) 32vw, 12vw" width="320" height="240" loading="lazy" decoding="async" alt="${p.alt}"><div><h4>${p.name}</h4><p>${revised?revisedCopy[i]:p.description}</p></div></div>`).join('')}</div>`;});
}
renderPlans();
let invitation={title:'A night for Alex',body:'Art, good food and a little jazz.'};
function renderInvitations(root=document){
 $$('[data-invitation]',root).forEach(el=>{const revised=el.classList.contains('revised')||el.dataset.updated==='true';el.replaceChildren();const h=document.createElement('h4');h.textContent=invitation.title==='A night for Alex'?(revised?'A quieter\nnight for Alex':'A night\nfor Alex'):invitation.title;el.append(h);const img=document.createElement('img');Object.assign(img,{src:'/marketing/assets/photos/gallery-480.webp',srcset:'/marketing/assets/photos/gallery-480.webp 480w, /marketing/assets/photos/gallery-800.webp 800w',sizes:'(max-width:767px) calc(100vw - 110px), 22vw',decoding:'async',alt:'Art and design to explore together',width:480,height:320,loading:'lazy'});el.append(img);const p=document.createElement('p');p.textContent=invitation.body;el.append(p);if(revised){const line=document.createElement('p');line.className='changed-line';line.textContent='A relaxed evening, with space to enjoy it together.';el.append(line);}else{const lines=document.createElement('div');lines.className='invite-lines';lines.setAttribute('aria-hidden','true');el.append(lines);}});
}
renderInvitations();
// Ten unique covers form a repeating diagonal conveyor. Positions 10–19
// replace 0–9 after one cycle, at exactly the same position and scale.
const track=$('#wave-track');
for(let i=0;i<42;i++){const n=i%10;const card=document.createElement('button');card.className='wave-card';card.style.setProperty('--position',i);card.style.setProperty('--layer',i+1);card.dataset.dialog='cover-'+n;card.tabIndex=-1;card.setAttribute('aria-hidden','true');if(i>=10)card.dataset.duplicate='';const img=document.createElement('img');Object.assign(img,{src:`/marketing/assets/posters/p${String(i%20+1).padStart(2,'0')}.svg`,alt:'',width:720,height:1008,loading:'lazy'});card.append(img);track.append(card);}
$('#cover-list').innerHTML=covers.map((x,i)=>`<li><button class="cover-option" data-dialog="cover-${i}" aria-label="Explore ${x.title}"><img src="${coverSrc(i)}" alt="" width="560" height="784" loading="lazy" decoding="async"></button></li>`).join('');
// A fixed radial composition preserves the approved center and generous air.
const radial=$('#radial-art');
let radialSignature='';
function buildRadial(){const w=$('.finale').clientWidth;const mobile=w<768;const height=$('.finale').clientHeight;const wave=$('.wave-section');wave.style.setProperty('--cycle-x',-wave.clientWidth+'px');wave.style.setProperty('--cycle-y',wave.clientHeight*.51+'px');const signature=w+':'+height;if(signature===radialSignature)return;radialSignature=signature;radial.replaceChildren();
 for(let ring=0;ring<4;ring++){
  const orbit=document.createElement('div');orbit.className='radial-ring';
  orbit.style.animationDuration=(120+ring*27)+'s';
  const rx=(mobile?160:220)+ring*(mobile?95:180),ry=(mobile?135:145)+ring*(mobile?95:135);
  const count=22+ring*7,size=(mobile?25:29)+ring*(mobile?22:29);
  for(let j=0;j<count;j++){
   const angle=(j/count)*Math.PI*2+ring*.21;
   const img=document.createElement('img');img.className='radial-cover';
   img.src=`/marketing/assets/posters/p${String((j+ring*7)%20+1).padStart(2,'0')}.svg`;img.alt='';img.loading='lazy';img.width=560;img.height=560;
   img.style.setProperty('--x',Math.cos(angle)*rx+'px');img.style.setProperty('--y',Math.sin(angle)*ry+'px');img.style.setProperty('--r',angle*180/Math.PI+90+'deg');img.style.setProperty('--w',size+'px');orbit.append(img);
  }radial.append(orbit);
 }


}
buildRadial();let resizeFrame;function scheduleGeometry(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(buildRadial);}window.addEventListener('resize',scheduleGeometry,{passive:true});if('ResizeObserver' in window){const geometryObserver=new ResizeObserver(scheduleGeometry);geometryObserver.observe($('.finale'));geometryObserver.observe($('.wave-section'));}
let paused=false;const pause=$('#motion-toggle');pause.addEventListener('click',()=>{paused=!paused;document.body.classList.toggle('motion-paused',paused);pause.setAttribute('aria-pressed',String(paused));$('.motion-label',pause).textContent=paused?'Play motion':'Pause motion';$('[data-icon]',pause).innerHTML=icon(paused?'play':'pause');});
function syncVisibility(){document.body.classList.toggle('page-hidden',document.hidden);}syncVisibility();document.addEventListener('visibilitychange',syncVisibility);
$('#layout-toggle').addEventListener('click',e=>{const focused=$('#workspace').classList.toggle('focus-work');e.currentTarget.setAttribute('aria-pressed',String(focused));e.currentTarget.innerHTML=icon('layout')+(focused?'Show conversation layout':'Focus on your work');});
$$('[data-tab]').forEach(button=>{button.addEventListener('click',()=>{selectTab(button.dataset.tab);});button.addEventListener('keydown',e=>{const tabs=$$('[data-tab]');let i=tabs.indexOf(button);if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();selectTab(tabs[i].dataset.tab);tabs[i].focus();});});
function selectTab(name){$$('[data-tab]').forEach(el=>{const selected=el.dataset.tab===name;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;});$$('[data-canvas]').forEach(el=>el.classList.toggle('active',el.dataset.canvas===name));}
selectTab('gifts');
function replay(){const section=$('.revision-section');section.classList.remove('replaying');void section.offsetWidth;section.classList.add('replaying');$('#announcement').textContent='Evening and invitation updated. Gift shortlist kept. Budget and availability still need checking.';setTimeout(()=>section.classList.remove('replaying'),600);}
$('#revision-trigger').addEventListener('click',replay);$('#replay-revision').addEventListener('click',replay);
$('#workspace-revise').addEventListener('click',e=>{const button=e.currentTarget;if(button.getAttribute('aria-busy')==='true')return;const ws=$('#workspace');if(ws.dataset.revised==='true'){
 $$('[data-invitation],[data-plan]',ws).forEach(el=>delete el.dataset.updated);delete ws.dataset.revised;renderInvitations(ws);renderPlans(ws);$('.revision-reply').hidden=true;$$('.change-badge,.gift-kept').forEach(el=>el.hidden=true);button.innerHTML=icon('arrowRight');button.setAttribute('aria-label','Apply the example revision');$('#announcement').textContent='Revision undone. Original evening and invitation restored; gift shortlist kept.';return;
 }button.setAttribute('aria-disabled','true');button.setAttribute('aria-busy','true');ws.dataset.revised='true';ws.classList.remove('revising');$$('[data-invitation],[data-plan]',ws).forEach(el=>el.dataset.updated='true');renderInvitations(ws);renderPlans(ws);$('.revision-reply').hidden=false;$$('.change-badge,.gift-kept').forEach(el=>el.hidden=false);void ws.offsetWidth;ws.classList.add('revising');selectTab('plan');$('#announcement').textContent='Example revised. Evening and invitation updated. Gift shortlist kept. Budget and availability still need checking.';setTimeout(()=>{button.removeAttribute('aria-disabled');button.removeAttribute('aria-busy');button.innerHTML=icon('undo');button.setAttribute('aria-label','Undo the example revision');ws.classList.remove('revising');},550);});
const dialog=$('#detail-dialog'),title=$('#dialog-title'),body=$('#dialog-body');
const dialogCopy={taste:{title:'Cultural connections',body:'<span class="badge neutral">Illustrative example</span><p>This preview starts with interests supplied in the example: jazz and design.</p><p>In Igor, Qloo provides cultural connections. An inspectable result should show which connections came from Qloo, which details you supplied and what Igor inferred.</p><p>No live Qloo request has been made by this homepage example.</p><a class="button light" href="https://igor-production-243e.up.railway.app/app">Explore with your own goal ' + icon("arrowUpRight") + '</a>'},practical:{title:'What still needs checking',body:'<span class="badge neutral">Illustrative example</span><p>The gallery, dinner and walk illustrate the shape of an evening. They are not verified venue recommendations.</p><ul><li>Choose actual places and check opening hours.</li><li>Confirm availability and travel time.</li><li>Check the total against the £80 budget.</li><li>Confirm Alex’s preferences.</li></ul><p>Igor keeps practical details separate from cultural connections so you can inspect each part.</p>'},privacy:{title:'Your privacy on this page',body:'<p>The invitation editor changes this example in your browser. The text is not submitted to a server or saved after you reload.</p><p>This homepage uses no analytics and does not store your invitation edits. “Try Igor” opens the separate Igor application.</p>'},credits:{title:'Image credits',body:'<p>People are shown in real photographs.</p><ul><li>Dinner: <a href="https://unsplash.com/photos/YfidYnwtXok">Andrii Solok / Unsplash</a></li><li>Gallery: <a href="https://unsplash.com/photos/fB8hHkIpps8">adam roye / Unsplash</a></li><li>London street: <a href="https://unsplash.com/photos/tMm5z4iU4Pw">Vitalijs Barilo / Unsplash</a></li></ul><p>Product still lifes, cover artwork and the dining interior are generated illustrations. They do not establish actual products, venues or availability.</p><p>Typography: Archivo by Omnibus-Type, under the SIL Open Font License.</p>'}};
function openDialog(id){body.className='dialog-copy';body.replaceChildren();if(dialogCopy[id]){title.textContent=dialogCopy[id].title;body.innerHTML=dialogCopy[id].body;}else if(id==='gifts'||id.startsWith('gift-')){title.textContent='A considered gift shortlist';const selected=id==='gifts'?gifts:[gifts[Number(id.split('-')[1])]];body.innerHTML='<span class="badge neutral">Illustrative shortlist · unchanged by the revision</span><div class="dialog-gifts">'+selected.map(g=>`<article><img src="/marketing/assets/generated/${g.file}-640.webp" alt="${g.name}" width="640" height="560"><h3>${g.name}</h3><p>${g.description}</p></article>`).join('')+'</div><p style="margin-top:22px">These are visual examples. The exact item, price and availability need checking before choosing a gift.</p>';}else if(id.startsWith('cover-')){const n=Number(id.split('-')[1]);title.textContent=covers[n].title;body.className='dialog-cover';body.innerHTML=`<img src="${coverSrc(n)}" width="720" height="1008" alt="${covers[n].title} cover"><div><p>${covers[n].copy}</p><a class="button light" href="https://igor-production-243e.up.railway.app/app">Try your idea in Igor ${icon('arrowUpRight')}</a></div>`;}else if(id==='invitation'){title.textContent='Make it yours';const form=document.createElement('form');form.className='edit-form';form.innerHTML='<label for="invitation-title">Invitation title</label><input id="invitation-title" maxlength="70" required><label for="invitation-body">Your words</label><textarea id="invitation-body" maxlength="240" required></textarea><p class="hint">Edit this example in your browser.</p><button class="button light" type="submit">Save your changes <span aria-hidden="true">→</span></button>';body.append(form);$('#invitation-title').value=invitation.title;$('#invitation-body').value=invitation.body;form.addEventListener('submit',e=>{e.preventDefault();invitation={title:$('#invitation-title').value.trim()||invitation.title,body:$('#invitation-body').value.trim()||invitation.body};renderInvitations();dialog.close();$('#announcement').textContent='Your invitation changes are saved in this preview.';});}else return;dialog.showModal();}
document.addEventListener('click',e=>{const trigger=e.target.closest('[data-dialog]');if(trigger)openDialog(trigger.dataset.dialog);});$('.close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});

if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.06});
 const workspace=$('.workspace');workspace.classList.add('will-reveal');observer.observe(workspace);
}

const compactCanvas=matchMedia('(max-width: 767px)');
function syncCanvasSemantics(){
 $$('[data-canvas]').forEach(el=>{if(compactCanvas.matches){el.setAttribute('role','tabpanel');el.setAttribute('aria-labelledby','tab-'+el.dataset.canvas);}else{el.removeAttribute('role');el.removeAttribute('aria-labelledby');}});
}
syncCanvasSemantics();compactCanvas.addEventListener('change',syncCanvasSemantics);
if('IntersectionObserver' in window){
 document.body.classList.add('wave-offscreen');
 const waveVisibility=new IntersectionObserver(entries=>entries.forEach(entry=>document.body.classList.toggle('wave-offscreen',!entry.isIntersecting)),{rootMargin:'100px'});
 waveVisibility.observe($('.wave-section'));
}

$('#cover-list').addEventListener('focusin',event=>{if(!compactCanvas.matches)requestAnimationFrame(()=>event.target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));});

// Route the relationship lines from measured component edges, so spacing and
// responsive typography cannot detach the diagram from the prompt or cards.
const relationshipWire=$('.connector');
const relationshipLayout=$('.revision-layout');
relationshipLayout.append(relationshipWire);
let wireFrame;
function drawRelationship(){
 if(compactCanvas.matches)return;
 const layout=relationshipLayout.getBoundingClientRect();
 const prompt=$('#revision-trigger').getBoundingClientRect();
 const updated=$('.revised-top').getBoundingClientRect();
 const kept=$('.kept-gifts').getBoundingClientRect();
 const sx=prompt.right-layout.left+8,sy=prompt.top+prompt.height/2-layout.top;
 const ex=updated.left-layout.left-14,mx=(sx+ex)/2;
 const headline=$('#revision-title').getBoundingClientRect();
 const updatedAnchor=Math.min(updated.bottom-layout.top-24,Math.max(updated.top+updated.height/2-layout.top,headline.bottom-layout.top+28));
 const ends=[updatedAnchor,kept.top+kept.height/2-layout.top];
 const svg=$('svg',relationshipWire);
 svg.setAttribute('viewBox',`0 0 ${layout.width} ${layout.height}`);
 svg.innerHTML=ends.map(y=>`<path d="M${sx} ${sy} H${sx+24} C${mx} ${sy} ${mx} ${y} ${ex-24} ${y} H${ex}"/>`).join('')+`<circle cx="${sx}" cy="${sy}" r="5"/>`+ends.map(y=>`<circle cx="${ex}" cy="${y}" r="5"/>`).join('');
}
function scheduleRelationship(){cancelAnimationFrame(wireFrame);wireFrame=requestAnimationFrame(drawRelationship);}
if('ResizeObserver' in window){const relationshipObserver=new ResizeObserver(scheduleRelationship);relationshipObserver.observe(relationshipLayout);relationshipObserver.observe($('#revision-trigger'));}
window.addEventListener('resize',scheduleRelationship,{passive:true});
drawRelationship();
