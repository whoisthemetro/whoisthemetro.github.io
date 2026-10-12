// Small, pre-rendered sprite loops keep the dancers in the scene's pixel palette.
const PALETTES = [
  { cloth:'#2c6d9b', light:'#72b9ce', dark:'#18384c', skin:'#b89270', skinLight:'#e1bc8c', mask:true },
  { cloth:'#923b36', light:'#d17b61', dark:'#442b30', skin:'#977459', skinLight:'#c4a17b', armor:true },
  { cloth:'#b18a2c', light:'#e3c46b', dark:'#534523', skin:'#b98b68', skinLight:'#e0b995', mask:true },
  { cloth:'#397666', light:'#7eb29a', dark:'#213e3b', skin:'#ac8063', skinLight:'#d4ac85', band:true },
];

function shape(ctx, points, color) {
  ctx.fillStyle=color;ctx.beginPath();
  points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath();ctx.fill();
}
function limb(ctx, joints, width, color, highlight) {
  ctx.strokeStyle='#10191c';ctx.lineWidth=width+3;ctx.lineJoin='bevel';ctx.lineCap='square';
  ctx.beginPath();joints.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  ctx.strokeStyle=highlight;ctx.lineWidth=2;
  ctx.beginPath();joints.forEach(([x,y],i)=>i?ctx.lineTo(x-1,y):ctx.moveTo(x-1,y));ctx.stroke();
}

function makeFrame(style, frame) {
  const canvas=document.createElement('canvas');canvas.width=56;canvas.height=88;
  const c=canvas.getContext('2d'), p=PALETTES[style];
  const cycle=frame/8*Math.PI*2;
  const sway=Math.round(Math.sin(cycle)*3), bounce=[0,1,3,1,0,1,3,1][frame];
  const hip=[28+sway,48+bounce];
  const leftFoot=[16+Math.round(Math.sin(cycle)*4),81];
  const rightFoot=[39+Math.round(Math.cos(cycle)*4),81];
  const leftKnee=[17+sway,65+bounce], rightKnee=[37+sway,65-bounce];
  const leftShoulder=[20+sway,27+bounce], rightShoulder=[35+sway,27+bounce];
  const raised=(frame+style*2)%8<4;
  const leftElbow=[9+sway,raised?21:39+bounce];
  const leftHand=[raised?12:5,raised?9+bounce:31+bounce];
  const rightElbow=[45+sway,raised?40+bounce:20];
  const rightHand=[raised?48:43,raised?31+bounce:8+bounce];
  c.imageSmoothingEnabled=false;
  limb(c,[[hip[0]-6,hip[1]],leftKnee,leftFoot],9,'#252c33','#4b5154');
  limb(c,[[hip[0]+6,hip[1]],rightKnee,rightFoot],9,'#30363a','#565d5d');
  limb(c,[leftKnee,[leftFoot[0],78]],7,p.dark,p.cloth);
  limb(c,[rightKnee,[rightFoot[0],78]],7,p.cloth,p.light);
  shape(c,[[leftFoot[0]-6,78],[leftFoot[0]+4,78],[leftFoot[0]+5,84],[leftFoot[0]-9,84]],'#171e22');
  shape(c,[[rightFoot[0]-4,78],[rightFoot[0]+5,78],[rightFoot[0]+9,84],[rightFoot[0]-5,84]],'#171e22');
  c.fillStyle='#66716b';c.fillRect(leftFoot[0]-7,81,9,1);c.fillRect(rightFoot[0]-2,81,10,1);
  limb(c,[leftShoulder,leftElbow,leftHand],6,p.skin,p.skinLight);
  limb(c,[rightShoulder,rightElbow,rightHand],6,p.skin,p.skinLight);
  limb(c,[leftElbow,[(leftElbow[0]+leftHand[0])/2,(leftElbow[1]+leftHand[1])/2]],7,p.dark,p.cloth);
  limb(c,[rightElbow,[(rightElbow[0]+rightHand[0])/2,(rightElbow[1]+rightHand[1])/2]],7,p.dark,p.light);
  const x=28+sway,y=26+bounce;
  shape(c,[[x-10,y-2],[x+10,y-2],[x+9,y+10],[x+6,y+22],[x-7,y+22],[x-10,y+10]],'#121d24');
  shape(c,[[x-9,y],[x-3,y+3],[x-1,y+19],[x-7,y+20]],p.cloth);
  shape(c,[[x+3,y+3],[x+9,y],[x+7,y+20],[x+1,y+19]],p.cloth);
  shape(c,[[x-8,y],[x-6,y+1],[x-4,y+17],[x-6,y+17]],p.light);
  shape(c,[[x+4,y+3],[x+7,y+1],[x+6,y+17],[x+3,y+17]],p.light);
  if(p.armor) {
    shape(c,[[x-11,y],[x,y+4],[x+11,y],[x+9,y+10],[x,y+13],[x-9,y+10]],'#a3927b');
    shape(c,[[x-8,y+3],[x,y+6],[x+8,y+3],[x+6,y+8],[x,y+10],[x-6,y+8]],p.cloth);
  }
  c.fillStyle=p.dark;c.fillRect(x-9,y+19,18,5);
  c.fillStyle=p.light;c.fillRect(x-8,y+20,16,2);
  c.fillStyle='#d6ba7d';c.fillRect(x-2,y+20,4,4);
  shape(c,[[x-3,y+23],[x+4,y+23],[x+7+sway,y+36],[x+sway,y+34]],p.cloth);
  c.fillStyle=p.skin;c.fillRect(x-3,y-7,6,8);
  const hy=9+bounce;
  shape(c,[[x-7,hy+3],[x-5,hy],[x+5,hy],[x+8,hy+4],[x+7,hy+13],[x+3,hy+17],[x-4,hy+16],[x-7,hy+11]],'#10191f');
  c.fillStyle=p.skin;c.fillRect(x-5,hy+5,11,9);
  c.fillStyle=p.skinLight;c.fillRect(x-4,hy+5,8,3);
  c.fillStyle='#222029';c.fillRect(x-4,hy+7,3,1);c.fillRect(x+2,hy+7,3,1);
  if(p.mask) {
    c.fillStyle=p.cloth;c.fillRect(x-6,hy+9,13,6);
    c.fillStyle=p.light;c.fillRect(x-3,hy+10,7,1);
    c.fillStyle=p.dark;c.fillRect(x-3,hy+13,7,1);
  } else {
    c.fillStyle='#513c34';c.fillRect(x-2,hy+12,5,1);
    c.fillStyle=p.band?p.cloth:'#777b72';c.fillRect(x-7,hy+3,14,3);
    c.fillStyle=p.light;c.fillRect(x-4,hy+3,5,1);
  }
  if(p.band)shape(c,[[x+6,hy+4],[x+13,hy+7],[x+14+sway,hy+14],[x+10,hy+10]],p.cloth);
  // A few hard-edged highlights read like digitized arcade sprites at scale.
  c.fillStyle=p.skinLight;c.fillRect(leftHand[0]-2,leftHand[1]-2,3,3);c.fillRect(rightHand[0]-2,rightHand[1]-2,3,3);
  return canvas;
}

export function createDancers(backCanvas, frontCanvas) {
  const frames=PALETTES.map((_,style)=>Array.from({length:8},(_,frame)=>makeFrame(style,frame)));
  const back=backCanvas.getContext('2d'),front=frontCanvas.getContext('2d');
  function dancer(ctx,x,feet,size,style,phase,t,flip) {
    const sprite=frames[style][(Math.floor(t*7)+phase)%8];
    const h=Math.round(size),w=Math.round(h*56/88),left=Math.round(x-w/2),top=Math.round(feet-h);
    ctx.fillStyle='#080c0b70';ctx.beginPath();ctx.ellipse(x,feet-2,w*.42,Math.max(2,h*.035),0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.imageSmoothingEnabled=false;
    if(flip){ctx.translate(left+w,top);ctx.scale(-1,1);}else ctx.translate(left,top);
    ctx.drawImage(sprite,0,0,w,h);
    ctx.restore();
  }
  return function draw(width,height,t) {
    for(const layer of [backCanvas,frontCanvas])if(layer.width!==width||layer.height!==height){layer.width=width;layer.height=height;}
    back.clearRect(0,0,width,height);front.clearRect(0,0,width,height);
    const narrow=width/height<1;
    back.globalAlpha=.65;
    dancer(back,width*(narrow?.13:.30),height*.79,height*(narrow?.115:.17),1,3,t,false);
    dancer(back,width*(narrow?.87:.70),height*.77,height*(narrow?.105:.15),3,6,t,true);
    back.globalAlpha=1;
    dancer(front,width*(narrow?.22:.17),height*.91,height*(narrow?.17:.29),0,0,t,false);
    dancer(front,width*(narrow?.76:.84),height*.91,height*(narrow?.17:.31),2,4,t,true);
  };
}
