/**
 * SmartBin+ — Interactive 3D Bin
 * =============================================================================
 * A Three.js model of the smart bin: hinged lid, waste volume, HC-SR04 module
 * with a visible measurement beam, and a status LED that follows the same
 * fill bands as the rest of the application.
 *
 * This is where Three.js earns its weight. The landing page's city scene is
 * flat-shaded and stylised, so canvas 2D handles it — but this model is
 * rotatable, the lid hinges, and the sensor beam has to visibly terminate on
 * the waste surface at the correct depth. That is genuine 3D.
 *
 * Note the constraint from the project brief: r128 is the pinned version, so
 * CapsuleGeometry (introduced in r142) is unavailable. Cylinders and spheres
 * are used instead.
 *
 * @module models/bin3d
 */

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

/** @type {Promise<any>|null} */
let threePromise = null;

/**
 * Load Three.js once.
 * @returns {Promise<any>} The THREE global.
 */
export function loadThree() {
  if (threePromise) return threePromise;

  threePromise = new Promise((resolve, reject) => {
    if (window.THREE) { resolve(window.THREE); return; }

    const script = document.createElement('script');
    script.src = THREE_CDN;
    script.async = true;
    script.onload = () => resolve(window.THREE);
    script.onerror = () => reject(
      new Error('Three.js failed to load from CDN. Check the network connection.')
    );

    document.head.appendChild(script);
  });

  return threePromise;
}

/** Colours matching the report §3.1 fill bands. */
const BAND_COLORS = {
  empty:    0x22C55E,
  half:     0xF59E0B,
  full:     0xEF4444,
};

/**
 * Create the interactive bin scene.
 *
 * @param {HTMLElement} container
 * @returns {Promise<object>} Controller with setFill, openLid, closeLid, empty, destroy.
 */
export async function createBin3D(container) {
  const THREE = await loadThree();

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Scene -------------------------------------------------------------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x020617, 12, 30);

  const camera = new THREE.PerspectiveCamera(
    38, container.clientWidth / container.clientHeight, 0.1, 100
  );
  camera.position.set(5.5, 4.2, 6.5);
  camera.lookAt(0, 1.2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  // Cap DPR at 2 — beyond that the extra pixels are invisible and the GPU
  // cost is real on high-density displays.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  /* --- Lighting ----------------------------------------------------------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(6, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  scene.add(keyLight);

  // Cool rim light from behind, so the silhouette separates from the
  // background rather than flattening into it.
  const rimLight = new THREE.DirectionalLight(0x3B82F6, 0.45);
  rimLight.position.set(-6, 4, -5);
  scene.add(rimLight);

  /* --- Ground ------------------------------------------------------------- */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshStandardMaterial({
      color: 0x0F172A, roughness: 0.95, metalness: 0.05,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(14, 28, 0x1E293B, 0x1E293B);
  grid.material.opacity = 0.28;
  grid.material.transparent = true;
  scene.add(grid);

  /* --- Bin body ----------------------------------------------------------- */
  const binGroup = new THREE.Group();
  scene.add(binGroup);

  const BIN_HEIGHT = 2.6;
  const BIN_TOP_R = 1.15;
  const BIN_BOTTOM_R = 0.95;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1E293B, roughness: 0.55, metalness: 0.35,
  });

  const body = new THREE.Mesh(
    // Open-ended so the waste inside is visible from above.
    new THREE.CylinderGeometry(BIN_TOP_R, BIN_BOTTOM_R, BIN_HEIGHT, 32, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x1E293B, roughness: 0.55, metalness: 0.35,
      side: THREE.DoubleSide,
    })
  );
  body.position.y = BIN_HEIGHT / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  binGroup.add(body);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(BIN_BOTTOM_R, BIN_BOTTOM_R, 0.08, 32),
    bodyMaterial
  );
  base.position.y = 0.04;
  base.castShadow = true;
  binGroup.add(base);

  // Ribs — three bands around the body, purely for visual interest.
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const radius = BIN_BOTTOM_R + (BIN_TOP_R - BIN_BOTTOM_R) * t;

    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.03, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.4 })
    );
    rib.rotation.x = Math.PI / 2;
    rib.position.y = BIN_HEIGHT * t;
    binGroup.add(rib);
  }

  /* --- Waste volume -------------------------------------------------------- */
  const wasteMaterial = new THREE.MeshStandardMaterial({
    color: BAND_COLORS.empty, roughness: 0.85, metalness: 0.1,
    transparent: true, opacity: 0.85,
  });

  const waste = new THREE.Mesh(
    new THREE.CylinderGeometry(BIN_TOP_R * 0.94, BIN_BOTTOM_R * 0.94, 1, 32),
    wasteMaterial
  );
  waste.castShadow = true;
  binGroup.add(waste);

  /* --- Lid ---------------------------------------------------------------- */
  // Pivot group positioned at the hinge, so rotating it swings the lid on a
  // real hinge rather than spinning it about its own centre.
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, BIN_HEIGHT, -BIN_TOP_R);
  binGroup.add(lidPivot);

  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(BIN_TOP_R * 1.06, BIN_TOP_R * 1.06, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.5 })
  );
  lid.position.set(0, 0.07, BIN_TOP_R);
  lid.castShadow = true;
  lidPivot.add(lid);

  const hinge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, BIN_TOP_R * 1.4, 16),
    new THREE.MeshStandardMaterial({ color: 0x3B82F6, roughness: 0.3, metalness: 0.7 })
  );
  hinge.rotation.z = Math.PI / 2;
  lidPivot.add(hinge);

  /* --- HC-SR04 module ------------------------------------------------------ */
  const sensorGroup = new THREE.Group();
  sensorGroup.position.set(0, 0.02, BIN_TOP_R * 0.55);
  lidPivot.add(sensorGroup);   // mounted to the lid, as in the real build

  const sensorBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.06, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x0F766E, roughness: 0.7, metalness: 0.2 })
  );
  sensorGroup.add(sensorBoard);

  // The two transducers — the visual signature of an HC-SR04.
  [-0.13, 0.13].forEach((x) => {
    const transducer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.09, 20),
      new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.4, metalness: 0.8 })
    );
    transducer.position.set(x, -0.06, 0);
    sensorGroup.add(transducer);
  });

  /* --- Measurement beam ---------------------------------------------------- */
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x3B82F6, transparent: true, opacity: 0.16,
  });

  // Cone, apex at the sensor — an ultrasonic beam spreads, it is not a laser.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 20, 1, true), beamMaterial);
  binGroup.add(beam);

  // Ring that lands on the waste surface, marking where the echo returns from.
  const echoRing = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.44, 28),
    new THREE.MeshBasicMaterial({
      color: 0x3B82F6, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    })
  );
  echoRing.rotation.x = -Math.PI / 2;
  binGroup.add(echoRing);

  /* --- Status LED ---------------------------------------------------------- */
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: BAND_COLORS.empty,
    emissive: BAND_COLORS.empty,
    emissiveIntensity: 0.9,
  });

  const led = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), ledMaterial);
  led.position.set(BIN_TOP_R * 0.72, BIN_HEIGHT * 0.82, BIN_TOP_R * 0.62);
  binGroup.add(led);

  const ledGlow = new THREE.PointLight(BAND_COLORS.empty, 0.9, 3);
  ledGlow.position.copy(led.position);
  binGroup.add(ledGlow);

  /* --- State --------------------------------------------------------------- */
  const state = {
    fillPct: 0,
    targetFill: 0,
    lidOpen: false,
    lidAngle: 0,
    targetLidAngle: 0,
    autoRotate: true,
  };

  /**
   * Reposition the waste, beam and echo ring for the current fill level.
   * @param {number} pct
   */
  function applyFill(pct) {
    const clamped = Math.max(0, Math.min(100, pct));

    // Waste height, with a small floor so an "empty" bin still shows a base
    // layer rather than a mathematically invisible disc.
    const height = Math.max(0.02, (clamped / 100) * (BIN_HEIGHT - 0.15));

    waste.scale.y = height;
    waste.position.y = height / 2 + 0.06;

    // Beam runs from the sensor down to the waste surface.
    const sensorY = BIN_HEIGHT + 0.02;
    const surfaceY = height + 0.06;
    const beamLength = Math.max(0.05, sensorY - surfaceY);

    beam.scale.y = beamLength;
    beam.position.y = surfaceY + beamLength / 2;
    beam.rotation.x = Math.PI;   // apex upward, at the sensor

    echoRing.position.y = surfaceY + 0.01;

    // Colour follows the report §3.1 bands — the same thresholds the
    // dashboard, the firmware and the map all use.
    const color = clamped >= 80 ? BAND_COLORS.full
                : clamped >= 51 ? BAND_COLORS.half
                : BAND_COLORS.empty;

    wasteMaterial.color.setHex(color);
    ledMaterial.color.setHex(color);
    ledMaterial.emissive.setHex(color);
    ledGlow.color.setHex(color);

    // The LED only lights meaningfully once past the threshold — that is what
    // the physical red LED does.
    ledMaterial.emissiveIntensity = clamped >= 80 ? 1.6 : 0.6;
    ledGlow.intensity = clamped >= 80 ? 1.8 : 0.5;
  }

  applyFill(0);

  /* --- Interaction: drag to rotate ----------------------------------------- */
  let dragging = false;
  let previousX = 0;

  const onPointerDown = (e) => {
    dragging = true;
    state.autoRotate = false;
    previousX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    binGroup.rotation.y += (x - previousX) * 0.008;
    previousX = x;
  };

  const onPointerUp = () => { dragging = false; };

  renderer.domElement.addEventListener('mousedown', onPointerDown);
  renderer.domElement.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchend', onPointerUp);

  renderer.domElement.style.cursor = 'grab';

  /* --- Render loop --------------------------------------------------------- */
  let rafId = null;
  let running = false;

  function animate() {
    if (!running) return;

    // Ease fill toward its target so changes read as filling, not teleporting.
    if (Math.abs(state.fillPct - state.targetFill) > 0.1) {
      state.fillPct += (state.targetFill - state.fillPct) * 0.08;
      applyFill(state.fillPct);
    }

    // Lid easing.
    if (Math.abs(state.lidAngle - state.targetLidAngle) > 0.001) {
      state.lidAngle += (state.targetLidAngle - state.lidAngle) * 0.12;
      lidPivot.rotation.x = state.lidAngle;
    }

    if (state.autoRotate && !dragging) {
      binGroup.rotation.y += 0.0035;
    }

    // Subtle beam pulse, so it reads as active sensing rather than a static
    // decorative cone.
    beamMaterial.opacity = 0.12 + Math.sin(Date.now() * 0.003) * 0.05;
    echoRing.material.opacity = 0.4 + Math.sin(Date.now() * 0.003) * 0.15;

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }

  function start() {
    if (running || prefersReducedMotion) return;
    running = true;
    animate();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Pause when scrolled away — a WebGL context running off-screen is pure
  // battery drain.
  const observer = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { threshold: 0 }
  );
  observer.observe(container);

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  if (prefersReducedMotion) {
    renderer.render(scene, camera);   // one static frame
  } else {
    start();
  }

  /* --- Public controller --------------------------------------------------- */
  return {
    /**
     * Set the fill level. Animates toward the target.
     * @param {number} pct
     */
    setFill(pct) {
      state.targetFill = Math.max(0, Math.min(100, pct));
      if (prefersReducedMotion) {
        state.fillPct = state.targetFill;
        applyFill(state.fillPct);
        renderer.render(scene, camera);
      }
    },

    /** Open the lid. */
    openLid() {
      state.lidOpen = true;
      state.targetLidAngle = -Math.PI * 0.62;
    },

    /** Close the lid. */
    closeLid() {
      state.lidOpen = false;
      state.targetLidAngle = 0;
    },

    /** Toggle the lid. */
    toggleLid() {
      state.lidOpen ? this.closeLid() : this.openLid();
    },

    /**
     * Simulate a collection: open, empty, close.
     * @returns {Promise<void>}
     */
    async collect() {
      this.openLid();
      await wait(600);
      this.setFill(0);
      await wait(1400);
      this.closeLid();
    },

    /** @param {boolean} enabled */
    setAutoRotate(enabled) { state.autoRotate = enabled; },

    /** @returns {number} */
    getFill() { return state.fillPct; },

    /** Release the WebGL context and all listeners. */
    destroy() {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);

      // Dispose explicitly: WebGL resources are not garbage-collected with
      // the DOM node, and leaking contexts eventually kills the tab.
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          Array.isArray(object.material)
            ? object.material.forEach((m) => m.dispose())
            : object.material.dispose();
        }
      });

      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default { createBin3D, loadThree };
