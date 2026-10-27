// ---- 2D molecular model ----
// Units: mass m = 1. Molecule centers move in [0, W] x [0, H]; the drawn wall sits R
// outside that box, so a molecule's surface touches the wall when its center bounces.
// kT = 1 is "room temperature". Pressure is measured from the impulse given to the walls.
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function gaussian(rng) {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function createSim(o) {
  const N = o.N;
  const sim = {
    N, W: o.W, H: o.H, R: o.R || 0, attract: !!o.attract,
    eps: o.eps ?? 1, range: o.range ?? 16, kT: o.kT ?? 1,
    x: new Float64Array(N), y: new Float64Array(N), vx: new Float64Array(N), vy: new Float64Array(N),
    fx: new Float64Array(N), fy: new Float64Array(N),
    hits: [],               // recent wall hits for drawing: {x, y, s (speed), age}
    imp: 0, time: 0, keSum: 0, vir: 0,
  };
  const rng = makeRng(o.seed || 7);

  // jittered grid, so hard cores never start overlapping
  function place() {
    const cols = Math.ceil(Math.sqrt(N * sim.W / sim.H));
    const rows = Math.ceil(N / cols);
    const dx = sim.W / cols, dy = sim.H / rows;
    for (let i = 0; i < N; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const jx = Math.max(0, dx - 2 * sim.R) * 0.4, jy = Math.max(0, dy - 2 * sim.R) * 0.4;
      sim.x[i] = (c + 0.5) * dx + (rng() - 0.5) * jx;
      sim.y[i] = (r + 0.5) * dy + (rng() - 0.5) * jy;
      const s = Math.sqrt(sim.kT);
      sim.vx[i] = gaussian(rng) * s; sim.vy[i] = gaussian(rng) * s;
    }
  }

  // attraction well U = -eps (1 - s^2)^2 with s = (r - 2R) / range, zero beyond 2R + range
  function forces() {
    const { x, y, fx, fy } = sim;
    fx.fill(0); fy.fill(0);
    sim.virF = 0;
    if (!sim.attract) return;
    const r0 = 2 * sim.R, L = sim.range, rc = r0 + L, rc2 = rc * rc, eps = sim.eps;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 >= rc2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        if (d <= r0) continue;
        const s = (d - r0) / L;
        const f = 4 * eps * s * (1 - s * s) / L;
        sim.virF -= d * f;
        const ux = dx / d, uy = dy / d;
        fx[i] += f * ux; fy[i] += f * uy;
        fx[j] -= f * ux; fy[j] -= f * uy;
      }
    }
  }

  // elastic collisions between hard cores
  function collide() {
    if (sim.R <= 0) return;
    const { x, y, vx, vy } = sim, D = 2 * sim.R, D2 = D * D;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 >= D2 || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
        if (vn < 0) { vx[i] += vn * nx; vy[i] += vn * ny; vx[j] -= vn * nx; vy[j] -= vn * ny; sim.vir -= D * vn; }
        const push = (D - d) / 2;
        x[i] -= nx * push; y[i] -= ny * push; x[j] += nx * push; y[j] += ny * push;
      }
    }
  }

  function hit(px, py, v) { if (sim.hits.length < 160) sim.hits.push({ x: px, y: py, s: v, age: 0 }); }

  function walls(record) {
    const { x, y, vx, vy, W, H } = sim;
    for (let i = 0; i < N; i++) {
      if (x[i] < 0) { x[i] = -x[i]; if (vx[i] < 0) { sim.imp -= 2 * vx[i]; record && hit(0, y[i], -vx[i]); vx[i] = -vx[i]; } }
      else if (x[i] > W) { x[i] = 2 * W - x[i]; if (vx[i] > 0) { sim.imp += 2 * vx[i]; record && hit(W, y[i], vx[i]); vx[i] = -vx[i]; } }
      if (y[i] < 0) { y[i] = -y[i]; if (vy[i] < 0) { sim.imp -= 2 * vy[i]; record && hit(x[i], 0, -vy[i]); vy[i] = -vy[i]; } }
      else if (y[i] > H) { y[i] = 2 * H - y[i]; if (vy[i] > 0) { sim.imp += 2 * vy[i]; record && hit(x[i], H, vy[i]); vy[i] = -vy[i]; } }
      if (x[i] < 0 || x[i] > W) x[i] = Math.min(W, Math.max(0, x[i]));
      if (y[i] < 0 || y[i] > H) y[i] = Math.min(H, Math.max(0, y[i]));
    }
  }

  sim.step = function (dt, record) {
    const { x, y, vx, vy, fx, fy } = sim;
    for (let i = 0; i < N; i++) { vx[i] += fx[i] * dt / 2; vy[i] += fy[i] * dt / 2; x[i] += vx[i] * dt; y[i] += vy[i] * dt; }
    walls(record);
    collide();
    forces();
    let ke = 0;
    for (let i = 0; i < N; i++) {
      vx[i] += fx[i] * dt / 2; vy[i] += fy[i] * dt / 2;
      ke += (vx[i] * vx[i] + vy[i] * vy[i]) / 2;
    }
    // Berendsen thermostat (2D: total kinetic energy = N kT)
    const lam = Math.sqrt(Math.max(0.5, Math.min(1.5, 1 + (dt / 5) * (sim.kT * N / Math.max(ke, 1e-9) - 1))));
    for (let i = 0; i < N; i++) { vx[i] *= lam; vy[i] *= lam; }
    sim.time += dt; sim.keSum += ke * lam * lam * dt; sim.vir += sim.virF * dt;
  };

  // hand over what was measured since the last call
  sim.takeBlock = function () {
    const b = { imp: sim.imp, time: sim.time, keSum: sim.keSum, vir: sim.vir };
    sim.imp = 0; sim.time = 0; sim.keSum = 0; sim.vir = 0;
    return b;
  };

  // Z = PA / NkT from a list of blocks (2D: P is force per wall length)
  sim.zFrom = function (blocks) {
    let imp = 0, time = 0, ke = 0;
    for (const b of blocks) { imp += b.imp; time += b.time; ke += b.keSum; }
    if (time <= 0 || ke <= 0) return null;
    const P = imp / (time * 2 * (sim.W + sim.H));
    const kT = ke / time / N;
    return P * sim.W * sim.H / (N * kT);
  };

  // the same Z from the virial (uses every molecule every step, so it settles faster):
  // PA = NkT + (1/2) <sum over pairs of r·F>   (2D)
  sim.zVirFrom = function (blocks) {
    let vir = 0, time = 0, ke = 0;
    for (const b of blocks) { vir += b.vir; time += b.time; ke += b.keSum; }
    if (time <= 0 || ke <= 0) return null;
    const kT = ke / time / N;
    return 1 + vir / time / (2 * N * kT);
  };

  sim.setBox = function (W, H) {
    const sx = W / sim.W, sy = H / sim.H;
    for (let i = 0; i < N; i++) { sim.x[i] *= sx; sim.y[i] *= sy; }
    sim.W = W; sim.H = H;
  };

  sim.virF = 0;
  place(); forces();
  return sim;
}
if (typeof module !== "undefined") module.exports = { createSim };
