import * as THREE from 'three';
import './styles.css';

const level = {
  box: { cols: 8, rows: 10, cellSize: 0.62 },
  items: [
    { id: 'book', label: '书本', shape: [[1, 1, 1]], color: '#4b7bec', home: [-1.85, 4.05] },
    { id: 'tea', label: '茶盒', shape: [[1, 1], [1, 1]], color: '#20bf6b', home: [-0.5, 4.05] },
    { id: 'sock', label: '袜子', shape: [[1, 1], [1, 0]], color: '#f7b731', home: [0.75, 4.05] },
    { id: 'lamp', label: '台灯', shape: [[1], [1], [1]], color: '#eb3b5a', home: [1.9, 4.05] },
    { id: 'camera', label: '相机', shape: [[1, 1], [0, 1]], color: '#2d3436', home: [-1.25, 5.1] },
    { id: 'mug', label: '杯子', shape: [[1], [1]], color: '#a55eea', home: [0, 5.1] },
    { id: 'toy', label: '玩具', shape: [[1, 1, 1], [0, 1, 0]], color: '#fd9644', home: [1.35, 5.1] }
  ]
};

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

const canvas = document.querySelector('#game');
const statusEl = document.querySelector('#status');
const toastEl = document.querySelector('#toast');
const rotateBtn = document.querySelector('#rotateBtn');
const resetBtn = document.querySelector('#resetBtn');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6efe4');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.OrthographicCamera(-4, 4, 6, -6, 0.1, 100);
camera.position.set(4.7, 7.2, 6.1);
camera.lookAt(0, 0, 0);

const ambient = new THREE.HemisphereLight('#ffffff', '#c8b7a0', 2.1);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight('#ffffff', 2.6);
keyLight.position.set(2.5, 8, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const boardGroup = new THREE.Group();
const trayGroup = new THREE.Group();
const itemGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
scene.add(boardGroup, trayGroup, ghostGroup, itemGroup);

const grid = {
  cols: level.box.cols,
  rows: level.box.rows,
  cell: level.box.cellSize,
  width: level.box.cols * level.box.cellSize,
  depth: level.box.rows * level.box.cellSize
};
grid.left = -grid.width / 2;
grid.top = -grid.depth / 2;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let items = [];
let activeItem = null;
let dragOffset = new THREE.Vector3();
let candidate = null;
let completionShown = false;

initBoard();
initTray();
initItems();
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

function initBoard() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.22, 0.18, grid.depth + 0.22),
    new THREE.MeshStandardMaterial({ color: '#d7a968', roughness: 0.82 })
  );
  floor.position.y = -0.11;
  floor.receiveShadow = true;
  boardGroup.add(floor);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width, 0.08, grid.depth),
    new THREE.MeshStandardMaterial({ color: '#f5d6a6', roughness: 0.9 })
  );
  base.position.y = 0.015;
  base.receiveShadow = true;
  boardGroup.add(base);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#b87942', roughness: 0.86 });
  addWall(0, 0.22, grid.top - 0.16, grid.width + 0.42, 0.42, 0.28, wallMat);
  addWall(0, 0.22, -grid.top + 0.16, grid.width + 0.42, 0.42, 0.28, wallMat);
  addWall(grid.left - 0.16, 0.22, 0, 0.28, 0.42, grid.depth + 0.42, wallMat);
  addWall(-grid.left + 0.16, 0.22, 0, 0.28, 0.42, grid.depth + 0.42, wallMat);

  const lineMat = new THREE.LineBasicMaterial({ color: '#bb8d56', transparent: true, opacity: 0.5 });
  for (let c = 0; c <= grid.cols; c += 1) {
    const x = grid.left + c * grid.cell;
    addLine(x, grid.top, x, grid.top + grid.depth, lineMat);
  }
  for (let r = 0; r <= grid.rows; r += 1) {
    const z = grid.top + r * grid.cell;
    addLine(grid.left, z, grid.left + grid.width, z, lineMat);
  }

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.12, 12.8),
    new THREE.MeshStandardMaterial({ color: '#eadac7', roughness: 0.9 })
  );
  table.position.set(0, -0.22, 0.95);
  table.receiveShadow = true;
  scene.add(table);
  table.renderOrder = -1;
}

function initTray() {
  const trayBase = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.1, 2.28),
    new THREE.MeshStandardMaterial({ color: '#cfb69a', roughness: 0.88 })
  );
  trayBase.position.set(0, -0.03, 4.6);
  trayBase.receiveShadow = true;
  trayGroup.add(trayBase);

  const trayMat = new THREE.MeshStandardMaterial({ color: '#9c7657', roughness: 0.82 });
  addTrayWall(0, 0.14, 3.42, 5.72, 0.28, 0.12, trayMat);
  addTrayWall(0, 0.14, 5.78, 5.72, 0.28, 0.12, trayMat);
  addTrayWall(-2.86, 0.14, 4.6, 0.12, 0.28, 2.36, trayMat);
  addTrayWall(2.86, 0.14, 4.6, 0.12, 0.28, 2.36, trayMat);

  const mat = new THREE.LineBasicMaterial({ color: '#fff6ea', transparent: true, opacity: 0.35 });
  addTrayLine(-2.65, 4.58, 2.65, 4.58, mat);
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
  boardGroup.add(new THREE.Line(geo, mat));
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
    item.mesh.position.set(data.home[0], 0.25, data.home[1]);
    item.homePosition = item.mesh.position.clone();
    itemGroup.add(item.mesh);
    return item;
  });
  refreshStatus();
}

function createItemMesh(item) {
  const group = new THREE.Group();
  const cells = getShapeCells(item.shape);
  const width = item.shape[0].length * grid.cell;
  const depth = item.shape.length * grid.cell;
  const material = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.68, metalness: 0.02 });
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32 });

  for (const cell of cells) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(grid.cell * 0.88, 0.38, grid.cell * 0.88),
      material
    );
    block.position.set(
      cell.x * grid.cell - width / 2 + grid.cell / 2,
      0,
      cell.y * grid.cell - depth / 2 + grid.cell / 2
    );
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(grid.cell * 0.72, 0.012, grid.cell * 0.72),
      edgeMaterial
    );
    cap.position.set(block.position.x, 0.197, block.position.z);
    group.add(cap);
  }

  const label = makeLabel(item.label);
  label.position.set(0, 0.245, 0);
  label.rotation.x = -Math.PI / 2;
  group.add(label);
  return group;
}

function makeLabel(text) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  roundRect(ctx, 20, 22, 216, 52, 16);
  ctx.fill();
  ctx.fillStyle = '#503b2c';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 48);
  const texture = new THREE.CanvasTexture(labelCanvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), material);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  activeItem.mesh.position.y = 0.52;
  activeItem.placed = false;
  canvas.setPointerCapture(event.pointerId);
  updatePointer(event);
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  dragOffset.copy(activeItem.mesh.position).sub(hitPoint);
  dragOffset.y = 0;
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
    activeItem.mesh.position.y = 0.25;
    activeItem.placed = false;
  } else {
    activeItem.mesh.position.copy(activeItem.homePosition);
    activeItem.mesh.position.y = 0.25;
    activeItem.placed = false;
  }
  activeItem.mesh.scale.setScalar(1);
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
  item.mesh.position.copy(gridToWorld(next.gx, next.gy, next.shape));
  item.mesh.position.y = 0.32;
  item.lastValid = { gx: next.gx, gy: next.gy, rotation: item.rotation };
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
    item.mesh.position.y = 0.32;
    refreshStatus();
  } else {
    item.rotation = previous;
    item.mesh.rotation.y = -item.rotation * Math.PI / 2;
  }
}

function resetLevel() {
  completionShown = false;
  toastEl.classList.remove('show');
  for (const item of items) {
    item.rotation = 0;
    item.placed = false;
    item.gridX = null;
    item.gridY = null;
    item.lastValid = null;
    item.mesh.rotation.y = 0;
    item.mesh.scale.setScalar(1);
    item.mesh.position.copy(item.homePosition);
    item.mesh.position.y = 0.25;
  }
  refreshStatus();
}

function refreshStatus() {
  const placed = items.filter((item) => item.placed).length;
  statusEl.textContent = `${placed}/${items.length} 件已入箱`;
  if (placed === items.length && !completionShown) {
    completionShown = true;
    toastEl.classList.add('show');
  }
}

function resize() {
  const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
  const appRect = app.getBoundingClientRect();
  const width = Math.max(1, Math.round(appRect.width));
  const height = Math.max(1, Math.round(appRect.height));
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const isPortrait = height >= width;
  const requiredWorldWidth = isPortrait ? 5.85 : 8.4;
  const requiredWorldHeight = isPortrait ? 12.2 : 8.2;
  const viewHeight = Math.max(requiredWorldHeight, requiredWorldWidth / aspect);
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.position.set(4.2, 8.4, 7.4);
  camera.lookAt(0, 1.05, 0.1);
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
