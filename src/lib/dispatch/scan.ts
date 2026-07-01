/**
 * Pure-browser document scan primitives for the BOL scanner — NO OpenCV / wasm.
 *
 *  - `dewarp`  perspective-corrects the 4-corner quad the user dragged into a
 *              flat rectangle. Primary path is a WebGL homography (a textured
 *              quad sampled through the projective transform, computed in plain
 *              JS); if WebGL is unavailable it falls back to a canvas triangle-
 *              mesh warp. Small and self-contained — no external libs.
 *  - `cleanup` produces the Color / Gray / B&W render in plain canvas. B&W is a
 *              local-mean (Bradley) adaptive threshold via an integral image —
 *              a clean scan look that survives uneven job-site lighting.
 *
 * All browser-only (uses `document`/`canvas`/WebGL); never call during SSR.
 */

export type Pt = { x: number; y: number };
/** Source-space corner quad, ordered TL, TR, BR, BL. */
export type Quad = [Pt, Pt, Pt, Pt];
export type Mode = "bw" | "gray" | "color";

// ── 3×3 projective homography (Heckbert, "Projective Mappings for Image
// Warping"). Row-major length-9 matrices. ────────────────────────────────────
type Mat3 = number[];

function adj(m: Mat3): Mat3 {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}

function multmm(a: Mat3, b: Mat3): Mat3 {
  const c: Mat3 = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let cij = 0;
      for (let k = 0; k < 3; k++) cij += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = cij;
    }
  }
  return c;
}

function multmv(m: Mat3, v: number[]): number[] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function basisToPoints(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): Mat3 {
  const m: Mat3 = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = multmv(adj(m), [x4, y4, 1]);
  return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** Homography mapping the source quad to the destination quad. */
function general2DProjection(
  s: number[], // 8 numbers: src quad points
  d: number[], // 8 numbers: dst quad points
): Mat3 {
  const sm = basisToPoints(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]);
  const dm = basisToPoints(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]);
  return multmm(dm, adj(sm));
}

function applyH(m: Mat3, x: number, y: number): Pt {
  const X = m[0] * x + m[1] * y + m[2];
  const Y = m[3] * x + m[4] * y + m[5];
  const W = m[6] * x + m[7] * y + m[8];
  return { x: X / W, y: Y / W };
}

// Homography mapping the OUTPUT unit square (0,0)-(1,1) → NORMALIZED source
// texture coords (0..1), ordered TL, TR, BR, BL to match the quad.
function unitSquareToTexH(quad: Quad, sw: number, sh: number): Mat3 {
  return general2DProjection(
    [0, 0, 1, 0, 1, 1, 0, 1],
    [
      quad[0].x / sw, quad[0].y / sh,
      quad[1].x / sw, quad[1].y / sh,
      quad[2].x / sw, quad[2].y / sh,
      quad[3].x / sw, quad[3].y / sh,
    ],
  );
}

/** Average side lengths of the quad → natural output rectangle size (px). */
export function quadSize(quad: Quad): { w: number; h: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
  const h = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
  return { w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)) };
}

// ── WebGL dewarp (primary) ───────────────────────────────────────────────────
const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  // Output unit square with (0,0) at the TOP-LEFT of the result canvas.
  vUV = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
const FRAG_SRC = `
precision highp float;
uniform sampler2D uTex;
uniform mat3 uH;
varying vec2 vUV;
void main() {
  vec3 p = uH * vec3(vUV, 1.0);
  vec2 tc = p.xy / p.z;
  gl_FragColor = texture2D(uTex, tc);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function dewarpWebGL(
  source: HTMLCanvasElement,
  quad: Quad,
  outW: number,
  outH: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl =
      (canvas.getContext("webgl", { preserveDrawingBuffer: true }) as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true }) as WebGLRenderingContext | null);
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // Two triangles covering clip space.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // No FLIP_Y: texcoord (0,0) already samples the source's top-left, matching
  // our top-down corner coordinates.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const H = unitSquareToTexH(quad, source.width, source.height);
  // WebGL mat3 is column-major → upload the transpose of our row-major H.
  const colMajor = new Float32Array([H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]);
  gl.uniformMatrix3fv(gl.getUniformLocation(prog, "uH"), false, colMajor);
  gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

  gl.viewport(0, 0, outW, outH);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (gl.getError() !== gl.NO_ERROR) return null;
  return canvas;
}

// ── Canvas triangle-mesh dewarp (fallback when WebGL is unavailable) ──────────
function solveAffine(
  s0: Pt, s1: Pt, s2: Pt,
  d0: Pt, d1: Pt, d2: Pt,
): [number, number, number, number, number, number] | null {
  const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(det) < 1e-6) return null;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

function drawTri(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  s0: Pt, s1: Pt, s2: Pt,
  d0: Pt, d1: Pt, d2: Pt,
): void {
  const m = solveAffine(s0, s1, s2, d0, d1, d2);
  if (!m) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function dewarpCanvasMesh(
  source: HTMLCanvasElement,
  quad: Quad,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  const sw = source.width;
  const sh = source.height;
  const H = unitSquareToTexH(quad, sw, sh);
  const src = (u: number, v: number): Pt => {
    const p = applyH(H, u, v);
    return { x: p.x * sw, y: p.y * sh };
  };
  const N = 24; // grid subdivisions
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const u0 = gx / N;
      const u1 = (gx + 1) / N;
      const v0 = gy / N;
      const v1 = (gy + 1) / N;
      const o00 = { x: u0 * outW, y: v0 * outH };
      const o10 = { x: u1 * outW, y: v0 * outH };
      const o01 = { x: u0 * outW, y: v1 * outH };
      const o11 = { x: u1 * outW, y: v1 * outH };
      const s00 = src(u0, v0);
      const s10 = src(u1, v0);
      const s01 = src(u0, v1);
      const s11 = src(u1, v1);
      drawTri(ctx, source, s00, s10, s01, o00, o10, o01);
      drawTri(ctx, source, s10, s11, s01, o10, o11, o01);
    }
  }
  return out;
}

const MAX_OUT_DIM = 1500; // cap dewarp output (memory + PDF size)

/** Perspective-dewarp the source quad to a flat rectangle. Never returns null:
 *  WebGL when available, canvas triangle-mesh otherwise. */
export function dewarp(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const { w, h } = quadSize(quad);
  const scl = Math.min(1, MAX_OUT_DIM / Math.max(w, h));
  const outW = Math.max(2, Math.round(w * scl));
  const outH = Math.max(2, Math.round(h * scl));
  return dewarpWebGL(source, quad, outW, outH) ?? dewarpCanvasMesh(source, quad, outW, outH);
}

// ── Cleanup (Color / Gray / B&W) — pure canvas ───────────────────────────────
function grayscaleContrast(img: ImageData): void {
  const d = img.data;
  const n = img.width * img.height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[j] = g;
    hist[g]++;
  }
  // Contrast-stretch on the 2nd/98th percentile so scans aren't muddy.
  const cut = n * 0.02;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (lo = 0; lo < 255; lo++) {
    acc += hist[lo];
    if (acc >= cut) break;
  }
  acc = 0;
  for (hi = 255; hi > 0; hi--) {
    acc += hist[hi];
    if (acc >= cut) break;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((gray[j] - lo) / range) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

// Bradley-Roth adaptive threshold via an integral image: each pixel is compared
// to the mean of its local neighbourhood, so lighting gradients don't wash out
// the page — a clean scan, not a harsh photocopy.
function adaptiveThresholdBW(img: ImageData): void {
  const w = img.width;
  const h = img.height;
  const d = img.data;
  const n = w * h;
  const gray = new Uint8Array(n);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  }
  // Integral image, padded by one row/col so window math needs no branches.
  const iw = w + 1;
  const integral = new Uint32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
    }
  }
  const s = Math.max(2, Math.floor(Math.min(w, h) / 16)); // half window
  const t = 0.87; // pixels below 87% of local mean → ink (black)
  const DARK_FLOOR = 55; // genuinely-dark ink/fills stay solid (adaptive
  // thresholding alone would hollow out large uniform-dark regions)
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s);
    const y2 = Math.min(h - 1, y + s);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s);
      const x2 = Math.min(w - 1, x + s);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * iw + (x2 + 1)] -
        integral[y1 * iw + (x2 + 1)] -
        integral[(y2 + 1) * iw + x1] +
        integral[y1 * iw + x1];
      const g = gray[y * w + x];
      const v = g < DARK_FLOOR || g < (sum / count) * t ? 0 : 255;
      const p = (y * w + x) * 4;
      d[p] = d[p + 1] = d[p + 2] = v;
      d[p + 3] = 255;
    }
  }
}

/** Render a page in the chosen mode. Color returns the crop unchanged. */
export function cleanup(src: HTMLCanvasElement, mode: Mode): HTMLCanvasElement {
  if (mode === "color") return src;
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  if (mode === "gray") grayscaleContrast(img);
  else adaptiveThresholdBW(img);
  ctx.putImageData(img, 0, 0);
  return c;
}
