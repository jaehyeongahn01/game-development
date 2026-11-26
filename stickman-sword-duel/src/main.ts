import bgUrl from './assets/bg.jpg';
import { Sfx } from './audio.ts';
import { CONFIG } from './logic/config.ts';
import { STAGES, STAGE_COUNT, type StageDef } from './logic/stages.ts';
import { type SaveData, isSwordUnlocked, isUnlocked, loadSave, writeSave } from './logic/save.ts';
import { SWORDS, SWORD_COUNT, type SwordDef } from './logic/swords.ts';
import { type AttackPlan, planAttack, resolvePlan, visibleParts } from './logic/skills.ts';
import { drawBladeAura, drawSwordArt } from './render/swordArt.ts';
import { DEF_ANIM, DEF_ANIM_TOTAL, defenseAnimPose } from './logic/anim.ts';
import { bodyHeight } from './logic/body.ts';
import { drawBlossom, drawPetalAura, drawStageFx } from './render/fx.ts';
import { type Vec, v, clamp, lerp, lerpV, normAngle, polyLength } from './logic/geom.ts';
import { type HitInfo, CAT_NAMES } from './logic/combat.ts';
import { SlashDrawer, TITLE_SLASH_SHAPES, titleSlashPath } from './logic/slash.ts';
import { titleEnemyPose, titlePlayerPose } from './logic/poses.ts';
import { type FunnyPlan, chooseDefenseWithFunny, generateAttackSlash, makeFunnyPlan } from './logic/ai.ts';
import {
  type HandleId,
  type Pose,
  bodyParts,
  clonePose,
  dragPose,
  handlePos,
  idlePose,
  lerpPose,
  pickHandle,
  computeJoints,
  rotateDrag,
  applyDrag,
  clampLimits,
} from './logic/stickman.ts';
import {
  COLORS,
  FONT,
  type BladeStyle,
  chamfer,
  drawBlade,
  drawEyes,
  drawHandles,
  drawRotateButton,
  drawSlash,
  drawStickman,
  drawTitleCape,
  drawTitleCapeCollar,
  drawTitleScarf,
  drawSword,
  partialPolyline,
  text,
} from './render/draw.ts';

// ------------------------------------------------------------------ 상수/타입

const SW = CONFIG.stage.w;
const SH = CONFIG.stage.h;
const A = CONFIG.arena;
/** 시작 화면 검격 한 차례(파랑 또는 빨강)의 길이(초) */
const TITLE_TURN = 1.7;
/** 상단/하단 UI 패널의 기준 위치(전투 영역과 별개) */
const UI_X = 300;
const UI_W = 1000;
/** 방어 화면에서 멀리 보이는 적의 위치(전투 영역 좌표) */
const FAR = { x: 820, feetY: 335, scale: 0.55 };
/** 공격 화면에서 뒤에서 본 내 모습(앞쪽 왼쪽 아래) */
const NEAR = { x: -388, feetY: 524, scale: 1.375 };
/** 사선 시점: 가로 압축 비율과 바닥 기울기(공격 +, 방어 -) */
/** 전투 영역(네모칸)의 화면상 위치/크기. 공격: 오른쪽으로 작게(내가 왼쪽 앞), 방어: 왼쪽으로(적이 오른쪽 멀리) */
const FRAME_ATK = { x: 760, y: 326, s: 0.8 };
const FRAME_DEF = { x: 330, y: 230, s: 1 };
/** 보스 등장 연출 길이(초) */
const INTRO_LEN = 4.7;
/** 적중 연출 한 번의 길이(초) */
const CUT_DUR = 0.22;
/** 배경 속 보름달 위치(월식 연출용) */
const MOON = { x: 1035, y: 185, r: 168 };

type GameState =
  | 'MAIN_MENU'
  | 'STAGE_SELECT'
  | 'SWORD_SELECT'
  | 'BOSS_INTRO'
  | 'PLAYER_ATTACK_PREPARE'
  | 'PLAYER_ATTACK_EXECUTE'
  | 'PLAYER_ATTACK_RESULT'
  | 'PLAYER_DEFENSE_PREPARE'
  | 'AI_ATTACK_EXECUTE'
  | 'PLAYER_DEFENSE_RESULT'
  | 'GAME_OVER';

interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  enabled: boolean;
  accent: string;
  selected?: boolean;
  /** 스테이지 카드(그리기는 스테이지 선택 화면이 직접 한다) */
  card?: boolean;
}

interface Exec {
  kind: 'player' | 'enemy';
  t: number;
  /** 휘두르기: 가까운(플레이어) 또는 먼(적) 위치에서 검격이 그려진다 */
  swingStart: number;
  swingDur: number;
  /** 비행: 검격이 날아간다 (플레이어: 가까운 곳 -> 먼 곳, 적: 먼 곳 -> 가까운 곳) */
  flyStart: number;
  flyDur: number;
  /** 관통: 도착한 검격이 신체를 베고 지나간다 (실제 피격 판정 시점) */
  cutStart: number;
  cutDur: number;
  end: number;
  pts: Vec[];
  centroid: Vec;
  total: number;
  sweepLen: number;
  hits: HitInfo[];
  next: number;
  swingSfx: boolean;
  dmg: number;
  /** 방어 애니메이션(웅크림 -> 점프 -> 자세 전환) 시작 시각 */
  animStart: number;
  /** 플레이어 공격의 스킬 포함 베기 계획(적 공격은 null) */
  plan: AttackPlan | null;
  /** 이번 공격에서 쓴 스킬 이름 */
  skillUsed: string | null;
  /** 지금까지 터진 폭발 수 */
  blastsDone: number;
}

interface ResultCard {
  title: string;
  sub: string;
  color: string;
  timer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface FloatText {
  x: number;
  y: number;
  s: string;
  life: number;
  color: string;
  size?: number;
}

const ease = (p: number): number => 1 - (1 - clamp(p, 0, 1)) ** 3;

// ------------------------------------------------------------------ 캔버스

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let dpr = 1;
let viewScale = 1;
let viewX = 0;
let viewY = 0;

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  viewScale = Math.min(cw / SW, ch / SH);
  viewX = (cw - SW * viewScale) / 2;
  viewY = (ch - SH * viewScale) / 2;
}

const bg = new Image();
bg.src = bgUrl;

/** 스테이지 선택 화면의 카드 위치(5 x 2) */
function cardRect(i: number): { x: number; y: number; w: number; h: number } {
  const w = 250;
  const h = 250;
  const gap = 24;
  const x0 = (SW - (5 * w + 4 * gap)) / 2;
  return { x: x0 + (i % 5) * (w + gap), y: 215 + Math.floor(i / 5) * (h + 22), w, h };
}

// ------------------------------------------------------------------ 게임

class Game {
  sfx = new Sfx();
  state: GameState = 'MAIN_MENU';
  /** 시작 화면 장식 검격: 현재 차례 번호와 경로 */
  private titleTurn = -1;
  private titlePath: Vec[] = [];
  view: 'attack' | 'defense' = 'attack';
  stage: StageDef = STAGES[0];
  save: SaveData = loadSave();
  /** 장착한 검과 스킬 상태 */
  sword = SWORDS[0];
  skillOn = false;
  /** 스킬을 다시 쓸 수 있을 때까지 남은 내 공격 턴 수 */
  skillCd = 0;
  planSeed = 1;
  /** 이번 클리어로 새로 얻은 검 번호 */
  newSword: number | null = null;
  /** AI가 플레이어의 반복 행동에 대응하기 위한 최근 방어 자세 기록(스테이지마다 초기화) */
  history: Pose[] = [];
  introT = 0;
  /** 월식 진행도(10단계 전투 중 1) */
  eclipse = 0;
  turn = 1;
  time = 0;
  /** 이번 스테이지의 개그 포즈 일정 */
  funnyPlan: FunnyPlan = makeFunnyPlan();
  /** 스킬 버튼 도움말(말풍선) 표시 중이면 경과 시간 */
  skillHint: { t: number } | null = null;
  /** 1단계 조작법 오버레이 표시 중 */
  tutorial = false;

  hp = { player: CONFIG.hp, enemy: CONFIG.hp };
  hpMax = { player: CONFIG.hp, enemy: CONFIG.hp };
  hpShown = { player: CONFIG.hp, enemy: CONFIG.hp };
  hpChip = { player: CONFIG.hp, enemy: CONFIG.hp };

  slash = new SlashDrawer();
  enemyIdle: Pose = idlePose();
  enemyShown: Pose = idlePose();
  enemyDefPose: Pose = idlePose();
  playerPose: Pose = idlePose();
  enemySlash: Vec[] = [];
  /** 적의 이번 공격 계획. 적도 같은 검을 들고, 일정한 턴마다 스킬을 쓴다. */
  enemyPlan: AttackPlan | null = null;
  enemySkillTurn = false;

  exec: Exec | null = null;
  result: ResultCard | null = null;
  over: { win: boolean; t: number } | null = null;

  camT = 0;
  camKind: 'attack' | 'defense' = 'attack';
  freeze = 0;
  shake = 0;
  flash = 0;
  dodgeFx = 0;
  particles: Particle[] = [];
  floats: FloatText[] = [];
  petals = Array.from({ length: 34 }, () => ({
    x: Math.random() * SW,
    y: Math.random() * SH,
    vx: -20 - Math.random() * 30,
    vy: 25 + Math.random() * 40,
    rot: Math.random() * 6,
    vr: (Math.random() - 0.5) * 3,
    size: 5 + Math.random() * 6,
    ph: Math.random() * 6,
  }));

  mouse: Vec = v(-1, -1);
  pressed: string | null = null;
  drag: { id: HandleId; off: Vec } | null = null;
  /** 회전 버튼을 끌어 몸 전체를 회전 중일 때 마지막 각도 */
  rot: { last: number } | null = null;
  hoverRot = false;
  /** 현재 시점의 바닥 기울기(턴 전환 때 부드럽게 바뀐다) */
  viewU = 1;
  hover: HandleId | null = null;
  muteHover = false;

  // ---------------------------------------------------------------- 상태 전환

  /** 스테이지를 시작한다. 보스 스테이지는 등장 연출을 먼저 보여 준다. */
  startStage(id: number): void {
    const st = STAGES[id - 1];
    if (!st || !isUnlocked(this.save, id)) return;
    this.stage = st;
    this.enemyIdle = idlePose(A.w / 2, CONFIG.floorY, st.dims, st.stance);
    this.enemyShown = this.enemyIdle;
    this.enemyDefPose = this.enemyIdle;
    this.hp = { player: CONFIG.hp, enemy: st.hp };
    this.hpMax = { player: CONFIG.hp, enemy: st.hp };
    this.hpShown = { player: CONFIG.hp, enemy: st.hp };
    this.hpChip = { player: CONFIG.hp, enemy: st.hp };
    this.history = [];
    this.turn = 1;
    this.over = null;
    this.sword = SWORDS[this.save.sword] ?? SWORDS[0];
    this.skillCd = 0;
    this.newSword = null;
    this.funnyPlan = makeFunnyPlan();
    this.skillHint = null;
    this.tutorial = false;
    this.beginAttackPrepare();
    if (st.boss) {
      this.state = 'BOSS_INTRO';
      this.introT = 0;
      this.sfx.warn();
    }
    if (id === 1 && !this.save.seenTutorial) this.tutorial = true;
  }

  private transition(kind: 'attack' | 'defense'): void {
    this.camT = 1;
    this.camKind = kind;
  }

  beginAttackPrepare(): void {
    this.state = 'PLAYER_ATTACK_PREPARE';
    this.view = 'attack';
    this.slash.reset();
    this.slash.maxLength = CONFIG.maxSlashLength;
    this.skillOn = false;
    this.planSeed = Math.floor(Math.random() * 1e9);
    this.enemyShown = this.enemyIdle;
    this.exec = null;
    this.result = null;
    this.particles = [];
    this.floats = [];
    this.dodgeFx = 0;
    this.transition('attack');
  }

  beginDefensePrepare(): void {
    this.state = 'PLAYER_DEFENSE_PREPARE';
    this.view = 'defense';
    this.playerPose = idlePose();
    const esw = this.enemySword();
    this.enemySkillTurn = this.turn % CONFIG.skill.enemyEvery === 0 && esw.skill !== 'none';
    const mul = this.enemySkillTurn && esw.skill === 'crescent' ? CONFIG.skill.lengthMul : 1;
    this.enemySlash = generateAttackSlash(this.stage.ai, this.history, Math.random, mul);
    this.enemyPlan = planAttack(esw, this.enemySlash, this.enemySkillTurn, Math.floor(Math.random() * 1e9), CUT_DUR);
    this.exec = null;
    this.result = null;
    this.drag = null;
    this.rot = null;
    this.particles = [];
    this.floats = [];
    this.dodgeFx = 0;
    this.transition('defense');
  }

  onDone(): void {
    if (this.state === 'PLAYER_ATTACK_PREPARE' && this.slash.valid) {
      // 공격 완료 버튼은 클릭음 없이 바로 공격한다(휘두르는 소리가 이어서 난다).
      this.startExec('player');
    } else if (this.state === 'PLAYER_DEFENSE_PREPARE') {
      this.sfx.click();
      this.drag = null;
      this.startExec('enemy');
    } else {
      this.sfx.click();
      if (this.state === 'PLAYER_ATTACK_RESULT' || this.state === 'PLAYER_DEFENSE_RESULT') {
        if (this.result) this.result.timer = 0;
      }
    }
  }

  private startExec(kind: 'player' | 'enemy'): void {
    const swingStart = kind === 'player' ? 0.1 : 0.55;
    const swingDur = 0.5;
    const flyStart = swingStart + swingDur + 0.08;
    const flyDur = 0.55;
    const cutStart = flyStart + flyDur;
    const cutDur = CUT_DUR;
    let pts: Vec[];
    let target: Pose;
    let plan: AttackPlan | null = null;
    let skillUsed: string | null = null;
    let res: { hits: HitInfo[]; total: number };
    if (kind === 'player') {
      pts = this.slash.points.slice();
      const active = this.skillOn && this.skillReady();
      plan = planAttack(this.sword, pts, active, this.planSeed, cutDur);
      if (active) {
        this.skillCd = CONFIG.skill.cooldown;
        skillUsed = this.sword.skillName;
      } else if (this.skillCd > 0) {
        this.skillCd--;
      }
      // AI는 그린 검격만 읽고 피한다. 스킬로 생기는 추가 베기(복제 검격, 폭발, 꽃잎 등)는 예측하지 못한다.
      const d = chooseDefenseWithFunny(visibleParts(plan), this.stage.ai, this.stage.dims, this.stage.stance, Math.random, {
        stageId: this.stage.id,
        plan: this.funnyPlan,
        turn: this.turn,
        enemyHp: this.hp.enemy,
        damageOf: (p) => resolvePlan(plan!, p).total,
      });
      this.enemyDefPose = d.pose;
      target = this.enemyDefPose;
      res = resolvePlan(plan, target);
      this.state = 'PLAYER_ATTACK_EXECUTE';
    } else {
      pts = this.enemySlash;
      target = this.playerPose;
      this.history.push(clonePose(this.playerPose));
      if (this.history.length > 8) this.history.shift();
      this.state = 'AI_ATTACK_EXECUTE';
      this.sfx.warn();
      plan = this.enemyPlan ?? planAttack(this.enemySword(), pts, false, 1, cutDur);
      res = resolvePlan(plan, target);
      if (plan.active) skillUsed = plan.sword.skillName;
    }
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    this.exec = {
      kind,
      t: 0,
      swingStart,
      swingDur,
      flyStart,
      flyDur,
      cutStart,
      cutDur,
      end: cutStart + Math.max(cutDur, plan?.end ?? 0) + 0.5,
      pts,
      centroid: v(cx / pts.length, cy / pts.length),
      total: polyLength(pts),
      sweepLen: 0,
      hits: res.hits,
      next: 0,
      swingSfx: false,
      dmg: res.total,
      animStart: Math.max(0, cutStart - DEF_ANIM_TOTAL - DEF_ANIM.settle),
      plan,
      skillUsed,
      blastsDone: 0,
    };
  }

  /** 이 스테이지의 적이 든 검(스테이지 n은 n번째 검) */
  private enemySword(): SwordDef {
    return SWORDS[this.stage.id - 1] ?? SWORDS[0];
  }

  /** 지금 스킬을 쓸 수 있는가(스킬이 있는 검이고 쿨타임이 끝났는가) */
  skillReady(): boolean {
    return this.sword.skill !== 'none' && this.skillCd <= 0;
  }

  /** 전투 화면에서 손에 든 검의 모양 */
  private swordStyle(): BladeStyle {
    const w = this.sword;
    return { color: w.color, glow: w.glow, length: w.length, width: w.width, heavy: w.heavy };
  }

  private finishExec(): void {
    const e = this.exec!;
    const names = [...new Set(e.hits.map((h) => CAT_NAMES[h.cat]))].join(' · ');
    if (e.kind === 'player') {
      this.state = 'PLAYER_ATTACK_RESULT';
      this.result =
        e.hits.length > 0
          ? { title: '적중!', sub: `-${e.dmg} HP  |  ${names}${e.skillUsed ? `  |  ${e.skillUsed}` : ''}`, color: COLORS.mine, timer: 1.6 }
          : { title: '빗나감', sub: `적이 공격을 피했습니다${e.skillUsed ? `  |  ${e.skillUsed}` : ''}`, color: '#B8C4E0', timer: 1.6 };
    } else {
      this.state = 'PLAYER_DEFENSE_RESULT';
      this.result =
        e.hits.length > 0
          ? { title: '피격!', sub: `-${e.dmg} HP  |  ${names}${e.skillUsed ? `  |  ${e.skillUsed}` : ''}`, color: COLORS.attackBright, timer: 1.6 }
          : { title: '회피 성공!', sub: '공격을 완벽하게 피했습니다', color: COLORS.defense, timer: 1.6 };
    }
  }

  private afterResult(): void {
    if (this.state === 'PLAYER_ATTACK_RESULT') {
      if (this.hp.enemy <= 0) this.endGame(true);
      else this.beginDefensePrepare();
    } else if (this.state === 'PLAYER_DEFENSE_RESULT') {
      if (this.hp.player <= 0) this.endGame(false);
      else {
        this.turn++;
        this.beginAttackPrepare();
      }
    }
  }

  private endGame(win: boolean): void {
    this.state = 'GAME_OVER';
    this.over = { win, t: 0 };
    if (win && !this.save.cleared[this.stage.id - 1]) {
      this.save.cleared[this.stage.id - 1] = true;
      writeSave(this.save);
      // n단계를 처음 클리어하면 n번 검(0부터 센 번호)을 얻는다.
      if (this.stage.id < SWORD_COUNT) this.newSword = this.stage.id;
    }
    this.result = null;
    if (win) this.sfx.win();
    else this.sfx.lose();
  }

  /** 폭발 효과(염화도) */
  private burst(c: Vec, color: string): void {
    this.shake = Math.max(this.shake, 12);
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 380;
      this.particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 2 + Math.random() * 3.5, color: i % 3 ? color : '#FFFFFF' });
    }
  }

  private triggerHit(h: HitInfo): void {
    const e = this.exec!;
    const toEnemy = e.kind === 'player';
    const key = toEnemy ? 'enemy' : 'player';
    this.hp[key] = Math.max(0, this.hp[key] - h.damage);
    this.freeze = 0.09;
    this.shake = Math.max(this.shake, 8 + h.damage * 0.45);
    if (!toEnemy) this.flash = 0.55;
    this.sfx.hit(h.damage >= 20);
    const col = toEnemy ? ['#FFFFFF', '#FF6B76', '#35E3FF'] : ['#FFFFFF', '#FF4F5E', '#FF8A93'];
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 420;
      this.particles.push({
        x: h.point.x,
        y: h.point.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.3,
        max: 0.8,
        size: 2 + Math.random() * 3,
        color: col[i % col.length],
      });
    }
    this.floats.push({
      x: h.point.x,
      y: h.point.y - 30,
      s: `-${h.damage}`,
      life: 1.3,
      color: toEnemy ? '#FFFFFF' : '#FF6B76',
    });
    if (h.tag) this.floats.push({ x: h.point.x, y: h.point.y + 6, s: h.bonus ? `${h.tag} +${h.bonus}` : h.tag, life: 1.3, color: e.plan?.sword.glow ?? this.sword.glow, size: 24 });
  }

  // ---------------------------------------------------------------- 업데이트

  update(dtRaw: number): void {
    const dt = Math.min(dtRaw, 0.05);
    this.time += dt;
    this.updateAmbient(dt);

    // 체력바 애니메이션
    for (const k of ['player', 'enemy'] as const) {
      if (this.hpShown[k] > this.hp[k]) this.hpShown[k] = Math.max(this.hp[k], this.hpShown[k] - 160 * dt);
      if (this.hpChip[k] > this.hpShown[k]) this.hpChip[k] = Math.max(this.hpShown[k], this.hpChip[k] - 45 * dt);
    }

    this.viewU += ((this.view === 'attack' ? 1 : 0) - this.viewU) * Math.min(1, dt * 7);
    const inBattle = this.state !== 'MAIN_MENU' && this.state !== 'STAGE_SELECT' && this.state !== 'SWORD_SELECT';
    const eclipseTarget = this.stage.fx === 'eclipse' && inBattle ? (this.state === 'BOSS_INTRO' ? clamp((this.introT - 0.8) / 3, 0, 1) : 1) : 0;
    this.eclipse += (eclipseTarget - this.eclipse) * Math.min(1, dt * 3);
    if (this.state === 'BOSS_INTRO') {
      this.introT += dt;
      if (this.introT >= INTRO_LEN) this.beginAttackPrepare();
    }
    this.shake *= Math.pow(0.002, dt);
    if (this.shake < 0.3) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.camT > 0) this.camT = Math.max(0, this.camT - dt / 0.55);

    // 스킬 버튼 도움말: 스킬이 있는 검으로 처음 공격 준비에 들어갔을 때 한 번만
    if (!this.skillHint && !this.save.seenSkillHint && !this.tutorial && this.state === 'PLAYER_ATTACK_PREPARE' && this.sword.skill !== 'none') {
      this.skillHint = { t: 0 };
      this.save.seenSkillHint = true;
      writeSave(this.save);
    }
    if (this.skillHint) {
      this.skillHint.t += dt;
      if (this.state !== 'PLAYER_ATTACK_PREPARE') this.skillHint = null;
    }

    // 타격 정지: 연출 시간 정지
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + 260 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= 38 * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    if (this.exec && (this.state === 'PLAYER_ATTACK_EXECUTE' || this.state === 'AI_ATTACK_EXECUTE')) {
      const e = this.exec;
      e.t += dt;
      if (e.kind === 'player') this.enemyShown = defenseAnimPose(this.enemyIdle, this.enemyDefPose, e.t - e.animStart);
      if (!e.swingSfx && e.t >= e.swingStart) {
        e.swingSfx = true;
        this.sfx.swing(e.plan?.active ? e.plan.sword.skill : null, e.flyStart - e.t, e.cutStart - e.t);
      }
      const p = clamp((e.t - e.cutStart) / e.cutDur, 0, 1);
      e.sweepLen = e.total * p;
      // 검격이 날아가는 중에는 피해가 없다. 도착(관통) 단계부터 지나간 만큼만 적중한다.
      if (e.t >= e.cutStart) {
        while (e.next < e.hits.length && e.hits[e.next].time <= e.t - e.cutStart) this.triggerHit(e.hits[e.next++]);
      }
      while (e.plan && e.blastsDone < e.plan.blasts.length && e.t - e.cutStart >= e.plan.blasts[e.blastsDone].delay) {
        this.burst(e.plan.blasts[e.blastsDone].c, e.plan.sword.glow);
        e.blastsDone++;
      }
      if (e.hits.length === 0 && p >= 1 && !(e.plan && e.plan.end > e.cutDur + 0.001 && e.t - e.cutStart < e.plan.end)) {
        if (this.dodgeFx === 0) this.sfx.dodge();
        this.dodgeFx = Math.min(1, this.dodgeFx + dt * 4);
      }
      if (e.t >= e.end) this.finishExec();
    } else if (this.result) {
      if (this.dodgeFx > 0) this.dodgeFx = Math.max(0.0001, this.dodgeFx - dt * 0.6);
      this.result.timer -= dt;
      if (this.result.timer <= 0) this.afterResult();
    } else if (this.over) {
      this.over.t += dt;
    }
  }

  private updateAmbient(dt: number): void {
    for (const p of this.petals) {
      p.x += (p.vx + Math.sin(this.time * 0.8 + p.ph) * 18) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > SH + 20 || p.x < -20) {
        p.x = Math.random() * SW + 200;
        p.y = -20;
      }
    }
  }

  // ---------------------------------------------------------------- 입력

  /** 마지막 입력이 터치인가(터치는 손가락이 굵어 잡는 범위를 넓힌다) */
  touch = false;
  private get grab(): number {
    return this.touch ? 52 : 24;
  }
  private get rotGrab(): number {
    return this.touch ? 56 : 26;
  }
  stagePos(e: MouseEvent): Vec {
    return v((e.clientX - viewX) / viewScale, (e.clientY - viewY) / viewScale);
  }

  /** 네모칸의 현재 화면 위치와 크기(턴 전환 때 부드럽게 이동) */
  frame(): { x: number; y: number; s: number } {
    const u = this.viewU;
    return { x: lerp(FRAME_DEF.x, FRAME_ATK.x, u), y: lerp(FRAME_DEF.y, FRAME_ATK.y, u), s: lerp(FRAME_DEF.s, FRAME_ATK.s, u) };
  }

  /** 화면 좌표 -> 판정 좌표. 입력은 모두 이 변환을 거쳐 판정 좌표계에서 처리한다. */
  arenaPos(p: Vec): Vec {
    const f = this.frame();
    return v((p.x - f.x) / f.s, (p.y - f.y) / f.s);
  }

  /** 머리 위(몸 기준)에 표시되는 회전 버튼의 위치 */
  rotBtnPos(): Vec {
    const J = computeJoints(this.playerPose);
    const t = this.playerPose.torso + this.playerPose.head * 0;
    const up = v(Math.sin(t), -Math.cos(t));
    const d = this.playerPose.dims.headR + 50;
    return v(clamp(J.headC.x + up.x * d, 26, A.w - 26), clamp(J.headC.y + up.y * d, 28, A.h - 28));
  }

  buttons(): Button[] {
    const list: Button[] = [];
    if (this.tutorial) return [{ id: 'tutorialOk', x: SW / 2 - 130, y: 560, w: 260, h: 76, label: '시작!', enabled: true, accent: COLORS.mine }];
    list.push({
      id: 'mute',
      x: SW - 130,
      y: 18,
      w: 110,
      h: 36,
      label: this.sfx.muted ? '소리 꺼짐' : '소리 켜짐',
      enabled: true,
      accent: '#7d8fb8',
    });
    const s = this.state;
    if (s !== 'MAIN_MENU' && s !== 'STAGE_SELECT' && s !== 'SWORD_SELECT') {
      list.push({ id: 'home', x: SW - 178, y: 18, w: 40, h: 36, label: '', enabled: true, accent: '#7d8fb8' });
    }
    if (s === 'MAIN_MENU') {
      list.push({ id: 'start', x: 650, y: 560, w: 300, h: 80, label: '게임 시작 »', enabled: true, accent: COLORS.mine });
    } else if (s === 'STAGE_SELECT') {
      for (let i = 0; i < STAGE_COUNT; i++) {
        const r = cardRect(i);
        list.push({
          id: `stage:${i + 1}`,
          ...r,
          label: '',
          enabled: isUnlocked(this.save, i + 1),
          accent: STAGES[i].boss ? COLORS.attackBright : COLORS.defense,
          card: true,
        });
      }
      list.push({ id: 'back', x: 140, y: 790, w: 220, h: 64, label: '« 뒤로', enabled: true, accent: '#7d8fb8' });
      list.push({ id: 'swords', x: 1240, y: 790, w: 220, h: 64, label: '검 선택', enabled: true, accent: this.sword.glow });
    } else if (s === 'SWORD_SELECT') {
      for (let i = 0; i < SWORD_COUNT; i++) {
        list.push({ id: `sword:${i}`, ...cardRect(i), label: '', enabled: isSwordUnlocked(this.save, i), accent: SWORDS[i].glow, card: true });
      }
      list.push({ id: 'swordBack', x: 140, y: 790, w: 220, h: 64, label: '« 뒤로', enabled: true, accent: '#7d8fb8' });
    } else if (s === 'PLAYER_ATTACK_PREPARE') {
      list.push({ id: 'done', x: 1040, y: 790, w: 260, h: 78, label: '완료 »', enabled: this.slash.valid, accent: COLORS.mine });
      list.push({
        id: 'redraw',
        x: this.sword.skill === 'none' ? UI_X : UI_X + 440,
        y: 722,
        w: 150,
        h: 52,
        label: '다시 그리기',
        enabled: this.slash.valid,
        accent: COLORS.mine,
      });
      if (this.sword.skill !== 'none') {
        const w = this.sword;
        const locked = this.skillCd > 0;
        const crescentBlocked = w.skill === 'crescent' && this.slash.points.length > 1;
        list.push({
          id: 'skill',
          x: UI_X,
          y: 722,
          w: 430,
          h: 52,
          label: locked ? `${w.skillName} · 쿨타임 ${this.skillCd}턴` : `스킬 ${this.skillOn ? 'ON' : 'OFF'} · ${w.skillName}`,
          enabled: !locked && !crescentBlocked,
          accent: w.glow,
          selected: this.skillOn && !locked,
        });
      }
    } else if (s === 'PLAYER_DEFENSE_PREPARE') {
      list.push({ id: 'done', x: 1040, y: 790, w: 260, h: 78, label: '완료 »', enabled: true, accent: COLORS.defense });
    } else if (s === 'PLAYER_ATTACK_RESULT' || s === 'PLAYER_DEFENSE_RESULT') {
      list.push({ id: 'done', x: 1040, y: 790, w: 260, h: 78, label: '다음 »', enabled: true, accent: '#9fb0d8' });
    } else if (s === 'GAME_OVER' && this.over && this.over.t > 0.8 && this.over.win && this.newSword !== null) {
      const nw = SWORDS[this.newSword];
      list.push({ id: 'equipNew', x: SW / 2 - 262, y: 650, w: 250, h: 70, label: '장착하기', enabled: true, accent: nw.glow });
      list.push({ id: 'okNew', x: SW / 2 + 12, y: 650, w: 250, h: 70, label: '확인', enabled: true, accent: COLORS.mine });
    } else if (s === 'GAME_OVER' && this.over && this.over.t > 0.8) {
      const win = this.over.win;
      const items: [string, string, string][] = [];
      if (win && this.stage.id < STAGE_COUNT) items.push(['next', '다음 단계', COLORS.mine]);
      items.push(['retry', '다시 도전', win ? COLORS.defense : COLORS.mine]);
      items.push(['select', '스테이지 선택', COLORS.defense]);
      const bw = 250;
      const gap = 20;
      const x0 = (SW - (items.length * bw + (items.length - 1) * gap)) / 2;
      items.forEach(([id, label, accent], i) =>
        list.push({ id, x: x0 + i * (bw + gap), y: 590, w: bw, h: 70, label, enabled: true, accent }),
      );
    }
    return list;
  }

  private buttonAt(p: Vec): Button | null {
    for (const b of this.buttons()) {
      if (b.enabled && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  private activate(id: string): void {
    if (id === 'mute') {
      this.sfx.muted = !this.sfx.muted;
      this.sfx.click();
    } else if (id === 'start') {
      this.sfx.click();
      this.state = 'STAGE_SELECT';
    } else if (id.startsWith('stage:')) {
      this.sfx.click();
      this.startStage(Number(id.slice(6)));
    } else if (id === 'next') {
      this.sfx.click();
      this.startStage(this.stage.id + 1);
    } else if (id === 'retry') {
      this.sfx.click();
      this.startStage(this.stage.id);
    } else if (id === 'select') {
      this.sfx.click();
      this.state = 'STAGE_SELECT';
      this.over = null;
      this.result = null;
    } else if (id === 'home') {
      this.sfx.click();
      this.state = 'MAIN_MENU';
      this.over = null;
      this.result = null;
    } else if (id === 'skill') {
      if (this.state !== 'PLAYER_ATTACK_PREPARE' || !this.skillReady()) return;
      this.sfx.click();
      this.skillHint = null;
      this.skillOn = !this.skillOn;
      // 잔월은 검격을 그리기 전에만 켜고 끌 수 있다. 길이 한도가 바뀌기 때문이다.
      if (this.sword.skill === 'crescent') this.slash.maxLength = CONFIG.maxSlashLength * (this.skillOn ? CONFIG.skill.lengthMul : 1);
    } else if (id === 'tutorialOk') {
      this.sfx.click();
      this.tutorial = false;
      this.save.seenTutorial = true;
      writeSave(this.save);
    } else if (id === 'redraw') {
      if (this.state !== 'PLAYER_ATTACK_PREPARE') return;
      this.sfx.click();
      this.slash.reset();
    } else if (id === 'equipNew') {
      if (this.newSword === null) return;
      this.sfx.click();
      this.save.sword = this.newSword;
      writeSave(this.save);
      this.sword = SWORDS[this.newSword];
      this.newSword = null;
    } else if (id === 'okNew') {
      this.sfx.click();
      this.newSword = null;
    } else if (id === 'swords') {
      this.sfx.click();
      this.state = 'SWORD_SELECT';
    } else if (id === 'swordBack') {
      this.sfx.click();
      this.state = 'STAGE_SELECT';
    } else if (id.startsWith('sword:')) {
      const i = Number(id.slice(6));
      if (!isSwordUnlocked(this.save, i)) return;
      this.sfx.click();
      this.save.sword = i;
      writeSave(this.save);
      this.sword = SWORDS[i];
    } else if (id === 'back') {
      this.sfx.click();
      this.state = 'MAIN_MENU';
    } else if (id === 'done') {
      this.onDone();
    }
  }

  mouseDown(e: MouseEvent): void {
    this.touch = (e as PointerEvent).pointerType === 'touch' || (e as PointerEvent).pointerType === 'pen';
    const p = this.stagePos(e);
    this.mouse = p;
    if (e.button === 2) {
      if (this.tutorial) return;
      if (this.state === 'PLAYER_ATTACK_PREPARE') {
        this.slash.reset();
      }
      return;
    }
    if (e.button !== 0) return;
    const b = this.buttonAt(p);
    if (b) {
      this.pressed = b.id;
      return;
    }
    if (this.tutorial) return;
    if (this.state === 'PLAYER_ATTACK_PREPARE') {
      this.slash.begin(this.arenaPos(p));
    } else if (this.state === 'PLAYER_DEFENSE_PREPARE') {
      const ap = this.arenaPos(p);
      const rb = this.rotBtnPos();
      const pv = this.playerPose.pelvis;
      if (Math.hypot(ap.x - rb.x, ap.y - rb.y) < this.rotGrab) {
        this.rot = { last: Math.atan2(ap.y - pv.y, ap.x - pv.x) };
        return;
      }
      const id = pickHandle(this.playerPose, ap, this.grab);
      if (id) {
        const hp = handlePos(this.playerPose, id);
        this.drag = { id, off: v(hp.x - ap.x, hp.y - ap.y) };
      }
    }
  }

  mouseMove(e: MouseEvent): void {
    const p = this.stagePos(e);
    this.mouse = p;
    const ap = this.arenaPos(p);
    if (this.state === 'PLAYER_ATTACK_PREPARE' && this.slash.drawing) {
      this.slash.move(ap);
    } else if (this.state === 'PLAYER_DEFENSE_PREPARE') {
      if (this.rot) {
        const pv = this.playerPose.pelvis;
        const a = Math.atan2(ap.y - pv.y, ap.x - pv.x);
        const d = normAngle(a - this.rot.last);
        this.rot.last = a;
        this.playerPose = rotateDrag(this.playerPose, d);
      } else if (this.drag) {
        this.playerPose = dragPose(this.playerPose, this.drag.id, v(ap.x + this.drag.off.x, ap.y + this.drag.off.y));
      } else {
        const rb = this.rotBtnPos();
        this.hoverRot = Math.hypot(ap.x - rb.x, ap.y - rb.y) < this.rotGrab + 2;
        this.hover = this.hoverRot ? null : pickHandle(this.playerPose, ap, this.grab);
      }
    }
    this.muteHover = false;
    canvas.style.cursor = this.cursor(p);
  }

  private cursor(p: Vec): string {
    if (this.buttonAt(p)) return 'pointer';
    if (this.tutorial) return 'default';
    if (this.state === 'PLAYER_DEFENSE_PREPARE') return this.drag || this.rot ? 'grabbing' : this.hover || this.hoverRot ? 'grab' : 'default';
    if (this.state === 'PLAYER_ATTACK_PREPARE') {
      const ap = this.arenaPos(p);
      return !this.slash.ended && ap.x >= 0 && ap.y >= 0 && ap.x <= A.w && ap.y <= A.h ? 'crosshair' : 'default';
    }
    return 'default';
  }

  mouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    const p = this.stagePos(e);
    this.mouse = p;
    if (this.pressed) {
      const b = this.buttonAt(p);
      const id = this.pressed;
      this.pressed = null;
      if (b && b.id === id) this.activate(id);
      if (this.touch) this.clearHover();
      return;
    }
    this.releaseInputs();
    if (this.touch) this.clearHover();
  }
  /** 터치는 호버가 없으므로 손가락을 뗀 뒤 남은 강조 표시를 지운다 */
  private clearHover(): void {
    this.mouse = v(-1, -1);
    this.hover = null;
    this.hoverRot = false;
  }

  releaseInputs(): void {
    this.pressed = null;
    this.drag = null;
    this.rot = null;
    if (this.slash.drawing) {
      this.slash.finish();
      if (this.slash.length < CONFIG.minSlashLength) this.slash.reset();
    }
  }

  // ---------------------------------------------------------------- 그리기

  draw(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070A14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, dpr * viewX, dpr * viewY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SW, SH);
    ctx.clip();
    this.drawBackground();
    if (this.state === 'MAIN_MENU') this.drawMenu();
    else if (this.state === 'STAGE_SELECT') this.drawStageSelect();
    else if (this.state === 'SWORD_SELECT') this.drawSwordSelect();
    else this.drawGame();
    this.drawTutorial();
    this.drawButtons();
    this.drawSkillHint();
    if (this.flash > 0) {
      const g = ctx.createRadialGradient(SW / 2, SH / 2, SH * 0.3, SW / 2, SH / 2, SH * 0.85);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${this.flash * 0.7})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SW, SH);
    }
    ctx.restore();
  }

  private drawBackground(): void {
    if (bg.complete && bg.naturalWidth > 0) {
      const drift = Math.sin(this.time * 0.15) * 6;
      ctx.drawImage(bg, -10 + drift, -6, SW + 20, SH + 12);
    } else {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, SW, SH);
    }
    // 배경이 전투 영역보다 두드러지지 않도록 어둡게 눌러준다.
    ctx.fillStyle = 'rgba(6,9,22,0.52)';
    ctx.fillRect(0, 0, SW, SH);
    const vg = ctx.createRadialGradient(SW / 2, SH / 2, SH * 0.35, SW / 2, SH / 2, SH * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,4,12,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, SW, SH);
    if (this.eclipse > 0.01) this.drawEclipse(this.eclipse);
    // 안개
    for (let i = 0; i < 3; i++) {
      const x = ((this.time * (8 + i * 5) + i * 600) % (SW + 800)) - 400;
      const g = ctx.createRadialGradient(x, 640 + i * 70, 10, x, 640 + i * 70, 420);
      g.addColorStop(0, 'rgba(150,160,210,0.10)');
      g.addColorStop(1, 'rgba(150,160,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 420, 220, 840, 700);
    }
    // 벚꽃잎
    for (const p of this.petals) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#F3B8D4';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPanel(x: number, y: number, w: number, h: number, edge = 'rgba(120,160,225,0.5)'): void {
    chamfer(ctx, x, y, w, h, 10);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(24,36,64,0.82)');
    g.addColorStop(1, 'rgba(12,18,38,0.86)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---- 메인 메뉴
  private drawMenu(): void {
    // 양쪽의 졸라맨: 왼쪽은 칼을 양손으로 늘어뜨려 들고, 오른쪽은 팔짱을 끼고 서 있다.
    for (const side of [0, 1]) {
      ctx.save();
      const s = 1.25;
      const fx = side === 0 ? 250 : 1350;
      ctx.translate(fx - (A.w / 2) * s, 800 - CONFIG.floorY * s);
      ctx.scale(s, s);
      const bob = Math.sin(this.time * 1.6 + side) * 3;
      const p = side === 0 ? titlePlayerPose() : titleEnemyPose();
      p.pelvis.y += bob;
      const J = computeJoints(p);
      if (side === 1) drawTitleCape(ctx, J.neck, this.time);
      drawStickman(ctx, p, { alpha: 0.95 });
      if (side === 0) {
        drawTitleScarf(ctx, J.neck, this.time);
        const grip = lerpV(J.hand[0], J.hand[1], 0.5);
        drawBlade(ctx, grip, -0.8, { color: '#DFF6FF', glow: COLORS.mine, length: 170, width: 7 }, 0.95);
      } else {
        drawTitleCapeCollar(ctx, J.neck);
      }
      ctx.restore();
    }
    // 두 칼날의 궤적: 파란색과 빨간색이 번갈아 나오고, 매번 모양(직선/곡선/지그재그)이 무작위로 바뀐다.
    const turn = Math.floor(this.time / TITLE_TURN);
    if (turn !== this.titleTurn) {
      this.titleTurn = turn;
      const shape = TITLE_SLASH_SHAPES[Math.floor(Math.random() * TITLE_SLASH_SHAPES.length)];
      const j = () => (Math.random() - 0.5) * 70;
      this.titlePath =
        turn % 2 === 0
          ? titleSlashPath(shape, v(330 + j(), 520 + j()), v(900 + j(), 360 + j()))
          : titleSlashPath(shape, v(1270 + j(), 560 + j()), v(780 + j(), 380 + j()));
    }
    const k = (this.time % TITLE_TURN) / TITLE_TURN;
    const draw = clamp(k / 0.45, 0, 1);
    const fade = 1 - clamp((k - 0.55) / 0.35, 0, 1);
    if (fade > 0 && this.titlePath.length > 1) {
      const pts = partialPolyline(this.titlePath, polyLength(this.titlePath) * draw);
      drawSlash(ctx, pts, turn % 2 === 0 ? COLORS.mine : COLORS.attackBright, fade, false);
    }
    // 게임 이름: 한 줄에 "써는 놈"(흰색)과 "피하는 놈"(붉은색). 첫 글자 '써', '피'를 크게 키우고,
    // 글자마다 기울기와 높이를 달리하고 살짝 일렁이게 해서 역동적으로 보이게 한다. 전체는 가운데 맞춘다.
    const baseSize = 116;
    const bigSize = 156;
    const WHITE = '#FFFFFF';
    const glyphs: { c: string; big: boolean; color: string; tilt: number; dy: number }[] = [
      { c: '써', big: true, color: WHITE, tilt: -0.12, dy: -10 },
      { c: '는', big: false, color: WHITE, tilt: 0.05, dy: 8 },
      { c: ' ', big: false, color: WHITE, tilt: 0, dy: 0 },
      { c: '놈', big: false, color: WHITE, tilt: -0.06, dy: 4 },
      { c: ' ', big: false, color: WHITE, tilt: 0, dy: 0 },
      { c: '피', big: true, color: COLORS.attackBright, tilt: -0.12, dy: -10 },
      { c: '하', big: false, color: COLORS.attackBright, tilt: 0.06, dy: 8 },
      { c: '는', big: false, color: COLORS.attackBright, tilt: -0.04, dy: 0 },
      { c: ' ', big: false, color: COLORS.attackBright, tilt: 0, dy: 0 },
      { c: '놈', big: false, color: COLORS.attackBright, tilt: -0.08, dy: 6 },
    ];
    ctx.save();
    const widths = glyphs.map((g) => {
      ctx.font = `italic 900 ${g.big ? bigSize : baseSize}px ${FONT}`;
      return ctx.measureText(g.c).width * (g.c === ' ' ? 1.3 : 1) - (g.big ? 0 : 4);
    });
    ctx.restore();
    let gx = SW / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    glyphs.forEach((g, i) => {
      const cx = gx + widths[i] / 2;
      gx += widths[i];
      if (g.c === ' ') return;
      const bob = Math.sin(this.time * 2.4 + i * 0.8) * 3.5;
      ctx.save();
      ctx.translate(cx, 250 + g.dy + bob);
      ctx.rotate(g.tilt + Math.sin(this.time * 1.8 + i) * 0.015);
      ctx.transform(1, 0, -0.16, 1, 0, 0); // 오른쪽으로 쏠리게 기울여 속도감을 준다
      const glow = g.color === WHITE ? 'rgba(255,255,255,0.4)' : COLORS.attackBright;
      text(ctx, g.c, 0, 0, { size: g.big ? bigSize : baseSize, weight: '900', italic: true, align: 'center', color: g.color, glow });
      ctx.restore();
    });
    text(ctx, '검격을 그리고, 자세를 배치하며 맞서는 턴제 검술 대결', SW / 2, 372, { size: 24, align: 'center', color: '#C9D3EC' });
  }

  // ---- 게임 화면
  private drawGame(): void {
    const attack = this.view === 'attack';
    const intro = this.state === 'BOSS_INTRO';
    this.drawArena(attack);
    if (intro) this.drawIntroOverlay();
    // 보스 연출 중에도 전투 UI는 가리지 않는다(어둡게만 보이다가 선명해진다).
    ctx.save();
    if (intro) ctx.globalAlpha = 0.35 + 0.65 * clamp((this.introT - 3.0) / 1.2, 0, 1);
    this.drawTopUI(attack);
    this.drawBottomUI(attack);
    ctx.restore();
    this.drawResult();
    if (this.state === 'GAME_OVER' && this.over) this.drawGameOver();
  }

  /** 월식: 보름달이 붉게 가려지고 주변이 붉게 물든다. */
  private drawEclipse(e: number): void {
    ctx.save();
    ctx.fillStyle = `rgba(70,0,14,${0.22 * e})`;
    ctx.fillRect(0, 0, SW, SH);
    const g = ctx.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.9, MOON.x, MOON.y, MOON.r * 2.3);
    g.addColorStop(0, `rgba(255,40,50,${0.32 * e})`);
    g.addColorStop(1, 'rgba(255,40,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SW, SH);
    ctx.fillStyle = `rgba(28,0,8,${0.82 * e})`;
    ctx.beginPath();
    ctx.arc(MOON.x, MOON.y, MOON.r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(150,10,24,${0.34 * e})`;
    ctx.beginPath();
    ctx.arc(MOON.x, MOON.y, MOON.r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,70,60,${0.75 * e})`;
    ctx.shadowColor = '#FF1E2E';
    ctx.shadowBlur = 40;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(MOON.x, MOON.y, MOON.r + 3, 0.5, 2.6);
    ctx.stroke();
    ctx.restore();
  }

  /** 보스 등장 연출: 암전 -> 눈이 빛남 -> 실루엣 등장 -> 이름 표시 -> 전투 시작 */
  private drawIntroOverlay(): void {
    const t = this.introT;
    const st = this.stage;
    const dark = t < 0.7 ? (t / 0.7) * 0.88 : t < 2.6 ? 0.88 : 0.88 * (1 - clamp((t - 2.6) / 1.6, 0, 1));
    ctx.save();
    ctx.fillStyle = `rgba(0,0,6,${dark})`;
    ctx.fillRect(0, 0, SW, SH);

    // 보스 머리 위치(화면 좌표)
    const f = this.frame();
    const hc = computeJoints(this.enemyIdle).headC;

    if (st.fx === 'gold') {
      const k = clamp((t - 1.4) / 1.2, 0, 1) * (1 - clamp((t - 3.6) / 1.0, 0, 1));
      const g = ctx.createRadialGradient(f.x + hc.x * f.s, f.y + hc.y * f.s, 10, f.x + hc.x * f.s, f.y + hc.y * f.s + 80, 420);
      g.addColorStop(0, `rgba(255,200,80,${0.28 * k})`);
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SW, SH);
      ctx.globalCompositeOperation = 'source-over';
    } else if (st.fx === 'eclipse') {
      const k = clamp((t - 1.0) / 1.5, 0, 1) * (1 - clamp((t - 4.0) / 0.7, 0, 1));
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = ((this.time * (30 + i * 9) + i * 380) % (SW + 600)) - 300;
        const y = 640 + Math.sin(this.time * 0.9 + i) * 40;
        const g = ctx.createRadialGradient(x, y, 10, x, y, 380);
        g.addColorStop(0, `rgba(210,20,40,${0.22 * k})`);
        g.addColorStop(1, 'rgba(210,20,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 380, y - 380, 760, 760);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // 눈이 먼저 빛난다.
    const ea = clamp((t - 0.7) / 0.6, 0, 1) * (1 - clamp((t - 3.2) / 0.8, 0, 1));
    if (ea > 0.01) {
      const flick = 0.85 + 0.15 * Math.sin(t * 24);
      const cx = f.x + hc.x * f.s;
      const cy = f.y + hc.y * f.s;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 110);
      g.addColorStop(0, st.eye);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = ea * 0.28 * flick;
      ctx.fillStyle = g;
      ctx.fillRect(cx - 120, cy - 120, 240, 240);
      ctx.globalAlpha = ea * flick;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.s, f.s);
      drawEyes(ctx, hc, 0, st.dims.headR, { color: st.eye, scale: st.eyeScale * (0.7 + 0.5 * ea) });
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    // 이름
    const na = clamp((t - 2.4) / 0.5, 0, 1) * (1 - clamp((t - 4.0) / 0.6, 0, 1));
    if (na > 0.01) {
      const col = st.eye === '#FFFFFF' ? '#FF6B76' : st.eye;
      const slide = (1 - ease((t - 2.4) / 0.6)) * 40;
      ctx.globalAlpha = na;
      text(ctx, st.id === STAGE_COUNT ? 'FINAL BOSS' : 'BOSS', SW / 2 + slide, 400, { size: 26, weight: '800', italic: true, align: 'center', color: col, glow: col });
      text(ctx, st.name, SW / 2 - slide, 468, { size: 92, weight: '900', italic: true, align: 'center', color: '#FFFFFF', glow: col });
      const lw = 260 + 380 * ease((t - 2.5) / 0.7);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      ctx.fillRect(SW / 2 - lw / 2, 530, lw, 3);
    }
    ctx.restore();
  }

  // ---- 스테이지 선택
  private drawStageSelect(): void {
    const cleared = this.save.cleared.filter(Boolean).length;
    text(ctx, '스테이지 선택', SW / 2, 84, { size: 58, weight: '900', italic: true, align: 'center', glow: 'rgba(255,255,255,0.3)' });
    text(ctx, `클리어 ${cleared} / ${STAGE_COUNT}   ·   클리어한 단계는 언제든 다시 플레이할 수 있습니다`, SW / 2, 146, {
      size: 19,
      align: 'center',
      color: '#C9D3EC',
    });
    const hover = this.buttonAt(this.mouse);
    for (let i = 0; i < STAGE_COUNT; i++) this.drawStageCard(i, hover?.id === `stage:${i + 1}`);
  }

  private drawStageCard(i: number, hover: boolean): void {
    const st = STAGES[i];
    const r = cardRect(i);
    const unlocked = isUnlocked(this.save, st.id);
    const cleared = this.save.cleared[i];
    const edge = st.boss ? COLORS.attackBright : unlocked ? 'rgba(130,170,235,0.75)' : 'rgba(110,125,160,0.35)';
    ctx.save();
    chamfer(ctx, r.x, r.y, r.w, r.h, 14);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, unlocked ? 'rgba(24,38,70,0.9)' : 'rgba(14,20,36,0.88)');
    g.addColorStop(1, 'rgba(8,12,26,0.92)');
    ctx.fillStyle = g;
    ctx.fill();
    if (hover) {
      ctx.fillStyle = 'rgba(150,190,255,0.14)';
      ctx.fill();
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = hover ? 3 : 2;
    ctx.shadowColor = edge;
    ctx.shadowBlur = hover ? 22 : st.boss && unlocked ? 12 : 0;
    ctx.stroke();
    ctx.restore();

    text(ctx, `STAGE ${st.id}`, r.x + 18, r.y + 24, { size: 16, weight: '800', italic: true, color: unlocked ? '#BFD0F5' : '#6c7898' });
    if (st.boss) text(ctx, 'BOSS', r.x + 106, r.y + 24, { size: 15, weight: '900', color: COLORS.attackBright, glow: unlocked ? COLORS.attackBright : undefined, alpha: unlocked ? 1 : 0.5 });

    // 캐릭터 실루엣(모든 카드가 같은 축척이라 체형 차이가 그대로 보인다)
    const pose = idlePose(A.w / 2, CONFIG.floorY, st.dims, st.stance);
    const sc = 0.36;
    ctx.save();
    ctx.translate(r.x + r.w / 2 - (A.w / 2) * sc, r.y + 188 - CONFIG.floorY * sc);
    ctx.scale(sc, sc);
    if (unlocked) {
      drawStickman(ctx, pose, { rim: st.rim, eye: { color: st.eye, scale: st.eyeScale } });
      drawBlade(ctx, computeJoints(pose).hand[0], pose.armLow[0] + 0.78, st.sword, 0.95);
    } else {
      drawStickman(ctx, pose, { alpha: 0.28, eyes: false, rim: 'rgba(110,125,160,0.5)' });
    }
    ctx.restore();

    text(ctx, unlocked ? st.name : '???', r.x + r.w / 2, r.y + 210, { size: 22, weight: '800', align: 'center', color: unlocked ? '#FFFFFF' : '#6c7898' });
    text(ctx, unlocked ? `HP ${st.hp}  ·  ${st.trait}` : '이전 단계를 클리어하면 열립니다', r.x + r.w / 2, r.y + 233, {
      size: 13,
      align: 'center',
      color: unlocked ? '#9fb0d8' : '#56617f',
    });

    // 상태 아이콘
    const ix = r.x + r.w - 30;
    const iy = r.y + 26;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!unlocked) {
      ctx.strokeStyle = '#7f8aa6';
      ctx.fillStyle = '#7f8aa6';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ix, iy - 3, 6, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(ix - 9, iy - 3, 18, 14);
    } else if (cleared) {
      ctx.strokeStyle = '#5BFF9A';
      ctx.shadowColor = '#5BFF9A';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ix, iy, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix - 5, iy + 1);
      ctx.lineTo(ix - 1, iy + 5);
      ctx.lineTo(ix + 6, iy - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- 검 선택
  private drawSwordSelect(): void {
    const got = SWORDS.filter((_, i) => isSwordUnlocked(this.save, i)).length;
    text(ctx, '검 선택', SW / 2, 84, { size: 58, weight: '900', italic: true, align: 'center', glow: 'rgba(255,255,255,0.3)' });
    text(ctx, `획득 ${got} / ${SWORD_COUNT}   ·   n단계를 클리어하면 n+1번째 검을 얻고, 얻은 검은 언제든 다시 고를 수 있습니다`, SW / 2, 146, {
      size: 19,
      align: 'center',
      color: '#C9D3EC',
    });
    const hover = this.buttonAt(this.mouse);
    for (let i = 0; i < SWORD_COUNT; i++) this.drawSwordCard(i, hover?.id === `sword:${i}`);
  }

  private drawSwordCard(i: number, hover: boolean): void {
    const sw = SWORDS[i];
    const r = cardRect(i);
    const unlocked = isSwordUnlocked(this.save, i);
    const equipped = this.save.sword === i;
    const edge = equipped ? sw.glow : unlocked ? 'rgba(130,170,235,0.75)' : 'rgba(110,125,160,0.35)';
    ctx.save();
    chamfer(ctx, r.x, r.y, r.w, r.h, 14);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, unlocked ? 'rgba(24,38,70,0.9)' : 'rgba(14,20,36,0.88)');
    g.addColorStop(1, 'rgba(8,12,26,0.92)');
    ctx.fillStyle = g;
    ctx.fill();
    if (hover && unlocked) {
      ctx.fillStyle = 'rgba(150,190,255,0.14)';
      ctx.fill();
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = equipped || hover ? 3 : 2;
    ctx.shadowColor = edge;
    ctx.shadowBlur = equipped ? 20 : hover && unlocked ? 18 : 0;
    ctx.stroke();
    ctx.clip();
    drawSwordArt(ctx, sw, r.x + r.w / 2, r.y + 100, 170, this.time + i, !unlocked);
    ctx.restore();

    text(ctx, `${i + 1}단계`, r.x + 18, r.y + 24, { size: 16, weight: '800', italic: true, color: unlocked ? '#BFD0F5' : '#6c7898' });
    if (equipped) text(ctx, '장착 중', r.x + r.w - 18, r.y + 24, { size: 15, weight: '900', align: 'right', color: sw.glow, glow: sw.glow });
    else if (!unlocked) {
      const ix = r.x + r.w - 30;
      const iy = r.y + 26;
      ctx.save();
      ctx.strokeStyle = '#7f8aa6';
      ctx.fillStyle = '#7f8aa6';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ix, iy - 3, 6, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(ix - 9, iy - 3, 18, 14);
      ctx.restore();
    }
    text(ctx, unlocked ? sw.name : '???', r.x + r.w / 2, r.y + 180, { size: 24, weight: '800', align: 'center', color: unlocked ? '#FFFFFF' : '#6c7898' });
    if (unlocked) {
      text(ctx, sw.skill === 'none' ? sw.skillName : `${sw.skillName}`, r.x + r.w / 2, r.y + 203, { size: 15, weight: '800', align: 'center', color: sw.glow });
      text(ctx, sw.desc[0], r.x + r.w / 2, r.y + 222, { size: 13, align: 'center', color: '#9fb0d8' });
      text(ctx, sw.desc[1], r.x + r.w / 2, r.y + 239, { size: 13, align: 'center', color: '#9fb0d8' });
    } else {
      text(ctx, `${i}단계를 클리어하면 얻습니다`, r.x + r.w / 2, r.y + 215, { size: 13, align: 'center', color: '#56617f' });
    }
  }

  private drawTopUI(attack: boolean): void {
    // 턴 배너
    const accent = attack ? '#FF5C6A' : COLORS.defense;
    const bx = UI_X;
    const by = 20;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx - 8, by);
    ctx.lineTo(bx + 330, by);
    ctx.lineTo(bx + 300, by + 54);
    ctx.lineTo(bx - 8, by + 54);
    ctx.closePath();
    const g = ctx.createLinearGradient(bx, 0, bx + 330, 0);
    g.addColorStop(0, attack ? 'rgba(150,20,40,0.9)' : 'rgba(30,70,140,0.9)');
    g.addColorStop(1, 'rgba(12,18,38,0.85)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    text(ctx, attack ? '공격 턴' : '방어 턴', bx + 24, by + 28, { size: 34, weight: '900', italic: true, glow: accent });
    text(ctx, attack ? '드래그로 검격의 궤적을 그려 공격합니다.' : '자세를 배치해 적의 공격을 회피합니다.', bx + 350, by + 30, {
      size: 19,
      color: '#C9D3EC',
    });

    // HP 행
    this.drawPanel(UI_X, 90, UI_W, 64);
    text(ctx, '나 (플레이어)', UI_X + 50, 112, { size: 17, weight: '700' });
    text(ctx, `STAGE ${this.stage.id}  ${this.stage.name}`, UI_X + UI_W - 50, 112, {
      size: 17,
      weight: '700',
      align: 'right',
      color: this.stage.boss ? '#FFD27A' : '#FFFFFF',
    });
    this.drawHp(UI_X + 50, 126, 330, 16, 'player', COLORS.mine);
    this.drawHp(UI_X + UI_W - 380, 126, 330, 16, 'enemy', '#F0505B');
    text(ctx, `${Math.ceil(this.hpShown.player)} / ${this.hpMax.player}`, UI_X + 392, 134, { size: 16, color: '#DDE5F6' });
    text(ctx, `${Math.ceil(this.hpShown.enemy)} / ${this.hpMax.enemy}`, UI_X + UI_W - 392, 134, { size: 16, color: '#DDE5F6', align: 'right' });
    // 턴 다이아몬드
    ctx.save();
    ctx.translate(SW / 2, 122);
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(34, 0);
    ctx.lineTo(0, 30);
    ctx.lineTo(-34, 0);
    ctx.closePath();
    ctx.fillStyle = '#0d1630';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,185,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    text(ctx, '턴', SW / 2, 112, { size: 13, align: 'center', color: '#9fb0d8' });
    text(ctx, String(this.turn), SW / 2, 132, { size: 22, weight: '800', align: 'center' });
  }

  private drawHp(x: number, y: number, w: number, h: number, who: 'player' | 'enemy', color: string): void {
    const fromRight = who === 'enemy';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, h);
    const bar = (ratio: number, c: string) => {
      const bw = w * clamp(ratio / this.hpMax[who], 0, 1);
      ctx.fillStyle = c;
      ctx.fillRect(fromRight ? x + w - bw : x, y, bw, h);
    };
    bar(this.hpChip[who], 'rgba(255,255,255,0.85)');
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    bar(this.hpShown[who], color);
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,190,240,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  private drawArena(attack: boolean): void {
    const accent = attack ? COLORS.mine : COLORS.defense;
    const f = this.frame();
    const corners = [v(0, 0), v(A.w, 0), v(A.w, A.h), v(0, A.h)].map((p) => v(f.x + p.x * f.s, f.y + p.y * f.s));
    const tracePath = () => {
      ctx.beginPath();
      corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    tracePath();
    ctx.fillStyle = 'rgba(8,13,30,0.5)';
    ctx.fill();

    // 장면은 네모칸 밖(내 모습, 먼 적)까지 그리므로 클립하지 않는다.
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.s, f.s);

    // 카메라 연출 (턴 전환): 영역은 그대로이고 장면만 움직인다.
    const c = ease(this.camT);
    const zoom = this.camKind === 'attack' ? 1 + 0.12 * c : 1 - 0.1 * c;
    ctx.translate(A.w / 2 + (this.camKind === 'attack' ? 0 : 60 * c), A.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-A.w / 2, -A.h / 2);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.globalAlpha = 1 - 0.85 * c;

    ctx.save();
    const fg = ctx.createLinearGradient(0, CONFIG.floorY - 50, 0, A.h);
    fg.addColorStop(0, 'rgba(70,95,150,0)');
    fg.addColorStop(1, 'rgba(70,95,150,0.22)');
    ctx.fillStyle = fg;
    ctx.fillRect(-1600, CONFIG.floorY - 50, A.w + 3200, A.h - CONFIG.floorY + 50);
    ctx.strokeStyle = 'rgba(150,180,235,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-1600, CONFIG.floorY + 6);
    ctx.lineTo(A.w + 1600, CONFIG.floorY + 6);
    ctx.stroke();

    if (attack) this.drawAttackScene();
    else this.drawDefenseScene();

    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();

    // ---- 화면에 붙은 요소(기울이지 않음): 피해 숫자, 안내 문구, 1인칭 검
    for (const fl of this.floats) {
      text(ctx, fl.s, fl.x, fl.y, { size: fl.size ?? 44, weight: '900', color: fl.color, align: 'center', glow: fl.color, alpha: clamp(fl.life, 0, 1) });
    }
    const pulse = 0.5 + 0.2 * Math.sin(this.time * 3);
    if (this.state === 'PLAYER_ATTACK_PREPARE') {
      if (this.slash.points.length <= 1) {
        text(ctx, '여기에 드래그해서 검격을 그리세요', A.w / 2, -24, { size: 22, align: 'center', color: COLORS.mine, alpha: pulse * 0.9 });
      }
    } else if (this.state === 'PLAYER_ATTACK_EXECUTE' && this.exec) {
      const e = this.exec;
      void e;
    } else if (this.state === 'PLAYER_DEFENSE_PREPARE') {
      text(ctx, '핸들 드래그  ·  머리 위 회전 버튼으로 눕기·뒤집기', A.w / 2, -24, { size: 20, align: 'center', color: COLORS.defense, alpha: pulse });
      if (this.enemySkillTurn) {
        const ew = this.enemySword();
        text(ctx, `⚠ 적의 스킬 발동: ${ew.skillName}  —  ${ew.desc.join(' ')}`, A.w / 2, -54, { size: 22, weight: '800', align: 'center', color: ew.glow, glow: ew.glow });
      }
    }
    ctx.restore();

    // 입력 가능 영역 테두리 (공격/방어 동일한 위치와 크기)
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    tracePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    const L = 34;
    for (let i = 0; i < 4; i++) {
      const cur = corners[i];
      const prev = corners[(i + 3) % 4];
      const next = corners[(i + 1) % 4];
      const dp = Math.hypot(prev.x - cur.x, prev.y - cur.y);
      const dn = Math.hypot(next.x - cur.x, next.y - cur.y);
      ctx.beginPath();
      ctx.moveTo(cur.x + ((prev.x - cur.x) / dp) * L, cur.y + ((prev.y - cur.y) / dp) * L);
      ctx.lineTo(cur.x, cur.y);
      ctx.lineTo(cur.x + ((next.x - cur.x) / dn) * L, cur.y + ((next.y - cur.y) / dn) * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 물웅덩이 그림자와 물결. 자세가 바닥에 차지하는 가로 폭만큼 퍼진다(서면 좁고, 누우면 길게). */
  private groundShadow(p: Pose, alpha = 1): void {
    const fy = CONFIG.floorY + 8;
    const parts = bodyParts(p);
    let lo = Infinity;
    let hi = -Infinity;
    let lowest = -Infinity;
    for (const part of parts) {
      lo = Math.min(lo, part.a.x - part.r, part.b.x - part.r);
      hi = Math.max(hi, part.a.x + part.r, part.b.x + part.r);
      lowest = Math.max(lowest, part.a.y, part.b.y);
    }
    const lift = Math.max(0, CONFIG.floorY - lowest);
    const fade = clamp(1 - lift / 260, 0.3, 1) * alpha;
    const cx = (lo + hi) / 2;
    const rx = Math.max(60, (hi - lo) / 2 + 20);
    const ry = 11 + rx * 0.06;
    ctx.save();
    ctx.translate(cx, fy);
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,185,255,1)';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35 * fade;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 천천히 퍼져 나가는 물결
    const ph = (this.time * 0.5) % 1;
    ctx.globalAlpha = 0.3 * (1 - ph) * fade;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * (1.3 + 0.5 * ph), ry * (1.3 + 0.5 * ph), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawGhosts(pose: Pose): void {
    if (this.dodgeFx <= 0) return;
    for (const dx of [-70, -40, 45]) {
      const g = { ...pose, pelvis: v(pose.pelvis.x + dx, pose.pelvis.y) };
      drawStickman(ctx, g, { alpha: 0.28 * this.dodgeFx, body: '#4c78e0', rim: 'rgba(160,200,255,0.9)', eyes: false });
    }
  }

  /** 검격이 출발하는 위치. 플레이어는 가까운 곳(크게), 적은 먼 곳(작게)에서 시작한다. */
  private slashOrigin(e: Exec): { scale: number; ct: Vec } {
    const c = e.centroid;
    if (e.kind === 'player') {
      void c;
      return { scale: 0.7, ct: v(NEAR.x + 80, NEAR.feetY - NEAR.scale * 240) };
    }
    return { scale: 0.25, ct: v(FAR.x, FAR.feetY - FAR.scale * 0.57 * bodyHeight(this.stage.dims)) };
  }

  /** f = 0: 출발 위치, f = 1: 실제 판정 위치(그린 그대로) */
  private slashAt(e: Exec, f: number): { pts: Vec[]; scale: number } {
    const o = this.slashOrigin(e);
    const scale = lerp(o.scale, 1, f);
    const ct = lerpV(o.ct, e.centroid, f);
    const c = e.centroid;
    return { scale, pts: e.pts.map((p) => v(ct.x + (p.x - c.x) * scale, ct.y + (p.y - c.y) * scale)) };
  }

  private swordTip(e: Exec): Vec | undefined {
    if (e.t < e.swingStart || e.t >= e.cutStart) return undefined;
    const r = e.t < e.flyStart ? ease((e.t - e.swingStart) / e.swingDur) : 1;
    const pts = this.slashAt(e, 0).pts;
    const part = partialPolyline(pts, polyLength(pts) * r);
    return part[part.length - 1];
  }

  private drawSweep(color: string): void {
    const e = this.exec;
    if (!e) return;
    const executing = this.state === 'PLAYER_ATTACK_EXECUTE' || this.state === 'AI_ATTACK_EXECUTE';
    if (!executing) {
      drawSlash(ctx, e.pts, color, clamp((this.result?.timer ?? 0) / 1.2, 0, 0.7), false, e.plan?.strikes[0].ws ?? 1);
      if (e.plan?.active) this.drawExtras(e, e.end + 1, 0.5);
      return;
    }
    const t = e.t;
    const k = e.plan?.strikes[0].ws ?? 1;
    const wsOf = (scale: number) => clamp(scale, 0.35, 1.4) * k;
    if (t < e.swingStart) {
      if (e.kind === 'enemy') {
        // 공격 직전 경고
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 30);
        ctx.fillStyle = COLORS.attackBright;
        ctx.fillRect(0, 0, 6, A.h);
        ctx.fillRect(A.w - 6, 0, 6, A.h);
        ctx.restore();
      }
      return;
    }
    if (t < e.flyStart) {
      // 휘두르기
      const r = ease((t - e.swingStart) / e.swingDur);
      const at = this.slashAt(e, 0);
      drawSlash(ctx, partialPolyline(at.pts, polyLength(at.pts) * r), color, 1, true, wsOf(at.scale));
      return;
    }
    if (t < e.cutStart) {
      // 비행: 플레이어는 가까운 곳에서 멀리, 적은 먼 곳에서 가까이 날아온다.
      const u = clamp((t - e.flyStart) / e.flyDur, 0, 1);
      const warp = (x: number) => (e.kind === 'player' ? 1 - (1 - clamp(x, 0, 1)) ** 2.2 : clamp(x, 0, 1) ** 2.2);
      for (const [d, a] of [
        [0.16, 0.12],
        [0.1, 0.22],
        [0.05, 0.4],
      ]) {
        if (u - d > 0) {
          const echo = this.slashAt(e, warp(u - d));
          drawSlash(ctx, echo.pts, color, a, false, wsOf(echo.scale));
        }
      }
      const at = this.slashAt(e, warp(u));
      drawSlash(ctx, at.pts, color, 1, false, wsOf(at.scale));
      return;
    }
    // 관통: 도착한 검격이 신체를 가르며 지나간다.
    const fade = clamp(1 - (t - (e.cutStart + e.cutDur)) / 0.5, 0.2, 1);
    drawSlash(ctx, e.pts, color, 0.45 * fade, false, k);
    drawSlash(ctx, partialPolyline(e.pts, e.sweepLen), color, fade, false, k);
    if (e.plan?.active) this.drawExtras(e, t, 1);
  }

  /** 스킬로 생긴 추가 베기, 폭발을 그린다. t = 연출 시각. */
  private drawExtras(e: Exec, t: number, alpha: number): void {
    const plan = e.plan;
    if (!plan) return;
    const glow = plan.sword.glow;
    for (const st of plan.strikes) {
      if (st.kind === 'main') continue;
      const local = t - e.cutStart - st.delay;
      if (local <= 0) continue;
      const reveal = clamp(local / st.dur, 0, 1);
      const fade = clamp(1 - (local - st.dur) / 0.5, 0.2, 1) * alpha;
      const col = st.kind === 'bolt' ? '#DDE4FF' : plan.sword.color;
      drawSlash(ctx, st.vis, col, 0.3 * fade, false, 0.7);
      drawSlash(ctx, partialPolyline(st.vis, polyLength(st.vis) * reveal), col, fade, false, 0.8);
    }
    for (const bl of plan.blasts) {
      const rt = t - e.cutStart - bl.delay;
      if (bl.bloom > 0) {
        if (rt <= 0 && rt > -bl.bloom) {
          const k = 1 + rt / bl.bloom;
          drawBlossom(ctx, bl.c, bl.r * 0.55 * ease(k), t * 2 + bl.c.x, plan.sword.color, glow, alpha * (0.4 + 0.6 * k));
        } else if (rt > 0) {
          drawBlossom(ctx, bl.c, bl.r * (0.55 + 0.45 * ease(rt / 0.18)), t * 2 + bl.c.x, plan.sword.color, glow, alpha * clamp(1 - rt / 0.4, 0, 1));
        }
      } else if (rt > 0) {
        const rr = bl.r * ease(rt / 0.18);
        const a = clamp(1 - rt / 0.55, 0, 1) * alpha;
        const c = bl.c;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(1, rr));
        g.addColorStop(0, `rgba(255,255,255,${0.8 * a})`);
        g.addColorStop(0.5, `rgba(255,150,60,${0.5 * a})`);
        g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(1, rr), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = glow;
        ctx.globalAlpha = a;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /** 지금 그리는 검격의 굵기 배율(금강도 스킬을 켜면 두꺼워진다) */
  private slashThick(): number {
    return this.sword.skill === 'shatter' && this.skillOn && this.skillReady() ? CONFIG.skill.thickScale : 1;
  }

  /** 플레이어의 검에 기운을 두를 때인가(스킬을 켠 공격 턴, 스킬이 들어가는 공격 연출) */
  private auraOn(): boolean {
    if (this.state === 'PLAYER_ATTACK_PREPARE') return this.skillOn && this.skillReady();
    return this.state === 'PLAYER_ATTACK_EXECUTE' && !!this.exec?.plan?.active;
  }

  /** 적의 검에 기운을 두를 때인가(적이 스킬을 쓰는 턴) */
  private enemyAuraOn(): boolean {
    if (this.state === 'PLAYER_DEFENSE_PREPARE') return this.enemySkillTurn;
    return this.state === 'AI_ATTACK_EXECUTE' && !!this.exec?.plan?.active;
  }

  /** 스킬을 켠 상태에서 완료 전에 보여 주는 추가 베기 미리보기 */
  private drawPlanPreview(plan: AttackPlan): void {
    const glow = plan.sword.glow;
    for (const st of plan.strikes) {
      if (st.kind !== 'main') drawSlash(ctx, st.vis, plan.sword.color, 0.38, false, 0.55);
    }
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = glow;
    ctx.globalAlpha = 0.7;
    for (const bl of plan.blasts) {
      ctx.beginPath();
      ctx.arc(bl.c.x, bl.c.y, bl.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 보스 등장 연출 중에는 적이 서서히 나타난다. */
  private enemyAlpha(): number {
    return this.state === 'BOSS_INTRO' ? clamp((this.introT - 1.6) / 1.6, 0, 1) : 1;
  }

  private drawAttackScene(): void {
    const pose = this.enemyShown;
    const st = this.stage;
    const ea = this.enemyAlpha();
    this.groundShadow(this.enemyIdle, ea);
    this.drawGhosts(this.enemyIdle);
    drawStageFx(ctx, st, pose, this.time, 'back', ea);
    drawStickman(ctx, pose, { alpha: ea, rim: st.rim, eye: { color: st.eye, scale: st.eyeScale } });
    if (this.enemySword().skill === 'blossom') drawPetalAura(ctx, pose, this.time);
    drawBlade(ctx, computeJoints(pose).hand[0], pose.armLow[0] + 0.78, st.sword, ea);
    drawStageFx(ctx, st, pose, this.time, 'front', ea);
    this.drawPlayerBack();

    if (this.state === 'PLAYER_ATTACK_PREPARE') {
      if (this.slash.points.length > 1) drawSlash(ctx, this.slash.points, this.sword.glow, 0.95, this.slash.drawing, this.slashThick());
      if (this.skillOn && this.skillReady() && this.slash.points.length > 1 && !this.slash.drawing) {
        this.drawPlanPreview(planAttack(this.sword, this.slash.points, true, this.planSeed, CUT_DUR));
      }
    } else {
      this.drawSweep(this.sword.glow);
    }
  }

  /** 멀리 있는 적. 공격할 때 칼을 치켜들고 검격을 따라 휘두른다. */
  private drawEnemyFar(): void {
    this.drawSwinger('enemy', FAR, false);
  }

  /** 뒤에서 본 나. 공격할 때 적처럼 검격을 따라 검을 휘두른다. */
  private drawPlayerBack(): void {
    this.drawSwinger('player', NEAR, true);
  }

  private drawSwinger(kind: 'player' | 'enemy', pos: { x: number; feetY: number; scale: number }, back: boolean): void {
    const s = pos.scale;
    const tx = pos.x - (A.w / 2) * s;
    const ty = pos.feetY - CONFIG.floorY * s;
    const st = this.stage;
    let pose = kind === 'enemy' ? idlePose(A.w / 2, CONFIG.floorY, st.dims, st.stance) : idlePose();
    let blade: { from: Vec; ang: number } | null = null;
    const e = this.exec;
    if (e && e.kind === kind && this.state === (kind === 'enemy' ? 'AI_ATTACK_EXECUTE' : 'PLAYER_ATTACK_EXECUTE')) {
      const toPose = (p: Vec) => v((p.x - tx) / s, (p.y - ty) / s);
      const path = this.slashAt(e, 0).pts;
      const rest = computeJoints(pose).hand[0];
      let target: Vec;
      let tangent = Math.PI;
      if (e.t < e.swingStart) {
        // 칼을 치켜들고 몸을 뒤로 젖힌다.
        const k = ease(e.t / e.swingStart);
        const p0 = toPose(path[0]);
        target = lerpV(rest, v(p0.x, p0.y - 40), k);
        pose.torso = 0.2 * k;
      } else {
        const r = e.t < e.flyStart ? ease((e.t - e.swingStart) / e.swingDur) : 1;
        const part = partialPolyline(path, polyLength(path) * r);
        const last = part[part.length - 1];
        target = toPose(last);
        if (part.length > 1) {
          const prev = part[part.length - 2];
          tangent = Math.atan2(last.y - prev.y, last.x - prev.x);
        }
        pose.torso = 0.2 * (1 - r) - 0.15 * r;
      }
      pose = clampLimits(applyDrag(pose, 'hand0', target));
      const hand = computeJoints(pose).hand[0];
      const dx = target.x - hand.x;
      const dy = target.y - hand.y;
      blade = { from: hand, ang: Math.hypot(dx, dy) > 10 ? Math.atan2(dy, dx) : tangent };
    }
    const swinging = !!blade;
    if (!blade) {
      const h = computeJoints(pose).hand[0];
      blade = { from: h, ang: back ? -2.3 : pose.armLow[0] + 0.78 };
    }
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(s, s);
    if (kind === 'enemy') drawStageFx(ctx, st, pose, this.time, 'back', 0.85);
    this.groundShadow(pose, back ? 1 : 0.7);
    drawStickman(ctx, pose, back ? { alpha: 1, eyes: false } : { alpha: swinging ? 0.9 : 0.55, rim: st.rim, eye: { color: st.eye, scale: st.eyeScale } });
    if ((kind === 'player' && this.sword.skill === 'blossom') || (kind === 'enemy' && this.enemySword().skill === 'blossom')) drawPetalAura(ctx, pose, this.time);
    if (kind === 'player' && this.auraOn()) drawBladeAura(ctx, blade.from, blade.ang, this.sword, this.time);
    if (kind === 'enemy' && this.enemyAuraOn()) drawBladeAura(ctx, blade.from, blade.ang, this.enemySword(), this.time, 1, st.sword.length);
    drawBlade(ctx, blade.from, blade.ang, kind === 'player' ? this.swordStyle() : st.sword, back || swinging ? 1 : 0.65);
    if (kind === 'enemy') drawStageFx(ctx, st, pose, this.time, 'front', 0.85);
    ctx.restore();
  }

  /** 화면에 보이는 플레이어 자세. 방어를 확정하면 웅크림 -> 점프 -> 자세 전환 애니메이션이 재생된다. */
  playerDisplay(): Pose {
    const e = this.exec;
    if (this.state === 'AI_ATTACK_EXECUTE' && e && e.kind === 'enemy') {
      const idle = idlePose();
      const base = e.t < 0.2 ? lerpPose(this.playerPose, idle, ease(e.t / 0.2)) : idle;
      return defenseAnimPose(base, this.playerPose, e.t - e.animStart);
    }
    return this.playerPose;
  }

  private drawDefenseScene(): void {
    this.drawEnemyFar();

    const shown = this.playerDisplay();
    this.groundShadow(shown);
    this.drawGhosts(shown);
    drawStickman(ctx, shown, { eyes: false });
    if (this.sword.skill === 'blossom') drawPetalAura(ctx, shown, this.time);

    if (this.state === 'PLAYER_DEFENSE_PREPARE') {
      const J = computeJoints(this.playerPose);
      drawRotateButton(ctx, this.rotBtnPos(), J.headC, !!this.rot, this.hoverRot, this.time);
      drawHandles(ctx, this.playerPose, this.drag?.id ?? null, this.hover, this.time);
    } else {
      this.drawSweep(this.stage.sword.glow);
    }
  }

  private drawBottomUI(attack: boolean): void {
    const y = 786;
    if (attack) {
      const w = this.sword;
      text(ctx, w.name, UI_X + (w.skill === 'none' ? 160 : 610), 742, { size: 22, weight: '800', color: w.glow, glow: w.glow });
      text(ctx, w.desc.join(' '), UI_X + (w.skill === 'none' ? 160 : 610), 766, { size: 14, color: '#9fb0d8' });
    }
    this.drawPanel(UI_X, y, 700, 86);
    if (attack) {
      const ratio = this.slash.remainingRatio;
      const rem = Math.round(ratio * 100);
      text(ctx, '↔ 검격 길이', UI_X + 24, y + 26, { size: 17, weight: '700', color: '#DDE5F6' });
      const gx = UI_X + 150;
      const gw = 400;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(gx, y + 16, gw, 20);
      ctx.save();
      ctx.shadowColor = COLORS.mine;
      ctx.shadowBlur = 12;
      ctx.fillStyle = ratio > 0.2 ? COLORS.mine : '#FF8A5C';
      ctx.fillRect(gx, y + 16, gw * ratio, 20);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(gx + (gw * i) / 10, y + 16);
        ctx.lineTo(gx + (gw * i) / 10, y + 36);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(160,190,240,0.5)';
      ctx.strokeRect(gx, y + 16, gw, 20);
      text(ctx, `${rem} / 100`, gx + gw + 14, y + 26, { size: 18, weight: '700' });
      if (this.sword.skill === 'crescent' && this.skillOn) text(ctx, '길이 +20%', gx + gw + 100, y + 26, { size: 16, weight: '800', color: this.sword.glow });
      text(ctx, '드래그: 검격 그리기   ·   우클릭 또는 다시 그리기: 초기화   ·   한 번에 하나의 검격만 그릴 수 있습니다', UI_X + 24, y + 62, { size: 15, color: '#9fb0d8' });
    } else {
      text(ctx, '핸들 드래그: 관절 이동   ·   머리 위 회전 버튼 드래그: 몸 전체 회전 (눕기·뒤집기)', UI_X + 24, y + 30, { size: 18, weight: '700', color: '#DDE5F6' });
      text(ctx, '손·발을 끌면 팔꿈치와 무릎이 따라 움직입니다   ·   전투 영역 밖으로는 나갈 수 없습니다', UI_X + 24, y + 62, { size: 15, color: '#9fb0d8' });
    }
  }

  private drawResult(): void {
    if (!this.result) return;
    const r = this.result;
    const a = clamp((1.6 - r.timer) / 0.2, 0, 1) * clamp(r.timer / 0.25, 0, 1);
    const w = 460;
    const x = SW / 2 - w / 2;
    const y = A.y + 22;
    ctx.save();
    ctx.globalAlpha = a;
    this.drawPanel(x, y, w, 104, r.color);
    text(ctx, r.title, SW / 2, y + 40, { size: 44, weight: '900', italic: true, align: 'center', color: r.color, glow: r.color });
    text(ctx, r.sub, SW / 2, y + 82, { size: 20, align: 'center', color: '#E6ECFA' });
    ctx.restore();
  }

  /** 스테이지를 처음 클리어하고 새 검을 얻었을 때의 보상 화면 */
  private drawNewSword(color: string): void {
    const nw = SWORDS[this.newSword!];
    text(ctx, 'STAGE CLEAR', SW / 2, 210, { size: 100, weight: '900', italic: true, align: 'center', color, glow: color });
    text(ctx, `STAGE ${this.stage.id}  ·  ${this.stage.name}  ·  ${this.turn}턴`, SW / 2, 262, { size: 20, align: 'center', color: '#8fa0c8' });
    const pw = 700;
    const ph = 300;
    const px = SW / 2 - pw / 2;
    const py = 305;
    this.drawPanel(px, py, pw, ph, nw.glow);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    drawSwordArt(ctx, nw, px + 190, py + 150, 290, this.time, false);
    ctx.restore();
    const tx = px + 380;
    text(ctx, '새로운 검 획득!', tx, py + 52, { size: 20, weight: '800', color: '#FFE08A', glow: '#FFB020' });
    text(ctx, nw.name, tx, py + 118, { size: 60, weight: '900', italic: true, color: '#FFFFFF', glow: nw.glow });
    text(ctx, `스킬  ${nw.skillName}`, tx, py + 170, { size: 24, weight: '800', color: nw.glow });
    text(ctx, nw.desc[0], tx, py + 208, { size: 18, color: '#C9D3EC' });
    text(ctx, nw.desc[1], tx, py + 234, { size: 18, color: '#C9D3EC' });
  }

  private drawGameOver(): void {
    const o = this.over!;
    const a = clamp(o.t / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,7,18,0.72)';
    ctx.fillRect(0, 0, SW, SH);
    const color = o.win ? COLORS.mine : COLORS.attackBright;
    if (o.win && this.newSword !== null) {
      this.drawNewSword(color);
      ctx.restore();
      return;
    }
    text(ctx, o.win ? 'STAGE CLEAR' : '패배', SW / 2, 380, { size: o.win ? 110 : 150, weight: '900', italic: true, align: 'center', color, glow: color });
    const last = this.stage.id === STAGE_COUNT;
    text(ctx, o.win ? (last ? '모든 스테이지를 클리어했습니다!' : `${this.stage.name}을(를) 쓰러뜨렸습니다`) : '쓰러졌습니다', SW / 2, 480, {
      size: 28,
      align: 'center',
      color: '#D6DEF2',
    });
    text(ctx, `STAGE ${this.stage.id}  ·  ${this.stage.name}  ·  ${this.turn}턴`, SW / 2, 526, { size: 20, align: 'center', color: '#8fa0c8' });

    ctx.restore();
  }

  /** 집 모양 아이콘(지붕 + 몸체 + 문) */
  private drawHomeIcon(cx: number, cy: number, hot: boolean): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = hot ? '#FFFFFF' : '#DCE6FF';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -1);
    ctx.lineTo(0, -12);
    ctx.lineTo(12, -1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-8, 10);
    ctx.lineTo(8, 10);
    ctx.lineTo(8, -2);
    ctx.stroke();
    ctx.fillRect(-2.5, 3, 5, 7);
    ctx.restore();
  }

  /** 1단계 처음 시작 때 한 번 보이는 조작법 안내 */
  private drawTutorial(): void {
    if (!this.tutorial) return;
    ctx.fillStyle = 'rgba(4,7,18,0.72)';
    ctx.fillRect(0, 0, SW, SH);
    this.drawPanel(390, 220, 820, 440, COLORS.mine);
    text(ctx, '게임 방법', SW / 2, 280, { size: 44, weight: '900', italic: true, align: 'center', color: COLORS.mine, glow: COLORS.mine });
    const rows: [string, string, string, string][] = [
      ['공격', COLORS.mine, "드래그해 검격을 그리고 '완료'를 누르세요", ''],
      ['방어', COLORS.defense, '핸들을 끌어 적의 검격을 피하세요', '(머리 위 버튼: 눕기·뒤집기)'],
      ['목표', '#FFE08A', '스테이지를 클리어하고 새로운 검을 얻으세요!', ''],
    ];
    rows.forEach(([label, color, body, body2], i) => {
      const y = 360 + i * 70;
      text(ctx, label, 430, y, { size: 26, weight: '800', color, glow: color });
      text(ctx, body, 540, body2 ? y - 12 : y, { size: 24, color: '#E6ECFA' });
      if (body2) text(ctx, body2, 540, y + 20, { size: 20, color: '#C9D3EC' });
    });
  }

  /** 스킬 버튼 도움말: 맥동 테두리와 말풍선. 입력은 막지 않는다. */
  private drawSkillHint(): void {
    if (!this.skillHint) return;
    const b = this.buttons().find((x) => x.id === 'skill');
    if (!b) return;
    const glow = this.sword.glow;
    ctx.save();
    chamfer(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 14);
    ctx.strokeStyle = glow;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.time * 5);
    ctx.lineWidth = 4;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 26;
    ctx.stroke();
    ctx.restore();
    const by = b.y - 78 + Math.sin(this.time * 4) * 3;
    this.drawPanel(b.x + 10, by, 420, 52, glow);
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,30,0.95)';
    ctx.strokeStyle = glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x + 50, by + 51);
    ctx.lineTo(b.x + 70, by + 51);
    ctx.lineTo(b.x + 60, by + 66);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(ctx, '여기서 검의 스킬을 켜고 끌 수 있어요!', b.x + 220, by + 26, { size: 20, weight: '800', align: 'center', color: '#FFFFFF', glow });
  }

  private drawButtons(): void {
    const hover = this.buttonAt(this.mouse);
    for (const b of this.buttons()) {
      if (b.card) continue;
      const isHover = hover?.id === b.id;
      const small = b.id === 'mute' || b.id === 'home';
      ctx.save();
      chamfer(ctx, b.x, b.y, b.w, b.h, small ? 6 : 14);
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, b.enabled ? 'rgba(20,34,66,0.95)' : 'rgba(20,26,44,0.8)');
      g.addColorStop(1, 'rgba(8,14,30,0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      if (b.selected) {
        ctx.fillStyle = 'rgba(145,185,255,0.22)';
        ctx.fill();
      }
      ctx.globalAlpha = b.enabled ? 1 : 0.4;
      ctx.strokeStyle = b.accent;
      ctx.lineWidth = isHover || b.selected ? 3 : 2;
      ctx.shadowColor = b.accent;
      ctx.shadowBlur = b.enabled ? (isHover ? 24 : 12) : 0;
      ctx.stroke();
      ctx.restore();
      if (b.id === 'home') {
        this.drawHomeIcon(b.x + b.w / 2, b.y + b.h / 2, isHover);
        continue;
      }
      text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, {
        size: small ? 15 : b.h > 70 ? 34 : 24,
        weight: '800',
        italic: !small,
        align: 'center',
        color: b.enabled ? '#FFFFFF' : '#7f8aa6',
        glow: b.enabled && !small ? b.accent : undefined,
      });
    }
    void FONT;
  }
}

// ------------------------------------------------------------------ 시작

const game = new Game();
(window as unknown as { __game: Game }).__game = game;
resize();
window.addEventListener('resize', resize);
// 마우스와 터치를 같은 코드로 처리한다. 손가락이 여러 개여도 처음 닿은 하나만 쓴다.
window.addEventListener('pointerdown', (e) => {
  if (e.isPrimary) game.mouseDown(e);
});
window.addEventListener('pointermove', (e) => {
  if (!e.isPrimary) return;
  game.touch = e.pointerType !== 'mouse';
  game.mouseMove(e);
});
window.addEventListener('pointerup', (e) => {
  if (e.isPrimary) game.mouseUp(e);
});
window.addEventListener('pointercancel', () => game.releaseInputs());
window.addEventListener('blur', () => game.releaseInputs());
document.addEventListener('mouseleave', () => game.releaseInputs());
window.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('dragstart', (e) => e.preventDefault());

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
