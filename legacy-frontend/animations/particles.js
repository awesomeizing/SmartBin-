/**
 * SmartBin+ — Particle Field
 * =============================================================================
 * Ambient canvas background for the hero section.
 *
 * Hand-written rather than a library: this is roughly 120 lines and pulling in
 * a particle framework for it would add far more weight than it saves.
 *
 * Three things keep it from being a battery drain, which matters because it
 * sits at the top of the page and runs whenever the tab is open:
 *   - the animation pauses when the section scrolls out of view
 *   - it pauses entirely when the tab is hidden
 *   - it does not run at all under prefers-reduced-motion
 *
 * @module animations/particles
 */

/**
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} radius
 * @property {number} alpha
 */

/**
 * Start a particle field on a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {number} [options.density=0.00008]  Particles per pixel of canvas area.
 * @param {number} [options.linkDistance=130] Max distance for a connecting line.
 * @param {string} [options.color]            Defaults to the brand green token.
 * @returns {() => void} Stop function.
 */
export function startParticles(canvas, {
  density = 0.00008,
  linkDistance = 130,
  color,
} = {}) {
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  /** @type {Particle[]} */
  let particles = [];
  let rafId = null;
  let running = false;
  let width = 0;
  let height = 0;

  const accent = (color
    ?? getComputedStyle(document.documentElement)
         .getPropertyValue('--sb-green-500').trim())
    || '#22C55E';

  const rgb = hexToRgb(accent);

  /** Size the canvas to its container, accounting for device pixel ratio. */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    // Cap DPR at 2: beyond that the extra pixels are invisible and the cost
    // is real on high-density displays.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = rect.width;
    height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    seed();
  }

  /** Populate the field, scaled to the canvas area. */
  function seed() {
    const target = Math.min(140, Math.round(width * height * density));

    particles = Array.from({ length: target }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      radius: Math.random() * 1.6 + 0.6,
      alpha: Math.random() * 0.4 + 0.2,
    }));
  }

  /** One frame. */
  function frame() {
    if (!running) return;

    ctx.clearRect(0, 0, width, height);

    // Connecting lines first, so nodes render on top of them.
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.hypot(dx, dy);

        if (distance > linkDistance) continue;

        // Fade with distance so the mesh looks organic rather than gridded.
        const opacity = (1 - distance / linkDistance) * 0.13;

        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      // Wrap rather than bounce — bouncing creates visible edges where
      // particles accumulate.
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
      ctx.fill();
    }

    rafId = requestAnimationFrame(frame);
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

  /* --- Visibility gating -------------------------------------------------- */

  // Pause when scrolled out of view.
  const observer = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { threshold: 0 }
  );
  observer.observe(canvas);

  // Pause when the tab is backgrounded.
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = debounce(resize, 200);
  window.addEventListener('resize', onResize);

  resize();

  if (prefersReducedMotion) {
    // Draw a single static frame so the section is not visually empty.
    running = true;
    frame();
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

/**
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return { r: 34, g: 197, b: 94 };

  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default { startParticles };
