import { createDancers } from './dancers.js?v=1';

(() => {
  'use strict';
  const canvas = document.querySelector('#landscape');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scenery = Array.from({length:3},(_,index)=>{
    const layer=document.createElement('canvas');
    layer.className='depth-layer';
    layer.dataset.depth=String([12,24,40][index]);
    layer.setAttribute('aria-hidden','true');
    canvas.parentNode.insertBefore(layer,document.querySelector('main'));
    return layer;
  });
  const particles=document.createElement('canvas');
  particles.className='depth-layer';
  particles.dataset.depth='48';
  particles.setAttribute('aria-hidden','true');
  canvas.parentNode.insertBefore(particles,document.querySelector('main'));
  const sparks=particles.getContext('2d');
  const dancerLayers=[24,44].map((depth,index)=>{
    const layer=document.createElement('canvas');
    layer.className='depth-layer dancers';
    layer.dataset.depth=String(depth);
    layer.setAttribute('aria-hidden','true');
    canvas.parentNode.insertBefore(layer,index===0?scenery[2]:particles);
    return layer;
  });
  const drawDancers=createDancers(...dancerLayers);
  let ground;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const camera={x:0,y:0,targetX:0,targetY:0,time:0};
  const tower=document.querySelector('.tower');
  const depthLayers=[{element:canvas,depth:5},...scenery.map((element,index)=>({element,depth:[12,24,40][index]})),...dancerLayers.map((element,index)=>({element,depth:[24,44][index]})),{element:particles,depth:48}];
  let width, height, sky, radius, angle, grain, clouds, last = 0;

  function hash(x, y) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    return (a + (b - a) * fx) * (1 - fy) + (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy;
  }
  function polygon(c, points, fill) {
    c.fillStyle = fill; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fill();
  }

  function pillar(x, base, tall, wide, lean, seed) {
    const steps = Math.round(tall / (wide * .76));
    const block = tall / steps;
    for (let i = 0; i < steps; i++) {
      const y = base - i * block, shift = lean * i * block;
      const xx = x + shift, nextX = x + lean * (i + 1) * block;
      polygon(ground, [[xx,y],[xx+wide,y],[nextX+wide,y-block],[nextX,y-block]], '#645b4b');
      polygon(ground, [[xx+wide,y],[xx+wide+wide*.34,y-2],[nextX+wide+wide*.34,y-block-2],[nextX+wide,y-block]], '#322f29');
      ground.strokeStyle = '#28271f'; ground.lineWidth = 1;
      ground.beginPath(); ground.moveTo(nextX,y-block); ground.lineTo(nextX+wide,y-block); ground.stroke();
      ground.fillStyle = '#151714';
      ground.fillRect(Math.round(xx+wide*.49+lean*block*.5), Math.round(y-block*.78), Math.max(2,wide*.27), block*.54);
      ground.fillStyle = '#92836a'; ground.fillRect(Math.round(nextX),Math.round(y-block),2,Math.max(2,block*.7));
      if (i === Math.floor(steps * .58)) {
        polygon(ground, [[nextX,y-block+1],[nextX+wide*.55,y-block+3],[nextX+wide*.35,y-block+5],[nextX+wide,y-block+7],[nextX+wide,y-block+9],[nextX+wide*.24,y-block+6]], '#1c1b17');
      }
      for (let j = 0; j < wide * block / 2; j++) {
        const nx = hash(j + seed, i * 13), ny = hash(j + 87, i + seed);
        ground.fillStyle = j % 2 ? '#b3a08720' : '#090c092c';
        ground.fillRect(Math.round(xx + nx * wide + lean * ny * block),Math.round(y - ny * block),1,1);
      }
    }
    polygon(ground, [[x+lean*tall,base-tall],[x+lean*tall+wide*.4,base-tall-3],[x+lean*tall+wide*1.34,base-tall-2],[x+lean*tall+wide,base-tall]], '#827761');
    polygon(ground, [[x+lean*tall+wide*.25,base-tall],[x+lean*tall+wide*.4,base-tall-5],[x+lean*tall+wide*.55,base-tall-2],[x+lean*tall+wide*.8,base-tall-3],[x+lean*tall+wide*.92,base-tall+1]], '#69604e');
  }

  function buildScenery() {
    scenery.forEach(layer=>{layer.width=width;layer.height=height;});
    particles.width=width;particles.height=height;
    const horizon = height * .76;
    for (let layer = 0; layer < 3; layer++) {
      ground=scenery[layer].getContext('2d');
      const ridge = [[0,height]];
      for (let x = 0; x <= width + 4; x += 4) {
        const peak = noise(x / (width * .14) + layer * 9, layer + 3);
        ridge.push([x, horizon + layer * height * .07 - peak * height * .19]);
      }
      ridge.push([width,height]);
      ground.save(); polygon(ground,ridge,['#32291e','#342b20','#30271e'][layer]); ground.clip();
      for (let y = Math.floor(horizon - height * .19); y < height; y++) {
        for (let x = 0; x < width; x++) {
          const n = hash(x + layer * 700, y), shade = Math.floor(20 + n * 37 + noise(x / 11,y / 8) * 21);
          ground.fillStyle = `rgb(${shade},${Math.floor(shade*.79)},${Math.floor(shade*.57)})`;
          ground.fillRect(x,y,1,1);
        }
      }
      ground.restore();
    }
    ground=scenery[1].getContext('2d');
    pillar(width*.245,height*.86,height*.15,width*.016,-.20,38);
    pillar(width*.755,height*.89,height*.29,width*.030,.16,59);
    ground=scenery[2].getContext('2d');
    pillar(width*.075,height*.90,height*.23,width*.023,-.025,12);
    pillar(width*.90,height*.94,height*.39,width*.037,-.055,83);
    // Broken masonry at the feet gives the silhouettes a grounded, ruined base.
    for (let i = 0; i < 260; i++) {
      const x = hash(i,17)*width, y = height*(.84+hash(i,45)*.16);
      const s = 1+hash(i,37)*4;
      polygon(ground,[[x,y],[x+s,y-s*.6],[x+s*1.8,y],[x+s,y+s*.6]],i%3 ? '#514536' : '#76664d');
    }
  }

  function resize() {
    const aspect = innerWidth / innerHeight;
    width = aspect < 1 ? 256 : 480;
    height = Math.round(width / aspect);
    canvas.width = width; canvas.height = height;
    sky = ctx.createImageData(width,height);
    const count = width*height;
    radius = new Float32Array(count); angle = new Float32Array(count);
    clouds = new Float32Array(count); grain = new Float32Array(count);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const i=y*width+x;
      const dx=(x-width*.50)/(width*(aspect<1?.88:.51));
      const dy=(y-height*.40)/(height*.36);
      radius[i]=Math.hypot(dx,dy); angle[i]=Math.atan2(dy,dx);
      clouds[i]=noise(x/31,y/31)*.65+noise(x/11,y/11)*.25+noise(x/4,y/4)*.1;
      grain[i]=(hash(x,y)-.5)*.11;
    }
    buildScenery(); render(0);
  }

  function render(t) {
    const data=sky.data;
    for(let i=0;i<radius.length;i++) {
      const r=radius[i], a=angle[i], n=clouds[i];
      const spiral = Math.sin(r*19-a*3+t*.13+n*4);
      const fine = Math.sin(r*39-a*5+t*.09+n*9)*.12;
      const envelope = Math.exp(-r*r*2.05);
      const light = Math.max(0, Math.min(1, envelope*(.64+spiral*.26+fine+(n-.5)*.42)+grain[i]*.35));
      const k=i*4;
      data[k]=Math.floor((24+light*248)/5)*5;
      data[k+1]=Math.floor((5+Math.pow(light,1.8)*175)/5)*5;
      data[k+2]=Math.floor((4+Math.pow(light,2.4)*34)/4)*4;
      data[k+3]=255;
    }
    ctx.putImageData(sky,0,0);
    sparks.clearRect(0,0,width,height);
    // Sparse one-pixel embers move in discrete frames, like palette-era effects.
    for(let i=0;i<27;i++) {
      const life=(t*.012+hash(i,42))%1;
      const x=hash(i,7)*width+Math.sin(t*.12+i*3)*4;
      const y=height*(1-life*.68);
      sparks.fillStyle = i%3 ? '#aa713c' : '#dfaa62';
      sparks.globalAlpha=Math.sin(life*Math.PI)*.7;
      sparks.fillRect(Math.round(x),Math.round(y),1,1);
    }
    sparks.globalAlpha=1;
    drawDancers(width,height,t);
  }
  function moveCamera(now) {
    const dt=Math.min((now-camera.time)/1000,.05);
    camera.time=now;
    const enabled=!reduceMotion.matches&&finePointer.matches;
    const ease=1-Math.exp(-dt*8);
    camera.x=enabled?camera.x+(camera.targetX-camera.x)*ease:0;
    camera.y=enabled?camera.y+(camera.targetY-camera.y)*ease:0;
    const travelX=camera.x*Math.min(1,innerWidth/900);
    const travelY=camera.y*Math.min(1,innerHeight/500);
    for(const {element,depth} of depthLayers) {
      const x=-travelX*depth, y=-travelY*depth*.55;
      element.style.transform=`translate(${x.toFixed(3)}px,${y.toFixed(3)}px) scale(1.12)`;
    }
    tower.style.transform=`translate(${(-travelX*22).toFixed(3)}px,${(-travelY*12).toFixed(3)}px)`;
    tower.style.filter=`drop-shadow(${(9+camera.x*5).toFixed(2)}px ${(10+camera.y*3).toFixed(2)}px 2px #130908a3)`;
  }
  const centerCamera=()=>{camera.targetX=0;camera.targetY=0;};
  addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||!finePointer.matches||reduceMotion.matches)return;
    camera.targetX=Math.max(-1,Math.min(1,event.clientX/innerWidth*2-1));
    camera.targetY=Math.max(-1,Math.min(1,event.clientY/innerHeight*2-1));
  });
  document.documentElement.addEventListener('pointerleave',centerCamera);
  addEventListener('blur',centerCamera);
  document.addEventListener('visibilitychange',centerCamera);
  finePointer.addEventListener('change',centerCamera);
  function frame(now) {
    if(!document.hidden)moveCamera(now);
    if(!document.hidden && !reduceMotion.matches && now-last>83) { render(now/1000); last=now; }
    requestAnimationFrame(frame);
  }

  function stoneTexture() {
    const tile=document.createElement('canvas'); tile.width=119;tile.height=43;
    const c=tile.getContext('2d'), pixels=c.createImageData(119,43);
    for(let y=0;y<43;y++) for(let x=0;x<119;x++) {
      const n=hash(x,y), grain=22+n*53+noise(x/7,y/7)*28, k=(y*119+x)*4;
      pixels.data[k]=grain*.93; pixels.data[k+1]=grain; pixels.data[k+2]=grain*.92; pixels.data[k+3]=255;
    }
    c.putImageData(pixels,0,0);
    c.strokeStyle='#1c251c88'; c.beginPath();c.moveTo(16,0);c.lineTo(20,7);c.lineTo(16,10);c.lineTo(23,15);c.stroke();
    document.documentElement.style.setProperty('--stone-texture',`url(${tile.toDataURL()})`);
  }
  function portrait(canvas, type) {
    const c=canvas.getContext('2d');
    const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
    rect(0,0,40,48,'#080d12');
    for(let y=0;y<48;y++) for(let x=0;x<40;x++) {
      const n=hash(x+52,y+93);
      rect(x,y,1,1,`rgb(${12+n*13},${14+n*14},${19+n*20})`);
    }
    if(type==='world') {
      polygon(c,[[0,4],[40,0],[40,48],[0,48]],'#263d48');
      rect(21,5,16,20,'#829494');rect(23,7,12,16,'#263148');
      for(let i=0;i<6;i++)rect(24+i*2,14-hash(i,2)*5,1,9+hash(i,2)*5,'#6e89a7');
      rect(28,7,1,16,'#151d29');rect(23,16,12,1,'#151d29');
      polygon(c,[[0,30],[40,25],[40,48],[0,48]],'#4e4233');
      rect(4,29,28,3,'#9e7450');rect(7,32,2,13,'#221d20');rect(29,30,2,14,'#221d20');
      rect(8,18,14,11,'#0b1016');rect(10,20,10,7,'#557c7e');rect(14,29,3,2,'#b8b1a0');
    } else if(type==='mix'||type==='studio') {
      rect(3,5,34,11,'#151d19');
      for(let i=0;i<10;i++) {const h=3+hash(i,5)*6;rect(5+i*3,14-h,2,h,i>7?'#b2a553':'#568a55');}
      polygon(c,[[3,21],[33,18],[40,44],[0,47]],'#737875');
      for(let col=0;col<6;col++)for(let row=0;row<4;row++) {
        if(type==='studio')rect(5+col*5,24+row*5,3,3,(col+row)%3?'#494d53':'#bb5d39');
        else {rect(5+col*5,23,1,18,'#252c2d');rect(4+col*5,24+hash(col,9)*13,3,2,'#cbc9bb');}
      }
    } else if(type==='portfolio') {
      rect(0,28,40,20,'#20263e');
      for(let i=0;i<8;i++) {const h=4+hash(i,5)*21;rect(i*6,39-h,5,h,'#444567');rect(i*6+1,40-h,1,h-3,'#a08cb2');}
      polygon(c,[[8,17],[20,7],[33,17],[20,25]],'#9e9daf');polygon(c,[[8,17],[20,25],[20,38],[8,29]],'#454b81');polygon(c,[[20,25],[33,17],[33,29],[20,38]],'#7279b1');
    } else if(type==='venue') {
      rect(0,4,8,32,'#602623');rect(32,4,8,32,'#602623');rect(3,4,2,30,'#953b2e');rect(35,4,2,30,'#953b2e');
      polygon(c,[[15,5],[7,34],[29,34],[20,5]],'#736954');
      rect(10,31,22,4,'#928274');rect(8,35,26,3,'#4c3c3e');
      rect(20,18,1,14,'#171f24');rect(18,17,5,2,'#b4bbb8');
      for(let i=0;i<7;i++){rect(i*6,40+(i%2)*2,4,7,'#11171f');rect(i*6+1,37+(i%2)*2,2,3,'#343541');}
    } else {
      rect(0,0,40,48,'#343437');
      for(let i=0;i<5;i++){const x=2+i*8,y=14+(i%2)*6;rect(x,y,5,7,'#bbb3a2');rect(x-1,y+7,7,18,['#574944','#545f58','#664641','#444b58','#5c5444'][i]);rect(x,y+24,2,9,'#171c21');rect(x+4,y+24,2,9,'#171c21');}
    }
    c.globalAlpha=.13;
    for(let y=0;y<48;y+=2)rect(0,y,40,1,'#000');
    c.globalAlpha=1;
  }

  const plates=[...document.querySelectorAll('.stone')];
  const enter=document.querySelector('#enter');
  const musicToggle=document.querySelector('#music-toggle');
  let musicEnabled=true, leaving=false;
  let musicContext=null, musicBuffer=null, musicSource=null, musicLoad=null;
  function updateMusicButton() {
    const playing=!!musicSource&&musicContext?.state==='running';
    musicToggle.classList.toggle('playing',playing);
    musicToggle.setAttribute('aria-pressed',String(playing));
    musicToggle.setAttribute('aria-label',playing?'Mute music':'Play music');
    musicToggle.title=playing?'Mute music':'Play music';
  }
  function playBuffer() {
    if(!musicEnabled||leaving||document.hidden||musicSource||!musicBuffer||musicContext.state!=='running')return;
    musicSource=musicContext.createBufferSource();
    musicSource.buffer=musicBuffer;
    musicSource.loop=true;
    musicSource.connect(musicContext.destination);
    musicSource.start();
    updateMusicButton();
  }
  function prepareMusicLoop(buffer) {
    // This export has 51 ms of leading MP3 padding. Blend only the loop join;
    // preserve every pause within the longer arrangement.
    const trim=Math.round(.0513*buffer.sampleRate);
    const overlap=Math.round(.005*buffer.sampleRate);
    const length=buffer.length-trim-overlap;
    const loop=musicContext.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);
    for(let channel=0;channel<buffer.numberOfChannels;channel++) {
      const input=buffer.getChannelData(channel), output=loop.getChannelData(channel);
      output.set(input.subarray(trim+overlap));
      for(let i=0;i<overlap;i++) {
        const blend=i/(overlap-1), at=length-overlap+i;
        output[at]=output[at]*(1-blend)+input[trim+i]*blend;
      }
    }
    return loop;
  }
  function startMusic() {
    if(!musicEnabled||leaving||document.hidden)return;
    if(!musicContext) {
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      musicContext=new AudioContext();
      musicContext.addEventListener('statechange',()=>{playBuffer();updateMusicButton();});
    }
    // Resume synchronously from each gesture, even while the file is loading.
    musicContext.resume().then(playBuffer).catch(()=>{});
    if(!musicLoad) {
      musicLoad=fetch('./theme-long.mp3')
        .then(response=>{if(!response.ok)throw new Error('Music unavailable');return response.arrayBuffer();})
        .then(bytes=>musicContext.decodeAudioData(bytes))
        .then(buffer=>{musicBuffer=prepareMusicLoop(buffer);playBuffer();})
        .catch(()=>{musicLoad=null;updateMusicButton();});
    }
    playBuffer();
  }
  function pauseMusic() {
    if(musicSource){musicSource.stop();musicSource.disconnect();musicSource=null;}
    updateMusicButton();
  }
  function stopMusic() {
    leaving=true;
    pauseMusic();
  }
  function travel(url) { stopMusic();location.assign(url); }
  musicToggle.addEventListener('click',()=>{
    if(musicSource){musicEnabled=false;pauseMusic();}
    else {musicEnabled=true;startMusic();}
  });
  const unlockMusic=event=>{
    if(!musicToggle.contains(event.target))startMusic();
  };
  document.addEventListener('pointerup',unlockMusic);
  document.addEventListener('keydown',unlockMusic);
  document.addEventListener('click',event=>{
    if(!event.defaultPrevented&&event.target.closest('a[href]'))stopMusic();
    else if(!musicToggle.contains(event.target))startMusic();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseMusic();else startMusic();});
  addEventListener('pagehide',stopMusic);
  addEventListener('pageshow',()=>{leaving=false;startMusic();});
  startMusic();
  let selected=plates.find(plate=>plate.dataset.art==='world');
  function select(plate) {
    selected=plate;
    plates.forEach(p=>{p.classList.toggle('selected',p===plate);p.setAttribute('aria-pressed',String(p===plate));});
    enter.href=plate.dataset.url;
    const name=plate.querySelector('.name').innerText.replace(/\n/g,' ');
    document.querySelector('#destination-status').textContent=`${name} selected`;
    enter.firstChild.textContent=plate.dataset.art==='world'?'Enter World ':`Enter ${name} `;
  }
  function step(direction) {
    const index=Math.max(0,Math.min(plates.length-1,plates.indexOf(selected)+direction));
    if(plates[index]===selected)return;
    select(plates[index]);
  }
  plates.forEach(plate=>{
    portrait(plate.querySelector('canvas'),plate.dataset.art);
    plate.addEventListener('click',()=>{if(plate===selected)travel(plate.dataset.url);else select(plate);});
    plate.addEventListener('keydown',event=>{
      const directions={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1};
      if(event.key in directions){event.preventDefault();step(directions[event.key]);selected.focus({preventScroll:true});}
    });
  });
  const surface=document.querySelector('main');
  let wheelTotal=0, wheelLast=0, wheelStep=0;
  surface.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    event.preventDefault();
    const now=performance.now();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
    if(now-wheelLast>160||Math.sign(delta)!==Math.sign(wheelTotal))wheelTotal=0;
    wheelLast=now;
    if(now-wheelStep<260)return;
    wheelTotal+=delta;
    if(Math.abs(wheelTotal)>=24){step(Math.sign(wheelTotal));wheelTotal=0;wheelStep=now;}
  },{passive:false});

  let swipe=null, suppressClickUntil=0;
  surface.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch')return;
    if(!event.isPrimary){swipe=null;return;}
    swipe={id:event.pointerId,x:event.clientX,y:event.clientY,lastY:event.clientY,moved:false};
  });
  surface.addEventListener('pointermove',event=>{
    if(!swipe||event.pointerId!==swipe.id)return;
    const dy=event.clientY-swipe.lastY, dx=event.clientX-swipe.x;
    if(Math.abs(dy)<42||(!swipe.moved&&Math.abs(dy)<Math.abs(dx)*1.2))return;
    step(Math.sign(dy));
    swipe.lastY=event.clientY;swipe.moved=true;
    suppressClickUntil=performance.now()+500;
    surface.setPointerCapture(event.pointerId);
  });
  const endSwipe=event=>{
    if(!swipe||event.pointerId!==swipe.id)return;
    if(swipe.moved)suppressClickUntil=performance.now()+500;
    swipe=null;
  };
  surface.addEventListener('pointerup',endSwipe);
  surface.addEventListener('pointercancel',endSwipe);
  surface.addEventListener('click',event=>{
    if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  let resizeTimer;
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,100);});
  reduceMotion.addEventListener('change',()=>{centerCamera();moveCamera(performance.now());render(0);});
  stoneTexture(); resize(); requestAnimationFrame(frame);
})();
