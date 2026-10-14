import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BinSummary, CollectionRoute } from '@/types';
import { getFillColor } from '@/lib/calculations';
import { normalizeBinId } from '@/constants/hardware';

interface Props {
  bins: BinSummary[];
  routes: CollectionRoute[];
  trucks: { id: string; position: { lat: number; lng: number } }[];
  onSelectBin: (bin: BinSummary) => void;
}

const box = () => new THREE.BoxGeometry(1, 1, 1);
const paper = (color: THREE.ColorRepresentation, roughness = 0.96) =>
  new THREE.MeshStandardMaterial({ color, roughness });

function addBox(scene: THREE.Scene, color: THREE.ColorRepresentation, position: [number, number, number], size: [number, number, number], material?: THREE.Material) {
  const object = new THREE.Mesh(box(), material ?? paper(color));
  object.position.set(...position);
  object.scale.set(...size);
  object.castShadow = true;
  object.receiveShadow = true;
  scene.add(object);
  return object;
}

function addWindow(scene: THREE.Scene, x: number, y: number, z: number, width: number, height: number) {
  addBox(scene, 0x16191b, [x, y, z + 0.025], [width + 0.12, height + 0.12, 0.06]);
  addBox(scene, 0x62c5dd, [x, y, z + 0.061], [width, height, 0.025], new THREE.MeshStandardMaterial({ color: 0x62c5dd, roughness: 0.8, emissive: 0x06232c, emissiveIntensity: 0.15 }));
  addBox(scene, 0x25333a, [x, y, z + 0.078], [0.035, height, 0.025]);
  addBox(scene, 0x25333a, [x, y, z + 0.078], [width, 0.035, 0.025]);
}

interface House {
  x: number; z: number; width: number; depth: number; height: number;
  wall: number; roof: number; roofHeight: number; windows?: number;
  windowRows?: number;
  style?: 'gable' | 'flat' | 'stacked' | 'shop';
  otherWall?: number;
  gableColor?: number;
  paintedPalm?: boolean;
}

function addHouse(scene: THREE.Scene, house: House) {
  const { x, z, width: w, depth: d, height: h, wall, roof, roofHeight, style = 'gable' } = house;
  // Individual white card offcuts beneath each hand-built building.
  addBox(scene, 0xf1eadb, [x, 0.14, z], [w + 0.55, 0.16, d + 0.55]);
  if (style === 'stacked') {
  // The yellow home in the clip is a yellow cardboard body under a bright pink folded roof.
    const lower = h * 0.58, upper = h - lower;
    addBox(scene, wall, [x, 0.24 + lower / 2, z], [w, lower, d]);
    addBox(scene, house.otherWall ?? 0xe74783, [x, 0.24 + lower + upper / 2, z], [w * 0.96, upper, d * 0.96]);
    addBox(scene, 0x9b7956, [x, 0.24 + lower, z], [w * 0.99, 0.065, d * 0.99]);
  } else {
    addBox(scene, wall, [x, 0.24 + h / 2, z], [w, h, d]);
  }

  // Black marker-like vertical corner seams make the walls read as folded card.
  const seam = new THREE.MeshBasicMaterial({ color: 0x16191b, transparent: true, opacity: 0.38 });
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(box(), seam);
    edge.position.set(x + sx * (w / 2 - 0.035), 0.24 + h / 2, z + d / 2 + 0.025);
    edge.scale.set(0.055, h, 0.025);
    scene.add(edge);
  }

  if (style === 'flat' || style === 'stacked' || style === 'shop') {
    addBox(scene, roof, [x, 0.24 + h + 0.09, z], [w + 0.22, 0.18, d + 0.22]);
    if (style === 'shop') {
      // Small striped pink rooftop kiosk visible on the low black block in the video.
      const kiosk = addBox(scene, house.otherWall ?? 0xe33b78, [x + w * 0.2, 0.24 + h + 0.56, z + d * 0.12], [w * 0.38, 0.78, d * 0.42]);
      for (let row = 0; row < 3; row++) {
        addBox(scene, 0x272729, [x + w * 0.2, 0.24 + h + 0.32 + row * 0.21, z + d * 0.12 + d * 0.215], [w * 0.39, 0.055, 0.035]);
      }
      kiosk.castShadow = true;
    }
  } else {
    const slant = Math.hypot(w / 2, roofHeight);
    const tilt = Math.atan2(roofHeight, w / 2);
    const leftRoof = addBox(scene, roof, [x - w / 4, 0.24 + h + roofHeight / 2, z], [slant + 0.14, 0.12, d + 0.26]);
    leftRoof.rotation.z = tilt;
    const rightRoof = addBox(scene, roof, [x + w / 4, 0.24 + h + roofHeight / 2, z], [slant + 0.14, 0.12, d + 0.26]);
    rightRoof.rotation.z = -tilt;
    // Exposed triangular gable ends, like folded paper under a pitched roof.
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, roofHeight); shape.closePath();
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), paper(house.gableColor ?? wall));
      gable.position.set(x, 0.24 + h, z + side * (d / 2 - 0.005));
      gable.material.side = THREE.DoubleSide;
      scene.add(gable);
    }
    // Fold line on the roof ridge.
    addBox(scene, 0x242527, [x, 0.24 + h + roofHeight, z], [0.07, 0.075, d + 0.29]);
  }

  const columns = house.windows ?? 1;
  const rows = house.windowRows ?? 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const wx = x + (column - (columns - 1) / 2) * Math.min(0.95, w * 0.36);
      const windowY = 0.24 + h * (rows === 1 ? 0.53 : 0.3 + (rows - row - 1) * 0.38);
      addWindow(scene, wx, windowY, z + d / 2 + 0.025, Math.min(0.76, w * 0.26), Math.min(0.88, h * (rows === 1 ? 0.38 : 0.27)));
    }
  }
  if (house.paintedPalm) addPaintedPalm(scene, x, 0.24 + h * 0.48, z + d / 2 + 0.055);
}

function addPaintedPalm(scene: THREE.Scene, x: number, y: number, z: number) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#16895c'; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(146, 226); ctx.quadraticCurveTo(126, 146, 132, 77); ctx.stroke();
  ctx.strokeStyle = '#25a84f'; ctx.lineWidth = 12;
  for (let angle = -168; angle <= -12; angle += 26) {
    const radians = angle * Math.PI / 180;
    const ex = 132 + Math.cos(radians) * 91, ey = 78 + Math.sin(radians) * 75;
    ctx.beginPath(); ctx.moveTo(132, 82); ctx.quadraticCurveTo(132 + Math.cos(radians) * 46, 36 + Math.sin(radians) * 33, ex, ey); ctx.stroke();
    for (const t of [0.42, 0.62, 0.8]) {
      const px = 132 + (ex - 132) * t, py = 82 + (ey - 82) * t;
      const side = radians < -Math.PI / 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + side * 18, py + 8, px + side * 27, py + 18); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.42), new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide }));
  decal.position.set(x, y, z); scene.add(decal);
}

function addTower(scene: THREE.Scene, x: number, z: number) {
  const w = 4.15, d = 3.55, h = 4.6;
  addBox(scene, 0xf1eadb, [x, 0.14, z], [w + 0.55, 0.16, d + 0.55]);
  addBox(scene, 0x111315, [x, 0.24 + h / 2, z], [w, h, d]);
  // The flat charcoal top and two-by-three cyan window grid match the photo.
  addBox(scene, 0x222426, [x, 0.24 + h + 0.12, z], [w + 0.18, 0.24, d + 0.18]);
  // The distinctive black high-rise with hand-cut turquoise windows from the clip.
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    addWindow(scene, x - 0.92 + col * 1.66, 0.24 + 3.57 - row * 1.16, z + d / 2 + 0.028, 0.72, 0.82);
  }
}

function addPalm(scene: THREE.Scene, x: number, z: number, lean = 0.14) {
  const start = new THREE.Vector3(x, 0.28, z);
  const crown = new THREE.Vector3(x + lean, 2.45, z + 0.05);
  const trunkCurve = new THREE.QuadraticBezierCurve3(start, new THREE.Vector3(x + lean * 0.4, 1.3, z), crown);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 12, 0.085, 6, false), paper(0x9b5837)));
  // Flat, tapered fronds: bright plastic palm leaves rather than conical tree crowns.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const length = 1.05 + (i % 3) * 0.12;
    const dx = Math.cos(a), dz = Math.sin(a);
    const side = new THREE.Vector3(-dz, 0, dx);
    const positions: number[] = [];
    const uvs: number[] = [];
    const segments = 7;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const center = new THREE.Vector3(crown.x + dx * length * t, crown.y + 0.22 * Math.sin(t * Math.PI) - 0.56 * t * t, crown.z + dz * length * t);
      const halfWidth = Math.sin(t * Math.PI) * 0.16 + 0.006;
      const left = center.clone().addScaledVector(side, halfWidth);
      const right = center.clone().addScaledVector(side, -halfWidth);
      positions.push(left.x, left.y, left.z, center.x, center.y + 0.045, center.z, right.x, right.y, right.z);
      uvs.push(t, 0, t, 0.5, t, 1);
    }
    const indices: number[] = [];
    for (let j = 0; j < segments; j++) {
      const b = j * 3;
      indices.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: i % 2 ? 0x46cc22 : 0x70e72c, side: THREE.DoubleSide, roughness: 0.9 })));
  }
}

function addGrass(scene: THREE.Scene, x: number, z: number) {
  const w = 5.15, d = 4.45;
  addBox(scene, 0xf1eadb, [x, 0.14, z], [w + 0.4, 0.15, d + 0.4]);
  addBox(scene, 0x2d822c, [x, 0.24, z], [w, 0.12, d]);
  // A field of small instanced blades gives the cut-turf rectangle the texture visible in the video.
  const bladeGeometry = new THREE.PlaneGeometry(0.075, 0.26);
  bladeGeometry.translate(0, 0.13, 0);
  const blades = new THREE.InstancedMesh(bladeGeometry, new THREE.MeshStandardMaterial({ color: 0x55b83b, side: THREE.DoubleSide, roughness: 1 }), 820);
  const dummy = new THREE.Object3D();
  let seed = 6821;
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 820; i++) {
    dummy.position.set(x + (next() - 0.5) * (w - 0.12), 0.31, z + (next() - 0.5) * (d - 0.12));
    dummy.rotation.set((next() - 0.5) * 0.5, next() * Math.PI, (next() - 0.5) * 0.5);
    const scale = 0.55 + next() * 0.9;
    dummy.scale.setScalar(scale); dummy.updateMatrix(); blades.setMatrixAt(i, dummy.matrix);
  }
  blades.instanceMatrix.needsUpdate = true; blades.castShadow = true; scene.add(blades);
}

function addRoadNetwork(scene: THREE.Scene) {
  const asphalt = paper(0x292b2d, 1);
  const roadMark = paper(0xd8d3c7, 1);
  const roadY = 0.105;
  const eastWest = [-3.3, 3.2];
  const northSouth = [-7.6, 0.35];
  for (const z of eastWest) {
    addBox(scene, 0, [0, roadY, z], [30.1, 0.035, 1.35], asphalt);
    for (let x = -14.1; x <= 14.1; x += 1.75) {
      addBox(scene, 0, [x, 0.136, z], [0.72, 0.018, 0.08], roadMark);
    }
  }
  for (const x of northSouth) {
    addBox(scene, 0, [x, roadY, 0], [1.35, 0.035, 20.0], asphalt);
    for (let z = -9.25; z <= 9.25; z += 1.75) {
      addBox(scene, 0, [x, 0.136, z], [0.08, 0.018, 0.72], roadMark);
    }
  }
}

function makeCardTexture(text: string) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#cba879'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(86,58,31,.2)'; ctx.lineWidth = 1;
  for (let y = 7; y < 256; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  ctx.fillStyle = '#26231f'; ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 150);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addSmartBin(scene: THREE.Scene, bin: BinSummary | null, x: number, z: number, angle: number, label: string, hits: Map<THREE.Object3D, BinSummary>) {
  const root = new THREE.Group(); root.position.set(x, 0.2, z); root.rotation.y = angle;
  scene.add(root);
  // Small square sheet under each exposed prototype sensor bin.
  const pad = new THREE.Mesh(box(), paper(0xf4eddd)); pad.position.y = -0.09; pad.scale.set(2.2, 0.11, 2.05); root.add(pad);
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xc7a477, roughness: 1, map: makeCardTexture(label) });
  const body = new THREE.Mesh(box(), cardboard); body.position.y = 0.88; body.scale.set(1.18, 1.42, 1.02); body.castShadow = true; root.add(body);
  const front = new THREE.Mesh(box(), paper(0xd4b58b)); front.position.set(0, 0.89, 0.52); front.scale.set(1.12, 1.34, 0.035); root.add(front);
  // Folded top flap with the dark ventilation/barcode slits seen on the bins in the recording.
  const lid = new THREE.Mesh(box(), cardboard); lid.position.set(0, 1.63, 0); lid.scale.set(1.28, 0.13, 1.1); lid.castShadow = true; root.add(lid);
  for (let i = 0; i < 8; i++) {
    const slit = new THREE.Mesh(box(), new THREE.MeshStandardMaterial({ color: 0x282522, roughness: 1 }));
    slit.position.set(-0.49 + i * 0.14, 1.704, 0.06); slit.scale.set(0.045, 0.018, 0.72); root.add(slit);
  }
  // Corrugated exposed edge, tape seams and printed pencil-like marks.
  for (let i = 0; i < 12; i++) {
    const corrugation = new THREE.Mesh(box(), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xa98255 : 0xe1c499, roughness: 1 }));
    corrugation.position.set(-0.54 + i * 0.099, 1.54, 0.53); corrugation.scale.set(0.035, 0.12, 0.035); root.add(corrugation);
  }
  const tape = new THREE.Mesh(box(), new THREE.MeshStandardMaterial({ color: 0xe5c994, roughness: 1 }));
  tape.position.set(0.57, 0.9, 0.53); tape.scale.set(0.1, 1.28, 0.045); root.add(tape);
  // ESP32-style board, sensor module, chips, pin headers and a metal USB socket.
  const pcb = new THREE.Mesh(box(), new THREE.MeshStandardMaterial({ color: 0x173f70, roughness: 0.74, metalness: 0.12 }));
  pcb.position.set(-0.1, 1.79, -0.04); pcb.scale.set(0.5, 0.055, 0.34); root.add(pcb);
  const chip = new THREE.Mesh(box(), new THREE.MeshStandardMaterial({ color: 0x172025, roughness: 0.4, metalness: 0.15 }));
  chip.position.set(-0.07, 1.825, -0.04); chip.scale.set(0.17, 0.025, 0.17); root.add(chip);
  const usb = new THREE.Mesh(box(), new THREE.MeshStandardMaterial({ color: 0xbfc5c5, metalness: 0.78, roughness: 0.28 }));
  usb.position.set(0.12, 1.81, 0.19); usb.scale.set(0.2, 0.075, 0.13); root.add(usb);
  for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 5), new THREE.MeshStandardMaterial({ color: 0xd6bd63, metalness: 0.7, roughness: 0.32 }));
    pin.position.set(-0.29 + i * 0.063, 1.76, side * 0.17 - 0.04); root.add(pin);
  }
  const color = bin ? (bin.isOnline ? getFillColor(bin.fillPct) : '#62666a') : '#68c985';
  const ledMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), ledMaterial); led.position.set(0.39, 1.82, -0.11); root.add(led);
  const redLed = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), new THREE.MeshStandardMaterial({ color: 0xef4c40, emissive: 0x692017, emissiveIntensity: 0.8 }));
  redLed.position.set(0.43, 1.8, 0.04); root.add(redLed);

  // Loose rainbow jumper wires run from the cardboard shell onto the roadway.
  const wireColors = [0xe04f46, 0xf0c42b, 0x4da3d9, 0x45a969];
  wireColors.forEach((wireColor, i) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.51, 0.55 - i * 0.12, 0.2),
      new THREE.Vector3(1.05, 0.36 - i * 0.08, 0.48 + i * 0.08),
      new THREE.Vector3(1.75, 0.08, 0.72 + i * 0.1),
      new THREE.Vector3(2.42, 0.075, 0.35 + i * 0.17),
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.022, 5, false), new THREE.MeshStandardMaterial({ color: wireColor, roughness: 0.54 })));
  });
  if (bin) root.traverse(object => { if ((object as THREE.Mesh).isMesh) hits.set(object, bin); });
  return root;
}

// All object anchors share the board's own X/Z axes. Keeping the layout in this
// single frame prevents the building pads, streets, and sensor boxes from drifting.
function boardCoordinates(x: number, z: number): [number, number] {
  return [x, z];
}

function addMiniBench(scene: THREE.Scene, x: number, z: number) {
  const bench = new THREE.Group(); bench.position.set(x, 0.3, z);
  const red = paper(0x9c3028); const darkRed = paper(0x70251f);
  const seat = new THREE.Mesh(box(), red); seat.position.y = 0.42; seat.scale.set(1.05, 0.09, 0.32); bench.add(seat);
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(box(), i % 2 ? red : darkRed);
    slat.position.set(0, 0.62 + i * 0.075, -0.12); slat.scale.set(1.02, 0.055, 0.065); bench.add(slat);
  }
  for (const xx of [-0.42, 0.42]) {
    const leg = new THREE.Mesh(box(), darkRed); leg.position.set(xx, 0.23, 0); leg.scale.set(0.07, 0.43, 0.08); bench.add(leg);
  }
  scene.add(bench);
}

function buildDiorama(scene: THREE.Scene) {
  scene.background = new THREE.Color('#090d16');
  scene.add(new THREE.HemisphereLight(0xfff9e9, 0x81796c, 2.2));
  const key = new THREE.DirectionalLight(0xffe6c7, 2.7); key.position.set(-12, 23, 18); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -21; key.shadow.camera.right = 21; key.shadow.camera.top = 16; key.shadow.camera.bottom = -16; scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8ecff, 0.9); fill.position.set(14, 12, -12); scene.add(fill);

  // White foam-board tray, with only a thin pale-wood edge around the black road sheet.
  addBox(scene, 0xf0eee7, [0, -0.48, 0], [31.2, 0.78, 21.8]);
  addBox(scene, 0xe0d2bb, [0, -0.04, -10.78], [31.1, 0.42, 0.16]);
  addBox(scene, 0xe0d2bb, [0, -0.04, 10.78], [31.1, 0.42, 0.16]);
  addBox(scene, 0xe0d2bb, [-15.45, -0.04, 0], [0.16, 0.42, 21.4]);
  addBox(scene, 0xe0d2bb, [15.45, -0.04, 0], [0.16, 0.42, 21.4]);
  // Black road card runs beneath the irregular, individually cut white building pads.
  addBox(scene, 0x17191a, [0, 0.025, 0], [30.45, 0.12, 20.35]);
  addRoadNetwork(scene);

  const houseAt = (x: number, z: number, house: Omit<House, 'x' | 'z'>) => {
    const [boardX, boardZ] = boardCoordinates(x, z); addHouse(scene, { ...house, x: boardX, z: boardZ });
  };

  // Positions are measured from the supplied overhead photo: far edge at -Z,
  // near edge at +Z. Every building and sensor stays on the same board grid.
  houseAt(-9.3, -7.4, { width: 3.8, depth: 3.25, height: 2.5, wall: 0xf0d521, gableColor: 0xf0d521, roof: 0xe33b78, roofHeight: 1.3, windows: 0, paintedPalm: true });
  houseAt(-3.4, -7.5, { width: 3.35, depth: 3.05, height: 2.35, wall: 0xd785ac, roof: 0x222426, roofHeight: 0.35, style: 'flat', windows: 1 });
  addTower(scene, 4.8, -7.25);

  // The photo has two mid-row sensor cartons, a turf plot, then the orange home.
  houseAt(12.1, -0.35, { width: 4.0, depth: 3.55, height: 2.5, wall: 0xe96527, roof: 0xb39a7b, roofHeight: 1.65, windows: 1 });
  const [grassX, grassZ] = boardCoordinates(5.4, 0.0); addGrass(scene, grassX, grassZ);

  // One small palm separates each of the three visible clusters in the reference.
  for (const [x, z, lean] of [[-0.5, -7.6, -0.16], [-0.15, -0.05, 0.23], [2.8, 6.25, -0.12]] as const) {
    const [boardX, boardZ] = boardCoordinates(x, z); addPalm(scene, boardX, boardZ, lean);
  }

  houseAt(-4.5, 6.35, { width: 3.8, depth: 3.5, height: 2.5, wall: 0xc51d48, roof: 0x202224, roofHeight: 1.55, windows: 1 });
  houseAt(7.7, 6.25, { width: 5.4, depth: 3.9, height: 2.5, wall: 0x17191a, roof: 0x222426, roofHeight: 0.2, style: 'flat', windows: 1 });
  houseAt(13.0, 6.0, { width: 4.35, depth: 3.55, height: 2.5, wall: 0x16a9d1, roof: 0x222426, roofHeight: 1.25, windows: 1 });

  // The four cardboard sensor boxes are at the same four photographed spots.
  const prototypePads: [number, number][] = [[11.0, -7.4], [-12.25, -0.2], [-3.65, -0.15], [-13.0, 6.5]];
  const binAnchors = prototypePads.map(([x, z]) => boardCoordinates(x, z));
  return { binAnchors };
}

export function CityScene3D({ bins, routes, trucks: _trucks, onSelectBin }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<BinSummary | null>(null);
  const selectRef = useRef(onSelectBin);
  selectRef.current = onSelectBin;

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const scene = new THREE.Scene();
    const { binAnchors } = buildDiorama(scene);
    const camera = new THREE.OrthographicCamera(-16, 16, 13, -13, 0.1, 120);
    // A mild front-right angle shows the tower's second window face without skewing the plan.
    camera.position.set(8, 31, 38);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.8, 0); controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.48; controls.minZoom = 0.72; controls.maxZoom = 2.4;
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    let pointerDownAt: [number, number] | null = null;
    const hits = new Map<THREE.Object3D, BinSummary>(); const markerRoots: THREE.Group[] = [];
    const binAnchorsById = new Map<string, [number, number]>();
    const assignedBins = new Map<number, BinSummary>();
    bins.forEach((bin, index) => {
      // Stable hardware IDs map to fixed photographed positions; filters never move the model.
      const normalizedId = normalizeBinId(bin.id);
      const knownIndex = normalizedId ? Number(normalizedId.slice(-2)) - 1 : -1;
      let stableHash = 0;
      for (const character of bin.id) stableHash = (stableHash * 31 + character.charCodeAt(0)) | 0;
      const hashIndex = ((stableHash % binAnchors.length) + binAnchors.length) % binAnchors.length;
      let anchorIndex = knownIndex >= 0 && knownIndex < binAnchors.length ? knownIndex : hashIndex;
      for (let attempt = 0; assignedBins.has(anchorIndex) && attempt < binAnchors.length; attempt++) anchorIndex = (anchorIndex + 1) % binAnchors.length;
      const [x, z] = binAnchors[anchorIndex];
      assignedBins.set(anchorIndex, bin);
      binAnchorsById.set(bin.id, [x, z]);
      if (normalizedId) binAnchorsById.set(normalizedId, [x, z]);
    });
    const labels = ['RF02', 'RF', 'upain', 'input'];
    binAnchors.forEach(([x, z], index) => {
      const bin = assignedBins.get(index) ?? null;
      const root = addSmartBin(scene, bin, x, z, 0, labels[index], hits);
      if (bin) markerRoots.push(root);
    });

    // A fine blue route overlay stays understated so the handmade diorama remains the focus.
    const route = routes.find(item => item.status !== 'completed' && item.stops.length > 1);
    if (route) {
      const path = route.stops.flatMap(stop => {
        const anchor = binAnchorsById.get(stop.binId);
        return anchor ? [new THREE.Vector3(anchor[0], 0.12, anchor[1])] : [];
      });
      if (path.length > 1) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineDashedMaterial({ color: 0x3b76cf, dashSize: 0.36, gapSize: 0.26 }));
        line.computeLineDistances(); scene.add(line);
      }
    }

    const resize = () => {
      const width = container.clientWidth || 1; const height = container.clientHeight || 1;
      const aspect = width / height; const halfHeight = Math.max(11.8, 17.2 / aspect);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.updateProjectionMatrix(); renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const onMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerRoots, true).find(item => hits.has(item.object));
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      setHovered(hit ? hits.get(hit.object) ?? null : null);
    };
    const onPointerDown = (event: PointerEvent) => { pointerDownAt = [event.clientX, event.clientY]; };
    const onClick = (event: MouseEvent) => {
      const dragged = pointerDownAt && Math.hypot(event.clientX - pointerDownAt[0], event.clientY - pointerDownAt[1]) > 5;
      pointerDownAt = null; if (dragged) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerRoots, true).find(item => hits.has(item.object));
      if (hit) { const bin = hits.get(hit.object); if (bin) selectRef.current(bin); }
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('click', onClick);
    let animation = 0;
    const render = () => { animation = requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); };
    render();

    return () => {
      cancelAnimationFrame(animation); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('click', onClick);
      scene.traverse(object => {
        if ((object as THREE.Mesh).isMesh) {
          const rendered = object as THREE.Mesh; rendered.geometry.dispose();
          const materials = Array.isArray(rendered.material) ? rendered.material : [rendered.material];
          materials.forEach(material => { if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.dispose(); material.dispose(); });
        }
      });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [bins, routes]);

  return <div ref={host} className="absolute inset-0" aria-label="Interactive 3D model of the SmartBin campus prototype" role="application">
    {hovered && <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-950/90 px-4 py-2 text-xs text-white shadow-xl backdrop-blur-xl">
      <span className="font-medium">{hovered.label}</span><span className="ml-3 font-mono" style={{ color: getFillColor(hovered.fillPct) }}>{hovered.fillPct}% full</span><span className="ml-3 text-zinc-400">Click to inspect</span>
    </div>}
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg bg-zinc-950/70 px-3 py-2 text-[10px] text-white/65 backdrop-blur">Drag to orbit · Scroll to zoom · Click a cardboard bin for live status</div>
  </div>;
}
