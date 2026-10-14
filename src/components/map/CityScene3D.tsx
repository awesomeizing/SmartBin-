import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BinSummary, CollectionRoute, Truck } from '@/types';
import { getFillColor } from '@/lib/calculations';

interface Props {
  bins: BinSummary[];
  routes: CollectionRoute[];
  trucks: Truck[];
  onSelectBin: (bin: BinSummary) => void;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const green = 0x42a858;

function mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function addTree(scene: THREE.Scene, x: number, z: number, palm = false) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, palm ? 1.7 : 1.1, 7), new THREE.MeshStandardMaterial({ color: palm ? 0x9a6944 : 0x75523b }));
  trunk.position.set(x, palm ? 0.85 : 0.55, z);
  scene.add(trunk);
  if (palm) {
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.35, 5), new THREE.MeshStandardMaterial({ color: 0x38a653 }));
      leaf.position.set(x + Math.cos(i * Math.PI / 3.5) * 0.58, 1.8, z + Math.sin(i * Math.PI / 3.5) * 0.58);
      leaf.rotation.z = -Math.cos(i * Math.PI / 3.5) * 0.8;
      leaf.rotation.x = Math.sin(i * Math.PI / 3.5) * 0.8;
      scene.add(leaf);
    }
  } else {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 1), new THREE.MeshStandardMaterial({ color: green, roughness: 1 }));
    crown.position.set(x, 1.35, z);
    scene.add(crown);
  }
}

function buildMiniatureCity(scene: THREE.Scene) {
  scene.background = new THREE.Color('#c6d8dc');
  scene.fog = new THREE.Fog('#c6d8dc', 38, 70);
  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x6d765d, 2.1));
  const sun = new THREE.DirectionalLight(0xfff0cf, 3.2);
  sun.position.set(-12, 24, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  scene.add(sun);

  // White presentation plinth and the dark, hand-built road grid from the video.
  scene.add(mesh(boxGeo, 0xf4f0df, 0, -0.46, 0, 31, 0.9, 25));
  scene.add(mesh(boxGeo, 0x202326, 0, 0, 0, 29.4, 0.08, 23.4));
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 1 });
  for (const x of [-10, -4, 2, 8]) {
    const road = new THREE.Mesh(boxGeo, roadMat); road.position.set(x, 0.055, 0); road.scale.set(1.8, 0.04, 23.2); scene.add(road);
  }
  for (const z of [-8, -2, 4, 10]) {
    const road = new THREE.Mesh(boxGeo, roadMat); road.position.set(0, 0.056, z); road.scale.set(29.2, 0.04, 1.8); scene.add(road);
  }
  const markingMat = new THREE.MeshStandardMaterial({ color: 0xf0d47a, roughness: 1 });
  for (const z of [-8, -2, 4, 10]) for (const x of [-10, -4, 2, 8]) {
    const dash = new THREE.Mesh(boxGeo, markingMat); dash.position.set(x, 0.09, z); dash.scale.set(0.12, 0.025, 0.72); scene.add(dash);
  }

  // Raised white lots, colorful block buildings and steep charcoal roofs echo the cardboard model.
  const colors = [0xe86c37, 0xf0c928, 0x42b9cf, 0xe35674, 0xf18c54, 0x8bc653, 0xf1e2bb, 0x74a7d4];
  let n = 0;
  for (const x of [-7, -1, 5, 11]) for (const z of [-11, -5, 1, 7]) {
    if ((x === -1 && z === 1) || (x === 5 && z === 1) || (x === 11 && z === 7)) continue;
    const lot = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf4eddd }));
    lot.position.set(x, 0.15, z); lot.scale.set(4.8, 0.14, 4.8); lot.receiveShadow = true; scene.add(lot);
    const width = 2 + (n % 3) * 0.35;
    const depth = 2 + (n % 2) * 0.35;
    const height = 1.9 + (n % 4) * 0.45;
    const facade = mesh(boxGeo, colors[n % colors.length], x, 0.23 + height / 2, z, width, height, depth);
    scene.add(facade);
    const roof = mesh(new THREE.ConeGeometry(1, 1, 4), 0x292a2c, x, 0.23 + height + 0.5, z, width * 0.82, 1.1, depth * 0.82);
    roof.rotation.y = Math.PI / 4; scene.add(roof);
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x78d8e6, emissive: 0x25636c, emissiveIntensity: 0.22 });
    for (const side of [-1, 1]) {
      const window = new THREE.Mesh(boxGeo, windowMat);
      window.position.set(x + side * width * 0.25, 0.5 + height * 0.55, z - depth / 2 - 0.018);
      window.scale.set(0.42, 0.52, 0.035); scene.add(window);
    }
    if (n % 2 === 0) addTree(scene, x - 1.5, z + 1.5, n % 4 === 0);
    n++;
  }

  // Central turf courtyard, ringed with palms and a small fountain.
  const park = mesh(boxGeo, 0x56a94b, 2, 0.25, -2, 4.7, 0.24, 4.7); scene.add(park);
  for (const [x, z] of [[0.3, -3.8], [3.7, -3.8], [0.3, -0.2], [3.7, -0.2]] as const) addTree(scene, x, z, true);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.16, 24), new THREE.MeshStandardMaterial({ color: 0x74d5df, metalness: 0.2, roughness: 0.2 }));
  fountain.position.set(2, 0.48, -2); scene.add(fountain);

  // Street lamps add scale and recognizable campus detail.
  for (const [x, z] of [[-9, -2], [-3, 4], [3, -8], [9, 4], [-4, 10], [8, -8]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x303941, metalness: 0.5 }));
    pole.position.set(x, 0.85, z); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe6a1, emissive: 0xffcf63, emissiveIntensity: 0.6 }));
    lamp.position.set(x, 1.7, z); scene.add(lamp);
  }
}

export function CityScene3D({ bins, routes, trucks, onSelectBin }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<BinSummary | null>(null);
  const selectRef = useRef(onSelectBin);
  selectRef.current = onSelectBin;

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const scene = new THREE.Scene();
    buildMiniatureCity(scene);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    camera.position.set(25, 23, 30);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 15;
    controls.maxDistance = 52;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownAt: [number, number] | null = null;
    const markers = new Map<THREE.Object3D, BinSummary>();
    const markerRoots: THREE.Group[] = [];
    const point = (lat: number, lng: number) => new THREE.Vector3((lng - 77.4902) * 9000, 0, -(lat - 12.96045) * 9000);

    for (const bin of bins) {
      const p = point(bin.location.lat, bin.location.lng);
      const root = new THREE.Group(); root.position.copy(p); root.position.y = 0.15; root.userData.binId = bin.id;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.58), new THREE.MeshStandardMaterial({ color: 0xd5ddd5, roughness: 0.58, metalness: 0.12 }));
      body.position.y = 0.48; body.castShadow = true; body.userData.binId = bin.id; root.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.66), new THREE.MeshStandardMaterial({ color: 0x36443e, roughness: 0.45, metalness: 0.25 }));
      lid.position.y = 0.98; lid.userData.binId = bin.id; root.add(lid);
      const lightColor = bin.isOnline ? getFillColor(bin.fillPct) : '#71717a';
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), new THREE.MeshStandardMaterial({ color: lightColor, emissive: lightColor, emissiveIntensity: 1.1 }));
      led.position.set(0.18, 0.74, -0.3); led.userData.binId = bin.id; root.add(led);
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.04, 28), new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0.58 }));
      halo.position.y = 0.07; halo.userData.binId = bin.id; root.add(halo);
      root.traverse((child) => { if ((child as THREE.Mesh).isMesh) markers.set(child, bin); });
      markerRoots.push(root); scene.add(root);
    }

    // A compact service truck follows the active collection route.
    const activeRoute = routes.find(route => route.status !== 'completed' && route.stops.length > 1);
    if (activeRoute) {
      const path = activeRoute.stops.map(stop => point(stop.location.lat, stop.location.lng));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(p => p.clone().setY(0.16))), new THREE.LineDashedMaterial({ color: 0x245ce0, dashSize: 0.52, gapSize: 0.3, linewidth: 2 }));
      line.computeLineDistances(); scene.add(line);
    }
    const truck = trucks.find(item => item.status === 'en_route' || item.status === 'collecting') ?? trucks[0];
    if (truck) {
      const vehicle = new THREE.Group(); vehicle.position.copy(point(truck.position.lat, truck.position.lng)); vehicle.position.x += 1.35; vehicle.position.z -= 1.25; vehicle.position.y = 0.2;
      const cab = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf4f0df })); cab.position.set(0.28, 0.45, 0); cab.scale.set(0.65, 0.56, 0.74); vehicle.add(cab);
      const bed = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2f936b })); bed.position.set(-0.35, 0.42, 0); bed.scale.set(0.68, 0.5, 0.82); vehicle.add(bed);
      for (const x of [-0.55, -0.08, 0.18, 0.52]) for (const z of [-0.42, 0.42]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x202326 }));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.18, z); vehicle.add(wheel);
      }
      scene.add(vehicle);
    }

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const onMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerRoots, true).find(item => markers.has(item.object));
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      setHovered(hit ? markers.get(hit.object) ?? null : null);
    };
    const onPointerDown = (event: PointerEvent) => { pointerDownAt = [event.clientX, event.clientY]; };
    const onClick = (event: MouseEvent) => {
      const dragged = pointerDownAt && Math.hypot(event.clientX - pointerDownAt[0], event.clientY - pointerDownAt[1]) > 5;
      pointerDownAt = null;
      if (dragged) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerRoots, true).find(item => markers.has(item.object));
      if (hit) { const bin = markers.get(hit.object); if (bin) selectRef.current(bin); }
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('click', onClick);
    let frame = 0;
    let animation = 0;
    const render = () => { animation = requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); frame++; };
    render();

    return () => {
      cancelAnimationFrame(animation); observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      scene.traverse(object => {
        if ((object as THREE.Mesh).isMesh) {
          (object as THREE.Mesh).geometry.dispose();
          const material = (object as THREE.Mesh).material;
          (Array.isArray(material) ? material : [material]).forEach(item => item.dispose());
        }
      });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [bins, routes, trucks]);

  return <div ref={host} className="absolute inset-0" aria-label="Interactive 3D campus map" role="application">
    {hovered && <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-950/90 px-4 py-2 text-xs text-white shadow-xl backdrop-blur-xl">
      <span className="font-medium">{hovered.label}</span><span className="ml-3 font-mono" style={{ color: getFillColor(hovered.fillPct) }}>{hovered.fillPct}% full</span><span className="ml-3 text-zinc-400">Click to inspect</span>
    </div>}
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg bg-zinc-950/70 px-3 py-2 text-[10px] text-white/65 backdrop-blur">Drag to orbit · Scroll to zoom · Click a bin for live status</div>
  </div>;
}
