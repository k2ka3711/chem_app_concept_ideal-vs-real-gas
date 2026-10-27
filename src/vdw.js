// ---- van der Waals (SI) ----
const GAS_R = 8.314;
// a: L^2·bar/mol^2, b: L/mol  (CRC Handbook values)
const GASES = [
  { id: "H2", a: 0.2476, b: 0.02661 },
  { id: "N2", a: 1.370, b: 0.0387 },
  { id: "CH4", a: 2.283, b: 0.04278 },
  { id: "CO2", a: 3.640, b: 0.04267 },
];
function cubicRoots(A, B, C, D) { // A x^3 + B x^2 + C x + D = 0, real roots
  const b = B / A, c = C / A, d = D / A;
  const p = c - b * b / 3, q = 2 * b * b * b / 27 - b * c / 3 + d;
  const disc = q * q / 4 + p * p * p / 27;
  const sh = -b / 3;
  if (disc > 0) {
    const s = Math.sqrt(disc);
    return [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) + sh];
  }
  const r = Math.sqrt(-p / 3), phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r * r * r))));
  return [0, 1, 2].map(k => 2 * r * Math.cos((phi - 2 * Math.PI * k) / 3) + sh).sort((x, y) => x - y);
}
function vdwVolumes(g, T, P) { // molar volumes (m^3/mol) > b
  const a = g.a * 0.1, b = g.b * 1e-3;
  return cubicRoots(P, -(P * b + GAS_R * T), a, -a * b).filter(v => v > b * 1.0000001);
}
function vdwP(g, T, V) { const a = g.a * 0.1, b = g.b * 1e-3; return GAS_R * T / (V - b) - a / (V * V); }
function vdwTc(g) { return 8 * g.a * 0.1 / (27 * GAS_R * g.b * 1e-3); }
// saturation pressure by Maxwell's equal-area rule (T < Tc)
function vdwPsat(g, T) {
  const a = g.a * 0.1, b = g.b * 1e-3;
  // spinodal range from a scan of P(V)
  let pmin = Infinity, pmax = -Infinity, prev = Infinity, rising = false;
  for (let k = 0; k < 4000; k++) {
    const V = b * Math.pow(10, 0.0001 + k * 4 / 4000);
    const P = vdwP(g, T, V);
    if (P > prev && !rising) { pmin = prev; rising = true; }
    if (P < prev && rising) { pmax = prev; break; }
    prev = P;
  }
  if (!isFinite(pmin) || !isFinite(pmax)) return null;
  let lo = Math.max(pmin, 1), hi = pmax;
  for (let it = 0; it < 80; it++) {
    const P = (lo + hi) / 2, v = vdwVolumes(g, T, P);
    if (v.length < 3) { if (P < pmin + 1) lo = P; else hi = P; continue; }
    const Vl = v[0], Vg = v[2];
    const f = GAS_R * T * Math.log((Vg - b) / (Vl - b)) + a * (1 / Vg - 1 / Vl) - P * (Vg - Vl);
    if (f > 0) lo = P; else hi = P;
  }
  return (lo + hi) / 2;
}
// Z–P curve: list of [P(Pa), Z] with a vertical jump at Psat if T < Tc
function vdwCurve(g, T, Pmax, n = 240) {
  const Ps = T < vdwTc(g) ? vdwPsat(g, T) : null;
  const pts = [];
  const zAt = (P, liquid) => { const v = vdwVolumes(g, T, P); const V = liquid ? v[0] : v[v.length - 1]; return P * V / (GAS_R * T); };
  for (let k = 0; k <= n; k++) {
    const P = Math.max(1, Pmax * k / n);
    if (Ps && P > Ps && pts.length && pts[pts.length - 1][0] < Ps) { pts.push([Ps, zAt(Ps * (1 - 1e-9), false)]); pts.push([Ps, zAt(Ps * (1 + 1e-9), true)]); }
    pts.push([P, zAt(P, Ps ? P > Ps : false)]);
  }
  return { pts, Psat: Ps };
}
if (typeof module !== "undefined") module.exports = { GASES, vdwCurve, vdwTc, vdwPsat };
