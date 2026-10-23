// song ideas player: waveform timeline, A–B loop, volume + auto level, download.
const $=q=>document.querySelector(q);
const a=$('#audio'),list=$('#list'),now=$('#now'),clock=$('#clock'),play=$('#play'),queue=$('#queue'),browse=$('#browse');
const vol=$('#vol'),volout=$('#volout'),lvl=$('#lvl'),dl=$('#dl');
const wave=$('#wave'),over=$('#over'),loopBtn=$('#loop');
const pad2=x=>String(x).padStart(2,'0');
const f=x=>`${Math.floor(x/60)}:${pad2(Math.floor(x%60))}`;
const fc=x=>x==null?'-:--.--':`${f(x)}.${pad2(Math.floor((x%1)*100+1e-6))}`;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
let i=0;
const VER=5;   // bump with the ?v= in index.html

/* --- level + volume --- */
// quiet songs get lifted up to TARGET, loud ones are left alone. the lift is capped,
// and a limiter at the end of the chain catches the peaks a lift pushes over 0 dBFS.
const TARGET=-12,MAX_LIFT=12;
const lift=t=>Math.min(MAX_LIFT,Math.max(0,TARGET-t.lufs));
const db=x=>Math.pow(10,x/20);
let auto=store.get('si-auto')!=='off';
vol.value=store.get('si-vol')??0;

// web audio is built on the first play (browsers only allow it after a tap)
let ctx,trackGain,userGain,analyser;
function graph(){
  if(ctx)return;
  try{navigator.audioSession&&(navigator.audioSession.type='playback')}catch(e){}  // iOS: don't obey the silent switch
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  trackGain=ctx.createGain();userGain=ctx.createGain();
  const lim=ctx.createDynamicsCompressor();
  lim.threshold.value=-1;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=0.002;lim.release.value=0.15;
  ctx.createMediaElementSource(a).connect(trackGain).connect(userGain).connect(lim).connect(ctx.destination);
  analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=0.72;trackGain.connect(analyser);
  apply();
}
function apply(){
  const v=+vol.value;
  volout.textContent=v<=-40?'MUTE':`${v>0?'+':''}${v} dB`;
  lvl.textContent=`AUTO LEVEL: ${auto?'ON':'OFF'}`;lvl.classList.toggle('off',!auto);
  if(!ctx)return;
  const t=ctx.currentTime;
  userGain.gain.setTargetAtTime(v<=-40?0:db(v),t,0.02);
  trackGain.gain.setTargetAtTime(auto?db(lift(tracks[i])):1,t,0.02);
}
vol.oninput=()=>{store.set('si-vol',vol.value);apply()};
vol.ondblclick=()=>{vol.value=0;vol.oninput()};
lvl.onclick=()=>{auto=!auto;store.set('si-auto',auto?'on':'off');apply()};

/* --- transport --- */
// a seek before the song has loaded is held here and applied once it has
let pending=null;
// a streamed mp3 can report NaN or Infinity before it knows; the list's length is the fallback
const D=()=>isFinite(a.duration)&&a.duration>0?a.duration:tracks[i].duration;
const T=()=>pending??a.currentTime;
function seek(t){
  t=clamp(t,0,D());prevT=t;
  if(a.readyState>=1){a.currentTime=t;pending=null}else pending=t;
}
a.onloadedmetadata=()=>{if(pending!=null){a.currentTime=pending;pending=null}};
function start(){graph();ctx.resume();a.play().catch(()=>{})}
// filenames for the person you hand it to: "Metro - On My Mind.mp3"
const fileName=t=>`${t.artist} - ${t.title}`.replace(/[\\/:*?"<>|]/g,'').replace(/\.+$/,'').trim()+'.mp3';

function cue(x,go){
  i=(x+tracks.length)%tracks.length;const t=tracks[i];
  a.src=t.url;pending=null;prevT=0;
  now.textContent=`${pad2(t.order)} // ${t.title.toUpperCase()} — ${t.artist.toUpperCase()}`;
  [...list.children].forEach((e,j)=>e.classList.toggle('on',j===i));
  dl.href=`${t.url}?download=${encodeURIComponent(fileName(t))}`;  // supabase answers ?download with content-disposition: attachment
  zoom=1;loadLoop();apply();
  peaks=new Uint8Array(0);loadPeaks(t,0);
  if(go)start();
}
// a waveform that fails to arrive (a dropped request on a phone, a hiccup at the CDN) is retried
// rather than left blank for the rest of the song
function loadPeaks(t,tries){
  fetch(`peaks/${pad2(t.order)}.bin?v=${VER}`).then(r=>{if(!r.ok)throw r.status;return r.arrayBuffer()})
    .then(b=>{if(tracks[i]===t&&b.byteLength)peaks=new Uint8Array(b);else if(tracks[i]===t)throw 'empty'})
    .catch(()=>{if(tracks[i]===t&&tries<6)setTimeout(()=>tracks[i]===t&&!peaks.length&&loadPeaks(t,tries+1),500*2**tries)});
}
list.innerHTML=tracks.map((t,j)=>`<li><button data-n="${j}"><i>${pad2(t.order)}</i><span>${t.title}<small>${t.artist}</small></span><em>${f(t.duration)}</em></button></li>`).join('');
browse.onclick=()=>{queue.hidden=!queue.hidden;browse.textContent=queue.hidden?'BROWSE SONGS':'CLOSE SONG LIST'};
list.onclick=e=>{const x=e.target.closest('button');if(x)cue(+x.dataset.n,true)};
const toggle=()=>a.paused?start():a.pause();
play.onclick=toggle;
$('#prev').onclick=()=>cue(i-1,true);$('#next').onclick=()=>cue(i+1,true);
a.onplay=()=>play.textContent='PAUSE';a.onpause=()=>play.textContent='PLAY';
a.onended=()=>{
  if(loop.on){seek(region()?loop.a:0);a.play();return}  // looping a region that runs to the very end, or the whole song
  cue(i+1,true);
};

/* --- loop --- */
// a region is A and B; LOOP with no region repeats the whole song. each song remembers
// its own region, so the verse you set up at home is still marked at the client's.
let loop={on:false,a:null,b:null},prevT=0;
const region=()=>loop.a!=null&&loop.b!=null;
function loadLoop(){
  try{loop=JSON.parse(store.get(`si-loop-${tracks[i].order}`))||null}catch(e){loop=null}
  loop=loop||{on:false,a:null,b:null};
}
function saveLoop(){
  if(region()&&loop.a>loop.b)[loop.a,loop.b]=[loop.b,loop.a];
  store.set(`si-loop-${tracks[i].order}`,JSON.stringify(loop));
}
function setPoint(h,t){
  loop[h]=clamp(t,0,D());
  if(region()){if(loop.a>loop.b)[loop.a,loop.b]=[loop.b,loop.a];loop.on=true}
  saveLoop();
}
// the loop is checked every frame: crossing B goes back to A. crossing, not "past", so you
// can still click somewhere after B and listen from there.
function enforce(){
  const t=a.currentTime;
  if(loop.on&&region()&&!a.paused&&pending==null&&prevT<loop.b&&t>=loop.b){a.currentTime=loop.a;prevT=loop.a;return}
  prevT=t;
}
loopBtn.onclick=()=>{loop.on=!loop.on;if(loop.on&&region()&&(T()<loop.a||T()>=loop.b))seek(loop.a);saveLoop()};
/* --- waveform --- */
const PER_SEC=50;   // peaks/NN.bin is one byte per 1/50 s (tools/song-ideas/peaks.py)
let peaks=new Uint8Array(0),zoom=1,viewStart=0;
const viewLen=()=>D()/zoom;
function setZoom(z,center){
  zoom=clamp(z,1,Math.max(1,D()/2));   // closest view is two seconds across
  viewStart=clamp(center-viewLen()/2,0,D()-viewLen());
}
// zoom in on the loop if there is one, otherwise on the playhead
const focus=()=>region()?(loop.a+loop.b)/2:T();
$('#zin').onclick=()=>setZoom(zoom*2,focus());
$('#zout').onclick=()=>setZoom(zoom/2,focus());

function fit(c){
  const r=c.getBoundingClientRect(),d=window.devicePixelRatio||1,w=Math.round(r.width*d),h=Math.round(r.height*d);
  if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  return [c.getContext('2d'),w,h,d];
}
function bars(g,w,h,t0,len,top,col,dim){
  if(!peaks.length)return;
  const mid=(h+top)/2,half=(h-top)/2-1,played=T();
  for(let x=0;x<w;x++){
    const s=t0+len*x/w,e=t0+len*(x+1)/w;
    let m=0;
    for(let b=Math.floor(s*PER_SEC),b1=Math.max(b+1,Math.ceil(e*PER_SEC));b<b1&&b<peaks.length;b++)if(peaks[b]>m)m=peaks[b];
    const y=Math.max(0.5,m/255*half);
    g.fillStyle=s<played?col:dim;g.fillRect(x,mid-y,1,y*2);
  }
}
const TICKS=[0.05,0.1,0.25,0.5,1,2,5,10,15,30,60];
function drawWave(){
  const [g,w,h,d]=fit(wave),len=viewLen(),X=t=>(t-viewStart)/len*w,top=14*d;
  g.fillStyle='#05070c';g.fillRect(0,0,w,h);
  // time ruler
  const step=TICKS.find(s=>len/s<=8)||60;
  g.font=`${10*d}px "Courier New",monospace`;g.textBaseline='top';
  for(let t=Math.ceil(viewStart/step)*step;t<viewStart+len;t+=step){
    const x=Math.round(X(t));
    g.fillStyle='#22304d';g.fillRect(x,top,1,h-top);
    g.fillStyle='#6f7fa6';g.fillText(step<1?fc(t).slice(0,-1):f(t),x+3*d,2*d);
  }
  if(region()){
    g.fillStyle=loop.on?'rgba(255,90,162,.22)':'rgba(160,170,200,.12)';
    g.fillRect(X(loop.a),top,X(loop.b)-X(loop.a),h-top);
  }
  if(peaks.length)bars(g,w,h,viewStart,len,top,'#b8ff73','#3b5583');
  else{g.fillStyle='#3b5583';g.fillRect(0,(h+top)/2-d/2,w,d);g.fillStyle='#6f7fa6';g.font=`${11*d}px "Courier New",monospace`;g.fillText('LOADING WAVEFORM…',8*d,top+6*d)}
  for(const k of ['a','b'])if(loop[k]!=null){   // the flags you drag
    const x=Math.round(X(loop[k]));
    g.fillStyle=loop.on?'#ff5aa2':'#9aa3bd';g.fillRect(x-d,top,2*d,h-top);
    g.fillRect(k==='a'?x-d:x-12*d+d,top,12*d,12*d);
    g.fillStyle='#05070c';g.font=`bold ${10*d}px Arial`;g.fillText(k.toUpperCase(),k==='a'?x+2*d:x-9*d,top+1*d);
  }
  const p=Math.round(X(T()));g.fillStyle='#fff';g.fillRect(p-d/2,top,Math.max(1,d),h-top);
}
function drawOver(){
  const [g,w,h,d]=fit(over),dur=D(),X=t=>t/dur*w;
  g.fillStyle='#05070c';g.fillRect(0,0,w,h);
  if(region()){g.fillStyle=loop.on?'rgba(255,90,162,.35)':'rgba(160,170,200,.2)';g.fillRect(X(loop.a),0,X(loop.b)-X(loop.a),h)}
  bars(g,w,h,0,dur,0,'#7aa84d','#2a3b5c');
  if(zoom>1){g.strokeStyle='#83b8ff';g.lineWidth=d;g.strokeRect(X(viewStart)+d/2,d/2,X(viewLen())-d,h-d)}
  g.fillStyle='#fff';g.fillRect(Math.round(X(T())),0,Math.max(1,d),h);
}

// pointer on the waveform: tap = jump there, drag on empty wave = new loop, drag a flag = move it
const tAt=(c,e,t0,len)=>{const r=c.getBoundingClientRect();return clamp(t0+(e.clientX-r.left)/r.width*len,0,D())};
const flagAt=e=>{
  const r=wave.getBoundingClientRect(),xs=k=>(loop[k]-viewStart)/viewLen()*r.width+r.left;
  return ['b','a'].find(k=>loop[k]!=null&&Math.abs(xs(k)-e.clientX)<12);
};
let drag=null;
wave.onpointerdown=e=>{
  wave.setPointerCapture(e.pointerId);
  const k=flagAt(e),t=tAt(wave,e,viewStart,viewLen());
  drag=k?{kind:k}:{kind:'new',t0:t,x0:e.clientX,moved:false};
};
wave.onpointermove=e=>{
  if(!drag){wave.style.cursor=flagAt(e)?'ew-resize':'crosshair';return}
  const t=tAt(wave,e,viewStart,viewLen());
  if(drag.kind==='new'){
    if(!drag.moved&&Math.abs(e.clientX-drag.x0)<5)return;
    drag.moved=true;loop.a=Math.min(drag.t0,t);loop.b=Math.max(drag.t0,t);loop.on=true;
  }else{
    loop[drag.kind]=t;
    if(region()&&loop.a>loop.b){[loop.a,loop.b]=[loop.b,loop.a];drag.kind=drag.kind==='a'?'b':'a'}
  }
};
wave.onpointerup=e=>{
  if(!drag)return;
  if(drag.kind==='new'&&!drag.moved)seek(drag.t0);
  else{
    if(drag.kind==='new'&&loop.b-loop.a<0.05)loop={on:false,a:null,b:null};   // a twitch, not a loop
    else if(region()&&loop.on&&(T()<loop.a||T()>=loop.b))seek(loop.a);
    saveLoop();
  }
  drag=null;
};
wave.onpointercancel=()=>{drag=null;saveLoop()};
// trackpad: pinch (ctrl+wheel) zooms at the cursor, sideways scroll pans
wave.addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey){
    e.preventDefault();
    const r=wave.getBoundingClientRect(),fx=(e.clientX-r.left)/r.width,t=viewStart+fx*viewLen();
    zoom=clamp(zoom*Math.exp(-e.deltaY*0.01),1,Math.max(1,D()/2));
    viewStart=clamp(t-fx*viewLen(),0,D()-viewLen());
  }else if(Math.abs(e.deltaX)>Math.abs(e.deltaY)&&zoom>1){
    e.preventDefault();
    viewStart=clamp(viewStart+e.deltaX/wave.clientWidth*viewLen(),0,D()-viewLen());
  }
},{passive:false});
// the strip under it is the whole song: drag it to move the zoomed view, or tap to jump when not zoomed
let overDrag=false;
const overAt=e=>{const t=tAt(over,e,0,D());zoom>1?(viewStart=clamp(t-viewLen()/2,0,D()-viewLen())):seek(t)};
over.onpointerdown=e=>{over.setPointerCapture(e.pointerId);overDrag=true;overAt(e)};
over.onpointermove=e=>overDrag&&overAt(e);
over.onpointerup=over.onpointercancel=()=>overDrag=false;

/* --- keys --- */
document.addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||e.target.matches('input:not([type=range])'))return;
  const k=e.key.toLowerCase();
  if(k===' '){e.preventDefault();toggle()}
  else if(k==='i')setPoint('a',T());
  else if(k==='o')setPoint('b',T());
  else if(k==='l')loopBtn.click();
  else if(k==='='||k==='+')$('#zin').click();
  else if(k==='-'||k==='_')$('#zout').click();
});
// a clicked button keeps focus, and then SPACE would press it again instead of playing
document.addEventListener('click',e=>{if(e.detail>0){const b=e.target.closest('button');b&&b.blur()}});

/* --- every frame --- */
function frame(){
  requestAnimationFrame(frame);
  try{tick()}catch(e){console.error(e)}
}
function tick(){
  enforce();
  // while playing zoomed in, the view pages along with the playhead
  if(zoom>1&&!drag&&!overDrag&&!a.paused){const t=T();if(t<viewStart||t>viewStart+viewLen())viewStart=clamp(t-viewLen()*0.1,0,D()-viewLen())}
  if(zoom<=1)viewStart=0;
  clock.textContent=`${f(T())} / ${f(D())}`+(region()?`   ${loop.on?'LOOP':'loop'} ${fc(loop.a)}–${fc(loop.b)}`:loop.on?'   LOOP SONG':'');
  loopBtn.textContent=`LOOP: ${loop.on?'ON':'OFF'}`;loopBtn.classList.toggle('on',loop.on);
  drawWave();drawOver();
}
cue(0,false);apply();frame();
