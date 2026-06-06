"use client";

import { useEffect, useRef } from "react";

interface Flake {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  opacity: number;
}

function createFlake(width: number, height: number, randomY: boolean): Flake {
  return {
    x: Math.random() * width,
    y: randomY ? Math.random() * height : -4,
    size: Math.random() > 0.65 ? 2 : 1,
    speed: 0.35 + Math.random() * 1.1,
    drift: (Math.random() - 0.5) * 0.35,
    opacity: 0.45 + Math.random() * 0.5,
  };
}

/** Falling 1–2px squares behind the login screen. */
export function PixelSnow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const flakes: Flake[] = [];
    let animationId = 0;
    const c = canvas;
    const context = ctx;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      flakes.length = 0;
      const count = Math.min(140, Math.floor((w * h) / 9000));
      for (let i = 0; i < count; i++) {
        flakes.push(createFlake(w, h, true));
      }
    }

    function tick() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      context.clearRect(0, 0, w, h);

      for (const flake of flakes) {
        flake.y += flake.speed;
        flake.x += flake.drift;

        if (flake.y > h + 4) {
          Object.assign(flake, createFlake(w, h, false));
        } else if (flake.x < -4) {
          flake.x = w + 4;
        } else if (flake.x > w + 4) {
          flake.x = -4;
        }

        context.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
        context.fillRect(Math.floor(flake.x), Math.floor(flake.y), flake.size, flake.size);
      }

      animationId = requestAnimationFrame(tick);
    }

    resize();
    tick();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden
    />
  );
}
