import fs from 'fs';
import { createCanvas } from 'canvas';

try {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#3B82F6';
  ctx.beginPath();
  ctx.roundRect(64, 48, 128, 48, 16);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(64, 112, 96, 48, 16);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(64, 48, 48, 160, 16);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('public/icon.png', buffer);
  console.log('Icon generated successfully!');
} catch (e) {
  console.error(e);
}
