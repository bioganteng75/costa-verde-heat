// fx.js — cheap particle bursts: hit sparks, smoke, pickup sparkles.
(function () {
  'use strict';
  var CVH = window.CVH;

  var bursts = [];

  function burst(x, y, z, color, n, spread, up, life) {
    if (!CVH.world.scene) return;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var vel = [];
    for (var i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel.push({
        x: (Math.random() - 0.5) * spread,
        y: Math.random() * up,
        z: (Math.random() - 0.5) * spread
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: color, size: 0.35, transparent: true, opacity: 1 });
    var points = new THREE.Points(geo, mat);
    CVH.world.scene.add(points);
    bursts.push({ points: points, vel: vel, life: life, maxLife: life });
  }

  var fx = {
    sparks: function (x, y, z) { burst(x, y, z, 0xffc95e, 10, 4, 3, 0.4); },
    smoke: function (x, y, z) { burst(x, y, z, 0x555a60, 14, 1.6, 2.4, 1.1); },
    sparkle: function (x, y, z) { burst(x, y, z, 0xffe98a, 12, 2, 2.6, 0.6); },
    bloodless: function (x, y, z) { burst(x, y, z, 0xd9534f, 8, 3, 2.4, 0.4); },
    update: function (dt) {
      for (var i = bursts.length - 1; i >= 0; i--) {
        var b = bursts[i];
        b.life -= dt;
        if (b.life <= 0) {
          CVH.world.scene.remove(b.points);
          b.points.geometry.dispose();
          b.points.material.dispose();
          bursts.splice(i, 1);
          continue;
        }
        var pos = b.points.geometry.attributes.position;
        for (var j = 0; j < b.vel.length; j++) {
          var v = b.vel[j];
          pos.array[j * 3] += v.x * dt;
          pos.array[j * 3 + 1] += v.y * dt;
          pos.array[j * 3 + 2] += v.z * dt;
          v.y -= 3.5 * dt;
        }
        pos.needsUpdate = true;
        b.points.material.opacity = b.life / b.maxLife;
      }
    }
  };

  CVH.fx = fx;
})();
