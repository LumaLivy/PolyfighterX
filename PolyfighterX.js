import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import chroma from "chroma-js";

PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

const palette = {
  cyan: chroma(0x00ffff),
  white: chroma(0xffffff),
  grey: chroma(0xaaaaaa),
  pink: chroma(0xed4c9a),
  purple: chroma(0x800080),
  green: chroma(0x00ff00),
  red: chroma(0xff0000),
};

const game = (app, canvas) => {
  const loader = new PIXI.Loader("projects/PolyfighterX/");

  loader.add(["tile.png", "kirby.png"]).load(setup);

  function setup() {
    let kirby = new PIXI.Sprite(loader.resources["kirby.png"].texture);
    kirby.anchor.set(0.5);
    kirby.scale.set(0.5, 0.5);
    kirby.position.set(kirby.width / 2, kirby.height / 2);
    //app.stage.addChild(kirby);

    /*
    const player = new PIXI.Sprite(loader.resources["tile.png"].texture);
    player.anchor.set(0.5);
    player.position.set(200, 200);
    player.tint = chroma(0xed4c9a);
    app.stage.addChild(player);
    */

    let ticker = app.ticker;
    let renderer = app.renderer;
    renderer.antialias = false;
    renderer.resolution = 1;
    renderer.roundPixels = false;
    ticker.autoStart = false;
    ticker.stop();

    const g = new PIXI.Graphics();
    const ui = new PIXI.Graphics();

    const viewport = new Viewport({
      screenWidth: 800,
      screenHeight: 600,
      worldWidth: 1000,
      worldHeight: 1000,

      interaction: app.renderer.plugins.interaction, // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
    });
    app.stage.addChild(viewport);
    app.stage.addChild(ui);

    viewport.addChild(g);

    const shapes = {
      bullet: [
        new PIXI.Point(-4, 0),
        new PIXI.Point(0, 8),
        new PIXI.Point(4, 0),
        new PIXI.Point(0, -8),
      ],
      cursor: [
        new PIXI.Point(-16, 8),
        new PIXI.Point(-8, 0),
        new PIXI.Point(0, -16),
        new PIXI.Point(+8, 0),
        new PIXI.Point(+16, 8),
        new PIXI.Point(0, 0),
      ],
      player: [
        new PIXI.Point(-8, 16),
        new PIXI.Point(8, 16),
        new PIXI.Point(0, -16),
      ],
      bomb: [...new Array(20)].map((p, i) => new PIXI.Point()),
    };

    const TeslaCoil = function () {
      this.segments = 15;
      this.radius = 45;
      this.x = 0;
      this.y = 0;
      this.points = [...new Array(this.segments)].map(
        (p, i) => new PIXI.Point()
      );

      this.step = (keys, dt) => {};

      this.animate = (player, time) => {
        this.x = player.x;
        this.y = player.y;
        this.points.forEach((p, i) => {
          const rotation = time / 360;
          const a = rotation + (Math.PI * 2 * i) / this.segments;
          const x = this.radius * Math.sin(a);
          const y = this.radius * Math.cos(a);
          const [wx, wy] = wiggle({ x, y }, 4);
          p.set(this.x + x + wx, this.y + y + wy);
        });
        g.lineStyle(3, palette.purple.darken(0.2 * Math.sin(time / 60)).num());
        g.drawPolygon(this.points);
        g.lineStyle(1, palette.white.darken(0.2 * Math.sin(time / 60)).num());
        g.drawPolygon(this.points);
      };
    };

    const Barrier = function () {
      this.segments = 15;
      this.radius = 15;
      this.x = 0;
      this.y = 0;
      this.points = [...new Array(this.segments)].map(() => new PIXI.Point());

      this.step = (keys, dt) => {};

      this.animate = (player, time) => {
        this.x = player.x;
        this.y = player.y;
        this.points.forEach((p, i) => {
          const rotation = -time / (720 * 2);
          const a = rotation + (Math.PI * 2 * i) / this.segments;
          const x = this.radius * Math.sin(a);
          const y = this.radius * Math.cos(a);
          const [wx, wy] = wiggle({ x, y }, 1.5);
          p.set(this.x + x + wx, this.y + y + wy);
        });
        g.lineStyle(2, palette.cyan.darken(0.2 * Math.sin(time / 60)).num());
        g.beginFill(palette.cyan.num(), 0.15);

        g.drawPolygon(this.points);
        g.endFill();
      };
    };

    const bullets = [];

    const Bullet = function () {
      this.x = 0;
      this.y = 0;
      this.damage = 0;
      this.homing = false;
      this.explosive = false;
      this.speed = 0;
      this.speedMultiplier = 1;
      this.speedCap = 2;
      this.accel = 0.1;
      this.direction = 0;
      this.shape = shapes.bullet;
      this.points = this.shape.map((p) => p.clone());
      this.behaviours = [];
      this.effects = [];

      this.tint = palette.white;
      this.scale = 1;
      this.intensity = 0.2;

      bullets.push(this);

      this.kill = () => {
        bullets.splice(bullets.indexOf(this), 1);
      };

      this.applyEffect = (effect, chance = Math.random()) => {
        const type = bulletEffects[effect];
        if (chance <= type.chance) {
          if (!this.effects.includes(effect)) this.effects.push(effect);
          Object.keys(type.properties).map(
            (p) => (this[p] = type.properties[p])
          );
          if (type.modify) type.modify(this);
        }
      };

      this.step = (keys, dt) => {
        this.speed += this.accel * dt;

        this.speed = clamp(-this.speedCap * dt, this.speed, this.speedCap * dt);

        this.speed *= this.speedMultiplier;

        this.x = this.x + this.speed * Math.sin(this.direction);
        this.y = this.y + this.speed * -Math.cos(this.direction);
      };

      this.animate = (player, time) => {
        g.lineStyle(
          2,
          this.tint.darken(this.intensity * Math.sin(time / 60)).num()
        );
        g.beginFill(this.tint.num(), 0.25);

        this.points.forEach((p, i) => {
          const a = this.direction;
          const s = Math.sin(a);
          const c = Math.cos(a);
          const px = this.scale * this.shape[i].x;
          const py = this.scale * this.shape[i].y;
          p.set(this.x + px * c - py * s, this.y + py * c + px * s);
        });

        this.behaviours.forEach((b) => b(player, time));

        g.drawPolygon(this.points);
        g.endFill();
      };
    };

    const Timeline = function () {
      this.phase = 0;
      this.sequence = [];
      this.loop = false;
      this.onLoop = () => {};
      this.reset = () => (this.phase = 0);
      this.add = (func, ...args) => {
        this.sequence.push((...args) => {
          const result = func(...args);
          if (result === true) {
            this.phase++;
          } else if (result !== false) {
            this.phase = result;
          }
        });
      };
      this.execute = (...args) => {
        if (this.phase === -1) {
          if (this.loop) {
            this.phase = 0;
            this.onLoop();
          }
        }
        if (this.sequence[this.phase]) {
          this.sequence[this.phase](...args);
        } else {
          this.phase = -1;
        }
      };
    };

    const bulletEffects = {
      MatterCondenser: {
        chance: 0.25,
        properties: {
          canBeHoming: true,
          intensity: 0.8,
          scale: 2,
          speedCap: 1,
        },
        modify: (s) => {
          setTimeout(() => (s.homing = true), 100);
          s.behaviours.push((player, time) => {
            s.tint = palette.purple.brighten();
            const { x: mx, y: my } = transformMouse(player, mousePos);
            const a = (90 * Math.PI) / 180 + Math.atan2(my - s.y, mx - s.x);
            const distance = dist(s, { x: mx, y: my });

            if (Math.abs(Math.abs(s.direction) - a) < (Math.PI / 180) * 90) {
              if (s.homing) {
                s.direction = angleLerp(s.direction, a, 0.1);
                if (distance < 50) {
                  s.homing = false;
                }
              }
            }
          });
        },
      },
      ImpactDetonator: {
        chance: 0.25,
        properties: {
          explosive: true,
          intensity: 5,
          tint: palette.pink,
          shape: shapes.bomb,
          points: shapes.bomb.map((p) => p.clone()),
        },
        modify: (s) => {
          s.speedMultiplier /= 1.2;
          s.scale += 1;
          s.behaviours.push((player, time) => {
            s.scale += 0.1 * (0.1 * Math.sin(time / 60));

            s.points.forEach((p, i) => {
              const rotation = time / 360;
              const a = rotation + (Math.PI * 2 * i) / s.shape.length;
              const x = s.scale * 3 * Math.sin(a);
              const y = s.scale * 3 * Math.cos(a);
              const [wx, wy] = wiggle({ x, y }, 3);
              p.set(s.x + x + wx, s.y + y + wy);
            });
          });
        },
      },
      Mitosis: {
        chance: 0.25,
        properties: {},
        modify: (s) => {
          setTimeout(() => {
            s.effects.splice(s.effects.indexOf("Mitosis"), 1);
            //const distance = dist(s, player);
            let n1 = new Bullet();
            n1.x = s.x;
            n1.y = s.y;
            n1.direction = s.direction - Math.PI / 3;
            s.effects.forEach((e) => n1.applyEffect(e, 0));

            s.direction += Math.PI / 3;

            n1.speedMultiplier *= 0.8;
            s.speedMultiplier *= 0.8;
          }, 200);
        },
      },
      BetaDecay: {
        chance: 0.25,
        properties: {},
        modify: (s) => {
          const points = shapes.bomb.map((p) => p.clone());
          s.behaviours.push((player, time) => {
            const old = g._lineStyle.clone();
            const tint = palette.green
              .darken(Math.abs(3 * Math.sin(time / 60)))
              .num();
            g.lineStyle(2, tint);
            g.beginFill(tint, 0.15);
            points.forEach((p, i) => {
              const rotation = time / 360;
              const a = rotation + (Math.PI * 2 * i) / shapes.bomb.length;
              const x = s.scale * 15 * Math.sin(a);
              const y = s.scale * 15 * Math.cos(a);
              const [wx, wy] = wiggle({ x, y }, 3);
              p.set(s.x + x + wx, s.y + y + wy);
            });
            g.drawPolygon(points);
            g.endFill();
            g.lineStyle(old);
          });
        },
      },
    };

    const MatterCondenser = function () {
      if (!player.bulletPool.includes("MatterCondenser")) {
        player.bulletPool.push("MatterCondenser");
      }
      this.step = () => {};
      this.animate = () => {};
    };

    const ImpactDetonator = function () {
      if (!player.bulletPool.includes("ImpactDetonator")) {
        player.bulletPool.push("ImpactDetonator");
      }

      this.step = () => {};
      this.animate = () => {};
    };

    const Mitosis = function () {
      if (!player.bulletPool.includes("Mitosis")) {
        player.bulletPool.push("Mitosis");
      }
      this.step = () => {};
      this.animate = () => {};
    };

    const BetaDecay = function () {
      if (!player.bulletPool.includes("BetaDecay")) {
        player.bulletPool.push("BetaDecay");
      }
      this.step = () => {};
      this.animate = () => {};
    };

    const EMP = function () {
      this.x = 0;
      this.y = 0;
      this.segments = 30;
      this.charge = 0;
      this.baseRadius = 20;
      this.radius = this.baseRadius;
      this.thickness = 2;
      this.opacity = 1;
      this.detonating = false;
      this.points = [...new Array(this.segments)].map(() => new PIXI.Point());

      this.pulses = 3;
      this.currentPulses = 0;
      this.pulseDelay = 200; // ms
      this.canPulse = true;
      this.sendingPulse = false;
      this.timeline = new Timeline();

      this.timeline.loop = true;
      this.timeline.onLoop = () => {
        this.charge = 0;
        this.radius = this.baseRadius;
        this.currentPulses = 0;
        this.canPulse = true;
        this.sendingPulse = false;
        this.thickness = 2;
        this.opacity = 1;
        this.detonating = false;
      };

      this.timeline.add((keys, dt) => {
        if (keys[controls.shoot]) {
          this.charge += 0.002;
        } else {
          this.charge -= 0.003;
        }
        this.charge = clamp(0, this.charge, 1);
        this.tint = chroma.mix(palette.pink, palette.purple, 1 - this.charge);
        this.radius = this.baseRadius;
        return this.charge === 1;
      });
      this.timeline.add((keys, dt) => {
        this.radius = lerp(
          this.radius,
          this.sendingPulse ? this.baseRadius * 1.5 : this.baseRadius,
          0.2
        );
        this.thickness = lerp(
          this.thickness,
          this.sendingPulse
            ? (this.baseRadius / 10) * 2.5
            : this.baseRadius / 10,
          0.2
        );
        if (this.canPulse) {
          this.canPulse = false;
          this.sendingPulse = true;
          setTimeout(() => {
            this.sendingPulse = false;
          }, this.pulseDelay / 2);
          setTimeout(() => {
            this.canPulse = true;
          }, this.pulseDelay);
          this.currentPulses += 1;
          this.currentPulses = clamp(0, this.currentPulses, this.pulses);
        }
        return this.currentPulses === this.pulses;
      });
      this.timeline.add((keys, dt) => {
        this.detonating = true;
        return true;
      });
      this.timeline.add((keys, dt) => {
        this.thickness = lerp(this.thickness, this.baseRadius, 0.1);
        this.radius = lerp(this.radius, this.baseRadius * 10, 0.1);
        this.tint = chroma.mix(
          palette.pink,
          palette.cyan,
          this.radius / (this.baseRadius * 10)
        );
        return this.radius > this.baseRadius * 10 - 1;
      });
      this.timeline.add((keys, dt) => {
        this.opacity = lerp(this.opacity, 0, 0.05);
        return this.opacity < 0.05;
      });

      this.step = (keys, dt) => {
        this.timeline.execute(keys, dt);
        /*
        if (keys[controls.shoot]) {
          this.charge += 0.002;
        } else {
          this.charge -= 0.003;
        }
        this.charge = clamp(0, this.charge, 1);
        */
      };

      this.animate = (player, time) => {
        if (!this.detonating) {
          this.x = player.x;
          this.y = player.y;
        }
        this.points.forEach((p, i) => {
          const rotation = -time / (720 * 2);
          const a = rotation + (Math.PI * 2 * i) / this.segments;
          const x = this.radius * Math.sin(a);
          const y = this.radius * Math.cos(a);
          const [wx, wy] = wiggle({ x, y }, 1.5);
          p.set(this.x + x + wx, this.y + y + wy);
        });

        g.lineStyle({
          width: this.thickness,
          color: this.tint.darken(0.2 * Math.sin(time / 60)).num(),
          alpha: this.opacity,
          cap: PIXI.LINE_CAP.ROUND,
        });

        let next = null;
        this.points
          .slice(0, Math.floor(this.segments * this.charge))
          .forEach((p, i) => {
            next = this.points[i + 1];
            if (!next) {
              next = this.points[0];
            }
            g.moveTo(p.x, p.y);
            g.lineTo(next.x, next.y);
          });
      };
    };

    const Cursor = function () {
      this.x = 0;
      this.y = 0;
      this.mx = 0;
      this.my = 0;
      this.rotation = 0;

      this.radius = 20;

      this.shape = shapes.cursor;

      this.points = this.shape.map((p) => p.clone());

      this.step = (keys, dt) => {};

      this.animate = (player, time) => {
        this.x = player.x;
        this.y = player.y;

        this.radius = player.itemIDs.includes(1) ? 50 : 30;

        g.lineStyle(2, palette.white.darken(0.2 * Math.sin(time / 60)).num());
        g.beginFill(palette.white.num(), 0.15);

        this.points.forEach((p, i) => {
          const { x: mx, y: my } = transformMouse(player, mousePos);
          const a =
            (90 * Math.PI) / 180 + Math.atan2(my - player.y, mx - player.x);
          this.rotation = a;
          const s = Math.sin(a);
          const c = Math.cos(a);
          const px = this.shape[i].x;
          const py = this.shape[i].y - this.radius;
          p.set(this.x + px * c - py * s, this.y + py * c + px * s);
        });

        g.drawPolygon(this.points);
        g.endFill();
      };
    };

    const items = [
      {
        name: "Cursor",
        create: () => new Cursor(),
      },
      {
        name: "Barrier",
        create: () => new Barrier(),
      },
      {
        name: "Tesla Coil",
        create: () => new TeslaCoil(),
      },
      {
        name: "EMP",
        create: () => new EMP(),
      },
      {
        name: "Matter Condenser",
        create: () => new MatterCondenser(),
      },
      {
        name: "Impact Detonator",
        create: () => new ImpactDetonator(),
      },
      {
        name: "Mitosis",
        create: () => new Mitosis(),
      },
      {
        name: "Beta Decay",
        create: () => new BetaDecay(),
      },
      {
        name: "Attack Drone",
        create: () => {
          const drone = new PlayerBox();
          drone.tint = palette.white;
          drone.scale = 0.5;
          player.drones.push(drone);
        },
      },
    ];

    const PlayerBox = function () {
      this.x = 200;
      this.y = 200;
      this.rotation = 0;
      this.angularAccelCap = 30;
      this.speed = 0;
      this.speedCap = 10;
      this.accel = 0;
      this.canShoot = true;
      this.accelDirection = 0;
      this.itemIDs = [];
      this.items = [];
      this.drones = [];

      this.tint = palette.pink;

      this.scale = 1;

      this.bulletPool = [];

      this.shape = shapes.player;
      this.points = this.shape.map((p) => p.clone());

      this.step = (keys, dt) => {
        this.rotation = this.items[0]
          ? angleLerp(this.rotation, this.items[0].object.rotation, 0.1)
          : this.rotation;

        // this physics code is a bit messed up
        // changing direction while having speed makes you insta accelerate
        // in that direction

        const rot = this.items[0]
          ? this.items[0].object.rotation
          : this.rotation;
        if (keys[controls.left]) {
          this.accelDirection = rot - Math.PI / 2;
          this.speed = 3;
        }
        if (keys[controls.right]) {
          this.accelDirection = rot + Math.PI / 2;
          this.speed = 3;
        }
        if (keys[controls.up]) {
          this.accel = 0.01;
        } else {
          this.accel = 0;
        }

        if (keys[controls.up] || keys[controls.right] || keys[controls.left]) {
          //todo make shift only drift towards cursor when applying thrust
          // but reset direction when letting go and being stopped
          this.accelDirection = lerp(this.accelDirection, this.rotation, 0.1);
        }

        this.speed += this.accel * dt;

        this.speed = clamp(-this.speedCap * dt, this.speed, this.speedCap * dt);

        this.x = this.x + this.speed * Math.sin(this.accelDirection);
        this.y = this.y + this.speed * -Math.cos(this.accelDirection);

        this.speed *= 0.98;

        if (keys[controls.shoot] && this.canShoot) {
          const bullet = new Bullet();

          bullet.x = this.x;
          bullet.y = this.y;
          const { x: mx, y: my } = transformMouse(player, mousePos);
          const bulletAngle =
            (90 * Math.PI) / 180 + Math.atan2(my - this.y, mx - this.x);

          bullet.direction = this.itemIDs.includes(0)
            ? bulletAngle
            : this.rotation;

          bullet.direction += wiggle({ x: 0 }, 0.1)[0];

          this.bulletPool.forEach((e) => bullet.applyEffect(e));

          this.canShoot = false;

          setTimeout(() => (this.canShoot = true), 100);
        }
      };

      this.animate = (time) => {
        g.lineStyle(2, this.tint.darken(0.2 * Math.sin(time / 60)).num());
        g.beginFill(this.tint.num(), 0.15);

        this.points.forEach((p, i) => {
          const a = this.rotation;
          const s = Math.sin(a);
          const c = Math.cos(a);
          const px = this.scale * this.shape[i].x;
          const py = this.scale * this.shape[i].y;
          const [wx, wy] = wiggle({ x: s, y: c }, 0.5);
          p.set(this.x + wx + px * c - py * s, this.y + wy + py * c + px * s);
        });

        g.drawPolygon(this.points);
        g.endFill();
      };
    };

    const player = new PlayerBox();
    player.itemIDs = [0, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8, 8];

    player.itemIDs.map(
      (id, i) =>
        (player.items[i] = { name: items[id].name, object: items[id].create() })
    );

    const stars = [...new Array(100)].map(() => ({
      speed: 0.1 + Math.sin(Math.PI * 2 * Math.random()) / 50,
      pos: new PIXI.Point(800 * Math.random(), 600 * Math.random()),
    }));

    const fpsCounter = new PIXI.Text(
      `x:${player.x} y:${player.y} fps:${ticker.FPS}`,
      { fill: 0xffffff }
    );

    console.log(viewport.left);

    const transformMouse = () => ({
      x: viewport.center.x + mousePos.x,
      y: viewport.center.y + mousePos.y,
    });

    app.stage.addChild(fpsCounter);

    let keys = {};
    document.addEventListener("keydown", (k) => (keys[k.keyCode] = true));
    document.addEventListener("keyup", (k) => (keys[k.keyCode] = false));

    const controls = {
      up: 87, // w
      left: 65, // a
      down: 83, // s
      right: 68, //d
      shoot: 32, //space
    };

    const cameraAnchor = { x: 0, y: 0 };

    viewport.follow(cameraAnchor);

    let ltime = performance.now();
    function animate(time) {
      const dt = time - ltime;
      ticker.update(time);

      const { x: mx, y: my } = transformMouse();

      cameraAnchor.x = lerp(cameraAnchor.x, (player.x * 3 + mx) / 4, 0.1);
      cameraAnchor.y = lerp(cameraAnchor.y, (player.y * 3 + my) / 4, 0.1);

      g.beginFill(palette.red.num(), 0.3);
      g.lineStyle(2, palette.red.num());
      g.drawCircle(0, 0, 100);
      g.endFill();

      fpsCounter.text = `x:${Math.floor(player.x)} y:${Math.floor(
        player.y
      )} fps:${Math.floor(ticker.FPS)}`;

      ui.beginFill(palette.white.num(), 0.2 + 0.2 * Math.random());
      const cx = cameraAnchor.x - player.x;
      const cy = cameraAnchor.y - player.y;
      const ax = -Math.sin(player.accelDirection);
      const ay = Math.cos(player.accelDirection);
      stars.forEach((s) => {
        const am = player.speed * s.speed;
        s.pos.x = wrapClamp(0, s.pos.x + am * ax, 800);
        s.pos.y = wrapClamp(0, s.pos.y + am * ay, 600);

        ui.drawCircle(
          wrapClamp(0, cx * s.speed + s.pos.x, 800),
          wrapClamp(0, cy * s.speed + s.pos.y, 600),
          1
        );
      });
      ui.endFill();

      player.step(keys, dt);

      player.items.forEach((i) => {
        if (!i.object) return;
        i.object.step(keys, dt);
        i.object.animate(player, time);
      });

      player.drones.forEach((drone, i) => {
        const rot = (Math.PI * 2 * i) / player.drones.length + time / 360;
        drone.x = lerp(
          drone.x,
          player.x - (35 + player.drones.length) * Math.cos(rot),
          0.1
        );
        drone.y = lerp(
          drone.y,
          player.y - (35 + player.drones.length) * Math.sin(rot),
          0.1
        );
        drone.rotation = angleLerp(drone.rotation, player.rotation, 0.1);
        drone.step({ [controls.shoot]: keys[controls.shoot] }, dt);
        drone.animate(time);
      });

      player.animate(time);

      const barriers = player.items.filter((x) => x.name === "Barrier");

      barriers.forEach(({ object: b }, i) => (b.radius = 15 + 3 * i));

      player.items
        .filter((x) => x.name === "EMP")
        .forEach(({ object: e }) => {
          e.baseRadius = 20 + 3 * barriers.length;
        });

      if (bullets.length > 200) bullets.shift();
      bullets.forEach((b) => {
        b.step(keys, dt);
        b.animate(player, time);
      });

      // drone

      renderer.render(app.stage);
      g.clear();

      ui.clear();

      ltime = time;
      requestAnimationFrame(animate);
    }
    animate(performance.now());
  }
};

const dist = (p1, p2) => {
  const d1 = p1.x - p2.x;
  const d2 = p1.y - p2.y;
  return Math.sqrt(d1 * d1 + d2 * d2);
};

const lerp = (a, b, p) => a + (b - a) * p;

const angleLerp = (a, b, t) => {
  var d = (b - a) % (Math.PI * 2);
  return a + (((2 * d) % (Math.PI * 2)) - d) * t;
};

const clamp = (min, val, max = val) => Math.min(max, Math.max(min, val));

const wrapClamp = (min, val, max) => {
  if (val > max) return min;
  if (val < min) return max;
  return val;
};

const wiggle = (point, amount = 1) => {
  const x = point.x + amount * Math.cos(Math.random() * Math.PI);
  const y = point.y + amount * Math.cos(Math.random() * Math.PI);
  return [x, y];
};

const mousePos = { x: 0, y: 0 };

function setMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  mousePos.x = evt.clientX - rect.left - 400;
  mousePos.y = evt.clientY - rect.top - 300;
}

const PolyfighterX = function () {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef) return null;
    const app = new PIXI.Application(window.innerWidth, window.innerHeight);
    if (canvasRef.current.hasChildNodes()) {
      canvasRef.current.removeChild(canvasRef.current.childNodes[0]);
    }
    canvasRef.current.appendChild(app.view);
    canvasRef.current.onmousemove = (e) => setMousePos(canvasRef.current, e);
    game(app, canvasRef.current);
    return app.stop;
  }, [canvasRef]);
  return (
    <div>
      <div ref={canvasRef} />
    </div>
  );
};

export default PolyfighterX;
