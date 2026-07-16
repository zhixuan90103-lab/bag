import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { levels } from './levels.js';
import './styles.css';

let levelIndex = 0;
let level = levels[levelIndex];
/** 下方待放区的固定预览格尺寸；不随关卡 cellSize 变化 */
const TRAY_CELL_SIZE = 0.78;
/** 物品 mesh 建模基准格：固定为预览尺寸，进入箱内后按 grid.cell 缩放 */
let itemCellSize = TRAY_CELL_SIZE;
let blockHeight = itemCellSize;
const trayScale = 0.8;
const trayVisibleCount = 3;
const traySlotXs = [-1.55, 0, 1.55];
const trayMinGap = 0.24;
const trayZ = 4.85;
const trayEntryOffsetX = 1.15;
const trayLerpAlpha = 0.18;
const rotationLerpAlpha = 0.12;
/**
 * 意图自动转角：大箱更保守（少惊吓 > 少点击）。
 * 分档由 getAutoRotateAssistProfile() 按底盘/层数决定。
 */
const manualLockMs = 800;
const autoRotateDistWeight = 3;
const autoRotateFinalBonus = 0.45;
const autoRotateStepPenalty = 0.4;
const autoRotateTrendBonus = 0.35;
/** 速度阈值（格/秒）：低于=悬停；低于瞄准上限=慢速瞄准；更高=快甩路过 */
const autoRotateHoverSpeedCells = 0.85;
const autoRotateAimSpeedCells = 2.4;
const autoRotateTrailMs = 420;
const autoRotateTrailMax = 18;

/**
 * 小关可略热心；中/大关收紧吸附、提高分差、加长确认，减少误转。
 * area = cols*rows；大关：面积大或层数高。
 */
function getAutoRotateAssistProfile() {
  const area = grid.cols * grid.rows;
  const levels = grid.levels;
  const volume = area * levels;

  let tier = 'small';
  if (area >= 20 || levels >= 3 || volume >= 48) tier = 'large';
  else if (area >= 9 || (levels >= 2 && area >= 8)) tier = 'medium';

  if (tier === 'large') {
    return {
      tier,
      dwellMs: 340,
      cooldownMs: 520,
      maxSnapCells: 0.55,
      hoverMaxSnapCells: 0.7,
      scoreMargin: 0.55,
      hoverScoreMargin: 0.5,
      insidePad: 1.0,
      edgeBand: 0.24,
      edgeBonus: 0.55,
      /** 需瞄准态：悬停 / 慢速 / 靠边刷边；快甩仍不转 */
      requireAiming: true,
      uniqueSkipsMargin: false,
      dwellHoverScale: 0.88,
      dwellScrubScale: 0.72,
      useLongKicks: false
    };
  }

  if (tier === 'medium') {
    return {
      tier,
      dwellMs: 300,
      cooldownMs: 460,
      maxSnapCells: 0.65,
      hoverMaxSnapCells: 0.85,
      scoreMargin: 0.5,
      hoverScoreMargin: 0.42,
      insidePad: 1.15,
      edgeBand: 0.28,
      edgeBonus: 0.65,
      requireAiming: true,
      uniqueSkipsMargin: false,
      dwellHoverScale: 0.85,
      dwellScrubScale: 0.68,
      useLongKicks: true
    };
  }

  // small：2×2 / 小底盘仍可稍热心
  return {
    tier,
    dwellMs: 260,
    cooldownMs: 380,
    maxSnapCells: 0.78,
    hoverMaxSnapCells: 1.0,
    scoreMargin: 0.42,
    hoverScoreMargin: 0.3,
    insidePad: 1.25,
    edgeBand: 0.36,
    edgeBonus: 0.75,
    requireAiming: false,
    uniqueSkipsMargin: true,
    dwellHoverScale: 0.78,
    dwellScrubScale: 0.65,
    useLongKicks: true
  };
}
/** 有序 kick 偏移（相对 snap 格）；长条额外 ±2 */
const AUTO_ROTATE_KICKS = [
  [0, 0],
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1]
];
const AUTO_ROTATE_KICKS_LONG = [
  [-2, 0], [2, 0], [0, -2], [0, 2]
];
/** 拿起/放回时尺寸插值 */
const scaleLerpAlpha = 0.2;
/** 拖拽中相对入箱尺寸的略放大，便于对准 */
const DRAG_SCALE_BOOST = 1.06;
const CAMERA_FIT_PADDING = 1.22;

/**
 * RSC 四襟片开合时间轴：
 * 开箱：整箱落下+顺时针 45° 归正 → major 外翻 → minor 外翻 → 前墙+前襟片淡出
 * 合箱：前墙+前襟片淡入 → minor 向中合 → major 向中合
 */
const BOX_ANIM = {
  /** 入场：自上落下 + Y 轴顺时针 45° 转到正确面 */
  introDropMs: 720,
  introStartY: 4.6,
  /** 起始 Y 旋转（+45°）；向 0 插值 = 俯视顺时针 45° */
  introStartRotY: Math.PI / 4,
  /** 落下时轻微侧倾，落地归零 */
  introStartTiltX: 0.28,
  introStartTiltZ: -0.18,
  openMajorMs: 560,
  openMinorDelayMs: 200,
  openMinorMs: 520,
  /** 相对 intro 结束后的时刻；与 minor 结束对齐 */
  openFrontDelayMs: 720,
  openFrontMs: 420,
  /** 开箱后前墙/前盖保留的透明度（不完全消失） */
  frontFadeMinAlpha: 0.1,
  closeFrontMs: 320,
  closeMinorDelayMs: 80,
  closeMinorMs: 360,
  closeMajorDelayMs: 260,
  closeMajorMs: 440,
  /** 襟片外翻角度：220°，过水平后再往下贴箱外侧 */
  flapOpenAngle: THREE.MathUtils.degToRad(220)
};

const app = document.querySelector('#app');
app.innerHTML = `
  <canvas id="game"></canvas>
  <div class="topbar">
    <div class="order-card">
      <strong id="orderTitle">今日订单</strong>
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
    <strong id="settleTitle">订单完成</strong>
    <span id="settleSub">纸箱已打包好</span>
    <div class="settle-actions">
      <button id="nextLevelBtn" type="button">下一关</button>
      <button id="replayBtn" type="button">再来一次</button>
    </div>
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
const orderTitleEl = document.querySelector('#orderTitle');
const statusEl = document.querySelector('#status');
const toastEl = document.querySelector('#toast');
const settlePanel = document.querySelector('#settlePanel');
const settleTitleEl = document.querySelector('#settleTitle');
const settleSubEl = document.querySelector('#settleSub');
const nextLevelBtn = document.querySelector('#nextLevelBtn');
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

/** 箱内底面 y（与 base 顶面一致：base.y + 半厚） */
const BOARD_SURFACE_Y = 0.015 + 0.04;
/**
 * 墙顶高于「叠满 levels 后的物品顶」的余量。
 * 物品顶 ≈ surface + levels*levelHeight + 0.01，若 wallHeight 仅 = levels*cell，
 * 合盖时襟片会与顶层穿插；余量保证盖在最高堆叠之上。
 */
const BOX_LID_CLEARANCE = 0.14;
const grid = {
  cols: 1,
  rows: 1,
  cell: itemCellSize,
  levels: 1,
  levelHeight: itemCellSize,
  width: itemCellSize,
  depth: itemCellSize,
  left: 0,
  top: 0,
  wallHeight: 1,
  pickupHeight: 2
};
/** 墙体外侧到箱口内沿的水平偏移（中心线 + 半厚） */
const WALL_THICKNESS = 0.08;
const WALL_OFFSET = 0.055;
const WALL_OUTER = WALL_OFFSET + WALL_THICKNESS / 2;

function applyLevelConfig() {
  level = levels[levelIndex];
  grid.cols = level.box.cols;
  grid.rows = level.box.rows;
  grid.cell = level.box.cellSize;
  grid.levels = level.box.levels;
  grid.levelHeight = grid.cell;
  grid.width = grid.cols * grid.cell;
  grid.depth = grid.rows * grid.cell;
  grid.left = -grid.width / 2;
  grid.top = -grid.depth / 2;
  grid.wallHeight =
    BOARD_SURFACE_Y + grid.levels * grid.levelHeight + 0.01 + BOX_LID_CLEARANCE;
  grid.pickupHeight = grid.wallHeight + 0.7;
}

applyLevelConfig();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let items = [];
let trayQueue = [];
let activeItem = null;
let dragOffset = new THREE.Vector3();
let candidate = null;
let pendingPointerItem = null;
let pendingPointerId = null;
let pendingPointerStart = { x: 0, y: 0 };
let pendingPointerEvent = null;
const DRAG_START_THRESHOLD_PX = 10;
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
/** 前襟片（与前墙一起淡出，不挡俯视装箱） */
let frontFlap = null;
let frontFlapMat = null;
/** RSC 顶盖四襟片铰链：front/back/left/right */
let flapHinges = { front: null, back: null, left: null, right: null };
/** 0=合拢 1=全开；动画内可分 major/minor 不同进度 */
let flapsOpenAmount = 0;
let frontWallAlpha = 1;

initTable();
rebuildBoard();
initTray();
rebuildItems();
initCameraPanel();
initLightPanel();
initTablePanel();
fitCameraToBox();
updateOrderCard();
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
nextLevelBtn.addEventListener('click', goToNextLevel);
replayBtn.addEventListener('click', resetLevel);
cameraResetBtn.addEventListener('click', resetCameraRig);
cameraModeSelect.addEventListener('change', () => {
  cameraRig.mode = cameraModeSelect.value;
  applyCameraRig();
});
lightResetBtn.addEventListener('click', resetLightRig);
tableResetBtn.addEventListener('click', resetTableRig);

function disposeObject3D(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) materials.add(mat);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }
}

function initTable() {
  tableMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#eadac7', roughness: 0.9 })
  );
  tableMesh.receiveShadow = true;
  tableMesh.renderOrder = -1;
  scene.add(tableMesh);
  applyTableRig();
}

/** 按当前 grid 重建纸箱 / 网格引导 / 襟片（桌面不重建） */
function rebuildBoard() {
  if (boardGroup.children.includes(gridGuideGroup)) {
    boardGroup.remove(gridGuideGroup);
  }
  clearGroup(boardGroup);
  clearGroup(gridGuideGroup);
  clearGroup(gridHeightGuideGroup);
  gridGuideGroup.add(gridHeightGuideGroup);

  frontWall = null;
  frontWallMat = null;
  frontFlap = null;
  frontFlapMat = null;
  flapHinges = { front: null, back: null, left: null, right: null };

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
  addWall(0, wallY, grid.top - WALL_OFFSET, grid.width + 0.14, grid.wallHeight, WALL_THICKNESS, wallMat);
  addWall(grid.left - WALL_OFFSET, wallY, 0, WALL_THICKNESS, grid.wallHeight, grid.depth + 0.14, wallMat);
  addWall(-grid.left + WALL_OFFSET, wallY, 0, WALL_THICKNESS, grid.wallHeight, grid.depth + 0.14, wallMat);

  frontWallMat = new THREE.MeshStandardMaterial({
    color: '#e69a46',
    roughness: 0.86,
    transparent: true,
    opacity: 1,
    depthWrite: true
  });
  frontWall = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.14, grid.wallHeight, WALL_THICKNESS),
    frontWallMat
  );
  frontWall.position.set(0, wallY, grid.top + grid.depth + WALL_OFFSET);
  frontWall.castShadow = true;
  frontWall.receiveShadow = true;
  boardGroup.add(frontWall);

  createRscFlaps();
  setFlapsOpenAmount(0);
  setFrontWallAlpha(1);

  boardGroup.add(gridGuideGroup);
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

  resetBoxRigPose();
}

function initTray() {
  trayGroup.clear();
}

function releasePointerCaptureSafe() {
  try {
    canvas.releasePointerCapture?.();
  } catch {
    /* ignore */
  }
}

function stopGameplayInteraction() {
  pendingPointerItem = null;
  pendingPointerId = null;
  if (activeItem) {
    releasePointerCaptureSafe();
    activeItem = null;
    candidate = null;
  }
  clearHint();
  hintMove = null;
  hideGridGuide();
  updateGhost(null);
  boxAnim = null;
  toastEl.classList.remove('show');
  hideSettlePanel();
}

function updateOrderCard() {
  const total = levels.length;
  const n = levelIndex + 1;
  orderTitleEl.textContent = `订单 ${n}/${total} · ${level.name}`;
}

function showSettlePanel() {
  const isLast = levelIndex >= levels.length - 1;
  settleTitleEl.textContent = isLast ? '全部订单完成' : '订单完成';
  settleSubEl.textContent = isLast
    ? `第 ${levelIndex + 1}/${levels.length} 关 · ${level.name}`
    : `第 ${levelIndex + 1}/${levels.length} 关 · ${level.name}`;
  nextLevelBtn.hidden = isLast;
  nextLevelBtn.textContent = isLast ? '已通关' : '下一关';
  settlePanel.hidden = false;
}

function hideSettlePanel() {
  settlePanel.hidden = true;
}

/**
 * 按箱体 AABB + FOV 计算合适的 cameraRig.distance / target。
 * 保持默认俯视方向（来自 defaultCameraRig 的 x,y,z 相对 target）。
 */
function fitCameraToBox() {
  const appRect = app.getBoundingClientRect();
  const width = Math.max(1, Math.round(appRect.width || window.innerWidth));
  const height = Math.max(1, Math.round(appRect.height || window.innerHeight));
  const aspect = width / height;
  const fovV = THREE.MathUtils.degToRad(cameraRig.fov || defaultCameraRig.fov);
  const fitHeight = Math.max(grid.wallHeight + 0.8, grid.depth * 0.55 + grid.wallHeight * 0.35);
  const fitWidth = Math.max(grid.width, grid.depth) + 0.85;
  const distV = (fitHeight / 2) / Math.tan(fovV / 2);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
  const distH = (fitWidth / 2) / Math.tan(fovH / 2);
  const distance = Math.max(distV, distH) * CAMERA_FIT_PADDING;

  cameraRig.mode = 'perspective';
  cameraModeSelect.value = 'perspective';
  cameraRig.fov = defaultCameraRig.fov;
  // 只在箱体过大时拉远，不因小关卡自动推进相机。
  // 待放物品区使用固定世界坐标，过度推进会把下方 3 个物品裁出屏幕。
  cameraRig.distance = THREE.MathUtils.clamp(
    Math.max(defaultCameraRig.distance, distance),
    defaultCameraRig.distance,
    24
  );
  cameraRig.targetX = defaultCameraRig.targetX;
  cameraRig.targetY = defaultCameraRig.targetY;
  cameraRig.targetZ = defaultCameraRig.targetZ;
  // 保持默认俯视方位和屏幕平移，避免切关后箱子在画面中漂移
  cameraRig.x = defaultCameraRig.x;
  cameraRig.y = defaultCameraRig.y;
  cameraRig.z = defaultCameraRig.z;
  cameraRig.screenX = defaultCameraRig.screenX;
  cameraRig.screenY = defaultCameraRig.screenY;
  applyCameraRig();
  if (cameraControlsEl) {
    for (const input of cameraControlsEl.querySelectorAll('[data-camera-key]')) {
      const key = input.dataset.cameraKey;
      if (cameraRig[key] === undefined) continue;
      input.value = cameraRig[key];
      syncCameraPanelValue(key);
    }
  }
}

function rebuildItems() {
  clearGroup(itemGroup);
  items = level.items.map((data) => {
    const trayRotation = getCompactTrayRotation(data);
    const item = {
      ...data,
      rotation: trayRotation,
      trayRotation,
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
    setItemRotationImmediate(item, item.rotation);
    setItemScale(item, trayScale);
    itemGroup.add(item.mesh);
    return item;
  });
  trayQueue = [...items];
  layoutTrayQueue({ animate: false });
  refreshStatus();
}

/** 切关：应用关卡配置 → 重建箱体/物品 → 相机 fit → 开箱 */
function loadLevel(index, { open = true } = {}) {
  if (index < 0 || index >= levels.length) return false;
  stopGameplayInteraction();
  levelIndex = index;
  applyLevelConfig();
  rebuildBoard();
  rebuildItems();
  undoStack = [];
  completionShown = false;
  gamePhase = 'boot';
  fitCameraToBox();
  updateOrderCard();
  if (open) startOpeningSequence();
  return true;
}

function goToNextLevel() {
  if (levelIndex >= levels.length - 1) {
    showToast('已经是最后一关');
    return;
  }
  loadLevel(levelIndex + 1);
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
 *
 * 铰链在墙体外沿（WALL_OUTER）：外翻后板体贴墙，不穿墙。
 * 板底面落在枢轴平面（无 hingeGap），开合过程折缝不露空。
 */
function createRscFlaps() {
  const flapMat = new THREE.MeshStandardMaterial({ color: '#d8893a', roughness: 0.88 });
  // 前襟片独立材质：开箱后与前墙同步淡出
  frontFlapMat = new THREE.MeshStandardMaterial({
    color: '#d8893a',
    roughness: 0.88,
    transparent: true,
    opacity: 1,
    depthWrite: true
  });
  const flapT = 0.05;
  // 中缝极小重叠，避免动画中透出箱内
  const seam = 0.008;
  // 枢轴在外沿 → 板长覆盖到中线略过缝
  const majorLen = Math.max(grid.depth * 0.5 + WALL_OUTER - seam, 0.2);
  const minorLen = Math.max(grid.width * 0.5 + WALL_OUTER - seam, 0.2);
  // 横宽盖住箱口并略压墙顶内沿，打开后仍在邻墙外角以内
  const majorWidth = grid.width + WALL_OFFSET * 0.6;
  const minorDepth = grid.depth + WALL_OFFSET * 0.6;
  // 底面贴枢轴，枢轴略高于墙顶，旋转时厚板不切墙
  const yMajor = grid.wallHeight + 0.012;
  const yMinor = grid.wallHeight + 0.006;
  const zBack = grid.top - WALL_OUTER;
  const zFront = grid.top + grid.depth + WALL_OUTER;
  const zMid = grid.top + grid.depth / 2;
  const xLeft = grid.left - WALL_OUTER;
  const xRight = grid.left + grid.width + WALL_OUTER;

  // 后襟片：铰链在后墙外沿，板伸向 +Z（箱心）
  const backHinge = new THREE.Group();
  backHinge.position.set(0, yMajor, zBack);
  const backFlap = new THREE.Mesh(
    new THREE.BoxGeometry(majorWidth, flapT, majorLen),
    flapMat
  );
  backFlap.position.set(0, flapT / 2, majorLen / 2);
  backFlap.castShadow = true;
  backFlap.receiveShadow = true;
  backHinge.add(backFlap);
  boardGroup.add(backHinge);

  // 前襟片：铰链在前墙外沿，板伸向 -Z（箱心）；材质可独立淡出
  const frontHinge = new THREE.Group();
  frontHinge.position.set(0, yMajor, zFront);
  frontFlap = new THREE.Mesh(
    new THREE.BoxGeometry(majorWidth, flapT, majorLen),
    frontFlapMat
  );
  frontFlap.position.set(0, flapT / 2, -majorLen / 2);
  frontFlap.castShadow = true;
  frontFlap.receiveShadow = true;
  frontHinge.add(frontFlap);
  boardGroup.add(frontHinge);

  // 左襟片：铰链在左墙外沿，板伸向 +X
  const leftHinge = new THREE.Group();
  leftHinge.position.set(xLeft, yMinor, zMid);
  const leftFlap = new THREE.Mesh(
    new THREE.BoxGeometry(minorLen, flapT, minorDepth),
    flapMat
  );
  leftFlap.position.set(minorLen / 2, flapT / 2, 0);
  leftFlap.castShadow = true;
  leftFlap.receiveShadow = true;
  leftHinge.add(leftFlap);
  boardGroup.add(leftHinge);

  // 右襟片：铰链在右墙外沿，板伸向 -X
  const rightHinge = new THREE.Group();
  rightHinge.position.set(xRight, yMinor, zMid);
  const rightFlap = new THREE.Mesh(
    new THREE.BoxGeometry(minorLen, flapT, minorDepth),
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

/**
 * 前墙 + 前襟片同步透明度。
 * t=1 全实，t=0 为开箱后的「幽灵」态（保留 frontFadeMinAlpha，不完全消失）。
 */
function setFrontWallAlpha(t) {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  const minA = BOX_ANIM.frontFadeMinAlpha;
  frontWallAlpha = THREE.MathUtils.lerp(minA, 1, u);
  applyFrontFadeMesh(frontWall, frontWallMat, frontWallAlpha);
  applyFrontFadeMesh(frontFlap, frontFlapMat, frontWallAlpha);
}

function applyFrontFadeMesh(mesh, mat, alpha) {
  if (!mesh || !mat) return;
  mesh.visible = true;
  mesh.castShadow = alpha >= 0.5;
  const solid = alpha >= 0.98;
  mat.transparent = !solid;
  mat.opacity = solid ? 1 : alpha;
  mat.depthWrite = solid;
  mat.needsUpdate = true;
}

function isGameplayLocked() {
  return gamePhase !== 'play' || Boolean(hintMove);
}

/** 整箱入场姿态：t=0 空中歪斜，t=1 落地归正 */
function setBoxIntroPose(t) {
  const a = THREE.MathUtils.clamp(t, 0, 1);
  // 下落用 ease-out，尾段轻弹一下更像砸桌
  const dropEase = 1 - Math.pow(1 - a, 3);
  const bounce = a < 0.82 ? 0 : Math.sin(((a - 0.82) / 0.18) * Math.PI) * 0.12 * (1 - a);
  const spinEase = smootherStep(a);
  boardGroup.position.y = THREE.MathUtils.lerp(BOX_ANIM.introStartY, 0, dropEase) + bounce;
  boardGroup.rotation.y = THREE.MathUtils.lerp(BOX_ANIM.introStartRotY, 0, spinEase);
  boardGroup.rotation.x = THREE.MathUtils.lerp(BOX_ANIM.introStartTiltX, 0, spinEase);
  boardGroup.rotation.z = THREE.MathUtils.lerp(BOX_ANIM.introStartTiltZ, 0, spinEase);
}

function resetBoxRigPose() {
  boardGroup.position.set(0, 0, 0);
  boardGroup.rotation.set(0, 0, 0);
}

function startOpeningSequence() {
  pendingPointerItem = null;
  pendingPointerId = null;
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
  setBoxIntroPose(0);
  boxAnim = { kind: 'opening', startedAt: performance.now() };
  statusEl.textContent = '开箱中…';
}

function startClosingSequence() {
  if (gamePhase !== 'play' || completionShown) return;
  pendingPointerItem = null;
  pendingPointerId = null;
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
  resetBoxRigPose();
  setFlapsOpenAmount(1);
  setFrontWallAlpha(0);
  gamePhase = 'play';
  refreshStatus();
}

function finishClosingSequence() {
  boxAnim = null;
  resetBoxRigPose();
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
    const introMs = BOX_ANIM.introDropMs;
    // 1) 整箱落下 + 顺时针 45° 归正；2) 再开襟片
    if (elapsed < introMs) {
      setBoxIntroPose(elapsed / introMs);
      setFlapsOpenAmount(0);
      setFrontWallAlpha(1);
      return;
    }
    setBoxIntroPose(1);

    const openElapsed = elapsed - introMs;
    // major 先外翻 → minor 外翻 → 前墙+前襟片淡出（无停顿）
    const majorT = smootherStep(openElapsed / BOX_ANIM.openMajorMs);
    setMajorFlapsOpen(majorT);
    const minorElapsed = openElapsed - BOX_ANIM.openMinorDelayMs;
    const minorT = minorElapsed <= 0 ? 0 : smootherStep(minorElapsed / BOX_ANIM.openMinorMs);
    setMinorFlapsOpen(minorT);
    flapsOpenAmount = Math.max(majorT, minorT);
    const frontElapsed = openElapsed - BOX_ANIM.openFrontDelayMs;
    const frontT = frontElapsed <= 0 ? 0 : smootherStep(frontElapsed / BOX_ANIM.openFrontMs);
    setFrontWallAlpha(1 - frontT);
    const openDoneAt = Math.max(
      BOX_ANIM.openMajorMs,
      BOX_ANIM.openMinorDelayMs + BOX_ANIM.openMinorMs,
      BOX_ANIM.openFrontDelayMs + BOX_ANIM.openFrontMs
    );
    if (openElapsed >= openDoneAt) finishOpeningSequence();
    return;
  }

  if (boxAnim.kind === 'closing') {
    // 前墙+前襟片先回，再 minor 合拢，最后 major 合拢（贴近真箱封顶顺序）
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

/** 脚印是否在包围盒内全部占满（可用单块圆角盒） */
function isSolidRectShape(shape) {
  if (!shape?.length || !shape[0]?.length) return false;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) return false;
    }
  }
  return true;
}

/**
 * 提取 polyomino 外轮廓（网格角点，逆时针）。
 * 角点坐标：列 x ∈ [0, cols]，行 y ∈ [0, rows]。
 */
function extractPolyominoOutline(shape) {
  const cols = shape[0].length;
  const rows = shape.length;
  const occ = (x, y) =>
    x >= 0 && y >= 0 && x < cols && y < rows && !!shape[y][x];

  /** @type {Map<string, Array<{x:number,y:number}>>} */
  const adj = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const k = `${x1},${y1}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push({ x: x2, y: y2 });
  };

  // 仅外边界；方向使整体为 CCW（Shape 正面）
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!occ(x, y)) continue;
      if (!occ(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!occ(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!occ(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!occ(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  if (adj.size === 0) return [];

  // 凹角顶点可能有多条出边：优先左转（CCW）
  const turnScore = (from, via, to) => {
    const ax = via.x - from.x;
    const ay = via.y - from.y;
    const bx = to.x - via.x;
    const by = to.y - via.y;
    return ax * by - ay * bx;
  };

  const startKey = adj.keys().next().value;
  const [sx, sy] = startKey.split(',').map(Number);
  const loop = [{ x: sx, y: sy }];
  let prev = { x: sx - 1, y: sy };
  let cur = { x: sx, y: sy };
  const used = new Set();

  for (let guard = 0; guard < 4096; guard += 1) {
    const opts = adj.get(`${cur.x},${cur.y}`) || [];
    let best = null;
    let bestScore = -Infinity;
    for (const n of opts) {
      const ek = `${cur.x},${cur.y}->${n.x},${n.y}`;
      if (used.has(ek)) continue;
      const score = turnScore(prev, cur, n);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (!best) break;
    used.add(`${cur.x},${cur.y}->${best.x},${best.y}`);
    prev = cur;
    cur = best;
    if (cur.x === sx && cur.y === sy) break;
    loop.push({ x: cur.x, y: cur.y });
  }

  return loop;
}

/** 轴对齐多边形内缩（CCW 环，沿边内法线偏移 dist） */
function insetAxisAlignedPolygon(points, dist) {
  if (dist <= 1e-8) return points.map((p) => ({ x: p.x, y: p.y }));
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, y: p.y }));

  const offsetEdges = [];
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // CCW 内法线（指向多边形内部）
    const nx = -dy / len;
    const ny = dx / len;
    offsetEdges.push({
      x1: a.x + nx * dist,
      y1: a.y + ny * dist,
      x2: b.x + nx * dist,
      y2: b.y + ny * dist
    });
  }

  const out = [];
  for (let i = 0; i < n; i += 1) {
    const e0 = offsetEdges[(i - 1 + n) % n];
    const e1 = offsetEdges[i];
    const den = (e0.x1 - e0.x2) * (e1.y1 - e1.y2) - (e0.y1 - e0.y2) * (e1.x1 - e1.x2);
    if (Math.abs(den) < 1e-10) {
      out.push({ x: e1.x1, y: e1.y1 });
      continue;
    }
    const t =
      ((e0.x1 - e1.x1) * (e1.y1 - e1.y2) - (e0.y1 - e1.y1) * (e1.x1 - e1.x2)) / den;
    out.push({
      x: e0.x1 + t * (e0.x2 - e0.x1),
      y: e0.y1 + t * (e0.y2 - e0.y1)
    });
  }
  return out;
}

function roundedAxisAlignedShape(points, radius) {
  const shape2d = new THREE.Shape();
  const n = points.length;
  if (n < 3 || radius <= 0) {
    shape2d.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      shape2d.lineTo(points[i].x, points[i].y);
    }
    shape2d.closePath();
    return shape2d;
  }

  const corner = (index) => {
    const prev = points[(index - 1 + n) % n];
    const p = points[index];
    const next = points[(index + 1) % n];
    const inLen = Math.hypot(prev.x - p.x, prev.y - p.y) || 1;
    const outLen = Math.hypot(next.x - p.x, next.y - p.y) || 1;
    const ax = p.x - prev.x;
    const ay = p.y - prev.y;
    const bx = next.x - p.x;
    const by = next.y - p.y;
    const isConvex = ax * by - ay * bx > 0;
    // 只圆滑外凸角。内凹角如果也用二次曲线连接，会在 L/J/T 的凹口处产生斜切面。
    const r = isConvex ? Math.min(radius, inLen * 0.42, outLen * 0.42) : 0;
    return {
      p,
      start: {
        x: p.x + (prev.x - p.x) / inLen * r,
        y: p.y + (prev.y - p.y) / inLen * r
      },
      end: {
        x: p.x + (next.x - p.x) / outLen * r,
        y: p.y + (next.y - p.y) / outLen * r
      }
    };
  };

  const first = corner(0);
  shape2d.moveTo(first.end.x, first.end.y);
  for (let i = 1; i <= n; i += 1) {
    const c = corner(i % n);
    shape2d.lineTo(c.start.x, c.start.y);
    shape2d.quadraticCurveTo(c.p.x, c.p.y, c.end.x, c.end.y);
  }
  shape2d.closePath();
  return shape2d;
}

/**
 * L/T/拐角等：外轮廓挤出 + 内向倒角 → 单块圆角实心。
 * 尺寸对齐第一关 RoundedBox：脚印 = 格尺寸 − inset，倒角不向外撑体积。
 */
function createSolidPolyominoGeometry(shape, cellSize, height, inset = 0.08) {
  const cols = shape[0].length;
  const rows = shape.length;
  const outline = extractPolyominoOutline(shape);

  if (outline.length < 3) {
    return new RoundedBoxGeometry(
      Math.max(cellSize - inset, 0.05),
      height,
      Math.max(cellSize - inset, 0.05),
      6,
      0.06
    );
  }

  // 1) 脚印精确落在逻辑格上（与 place 的 footprint 一致）
  // 2) 再整体内缩 inset/2，与矩形 width = n*cell - inset 一致
  // 3) y 取负：配合 rotateX(-π/2) 后 +row → +Z
  let pts = outline.map((p) => ({
    x: (p.x - cols / 2) * cellSize,
    y: -((p.y - rows / 2) * cellSize)
  }));
  // y 翻转后环绕方向取反 → reverse 保持 CCW，便于内缩法线向内
  pts = pts.reverse();
  pts = insetAxisAlignedPolygon(pts, inset * 0.3);

  // 与 RoundedBox 相同的圆角预算：圆角吃进轮廓内部，不向外加体积
  const radius = Math.min(0.08, cellSize * 0.14, height * 0.22);
  const bevelSize = radius * 0.35;
  // Three.js ExtrudeGeometry 对凹多边形配合负 bevelOffset 有已知错误面问题。
  // 这里提前额外内缩轮廓，使用默认 bevelOffset=0，避免 J/L/T 形状出现斜切伪影。
  pts = insetAxisAlignedPolygon(pts, bevelSize * 0.45);
  const shape2d = roundedAxisAlignedShape(pts, radius);
  const bevelThickness = radius;
  const depth = Math.max(height - bevelThickness * 2, height * 0.5);

  const geo = new THREE.ExtrudeGeometry(shape2d, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 8,
    curveSegments: 8
  });

  // Shape XY + 挤出 Z → Y-up。
  // XZ 必须保持「shape 包围盒中心」为原点（与 gridToWorld / 矩形件一致），
  // 不可按实心 mesh AABB 再居中，否则 L/T 会相对逻辑格偏移且显大。
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, -(bb.min.y + bb.max.y) / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function createItemMesh(item) {
  const shape = item.shape;
  const cols = shape[0].length;
  const rows = shape.length;
  const height = getItemVisualHeight(item);
  const material = new THREE.MeshStandardMaterial({
    color: item.color,
    roughness: 0.54,
    metalness: 0.015
  });
  const cellSize = itemCellSize;
  const inset = 0.08;
  // 所有物品统一走同一套 polyomino 圆角挤出管线。
  // 避免方形件和异形件分别使用 RoundedBoxGeometry / ExtrudeGeometry 导致圆角观感不一致。
  const geometry = createSolidPolyominoGeometry(shape, cellSize, height, inset);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function getBoardItemScale() {
  return grid.cell / itemCellSize;
}

/** 拖拽时使用的入箱尺寸（略放大） */
function getDragItemScale() {
  return getBoardItemScale() * DRAG_SCALE_BOOST;
}

function setItemScale(item, xzScale, yScale = xzScale) {
  item.mesh.scale.set(xzScale, yScale, xzScale);
  item.targetScale = xzScale;
}

/** 平滑过渡到目标缩放（拿起立刻向入箱尺寸过渡） */
function setItemScaleTarget(item, scale) {
  item.targetScale = scale;
}

function updateScaleAnimations() {
  for (const item of items) {
    if (item.targetScale === undefined || !item.mesh) continue;
    // 提示动画自行驱动缩放
    if (hintMove?.item === item) continue;
    const current = item.mesh.scale.x;
    const target = item.targetScale;
    const delta = target - current;
    if (Math.abs(delta) < 0.001) {
      if (current !== target) item.mesh.scale.set(target, target, target);
      continue;
    }
    const next = current + delta * scaleLerpAlpha;
    item.mesh.scale.set(next, next, next);
  }
}

function updateActiveItemDragScale() {
  if (!activeItem) return;
  // 拿起后始终按入箱尺寸，不因是否悬在箱上而突变
  setItemScaleTarget(activeItem, getDragItemScale());
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

function getCompactTrayRotation(item) {
  const initialShape = rotateShape(item.shape, item.rotation ?? 0);
  if (initialShape[0].length <= 2) return item.rotation ?? 0;

  let bestRotation = 0;
  let bestScore = Infinity;
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const shape = rotateShape(item.shape, rotation);
    const width = shape[0].length;
    const depth = shape.length;
    // 只处理横向超过 2 格的情况；能压到 2 格内就优先，避免无谓改变关卡设计朝向。
    const overflowPenalty = width > 2 ? 100 : 0;
    const score = overflowPenalty + width * 10 + depth;
    if (score < bestScore) {
      bestScore = score;
      bestRotation = rotation;
    }
  }
  return bestRotation;
}

function onPointerDown(event) {
  if (boxAnim && (gamePhase === 'opening' || gamePhase === 'closing')) {
    event.preventDefault();
    skipBoxSequence();
    return;
  }
  if (isGameplayLocked()) return;
  if (activeItem || pendingPointerItem) return;
  const picked = pickItem(event);
  if (!picked) return;
  event.preventDefault();
  pendingPointerItem = picked;
  pendingPointerId = event.pointerId;
  pendingPointerStart = { x: event.clientX, y: event.clientY };
  pendingPointerEvent = event;
  canvas.setPointerCapture(event.pointerId);
}

function beginDragItem(item, event) {
  clearHint();
  activeItem = item;
  activeItem.wasPlaced = activeItem.placed;
  activeItem.dragStartRotation = activeItem.rotation;
  activeItem.lastAutoRotationAt = 0;
  activeItem.autoRotateIntentKey = null;
  activeItem.autoRotateIntentSince = 0;
  activeItem.manualLockUntil = 0;
  activeItem.dragTrail = [];
  activeItem.previousPlacement = activeItem.placed
    ? { gx: activeItem.gridX, gy: activeItem.gridY, level: activeItem.level, rotation: activeItem.rotation }
    : null;
  // 缓存最后一块唯一解仅作 inside 加权，拿起瞬间绝不强转
  activeItem.finalIntentPlacement = getFinalItemIntentPlacement(activeItem);
  // 超过拖拽阈值后才按入箱尺寸过渡，避免单点点击也把物品拿起。
  setItemScaleTarget(activeItem, getDragItemScale());
  activeItem.mesh.position.y = grid.pickupHeight;
  activeItem.placed = false;
  setItemShadow(activeItem, false);
  updatePointer(event);
  dragPlane.constant = -grid.pickupHeight;
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  dragOffset.copy(activeItem.mesh.position).sub(hitPoint);
  dragOffset.y = 0;
  showGridGuide(0);
  updateGhost(null);
}

function onPointerMove(event) {
  if (pendingPointerItem && event.pointerId === pendingPointerId && !activeItem) {
    event.preventDefault();
    const dx = event.clientX - pendingPointerStart.x;
    const dy = event.clientY - pendingPointerStart.y;
    if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD_PX) {
      beginDragItem(pendingPointerItem, event);
      pendingPointerItem = null;
      pendingPointerEvent = null;
    } else {
      return;
    }
  }
  if (!activeItem || isGameplayLocked()) return;
  event.preventDefault();
  updatePointer(event);
  if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
  activeItem.mesh.position.x = hitPoint.x + dragOffset.x;
  activeItem.mesh.position.z = hitPoint.z + dragOffset.z;
  sampleDragTrail(activeItem, activeItem.mesh.position);
  candidate = getIntentCandidate(activeItem, activeItem.mesh.position);
  updateActiveItemDragScale();
  showGridGuide(candidate?.baseLevel ?? 0);
  updateGhost(candidate);
}

function onPointerUp(event) {
  if (pendingPointerItem && event.pointerId === pendingPointerId && !activeItem) {
    event.preventDefault();
    const item = pendingPointerItem;
    pendingPointerItem = null;
    pendingPointerId = null;
    pendingPointerEvent = null;
    canvas.releasePointerCapture(event.pointerId);
    if (event.type !== 'pointercancel') rotateItemByTap(item);
    return;
  }
  if (!activeItem) return;
  event.preventDefault();
  if (gamePhase !== 'play') {
    restoreActiveItem();
    setItemShadow(activeItem, true);
    activeItem = null;
    pendingPointerItem = null;
    pendingPointerId = null;
    pendingPointerEvent = null;
    candidate = null;
    hideGridGuide();
    updateGhost(null);
    return;
  }
  canvas.releasePointerCapture(event.pointerId);
  if (event.type !== 'pointercancel' && candidate?.valid) {
    placeItem(activeItem, candidate);
  } else if (candidate?.inside) {
    restoreActiveItem();
  } else {
    restoreActiveItem();
  }
  setItemShadow(activeItem, true);
  if (activeItem.placed) setItemScale(activeItem, getBoardItemScale());
  activeItem.finalIntentPlacement = null;
  activeItem.dragStartRotation = null;
  activeItem = null;
  pendingPointerItem = null;
  pendingPointerId = null;
  pendingPointerEvent = null;
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
  const snap = getSnapGridForShape(worldPosition, shape);
  const placement = getPlacement(item, snap.gx, snap.gy, shape);
  return { gx: snap.gx, gy: snap.gy, shape, inside: snap.inside, rotation, ...placement };
}

function getSnapGridForShape(worldPosition, shape, insidePad = 0.8) {
  const cols = shape[0].length;
  const rows = shape.length;
  const localX = worldPosition.x - grid.left;
  const localZ = worldPosition.z - grid.top;
  const gx = Math.round(localX / grid.cell - cols / 2);
  const gy = Math.round(localZ / grid.cell - rows / 2);
  const inside = worldPosition.x >= grid.left - insidePad && worldPosition.x <= -grid.left + insidePad
    && worldPosition.z >= grid.top - insidePad && worldPosition.z <= -grid.top + insidePad;
  return { gx, gy, inside };
}

/** 意图评估：略扩大箱区，避免大件中心刚出界就完全不帮转 */
function isNearBoxForIntent(worldPosition, pad = 1.1) {
  return worldPosition.x >= grid.left - pad && worldPosition.x <= -grid.left + pad
    && worldPosition.z >= grid.top - pad && worldPosition.z <= -grid.top + pad;
}

/**
 * 互异脚印朝向：同一 shape 矩阵只保留距当前角步数最少的 rotation。
 * 避免 2×1 的 90°/270° 同分并列导致 margin 卡死、永远不转。
 */
function getDistinctRotationOptions(item) {
  const currentKey = shapeMatrixKey(rotateShape(item.shape, item.rotation));
  const byShape = new Map();

  for (let rotation = 0; rotation < 4; rotation += 1) {
    if (rotation === item.rotation) continue;
    const shape = rotateShape(item.shape, rotation);
    const key = shapeMatrixKey(shape);
    if (key === currentKey) continue;
    const steps = minRotationSteps(item.rotation, rotation);
    const prev = byShape.get(key);
    if (!prev || steps < prev.steps) {
      byShape.set(key, { rotation, shape, steps, key });
    }
  }

  return [...byShape.values()];
}

function sampleDragTrail(item, worldPosition) {
  const now = performance.now();
  const trail = item.dragTrail || (item.dragTrail = []);
  const last = trail[trail.length - 1];
  // 过密采样只更新末点，减轻抖动
  if (last && now - last.t < 24) {
    last.x = worldPosition.x;
    last.z = worldPosition.z;
    last.t = now;
  } else {
    trail.push({ x: worldPosition.x, z: worldPosition.z, t: now });
  }
  while (trail.length > autoRotateTrailMax) trail.shift();
  while (trail.length && now - trail[0].t > autoRotateTrailMs) trail.shift();
}

/**
 * 靠边刷边：在同一侧边附近沿边来回/滑动（如左侧上下刷）。
 * preferredLongAxis：该边暗示的长轴（左/右→z 竖放，上/下→x 横放）
 */
function detectEdgeScrub(item, edgeBand) {
  const trail = item.dragTrail;
  if (!trail || trail.length < 4) {
    return { scrubbing: false, preferredLongAxis: null };
  }

  const latest = trail[trail.length - 1];
  const preferredLongAxis = getEdgeAlignmentHint(latest, edgeBand * 1.08);
  if (!preferredLongAxis) {
    return { scrubbing: false, preferredLongAxis: null };
  }

  // 轨迹点大多仍贴同一类边
  let nearSame = 0;
  for (const p of trail) {
    if (getEdgeAlignmentHint(p, edgeBand * 1.2) === preferredLongAxis) nearSame += 1;
  }
  if (nearSame < trail.length * 0.65) {
    return { scrubbing: false, preferredLongAxis: null };
  }

  let pathLen = 0;
  let along = 0;
  let across = 0;
  for (let i = 1; i < trail.length; i += 1) {
    const ddx = trail[i].x - trail[i - 1].x;
    const ddz = trail[i].z - trail[i - 1].z;
    pathLen += Math.hypot(ddx, ddz);
    // preferredLongAxis 'z' = 贴左/右，沿边滑动主方向是 Z（画面上下）
    // preferredLongAxis 'x' = 贴上/下，沿边滑动主方向是 X
    if (preferredLongAxis === 'z') {
      along += Math.abs(ddz);
      across += Math.abs(ddx);
    } else {
      along += Math.abs(ddx);
      across += Math.abs(ddz);
    }
  }

  const a = trail[0];
  const b = trail[trail.length - 1];
  const net = Math.hypot(b.x - a.x, b.z - a.z);
  const scrubRatio = pathLen / Math.max(net, grid.cell * 0.12);
  const alongDominant = along > across * 1.15;
  const enoughMotion = pathLen > grid.cell * 0.32;
  // 来回刷（path>>net）或沿边持续滑动都算
  const scrubbing = alongDominant && enoughMotion && (scrubRatio > 1.35 || along > grid.cell * 0.45);

  return { scrubbing, preferredLongAxis: scrubbing ? preferredLongAxis : null };
}

/**
 * 拖拽趋势：
 * - hovering：几乎停住
 * - aiming：慢速对准（不必死停）
 * - edgeScrub：靠边来回/上下刷
 * - allowAssist：可参与自动转（非快甩）
 */
function getDragTrend(item, edgeBand = 0.28) {
  const trail = item.dragTrail;
  if (!trail || trail.length < 2) {
    return {
      speedCells: 0,
      dx: 0,
      dz: 0,
      hovering: true,
      aiming: true,
      edgeScrub: false,
      scrubAxis: null,
      allowAssist: true,
      axis: null
    };
  }
  const a = trail[0];
  const b = trail[trail.length - 1];
  const dt = Math.max(16, b.t - a.t);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const speedCells = (dist / Math.max(grid.cell, 1e-6)) / (dt / 1000);
  const hovering = speedCells < autoRotateHoverSpeedCells;
  const aiming = speedCells < autoRotateAimSpeedCells;
  let axis = null;
  if (dist > grid.cell * 0.12) {
    axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
  }
  const scrub = detectEdgeScrub(item, edgeBand);
  const allowAssist = hovering || aiming || scrub.scrubbing;
  return {
    speedCells,
    dx,
    dz,
    hovering,
    aiming,
    edgeScrub: scrub.scrubbing,
    scrubAxis: scrub.preferredLongAxis,
    allowAssist,
    axis
  };
}

function minRotationSteps(from, to) {
  const d = ((to - from) % 4 + 4) % 4;
  return Math.min(d, 4 - d);
}

/**
 * 悬停区域暗示的长轴方向：
 * 贴上/下沿 → 偏好横放 (x)；贴左/右沿 → 偏好竖放 (z)。
 * 例：竖条拖到箱顶停住 → preferredLongAxis = 'x' → 横过来。
 */
function getEdgeAlignmentHint(worldPosition, edgeBand = 0.28) {
  const u = (worldPosition.x - grid.left) / Math.max(grid.width, 1e-6);
  const v = (worldPosition.z - grid.top) / Math.max(grid.depth, 1e-6);
  const band = edgeBand;
  const nearLeft = u < band;
  const nearRight = u > 1 - band;
  const nearTop = v < band;
  const nearBottom = v > 1 - band;

  // 角点：取更贴的那条边
  if ((nearTop || nearBottom) && (nearLeft || nearRight)) {
    const edgeU = Math.min(u, 1 - u);
    const edgeV = Math.min(v, 1 - v);
    return edgeV <= edgeU ? 'x' : 'z';
  }
  if (nearTop || nearBottom) return 'x';
  if (nearLeft || nearRight) return 'z';
  return null;
}

function shapeLongAxis(shape) {
  const cols = shape[0].length;
  const rows = shape.length;
  if (cols === rows) return null;
  return cols > rows ? 'x' : 'z';
}

/** 提交前再验一次：旋转后必须合法可放，否则不转 */
function isPlacementStillValid(item, candidate) {
  if (!candidate?.shape || candidate.gx == null || candidate.gy == null) return false;
  return getPlacement(item, candidate.gx, candidate.gy, candidate.shape).valid;
}

/**
 * 手指到「脚印覆盖区域」的距离（不是脚印中心）。
 * 大件如 4×2 旋转后中心会偏很多，用中心距离会永远「不够近」导致无法帮转。
 * 手指在脚印矩形内 → 距离 0。
 */
function footprintDistanceSq(worldPosition, gx, gy, shape) {
  const cols = shape[0].length;
  const rows = shape.length;
  const minX = grid.left + gx * grid.cell;
  const maxX = grid.left + (gx + cols) * grid.cell;
  const minZ = grid.top + gy * grid.cell;
  const maxZ = grid.top + (gy + rows) * grid.cell;
  const cx = THREE.MathUtils.clamp(worldPosition.x, minX, maxX);
  const cz = THREE.MathUtils.clamp(worldPosition.z, minZ, maxZ);
  const dx = worldPosition.x - cx;
  const dz = worldPosition.z - cz;
  return dx * dx + dz * dz;
}

/** 大脚印允许略大的“够近”半径（比上一版收紧，防大件乱转） */
function autoRotateSnapLimitCells(baseCells, shape) {
  const span = Math.max(shape[0].length, shape.length, 1);
  return baseCells + Math.max(0, span - 1) * 0.18;
}

/** 脚印格数 / 跨度：4×2 等大件要更钝 */
function getItemFootprintBulk(item) {
  let maxCells = 0;
  let maxSpan = 0;
  for (let r = 0; r < 4; r += 1) {
    const shape = rotateShape(item.shape, r);
    let cells = 0;
    for (let y = 0; y < shape.length; y += 1) {
      for (let x = 0; x < shape[y].length; x += 1) {
        if (shape[y][x]) cells += 1;
      }
    }
    maxCells = Math.max(maxCells, cells);
    maxSpan = Math.max(maxSpan, shape[0].length, shape.length);
  }
  // 4×2=8 格、跨度≥4 视为大件
  const isLarge = maxCells >= 6 || maxSpan >= 4;
  return { maxCells, maxSpan, isLarge };
}

function getIntentCandidate(item, worldPosition) {
  const profile = getAutoRotateAssistProfile();
  const bulk = getItemFootprintBulk(item);
  const current = getCandidate(item, worldPosition);
  // 大件中心略出界时仍允许意图评估（大箱 pad 更小，更保守）
  if (!current.inside && !isNearBoxForIntent(worldPosition, profile.insidePad)) {
    clearAutoRotateIntent(item);
    return current;
  }

  const now = performance.now();
  const trend = getDragTrend(item, profile.edgeBand);
  // 刷边时用 scrub 边；否则用当前位置贴边
  const edgeHint = trend.scrubAxis
    || getEdgeAlignmentHint(worldPosition, profile.edgeBand);

  // 手动点转后短锁：只显示当前角，系统不反拧
  if (now < (item.manualLockUntil ?? 0)) {
    clearAutoRotateIntent(item);
    return current;
  }

  // 合法不抢：手指下当前角已合法则不换
  if (current.valid) {
    clearAutoRotateIntent(item);
    return current;
  }

  // 中/大箱：需瞄准态；快甩路过不转
  if (profile.requireAiming && !trend.allowAssist) {
    clearAutoRotateIntent(item);
    return current;
  }

  // 大件（4×2 等）：只认「停稳」或「明确刷边」，慢速晃动不够 → 防太敏捷
  if (bulk.isLarge && !trend.hovering && !trend.edgeScrub) {
    clearAutoRotateIntent(item);
    return current;
  }

  const cooldownMs = bulk.isLarge
    ? profile.cooldownMs * 1.35
    : profile.cooldownMs;
  if (now - (item.lastAutoRotationAt ?? 0) < cooldownMs) {
    return current;
  }

  // 只收集「转后 valid」的候选；一个都没有 → 不转
  const ranked = rankNearbyRotationCandidates(
    item,
    worldPosition,
    trend,
    edgeHint,
    profile,
    bulk
  );
  if (!ranked.length) {
    clearAutoRotateIntent(item);
    return current;
  }

  const best = ranked[0];
  const second = ranked[1];
  // 大件：几乎只用悬停/刷边的吸附，不用「慢速」那档宽松
  const aimingLike = bulk.isLarge
    ? (trend.hovering || trend.edgeScrub)
    : (trend.hovering || trend.aiming || trend.edgeScrub);
  const baseSnapCells = aimingLike
    ? profile.hoverMaxSnapCells
    : profile.maxSnapCells;
  const maxSnapCells = autoRotateSnapLimitCells(baseSnapCells, best.shape);
  let scoreMargin = aimingLike
    ? profile.hoverScoreMargin
    : profile.scoreMargin;
  // 大件提高分差门槛，减少「擦边就转」
  if (bulk.isLarge) scoreMargin = Math.max(scoreMargin, 0.55);
  const maxSnapDistanceSq = (grid.cell * maxSnapCells) ** 2;

  if (!best.valid || best.distanceSq > maxSnapDistanceSq) {
    clearAutoRotateIntent(item);
    return current;
  }

  // 大件始终要分差；小件唯一脚印可略放宽
  const uniqueOrient = !second || second.shapeKey === best.shapeKey;
  const needMargin = bulk.isLarge || !profile.uniqueSkipsMargin || !uniqueOrient;
  if (needMargin && second && best.score - second.score < scoreMargin) {
    clearAutoRotateIntent(item);
    return current;
  }
  if (best.rotation === item.rotation) {
    clearAutoRotateIntent(item);
    return current;
  }

  // 大件：确认 key 更稳——用 shapeKey + 粗网格，避免微移连转
  // 刷边：shapeKey+边；普通：shapeKey+粗分格
  let hoverCellKey;
  if (trend.edgeScrub && edgeHint) {
    hoverCellKey = `${best.shapeKey}:scrub:${edgeHint}`;
  } else if (bulk.isLarge) {
    hoverCellKey = `${best.shapeKey}:L:${Math.floor(best.gx / 2)},${Math.floor(best.gy / 2)},${best.baseLevel}`;
  } else {
    hoverCellKey = `${best.shapeKey}:${best.gx},${best.gy},${best.baseLevel}`;
  }
  if (item.autoRotateIntentKey !== hoverCellKey) {
    item.autoRotateIntentKey = hoverCellKey;
    item.autoRotateIntentSince = now;
    return current;
  }

  let dwellScale = 1;
  if (trend.edgeScrub) dwellScale = profile.dwellScrubScale;
  else if (trend.hovering || trend.aiming) dwellScale = profile.dwellHoverScale;
  // 大件：多停一会再转
  if (bulk.isLarge) dwellScale *= 1.45;
  const dwellNeed = profile.dwellMs * dwellScale;
  if (now - (item.autoRotateIntentSince ?? 0) < dwellNeed) {
    return current;
  }

  // 硬门：提交前再确认可放；不能放则不旋转
  if (!isPlacementStillValid(item, best)) {
    clearAutoRotateIntent(item);
    return current;
  }

  applyIntentRotation(item, best.rotation);
  item.lastAutoRotationAt = now;
  clearAutoRotateIntent(item);
  const confirmed = getCandidateForRotation(item, worldPosition, item.rotation);
  return confirmed.valid ? confirmed : best;
}

function clearAutoRotateIntent(item) {
  item.autoRotateIntentKey = null;
  item.autoRotateIntentSince = 0;
}

function shapeMatrixKey(shape) {
  return shape.map((row) => row.join('')).join('/');
}

function getAutoRotateKicks(shape, useLongKicks = true) {
  const kicks = AUTO_ROTATE_KICKS.map((pair) => pair.slice());
  if (useLongKicks && (shape[0].length >= 3 || shape.length >= 3)) {
    for (const pair of AUTO_ROTATE_KICKS_LONG) kicks.push(pair.slice());
  }
  return kicks;
}

/**
 * 其它「互异脚印」朝向在 kick 邻域内的合法落点。
 * 硬规则：仅 placement.valid；同一 shape 矩阵只保留最短步数 rotation。
 */
function rankNearbyRotationCandidates(
  item,
  worldPosition,
  trend = null,
  edgeHint = null,
  profile = null,
  bulk = null
) {
  const matches = [];
  const seen = new Set();
  const finalPlacement = item.finalIntentPlacement;
  const dragTrend = trend || getDragTrend(item);
  const assist = profile || getAutoRotateAssistProfile();
  const pieceBulk = bulk || getItemFootprintBulk(item);
  const preferredAxis = edgeHint !== undefined
    ? edgeHint
    : (dragTrend.hovering ? getEdgeAlignmentHint(worldPosition, assist.edgeBand) : null);
  const orients = getDistinctRotationOptions(item);

  for (const { rotation, shape, steps, key: shapeKey } of orients) {
    const snap = getSnapGridForShape(worldPosition, shape, assist.insidePad);
    // 大件仍可用长 kick 找到合法位，但得分更保守
    const longPiece = shape[0].length >= 3 || shape.length >= 3;
    const kickList = getAutoRotateKicks(shape, assist.useLongKicks || longPiece);
    const longAxis = shapeLongAxis(shape);

    for (const [dx, dy] of kickList) {
      const gx = snap.gx + dx;
      const gy = snap.gy + dy;
      const placement = getPlacement(item, gx, gy, shape);
      if (!placement.valid) continue;

      const footprintKey = getPlacementFootprintKey(gx, gy, shape, placement.baseLevel);
      const dedupeKey = `${shapeKey}:${footprintKey}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // 用脚印区域距离，不用几何中心（大件才能转得过来）
      const distanceSq = footprintDistanceSq(worldPosition, gx, gy, shape);
      const distCells = Math.sqrt(distanceSq) / Math.max(grid.cell, 1e-6);
      let score = -autoRotateDistWeight * distCells;

      // 优先 ±90° 最短步数
      score -= autoRotateStepPenalty * steps;

      // 贴边意图：大件权重更低，避免扫一下就贴边转
      const edgeIntent = pieceBulk.isLarge
        ? (dragTrend.edgeScrub || dragTrend.hovering)
        : (dragTrend.edgeScrub || dragTrend.hovering || dragTrend.aiming);
      if (edgeIntent && preferredAxis && longAxis) {
        const onFinger = dx === 0 && dy === 0;
        const weight = dragTrend.edgeScrub ? 1.0 : (onFinger ? 0.85 : 0.4);
        const edgeW = pieceBulk.isLarge ? assist.edgeBonus * 0.55 : assist.edgeBonus;
        if (longAxis === preferredAxis) score += edgeW * weight;
        else score -= edgeW * 0.3 * weight;
      }

      // kick0 合法
      if (dx === 0 && dy === 0) {
        if (dragTrend.edgeScrub) score += pieceBulk.isLarge ? 0.25 : 0.45;
        else if (dragTrend.hovering) score += pieceBulk.isLarge ? 0.2 : 0.45;
        else if (!pieceBulk.isLarge && dragTrend.aiming) score += 0.35;
      }

      // 手指在脚印内：大件只给轻量分（之前 +0.9 太容易连转）
      if (distanceSq < 1e-8) {
        score += pieceBulk.isLarge ? 0.2 : 0.75;
      }

      // 大件：远离 snap 中心的 kick 降权，减少「远处合法就抢转」
      if (pieceBulk.isLarge && (Math.abs(dx) + Math.abs(dy) >= 2)) {
        score -= 0.35;
      }

      // 移动趋势：大件不在慢速晃时用趋势加分（避免敏捷）
      if (
        !pieceBulk.isLarge
        && !dragTrend.edgeScrub
        && !dragTrend.hovering
        && dragTrend.axis
        && longAxis
      ) {
        if (longAxis === dragTrend.axis) score += autoRotateTrendBonus;
        else score -= autoRotateTrendBonus * 0.5;
      }

      if (finalPlacement && rotation === finalPlacement.rotation) {
        score += pieceBulk.isLarge ? autoRotateFinalBonus * 0.5 : autoRotateFinalBonus;
      }

      matches.push({
        gx,
        gy,
        shape,
        rotation,
        shapeKey,
        steps,
        inside: true,
        distanceSq,
        score,
        valid: true,
        baseLevel: placement.baseLevel
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.distanceSq - b.distanceSq || a.steps - b.steps);
  return matches;
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

/** 将 to 折到离 from 最近的等价角（允许正负，最短路径） */
function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function canonicalRotationY(rotation) {
  return -((rotation % 4) + 4) % 4 * Math.PI / 2;
}

function setItemRotationTarget(item, rotation) {
  const canonical = canonicalRotationY(rotation);
  const current = item.mesh?.rotation?.y ?? item.targetRotationY ?? 0;
  // 相对当前姿态走最小角（如 0→3 用 +90° 而非 -270°）
  item.targetRotationY = current + shortestAngleDelta(current, canonical);
}

function setItemRotationImmediate(item, rotation) {
  const angle = canonicalRotationY(rotation);
  item.targetRotationY = angle;
  item.mesh.rotation.y = angle;
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
  const boardScale = getBoardItemScale();
  item.mesh.position.copy(gridToWorld(next.gx, next.gy, next.shape));
  item.mesh.position.y = getBoardItemY(item, boardScale, next.baseLevel);
  setItemScale(item, boardScale);
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
    const boardScale = getBoardItemScale();
    activeItem.mesh.position.copy(gridToWorld(activeItem.gridX, activeItem.gridY, shape));
    activeItem.mesh.position.y = getBoardItemY(activeItem, boardScale, activeItem.level);
    setItemScale(activeItem, boardScale);
    setItemShadow(activeItem, true);
    return;
  }

  activeItem.mesh.position.copy(activeItem.homePosition);
  activeItem.mesh.position.y = getTableItemY(activeItem, trayScale);
  activeItem.rotation = activeItem.trayRotation ?? activeItem.dragStartRotation ?? activeItem.rotation;
  setItemRotationImmediate(activeItem, activeItem.rotation);
  // 放回待放区：平滑缩回预览尺寸
  setItemScaleTarget(activeItem, trayScale);
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
  const shape = next.shape;
  const height = 0.045;
  const ghostColor = next.valid ? '#22c55e' : '#ef4444';
  const mat = new THREE.MeshBasicMaterial({
    color: ghostColor,
    transparent: true,
    opacity: next.hint ? 0.36 : 0.58,
    depthWrite: false
  });
  const origin = gridToWorld(next.gx, next.gy, shape);
  const y = getBoardSurfaceY() + next.baseLevel * grid.levelHeight + 0.035;
  const cell = grid.cell;
  const inset = 0.08;

  const geometry = createSolidPolyominoGeometry(shape, cell, height, inset);

  const ghost = new THREE.Mesh(geometry, mat);
  ghost.position.set(origin.x, y, origin.z);
  ghostGroup.add(ghost);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
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
  const solution = solveRemainingPlacements();
  if (!solution) return null;

  for (const item of trayQueue.slice(0, trayVisibleCount)) {
    if (item.placed) continue;
    const target = solution.get(item.id);
    if (!target) continue;
    const shape = rotateShape(item.shape, target.rotation);
    const placement = getPlacement(item, target.gx, target.gy, shape);
    if (!placement.valid || placement.baseLevel !== target.baseLevel) continue;
    return {
      gx: target.gx,
      gy: target.gy,
      shape,
      rotation: target.rotation,
      item,
      hint: true,
      inside: true,
      ...placement
    };
  }
  return null;
}

function solveRemainingPlacements() {
  const voxelGrid = buildVoxelGrid();
  const remaining = trayQueue.filter((item) => !item.placed);
  const solution = new Map();

  const solve = (index) => {
    if (index >= remaining.length) return true;
    const item = remaining[index];
    for (const candidate of getSolverCandidates(item, voxelGrid)) {
      writeVirtualPlacement(voxelGrid, item, candidate, item.id);
      solution.set(item.id, candidate);
      if (solve(index + 1)) return true;
      solution.delete(item.id);
      writeVirtualPlacement(voxelGrid, item, candidate, null);
    }
    return false;
  };

  return solve(0) ? solution : null;
}

function getSolverCandidates(item, voxelGrid) {
  const candidates = [];
  const seen = new Set();
  const preferred = getDesignedHintPlacement(item);

  for (let rotation = 0; rotation < 4; rotation += 1) {
    const shape = rotateShape(item.shape, rotation);
    const maxX = grid.cols - shape[0].length;
    const maxY = grid.rows - shape.length;
    for (let gy = 0; gy <= maxY; gy += 1) {
      for (let gx = 0; gx <= maxX; gx += 1) {
        const baseLevel = getVirtualBaseLevel(voxelGrid, item, gx, gy, shape);
        if (baseLevel === null) continue;
        const key = `${rotation}:${getPlacementFootprintKey(gx, gy, shape, baseLevel)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const candidate = { gx, gy, baseLevel, rotation, shape };
        candidate.priority = getHintCandidatePriority(candidate, preferred);
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority || a.baseLevel - b.baseLevel || a.gy - b.gy || a.gx - b.gx);
  return candidates;
}

function getDesignedHintPlacement(item) {
  if (level.keyItem !== item.id || !level.keyPlacement) return null;
  return {
    gx: level.keyPlacement.gx ?? 0,
    gy: level.keyPlacement.gy ?? 0,
    baseLevel: level.keyPlacement.level ?? level.keyPlacement.baseLevel ?? 0,
    rotation: level.keyPlacement.rotation ?? 0
  };
}

function getHintCandidatePriority(candidate, preferred) {
  if (!preferred) return 1;
  return candidate.gx === preferred.gx
    && candidate.gy === preferred.gy
    && candidate.baseLevel === preferred.baseLevel
    && candidate.rotation === preferred.rotation
    ? 0
    : 1;
}

function getVirtualBaseLevel(voxelGrid, item, gx, gy, shape) {
  const itemHeight = getItemHeight(item);
  if (!isShapeInsideGrid(gx, gy, shape)) return null;

  for (let baseLevel = 0; baseLevel <= grid.levels - itemHeight; baseLevel += 1) {
    if (!isVoxelSpaceEmpty(voxelGrid, gx, gy, baseLevel, shape, itemHeight)) continue;
    if (!hasFullSupport(voxelGrid, gx, gy, baseLevel, shape)) continue;
    return baseLevel;
  }
  return null;
}

function isShapeInsideGrid(gx, gy, shape) {
  if (gx < 0 || gy < 0) return false;
  if (gx + shape[0].length > grid.cols) return false;
  if (gy + shape.length > grid.rows) return false;
  return true;
}

function writeVirtualPlacement(voxelGrid, item, candidate, value) {
  const itemHeight = getItemHeight(item);
  for (let y = 0; y < candidate.shape.length; y += 1) {
    for (let x = 0; x < candidate.shape[y].length; x += 1) {
      if (!candidate.shape[y][x]) continue;
      for (let level = candidate.baseLevel; level < candidate.baseLevel + itemHeight; level += 1) {
        voxelGrid[level][candidate.gy + y][candidate.gx + x] = value;
      }
    }
  }
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
  const boardScale = getBoardItemScale();
  endPosition.y = getBoardItemY(item, boardScale, hint.baseLevel);

  hintMove = {
    item,
    placement: hint,
    startTime: performance.now(),
    duration: 650,
    startPosition: item.mesh.position.clone(),
    endPosition,
    startScale: item.mesh.scale.x,
    endScale: boardScale
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
  const yScale = THREE.MathUtils.lerp(startScale, endScale, phase) + liftScale * 0.06;
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
  if (item) rotateItemByTap(item);
}

function rotateItemByTap(item) {
  if (!item || gamePhase !== 'play' || isGameplayLocked()) return;
  clearHint();
  const previous = item.rotation;
  item.rotation = (item.rotation + 1) % 4;
  setItemRotationTarget(item, item.rotation);
  item.manualLockUntil = performance.now() + manualLockMs;
  clearAutoRotateIntent(item);

  if (item === activeItem) {
    candidate = getCandidate(item, item.mesh.position);
    showGridGuide(candidate?.baseLevel ?? 0);
    updateGhost(candidate);
    return;
  }

  if (!item.placed) {
    item.trayRotation = item.rotation;
    item.finalIntentPlacement = null;
    layoutTrayQueue({ animate: true });
    return;
  }

  const shape = rotateShape(item.shape, item.rotation);
  if (canPlace(item, item.gridX, item.gridY, shape)) {
    const placement = getPlacement(item, item.gridX, item.gridY, shape);
    item.mesh.position.copy(gridToWorld(item.gridX, item.gridY, shape));
    item.level = placement.baseLevel;
    const boardScale = getBoardItemScale();
    item.mesh.position.y = getBoardItemY(item, boardScale, item.level);
    setItemScale(item, boardScale);
    refreshStatus();
  } else {
    item.rotation = previous;
    setItemRotationTarget(item, item.rotation);
  }
}

function resetLevel() {
  stopGameplayInteraction();
  completionShown = false;
  undoStack = [];
  trayQueue = [...items];
  for (const item of items) {
    item.rotation = item.trayRotation ?? getCompactTrayRotation(item);
    item.placed = false;
    item.gridX = null;
    item.gridY = null;
    item.level = null;
    item.lastValid = null;
    item.trayVisible = false;
    item.targetPosition = null;
    item.finalIntentPlacement = null;
    setItemRotationImmediate(item, item.rotation);
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
    item.placed = state.placed;
    item.rotation = state.placed ? state.rotation : item.trayRotation ?? getCompactTrayRotation(item);
    item.gridX = state.gridX;
    item.gridY = state.gridY;
    item.level = state.level;
    item.lastValid = state.lastValid;
    item.finalIntentPlacement = null;
    item.dragStartRotation = null;
    setItemRotationImmediate(item, item.rotation);
    setItemScale(item, item.placed ? getBoardItemScale() : trayScale);
    setItemShadow(item, true);

    if (item.placed) {
      const shape = rotateShape(item.shape, item.rotation);
      const boardScale = getBoardItemScale();
      item.mesh.visible = true;
      item.mesh.position.copy(gridToWorld(item.gridX, item.gridY, shape));
      item.mesh.position.y = getBoardItemY(item, boardScale, item.level);
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
    // 每帧再取最短角，避免跨 ±π 时走远路
    const delta = shortestAngleDelta(item.mesh.rotation.y, item.targetRotationY);
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
  return BOARD_SURFACE_Y;
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
  // 多关卡下默认值按当前箱体重新 fit，而不是死锁 5×5 构图
  fitCameraToBox();
  for (const input of cameraControlsEl.querySelectorAll('[data-camera-key]')) {
    const key = input.dataset.cameraKey;
    input.value = cameraRig[key];
    syncCameraPanelValue(key);
  }
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
  updateScaleAnimations();
  renderer.render(scene, camera);
}
