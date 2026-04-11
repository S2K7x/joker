/*
  Chicken Road — Three.js Game Engine
  Based on the Crossy-Road-style tutorial
*/

import * as THREE from "https://esm.sh/three";

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow  = maxTileIndex - minTileIndex + 1;
const tileSize     = 42;

/* ── Camera ── */
function Camera() {
  const size      = 300;
  const viewRatio = window.innerWidth / window.innerHeight;
  const width  = viewRatio < 1 ? size : size * viewRatio;
  const height = viewRatio < 1 ? size / viewRatio : size;

  const camera = new THREE.OrthographicCamera(
    width / -2, width / 2, height / 2, height / -2, 100, 900
  );
  camera.up.set(0, 0, 1);
  camera.position.set(300, -300, 300);
  camera.lookAt(0, 0, 0);
  return camera;
}

/* ── Textures ── */
function Texture(width, height, rects) {
  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  rects.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
  return new THREE.CanvasTexture(canvas);
}

const carFrontTexture     = new Texture(40, 80, [{ x: 0, y: 10, w: 30, h: 60 }]);
const carBackTexture      = new Texture(40, 80, [{ x: 10, y: 10, w: 30, h: 60 }]);
const carRightSideTexture = new Texture(110, 40, [{ x: 10, y: 0, w: 50, h: 30 }, { x: 70, y: 0, w: 30, h: 30 }]);
const carLeftSideTexture  = new Texture(110, 40, [{ x: 10, y: 10, w: 50, h: 30 }, { x: 70, y: 10, w: 30, h: 30 }]);

export const truckFrontTexture     = Texture(30, 30, [{ x: 5, y: 0, w: 10, h: 30 }]);
export const truckRightSideTexture = Texture(25, 30, [{ x: 15, y: 5, w: 10, h: 10 }]);
export const truckLeftSideTexture  = Texture(25, 30, [{ x: 15, y: 15, w: 10, h: 10 }]);

/* ── Car ── */
function Car(initialTileIndex, direction, color) {
  const car = new THREE.Group();
  car.position.x = initialTileIndex * tileSize;
  if (!direction) car.rotation.z = Math.PI;

  const main = new THREE.Mesh(
    new THREE.BoxGeometry(60, 30, 15),
    new THREE.MeshLambertMaterial({ color, flatShading: true })
  );
  main.position.z = 12;
  main.castShadow = main.receiveShadow = true;
  car.add(main);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(33, 24, 12), [
    new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carBackTexture }),
    new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carFrontTexture }),
    new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carRightSideTexture }),
    new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carLeftSideTexture }),
    new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
    new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
  ]);
  cabin.position.x = -6;
  cabin.position.z = 25.5;
  cabin.castShadow = cabin.receiveShadow = true;
  car.add(cabin);

  car.add(Wheel(18));
  car.add(Wheel(-18));
  return car;
}

/* ── Truck ── */
function Truck(initialTileIndex, direction, color) {
  const truck = new THREE.Group();
  truck.position.x = initialTileIndex * tileSize;
  if (!direction) truck.rotation.z = Math.PI;

  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(70, 35, 35),
    new THREE.MeshLambertMaterial({ color: 0xb4c6fc, flatShading: true })
  );
  cargo.position.x = -15;
  cargo.position.z = 25;
  cargo.castShadow = cargo.receiveShadow = true;
  truck.add(cargo);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), [
    new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckFrontTexture }),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
    new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckLeftSideTexture }),
    new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckRightSideTexture }),
    new THREE.MeshPhongMaterial({ color, flatShading: true }),
    new THREE.MeshPhongMaterial({ color, flatShading: true }),
  ]);
  cabin.position.x = 35;
  cabin.position.z = 20;
  cabin.castShadow = cabin.receiveShadow = true;
  truck.add(cabin);

  truck.add(Wheel(37));
  truck.add(Wheel(5));
  truck.add(Wheel(-35));
  return truck;
}

/* ── Wheel ── */
function Wheel(x) {
  const wheel = new THREE.Mesh(
    new THREE.BoxGeometry(12, 33, 12),
    new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true })
  );
  wheel.position.x = x;
  wheel.position.z = 6;
  return wheel;
}

/* ── Lights ── */
function DirectionalLight() {
  const dirLight = new THREE.DirectionalLight();
  dirLight.position.set(-100, -100, 200);
  dirLight.up.set(0, 0, 1);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width  = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.up.set(0, 0, 1);
  dirLight.shadow.camera.left   = -400;
  dirLight.shadow.camera.right  =  400;
  dirLight.shadow.camera.top    =  400;
  dirLight.shadow.camera.bottom = -400;
  dirLight.shadow.camera.near   =  50;
  dirLight.shadow.camera.far    =  400;
  return dirLight;
}

/* ── Terrain ── */
function Grass(rowIndex) {
  const grass = new THREE.Group();
  grass.position.y = rowIndex * tileSize;

  const createSection = color =>
    new THREE.Mesh(
      new THREE.BoxGeometry(tilesPerRow * tileSize, tileSize, 3),
      new THREE.MeshLambertMaterial({ color })
    );

  const middle = createSection(0xbaf455);
  middle.receiveShadow = true;
  grass.add(middle);

  const left = createSection(0x99c846);
  left.position.x = -tilesPerRow * tileSize;
  grass.add(left);

  const right = createSection(0x99c846);
  right.position.x = tilesPerRow * tileSize;
  grass.add(right);

  return grass;
}

function Road(rowIndex) {
  const road = new THREE.Group();
  road.position.y = rowIndex * tileSize;

  const createSection = color =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(tilesPerRow * tileSize, tileSize),
      new THREE.MeshLambertMaterial({ color })
    );

  const middle = createSection(0x454a59);
  middle.receiveShadow = true;
  road.add(middle);

  const left = createSection(0x393d49);
  left.position.x = -tilesPerRow * tileSize;
  road.add(left);

  const right = createSection(0x393d49);
  right.position.x = tilesPerRow * tileSize;
  road.add(right);

  return road;
}

function Tree(tileIndex, height) {
  const tree = new THREE.Group();
  tree.position.x = tileIndex * tileSize;

  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(15, 15, 20),
    new THREE.MeshLambertMaterial({ color: 0x4d2926, flatShading: true })
  );
  trunk.position.z = 10;
  tree.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(30, 30, height),
    new THREE.MeshLambertMaterial({ color: 0x7aa21d, flatShading: true })
  );
  crown.position.z = height / 2 + 20;
  crown.castShadow = crown.receiveShadow = true;
  tree.add(crown);

  return tree;
}

/* ── Map metadata ── */
const metadata = [];
const map      = new THREE.Group();

function initializeMap() {
  metadata.length = 0;
  map.remove(...map.children);
  for (let rowIndex = 0; rowIndex > -10; rowIndex--) {
    map.add(Grass(rowIndex));
  }
  addRows();
}

function addRows() {
  const newRows   = generateRows(20);
  const startIndex = metadata.length;
  metadata.push(...newRows);

  newRows.forEach((rowData, index) => {
    const rowIndex = startIndex + index + 1;

    if (rowData.type === 'forest') {
      const row = Grass(rowIndex);
      rowData.trees.forEach(({ tileIndex, height }) => row.add(Tree(tileIndex, height)));
      map.add(row);
    }

    if (rowData.type === 'car') {
      const row = Road(rowIndex);
      rowData.vehicles.forEach(v => {
        const car = Car(v.initialTileIndex, rowData.direction, v.color);
        v.ref = car;
        row.add(car);
      });
      map.add(row);
    }

    if (rowData.type === 'truck') {
      const row = Road(rowIndex);
      rowData.vehicles.forEach(v => {
        const truck = Truck(v.initialTileIndex, rowData.direction, v.color);
        v.ref = truck;
        row.add(truck);
      });
      map.add(row);
    }
  });
}

/* ── Row generators ── */
function generateRows(amount) {
  const rows = [];
  for (let i = 0; i < amount; i++) rows.push(generateRow());
  return rows;
}

function generateRow() {
  const type = randomElement(['car', 'truck', 'forest']);
  if (type === 'car')   return generateCarLaneMetadata();
  if (type === 'truck') return generateTruckLaneMetadata();
  return generateForestMetadata();
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateForestMetadata() {
  const occupied = new Set();
  const trees = Array.from({ length: 4 }, () => {
    let tileIndex;
    do { tileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex); }
    while (occupied.has(tileIndex));
    occupied.add(tileIndex);
    return { tileIndex, height: randomElement([20, 45, 60]) };
  });
  return { type: 'forest', trees };
}

function generateCarLaneMetadata() {
  const direction = randomElement([true, false]);
  const speed     = randomElement([125, 156, 188]);
  const occupied  = new Set();
  const vehicles  = Array.from({ length: 3 }, () => {
    let initialTileIndex;
    do { initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex); }
    while (occupied.has(initialTileIndex));
    occupied.add(initialTileIndex - 1);
    occupied.add(initialTileIndex);
    occupied.add(initialTileIndex + 1);
    return { initialTileIndex, color: randomElement([0xa52523, 0xbdb638, 0x78b14b]) };
  });
  return { type: 'car', direction, speed, vehicles };
}

function generateTruckLaneMetadata() {
  const direction = randomElement([true, false]);
  const speed     = randomElement([125, 156, 188]);
  const occupied  = new Set();
  const vehicles  = Array.from({ length: 2 }, () => {
    let initialTileIndex;
    do { initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex); }
    while (occupied.has(initialTileIndex));
    [-2,-1,0,1,2].forEach(o => occupied.add(initialTileIndex + o));
    return { initialTileIndex, color: randomElement([0xa52523, 0xbdb638, 0x78b14b]) };
  });
  return { type: 'truck', direction, speed, vehicles };
}

/* ── Player ── */
function Player() {
  const player = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(15, 15, 20),
    new THREE.MeshLambertMaterial({ color: 'white', flatShading: true })
  );
  body.position.z = 10;
  body.castShadow = body.receiveShadow = true;
  player.add(body);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(2, 4, 2),
    new THREE.MeshLambertMaterial({ color: 0xf0619a, flatShading: true })
  );
  cap.position.z = 21;
  cap.castShadow = cap.receiveShadow = true;
  player.add(cap);

  const container = new THREE.Group();
  container.add(player);
  return container;
}

const player = Player();

const position  = { currentRow: 0, currentTile: 0 };
const movesQueue = [];

function initializePlayer() {
  player.position.x = 0;
  player.position.y = 0;
  player.children[0].position.z = 0;
  position.currentRow  = 0;
  position.currentTile = 0;
  movesQueue.length = 0;
}

/* ── Move validation ── */
function calculateFinalPosition(currentPos, moves) {
  return moves.reduce((pos, dir) => {
    if (dir === 'forward')  return { rowIndex: pos.rowIndex + 1, tileIndex: pos.tileIndex };
    if (dir === 'backward') return { rowIndex: pos.rowIndex - 1, tileIndex: pos.tileIndex };
    if (dir === 'left')     return { rowIndex: pos.rowIndex, tileIndex: pos.tileIndex - 1 };
    if (dir === 'right')    return { rowIndex: pos.rowIndex, tileIndex: pos.tileIndex + 1 };
    return pos;
  }, currentPos);
}

function endsUpInValidPosition(currentPos, moves) {
  const final = calculateFinalPosition(currentPos, moves);
  if (final.rowIndex === -1 ||
      final.tileIndex === minTileIndex - 1 ||
      final.tileIndex === maxTileIndex + 1) return false;

  const finalRow = metadata[final.rowIndex - 1];
  if (finalRow && finalRow.type === 'forest' &&
      finalRow.trees.some(t => t.tileIndex === final.tileIndex)) return false;

  return true;
}

function queueMove(direction) {
  const valid = endsUpInValidPosition(
    { rowIndex: position.currentRow, tileIndex: position.currentTile },
    [...movesQueue, direction]
  );
  if (valid) movesQueue.push(direction);
}

/* ── Step animation ── */
const moveClock = new THREE.Clock(false);

function stepCompleted() {
  const dir = movesQueue.shift();
  if (dir === 'forward')  position.currentRow  += 1;
  if (dir === 'backward') position.currentRow  -= 1;
  if (dir === 'left')     position.currentTile -= 1;
  if (dir === 'right')    position.currentTile += 1;

  if (position.currentRow > metadata.length - 10) addRows();

  const scoreDOM = document.getElementById('score');
  if (scoreDOM) scoreDOM.innerText = position.currentRow.toString();
}

function animatePlayer() {
  if (!movesQueue.length) return;
  if (!moveClock.running) moveClock.start();

  const stepTime = 0.2;
  const progress = Math.min(1, moveClock.getElapsedTime() / stepTime);

  setPosition(progress);
  setRotation(progress);

  if (progress >= 1) {
    stepCompleted();
    moveClock.stop();
  }
}

function setPosition(progress) {
  const startX = position.currentTile * tileSize;
  const startY = position.currentRow  * tileSize;
  let endX = startX, endY = startY;

  if (movesQueue[0] === 'left')    endX -= tileSize;
  if (movesQueue[0] === 'right')   endX += tileSize;
  if (movesQueue[0] === 'forward') endY += tileSize;
  if (movesQueue[0] === 'backward') endY -= tileSize;

  player.position.x = THREE.MathUtils.lerp(startX, endX, progress);
  player.position.y = THREE.MathUtils.lerp(startY, endY, progress);
  player.children[0].position.z = Math.sin(progress * Math.PI) * 8;
}

function setRotation(progress) {
  let endRotation = 0;
  if (movesQueue[0] === 'forward')  endRotation = 0;
  if (movesQueue[0] === 'left')     endRotation =  Math.PI / 2;
  if (movesQueue[0] === 'right')    endRotation = -Math.PI / 2;
  if (movesQueue[0] === 'backward') endRotation =  Math.PI;

  player.children[0].rotation.z = THREE.MathUtils.lerp(
    player.children[0].rotation.z,
    endRotation,
    progress
  );
}

/* ── Vehicle animation ── */
const clock = new THREE.Clock();

function animateVehicles() {
  const delta = clock.getDelta();
  metadata.forEach(rowData => {
    if (rowData.type === 'car' || rowData.type === 'truck') {
      const beginningOfRow = (minTileIndex - 2) * tileSize;
      const endOfRow       = (maxTileIndex + 2) * tileSize;

      rowData.vehicles.forEach(({ ref }) => {
        if (!ref) throw Error('Vehicle ref missing');
        if (rowData.direction) {
          ref.position.x = ref.position.x > endOfRow       ? beginningOfRow : ref.position.x + rowData.speed * delta;
        } else {
          ref.position.x = ref.position.x < beginningOfRow ? endOfRow       : ref.position.x - rowData.speed * delta;
        }
      });
    }
  });
}

/* ── Hit detection ── */
let gameOverFired = false;

function hitTest() {
  if (gameOverFired) return;

  const row = metadata[position.currentRow - 1];
  if (!row) return;

  if (row.type === 'car' || row.type === 'truck') {
    const playerBox = new THREE.Box3().setFromObject(player);

    row.vehicles.forEach(({ ref }) => {
      if (!ref) throw Error('Vehicle ref missing');
      const vehicleBox = new THREE.Box3().setFromObject(ref);

      if (playerBox.intersectsBox(vehicleBox)) {
        gameOverFired = true;
        // Notify main script
        if (typeof window.onGameOver === 'function') {
          window.onGameOver(position.currentRow);
        }
      }
    });
  }
}

/* ── Scene setup ── */
const scene = new THREE.Scene();
scene.add(player);
scene.add(map);

const ambientLight = new THREE.AmbientLight();
scene.add(ambientLight);

const dirLight = DirectionalLight();
dirLight.target = player;
player.add(dirLight);

const camera = Camera();
player.add(camera);

/* ── Renderer ── */
let renderer = null;
let gameStarted = false;

function createRenderer() {
  const canvas = document.querySelector('canvas.game');
  if (!canvas) throw new Error('Canvas not found');
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
  r.setPixelRatio(window.devicePixelRatio);
  r.setSize(window.innerWidth, window.innerHeight);
  r.shadowMap.enabled = true;
  return r;
}

/* ── Main animate loop ── */
function animate() {
  animateVehicles();
  animatePlayer();
  hitTest();
  renderer.render(scene, camera);
}

/* ── Public API exposed to window ── */

// Called by script.js when the user submits their username
window._startThreeGame = function () {
  if (gameStarted) return;
  gameStarted = true;

  // Reset score display
  const scoreDOM = document.getElementById('score');
  if (scoreDOM) scoreDOM.innerText = '0';

  gameOverFired = false;
  renderer = createRenderer();
  initializePlayer();
  initializeMap();
  renderer.setAnimationLoop(animate);
};

// Called by script.js retry button
window._retryThreeGame = function () {
  gameOverFired = false;
  initializePlayer();
  initializeMap();

  const scoreDOM = document.getElementById('score');
  if (scoreDOM) scoreDOM.innerText = '0';
};

/* ── Input — keyboard ── */
window.addEventListener('keydown', event => {
  if (!gameStarted || gameOverFired) return;
  if (event.key === 'ArrowUp')    { event.preventDefault(); queueMove('forward'); }
  if (event.key === 'ArrowDown')  { event.preventDefault(); queueMove('backward'); }
  if (event.key === 'ArrowLeft')  { event.preventDefault(); queueMove('left'); }
  if (event.key === 'ArrowRight') { event.preventDefault(); queueMove('right'); }
});

/* ── Input — D-pad buttons ── */
document.getElementById('forward')  ?.addEventListener('click', () => { if (!gameOverFired) queueMove('forward');  });
document.getElementById('backward') ?.addEventListener('click', () => { if (!gameOverFired) queueMove('backward'); });
document.getElementById('left')     ?.addEventListener('click', () => { if (!gameOverFired) queueMove('left');     });
document.getElementById('right')    ?.addEventListener('click', () => { if (!gameOverFired) queueMove('right');    });

/* ── Resize handling ── */
window.addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
});
