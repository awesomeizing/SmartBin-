/**
 * SmartBin+ — Scroll Reveal
 * =============================================================================
 * Reveals elements as they enter the viewport, and animates counting numbers.
 *
 * Uses IntersectionObserver rather than scroll listeners: a scroll handler
 * fires dozens of times per second and forces layout on every call, which is
 * the classic cause of janky landing pages.
 *
 * @module animations/scroll-reveal
 */

/**
 * Observe every `[data-reveal]` element and add `.is-visible` when it enters
 * the viewport.
 *
 * @param {object} [options]
 * @param {number} [options.threshold=0.12]
 * @param {string} [options.rootMargin='0px 0px -60px 0px']
 * @param {boolean} [options.once=true]
 * @returns {() => void} Teardown.
 */
export function initScrollReveal({
  threshold = 0.12,
  rootMargin = '0px 0px -60px 0px',
  once = true,
} = {}) {
  const elements = document.querySelectorAll('[data-reveal]');
  if (elements.length === 0) return () => {};

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // With reduced motion, reveal everything immediately rather than animating.
  // The CSS also handles this, but doing it here avoids leaving an observer
  // running for no reason.
  if (prefersReducedMotion) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        if (!once) entry.target.classList.remove('is-visible');
        continue;
      }

      // Stagger children of a revealed group, if requested.
      const delay = Number(entry.target.dataset.revealDelay ?? 0);

      if (delay > 0) {
        setTimeout(() => entry.target.classList.add('is-visible'), delay);
      } else {
        entry.target.classList.add('is-visible');
      }

      if (once) observer.unobserve(entry.target);
    }
  }, { threshold, rootMargin });

  elements.forEach((el) => observer.observe(el));

  return () => observer.disconnect();
}

/**
 * Animate a number counting up when it scrolls into view.
 *
 * Applied to `[data-count]` elements. The target value is read from the
 * attribute; an optional `data-count-suffix` is appended.
 *
 * @param {object} [options]
 * @param {number} [options.duration=1600]
 * @returns {() => void} Teardown.
 */
export function initCounters({ duration = 1600 } = {}) {
  const elements = document.querySelectorAll('[data-count]');
  if (elements.length === 0) return () => {};

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * @param {HTMLElement} el
   */
  const run = (el) => {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.countDecimals ?? 0);
    const suffix = el.dataset.countSuffix ?? '';

    if (!Number.isFinite(target)) return;

    if (prefersReducedMotion) {
      el.textContent = target.toFixed(decimals) + suffix;
      return;
    }

    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);

      // Ease-out cubic — fast start, gentle settle. A linear count looks
      // mechanical; an ease-out reads as a value arriving.
      const eased = 1 - (1 - progress) ** 3;
      const value = target * eased;

      el.textContent = value.toFixed(decimals) + suffix;

      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = target.toFixed(decimals) + suffix;
    };

    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      run(entry.target);
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.4 });

  elements.forEach((el) => {
    // Reserve the final width so the layout does not shift as digits are added.
    el.style.minWidth = `${String(el.dataset.count).length + 1}ch`;
    el.textContent = '0' + (el.dataset.countSuffix ?? '');
    observer.observe(el);
  });

  return () => observer.disconnect();
}

/**
 * Parallax drift for decorative layers.
 *
 * Deliberately subtle and capped: large parallax offsets are a common
 * accessibility complaint and a frequent cause of layout thrash.
 *
 * @param {string} [selector='[data-parallax]']
 * @returns {() => void}
 */
export function initParallax(selector = '[data-parallax]') {
  const elements = document.querySelectorAll(selector);
  if (elements.length === 0) return () => {};

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => {};
  }

  let ticking = false;

  const update = () => {
    const scrollY = window.scrollY;

    elements.forEach((el) => {
      const speed = Number(el.dataset.parallax ?? 0.15);
      const offset = Math.max(-40, Math.min(40, scrollY * speed * -1));
      el.style.transform = `translate3d(0, ${offset}px, 0)`;
    });

    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  update();

  return () => window.removeEventListener('scroll', onScroll);
}

export default { initScrollReveal, initCounters, initParallax };
