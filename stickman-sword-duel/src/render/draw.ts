import { CONFIG } from '../logic/config.ts';
import { type Vec, dist, lerpV } from '../logic/geom.ts';
import { type HandleId, type Pose, HANDLE_IDS, computeJoints, handlePos } from '../logic/stickman.ts';
import { widthsOf } from '../logic/body.ts';

export const COLORS = {
  bg: '#0D1323',
  panel: '#283A57',
  attack: '#F0505B',
  attackBright: '#FF4F5E',
  mine: '#35E3FF',
  defense: '#91B9FF',
  text: '#F1EDF4',
  body: '#0B0B0F',
  rim: 'rgba(150,180,235,0.75)',
};

export const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Nanum Gothic",sans-serif';

export function partialPolyline(pts: Vec[], upTo: number): Vec[] {
  if (pts.length === 0) return [];
  const out: Vec[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (acc + seg >= upTo) {
      if (seg > 0) out.push(lerpV(pts[i - 1], pts[i], (upTo - acc) / seg));
      return out;
    }
    out.push(pts[i]);
    acc += seg;
  }
  return out;
}

export interface EyeStyle {
  color: string;
  /** 눈 크기 배율 */
  scale: number;
}

interface StickOpts {
  alpha?: number;
  body?: string;
  rim?: string;
  eyes?: boolean;
  eye?: EyeStyle;
}

/** 체형(pose.dims)에 맞춰 그린다. 굵기와 머리 크기는 판정 반지름과 같은 값에서 나온다. */
export function drawStickman(ctx: CanvasRenderingContext2D, pose: Pose, o: StickOpts = {}): void {
  const J = computeJoints(pose);
  const D = pose.dims;
  const W = widthsOf(D);
  const body = o.body ?? COLORS.body;
  const rim = o.rim ?? COLORS.rim;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const lines: { pts: Vec[]; w: number }[] = [
    { pts: [J.pelvis, J.neck], w: W.torso },
    { pts: [J.hip[0], J.hip[1]], w: W.hip },
    { pts: [J.shoulder[0], J.shoulder[1]], w: W.shoulder },
    { pts: [J.shoulder[0], J.elbow[0], J.hand[0]], w: W.arm },
    { pts: [J.shoulder[1], J.elbow[1], J.hand[1]], w: W.arm },
    { pts: [J.hip[0], J.knee[0], J.foot[0]], w: W.leg },
    { pts: [J.hip[1], J.knee[1], J.foot[1]], w: W.leg },
  ];
  const trace = (pts: Vec[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  const ends: { p: Vec; r: number }[] = [
    { p: J.hand[0], r: W.hand },
    { p: J.hand[1], r: W.hand },
    { p: J.foot[0], r: W.foot },
    { p: J.foot[1], r: W.foot },
  ];
  ctx.strokeStyle = rim;
  for (const l of lines) {
    ctx.lineWidth = l.w + 3.5;
    trace(l.pts);
    ctx.stroke();
  }
  ctx.fillStyle = rim;
  for (const e of ends) {
    ctx.beginPath();
    ctx.arc(e.p.x, e.p.y, e.r + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(J.headC.x, J.headC.y, D.headR + 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = body;
  ctx.fillStyle = body;
  for (const l of lines) {
    ctx.lineWidth = l.w;
    trace(l.pts);
    ctx.stroke();
  }
  for (const e of ends) {
    ctx.beginPath();
    ctx.arc(e.p.x, e.p.y, e.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(J.headC.x, J.headC.y, D.headR, 0, Math.PI * 2);
  ctx.fill();

  if (o.eyes !== false) drawEyes(ctx, J.headC, pose.torso + pose.head, D.headR, o.eye ?? { color: '#FFFFFF', scale: 1 });
  ctx.restore();
}

const TITLE_EDGE = '#4F7FCB';

/** 시작 화면 전용: 목에 두른 머플러. 두 가닥이 바람에 날려 뒤(왼쪽)로 펄럭인다. */
export function drawTitleScarf(ctx: CanvasRenderingContext2D, neck: Vec, time: number): void {
  const w = (k: number) => Math.sin(time * 2.4 + k) * 3;
  ctx.save();
  ctx.translate(neck.x, neck.y);
  ctx.fillStyle = '#0C1226';
  ctx.strokeStyle = TITLE_EDGE;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  const tail = (sx: number, sy: number, cx1: number, cy1: number, tx: number, ty: number, cx2: number, cy2: number, ex: number, ey: number) => {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx1, cy1, tx, ty);
    ctx.quadraticCurveTo(cx2, cy2, ex, ey);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  tail(-6, 0, -50, -34 + w(0), -123, -5 + w(1) * 1.5, -80, -8 + w(0.5), -10, 12);
  tail(-8, 8, -70, 12 + w(2), -114, 51 + w(3) * 1.5, -80, 28 + w(2.5), -8, 18);
  // 목을 감은 고리
  ctx.beginPath();
  ctx.ellipse(2, 5, 17, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 시작 화면 전용: 어깨에 걸쳐 오른쪽 뒤로 늘어진 망토 뒷면(몸 뒤에 먼저 그린다). 아랫단은 박쥐 날개처럼 뾰족하게 갈라진다. */
export function drawTitleCape(ctx: CanvasRenderingContext2D, neck: Vec, time: number): void {
  const sw = (x: number, y: number): [number, number] => [x, y + Math.sin(time * 2 + x * 0.04) * 3 * (x / 176)];
  const Q = (cx: number, cy: number, x: number, y: number) => {
    const c = sw(cx, cy);
    const p = sw(x, y);
    ctx.quadraticCurveTo(c[0], c[1], p[0], p[1]);
  };
  ctx.save();
  ctx.translate(neck.x, neck.y);
  ctx.lineJoin = 'round';
  const g = ctx.createLinearGradient(0, 0, 176, 150);
  g.addColorStop(0, '#0E1530');
  g.addColorStop(1, '#2E3C73');
  ctx.fillStyle = g;
  ctx.strokeStyle = TITLE_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, 16);
  ctx.quadraticCurveTo(-8, -2, 26, 4);
  Q(70, 20, 144, 48);
  Q(128, 50, 124, 62);
  Q(150, 62, 176, 100);
  Q(140, 100, 134, 128);
  Q(150, 140, 131, 166);
  Q(108, 150, 86, 125);
  Q(96, 135, 93, 150);
  Q(60, 130, 13, 86);
  ctx.quadraticCurveTo(-18, 50, -24, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 주름선
  ctx.strokeStyle = 'rgba(120,150,230,0.28)';
  ctx.lineWidth = 1.5;
  for (const [ex, ey, cx, cy] of [[125, 60, 70, 30], [140, 110, 60, 60], [100, 140, 40, 80]]) {
    ctx.beginPath();
    ctx.moveTo(20, 10);
    const c = sw(cx, cy);
    const e = sw(ex, ey);
    ctx.quadraticCurveTo(c[0], c[1], e[0], e[1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** 시작 화면 전용: 망토 깃과 목 단추(몸 위에 그린다). */
export function drawTitleCapeCollar(ctx: CanvasRenderingContext2D, neck: Vec): void {
  ctx.save();
  ctx.translate(neck.x, neck.y);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#141C3C';
  ctx.strokeStyle = TITLE_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-26, 18);
  ctx.lineTo(-18, -4);
  ctx.lineTo(0, 8);
  ctx.lineTo(24, -10);
  ctx.lineTo(32, 14);
  ctx.quadraticCurveTo(4, 24, -26, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6A7288';
  ctx.strokeStyle = '#0B0B0F';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(3, 10, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 머리 중심 c, 기울기 rot 에 빛나는 두 눈을 그린다. */
export function drawEyes(ctx: CanvasRenderingContext2D, c: Vec, rot: number, headR: number, eye: EyeStyle): void {
  const k = (headR / 36) * eye.scale;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rot);
  ctx.fillStyle = eye.color;
  ctx.shadowColor = eye.color;
  ctx.shadowBlur = 8 + 6 * eye.scale;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * 22 * k, -4 * k);
    ctx.lineTo(sgn * 5 * k, 5 * k);
    ctx.lineTo(sgn * 8 * k, 8 * k);
    ctx.lineTo(sgn * 21 * k, 1 * k);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export interface BladeStyle {
  color: string;
  glow: string;
  length: number;
  width: number;
  heavy?: boolean;
}

/** from(손 위치)에서 ang 방향으로 뻗은 검 */
export function drawBlade(ctx: CanvasRenderingContext2D, from: Vec, ang: number, sw: BladeStyle, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(from.x, from.y);
  ctx.rotate(ang);
  ctx.shadowColor = sw.glow;
  ctx.shadowBlur = sw.heavy ? 30 : 16;
  const hw = sw.width;
  const L = sw.length;
  const tip = L * (sw.heavy ? 0.12 : 0.2);
  const g = ctx.createLinearGradient(0, -hw, 0, hw);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.5, sw.color);
  g.addColorStop(1, sw.glow);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -hw);
  ctx.lineTo(L - tip, -hw);
  ctx.lineTo(L, sw.heavy ? hw * 0.5 : 0);
  ctx.lineTo(L - tip, hw);
  ctx.lineTo(0, hw);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#10131f';
  const gh = Math.max(5, hw);
  ctx.fillRect(-26, -gh, 26, gh * 2);
  ctx.fillRect(-2, -(hw + 8), sw.heavy ? 10 : 6, (hw + 8) * 2);
  ctx.restore();
}

export function drawHandles(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  active: HandleId | null,
  hover: HandleId | null,
  time: number,
): void {
  ctx.save();
  for (const id of HANDLE_IDS) {
    const p = handlePos(pose, id);
    const on = id === active || id === hover;
    const r = on ? 11 : 8.5;
    const pulse = 0.6 + 0.4 * Math.sin(time * 4 + p.x * 0.05);
    ctx.shadowColor = COLORS.mine;
    ctx.shadowBlur = on ? 22 : 10 + pulse * 6;
    ctx.fillStyle = on ? '#BFE0FF' : '#0B1A33';
    ctx.strokeStyle = on ? '#FFFFFF' : '#62E6FF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** 발광하는 검격 궤적. color = 외곽 발광색, core = 중심선 색 */
export function drawSlash(
  ctx: CanvasRenderingContext2D,
  pts: Vec[],
  color: string,
  alpha = 1,
  tip = true,
  ws = 1,
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 34 * ws;
  ctx.globalAlpha = alpha * 0.45;
  ctx.lineWidth = 22 * ws;
  trace();
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.9;
  ctx.shadowBlur = 16 * ws;
  ctx.lineWidth = 9 * ws;
  trace();
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#FFFFFF';
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 8 * ws;
  ctx.lineWidth = Math.max(1.2, 3.2 * ws);
  trace();
  ctx.stroke();
  if (tip) {
    const e = pts[pts.length - 1];
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 7 * ws, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 1인칭 시점에서 오른쪽 아래에 보이는 검 */
export function drawSword(ctx: CanvasRenderingContext2D, alpha: number, tip?: Vec): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const W = CONFIG.arena.w;
  const H = CONFIG.arena.h;
  const gx = W - 70;
  const gy = H + 10;
  ctx.translate(gx, gy);
  if (tip) {
    // 휘두르는 동안 칼끝이 검격의 끝점을 따라간다.
    const dx = tip.x - gx;
    const dy = tip.y - gy;
    ctx.rotate(Math.atan2(dx, -dy));
    const k = Math.min(2.2, Math.max(0.6, Math.hypot(dx, dy) / 372));
    ctx.scale(1, k);
  } else {
    ctx.rotate(-0.62);
  }
  // 칼날
  const g = ctx.createLinearGradient(-26, 0, 26, 0);
  g.addColorStop(0, '#2b3350');
  g.addColorStop(0.45, '#e9eefc');
  g.addColorStop(0.55, '#9aa6c8');
  g.addColorStop(1, '#262c44');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-22, -90);
  ctx.lineTo(-20, -330);
  ctx.lineTo(0, -372);
  ctx.lineTo(22, -330);
  ctx.lineTo(24, -90);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,210,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 날밑
  ctx.fillStyle = '#10131f';
  ctx.strokeStyle = '#6b7aa6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(1, -84, 52, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 손잡이
  ctx.fillStyle = '#0c0e18';
  ctx.fillRect(-20, -70, 42, 150);
  ctx.strokeStyle = '#3a4468';
  ctx.lineWidth = 2;
  for (let y = -62; y < 76; y += 20) {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.lineTo(22, y + 14);
    ctx.stroke();
  }
  ctx.restore();
}

export function chamfer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number): void {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  o: {
    size?: number;
    weight?: string;
    color?: string;
    align?: CanvasTextAlign;
    base?: CanvasTextBaseline;
    glow?: string;
    italic?: boolean;
    alpha?: number;
  } = {},
): void {
  ctx.save();
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? '600'} ${o.size ?? 18}px ${FONT}`;
  ctx.fillStyle = o.color ?? COLORS.text;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'middle';
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.glow) {
    ctx.shadowColor = o.glow;
    ctx.shadowBlur = 14;
  }
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** 머리 위에 표시되는 몸 회전 버튼. 끌어서 몸 전체를 골반 기준으로 돌린다. */
export function drawRotateButton(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  from: Vec,
  active: boolean,
  hover: boolean,
  time: number,
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(145,185,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const on = active || hover;
  ctx.shadowColor = COLORS.defense;
  ctx.shadowBlur = on ? 24 : 12;
  ctx.fillStyle = on ? '#16305e' : '#0B1A33';
  ctx.strokeStyle = on ? '#FFFFFF' : COLORS.defense;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 회전 화살표
  ctx.translate(pos.x, pos.y);
  ctx.rotate(active ? 0 : time * 0.9);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0.4, Math.PI * 1.75);
  ctx.stroke();
  const ex = Math.cos(Math.PI * 1.75) * 9;
  const ey = Math.sin(Math.PI * 1.75) * 9;
  ctx.beginPath();
  ctx.moveTo(ex + 5, ey - 1);
  ctx.lineTo(ex - 4, ey - 5);
  ctx.lineTo(ex - 2, ey + 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
