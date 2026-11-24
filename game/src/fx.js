// fx.js — tiny particle bursts and muzzle flashes.
(function () {
  'use strict';
  var bursts = [];

  function burst(x, y, z, color, n) {
    if (!CVH.world.scene) return;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var vel = [];
    for (var i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      var a = Math.random() * Math.PI * 2;
      vel.push({ x: Math.cos(a) * (1 + Math.random() * 2), y: 2 + Math.random() * 3, z: Math.sin(a) * (1 + Math.random() * 2) });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mt = new THREE.PointsMaterial({ color: color, size: 0.32, transparent: true, opacity: 1 });
    var pts = new THREE.Points(geo, mt);
    CVH.world.scene.add(pts);
    bursts.push({ pts: pts, vel: vel, life: 0.7 });
  }

  function muzzle(x, y, z) { burst(x, y, z, 0xffd76a, 3); }

  function update(dt) {
    for (var i = bursts.length - 1; i >= 0; i--) {
      var b = bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        CVH.world.scene.remove(b.pts);
        bursts.splice(i, 1);
        continue;
      }
      var arr = b.pts.geometry.attributes.position.array;
      for (var j = 0; j < b.vel.length; j++) {
        arr[j * 3] += b.vel[j].x * dt;
        arr[j * 3 + 1] += b.vel[j].y * dt;
        arr[j * 3 + 2] += b.vel[j].z * dt;
        b.vel[j].y -= 9 * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = b.life / 0.7;
    }
  }

  CVH.fx = { burst: burst, muzzle: muzzle, update: update };
})();
