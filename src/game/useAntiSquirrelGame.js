import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_PATHS, GAME_HEIGHT, GAME_WIDTH, SPRITES, drawCover, drawSprite } from './spriteMap.js';

const MAGAZINE = 14;
const MAX_BOMBS = 3;
const PLAYER_ORIGIN = { x: 305, y: 502 };
const PLAYER_CENTER = { x: 205, y: 548 };
const PLAYER_SIZE = { w: 315, h: 280 };
const BOMB_PAD = { x: 246, y: 654, radius: 42 };
const BOMB_THROW_START = { x: 214, y: 566 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (start, end, t) => start + (end - start) * t;
const randomBetween = (min, max) => min + Math.random() * (max - min);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getStoredHighScore() {
  try {
    return Number.parseInt(localStorage.getItem('deez-deez-high-score') || '0', 10);
  } catch {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    localStorage.setItem('deez-deez-high-score', String(score));
  } catch {
    // Local storage can be unavailable in private contexts.
  }
}

function createState() {
  return {
    mode: 'menu',
    score: 0,
    highScore: getStoredHighScore(),
    hearts: 4,
    bombs: MAX_BOMBS,
    ammo: MAGAZINE,
    magazine: MAGAZINE,
    reloading: false,
    reloadStartedAt: 0,
    reloadEndsAt: 0,
    reloadDuration: 1.18,
    lastShotAt: -10,
    shotCooldown: 0.145,
    aim: { x: 940, y: 300 },
    projectiles: [],
    bombThrows: [],
    blasts: [],
    enemies: [],
    particles: [],
    floaters: [],
    elapsed: 0,
    level: 1,
    spawnTimer: 0.5,
    spawnedSinceSpecial: 0,
    shotsFired: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    shake: 0,
    flash: 0,
    viewportScale: 1,
    viewportOffsetX: 0,
    viewportOffsetY: 0,
    nextId: 1,
  };
}

function resetRun(game) {
  const highScore = game.highScore;
  Object.assign(game, createState(), {
    mode: 'playing',
    highScore,
    aim: { x: 950, y: 310 },
  });
}

function makeSnapshot(game, now = 0) {
  const reloadPct = game.reloading
    ? clamp((now - game.reloadStartedAt) / (game.reloadEndsAt - game.reloadStartedAt), 0, 1)
    : 1;

  return {
    mode: game.mode,
    score: game.score,
    highScore: game.highScore,
    hearts: game.hearts,
    bombs: game.bombs,
    ammo: game.ammo,
    magazine: game.magazine,
    reloading: game.reloading,
    reloadPct,
    level: game.level,
    streak: game.streak,
    bestStreak: game.bestStreak,
    accuracy: game.shotsFired ? Math.round((game.hits / game.shotsFired) * 100) : 100,
    ready: false,
  };
}

function beginReload(game, now, force = false) {
  if (game.reloading || (!force && game.ammo === game.magazine)) return;
  game.reloading = true;
  game.reloadStartedAt = now;
  game.reloadEndsAt = now + game.reloadDuration;
}

function spawnHitParticles(game, x, y, color = '#49f4ff', count = 9) {
  for (let i = 0; i < count; i += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(80, 260);
    game.particles.push({
      id: game.nextId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomBetween(0.25, 0.55),
      maxLife: 0.55,
      size: randomBetween(3, 9),
      color,
    });
  }
}

function addFloater(game, text, x, y, color = '#fff2ba') {
  game.floaters.push({
    id: game.nextId++,
    text,
    x,
    y,
    vy: -34,
    life: 0.85,
    maxLife: 0.85,
    color,
  });
}

function getPressure(game) {
  const timePressure = 1 / (1 + Math.exp(-(game.elapsed - 42) / 18));
  const scorePressure = clamp(game.score / 5200, 0, 1);
  return clamp(timePressure * 0.65 + scorePressure * 0.35, 0, 1);
}

function syncLevel(game) {
  game.level = clamp(1 + Math.floor(game.elapsed / 28) + Math.floor(game.score / 900), 1, 12);
}

function chooseEnemyType(game) {
  const specialEvery = Math.max(7, 12 - Math.floor(game.level / 2));
  if (game.spawnedSinceSpecial >= specialEvery) {
    game.spawnedSinceSpecial = 0;
    return 'special';
  }

  game.spawnedSinceSpecial += 1;
  const roll = Math.random();
  if (game.level >= 5 && roll < 0.22) return 'armored';
  if (game.level >= 3 && roll < 0.42) return 'fast';
  if (game.level >= 7 && roll > 0.84) return 'angry';
  return 'normal';
}

function enemyStats(type, game) {
  const pressure = getPressure(game);
  const base = randomBetween(116, 158) + game.level * 13 + pressure * 150;

  if (type === 'fast') {
    return { hp: 1, speed: base * 1.36, radius: 38, score: 35, sprite: 'acornFast', w: 112, h: 76 };
  }
  if (type === 'angry') {
    return { hp: 1, speed: base * 1.22, radius: 44, score: 45, sprite: 'acornAngry', w: 126, h: 88 };
  }
  if (type === 'armored') {
    return { hp: 2, speed: base * 0.78, radius: 52, score: 70, sprite: 'armored', w: 132, h: 96 };
  }
  if (type === 'special') {
    return { hp: 1, speed: base * 0.92, radius: 48, score: 90, sprite: 'special', w: 122, h: 96 };
  }
  return { hp: 1, speed: base, radius: 42, score: 25, sprite: 'acorn', w: 116, h: 82 };
}

function spawnEnemy(game) {
  const type = chooseEnemyType(game);
  const stats = enemyStats(type, game);
  const y = type === 'special' ? randomBetween(95, 245) : randomBetween(105, 490);

  game.enemies.push({
    id: game.nextId++,
    type,
    x: GAME_WIDTH + 80,
    y,
    baseY: y,
    vx: -stats.speed,
    hp: stats.hp,
    maxHp: stats.hp,
    radius: stats.radius,
    score: stats.score,
    sprite: stats.sprite,
    w: stats.w,
    h: stats.h,
    spin: randomBetween(-1.8, 1.8),
    rotation: randomBetween(-0.14, 0.14),
    wobble: randomBetween(0, Math.PI * 2),
    amp: randomBetween(12, type === 'fast' ? 34 : 52),
    freq: randomBetween(1.1, 2.4),
    flash: 0,
  });
}

function shoot(game, now) {
  if (game.mode !== 'playing') return;
  if (game.reloading) return;
  if (now - game.lastShotAt < game.shotCooldown) return;

  if (game.ammo <= 0) {
    beginReload(game, now);
    return;
  }

  const aimX = Math.max(game.aim.x, PLAYER_ORIGIN.x + 90);
  const aimY = clamp(game.aim.y, 40, GAME_HEIGHT - 80);
  const angle = Math.atan2(aimY - PLAYER_ORIGIN.y, aimX - PLAYER_ORIGIN.x);
  const speed = 865;

  game.projectiles.push({
    id: game.nextId++,
    x: PLAYER_ORIGIN.x + Math.cos(angle) * 42,
    y: PLAYER_ORIGIN.y + Math.sin(angle) * 42,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    life: 1.45,
    radius: 34,
  });

  game.ammo -= 1;
  game.shotsFired += 1;
  game.lastShotAt = now;
  game.shake = Math.max(game.shake, 2.2);
  spawnHitParticles(game, PLAYER_ORIGIN.x + 35, PLAYER_ORIGIN.y, '#47eeff', 4);

  if (game.ammo <= 0) {
    beginReload(game, now + 0.08, true);
  }
}

function deployBomb(game) {
  if (game.mode !== 'playing' || game.bombs <= 0) return;

  const targetX = clamp(game.aim.x, PLAYER_ORIGIN.x + 260, GAME_WIDTH - 90);
  const targetY = clamp(game.aim.y, 120, GAME_HEIGHT - 120);

  game.bombs -= 1;
  game.shake = Math.max(game.shake, 5);
  game.bombThrows.push({
    id: game.nextId++,
    startX: BOMB_THROW_START.x,
    startY: BOMB_THROW_START.y,
    x: BOMB_THROW_START.x,
    y: BOMB_THROW_START.y,
    targetX,
    targetY,
    t: 0,
    duration: 0.72,
    rotation: -0.4,
    spin: randomBetween(6, 9),
  });
  addFloater(game, 'toss!', BOMB_THROW_START.x + 30, BOMB_THROW_START.y - 44, '#ffe08a');
}

function explodeBomb(game, bomb) {
  const blastRadius = 340;
  let cleared = 0;

  game.enemies.forEach((enemy) => {
    if (enemy.dead) return;
    const blastDistance = distance({ x: bomb.targetX, y: bomb.targetY }, enemy);
    if (enemy.type !== 'special' && blastDistance <= blastRadius) {
      enemy.dead = true;
      cleared += 1;
      spawnHitParticles(game, enemy.x, enemy.y, '#ffe08a', 16);
    }
  });

  game.blasts.push({
    id: game.nextId++,
    x: bomb.targetX,
    y: bomb.targetY,
    life: 0.55,
    maxLife: 0.55,
    radius: blastRadius,
  });
  game.shake = 13;

  if (cleared > 0) {
    const gained = cleared * 22;
    game.score += gained;
    addFloater(game, `+${gained}`, bomb.targetX, bomb.targetY - 34, '#ffe08a');
  } else {
    addFloater(game, 'boom', bomb.targetX, bomb.targetY - 34, '#ffe08a');
  }
}

function damageStump(game, enemy) {
  if (enemy.type === 'special') {
    addFloater(game, 'missed', enemy.x, enemy.y, '#ffcf7c');
    return;
  }

  game.hearts -= 1;
  game.streak = 0;
  game.shake = 16;
  game.flash = 1;
  spawnHitParticles(game, 220, 560, '#ff7b62', 18);

  if (game.hearts <= 0) {
    game.mode = 'gameover';
    game.highScore = Math.max(game.highScore, game.score);
    saveHighScore(game.highScore);
  }
}

function killEnemy(game, enemy, directHit = true) {
  const streakBonus = 1 + Math.min(4, Math.floor(game.streak / 8)) * 0.25;
  const score = Math.round(enemy.score * streakBonus);
  game.score += score;
  game.streak += directHit ? 1 : 0;
  game.bestStreak = Math.max(game.bestStreak, game.streak);
  game.hits += directHit ? 1 : 0;

  const color = enemy.type === 'special' ? '#ffd95c' : enemy.type === 'armored' ? '#ff8a50' : '#49f4ff';
  spawnHitParticles(game, enemy.x, enemy.y, color, enemy.type === 'armored' ? 15 : 11);
  addFloater(game, `+${score}`, enemy.x, enemy.y - 20, color);

  if (enemy.type === 'special') {
    const before = game.bombs;
    game.bombs = Math.min(MAX_BOMBS, game.bombs + 1);
    game.ammo = Math.min(game.magazine, game.ammo + 3);
    addFloater(game, before < game.bombs ? '+bomb' : '+D', enemy.x, enemy.y + 18, '#fff4a8');
  }
}

function updateGame(game, dt, now) {
  if (game.mode !== 'playing') return;

  game.elapsed += dt;
  game.shake = Math.max(0, game.shake - dt * 30);
  game.flash = Math.max(0, game.flash - dt * 1.8);
  syncLevel(game);

  if (game.reloading && now >= game.reloadEndsAt) {
    game.reloading = false;
    game.ammo = game.magazine;
    addFloater(game, 'loaded', PLAYER_ORIGIN.x + 25, PLAYER_ORIGIN.y - 95, '#b6faff');
  }

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnEnemy(game);
    const pressure = getPressure(game);
    const interval = lerp(1.08, 0.38, pressure) * Math.pow(0.94, game.level - 1);
    game.spawnTimer = randomBetween(interval * 0.72, interval * 1.2);
  }

  game.projectiles.forEach((projectile) => {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
  });

  game.bombThrows.forEach((bomb) => {
    bomb.t += dt / bomb.duration;
    const t = clamp(bomb.t, 0, 1);
    bomb.x = lerp(bomb.startX, bomb.targetX, t);
    bomb.y = lerp(bomb.startY, bomb.targetY, t) - Math.sin(t * Math.PI) * 190;
    bomb.rotation += bomb.spin * dt;
    if (t >= 1) {
      bomb.dead = true;
      explodeBomb(game, bomb);
    }
  });

  game.enemies.forEach((enemy) => {
    enemy.x += enemy.vx * dt;
    enemy.y = enemy.baseY + Math.sin(game.elapsed * enemy.freq + enemy.wobble) * enemy.amp;
    enemy.rotation += enemy.spin * dt * 0.08;
    enemy.flash = Math.max(0, enemy.flash - dt * 5);
  });

  game.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 120 * dt;
    particle.life -= dt;
  });

  game.floaters.forEach((floater) => {
    floater.y += floater.vy * dt;
    floater.life -= dt;
  });

  game.blasts.forEach((blast) => {
    blast.life -= dt;
  });

  for (const projectile of game.projectiles) {
    if (projectile.dead) continue;

    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      if (distance(projectile, enemy) > projectile.radius + enemy.radius) continue;

      projectile.dead = true;
      enemy.hp -= 1;
      enemy.flash = 1;
      if (enemy.hp <= 0) {
        enemy.dead = true;
        killEnemy(game, enemy, true);
      } else {
        game.hits += 1;
        game.score += 8;
        spawnHitParticles(game, projectile.x, projectile.y, '#8af5ff', 7);
      }
      break;
    }
  }

  game.enemies.forEach((enemy) => {
    if (enemy.dead) return;
    if (enemy.x < 182 && enemy.type !== 'special') {
      enemy.dead = true;
      damageStump(game, enemy);
    } else if (enemy.x < -90) {
      enemy.dead = true;
      damageStump(game, enemy);
    }
  });

  game.projectiles = game.projectiles.filter(
    (projectile) =>
      !projectile.dead &&
      projectile.life > 0 &&
      projectile.x < GAME_WIDTH + 90 &&
      projectile.y > -80 &&
      projectile.y < GAME_HEIGHT + 80,
  );
  game.bombThrows = game.bombThrows.filter((bomb) => !bomb.dead);
  game.enemies = game.enemies.filter((enemy) => !enemy.dead);
  game.particles = game.particles.filter((particle) => particle.life > 0);
  game.floaters = game.floaters.filter((floater) => floater.life > 0);
  game.blasts = game.blasts.filter((blast) => blast.life > 0);
}

function isBombPadHit(point) {
  return distance(point, BOMB_PAD) <= BOMB_PAD.radius;
}

function minScreenGameUnits(game, baseGameUnits, minCssPixels, maxGameUnits) {
  const scale = Math.max(game.viewportScale || 1, 0.01);
  return clamp(minCssPixels / scale, baseGameUnits, maxGameUnits);
}

function drawAimGuide(ctx, game) {
  if (game.mode !== 'playing') return;

  const aimX = Math.max(game.aim.x, PLAYER_ORIGIN.x + 90);
  const aimY = clamp(game.aim.y, 40, GAME_HEIGHT - 80);
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#49f4ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 18]);
  ctx.beginPath();
  ctx.moveTo(PLAYER_ORIGIN.x, PLAYER_ORIGIN.y);
  ctx.lineTo(aimX, aimY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#d8fbff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(aimX, aimY, 16, 0, Math.PI * 2);
  ctx.moveTo(aimX - 25, aimY);
  ctx.lineTo(aimX - 9, aimY);
  ctx.moveTo(aimX + 9, aimY);
  ctx.lineTo(aimX + 25, aimY);
  ctx.moveTo(aimX, aimY - 25);
  ctx.lineTo(aimX, aimY - 9);
  ctx.moveTo(aimX, aimY + 9);
  ctx.lineTo(aimX, aimY + 25);
  ctx.stroke();
  ctx.restore();
}

function drawBazookaRecoil(ctx, shotAge) {
  if (shotAge >= 0.24) return;

  const recoil = Math.sin((1 - shotAge / 0.24) * Math.PI) * 0.9;
  const kick = recoil * 14;

  ctx.save();
  ctx.translate(-kick, recoil * 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const barrel = ctx.createLinearGradient(210, 493, 328, 526);
  barrel.addColorStop(0, '#1d2029');
  barrel.addColorStop(0.45, '#545a62');
  barrel.addColorStop(1, '#141720');

  ctx.fillStyle = barrel;
  ctx.strokeStyle = '#0a0d13';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(214, 493, 110, 32, 15);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#222734';
  ctx.strokeStyle = '#070a0f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(300, 486, 34, 46, 12);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#52f1ff';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.45 + recoil * 0.4;
  ctx.beginPath();
  ctx.moveTo(326, 501);
  ctx.lineTo(354 + recoil * 20, 491 - recoil * 7);
  ctx.moveTo(326, 516);
  ctx.lineTo(356 + recoil * 17, 524 + recoil * 6);
  ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, assets, game, ready) {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  if (!ready) {
    ctx.fillStyle = '#11152a';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    return;
  }

  ctx.save();
  if (game.shake > 0.1) {
    ctx.translate(randomBetween(-game.shake, game.shake), randomBetween(-game.shake * 0.45, game.shake * 0.45));
  }

  drawCover(ctx, assets.backdrop, GAME_WIDTH, GAME_HEIGHT);

  const dusk = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  dusk.addColorStop(0, 'rgba(9, 13, 34, 0.16)');
  dusk.addColorStop(0.7, 'rgba(18, 11, 31, 0.06)');
  dusk.addColorStop(1, 'rgba(8, 10, 18, 0.42)');
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawAimGuide(ctx, game);

  game.projectiles.forEach((projectile) => {
    const dWidth = minScreenGameUnits(game, 158, 92, 310);
    const dHeight = minScreenGameUnits(game, 82, 48, 160);
    const dFont = minScreenGameUnits(game, 46, 30, 102);
    const dTrail = minScreenGameUnits(game, 72, 54, 140);

    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = '#53f8ff';
    ctx.lineWidth = minScreenGameUnits(game, 10, 5, 18);
    ctx.beginPath();
    ctx.moveTo(projectile.x - Math.cos(projectile.angle) * dTrail, projectile.y - Math.sin(projectile.angle) * dTrail);
    ctx.lineTo(projectile.x, projectile.y);
    ctx.stroke();
    ctx.restore();

    drawSprite(ctx, assets.sprites, SPRITES.dShot, projectile.x, projectile.y, dWidth, dHeight, {
      rotation: projectile.angle,
    });

    ctx.save();
    ctx.translate(projectile.x + Math.cos(projectile.angle) * 6, projectile.y + Math.sin(projectile.angle) * 6);
    ctx.rotate(projectile.angle);
    ctx.font = `900 ${dFont}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(8, dFont * 0.18);
    ctx.strokeStyle = '#0875c9';
    ctx.fillStyle = '#f2ffff';
    ctx.shadowColor = '#55edff';
    ctx.shadowBlur = 16;
    ctx.strokeText('D', 0, 1);
    ctx.fillText('D', 0, 1);
    ctx.restore();
  });

  game.bombThrows.forEach((bomb) => {
    drawSprite(ctx, assets.sprites, SPRITES.peanutBomb, bomb.x, bomb.y, 62, 58, {
      rotation: bomb.rotation,
    });
  });

  game.enemies.forEach((enemy) => {
    const sprite = SPRITES[enemy.sprite];
    if (enemy.type === 'special') {
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() * 0.01) * 0.1;
      ctx.fillStyle = '#ffe86e';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawSprite(ctx, assets.sprites, sprite, enemy.x, enemy.y, enemy.w, enemy.h, {
      rotation: enemy.rotation,
      tint: enemy.flash > 0 ? 'rgba(255,255,255,0.48)' : null,
    });

    if (enemy.maxHp > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(17, 21, 42, 0.62)';
      ctx.fillRect(enemy.x - 30, enemy.y - enemy.h * 0.58, 60, 6);
      ctx.fillStyle = '#ffcf6c';
      ctx.fillRect(enemy.x - 30, enemy.y - enemy.h * 0.58, 60 * (enemy.hp / enemy.maxHp), 6);
      ctx.restore();
    }
  });

  const shotAge = performance.now() / 1000 - game.lastShotAt;
  drawSprite(ctx, assets.sprites, SPRITES.playerIdle, PLAYER_CENTER.x, PLAYER_CENTER.y, PLAYER_SIZE.w, PLAYER_SIZE.h);
  drawBazookaRecoil(ctx, shotAge);

  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = 'rgba(34, 19, 12, 0.9)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(164, 564);
  ctx.lineTo(232, 574);
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < MAX_BOMBS; i += 1) {
    drawSprite(ctx, assets.sprites, SPRITES.peanutBomb, 174 + i * 25, 561 + i * 2, 34, 32, {
      rotation: -0.22 + i * 0.2,
      alpha: i < game.bombs ? 1 : 0.26,
    });
  }

  if (shotAge < 0.11) {
    const pulse = 1 - shotAge / 0.11;
    drawSprite(ctx, assets.sprites, SPRITES.energyRing, PLAYER_ORIGIN.x + 32, PLAYER_ORIGIN.y - 8, 82 * pulse, 72 * pulse, {
      alpha: 0.74,
    });
  }

  ctx.save();
  ctx.globalAlpha = game.bombs > 0 ? 1 : 0.36;
  ctx.fillStyle = 'rgba(14, 19, 38, 0.72)';
  ctx.strokeStyle = game.bombs > 0 ? '#ffe08a' : 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(BOMB_PAD.x, BOMB_PAD.y + 8, 58, 23, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  drawSprite(ctx, assets.sprites, SPRITES.peanutBomb, BOMB_PAD.x, BOMB_PAD.y - 2, 70, 64, {
    rotation: 0.18,
    alpha: game.bombs > 0 ? 1 : 0.32,
  });
  ctx.save();
  ctx.fillStyle = game.bombs > 0 ? '#fff3b5' : 'rgba(255, 255, 255, 0.42)';
  ctx.font = '900 17px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(36, 19, 10, 0.82)';
  ctx.strokeText('BOMB', BOMB_PAD.x, BOMB_PAD.y + 48);
  ctx.fillText('BOMB', BOMB_PAD.x, BOMB_PAD.y + 48);
  ctx.restore();

  game.particles.forEach((particle) => {
    const pct = particle.life / particle.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(pct, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * pct, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  game.floaters.forEach((floater) => {
    const pct = floater.life / floater.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(pct, 0, 1);
    ctx.fillStyle = floater.color;
    ctx.font = '800 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(31, 19, 12, 0.8)';
    ctx.strokeText(floater.text, floater.x, floater.y);
    ctx.fillText(floater.text, floater.x, floater.y);
    ctx.restore();
  });

  game.blasts.forEach((blast) => {
    const pct = 1 - blast.life / blast.maxLife;
    ctx.save();
    ctx.globalAlpha = (blast.life / blast.maxLife) * 0.62;
    ctx.strokeStyle = '#ffdf76';
    ctx.lineWidth = 18 * (blast.life / blast.maxLife);
    ctx.beginPath();
    ctx.arc(blast.x, blast.y, 70 + pct * blast.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 219, 106, 0.16)';
    ctx.fill();
    ctx.restore();
  });

  if (game.flash > 0) {
    ctx.save();
    ctx.globalAlpha = game.flash * 0.22;
    ctx.fillStyle = '#ff553e';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.restore();
  }

  ctx.restore();
}

function clientToGame(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const game = canvas.__deezDeezViewport || { scale: rect.width / GAME_WIDTH, offsetX: 0, offsetY: 0 };
  return {
    x: clamp((clientX - rect.left - game.offsetX) / game.scale, 0, GAME_WIDTH),
    y: clamp((clientY - rect.top - game.offsetY) / game.scale, 0, GAME_HEIGHT),
  };
}

export function useAntiSquirrelGame() {
  const canvasRef = useRef(null);
  const assetsRef = useRef(null);
  const gameRef = useRef(createState());
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState(() => makeSnapshot(gameRef.current));

  useEffect(() => {
    let live = true;

    Promise.all([loadImage(ASSET_PATHS.sprites), loadImage(ASSET_PATHS.backdrop)])
      .then(([sprites, backdrop]) => {
        if (!live) return;
        assetsRef.current = { sprites, backdrop };
        setReady(true);
        setHud({ ...makeSnapshot(gameRef.current), ready: true });
      })
      .catch(() => {
        if (!live) return;
        setReady(false);
      });

    return () => {
      live = false;
    };
  }, []);

  const start = useCallback(() => {
    resetRun(gameRef.current);
    setHud({ ...makeSnapshot(gameRef.current, performance.now() / 1000), ready });
  }, [ready]);

  const pause = useCallback(() => {
    const game = gameRef.current;
    if (game.mode === 'playing') game.mode = 'paused';
    else if (game.mode === 'paused') game.mode = 'playing';
    setHud({ ...makeSnapshot(game, performance.now() / 1000), ready });
  }, [ready]);

  const reload = useCallback(() => {
    beginReload(gameRef.current, performance.now() / 1000, true);
  }, []);

  const bomb = useCallback(() => {
    deployBomb(gameRef.current);
    setHud({ ...makeSnapshot(gameRef.current, performance.now() / 1000), ready });
  }, [ready]);

  const fire = useCallback(() => {
    shoot(gameRef.current, performance.now() / 1000);
  }, []);

  useEffect(() => {
    if (!ready || !canvasRef.current || !assetsRef.current) return undefined;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now() / 1000;
    let lastHud = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      const scale = Math.max(rect.width / GAME_WIDTH, rect.height / GAME_HEIGHT);
      const renderedWidth = GAME_WIDTH * scale;
      const renderedHeight = GAME_HEIGHT * scale;
      const offsetX = (rect.width - renderedWidth) / 2;
      const offsetY = rect.height - renderedHeight;

      gameRef.current.viewportScale = scale;
      gameRef.current.viewportOffsetX = offsetX;
      gameRef.current.viewportOffsetY = offsetY;
      canvas.__deezDeezViewport = { scale, offsetX, offsetY };
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);
    };

    const handlePointerMove = (event) => {
      gameRef.current.aim = clientToGame(canvas, event.clientX, event.clientY);
    };

    const handlePointerDown = (event) => {
      canvas.setPointerCapture?.(event.pointerId);
      const point = clientToGame(canvas, event.clientX, event.clientY);
      if (isBombPadHit(point)) {
        deployBomb(gameRef.current);
        return;
      }
      gameRef.current.aim = point;
      shoot(gameRef.current, performance.now() / 1000);
    };

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'enter') {
        event.preventDefault();
        if (gameRef.current.mode === 'menu' || gameRef.current.mode === 'gameover') start();
        else shoot(gameRef.current, performance.now() / 1000);
      }
      if (key === 'r') beginReload(gameRef.current, performance.now() / 1000, true);
      if (key === 'b' || key === 'shift') deployBomb(gameRef.current);
      if (key === 'p' || key === 'escape') pause();
    };

    const frame = (timeMs) => {
      const now = timeMs / 1000;
      const dt = Math.min(0.033, now - last);
      last = now;

      updateGame(gameRef.current, dt, now);
      drawScene(ctx, assetsRef.current, gameRef.current, ready);

      if (now - lastHud > 0.08) {
        setHud({ ...makeSnapshot(gameRef.current, now), ready });
        lastHud = now;
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [pause, ready, start]);

  const actions = useMemo(
    () => ({
      start,
      pause,
      reload,
      bomb,
      fire,
    }),
    [bomb, fire, pause, reload, start],
  );

  return {
    canvasRef,
    hud: { ...hud, ready },
    actions,
  };
}
