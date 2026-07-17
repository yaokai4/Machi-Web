"use client";

import { useEffect, useRef } from "react";
import { CITY_POINTS, JAPAN_POLYS, KANTO_CENTER, project } from "./city-data";

// Full-page WebGL particle field: the Japanese archipelago rendered as a
// breathing dot constellation with the 13 live Machi cities as bright
// cores that take turns emitting "echo" rings. One fixed canvas backs the
// whole homepage; sections influence it through data markers:
//
//   [data-echo-zoom]   hero — camera eases from full archipelago → Kanto
//   [data-echo-dim]    while visible, the field dims to ~18% (JLPT act)
//   [data-echo-map]    city-map section — camera frames the archipelago
//   [data-echo-finale] closing — every city fires one last ring together
//
// Enhancement-only by contract: no WebGL / reduced-motion / hidden tab all
// degrade to a static frame or nothing, and every word of page copy lives
// in regular DOM outside this component.

const VERT = `
attribute vec2 aPos;
attribute float aSeed;
attribute float aKind; // 0 = coast particle, 1 = city core, 2 = city halo
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uView;   // centerX, centerY, zoom
uniform vec3 uMouse;  // x, y (map space), strength
uniform float uDim;
uniform float uDpr;
uniform vec4 uRing[13]; // x, y, phase(0..1 active else <0), groupBoost
varying float vGlow;
varying float vKind;
varying float vSeed;

void main() {
  vec2 p = aPos;
  // Breathing drift, phase-hashed per particle.
  float t = uTime * 0.6 + aSeed * 6.2831;
  p += vec2(sin(t), cos(t * 0.83)) * 0.0016 * (0.4 + fract(aSeed * 7.13));

  float glow = 0.0;
  // Echo rings: particles light up as a ring wavefront passes through.
  for (int i = 0; i < 13; i++) {
    vec4 ring = uRing[i];
    if (ring.z >= 0.0) {
      float d = distance(aPos, ring.xy);
      float radius = ring.z * 0.16;
      float band = abs(d - radius);
      float fade = 1.0 - ring.z;
      glow += smoothstep(0.02, 0.0, band) * fade * 1.6;
    }
    glow += ring.w * smoothstep(0.05, 0.0, distance(aPos, ring.xy)) * 0.9;
  }

  // Mouse: brighten and gently repel nearby particles.
  float md = distance(aPos, uMouse.xy);
  float minfl = smoothstep(0.09, 0.0, md) * uMouse.z;
  glow += minfl * 1.2;
  if (md > 0.0001) p += normalize(aPos - uMouse.xy) * minfl * 0.006;

  vec2 view = (p - uView.xy) * uView.z;
  vec2 clip = vec2(view.x * (uRes.y / uRes.x) * 1.28, -view.y) * 2.0;
  gl_Position = vec4(clip, 0.0, 1.0);

  float base = aKind > 0.5 ? 3.4 : 1.55;
  float tw = 0.75 + 0.25 * sin(uTime * (0.8 + fract(aSeed * 3.7)) + aSeed * 40.0);
  gl_PointSize = (base + glow * 2.2) * uDpr * tw * clamp(uView.z, 0.85, 2.1);

  vGlow = glow;
  vKind = aKind;
  vSeed = aSeed;
}
`;

const FRAG = `
precision mediump float;
uniform float uDim;
uniform float uTheme; // 0 light, 1 dark
varying float vGlow;
varying float vKind;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  float alpha = smoothstep(0.5, 0.08, r);

  // Two brand families only: coral warmth and indigo cool.
  vec3 coralDark  = vec3(1.0, 0.55, 0.38);
  vec3 indigoDark = vec3(0.62, 0.64, 1.0);
  vec3 coralLight  = vec3(0.93, 0.32, 0.18);
  vec3 indigoLight = vec3(0.33, 0.30, 0.85);
  float pick = step(0.72, fract(vSeed * 5.39));
  vec3 dark = mix(coralDark, indigoDark, pick);
  vec3 light = mix(coralLight, indigoLight, pick);
  vec3 color = mix(light, dark, uTheme);
  if (vKind > 0.5) color = mix(vec3(0.95, 0.36, 0.2), vec3(1.0, 0.62, 0.45), uTheme);

  float strength = vKind > 0.5 ? 0.95 : (uTheme > 0.5 ? 0.5 : 0.42);
  strength += vGlow * 0.5;
  strength *= (1.0 - uDim * 0.82);
  gl_FragColor = vec4(color, alpha * clamp(strength, 0.0, 1.0));
}
`;

type RingState = { phase: number; active: boolean };

function buildParticles(count: number) {
  // Deterministic PRNG so SSR/CSR builds match and re-mounts are stable.
  let s = 1234567;
  const rnd = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };

  const pts: number[] = [];
  const seeds: number[] = [];
  const kinds: number[] = [];

  // Scatter along coastline segments with jitter that hugs the polyline.
  const segments: Array<{ ax: number; ay: number; bx: number; by: number; len: number }> = [];
  let total = 0;
  for (const poly of JAPAN_POLYS) {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, ay] = project(poly[i][0], poly[i][1]);
      const [bx, by] = project(poly[i + 1][0], poly[i + 1][1]);
      const len = Math.hypot(bx - ax, by - ay);
      segments.push({ ax, ay, bx, by, len });
      total += len;
    }
  }
  for (let i = 0; i < count; i++) {
    let target = rnd() * total;
    let seg = segments[0];
    for (const sgm of segments) {
      if (target <= sgm.len) { seg = sgm; break; }
      target -= sgm.len;
    }
    const t = seg.len > 0 ? target / seg.len : 0;
    const jitter = 0.014;
    // Box-Muller-ish pull toward the line so the coast reads sharp.
    const j1 = (rnd() + rnd() + rnd()) / 3 - 0.5;
    const j2 = (rnd() + rnd() + rnd()) / 3 - 0.5;
    pts.push(seg.ax + (seg.bx - seg.ax) * t + j1 * jitter * 2.2, seg.ay + (seg.by - seg.ay) * t + j2 * jitter * 2.2);
    seeds.push(rnd());
    kinds.push(0);
  }

  // City cores + halo sprinkle.
  for (const city of CITY_POINTS) {
    pts.push(city.x, city.y);
    seeds.push(rnd());
    kinds.push(1);
    const halo = 26;
    for (let i = 0; i < halo; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Math.pow(rnd(), 1.6) * 0.02;
      pts.push(city.x + Math.cos(ang) * rad, city.y + Math.sin(ang) * rad * 0.8);
      seeds.push(rnd());
      kinds.push(2);
    }
  }

  return {
    pos: new Float32Array(pts),
    seed: new Float32Array(seeds),
    kind: new Float32Array(kinds),
    count: kinds.length,
  };
}

export function EchoFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    const gl = (canvas.getContext("webgl2", { alpha: true, antialias: false, powerPreference: "low-power" }) ||
      canvas.getContext("webgl", { alpha: true, antialias: false })) as WebGLRenderingContext | null;
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        // Silent degrade: the page is fully functional without the field.
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.style.display = "none"; return; }
    const prog = gl.createProgram();
    if (!prog) { canvas.style.display = "none"; return; }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = "none"; return; }
    gl.useProgram(prog);

    const particles = buildParticles(coarse ? 8000 : 20000);
    const bindAttr = (name: string, data: Float32Array, size: number) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bindAttr("aPos", particles.pos, 2);
    bindAttr("aSeed", particles.seed, 1);
    bindAttr("aKind", particles.kind, 1);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uView = gl.getUniformLocation(prog, "uView");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uDim = gl.getUniformLocation(prog, "uDim");
    const uDpr = gl.getUniformLocation(prog, "uDpr");
    const uTheme = gl.getUniformLocation(prog, "uTheme");
    const uRing = gl.getUniformLocation(prog, "uRing");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const dprCap = coarse ? 1.5 : 2;
    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uDpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // ---- scene state -------------------------------------------------
    const rings: RingState[] = CITY_POINTS.map(() => ({ phase: -1, active: false }));
    let nextRingAt = 0.6;
    let ringCursor = 0;
    let finaleFired = false;
    let dimSmooth = 0;
    let mouse = { x: -10, y: -10, s: 0 };
    let targetMouse = { x: -10, y: -10, s: 0 };

    // Camera in map space. Wide framing shows the whole archipelago.
    const WIDE = { x: 0.55, y: 0.5, z: 1.55 };
    const KANTO = { x: KANTO_CENTER[0] + 0.04, y: KANTO_CENTER[1], z: 3.1 };
    const view = { ...WIDE };

    const markers = {
      zoom: null as HTMLElement | null,
      dim: null as HTMLElement | null,
      map: null as HTMLElement | null,
      finale: null as HTMLElement | null,
    };
    const findMarkers = () => {
      markers.zoom = document.querySelector<HTMLElement>("[data-echo-zoom]");
      markers.dim = document.querySelector<HTMLElement>("[data-echo-dim]");
      markers.map = document.querySelector<HTMLElement>("[data-echo-map]");
      markers.finale = document.querySelector<HTMLElement>("[data-echo-finale]");
    };
    findMarkers();

    const isDark = () => document.documentElement.classList.contains("dark");

    const onPointer = (e: PointerEvent) => {
      // Invert the view transform: screen px → map coordinates.
      const nx = (e.clientX / width - 0.5) * 2;
      const ny = (e.clientY / height - 0.5) * 2;
      const aspect = height / width;
      targetMouse = {
        x: view.x + (nx / (aspect * 1.28 * 2)) / view.z * 2,
        y: view.y + ny / view.z,
        s: 1,
      };
    };
    const onPointerLeave = () => { targetMouse = { ...targetMouse, s: 0 }; };
    if (!coarse && !reduceMotion) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerout", onPointerLeave, { passive: true });
    }

    let raf = 0;
    let last = performance.now();
    let time = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;

      // --- read scene markers (a handful of rect reads per frame) -----
      const vh = window.innerHeight;
      let dim = 0;
      let mapWeight = 0;
      let zoomT = 0;
      if (markers.zoom) {
        const r = markers.zoom.getBoundingClientRect();
        // 0 at top of page → 1 once the hero has fully scrolled past.
        zoomT = Math.min(Math.max(-r.top / Math.max(r.height - vh * 0.4, 1), 0), 1);
      }
      if (markers.dim) {
        const r = markers.dim.getBoundingClientRect();
        const visible = r.top < vh * 0.72 && r.bottom > vh * 0.4;
        dim = visible ? 1 : 0;
      }
      if (markers.map) {
        const r = markers.map.getBoundingClientRect();
        const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        mapWeight = Math.min(Math.max(visible / (vh * 0.7), 0), 1);
      }
      if (markers.finale && !finaleFired) {
        const r = markers.finale.getBoundingClientRect();
        if (r.top < vh * 0.85) {
          finaleFired = true;
          rings.forEach((ring, i) => { ring.phase = -0.12 * (i % 5); ring.active = true; });
        }
      }
      if (markers.finale && finaleFired) {
        const r = markers.finale.getBoundingClientRect();
        if (r.top > vh) finaleFired = false; // re-arm when scrolled back up
      }

      // --- camera ------------------------------------------------------
      const inMap = mapWeight > 0.02;
      const target = inMap
        ? { x: WIDE.x, y: WIDE.y - 0.02, z: WIDE.z * (1 + mapWeight * 0.12) }
        : {
            x: WIDE.x + (KANTO.x - WIDE.x) * zoomT,
            y: WIDE.y + (KANTO.y - WIDE.y) * zoomT,
            z: WIDE.z + (KANTO.z - WIDE.z) * zoomT * zoomT,
          };
      const ease = 1 - Math.exp(-dt * 3.2);
      view.x += (target.x - view.x) * ease;
      view.y += (target.y - view.y) * ease;
      view.z += (target.z - view.z) * ease;

      mouse.x += (targetMouse.x - mouse.x) * ease;
      mouse.y += (targetMouse.y - mouse.y) * ease;
      mouse.s += (targetMouse.s - mouse.s) * ease;

      dimSmooth += (dim - dimSmooth) * ease;

      // --- ring scheduler ----------------------------------------------
      if (time > nextRingAt && !dim) {
        const ring = rings[ringCursor % rings.length];
        if (!ring.active) { ring.phase = 0; ring.active = true; }
        ringCursor += 1;
        nextRingAt = time + 1.7;
      }
      const ringData = new Float32Array(13 * 4);
      rings.forEach((ring, i) => {
        if (ring.active) {
          ring.phase += dt * 0.5;
          if (ring.phase >= 1) { ring.active = false; ring.phase = -1; }
        }
        const c = CITY_POINTS[i];
        ringData[i * 4] = c.x;
        ringData[i * 4 + 1] = c.y;
        ringData[i * 4 + 2] = ring.active ? Math.max(ring.phase, 0) : -1;
        ringData[i * 4 + 3] = mapWeight;
      });

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, time);
      gl.uniform3f(uView, view.x, view.y, view.z);
      gl.uniform3f(uMouse, mouse.x, mouse.y, mouse.s);
      gl.uniform1f(uDim, dimSmooth);
      gl.uniform1f(uTheme, isDark() ? 1 : 0);
      gl.uniform4fv(uRing, ringData);
      gl.drawArrays(gl.POINTS, 0, particles.count);

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    start();

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!reduceMotion) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerout", onPointerLeave);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="mcv2-echo-canvas"
    />
  );
}
