import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import './styles.css';

function rectShape(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(1));
}

const level = {
  box: { cols: 5, rows: 5, cellSize: 0.62 },
  items: [
    { id: 'blue-large', label: '蓝块', shape: rectShape(2, 3), color: '#2367d9' },
    { id: 'red-large', label: '红块', shape: rectShape(3, 2), color: '#e63237' },
    { id: 'yellow-mid', label: '黄块', shape: rectShape(2, 2), color: '#f2d33c' },
    { id: 'green-mid', label: '绿块', shape: rectShape(2, 2), color: '#44c06a' },
    { id: 'purple-bar', label: '紫条', shape: rectShape(1, 3), color: '#9b6ce3' },
    { id: 'orange-small', label: '橙块', shape: rectShape(1, 2), color: '#f28b2e' }
  ]
};

const trayScale = 0.62;
const blockHeight = level.box.cellSize;
const itemHalfHeight = blockHeight / 2;
const traySlots = [
  [-1.55, 4.85],
  [0, 4.85],
  [1.55, 4.85]
];

const app = document.querySelector('#app');
app.innerHTML = `
  <canvas id="game"></canvas>
  <div class="topbar">
    <div>
      <strong>今日订单</strong>
      <span id="status">把所有物品装进箱子</span>
    </div>
    <button id="resetBtn" aria-label="重置">重置</button>
  </div>
  <button id="rotateBtn" class="rotate-btn" aria-label="旋转">↻</button>
  <div id="toast" class="toast">订单完成</div>
  <div id="orientationGate" class="orientation-gate">
    <div>
      <strong>请竖屏游玩</strong>
      <span>旋转 iPhone 后继续打包</span>
    </div>
  </div>
`;

const cameraPanel = document.createElement('aside');
cameraPanel.className = 'camera-panel';
cameraPanel.innerHTML = `
  <div class="camera-panel__head">
    <strong>Camera</strong>
    <button id="cameraResetBtn" type="button">重置</button>
  </div>
  <label class="camera-mode">
    <span>mode</span>
    <select id="cameraModeSelect">
      <option value="perspective">透视</option>
      <option value="orthographic">正交</option>
    </select>
  </label>
  <div class="camera-grid" id="cameraControls"></div>
`;
document.body.appendChild(cameraPanel);

const lightPanel = document.createElement('aside');
lightPanel.className = 'camera-panel light-panel';
lightPanel.innerHTML = `
  <div class="camera-panel__head">
    <strong>Light</strong>
    <button id="lightResetBtn" type="button">重置</button>
  </div>
  <div class="camera-grid" id="lightControls"></div>
`;
document.body.appendChild(lightPanel);

const tablePanel = document.createElement('aside');
tablePanel.className = 'camera-panel table-panel';
tablePanel.innerHTML = `
  <div class="camera-panel__head">
    <strong>Table</strong>
    <button id="tableResetBtn" type="button">重置</button>
  </div>
  <div class="camera-grid" id="tableControls"></div>
`;
document.body.appendChild(tablePanel);

const canvas = document.querySelector('#game');
const statusEl = document.querySelector('#status');
const toastEl = document.querySelector('#toast');
const rotateBtn = document.querySelector('#rotateBtn');
const resetBtn = document.querySelector('#resetBtn');
const cameraControlsEl = document.querySelector('#cameraControls');
const cameraResetBtn = document.querySelector('#cameraResetBtn');
const cameraModeSelect = document.querySelector('#cameraModeSelect');
const lightControlsEl = document.querySelector('#lightControls');
const lightResetBtn = document.querySelector('#lightResetBtn');
const tableControlsEl = document.querySelector('#tableControls');
const tableResetBtn = document.querySelector('#tableResetBtn');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6efe4');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const perspectiveCamera = new THREE.PerspectiveCamera(36, 390 / 844, 0.1, 100);
const orthographicCamera = new THREE.OrthographicCamera(-2.92, 2.92, 6.1, -6.1, 0.1, 100);
let camera = perspectiveCamera;
const defaultCameraRig = {
  mode: 'perspective',
  x: 0,
  y: 12,
  z: 7.4,
  targetX: 0,
  targetY: 0.7,
  targetZ: 0,
  distance: 15.4,
  screenX: 0,
  screenY: 1.35,
  fov: 45,
  orthoSize: 13
};
const cameraRig = { ...defaultCameraRig };
camera.position.set(cameraRig.x, cameraRig.y, cameraRig.z);
camera.lookAt(cameraRig.targetX, cameraRig.targetY, cameraRig.targetZ);

const ambient = new THREE.HemisphereLight('#ffffff', '#c8b7a0', 2.1);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight('#ffffff', 2.6);
keyLight.position.set(2.5, 8, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const defaultLightRig = {
  keyX: -1,
  keyY: 8,
  keyZ: -1.2,
  keyIntensity: 2.6,
  ambientIntensity: 2.1,
  shadowIntensity: 0.42
};
const lightRig = { ...defaultLightRig };

const defaultTableRig = {
  width: 9.6,
  depth: 18,
  thickness: 0.12,
  x: 0,
  y: -0.22,
  z: -0.65
};
const tableRig = { ...defaultTableRig };

const boardGroup = new THREE.Group();
const trayGroup = new THREE.Group();
const itemGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
const gridGuideGroup = new THREE.Group();
scene.add(boardGroup, trayGroup, ghostGroup, itemGroup);

const grid = {
  cols: level.box.cols,
  rows: level.box.rows,
  cell: level.box.cellSize,
  levels: 3,
  levelHeight: 0.46,
  width: level.box.cols * level.box.cellSize,
  depth: level.box.rows * level.box.cellSize
};
grid.left = -grid.width / 2;
grid.top = -grid.depth / 2;
grid.wallHeight = grid.levels * grid.levelHeight;
grid.pickupHeight = grid.wallHeight + 0.7;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let items = [];
let trayQueue = [];
let activeItem = null;
let dragOffset = new THREE.Vector3();
let candidate = null;
let completionShown = false;
let tableMesh = null;

initBoard();
initTray();
initItems();
initCameraPanel();
initLightPanel();
initTablePanel();
resize();
animate();

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
window.visualViewport?.addEventListener('resize', resize);
window.visualViewport?.addEventListener('scroll', resize);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
rotateBtn.addEventListener('click', rotateActiveOrLast);
resetBtn.addEventListener('click', resetLevel);
cameraResetBtn.addEventListener('click', resetCameraRig);
cameraModeSelect.addEventListener('change', () => {
  cameraRig.mode = cameraModeSelect.value;
  applyCameraRig();
});
lightResetBtn.addEventListener('click', resetLightRig);
tableResetBtn.addEventListener('click', resetTableRig);

function initBoard() {
  const wallThickness = 0.08;
  const wallOffset = 0.055;
  const wallY = grid.wallHeight / 2;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.08, 0.18, grid.depth + 0.08),
    new THREE.MeshStandardMaterial({ color: '#df9341', roughness: 0.84 })
  );
  floor.position.y = -0.11;
  floor.receiveShadow = true;
  boardGroup.add(floor);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width, 0.08, grid.depth),
    new THREE.MeshStandardMaterial({ color: '#f1b56d', roughness: 0.9 })
  );
  base.position.y = 0.015;
  base.receiveShadow = true;
  boardGroup.add(base);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#e69a46', roughness: 0.86 });
  addWall(0, wallY, grid.top - wallOffset, grid.width + 0.14, grid.wallHeight, wallThickness, wallMat);
  addWall(grid.left - wallOffset, wallY, 0, wallThickness, grid.wallHeight, grid.depth + 0.14, wallMat);
  addWall(-grid.left + wallOffset, wallY, 0, wallThickness, grid.wallHeight, grid.depth + 0.14, wallMat);

  boardGroup.add(gridGuideGroup);
  gridGuideGroup.visible = true;
  const lineMat = new THREE.LineBasicMaterial({ color: '#b86b2d', transparent: true, opacity: 0.82 });
  for (let c = 0; c <= grid.cols; c += 1) {
    const x = grid.left + c * grid.cell;
    addLine(x, grid.top, x, grid.top + grid.depth, lineMat);
  }
  for (let r = 0; r <= grid.rows; r += 1) {
    const z = grid.top + r * grid.cell;
    addLine(grid.left, z, grid.left + grid.width, z, lineMat);
  }

  tableMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#eadac7', roughness: 0.9 })
  );
  tableMesh.receiveShadow = true;
  scene.add(tableMesh);
  tableMesh.renderOrder = -1;
  applyTableRig();
}

function initTray() {
  trayGroup.clear();
}

function addTrayWall(x, y, z, w, h, d, mat) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  wall.position.set(x, y, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  trayGroup.add(wall);
}

function addTrayLine(x1, z1, x2, z2, mat) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, 0.04, z1),
    new THREE.Vector3(x2, 0.04, z2)
  ]);
  trayGroup.add(new THREE.Line(geo, mat));
}

function addWall(x, y, z, w, h, d, mat) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  wall.position.set(x, y, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  boardGroup.add(wall);
}

function addLine(x1, z1, x2, z2, mat) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, 0.075, z1),
    new THREE.Vector3(x2, 0.075, z2)
  ]);
  gridGuideGroup.add(new THREE.Line(geo, mat));
}

function initItems() {
  items = level.items.map((data) => {
    const item = {
      ...data,
      rotation: 0,
      placed: false,
      gridX: null,
      gridY: null,
      lastValid: null,
      mesh: createItemMesh(data)
    };
    item.mesh.userData.item = item;
    item.mesh.scale.setScalar(trayScale);
    itemGroup.add(item.mesh);
    return item;
  });
  trayQueue = [...items];
  layoutTrayQueue();
  refreshStatus();
}

function createItemMesh(item) {
  const group = new THREE.Group();
  const width = item.shape[0].length * grid.cell - 0.08;
  const depth = item.shape.length * grid.cell - 0.08;
  const material = new THREE.MeshStandardMaterial({
    color: item.color,
    roughness: 0.54,
    metalness: 0.015
  });
  const block = new THREE.Mesh(
    new RoundedBoxGeometry(width, blockHeight, depth, 6, 0.08),
    material
  );
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);

  return group;
}

function getShapeCells(shape) {
  const cells = [];
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (shape[y][x]) cells.push({ x, y });
    }
  }
  return cells;
}

function rotateShape(shape, turns) {
  let result = shape.map((row) => [...row]);
  for (let i = 0; i < turns % 4; i += 1) {
    const rows = result.length;
    const cols = result[0].length;
    const next = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) next[x][rows - y - 1] = result[y][x];
    }
    result = next;
  }
  return result;
}

function onPointerDown(event) {
  const picked = pickItem(event);
  if (!picked) return;
  event.preventDefault();
  activeItem = picked;
  activeItem.mesh.scale.setScalar(1.06);
  activeItem.mesh.position.y = grid.pickupHeight;
  activeItem.placed = false;
  canvas.setPointerCapture(event.pointerId);
  updatePointer(event);
  dragPlane.constant = -grid.pickupHeight;
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  dragOffset.copy(activeItem.mesh.position).sub(hitPoint);
  dragOffset.y = 0;
  gridGuideGroup.visible = true;
  updateGhost(null);
}

function onPointerMove(event) {
  if (!activeItem) return;
  event.preventDefault();
  updatePointer(event);
  if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
  activeItem.mesh.position.x = hitPoint.x + dragOffset.x;
  activeItem.mesh.position.z = hitPoint.z + dragOffset.z;
  candidate = getCandidate(activeItem, activeItem.mesh.position);
  updateGhost(candidate);
}

function onPointerUp(event) {
  if (!activeItem) return;
  event.preventDefault();
  canvas.releasePointerCapture(event.pointerId);
  if (candidate?.valid) {
    placeItem(activeItem, candidate);
  } else if (candidate?.inside) {
    activeItem.mesh.position.copy(activeItem.homePosition);
    activeItem.mesh.position.y = getTableItemY(trayScale);
    activeItem.mesh.scale.setScalar(trayScale);
    activeItem.placed = false;
  } else {
    activeItem.mesh.position.copy(activeItem.homePosition);
    activeItem.mesh.position.y = getTableItemY(trayScale);
    activeItem.mesh.scale.setScalar(trayScale);
    activeItem.placed = false;
  }
  if (activeItem.placed) activeItem.mesh.scale.setScalar(1);
  activeItem = null;
  candidate = null;
  updateGhost(null);
  refreshStatus();
}

function pickItem(event) {
  updatePointer(event);
  const intersects = raycaster.intersectObjects(itemGroup.children, true);
  const hit = intersects.find((entry) => findItemRoot(entry.object));
  return hit ? findItemRoot(hit.object).userData.item : null;
}

function findItemRoot(object) {
  let current = object;
  while (current && current.parent !== itemGroup) current = current.parent;
  return current?.parent === itemGroup ? current : null;
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function getCandidate(item, worldPosition) {
  const shape = rotateShape(item.shape, item.rotation);
  const cols = shape[0].length;
  const rows = shape.length;
  const localX = worldPosition.x - grid.left;
  const localZ = worldPosition.z - grid.top;
  const gx = Math.round(localX / grid.cell - cols / 2);
  const gy = Math.round(localZ / grid.cell - rows / 2);
  const inside = worldPosition.x >= grid.left - 0.8 && worldPosition.x <= -grid.left + 0.8
    && worldPosition.z >= grid.top - 0.8 && worldPosition.z <= -grid.top + 0.8;
  const valid = canPlace(item, gx, gy, shape);
  return { gx, gy, shape, valid, inside };
}

function canPlace(item, gx, gy, shape) {
  const occupied = buildOccupied(item);
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const cx = gx + x;
      const cy = gy + y;
      if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return false;
      if (occupied.has(`${cx},${cy}`)) return false;
    }
  }
  return true;
}

function buildOccupied(exceptItem = null) {
  const occupied = new Set();
  for (const item of items) {
    if (item === exceptItem || !item.placed) continue;
    const shape = rotateShape(item.shape, item.rotation);
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (shape[y][x]) occupied.add(`${item.gridX + x},${item.gridY + y}`);
      }
    }
  }
  return occupied;
}

function placeItem(item, next) {
  item.gridX = next.gx;
  item.gridY = next.gy;
  item.placed = true;
  trayQueue = trayQueue.filter((entry) => entry !== item);
  item.mesh.position.copy(gridToWorld(next.gx, next.gy, next.shape));
  item.mesh.position.y = getBoardItemY();
  item.mesh.scale.setScalar(1);
  item.lastValid = { gx: next.gx, gy: next.gy, rotation: item.rotation };
  layoutTrayQueue();
}

function gridToWorld(gx, gy, shape) {
  const cols = shape[0].length;
  const rows = shape.length;
  return new THREE.Vector3(
    grid.left + (gx + cols / 2) * grid.cell,
    0,
    grid.top + (gy + rows / 2) * grid.cell
  );
}

function updateGhost(next) {
  ghostGroup.clear();
  if (!next?.inside) return;
  const mat = new THREE.MeshBasicMaterial({
    color: next.valid ? '#4cd137' : '#ff4757',
    transparent: true,
    opacity: 0.34,
    depthWrite: false
  });
  for (let y = 0; y < next.shape.length; y += 1) {
    for (let x = 0; x < next.shape[y].length; x += 1) {
      if (!next.shape[y][x]) continue;
      const cell = new THREE.Mesh(new THREE.BoxGeometry(grid.cell * 0.9, 0.035, grid.cell * 0.9), mat);
      cell.position.set(
        grid.left + (next.gx + x + 0.5) * grid.cell,
        0.12,
        grid.top + (next.gy + y + 0.5) * grid.cell
      );
      ghostGroup.add(cell);
    }
  }
}

function rotateActiveOrLast() {
  const item = activeItem || items.find((entry) => entry.placed && entry.lastValid);
  if (!item) return;
  const previous = item.rotation;
  item.rotation = (item.rotation + 1) % 4;
  item.mesh.rotation.y = -item.rotation * Math.PI / 2;

  if (activeItem) {
    candidate = getCandidate(item, item.mesh.position);
    updateGhost(candidate);
    return;
  }

  const shape = rotateShape(item.shape, item.rotation);
  if (canPlace(item, item.gridX, item.gridY, shape)) {
    item.mesh.position.copy(gridToWorld(item.gridX, item.gridY, shape));
    item.mesh.position.y = getBoardItemY();
    refreshStatus();
  } else {
    item.rotation = previous;
    item.mesh.rotation.y = -item.rotation * Math.PI / 2;
  }
}

function resetLevel() {
  completionShown = false;
  toastEl.classList.remove('show');
  trayQueue = [...items];
  for (const item of items) {
    item.rotation = 0;
    item.placed = false;
    item.gridX = null;
    item.gridY = null;
    item.lastValid = null;
    item.mesh.rotation.y = 0;
    item.mesh.visible = true;
    item.mesh.scale.setScalar(trayScale);
  }
  layoutTrayQueue();
  gridGuideGroup.visible = true;
  refreshStatus();
}

function layoutTrayQueue() {
  trayQueue.forEach((item, index) => {
    const visibleInTray = index < traySlots.length;
    item.mesh.visible = visibleInTray;
    if (!visibleInTray) return;

    const slot = traySlots[index];
    item.homePosition = new THREE.Vector3(slot[0], getTableItemY(trayScale), slot[1]);
    if (!item.placed && item !== activeItem) {
      item.mesh.position.copy(item.homePosition);
      item.mesh.position.y = getTableItemY(trayScale);
      item.mesh.scale.setScalar(trayScale);
    }
  });
}

function refreshStatus() {
  const placed = items.filter((item) => item.placed).length;
  statusEl.textContent = `${placed}/${items.length} 件已入箱`;
  if (placed === items.length && !completionShown) {
    completionShown = true;
    toastEl.classList.add('show');
  }
}

function initLightPanel() {
  const controls = [
    { key: 'keyX', label: 'key x', min: -10, max: 10, step: 0.1 },
    { key: 'keyY', label: 'key y', min: 1, max: 16, step: 0.1 },
    { key: 'keyZ', label: 'key z', min: -10, max: 10, step: 0.1 },
    { key: 'keyIntensity', label: 'key power', min: 0, max: 6, step: 0.1 },
    { key: 'ambientIntensity', label: 'ambient', min: 0, max: 5, step: 0.1 },
    { key: 'shadowIntensity', label: 'shadow', min: 0, max: 1, step: 0.01 }
  ];

  lightControlsEl.innerHTML = controls.map((control) => `
    <label class="camera-control">
      <span>${control.label}</span>
      <input
        data-light-key="${control.key}"
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="${lightRig[control.key]}"
      />
      <output data-light-output="${control.key}">${formatCameraValue(lightRig[control.key])}</output>
    </label>
  `).join('');

  lightControlsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-light-key]');
    if (!input) return;
    const key = input.dataset.lightKey;
    lightRig[key] = Number(input.value);
    syncLightPanelValue(key);
    applyLightRig();
  });

  applyLightRig();
}

function resetLightRig() {
  Object.assign(lightRig, defaultLightRig);
  for (const input of lightControlsEl.querySelectorAll('[data-light-key]')) {
    const key = input.dataset.lightKey;
    input.value = lightRig[key];
    syncLightPanelValue(key);
  }
  applyLightRig();
}

function syncLightPanelValue(key) {
  const output = lightControlsEl.querySelector(`[data-light-output="${key}"]`);
  if (output) output.textContent = formatCameraValue(lightRig[key]);
}

function applyLightRig() {
  keyLight.position.set(lightRig.keyX, lightRig.keyY, lightRig.keyZ);
  keyLight.intensity = lightRig.keyIntensity;
  keyLight.shadow.intensity = lightRig.shadowIntensity;
  ambient.intensity = lightRig.ambientIntensity;
}

function initTablePanel() {
  const controls = [
    { key: 'width', label: 'width', min: 3, max: 12, step: 0.1 },
    { key: 'depth', label: 'depth', min: 6, max: 24, step: 0.1 },
    { key: 'thickness', label: 'thick', min: 0.04, max: 0.5, step: 0.01 },
    { key: 'x', label: 'pos x', min: -4, max: 4, step: 0.05 },
    { key: 'y', label: 'pos y', min: -1, max: 0.5, step: 0.01 },
    { key: 'z', label: 'pos z', min: -3, max: 5, step: 0.05 }
  ];

  tableControlsEl.innerHTML = controls.map((control) => `
    <label class="camera-control">
      <span>${control.label}</span>
      <input
        data-table-key="${control.key}"
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="${tableRig[control.key]}"
      />
      <output data-table-output="${control.key}">${formatCameraValue(tableRig[control.key])}</output>
    </label>
  `).join('');

  tableControlsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-table-key]');
    if (!input) return;
    const key = input.dataset.tableKey;
    tableRig[key] = Number(input.value);
    syncTablePanelValue(key);
    applyTableRig();
  });

  applyTableRig();
}

function resetTableRig() {
  Object.assign(tableRig, defaultTableRig);
  for (const input of tableControlsEl.querySelectorAll('[data-table-key]')) {
    const key = input.dataset.tableKey;
    input.value = tableRig[key];
    syncTablePanelValue(key);
  }
  applyTableRig();
}

function syncTablePanelValue(key) {
  const output = tableControlsEl.querySelector(`[data-table-output="${key}"]`);
  if (output) output.textContent = formatCameraValue(tableRig[key]);
}

function applyTableRig() {
  if (!tableMesh) return;
  tableMesh.scale.set(tableRig.width, tableRig.thickness, tableRig.depth);
  tableMesh.position.set(tableRig.x, tableRig.y, tableRig.z);
  if (items.length) layoutTrayQueue();
}

function getBoardSurfaceY() {
  return 0.015 + 0.04;
}

function getBoardItemY(scale = 1) {
  return getBoardSurfaceY() + itemHalfHeight * scale + 0.01;
}

function getTableSurfaceY() {
  return tableRig.y + tableRig.thickness / 2;
}

function getTableItemY(scale = 1) {
  return getTableSurfaceY() + itemHalfHeight * scale + 0.01;
}

function initCameraPanel() {
  const controls = [
    { key: 'x', label: 'pos x', min: -8, max: 8, step: 0.1 },
    { key: 'y', label: 'pos y', min: 2, max: 14, step: 0.1 },
    { key: 'z', label: 'pos z', min: -2, max: 14, step: 0.1 },
    { key: 'targetX', label: 'look x', min: -4, max: 4, step: 0.05 },
    { key: 'targetY', label: 'look y', min: -1, max: 4, step: 0.05 },
    { key: 'targetZ', label: 'look z', min: -3, max: 6, step: 0.05 },
    { key: 'distance', label: 'distance', min: 4, max: 24, step: 0.1 },
    { key: 'screenX', label: 'screen x', min: -4, max: 4, step: 0.05 },
    { key: 'screenY', label: 'screen y', min: -4, max: 4, step: 0.05 },
    { key: 'fov', label: 'fov', min: 22, max: 62, step: 1 },
    { key: 'orthoSize', label: 'ortho size', min: 7, max: 18, step: 0.1 }
  ];

  cameraControlsEl.innerHTML = controls.map((control) => `
    <label class="camera-control">
      <span>${control.label}</span>
      <input
        data-camera-key="${control.key}"
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="${cameraRig[control.key]}"
      />
      <output data-camera-output="${control.key}">${formatCameraValue(cameraRig[control.key])}</output>
    </label>
  `).join('');

  cameraControlsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-camera-key]');
    if (!input) return;
    const key = input.dataset.cameraKey;
    cameraRig[key] = Number(input.value);
    syncCameraPanelValue(key);
    applyCameraRig();
  });
}

function resetCameraRig() {
  Object.assign(cameraRig, defaultCameraRig);
  cameraModeSelect.value = cameraRig.mode;
  for (const input of cameraControlsEl.querySelectorAll('[data-camera-key]')) {
    const key = input.dataset.cameraKey;
    input.value = cameraRig[key];
    syncCameraPanelValue(key);
  }
  applyCameraRig();
}

function syncCameraPanelValue(key) {
  const output = cameraControlsEl.querySelector(`[data-camera-output="${key}"]`);
  if (output) output.textContent = formatCameraValue(cameraRig[key]);
}

function formatCameraValue(value) {
  return Number(value).toFixed(2);
}

function applyCameraRig() {
  const appRect = app.getBoundingClientRect();
  const width = Math.max(1, Math.round(appRect.width));
  const height = Math.max(1, Math.round(appRect.height));
  const aspect = width / height;
  camera = cameraRig.mode === 'orthographic' ? orthographicCamera : perspectiveCamera;

  perspectiveCamera.aspect = aspect;
  perspectiveCamera.fov = cameraRig.fov;

  const orthoHeight = cameraRig.orthoSize;
  orthographicCamera.top = orthoHeight / 2;
  orthographicCamera.bottom = -orthoHeight / 2;
  orthographicCamera.left = -orthoHeight * aspect / 2;
  orthographicCamera.right = orthoHeight * aspect / 2;

  const baseTarget = new THREE.Vector3(cameraRig.targetX, cameraRig.targetY, cameraRig.targetZ);
  const directionAnchor = new THREE.Vector3(cameraRig.x, cameraRig.y, cameraRig.z);
  const viewDirection = directionAnchor.sub(baseTarget).normalize();
  const basePosition = baseTarget.clone().addScaledVector(viewDirection, cameraRig.distance);
  camera.position.copy(basePosition);
  camera.lookAt(baseTarget);
  camera.updateMatrixWorld();

  const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const screenPan = new THREE.Vector3()
    .addScaledVector(screenRight, -cameraRig.screenX)
    .addScaledVector(screenUp, -cameraRig.screenY);

  camera.position.copy(basePosition).add(screenPan);
  camera.lookAt(baseTarget.add(screenPan));
  camera.updateProjectionMatrix();
}

function resize() {
  const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
  const appRect = app.getBoundingClientRect();
  const width = Math.max(1, Math.round(appRect.width));
  const height = Math.max(1, Math.round(appRect.height));
  renderer.setSize(width, height, false);
  applyCameraRig();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
