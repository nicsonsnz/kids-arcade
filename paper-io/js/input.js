// input.js — Pointer 虚拟摇杆 + 桌面键盘/鼠标。
const DEADZONE = 10;
const MAXREACH = 56;

export const Input = {
  joystick: { active: false, id: -1, cx: 0, cy: 0, hx: 0, hy: 0, mag: 0 },
  mouse: { down: false, x: 0, y: 0 },
  keys: { up: false, down: false, left: false, right: false },
  _hasDir: false,
  _angle: 0,
  _cssW: 0, _cssH: 0,
  onFirstPoint: null,

  init(canvas) {
    this._cssW = window.innerWidth;
    this._cssH = window.innerHeight;

    const onDown = (e) => {
      if (this.onFirstPoint) { this.onFirstPoint(); }
      if (e.pointerType === 'mouse') {
        this.mouse.down = true;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      } else {
        if (!this.joystick.active) {
          this.joystick.active = true;
          this.joystick.id = e.pointerId;
          this.joystick.cx = e.clientX; this.joystick.cy = e.clientY;
          this.joystick.hx = e.clientX; this.joystick.hy = e.clientY;
          this.joystick.mag = 0;
        }
      }
    };
    const onMove = (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      } else if (this.joystick.active && e.pointerId === this.joystick.id) {
        this.joystick.hx = e.clientX; this.joystick.hy = e.clientY;
      }
    };
    const onUp = (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.down = false;
      } else if (e.pointerId === this.joystick.id) {
        this.joystick.active = false;
        this.joystick.id = -1;
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // 键盘
    const setKey = (code, v) => {
      switch (code) {
        case 'ArrowUp': case 'KeyW': this.keys.up = v; break;
        case 'ArrowDown': case 'KeyS': this.keys.down = v; break;
        case 'ArrowLeft': case 'KeyA': this.keys.left = v; break;
        case 'ArrowRight': case 'KeyD': this.keys.right = v; break;
      }
    };
    window.addEventListener('keydown', (e) => {
      setKey(e.code, true);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => setKey(e.code, false));
    window.addEventListener('resize', () => {
      this._cssW = window.innerWidth; this._cssH = window.innerHeight;
    });
  },

  // 计算期望航向；返回 {has, angle}
  compute() {
    // 键盘优先
    let kx = 0, ky = 0;
    if (this.keys.left) kx -= 1;
    if (this.keys.right) kx += 1;
    if (this.keys.up) ky -= 1;
    if (this.keys.down) ky += 1;
    if (kx !== 0 || ky !== 0) {
      this._hasDir = true;
      this._angle = Math.atan2(ky, kx);
      return { has: true, angle: this._angle };
    }
    // 摇杆
    if (this.joystick.active) {
      const dx = this.joystick.hx - this.joystick.cx;
      const dy = this.joystick.hy - this.joystick.cy;
      const mag = Math.hypot(dx, dy);
      this.joystick.mag = Math.min(1, Math.max(0, (mag - DEADZONE) / (MAXREACH - DEADZONE)));
      if (mag > DEADZONE) {
        this._hasDir = true;
        this._angle = Math.atan2(dy, dx);
        return { has: true, angle: this._angle };
      }
    }
    // 鼠标拖动：从屏幕中心指向指针
    if (this.mouse.down) {
      const dx = this.mouse.x - this._cssW / 2;
      const dy = this.mouse.y - this._cssH / 2;
      if (Math.hypot(dx, dy) > 8) {
        this._hasDir = true;
        this._angle = Math.atan2(dy, dx);
        return { has: true, angle: this._angle };
      }
    }
    return { has: false, angle: this._angle };
  },

  reset() {
    this.joystick.active = false; this.joystick.id = -1; this.joystick.mag = 0;
    this.mouse.down = false;
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this._hasDir = false;
  },
};
