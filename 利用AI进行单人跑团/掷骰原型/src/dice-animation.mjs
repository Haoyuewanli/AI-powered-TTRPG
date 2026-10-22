import { notationFor, verifyAnimation } from './animation-contract.mjs';

const MODULE = '/node_modules/@3d-dice/dice-box-threejs/dist/dice-box-threejs.es.js';
const ASSETS = '/node_modules/@3d-dice/dice-box-threejs/public/';

export class DiceAnimation {
  constructor(selector) {
    this.selector = selector;
    this.box = null;
    this.operation = null;
    this.latestResult = null;
  }

  async initialize() {
    const { default: DiceBox } = await import(MODULE);
    const box = this.box = new DiceBox(this.selector, {
      assetPath: ASSETS,
      sounds: false,
      shadows: true,
      baseScale: 68,
      strength: 0.85,
      light_intensity: 1.2,
      iterationLimit: 420,
      theme_customColorset: {
        name: 'midnight-brass',
        foreground: '#f4dc9d',
        background: '#125f67',
        outline: '#123b3c',
        edge: '#163b40',
        texture: 'none',
        material: 'plastic',
      },
    });
    // Upstream registers a resize listener without a dispose method. Own it here.
    box.resizeWorld = () => {};
    const makeWorldBox = box.makeWorldBox.bind(box);
    box.makeWorldBox = () => {
      // Remove old pairs before rebuilding, so Cannon retains the new pair lookup.
      for (const contact of [...box.world.contactmaterials]) box.world.removeContactMaterial(contact);
      makeWorldBox();
    };
    const setDimensions = box.setDimensions.bind(box);
    box.setDimensions = dimensions => {
      const previousDesk = box.desk;
      const previousLight = box.light;
      setDimensions(dimensions);
      previousDesk?.geometry.dispose();
      previousDesk?.material.dispose();
      previousLight?.shadow.dispose();
    };
    const swapDiceFace = box.swapDiceFace.bind(box);
    box.swapDiceFace = (die, value) => {
      swapDiceFace(die, value);
      // Version 0.0.12 leaves the simulated d4 result cached after changing its faces.
      if (die.shape === 'd4') die.result = [];
    };
    const clearDice = box.clearDice.bind(box);
    box.clearDice = () => {
      const cached = new Set(Object.values(box.DiceFactory.geometries));
      for (const die of box.diceList) {
        if (!cached.has(die.geometry)) die.geometry.dispose();
        for (const material of die.material) material.dispose();
      }
      clearDice();
    };
    await box.initialize();
    box.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.resizeObserver = new ResizeObserver(() => {
      if (!box.initialized) return;
      if (this.operation) this.stop('resized');
      box.setDimensions({ x: box.container.clientWidth, y: box.container.clientHeight });
    });
    this.resizeObserver.observe(box.container);
    box.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.unavailable = true;
      this.stop('unavailable');
    });
  }

  play(record) {
    if (!this.box?.initialized || this.unavailable) return Promise.reject(new Error('三维画面不可用，正式结果已保留。'));
    if (this.operation) return Promise.reject(new Error('上一段动画尚未结束。'));
    this.latestResult = null;
    return new Promise((resolve, reject) => {
      const operation = { resolve, reject, timer: null };
      this.operation = operation;
      operation.timer = setTimeout(() => this.stop('timeout'), 12000);
      try {
        this.box.roll(notationFor(record)).then(result => {
          if (this.operation !== operation) return;
          try {
            verifyAnimation(record, result);
            this.latestResult = result;
            this.complete(operation, { status: 'complete' });
          } catch (error) {
            this.box.clearDice();
            this.complete(operation, null, error);
          }
        }).catch(error => this.complete(operation, null, error));
      } catch (error) {
        this.complete(operation, null, error);
      }
    });
  }

  complete(operation, result, error) {
    if (this.operation !== operation) return;
    clearTimeout(operation.timer);
    this.operation = null;
    if (error) operation.reject(error);
    else operation.resolve(result);
  }

  stop(reason = 'skipped') {
    const operation = this.operation;
    if (!operation) return;
    this.box.running = false;
    this.box.rolling = false;
    this.box.clearDice();
    this.complete(operation, { status: reason });
  }

  dispose() {
    this.stop('closed');
    this.resizeObserver?.disconnect();
    if (!this.box) return;
    this.box.clearDice();
    const textures = new Set();
    this.box.scene.traverse(object => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      }
    });
    for (const geometry of Object.values(this.box.DiceFactory.geometries)) geometry.dispose();
    for (const texture of textures) texture.dispose();
    this.box.renderer.dispose();
    this.box.renderer.domElement.remove();
  }
}
