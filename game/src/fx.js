// fx.js — lightweight pooled effects: impact sparks, tyre smoke, wreck
// smoke, muzzle flashes and bullet tracers, plus a camera-shake value the
// camera in main.js consumes. Everything is pooled; nothing allocates in
// the hot loop. Owns CVH.fx.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};
  var THREE = window.THREE;

  var POOL = 240;
  var points = null, pGeo = null, pPos = null, pCol = null;
  var parts = [];
  var tracers = [];
  var shake = 0;

  var fx = CVH.fx = {};

  fx.init = function (scene) {
    pPos = new Float32Array(POOL * 3);
    pCol = new Float32Array(POOL * 3);
    for (var i = 0; i < POOL; i++) {
      parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, drag: 1, r: 1, g: 1, b: 1, size: 1 });
      pPos[i * 3 + 1] = -100;
    }
    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    var mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
    points = new THREE.Points(pGeo, mat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    scene.add(points);
  };

  function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav, drag) {
    for (var i = 0; i < POOL; i++) {
      var p = parts[i];
      if (p.life > 0) continue;
      p.life = life; p.max = life;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.r = r; p.g = g; p.b = b; p.grav = grav; p.drag = drag;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      return;
    }
  }

  fx.sparks = function (x, y, z, n) {
    for (var i = 0; i < (n || 8); i++) {
      spawn(x, y, z,
        (Math.random() - 0.5) * 7, Math.random() * 4 + 1, (Math.random() - 0.5) * 7,
        0.25 + Math.random() * 0.3, 1.0, 0.75, 0.25, -9, 0.98);
    }
  };
  fx.smoke = function (x, y, z, dark, n) {
    for (var i = 0; i < (n || 1); i++) {
      var c = dark ? 0.16 : 0.75;
      spawn(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.7, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.7,
        0.9 + Math.random() * 0.8, c, c, c, 1.5, 0.985);
    }
  };
  fx.dust = function (x, y, z) {
    spawn(x, y, z, (Math.random() - 0.5) * 1.6, 0.8, (Math.random() - 0.5) * 1.6,
      0.5, 0.85, 0.78, 0.62, 0.5, 0.97);
  };
  fx.muzzle = function (x, y, z) {
    spawn(x, y, z, 0, 0.4, 0, 0.06, 1.0, 0.85, 0.4, 0, 1);
    spawn(x, y, z, 0, 0.2, 0, 0.09, 1.0, 0.6, 0.2, 0, 1);
  };

  // A tracer is a short-lived additive line from muzzle to impact point.
  fx.tracer = function (scene, ax, ay, az, bx, by, bz) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([ax, ay, az, bx, by, bz]), 3));
    var m = new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9 });
    var line = new THREE.Line(g, m);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line: line, life: 0.07 });
  };

  fx.addShake = function (v) { shake = Math.min(1.2, shake + v); };
  fx.shakeValue = function () { return shake; };

  fx.update = function (dt, scene) {
    var i, p;
    for (i = 0; i < POOL; i++) {
      p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { pPos[i * 3 + 1] = -100; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
      p.vy += p.grav * dt;
      var dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      pPos[i * 3] += p.vx * dt;
      pPos[i * 3 + 1] += p.vy * dt;
      pPos[i * 3 + 2] += p.vz * dt;
      if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; p.vy = 0; }
      var f = p.life / p.max;
      pCol[i * 3] = p.r * f; pCol[i * 3 + 1] = p.g * f; pCol[i * 3 + 2] = p.b * f;
    }
    if (pGeo) {
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
    }
    for (i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers[i].line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    shake = Math.max(0, shake - dt * 2.2);
  };
})();
