// the background: "Star Nest" by Pablo Roman Andrioli (shadertoy, MIT license), run as-is.
// it's 20 volume steps x 17 fold iterations per pixel, so it's drawn SMALL and stretched to
// fill the page — a nebula has no edges to go soft — at ~30 fps, and it stops while the tab
// is hidden or the visualizer has the whole screen.
(()=>{
  const cv=document.getElementById('bg');
  const gl=cv.getContext('webgl',{antialias:false,depth:false,alpha:false,powerPreference:'low-power'});
  if(!gl)return;   // no webgl: the page stays black, which is fine

  const VERT='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG=`precision highp float;
uniform vec3 iResolution;uniform float iTime;const vec4 iMouse=vec4(0.);
// Star Nest by Pablo Roman Andrioli
// License: MIT
#define iterations 17
#define formuparam 0.53
#define volsteps 20
#define stepsize 0.1
#define zoom   0.800
#define tile   0.850
#define speed  0.010
#define brightness 0.0015
#define darkmatter 0.300
#define distfading 0.730
#define saturation 0.850
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 uv=fragCoord.xy/iResolution.xy-.5;
  uv.y*=iResolution.y/iResolution.x;
  vec3 dir=vec3(uv*zoom,1.);
  float time=iTime*speed+.25;
  float a1=.5+iMouse.x/iResolution.x*2.;
  float a2=.8+iMouse.y/iResolution.y*2.;
  mat2 rot1=mat2(cos(a1),sin(a1),-sin(a1),cos(a1));
  mat2 rot2=mat2(cos(a2),sin(a2),-sin(a2),cos(a2));
  dir.xz*=rot1;
  dir.xy*=rot2;
  vec3 from=vec3(1.,.5,0.5);
  from+=vec3(time*2.,time,-2.);
  from.xz*=rot1;
  from.xy*=rot2;
  float s=0.1,fade=1.;
  vec3 v=vec3(0.);
  for(int r=0;r<volsteps;r++){
    vec3 p=from+s*dir*.5;
    p=abs(vec3(tile)-mod(p,vec3(tile*2.)));
    float pa,a=pa=0.;
    for(int i=0;i<iterations;i++){
      p=abs(p)/dot(p,p)-formuparam;
      a+=abs(length(p)-pa);
      pa=length(p);
    }
    float dm=max(0.,darkmatter-a*a*.001);
    a*=a*a;
    if(r>6)fade*=1.-dm;
    v+=fade;
    v+=vec3(s,s*s,s*s*s*s)*a*brightness*fade;
    fade*=distfading;
    s+=stepsize;
  }
  v=mix(vec3(length(v)),v,saturation);
  fragColor=vec4(v*.01,1.);
}
void main(){mainImage(gl_FragColor,gl_FragCoord.xy);}`;

  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw gl.getShaderInfoLog(s);return s};
  const prog=gl.createProgram();
  try{gl.attachShader(prog,sh(gl.VERTEX_SHADER,VERT));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FRAG))}catch(e){console.error(e);return}
  gl.linkProgram(prog);gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);   // one triangle covers the screen
  const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uRes=gl.getUniformLocation(prog,'iResolution'),uTime=gl.getUniformLocation(prog,'iTime');

  // drawing size: a phone gets fewer pixels than a desktop, and neither gets its full screen
  // window.BG_MAXW / BG_TIME let tools/song-ideas/card.html render one sharp still for the link preview
  const touch=matchMedia('(pointer:coarse)').matches,MAXW=window.BG_MAXW||(touch?420:760);
  function size(){
    const w=innerWidth,h=innerHeight,k=Math.min(1,MAXW/w);
    const W=Math.max(1,Math.round(w*k)),H=Math.max(1,Math.round(h*k));
    if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;gl.viewport(0,0,W,H)}
  }
  const t0=performance.now();let last=0;
  function frame(now){
    requestAnimationFrame(frame);
    if(document.hidden||document.body.classList.contains('visbig')||now-last<32)return;
    last=now;size();
    gl.uniform3f(uRes,cv.width,cv.height,1);gl.uniform1f(uTime,window.BG_TIME??(now-t0)/1000);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  requestAnimationFrame(frame);
})();
