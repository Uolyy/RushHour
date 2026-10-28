// Мини-карта: вертикальная лента трассы, «вперёд — вверх».
// Дорога рисуется из мировой геометрии (с поворотами), трафик — точками.
export class Minimap {
  constructor() {
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.out = {};
  }

  draw(player, road, traffic, pickups, ghost, rivals, coins) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    const pxm = H / 620;
    const py0 = H - 16;
    const cx0 = W / 2;
    const h = player.wh;
    const ch = Math.cos(h), sh = Math.sin(h);
    const map = (s, lat) => {
      const w = road.worldOf(s, lat, this.out);
      const ox = w.px - player.wx;
      const oz = w.pz - player.wz;
      return [cx0 + (oz * sh - ox * ch) * pxm, py0 - (ox * sh + oz * ch) * pxm];
    };
    // полотно
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = road.halfWidth * 2 * pxm;
    ctx.beginPath();
    let first = true;
    for (let s = player.s - 70; s < player.s + 560; s += 18) {
      const [x, y] = map(s, 0);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // осевая пунктирная
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    first = true;
    for (let s = player.s - 70; s < player.s + 560; s += 18) {
      const [x, y] = map(s, 0);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // канистры нитро
    if (pickups) {
      ctx.fillStyle = '#36e0ff';
      for (const item of pickups.pool) {
        if (item.s < player.s - 30 || item.s > player.s + 560) continue;
        const [x, y] = map(item.s, item.lat);
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    // монетки
    if (coins) {
      ctx.fillStyle = '#ffd257';
      for (const item of coins.pool) {
        if (item.s < player.s - 30 || item.s > player.s + 560) continue;
        const [x, y] = map(item.s, item.lat);
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    // призрак
    if (ghost && ghost.active) {
      const [x, y] = map(ghost.s, ghost.lat);
      ctx.fillStyle = 'rgba(160,200,255,.8)';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // соперники по сети
    if (rivals && rivals.count) {
      for (const r of rivals.map.values()) {
        if (r.crashed) continue;
        const [x, y] = map(r.s, r.lat);
        ctx.fillStyle = '#ff5040';
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // трафик (полиция мигает)
    if (traffic) {
      const flash = Math.floor(performance.now() / 160) % 2 === 0;
      for (let i = 0; i < traffic.count; i++) {
        const c = traffic.cars[i];
        if (c.s < player.s - 60 || c.s > player.s + 560) continue;
        const [x, y] = map(c.s, c.lat);
        ctx.fillStyle = c.kind === 'police'
          ? (flash ? '#ff4040' : '#4080ff')
          : '#ffb03a';
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // игрок — белый треугольник остриём вперёд
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx0, py0 - 5);
    ctx.lineTo(cx0 - 3.4, py0 + 4);
    ctx.lineTo(cx0 + 3.4, py0 + 4);
    ctx.closePath();
    ctx.fill();
  }
}
