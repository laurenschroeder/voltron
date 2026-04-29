// SimplexNoise from three.js examples (vendored)
// Original: three/examples/jsm/math/SimplexNoise.js

const _F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const _G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const _F3 = 1.0 / 3.0;
const _G3 = 1.0 / 6.0;
const _F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
const _G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

class SimplexNoise {
  private _p: Uint8Array;
  private _perm: Uint8Array;
  private _permMod12: Uint8Array;

  private static _grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];

  private static _grad4 = [
    [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
    [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
    [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
    [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
    [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
    [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
    [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
    [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0],
  ];

  constructor(r: { random(): number } = Math) {
    this._p = SimplexNoise._buildPermutationTable(r);
    this._perm = new Uint8Array(512);
    this._permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this._perm[i] = this._p[i & 255];
      this._permMod12[i] = this._perm[i] % 12;
    }
  }

  private static _buildPermutationTable(r: { random(): number }): Uint8Array {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const n = Math.floor((i + 1) * r.random());
      const q = p[i];
      p[i] = p[n];
      p[n] = q;
    }
    return p;
  }

  noise4d(x: number, y: number, z: number, w: number): number {
    const grad4 = SimplexNoise._grad4;
    const perm = this._perm;
    const s = (x + y + z + w) * _F4;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const l = Math.floor(w + s);
    const t = (i + j + k + l) * _G4;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const W0 = l - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    const w0 = w - W0;

    let rankx = 0, ranky = 0, rankz = 0, rankw = 0;
    if (x0 > y0) rankx++; else ranky++;
    if (x0 > z0) rankx++; else rankz++;
    if (x0 > w0) rankx++; else rankw++;
    if (y0 > z0) ranky++; else rankz++;
    if (y0 > w0) ranky++; else rankw++;
    if (z0 > w0) rankz++; else rankw++;

    const i1 = rankx >= 3 ? 1 : 0, j1 = ranky >= 3 ? 1 : 0, k1 = rankz >= 3 ? 1 : 0, l1 = rankw >= 3 ? 1 : 0;
    const i2 = rankx >= 2 ? 1 : 0, j2 = ranky >= 2 ? 1 : 0, k2 = rankz >= 2 ? 1 : 0, l2 = rankw >= 2 ? 1 : 0;
    const i3 = rankx >= 1 ? 1 : 0, j3 = ranky >= 1 ? 1 : 0, k3 = rankz >= 1 ? 1 : 0, l3 = rankw >= 1 ? 1 : 0;

    const x1 = x0 - i1 + _G4, y1 = y0 - j1 + _G4, z1 = z0 - k1 + _G4, w1 = w0 - l1 + _G4;
    const x2 = x0 - i2 + 2 * _G4, y2 = y0 - j2 + 2 * _G4, z2 = z0 - k2 + 2 * _G4, w2 = w0 - l2 + 2 * _G4;
    const x3 = x0 - i3 + 3 * _G4, y3 = y0 - j3 + 3 * _G4, z3 = z0 - k3 + 3 * _G4, w3 = w0 - l3 + 3 * _G4;
    const x4 = x0 - 1 + 4 * _G4, y4 = y0 - 1 + 4 * _G4, z4 = z0 - 1 + 4 * _G4, w4 = w0 - 1 + 4 * _G4;

    const ii = i & 255, jj = j & 255, kk = k & 255, ll = l & 255;
    const gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32;
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32;
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32;
    const gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32;
    const gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32;

    let n0: number, n1: number, n2: number, n3: number, n4: number;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if (t0 < 0) n0 = 0; else { t0 *= t0; n0 = t0 * t0 * (grad4[gi0][0] * x0 + grad4[gi0][1] * y0 + grad4[gi0][2] * z0 + grad4[gi0][3] * w0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if (t1 < 0) n1 = 0; else { t1 *= t1; n1 = t1 * t1 * (grad4[gi1][0] * x1 + grad4[gi1][1] * y1 + grad4[gi1][2] * z1 + grad4[gi1][3] * w1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if (t2 < 0) n2 = 0; else { t2 *= t2; n2 = t2 * t2 * (grad4[gi2][0] * x2 + grad4[gi2][1] * y2 + grad4[gi2][2] * z2 + grad4[gi2][3] * w2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if (t3 < 0) n3 = 0; else { t3 *= t3; n3 = t3 * t3 * (grad4[gi3][0] * x3 + grad4[gi3][1] * y3 + grad4[gi3][2] * z3 + grad4[gi3][3] * w3); }
    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if (t4 < 0) n4 = 0; else { t4 *= t4; n4 = t4 * t4 * (grad4[gi4][0] * x4 + grad4[gi4][1] * y4 + grad4[gi4][2] * z4 + grad4[gi4][3] * w4); }

    return 27.0 * (n0 + n1 + n2 + n3 + n4);
  }
}

export { SimplexNoise };
