// FILE: src/ui/FeaturedRunCanvas.tsx

import { useRef, useEffect } from 'react';
import type { FeaturedRun } from '../game/types';

// ─── Canvas constants ─────────────────────────────────────────────────────────

const CANVAS_W = 640;
const CANVAS_H = 180;
const GROUND_Y = 140;

const ADV_START_X = 30;
const ADV_END_X = 608;
const ADV_W = 20;
const ADV_H = 28;

const SPEED_PX_SEC = 90; // pixels per second

// Timing
const RESULT_HOLD_MS = 2200;  // how long to show SUCCESS/FAIL text before closing
const SHAKE_DURATION_MS = 1500;

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function obsScreenX(xFraction: number): number {
  return ADV_START_X + xFraction * (ADV_END_X - ADV_START_X);
}

function drawGround(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(CANVAS_W, GROUND_Y);
  ctx.stroke();
}

function drawExit(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ADV_END_X, GROUND_Y - 50);
  ctx.lineTo(ADV_END_X, GROUND_Y);
  ctx.stroke();

  ctx.fillStyle = '#22c55e';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', ADV_END_X, GROUND_Y - 56);
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  kind: 'SLIME' | 'SPIKES' | 'GOBLIN',
  x: number,
  highlight: boolean,
) {
  ctx.save();

  if (kind === 'SLIME') {
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y - 10, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'SPIKES') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(x - 12, GROUND_Y);
    ctx.lineTo(x, GROUND_Y - 28);
    ctx.lineTo(x + 12, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  } else {
    // GOBLIN
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x - 12, GROUND_Y - 24, 24, 24);
    // eyes
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - 7, GROUND_Y - 20, 4, 4);
    ctx.fillRect(x + 3, GROUND_Y - 20, 4, 4);
  }

  if (highlight) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 16, GROUND_Y - 32, 32, 34);
  }

  ctx.restore();
}

function drawAdventurer(ctx: CanvasRenderingContext2D, advX: number) {
  ctx.save();
  // body
  ctx.fillStyle = '#646cff';
  ctx.fillRect(advX - ADV_W / 2, GROUND_Y - ADV_H, ADV_W, ADV_H);
  // head
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.ellipse(advX, GROUND_Y - ADV_H - 8, 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Eased scale for the stamp: 0→1 maps from 0.8 → 1.1 → 1.0 (overshoot then settle)
function stampScale(t: number): number {
  if (t <= 0) return 0.8;
  if (t >= 1) return 1.0;
  if (t < 0.6) return 0.8 + (t / 0.6) * 0.3; // 0.8 → 1.1
  return 1.1 - ((t - 0.6) / 0.4) * 0.1;       // 1.1 → 1.0
}

// ─── Scene draw function ──────────────────────────────────────────────────────

function drawScene(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  run: FeaturedRun,
  onClose: () => void,
): void {
  // Clear
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawGround(ctx);
  drawExit(ctx);

  if (run.success) {
    // ── SUCCESS path ──────────────────────────────────────────────────────────
    const travelMs = ((ADV_END_X - ADV_START_X) / SPEED_PX_SEC) * 1000;
    const advX = Math.min(ADV_END_X, ADV_START_X + (elapsed / 1000) * SPEED_PX_SEC);
    const inResultPhase = elapsed >= travelMs;

    // Draw obstacles (highlight briefly when adventurer passes)
    for (const obs of run.obstacles) {
      const ox = obsScreenX(obs.xFraction);
      const passed = advX > ox;
      const justPassed = passed && advX - ox < SPEED_PX_SEC * 0.15; // ~150ms window
      drawObstacle(ctx, obs.kind, ox, justPassed);
    }

    drawAdventurer(ctx, advX);

    if (inResultPhase) {
      const resultElapsed = elapsed - travelMs;

      // Brief white flash on entry
      if (resultElapsed < 300) {
        const flashAlpha = (1 - resultElapsed / 300) * 0.12;
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // Stamp with scale animation
      const scaleT = Math.min(1, resultElapsed / 300);
      const scale = stampScale(scaleT);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 44, CANVAS_W, 72);
      ctx.translate(CANVAS_W / 2, 80);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 60px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SUCCESS!', 0, 0);
      ctx.restore();

      if (resultElapsed >= RESULT_HOLD_MS) onClose();
    }
  } else {
    // ── FAIL path ─────────────────────────────────────────────────────────────
    const firstObs = run.obstacles[0];
    const targetX = obsScreenX(firstObs.xFraction) - ADV_W / 2 - 6;
    const travelMs = ((targetX - ADV_START_X) / SPEED_PX_SEC) * 1000;
    const inShakePhase = elapsed >= travelMs && elapsed < travelMs + SHAKE_DURATION_MS;
    const inResultPhase = elapsed >= travelMs + SHAKE_DURATION_MS;

    // Adventurer x position
    let advX: number;
    if (elapsed < travelMs) {
      advX = ADV_START_X + (elapsed / 1000) * SPEED_PX_SEC;
    } else if (inShakePhase) {
      const shakeT = (elapsed - travelMs) / 1000;
      advX = targetX + Math.sin(shakeT * 25) * 4;
    } else {
      advX = targetX;
    }

    // Draw obstacles (first one gets red highlight during/after impact)
    for (let i = 0; i < run.obstacles.length; i++) {
      const obs = run.obstacles[i];
      const ox = obsScreenX(obs.xFraction);
      drawObstacle(ctx, obs.kind, ox, i === 0 && (inShakePhase || inResultPhase));
    }

    drawAdventurer(ctx, advX);

    // Red flash during shake
    if (inShakePhase) {
      const shakeT = (elapsed - travelMs) / 1000;
      const alpha = Math.abs(Math.sin(shakeT * 4)) * 0.35;
      ctx.fillStyle = `rgba(239,68,68,${alpha})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    if (inResultPhase) {
      const resultElapsed = elapsed - travelMs - SHAKE_DURATION_MS;

      // Brief red flash on result entry
      if (resultElapsed < 200) {
        const flashAlpha = (1 - resultElapsed / 200) * 0.2;
        ctx.fillStyle = `rgba(239,68,68,${flashAlpha})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // Stamp with scale animation
      const scaleT = Math.min(1, resultElapsed / 300);
      const scale = stampScale(scaleT);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 44, CANVAS_W, 72);
      ctx.translate(CANVAS_W / 2, 80);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 60px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FAIL', 0, 0);
      ctx.restore();

      if (resultElapsed >= RESULT_HOLD_MS) onClose();
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  run: FeaturedRun;
  onClose: () => void;
}

export function FeaturedRunCanvas({ run, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime: number | null = null;
    let rafId: number;
    let completed = false;

    const close = () => {
      if (!completed) {
        completed = true;
        onClose();
      }
    };

    function frame(ts: number) {
      if (completed) return;
      if (startTime === null) startTime = ts;
      drawScene(ctx!, ts - startTime, run, close);
      if (!completed) rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      completed = true;
      cancelAnimationFrame(rafId);
    };
  }, [run, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div style={{ fontSize: '1rem', color: '#c084fc', marginBottom: '12px', fontWeight: 'bold' }}>
        ⭐ Featured Commission — {run.itemType} ({run.tier})
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          width: 'min(90vw, 700px)',
          height: 'auto',
          border: '2px solid #7c3aed',
          borderRadius: '12px',
          boxShadow: '0 0 30px rgba(124,58,237,0.3)',
        }}
      />
      <button onClick={onClose} style={{ marginTop: '16px', padding: '6px 20px' }}>
        Skip
      </button>
    </div>
  );
}
