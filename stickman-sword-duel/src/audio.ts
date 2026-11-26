import { CONFIG } from './logic/config.ts';
import type { SkillId } from './logic/swords.ts';
import clickUrl from './audio/button-click.mp3';
import whooshUrl from './audio/sword-whoosh.wav';
import crescentUrl from './audio/02_cheongpung_wind.wav';
import rendUrl from './audio/03_jeokwol_tear.mp3';
import echoUrl from './audio/04_hwanyeong_echo.mp3';
import shatterUrl from './audio/05_geumgang_break.mp3';
import frostUrl from './audio/06_binggyeol_chime.mp3';
import blastUrl from './audio/07_yeomhwa_fire_explosions.mp3';
import petalUrl from './audio/08_maehwa_petal_pops.mp3';
import blossomUrl from './audio/08_maehwa_swing.wav';
import thunderUrl from './audio/09_noemyeong_lightning.mp3';
import eclipseUrl from './audio/10_wolsik_double_slash.mp3';

/** 소리 파일. 게임이 한 HTML 파일로 묶이므로 빌드할 때 안에 들어간다. */
const FILES: Record<string, string> = {
  click: clickUrl,
  whoosh: whooshUrl,
  crescent: crescentUrl,
  rend: rendUrl,
  echo: echoUrl,
  shatter: shatterUrl,
  frost: frostUrl,
  blossom: blossomUrl,
  eclipse: eclipseUrl,
  blastBoom: blastUrl,
  petalPops: petalUrl,
  lightning: thunderUrl,
};
/** 스킬을 쓰면 검격이 날아갈 때 나는 소리(휘두르는 소리는 항상 sword-whoosh) */
const SWING_FILE: Partial<Record<SkillId, string>> = {
  crescent: 'crescent',
  rend: 'rend',
  echo: 'echo',
  shatter: 'shatter',
  frost: 'frost',
  blossom: 'blossom',
  eclipse: 'eclipse',
};
/**
 * 검격이 몸을 베는 시점(cut) 기준으로 늦게 나오는 효과음.
 * at: 첫 효과가 시작되는 시각(cut 으로부터 초), lead: 그 소리 파일에서 효과음이 나오는 위치(초),
 * repeat/every: 효과가 여러 번이면 횟수와 간격(초). 매화도는 꽃잎이 터질 때마다 팝 소리가 한 번씩 난다.
 */
const EXTRA_FILE: Partial<Record<SkillId, { key: string; at: number; lead: number; repeat?: number; every?: number; gain?: number }>> = {
  blast: { key: 'blastBoom', at: 0.03, lead: 0.3 },
  thunder: { key: 'lightning', at: 0.1, lead: 0.1 },
  // 월식도: 두 번째 베기(cut 으로부터 cutDur + 0.18초 뒤)가 시작될 때 같은 소리가 절반 음량으로 한 번 더 난다.
  eclipse: { key: 'eclipse', at: 0.22 + 0.18, lead: 0.15, gain: 0.5 },
  blossom: { key: 'petalPops', at: CONFIG.skill.blossomBloom, lead: 0.2, repeat: CONFIG.skill.blossomCount, every: CONFIG.skill.blossomGap },
};
/** 검격이 날아가기 시작한 뒤 스킬 소리를 늦추는 시간(초). 적월도는 0.5초 늦게 난다. */
const SWING_LAG: Partial<Record<SkillId, number>> = { rend: 0.5 };
/** 파일마다 크기가 달라 맞춘 음량 배율(기본 1) */
const GAIN: Record<string, number> = { frost: 2.5, shatter: 0.5, lightning: 0.45, blossom: 0.8, petalPops: 0.8 };

/** 외부 파일 없이 Web Audio로 효과음을 합성한다. (단일 HTML 용량 절약) */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private bufs = new Map<string, AudioBuffer>();

  private loaded = false;
  /** 소리 파일을 미리 불러와 풀어 둔다(처음 소리가 날 때 한 번) */
  private load(c: AudioContext): void {
    this.loaded = true;
    for (const [key, url] of Object.entries(FILES)) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b))
        .then((buf) => this.bufs.set(key, buf))
        .catch(() => {});
    }
  }
  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.loaded) this.load(this.ctx);
    return this.ctx;
  }

  private noise(c: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const c = this.ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private burst(dur: number, vol: number, f0: number, f1: number, q = 1.2, delay = 0): void {
    const c = this.ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise(c);
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0);
    filt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** 버튼을 누를 때 소리. 파일을 아직 못 불러왔으면 합성음을 쓴다. */
  click(): void {
    if (this.play('click')) return;
    this.tone(720, 0.07, 'square', 0.05, 520);
  }
  select(): void {
    this.tone(520, 0.05, 'triangle', 0.07);
  }
  slash(): void {
    this.burst(0.38, 0.5, 700, 3600);
  }
  hit(heavy: boolean): void {
    this.tone(heavy ? 150 : 210, 0.22, 'sawtooth', 0.22, 45);
    this.burst(0.16, heavy ? 0.5 : 0.35, 2400, 500, 0.8);
  }
  dodge(): void {
    this.tone(520, 0.25, 'sine', 0.08, 880);
  }
  /**
   * 공격 시작(검을 휘두를 때)에 부른다. 휘두르는 소리는 언제나 sword-whoosh 이고,
   * 스킬을 쓴 공격이면 검격이 날아가기 시작할 때 그 검의 스킬 소리가 더해진다.
   * untilFly, untilCut 은 지금부터 검격이 날아가기 시작하는 시점, 몸을 베는 시점까지 남은 시간(초)이다.
   * 폭발, 번개, 꽃잎처럼 늦게 나오는 효과음은 베는 시점에 맞춘다.
   */
  swing(skill: SkillId | null, untilFly: number, untilCut: number): void {
    if (!this.play('whoosh')) this.slash();
    const flyKey = skill ? SWING_FILE[skill] : undefined;
    if (flyKey) this.play(flyKey, Math.max(0, untilFly + (SWING_LAG[skill!] ?? 0)));
    const ex = skill ? EXTRA_FILE[skill] : undefined;
    if (ex) {
      for (let i = 0; i < (ex.repeat ?? 1); i++) this.play(ex.key, Math.max(0, untilCut + ex.at + i * (ex.every ?? 0) - ex.lead), ex.gain ?? 1);
    }
  }
  /** 불러온 소리 파일을 재생한다. 아직 불러오지 못했으면 false */
  private play(key: string, delay = 0, vol = 1): boolean {
    const c = this.ensure();
    const buf = this.bufs.get(key);
    if (!c || !buf) return false;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = (GAIN[key] ?? 1) * vol;
    src.connect(g).connect(c.destination);
    src.start(c.currentTime + delay);
    return true;
  }
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.12, undefined, i * 0.13));
  }
  lose(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.09, undefined, i * 0.2));
  }
  warn(): void {
    this.tone(260, 0.18, 'square', 0.05, 180);
  }
}
