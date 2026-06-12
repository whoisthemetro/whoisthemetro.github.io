/* ============================================================
   THE METRO — where the sun and moon really are
   Compact astronomy math (same approach as the SunCalc library /
   Astronomy on the Personal Computer): good to a fraction of a
   degree, which is plenty for deciding what comes through a window.

   Angles returned in radians. Azimuth is measured from south,
   positive toward the west.
   ============================================================ */

const rad = Math.PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397;   // obliquity of the earth

const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
              + rad * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);   // ecliptic longitude
  const M = rad * (134.963 + 13.064993 * d);   // mean anomaly
  const F = rad * (93.272 + 13.229350 * d);    // mean distance

  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);   // km

  return { ra: rightAscension(l, b), dec: declination(l, b), dist };
}

export function getSunPosition(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { azimuth: azimuth(H, phi, c.dec), altitude: altitude(H, phi, c.dec) };
}

export function getMoonPosition(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  h += rad * 0.017 / Math.tan(h + rad * 10.26 / (h + rad * 5.10));  // refraction
  return { azimuth: azimuth(H, phi, c.dec), altitude: h };
}

// fraction: 0 = new moon, 1 = full
export function getMoonIllumination(date) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;   // km, earth→sun
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) +
    Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  return { fraction: (1 + Math.cos(inc)) / 2 };
}

/* ---------------- the deep sky: 25 bright stars ----------------
   J2000 RA (hours) / Dec (degrees) / visual magnitude / tint.
   Fixed stars don't move on human clocks — only the sidereal time
   spins them around the pole. The last seven are the Big Dipper. */
export const STARS = [
  ["sirius",     6.7525, -16.716, -1.46, "#cfe2ff"],
  ["canopus",    6.3992, -52.696, -0.74, "#fff6e0"],
  ["arcturus",  14.2610,  19.182, -0.05, "#ffd9a0"],
  ["vega",      18.6156,  38.784,  0.03, "#d8e8ff"],
  ["capella",    5.2782,  45.998,  0.08, "#fff2c8"],
  ["rigel",      5.2423,  -8.202,  0.13, "#cfe0ff"],
  ["procyon",    7.6550,   5.225,  0.34, "#fdf6e4"],
  ["betelgeuse", 5.9195,   7.407,  0.42, "#ffb98a"],
  ["altair",    19.8464,   8.868,  0.77, "#eef4ff"],
  ["aldebaran",  4.5987,  16.509,  0.85, "#ffc89a"],
  ["antares",   16.4901, -26.432,  0.96, "#ff9f7a"],
  ["spica",     13.4199, -11.161,  0.97, "#cfe0ff"],
  ["pollux",     7.7553,  28.026,  1.14, "#ffe3b0"],
  ["fomalhaut", 22.9608, -29.622,  1.16, "#e8f0ff"],
  ["deneb",     20.6905,  45.280,  1.25, "#e4eeff"],
  ["regulus",   10.1395,  11.967,  1.40, "#dceaff"],
  ["castor",     7.5767,  31.888,  1.58, "#eaf2ff"],
  ["polaris",    2.5302,  89.264,  1.98, "#fff4d8"],
  ["dubhe",     11.0621,  61.751,  1.79, "#ffe8c0"],
  ["merak",     11.0307,  56.382,  2.37, "#e8f0ff"],
  ["phecda",    11.8972,  53.695,  2.44, "#ecf2ff"],
  ["megrez",    12.2571,  57.033,  3.31, "#eef4ff"],
  ["alioth",    12.9005,  55.960,  1.77, "#eef4ff"],
  ["mizar",     13.3988,  54.925,  2.04, "#eaf2ff"],
  ["alkaid",    13.7923,  49.313,  1.86, "#dceaff"],
];

export function getStarPosition(date, lat, lng, raHours, decDeg) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const ra = raHours * 15 * rad, dec = decDeg * rad;
  const H = siderealTime(d, lw) - ra;
  return { azimuth: azimuth(H, phi, dec), altitude: altitude(H, phi, dec) };
}

/* ---------------- planets: JPL mean Keplerian elements ----------------
   "Approximate positions of the planets" (valid 1800–2050): element +
   rate per Julian century. Solve Kepler, rotate into the ecliptic, take
   the view from Earth. Good to ~arcminutes — far more than a bedroom
   ceiling needs. [a, e, I, L, ϖ, Ω] with rates. */
const PLANET_ELS = [
  ["mercury", [0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749],
    [252.25032350, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081], -0.2, "#e8e0d0"],
  ["venus", [0.72333566, 0.00000390], [0.00677672, -0.00004107], [3.39467605, -0.00078890],
    [181.97909950, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418], -4.2, "#fff4d8"],
  ["mars", [1.52371034, 0.00001847], [0.09339410, 0.00007882], [1.84969142, -0.00813131],
    [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343], 0.8, "#ff9a6a"],
  ["jupiter", [5.20288700, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714],
    [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106], -2.2, "#ffe8c8"],
  ["saturn", [9.53667594, -0.00125060], [0.05386179, -0.00050991], [2.48599187, 0.00193609],
    [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794], 0.6, "#f4e2b8"],
];
const EARTH_ELS = ["earth", [1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668],
  [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0.0, 0.0]];

// heliocentric ecliptic xyz from mean elements at T centuries past J2000
function helioXYZ(el, T) {
  const v = (p) => p[0] + p[1] * T;
  const a = v(el[1]), ec = v(el[2]), I = v(el[3]) * rad;
  const L = v(el[4]) * rad, wbar = v(el[5]) * rad, O = v(el[6]) * rad;
  const M = L - wbar, om = wbar - O;
  let E = M + ec * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - ec * Math.sin(E) - M) / (1 - ec * Math.cos(E));
  const xp = a * (Math.cos(E) - ec);
  const yp = a * Math.sqrt(1 - ec * ec) * Math.sin(E);
  const co = Math.cos(om), so = Math.sin(om);
  const cO = Math.cos(O), sO = Math.sin(O);
  const cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    z: so * sI * xp + co * sI * yp,
  };
}

export function getPlanetPositions(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const T = d / 36525;
  const earth = helioXYZ(EARTH_ELS, T);
  const lst = siderealTime(d, lw);
  return PLANET_ELS.map((el) => {
    const p = helioXYZ(el, T);
    const gx = p.x - earth.x, gy = p.y - earth.y, gz = p.z - earth.z;
    const lon = Math.atan2(gy, gx);
    const blat = Math.atan2(gz, Math.hypot(gx, gy));
    const ra = rightAscension(lon, blat), dec = declination(lon, blat);
    const H = lst - ra;
    return {
      name: el[0], mag: el[7], tint: el[8],
      azimuth: azimuth(H, phi, dec), altitude: altitude(H, phi, dec),
    };
  });
}
