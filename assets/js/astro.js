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
