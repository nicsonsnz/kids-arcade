// input.js — Pointer 统一输入：动态摇杆 + 加速按钮 + 第二指加速；桌面鼠标/键盘
const TAU = Math.PI * 2;

export const Input = {
  canvas: null,
  boostBtn: null,
  jbase: null,
  jknob: null,

  steerId: -1,      // 控向手指
  steerOx: 0, steerOy: 0,
  steerAngle: null,
  jRadius: 52,

  boostFingers: 0,  // 第二指等
  boostBtnDown: false,
  keyBoost: false,
  mouseBoost: false,

  mouseX: 0, mouseY: 0, mouseActive: false,
  keys: new Set(),

  onUnlock: null,

  setup(opts) {
    this.canvas = opts.canvas;
    this.boostBtn = opts.boostBtn;
    this.jbase = opts.joystickBase;
    this.jknob = opts.joystickKnob;
    this.onUnlock = opts.onUnlock || null;

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    c.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    c.addEventListener('pointerup', (e) => this._up(e), { passive: false });
    c.addEventListener('pointercancel', (e) => this._up(e), { passive: false });

    // 加速按钮
    const bb = this.boostBtn;
    bb.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.boostBtnDown = true;
      bb.classList.add('active');
      if (this.onUnlock) this.onUnlock();
    });
    const relBtn = (e) => { this.boostBtnDown = false; bb.classList.remove('active'); };
    bb.addEventListener('pointerup', relBtn);
    bb.addEventListener('pointercancel', relBtn);
    bb.addEventListener('pointerleave', relBtn);

    // 鼠标（桌面）
    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.mouseActive = true;
    });

    // 键盘
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) e.preventDefault();
      if (k === ' ') { this.keyBoost = true; if (this.onUnlock) this.onUnlock(); }
      else this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ') this.keyBoost = false;
      else this.keys.delete(k);
    });
  },

  _isTouch(e) { return e.pointerType === 'touch'; },

  _down(e) {
    e.preventDefault();
    if (this.onUnlock) this.onUnlock();
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseBoost = true;
      return;
    }
    // 触摸
    if (this.steerId === -1) {
      // 第一指 = 摇杆
      this.steerId = e.pointerId;
      // 显式捕获，保证手指拖到加速按钮/摇杆 DOM 上方时 move/up 仍路由到 canvas
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      const rect = this.canvas.getBoundingClientRect();
      this.steerOx = e.clientX - rect.left;
      this.steerOy = e.clientY - rect.top;
      this._showJoystick(this.steerOx, this.steerOy, this.steerOx, this.steerOy);
      this.steerAngle = null;
    } else {
      // 第二指及以后 = 加速
      this.boostFingers++;
    }
  },

  _move(e) {
    if (e.pointerType === 'mouse') {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.mouseActive = true;
      return;
    }
    if (e.pointerId === this.steerId) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const dx = x - this.steerOx, dy = y - this.steerOy;
      const d = Math.hypot(dx, dy);
      if (d > 8) this.steerAngle = Math.atan2(dy, dx);
      const clampD = Math.min(d, this.jRadius);
      const kx = this.steerOx + (d ? dx / d : 0) * clampD;
      const ky = this.steerOy + (d ? dy / d : 0) * clampD;
      this._moveKnob(kx, ky);
    }
  },

  _up(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseBoost = false;
      return;
    }
    if (e.pointerId === this.steerId) {
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      this.steerId = -1;
      this.steerAngle = null;
      this._hideJoystick();
    } else if (this.boostFingers > 0) {
      this.boostFingers--;
    }
  },

  _showJoystick(bx, by, kx, ky) {
    if (!this.jbase) return;
    this.jbase.style.display = 'block';
    this.jbase.style.left = bx + 'px';
    this.jbase.style.top = by + 'px';
    this._moveKnob(kx, ky);
  },
  _moveKnob(kx, ky) {
    if (!this.jknob) return;
    this.jknob.style.display = 'block';
    this.jknob.style.left = kx + 'px';
    this.jknob.style.top = ky + 'px';
  },
  _hideJoystick() {
    if (this.jbase) this.jbase.style.display = 'none';
    if (this.jknob) this.jknob.style.display = 'none';
  },

  _keyAngle() {
    let dx = 0, dy = 0;
    if (this.keys.has('arrowup') || this.keys.has('w')) dy -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) dy += 1;
    if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) dx += 1;
    if (dx === 0 && dy === 0) return null;
    return Math.atan2(dy, dx);
  },

  // 目标航向（相对屏幕中心=蛇头）；无输入返回 null
  resolve(cx, cy) {
    const ka = this._keyAngle();
    if (ka !== null) return ka;
    if (this.steerId !== -1 && this.steerAngle !== null) return this.steerAngle;
    if (this.mouseActive) {
      const dx = this.mouseX - cx, dy = this.mouseY - cy;
      if (dx * dx + dy * dy > 25) return Math.atan2(dy, dx);
    }
    return null;
  },

  isBoosting() {
    return this.boostBtnDown || this.boostFingers > 0 || this.keyBoost || this.mouseBoost;
  },

  reset() {
    this.steerId = -1; this.steerAngle = null; this.boostFingers = 0;
    this.boostBtnDown = false; this.keyBoost = false; this.mouseBoost = false;
    this._hideJoystick();
    if (this.boostBtn) this.boostBtn.classList.remove('active');
  },
};
