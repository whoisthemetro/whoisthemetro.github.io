// stems: the song in four parts — drums, bass, vocals, other — that you can ride, solo and mute
// right on the player. made by tools/song-ideas/stems.py.
//
// the four parts live in ONE 8-channel FLAC per song, played by the same <audio> element as the
// mp3: STEMS swaps the element's source at the same position, and a ChannelSplitter pulls the file
// apart into four stereo pairs. one element, one clock, so the parts can't drift — four separate
// streams would. and at unity the four sum to the site's mp3 to ~80 dB, so opening the mixer
// doesn't change what you hear until you touch something.
const desk=(()=>{   // not "mixer": <div id="mixer"> already owns that global name
  const NAMES=['DRUMS','BASS','VOCALS','OTHER'];
  const box=$('#mixer'),btn=$('#stemsbtn'),player=$('.player');
  let built=false,on=false,shown=false,loading=false,bus,gains=[],meters=[];
  const fresh=()=>NAMES.map(()=>({db:0,solo:false,mute:false}));
  let state=fresh();
  const info=()=>STEMS_BASE?STEMS[tracks[i].order]:null;
  const EMPTY=-40;   // a part quieter than this (rms dB) is leakage, not a part — shown greyed out

  box.innerHTML=NAMES.map((n,k)=>`<div class="strip" data-k="${k}"><span class="sn">${n}</span>`+
    `<button class="solo" title="solo">S</button><button class="mute" title="mute">M</button>`+
    `<input class="fader" type="range" min="-40" max="6" step="0.5" value="0" title="double-click for unity">`+
    `<b class="sdb">0.0</b><canvas class="sm"></canvas></div>`).join('');
  const strips=[...box.querySelectorAll('.strip')];

  function build(){
    if(built)return;
    graph();
    const sp=ctx.createChannelSplitter(8);srcNode.connect(sp);
    bus=ctx.createGain();bus.gain.value=0;bus.connect(trackGain);
    for(let k=0;k<4;k++){
      const m=ctx.createChannelMerger(2);sp.connect(m,2*k,0);sp.connect(m,2*k+1,1);
      const g=ctx.createGain(),an=ctx.createAnalyser();an.fftSize=512;
      m.connect(g);g.connect(bus);g.connect(an);gains.push(g);meters.push(an);
    }
    built=true;
  }
  // only one route is ever open: the mp3's or the stems'
  function route(){
    if(!built)return;
    const t=ctx.currentTime,s=info();
    mixPath.gain.setTargetAtTime(on?0:1,t,0.004);
    bus.gain.setTargetAtTime(on&&s?s.gain:0,t,0.004);   // gain undoes the headroom the packer left
    levels();
  }
  function levels(){
    const solo=state.some(s=>s.solo);
    state.forEach((s,k)=>{
      const st=strips[k];
      st.querySelector('.solo').classList.toggle('on',s.solo);st.querySelector('.mute').classList.toggle('on',s.mute);
      st.querySelector('.fader').value=s.db;st.querySelector('.sdb').textContent=s.db<=-40?'-∞':(s.db>0?'+':'')+s.db.toFixed(1);
      st.classList.toggle('quiet',s.mute||(solo&&!s.solo));
      if(built)gains[k].gain.setTargetAtTime(s.mute||(solo&&!s.solo)||s.db<=-40?0:db(s.db),ctx.currentTime,0.015);
    });
  }
  // switch the element to the stems file at the same moment in the song
  function enter(){
    const s=info();if(!s||on)return;
    build();
    const t=T(),playing=!a.paused;
    on=true;loading=true;
    a.src=`${STEMS_BASE}${pad2(tracks[i].order)}.flac`;pending=t;prevT=t;
    route();
    if(playing)start();
  }
  a.addEventListener('canplay',()=>{loading=false});
  function show(v){
    shown=v;box.hidden=!v;player.classList.toggle('mixing',v);btn.classList.toggle('on',v);
    if(v)requestAnimationFrame(meter);
  }
  // STEMS is a switch: on swaps to the stems file and opens the mixer; off goes back to the plain
  // stereo mp3 at the same moment, faders home — nothing you soloed or muted lingers unseen
  function exit(){
    if(!on)return;
    const t=T(),playing=!a.paused;
    on=false;loading=false;state=fresh();
    a.src=tracks[i].url;pending=t;prevT=t;
    route();levels();show(false);
    if(playing)start();
  }
  btn.onclick=()=>{if(on)exit();else{enter();show(true)}};

  // the strips
  box.addEventListener('click',e=>{
    const st=e.target.closest('.strip');if(!st)return;const s=state[+st.dataset.k];
    if(e.target.classList.contains('solo'))s.solo=!s.solo;
    else if(e.target.classList.contains('mute'))s.mute=!s.mute;
    else return;
    levels();
  });
  box.addEventListener('input',e=>{if(e.target.classList.contains('fader')){state[+e.target.closest('.strip').dataset.k].db=+e.target.value;levels()}});
  box.addEventListener('dblclick',e=>{if(e.target.classList.contains('fader')){state[+e.target.closest('.strip').dataset.k].db=0;levels()}});

  // a meter per part, same segments as the main one
  const td=new Uint8Array(512),lv=[0,0,0,0];
  function meter(){
    if(!shown)return;requestAnimationFrame(meter);
    strips.forEach((st,k)=>{
      let r=0;
      if(built&&on&&!a.paused){meters[k].getByteTimeDomainData(td);for(let j=0;j<td.length;j++){const v=(td[j]-128)/128;r+=v*v}r=Math.sqrt(r/td.length)}
      const tg=Math.min(1,r*3);lv[k]=tg>lv[k]?tg:lv[k]*0.88+tg*0.12;
      const [g,w,h,d]=fit(st.querySelector('.sm')),N=10,gap=2*d,sw=(w-gap*(N-1))/N,lit=Math.round(lv[k]*N);
      g.clearRect(0,0,w,h);
      for(let n=0;n<N;n++){g.fillStyle=`rgba(${n>=N-1?'255,77,94':n>=N-3?'255,181,71':'127,224,255'},${n<lit?0.95:0.1})`;g.fillRect(n*(sw+gap),0,sw,h)}
    });
  }

  return {
    on:()=>on,loading:()=>on&&loading,
    // a new song: back to its mp3, faders home, and STEMS only where the song has them
    leave(){on=false;loading=false;state=fresh();route();levels();show(false)},
    track(){
      const s=info();btn.hidden=!s;
      strips.forEach((st,k)=>st.classList.toggle('empty',!!s&&s.rms_db[NAMES[k].toLowerCase()]<EMPTY));
    },
  };
})();
desk.track();
