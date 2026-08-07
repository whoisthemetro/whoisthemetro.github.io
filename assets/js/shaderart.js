/* ============================================================
   THE METRO — the shader gallery

   Fragment sources for the acoustic-slab art pieces. Each entry is a
   Shadertoy-style shader (mainImage(out vec4, in vec2)) that world.js
   wraps with a tiny prelude: vUv stands in for gl_FragCoord so every
   piece renders in the slab's own aspect, iResolution mirrors the
   slab's real proportions, iMouse is pinned to zero, and iTime rides
   the room clock.

   Per-shader adaptations are commented inline. Two pieces are
   CC BY-NC-SA (Protean Clouds, The Universe Within) — headers kept,
   room is a personal art space. glsl3: true marks the ones needing
   ES 3.0 (array constructors / dynamic indexing).
   ============================================================ */

// ---- 1: curved hex tunnel with a plasma orb (as provided) --------------
const TUNNEL_ORB = /* glsl */ `
// Curved Tunnel raymarching
//
// THIS CODE IS NOT OPTIMIZED AT ALL
// IT's MORE OF A PROOF OF CONCEPT, IT MAY LAG FULLSCREEN
//

#define SPEED        14.0
#define LEAD         15.0
#define LOOK_AHEAD   2.0
#define FOV          1.3
#define ROLL_FREQ    0.15
#define ROLL_AMP     0.4

#define MAX_STEPS    64
#define MAX_DIST     60.0
#define SURF_EPS     0.001
#define STEP_RELAX   0.6
#define NORMAL_EPS   0.0015

#define TUNNEL_R     2.6
#define HEX_N        5.0
#define HEX_R        0.30
#define EDGE_W       0.01
#define DISP         0.02
#define FOG          0.06
#define VIGNETTE     0.25

#define SPHERE_R     0.6
#define SPHERE_WOB   0.12

#define ENERGY_REACH 0.7
#define ENERGY_FREQ  4.0
#define ENERGY_SPEED 1.5
#define ENERGY_STR   0.3

#define ATTEN_K      0.78
#define KEY_LIGHT    9.0
#define AMBIENT      0.5
#define SHADOW_STEPS 12
#define SHADOW_SOFT  10.0

#define BLOOM_STR    0.010
#define BLOOM_TIGHT  18.0
#define BLOOM_MUL    0.6

#define EMBER_DARK   vec3(0.06, 0.020, 0.006)
#define ORANGE       vec3(1.00, 0.40, 0.09)
#define HOT          vec3(1.00, 0.72, 0.32)
#define VIOLET_DK    vec3(0.020, 0.008, 0.045)
#define VIOLET       vec3(0.42, 0.16, 0.95)
#define VIOLET_HOT   vec3(0.72, 0.45, 1.00)

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
            mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
            mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
        f.z);
}

float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

vec2 pathOffset(float z) {
    return vec2(
        sin(z * 0.20) * 1.8 + cos(z * 0.09) * 1.2,
        cos(z * 0.15) * 1.3 + sin(z * 0.07) * 0.9
    );
}

vec3 spherePos() {
    float ts = iTime * SPEED + LEAD;
    return vec3(pathOffset(ts), ts);
}

float sphereSDF(vec3 p) {
    vec3 q = p - spherePos();
    float r = SPHERE_R;
    float bump = fbm(normalize(q) * 2.5 + iTime * 0.7) * SPHERE_WOB;
    return length(q) - r - bump;
}

vec4 hexInfo(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h  = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw)
        ? vec4(h.xy, hC.xy)
        : vec4(h.zw, hC.zw + 0.5);
}

vec2 hexPattern(vec2 uv) {
    vec4 h    = hexInfo(uv);
    vec2 loc  = abs(h.xy);
    vec2 id   = h.zw;
    float b = max(dot(loc, vec2(0.8660254, 0.5)), loc.x);
    float phase = dot(id, vec2(1.0, 0.7)) + hash21(id) * 3.0;
    return vec2(b, phase);
}

vec2 wallUV(vec3 p) {
    vec2 c   = pathOffset(p.z);
    vec2 rel = p.xy - c;
    float ang = atan(rel.y, rel.x);
    float u = (ang / 6.28318 + 0.5) * HEX_N;
    float v = p.z * (HEX_N / 6.28318) * 0.9;
    return vec2(u, v);
}

float mapWall(vec3 p) {
    vec2 c = pathOffset(p.z);
    float d = length(p.xy - c);
    float b = hexPattern(wallUV(p)).x;
    float gap = smoothstep(HEX_R - EDGE_W, HEX_R + EDGE_W, b);
    float r = TUNNEL_R - DISP * gap;
    return r - d;
}

float map(vec3 p) {
    return min(mapWall(p), sphereSDF(p));
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(NORMAL_EPS, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

float softShadow(vec3 ro, vec3 L, float maxt) {
    float res = 1.0, t = 0.05;
    for (int i = 0; i < SHADOW_STEPS; i++) {
        float h = mapWall(ro + L * t);
        if (h < 0.001) return 0.0;
        res = min(res, SHADOW_SOFT * h / t);
        t += clamp(h, 0.02, 0.25);
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    float t = iTime * SPEED;
    vec3  ro = vec3(pathOffset(t), t);

    float ahead = LOOK_AHEAD;
    vec3  target = vec3(pathOffset(t + ahead), t + ahead);

    vec3 fwd = normalize(target - ro);
    vec3 up  = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, fwd));
    up = cross(fwd, right);

    float roll = sin(t * ROLL_FREQ) * ROLL_AMP;
    vec3 rr = right * cos(roll) + up * sin(roll);
    vec3 uu = up * cos(roll) - right * sin(roll);

    vec3 rd = normalize(uv.x * rr + uv.y * uu + FOV * fwd);

    float dist = 0.0, d = 0.0;
    float bloom = 0.0;
    float energy = 0.0;
    bool  hitSphere = false;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dist;
        float wall = mapWall(p);
        float sph  = sphereSDF(p);
        bloom += BLOOM_STR / (1.0 + sph * sph * BLOOM_TIGHT);
        if (sph > 0.0 && sph < ENERGY_REACH) {
            vec3  dir  = normalize(p - spherePos());
            float turb = fbm(dir * ENERGY_FREQ + vec3(0.0, 0.0, iTime * ENERGY_SPEED));
            float fall = 1.0 - sph / ENERGY_REACH;
            energy += turb * turb * fall * fall * ENERGY_STR;
        }
        d = min(wall, sph);
        if (d < SURF_EPS) { hitSphere = sph < wall; break; }
        if (dist > MAX_DIST) break;
        dist += d * STEP_RELAX;
    }

    vec3 p = ro + rd * dist;
    vec3 n = getNormal(p);
    vec3 toCam  = normalize(ro - p);
    vec3 lightP = spherePos();
    vec3 col;

    vec3 emberDark = EMBER_DARK;
    vec3 orange    = ORANGE;
    vec3 hot       = HOT;
    vec3 violetDk  = VIOLET_DK;
    vec3 violet    = VIOLET;
    vec3 violetHot = VIOLET_HOT;

    if (hitSphere) {
        vec3 dir = normalize(p - lightP);
        float f = fbm(dir * 3.0 + iTime * 0.8);
        f += 0.5 * fbm(dir * 6.0 - iTime * 0.5);

        vec3 plasma = mix(emberDark, orange, clamp(f, 0.0, 1.0));
        plasma = mix(plasma, hot, smoothstep(0.6, 1.0, f));

        float fres = pow(1.0 - clamp(dot(n, toCam), 0.0, 1.0), 2.0);
        col = plasma * (1.0 + f) + fres * orange * 0.8;
    } else {
        vec2  hx   = hexPattern(wallUV(p));
        float b    = hx.x;
        float edge = abs(b - HEX_R);
        float line = smoothstep(EDGE_W, 0.0, edge);
        float halo = smoothstep(EDGE_W * 3.0, 0.0, edge);
        float cell = 1.0 - smoothstep(HEX_R - EDGE_W, HEX_R, b);

        vec3  L     = normalize(lightP - p);
        float dl    = length(lightP - p);
        float atten = 1.0 / (1.0 + ATTEN_K * dl * dl);
        float diff  = max(dot(n, L), 0.0);
        float sh    = softShadow(p + n * 0.02, L, dl - 0.1);

        col  = violetDk * AMBIENT;
        col += violet * diff * atten * sh * KEY_LIGHT;

        float lit = atten * sh;
        col  = mix(col, violet * lit * 2.2, line * 0.7);
        col += violet * halo * lit * 0.3;
        col += violetHot * cell * lit * 0.9;
        col += violetHot * line * lit * 1.0;

        col *= exp(-dist * FOG);
    }

    col += bloom * orange * BLOOM_MUL;
    col += energy * mix(orange, hot, 0.6);

    col *= 1.0 - VIGNETTE * dot(uv, uv);
    col  = pow(col, vec3(0.4545));

    fragColor = vec4(col, 1.0);
}
`;

// ---- 3: phantom-mode IFS fractal fly-through (as provided) -------------
const PHANTOM = /* glsl */ `
precision highp float;

mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c,s,-s,c);
}

const float pi = acos(-1.0);
const float pi2 = pi*2.0;

vec2 pmod(vec2 p, float r) {
    float a = atan(p.x, p.y) + pi/r;
    float n = pi2 / r;
    a = floor(a/n)*n;
    return p*rot(-a);
}

float box( vec3 p, vec3 b ) {
    vec3 d = abs(p) - b;
    return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

float ifsBox(vec3 p) {
    for (int i=0; i<5; i++) {
        p = abs(p) - 1.0;
        p.xy *= rot(iTime*0.3);
        p.xz *= rot(iTime*0.1);
    }
    p.xz *= rot(iTime);
    return box(p, vec3(0.4,0.8,0.3));
}

float map(vec3 p, vec3 cPos) {
    vec3 p1 = p;
    p1.x = mod(p1.x-5., 10.) - 5.;
    p1.y = mod(p1.y-5., 10.) - 5.;
    p1.z = mod(p1.z, 16.)-8.;
    p1.xy = pmod(p1.xy, 5.0);
    return ifsBox(p1);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    vec2 p = (fragCoord.xy * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);

    vec3 cPos = vec3(0.0,0.0, -3.0 * iTime);
    vec3 cDir = normalize(vec3(0.0, 0.0, -1.0));
    vec3 cUp  = vec3(sin(iTime), 1.0, 0.0);
    vec3 cSide = cross(cDir, cUp);

    vec3 ray = normalize(cSide * p.x + cUp * p.y + cDir);

    // Phantom Mode https://www.shadertoy.com/view/MtScWW by aiekick
    float acc = 0.0;
    float acc2 = 0.0;
    float t = 0.0;
    for (int i = 0; i < 99; i++) {
        vec3 pos = cPos + ray * t;
        float dist = map(pos, cPos);
        dist = max(abs(dist), 0.02);
        float a = exp(-dist*3.0);
        if (mod(length(pos)+24.0*iTime, 30.0) < 3.0) {
            a *= 2.0;
            acc2 += a;
        }
        acc += a;
        t += dist * 0.5;
    }

    vec3 col = vec3(acc * 0.01, acc * 0.011 + acc2*0.002, acc * 0.012+ acc2*0.005);
    fragColor = vec4(col, 1.0 - t * 0.03);
}
`;

// ---- 4: drifting rectangles over blue plasma (as provided) -------------
const BLUE_RECTS = /* glsl */ `
vec3 bgColor = vec3(0.01, 0.16, 0.42);
vec3 rectColor = vec3(0.01, 0.26, 0.57);

const float noiseIntensity = 2.8;
const float noiseDefinition = 0.6;
const vec2 glowPos = vec2(-2., 0.);

const float total = 60.;
const float minSize = 0.03;
const float maxSize = 0.08-minSize;
const float yDistribution = 0.5;

float random(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float noise( in vec2 p )
{
    p*=noiseIntensity;
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f*f*(3.0-2.0*f);
    return mix( mix( random( i + vec2(0.0,0.0) ),
                     random( i + vec2(1.0,0.0) ), u.x),
                mix( random( i + vec2(0.0,1.0) ),
                     random( i + vec2(1.0,1.0) ), u.x), u.y);
}

float fbm( in vec2 uv )
{
    uv *= 5.0;
    mat2 m = mat2( 1.6,  1.2, -1.2,  1.6 );
    float f  = 0.5000*noise( uv ); uv = m*uv;
    f += 0.2500*noise( uv ); uv = m*uv;
    f += 0.1250*noise( uv ); uv = m*uv;
    f += 0.0625*noise( uv ); uv = m*uv;
    f = 0.5 + 0.5*f;
    return f;
}

vec3 bg(vec2 uv )
{
    float velocity = iTime/1.6;
    float intensity = sin(uv.x*3.+velocity*2.)*1.1+1.5;
    uv.y -= 2.;
    vec2 bp = uv+glowPos;
    uv *= noiseDefinition;

    float rb = fbm(vec2(uv.x*.5-velocity*.03, uv.y))*.1;
    uv += rb;

    float rz = fbm(uv*.9+vec2(velocity*.35, 0.0));
    rz *= dot(bp*intensity,bp)+1.2;

    vec3 col = bgColor/(.1-rz);
    return sqrt(abs(col));
}

float rectangle(vec2 uv, vec2 pos, float width, float height, float blur) {
    pos = (vec2(width, height) + .01)/2. - abs(uv - pos);
    pos = smoothstep(0., blur , pos);
    return pos.x * pos.y;
}

mat2 rotate2d(float _angle){
    return mat2(cos(_angle),-sin(_angle),
                sin(_angle),cos(_angle));
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy * 2. - 1.;
    uv.x *= iResolution.x/iResolution.y;

    vec3 color = bg(uv)*(2.-abs(uv.y*2.));

    float velX = -iTime/8.;
    float velY = iTime/10.;
    for(float i=0.; i<total; i++){
        float index = i/total;
        float rnd = random(vec2(index));
        vec3 pos = vec3(0, 0., 0.);
        pos.x = fract(velX*rnd+index)*4.-2.0;
        pos.y = sin(index*rnd*1000.+velY) * yDistribution;
        pos.z = maxSize*rnd+minSize;
        vec2 uvRot = uv - pos.xy + pos.z/2.;
        uvRot = rotate2d( i+iTime/2. ) * uvRot;
        uvRot += pos.xy+pos.z/2.;
        float rect = rectangle(uvRot, pos.xy, pos.z, pos.z, (maxSize+minSize-pos.z)/2.);
        color += rectColor * rect * pos.z/maxSize;
    }

    fragColor = vec4(color, 1.0);
}
`;

// ---- 6: sine-lattice tunnel (as provided; "Thanks! Shane!") ------------
const SINE_LATTICE = /* glsl */ `
float map(vec3 p) {
    vec3 n = vec3(0, 1, 0);
    float k1 = 1.9;
    float k2 = (sin(p.x * k1) + sin(p.z * k1)) * 0.8;
    float k3 = (sin(p.y * k1) + sin(p.z * k1)) * 0.8;
    float w1 = 4.0 - dot(abs(p), normalize(n)) + k2;
    float w2 = 4.0 - dot(abs(p), normalize(n.yzx)) + k3;
    float s1 = length(mod(p.xy + vec2(sin((p.z + p.x) * 2.0) * 0.3, cos((p.z + p.x) * 1.0) * 0.5), 2.0) - 1.0) - 0.2;
    float s2 = length(mod(0.5+p.yz + vec2(sin((p.z + p.x) * 2.0) * 0.3, cos((p.z + p.x) * 1.0) * 0.3), 2.0) - 1.0) - 0.2;
    return min(w1, min(w2, min(s1, s2)));
}

vec2 rot(vec2 p, float a) {
    return vec2(
        p.x * cos(a) - p.y * sin(a),
        p.x * sin(a) + p.y * cos(a));
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    float time = iTime;
    vec2 uv = ( fragCoord.xy / iResolution.xy ) * 2.0 - 1.0;
    uv.x *= iResolution.x /  iResolution.y;
    vec3 dir = normalize(vec3(uv, 1.0));
    dir.xz = rot(dir.xz, time * 0.23);dir = dir.yzx;
    dir.xz = rot(dir.xz, time * 0.2);dir = dir.yzx;
    vec3 pos = vec3(0, 0, time);
    vec3 col = vec3(0.0);
    float t = 0.0;
    float tt = 0.0;
    for(int i = 0 ; i < 100; i++) {
        tt = map(pos + dir * t);
        if(tt < 0.001) break;
        t += tt * 0.45;
    }
    vec3 ip = pos + dir * t;
    col = vec3(t * 0.1);
    col = sqrt(col);
    fragColor = vec4(0.05*t+abs(dir) * col + max(0.0, map(ip - 0.1) - tt), 1.0); //Thanks! Shane!
    fragColor.a = 1.0 / (t * t * t * t);
}
`;

// ---- 7: MARBLE PROTOCOL (as provided) ----------------------------------
const MARBLE = /* glsl */ `
/* ------------------------------------------------------------------
   MARBLE PROTOCOL
   Black-gold marble, cut by a living data-lattice.
   ------------------------------------------------------------------ */

#define ZOOM          1.2
#define WARP          4.0
#define VEIN_FREQ     1.5
#define VEIN_WIDTH    0.26
#define FINE_DENSITY  2.7
#define FINE_WIDTH    0.08
#define GRID_DENSITY  42.0
#define PULSE_LANES   8.0
#define PULSE_SPEED   0.45
#define DRIFT_SPEED   1.0

float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        v += amp * noise(p);
        p = rot * p * 2.03 + vec2(1.7, 9.2);
        amp *= 0.5;
    }
    return v;
}

float marble(vec2 p, float t, out vec2 q, out vec2 r) {
    q = vec2(fbm(p + vec2(0.0, 0.0)),
             fbm(p + vec2(5.2, 1.3)));
    r = vec2(fbm(p + WARP * q + vec2(1.7, 9.2) + 0.06 * t),
             fbm(p + WARP * q + vec2(8.3, 2.8) + 0.05 * t));
    return fbm(p + WARP * r);
}

float veins(float f, float width, float sharp) {
    float v = abs(sin(f * 6.28318 * VEIN_FREQ));
    return pow(1.0 - smoothstep(0.0, width, v), sharp);
}

void mainImage(out vec4 O, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * DRIFT_SPEED;

    vec2 m = iMouse.z > 0.0
        ? (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y
        : vec2(0.0);
    uv += m * 0.15;

    vec2 p = uv * ZOOM;
    p += vec2(0.02 * t, 0.008 * t);

    vec2 q, r;
    float f = marble(p, t, q, r);

    vec3 inkBlack   = vec3(0.024, 0.027, 0.038);
    vec3 deepGreen  = vec3(0.045, 0.085, 0.082);
    vec3 slateBlue  = vec3(0.070, 0.085, 0.125);
    vec3 boneWhite  = vec3(0.82, 0.79, 0.72);
    vec3 gold       = vec3(0.95, 0.72, 0.32);
    vec3 coldCyan   = vec3(0.45, 0.85, 0.90);

    vec3 col = inkBlack;
    col = mix(col, deepGreen, smoothstep(0.2, 0.7, length(q)));
    col = mix(col, slateBlue, smoothstep(0.3, 0.9, r.y) * 0.6);

    float depth = smoothstep(0.15, 0.85, f);
    col = mix(col, col * 1.8 + 0.03, depth * 0.35);

    float vMain = veins(f, VEIN_WIDTH, 3.0);
    float vFine = veins(f * FINE_DENSITY + q.x, FINE_WIDTH, 4.0);

    col = mix(col, boneWhite, vMain * 0.55);
    col = mix(col, boneWhite * 0.7, vFine * 0.25);

    float lane = f * PULSE_LANES + r.x * 3.0;
    float pulse = fract(lane - t * PULSE_SPEED);
    pulse = smoothstep(0.0, 0.08, pulse) * smoothstep(0.25, 0.08, pulse);
    float carrier = vMain + vFine * 0.6;
    vec3 pulseCol = mix(gold, coldCyan, 0.5 + 0.5 * sin(f * 9.0 + t * 0.3));
    col += pulseCol * pulse * carrier * 1.6;

    float seam = veins(r.x + r.y, 0.10, 5.0);
    col += gold * seam * 0.35 * (0.6 + 0.4 * sin(t * 0.7 + f * 12.0));

    vec2 g = fragCoord / iResolution.y * GRID_DENSITY;
    vec2 cell = floor(g);
    float tick = step(0.965, hash(cell + floor(t * 0.5)));
    float gridLine = max(
        smoothstep(0.035, 0.0, abs(fract(g.x) - 0.5) - 0.465),
        smoothstep(0.035, 0.0, abs(fract(g.y) - 0.5) - 0.465));
    float etch = gridLine * 0.04 + tick * 0.10;
    col += coldCyan * etch * smoothstep(0.55, 0.85, f);

    float scan = smoothstep(0.012, 0.0, abs(fract(uv.y * 0.35 - t * 0.02) - 0.5) - 0.488);
    col += coldCyan * scan * 0.05;

    col *= 0.85 + 0.35 * smoothstep(-0.8, 0.9, -uv.y + f * 0.4);
    float vig = 1.0 - 0.45 * dot(uv, uv);
    col *= vig;
    col += (hash(fragCoord + fract(t)) - 0.5) * 0.018;
    col = col / (1.0 + col * 0.6);
    col = pow(max(col, 0.0), vec3(0.92));

    O = vec4(col, 1.0);
}
`;

// ---- 8: neon squiggle city (code-golf). adapted: R() macro became a
// function (mat2-from-vec4 isn't ES 1.00), tanh polyfilled, and the
// uninitialized accumulators (i, s, d, ref, lights) get explicit zeros —
// GLSL leaves them undefined, Shadertoy just happened to hand out zeros.
const NEON_CITY = /* glsl */ `
#define T (sin(iTime*.6)*16.+iTime*1e2)
#define P(z) (vec3(cos((z)*.011)*16.+cos((z) * .012)*24., cos((z)*.01)*4., (z)))
#define N normalize

mat2 R(float a) {
    vec4 v = cos(a + vec4(0, 33, 11, 0));
    return mat2(v.x, v.y, v.z, v.w);
}

vec4 tanh4(vec4 x) {
    vec4 e = exp(2.0 * clamp(x, -20.0, 20.0));
    return (e - 1.0) / (e + 1.0);
}

float boxen(vec3 p) {
    p = abs(fract(p/2e1)*2e1 - 1e1) - 1.;
    return min(p.x, min(p.y, p.z));
}

vec4 lights = vec4(0.);
float map(vec3 p) {
    vec3 q = P(p.z);
    float m, g = q.y-p.y + 6.;

    m = boxen(p);

    p.xy -= q.xy;

    float red,blue;
    float e = min(red=length(p.xy -  sin(p.z / 12. + vec2(0, 1.3))*12.) - 1.,
                  blue=length(p.xy -  sin(p.z / 16. + vec2(0, .7))*16.) - 2.);

    lights += vec4(1e1,2,1,0)/(.1+abs(red));
    lights += vec4(1,2,1e1,0)/(.1+abs(blue)/1e1);

    p = abs(p);

    float tex = abs(length(sin(p*cos(p.yzx/3e1)*4.)/(p*4.)));
    float tun = min(32.-p.x - p.y, 24.-p.y);

    float d = max(min(m, g), tun)-tex;
    return min(e, d);
}

void mainImage(out vec4 o, in vec2 u) {
    float i = 0., s = 0., d = 0.;
    vec3  r = iResolution;

    u = (u-r.xy/2.)/r.y;

    u.y -=.2;
    o = vec4(0);
    vec3  p = P(T),ro=p,
          Z = N( P(T+2.) - p),
          X = N(vec3(Z.z,0,-Z)),
          D = N(vec3(R(sin(T*.005)*.4)*u, 1)
             * mat3(-X, cross(X, Z), Z));

    for(; i++ < 1e2;)
        p = ro + D * d,
        d += s = map(p)*.8,
        o += lights + 1./max(s, .01);

    const float h = 0.005;
    const vec2 k = vec2(1,-1);
    vec3 n = N(k.xyy*map( p + k.xyy*h ) +
               k.yyx*map( p + k.yyx*h ) +
               k.yxy*map( p + k.yxy*h ) +
               k.xxx*map( p + k.xxx*h ) );

    o *= (.1 + max(dot(n, -D), 0.));

    vec4 ref = vec4(0.);
    lights = vec4(0);
    for(p += n*.05, D = reflect(D, n), s=0., i=0.; i++<5e1; )
        p += D*s,
        s = map(p)*.8,
        ref +=  lights + 1./max(s, .01);

    o += o*ref;
    o = tanh4(o / 1e9 * exp(vec4(1e1,2,1,0)*d/5e2));
}
`;

// ---- 9: Protean clouds by nimitz (CC BY-NC-SA 3.0 — header kept).
// adapted: gl_FragCoord swapped for fragCoord so the panel's UVs drive it.
const PROTEAN_CLOUDS = /* glsl */ `
// Protean clouds by nimitz (twitter: @stormoid)
// https://www.shadertoy.com/view/3l23Rh
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License
// Contact the author for other licensing options

mat2 rot(in float a){float c = cos(a), s = sin(a);return mat2(c,s,-s,c);}
const mat3 m3 = mat3(0.33338, 0.56034, -0.71817, -0.87887, 0.32651, -0.15323, 0.15162, 0.69596, 0.61339)*1.93;
float mag2(vec2 p){return dot(p,p);}
float linstep(in float mn, in float mx, in float x){ return clamp((x - mn)/(mx - mn), 0., 1.); }
float prm1 = 0.;
vec2 bsMo = vec2(0);

vec2 disp(float t){ return vec2(sin(t*0.22)*1., cos(t*0.175)*1.)*2.; }

vec2 map(vec3 p)
{
    vec3 p2 = p;
    p2.xy -= disp(p.z).xy;
    p.xy *= rot(sin(p.z+iTime)*(0.1 + prm1*0.05) + iTime*0.09);
    float cl = mag2(p2.xy);
    float d = 0.;
    p *= .61;
    float z = 1.;
    float trk = 1.;
    float dspAmp = 0.1 + prm1*0.2;
    for(int i = 0; i < 5; i++)
    {
        p += sin(p.zxy*0.75*trk + iTime*trk*.8)*dspAmp;
        d -= abs(dot(cos(p), sin(p.yzx))*z);
        z *= 0.57;
        trk *= 1.4;
        p = p*m3;
    }
    d = abs(d + prm1*3.)+ prm1*.3 - 2.5 + bsMo.y;
    return vec2(d + cl*.2 + 0.25, cl);
}

vec4 render( in vec3 ro, in vec3 rd, float time )
{
    vec4 rez = vec4(0);
    const float ldst = 8.;
    vec3 lpos = vec3(disp(time + ldst)*0.5, time + ldst);
    float t = 1.5;
    float fogT = 0.;
    for(int i=0; i<130; i++)
    {
        if(rez.a > 0.99)break;

        vec3 pos = ro + t*rd;
        vec2 mpv = map(pos);
        float den = clamp(mpv.x-0.3,0.,1.)*1.12;
        float dn = clamp((mpv.x + 2.),0.,3.);

        vec4 col = vec4(0);
        if (mpv.x > 0.6)
        {
            col = vec4(sin(vec3(5.,0.4,0.2) + mpv.y*0.1 +sin(pos.z*0.4)*0.5 + 1.8)*0.5 + 0.5,0.08);
            col *= den*den*den;
            col.rgb *= linstep(4.,-2.5, mpv.x)*2.3;
            float dif =  clamp((den - map(pos+.8).x)/9., 0.001, 1. );
            dif += clamp((den - map(pos+.35).x)/2.5, 0.001, 1. );
            col.xyz *= den*(vec3(0.005,.045,.075) + 1.5*vec3(0.033,0.07,0.03)*dif);
        }

        float fogC = exp(t*0.2 - 2.2);
        col.rgba += vec4(0.06,0.11,0.11, 0.1)*clamp(fogC-fogT, 0., 1.);
        fogT = fogC;
        rez = rez + col*(1. - rez.a);
        t += clamp(0.5 - dn*dn*.05, 0.09, 0.3);
    }
    return clamp(rez, 0.0, 1.0);
}

float getsat(vec3 c)
{
    float mi = min(min(c.x, c.y), c.z);
    float ma = max(max(c.x, c.y), c.z);
    return (ma - mi)/(ma+ 1e-7);
}

vec3 iLerp(in vec3 a, in vec3 b, in float x)
{
    vec3 ic = mix(a, b, x) + vec3(1e-6,0.,0.);
    float sd = abs(getsat(ic) - mix(getsat(a), getsat(b), x));
    vec3 dir = normalize(vec3(2.*ic.x - ic.y - ic.z, 2.*ic.y - ic.x - ic.z, 2.*ic.z - ic.y - ic.x));
    float lgt = dot(vec3(1.0), ic);
    float ff = dot(dir, normalize(ic));
    ic += 1.5*dir*sd*ff*lgt;
    return clamp(ic,0.,1.);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 q = fragCoord.xy/iResolution.xy;
    vec2 p = (fragCoord.xy - 0.5*iResolution.xy)/iResolution.y;
    bsMo = (iMouse.xy - 0.5*iResolution.xy)/iResolution.y;

    float time = iTime*3.;
    vec3 ro = vec3(0,0,time);

    ro += vec3(sin(iTime)*0.5,sin(iTime*1.)*0.,0);

    float dspAmp = .85;
    ro.xy += disp(ro.z)*dspAmp;
    float tgtDst = 3.5;

    vec3 target = normalize(ro - vec3(disp(time + tgtDst)*dspAmp, time + tgtDst));
    ro.x -= bsMo.x*2.;
    vec3 rightdir = normalize(cross(target, vec3(0,1,0)));
    vec3 updir = normalize(cross(rightdir, target));
    rightdir = normalize(cross(updir, target));
    vec3 rd=normalize((p.x*rightdir + p.y*updir)*1. - target);
    rd.xy *= rot(-disp(time + 3.5).x*0.2 + bsMo.x);
    prm1 = smoothstep(-0.4, 0.4,sin(iTime*0.3));
    vec4 scn = render(ro, rd, time);

    vec3 col = scn.rgb;
    col = iLerp(col.bgr, col.rgb, clamp(1.-prm1,0.05,1.));

    col = pow(col, vec3(.55,0.65,0.6))*vec3(1.,.97,.9);

    col *= pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.12)*0.7+0.3; //Vign

    fragColor = vec4( col, 1.0 );
}
`;

// ---- 10: star tunnel. adapted: this one came from a framework with
// turn-based trig (_sin(1) = one full revolution — the hexagon math only
// works in turns), so those wrappers are recreated here; needs ES 3.0
// for the array constructor.
const STAR_TUNNEL = /* glsl */ `
#define _sin(x) sin(6.28318530718 * (x))
#define _cos(x) cos(6.28318530718 * (x))
#define _atan(y, x) (atan(y, x) / 6.28318530718)
mat2 rotate(float a) {
  float c = cos(6.28318530718 * a), s = sin(6.28318530718 * a);
  return mat2(c, -s, s, c);
}

const vec3 background = vec3(0.25, 0.00, 0.20);
const vec3 colorA = vec3(0.04, 0.58, 0.59);
const vec3 colorB = vec3(1.00, 0.29, 0.29);
const vec3 colorC = vec3(0.96, 0.64, 0.35);
const vec3 colors[3] = vec3[3](colorA, colorB, colorC);
const float brightness = 1.5;
const float falloff = 0.75;
const float cutoff = 0.01;
const float glow = 0.01;
const int steps = 50;
const int copies = 6;
const float sides = 6.0;
const float turning = 1.0;
const float radius = 0.2;
const float offset = 0.5;
const vec3 spacing = vec3(4.0 * offset * 0.866, 3.0 * offset, 1.0);
const float height = 0.05;
const float speed = 1.0;
const float fall = 0.5;

float revolve(float time)
{
  return 0.05 * time;
}
float vertigo(float time)
{
  return 0.5 * pow(_sin(0.01 * time), 27.0);
}
float spin(float time, float deep)
{
  return -smoothstep(0.2, 0.8, mod(0.25 * time + 0.25 * deep, 1.0));
}

float star(vec2 point, float sides, float radius, float turning)
{
  float sideAngle = 0.5 / sides;
  float spikeAngle = 0.25 - 0.5 * (turning - 1.0) / sides;
  float pointAngle = _atan(point.x, point.y);
  vec2 side = vec2(_cos(sideAngle), _sin(sideAngle));
  vec2 spike = vec2(_cos(spikeAngle), _sin(spikeAngle));
  float foldedAngle = mod(pointAngle, 2.0 * sideAngle) - sideAngle;
  point = length(point) * vec2(_cos(foldedAngle), abs(_sin(foldedAngle)));
  point -= radius * side;
  point += spike * clamp(-dot(point, spike), 0.0, radius * side.y / spike.y);
  return length(point) * sign(point.x);
}

float extrude(float distance, float z, float height)
{
  vec2 hypot = vec2(distance, abs(z) - height);
  return min(max(hypot.x, hypot.y), 0.0) + length(max(hypot, 0.0));
}

vec3 repeat(vec3 point, vec3 spacing)
{
  return point - spacing * round(point / spacing);
}

vec3 colorLoop(float percent)
{
  const int count = colors.length();
  percent = mod(percent, 1.0);
  float blend = mod(percent * float(count), 1.0);
  int aIndex = int(floor(percent * float(count)));
  int bIndex = (aIndex + 1) % count;
  vec3 aColor = colors[aIndex];
  vec3 bColor = colors[bIndex];
  return mix(aColor, bColor, blend);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
  float time = iTime * speed;

  vec2 uv = (fragCoord.xy * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);
  vec3 ray = normalize(vec3(uv, 1.0));

  ray.xy *= rotate(revolve(time));
  ray.yz *= rotate(vertigo(time));

  vec3 color = background;

  for (int copy = 0; copy < copies; copy++)
  {
    float copyPercent = float(copy) / float(copies);
    vec3 start = vec3(_sin(copyPercent) * offset, _cos(copyPercent) * offset, fall * time);
    vec3 hue = colorLoop(copyPercent + 0.75 * length(ray.xy));
    float totalDistance = 0.0;
    for (int step = 0; step < steps; step++)
    {
      float stepPercent = float(step) / float(steps);
      vec3 position = start + ray * totalDistance;
      float level = round(position.z / spacing.z) * spacing.z;
      position = repeat(position, spacing);
      float angle = copyPercent;
      angle += spin(time, level);
      position.xy *= rotate(angle);
      float distance = star(position.xy, sides, radius, turning);
      distance = extrude(distance, position.z, height);
      float distanceBrightness = exp(-distance / glow);
      float falloffBrightness = exp(-falloff * totalDistance);
      if (falloffBrightness < cutoff)
        break;
      float totalBrightness = brightness * distanceBrightness * falloffBrightness;
      vec3 newColor = vec3(totalBrightness);
      newColor *= hue;
      color += newColor / float(steps);
      color = max(color, newColor);
      totalDistance += distance * 0.5;
    }
  }

  fragColor = vec4(color, 1.0);
}
`;

// ---- 11: Balatro swirl (Original by localthunk, playbalatro.com) -------
const BALATRO = /* glsl */ `
// Original by localthunk (https://www.playbalatro.com)

#define SPIN_ROTATION -2.0
#define SPIN_SPEED 7.0
#define OFFSET vec2(0.0)
#define COLOUR_1 vec4(0.871, 0.267, 0.231, 1.0)
#define COLOUR_2 vec4(0.0, 0.42, 0.706, 1.0)
#define COLOUR_3 vec4(0.086, 0.137, 0.145, 1.0)
#define CONTRAST 3.5
#define LIGTHING 0.4
#define SPIN_AMOUNT 0.25
#define PIXEL_FILTER 745.0
#define SPIN_EASE 1.0
#define PI 3.14159265359
#define IS_ROTATE false

vec4 effect(vec2 screenSize, vec2 screen_coords) {
    float pixel_size = length(screenSize.xy) / PIXEL_FILTER;
    vec2 uv = (floor(screen_coords.xy*(1./pixel_size))*pixel_size - 0.5*screenSize.xy)/length(screenSize.xy) - OFFSET;
    float uv_len = length(uv);

    float speed = (SPIN_ROTATION*SPIN_EASE*0.2);
    if(IS_ROTATE){
       speed = iTime * speed;
    }
    speed += 302.2;
    float new_pixel_angle = atan(uv.y, uv.x) + speed - SPIN_EASE*20.*(1.*SPIN_AMOUNT*uv_len + (1. - 1.*SPIN_AMOUNT));
    vec2 mid = (screenSize.xy/length(screenSize.xy))/2.;
    uv = (vec2((uv_len * cos(new_pixel_angle) + mid.x), (uv_len * sin(new_pixel_angle) + mid.y)) - mid);

    uv *= 30.;
    speed = iTime*(SPIN_SPEED);
    vec2 uv2 = vec2(uv.x+uv.y);

    for(int i=0; i < 5; i++) {
        uv2 += sin(max(uv.x, uv.y)) + uv;
        uv  += 0.5*vec2(cos(5.1123314 + 0.353*uv2.y + speed*0.131121),sin(uv2.x - 0.113*speed));
        uv  -= 1.0*cos(uv.x + uv.y) - 1.0*sin(uv.x*0.711 - uv.y);
    }

    float contrast_mod = (0.25*CONTRAST + 0.5*SPIN_AMOUNT + 1.2);
    float paint_res = min(2., max(0.,length(uv)*(0.035)*contrast_mod));
    float c1p = max(0.,1. - contrast_mod*abs(1.-paint_res));
    float c2p = max(0.,1. - contrast_mod*abs(paint_res));
    float c3p = 1. - min(1., c1p + c2p);
    float light = (LIGTHING - 0.2)*max(c1p*5. - 4., 0.) + LIGTHING*max(c2p*5. - 4., 0.);
    return (0.3/CONTRAST)*COLOUR_1 + (1. - 0.3/CONTRAST)*(COLOUR_1*c1p + COLOUR_2*c2p + vec4(c3p*COLOUR_3.rgb, c3p*COLOUR_1.a)) + light;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord/iResolution.xy;

    fragColor = effect(iResolution.xy, uv * iResolution.xy);
}
`;

// ---- 12: The Universe Within by BigWings (CC BY-NC-SA 3.0 — header
// kept). adapted: the audio texelFetch is stubbed to 0 (no iChannel0 in
// the room) and it runs as ES 3.0 for the dynamically-indexed array.
const UNIVERSE_WITHIN = /* glsl */ `
// The Universe Within - by Martijn Steinrucken aka BigWings 2018
// Email:countfrolic@gmail.com Twitter:@The_ArtOfCode
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

#define S(a, b, t) smoothstep(a, b, t)
#define NUM_LAYERS 4.

float N21(vec2 p) {
    vec3 a = fract(vec3(p.xyx) * vec3(213.897, 653.453, 253.098));
    a += dot(a, a.yzx + 79.76);
    return fract((a.x + a.y) * a.z);
}

vec2 GetPos(vec2 id, vec2 offs, float t) {
    float n = N21(id+offs);
    float n1 = fract(n*10.);
    float n2 = fract(n*100.);
    float a = t+n;
    return offs + vec2(sin(a*n1), cos(a*n2))*.4;
}

float df_line( in vec2 a, in vec2 b, in vec2 p)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa,ba) / dot(ba,ba), 0., 1.);
    return length(pa - ba * h);
}

float line(vec2 a, vec2 b, vec2 uv) {
    float r1 = .04;
    float r2 = .01;

    float d = df_line(a, b, uv);
    float d2 = length(a-b);
    float fade = S(1.5, .5, d2);

    fade += S(.05, .02, abs(d2-.75));
    return S(r1, r2, d)*fade;
}

float NetLayer(vec2 st, float n, float t) {
    vec2 id = floor(st)+n;

    st = fract(st)-.5;

    vec2 p[9];
    int i=0;
    for(float y=-1.; y<=1.; y++) {
        for(float x=-1.; x<=1.; x++) {
            p[i++] = GetPos(id, vec2(x,y), t);
        }
    }

    float m = 0.;
    float sparkle = 0.;

    for(int i=0; i<9; i++) {
        m += line(p[4], p[i], st);

        float d = length(st-p[i]);

        float s = (.005/(d*d));
        s *= S(1., .7, d);
        float pulse = sin((fract(p[i].x)+fract(p[i].y)+t)*5.)*.4+.6;
        pulse = pow(pulse, 20.);

        s *= pulse;
        sparkle += s;
    }

    m += line(p[1], p[3], st);
    m += line(p[1], p[5], st);
    m += line(p[7], p[5], st);
    m += line(p[7], p[3], st);

    float sPhase = (sin(t+n)+sin(t*.1))*.25+.5;
    sPhase += pow(sin(t*.1)*.5+.5, 50.)*5.;
    m += sparkle*sPhase;

    return m;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord-iResolution.xy*.5)/iResolution.y;
    vec2 M = iMouse.xy/iResolution.xy-.5;

    float t = iTime*.1;

    float s = sin(t);
    float c = cos(t);
    mat2 rot = mat2(c, -s, s, c);
    vec2 st = uv*rot;
    M *= rot*2.;

    float m = 0.;
    for(float i=0.; i<1.; i+=1./NUM_LAYERS) {
        float z = fract(t+i);
        float size = mix(15., 1., z);
        float fade = S(0., .6, z)*S(1., .8, z);

        m += fade * NetLayer(st*size-M*z, i, iTime);
    }

    float fft = 0.0;   // audio input isn't wired in the room
    float glow = -uv.y*fft*2.;

    vec3 baseCol = vec3(s, cos(t*.4), -sin(t*.24))*.4+.6;
    vec3 col = baseCol*m;
    col += baseCol*glow;

    col *= 1.-dot(uv,uv);
    t = mod(iTime, 230.);
    col *= S(0., 20., t)*S(224., 200., t);

    fragColor = vec4(col,1);
}
`;

// what world.js consumes: name → { frag, glsl3 }
export const SHADER_ART = {
  tunnelOrb: { frag: TUNNEL_ORB },
  phantom: { frag: PHANTOM },
  blueRects: { frag: BLUE_RECTS },
  sineLattice: { frag: SINE_LATTICE },
  marble: { frag: MARBLE },
  neonCity: { frag: NEON_CITY },
  proteanClouds: { frag: PROTEAN_CLOUDS },
  starTunnel: { frag: STAR_TUNNEL, glsl3: true },
  balatro: { frag: BALATRO },
  universeWithin: { frag: UNIVERSE_WITHIN, glsl3: true },
};
