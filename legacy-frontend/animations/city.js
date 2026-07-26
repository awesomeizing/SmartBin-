/**
 * SmartBin+ — Animated City Scene
 * =============================================================================
 * An isometric city with roads, buildings, smart bins and collection vehicles
 * driving between them.
 *
 * Canvas 2D with an isometric projection rather than Three.js: the scene is
 * stylised and flat-shaded, so a real 3D engine would add ~600 KB to the
 * landing page for something a projection matrix does just as well. Three.js
 * is reserved for the interactive bin model, where actual 3D interaction
 * earns its weight.
 *
 * @module animations/city
 */

/** Isometric projection constants. */
const TILE_W = 56;
const TILE_H = 28;

/**
 * Grid layout. 0 = ground, 1 = road, 2 = building, 3 = bin site.
 * Roads form a loop the trucks drive around.
 */
const GRID = [
  [2, 2, 1, 2, 2, 2, 1, 2, 2],
  [2, 0, 1, 0, 3, 0, 1, 0, 2],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [2, 0, 1, 0, 2, 0, 1, 0, 3],
  [2, 3, 1, 2, 2, 2, 1, 2, 2],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [2, 0, 1, 0, 3, 0, 1, 0, 2],
  [2, 2, 1, 2, 2, 2, 1, 2, 2],
];

/**
 * Waypoints for the vehicle loop, in grid coordinates.
 * Chosen to follow the road tiles above.
 */
const TRUCK_ROUTE = [
  { r: 2, c: 0 }, { r: 2, c: 8 }, { r: 5, c: 8 },
  { r: 5, c: 0 }, { r: 2, c: 0 },
];

/**
 * Start the city animation.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {() => void} Stop function.
 */
export function startCity(canvas) {
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let width = 0;
  let height = 0;
  let originX = 0;
  let originY = 0;
  let rafId = null;
  let running = false;
  let t = 0;

  const colors = readColors();

  /** Building heights, fixed per tile so they do not shimmer between frames. */
  const heights = GRID.map((row) =>
    row.map((cell) => (cell === 2 ? 14 + Math.random() * 26 : 0))
  );

  /** Bin fill levels, cycling slowly to show the colour states. */
  const binSites = [];
  GRID.forEach((row, r) => row.forEach((cell, c) => {
    if (cell === 3) binSites.push({ r, c, phase: Math.random() * Math.PI * 2 });
  }));

  /** Two trucks, offset so they are never on top of each other. */
  const trucks = [
    { progress: 0,    speed: 0.0016 },
    { progress: 0.55, speed: 0.0013 },
  ];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = rect.width;
    height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Centre the grid: the isometric diamond is widest across its diagonal.
    originX = width / 2;
    originY = height / 2 - (GRID.length * TILE_H) / 2 + 30;
  }

  /**
   * Grid coordinates to screen coordinates.
   * @param {number} r
   * @param {number} c
   * @returns {{x: number, y: number}}
   */
  function project(r, c) {
    return {
      x: originX + (c - r) * (TILE_W / 2),
      y: originY + (c + r) * (TILE_H / 2),
    };
  }

  /**
   * Draw a filled isometric diamond.
   */
  function drawTile(x, y, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.fill();

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  /**
   * Draw an extruded box on a tile — used for buildings and bins.
   */
  function drawBox(x, y, h, top, left, right) {
    // Left face
    ctx.beginPath();
    ctx.moveTo(x - TILE_W / 2, y + TILE_H / 2);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x, y + TILE_H - h);
    ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2 - h);
    ctx.closePath();
    ctx.fillStyle = left;
    ctx.fill();

    // Right face
    ctx.beginPath();
    ctx.moveTo(x + TILE_W / 2, y + TILE_H / 2);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x, y + TILE_H - h);
    ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2 - h);
    ctx.closePath();
    ctx.fillStyle = right;
    ctx.fill();

    // Top face
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2 - h);
    ctx.lineTo(x, y + TILE_H - h);
    ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2 - h);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
  }

  function frame() {
    if (!running) return;

    ctx.clearRect(0, 0, width, height);
    t += 1;

    // Painter's algorithm: draw back to front so nearer tiles occlude
    // further ones. Iterating rows then columns gives correct depth order
    // for an isometric grid.
    for (let r = 0; r < GRID.length; r++) {
      for (let c = 0; c < GRID[r].length; c++) {
        const { x, y } = project(r, c);
        const cell = GRID[r][c];

        if (cell === 1) {
          drawTile(x, y, colors.road, colors.roadEdge);
        } else if (cell === 2) {
          drawTile(x, y, colors.ground, null);
          drawBox(x, y, heights[r][c], colors.buildingTop, colors.buildingLeft, colors.buildingRight);
        } else {
          drawTile(x, y, colors.ground, colors.groundEdge);
        }
      }
    }

    // Bins, drawn after the grid so their glow is not overpainted.
    for (const site of binSites) {
      const { x, y } = project(site.r, site.c);

      // Slow cycle through the fill bands, so all three colours are visible.
      const cycle = (Math.sin(t * 0.006 + site.phase) + 1) / 2;
      const fillPct = cycle * 100;

      const binColor = fillPct >= 80 ? colors.red
                     : fillPct >= 51 ? colors.amber
                     : colors.green;

      drawBox(x, y, 11, binColor, shade(binColor, -0.35), shade(binColor, -0.18));

      // Sensor pulse rising from the bin.
      const pulse = (t * 0.012 + site.phase) % 1;
      ctx.beginPath();
      ctx.ellipse(x, y + TILE_H / 2 - 12 - pulse * 16, 11 * (1 - pulse), 5 * (1 - pulse), 0, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(binColor, (1 - pulse) * 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Trucks.
    for (const truck of trucks) {
      truck.progress = (truck.progress + truck.speed) % 1;
      const position = alongRoute(truck.progress);
      const { x, y } = project(position.r, position.c);

      ctx.save();
      ctx.shadowColor = colors.blue;
      ctx.shadowBlur = 10;

      drawBox(x, y, 9, colors.blue, shade(colors.blue, -0.35), shade(colors.blue, -0.15));

      ctx.restore();
    }

    rafId = requestAnimationFrame(frame);
  }

  /**
   * Interpolate a position along the truck route.
   * @param {number} progress 0-1 around the full loop.
   * @returns {{r: number, c: number}}
   */
  function alongRoute(progress) {
    const segments = TRUCK_ROUTE.length - 1;
    const scaled = progress * segments;
    const index = Math.min(segments - 1, Math.floor(scaled));
    const local = scaled - index;

    const from = TRUCK_ROUTE[index];
    const to = TRUCK_ROUTE[index + 1];

    return {
      r: from.r + (to.r - from.r) * local,
      c: from.c + (to.c - from.c) * local,
    };
  }

  function start() {
    if (running || prefersReducedMotion) return;
    running = true;
    frame();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  const observer = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { threshold: 0 }
  );
  observer.observe(canvas);

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = debounce(resize, 200);
  window.addEventListener('resize', onResize);

  resize();

  if (prefersReducedMotion) {
    running = true;
    frame();      // one static frame
    running = false;
  } else {
    start();
  }

  return () => {
    stop();
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
  };
}

/* ---------------------------------------------------------------------------
 * COLOUR HELPERS
 * ------------------------------------------------------------------------- */

function readColors() {
  const css = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  return {
    ground:        'rgba(30, 41, 59, 0.55)',
    groundEdge:    'rgba(148, 163, 184, 0.06)',
    road:          'rgba(15, 23, 42, 0.9)',
    roadEdge:      'rgba(148, 163, 184, 0.12)',
    buildingTop:   'rgba(51, 65, 85, 0.9)',
    buildingLeft:  'rgba(30, 41, 59, 0.95)',
    buildingRight: 'rgba(40, 52, 72, 0.95)',
    green: css('--sb-green-500', '#22C55E'),
    amber: css('--sb-amber-500', '#F59E0B'),
    red:   css('--sb-red-500', '#EF4444'),
    blue:  css('--sb-blue-500', '#3B82F6'),
  };
}

/**
 * Lighten or darken a hex colour.
 * @param {string} hex
 * @param {number} amount -1 to 1
 * @returns {string}
 */
function shade(hex, amount) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;

  const adjust = (channel) => {
    const value = parseInt(channel, 16);
    const next = amount < 0
      ? value * (1 + amount)
      : value + (255 - value) * amount;
    return Math.round(Math.min(255, Math.max(0, next)));
  };

  const r = adjust(clean.slice(0, 2));
  const g = adjust(clean.slice(2, 4));
  const b = adjust(clean.slice(4, 6));

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function withAlpha(hex, alpha) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default { startCity };
