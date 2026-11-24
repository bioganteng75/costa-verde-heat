// Costa Verde Heat — police: wanted stars, heat, cruiser spawns, pursuit,
// bust meter, stand-down. Heat only decays out of "contact" (no live cruiser
// within 115 m). A stolen cruiser leaves the force the moment the player
// gets in: pursuit steering only ever touches cars still in CVH.police.cars
// with driver === 'police'.
CVH.police = (function () {
  const api = {
    heat: 0,
    bust: 0,
    cars: [],
    spawnCd: 0,
    onBusted: null,   // installed by main.js

    wanted: function () {
      if (api.heat <= 0) return 0;
      return Math.min(5, Math.max(1, Math.ceil(api.heat / 20)));
    },

    addHeat: function (n) {
      api.heat = CVH.clamp(api.heat + n, 0, 100);
    },

    reset: function () {
      api.heat = 0; api.bust = 0;
      const copy = api.cars.slice();
      for (let i = 0; i < copy.length; i++) CVH.vehicles.removeCar(copy[i]);
      api.cars = [];
      CVH.audio.setSiren(false);
    },

    // The player is getting into a cruiser: it stops being police, instantly.
    stealCar: function (car) {
      const i = api.cars.indexOf(car);
      if (i >= 0) api.cars.splice(i, 1);
      car.isPolice = false;
      if (car.mesh.userData.lightBar) car.mesh.userData.lightBar.visible = false;
    },

    spawnCruiser: function () {
      const p = CVH.player.pos;
      const W = CVH.world;
      let spot = null;
      // sample up to 40 road points in the 52–85 m annulus around the player
      for (let i = 0; i < 40 && !spot; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 52 + Math.random() * 33;
        const cx = p.x + Math.cos(ang) * rad;
        const cz = p.z + Math.sin(ang) * rad;
        const snap = W.nearestRoadPoint(cx, cz);
        const sx = snap.axis === 'NS' ? snap.x : cx;
        const sz = snap.axis === 'EW' ? snap.z : cz;
        const d = CVH.dist2d(sx, sz, p.x, p.z);
        if (d >= 45 && d <= 98 && sx < W.WATER_X - 4 && Math.abs(sx) <= 262 && Math.abs(sz) <= 262 && W.pointClear(sx, sz, 2.6)) {
          spot = { x: sx, z: sz };
        }
      }
      if (!spot) {
        // constructive fallback: nearest avenue, ~62 m along it from the player
        let ax = W.AVENUES_X[0], bd = Infinity;
        W.AVENUES_X.forEach(function (a) { const d = Math.abs(p.x - a); if (d < bd) { bd = d; ax = a; } });
        let z = p.z + (p.z > 0 ? -62 : 62);
        z = CVH.clamp(z, -250, 250);
        if (CVH.dist2d(ax, z, p.x, p.z) < 45) { z = CVH.clamp(p.z + (p.z > 0 ? 62 : -62), -250, 250); }
        spot = { x: ax, z: z };
      }
      const h = CVH.headingOf(p.x - spot.x, p.z - spot.z);
      const car = CVH.vehicles.makeCar(Math.random() < 0.5 ? 'sedan' : 'coupe', spot.x, spot.z, h, {
        driver: 'police', isPolice: true, color: 0xf0f0f2
      });
      car.ramCd = 0;
      api.cars.push(car);
      return car;
    },

    standDown: function () {
      const copy = api.cars.slice();
      api.cars = [];
      for (let i = 0; i < copy.length; i++) {
        const car = copy[i];
        if (car.dead) {
          // wrecks stay wrecks: dark, driverless, never traffic again
          car.driver = 'wreck';
          if (car.mesh.userData.lightBar) car.mesh.userData.lightBar.visible = false;
          car.bodyMat.color.setHex(0x2a2a2e);
        } else {
          // intact cruisers peel off and become ordinary traffic
          car.isPolice = false;
          if (car.mesh.userData.lightBar) car.mesh.userData.lightBar.visible = false;
          car.driver = 'traffic';
          car.t = CVH.vehicles.newTrafficState(car.mesh.position.x, car.mesh.position.z);
        }
      }
      CVH.audio.setSiren(false);
    },

    update: function (dt) {
      const player = CVH.player;
      let wanted = api.wanted();
      api.spawnCd -= dt;

      // contact gate for heat decay
      let contact = false;
      let nearest = Infinity;
      for (let i = 0; i < api.cars.length; i++) {
        const c = api.cars[i];
        if (c.dead) continue;
        const d = CVH.dist2d(c.mesh.position.x, c.mesh.position.z, player.pos.x, player.pos.z);
        if (d < nearest) nearest = d;
        if (d <= 115) contact = true;
      }
      if (!contact && api.heat > 0) {
        api.heat = Math.max(0, api.heat - 2.4 * dt);
        if (api.heat <= 0 && api.cars.length > 0) api.standDown();
        wanted = api.wanted(); // decay may have ended the chase this very tick
      }

      // keep the force at strength
      const live = api.cars.filter(function (c) { return !c.dead; }).length;
      if (wanted > 0 && live < wanted && api.spawnCd <= 0) {
        api.spawnCruiser();
        api.spawnCd = 2.2;
      }

      // pursuit steering — only cars whose driver is 'police'
      let busting = false;
      for (let i = 0; i < api.cars.length; i++) {
        const car = api.cars[i];
        if (car.driver !== 'police' || car.dead) continue;
        car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
        const pos = car.mesh.position;
        const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;
        const want = CVH.headingOf(dx, dz);
        car.heading = CVH.turnToward(car.heading, want, 2.4 * dt);
        let target = dist > 16 ? 34 : Math.max(4, dist * 0.9);
        if (dist < 5) target = 6;
        car.speed = CVH.clamp(target, 0, 34);
        const f = CVH.forwardOf(car.heading);
        pos.x += f.x * car.speed * dt;
        pos.z += f.z * car.speed * dt;
        const fixed = CVH.world.collide(pos.x, pos.z, 1.7);
        if (fixed.x !== pos.x || fixed.z !== pos.z) {
          pos.x = fixed.x; pos.z = fixed.z;
          if (car.speed > 10) CVH.vehicles.damage(car, 4, false);
          car.speed *= 0.4;
        }
        pos.x = CVH.clamp(pos.x, -268, 248);
        pos.z = CVH.clamp(pos.z, -268, 268);
        car.mesh.rotation.y = car.heading;
        // separation from other cruisers
        for (let j = 0; j < api.cars.length; j++) {
          if (j === i) continue;
          const o = api.cars[j].mesh.position;
          const d = CVH.dist2d(pos.x, pos.z, o.x, o.z);
          if (d > 0.01 && d < 4.4) { pos.x += (pos.x - o.x) / d * (4.4 - d) * 0.5; pos.z += (pos.z - o.z) / d * (4.4 - d) * 0.5; }
        }
        // ramming the player on foot hurts
        if (player.state === 'foot' && dist < 2.2 && car.speed > 7 && car.ramCd <= 0) {
          player.damage(9);
          car.ramCd = 1.2;
        }
        // bust range?
        if (player.state === 'foot' && dist < 6.5) busting = true;
        if (player.state === 'car' && player.car && dist < 8.5 && Math.abs(player.car.speed) < 3) busting = true;
      }

      if (busting && wanted > 0) {
        api.bust = Math.min(1, api.bust + dt / 2.2);
        if (api.bust >= 1 && api.onBusted) { api.bust = 0; api.onBusted(); }
      } else {
        api.bust = Math.max(0, api.bust - dt / 1.4);
      }

      CVH.audio.setSiren(api.cars.some(function (c) { return !c.dead && c.driver === 'police'; }) && nearest < 70);
    }
  };
  return api;
})();
