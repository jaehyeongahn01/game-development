import { bodyHeight } from '../logic/body.ts';
import { type Vec, v } from '../logic/geom.ts';
import { type Pose, computeJoints } from '../logic/stickman.ts';
import type { StageDef } from '../logic/stages.ts';
import { drawStickman } from './draw.ts';

/** 스테이지별 전투 이펙트. 시간만으로 결정되는 절차적 효과라서 상태를 따로 저장하지 않는다. */

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
export type FxLayer = 'back' | 'front';

interface Ctx2 {
  ctx: CanvasRenderingContext2D;
  pose: Pose;
  center: Vec;
  /** 몸 높이(이펙트 크기 기준) */
  H: number;
  time: number;
  a: number;
  stage: StageDef;
}

function ribbon(ctx: CanvasRenderingContext2D, x0: number, y0: number, h: number, sway: number, t: number, seed: number, w: number): void {
  const n = 14;
  ctx.beginPath();
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x0 + Math.sin(t * 1.7 + seed + u * 5) * sway * (0.3 + u);
    const y = y0 - h * u;
    const ww = w * (1 - u) ** 0.8;
    left.push(v(x - ww, y));
    right.push(v(x + ww, y));
  }
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c0: string, c1 = 'rgba(0,0,0,0)'): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function afterimages(f: Ctx2, tint: string, rim: string, count: number, gap: number, alpha: number): void {
  const { ctx, pose } = f;
  for (let i = count; i >= 1; i--) {
    const wob = Math.sin(f.time * 3 + i) * 5;
    const g: Pose = { ...pose, pelvis: v(pose.pelvis.x + i * gap + wob, pose.pelvis.y) };
    drawStickman(ctx, g, { alpha: f.a * alpha * (1 - (i - 1) / (count + 0.5)), body: tint, rim, eyes: false });
  }
}

function snowflake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}

function bolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const n = 9;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const off = (hash(seed + i * 3.1) - 0.5) * 60 * Math.sin(u * Math.PI);
    ctx.lineTo(x0 + (x1 - x0) * u + off, y0 + (y1 - y0) * u);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function drawStageFx(ctx: CanvasRenderingContext2D, stage: StageDef, pose: Pose, time: number, layer: FxLayer, alpha = 1): void {
  if (stage.fx === 'none' || alpha <= 0.01) return;
  const J = computeJoints(pose);
  const center = v((J.pelvis.x + J.neck.x) / 2, (J.pelvis.y + J.neck.y) / 2);
  const D = pose.dims;
  const H = D.thigh + D.shin + D.torso + D.headR * 2;
  const f: Ctx2 = { ctx, pose, center, H, time, a: alpha, stage };
  const floor = Math.max(J.foot[0].y, J.foot[1].y);
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (stage.fx) {
    case 'blue':
      if (layer === 'back') {
        afterimages(f, '#1b3a7a', 'rgba(110,190,255,0.8)', 3, 34, 0.28);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(100,190,255,0.5)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const ph = (time * 0.7 + i * 0.25) % 1;
          const y = center.y - H * 0.35 + i * H * 0.22;
          ctx.globalAlpha = alpha * (1 - ph) * 0.7;
          ctx.beginPath();
          ctx.arc(center.x + 80 + ph * 70, y, 60 + i * 12, Math.PI * 0.8, Math.PI * 1.25);
          ctx.stroke();
        }
      }
      break;
    case 'red':
      if (layer === 'back') {
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, center.y, H * 0.6, 'rgba(255,40,50,0.16)');
        ctx.fillStyle = 'rgba(255,50,60,0.42)';
        for (let i = 0; i < 4; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          ribbon(ctx, center.x + side * (50 + (i >> 1) * 16), floor - 40, H * (0.55 + 0.1 * (i >> 1)), 26, time, i * 2.3, 9);
        }
      }
      break;
    case 'violet':
      if (layer === 'back') {
        afterimages(f, '#2a1650', 'rgba(190,140,255,0.8)', 4, 26, 0.3);
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x + 40, center.y, H * 0.5, 'rgba(150,90,255,0.14)');
        ctx.fillStyle = 'rgba(170,110,255,0.3)';
        ribbon(ctx, center.x - 70, floor - 20, H * 0.45, 22, time, 1.7, 8);
      }
      break;
    case 'gold':
      if (layer === 'back') {
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, center.y, H * 0.75, 'rgba(255,190,60,0.2)');
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const a0 = time * (0.9 + i * 0.25) + i * 2.1;
          ctx.strokeStyle = `rgba(255,${190 + i * 14},90,${0.55 - i * 0.12})`;
          ctx.lineWidth = 5 - i;
          ctx.shadowColor = '#FFB020';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.ellipse(center.x, center.y + i * 20 - 20, H * (0.42 + i * 0.07), H * (0.13 + i * 0.03), -0.25 + i * 0.2, a0, a0 + Math.PI * 1.1);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,210,110,0.9)';
        for (let i = 0; i < 22; i++) {
          const ph = (time * 0.35 + hash(i)) % 1;
          ctx.globalAlpha = alpha * (1 - ph) * 0.8;
          ctx.beginPath();
          ctx.arc(center.x + (hash(i + 9) - 0.5) * H * 0.9, floor - ph * H * 1.05, 1.6 + hash(i + 3) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'frost':
      if (layer === 'back') {
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, floor - 10, H * 0.5, 'rgba(150,215,255,0.16)');
        ctx.fillStyle = 'rgba(180,230,255,0.4)';
        for (let i = 0; i < 7; i++) {
          const x = center.x - 80 + i * 26 + (hash(i) - 0.5) * 12;
          const h = 22 + hash(i + 5) * 34;
          ctx.beginPath();
          ctx.moveTo(x - 7, floor + 2);
          ctx.lineTo(x, floor - h);
          ctx.lineTo(x + 7, floor + 2);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(220,245,255,0.9)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 16; i++) {
          const ph = (time * 0.16 + hash(i)) % 1;
          ctx.globalAlpha = alpha * Math.sin(ph * Math.PI) * 0.9;
          snowflake(ctx, center.x + (hash(i + 7) - 0.5) * H * 1.1 + Math.sin(time + i) * 10, floor - H - 20 + ph * (H + 30), 4 + hash(i + 2) * 6, time * 0.6 + i);
        }
      }
      break;
    case 'ember':
      if (layer === 'back') {
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, center.y + 30, H * 0.55, 'rgba(255,110,30,0.14)');
        ctx.fillStyle = 'rgba(255,120,40,0.18)';
        ribbon(ctx, center.x + 60, floor - 30, H * 0.7, 28, time, 0.5, 18);
        ribbon(ctx, center.x - 70, floor - 30, H * 0.55, 24, time, 3.1, 14);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 30; i++) {
          const ph = (time * (0.25 + hash(i) * 0.25) + hash(i + 11)) % 1;
          const x = center.x + (hash(i + 4) - 0.5) * H * 0.9 + Math.sin(time * 2 + i) * 14;
          ctx.globalAlpha = alpha * (1 - ph) * 0.95;
          ctx.fillStyle = hash(i + 6) > 0.5 ? '#FFB347' : '#FF6A1A';
          ctx.beginPath();
          ctx.arc(x, floor - ph * H * 1.1, 1.5 + hash(i + 8) * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'ghost':
      if (layer === 'back') {
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, center.y, H * 0.6, 'rgba(60,230,140,0.12)');
        ctx.fillStyle = 'rgba(70,230,150,0.2)';
        ribbon(ctx, center.x - 60, floor - 10, H * 0.85, 34, time, 0.9, 20);
        ribbon(ctx, center.x + 70, floor - 10, H * 0.75, 30, time, 2.6, 18);
        ctx.fillStyle = 'rgba(60,200,140,0.12)';
        ribbon(ctx, center.x + 10, floor - 10, H * 0.95, 40, time, 4.4, 26);
      }
      break;
    case 'lightning':
      if (layer === 'back') {
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, center.y, H * 0.65, 'rgba(150,100,255,0.14)');
      } else {
        const tick = Math.floor(time * 9);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.shadowColor = '#9A6BFF';
        ctx.shadowBlur = 14;
        for (let i = 0; i < 4; i++) {
          if (hash(tick * 1.7 + i * 5.3) < 0.35) continue;
          const side = hash(tick + i) < 0.5 ? -1 : 1;
          const x0 = center.x + side * (50 + hash(tick * 2 + i) * 70);
          const y0 = center.y - H * (0.1 + hash(tick * 3 + i) * 0.5);
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = '#C9B0FF';
          ctx.lineWidth = 2.6;
          bolt(ctx, x0, y0, x0 + side * (30 + hash(tick + i * 7) * 50), floor + 4, tick * 11 + i);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          bolt(ctx, x0, y0, x0 + side * (30 + hash(tick + i * 7) * 50), floor + 4, tick * 11 + i);
        }
      }
      break;
    case 'eclipse':
      if (layer === 'back') {
        const pulse = 0.85 + 0.15 * Math.sin(time * 2.2);
        radial(ctx, center.x, center.y, H * 0.85 * pulse, 'rgba(120,0,20,0.42)');
        ctx.globalCompositeOperation = 'lighter';
        radial(ctx, center.x, center.y, H * 0.5, 'rgba(255,40,50,0.12)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(90,0,14,0.5)';
        for (let i = 0; i < 5; i++) {
          const x = center.x + (i - 2) * 46 + Math.sin(time * 0.8 + i) * 18;
          ctx.beginPath();
          ctx.ellipse(x, floor + 4, 60, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(200,16,36,0.5)' : 'rgba(14,0,6,0.65)';
          ribbon(ctx, center.x + (i - 1.5) * 52, floor - 10, H * (0.7 + 0.12 * (i % 2)), 38, time, i * 1.9, 12);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,70,80,0.9)';
        for (let i = 0; i < 18; i++) {
          const ph = (time * 0.3 + hash(i)) % 1;
          ctx.globalAlpha = alpha * (1 - ph);
          ctx.beginPath();
          ctx.arc(center.x + (hash(i + 5) - 0.5) * H * 0.9, floor - ph * H, 1.5 + hash(i + 2) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    default:
      break;
  }
  ctx.restore();
}

/** 매화도 폭발 꽃: 꽃잎 5장짜리 꽃. 피어날 때는 작게, 터질 때는 크게 그린다. */
export function drawBlossom(ctx: CanvasRenderingContext2D, c: Vec, r: number, rot: number, color: string, glow: string, alpha: number): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = color;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(r * 0.55, 0, r * 0.45, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, r * 0.14), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 매화도를 장착했을 때 캐릭터 주변에 흩날리는 분홍 꽃잎(절차적, 상태 없음) */
export function drawPetalAura(ctx: CanvasRenderingContext2D, pose: Pose, time: number): void {
  const J = computeJoints(pose);
  const cx = (J.pelvis.x + J.neck.x) / 2;
  const cy = (J.pelvis.y + J.neck.y) / 2;
  const H = bodyHeight(pose.dims);
  ctx.save();
  ctx.fillStyle = '#FFB8D8';
  for (let i = 0; i < 10; i++) {
    const ph = (time * (0.12 + hash(i) * 0.1) + hash(i + 3)) % 1;
    const ang = hash(i + 6) * Math.PI * 2 + time * 0.6;
    const x = cx + Math.cos(ang) * (0.35 + 0.3 * hash(i + 9)) * H;
    const y = cy + Math.sin(ang) * 0.5 * H + (ph - 0.5) * H * 0.3;
    ctx.globalAlpha = 0.7 * Math.sin(ph * Math.PI);
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + hash(i + 2) * 3, 2, time * 1.5 + i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
