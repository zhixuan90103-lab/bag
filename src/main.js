import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { currentLevel as level } from './levels.js';
import './styles.css';

const itemCellSize = level.box.cellSize;
const trayScale = 0.8;
const blockHeight = itemCellSize;
const trayVisibleCount = 3;
const traySlotXs = [-1.55, 0, 1.55];
const trayMinGap = 0.24;
const trayZ = 4.85;
const trayEntryOffsetX = 1.15;
const trayLerpAlpha = 0.18;
const rotationLerpAlpha = 0.12;

/**
 * RSC 四襟片开合时间轴：
 * 开箱：major(前/后) 外翻 → minor(左/右) 外翻 → 前墙淡出
 * 合箱：前墙淡入 → minor 向中合 → major 向中合
 */
const BOX_ANIM = {
  openMajorMs: 420,
  openMinorDelayMs: 140,
  openMinorMs: 400,
  openFrontDelayMs: 300,
  openFrontMs: 340,
  closeFrontMs: 320,
  closeMinorDelayMs: 80,
  closeMinorMs: 360,
  closeMajorDelayMs: 260,
  closeMajorMs: 440,
  /** 襟片外翻角度（rad），约 1.217π ≈ 219°，过水平后再往下贴箱外侧 */
  flapOpenAngle: Math.PI * 1.05 + Math.PI / 6
};

const app = document.querySelector('#app');
app.innerHTML = `
  <canvas id="game"></canvas>
  <div class="topbar">
    <div class="order-card">
      <strong>今日订单</strong>
      <span id="status">把所有物品装进箱子</span>
    </div>
    <div class="topbar-actions">
      <button id="hintBtn" aria-label="提示">提示</button>
      <button id="undoBtn" aria-label="撤销">撤销</button>
      <button id="resetBtn" aria-label="重置">重置</button>
    </div>
  </div>
  <button id="rotateBtn" class="rotate-btn" aria-label="旋转">↻</button>
  <div id="toast" class="toast">订单完成</div>
  <div id="settlePanel" class="settle-panel" hidden>
    <strong>订单完成</strong>
    <span>纸箱已打包好</span>
    <button id="replayBtn" type="button">再来一次</button>
  </div>
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
const settlePanel = document.querySelector('#settlePanel');
const replayBtn = document.querySelector('#replayBtn');
const rotateBtn = document.querySelector('#rotateBtn');
const resetBtn = document.querySelector('#resetBtn');
const hintBtn = document.querySelector('#hintBtn');
const undoBtn = document.querySelector('#undoBtn');
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
  levels: level.box.levels,
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
let undoStack = [];
let hintPlacement = null;
let hintMove = null;
/** boot | opening | play | closing | settle */
let gamePhase = 'boot';
let boxAnim = null;
let frontWall = null;
let frontWallMat = null;
/** RSC 顶盖四襟片铰链：front/back/left/right */
let flapHinges = { front: null, back: null, left: null, right: null };
/** 0=合拢 1=全开；动画内可分 major/minor 不同进度 */
let flapsOpenAmount = 0;
let frontWallAlpha = 1;

initBoard();
initTray();
initItems();
initCameraPanel();
initLightPanel();
initTablePanel();
resize();
startOpeningSequence();
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
hintBtn.addEventListener('click', showHint);
undoBtn.addEventListener('click', undoLastMove);
replayBtn.addEventListener('click', resetLevel);
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
  // 后 / 左 / 右
  addWall(0, wallY, grid.top - wallOffset, grid.width + 0.14, grid.wallHeight, wallThickness, wallMat);
  addWall(grid.left - wallOffset, wallY, 0, wallThickness, grid.wallHeight, grid.depth + 0.14, wallMat);
  addWall(-grid.left + wallOffset, wallY, 0, wallThickness, grid.wallHeight, grid.depth + 0.14, wallMat);

  // 前墙（朝相机 / +Z）：开箱后淡出，合箱前淡入
  frontWallMat = new THREE.MeshStandardMaterial({
    color: '#e69a46',
    roughness: 0.86,
    transparent: true,
    opacity: 1,
    depthWrite: true
  });
  frontWall = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.14, grid.wallHeight, wallThickness),
    frontWallMat
  );
  frontWall.position.set(0, wallY, grid.top + grid.depth + wallOffset);
  frontWall.castShadow = true;
  frontWall.receiveShadow = true;
  boardGroup.add(frontWall);

  // RSC 顶盖：四片襟片，合拢时向箱口中心折合
  createRscFlaps();
  setFlapsOpenAmount(0);
  setFrontWallAlpha(1);

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

/**
 * 创建 RSC 四襟片。
 * major（前/后）：各盖住约一半 depth，合拢时在中缝相遇。
 * minor（左/右）：各盖住约一半 width，合拢时略低于 major，模拟压在 major 下面。
 */
function createRscFlaps() {
  const flapMat = new THREE.MeshStandardMaterial({ color: '#d8893a', roughness: 0.88 });
  const flapT = 0.055;
  const majorLen = Math.max(grid.depth * 0.5 - 0.03, 0.2);
  const minorLen = Math.max(grid.width * 0.5 - 0.03, 0.2);
  const yMajor = grid.wallHeight + 0.02;
  const yMinor = grid.wallHeight + 0.008;
  const zBack = grid.top;
  const zFront = grid.top + grid.depth;
  const zMid = grid.top + grid.depth / 2;
  const xLeft = grid.left;
  const xRight = grid.left + grid.width;

  // 后襟片：铰链在后边，板伸向 +Z（箱心）
  const backHinge = new THREE.Group();
  backHinge.position.set(0, yMajor, zBack);
  const backFlap = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.08, flapT, majorLen),
    flapMat
  );
  backFlap.position.set(0, flapT / 2, majorLen / 2);
  backFlap.castShadow = true;
  backFlap.receiveShadow = true;
  backHinge.add(backFlap);
  boardGroup.add(backHinge);

  // 前襟片：铰链在前边，板伸向 -Z（箱心）
  const frontHinge = new THREE.Group();
  frontHinge.position.set(0, yMajor, zFront);
  const frontFlap = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.08, flapT, majorLen),
    flapMat
  );
  frontFlap.position.set(0, flapT / 2, -majorLen / 2);
  frontFlap.castShadow = true;
  frontFlap.receiveShadow = true;
  frontHinge.add(frontFlap);
  boardGroup.add(frontHinge);

  // 左襟片：铰链在左边，板伸向 +X
  const leftHinge = new THREE.Group();
  leftHinge.position.set(xLeft, yMinor, zMid);
  const leftFlap = new THREE.Mesh(
    new THREE.BoxGeometry(minorLen, flapT, grid.depth + 0.04),
    flapMat
  );
  leftFlap.position.set(minorLen / 2, flapT / 2, 0);
  leftFlap.castShadow = true;
  leftFlap.receiveShadow = true;
  leftHinge.add(leftFlap);
  boardGroup.add(leftHinge);

  // 右襟片：铰链在右边，板伸向 -X
  const rightHinge = new THREE.Group();
  rightHinge.position.set(xRight, yMinor, zMid);
  const rightFlap = new THREE.Mesh(
    new THREE.BoxGeometry(minorLen, flapT, grid.depth + 0.04),
    flapMat
  );
  rightFlap.position.set(-minorLen / 2, flapT / 2, 0);
  rightFlap.castShadow = true;
  rightFlap.receiveShadow = true;
  rightHinge.add(rightFlap);
  boardGroup.add(rightHinge);

  flapHinges = { front: frontHinge, back: backHinge, left: leftHinge, right: rightHinge };
}

/** major 前/后：0 合拢，1 外翻 */
function setMajorFlapsOpen(t) {
  const a = THREE.MathUtils.clamp(t, 0, 1);
  const ang = THREE.MathUtils.lerp(0, BOX_ANIM.flapOpenAngle, a);
  if (flapHinges.back) flapHinges.back.rotation.x = -ang;
  if (flapHinges.front) flapHinges.front.rotation.x = ang;
}

/** minor 左/右：0 合拢，1 外翻 */
function setMinorFlapsOpen(t) {
  const a = THREE.MathUtils.clamp(t, 0, 1);
  const ang = THREE.MathUtils.lerp(0, BOX_ANIM.flapOpenAngle, a);
  if (flapHinges.left) flapHinges.left.rotation.z = ang;
  if (flapHinges.right) flapHinges.right.rotation.z = -ang;
}

/** 四片同步（跳过/终态用） */
function setFlapsOpenAmount(t) {
  flapsOpenAmount = THREE.MathUtils.clamp(t, 0, 1);
  setMajorFlapsOpen(flapsOpenAmount);
  setMinorFlapsOpen(flapsOpenAmount);
}

function setFrontWallAlpha(alpha) {
  frontWallAlpha = THREE.MathUtils.clamp(alpha, 0, 1);
  if (!frontWall || !frontWallMat) return;
  if (frontWallAlpha <= 0.02) {
    frontWall.visible = false;
    frontWallMat.opacity = 0;
    frontWallMat.transparent = true;
    frontWallMat.depthWrite = false;
    return;
  }
  frontWall.visible = true;
  const solid = frontWallAlpha >= 0.98;
  frontWallMat.transparent = !solid;
  frontWallMat.opacity = solid ? 1 : frontWallAlpha;
  frontWallMat.depthWrite = solid;
  frontWallMat.needsUpdate = true;
}

function isGameplayLocked() {
  return gamePhase !== 'play' || Boolean(hintMove);
}

function hideSettlePanel() {
  settlePanel.hidden = true;
}

function showSettlePanel() {
  settlePanel.hidden = false;
}

function startOpeningSequence() {
  if (activeItem) {
    restoreActiveItem();
    activeItem = null;
    candidate = null;
  }
  clearHint();
  hintMove = null;
  hideSettlePanel();
  toastEl.classList.remove('show');
  completionShown = false;
  gamePhase = 'opening';
  setFlapsOpenAmount(0);
  setFrontWallAlpha(1);
  boxAnim = { kind: 'opening', startedAt: performance.now() };
  statusEl.textContent = '开箱中…';
}

function startClosingSequence() {
  if (gamePhase !== 'play' || completionShown) return;
  if (activeItem) {
    restoreActiveItem();
    activeItem = null;
    candidate = null;
  }
  clearHint();
  hintMove = null;
  hideGridGuide();
  updateGhost(null);
  completionShown = true;
  gamePhase = 'closing';
  boxAnim = { kind: 'closing', startedAt: performance.now() };
  statusEl.textContent = `${items.length}/${items.length} 件已入箱`;
}

function skipBoxSequence() {
  if (!boxAnim) return;
  if (boxAnim.kind === 'opening') finishOpeningSequence();
  else if (boxAnim.kind === 'closing') finishClosingSequence();
}

function finishOpeningSequence() {
  boxAnim = null;
  setFlapsOpenAmount(1);
  setFrontWallAlpha(0);
  gamePhase = 'play';
  refreshStatus();
}

function finishClosingSequence() {
  boxAnim = null;
  setFlapsOpenAmount(0);
  setFrontWallAlpha(1);
  gamePhase = 'settle';
  showToast('订单完成', 1600);
  showSettlePanel();
  statusEl.textContent = '订单完成';
}

function updateBoxSequence(now = performance.now()) {
  if (!boxAnim) return;
  const elapsed = now - boxAnim.startedAt;

  if (boxAnim.kind === 'opening') {
    // major 先外翻，minor 稍后，前墙再淡出
    const majorT = smootherStep(elapsed / BOX_ANIM.openMajorMs);
    setMajorFlapsOpen(majorT);
    const minorElapsed = elapsed - BOX_ANIM.openMinorDelayMs;
    const minorT = minorElapsed <= 0 ? 0 : smootherStep(minorElapsed / BOX_ANIM.openMinorMs);
    setMinorFlapsOpen(minorT);
    flapsOpenAmount = Math.max(majorT, minorT);
    const frontElapsed = elapsed - BOX_ANIM.openFrontDelayMs;
    const frontT = frontElapsed <= 0 ? 0 : smootherStep(frontElapsed / BOX_ANIM.openFrontMs);
    setFrontWallAlpha(1 - frontT);
    const doneAt = Math.max(
      BOX_ANIM.openMajorMs,
      BOX_ANIM.openMinorDelayMs + BOX_ANIM.openMinorMs,
      BOX_ANIM.openFrontDelayMs + BOX_ANIM.openFrontMs
    );
    if (elapsed >= doneAt) finishOpeningSequence();
    return;
  }

  if (boxAnim.kind === 'closing') {
    // 前墙先回，再 minor 合拢，最后 major 合拢（贴近真箱封顶顺序）
    const frontT = smootherStep(elapsed / BOX_ANIM.closeFrontMs);
    setFrontWallAlpha(frontT);
    const minorElapsed = elapsed - BOX_ANIM.closeMinorDelayMs;
    const minorClose = minorElapsed <= 0 ? 0 : smootherStep(minorElapsed / BOX_ANIM.closeMinorMs);
    setMinorFlapsOpen(1 - minorClose);
    const majorElapsed = elapsed - BOX_ANIM.closeMajorDelayMs;
    const majorClose = majorElapsed <= 0 ? 0 : smootherStep(majorElapsed / BOX_ANIM.closeMajorMs);
    setMajorFlapsOpen(1 - majorClose);
    flapsOpenAmount = Math.min(1 - minorClose, 1 - majorClose);
    const doneAt = Math.max(
      BOX_ANIM.closeFrontMs,
      BOX_ANIM.closeMinorDelayMs + BOX_ANIM.closeMinorMs,
      BOX_ANIM.closeMajorDelayMs + BOX_ANIM.closeMajorMs
    );
    if (elapsed >= doneAt) finishClosingSequence();
  }
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
  const height = getItemVisualHeight(item);
  const material = new THREE.MeshStandardMaterial({
    color: item.color,
    roughness: 0.54,
    metalness: 0.015
  });
  const block = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 6, 0.08),
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
  if (boxAnim && (gamePhase === 'opening' || gamePhase === 'closing')) {
    event.preventDefault();
    skipBoxSequence();
    return;
  }
  if (isGameplayLocked()) return;
  const picked = pickItem(event);
  if (!picked) return;
  event.preventDefault();
  clearHint();
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
  if (!activeItem || isGameplayLocked()) return;
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
  if (gamePhase !== 'play') {
    restoreActiveItem();
    setItemShadow(activeItem, true);
    activeItem = null;
    candidate = null;
    hideGridGuide();
    updateGhost(null);
    return;
  }
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
  const voxelGrid = buildVoxelGrid(item);
  const itemHeight = getItemHeight(item);

  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const cx = gx + x;
      const cy = gy + y;
      if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) {
        return { valid: false, baseLevel: 0 };
      }

    }
  }

  for (let baseLevel = 0; baseLevel <= grid.levels - itemHeight; baseLevel += 1) {
    if (!isVoxelSpaceEmpty(voxelGrid, gx, gy, baseLevel, shape, itemHeight)) continue;
    if (!hasFullSupport(voxelGrid, gx, gy, baseLevel, shape)) continue;
    return { valid: true, baseLevel };
  }

  // 非法时用「意图落脚层」画 ghost/网格，避免红框沉在第 0 层被已放物品遮住
  return {
    valid: false,
    baseLevel: getIntendedBaseLevel(voxelGrid, gx, gy, shape, itemHeight)
  };
}

function buildVoxelGrid(exceptItem = null) {
  const voxelGrid = Array.from({ length: grid.levels }, () => (
    Array.from({ length: grid.rows }, () => Array(grid.cols).fill(null))
  ));

  for (const item of items) {
    if (item === exceptItem || !item.placed) continue;
    const shape = rotateShape(item.shape, item.rotation);
    const baseLevel = item.level ?? 0;
    const itemHeight = getItemHeight(item);
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (!shape[y][x]) continue;
        for (let level = baseLevel; level < baseLevel + itemHeight; level += 1) {
          if (!voxelGrid[level]?.[item.gridY + y]) continue;
          voxelGrid[level][item.gridY + y][item.gridX + x] = item.id;
        }
      }
    }
  }

  return voxelGrid;
}

function isVoxelSpaceEmpty(voxelGrid, gx, gy, baseLevel, shape, itemHeight) {
  for (let level = baseLevel; level < baseLevel + itemHeight; level += 1) {
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (!shape[y][x]) continue;
        if (voxelGrid[level][gy + y][gx + x] !== null) return false;
      }
    }
  }
  return true;
}

function hasFullSupport(voxelGrid, gx, gy, baseLevel, shape) {
  if (baseLevel === 0) return true;
  const supportLevel = baseLevel - 1;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      if (voxelGrid[supportLevel][gy + y][gx + x] === null) return false;
    }
  }
  return true;
}

/**
 * 单格从底板往上连续占满的高度（堆顶层数）。
 * 用于推断玩家正在往哪一层叠。
 */
function getColumnStackHeight(voxelGrid, cx, cy) {
  let height = 0;
  for (let level = 0; level < grid.levels; level += 1) {
    if (voxelGrid[level][cy][cx] === null) break;
    height += 1;
  }
  return height;
}

/**
 * 非法放置时的展示层（方案 A）：
 * footprint 下各格堆高取 max —— 玩家通常对准最高支撑面去叠；
 * 再夹紧到物品仍能放进箱高的最大 baseLevel。
 * 例：部分格 stack=1、缺口 stack=0 时，红框画在第 1 层表面，而不是箱底。
 */
function getIntendedBaseLevel(voxelGrid, gx, gy, shape, itemHeight) {
  let maxStack = 0;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      maxStack = Math.max(maxStack, getColumnStackHeight(voxelGrid, gx + x, gy + y));
    }
  }

  const maxBaseLevel = Math.max(0, grid.levels - itemHeight);
  return Math.min(maxStack, maxBaseLevel);
}

function getItemHeight(item) {
  return item.height ?? 1;
}

function getItemVisualHeight(item) {
  return blockHeight * getItemHeight(item);
}

function placeItem(item, next, { recordUndo = true } = {}) {
  if (recordUndo) pushUndoSnapshot();
  clearHint();
  item.gridX = next.gx;
  item.gridY = next.gy;
  item.level = next.baseLevel;
  item.placed = true;
  trayQueue = trayQueue.filter((entry) => entry !== item);
  item.mesh.position.copy(gridToWorld(next.gx, next.gy, next.shape));
  item.mesh.position.y = getBoardItemY(item, 1, next.baseLevel);
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
    activeItem.mesh.position.y = getBoardItemY(activeItem, 1, activeItem.level);
    setItemScale(activeItem, getBoardItemScale(), 1);
    setItemShadow(activeItem, true);
    return;
  }

  activeItem.mesh.position.copy(activeItem.homePosition);
  activeItem.mesh.position.y = getTableItemY(activeItem, trayScale);
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
  const height = 0.045;
  const ghostColor = next.valid ? '#22c55e' : '#ef4444';
  const mat = new THREE.MeshBasicMaterial({
    color: ghostColor,
    transparent: true,
    opacity: next.hint ? 0.36 : 0.58,
    depthWrite: false
  });
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(cols * grid.cell - 0.08, height, rows * grid.cell - 0.08),
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

function showHint() {
  if (isGameplayLocked() || activeItem || hintMove) return;
  const hint = findHintPlacement();
  if (!hint) {
    showToast('暂无可放位置');
    clearHint();
    return;
  }

  startHintAutoPlace(hint);
}

function clearHint() {
  hintPlacement = null;
  if (!activeItem) {
    hideGridGuide();
    updateGhost(null);
  }
}

function findHintPlacement() {
  for (const item of trayQueue.slice(0, trayVisibleCount)) {
    if (item.placed) continue;
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const shape = rotateShape(item.shape, rotation);
      const maxX = grid.cols - shape[0].length;
      const maxY = grid.rows - shape.length;
      for (let gy = 0; gy <= maxY; gy += 1) {
        for (let gx = 0; gx <= maxX; gx += 1) {
          const placement = getPlacement(item, gx, gy, shape);
          if (!placement.valid) continue;
          return {
            gx,
            gy,
            shape,
            rotation,
            item,
            hint: true,
            inside: true,
            ...placement
          };
        }
      }
    }
  }
  return null;
}

function startHintAutoPlace(hint) {
  const item = hint.item;
  if (!item || item.placed) return;

  pushUndoSnapshot();
  hintPlacement = hint;
  item.rotation = hint.rotation;
  setItemRotationTarget(item, item.rotation);
  item.mesh.visible = true;
  setItemShadow(item, false);
  showGridGuide(hint.baseLevel);
  updateGhost(hint);

  const endPosition = gridToWorld(hint.gx, hint.gy, hint.shape);
  endPosition.y = getBoardItemY(item, 1, hint.baseLevel);

  hintMove = {
    item,
    placement: hint,
    startTime: performance.now(),
    duration: 650,
    startPosition: item.mesh.position.clone(),
    endPosition,
    startScale: item.mesh.scale.x,
    endScale: getBoardItemScale()
  };
  showToast('正在演示摆放');
}

function updateHintMove() {
  if (!hintMove) return;
  const {
    item,
    placement,
    startTime,
    duration,
    startPosition,
    endPosition,
    startScale,
    endScale
  } = hintMove;
  const elapsed = performance.now() - startTime;
  const t = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
  const phase = smootherStep(t);
  const baseY = THREE.MathUtils.lerp(startPosition.y, endPosition.y, phase);
  const liftHeight = Math.max(0.45, grid.pickupHeight - Math.max(startPosition.y, endPosition.y));
  item.mesh.position.lerpVectors(startPosition, endPosition, phase);
  item.mesh.position.y = baseY + Math.sin(Math.PI * phase) * liftHeight;

  const liftScale = Math.sin(Math.PI * phase);
  const xzScale = THREE.MathUtils.lerp(startScale, endScale, phase) + liftScale * 0.06;
  const yScale = THREE.MathUtils.lerp(startScale, 1, phase) + liftScale * 0.06;
  setItemScale(item, xzScale, yScale);

  if (t < 1) return;

  hintMove = null;
  setItemShadow(item, true);
  placeItem(item, placement, { recordUndo: false });
  hideGridGuide();
  updateGhost(null);
  refreshStatus();
}

function smootherStep(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function rotateActiveOrLast() {
  if (isGameplayLocked() && !activeItem) return;
  if (gamePhase !== 'play') return;
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
    item.mesh.position.y = getBoardItemY(item, 1, item.level);
    setItemScale(item, getBoardItemScale(), 1);
    refreshStatus();
  } else {
    item.rotation = previous;
    setItemRotationTarget(item, item.rotation);
  }
}

function resetLevel() {
  if (activeItem) {
    try {
      canvas.releasePointerCapture?.();
    } catch {
      /* ignore */
    }
    activeItem = null;
    candidate = null;
  }
  completionShown = false;
  undoStack = [];
  hintMove = null;
  clearHint();
  toastEl.classList.remove('show');
  hideSettlePanel();
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
    setItemShadow(item, true);
  }
  layoutTrayQueue({ animate: false });
  hideGridGuide();
  updateGhost(null);
  startOpeningSequence();
}

function pushUndoSnapshot() {
  undoStack.push({
    completionShown,
    trayQueueIds: trayQueue.map((item) => item.id),
    items: items.map((item) => ({
      id: item.id,
      rotation: item.rotation,
      placed: item.placed,
      gridX: item.gridX,
      gridY: item.gridY,
      level: item.level,
      lastValid: item.lastValid ? { ...item.lastValid } : null
    }))
  });
}

function undoLastMove() {
  if (gamePhase !== 'play') {
    showToast(gamePhase === 'settle' ? '订单已完成' : '请稍候');
    return;
  }
  if (hintMove) {
    showToast('演示中不能撤销');
    return;
  }
  const snapshot = undoStack.pop();
  if (!snapshot) {
    showToast('没有可撤销步骤');
    return;
  }

  if (activeItem) {
    restoreActiveItem();
    activeItem = null;
    candidate = null;
  }

  clearHint();
  completionShown = snapshot.completionShown;
  toastEl.classList.remove('show');
  const itemById = new Map(items.map((item) => [item.id, item]));
  trayQueue = snapshot.trayQueueIds.map((id) => itemById.get(id)).filter(Boolean);

  for (const state of snapshot.items) {
    const item = itemById.get(state.id);
    if (!item) continue;
    item.rotation = state.rotation;
    item.placed = state.placed;
    item.gridX = state.gridX;
    item.gridY = state.gridY;
    item.level = state.level;
    item.lastValid = state.lastValid;
    item.finalIntentPlacement = null;
    item.dragStartRotation = null;
    setItemRotationImmediate(item, item.rotation);
    setItemScale(item, item.placed ? getBoardItemScale() : trayScale, item.placed ? 1 : trayScale);
    setItemShadow(item, true);

    if (item.placed) {
      const shape = rotateShape(item.shape, item.rotation);
      item.mesh.visible = true;
      item.mesh.position.copy(gridToWorld(item.gridX, item.gridY, shape));
      item.mesh.position.y = getBoardItemY(item, 1, item.level);
    } else {
      item.trayVisible = false;
      item.targetPosition = null;
    }
  }

  layoutTrayQueue({ animate: false });
  hideGridGuide();
  updateGhost(null);
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
    const target = new THREE.Vector3(centerX, getTableItemY(item, trayScale), trayZ);
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
    if (item.placed || item === activeItem || item === hintMove?.item || !item.targetPosition || !item.mesh.visible) continue;
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
  if (gamePhase === 'opening') {
    statusEl.textContent = '开箱中…';
    return;
  }
  if (gamePhase === 'closing') {
    statusEl.textContent = `${items.length}/${items.length} 件已入箱`;
    return;
  }
  if (gamePhase === 'settle') {
    statusEl.textContent = '订单完成';
    return;
  }
  statusEl.textContent = `${placed}/${items.length} 件已入箱`;
  if (placed === items.length && items.length > 0 && !completionShown && gamePhase === 'play') {
    startClosingSequence();
  }
}

function showToast(message, duration = 1100) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
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

function getBoardItemY(item, scale = 1, level = 0) {
  return getBoardSurfaceY() + level * grid.levelHeight + getItemVisualHeight(item) * scale / 2 + 0.01;
}

function getTableSurfaceY() {
  return tableRig.y + tableRig.thickness / 2;
}

function getTableItemY(item, scale = 1) {
  return getTableSurfaceY() + getItemVisualHeight(item) * scale / 2 + 0.01;
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
  updateBoxSequence();
  updateHintMove();
  updateTrayAnimations();
  updateRotationAnimations();
  renderer.render(scene, camera);
}
