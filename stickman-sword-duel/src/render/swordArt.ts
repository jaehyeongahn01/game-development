import type { SwordDef } from '../logic/swords.ts';

/** 카드에 그리는 검 그림: 휜 도신, 손잡이, 그리고 검마다 다른 기운(바람, 달, 얼음, 불꽃, 번개...) */
export function drawSwordArt(ctx: CanvasRenderingContext2D, sw: SwordDef, cx: number, cy: number, size: number, time: number, locked = false): void {
  ctx.save();
  if (locked) ctx.globalAlpha = 0.28;
  if (!locked) drawAura(ctx, sw, cx, cy, size, time);

  const P0 = { x: cx - 0.5 * size, y: cy + 0.3 * size };
  const P2 = { x: cx + 0.5 * size, y: cy - 0.3 * size };
  const C = { x: cx + 0.04 * size, y: cy + 0.12 * size };
  const pt = (t: number) => ({
    x: (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * C.x + t * t * P2.x,
    y: (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * C.y + t * t * P2.y,
  });
  const nrm = (t: number) => {
    const dx = 2 * (1 - t) * (C.x - P0.x) + 2 * t * (P2.x - C.x);
    const dy = 2 * (1 - t) * (C.y - P0.y) + 2 * t * (P2.y - C.y);
    const n = Math.hypot(dx, dy) || 1;
    return { x: -dy / n, y: dx / n };
  };

  // 손잡이
  const t0 = 0.27;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#10131f';
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const p = pt((t0 * i) / 10);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.strokeStyle = locked ? '#7f8aa6' : sw.glow;
  ctx.lineWidth = 1.6;
  for (let i = 1; i < 6; i++) {
    const t = (t0 * i) / 6.4;
    const p = pt(t);
    const n = nrm(t);
    ctx.beginPath();
    ctx.moveTo(p.x - n.x * size * 0.022, p.y - n.y * size * 0.022);
    ctx.lineTo(p.x + n.x * size * 0.022, p.y + n.y * size * 0.022);
    ctx.stroke();
  }
  // 날밑
  const tp = pt(t0);
  const tn = nrm(t0);
  ctx.strokeStyle = '#1b2033';
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.moveTo(tp.x - tn.x * size * 0.06, tp.y - tn.y * size * 0.06);
  ctx.lineTo(tp.x + tn.x * size * 0.06, tp.y + tn.y * size * 0.06);
  ctx.stroke();
  ctx.strokeStyle = locked ? '#7f8aa6' : sw.glow;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 도신
  const wmax = size * (sw.heavy ? 0.05 : 0.036);
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = t0 + ((1 - t0) * i) / 28;
    const u = (t - t0) / (1 - t0);
    let w = wmax * (1 - 0.3 * u);
    if (u > 0.9) w *= Math.max(0.05, 1 - (u - 0.9) / 0.1);
    const p = pt(t);
    const n = nrm(t);
    left.push({ x: p.x + n.x * w, y: p.y + n.y * w });
    right.push({ x: p.x - n.x * w * 0.7, y: p.y - n.y * w * 0.7 });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  const g = ctx.createLinearGradient(P0.x, P0.y, P2.x, P2.y);
  g.addColorStop(0, sw.glow);
  g.addColorStop(0.5, sw.color);
  g.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = locked ? '#8d97b3' : g;
  ctx.shadowColor = sw.glow;
  ctx.shadowBlur = locked ? 0 : 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(left[1].x, left[1].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function drawAura(ctx: CanvasRenderingContext2D, sw: SwordDef, cx: number, cy: number, size: number, time: number): void {
  const r = size * 0.62;
  const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gl.addColorStop(0, hexA(sw.glow, 0.32));
  gl.addColorStop(1, hexA(sw.glow, 0));
  ctx.fillStyle = gl;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const wob = (k: number) => Math.sin(time * 2 + k);
  switch (sw.index) {
    case 0: // 안개
      ctx.fillStyle = 'rgba(190,200,225,0.12)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx - size * 0.3 + i * size * 0.2, cy + size * 0.1 + wob(i) * 4, size * 0.16, size * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 1: // 바람
      ctx.strokeStyle = hexA(sw.glow, 0.55);
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const y = cy - size * 0.2 + i * size * 0.14;
        ctx.moveTo(cx - size * 0.5, y + wob(i) * 3);
        ctx.bezierCurveTo(cx - size * 0.2, y - size * 0.12, cx + size * 0.1, y + size * 0.1, cx + size * 0.45, y - size * 0.06 + wob(i + 1) * 3);
        ctx.stroke();
      }
      break;
    case 2: // 붉은 달
      ctx.fillStyle = hexA('#B01B28', 0.55);
      ctx.beginPath();
      ctx.arc(cx - size * 0.16, cy - size * 0.1, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      sparks(ctx, sw.glow, cx, cy, size, time, 10);
      break;
    case 3: // 보랏빛 안개
      ctx.strokeStyle = hexA(sw.glow, 0.5);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + wob(i) * 6, cy + (i - 1) * size * 0.1, size * (0.26 + i * 0.07), Math.PI * 0.9, Math.PI * 1.8);
        ctx.stroke();
      }
      break;
    case 4: // 금빛 기운
      ctx.strokeStyle = hexA(sw.glow, 0.7);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx - size * 0.05, cy, size * 0.32 + wob(0) * 2, 0, Math.PI * 2);
      ctx.stroke();
      sparks(ctx, '#FFD76A', cx, cy, size, time, 12);
      break;
    case 5: // 얼음 결정
      ctx.fillStyle = hexA('#BFEFFF', 0.6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const rr = size * (0.3 + 0.05 * (i % 2));
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 12);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 6: // 불꽃
      for (let i = 0; i < 9; i++) {
        const ph = (time * 0.7 + i * 0.37) % 1;
        const x = cx - size * 0.35 + (i / 8) * size * 0.7;
        const y = cy + size * 0.2 - ph * size * 0.45;
        ctx.fillStyle = hexA(i % 2 ? '#FFB347' : '#FF5A1F', 0.7 * (1 - ph));
        ctx.beginPath();
        ctx.moveTo(x, y - 12 * (1 - ph) - 4);
        ctx.quadraticCurveTo(x + 8, y, x, y + 6);
        ctx.quadraticCurveTo(x - 8, y, x, y - 12 * (1 - ph) - 4);
        ctx.fill();
      }
      break;
    case 7: // 매화 꽃잎
      for (let i = 0; i < 6; i++) {
        const ph = (time * 0.4 + i * 0.17) % 1;
        const x = cx - size * 0.4 + (i / 5) * size * 0.8 + wob(i) * 5;
        const y = cy - size * 0.3 + ph * size * 0.6;
        ctx.fillStyle = hexA('#FFB8D8', 0.7 * Math.sin(ph * Math.PI));
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 3.2, time * 1.5 + i, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 8: // 번개
      ctx.strokeStyle = hexA('#BFC8FF', 0.9);
      ctx.lineWidth = 2;
      ctx.shadowColor = sw.glow;
      ctx.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        if (Math.sin(time * 6 + i * 2.1) < -0.2) continue;
        const sx = cx - size * 0.3 + i * size * 0.3;
        ctx.beginPath();
        ctx.moveTo(sx, cy - size * 0.35);
        ctx.lineTo(sx + 8, cy - size * 0.22);
        ctx.lineTo(sx - 4, cy - size * 0.12);
        ctx.lineTo(sx + 9, cy + 0.02 * size);
        ctx.stroke();
      }
      break;
    case 9: // 월식
      ctx.fillStyle = '#05060c';
      ctx.beginPath();
      ctx.arc(cx - size * 0.25, cy - size * 0.12, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA('#FF3D52', 0.9);
      ctx.lineWidth = 3;
      ctx.shadowColor = '#FF3D52';
      ctx.shadowBlur = 14;
      ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
}

function sparks(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, size: number, time: number, n: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const ph = (time * 0.5 + i * 0.173) % 1;
    const a = i * 2.4;
    ctx.globalAlpha = 0.8 * (1 - ph);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * size * 0.32 * (0.4 + ph), cy + Math.sin(a) * size * 0.22 * (0.4 + ph) - ph * 10, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 스킬을 켰을 때 들고 있는 검에 두르는 기운(오러).
 * from = 손 위치, ang = 검 방향. 검 좌표계(+x가 칼끝 방향)로 그린다.
 */
export function drawBladeAura(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, ang: number, sw: SwordDef, time: number, power = 1, len?: number): void {
  const L = len ?? sw.length;
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pulse = 0.75 + 0.25 * Math.sin(time * 9);
  const a = power * pulse;
  const glow = sw.glow;
  // 기본 광채
  ctx.shadowColor = glow;
  ctx.shadowBlur = 34;
  ctx.strokeStyle = hexA(glow, 0.3 * a);
  ctx.lineWidth = sw.heavy ? 34 : 26;
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(L, 0);
  ctx.stroke();
  ctx.strokeStyle = hexA(glow, 0.55 * a);
  ctx.lineWidth = sw.heavy ? 18 : 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const along = (i: number, speed: number) => (time * speed + i * 0.137) % 1;
  switch (sw.index) {
    case 1: // 바람: 칼날을 감아 도는 곡선
      ctx.strokeStyle = hexA('#DFF8FF', 0.75 * a);
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) {
        const ph = along(i * 2, 0.9);
        const x0 = ph * L * 0.6;
        ctx.beginPath();
        ctx.moveTo(x0, -16 + i * 3);
        ctx.bezierCurveTo(x0 + L * 0.2, -26, x0 + L * 0.3, 26, x0 + L * 0.4, 14 - i * 4);
        ctx.stroke();
      }
      break;
    case 2: // 불씨
      for (let i = 0; i < 14; i++) {
        const ph = along(i, 0.8);
        ctx.fillStyle = hexA(i % 2 ? '#FF8A5C' : '#FF2E3E', 0.9 * (1 - ph) * power);
        ctx.beginPath();
        ctx.arc(rnd(i, 1) * L, -6 - ph * 44 + (rnd(i, 2) - 0.5) * 14, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 3: // 잔상: 어긋난 검 그림자
      for (const k of [-1, 1]) {
        ctx.strokeStyle = hexA('#C9A8FF', 0.42 * a);
        ctx.lineWidth = 4;
        const off = k * (12 + 5 * Math.sin(time * 6));
        ctx.beginPath();
        ctx.moveTo(10 + k * 6, off);
        ctx.lineTo(L + k * 10, off);
        ctx.stroke();
      }
      break;
    case 4: // 금빛 후광과 반짝임
      ctx.strokeStyle = hexA('#FFE9A0', 0.6 * a);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, -14);
      ctx.lineTo(L, -12);
      ctx.moveTo(8, 14);
      ctx.lineTo(L, 12);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ph = along(i, 1.2);
        ctx.fillStyle = hexA('#FFF3B0', (1 - ph) * power);
        ctx.fillRect(rnd(i, 3) * L - 2, (rnd(i, 4) - 0.5) * 38 - 2, 4, 4);
      }
      break;
    case 5: // 얼음 결정
      for (let i = 0; i < 9; i++) {
        const x = (i / 8) * L * 0.95 + 8;
        const y = (i % 2 ? -1 : 1) * (14 + 5 * Math.sin(time * 4 + i));
        ctx.fillStyle = hexA('#DFF8FF', 0.8 * a);
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 3.5, y);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x - 3.5, y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 6: // 불꽃
      for (let i = 0; i < 12; i++) {
        const ph = along(i, 1.0);
        const x = rnd(i, 5) * L;
        const y = -4 - ph * 30;
        const h = 14 * (1 - ph) + 3;
        ctx.fillStyle = hexA(i % 3 ? '#FF7A1A' : '#FFD27A', 0.85 * (1 - ph) * power);
        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.quadraticCurveTo(x + 6, y, x, y + 5);
        ctx.quadraticCurveTo(x - 6, y, x, y - h);
        ctx.fill();
      }
      break;
    case 7: // 매화 꽃잎
      for (let i = 0; i < 8; i++) {
        const ph = along(i, 0.5);
        const x = ph * L;
        const y = Math.sin(time * 3 + i * 1.7) * 20;
        ctx.fillStyle = hexA(i % 2 ? '#FFB8D8' : '#FF8FC2', 0.8 * (1 - Math.abs(ph - 0.5) * 1.6) * power);
        ctx.beginPath();
        ctx.ellipse(x, y, 5, 2.6, time * 2 + i, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 8: { // 번개
      const frame = Math.floor(time * 14);
      ctx.strokeStyle = hexA('#E6EAFF', 0.95 * power);
      ctx.lineWidth = 2;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      for (let k = 0; k < 3; k++) {
        const x0 = rnd(frame + k, 7) * L * 0.7;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        let x = x0;
        let y = 0;
        for (let j = 0; j < 4; j++) {
          x += 10 + rnd(frame + k, 8 + j) * 14;
          y = (rnd(frame * 3 + k, 12 + j) - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 9: // 월식: 붉은 고리와 검은 기운
      ctx.strokeStyle = hexA('#FF3D52', 0.85 * a);
      ctx.lineWidth = 3;
      ctx.shadowColor = '#FF3D52';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(L * 0.72, 0, 20 + 3 * Math.sin(time * 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let i = 0; i < 8; i++) {
        const ph = along(i, 0.7);
        ctx.fillStyle = hexA(i % 2 ? '#FF3D52' : '#40081A', 0.8 * (1 - ph) * power);
        ctx.beginPath();
        ctx.arc(rnd(i, 9) * L, -8 - ph * 30, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    default:
      break;
  }
  ctx.restore();
}
