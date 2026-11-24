// Costa Verde Heat — vehicles: 6 types, traffic AI, parked cars, driving physics.
// Cars are built facing -Z; mesh.rotation.y = heading shows forward F(heading).
CVH.vehicles = (function () {
  const TYPES = {
    sedan: { len: 4.4, wid: 1.9, hgt: 1.5, top: 33, accel: 11, colors: [0xb8bcc2, 0x707880, 0x33455c, 0x7a2e2e] },
    coupe: { len: 4.3, wid: 1.85, hgt: 1.35, top: 38, accel: 13.5, colors: [0xd8a022, 0xb02a30, 0x2255aa, 0x222226] },
    hatch: { len: 3.9, wid: 1.8, hgt: 1.55, top: 30, accel: 10, colors: [0x5f9e6e, 0xc0c6cc, 0x8066aa, 0xcc7733] },
    van: { len: 5.0, wid: 2.0, hgt: 2.1, top: 27, accel: 8, colors: [0xd8d8d8, 0x8899aa, 0x556655] },
    truck: { len: 6.4, wid: 2.3, hgt: 2.4, top: 25, accel: 7, colors: [0x997744, 0x667788, 0x775555] },
    moto: { len: 2.2, wid: 0.7, hgt: 1.1, top: 42, accel: 16, colors: [0x222226, 0xb02a30, 0x2255aa] }
  };
  const TYPE_NAMES = Object.keys(TYPES);
  const list = [];
  let sceneRef = null;
  let nextId = 1;

  function buildMesh(type, color, isPolice) {
    const t = TYPES[type];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: color });
    if (type === 'moto') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 1.9), bodyMat);
      frame.position.y = 0.62; g.add(frame);
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.8), bodyMat);
      tank.position.set(0, 0.92, 0.1); g.add(tank);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.8), new THREE.MeshLambertMaterial({ color: 0x1c1c1e }));
      seat.position.set(0, 0.95, 0.62); g.add(seat);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, t.hgt * 0.52, t.len), bodyMat);
      body.position.y = 0.35 + t.hgt * 0.26; g.add(body);
      if (type === 'truck') {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.94, t.hgt * 0.5, 1.5), bodyMat);
        cab.position.set(0, 0.35 + t.hgt * 0.52 + t.hgt * 0.24, -t.len / 2 + 0.85); g.add(cab);
        const bed = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.96, t.hgt * 0.42, t.len - 1.9), new THREE.MeshLambertMaterial({ color: 0x5a5148 }));
        bed.position.set(0, 0.35 + t.hgt * 0.45, 0.85); g.add(bed);
      } else if (type === 'van') {
        const top = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.96, t.hgt * 0.5, t.len * 0.92), bodyMat);
        top.position.set(0, 0.35 + t.hgt * 0.52 + t.hgt * 0.24, 0.1); g.add(top);
      } else {
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(t.wid * 0.84, t.hgt * 0.42, t.len * 0.48),
          new THREE.MeshLambertMaterial({ color: 0x1e2830 })
        );
        cabin.position.set(0, 0.35 + t.hgt * 0.52 + t.hgt * 0.2, type === 'coupe' ? 0.25 : 0.05);
        g.add(cabin);
      }
      // headlights / taillights
      const hl = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.7, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
      hl.position.set(0, 0.62, -t.len / 2 - 0.03); g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.7, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xd23b2e }));
      tl.position.set(0, 0.66, t.len / 2 + 0.03); g.add(tl);
    }
    if (isPolice) {
      const bar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      red.position.x = -0.32; bar.add(red);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2a5aff }));
      blue.position.x = 0.32; bar.add(blue);
      bar.position.y = t.hgt + 0.28;
      g.add(bar);
      g.userData.lightBar = bar;
    }
    // wheels
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141416 });
    const wheelGeo = new THREE.CylinderGeometry(type === 'moto' ? 0.34 : 0.36, type === 'moto' ? 0.34 : 0.36, 0.24, 10);
    const wz = type === 'moto' ? [0.82, -0.82] : [t.len / 2 - 0.85, -t.len / 2 + 0.85];
    const wx = type === 'moto' ? [0] : [t.wid / 2 - 0.05, -t.wid / 2 + 0.05];
    wz.forEach(function (z) {
      wx.forEach(function (x) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.36, z);
        g.add(w);
      });
    });
    return { group: g, bodyMat: bodyMat };
  }

  function makeCar(type, x, z, heading, opts) {
    opts = opts || {};
    const t = TYPES[type];
    const color = opts.color !== undefined ? opts.color : CVH.pick(t.colors);
    const built = buildMesh(type, color, !!opts.isPolice);
    const car = {
      id: nextId++,
      type: type,
      mesh: built.group,
      bodyMat: built.bodyMat,
      heading: heading,
      speed: 0,
      driver: opts.driver || null,       // null | 'traffic' | 'police' | 'player'
      isPolice: !!opts.isPolice,
      dead: false,
      health: 100,
      radius: Math.max(t.len, t.wid) / 2,
      t: null,                            // traffic state
      smokeT: 0
    };
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
    sceneRef.add(car.mesh);
    list.push(car);
    if (car.driver === 'traffic') car.t = newTrafficState(x, z);
    return car;
  }

  function newTrafficState(x, z) {
    // decide axis from the nearest road
    const snap = CVH.world.nearestRoadPoint(x, z);
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (snap.axis === 'NS') return { axis: 'NS', center: snap.x, dir: dir, laneOff: -3 * dir, cool: 0 };
    return { axis: 'EW', center: snap.z, dir: dir, laneOff: 3 * dir, cool: 0 };
  }

  function removeCar(car) {
    const i = list.indexOf(car);
    if (i >= 0) list.splice(i, 1);
    if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
  }

  function spawnInitial(scene) {
    sceneRef = scene;
    const W = CVH.world;
    // parked cars along avenue edges
    for (let i = 0; i < 15; i++) {
      const ax = CVH.pick(W.AVENUES_X);
      const side = Math.random() < 0.5 ? -5.6 : 5.6;
      const z = CVH.rand(-255, 255);
      const x = ax + side;
      if (!W.pointClear(x, z, 2.5)) continue;
      const h = side > 0 ? Math.PI : 0; // noses along the road
      makeCar(CVH.pick(TYPE_NAMES), x, z, h, { driver: null });
    }
    // traffic
    for (let i = 0; i < 16; i++) {
      let x, z;
      if (Math.random() < 0.5) { x = CVH.pick(W.AVENUES_X); z = CVH.rand(-250, 250); }
      else { z = CVH.pick(W.STREETS_Z); x = CVH.rand(-250, 205); }
      const car = makeCar(CVH.pick(TYPE_NAMES), x, z, 0, { driver: 'traffic' });
      placeTraffic(car);
    }
  }

  function placeTraffic(car) {
    const t = car.t;
    if (!t) return;
    if (t.axis === 'NS') {
      car.mesh.position.x = t.center + t.laneOff;
      car.heading = t.dir > 0 ? Math.PI : 0;
    } else {
      car.mesh.position.z = t.center + t.laneOff;
      car.heading = t.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    car.mesh.rotation.y = car.heading;
  }

  function trafficUpdate(car, dt) {
    const t = car.t;
    if (!t || car.dead) { car.speed = 0; return; }
    t.cool -= dt;
    const pos = car.mesh.position;
    const cruise = 10.5;
    // obstacle scan: any car or the player ahead in our lane
    let target = cruise;
    const f = CVH.forwardOf(car.heading);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === car) continue;
      const dx = o.mesh.position.x - pos.x, dz = o.mesh.position.z - pos.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 9 && side < 2.2) { target = Math.min(target, Math.max(0, (ahead - 5) * 1.6)); }
    }
    if (CVH.player && CVH.player.state === 'foot') {
      const dx = CVH.player.pos.x - pos.x, dz = CVH.player.pos.z - pos.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 7 && side < 2) target = 0;
    }
    car.speed = CVH.clamp(target, 0, cruise);
    pos.x += f.x * car.speed * dt;
    pos.z += f.z * car.speed * dt;

    // intersection turns
    const W = CVH.world;
    if (t.cool <= 0) {
      if (t.axis === 'NS') {
        for (let i = 0; i < W.STREETS_Z.length; i++) {
          if (Math.abs(pos.z - W.STREETS_Z[i]) < 2.2 && Math.random() < 0.35) {
            t.axis = 'EW'; t.center = W.STREETS_Z[i]; t.dir = Math.random() < 0.5 ? 1 : -1;
            t.laneOff = 3 * t.dir; t.cool = 4;
            placeTraffic(car); car.mesh.position.z = pos.z; // keep along-coordinate continuous-ish
            car.mesh.position.x = pos.x;
            break;
          }
        }
      } else {
        for (let i = 0; i < W.AVENUES_X.length; i++) {
          if (Math.abs(pos.x - W.AVENUES_X[i]) < 2.2 && Math.random() < 0.35) {
            t.axis = 'NS'; t.center = W.AVENUES_X[i]; t.dir = Math.random() < 0.5 ? 1 : -1;
            t.laneOff = -3 * t.dir; t.cool = 4;
            const keepZ = pos.z;
            placeTraffic(car); car.mesh.position.z = keepZ;
            break;
          }
        }
      }
    }
    // world edge: u-turn
    if (pos.x > 262 || pos.x < -262 || pos.z > 262 || pos.z < -262) {
      t.dir *= -1;
      t.laneOff = t.axis === 'NS' ? -3 * t.dir : 3 * t.dir;
      pos.x = CVH.clamp(pos.x, -258, 246);
      pos.z = CVH.clamp(pos.z, -258, 258);
      placeTraffic(car);
    }
    // keep the lateral coordinate glued to the lane
    if (t.axis === 'NS') pos.x = t.center + t.laneOff; else pos.z = t.center + t.laneOff;
    car.mesh.rotation.y = car.heading;
  }

  // Arcade driving for the player's car. steer: +1 = A (left), -1 = D (right).
  function driveUpdate(car, dt, throttle, steer) {
    const t = TYPES[car.type];
    if (car.dead) { car.speed = 0; return; }
    const pos = car.mesh.position;
    if (throttle > 0) car.speed += t.accel * dt * (car.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) car.speed -= t.accel * dt * (car.speed > 0 ? 2.2 : 0.7);
    else car.speed -= car.speed * 0.35 * dt; // engine braking
    // drag + sand slowdown
    const onSand = pos.x > CVH.world.BEACH_X;
    const topSpeed = t.top * (onSand ? 0.55 : 1);
    car.speed -= car.speed * (onSand ? 0.9 : 0.28) * dt;
    car.speed = CVH.clamp(car.speed, -t.top * 0.32, topSpeed);
    if (Math.abs(car.speed) < 0.04 && throttle === 0) car.speed = 0;

    if (car.speed !== 0 && steer !== 0) {
      const grip = CVH.clamp(Math.abs(car.speed) / 9, 0, 1);
      car.heading += steer * 1.75 * grip * dt * Math.sign(car.speed);
      car.heading = CVH.wrapAngle(car.heading);
    }
    const f = CVH.forwardOf(car.heading);
    pos.x += f.x * car.speed * dt;
    pos.z += f.z * car.speed * dt;

    // building collision
    const before = { x: pos.x, z: pos.z };
    const fixed = CVH.world.collide(pos.x, pos.z, 1.7);
    if (fixed.x !== pos.x || fixed.z !== pos.z) {
      pos.x = fixed.x; pos.z = fixed.z;
      if (Math.abs(car.speed) > 9) damage(car, Math.abs(car.speed) * 0.7, true);
      car.speed *= -0.22;
    }
    void before;
    // car-car collision
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === car) continue;
      const d = CVH.dist2d(pos.x, pos.z, o.mesh.position.x, o.mesh.position.z);
      const min = car.radius + o.radius - 0.7;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = (pos.x - o.mesh.position.x) / d, nz = (pos.z - o.mesh.position.z) / d;
        pos.x += nx * push; pos.z += nz * push;
        o.mesh.position.x -= nx * push; o.mesh.position.z -= nz * push;
        if (Math.abs(car.speed) > 8) { damage(car, 5, true); damage(o, 7, false); }
        car.speed *= 0.55;
      }
    }
    pos.x = CVH.clamp(pos.x, -268, 248);
    pos.z = CVH.clamp(pos.z, -268, 268);
    car.mesh.rotation.y = car.heading;
    // player logical position rides with the car
    if (CVH.player && CVH.player.car === car) {
      CVH.player.pos.x = pos.x; CVH.player.pos.z = pos.z;
      CVH.player.heading = car.heading;
    }
  }

  function damage(car, amount, sound) {
    if (car.dead) return;
    car.health -= amount;
    if (sound) CVH.audio.crash();
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.speed = 0;
      car.bodyMat.color.multiplyScalar(0.35);
    } else if (car.health < 45) {
      car.bodyMat.color.multiplyScalar(0.92);
    }
  }

  function repair(car) {
    car.health = 100;
    car.dead = false;
  }

  function update(dt) {
    for (let i = 0; i < list.length; i++) {
      const car = list[i];
      if (car.driver === 'traffic') trafficUpdate(car, dt);
      // police steering lives in police.js; player driving in driveUpdate.
    }
  }

  return {
    TYPES: TYPES, TYPE_NAMES: TYPE_NAMES, list: list,
    makeCar: makeCar, removeCar: removeCar,
    spawnInitial: spawnInitial, newTrafficState: newTrafficState,
    driveUpdate: driveUpdate, damage: damage, repair: repair,
    update: update
  };
})();
