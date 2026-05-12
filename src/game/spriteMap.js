export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const ASSET_PATHS = {
  sprites: `${import.meta.env.BASE_URL}assets/sprite-sheet.png`,
  backdrop: `${import.meta.env.BASE_URL}assets/forest-backdrop.png`,
};

export const SPRITES = {
  playerIdle: { x: 12, y: 22, w: 350, h: 310 },
  playerFire: { x: 390, y: 24, w: 440, h: 310 },
  acorn: { x: 26, y: 352, w: 270, h: 188 },
  acornFast: { x: 318, y: 360, w: 270, h: 184 },
  acornAngry: { x: 602, y: 360, w: 270, h: 194 },
  armored: { x: 894, y: 350, w: 292, h: 218 },
  special: { x: 1190, y: 326, w: 315, h: 246 },
  peanutBomb: { x: 36, y: 590, w: 216, h: 198 },
  acornGrenade: { x: 482, y: 612, w: 194, h: 172 },
  dShot: { x: 20, y: 824, w: 238, h: 124 },
  dShotSmall: { x: 640, y: 842, w: 214, h: 92 },
  energyRing: { x: 1060, y: 842, w: 150, h: 130 },
  laserFlower: { x: 1216, y: 590, w: 246, h: 210 },
};

export function drawSprite(ctx, sheet, sprite, x, y, width, height, options = {}) {
  const {
    alpha = 1,
    rotation = 0,
    centered = true,
    flipX = false,
    tint = null,
  } = options;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(flipX ? -1 : 1, 1);

  const dx = centered ? -width / 2 : 0;
  const dy = centered ? -height / 2 : 0;
  ctx.drawImage(sheet, sprite.x, sprite.y, sprite.w, sprite.h, dx, dy, width, height);

  if (tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.fillRect(dx, dy, width, height);
  }

  ctx.restore();
}

export function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}
