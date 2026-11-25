const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
const TYPES={
 house:{name:'Cottage',cost:{wood:30,stone:0,food:0},pop:4,icon:'⌂',kind:'home'},
 lumber:{name:'Lumber Hut',cost:{wood:25,stone:10,food:0},produce:{wood:2},icon:'♠',kind:'work'},
 quarry:{name:'Stone Quarry',cost:{wood:20,stone:15,food:0},produce:{stone:2},icon:'◆',kind:'work'},
 farm:{name:'Farm',cost:{wood:35,stone:5,food:0},produce:{food:3},icon:'♣',kind:'work'},
 store:{name:'Storehouse',cost:{wood:50,stone:30,food:0},capacity:100,icon:'▤',kind:'store'}
};
let state=load();
let selected=null,paused=false,speed=1,zoom=1,hover=null,last=performance.now(),tick=0;
const tile=48, mapSize=30;

function load(){try{let s=JSON.parse(localStorage.getItem('ironvale-save'));if(s&&s.buildings)return s}catch(e){}return {wood:120,stone:80,food:60,pop:8,buildings:[{type:'house',x:15,y:15},{type:'lumber',x:12,y:16},{type:'quarry',x:18,y:13}],year:1};}
function save(){localStorage.setItem('ironvale-save',JSON.stringify(state))}
function affordable(t){let c=TYPES[t].cost;return state.wood>=c.wood&&state.stone>=c.stone&&state.food>=c.food}

function buildList(){const el=document.getElementById('buildings');el.innerHTML='';Object.entries(TYPES).forEach(([id,t])=>{const b=document.createElement('button');b.className='building-card'+(selected===id?' selected':'')+(affordable(id)?'':' disabled');b.innerHTML=`<canvas width="58" height="58"></canvas><div><strong>${t.name}</strong><small>${t.kind==='work'?'PRODUCES':t.kind==='home'?'HOUSING':'STORAGE'}</small><div class="cost"><b>${t.cost.wood}</b> ◉ &nbsp; <b>${t.cost.stone}</b> ◆</div></div>`;drawMini(b.querySelector('canvas'),id);b.onclick=()=>{selected=selected===id?null:id;toast(selected?`Place ${t.name}`:'Building cancelled');buildList()};el.appendChild(b)})}

function drawMini(c,type){let x=c.getContext('2d');x.imageSmoothingEnabled=false;x.clearRect(0,0,58,58);x.fillStyle='#839a61';x.fillRect(0,0,58,58);drawBuilding(x,29,29,type,true)}
function resize(){const r=canvas.getBoundingClientRect();canvas.width=Math.round(r.width*dpr());canvas.height=Math.round(r.height*dpr());ctx.setTransform(dpr(),0,0,dpr(),0,0)}
function dpr(){return Math.min(window.devicePixelRatio||1,2)}

function terrain(x,y){let n=((x*13+y*7+x*y*3)%19+19)%19;if(n<3)return 'water';if(n<7)return 'forest';if(n===12)return 'stone';return 'grass'}
function draw(){resizeOnce();let w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(zoom,zoom);ctx.translate(-mapSize*tile/2,-mapSize*tile/2);
ctx.fillStyle='#71884e';ctx.fillRect(0,0,mapSize*tile,mapSize*tile);
for(let y=0;y<mapSize;y++)for(let x=0;x<mapSize;x++){let t=terrain(x,y);ctx.fillStyle=t==='water'?'#668b82':t==='forest'?'#667a48':t==='stone'?'#7d8063':'#82965a';ctx.fillRect(x*tile,y*tile,tile,tile);ctx.strokeStyle='rgba(48,58,36,.12)';ctx.strokeRect(x*tile+.5,y*tile+.5,tile-1,tile-1);if(t==='forest')drawTree(x*tile,y*tile,x+y);if(t==='stone')drawRock(x*tile,y*tile)}
// roads
ctx.strokeStyle='#b5a476';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(15*tile+24,0);ctx.lineTo(15*tile+24,mapSize*tile);ctx.moveTo(0,15*tile+24);ctx.lineTo(mapSize*tile,15*tile+24);ctx.stroke();ctx.lineWidth=1;
state.buildings.forEach(b=>drawBuilding(ctx,b.x*tile+24,b.y*tile+24,b.type,false));
if(selected&&hover&&hover.x>=0&&hover.x<mapSize&&hover.y>=0&&hover.y<mapSize){let ok=canPlace(hover.x,hover.y);ctx.fillStyle=ok?'rgba(170,210,120,.38)':'rgba(150,70,50,.42)';ctx.fillRect(hover.x*tile,hover.y*tile,tile,tile);ctx.strokeStyle=ok?'#dbe8a4':'#a84e3d';ctx.strokeRect(hover.x*tile+.5,hover.y*tile+.5,tile-1,tile-1)}
ctx.restore();drawChart();}
let lastSize='';function resizeOnce(){let key=canvas.clientWidth+'x'+canvas.clientHeight;if(key!==lastSize){lastSize=key;resize()}}
function drawTree(x,y,n){ctx.fillStyle='#50683a';ctx.fillRect(x+10+(n%3)*2,y+14,4,22);ctx.fillStyle='#667f43';ctx.beginPath();ctx.arc(x+12+(n%3)*2,y+14,10,0,7);ctx.fill();ctx.fillStyle='#7a9650';ctx.beginPath();ctx.arc(x+8+(n%3)*2,y+12,6,0,7);ctx.fill()}
function drawRock(x,y){ctx.fillStyle='#77785f';ctx.beginPath();ctx.moveTo(x+10,y+34);ctx.lineTo(x+16,y+20);ctx.lineTo(x+29,y+16);ctx.lineTo(x+39,y+28);ctx.lineTo(x+34,y+38);ctx.closePath();ctx.fill();ctx.strokeStyle='#595b4a';ctx.stroke()}
function drawBuilding(c,x,y,type,mini){c.save();c.translate(x,y);let s=mini?1:.78;if(type==='lumber'){c.fillStyle='#694a2e';c.fillRect(-18*s,-12*s,36*s,25*s);c.fillStyle='#ac8147';for(let i=-14;i<15;i+=8)c.fillRect(i*s,-9*s,5*s,19*s);c.fillStyle='#4e402c';c.beginPath();c.moveTo(-23*s,-12*s);c.lineTo(0,-31*s);c.lineTo(23*s,-12*s);c.closePath();c.fill();c.fillStyle='#a85d3d';c.beginPath();c.moveTo(-19*s,-12*s);c.lineTo(0,-27*s);c.lineTo(19*s,-12*s);c.closePath();c.fill()}
else if(type==='quarry'){c.fillStyle='#656757';c.fillRect(-20*s,-12*s,40*s,24*s);c.fillStyle='#888970';for(let i=-16;i<20;i+=9){c.beginPath();c.moveTo(i*s,-11*s);c.lineTo((i+7)*s,-16*s);c.lineTo((i+12)*s,-4*s);c.lineTo((i+5)*s,4*s);c.closePath();c.fill()}c.fillStyle='#4a4b40';c.fillRect(-5*s,-5*s,10*s,9*s)}
else if(type==='store'){c.fillStyle='#8b6940';c.fillRect(-20*s,-15*s,40*s,30*s);c.fillStyle='#d1b278';c.fillRect(-15*s,-10*s,30*s,20*s);c.fillStyle='#4f4331';c.beginPath();c.moveTo(-24*s,-15*s);c.lineTo(0,-32*s);c.lineTo(24*s,-15*s);c.closePath();c.fill()}
else if(type==='farm'){c.fillStyle='#a88f51';c.fillRect(-21*s,-16*s,42*s,32*s);c.strokeStyle='#6d713b';c.lineWidth=2;for(let i=-14;i<15;i+=7){c.beginPath();c.moveTo(i*s,-13*s);c.lineTo(i*s,13*s);c.stroke()}}
else{c.fillStyle='#b79a63';c.fillRect(-18*s,-10*s,36*s,23*s);c.fillStyle='#4c4635';c.beginPath();c.moveTo(-23*s,-10*s);c.lineTo(0,-31*s);c.lineTo(23*s,-10*s);c.closePath();c.fill();c.fillStyle='#b26045';c.beginPath();c.moveTo(-19*s,-10*s);c.lineTo(0,-27*s);c.lineTo(19*s,-10*s);c.closePath();c.fill();c.fillStyle='#55472f';c.fillRect(-5*s,0,10*s,13*s)}c.restore()}

function canPlace(x,y){if(terrain(x,y)==='water')return false;if(state.buildings.some(b=>b.x===x&&b.y===y))return false;return affordable(selected)}
function place(x,y){if(!selected||!canPlace(x,y))return;let t=TYPES[selected];state.wood-=t.cost.wood;state.stone-=t.cost.stone;state.food-=t.cost.food;state.buildings.push({type:selected,x,y});if(t.pop)state.pop=Math.min(state.pop+t.pop,40);toast(`${t.name} constructed`);selected=null;save();buildList();updateUI();}
function toast(s){document.getElementById('toast').textContent=s}

canvas.addEventListener('mousemove',e=>{let r=canvas.getBoundingClientRect();let px=(e.clientX-r.left-canvas.clientWidth/2)/zoom+mapSize*tile/2,py=(e.clientY-r.top-canvas.clientHeight/2)/zoom+mapSize*tile/2;hover={x:Math.floor(px/tile),y:Math.floor(py/tile)}});
canvas.addEventListener('mouseleave',()=>hover=null);canvas.addEventListener('click',()=>{if(hover)place(hover.x,hover.y)});

function updateUI(){document.getElementById('wood').textContent=Math.floor(state.wood);document.getElementById('stone').textContent=Math.floor(state.stone);document.getElementById('food').textContent=Math.floor(state.food);document.getElementById('population').textContent=`${state.pop} / ${populationCap()}`;document.getElementById('year').textContent=state.year;document.getElementById('huts').textContent=state.buildings.filter(b=>b.type==='house').length;document.getElementById('workshops').textContent=state.buildings.filter(b=>['lumber','quarry','farm'].includes(b.type)).length;document.getElementById('storehouses').textContent=state.buildings.filter(b=>b.type==='store').length;let pro=state.buildings.reduce((n,b)=>n+(TYPES[b.type].produce?Object.keys(TYPES[b.type].produce).length:0),0)*2;document.getElementById('producing').textContent=`+${pro}/min`;buildList()}
function populationCap(){let c=8;state.buildings.forEach(b=>{if(TYPES[b.type].pop)c+=TYPES[b.type].pop});return c}

function drawChart(){let c=document.getElementById('chart'),x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.strokeStyle='rgba(96,91,62,.22)';for(let i=0;i<5;i++){x.beginPath();x.moveTo(0,i*h/4+.5);x.lineTo(w,i*h/4+.5);x.stroke()}x.fillStyle='rgba(104,122,73,.75)';let vals=[];for(let i=0;i<12;i++)vals.push(18+((i*7+tick)%21));vals.forEach((v,i)=>x.fillRect(i*w/12+8,h-v*0.55,w/12-10,v*.55));x.strokeStyle='#667943';x.beginPath();vals.forEach((v,i)=>{let px=i*w/12+13,py=h-v*.55;i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()}

setInterval(()=>{if(paused)return;tick++;let sec=.15*speed;if(++tick%20===0){state.year++}state.buildings.forEach(b=>{let p=TYPES[b.type].produce;if(!p)return;Object.entries(p).forEach(([r,n])=>state[r]+=n*sec)}) ;if(tick%10===0){save();updateUI()}},100);
document.getElementById('pauseBtn').onclick=()=>{paused=!paused;document.getElementById('pauseBtn').textContent=paused?'▶':'Ⅱ';toast(paused?'Settlement paused':'Settlement resumed')};
document.querySelectorAll('.speedBtn').forEach(b=>b.onclick=()=>{speed=+b.dataset.speed;document.querySelectorAll('.speedBtn').forEach(v=>v.classList.remove('active'));b.classList.add('active')});
document.getElementById('zoomIn').onclick=()=>{zoom=Math.min(1.5,zoom+.1);document.getElementById('zoomLabel').textContent=Math.round(zoom*100)+'%'};document.getElementById('zoomOut').onclick=()=>{zoom=Math.max(.7,zoom-.1);document.getElementById('zoomLabel').textContent=Math.round(zoom*100)+'%'};
window.addEventListener('resize',draw);buildList();updateUI();function loop(){draw();requestAnimationFrame(loop)}loop();
