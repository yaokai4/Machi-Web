"use client";

import { useEffect, useRef } from "react";
import { CITY_POINTS, JAPAN_POLYS, KANTO_CENTER, project } from "./city-data";

// Full-page WebGL particle field: the Japanese archipelago as a dot
// constellation with the 13 live Machi cities as bright cores. One fixed
// canvas backs the whole homepage; sections steer it through data markers:
//
//   [data-echo-zoom]   hero — camera eases from full archipelago → Kanto
//   [data-echo-dim]    dim the field to a texture while visible (value = amount)
//   [data-echo-map]    city-map section — camera frames the archipelago
//   [data-echo-finale] closing — every city fires one last ring together
//
// The palette (ink / city / strength / edge / dot size) is read from CSS
// custom properties (--mcv2-*), so a theme is tuned in one stylesheet and
// the field, the paper and the type all move together. Crucially light and
// dark are different *physics*: dark is additive glow on black; light is
// hard-edged opaque ink on paper (a soft dot on white reads as a grey
// smudge). The theme drives uEdge / uInkStrength / dot size accordingly.
//
// Enhancement-only: no WebGL / reduced-motion / hidden tab all degrade to a
// static frame or nothing, and every word of page copy lives in real DOM.

const VERT = `
attribute vec2 aPos;
attribute float aSeed;
attribute float aKind; // 0 = coast particle, 1 = city core, 2 = city halo
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uView;   // centerX, centerY, zoom
uniform vec3 uMouse;  // x, y (map space), strength
uniform mediump float uDim;
uniform float uDotScale;
uniform float uCityScale;
uniform float uDpr;
uniform vec4 uRing[13]; // x, y, phase(0..1 active else <0), groupBoost
varying float vGlow;
varying float vKind;
varying float vSeed;

void main() {
  vec2 p = aPos;
  float t = uTime * 0.6 + aSeed * 6.2831;
  p += vec2(sin(t), cos(t * 0.83)) * 0.0016 * (0.4 + fract(aSeed * 7.13));

  float glow = 0.0;
  for (int i = 0; i < 13; i++) {
    vec4 ring = uRing[i];
    if (ring.z >= 0.0) {
      float d = distance(aPos, ring.xy);
      float radius = ring.z * 0.16;
      float band = abs(d - radius);
      float fade = 1.0 - ring.z;
      glow += smoothstep(0.028, 0.0, band) * fade * 2.2;
    }
    glow += ring.w * smoothstep(0.05, 0.0, distance(aPos, ring.xy)) * 0.9;
  }

  float md = distance(aPos, uMouse.xy);
  float minfl = smoothstep(0.09, 0.0, md) * uMouse.z;
  glow += minfl * 1.2;
  if (md > 0.0001) p += normalize(aPos - uMouse.xy) * minfl * 0.006;

  vec2 view = (p - uView.xy) * uView.z;
  vec2 clip = vec2(view.x * (uRes.y / uRes.x) * 1.28, -view.y) * 2.0;
  gl_Position = vec4(clip, 0.0, 1.0);

  float base = aKind > 1.5 ? 1.7 : (aKind > 0.5 ? 5.0 : 2.35);
  base *= (aKind > 0.5 && aKind < 1.5) ? uCityScale : uDotScale;
  float tw = 0.75 + 0.25 * sin(uTime * (0.8 + fract(aSeed * 3.7)) + aSeed * 40.0);
  // Dimmed particles also get finer, so the field reads as a delicate
  // constellation behind copy rather than soft blobs. An echo mostly
  // brightens; it only nudges point size (glow*1.1, not *2.6, or each ring
  // becomes a blob sitting on the copy).
  float fine = mix(1.0, 0.7, clamp(uDim, 0.0, 1.0));
  gl_PointSize = (base + glow * 1.1) * uDpr * tw * fine * clamp(uView.z, 0.85, 2.1);

  vGlow = glow;
  vKind = aKind;
  vSeed = aSeed;
}
`;

const FRAG = `
precision mediump float;
uniform mediump float uDim; // precision must match the vertex declaration
uniform vec3 uInk;
uniform vec3 uCity;
uniform float uInkStrength;
uniform float uEdge; // 0 = additive-style soft glow, 1 = hard printed ink
varying float vGlow;
varying float vKind;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);

  // Soft falloff for glow (dark) vs hard disc for ink (light).
  float softAlpha = smoothstep(0.5, 0.08, r);
  float inkAlpha = smoothstep(0.5, 0.42, r);
  float alpha = mix(softAlpha, inkAlpha, uEdge);

  // City cores get a paper-coloured knockout ring on print-like themes so
  // they read as registration marks on the coast rather than bleeding in.
  if (vKind > 0.5 && uEdge > 0.5) {
    float ring = 1.0 - smoothstep(0.30, 0.34, r) * (1.0 - smoothstep(0.44, 0.48, r));
    alpha *= ring;
  }

  vec3 color = uInk;
  color *= 0.86 + 0.28 * fract(vSeed * 5.39); // slight per-particle variation
  if (vKind > 0.5) color = uCity;

  float strength = vKind > 0.5 ? 1.0 : uInkStrength;
  strength += vGlow * 0.5;
  // The halo sprinkle around each core is decorative: it clumps into blobs
  // at close zoom, so it leaves first as the field dims; the coast stays.
  if (vKind > 1.5) strength *= max(1.0 - uDim * 1.25, 0.0);
  strength *= max(1.0 - uDim * 0.82, 0.0);
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
    const j1 = (rnd() + rnd() + rnd()) / 3 - 0.5;
    const j2 = (rnd() + rnd() + rnd()) / 3 - 0.5;
    pts.push(seg.ax + (seg.bx - seg.ax) * t + j1 * jitter * 2.2, seg.ay + (seg.by - seg.ay) * t + j2 * jitter * 2.2);
    seeds.push(rnd());
    kinds.push(0);
  }

  for (const city of CITY_POINTS) {
    pts.push(city.x, city.y);
    seeds.push(rnd());
    kinds.push(1);
    const halo = 40;
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
    if (!gl) { canvas.style.display = "none"; return; }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        if (process.env.NODE_ENV === "development") {
          console.error("[EchoField] shader compile failed:", gl.getShaderInfoLog(sh));
        }
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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (process.env.NODE_ENV === "development") {
        console.error("[EchoField] program link failed:", gl.getProgramInfoLog(prog));
      }
      canvas.style.display = "none";
      return;
    }
    gl.useProgram(prog);

    // The coast reads just as well at 12k as at 20k, and each vertex runs a
    // 13-ring loop, so count is the single biggest lever on frame cost.
    const particles = buildParticles(coarse ? 5000 : 12000);
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
    const uInk = gl.getUniformLocation(prog, "uInk");
    const uCity = gl.getUniformLocation(prog, "uCity");
    const uInkStrength = gl.getUniformLocation(prog, "uInkStrength");
    const uEdge = gl.getUniformLocation(prog, "uEdge");
    const uDotScale = gl.getUniformLocation(prog, "uDotScale");
    const uCityScale = gl.getUniformLocation(prog, "uCityScale");
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
      if (width === 0 || height === 0) return; // not laid out yet
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uDpr, dpr);
    };
    resize();
    // A plain resize listener isn't enough: this effect can run before the
    // canvas is laid out (production mounts it once, no Strict-Mode remount
    // to paper over the timing), and nothing would re-measure it. Observing
    // the element covers first layout, resizes and dpr changes alike.
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(canvas);
    window.addEventListener("resize", resize);

    // ---- palette from CSS -------------------------------------------
    const readPalette = () => {
      const cs = getComputedStyle(canvas);
      const triplet = (name: string, fallback: [number, number, number]) => {
        const parts = cs.getPropertyValue(name).trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
        return parts.length === 3 ? (parts.map((n) => n / 255) as [number, number, number]) : fallback;
      };
      const num = (name: string, fallback: number) => {
        const v = Number.parseFloat(cs.getPropertyValue(name));
        return Number.isNaN(v) ? fallback : v;
      };
      return {
        ink: triplet("--mcv2-ink", [0.13, 0.14, 0.21]),
        city: triplet("--mcv2-city", [0.8, 0.2, 0.05]),
        strength: num("--mcv2-ink-strength", 0.9),
        edge: num("--mcv2-ink-edge", 1),
        dotScale: num("--mcv2-dot-scale", 1),
        cityScale: num("--mcv2-city-scale", 1),
      };
    };
    let palette = readPalette();
    const themeObserver = new MutationObserver(() => { palette = readPalette(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-mcv2-theme"] });

    // ---- scene state -------------------------------------------------
    const rings: RingState[] = CITY_POINTS.map(() => ({ phase: -1, active: false }));
    let nextRingAt = 0.6;
    let ringCursor = 0;
    let finaleFired = false;
    let dimSmooth = 0;
    let mouse = { x: -10, y: -10, s: 0 };
    let targetMouse = { x: -10, y: -10, s: 0 };

    const WIDE = { x: 0.46, y: 0.47, z: 1.42 };
    const KANTO = { x: KANTO_CENTER[0] + 0.04, y: KANTO_CENTER[1], z: 2.2 };
    const view = { ...WIDE };
    // The field leads only in the hero; behind copy it drops to a faint
    // constellation (glass cards are translucent — any brighter shows
    // through). The finale sits between.
    const TEXTURE_DIM = 0.86;
    const FINALE_DIM = 0.62;

    const markers = {
      zoom: null as HTMLElement | null,
      dim: [] as HTMLElement[],
      map: null as HTMLElement | null,
      finale: null as HTMLElement | null,
    };
    const findMarkers = () => {
      markers.zoom = document.querySelector<HTMLElement>("[data-echo-zoom]");
      markers.dim = Array.from(document.querySelectorAll<HTMLElement>("[data-echo-dim]"));
      markers.map = document.querySelector<HTMLElement>("[data-echo-map]");
      markers.finale = document.querySelector<HTMLElement>("[data-echo-finale]");
    };
    findMarkers();
    // Sections mount after this canvas, so a marker can still be missing at
    // mount. Stopping as soon as ONE marker showed up silently dropped the
    // whole lighting choreography on a cold load — poll until the set is
    // present, or give up after ~5s.
    const markersComplete = () => !!markers.zoom && !!markers.map && !!markers.finale && markers.dim.length > 0;
    let markerTries = 0;
    let sceneDirty = true;
    const markerPoll = window.setInterval(() => {
      findMarkers();
      sceneDirty = true;
      if (markersComplete() || ++markerTries > 25) window.clearInterval(markerPoll);
    }, 200);

    const snapshotMode = process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).has("mcv2only");

    const onPointer = (e: PointerEvent) => {
      const nx = (e.clientX / width - 0.5) * 2;
      const ny = (e.clientY / height - 0.5) * 2;
      const aspect = height / width;
      targetMouse = { x: view.x + (nx / (aspect * 1.28 * 2)) / view.z * 2, y: view.y + ny / view.z, s: 1 };
    };
    const onPointerLeave = () => { targetMouse = { ...targetMouse, s: 0 }; };
    if (!coarse && !reduceMotion) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerout", onPointerLeave, { passive: true });
    }

    // Scene values derived from marker rects. Reading rects forces a sync
    // layout, so it happens on scroll/resize only — never per frame.
    let dim = 0;
    let mapWeight = 0;
    let zoomT = 0;

    const readScene = () => {
      sceneDirty = false;
      const vh = window.innerHeight;
      dim = 0;
      mapWeight = 0;
      if (markers.zoom) {
        const r = markers.zoom.getBoundingClientRect();
        if (r.height > 0) {
          zoomT = Math.min(Math.max(-r.top / Math.max(r.height - vh * 0.4, 1), 0), 1);
        } else if (snapshotMode) {
          zoomT = 1;
        }
      } else if (snapshotMode) {
        zoomT = 1;
      }
      // Full brightness while the hero owns the screen, easing to texture as
      // it scrolls away.
      dim = TEXTURE_DIM * zoomT;
      for (const marker of markers.dim) {
        if (marker.hidden) continue;
        const r = marker.getBoundingClientRect();
        if (r.height === 0) continue;
        if (r.top < vh * 0.72 && r.bottom > vh * 0.4) {
          dim = Math.max(dim, Number(marker.dataset.echoDim) || 1);
        }
      }
      if (markers.map) {
        const r = markers.map.getBoundingClientRect();
        const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        mapWeight = Math.min(Math.max(visible / (vh * 0.7), 0), 1);
      }
      if (markers.finale) {
        const r = markers.finale.getBoundingClientRect();
        if (!finaleFired && r.top < vh * 0.85) {
          finaleFired = true;
          rings.forEach((ring, i) => { ring.phase = -0.12 * (i % 5); ring.active = true; });
        }
        if (finaleFired && r.top > vh) finaleFired = false;
        if (r.top < vh * 0.8) dim = Math.min(dim, FINALE_DIM);
      }
    };

    const markScene = () => { sceneDirty = true; };
    window.addEventListener("scroll", markScene, { passive: true });
    window.addEventListener("resize", markScene, { passive: true });

    let raf = 0;
    let last = performance.now();
    let time = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;

      if (canvas.width === 0 || canvas.height === 0) {
        if (!reduceMotion) raf = requestAnimationFrame(frame);
        return; // waiting on first layout; ResizeObserver will bring us back
      }
      if (sceneDirty || snapshotMode) readScene();

      const inMap = mapWeight > 0.02;
      const target = inMap
        ? { x: WIDE.x, y: WIDE.y - 0.02, z: WIDE.z * (1 + mapWeight * 0.12) }
        : {
            x: WIDE.x + (KANTO.x - WIDE.x) * zoomT,
            y: WIDE.y + (KANTO.y - WIDE.y) * zoomT,
            z: WIDE.z + (KANTO.z - WIDE.z) * zoomT * zoomT,
          };
      const ease = snapshotMode ? 1 : 1 - Math.exp(-dt * 3.2);
      view.x += (target.x - view.x) * ease;
      view.y += (target.y - view.y) * ease;
      view.z += (target.z - view.z) * ease;

      mouse.x += (targetMouse.x - mouse.x) * ease;
      mouse.y += (targetMouse.y - mouse.y) * ease;
      mouse.s += (targetMouse.s - mouse.s) * ease;

      dimSmooth += (dim - dimSmooth) * (snapshotMode ? 1 : 1 - Math.exp(-dt * 6));

      if (time > nextRingAt && dim < 0.8) {
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
      gl.uniform3f(uInk, palette.ink[0], palette.ink[1], palette.ink[2]);
      gl.uniform3f(uCity, palette.city[0], palette.city[1], palette.city[2]);
      gl.uniform1f(uInkStrength, palette.strength);
      gl.uniform1f(uEdge, palette.edge);
      gl.uniform1f(uDotScale, palette.dotScale);
      gl.uniform1f(uCityScale, palette.cityScale);
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
      window.clearInterval(markerPoll);
      sizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", markScene);
      window.removeEventListener("resize", markScene);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerout", onPointerLeave);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="mcv2-echo-canvas" />;
}
