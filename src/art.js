export function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function silhouette(ctx, color, width, bottom, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (const [x, y] of points) ctx.lineTo(x * width, y * bottom);
  ctx.lineTo(width, bottom);
  ctx.fill();
}

export function landscape(ctx, width, height, shift = 0, variant = 0) {
  const palettes = [
    ['#1c454a','#36615e','#51786b','#8ab18a','#f8c975','#315c59','#21464e','#14353e'],
    ['#29374c','#505069','#836579','#bc8b86','#ffc780','#684b66','#483c58','#282c43'],
    ['#253750','#384d68','#5c7c8c','#8fbcb2','#e7ebad','#4c7280','#345365','#203d52'],
    ['#322f4b','#46455e','#65617d','#9e91a4','#ffbf92','#635775','#454663','#2e384c'],
  ];
  const [sky, middle, haze, horizon, sun, far, near, front] = palettes[variant % palettes.length];
  rect(ctx, sky, 0, 0, width, height);
  rect(ctx, middle, 0, height * .27, width, height * .73);
  rect(ctx, haze, 0, height * .48, width, height * .52);
  rect(ctx, horizon, 0, height * .63, width, height * .37);
  const radius = Math.floor(height * .22);
  const x = Math.floor(width * .76 - (shift * .04) % (width * .19));
  const y = Math.floor(height * .46);
  for (let row = -radius; row <= radius; row += 1) {
    const half = Math.sqrt(radius * radius - row * row);
    rect(ctx, sun, x - half, y + row, Math.floor(2 * half) + 1, 1);
  }
  for (let i = 0; i < 18; i += 1) {
    const cloudX = (width * (i * .137 + .08) - shift * .11) % width;
    const cloudY = height * (.13 + ((i * 9) % 21) / 70);
    rect(ctx, i % 3 ? '#fff3b32f' : '#fff3b35f', cloudX, cloudY, 8 + i % 8 * 3, 2);
  }
  silhouette(ctx, far, width, height, [[0,.8],[.09,.51],[.16,.63],[.25,.42],[.37,.68],[.5,.52],[.63,.76],[.76,.59],[.84,.69],[.92,.48],[1,.67]]);
  silhouette(ctx, near, width, height, [[0,.77],[.1,.72],[.19,.78],[.33,.58],[.44,.7],[.56,.67],[.69,.79],[.82,.67],[.93,.79],[1,.74]]);
  silhouette(ctx, front, width, height, [[0,.93],[.12,.84],[.24,.89],[.37,.8],[.5,.92],[.63,.84],[.78,.89],[.91,.81],[1,.86]]);
}

export function rover(ctx, x, y, scale = 1, direction = 1, running = 0) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(direction * scale, scale);
  rect(ctx, '#213137', -7, -14, 15, 11);
  rect(ctx, '#e5efb6', -6, -18, 13, 8);
  rect(ctx, '#76d6b1', -2, -16, 9, 5);
  rect(ctx, '#152c36', 3, -15, 2, 2);
  rect(ctx, '#f0ac58', -8, -10, 13, 3);
  rect(ctx, '#e8d393', -7, -4, 5, 4 - running);
  rect(ctx, '#e8d393', 2, -4, 5, 3 + running);
  rect(ctx, '#f0ce7a', -9, -11, 3, 4);
  ctx.restore();
}

export function tankSprite(ctx, x, y, angle, color, scale = 1) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  rect(ctx, '#171d2a', -9, -9, 18, 18);
  rect(ctx, '#505560', -8, -9, 15, 3);
  rect(ctx, '#505560', -8, 6, 15, 3);
  rect(ctx, color, -7, -6, 13, 12);
  rect(ctx, '#242d39', -3, -4, 9, 8);
  rect(ctx, color, 0, -2, 13, 4);
  rect(ctx, '#e6e8b8', 9, -1, 3, 2);
  ctx.restore();
}

export function cover(canvas, kind) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  if (kind === 'hero' || kind === 'trail') {
    landscape(ctx, w, h);
    const start = Math.round(w * .53);
    rect(ctx, '#203538', start, h * .84, w - start, h * .16);
    rect(ctx, '#75aa76', start, h * .83, w - start, 4);
    for (let i = 0; i < 14; i += 1) rect(ctx, '#477b60', start + 4 + i * w / 30, h * .9 + i % 3 * 3, 7, 2);
    const factor = kind === 'hero' ? 2 : 1;
    rover(ctx, w * .73, h * .82, factor);
    for (let i = 0; i < 5; i += 1) {
      const bx = w * (.79 + i * .04), by = h * .64 - i * factor * 5;
      rect(ctx, '#e8d78e', bx, by, 3 * factor, 7 * factor);
      rect(ctx, '#fcf2c9', bx + factor, by + factor, factor, factor);
    }
    return;
  }
  const backgrounds = { crates:'#382947', tanks:'#2a3739', blocks:'#23284f', gomoku:'#624b44' };
  rect(ctx, backgrounds[kind], 0, 0, w, h);
  for (let x = 0; x < w; x += 8) for (let y = (x % 16) / 2; y < h; y += 8) rect(ctx, '#f4f4ff15', x, y, 1, 1);
  if (kind === 'crates') {
    for (let i = 0; i < 5; i += 1) rect(ctx, '#674b7d', 23 + i * 14, 45, 13, 12);
    for (const [x,y] of [[50,18],[36,32],[64,32]]) {
      rect(ctx, '#d38455', x, y, 13, 13);
      rect(ctx, '#ffd481', x, y, 13, 2);
      rect(ctx, '#a55c50', x+3, y+4, 7, 6);
    }
    rover(ctx, 87, 46, .75, -1);
  } else if (kind === 'tanks') {
    for (let i = 0; i < 4; i += 1) {
      rect(ctx, '#795c50', 47 + i % 2 * 11, 22 + Math.floor(i / 2) * 12, 10, 11);
      rect(ctx, '#a27f60', 47 + i % 2 * 11, 22 + Math.floor(i / 2) * 12, 10, 2);
    }
    tankSprite(ctx, 31, 48, 0, '#c8eb87', 1.2);
    tankSprite(ctx, 88, 24, Math.PI, '#ed9a76', 1.15);
    rect(ctx, '#ffe7a5', 54, 46, 7, 2);
  } else if (kind === 'blocks') {
    const pieces = [[26,42,'#74d8a8'],[36,42,'#74d8a8'],[36,32,'#74d8a8'],[46,32,'#74d8a8'],[56,42,'#d290df'],[66,42,'#d290df'],[76,42,'#d290df'],[66,32,'#d290df'],[86,42,'#a1abfa'],[86,32,'#a1abfa'],[86,22,'#a1abfa'],[96,22,'#a1abfa'],[46,16,'#f5cb77'],[56,16,'#f5cb77'],[46,6,'#f5cb77'],[56,6,'#f5cb77']];
    for (const [x,y,c] of pieces) { rect(ctx,c,x,y,9,9); rect(ctx,'#ffffff59',x,y,9,2); }
  } else {
    rect(ctx, '#ba936c', 29, 5, 65, 64);
    for (let i = 0; i < 7; i += 1) {
      rect(ctx, '#846044', 34 + i*9, 9, 1, 55);
      rect(ctx, '#846044', 34, 9 + i*9, 55, 1);
    }
    for (const [x,y,c] of [[43,36,'#242431'],[52,45,'#242431'],[61,45,'#242431'],[70,54,'#242431'],[61,27,'#f1dbc4'],[70,36,'#f1dbc4'],[52,36,'#f1dbc4'],[70,45,'#f1dbc4']]) {
      ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x,y,4.1,0,Math.PI*2); ctx.fill();
    }
  }
}
