import { CONFIG } from './config.ts';
import { type Vec, dist, lerpV, v } from './geom.ts';

export function insideRect(p: Vec): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= CONFIG.arena.w && p.y <= CONFIG.arena.h;
}

/** inside -> outside 선분이 전투 영역 경계와 만나는 지점 */
export function clipToArena(inside: Vec, outside: Vec): Vec {
  const W = CONFIG.arena.w;
  const H = CONFIG.arena.h;
  let t = 1;
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  if (outside.x < 0 && dx !== 0) t = Math.min(t, (0 - inside.x) / dx);
  if (outside.x > W && dx !== 0) t = Math.min(t, (W - inside.x) / dx);
  if (outside.y < 0 && dy !== 0) t = Math.min(t, (0 - inside.y) / dy);
  if (outside.y > H && dy !== 0) t = Math.min(t, (H - inside.y) / dy);
  const p = lerpV(inside, outside, Math.max(0, t));
  return v(Math.min(W, Math.max(0, p.x)), Math.min(H, Math.max(0, p.y)));
}

/** 플레이어의 검격 입력. 한 번의 공격 턴에 하나의 연속된 선만 만들 수 있다. */
export class SlashDrawer {
  points: Vec[] = [];
  length = 0;
  drawing = false;
  /** 한 번 그린 뒤(마우스를 떼거나 영역/길이 한계) 초기화 전까지 추가 입력 불가 */
  ended = false;
  /** 이번 턴의 검격 최대 길이(청풍도 잔월이 늘린다) */
  maxLength: number = CONFIG.maxSlashLength;

  reset(): void {
    this.points = [];
    this.length = 0;
    this.drawing = false;
    this.ended = false;
  }

  get remainingRatio(): number {
    return Math.max(0, 1 - this.length / this.maxLength);
  }

  begin(p: Vec): boolean {
    if (this.ended || this.drawing || !insideRect(p)) return false;
    this.points = [p];
    this.length = 0;
    this.drawing = true;
    return true;
  }

  move(p: Vec): void {
    if (!this.drawing) return;
    const last = this.points[this.points.length - 1];
    if (!insideRect(p)) {
      const edge = clipToArena(last, p);
      this.addCapped(last, edge);
      this.finish();
      return;
    }
    if (dist(last, p) < CONFIG.slashSpacing) return;
    this.addCapped(last, p);
  }

  private addCapped(last: Vec, p: Vec): void {
    const d = dist(last, p);
    if (d <= 0) return;
    const remaining = this.maxLength - this.length;
    if (d >= remaining) {
      this.points.push(lerpV(last, p, remaining / d));
      this.length = this.maxLength;
      this.finish();
    } else {
      this.points.push(p);
      this.length += d;
    }
  }

  finish(): void {
    if (this.drawing) {
      this.drawing = false;
      this.ended = true;
    }
  }

  get valid(): boolean {
    return this.length >= CONFIG.minSlashLength && !this.drawing;
  }
}

export type TitleSlashShape = 'line' | 'arc' | 'zigzag';
export const TITLE_SLASH_SHAPES: TitleSlashShape[] = ['line', 'arc', 'zigzag'];
/** 시작 화면 장식용 검격 경로. a -> b 를 잇는 점 목록을 모양별로 만든다. */
export function titleSlashPath(shape: TitleSlashShape, a: Vec, b: Vec, rng: () => number = Math.random): Vec[] {
  const d = dist(a, b) || 1;
  const nx = -(b.y - a.y) / d;
  const ny = (b.x - a.x) / d;
  const side = rng() < 0.5 ? -1 : 1;
  const pts: Vec[] = [];
  if (shape === 'line') {
    for (let i = 0; i <= 24; i++) pts.push(lerpV(a, b, i / 24));
  } else if (shape === 'arc') {
    const o = side * d * (0.28 + 0.18 * rng());
    const c = v((a.x + b.x) / 2 + nx * o * 2, (a.y + b.y) / 2 + ny * o * 2);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const u = 1 - t;
      pts.push(v(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
    }
  } else {
    const n = 5 + Math.floor(rng() * 2);
    const amp = d * (0.12 + 0.06 * rng());
    for (let i = 0; i <= n; i++) {
      const m = i === 0 || i === n ? 0 : i % 2 === 1 ? side : -side;
      const base = lerpV(a, b, i / n);
      pts.push(v(base.x + nx * amp * m, base.y + ny * amp * m));
    }
  }
  return pts;
}
