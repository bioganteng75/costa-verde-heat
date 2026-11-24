// player.js — the player character and the crowd. Owns: the low-poly
// humanoid with procedural walk/punch/aim animation, camera-relative
// WASD movement (owner fix 3: right = cross(forward, up)), car entry /
// exit and driving input, punch + hitscan pistol/SMG combat, and the
// 40 pedestrians (owner fix: denser streets) with wander/panic/recycle.
// The player's logical position rides with the car while driving
// (owner fix 6) — missions, police and the minimap all read player.x/z.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};
  var THREE = window.THREE;

  var rng = null;

  // ------------------------------------------------------------ humanoid
  function buildHumanoid(shirt, pants, skin, hat) {
    var g = new THREE.Group();
    var matS = new THREE.MeshLambertMaterial({ color: shirt });
    var matP = new THREE.MeshLambertMaterial({ color: pants });
    var matK = new THREE.MeshLambertMaterial({ color: skin });
    function limb(mat, w, h, d, x, y) {
      var pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      var m = new THREE.Mesh(CVH._unitBox, mat);
      m.scale.set(w, h, d);
      m.position.y = -h / 2;
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    }
    var legL = limb(matP, 0.17, 0.92, 0.19, -0.11, 0.95);
    var legR = limb(matP, 0.17, 0.92, 0.19, 0.11, 0.95);
    var torso = new THREE.Mesh(CVH._unitBox, matS);
    torso.scale.set(0.47, 0.62, 0.25);
    torso.position.y = 1.27;
    torso.castShadow = true;
    g.add(torso);
    var armL = limb(matS, 0.13, 0.8, 0.15, -0.31, 1.53);
    var armR = limb(matS, 0.13, 0.8, 0.15, 0.31, 1.53);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), matK);
    head.position.y = 1.76;
    head.castShadow = true;
    g.add(head);
    if (hat) {
      var cap = new THREE.Mesh(CVH._unitBox, new THREE.MeshLambertMaterial({ color: hat }));
      cap.scale.set(0.36, 0.09, 0.36);
      cap.position.y = 1.9;
      g.add(cap);
      var brim = new THREE.Mesh(CVH._unitBox, new THREE.MeshLambertMaterial({ color: hat }));
      brim.scale.set(0.34, 0.04, 0.22);
      brim.position.set(0, 1.86, 0.26);
      g.add(brim);
    }
    return { group: g, legL: legL, legR: legR, armL: armL, armR: armR, torso: torso };
  }

  function animateHumanoid(h, speedMag, dt, mode, punchT) {
    h.phase = (h.phase || 0) + dt * (3.2 + speedMag * 1.7);
    var amp = CVH.clamp(speedMag / 4.5, 0, 1) * 0.6;
    var s = Math.sin(h.phase) * amp;
    h.legL.rotation.x = s;
    h.legR.rotation.x = -s;
    if (mode === 'aim') {
      h.armR.rotation.x = -1.45;
      h.armL.rotation.x = -s * 0.4;
    } else if (mode === 'punch' && punchT > 0) {
      h.armR.rotation.x = -1.7 * Math.sin(Math.PI * (punchT / 0.24));
      h.armL.rotation.x = -s * 0.5;
    } else {
      h.armR.rotation.x = -s * 0.75;
      h.armL.rotation.x = s * 0.75;
    }
  }

  // -------------------------------------------------------------- player
  var player = CVH.player = {
    x: 0, z: 0, heading: Math.PI, hp: 100, maxHp: 100,
    cash: 120, weapon: 'fist', hasPistol: false, hasSmg: false,
    car: null, speedMag: 0, punchT: 0, fireT: 0, hurtCd: 0,
    mesh: null, parts: null, dead: false
  };
  var posScratch = { x: 0, z: 0 };

  player.reset = function (x, z, heading) {
    player.x = x; player.z = z;
    player.heading = heading || 0;
    player.hp = player.maxHp;
    player.car = null;
    player.dead = false;
    if (player.mesh) {
      player.mesh.visible = true;
      player.mesh.position.set(x, 0, z);
      player.mesh.rotation.y = player.heading;
    }
  };

  // The camera basis the movement math uses — exposed so the playtest
  // can verify displacement against the game's own vectors (fix 3).
  player.debugBasis = function () {
    var cy = CVH.camYaw || 0;
    var fx = -Math.sin(cy), fz = -Math.cos(cy);
    return { fx: fx, fz: fz, rx: -fz, rz: fx };
  };
  player.setHeading = function (h) { player.heading = h; };

  player.hurt = function (amount) {
    if (player.dead || CVH.state !== 'playing') return;
    if (player.hurtCd > 0) return;
    player.hurtCd = 0.25;
    player.hp -= amount;
    CVH.fx.addShake(0.18);
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      if (CVH.onPlayerDown) CVH.onPlayerDown('wasted');
    }
  };

  // ------------------------------------------------------------ car use
  function exitCar() {
    var car = player.car;
    if (!car) return;
    var fwd = CVH.headingVec(car.yaw, CVH._v1);
    var rx = -fwd.z, rz = fwd.x; // car's right
    player.x = car.pos.x + rx * (car.radius + 1.1);
    player.z = car.pos.z + rz * (car.radius + 1.1);
    posScratch.x = player.x; posScratch.z = player.z;
    CVH.world.collide(posScratch, 0.4);
    player.x = posScratch.x; player.z = posScratch.z;
    player.heading = car.yaw;
    if (car.driver === 'player') car.driver = 'parked';
    car.input.throttle = 0; car.input.steer = 0; car.input.brake = true;
    player.car = null;
    player.mesh.visible = true;
    CVH.audio.engine(false, 0);
  }
  player.exitCar = exitCar;

  function enterCar(car) {
    var wasPolice = car.type === 'police' && car.driver === 'police';
    var wasTraffic = car.driver === 'traffic';
    if (wasPolice && CVH.police) CVH.police.removeFromForce(car); // QA item 2
    if (wasTraffic) dropDriverPed(car);
    car.driver = 'player';
    car.input.brake = false;
    player.car = car;
    player.mesh.visible = false;
    if (CVH.police) {
      if (wasPolice) CVH.police.reportCrime(car.pos.x, car.pos.z, 45, false);
      else if (wasTraffic) CVH.police.reportCrime(car.pos.x, car.pos.z, 32, false);
      else CVH.police.reportCrime(car.pos.x, car.pos.z, 24, false);
    }
    CVH.hud.toast(wasPolice ? 'You stole a police cruiser!' : 'Car stolen', 1.6);
  }
  player.enterCar = enterCar;

  // A traffic driver bails out and runs when their car is jacked.
  function dropDriverPed(car) {
    var best = null, bd = -1;
    for (var i = 0; i < CVH.peds.length; i++) {
      var p = CVH.peds[i];
      var d = CVH.dist2(p.x, p.z, player.x, player.z);
      if (d > bd) { bd = d; best = p; }
    }
    if (!best) return;
    best.x = car.pos.x + 2; best.z = car.pos.z + 1;
    best.state = 'flee';
    best.panicT = 3.5;
    best.threatX = car.pos.x; best.threatZ = car.pos.z;
    syncPedMesh(best);
  }

  // -------------------------------------------------------------- combat
  var raycaster = null;
  function shoot(dt) {
    var isSmg = player.weapon === 'smg';
    player.fireT -= dt;
    if (player.fireT > 0) return;
    player.fireT = isSmg ? 0.095 : 0.27;
    if (!raycaster) raycaster = new THREE.Raycaster();
    var cam = CVH.camera;
    var dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    if (isSmg) {
      dir.x += (Math.random() - 0.5) * 0.035;
      dir.y += (Math.random() - 0.5) * 0.035;
      dir.z += (Math.random() - 0.5) * 0.035;
      dir.normalize();
    }
    raycaster.set(cam.position, dir);
    raycaster.far = 90;

    // nearest building hit caps the range (no shooting through walls)
    var maxD = 90;
    var o = cam.position;
    for (var i = 0; i < CVH.colliders.length; i++) {
      var c = CVH.colliders[i];
      var t = rayAabb(o, dir, c);
      if (t !== null && t < maxD) maxD = t;
    }

    // gather targets: ped bodies + car bodies
    var targets = [];
    for (i = 0; i < CVH.peds.length; i++) {
      var p = CVH.peds[i];
      if (p.state !== 'down') targets.push(p.hitMesh);
    }
    for (i = 0; i < CVH.cars.length; i++) {
      if (CVH.cars[i] !== player.car) targets.push(CVH.cars[i].mesh.children[0]);
    }
    var hits = raycaster.intersectObjects(targets, false);
    var hitPoint = null, hitPed = null, hitCar = null;
    for (i = 0; i < hits.length; i++) {
      if (hits[i].distance > maxD) continue;
      hitPoint = hits[i].point;
      var ud = hits[i].object.userData;
      if (ud.ped) hitPed = ud.ped;
      if (ud.car) hitCar = ud.car;
      break;
    }
    var end = hitPoint || o.clone().add(dir.clone().multiplyScalar(maxD));
    var mx = player.x + Math.sin(player.heading) * 0.45;
    var mz = player.z + Math.cos(player.heading) * 0.45;
    CVH.fx.muzzle(mx, 1.35, mz);
    CVH.fx.tracer(CVH.scene, mx, 1.35, mz, end.x, end.y, end.z);
    CVH.audio.shot();
    if (hitPed) {
      hitPed.hurt(isSmg ? 26 : 34, player.x, player.z);
      if (CVH.police) CVH.police.reportCrime(player.x, player.z, 40, false);
    } else if (hitCar) {
      CVH.vehicles.damage(hitCar, 7);
      CVH.fx.sparks(end.x, end.y, end.z, 4);
      if (CVH.police) {
        if (hitCar.type === 'police' && hitCar.driver === 'police') CVH.police.reportCrime(player.x, player.z, 50, false);
        else CVH.police.reportCrime(player.x, player.z, 30, false);
      }
    } else if (CVH.police) {
      CVH.police.reportCrime(player.x, player.z, 26, false); // shots fired
    }
    // nearby peds panic at gunfire
    for (i = 0; i < CVH.peds.length; i++) {
      var q = CVH.peds[i];
      if (q.state !== 'down' && CVH.dist2(q.x, q.z, player.x, player.z) < 320) {
        q.state = 'flee'; q.panicT = 2.6; q.threatX = player.x; q.threatZ = player.z;
      }
    }
  }

  function rayAabb(o, dir, c) {
    var tmin = 0, tmax = Infinity, i, axes = ['x', 'z'];
    // buildings are tall; treat as 2D AABB in xz with generous height
    for (i = 0; i < 2; i++) {
      var ax = axes[i];
      var lo = ax === 'x' ? c.x0 : c.z0;
      var hi = ax === 'x' ? c.x1 : c.z1;
      var ov = o[ax], dv = dir[ax];
      if (Math.abs(dv) < 1e-8) {
        if (ov < lo || ov > hi) return null;
      } else {
        var t1 = (lo - ov) / dv, t2 = (hi - ov) / dv;
        if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin > 0 ? tmin : null;
  }

  function punch() {
    player.punchT = 0.24;
    player.fireT = 0.38;
    CVH.audio.punch();
    var fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    for (var i = 0; i < CVH.peds.length; i++) {
      var p = CVH.peds[i];
      if (p.state === 'down') continue;
      var dx = p.x - player.x, dz = p.z - player.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.35) {
        p.hurt(30, player.x, player.z);
        if (CVH.police) CVH.police.reportCrime(player.x, player.z, 30, false);
        return;
      }
    }
    // punching a car dents it (and annoys the law less than shooting)
    var car = CVH.vehicles.nearestCar(player.x, player.z, 3.0, null);
    if (car) {
      CVH.vehicles.damage(car, 3);
      CVH.fx.sparks(car.pos.x, 0.8, car.pos.z, 3);
      if (CVH.police && car.type === 'police') CVH.police.reportCrime(player.x, player.z, 20, false);
    }
  }

  // --------------------------------------------------------- car vs ped
  function carPedCollisions() {
    for (var i = 0; i < CVH.cars.length; i++) {
      var car = CVH.cars[i];
      if (Math.abs(car.speed) < 4) continue;
      for (var j = 0; j < CVH.peds.length; j++) {
        var p = CVH.peds[j];
        if (p.state === 'down') continue;
        if (CVH.dist2(p.x, p.z, car.pos.x, car.pos.z) < (car.radius + 0.5) * (car.radius + 0.5)) {
          p.hitByCar(car);
          if (car.driver === 'player' && CVH.police) {
            CVH.police.reportCrime(car.pos.x, car.pos.z, 60, false);
            CVH.fx.addShake(0.25);
            CVH.audio.crash(false);
          }
        }
      }
      // the player on foot can be run down by traffic/police too
      if (!player.car && car.driver !== 'player' && Math.abs(car.speed) > 6 &&
          CVH.dist2(player.x, player.z, car.pos.x, car.pos.z) < (car.radius + 0.5) * (car.radius + 0.5)) {
        player.hurt(22);
        var away = Math.atan2(player.x - car.pos.x, player.z - car.pos.z);
        player.x += Math.sin(away) * 2.2;
        player.z += Math.cos(away) * 2.2;
      }
    }
  }

  // -------------------------------------------------------------- update
  player.update = function (dt) {
    player.hurtCd = Math.max(0, player.hurtCd - dt);
    player.punchT = Math.max(0, player.punchT - dt);
    var input = CVH.input;

    if (player.car) {
      // ---- driving: logical position rides with the car (fix 6)
      var car = player.car;
      var th = 0;
      if (input.down('KeyW', 'ArrowUp')) th = 1;
      else if (input.down('KeyS', 'ArrowDown')) th = car.speed > 2 ? 0 : -0.75;
      car.input.throttle = th;
      car.input.brake = input.down('KeyS', 'ArrowDown') && car.speed > 2;
      car.input.drift = input.down('Space');
      car.input.steer = (input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (input.down('KeyD', 'ArrowRight') ? 1 : 0);
      player.x = car.pos.x;
      player.z = car.pos.z;
      player.heading = car.yaw;
      player.speedMag = Math.abs(car.speed);
      CVH.audio.engine(true, Math.abs(car.speed) / car.topSpeed);
      if (input.hit('KeyF', 'Enter')) exitCar();
      carPedCollisions();
      return;
    }

    CVH.audio.engine(false, 0);

    // ---- on foot: camera-relative WASD (fix 3)
    var basis = player.debugBasis();
    var iz = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    var ix = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    var mx = basis.fx * iz + basis.rx * ix;
    var mz = basis.fz * iz + basis.rz * ix;
    var len = Math.sqrt(mx * mx + mz * mz);
    var sprint = input.down('ShiftLeft', 'ShiftRight');
    var speed = sprint ? 7.8 : 4.7;
    if (len > 0.01) {
      mx /= len; mz /= len;
      var want = Math.atan2(mx, mz);
      player.heading = CVH.turnToward(player.heading, want, 11 * dt);
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      player.speedMag = speed;
    } else {
      player.speedMag = 0;
    }
    posScratch.x = player.x; posScratch.z = player.z;
    CVH.world.collide(posScratch, 0.4);
    player.x = posScratch.x; player.z = posScratch.z;

    // pickups: cash packages and weapons live in world; collect on foot
    collectPickups();

    // combat
    if (input.mouseDown && CVH.state === 'playing') {
      if (player.weapon === 'fist') {
        player.fireT -= dt;
        if (player.fireT <= 0) punch();
      } else {
        shoot(dt);
      }
    } else {
      player.fireT = Math.max(0, player.fireT - dt);
    }

    // enter car
    if (input.hit('KeyF', 'Enter')) {
      var near = CVH.vehicles.nearestCar(player.x, player.z, 3.6, function (c) { return c.driver !== 'player'; });
      if (near) enterCar(near);
    }

    // pose the mesh
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    var mode = player.weapon !== 'fist' && input.mouseDown ? 'aim' : (player.punchT > 0 ? 'punch' : 'walk');
    animateHumanoid(player.parts, player.speedMag, dt, mode, player.punchT);

    carPedCollisions();
  };

  function collectPickups() {
    var pk = CVH.world.packages, i;
    for (i = 0; i < pk.length; i++) {
      if (pk[i].taken) continue;
      if (CVH.dist2(player.x, player.z, pk[i].x, pk[i].z) < 1.7) {
        pk[i].taken = true;
        pk[i].mesh.visible = false;
        player.cash += 50;
        CVH.stats.packages++;
        CVH.stats.earned += 50;
        CVH.audio.pickup();
        CVH.hud.toast('Cash package +$50 (' + CVH.stats.packages + '/' + pk.length + ')', 1.8);
      }
    }
    var pu = CVH.world.pickups;
    for (i = 0; i < pu.length; i++) {
      if (pu[i].taken) continue;
      if (CVH.dist2(player.x, player.z, pu[i].x, pu[i].z) < 1.8) {
        pu[i].taken = true;
        pu[i].mesh.visible = false;
        if (pu[i].kind === 'pistol') { player.hasPistol = true; player.weapon = 'pistol'; CVH.hud.toast('Pistol acquired — click to shoot', 2.2); }
        if (pu[i].kind === 'smg') { player.hasSmg = true; player.weapon = 'smg'; CVH.hud.toast('SMG acquired — hold click to spray', 2.2); }
        CVH.audio.pickup();
      }
    }
    // weapon switching: 1 fist, 2 pistol, 3 smg
    var input = CVH.input;
    if (input.hit('Digit1')) player.weapon = 'fist';
    if (input.hit('Digit2') && player.hasPistol) player.weapon = 'pistol';
    if (input.hit('Digit3') && player.hasSmg) player.weapon = 'smg';
  }

  // --------------------------------------------------------- pedestrians
  var SHIRTS = [0xd95f43, 0x3f7fbf, 0xf2e14c, 0x53a06a, 0xe8e3d8, 0x9e6bc4, 0x43c2b8, 0xd97fb0];
  var PANTS = [0x2e3440, 0x5a4632, 0x7456a8, 0x3c4a3a, 0x8a8f96];
  var SKIN = [0xf2c79b, 0xd9a066, 0xa86a3c, 0x7a4a26];

  function sidewalkPointNear(x, z, minD, maxD) {
    var W = CVH.WORLD;
    for (var t = 0; t < 20; t++) {
      var useAvenue = rng() < 0.5;
      var road = useAvenue ? W.ROAD_XS[(rng() * W.ROAD_XS.length) | 0] : W.ROAD_ZS[(rng() * W.ROAD_ZS.length) | 0];
      var side = rng() < 0.5 ? -9 : 9;
      var along = CVH.randRange(rng, -200, 200);
      var px = useAvenue ? road + side : along;
      var pz = useAvenue ? along : road + side;
      var d = CVH.dist(px, pz, x, z);
      if (d >= minD && d <= maxD && CVH.world.isLand(px, pz)) return { x: px, z: pz };
    }
    return { x: x + 10, z: z + 10 };
  }

  function makePed(i) {
    var h = buildHumanoid(
      SHIRTS[(rng() * SHIRTS.length) | 0],
      PANTS[(rng() * PANTS.length) | 0],
      SKIN[(rng() * SKIN.length) | 0],
      rng() < 0.4 ? 0x333333 : null
    );
    var sp = sidewalkPointNear(CVH.points.spawn.x, CVH.points.spawn.z, 15, 130);
    h.group.position.set(sp.x, 0, sp.z);
    CVH.scene.add(h.group);
    var ped = {
      x: sp.x, z: sp.z, heading: rng() * Math.PI * 2,
      state: 'walk', hp: 100, panicT: 0, downT: 0,
      threatX: 0, threatZ: 0, tx: sp.x, tz: sp.z,
      mesh: h.group, parts: h, phase: rng() * 6,
      hitMesh: h.torso
    };
    h.torso.userData.ped = ped;
    h.phase = ped.phase;
    ped.retarget = function () {
      var ahead = 24 + rng() * 40;
      ped.tx = ped.x + Math.sin(ped.heading) * ahead;
      ped.tz = ped.z + Math.cos(ped.heading) * ahead;
      // keep targets on land & inside the city
      ped.tx = CVH.clamp(ped.tx, -232, 236);
      ped.tz = CVH.clamp(ped.tz, -202, 202);
    };
    ped.hurt = function (amount, fromX, fromZ) {
      if (ped.state === 'down') return;
      ped.hp -= amount;
      if (ped.hp <= 0) {
        ped.state = 'down';
        ped.downT = 16;
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.28;
      } else {
        ped.state = 'flee';
        ped.panicT = 3;
        ped.threatX = fromX; ped.threatZ = fromZ;
      }
    };
    ped.hitByCar = function (car) {
      if (ped.state === 'down') return;
      ped.state = 'down';
      ped.downT = 16;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.28;
      CVH.fx.dust(ped.x, 0.4, ped.z);
    };
    ped.retarget();
    return ped;
  }

  function syncPedMesh(p) {
    p.mesh.position.set(p.x, p.state === 'down' ? 0.28 : 0, p.z);
    if (p.state !== 'down') p.mesh.rotation.y = p.heading;
  }

  var peds = CVH.peds = [];
  player.buildCrowd = function () {
    rng = CVH.makeRng(CVH.seed * 101 + 3);
    // the player's own body
    var h = buildHumanoid(0x2ec4b8, 0x2e3440, 0xd9a066, 0xe03a2e);
    player.parts = h;
    player.mesh = h.group;
    CVH.scene.add(h.group);
    // car bodies need a userData back-reference for the raycaster
    for (var i = 0; i < 40; i++) peds.push(makePed(i));
  };

  // tag car body meshes once cars exist (called by main after spawn)
  player.tagCarHitMeshes = function () {
    for (var i = 0; i < CVH.cars.length; i++) {
      CVH.cars[i].mesh.children[0].userData.car = CVH.cars[i];
    }
  };

  player.updateCrowd = function (dt) {
    var focus = player;
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.state === 'wait' || p.state === 'ride') {
        // a taxi passenger hailing (or riding): missions.js owns them
        syncPedMesh(p);
        continue;
      }
      if (p.state === 'down') {
        p.downT -= dt;
        if (p.downT <= 0) {
          // recycle as a fresh citizen somewhere away from the action
          var sp = sidewalkPointNear(focus.x, focus.z, 60, 110);
          p.x = sp.x; p.z = sp.z; p.hp = 100; p.state = 'walk';
          p.mesh.rotation.x = 0;
          p.retarget();
        }
        syncPedMesh(p);
        continue;
      }
      // recycle distant peds toward the player so streets stay alive
      var dFocus = CVH.dist(p.x, p.z, focus.x, focus.z);
      if (dFocus > 125) {
        var sp2 = sidewalkPointNear(focus.x, focus.z, 55, 95);
        p.x = sp2.x; p.z = sp2.z;
        p.retarget();
      }
      var speed;
      if (p.state === 'flee') {
        p.panicT -= dt;
        if (p.panicT <= 0) { p.state = 'walk'; p.retarget(); }
        var away = Math.atan2(p.x - p.threatX, p.z - p.threatZ);
        p.heading = CVH.turnToward(p.heading, away, 6 * dt);
        speed = 4.4;
      } else {
        if (CVH.dist(p.x, p.z, p.tx, p.tz) < 2.2) {
          // reached the corner: pick a new heading along the streets
          p.heading = CVH.wrapAngle(p.heading + (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) * (rng() < 0.7 ? 1 : 0) + (rng() - 0.5) * 0.6);
          if (rng() < 0.35) p.heading = CVH.wrapAngle(p.heading + Math.PI);
          p.retarget();
        }
        var want = Math.atan2(p.tx - p.x, p.tz - p.z);
        p.heading = CVH.turnToward(p.heading, want, 4 * dt);
        speed = 1.45;
      }
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      posScratch.x = p.x; posScratch.z = p.z;
      CVH.world.collide(posScratch, 0.35);
      p.x = posScratch.x; p.z = posScratch.z;
      p.parts.phase = p.phase;
      animateHumanoid(p.parts, speed, dt, 'walk', 0);
      p.phase = p.parts.phase;
      syncPedMesh(p);
    }
  };
})();
