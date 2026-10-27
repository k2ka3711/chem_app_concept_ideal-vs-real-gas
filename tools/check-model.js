// Checks that the molecular model shows the textbook trends: node tools/check-model.js
const { createSim } = require("../src/engine.js");
const { GASES, vdwCurve } = require("../src/vdw.js");

function z(o, time = 4000) {
  const s = createSim({ seed: 3, ...o });
  for (let t = 0; t < 1000; t += 0.25) s.step(0.25);
  s.takeBlock();
  for (let t = 0; t < time; t += 0.25) s.step(0.25);
  return s.zVirFrom([s.takeBlock()]);
}
const real = { N: 60, R: 8, attract: true, eps: 1, range: 16 };
const checks = [
  ["ideal gas: Z = 1", z({ N: 50, W: 400, H: 400 }), v => Math.abs(v - 1) < 0.02],
  ["STEP 3 attraction only: Z < 1", z({ N: 50, W: 400, H: 400, R: 3, attract: true, eps: 0.5, range: 30 }), v => v < 0.93],
  ["STEP 4 molecular volume only: Z > 1", z({ N: 50, W: 400, H: 400, R: 10 }), v => v > 1.12],
  ["STEP 5 high T, low P: Z ≈ 1", z({ ...real, W: 1600, H: 1600, kT: 3 }), v => Math.abs(v - 1) < 0.05],
  ["STEP 5 low T, high P: Z << 1", z({ ...real, W: 240, H: 240, kT: 0.43 }), v => v < 0.5],
  ["STEP 5 high T, high P: Z > 1", z({ ...real, W: 185, H: 185, kT: 3 }), v => v > 1.3],
];
// STEP 6: under the same weight, the piston heights in the app give the ideal gas's pressure
const pRatio = (o, H) => z({ ...o, W: 400, H }, 8000) * 400 / H;
checks.push(["STEP 6 attraction only at H = 345: same pressure", pRatio({ N: 50, R: 3, attract: true, eps: 0.5, range: 30 }, 345), v => Math.abs(v - 1) < 0.03]);
checks.push(["STEP 6 molecular volume only at H = 470: same pressure", pRatio({ N: 50, R: 10 }, 470), v => Math.abs(v - 1) < 0.03]);
const co2 = GASES.find(g => g.id === "CO2"), h2 = GASES.find(g => g.id === "H2");
const minZ = g => Math.min(...vdwCurve(g, 273, 1e8, 200).pts.map(p => p[1]));
checks.push(["STEP 7 H2 at 273 K stays above 1", minZ(h2), v => v >= 0.999]);
checks.push(["STEP 7 CO2 at 273 K dips far below 1", minZ(co2), v => v < 0.3]);

let ok = true;
for (const [name, v, pass] of checks) {
  const p = pass(v); ok &&= p;
  console.log(`${p ? "ok " : "NG "} ${name}  (${v.toFixed(3)})`);
}
process.exit(ok ? 0 : 1);
