import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import './styles.css';

function rectShape(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(1));
}

const level = {
  box: { cols: 5, rows: 5, cellSize: 0.78 },
  items: [
    { id: 'blue-large', label: '蓝块', shape: rectShape(2, 3), color: '#2367d9' },
    { id: 'red-large', label: '红块', shape: rectShape(3, 2), color: '#e63237' },
    { id: 'yellow-mid', label: '黄块', shape: rectShape(2, 2), color: '#f2d33c' },
    { id: 'green-mid', label: '绿块', shape: rectShape(2, 2), color: '#44c06a' },
    { id: 'purple-bar', label: '紫条', shape: rectShape(1, 3), color: '#9b6ce3' },
    { id: 'orange-small', label: '橙块', shape: rectShape(1, 2), color: '#f28b2e' }
  ]
};

const itemCellSize = 0.78;
const trayScale = 0.8;
const blockHeight = itemCellSize;
const itemHalfHeight = blockHeight / 2;
const trayVisibleCount = 3;
const traySlotXs = [-1.55, 0, 1.55];
const trayMinGap = 0.24;
const trayZ = 4.85;
const trayEntryOffsetX = 1.15;
const trayLerpAlpha = 0.18;
const rotationLerpAlpha = 0.12;

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
  z: 5,
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
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 24;
scene.add(keyLight);

const defaultLightRig = {
  keyX: -1,
  keyY: 8,
  keyZ: -1.2,
  keyIntensity: 1.5,
  ambientIntensity: 2,
  shadowIntensity: 0.3
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
const gridHeightGuideGroup = new THREE.Group();
scene.add(boardGroup, trayGroup, ghostGroup, itemGroup);

const grid = {
  cols: level.box.cols,
  rows: level.box.rows,
  cell: level.box.cellSize,
  levels: 1,
  levelHeight: itemCellSize,
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
  gridGuideGroup.add(gridHeightGuideGroup);
  hideGridGuide();
  const guideFill = new THREE.Mesh(
    new THREE.PlaneGeometry(grid.width, grid.depth),
    new THREE.MeshBasicMaterial({
      color: '#9ca3af',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  guideFill.rotation.x = -Math.PI / 2;
  guideFill.position.y = 0.072;
  gridGuideGroup.add(guideFill);

  const lineMat = new THREE.LineBasicMaterial({
    color: '#6b7280',
    transparent: true,
    opacity: 0.82
  });
  for (let c = 0; c <= grid.cols; c += 1) {
    const x = grid.left + c * grid.cell;
    addLine(x, grid.top, x, grid.top + grid.depth, lineMat);
  }
  for (let r = 0; r <= grid.rows; r += 1) {
    const z = grid.top + r * grid.cell;
    addLine(grid.left, z, grid.left + grid.width, z, lineMat);
  }
  const borderMat = new THREE.LineBasicMaterial({
    color: '#4b5563',
    transparent: true,
    opacity: 0.94
  });
  addLine(grid.left, grid.top, grid.left + grid.width, grid.top, borderMat);
  addLine(grid.left + grid.width, grid.top, grid.left + grid.width, grid.top + grid.depth, borderMat);
  addLine(grid.left + grid.width, grid.top + grid.depth, grid.left, grid.top + grid.depth, borderMat);
  addLine(grid.left, grid.top + grid.depth, grid.left, grid.top, borderMat);

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
  const wall = new THREE.Group();
  const radius = Math.min(w, d) / 2;
  const runsAlongX = w >= d;
  const coreW = runsAlongX ? Math.max(w - radius * 2, 0.01) : w;
  const coreD = runsAlongX ? d : Math.max(d - radius * 2, 0.01);
  const core = new THREE.Mesh(new THREE.BoxGeometry(coreW, h, coreD), mat);
  core.castShadow = true;
  core.receiveShadow = true;
  wall.add(core);

  const capGeo = new THREE.CylinderGeometry(radius, radius, h, 18);
  const capOffset = runsAlongX ? coreW / 2 : coreD / 2;
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.set(runsAlongX ? side * capOffset : 0, 0, runsAlongX ? 0 : side * capOffset);
    cap.castShadow = true;
    cap.receiveShadow = true;
    wall.add(cap);
  }
  wall.position.set(x, y, z);
  boardGroup.add(wall);
}

function addLine(x1, z1, x2, z2, mat) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, 0.095, z1),
    new THREE.Vector3(x2, 0.095, z2)
  ]);
  const line = new THREE.Line(geo, mat);
  gridGuideGroup.add(line);
}

function setGridGuideLevel(level = 0) {
  const guideLevel = THREE.MathUtils.clamp(level, 0, grid.levels - 1);
  gridGuideGroup.position.y = guideLevel * grid.levelHeight;
  updateGridHeightGuide(guideLevel);
}

function updateGridHeightGuide(level) {
  gridHeightGuideGroup.clear();
  if (level <= 0) return;
  const mat = new THREE.LineBasicMaterial({
    color: '#4b5563',
    transparent: true,
    opacity: 0.68
  });
  const yTop = 0.095;
  const yBottom = yTop - level * grid.levelHeight;
  const corners = [
    [grid.left, grid.top],
    [grid.left + grid.width, grid.top],
    [grid.left + grid.width, grid.top + grid.depth],
    [grid.left, grid.top + grid.depth]
  ];
  for (const [x, z] of corners) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, yTop, z),
      new THREE.Vector3(x, yBottom, z)
    ]);
    const line = new THREE.Line(geo, mat);
    gridHeightGuideGroup.add(line);
  }
}

function showGridGuide(level = 0) {
  setGridGuideLevel(level);
  gridGuideGroup.visible = true;
}

function hideGridGuide() {
  gridGuideGroup.visible = false;
}

function initItems() {
  items = level.items.map((data) => {
    const item = {
      ...data,
      rotation: 0,
      placed: false,
      gridX: null,
      gridY: null,
      level: null,
      lastValid: null,
      trayVisible: false,
      targetPosition: null,
      targetRotationY: 0,
      mesh: createItemMesh(data)
    };
    item.mesh.userData.item = item;
    setItemScale(item, trayScale);
    itemGroup.add(item.mesh);
    return item;
  });
  trayQueue = [...items];
  layoutTrayQueue({ animate: false });
  refreshStatus();
}

function createItemMesh(item) {
  const group = new THREE.Group();
  const width = item.shape[0].length * itemCellSize - 0.08;
  const depth = item.shape.length * itemCellSize - 0.08;
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

function getBoardItemScale() {
  return grid.cell / itemCellSize;
}

function setItemScale(item, xzScale, yScale = xzScale) {
  item.mesh.scale.set(xzScale, yScale, xzScale);
}

function updateActiveItemDragScale(next) {
  if (!activeItem) return;
  if (next?.inside) {
    setItemScale(activeItem, getBoardItemScale() * 1.06, 1.06);
    return;
  }
  setItemScale(activeItem, trayScale * 1.06);
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
  activeItem.wasPlaced = activeItem.placed;
  activeItem.dragStartRotation = activeItem.rotation;
  activeItem.previousPlacement = activeItem.placed
    ? { gx: activeItem.gridX, gy: activeItem.gridY, level: activeItem.level, rotation: activeItem.rotation }
    : null;
  activeItem.finalIntentPlacement = getFinalItemIntentPlacement(activeItem);
  if (activeItem.finalIntentPlacement) {
    applyIntentRotation(activeItem, activeItem.finalIntentPlacement.rotation);
  }
  setItemScale(activeItem, activeItem.placed ? getBoardItemScale() * 1.06 : trayScale * 1.06, activeItem.placed ? 1.06 : trayScale * 1.06);
  activeItem.mesh.position.y = grid.pickupHeight;
  activeItem.placed = false;
  setItemShadow(activeItem, false);
  canvas.setPointerCapture(event.pointerId);
  updatePointer(event);
  dragPlane.constant = -grid.pickupHeight;
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  dragOffset.copy(activeItem.mesh.position).sub(hitPoint);
  dragOffset.y = 0;
  showGridGuide(0);
  updateGhost(null);
}

function onPointerMove(event) {
  if (!activeItem) return;
  event.preventDefault();
  updatePointer(event);
  if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
  activeItem.mesh.position.x = hitPoint.x + dragOffset.x;
  activeItem.mesh.position.z = hitPoint.z + dragOffset.z;
  candidate = getIntentCandidate(activeItem, activeItem.mesh.position);
  updateActiveItemDragScale(candidate);
  showGridGuide(candidate?.baseLevel ?? 0);
  updateGhost(candidate);
}

function onPointerUp(event) {
  if (!activeItem) return;
  event.preventDefault();
  canvas.releasePointerCapture(event.pointerId);
  if (candidate?.valid) {
    placeItem(activeItem, candidate);
  } else if (candidate?.inside) {
    restoreActiveItem();
  } else {
    restoreActiveItem();
  }
  setItemShadow(activeItem, true);
  if (activeItem.placed) setItemScale(activeItem, getBoardItemScale(), 1);
  activeItem.finalIntentPlacement = null;
  activeItem.dragStartRotation = null;
  activeItem = null;
  candidate = null;
  hideGridGuide();
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
  return getCandidateForRotation(item, worldPosition, item.rotation);
}

function getCandidateForRotation(item, worldPosition, rotation) {
  const shape = rotateShape(item.shape, rotation);
  const cols = shape[0].length;
  const rows = shape.length;
  const localX = worldPosition.x - grid.left;
  const localZ = worldPosition.z - grid.top;
  const gx = Math.round(localX / grid.cell - cols / 2);
  const gy = Math.round(localZ / grid.cell - rows / 2);
  const inside = worldPosition.x >= grid.left - 0.8 && worldPosition.x <= -grid.left + 0.8
    && worldPosition.z >= grid.top - 0.8 && worldPosition.z <= -grid.top + 0.8;
  const placement = getPlacement(item, gx, gy, shape);
  return { gx, gy, shape, inside, rotation, ...placement };
}

function getIntentCandidate(item, worldPosition) {
  const current = getCandidate(item, worldPosition);
  if (current.valid || !current.inside) return current;

  const finalPlacement = item.finalIntentPlacement || getFinalItemIntentPlacement(item);
  if (finalPlacement) {
    applyIntentRotation(item, finalPlacement.rotation);
  }

  const matches = [];
  for (let rotation = 0; rotation < 4; rotation += 1) {
    if (rotation === item.rotation) continue;
    const next = getCandidateForRotation(item, worldPosition, rotation);
    if (next.valid) matches.push(next);
  }

  if (matches.length !== 1) return current;

  applyIntentRotation(item, matches[0].rotation);
  return matches[0];
}

function getFinalItemIntentPlacement(item) {
  const remaining = items.filter((entry) => !entry.placed && entry !== item).length;
  if (remaining !== 0) return null;

  const matches = new Map();
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const shape = rotateShape(item.shape, rotation);
    const maxX = grid.cols - shape[0].length;
    const maxY = grid.rows - shape.length;
    for (let gy = 0; gy <= maxY; gy += 1) {
      for (let gx = 0; gx <= maxX; gx += 1) {
        const placement = getPlacement(item, gx, gy, shape);
        if (!placement.valid) continue;
        const key = getPlacementFootprintKey(gx, gy, shape, placement.baseLevel);
        if (matches.has(key)) continue;
        matches.set(key, {
          gx,
          gy,
          shape,
          rotation,
          inside: true,
          ...placement,
          worldPosition: gridToWorld(gx, gy, shape)
        });
      }
    }
  }

  return matches.size === 1 ? [...matches.values()][0] : null;
}

function getPlacementFootprintKey(gx, gy, shape, baseLevel) {
  const cells = [];
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (shape[y][x]) cells.push(`${gx + x},${gy + y}`);
    }
  }
  return `${baseLevel}:${cells.join('|')}`;
}

function applyIntentRotation(item, rotation) {
  item.rotation = rotation;
  setItemRotationTarget(item, rotation);
}

function setItemRotationTarget(item, rotation) {
  item.targetRotationY = -rotation * Math.PI / 2;
}

function setItemRotationImmediate(item, rotation) {
  setItemRotationTarget(item, rotation);
  item.mesh.rotation.y = item.targetRotationY;
}

function canPlace(item, gx, gy, shape) {
  return getPlacement(item, gx, gy, shape).valid;
}

function getPlacement(item, gx, gy, shape) {
  const heightMap = buildHeightMap(item);
  const itemHeight = getItemHeight(item);
  let baseLevel = null;

  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const cx = gx + x;
      const cy = gy + y;
      if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) {
        return { valid: false, baseLevel: 0 };
      }

      const cellHeight = heightMap[cy][cx];
      if (baseLevel === null) baseLevel = cellHeight;
      if (cellHeight !== baseLevel) return { valid: false, baseLevel: cellHeight };
    }
  }

  const resolvedLevel = baseLevel ?? 0;
  return {
    valid: resolvedLevel + itemHeight <= grid.levels,
    baseLevel: resolvedLevel
  };
}

function buildHeightMap(exceptItem = null) {
  const heightMap = Array.from({ length: grid.rows }, () => Array(grid.cols).fill(0));
  for (const item of items) {
    if (item === exceptItem || !item.placed) continue;
    const shape = rotateShape(item.shape, item.rotation);
    const topLevel = (item.level ?? 0) + getItemHeight(item);
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (shape[y][x]) heightMap[item.gridY + y][item.gridX + x] = topLevel;
      }
    }
  }
  return heightMap;
}

function getItemHeight(item) {
  return item.height ?? 1;
}

function placeItem(item, next) {
  item.gridX = next.gx;
  item.gridY = next.gy;
  item.level = next.baseLevel;
  item.placed = true;
  trayQueue = trayQueue.filter((entry) => entry !== item);
  item.mesh.position.copy(gridToWorld(next.gx, next.gy, next.shape));
  item.mesh.position.y = getBoardItemY(1, next.baseLevel);
  setItemScale(item, getBoardItemScale(), 1);
  setItemShadow(item, true);
  item.lastValid = { gx: next.gx, gy: next.gy, level: next.baseLevel, rotation: item.rotation };
  layoutTrayQueue({ animate: true });
}

function restoreActiveItem() {
  if (activeItem.wasPlaced && activeItem.previousPlacement) {
    const previous = activeItem.previousPlacement;
    const shape = rotateShape(activeItem.shape, previous.rotation);
    activeItem.rotation = previous.rotation;
    activeItem.gridX = previous.gx;
    activeItem.gridY = previous.gy;
    activeItem.level = previous.level;
    activeItem.placed = true;
    setItemRotationImmediate(activeItem, activeItem.rotation);
    activeItem.mesh.position.copy(gridToWorld(activeItem.gridX, activeItem.gridY, shape));
    activeItem.mesh.position.y = getBoardItemY(1, activeItem.level);
    setItemScale(activeItem, getBoardItemScale(), 1);
    setItemShadow(activeItem, true);
    return;
  }

  activeItem.mesh.position.copy(activeItem.homePosition);
  activeItem.mesh.position.y = getTableItemY(trayScale);
  activeItem.rotation = activeItem.dragStartRotation ?? activeItem.rotation;
  setItemRotationImmediate(activeItem, activeItem.rotation);
  setItemScale(activeItem, trayScale);
  setItemShadow(activeItem, true);
  activeItem.placed = false;
}

function setItemShadow(item, enabled) {
  item.mesh.traverse((object) => {
    if (object.isMesh) object.castShadow = enabled;
  });
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
  const cols = next.shape[0].length;
  const rows = next.shape.length;
  const ghostColor = next.valid ? '#22c55e' : '#ef4444';
  const mat = new THREE.MeshBasicMaterial({
    color: ghostColor,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(cols * grid.cell - 0.08, 0.045, rows * grid.cell - 0.08),
    mat
  );
  ghost.position.copy(gridToWorld(next.gx, next.gy, next.shape));
  ghost.position.y = getBoardSurfaceY() + next.baseLevel * grid.levelHeight + 0.035;
  ghostGroup.add(ghost);

  const edgeGeo = new THREE.EdgesGeometry(ghost.geometry);
  const edge = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({
      color: ghostColor,
      transparent: true,
      opacity: 0.95
    })
  );
  edge.position.copy(ghost.position);
  ghostGroup.add(edge);
}

function rotateActiveOrLast() {
  const item = activeItem || items.find((entry) => entry.placed && entry.lastValid);
  if (!item) return;
  const previous = item.rotation;
  item.rotation = (item.rotation + 1) % 4;
  setItemRotationTarget(item, item.rotation);

  if (activeItem) {
    candidate = getCandidate(item, item.mesh.position);
    showGridGuide(candidate?.baseLevel ?? 0);
    updateGhost(candidate);
    return;
  }

  const shape = rotateShape(item.shape, item.rotation);
  if (canPlace(item, item.gridX, item.gridY, shape)) {
    const placement = getPlacement(item, item.gridX, item.gridY, shape);
    item.mesh.position.copy(gridToWorld(item.gridX, item.gridY, shape));
    item.level = placement.baseLevel;
    item.mesh.position.y = getBoardItemY(1, item.level);
    setItemScale(item, getBoardItemScale(), 1);
    refreshStatus();
  } else {
    item.rotation = previous;
    setItemRotationTarget(item, item.rotation);
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
    item.level = null;
    item.lastValid = null;
    item.trayVisible = false;
    item.targetPosition = null;
    item.finalIntentPlacement = null;
    setItemRotationImmediate(item, 0);
    item.mesh.visible = true;
    setItemScale(item, trayScale);
  }
  layoutTrayQueue({ animate: false });
  hideGridGuide();
  refreshStatus();
}

function layoutTrayQueue({ animate = true } = {}) {
  const visibleItems = trayQueue.slice(0, trayVisibleCount);
  const visibleWidths = visibleItems.map((item) => getTrayItemWidth(item));
  const slotXs = getTraySlotXs(visibleWidths);

  trayQueue.forEach((item, index) => {
    const visibleInTray = index < trayVisibleCount;
    if (!visibleInTray) {
      item.trayVisible = false;
      if (!item.placed && item !== activeItem) item.mesh.visible = false;
      return;
    }

    const centerX = slotXs[index];
    const target = new THREE.Vector3(centerX, getTableItemY(trayScale), trayZ);
    const enteringTray = !item.trayVisible;
    item.homePosition = target.clone();
    item.targetPosition = target.clone();
    item.mesh.visible = true;
    if (!item.placed && item !== activeItem) {
      setItemScale(item, trayScale);
      if (!animate) {
        item.mesh.position.copy(target);
      } else if (enteringTray) {
        item.mesh.position.set(target.x + trayEntryOffsetX, target.y, target.z);
      }
    }
    item.trayVisible = true;
  });
}

function getTraySlotXs(widths) {
  if (!widths.length) return [];
  const centers = traySlotXs.slice(0, widths.length);
  for (let i = 1; i < centers.length; i += 1) {
    const minDistance = (widths[i - 1] + widths[i]) / 2 + trayMinGap;
    centers[i] = Math.max(centers[i], centers[i - 1] + minDistance);
  }
  const centerOffset = centers.reduce((sum, x) => sum + x, 0) / centers.length;
  return centers.map((x) => x - centerOffset);
}

function getTrayItemWidth(item) {
  const shape = rotateShape(item.shape, item.rotation);
  return (shape[0].length * itemCellSize - 0.08) * trayScale;
}

function updateTrayAnimations() {
  for (const item of trayQueue) {
    if (item.placed || item === activeItem || !item.targetPosition || !item.mesh.visible) continue;
    item.mesh.position.lerp(item.targetPosition, trayLerpAlpha);
    if (item.mesh.position.distanceToSquared(item.targetPosition) < 0.0001) {
      item.mesh.position.copy(item.targetPosition);
    }
  }
}

function updateRotationAnimations() {
  for (const item of items) {
    if (item.targetRotationY === undefined) continue;
    const delta = item.targetRotationY - item.mesh.rotation.y;
    if (Math.abs(delta) < 0.002) {
      item.mesh.rotation.y = item.targetRotationY;
      continue;
    }
    item.mesh.rotation.y += delta * rotationLerpAlpha;
  }
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
  if (items.length) layoutTrayQueue({ animate: false });
}

function getBoardSurfaceY() {
  return 0.015 + 0.04;
}

function getBoardItemY(scale = 1, level = 0) {
  return getBoardSurfaceY() + level * grid.levelHeight + itemHalfHeight * scale + 0.01;
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
  updateTrayAnimations();
  updateRotationAnimations();
  renderer.render(scene, camera);
}
