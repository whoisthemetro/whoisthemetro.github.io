// winamp-style visualizer, milkdrop-ish. the whole trick is FEEDBACK: every frame, the last
// frame is drawn back onto itself a little zoomed, turned and faded, and the music is drawn
// fresh on top. tunnels, spirals and smoke all fall out of that one loop.
// it covers the whole player while it's up; a tap anywhere puts the player back.
// three bands drive it: LOWS kick the zoom and pulse, MIDS spin and fatten the shapes,
// HIGHS race the colour and throw sparks.
const vis=(()=>{
  const box=$('#vis'),cv=$('#viscv'),g=cv.getContext('2d'),label=$('#visname');
  const buf=document.createElement('canvas'),bg=buf.getContext('2d');
  const freq=new Uint8Array(512),wav=new Uint8Array(1024);
  const hasFilter='filter' in g;
  let on=false,big=false,p=0,switched=0,labelAt=0,beat=0,hue=Math.random()*360;
  // each band: its level (0..1, relative to how loud that band has been lately) and a hit envelope
  const band=(from,to)=>({from,to,avg:0.15,lvl:0,hit:0,prev:0});
  // 1024-point fft at 48k is ~47 Hz a bin: lows ~45–280 Hz, mids ~280 Hz–4 kHz, highs 4–15 kHz
  const LO=band(1,6),MID=band(6,85),HI=band(85,320);

  // zoom >1 pulls the old frame toward you (a tunnel); rot spins it; fade is how long trails live;
  // shift is the hue drift per generation, which is where the psychedelic colour comes from
  const PRESETS=[
    {name:'TUNNEL',  zoom:1.05, rot:0.004, fade:0.9,  shift:6, draw:ring},
    {name:'SPIRAL',  zoom:1.025,rot:0.04,  fade:0.94, shift:3, draw:spokes},
    {name:'KALEIDO', zoom:0.985,rot:-0.015,fade:0.92, shift:8, draw:kaleido},
    {name:'RIPPLE',  zoom:1.035,rot:0,     fade:0.88, shift:4, draw:scope},
    {name:'NEBULA',  zoom:1.012,rot:0.012, fade:0.965,shift:2, draw:dots},
    {name:'STARGATE',zoom:1.08, rot:-0.01, fade:0.86, shift:10,draw:bars},
  ];
  const col=(h,l=60,a=1)=>`hsla(${h%360},100%,${l}%,${a})`;

  function size(){
    const r=box.getBoundingClientRect();
    const w=Math.max(160,Math.min(big?1100:720,Math.round(r.width*0.8))),h=Math.max(90,Math.round(w*r.height/r.width));
    if(cv.width!==w||cv.height!==h){cv.width=buf.width=w;cv.height=buf.height=h;g.fillStyle='#000';g.fillRect(0,0,w,h)}
  }
  // what the music looks like right now. while nothing is playing it breathes on its own,
  // so opening it on a paused song still shows something alive
  function listen(t){
    const live=typeof analyser!=='undefined'&&analyser&&!a.paused;
    if(live){analyser.getByteFrequencyData(freq);analyser.getByteTimeDomainData(wav)}
    else for(let k=0;k<wav.length;k++){wav[k]=128+40*Math.sin(k*0.04+t*2)*Math.sin(t*0.7);if(k<freq.length)freq[k]=Math.max(0,90+60*Math.sin(k*0.15-t*3)-k*0.5)}
    for(const B of [LO,MID,HI]){
      let e=0;for(let k=B.from;k<B.to;k++)e+=freq[k];e/=(B.to-B.from)*255;
      B.avg=B.avg*0.985+e*0.015;
      const l=Math.min(1,e/(B.avg*1.5+0.02));
      B.lvl=l>B.lvl?l:B.lvl*0.85+l*0.15;
      B.hit=(e>B.avg*1.22&&e>B.prev&&e>0.08)?1:B.hit*0.86;
      B.prev=e;
    }
    beat=LO.hit;
  }

  function ring(W,H,t){       // the scope bent into a circle
    const M=Math.min(W,H);
    const R=M*0.2*(1+LO.lvl*0.25+beat*0.3),n=256,amp=M*0.12*(0.6+MID.lvl);
    for(const [off,l] of [[0,62],[120,50]]){
      g.beginPath();
      for(let k=0;k<=n;k++){const s=(wav[(k*4)%1024]-128)/128,an=k/n*Math.PI*2+t*0.3,r=R+s*amp+(off?M*0.05:0);g.lineTo(W/2+Math.cos(an)*r,H/2+Math.sin(an)*r)}
      g.strokeStyle=col(hue+off,l);g.lineWidth=M*0.009*(1+MID.lvl);g.stroke();
    }
  }
  function spokes(W,H,t){     // the spectrum as rays from the centre
    const M=Math.min(W,H);
    const n=96;
    for(let k=0;k<n;k++){
      const v=freq[2+k*3]/255,an=k/n*Math.PI*2+t*0.5,r0=M*(0.05+beat*0.05),r1=r0+v*v*M*0.5*(0.7+LO.lvl*0.5);
      g.beginPath();g.moveTo(W/2+Math.cos(an)*r0,H/2+Math.sin(an)*r0);g.lineTo(W/2+Math.cos(an)*r1,H/2+Math.sin(an)*r1);
      g.strokeStyle=col(hue+k*3.75,55+v*20);g.lineWidth=M*0.007*(1+MID.lvl);g.stroke();
    }
  }
  function kaleido(W,H,t){    // one wave, mirrored into six
    const M=Math.min(W,H);
    const seg=6,len=M*0.5;
    g.save();g.translate(W/2,H/2);
    for(let m=0;m<seg*2;m++){
      g.save();g.rotate(Math.floor(m/2)*Math.PI*2/seg+t*0.2);if(m%2)g.scale(1,-1);
      g.beginPath();
      for(let k=0;k<128;k++){const s=(wav[k*8]-128)/128;g.lineTo(k/128*len*(0.8+LO.lvl*0.3),s*M*0.2*(0.5+MID.lvl)+Math.sin(k*0.1+t)*M*0.02)}
      g.strokeStyle=col(hue+m*15,60);g.lineWidth=M*0.006*(1+MID.lvl);g.stroke();g.restore();
    }
    g.restore();
  }
  function scope(W,H,t){      // classic oscilloscope, mirrored top and bottom
    const M=Math.min(W,H);
    for(const flip of [1,-1]){
      g.beginPath();
      for(let k=0;k<256;k++){const s=(wav[k*4]-128)/128;g.lineTo(k/255*W,H/2+flip*(s*M*0.35*(0.5+MID.lvl)+M*(0.04+beat*0.06)*Math.sin(t*1.3)))}
      g.strokeStyle=col(hue+(flip>0?0:180),60);g.lineWidth=M*0.007*(1+MID.lvl);g.stroke();
    }
  }
  function dots(W,H,t){       // the spectrum as a swirl of glowing points
    const M=Math.min(W,H);
    for(let k=0;k<160;k++){
      const v=freq[k*2]/255;if(v<0.15)continue;
      const an=k*2.399+t*(0.3+MID.lvl*0.4),r=(k/160)*M*0.45*(0.6+v)*(1+beat*0.15);   // golden-angle spiral
      g.fillStyle=col(hue+k*2,50+v*30,0.9);g.beginPath();g.arc(W/2+Math.cos(an)*r,H/2+Math.sin(an)*r,M*0.004+v*M*0.018,0,7);g.fill();
    }
  }
  function bars(W,H,t){       // a winamp spectrum, drawn as a square around the centre
    const M=Math.min(W,H);
    const n=48,s=M*(0.16+LO.lvl*0.04+beat*0.08);
    g.save();g.translate(W/2,H/2);g.rotate(t*0.15);
    for(let side=0;side<4;side++){
      g.rotate(Math.PI/2);
      for(let k=0;k<n;k++){const v=freq[2+k*4]/255,x=-s+k/n*2*s;g.fillStyle=col(hue+k*7+side*30,55);g.fillRect(x,-s,2*s/n*0.7,-v*v*M*0.3*(0.6+MID.lvl*0.6))}
    }
    g.restore();
  }

  function sparks(W,H){        // highs: pinpoints of light, more of them the harder the top end hits
    const n=Math.round(HI.hit*HI.lvl*40);if(!n)return;
    const M=Math.min(W,H);
    for(let k=0;k<n;k++){
      const an=Math.random()*Math.PI*2,r=M*(0.1+Math.random()*0.45);
      g.fillStyle=Math.random()<0.5?'rgba(255,255,255,.9)':col(hue+180,75,0.9);
      g.fillRect(W/2+Math.cos(an)*r,H/2+Math.sin(an)*r,M*0.006,M*0.006);
    }
  }
  function frame(now){
    if(!on)return;
    requestAnimationFrame(frame);
    try{
      size();
      const W=cv.width,H=cv.height,t=now/1000,P=PRESETS[p];
      listen(t);
      if(now-switched>24000)next(now);   // wander through the presets on its own
      hue=(hue+0.3+HI.lvl*2.5+HI.hit*4)%360;   // highs drive the colour
      // feedback: copy, then draw it back warped and faded
      bg.globalCompositeOperation='copy';bg.drawImage(cv,0,0);
      g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;
      g.fillStyle='#000';g.fillRect(0,0,W,H);
      g.translate(W/2+Math.sin(t*0.31)*W*0.015,H/2+Math.cos(t*0.23)*H*0.015);
      const z=P.zoom+beat*0.035+LO.lvl*0.01;   // lows kick the zoom; mids spin it
      g.rotate(P.rot*(1+MID.lvl*2.5)+(P.rot>=0?1:-1)*MID.hit*0.01);g.scale(z,z);g.translate(-W/2,-H/2);
      if(hasFilter)g.filter=`hue-rotate(${P.shift}deg) blur(${W>500?1:0.5}px)`;
      g.globalAlpha=P.fade;g.drawImage(buf,0,0);
      if(hasFilter)g.filter='none';
      g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='lighter';
      P.draw(W,H,t);sparks(W,H);
      // the kick, as one flash on the frame it ARRIVES — drawn every frame, it feeds back and floods the screen
      if(LO.hit===1&&LO.lvl>0.75){const M=Math.min(W,H),r=g.createRadialGradient(W/2,H/2,0,W/2,H/2,M*0.5);
        r.addColorStop(0,col(hue+30,60,0.05));r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,W,H)}
      g.globalCompositeOperation='source-over';
      label.style.opacity=now-labelAt<1800?1:0;
    }catch(e){console.error(e)}
  }
  function next(now=performance.now()){p=(p+1)%PRESETS.length;switched=labelAt=now;label.textContent=PRESETS[p].name}
  function show(v){
    on=v;box.hidden=!on;$('#visbtn').classList.toggle('on',on);
    if(on){switched=labelAt=performance.now();label.textContent=PRESETS[p].name;requestAnimationFrame(frame)}
    else full(false);
  }
  // full screen: the real thing where the browser allows it, and a fixed overlay everywhere
  // (iPhone Safari won't fullscreen anything but a <video>)
  function full(v){
    big=v;box.classList.toggle('big',big);document.body.classList.toggle('visbig',big);
    try{if(big&&box.requestFullscreen)box.requestFullscreen().catch(()=>{});else if(!big&&document.fullscreenElement)document.exitFullscreen()}catch(e){}
  }
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&big)full(false)});
  // a tap anywhere on it puts the player back; the two small buttons are the exceptions
  box.onclick=e=>{if(!e.target.closest('button'))show(false)};
  $('#visfull').onclick=e=>{e.stopPropagation();full(!big)};
  $('#visnext').onclick=e=>{e.stopPropagation();next()};
  $('#visbtn').onclick=()=>show(!on);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&big)full(false);else if(e.key.toLowerCase()==='v'&&!e.metaKey&&!e.ctrlKey)show(!on)});
  return {show,full,next,bands:()=>[LO,MID,HI].map(B=>[+B.lvl.toFixed(2),+B.hit.toFixed(2)])};
})();
