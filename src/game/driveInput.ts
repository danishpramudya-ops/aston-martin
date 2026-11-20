/**
 * Driver inputs from keyboard, gamepad (standard mapping, analog steering and pedals) and the
 * on-screen pedals. Keys are read by physical position (`e.code`) so WASD also works on AZERTY.
 *
 * Fixes from the first test-drive build: held keys are released when the window loses focus,
 * auto-repeat no longer fires repeated shifts / camera changes, browser shortcuts (Ctrl+…) are left
 * alone, and the page only loses its arrow/space scrolling while the driving stage is on screen.
 */
import type { VehicleInput } from './vehiclePhysics';

export type DriveControl = 'throttle' | 'brake' | 'left' | 'right' | 'boost' | 'handbrake';
export type DriveAction =
  | 'shiftUp'
  | 'shiftDown'
  | 'camera'
  | 'respawn'
  | 'restart'
  | 'pause'
  | 'fullscreen'
  | 'ghost'
  | 'mode';

const KEY_CONTROLS: Record<string, DriveControl> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyN: 'boost',
};

const KEY_ACTIONS: Record<string, DriveAction> = {
  KeyE: 'shiftUp',
  KeyQ: 'shiftDown',
  KeyC: 'camera',
  KeyR: 'respawn',
  KeyT: 'restart',
  KeyP: 'pause',
  Escape: 'pause',
  KeyF: 'fullscreen',
  KeyG: 'ghost',
  KeyM: 'mode',
};

// Standard gamepad: A handbrake, X boost, Y camera, LB/RB paddles, View respawn, Menu pause.
const PAD_ACTIONS: [number, DriveAction][] = [
  [5, 'shiftUp'],
  [4, 'shiftDown'],
  [3, 'camera'],
  [8, 'respawn'],
  [9, 'pause'],
];

type ControlState = Record<DriveControl, boolean>;
const emptyControls = (): ControlState => ({
  throttle: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  handbrake: false,
});

export class DriveInput {
  /** Capture keys only while the drive stage is active and visible. */
  enabled = false;
  usingGamepad = false;
  onAction: ((a: DriveAction) => void) | null = null;
  /** Fired when the window loses focus (the game pauses itself). */
  onFocusLost: (() => void) | null = null;

  private keys = emptyControls();
  private touch = emptyControls();
  private steer = 0;
  private padPrev: boolean[] = [];
  private attached = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const control = KEY_CONTROLS[e.code];
    if (control) {
      e.preventDefault();
      // A focused HUD button would also "click" on Space – drop focus so Space stays the handbrake.
      if (e.code === 'Space' && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      this.keys[control] = true;
      this.usingGamepad = false;
      return;
    }
    const action = KEY_ACTIONS[e.code];
    if (action) {
      e.preventDefault();
      if (e.repeat) return;
      this.onAction?.(action);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    const control = KEY_CONTROLS[e.code];
    if (control) this.keys[control] = false;
  };

  private readonly onBlur = () => {
    this.clear();
    this.onFocusLost?.();
  };

  private readonly onVisibility = () => {
    if (document.hidden) this.onBlur();
  };

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clear();
  }

  clear() {
    this.keys = emptyControls();
    this.touch = emptyControls();
    this.steer = 0;
  }

  /** On-screen pedal / steering buttons. */
  setControl(control: DriveControl, active: boolean) {
    this.touch[control] = active;
  }

  /** Merges every source into `out`; keyboard steering is ramped so taps stay controllable. */
  read(dt: number, speedMps: number, out: VehicleInput) {
    let padSteer = 0;
    let padThrottle = 0;
    let padBrake = 0;
    let padHandbrake = false;
    let padBoost = false;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (pad && this.enabled) {
      const ax = pad.axes[0] ?? 0;
      const dz = 0.12;
      const a = Math.abs(ax) < dz ? 0 : ((Math.abs(ax) - dz) / (1 - dz)) * Math.sign(ax);
      padSteer = Math.sign(a) * Math.pow(Math.abs(a), 1.5);
      padThrottle = pad.buttons[7]?.value ?? 0;
      padBrake = pad.buttons[6]?.value ?? 0;
      padHandbrake = Boolean(pad.buttons[0]?.pressed);
      padBoost = Boolean(pad.buttons[2]?.pressed);
      for (const [b, action] of PAD_ACTIONS) {
        const pressed = Boolean(pad.buttons[b]?.pressed);
        if (pressed && !this.padPrev[b]) this.onAction?.(action);
        this.padPrev[b] = pressed;
      }
      if (Math.abs(padSteer) > 0.02 || padThrottle > 0.05 || padBrake > 0.05) this.usingGamepad = true;
    }

    const k = this.keys;
    const t = this.touch;
    out.throttle = Math.max(k.throttle || t.throttle ? 1 : 0, padThrottle);
    out.brake = Math.max(k.brake || t.brake ? 1 : 0, padBrake);
    out.handbrake = k.handbrake || t.handbrake || padHandbrake;
    out.boost = k.boost || t.boost || padBoost;

    const digital = (k.right || t.right ? 1 : 0) - (k.left || t.left ? 1 : 0);
    if (digital === 0 && Math.abs(padSteer) > 0.001) {
      this.steer += (padSteer - this.steer) * Math.min(1, dt * 18);
    } else {
      const reversing = digital !== 0 && this.steer !== 0 && Math.sign(digital) !== Math.sign(this.steer);
      const speedN = Math.min(1, Math.abs(speedMps) / 60);
      const rate = digital === 0 ? 7.5 : reversing ? 10 : 6.5 - 3.6 * speedN;
      const step = Math.max(-rate * dt, Math.min(rate * dt, digital - this.steer));
      this.steer += step;
    }
    out.steer = Math.max(-1, Math.min(1, this.steer));
  }
}
