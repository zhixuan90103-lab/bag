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
/** false 时完整保留 3 槽现网行为；true 启用 A2 全量可滑托盘（v2） */
const A2_FULL_TRAY_SCROLL = true;
const trayVisibleCount = 3;
/** 旧三槽中心；A2 v2 用 pitch 复现「一屏 3 件居中」 */
const traySlotXs = [-1.55, 0, 1.55];
const TRAY_SLOT_PITCH = traySlotXs[1] - traySlotXs[0]; // 1.55
const trayMinGap = 0.24;
const trayZ = 4.85;
const trayEntryOffsetX = 1.15;
const trayLerpAlpha = 0.18;
/**
 * 滑/拖消歧（点在物品上：优先拖；空白处：只滑）
 * - 物品上：几乎纯横才 scroll；有上提分量即 drag
 * - 空白：一律 scroll
 */
const TRAY_COMMIT_SLOP_ON_ITEM_PX = 12;
const TRAY_COMMIT_SLOP_EMPTY_PX = 14;
/** 点在物品上：横向必须非常明显才判 scroll */
const TRAY_SCROLL_PURE_RATIO = 1.9;
const TRAY_TAP_MAX_MS = 320;
const TRAY_SCROLL_VELOCITY_FRICTION = 6.5;
const TRAY_SCROLL_VELOCITY_EPS = 0.02;
/**
 * 橡皮筋：最多约 1 件长；跟手系数随越界增大而变小（先松后紧）
 * pull(0)≈0.92 → pull(满)≈0.18
 */
const TRAY_RUBBER_MAX = TRAY_SLOT_PITCH;
const TRAY_RUBBER_PULL_START = 0.92;
const TRAY_RUBBER_PULL_END = 0.18;
const TRAY_RUBBER_STIFFNESS = 48;
const TRAY_RUBBER_DAMPING = 9;
/** 淡出带：三槽全显，外侧渐隐（无 hard hide 闪现） */
const TRAY_FADE_START = TRAY_SLOT_PITCH + 0.7;
const TRAY_FADE_END = TRAY_SLOT_PITCH * 2 + 0.4;
const rotationLerpAlpha = 0.12;
const defaultDragMotionTuning = {
  visualOffsetY: 112,
  moveGainX: 1.3,
  moveGainZ: 1.85,
  boxClearance: 0.18
};
const dragMotionTuning = { ...defaultDragMotionTuning };
const PICKUP_INTENT_RADIUS_PX = 56;
const PICKUP_SMALL_ITEM_RADIUS_PX = 72;
const PICKUP_DISTANCE_WEIGHT = 1;
const PICKUP_TRAY_VISIBLE_BONUS = 0.35;
const PICKUP_INSIDE_RECT_BONUS = 0.25;
const PICKUP_SWITCH_MARGIN = 0.2;
/**
 * 意图自动转角 · 场景表驱动（见 resolveIntentScenario / getIntentCandidate）
 *
 * 调参优先级（只改当前层，禁止用下层补偿上层）：
 *   P0 硬红线 → P1 格子置信 → P2 场景档 → P3 手势 → P4 时延 → P5 防反拧
 * 调「最后一块/强唯一更早」→ 只改 INTENT_SCENARIOS.lastMust | unique*
 * 调「普通 Hot」→ 只改 hotSoft；禁止 if (channel==='hot') 一把抓
 * 详：docs/research/INTENT-PARAM-PRIORITY.md
 */
/**
 * 手动旋转仅限物品区短点；拖中/箱内无手动转。
 * 托盘点转后写入 anchor，进箱意图改角须过更高门槛（见 decideIntentRotation）。
 */
const manualLockMs = 800;
/** 托盘声明角：非 eager 场景不得拧走；eager 须停稳/刷边 */
const TRAY_CHOICE_OVERRIDE_SCENARIOS = new Set(['lastMust', 'uniqueBoard', 'uniqueRegionHard']);
/**
 * Ghost 首次进棋盘冷静期（仅 warm/cold 场景吃；场景表 skipEntryGrace 可跳过）
 */
const assistBoxEntryGraceMs = 580;
/** 托盘/上拖入箱钝化保持（仅 cold/warm 场景） */
const assistEntryFromBottomDampenMs = 950;
const autoRotateDistWeight = 3;
const autoRotateFinalBonus = 0.45;
const autoRotateStepPenalty = 0.4;
/** 多朝向消歧：移动方向加分（不单独触发） */
const autoRotateMotionDirBonus = 0.38;
const autoRotateMotionConfidenceMin = 0.72;

/**
 * P5 防反拧（与「第一次帮转多早」隔离：只约束换到另一角）
 * 调抖/粘 → 只改本组，不要动 scenarios 的 dwellCap。
 */
const INTENT_ANTI_REVERSE = {
  commitLockMs: 1100,
  minMoveCells: 0.55,
  /** 反拧须停稳或刷边（慢滑不够） */
  requireSettledOrScrub: true,
  /** 反拧额外 dwell 下限 ms */
  minDwellMs: 300,
  dwellMul: 1.75
};

/**
 * P3 速度分档（格/秒）——可调；与场景表独立。
 *   settled < slowSlideMax < normalMax ≤ fast
 */
const defaultSpeedTuning = {
  settled: 0.38,
  slowSlideMax: 0.82,
  normalMax: 1.6,
  axisConfidence: 0.62
};
const speedTuning = { ...defaultSpeedTuning };
function getSettledSpeedCells() { return speedTuning.settled; }
function getSlowSlideMaxCells() { return speedTuning.slowSlideMax; }
function getNormalMaxCells() { return speedTuning.normalMax; }
function getSlowSlideAxisConfidence() { return speedTuning.axisConfidence; }

/** Warm 分差：绝对领先 ≥ max(margin×mul, floor) */
const autoRotateWarmMarginMul = 1.35;
const autoRotateWarmLeadFloor = 0.48;

/** 近端位移超过此值视为「在挪」；抗手指微抖 */
const autoRotateRelocateTrailCells = 0.32;
const autoRotateTrailMs = 420;
const autoRotateTrailMax = 18;

/**
 * P2+P4 场景表：每场景独立 gesture / dwell / cooldown。
 * gesture:
 *   notFast  — 仅拦 fast（eager：强唯一 / 最后一块）
 *   aiming   — 停稳|慢滑|刷边（普通 Hot）
 *   warm     — 停稳|慢滑|刷边
 *   cold     — 停稳|刷边 + lateral/大件规则
 */
const INTENT_SCENARIOS = {
  /** 最后一块必须转：尽早 */
  lastMust: {
    id: 'lastMust',
    channel: 'hot',
    gesture: 'notFast',
    skipEntryGrace: true,
    skipEntryDampen: true,
    skipFirstAssistMul: true,
    globalDwellMul: 1,
    cooldownMul: 0.14,
    dwellCapSettledMs: 40,
    dwellCapMovingMs: 55,
    hotDwell: { settled: 0.14, slowSlide: 0.18, other: 0.22 },
    lastPieceDwellMul: 0.14,
    allowCommitOverride: true,
    farHot: true,
    eager: true
  },
  /** 全盘只剩一种其它脚印 */
  uniqueBoard: {
    id: 'uniqueBoard',
    channel: 'hot',
    gesture: 'notFast',
    skipEntryGrace: true,
    skipEntryDampen: true,
    skipFirstAssistMul: true,
    globalDwellMul: 1,
    cooldownMul: 0.32,
    dwellCapSettledMs: 45,
    dwellCapMovingMs: 65,
    hotDwell: { settled: 0.18, slowSlide: 0.24, other: 0.30 },
    allowCommitOverride: false,
    farHot: true,
    eager: true
  },
  /** 邻域唯一 + 当前 snap0 已红（长条贴槽等） */
  uniqueRegionHard: {
    id: 'uniqueRegionHard',
    channel: 'hot',
    gesture: 'notFast',
    skipEntryGrace: true,
    skipEntryDampen: true,
    skipFirstAssistMul: true,
    globalDwellMul: 1,
    cooldownMul: 0.35,
    dwellCapSettledMs: 48,
    dwellCapMovingMs: 70,
    hotDwell: { settled: 0.18, slowSlide: 0.24, other: 0.30 },
    allowCommitOverride: false,
    farHot: false,
    eager: true
  },
  /** 普通 Hot：保持 16:00 基线手感，不硬顶极短 dwell */
  hotSoft: {
    id: 'hotSoft',
    channel: 'hot',
    gesture: 'aiming',
    skipEntryGrace: true,
    skipEntryDampen: true,
    skipFirstAssistMul: true,
    globalDwellMul: 1,
    cooldownMul: 0.5,
    dwellCapSettledMs: null,
    dwellCapMovingMs: null,
    hotDwell: { settled: 0.28, slowSlide: 0.38, other: 0.45 },
    allowCommitOverride: false,
    farHot: false,
    eager: false
  },
  warm: {
    id: 'warm',
    channel: 'warm',
    gesture: 'warm',
    skipEntryGrace: false,
    skipEntryDampen: false,
    skipFirstAssistMul: false,
    firstAssistMul: 1.4,
    globalDwellMul: 1.08,
    cooldownMul: 0.62,
    dwellCapSettledMs: null,
    dwellCapMovingMs: null,
    warmDwell: { settled: 0.72, slowSlide: 1.0, other: 1.1 },
    allowCommitOverride: false,
    farHot: false,
    eager: false
  },
  cold: {
    id: 'cold',
    channel: 'cold',
    gesture: 'cold',
    skipEntryGrace: false,
    skipEntryDampen: false,
    skipFirstAssistMul: false,
    firstAssistMul: 1.28,
    globalDwellMul: 1.08,
    cooldownMul: 1,
    dwellCapSettledMs: null,
    dwellCapMovingMs: null,
    allowCommitOverride: false,
    farHot: false,
    eager: false
  }
};

// 兼容旧名
const assistCommitLockMs = INTENT_ANTI_REVERSE.commitLockMs;
const assistFirstRotateDwellMulWarm = INTENT_SCENARIOS.warm.firstAssistMul;
const assistFirstRotateDwellMulCold = INTENT_SCENARIOS.cold.firstAssistMul;
const assistGlobalDwellMul = 1.08;

/** URL 带 ?intentDebug=1 时显示速度档 / 通道，便于对照「我算快还是慢」 */
const intentDebugEnabled = new URLSearchParams(window.location.search).has('intentDebug');
let intentDebugEl = null;
if (intentDebugEnabled) {
  intentDebugEl = document.createElement('div');
  intentDebugEl.id = 'intentDebug';
  intentDebugEl.className = 'intent-debug';
  intentDebugEl.textContent = 'intentDebug：拖动物品查看';
  document.body.appendChild(intentDebugEl);
}

const DRAG_SPEED_BAND_UI = {
  settled: {
    title: '慢速 · 停稳',
    detail: '物品几乎不动，系统视为对准',
    tone: 'slow'
  },
  slowSlide: {
    title: '慢速 · 微调',
    detail: '很慢地挪，系统视为对准中',
    tone: 'slow'
  },
  normal: {
    title: '快速 · 正常挪',
    detail: '在换位置，系统不帮转',
    tone: 'fast'
  },
  fast: {
    title: '快速 · 快甩',
    detail: '甩动路过，系统不帮转',
    tone: 'fast'
  }
};

/** 顶部快慢提示：暂时隐藏（改 true 可恢复） */
const SHOW_DRAG_SPEED_HUD = false;
/** Speed 快慢调参面板：暂时隐藏（改 true 可恢复） */
const SHOW_SPEED_PANEL = false;

/** 顶部：当前拖拽是快速还是慢速操作 */
function updateDragSpeedHud(item) {
  if (!dragSpeedHudEl || !dragSpeedValueEl || !dragSpeedDetailEl) return;
  if (!SHOW_DRAG_SPEED_HUD || !item) {
    dragSpeedHudEl.hidden = true;
    dragSpeedHudEl.dataset.tone = '';
    return;
  }
  const trend = getDragTrend(item);
  const band = trend.speedBand || 'settled';
  const ui = DRAG_SPEED_BAND_UI[band] || DRAG_SPEED_BAND_UI.normal;
  const v = (trend.speedCells || 0).toFixed(2);
  dragSpeedHudEl.hidden = false;
  dragSpeedHudEl.dataset.tone = ui.tone;
  dragSpeedValueEl.textContent = ui.title;
  dragSpeedDetailEl.textContent = `${ui.detail} · ${v} 格/秒`;
}

function updateIntentDebugHud(item, channel = null) {
  updateDragSpeedHud(item);
  if (!intentDebugEl) return;
  if (!item) {
    intentDebugEl.textContent = 'intentDebug：未拖拽';
    return;
  }
  const trend = getDragTrend(item);
  const v = (trend.speedCells || 0).toFixed(2);
  const vr = (trend.speedCellsRecent || 0).toFixed(2);
  const ch = channel || item.lastIntentChannel || '-';
  const sc = item.lastIntentScenario || '-';
  const bandLabel = {
    settled: '停稳',
    slowSlide: '慢滑',
    normal: '正常挪',
    fast: '快甩'
  }[trend.speedBand] || trend.speedBand;
  const lines = [
    `场景: ${sc} | 通道: ${ch}`,
    `速度档: ${bandLabel} (${trend.speedBand})`,
    `速度: ${v} 格/秒 (近端 ${vr})`,
    `阈值: 停<${speedTuning.settled} | 慢<${speedTuning.slowSlideMax} | 常<${speedTuning.normalMax}`,
    `对准帮转: ${trend.allowRotateAssist ? '是' : '否'}`,
    `左右平移: ${trend.lateralCarry ? '是' : '否'}  还在挪: ${trend.relocating ? '是' : '否'}`,
    `进箱解锁: ${item.assistBoxUnlocked ? '是' : '否'}`
  ];
  intentDebugEl.textContent = lines.join('\n');
}

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
      /** 目标区域 R 半径（格）；大箱收紧防空旷层乱转 */
      regionRadiusCells: 1.05,
      scoreMargin: 0.55,
      hoverScoreMargin: 0.5,
      insidePad: 1.0,
      edgeBand: 0.24,
      edgeBonus: 0.35,
      requireAiming: true,
      dwellHoverScale: 0.78,
      dwellScrubScale: 0.68,
      useLongKicks: false,
      motionDirWeight: 0.45
    };
  }

  if (tier === 'medium') {
    return {
      tier,
      dwellMs: 320,
      cooldownMs: 460,
      maxSnapCells: 0.65,
      hoverMaxSnapCells: 0.85,
      regionRadiusCells: 1.25,
      scoreMargin: 0.5,
      hoverScoreMargin: 0.42,
      insidePad: 1.15,
      edgeBand: 0.28,
      edgeBonus: 0.4,
      requireAiming: true,
      dwellHoverScale: 0.75,
      dwellScrubScale: 0.64,
      useLongKicks: true,
      motionDirWeight: 0.7
    };
  }

  // small：慢速略跟手，仍须停稳/慢滑
  return {
    tier,
    dwellMs: 330,
    cooldownMs: 450,
    maxSnapCells: 0.68,
    hoverMaxSnapCells: 0.82,
    regionRadiusCells: 1.15,
    scoreMargin: 0.5,
    hoverScoreMargin: 0.45,
    insidePad: 1.1,
    edgeBand: 0.2,
    edgeBonus: 0.28,
    requireAiming: true,
    dwellHoverScale: 0.8,
    dwellScrubScale: 0.72,
    useLongKicks: true,
    motionDirWeight: 0.4
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
  <div id="dragSpeedHud" class="drag-speed-hud" hidden aria-live="polite">
    <span class="drag-speed-hud__kicker">当前操作</span>
    <strong id="dragSpeedValue">—</strong>
    <span id="dragSpeedDetail" class="drag-speed-hud__detail"></span>
  </div>
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

const speedPanel = document.createElement('aside');
speedPanel.className = 'camera-panel speed-panel';
speedPanel.hidden = !SHOW_SPEED_PANEL;
speedPanel.innerHTML = `
  <div class="camera-panel__head">
    <strong>Speed 快慢</strong>
    <button id="speedResetBtn" type="button">重置</button>
  </div>
  <p class="speed-panel__hint">单位：物品移动 · 格/秒<br/>停稳 &lt; 慢滑上限 &lt; 正常上限 ≤ 快甩</p>
  <div class="camera-grid" id="speedControls"></div>
`;
document.body.appendChild(speedPanel);

const dragMotionPanelToggle = document.createElement('button');
dragMotionPanelToggle.id = 'dragMotionPanelToggle';
dragMotionPanelToggle.className = 'drag-motion-toggle';
dragMotionPanelToggle.type = 'button';
dragMotionPanelToggle.textContent = 'Drag';
document.body.appendChild(dragMotionPanelToggle);

const dragMotionPanel = document.createElement('aside');
dragMotionPanel.className = 'camera-panel drag-motion-panel';
dragMotionPanel.hidden = true;
dragMotionPanel.innerHTML = `
  <div class="camera-panel__head">
    <strong>Drag 映射</strong>
    <button id="dragMotionResetBtn" type="button">重置</button>
  </div>
  <p class="speed-panel__hint">手机实时调参：Z 越大，向上滑动越省力。</p>
  <div class="camera-grid" id="dragMotionControls"></div>
`;
document.body.appendChild(dragMotionPanel);

const canvas = document.querySelector('#game');
const orderTitleEl = document.querySelector('#orderTitle');
const statusEl = document.querySelector('#status');
const dragSpeedHudEl = document.querySelector('#dragSpeedHud');
const dragSpeedValueEl = document.querySelector('#dragSpeedValue');
const dragSpeedDetailEl = document.querySelector('#dragSpeedDetail');
const toastEl = document.querySelector('#toast');
const settlePanel = document.querySelector('#settlePanel');
const settleTitleEl = document.querySelector('#settleTitle');
const settleSubEl = document.querySelector('#settleSub');
const nextLevelBtn = document.querySelector('#nextLevelBtn');
const replayBtn = document.querySelector('#replayBtn');
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
const speedControlsEl = document.querySelector('#speedControls');
const speedResetBtn = document.querySelector('#speedResetBtn');
const dragMotionControlsEl = document.querySelector('#dragMotionControls');
const dragMotionResetBtn = document.querySelector('#dragMotionResetBtn');

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
/** 拖拽中手中物品透明度（略透，便于看清脚下 ghost） */
const DRAG_ITEM_OPACITY = 0.8;
/** 遮挡落点 ghost 的已放块半透明（后方落点被高块挡住时） */
const OCCLUDER_ITEM_OPACITY = 0.68;
/** ghost 观感强度（与原先一致） */
const GHOST_FILL_OPACITY = 0.58;
const GHOST_HINT_FILL_OPACITY = 0.36;
const GHOST_EDGE_OPACITY = 0.95;
/** 超高/顶层不可放时，整面顶格红色提示（必须弱于红色 ghost） */
const TOP_BLOCK_GRID_FILL_OPACITY = 0.22;
const TOP_BLOCK_GRID_LINE_OPACITY = 0.4;
const TOP_BLOCK_GRID_BORDER_OPACITY = 0.48;
/** 当前因遮挡 ghost 而被淡化的已放物品 */
const fadedOccluderItems = new Set();
/** 网格引导材质引用（rebuildBoard 时重建） */
let gridGuideFillMat = null;
let gridGuideLineMat = null;
let gridGuideBorderMat = null;
let gridGuideHeightMat = null;

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
const pickupProjectionBox = new THREE.Box3();
const pickupProjectionPoint = new THREE.Vector3();

let items = [];
let trayQueue = [];
let activeItem = null;
let dragOffset = new THREE.Vector3();
let dragStartHit = new THREE.Vector3();
let dragStartPosition = new THREE.Vector3();
let candidate = null;
let pendingPointerItem = null;
let pendingPointerId = null;
let pendingPointerStart = { x: 0, y: 0 };
let pendingPointerEvent = null;
let activePointerId = null;
const DRAG_START_THRESHOLD_PX = 10;
/** A2 托盘手势：idle | pending | scroll | drag */
let trayPointerMode = 'idle';
let trayScrollOffsetX = 0;
/** 未加 scroll 的条上中心 X（与 trayQueue 对齐） */
let trayBaseCenters = [];
let trayContentMinX = 0;
let trayContentMaxX = 0;
let trayScrollVelocity = 0;
let trayScrollLastClientX = 0;
let trayScrollLastClientY = 0;
let trayScrollLastTime = 0;
let trayPendingStartTime = 0;
const trayScrollRayPoint = new THREE.Vector3();
const trayScrollRayPrev = new THREE.Vector3();
const trayScrollPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
/** 须在首次 animate() 调用前初始化（避免 TDZ） */
let lastFrameTime = performance.now();
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
initSpeedPanel();
initDragMotionPanel();
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
  gridGuideFillMat = null;
  gridGuideLineMat = null;
  gridGuideBorderMat = null;
  gridGuideHeightMat = null;
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
  gridGuideFillMat = new THREE.MeshBasicMaterial({
    color: '#9ca3af',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const guideFill = new THREE.Mesh(
    new THREE.PlaneGeometry(grid.width, grid.depth),
    gridGuideFillMat
  );
  guideFill.rotation.x = -Math.PI / 2;
  guideFill.position.y = 0.072;
  gridGuideGroup.add(guideFill);

  gridGuideLineMat = new THREE.LineBasicMaterial({
    color: '#6b7280',
    transparent: true,
    opacity: 0.82
  });
  for (let c = 0; c <= grid.cols; c += 1) {
    const x = grid.left + c * grid.cell;
    addLine(x, grid.top, x, grid.top + grid.depth, gridGuideLineMat);
  }
  for (let r = 0; r <= grid.rows; r += 1) {
    const z = grid.top + r * grid.cell;
    addLine(grid.left, z, grid.left + grid.width, z, gridGuideLineMat);
  }
  gridGuideBorderMat = new THREE.LineBasicMaterial({
    color: '#4b5563',
    transparent: true,
    opacity: 0.94
  });
  addLine(grid.left, grid.top, grid.left + grid.width, grid.top, gridGuideBorderMat);
  addLine(grid.left + grid.width, grid.top, grid.left + grid.width, grid.top + grid.depth, gridGuideBorderMat);
  addLine(grid.left + grid.width, grid.top + grid.depth, grid.left, grid.top + grid.depth, gridGuideBorderMat);
  addLine(grid.left, grid.top + grid.depth, grid.left, grid.top, gridGuideBorderMat);

  resetBoxRigPose();
}

function initTray() {
  // v2：无视觉托盘轨/挡块；边界只靠滚动橡皮筋
  trayGroup.clear();
}

function releasePointerCaptureSafe(pointerId = null) {
  try {
    if (pointerId != null && canvas.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  } catch {
    /* ignore */
  }
}

function stopGameplayInteraction() {
  releasePointerCaptureSafe(pendingPointerId);
  releasePointerCaptureSafe(activePointerId);
  pendingPointerItem = null;
  pendingPointerId = null;
  pendingPointerStart = null;
  pendingPointerEvent = null;
  activePointerId = null;
  if (activeItem) {
    restoreActiveItem();
    setItemOpacity(activeItem, 1);
    activeItem = null;
    candidate = null;
  }
  clearHint();
  hintMove = null;
  hideGridGuide();
  updateGhost(null);
  clearPlacementOccluderFade();
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
      initialTrayRotation: trayRotation,
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
  trayScrollOffsetX = 0;
  trayScrollVelocity = 0;
  trayPointerMode = 'idle';
  layoutTrayQueue({ animate: false, preserveScroll: false });
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
  const guideLevel = THREE.MathUtils.clamp(level, 0, grid.levels);
  gridGuideGroup.position.y = guideLevel * grid.levelHeight;
  updateGridHeightGuide(guideLevel);
}

function updateGridHeightGuide(level) {
  // 只清子物体，保留材质引用给 applyGridGuideStyle 复用
  while (gridHeightGuideGroup.children.length > 0) {
    const child = gridHeightGuideGroup.children[0];
    gridHeightGuideGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  if (level <= 0) return;
  if (!gridGuideHeightMat) {
    gridGuideHeightMat = new THREE.LineBasicMaterial({
      color: '#4b5563',
      transparent: true,
      opacity: 0.68
    });
  }
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
    const line = new THREE.Line(geo, gridGuideHeightMat);
    gridHeightGuideGroup.add(line);
  }
}

/**
 * 网格引导配色。
 * heightExceeded：整面顶格淡红，强化「到顶放不下」；填充/线弱于红色 ghost（0.58）。
 */
function applyGridGuideStyle({ heightExceeded = false } = {}) {
  if (!gridGuideFillMat || !gridGuideLineMat || !gridGuideBorderMat) return;
  if (heightExceeded) {
    // 与 ghost 同色相，整体更淡
    gridGuideFillMat.color.set('#ef4444');
    gridGuideFillMat.opacity = TOP_BLOCK_GRID_FILL_OPACITY;
    gridGuideLineMat.color.set('#f87171');
    gridGuideLineMat.opacity = TOP_BLOCK_GRID_LINE_OPACITY;
    gridGuideBorderMat.color.set('#f87171');
    gridGuideBorderMat.opacity = TOP_BLOCK_GRID_BORDER_OPACITY;
    if (gridGuideHeightMat) {
      gridGuideHeightMat.color.set('#f87171');
      gridGuideHeightMat.opacity = TOP_BLOCK_GRID_LINE_OPACITY;
    }
  } else {
    gridGuideFillMat.color.set('#9ca3af');
    gridGuideFillMat.opacity = 0.16;
    gridGuideLineMat.color.set('#6b7280');
    gridGuideLineMat.opacity = 0.82;
    gridGuideBorderMat.color.set('#4b5563');
    gridGuideBorderMat.opacity = 0.94;
    if (gridGuideHeightMat) {
      gridGuideHeightMat.color.set('#4b5563');
      gridGuideHeightMat.opacity = 0.68;
    }
  }
  gridGuideFillMat.needsUpdate = true;
  gridGuideLineMat.needsUpdate = true;
  gridGuideBorderMat.needsUpdate = true;
  if (gridGuideHeightMat) gridGuideHeightMat.needsUpdate = true;
}

function showGridGuide(level = 0, { heightExceeded = false } = {}) {
  setGridGuideLevel(level);
  applyGridGuideStyle({ heightExceeded });
  gridGuideGroup.visible = true;
}

function hideGridGuide() {
  gridGuideGroup.visible = false;
  applyGridGuideStyle({ heightExceeded: false });
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
  releasePointerCaptureSafe(pendingPointerId);
  releasePointerCaptureSafe(activePointerId);
  pendingPointerItem = null;
  pendingPointerId = null;
  pendingPointerStart = null;
  pendingPointerEvent = null;
  activePointerId = null;
  if (activeItem) {
    restoreActiveItem();
    setItemOpacity(activeItem, 1);
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
  releasePointerCaptureSafe(pendingPointerId);
  releasePointerCaptureSafe(activePointerId);
  pendingPointerItem = null;
  pendingPointerId = null;
  pendingPointerStart = null;
  pendingPointerEvent = null;
  activePointerId = null;
  if (activeItem) {
    restoreActiveItem();
    setItemOpacity(activeItem, 1);
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

function getDragPickupY(item) {
  const dragScale = getDragItemScale();
  const halfHeight = getItemVisualHeight(item) * dragScale / 2;
  return grid.wallHeight + halfHeight + dragMotionTuning.boxClearance;
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

  if (A2_FULL_TRAY_SCROLL) {
    onPointerDownA2(event);
    return;
  }

  const picked = pickItem(event);
  if (!picked) return;
  event.preventDefault();
  pendingPointerItem = picked;
  pendingPointerId = event.pointerId;
  pendingPointerStart = { x: event.clientX, y: event.clientY };
  pendingPointerEvent = event;
  canvas.setPointerCapture(event.pointerId);
}

function stopTrayScrollMomentum() {
  trayScrollVelocity = 0;
}

function intersectTrayPlane(clientX, clientY, target) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  // y = 桌面附近：Plane (0,1,0)·p + c = 0 → c = -y
  const y = getTableSurfaceY() + 0.2;
  trayScrollPlane.set(new THREE.Vector3(0, 1, 0), -y);
  return Boolean(raycaster.ray.intersectPlane(trayScrollPlane, target));
}

/**
 * v2 合法 scroll 区间 [min, max]：
 * - 件数 ≤ 3：min = max = 0（默认一屏三件居中，不可空滑）
 * - 件数 > 3：offset=0 显示前 3；min=-(n-3)*pitch 显示最后 3
 * 跟手方向：offset 减小 → 内容左移 → 露出更大 index
 */
function getTrayScrollBounds() {
  const n = trayQueue.length;
  if (n <= 0 || !trayBaseCenters.length) {
    return { min: 0, max: 0, narrow: true };
  }
  if (n <= trayVisibleCount) {
    return { min: 0, max: 0, narrow: true };
  }
  const min = -(n - trayVisibleCount) * TRAY_SLOT_PITCH;
  const max = 0;
  return { min, max, narrow: false };
}

/**
 * 越界跟手系数：越界比例 t∈[0,1] 时从松到紧（ease-in）。
 */
function trayRubberPullFactor(overAbs) {
  const t = THREE.MathUtils.clamp(overAbs / Math.max(TRAY_RUBBER_MAX, 1e-4), 0, 1);
  // t^1.35：前半段保持较松，后半段快速变沉
  const eased = t ** 1.35;
  return THREE.MathUtils.lerp(TRAY_RUBBER_PULL_START, TRAY_RUBBER_PULL_END, eased);
}

/**
 * 界内 1:1；越界分段：到边之前全跟手，越过后按「先松后紧」系数，最多再拉约 1 件长。
 */
function applyTrayScrollDelta(deltaX) {
  const { min, max } = getTrayScrollBounds();
  let cur = trayScrollOffsetX;

  // 从界内跨过边界：先 1:1 走到边，剩余再套橡皮筋
  if (cur <= max && cur >= min) {
    const unclamped = cur + deltaX;
    if (unclamped > max) {
      const rest = unclamped - max;
      const over = rest * trayRubberPullFactor(0);
      trayScrollOffsetX = Math.min(max + over, max + TRAY_RUBBER_MAX);
      return;
    }
    if (unclamped < min) {
      const rest = min - unclamped;
      const over = rest * trayRubberPullFactor(0);
      trayScrollOffsetX = Math.max(min - over, min - TRAY_RUBBER_MAX);
      return;
    }
    trayScrollOffsetX = unclamped;
    return;
  }

  // 已在 max 外侧
  if (cur > max) {
    if (deltaX < 0) {
      // 往回拉：接近 1:1，回到界内后按界内处理
      trayScrollOffsetX = cur + deltaX;
      if (trayScrollOffsetX < max) {
        // 若一帧跨过整段内侧，不再二次阻尼
        trayScrollOffsetX = Math.max(trayScrollOffsetX, min);
      }
      return;
    }
    const already = cur - max;
    const add = deltaX * trayRubberPullFactor(already);
    trayScrollOffsetX = Math.min(max + already + add, max + TRAY_RUBBER_MAX);
    return;
  }

  // 已在 min 外侧
  if (cur < min) {
    if (deltaX > 0) {
      trayScrollOffsetX = cur + deltaX;
      if (trayScrollOffsetX > min) {
        trayScrollOffsetX = Math.min(trayScrollOffsetX, max);
      }
      return;
    }
    const already = min - cur;
    const add = (-deltaX) * trayRubberPullFactor(already);
    trayScrollOffsetX = Math.max(min - already - add, min - TRAY_RUBBER_MAX);
  }
}

/**
 * 托盘件透明度：窗内 1，外侧平滑淡出到 0（避免 visible 开关闪一下）。
 */
function getTrayItemEdgeOpacity(worldX) {
  const ax = Math.abs(worldX);
  if (ax <= TRAY_FADE_START) return 1;
  if (ax >= TRAY_FADE_END) return 0;
  const t = (ax - TRAY_FADE_START) / (TRAY_FADE_END - TRAY_FADE_START);
  // smoothstep
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

function applyTrayItemEdgeFade(item, worldX) {
  if (!item?.mesh || item === activeItem || item === hintMove?.item) return;
  const opacity = getTrayItemEdgeOpacity(worldX);
  // 始终保持 visible，只改透明度，避免「突然出现」一帧
  item.mesh.visible = true;
  item.trayVisible = opacity > 0.14;
  item.mesh.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of mats) {
      mat.transparent = opacity < 0.999;
      mat.opacity = opacity;
      mat.depthWrite = opacity >= 0.95;
      mat.needsUpdate = true;
    }
    if (object.isMesh) object.castShadow = opacity > 0.35;
  });
}

/** 布局/重置：立刻贴回合法区（无橡皮） */
function clampTrayScrollOffset() {
  const { min, max } = getTrayScrollBounds();
  trayScrollOffsetX = THREE.MathUtils.clamp(trayScrollOffsetX, min, max);
}

function isTrayScrollOutOfBounds() {
  const { min, max } = getTrayScrollBounds();
  return trayScrollOffsetX < min - 1e-4 || trayScrollOffsetX > max + 1e-4;
}

function applyTrayScrollToItems({ immediate = true } = {}) {
  if (!A2_FULL_TRAY_SCROLL) return;
  trayQueue.forEach((item, index) => {
    if (item.placed || item === activeItem || item === hintMove?.item) return;
    const base = trayBaseCenters[index];
    if (base === undefined) return;
    const x = base + trayScrollOffsetX;
    const y = getTableItemY(item, trayScale);
    if (!item.targetPosition) item.targetPosition = new THREE.Vector3();
    item.targetPosition.set(x, y, trayZ);
    item.homePosition = item.targetPosition.clone();
    if (immediate || trayPointerMode === 'scroll') {
      item.mesh.position.x = x;
      item.mesh.position.y = y;
      item.mesh.position.z = trayZ;
    }
    applyTrayItemEdgeFade(item, x);
  });
}

function onPointerDownA2(event) {
  stopTrayScrollMomentum();
  trayPointerMode = 'pending';
  // 起手：射线优先 + 略放大 fuzzy，降低「点不中」
  const picked = pickItem(event, { allowFuzzy: true, fuzzyScale: 1.15 });
  // 托盘空白也可开始 pending → 仅 scroll
  const canScrollEmpty = isPointerNearTrayBand(event);
  if (!picked && !canScrollEmpty) {
    trayPointerMode = 'idle';
    return;
  }
  if (picked?.placed) {
    // 箱内块：走旧逻辑起手 pending → 出 slop 即 drag（无 scroll 竞争）
    event.preventDefault();
    pendingPointerItem = picked;
    pendingPointerId = event.pointerId;
    pendingPointerStart = { x: event.clientX, y: event.clientY };
    pendingPointerEvent = event;
    trayPendingStartTime = performance.now();
    trayPointerMode = 'pending';
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  event.preventDefault();
  pendingPointerItem = picked && !picked.placed ? picked : null;
  pendingPointerId = event.pointerId;
  pendingPointerStart = { x: event.clientX, y: event.clientY };
  pendingPointerEvent = event;
  trayPendingStartTime = performance.now();
  trayScrollLastClientX = event.clientX;
  trayScrollLastClientY = event.clientY;
  trayScrollLastTime = performance.now();
  canvas.setPointerCapture(event.pointerId);
}

function isPointerNearTrayBand(event) {
  if (!intersectTrayPlane(event.clientX, event.clientY, trayScrollRayPoint)) return false;
  // 托盘带：靠前桌面；X 覆盖三槽可视宽 + 余量
  const half = TRAY_SLOT_PITCH * 1.6;
  return trayScrollRayPoint.z > trayZ - 1.8 && trayScrollRayPoint.z < trayZ + 1.2
    && trayScrollRayPoint.x > -half - 0.5
    && trayScrollRayPoint.x < half + 0.5;
}

function commitTrayPendingToScroll(event) {
  trayPointerMode = 'scroll';
  // 以上一次 pending 起点为 prev，使本帧位移立刻作用到条上
  trayScrollLastClientX = pendingPointerStart?.x ?? event.clientX;
  trayScrollLastClientY = pendingPointerStart?.y ?? event.clientY;
  trayScrollLastTime = performance.now();
  trayScrollVelocity = 0;
  pendingPointerItem = null;
}

function commitTrayPendingToDrag(event) {
  const item = pendingPointerItem;
  if (!item) {
    commitTrayPendingToScroll(event);
    return;
  }
  trayPointerMode = 'drag';
  pendingPointerItem = null;
  pendingPointerEvent = null;
  beginDragItem(item, event);
}

function onPointerMoveA2(event) {
  if (pendingPointerId != null && event.pointerId !== pendingPointerId && !activeItem) return;

  if (trayPointerMode === 'pending' && event.pointerId === pendingPointerId) {
    event.preventDefault();
    const dx = event.clientX - pendingPointerStart.x;
    const dy = event.clientY - pendingPointerStart.y;
    const disp = Math.hypot(dx, dy);
    const onItem = Boolean(pendingPointerItem);
    const slop = onItem ? TRAY_COMMIT_SLOP_ON_ITEM_PX : TRAY_COMMIT_SLOP_EMPTY_PX;
    if (disp < slop) return;

    // 箱内已放块：直接 drag
    if (pendingPointerItem?.placed) {
      commitTrayPendingToDrag(event);
      return;
    }

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (!onItem) {
      // 空白托盘带：只滚
      commitTrayPendingToScroll(event);
    } else if (adx >= ady * TRAY_SCROLL_PURE_RATIO && adx >= slop) {
      // 物品上：几乎纯横 → 滑条
      commitTrayPendingToScroll(event);
    } else if (dy < 0) {
      // 物品上：只要有上提 → 拿起（解决「想拖却变成滑」）
      commitTrayPendingToDrag(event);
    } else if (adx > ady) {
      // 横移为主且非上提 → 滑
      commitTrayPendingToScroll(event);
    } else if (disp >= slop * 1.6) {
      // 往下抹等：当滑，不拖进桌面
      commitTrayPendingToScroll(event);
    }
    // fall through if became scroll
  }

  if (trayPointerMode === 'scroll' && event.pointerId === pendingPointerId) {
    event.preventDefault();
    const now = performance.now();
    const prevX = trayScrollLastClientX;
    if (
      intersectTrayPlane(prevX, trayScrollLastClientY, trayScrollRayPrev)
      && intersectTrayPlane(event.clientX, event.clientY, trayScrollRayPoint)
    ) {
      const deltaX = trayScrollRayPoint.x - trayScrollRayPrev.x;
      const prevOffset = trayScrollOffsetX;
      applyTrayScrollDelta(deltaX);
      applyTrayScrollToItems({ immediate: true });
      const dt = Math.max(1, now - trayScrollLastTime) / 1000;
      trayScrollVelocity = (trayScrollOffsetX - prevOffset) / dt;
    }
    trayScrollLastClientX = event.clientX;
    trayScrollLastClientY = event.clientY;
    trayScrollLastTime = now;
    return;
  }

  if (trayPointerMode === 'drag' || activeItem) {
    onPointerMoveDrag(event);
  }
}

function onPointerMoveDrag(event) {
  if (!activeItem || isGameplayLocked()) return;
  event.preventDefault();
  updatePointer(event, dragMotionTuning.visualOffsetY);
  if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
  activeItem.mesh.position.x = dragStartPosition.x + (hitPoint.x - dragStartHit.x) * dragMotionTuning.moveGainX;
  activeItem.mesh.position.z = dragStartPosition.z + (hitPoint.z - dragStartHit.z) * dragMotionTuning.moveGainZ;
  sampleDragTrail(activeItem, activeItem.mesh.position);
  candidate = getIntentCandidate(activeItem, activeItem.mesh.position);
  updateIntentDebugHud(activeItem, activeItem.lastIntentChannel);
  updateActiveItemDragScale();
  showGridGuide(
    candidate?.guideLevel ?? candidate?.displayBaseLevel ?? candidate?.baseLevel ?? 0,
    { heightExceeded: candidate?.inside && candidate?.reason === 'height-exceeded' }
  );
  updateGhost(candidate);
  updatePlacementOccluderFade(candidate);
}

function onPointerUpA2(event) {
  if (pendingPointerId != null && event.pointerId !== pendingPointerId && trayPointerMode !== 'drag') {
    return;
  }

  if (trayPointerMode === 'pending' && event.pointerId === pendingPointerId) {
    event.preventDefault();
    const item = pendingPointerItem;
    const elapsed = performance.now() - trayPendingStartTime;
    const dx = event.clientX - pendingPointerStart.x;
    const dy = event.clientY - pendingPointerStart.y;
    const disp = Math.hypot(dx, dy);
    pendingPointerItem = null;
    pendingPointerId = null;
    pendingPointerEvent = null;
    trayPointerMode = 'idle';
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (
      event.type !== 'pointercancel'
      && item
      && !item.placed
      && elapsed <= TRAY_TAP_MAX_MS
      && disp < DRAG_START_THRESHOLD_PX
    ) {
      rotateItemByTap(item);
    }
    return;
  }

  if (trayPointerMode === 'scroll' && event.pointerId === pendingPointerId) {
    event.preventDefault();
    pendingPointerId = null;
    pendingPointerItem = null;
    trayPointerMode = 'idle';
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const { min, max } = getTrayScrollBounds();
    if (isTrayScrollOutOfBounds()) {
      // 松手快弹：朝合法边给初速
      const target = trayScrollOffsetX > max ? max : min;
      trayScrollVelocity = (target - trayScrollOffsetX) * 14;
    } else if (Math.abs(trayScrollVelocity) < TRAY_SCROLL_VELOCITY_EPS * 20) {
      trayScrollVelocity = 0;
      trayScrollOffsetX = THREE.MathUtils.clamp(trayScrollOffsetX, min, max);
    }
    return;
  }

  // drag 结束
  if (activeItem) {
    onPointerUpDrag(event);
    trayPointerMode = 'idle';
  }
}

function onPointerUpDrag(event) {
  if (!activeItem) return;
  event.preventDefault();
  if (gamePhase !== 'play') {
    restoreActiveItem();
    setItemOpacity(activeItem, 1);
    setItemShadow(activeItem, true);
    activeItem = null;
    activePointerId = null;
    pendingPointerItem = null;
    pendingPointerId = null;
    pendingPointerEvent = null;
    candidate = null;
    hideGridGuide();
    updateGhost(null);
    clearPlacementOccluderFade();
    updateDragSpeedHud(null);
    trayPointerMode = 'idle';
    return;
  }
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
  if (event.type !== 'pointercancel' && candidate?.valid) {
    placeItem(activeItem, candidate);
  } else {
    restoreActiveItem();
  }
  setItemOpacity(activeItem, 1);
  setItemShadow(activeItem, true);
  if (activeItem.placed) setItemScale(activeItem, getBoardItemScale());
  activeItem.finalIntentPlacement = null;
  activeItem.dragStartRotation = null;
  activeItem = null;
  activePointerId = null;
  pendingPointerItem = null;
  pendingPointerId = null;
  pendingPointerEvent = null;
  candidate = null;
  hideGridGuide();
  updateGhost(null);
  clearPlacementOccluderFade();
  updateDragSpeedHud(null);
  refreshStatus();
  trayPointerMode = 'idle';
}

/**
 * 松手后：
 * - 越界/≤3 件：快速弹簧回到合法边（先松后紧的拉已在拖拽中完成）
 * - 宽内容界内：惯滑；撞边轻回弹
 */
function updateTrayScrollMomentum(dt) {
  if (!A2_FULL_TRAY_SCROLL) return;
  if (trayPointerMode === 'scroll') return;

  const { min, max, narrow } = getTrayScrollBounds();
  const outOfBounds = trayScrollOffsetX < min - 1e-4 || trayScrollOffsetX > max + 1e-4;

  if (outOfBounds || (narrow && Math.abs(trayScrollOffsetX - min) > 1e-4)) {
    const target = trayScrollOffsetX > max ? max : min;
    const disp = trayScrollOffsetX - target;
    // 临界阻尼附近：快回到位、少振荡
    const spring = -TRAY_RUBBER_STIFFNESS * disp - TRAY_RUBBER_DAMPING * trayScrollVelocity;
    trayScrollVelocity += spring * dt;
    trayScrollOffsetX += trayScrollVelocity * dt;
    const crossed =
      (disp > 0 && trayScrollOffsetX <= target)
      || (disp < 0 && trayScrollOffsetX >= target);
    if (crossed || Math.abs(disp) < 0.012) {
      trayScrollOffsetX = target;
      trayScrollVelocity = 0;
    }
    applyTrayScrollToItems({ immediate: true });
    return;
  }

  if (narrow) {
    trayScrollOffsetX = min;
    trayScrollVelocity = 0;
    return;
  }

  if (Math.abs(trayScrollVelocity) < TRAY_SCROLL_VELOCITY_EPS) {
    trayScrollVelocity = 0;
    return;
  }
  trayScrollOffsetX += trayScrollVelocity * dt;
  if (trayScrollOffsetX > max) {
    trayScrollOffsetX = max + (trayScrollOffsetX - max) * 0.22;
    trayScrollVelocity *= -0.18;
  } else if (trayScrollOffsetX < min) {
    trayScrollOffsetX = min + (trayScrollOffsetX - min) * 0.22;
    trayScrollVelocity *= -0.18;
  }
  applyTrayScrollToItems({ immediate: true });
  const damp = Math.exp(-TRAY_SCROLL_VELOCITY_FRICTION * dt);
  trayScrollVelocity *= damp;
  if (Math.abs(trayScrollVelocity) < TRAY_SCROLL_VELOCITY_EPS) {
    trayScrollVelocity = 0;
    trayScrollOffsetX = THREE.MathUtils.clamp(trayScrollOffsetX, min, max);
    applyTrayScrollToItems({ immediate: true });
  }
}

function beginDragItem(item, event) {
  // 双保险：箱内被上层压住的块不可进入拖拽
  if (item?.placed && isItemPinnedByStack(item)) {
    showToast('先移开上面的物品');
    return;
  }
  clearHint();
  activeItem = item;
  activePointerId = event.pointerId;
  activeItem.wasPlaced = activeItem.placed;
  activeItem.dragStartRotation = activeItem.rotation;
  // 本拖意图改角的锚点：托盘点转后的角 / 箱内拿起时的角
  activeItem.intentAnchorRotation = activeItem.rotation;
  activeItem.lastAutoRotationAt = 0;
  activeItem.autoRotateIntentKey = null;
  activeItem.autoRotateIntentSince = 0;
  // 托盘点转留下的 manualLock 若仍有效则保留，避免刚拧完就进箱被秒帮转
  if ((activeItem.manualLockUntil ?? 0) < performance.now()) {
    activeItem.manualLockUntil = 0;
  }
  activeItem.assistCommitUntil = 0;
  activeItem.assistCommitRotation = null;
  activeItem.assistCommitPosition = null;
  activeItem.lastIntentScenario = null;
  /**
   * 本拖是否已「Ghost 进过箱」：托盘拿起须先出现箱内落点预览，才允许帮转。
   * 从箱内已放置拿起：视为已解锁，无进箱冷静期。
   */
  activeItem.assistFromPlacedPickup = Boolean(activeItem.placed);
  activeItem.assistBoxUnlocked = Boolean(activeItem.placed);
  activeItem.assistBoxUnlockedAt = 0;
  activeItem.assistEnteredFromBottomAt = 0;
  activeItem.assistDidRotateThisDrag = false;
  activeItem.dragTrail = [];
  if (A2_FULL_TRAY_SCROLL) trayPointerMode = 'drag';
  activeItem.previousPlacement = activeItem.placed
    ? { gx: activeItem.gridX, gy: activeItem.gridY, level: activeItem.level, rotation: activeItem.rotation }
    : null;
  // 缓存最后一块唯一解仅作 inside 加权，拿起瞬间绝不强转
  activeItem.finalIntentPlacement = getFinalItemIntentPlacement(activeItem);
  // 超过拖拽阈值后才按入箱尺寸过渡，避免单点点击也把物品拿起。
  setItemScaleTarget(activeItem, getDragItemScale());
  const pickupY = getDragPickupY(activeItem);
  activeItem.mesh.position.y = pickupY;
  activeItem.placed = false;
  setItemShadow(activeItem, false);
  // 半透明手中块，避免完全盖住落点 ghost
  setItemOpacity(activeItem, DRAG_ITEM_OPACITY);
  clearPlacementOccluderFade();
  updatePointer(event);
  dragPlane.constant = -pickupY;
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  dragOffset.copy(activeItem.mesh.position).sub(hitPoint);
  dragOffset.y = 0;
  updatePointer(event, dragMotionTuning.visualOffsetY);
  if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
    activeItem.mesh.position.x = hitPoint.x + dragOffset.x;
    activeItem.mesh.position.z = hitPoint.z + dragOffset.z;
    dragStartHit.copy(hitPoint);
    dragStartPosition.copy(activeItem.mesh.position);
  }
  showGridGuide(0);
  updateGhost(null);
  updateDragSpeedHud(activeItem);
}

function onPointerMove(event) {
  if (A2_FULL_TRAY_SCROLL) {
    onPointerMoveA2(event);
    return;
  }
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
  onPointerMoveDrag(event);
}

function onPointerUp(event) {
  if (A2_FULL_TRAY_SCROLL) {
    onPointerUpA2(event);
    return;
  }
  if (pendingPointerItem && event.pointerId === pendingPointerId && !activeItem) {
    event.preventDefault();
    const item = pendingPointerItem;
    pendingPointerItem = null;
    pendingPointerId = null;
    pendingPointerEvent = null;
    canvas.releasePointerCapture(event.pointerId);
    // 仅物品区短点旋转（未入箱 + 托盘可见）；箱内/拖中不可点转
    if (event.type !== 'pointercancel') rotateItemByTap(item);
    return;
  }
  onPointerUpDrag(event);
}

function pickItem(event, { allowFuzzy = true, fuzzyScale = 1 } = {}) {
  updatePointer(event);
  const intersects = raycaster.intersectObjects(itemGroup.children, true);
  let hitPinned = false;
  for (const entry of intersects) {
    const root = findItemRoot(entry.object);
    if (!root) continue;
    const item = root.userData.item;
    if (!item || item === activeItem || item === hintMove?.item) continue;
    if (!item.mesh.visible) continue;
    // 上层有压住的块：跳过，优先点到更靠前的上层物品
    if (item.placed && isItemPinnedByStack(item)) {
      hitPinned = true;
      continue;
    }
    if (item.placed || item.trayVisible) return item;
  }
  if (allowFuzzy && trayPointerMode !== 'scroll') {
    const intent = pickItemByIntent(event, fuzzyScale);
    if (intent) return intent;
  }
  // 只点到被压住的底层时给反馈，避免误以为卡死
  if (hitPinned) showToast('先移开上面的物品');
  return null;
}

function findItemRoot(object) {
  let current = object;
  while (current && current.parent !== itemGroup) current = current.parent;
  return current?.parent === itemGroup ? current : null;
}

function pickItemByIntent(event, fuzzyScale = 1) {
  const viewportRect = canvas.getBoundingClientRect();
  const pointerX = event.clientX;
  const pointerY = event.clientY;
  const candidates = [];
  const scale = Number.isFinite(fuzzyScale) ? fuzzyScale : 1;

  for (const item of items) {
    if (!isPickupIntentCandidate(item)) continue;
    const projectedRect = getProjectedItemRect(item, viewportRect);
    if (!projectedRect) continue;

    const distance = getDistanceToRectPx(pointerX, pointerY, projectedRect);
    const radius = (isSmallPickupItem(item) ? PICKUP_SMALL_ITEM_RADIUS_PX : PICKUP_INTENT_RADIUS_PX) * scale;
    if (distance > radius) continue;

    let score = -(distance / radius) * PICKUP_DISTANCE_WEIGHT;
    if (item.trayVisible && !item.placed) score += PICKUP_TRAY_VISIBLE_BONUS;
    if (distance === 0) score += PICKUP_INSIDE_RECT_BONUS;
    candidates.push({ item, score, distance, radius });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const [best, second] = candidates;
  if (second && best.score - second.score < PICKUP_SWITCH_MARGIN) return null;
  return best.item;
}

function isPickupIntentCandidate(item) {
  if (!item || item === activeItem || item === hintMove?.item) return false;
  if (!item.mesh.visible) return false;
  if (!item.placed && !item.trayVisible) return false;
  // 箱内被上层压住的物品不可拿起（否则会抽走支撑，上层悬空）
  if (item.placed && isItemPinnedByStack(item)) return false;
  return true;
}

/**
 * 箱内物品是否被上层占用压住。
 * 规则：其 footprint 任一格在自身顶面之上还有其它已放置体素 → 不可挪动。
 * 例：A 在底层，B 叠在 A 上 → A 被 pin；先移 B 后才可动 A。
 */
function isItemPinnedByStack(item) {
  if (!item?.placed) return false;
  if (item.gridX == null || item.gridY == null || item.level == null) return false;

  const shape = rotateShape(item.shape, item.rotation);
  const baseLevel = item.level ?? 0;
  const topLevel = baseLevel + getItemHeight(item) - 1;
  if (topLevel >= grid.levels - 1) return false;

  const voxelGrid = buildVoxelGrid();
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const cx = item.gridX + x;
      const cy = item.gridY + y;
      if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) continue;
      for (let level = topLevel + 1; level < grid.levels; level += 1) {
        const occupant = voxelGrid[level]?.[cy]?.[cx];
        if (occupant != null && occupant !== item.id) return true;
      }
    }
  }
  return false;
}

function isSmallPickupItem(item) {
  const bulk = getItemFootprintBulk(item);
  return bulk.maxCells <= 2 || bulk.maxSpan <= 2;
}

function getProjectedItemRect(item, viewportRect) {
  pickupProjectionBox.setFromObject(item.mesh);
  if (pickupProjectionBox.isEmpty()) return null;

  const { min, max } = pickupProjectionBox;
  const corners = [
    [min.x, min.y, min.z],
    [min.x, min.y, max.z],
    [min.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, min.y, min.z],
    [max.x, min.y, max.z],
    [max.x, max.y, min.z],
    [max.x, max.y, max.z],
  ];

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let projectedCount = 0;

  for (const [x, y, z] of corners) {
    pickupProjectionPoint.set(x, y, z).project(camera);
    if (
      !Number.isFinite(pickupProjectionPoint.x) ||
      !Number.isFinite(pickupProjectionPoint.y) ||
      !Number.isFinite(pickupProjectionPoint.z)
    ) {
      continue;
    }
    const screenX = viewportRect.left + (pickupProjectionPoint.x + 1) * 0.5 * viewportRect.width;
    const screenY = viewportRect.top + (1 - pickupProjectionPoint.y) * 0.5 * viewportRect.height;
    left = Math.min(left, screenX);
    right = Math.max(right, screenX);
    top = Math.min(top, screenY);
    bottom = Math.max(bottom, screenY);
    projectedCount += 1;
  }

  if (!projectedCount) return null;
  return { left, right, top, bottom };
}

function getDistanceToRectPx(x, y, rect) {
  const closestX = THREE.MathUtils.clamp(x, rect.left, rect.right);
  const closestY = THREE.MathUtils.clamp(y, rect.top, rect.bottom);
  return Math.hypot(x - closestX, y - closestY);
}

function updatePointer(event, visualOffsetY = 0) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - visualOffsetY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function getCandidate(item, worldPosition) {
  return getCandidateForRotation(item, worldPosition, item.rotation);
}

function getCandidateForRotation(item, worldPosition, rotation) {
  const shape = rotateShape(item.shape, rotation);
  const snap = getSnapGridForShape(worldPosition, shape);
  const placement = getPlacement(item, snap.gx, snap.gy, shape);
  const displayBaseLevel = getGhostDisplayBaseLevel(item, snap.gx, snap.gy, shape, placement);
  const guideLevel = getGhostGuideLevel(item, displayBaseLevel, placement);
  return { gx: snap.gx, gy: snap.gy, shape, inside: snap.inside, rotation, ...placement, displayBaseLevel, guideLevel };
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

/** 意图评估：略扩大箱区（仅其它用途；帮转不再用「近箱」） */
function isNearBoxForIntent(worldPosition, pad = 1.1) {
  return worldPosition.x >= grid.left - pad && worldPosition.x <= -grid.left + pad
    && worldPosition.z >= grid.top - pad && worldPosition.z <= -grid.top + pad;
}

/**
 * 落点游戏：看红色 Ghost 脚印是否落在棋盘格内，而不是物品 mesh 中心是否在箱里。
 * 任一占用格在 [0,cols)×[0,rows) 内 → Ghost 在箱内。
 */
function isGhostInBox(item, worldPosition, rotation = item.rotation) {
  const shape = rotateShape(item.shape, rotation);
  const snap = getSnapGridForShape(worldPosition, shape);
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const gx = snap.gx + x;
      const gy = snap.gy + y;
      if (gx >= 0 && gy >= 0 && gx < grid.cols && gy < grid.rows) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 本拖是否允许辅助旋转（以 Ghost 落点为准）：
 * - 托盘拿起：须至少有一次 Ghost 进过箱（解锁），且当前 Ghost 仍在箱内
 * - 箱内拿起：开始即解锁，仍须当前 Ghost 在箱内
 * - 归位托盘后解锁清零，须重新「Ghost 进箱」
 * - 首次解锁时记录时间（冷静期）与是否上拖入箱（钝化保持）
 */
function canAssistRotateInBox(item, worldPosition, now = performance.now(), trend = null) {
  const ghostIn = isGhostInBox(item, worldPosition);
  if (ghostIn && !item.assistBoxUnlocked) {
    item.assistBoxUnlocked = true;
    item.assistBoxUnlockedAt = now;
    // 托盘进箱：一律记入箱钝化；或当前上拖/近底边
    if (
      !item.assistFromPlacedPickup
      || trend?.dragUpIntoBox
      || trend?.nearBottomEntry
    ) {
      item.assistEnteredFromBottomAt = now;
    }
  } else if (ghostIn) {
    item.assistBoxUnlocked = true;
  }
  if (!item.assistBoxUnlocked) return false;
  return ghostIn;
}

/** 首次 Ghost 进箱冷静期内：禁止帮转 */
function isInAssistEntryGrace(item, now) {
  const t0 = item.assistBoxUnlockedAt ?? 0;
  if (!t0) return false;
  return now - t0 < assistBoxEntryGraceMs;
}

/**
 * 上拖/托盘入箱钝化是否仍生效（可与 settled 叠加，避免一停就秒转）
 */
function isAssistEntryDampenActive(item, trend, now) {
  const fromBottom = (item.assistEnteredFromBottomAt ?? 0) > 0
    && now - item.assistEnteredFromBottomAt < assistEntryFromBottomDampenMs;
  const liveUp = Boolean(trend?.dragUpIntoBox && trend?.nearBottomEntry);
  return fromBottom || liveUp;
}

/**
 * 互异脚印朝向（含当前）：同一 shape 矩阵只保留距当前角步数最少的 rotation。
 * v2 区域分析需要统计「当前脚印在 R 内是否也能放」。
 */
function getDistinctRotationOptions(item, { includeCurrent = true } = {}) {
  const currentKey = shapeMatrixKey(rotateShape(item.shape, item.rotation));
  const byShape = new Map();

  for (let rotation = 0; rotation < 4; rotation += 1) {
    const shape = rotateShape(item.shape, rotation);
    const key = shapeMatrixKey(shape);
    if (!includeCurrent && key === currentKey) continue;
    const steps = minRotationSteps(item.rotation, rotation);
    const prev = byShape.get(key);
    if (!prev || steps < prev.steps) {
      byShape.set(key, {
        rotation,
        shape,
        steps,
        key,
        isCurrent: key === currentKey
      });
    }
  }

  return [...byShape.values()];
}

function sampleDragTrail(item, worldPosition) {
  const now = performance.now();
  const trail = item.dragTrail || (item.dragTrail = []);
  const last = trail[trail.length - 1];
  /**
   * 采样策略（重要）：
   * 旧逻辑在 now-last.t < 24 时写 last.t=now，pointermove 通常 8–16ms 一帧，
   * 导致计时永远到不了 24ms、轨迹锁死成 1 个点 → 速度恒 0 → HUD 一直「慢速·停稳」。
   * 正确做法：历史点不可被「刷新 t」吞掉；仅合并同帧/极近重复事件。
   */
  if (last && now - last.t < 2) {
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
 * 稳定移动方向（分段加权，近端更重）：
 * - stableAxis：'x' 左右 / 'z' 上下
 * - confidence：主轴占比 0.5~1
 * - approachAxis：往哪类边拱（左/右→偏好竖放 z；上/下→偏好横放 x）
 * 仅用于瞄准态下「选朝向」，不单独触发转角。
 */
function getStableMotionHint(item) {
  const trail = item.dragTrail;
  if (!trail || trail.length < 3) {
    return { stableAxis: null, confidence: 0, approachAxis: null };
  }

  let sumAbsX = 0;
  let sumAbsZ = 0;
  let sumDx = 0;
  let sumDz = 0;
  for (let i = 1; i < trail.length; i += 1) {
    const w = 0.55 + (i / trail.length);
    const ddx = trail[i].x - trail[i - 1].x;
    const ddz = trail[i].z - trail[i - 1].z;
    sumAbsX += Math.abs(ddx) * w;
    sumAbsZ += Math.abs(ddz) * w;
    sumDx += ddx * w;
    sumDz += ddz * w;
  }

  const total = sumAbsX + sumAbsZ;
  if (total < grid.cell * 0.1) {
    return { stableAxis: null, confidence: 0, approachAxis: null };
  }

  const stableAxis = sumAbsX >= sumAbsZ ? 'x' : 'z';
  const confidence = Math.max(sumAbsX, sumAbsZ) / total;

  const latest = trail[trail.length - 1];
  const u = (latest.x - grid.left) / Math.max(grid.width, 1e-6);
  const v = (latest.z - grid.top) / Math.max(grid.depth, 1e-6);
  let approachAxis = null;
  if (Math.abs(sumDx) >= Math.abs(sumDz) * 0.9) {
    // 往左/右拱 → 更像要竖贴侧边
    if (sumDx < 0 && u < 0.62) approachAxis = 'z';
    else if (sumDx > 0 && u > 0.38) approachAxis = 'z';
  } else {
    // 往上/下拱 → 更像要横贴顶底
    if (sumDz < 0 && v < 0.62) approachAxis = 'x';
    else if (sumDz > 0 && v > 0.38) approachAxis = 'x';
  }

  return { stableAxis, confidence, approachAxis };
}

/**
 * 纵向入箱手势（看玩家操作方向，不是只看贴哪条几何边）：
 * 坐标系：z 增大 = 靠箱底/托盘侧。
 * - dragUpIntoBox：从下往上（路过底边入箱）→ 帮转应迟钝（必经之路）
 * - dragDownFromTop：从上往下 → 可更及时
 */
function getVerticalEntryGesture(item, worldPosition) {
  const trail = item.dragTrail;
  const v = (worldPosition.z - grid.top) / Math.max(grid.depth, 1e-6);
  // 箱底半区 + 略出底边：托盘拖入会经过
  const nearBottomEntry = v > 0.52 || worldPosition.z > grid.top + grid.depth - grid.cell * 0.35;

  if (!trail || trail.length < 3) {
    return {
      dragUpIntoBox: false,
      dragDownFromTop: false,
      nearBottomEntry,
      verticalConfidence: 0
    };
  }

  let sumAbsX = 0;
  let sumAbsZ = 0;
  let sumDz = 0;
  for (let i = 1; i < trail.length; i += 1) {
    const w = 0.55 + (i / trail.length);
    const ddx = trail[i].x - trail[i - 1].x;
    const ddz = trail[i].z - trail[i - 1].z;
    sumAbsX += Math.abs(ddx) * w;
    sumAbsZ += Math.abs(ddz) * w;
    sumDz += ddz * w;
  }
  const total = sumAbsX + sumAbsZ;
  if (total < grid.cell * 0.12) {
    return {
      dragUpIntoBox: false,
      dragDownFromTop: false,
      nearBottomEntry,
      verticalConfidence: 0
    };
  }

  const verticalConfidence = sumAbsZ / total;
  // 主移为上下，且纵向位移够明显
  const verticalDominant = sumAbsZ >= sumAbsX * 0.85
    && Math.abs(sumDz) > grid.cell * 0.14;
  // dz<0：往箱顶（屏幕上方/离托盘）= 从下往上入箱
  const dragUpIntoBox = verticalDominant && sumDz < 0 && verticalConfidence >= 0.52;
  // dz>0：往箱底 = 从上往下
  const dragDownFromTop = verticalDominant && sumDz > 0 && verticalConfidence >= 0.52;

  return {
    dragUpIntoBox,
    dragDownFromTop,
    nearBottomEntry,
    verticalConfidence
  };
}

/**
 * 近端轨迹位移（格）：比整段均速更跟手。
 */
function getRecentTrailMoveCells(item) {
  const trail = item.dragTrail;
  if (!trail || trail.length < 3) return 0;
  const from = Math.max(0, trail.length - 6);
  let move = 0;
  for (let i = from + 1; i < trail.length; i += 1) {
    move += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z);
  }
  return move / Math.max(grid.cell, 1e-6);
}

/**
 * 近端速度（格/秒）：只看最近 ~120ms，反映「此刻」物品多快。
 */
function getRecentTrailSpeedCells(item) {
  const trail = item.dragTrail;
  if (!trail || trail.length < 2) return 0;
  const latestT = trail[trail.length - 1].t;
  const windowMs = 120;
  let i0 = trail.length - 1;
  while (i0 > 0 && latestT - trail[i0 - 1].t < windowMs) i0 -= 1;
  if (i0 >= trail.length - 1) i0 = Math.max(0, trail.length - 2);
  const a = trail[i0];
  const b = trail[trail.length - 1];
  const dt = Math.max(16, b.t - a.t);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  return (dist / Math.max(grid.cell, 1e-6)) / (dt / 1000);
}

/**
 * 速度档：settled | slowSlide | normal | fast
 */
function classifyDragSpeedBand(speedCells) {
  if (speedCells < speedTuning.settled) return 'settled';
  if (speedCells < speedTuning.slowSlideMax) return 'slowSlide';
  if (speedCells < speedTuning.normalMax) return 'normal';
  return 'fast';
}

/**
 * 分档取更猛的一档（仅用于「仍在移动」时防漏判加速）。
 * settled < slowSlide < normal < fast
 */
function stricterSpeedBand(a, b) {
  const rank = { settled: 0, slowSlide: 1, normal: 2, fast: 3 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

/**
 * 当前操作速度档：以近端为准。
 * 停下后近端不动 → 立刻停稳，不被 420ms 历史轨迹拖成「正常挪」。
 */
function resolveCurrentSpeedBand(speedCellsWhole, speedCellsRecent, relocating) {
  const bandRecent = classifyDragSpeedBand(speedCellsRecent);
  if (!relocating) {
    // 近端几乎不动 = 当前已停
    return {
      speedBand: 'settled',
      speedCells: Math.min(speedCellsRecent, speedTuning.settled * 0.5)
    };
  }
  const bandWhole = classifyDragSpeedBand(speedCellsWhole);
  // 仍在动：近端为主；若整段更猛则抬档（防加速瞬间被均速抹平）
  return {
    speedBand: stricterSpeedBand(bandRecent, bandWhole),
    speedCells: Math.max(speedCellsRecent, speedCellsWhole * 0.5)
  };
}

/**
 * 拖拽趋势（速度分档 + 手势）：
 * - speedBand：settled / slowSlide / normal / fast
 * - slowSlide：慢滑对准（速度窗 + 主轴稳 + 非上拖路过底边）
 * - allowRotateAssist：settled | slowSlide | edgeScrub
 * - dragUpIntoBox / dragDownFromTop：纵向入箱手势
 */
function getDragTrend(item, edgeBand = 0.28) {
  const trail = item.dragTrail;
  if (!trail || trail.length < 2) {
    return {
      speedCells: 0,
      speedBand: 'settled',
      dx: 0,
      dz: 0,
      hovering: true,
      aiming: true,
      slowSlide: false,
      edgeScrub: false,
      scrubAxis: null,
      allowAssist: true,
      allowRotateAssist: true,
      relocating: false,
      settled: true,
      axis: null,
      stableAxis: null,
      motionConfidence: 0,
      approachAxis: null,
      dragUpIntoBox: false,
      dragDownFromTop: false,
      nearBottomEntry: false
    };
  }
  const a = trail[0];
  const b = trail[trail.length - 1];
  const dt = Math.max(16, b.t - a.t);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const speedCellsWhole = (dist / Math.max(grid.cell, 1e-6)) / (dt / 1000);
  const speedCellsRecent = getRecentTrailSpeedCells(item);
  const recentMove = getRecentTrailMoveCells(item);
  const relocating = recentMove > autoRotateRelocateTrailCells;
  // 当前操作：近端优先；停住后立即显示慢速/停稳
  const resolved = resolveCurrentSpeedBand(speedCellsWhole, speedCellsRecent, relocating);
  const speedBand = resolved.speedBand;
  const speedCells = resolved.speedCells;

  const scrub = detectEdgeScrub(item, edgeBand);
  const motion = getStableMotionHint(item);
  const entry = getVerticalEntryGesture(item, { x: b.x, z: b.z });
  // 从下往上路过底边：不把「贴底刷边」当强瞄准
  const edgeScrub = entry.dragUpIntoBox && entry.nearBottomEntry
    ? false
    : scrub.scrubbing;

  /**
   * 停稳：近端速度在 settled 档即可。
   * 不再要求 !relocating——轨迹采样修成多点后，手指微抖会让 path 长度
   * 虚高，若再 && !relocating，唯一角 Hot 会永远进不了帮转。
   */
  const settled = speedBand === 'settled';
  // 慢滑：速度窗 + 主轴稳 + 在动 + 非上拖路过底边
  const axisConf = getSlowSlideAxisConfidence();
  const axisOk = (motion.confidence || 0) >= axisConf
    || (motion.stableAxis && (motion.confidence || 0) >= axisConf * 0.9);
  const passBottomUp = entry.dragUpIntoBox && entry.nearBottomEntry;
  /**
   * 左右平移就位（如拖到最右侧竖放）：这是挪位不是改朝向。
   * 主移轴为 x 且置信够 → 不进慢滑帮转，避免「往右滑被拧成横条」。
   * 注意：Hot（唯一角）在门控里会跳过 lateralCarry 硬禁。
   */
  const lateralCarry = Boolean(
    motion.stableAxis === 'x'
    && (motion.confidence || 0) >= getSlowSlideAxisConfidence()
    && relocating
  );
  const slowSlide = speedBand === 'slowSlide'
    && relocating
    && axisOk
    && !passBottomUp
    && !lateralCarry;

  const hovering = settled || speedBand === 'settled';
  const aiming = speedBand === 'settled' || speedBand === 'slowSlide';
  let axis = null;
  if (dist > grid.cell * 0.12) {
    axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
  }

  // 帮转：停稳 / 慢滑 / 刷边；常速、快滑默认不进（Hot 另有放宽）
  const allowRotateAssist = edgeScrub || settled || slowSlide;
  const allowAssist = allowRotateAssist || speedBand === 'normal';

  return {
    speedCells,
    speedCellsRecent,
    speedBand,
    dx,
    dz,
    hovering,
    aiming,
    slowSlide,
    lateralCarry,
    edgeScrub,
    scrubAxis: edgeScrub ? scrub.preferredLongAxis : null,
    allowAssist,
    allowRotateAssist,
    relocating,
    settled,
    axis: motion.stableAxis || axis,
    stableAxis: motion.stableAxis || axis,
    motionConfidence: motion.confidence,
    approachAxis: motion.approachAxis,
    dragUpIntoBox: entry.dragUpIntoBox,
    dragDownFromTop: entry.dragDownFromTop,
    nearBottomEntry: entry.nearBottomEntry
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

/**
 * 四边区域：left/right/top/bottom（箱体 0~1 归一化）。
 * band 越小越贴边。
 */
function getEdgeSide(worldPosition, edgeBand = 0.28) {
  const u = (worldPosition.x - grid.left) / Math.max(grid.width, 1e-6);
  const v = (worldPosition.z - grid.top) / Math.max(grid.depth, 1e-6);
  const dLeft = u;
  const dRight = 1 - u;
  const dTop = v;
  const dBottom = 1 - v;
  const minD = Math.min(dLeft, dRight, dTop, dBottom);
  if (minD > edgeBand) return null;
  if (minD === dLeft) return 'left';
  if (minD === dRight) return 'right';
  if (minD === dTop) return 'top';
  return 'bottom';
}

/**
 * 「拧着贴边」强意图：
 * - 横条(长轴 x) 到左/右边 → 想竖过来 (z)
 * - 竖条(长轴 z) 到上/下边 → 想横过来 (x)
 * 已经顺边则 mismatched=false（不要乱转）。
 */
function getMismatchEdgeIntent(item, worldPosition, edgeBand = 0.28) {
  const side = getEdgeSide(worldPosition, edgeBand);
  if (!side) return null;

  const curLong = shapeLongAxis(rotateShape(item.shape, item.rotation));
  if (!curLong) return null; // 正方形无横竖

  const sideIsVertical = side === 'left' || side === 'right';
  const preferredLongAxis = sideIsVertical ? 'z' : 'x';
  const mismatched = curLong !== preferredLongAxis;

  return {
    side,
    preferredLongAxis,
    mismatched,
    currentLongAxis: curLong
  };
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

/** 脚印格数 / 跨度：4×2 等大件要更钝（最后一块会放宽） */
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

/** 是否箱内最后一块未放物品（含正在拖的这一块） */
function isLastRemainingItem(item) {
  return items.every((entry) => entry === item || entry.placed);
}

/**
 * 最后一块全盘朝向分析：哪种脚印还能填洞。
 * - uniqueFillShapeKey：全盘只剩一种脚印能放
 * - needsRotateToFill：当前脚印全盘 0 合法，但别的脚印有
 * - preferredRotation：优先帮转的朝向（最短步数）
 */
function analyzeLastPieceFill(item) {
  if (!isLastRemainingItem(item)) return null;

  const byShape = new Map();
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const shape = rotateShape(item.shape, rotation);
    const shapeKey = shapeMatrixKey(shape);
    const steps = minRotationSteps(item.rotation, rotation);
    let count = 0;
    let sample = null;
    const maxX = grid.cols - shape[0].length;
    const maxY = grid.rows - shape.length;
    for (let gy = 0; gy <= maxY; gy += 1) {
      for (let gx = 0; gx <= maxX; gx += 1) {
        const placement = getPlacement(item, gx, gy, shape);
        if (!placement.valid) continue;
        count += 1;
        if (!sample) {
          sample = {
            gx,
            gy,
            shape,
            rotation,
            shapeKey,
            baseLevel: placement.baseLevel,
            valid: true,
            inside: true
          };
        }
      }
    }
    const prev = byShape.get(shapeKey);
    if (!prev || count > prev.count || (count === prev.count && steps < prev.steps)) {
      byShape.set(shapeKey, {
        shapeKey,
        rotation,
        steps,
        count,
        sample,
        shape
      });
    }
  }

  const currentKey = shapeMatrixKey(rotateShape(item.shape, item.rotation));
  const currentEntry = byShape.get(currentKey);
  const fillable = [...byShape.values()].filter((e) => e.count > 0);
  const uniqueFill = fillable.length === 1 ? fillable[0] : null;
  const currentHasAny = (currentEntry?.count || 0) > 0;
  const needsRotateToFill = !currentHasAny && fillable.length >= 1;

  let preferredRotation = null;
  if (uniqueFill) preferredRotation = uniqueFill.rotation;
  else if (needsRotateToFill) {
    fillable.sort((a, b) => a.steps - b.steps || b.count - a.count);
    preferredRotation = fillable[0].rotation;
  }

  return {
    uniqueFillShapeKey: uniqueFill?.shapeKey ?? null,
    uniqueFillRotation: uniqueFill?.rotation ?? null,
    needsRotateToFill,
    preferredRotation,
    currentHasAny,
    fillableCount: fillable.length
  };
}

/**
 * 意图自动转角 · L0–L4 编排（行为与拆分前一致，结构分层）：
 *   L0 采样 → L1 准入 → L2 落点发现 → L3 决策 → L4 确认提交
 */

/** L0：每帧上下文（trail / Ghost / 分档 / 最后一块） */
function sampleIntentContext(item, worldPosition) {
  const profile = getAutoRotateAssistProfile();
  const bulk = getItemFootprintBulk(item);
  const lastPiece = isLastRemainingItem(item);
  const lastFill = lastPiece ? analyzeLastPieceFill(item) : null;
  if (lastPiece) {
    item.finalIntentPlacement = getFinalItemIntentPlacement(item);
    item.lastPieceFill = lastFill;
  }
  const current = getCandidate(item, worldPosition);
  const now = performance.now();
  const trend = getDragTrend(item, profile.edgeBand);
  const edgeHint = trend.scrubAxis
    || (trend.hovering || trend.settled
      ? getEdgeAlignmentHint(worldPosition, profile.edgeBand)
      : null);
  return {
    item,
    worldPosition,
    profile,
    bulk,
    lastPiece,
    lastFill,
    current,
    now,
    trend,
    edgeHint
  };
}

/**
 * L1 硬门：进箱 / 手动锁 / 绿不抢（与通道无关，必须先过）
 */
function passIntentHardGates(ctx) {
  const {
    item, worldPosition, lastPiece, lastFill, current, now, trend
  } = ctx;

  if (!canAssistRotateInBox(item, worldPosition, now, trend)) {
    return { ok: false, clearIntent: true };
  }

  // 手动优先：锁内全场景静默（含 lastMust，禁止穿锁）
  const manualLockLeft = (item.manualLockUntil ?? 0) - now;
  if (manualLockLeft > 0) {
    return { ok: false, clearIntent: true };
  }

  // 绿不抢
  if (current.valid) {
    return { ok: false, clearIntent: true };
  }

  return { ok: true };
}

/**
 * 最后一块是否「必须转才能填」（P1 格子结论，不是时延）。
 */
function isLastPieceMustRotate(ctx) {
  const { lastPiece, lastFill } = ctx;
  return Boolean(
    lastPiece
    && lastFill
    && (lastFill.needsRotateToFill || lastFill.uniqueFillShapeKey)
  );
}

/**
 * P2：格子分类 → 场景档（只决定用哪一行 policy，不直接改 dwell）
 */
function resolveIntentScenario(ctx, classified, region) {
  if (isLastPieceMustRotate(ctx) || classified?.hotReason === 'last') {
    return INTENT_SCENARIOS.lastMust;
  }
  if (classified?.channel === 'hot') {
    if (classified.hotReason === 'board') {
      return INTENT_SCENARIOS.uniqueBoard;
    }
    // 邻域唯一且当前 snap0 非法 → 强唯一（长条贴槽）
    if (
      classified.hotReason === 'region'
      && region
      && !region.currentSnap0Valid
    ) {
      return INTENT_SCENARIOS.uniqueRegionHard;
    }
    return INTENT_SCENARIOS.hotSoft;
  }
  if (classified?.channel === 'warm') return INTENT_SCENARIOS.warm;
  return INTENT_SCENARIOS.cold;
}

/** 手势是否满足场景要求（P3） */
function passScenarioGesture(ctx, scenario) {
  const { profile, bulk, lastPiece, trend } = ctx;
  const mode = scenario?.gesture || 'cold';

  if (mode === 'notFast') {
    if (trend.speedBand === 'fast') {
      return { ok: false, clearIntent: true };
    }
    return { ok: true };
  }

  if (mode === 'aiming') {
    if (trend.speedBand === 'fast') {
      return { ok: false, clearIntent: true };
    }
    if (trend.speedBand === 'normal' && !trend.allowRotateAssist && !trend.settled) {
      return { ok: false, clearIntent: true };
    }
    if (
      trend.allowRotateAssist
      || trend.settled
      || trend.speedBand === 'settled'
      || trend.speedBand === 'slowSlide'
      || trend.edgeScrub
    ) {
      return { ok: true };
    }
    return { ok: false, clearIntent: true };
  }

  if (mode === 'warm') {
    if (
      trend.settled
      || trend.slowSlide
      || trend.edgeScrub
      || trend.allowRotateAssist
    ) {
      return { ok: true };
    }
    return { ok: false, clearIntent: true };
  }

  // cold
  if (profile.requireAiming && !trend.allowRotateAssist) {
    return { ok: false, clearIntent: true };
  }
  if (
    trend.lateralCarry
    && !trend.edgeScrub
    && !trend.settled
  ) {
    return { ok: false, clearIntent: true };
  }
  if (
    trend.relocating
    && !trend.slowSlide
    && !trend.edgeScrub
    && !trend.settled
  ) {
    return { ok: false, clearIntent: true };
  }
  if (bulk.isLarge && !lastPiece && !trend.settled && !trend.edgeScrub) {
    return { ok: false, clearIntent: true };
  }
  if (bulk.isLarge && lastPiece && !trend.allowRotateAssist) {
    return { ok: false, clearIntent: true };
  }
  return { ok: true };
}

/**
 * L1 手势门：只读 scenario.gesture
 */
function passIntentGestureGates(ctx, scenario) {
  return passScenarioGesture(ctx, scenario || INTENT_SCENARIOS.cold);
}

/**
 * @deprecated 兼容：硬门 + cold 手势
 */
function passIntentContextGates(ctx) {
  const hard = passIntentHardGates(ctx);
  if (!hard.ok) return hard;
  return passIntentGestureGates(ctx, INTENT_SCENARIOS.cold);
}

/**
 * P5：是否相对上次帮转的「反拧」（目标角不同）
 */
function isAssistReverseTwist(item, targetRotation) {
  if (item.assistCommitRotation == null) return false;
  if (targetRotation === item.assistCommitRotation) return false;
  return Boolean(item.assistDidRotateThisDrag)
    || (item.assistCommitUntil ?? 0) > performance.now();
}

function isAssistReverseBlockedByStickiness(item, worldPosition, targetRotation) {
  if (!isAssistReverseTwist(item, targetRotation)) return false;
  const origin = item.assistCommitPosition;
  if (!origin) return (item.assistCommitUntil ?? 0) > performance.now();
  const moveCells = Math.hypot(worldPosition.x - origin.x, worldPosition.z - origin.z)
    / Math.max(grid.cell, 1e-6);
  return moveCells < INTENT_ANTI_REVERSE.minMoveCells;
}

/**
 * 基础 scoreMargin（档位底）
 */
function baseIntentScoreMargin(ctx) {
  const { profile, bulk, lastPiece, trend } = ctx;
  let scoreMargin = trend.settled || trend.edgeScrub
    ? profile.hoverScoreMargin
    : profile.scoreMargin;
  if (bulk.isLarge) scoreMargin = Math.max(scoreMargin, 0.55);
  if (lastPiece) scoreMargin *= 0.55;
  if (profile.tier === 'small') scoreMargin = Math.max(scoreMargin, 0.42);
  return scoreMargin;
}

/**
 * 全盘：当前物品各互异脚印还有多少合法落点。
 * 用于「剩余格子只剩竖/横一种」→ Hot，不必等。
 * 互异脚印 ≤3 时全盘扫可接受。
 */
function analyzeBoardOrientFill(item) {
  const orients = getDistinctRotationOptions(item, { includeCurrent: true });
  if (orients.length === 0 || orients.length > 3) return null;

  const byShape = new Map();
  for (const { rotation, shape, key: shapeKey, isCurrent, steps } of orients) {
    let count = 0;
    let sample = null;
    const maxX = grid.cols - shape[0].length;
    const maxY = grid.rows - shape.length;
    if (maxX < 0 || maxY < 0) {
      byShape.set(shapeKey, {
        shapeKey, rotation, isCurrent, steps, count: 0, sample: null, shape
      });
      continue;
    }
    for (let gy = 0; gy <= maxY; gy += 1) {
      for (let gx = 0; gx <= maxX; gx += 1) {
        const placement = getPlacement(item, gx, gy, shape);
        if (!placement.valid) continue;
        count += 1;
        if (!sample) {
          sample = {
            gx,
            gy,
            shape,
            rotation,
            shapeKey,
            baseLevel: placement.baseLevel,
            valid: true,
            distanceSq: 0,
            score: 0,
            isCurrent: Boolean(isCurrent),
            steps
          };
        }
      }
    }
    const prev = byShape.get(shapeKey);
    if (!prev || count > prev.count || (count === prev.count && steps < prev.steps)) {
      byShape.set(shapeKey, {
        shapeKey,
        rotation,
        isCurrent: Boolean(isCurrent),
        steps,
        count,
        sample,
        shape
      });
    }
  }

  const placeable = [...byShape.values()].filter((e) => e.count > 0);
  const currentEntry = placeable.find((e) => e.isCurrent) || null;
  const others = placeable.filter((e) => !e.isCurrent);
  // 全盘只剩一种脚印能放，且不是当前朝向（或当前 0 合法）
  if (placeable.length === 1 && !placeable[0].isCurrent) {
    return {
      uniqueShapeKey: placeable[0].shapeKey,
      uniqueRotation: placeable[0].rotation,
      sample: placeable[0].sample,
      currentHasAny: false
    };
  }
  if ((!currentEntry || currentEntry.count === 0) && others.length === 1) {
    return {
      uniqueShapeKey: others[0].shapeKey,
      uniqueRotation: others[0].rotation,
      sample: others[0].sample,
      currentHasAny: Boolean(currentEntry && currentEntry.count > 0)
    };
  }
  return null;
}

/**
 * 形状 × 可放格子 → 通道
 * hot  = 邻域或全盘唯一其它可放脚印（剩余格子只剩一种摆法）
 * warm = 多脚印但 best 显著领先
 * cold = 平手/不明确
 */
function classifyIntentChannel(ctx, region) {
  const { item, lastPiece, lastFill, worldPosition } = ctx;
  const best = region.bestCandidate;
  const scoreMargin = baseIntentScoreMargin(ctx);

  // 1) 邻域唯一
  if (region.uniqueOtherShapeKey && best && !best.isCurrent) {
    return { channel: 'hot', scoreMargin: 0, lead: Infinity, hotReason: 'region' };
  }

  // 2) 全盘剩余格子只剩一种脚印（如图：两侧只剩竖槽）
  const boardUnique = analyzeBoardOrientFill(item);
  if (boardUnique?.uniqueShapeKey) {
    // 尽量挂上邻域 best；没有则用全盘 sample 补候选
    let hotBest = best && best.shapeKey === boardUnique.uniqueShapeKey ? best : null;
    if (!hotBest && boardUnique.sample) {
      const distSq = footprintDistanceSq(
        worldPosition,
        boardUnique.sample.gx,
        boardUnique.sample.gy,
        boardUnique.sample.shape
      );
      hotBest = {
        ...boardUnique.sample,
        distanceSq: distSq,
        score: -autoRotateDistWeight * (Math.sqrt(distSq) / Math.max(grid.cell, 1e-6)),
        isCurrent: false,
        steps: minRotationSteps(item.rotation, boardUnique.uniqueRotation)
      };
    }
    if (hotBest && hotBest.rotation !== item.rotation) {
      return {
        channel: 'hot',
        scoreMargin: 0,
        lead: Infinity,
        hotReason: 'board',
        hotBest
      };
    }
  }

  // 最后一块必须转 / 全盘唯一脚印：直接 Hot，尽快帮转
  if (lastPiece && lastFill) {
    if (lastFill.needsRotateToFill && lastFill.preferredRotation != null) {
      let lastBest = best && best.rotation === lastFill.preferredRotation
        ? best
        : null;
      if (!lastBest && region.matches?.length) {
        lastBest = region.matches.find(
          (m) => m.rotation === lastFill.preferredRotation && m.valid
        ) || null;
      }
      if (!lastBest && best && !best.isCurrent) {
        lastBest = best;
      }
      if (lastBest) {
        return {
          channel: 'hot',
          scoreMargin: 0,
          lead: Infinity,
          hotReason: 'last',
          hotBest: lastBest
        };
      }
      // 尚无邻域候选也标 Hot，后续用 preferred 由区域扩大扫描补
      return { channel: 'hot', scoreMargin: 0, lead: Infinity, hotReason: 'last' };
    }
    if (
      lastFill.uniqueFillShapeKey
      && best
      && !best.isCurrent
      && best.shapeKey === lastFill.uniqueFillShapeKey
    ) {
      return {
        channel: 'hot',
        scoreMargin: 0,
        lead: Infinity,
        hotReason: 'last',
        hotBest: best
      };
    }
  }

  if (!best) return { channel: 'cold', scoreMargin, lead: 0 };

  const rival = region.bestRivalOther;
  if (!rival) {
    return { channel: 'warm', scoreMargin, lead: Infinity };
  }

  const lead = best.score - rival.score;
  const warmNeed = Math.max(
    scoreMargin * autoRotateWarmMarginMul,
    autoRotateWarmLeadFloor
  );
  if (lead >= warmNeed) {
    return { channel: 'warm', scoreMargin, lead, warmNeed };
  }
  return { channel: 'cold', scoreMargin, lead, warmNeed };
}

/** L1 后半：冷却 / 提交锁 —— 只读 scenario */
function passIntentTimingGates(ctx, region, scenario) {
  const {
    item, profile, bulk, lastPiece, now, trend
  } = ctx;
  const sc = scenario || INTENT_SCENARIOS.cold;
  const channel = sc.channel;

  let cooldownMs = bulk.isLarge && !lastPiece
    ? profile.cooldownMs * 1.35
    : profile.cooldownMs;
  cooldownMs *= sc.cooldownMul ?? 1;

  const entryDampen = channel === 'cold'
    && !sc.skipEntryDampen
    && isAssistEntryDampenActive(item, trend, now);
  if (entryDampen) {
    cooldownMs *= 1.2;
  } else if (channel === 'cold' && !region.currentSnap0Valid && region.bestCandidate) {
    cooldownMs *= 0.72;
  }
  if (trend.dragDownFromTop && channel === 'cold' && !entryDampen) {
    cooldownMs *= 0.85;
  }
  if (profile.tier === 'small' && channel === 'cold' && !lastPiece) {
    cooldownMs = Math.max(cooldownMs, profile.cooldownMs);
  }
  if (now - (item.lastAutoRotationAt ?? 0) < cooldownMs) {
    return { ok: false, soft: true };
  }

  // 提交锁：默认 soft 挡住再评估（防秒反拧）。
  // 仅 allowCommitOverride 场景（最后一块必须转）可越过。
  const commitLeft = (item.assistCommitUntil ?? 0) - now;
  if (commitLeft > 0 && !sc.allowCommitOverride) {
    return { ok: false, soft: true };
  }

  return { ok: true };
}

/**
 * L3 决策：格子候选 + 场景手势复核 + 防反拧(P5)
 * @returns {{ ok: true, best, channel, scenario } | { ok: false, clearIntent?: boolean }}
 */
function decideIntentRotation(ctx, region, classified, scenario) {
  const {
    item, trend, now, worldPosition
  } = ctx;

  const cls = classified || classifyIntentChannel(ctx, region);
  const sc = scenario || resolveIntentScenario(ctx, cls, region);
  const { channel, scoreMargin, hotBest } = cls;
  const best = (channel === 'hot' && hotBest) ? hotBest : region.bestCandidate;

  if (!best || !best.valid) {
    return { ok: false, clearIntent: true };
  }
  if (best.isCurrent || best.rotation === item.rotation) {
    return { ok: false, clearIntent: true };
  }

  // 托盘/起拖声明角：非 eager 不得拧走；eager 须停稳或刷边（防乱杀玩家在物品区选的角）
  const anchor = item.intentAnchorRotation;
  if (
    anchor != null
    && best.rotation !== anchor
    && best.rotation !== item.rotation
  ) {
    const canOverrideTray = TRAY_CHOICE_OVERRIDE_SCENARIOS.has(sc.id);
    if (!canOverrideTray) {
      return { ok: false };
    }
    if (!trend.settled && !trend.edgeScrub) {
      return { ok: false };
    }
  }

  // P5 防反拧：只拦「相对上次帮转」换到另一角
  if (
    isAssistReverseTwist(item, best.rotation)
    && !sc.allowCommitOverride
  ) {
    if (isAssistReverseBlockedByStickiness(item, worldPosition, best.rotation)) {
      return { ok: false };
    }
    if (
      INTENT_ANTI_REVERSE.requireSettledOrScrub
      && !trend.settled
      && !trend.edgeScrub
    ) {
      return { ok: false };
    }
  }

  const farHot = Boolean(sc.farHot);
  const maxDist = farHot
    ? region.maxDistanceSq * 4
    : region.maxDistanceSq;
  if (best.distanceSq > maxDist && !farHot) {
    return { ok: false, clearIntent: true };
  }
  if (farHot && best.distanceSq > (grid.cell * 8) ** 2) {
    return { ok: false, clearIntent: true };
  }

  // 进箱冷静：场景表 skipEntryGrace 跳过
  if (
    !sc.skipEntryGrace
    && isInAssistEntryGrace(item, now)
  ) {
    return { ok: false, clearIntent: true };
  }

  // 手势复核（与 L1 同一 scenario，避免双标准）
  const g = passScenarioGesture(ctx, sc);
  if (!g.ok) {
    return { ok: false, clearIntent: g.clearIntent };
  }

  if (channel !== 'hot') {
    let margin = scoreMargin;
    const entryDampen = !sc.skipEntryDampen
      && (channel === 'cold' || channel === 'warm')
      && isAssistEntryDampenActive(item, trend, now);
    if (entryDampen && channel === 'cold') margin *= 1.35;
    else if (entryDampen && channel === 'warm') margin *= 1.2;
    else if (trend.dragDownFromTop && channel === 'cold') margin *= 0.85;
    if (channel === 'warm' && !item.assistDidRotateThisDrag) {
      margin *= 1.15;
    }
    if (
      channel === 'warm'
      && (!region.currentSnap0Valid || region.otherCloserThanCurrent || !region.currentFingerViable)
    ) {
      margin *= 0.65;
    } else if (
      channel === 'cold'
      && !entryDampen
      && (!region.currentSnap0Valid || region.otherCloserThanCurrent || !region.currentFingerViable)
    ) {
      margin *= 0.45;
    }

    const rival = region.bestRivalOther;
    if (rival && best.score - rival.score < margin) {
      return { ok: false, clearIntent: true };
    }
    if (
      region.currentFingerViable
      && region.currentSnap0Valid
      && best.score - (region.bestCurrent?.score ?? -Infinity) < margin + (channel === 'warm' ? 0.18 : 0.2)
    ) {
      return { ok: false, clearIntent: true };
    }
  }

  return { ok: true, best, channel, scenario: sc };
}

/** L4：intentKey 稳定 + 场景 dwell + valid 提交 */
function confirmAndApplyIntentRotation(ctx, region, best, channel, scenario) {
  const {
    item, worldPosition, profile, bulk, lastPiece, lastFill, now, trend, edgeHint, current
  } = ctx;
  const sc = scenario || INTENT_SCENARIOS.hotSoft;

  let hoverCellKey;
  if (sc.id === 'lastMust' || (lastPiece && lastFill?.needsRotateToFill)) {
    hoverCellKey = `last:${best.shapeKey}`;
  } else if (channel === 'hot') {
    hoverCellKey = `hot:${sc.id}:${best.shapeKey}`;
  } else if (channel === 'warm') {
    hoverCellKey = `warm:${best.shapeKey}:${Math.floor(best.gx / 2)},${Math.floor(best.gy / 2)}`;
  } else if (trend.edgeScrub && edgeHint) {
    hoverCellKey = `cold:${best.shapeKey}:scrub:${edgeHint}`;
  } else if (bulk.isLarge) {
    hoverCellKey = `cold:${best.shapeKey}:L:${Math.floor(best.gx / 2)},${Math.floor(best.gy / 2)}`;
  } else {
    hoverCellKey = `cold:${best.shapeKey}:${best.gx},${best.gy},${best.baseLevel}`;
  }
  if (item.autoRotateIntentKey !== hoverCellKey) {
    item.autoRotateIntentKey = hoverCellKey;
    item.autoRotateIntentSince = now;
    return current;
  }

  let dwellScale = 1;
  if (trend.edgeScrub) dwellScale = profile.dwellScrubScale;
  else if (trend.settled) dwellScale = profile.dwellHoverScale;
  else if (trend.slowSlide) dwellScale = Math.min(1.05, profile.dwellHoverScale + 0.14);
  else dwellScale = Math.min(1, profile.dwellHoverScale + 0.2);
  if (bulk.isLarge && !lastPiece) dwellScale *= 1.45;

  if (lastPiece && sc.lastPieceDwellMul != null) {
    dwellScale *= sc.lastPieceDwellMul;
  } else if (lastPiece) {
    dwellScale *= 0.32;
  }

  const entryActive = isAssistEntryDampenActive(item, trend, now);
  const entryDampenCold = channel === 'cold' && entryActive && !sc.skipEntryDampen;
  const entryDampenWarm = channel === 'warm' && entryActive && !sc.skipEntryDampen;
  const entryDragDown = trend.dragDownFromTop && !trend.settled && channel === 'cold' && !entryDampenCold;
  if (entryDampenCold) dwellScale *= 1.7;
  else if (entryDampenWarm) dwellScale *= 1.28;
  else if (entryDragDown) dwellScale *= 0.82;

  // 场景表 hotDwell / warmDwell（只动当前场景行）
  if (channel === 'hot' && sc.hotDwell) {
    const hd = sc.hotDwell;
    if (trend.settled || trend.edgeScrub) {
      dwellScale *= hd.settled;
      dwellScale = Math.min(dwellScale, hd.settled + 0.06);
    } else if (trend.slowSlide) {
      dwellScale *= hd.slowSlide;
      dwellScale = Math.min(dwellScale, hd.slowSlide + 0.1);
    } else {
      dwellScale *= hd.other;
    }
  } else if (channel === 'warm' && sc.warmDwell) {
    const wd = sc.warmDwell;
    if (trend.settled || trend.edgeScrub) {
      dwellScale *= wd.settled;
      dwellScale = Math.min(dwellScale, 0.88);
    } else if (trend.slowSlide) {
      dwellScale *= wd.slowSlide;
      dwellScale = Math.min(dwellScale, 1.08);
    } else {
      dwellScale *= wd.other;
    }
  } else if (channel === 'cold') {
    if (trend.slowSlide && !entryDampenCold) dwellScale *= 1.35;
    if (profile.tier === 'small' && !lastPiece) {
      dwellScale = Math.max(dwellScale, 1.05);
    }
  }

  const firstAssist = !item.assistDidRotateThisDrag;
  if (firstAssist && !sc.skipFirstAssistMul && sc.firstAssistMul) {
    dwellScale *= sc.firstAssistMul;
  }

  let dwellNeed = profile.dwellMs * (sc.globalDwellMul ?? 1) * dwellScale;

  // 场景硬顶：只写在 eager 场景行上，hotSoft 为 null 不压
  if (trend.settled || trend.edgeScrub) {
    if (sc.dwellCapSettledMs != null) {
      dwellNeed = Math.min(dwellNeed, sc.dwellCapSettledMs);
    }
  } else if (sc.dwellCapMovingMs != null) {
    dwellNeed = Math.min(dwellNeed, sc.dwellCapMovingMs);
  }

  // P5：反拧加长（与 eager 第一次 dwell 隔离）
  if (
    isAssistReverseTwist(item, best.rotation)
    && !sc.allowCommitOverride
  ) {
    dwellNeed = Math.max(
      dwellNeed * INTENT_ANTI_REVERSE.dwellMul,
      INTENT_ANTI_REVERSE.minDwellMs
    );
  }

  if (now - (item.autoRotateIntentSince ?? 0) < dwellNeed) {
    return current;
  }

  if (!isPlacementStillValid(item, best)) {
    clearAutoRotateIntent(item);
    return current;
  }

  applyIntentRotation(item, best.rotation);
  item.lastAutoRotationAt = now;
  item.assistCommitRotation = best.rotation;
  item.assistCommitUntil = now + INTENT_ANTI_REVERSE.commitLockMs;
  item.assistCommitPosition = { x: worldPosition.x, z: worldPosition.z };
  // 帮转成功后锚点跟到新角，避免旧托盘角继续误挡后续合理消歧
  item.intentAnchorRotation = best.rotation;
  item.lastIntentChannel = channel;
  item.lastIntentScenario = sc.id;
  item.assistDidRotateThisDrag = true;
  clearAutoRotateIntent(item);
  const confirmed = getCandidateForRotation(item, worldPosition, item.rotation);
  return confirmed.valid ? confirmed : best;
}

/** 意图候选入口：P0 硬门 → P1 格子 → P2 场景 → P3 手势 → P4 时延 → P5/L3/L4 */
function getIntentCandidate(item, worldPosition) {
  const ctx = sampleIntentContext(item, worldPosition);
  const { current, trend, edgeHint, profile, bulk, lastFill } = ctx;

  const hard = passIntentHardGates(ctx);
  if (!hard.ok) {
    if (hard.clearIntent) clearAutoRotateIntent(item);
    return current;
  }

  const region = analyzeRegionPlaceableOrients(
    item,
    worldPosition,
    trend,
    edgeHint,
    profile,
    bulk,
    lastFill
  );

  const classified = classifyIntentChannel(ctx, region);
  const scenario = resolveIntentScenario(ctx, classified, region);
  const channel = scenario.channel;
  item.lastIntentChannel = channel;
  item.lastIntentScenario = scenario.id;

  const gesture = passIntentGestureGates(ctx, scenario);
  if (!gesture.ok) {
    if (gesture.clearIntent) clearAutoRotateIntent(item);
    return current;
  }

  const timing = passIntentTimingGates(ctx, region, scenario);
  if (!timing.ok) {
    if (timing.clearIntent) clearAutoRotateIntent(item);
    return current;
  }

  const decision = decideIntentRotation(ctx, region, classified, scenario);
  if (!decision.ok) {
    if (decision.clearIntent) clearAutoRotateIntent(item);
    return current;
  }

  return confirmAndApplyIntentRotation(
    ctx,
    region,
    decision.best,
    decision.channel || channel,
    decision.scenario || scenario
  );
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
 * L2 落点发现：在目标区域 R 内统计各互异脚印的合法落点。
 * - 距离硬截断 = R（防远处完美洞代打）
 * - 打分以「近」为主；刷边/方向仅轻消歧
 * - 含当前脚印，便于「R 内当前也能放 → 不转」
 */
function analyzeRegionPlaceableOrients(
  item,
  worldPosition,
  trend = null,
  edgeHint = null,
  profile = null,
  bulk = null,
  lastFill = null
) {
  const matches = [];
  const seen = new Set();
  const byShape = new Map();
  const finalPlacement = item.finalIntentPlacement;
  const dragTrend = trend || getDragTrend(item);
  const assist = profile || getAutoRotateAssistProfile();
  const pieceBulk = bulk || getItemFootprintBulk(item);
  const lastPieceFill = lastFill || item.lastPieceFill || null;
  const preferredAxis = edgeHint
    || (dragTrend.edgeScrub
      ? getEdgeAlignmentHint(worldPosition, assist.edgeBand)
      : null);
  const orients = getDistinctRotationOptions(item, { includeCurrent: true });

  // R：档位半径 + 形状跨度放宽；最后一块略放大；局部全死时用全盘 preferred 兜底
  let regionCells = assist.regionRadiusCells ?? 1.2;
  regionCells = autoRotateSnapLimitCells(regionCells, item.shape);
  if (lastPieceFill) regionCells += 0.45;
  if (lastPieceFill?.needsRotateToFill) regionCells += 0.35;
  // 区域扩张：停稳最宽；慢滑略宽；常速/快滑不走到这里
  const aimingLike = dragTrend.settled || dragTrend.edgeScrub
    || dragTrend.slowSlide
    || dragTrend.hovering;
  const maxSnapCells = aimingLike
    ? Math.max(regionCells, autoRotateSnapLimitCells(assist.hoverMaxSnapCells, item.shape))
    : Math.max(regionCells * 0.92, autoRotateSnapLimitCells(assist.maxSnapCells, item.shape));
  const maxDistanceSq = (grid.cell * maxSnapCells) ** 2;
  /**
   * 手指近旁核心区：判断「当前朝向在这儿能不能放」。
   * 不能用整个 R——小空箱时横竖在 R 里都有合法 kick，会永远不转。
   */
  const fingerCoreCells = Math.min(
    maxSnapCells,
    Math.max(0.5, (assist.regionRadiusCells ?? 1.2) * 0.55)
  );
  const fingerCoreDistSq = (grid.cell * fingerCoreCells) ** 2;

  for (const { rotation, shape, steps, key: shapeKey, isCurrent } of orients) {
    const snap = getSnapGridForShape(worldPosition, shape, assist.insidePad);
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

      const distanceSq = footprintDistanceSq(worldPosition, gx, gy, shape);
      // 硬截断：不在 R 内的合法位不参与（防代打远处洞）
      if (distanceSq > maxDistanceSq) continue;

      const distCells = Math.sqrt(distanceSq) / Math.max(grid.cell, 1e-6);
      const nearFinger = distanceSq <= fingerCoreDistSq;
      // 主分：越近越好
      let score = -autoRotateDistWeight * distCells;
      score -= autoRotateStepPenalty * steps;

      // 粘滞仅当「当前朝向在手指近旁就能放」；远 kick 不粘，否则小箱永远横着
      if (isCurrent && nearFinger) score += 0.22;

      // 手指 snap 位（kick0）合法：强信号「这个朝向就是对准这里」
      if (dx === 0 && dy === 0) {
        score += pieceBulk.isLarge ? 0.55 : 0.95;
        if (dragTrend.edgeScrub) score += pieceBulk.isLarge ? 0.2 : 0.35;
        else if (dragTrend.hovering) score += pieceBulk.isLarge ? 0.15 : 0.3;
        else if (!pieceBulk.isLarge && dragTrend.aiming) score += 0.22;
      }
      if (distanceSq < 1e-8) {
        score += pieceBulk.isLarge ? 0.18 : 0.7;
      }
      if (pieceBulk.isLarge && (Math.abs(dx) + Math.abs(dy) >= 2)) {
        score -= 0.4;
      }

      // 轻消歧：仅明确刷边时用贴边偏好
      if (dragTrend.edgeScrub && preferredAxis && longAxis) {
        const edgeW = (pieceBulk.isLarge ? assist.edgeBonus * 0.5 : assist.edgeBonus) * 0.85;
        if (longAxis === preferredAxis) score += edgeW;
        else score -= edgeW * 0.25;
      }

      /**
       * 位置贴左/右：偏好竖放；贴上/下：偏好横放（弱，仅停稳/慢滑）。
       * 修正「往右侧滑就按移动轴拧成横条」。
       */
      if (
        longAxis
        && (dragTrend.settled || dragTrend.slowSlide || dragTrend.edgeScrub)
        && !dragTrend.lateralCarry
      ) {
        const sideHint = getEdgeAlignmentHint(worldPosition, assist.edgeBand * 1.05);
        if (sideHint) {
          const sideW = assist.edgeBonus * 0.4;
          if (longAxis === sideHint) score += sideW;
          else score -= sideW * 0.2;
        }
      }

      /**
       * 移动消歧（停稳/刷边才信；不用「移动轴=长轴」——
       * 左右滑去右侧竖放时 stableAxis=x，旧逻辑会错误偏好横放。
       * 只保留 approachAxis：往侧边拱 → 轻推竖。
       */
      const useMotionDir = longAxis
        && dragTrend.approachAxis
        && (dragTrend.motionConfidence || 0) >= autoRotateMotionConfidenceMin
        && (dragTrend.settled || dragTrend.edgeScrub)
        && !dragTrend.lateralCarry;
      if (useMotionDir) {
        let dirW = autoRotateMotionDirBonus * (assist.motionDirWeight ?? 0.7) * 0.55;
        if (pieceBulk.isLarge) dirW *= 0.38;
        const conf = dragTrend.motionConfidence;
        if (longAxis === dragTrend.approachAxis) score += dirW * conf;
      }

      if (finalPlacement && rotation === finalPlacement.rotation) {
        score += pieceBulk.isLarge ? autoRotateFinalBonus * 0.45 : autoRotateFinalBonus;
      }

      if (lastPieceFill?.preferredRotation != null) {
        const prefShape = shapeMatrixKey(
          rotateShape(item.shape, lastPieceFill.preferredRotation)
        );
        if (shapeKey === prefShape) {
          score += lastPieceFill.uniqueFillShapeKey ? 1.2 : 0.85;
          if (lastPieceFill.needsRotateToFill) score += 0.5;
        } else if (lastPieceFill.uniqueFillShapeKey) {
          score -= 0.75;
        }
      }

      const entry = {
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
        baseLevel: placement.baseLevel,
        isCurrent: Boolean(isCurrent)
      };
      matches.push(entry);

      const agg = byShape.get(shapeKey) || {
        shapeKey,
        count: 0,
        countNear: 0,
        snap0Valid: false,
        best: null,
        bestNear: null,
        isCurrent: Boolean(isCurrent),
        rotation
      };
      agg.count += 1;
      if (nearFinger) {
        agg.countNear += 1;
        if (!agg.bestNear || entry.score > agg.bestNear.score) agg.bestNear = entry;
      }
      if (dx === 0 && dy === 0) agg.snap0Valid = true;
      if (!agg.best || entry.score > agg.best.score) {
        agg.best = entry;
        agg.rotation = rotation;
      }
      byShape.set(shapeKey, agg);
    }
  }

  // 局部 R 全空但最后一块全局必须转：用全盘 preferred 再扫一次扩大 R
  if (
    matches.length === 0
    && lastPieceFill?.needsRotateToFill
    && lastPieceFill.preferredRotation != null
  ) {
    const rotation = lastPieceFill.preferredRotation;
    const shape = rotateShape(item.shape, rotation);
    const shapeKey = shapeMatrixKey(shape);
    const steps = minRotationSteps(item.rotation, rotation);
    const snap = getSnapGridForShape(worldPosition, shape, assist.insidePad + 0.5);
    const kickList = getAutoRotateKicks(shape, true);
    const expandedMax = (grid.cell * (maxSnapCells + 1.2)) ** 2;
    for (const [dx, dy] of kickList) {
      const gx = snap.gx + dx;
      const gy = snap.gy + dy;
      const placement = getPlacement(item, gx, gy, shape);
      if (!placement.valid) continue;
      const distanceSq = footprintDistanceSq(worldPosition, gx, gy, shape);
      if (distanceSq > expandedMax) continue;
      const distCells = Math.sqrt(distanceSq) / Math.max(grid.cell, 1e-6);
      const entry = {
        gx,
        gy,
        shape,
        rotation,
        shapeKey,
        steps,
        inside: true,
        distanceSq,
        score: -autoRotateDistWeight * distCells + 1.5,
        valid: true,
        baseLevel: placement.baseLevel,
        isCurrent: false
      };
      matches.push(entry);
      byShape.set(shapeKey, {
        shapeKey,
        count: 1,
        best: entry,
        isCurrent: false,
        rotation
      });
      break;
    }
  }

  matches.sort((a, b) => b.score - a.score || a.distanceSq - b.distanceSq || a.steps - b.steps);

  const viable = [...byShape.values()].filter((e) => e.count > 0);
  const otherViable = viable.filter((e) => !e.isCurrent);
  const currentAgg = viable.find((e) => e.isCurrent) || null;
  const otherNear = otherViable.filter((e) => e.countNear > 0);
  const currentFingerViable = Boolean(currentAgg && currentAgg.countNear > 0);
  const currentSnap0Valid = Boolean(currentAgg?.snap0Valid);

  /**
   * 唯一可放（强意图）——按优先级：
   * 1) 手指近旁当前放不下，恰好一种其它脚印近旁能放
   * 2) 当前 snap0 非法，恰好一种其它 snap0 合法
   * 3) 当前 snap0 非法，R 内恰好一种其它脚印有合法（2×1 横↔竖经典路径）
   */
  let uniqueOtherShapeKey = null;
  if (!currentFingerViable && otherNear.length === 1) {
    uniqueOtherShapeKey = otherNear[0].shapeKey;
  } else if (!currentSnap0Valid) {
    const otherSnap0 = otherViable.filter((e) => e.snap0Valid);
    if (otherSnap0.length === 1) {
      uniqueOtherShapeKey = otherSnap0[0].shapeKey;
    } else if (otherViable.length === 1) {
      // 空 2×2 上横条红框：竖放是唯一另一种脚印
      uniqueOtherShapeKey = otherViable[0].shapeKey;
    }
  }

  // 最后一块：全局唯一可填脚印
  if (
    !uniqueOtherShapeKey
    && lastPieceFill?.uniqueFillShapeKey
    && lastPieceFill.needsRotateToFill
  ) {
    const g = byShape.get(lastPieceFill.uniqueFillShapeKey);
    if (g && !g.isCurrent) uniqueOtherShapeKey = g.shapeKey;
  }

  const bestCandidate = uniqueOtherShapeKey
    ? (byShape.get(uniqueOtherShapeKey)?.bestNear
      || byShape.get(uniqueOtherShapeKey)?.best
      || matches.find((m) => !m.isCurrent)
      || null)
    : (matches.find((m) => !m.isCurrent) || null);

  const otherMatches = matches.filter((m) => !m.isCurrent);
  let bestRivalOther = null;
  if (otherMatches.length >= 2) {
    bestRivalOther = otherMatches.find((m) => m.shapeKey !== otherMatches[0].shapeKey) || null;
  }

  // 其它朝向是否明显比「当前近旁最佳」更贴手指
  const bestCurrentNear = currentAgg?.bestNear || currentAgg?.best || null;
  const otherCloserThanCurrent = Boolean(
    bestCandidate
    && bestCurrentNear
    && bestCandidate.distanceSq + (grid.cell * 0.12) ** 2 < bestCurrentNear.distanceSq
  );

  return {
    matches,
    byShape,
    bestCandidate,
    bestRivalOther,
    bestCurrent: bestCurrentNear,
    currentViable: Boolean(currentAgg),
    currentFingerViable,
    currentSnap0Valid,
    otherCloserThanCurrent,
    uniqueOtherShapeKey,
    maxDistanceSq,
    maxSnapCells,
    fingerCoreCells
  };
}

/** @deprecated 兼容旧名：委托区域分析的 matches 列表 */
function rankNearbyRotationCandidates(
  item,
  worldPosition,
  trend = null,
  edgeHint = null,
  profile = null,
  bulk = null,
  lastFill = null
) {
  return analyzeRegionPlaceableOrients(
    item,
    worldPosition,
    trend,
    edgeHint,
    profile,
    bulk,
    lastFill
  ).matches;
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
        return { valid: false, baseLevel: 0, reason: 'out-of-bounds' };
      }

    }
  }

  for (let baseLevel = 0; baseLevel <= grid.levels - itemHeight; baseLevel += 1) {
    if (!isVoxelSpaceEmpty(voxelGrid, gx, gy, baseLevel, shape, itemHeight)) continue;
    if (!hasFullSupport(voxelGrid, gx, gy, baseLevel, shape)) continue;
    return { valid: true, baseLevel };
  }

  const stackIntent = getFootprintStackIntent(voxelGrid, gx, gy, shape);
  const maxBaseLevel = Math.max(0, grid.levels - itemHeight);
  const intendedBaseLevel = Math.min(stackIntent.maxStack, maxBaseLevel);
  const reason = stackIntent.maxStack + itemHeight > grid.levels
    ? 'height-exceeded'
    : 'blocked';

  // 非法时用「意图落脚层」画 ghost/网格，避免红框沉在第 0 层被已放物品遮住
  return {
    valid: false,
    baseLevel: intendedBaseLevel,
    reason
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

function getFootprintStackIntent(voxelGrid, gx, gy, shape) {
  let maxStack = 0;
  let hasVisibleFootprint = false;

  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const cx = gx + x;
      const cy = gy + y;
      if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) continue;
      hasVisibleFootprint = true;
      maxStack = Math.max(maxStack, getColumnStackHeight(voxelGrid, cx, cy));
    }
  }

  return { maxStack, hasVisibleFootprint };
}

/**
 * 非法放置时的展示层（方案 A）：
 * footprint 下各格堆高取 max —— 玩家通常对准最高支撑面去叠；
 * 再夹紧到物品仍能放进箱高的最大 baseLevel。
 * 例：部分格 stack=1、缺口 stack=0 时，红框画在第 1 层表面，而不是箱底。
 */
function getIntendedBaseLevel(voxelGrid, gx, gy, shape, itemHeight) {
  const { maxStack } = getFootprintStackIntent(voxelGrid, gx, gy, shape);
  const maxBaseLevel = Math.max(0, grid.levels - itemHeight);
  return Math.min(maxStack, maxBaseLevel);
}

function getGhostDisplayBaseLevel(item, gx, gy, shape, placement) {
  if (placement.valid) return placement.baseLevel;
  if (placement.reason === 'height-exceeded') return grid.levels;

  const voxelGrid = buildVoxelGrid(item);
  const itemHeight = getItemHeight(item);
  const maxBaseLevel = Math.max(0, grid.levels - itemHeight);
  const { maxStack, hasVisibleFootprint } = getFootprintStackIntent(voxelGrid, gx, gy, shape);

  if (!hasVisibleFootprint) return placement.baseLevel ?? 0;
  return THREE.MathUtils.clamp(maxStack, 0, maxBaseLevel);
}

function getGhostGuideLevel(item, displayBaseLevel, placement) {
  if (placement.reason === 'height-exceeded') return grid.levels;
  return THREE.MathUtils.clamp(displayBaseLevel, 0, Math.max(0, grid.levels - 1));
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
  // 逻辑角以放置候选为准（意图可能刚改 rotation，mesh 还在 lerp）
  if (next.rotation != null) item.rotation = next.rotation;
  item.gridX = next.gx;
  item.gridY = next.gy;
  item.level = next.baseLevel;
  item.placed = true;
  // 落定后清掉拖拽中的「拿起前」缓存，避免污染后续快照
  item.wasPlaced = false;
  item.previousPlacement = null;
  trayQueue = trayQueue.filter((entry) => entry !== item);
  const boardScale = getBoardItemScale();
  const shape = next.shape || rotateShape(item.shape, item.rotation);
  item.mesh.position.copy(gridToWorld(next.gx, next.gy, shape));
  item.mesh.position.y = getBoardItemY(item, boardScale, next.baseLevel);
  // 落定瞬间对齐旋转：避免「已放置但 mesh 还在转」的半成品感
  setItemRotationImmediate(item, item.rotation);
  setItemScale(item, boardScale);
  setItemOpacity(item, 1);
  setItemShadow(item, true);
  item.lastValid = { gx: next.gx, gy: next.gy, level: next.baseLevel, rotation: item.rotation };
  reconcilePlacementInvariants();
  layoutTrayQueue({ animate: true });
}

function clearAssistRotateSession(item) {
  if (!item) return;
  // 归位后重新计算：须再次进箱才允许帮转
  item.assistBoxUnlocked = false;
  item.assistBoxUnlockedAt = 0;
  item.assistEnteredFromBottomAt = 0;
  item.assistFromPlacedPickup = false;
  item.assistDidRotateThisDrag = false;
  item.lastAutoRotationAt = 0;
  item.assistCommitUntil = 0;
  item.assistCommitRotation = null;
  item.assistCommitPosition = null;
  item.lastIntentScenario = null;
  clearAutoRotateIntent(item);
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
    setItemOpacity(activeItem, 1);
    setItemShadow(activeItem, true);
    // 放回箱内原位：仍视为在箱体系，下次拿起 beginDrag 会按 placed 解锁
    clearAutoRotateIntent(activeItem);
    return;
  }

  activeItem.mesh.position.copy(activeItem.homePosition);
  activeItem.mesh.position.y = getTableItemY(activeItem, trayScale);
  activeItem.rotation = activeItem.trayRotation ?? activeItem.dragStartRotation ?? activeItem.rotation;
  setItemRotationImmediate(activeItem, activeItem.rotation);
  // 放回待放区：平滑缩回预览尺寸
  setItemScaleTarget(activeItem, trayScale);
  setItemOpacity(activeItem, 1);
  setItemShadow(activeItem, true);
  activeItem.placed = false;
  // 归位托盘：进箱解锁清零，下一次须重新进箱才帮转
  clearAssistRotateSession(activeItem);
}

function setItemShadow(item, enabled) {
  item.mesh.traverse((object) => {
    if (object.isMesh) object.castShadow = enabled;
  });
}

/** 拖拽半透明 / 落定不透明；材质需 transparent 才能看清脚下 ghost */
function setItemOpacity(item, opacity) {
  if (!item?.mesh) return;
  const alpha = THREE.MathUtils.clamp(opacity, 0.05, 1);
  item.mesh.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of mats) {
      mat.transparent = alpha < 0.999;
      mat.opacity = alpha;
      // 半透明时关掉 depthWrite，减少与 ghost 的排序闪烁
      mat.depthWrite = alpha >= 0.999;
      mat.needsUpdate = true;
    }
  });
}

const occluderRaycaster = new THREE.Raycaster();
const occluderRayOrigin = new THREE.Vector3();
const occluderRayDir = new THREE.Vector3();
const occluderSamplePoint = new THREE.Vector3();
/** 对 ghost 脚印采样视线，避免侧旁块仅因屏幕矩形重叠被误淡化 */
const OCCLUDER_SAMPLE_UVS = [
  [0.5, 0.5],
  [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8],
  [0.5, 0.15], [0.5, 0.85], [0.15, 0.5], [0.85, 0.5]
];

const ghostOcclusionSamples = OCCLUDER_SAMPLE_UVS.map(() => new THREE.Vector3());

/**
 * ghost 脚印平面上的世界坐标采样点（略抬高，对应可见提示面）。
 * @returns {number} 有效采样数量
 */
function fillGhostOcclusionSamples(candidate) {
  if (!candidate?.shape) return 0;
  const shape = candidate.shape;
  const cols = shape[0].length;
  const rows = shape.length;
  const origin = gridToWorld(candidate.gx, candidate.gy, shape);
  const displayBaseLevel = candidate.displayBaseLevel ?? candidate.baseLevel ?? 0;
  const y = getBoardSurfaceY() + displayBaseLevel * grid.levelHeight + 0.06;
  const halfW = (cols * grid.cell) / 2;
  const halfD = (rows * grid.cell) / 2;
  // 略向内收，减少擦边误判
  const inset = Math.min(grid.cell * 0.18, halfW * 0.45, halfD * 0.45);
  const minX = origin.x - halfW + inset;
  const maxX = origin.x + halfW - inset;
  const minZ = origin.z - halfD + inset;
  const maxZ = origin.z + halfD - inset;
  for (let i = 0; i < OCCLUDER_SAMPLE_UVS.length; i += 1) {
    const [u, v] = OCCLUDER_SAMPLE_UVS[i];
    ghostOcclusionSamples[i].set(
      THREE.MathUtils.lerp(minX, maxX, u),
      y,
      THREE.MathUtils.lerp(minZ, maxZ, v)
    );
  }
  return OCCLUDER_SAMPLE_UVS.length;
}

/**
 * 拖拽时：仅当已放块真实挡住「相机 → 落点 ghost」视线时才淡化。
 * 侧旁邻接、无高度挡视线的块不会触发（修复原先屏幕 AABB 误伤）。
 */
function updatePlacementOccluderFade(candidate) {
  const next = new Set();
  if (candidate?.inside && activeItem) {
    const sampleCount = fillGhostOcclusionSamples(candidate);
    const meshes = [];
    for (const item of items) {
      if (!item.placed || item === activeItem || !item.mesh?.visible) continue;
      meshes.push(item.mesh);
    }
    if (meshes.length && sampleCount) {
      occluderRayOrigin.copy(camera.position);
      for (let i = 0; i < sampleCount; i += 1) {
        const sample = ghostOcclusionSamples[i];
        occluderRayDir.copy(sample).sub(occluderRayOrigin);
        const dist = occluderRayDir.length();
        if (dist < 1e-4) continue;
        occluderRayDir.multiplyScalar(1 / dist);
        occluderRaycaster.set(occluderRayOrigin, occluderRayDir);
        occluderRaycaster.far = dist - 0.04;
        occluderRaycaster.near = 0.05;
        const hits = occluderRaycaster.intersectObjects(meshes, true);
        for (const hit of hits) {
          if (hit.distance >= dist - 0.04) continue;
          let root = hit.object;
          while (root && root.parent !== itemGroup) root = root.parent;
          const item = root?.userData?.item;
          if (item?.placed && item !== activeItem) next.add(item);
        }
      }
    }
  }

  for (const item of fadedOccluderItems) {
    if (!next.has(item) && item !== activeItem) setItemOpacity(item, 1);
  }
  for (const item of next) {
    setItemOpacity(item, OCCLUDER_ITEM_OPACITY);
  }
  fadedOccluderItems.clear();
  for (const item of next) fadedOccluderItems.add(item);
}

function clearPlacementOccluderFade() {
  for (const item of fadedOccluderItems) {
    if (item !== activeItem) setItemOpacity(item, 1);
  }
  fadedOccluderItems.clear();
  // 兜底：所有已放块恢复不透明（避免集合漏项）
  for (const item of items) {
    if (item.placed && item !== activeItem) setItemOpacity(item, 1);
  }
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
  clearGroup(ghostGroup);
  if (!next?.inside) return;
  const shape = next.shape;
  const height = 0.045;
  const ghostColor = next.valid ? '#22c55e' : '#ef4444';
  const fillOpacity = next.hint ? GHOST_HINT_FILL_OPACITY : GHOST_FILL_OPACITY;
  const mat = new THREE.MeshBasicMaterial({
    color: ghostColor,
    transparent: true,
    opacity: fillOpacity,
    depthWrite: false
  });
  const origin = gridToWorld(next.gx, next.gy, shape);
  const displayBaseLevel = next.displayBaseLevel ?? next.baseLevel ?? 0;
  const y = getBoardSurfaceY() + displayBaseLevel * grid.levelHeight + 0.035;
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
      opacity: GHOST_EDGE_OPACITY
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
  const preferred = getDesignedHintPlacements(item);

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

  candidates.sort((a, b) => (
    a.priority - b.priority
    || a.baseLevel - b.baseLevel
    || getHintCandidateCenterDistance(a) - getHintCandidateCenterDistance(b)
    || getStableHintTieBreak(item, a) - getStableHintTieBreak(item, b)
  ));
  return candidates;
}

function getDesignedHintPlacements(item) {
  if (level.keyItem !== item.id) return [];
  const placements = Array.isArray(level.keyPlacements)
    ? level.keyPlacements
    : (level.keyPlacement ? [level.keyPlacement] : []);

  return placements.map((placement) => ({
    gx: placement.gx ?? 0,
    gy: placement.gy ?? 0,
    baseLevel: placement.level ?? placement.baseLevel ?? 0,
    rotation: placement.rotation ?? 0
  }));
}

function getHintCandidatePriority(candidate, preferredPlacements) {
  if (!preferredPlacements.length) return 1;
  return preferredPlacements.some((preferred) => (
    candidate.gx === preferred.gx
    && candidate.gy === preferred.gy
    && candidate.baseLevel === preferred.baseLevel
    && candidate.rotation === preferred.rotation
  ))
    ? 0
    : 1;
}

function getHintCandidateCenterDistance(candidate) {
  const centerX = candidate.gx + candidate.shape[0].length / 2;
  const centerY = candidate.gy + candidate.shape.length / 2;
  return Math.abs(centerX - grid.cols / 2) + Math.abs(centerY - grid.rows / 2);
}

function getStableHintTieBreak(item, candidate) {
  const seed = `${level.id}:${item.id}:${candidate.rotation}:${candidate.baseLevel}:${candidate.gx}:${candidate.gy}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
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

/**
 * 仅物品区短点旋转：托盘可见且未入箱、未在拖中。
 * 箱内已放置 / 拖拽中：不可手动转（无旋转钮）。
 */
function rotateItemByTap(item) {
  if (!item || gamePhase !== 'play' || isGameplayLocked()) return;
  if (activeItem) return;
  if (item.placed || !item.trayVisible) return;

  clearHint();
  item.rotation = (item.rotation + 1) % 4;
  setItemRotationTarget(item, item.rotation);
  item.trayRotation = item.rotation;
  item.playerChosenRotation = item.rotation;
  item.intentAnchorRotation = item.rotation;
  item.manualLockUntil = performance.now() + manualLockMs;
  item.assistCommitUntil = 0;
  item.assistCommitRotation = null;
  item.assistCommitPosition = null;
  item.lastIntentScenario = null;
  item.finalIntentPlacement = null;
  clearAutoRotateIntent(item);
  layoutTrayQueue({ animate: true });
}

function resetLevel() {
  stopGameplayInteraction();
  completionShown = false;
  undoStack = [];
  trayQueue = [...items];
  for (const item of items) {
    item.rotation = item.initialTrayRotation ?? getCompactTrayRotation(item);
    item.trayRotation = item.rotation;
    item.placed = false;
    item.gridX = null;
    item.gridY = null;
    item.level = null;
    item.lastValid = null;
    item.trayVisible = false;
    item.targetPosition = null;
    item.targetRotationY = undefined;
    item.finalIntentPlacement = null;
    item.dragStartRotation = null;
    item.wasPlaced = false;
    item.previousPlacement = null;
    clearAssistRotateSession(item);
    setItemRotationImmediate(item, item.rotation);
    item.mesh.visible = true;
    setItemScale(item, trayScale);
    setItemShadow(item, true);
  }
  reconcilePlacementInvariants();
  trayScrollOffsetX = 0;
  trayScrollVelocity = 0;
  trayPointerMode = 'idle';
  layoutTrayQueue({ animate: false, preserveScroll: false });
  hideGridGuide();
  updateGhost(null);
  startOpeningSequence();
}

/**
 * 写入撤销栈的「逻辑放置态」。
 * beginDrag 会把 placed 置 false；若直接快照内存态，箱内重放后再撤销会变成
 * 「既不在 trayQueue、也不 placed」的孤儿块，导致穿模/拖不起。
 */
function getSnapshotItemState(item) {
  if (item === activeItem && item.wasPlaced && item.previousPlacement) {
    const prev = item.previousPlacement;
    return {
      id: item.id,
      rotation: prev.rotation,
      trayRotation: item.trayRotation,
      placed: true,
      gridX: prev.gx,
      gridY: prev.gy,
      level: prev.level,
      lastValid: item.lastValid
        ? { ...item.lastValid }
        : { gx: prev.gx, gy: prev.gy, level: prev.level, rotation: prev.rotation }
    };
  }

  const placed = Boolean(item.placed);
  return {
    id: item.id,
    rotation: item.rotation,
    trayRotation: item.trayRotation,
    placed,
    gridX: placed ? item.gridX : null,
    gridY: placed ? item.gridY : null,
    level: placed ? item.level : null,
    lastValid: item.lastValid ? { ...item.lastValid } : null
  };
}

/**
 * placed 与 trayQueue 互斥且覆盖全部物品。
 * 未放置清脏坐标；去掉拖拽缓存，避免后续快照/拾取再污染。
 */
function reconcilePlacementInvariants() {
  const seen = new Set();
  const nextQueue = [];

  for (const item of trayQueue) {
    if (!item || item.placed || seen.has(item.id)) continue;
    seen.add(item.id);
    nextQueue.push(item);
  }

  for (const item of items) {
    item.wasPlaced = false;
    item.previousPlacement = null;
    if (item.placed) {
      if (item.gridX == null || item.gridY == null || item.level == null) {
        // 损坏的已放置态：降级回待放，避免体素写崩
        item.placed = false;
        item.gridX = null;
        item.gridY = null;
        item.level = null;
      }
    } else {
      item.gridX = null;
      item.gridY = null;
      item.level = null;
    }

    if (!item.placed && !seen.has(item.id)) {
      seen.add(item.id);
      nextQueue.push(item);
    }
  }

  trayQueue = nextQueue.filter((item) => !item.placed);
}

function pushUndoSnapshot() {
  const itemStates = items.map((item) => getSnapshotItemState(item));
  const logicallyPlacedIds = new Set(
    itemStates.filter((state) => state.placed).map((state) => state.id)
  );

  const trayIds = [];
  const seenTray = new Set();
  for (const item of trayQueue) {
    if (!item || logicallyPlacedIds.has(item.id) || seenTray.has(item.id)) continue;
    seenTray.add(item.id);
    trayIds.push(item.id);
  }
  for (const state of itemStates) {
    if (state.placed || seenTray.has(state.id)) continue;
    seenTray.add(state.id);
    trayIds.push(state.id);
  }

  undoStack.push({
    completionShown,
    trayQueueIds: trayIds,
    items: itemStates
  });
}

/** 撤销/切关前清掉指针与拖拽会话；有完整快照时不必 restore，避免闪回错误位 */
function clearPointerAndDragSession({ restoreActive = false } = {}) {
  releasePointerCaptureSafe(pendingPointerId);
  releasePointerCaptureSafe(activePointerId);
  pendingPointerItem = null;
  pendingPointerId = null;
  pendingPointerStart = null;
  pendingPointerEvent = null;
  activePointerId = null;
  if (activeItem) {
    if (restoreActive) restoreActiveItem();
    setItemOpacity(activeItem, 1);
    activeItem = null;
  }
  candidate = null;
  trayPointerMode = 'idle';
  stopTrayScrollMomentum();
  clearPlacementOccluderFade();
  updateDragSpeedHud(null);
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

  // 整局由快照重铺，无需 restore 当前拖拽中间态
  clearPointerAndDragSession({ restoreActive: false });
  clearHint();
  completionShown = snapshot.completionShown;
  toastEl.classList.remove('show');
  const itemById = new Map(items.map((item) => [item.id, item]));
  trayQueue = snapshot.trayQueueIds.map((id) => itemById.get(id)).filter(Boolean);

  for (const state of snapshot.items) {
    const item = itemById.get(state.id);
    if (!item) continue;
    item.placed = Boolean(state.placed);
    item.rotation = state.rotation;
    item.trayRotation = state.trayRotation ?? (item.placed ? item.trayRotation : state.rotation);
    item.gridX = item.placed ? state.gridX : null;
    item.gridY = item.placed ? state.gridY : null;
    item.level = item.placed ? state.level : null;
    item.lastValid = state.lastValid;
    item.finalIntentPlacement = null;
    item.dragStartRotation = null;
    item.wasPlaced = false;
    item.previousPlacement = null;
    item.targetRotationY = undefined;
    if (!item.placed) clearAssistRotateSession(item);
    else clearAutoRotateIntent(item);
    setItemRotationImmediate(item, item.rotation);
    setItemScale(item, item.placed ? getBoardItemScale() : trayScale);
    setItemShadow(item, true);

    if (item.placed) {
      const shape = rotateShape(item.shape, item.rotation);
      const boardScale = getBoardItemScale();
      item.mesh.visible = true;
      item.mesh.position.copy(gridToWorld(item.gridX, item.gridY, shape));
      item.mesh.position.y = getBoardItemY(item, boardScale, item.level);
      item.trayVisible = false;
      item.targetPosition = null;
    } else {
      item.trayVisible = false;
      item.targetPosition = null;
    }
  }

  reconcilePlacementInvariants();
  layoutTrayQueue({ animate: false });
  hideGridGuide();
  updateGhost(null);
  refreshStatus();
}

function layoutTrayQueue({ animate = true, preserveScroll = true } = {}) {
  if (A2_FULL_TRAY_SCROLL) {
    layoutTrayQueueA2({ animate, preserveScroll });
    return;
  }
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

/**
 * A2 v2 布局：
 * - n=1：居中 0
 * - n=2：对称 ±pitch/2
 * - n≥3：pitch 横排；offset=0 时前三件在 [-pitch,0,+pitch]
 * - 边缘用透明度淡出（无硬切闪现）
 */
function layoutTrayQueueA2({ animate = true, preserveScroll = true } = {}) {
  if (!trayQueue.length) {
    trayBaseCenters = [];
    trayContentMinX = 0;
    trayContentMaxX = 0;
    trayScrollOffsetX = 0;
    return;
  }

  const pitch = TRAY_SLOT_PITCH;
  const n = trayQueue.length;
  let centers;
  if (n === 1) {
    centers = [0];
  } else if (n === 2) {
    centers = [-pitch * 0.5, pitch * 0.5];
  } else {
    // i=0 → -pitch，i=1 → 0，i=2 → +pitch
    centers = trayQueue.map((_, i) => (i - 1) * pitch);
  }
  const widths = trayQueue.map((item) => getTrayItemWidth(item));

  trayBaseCenters = centers;
  trayContentMinX = centers[0] - widths[0] / 2;
  trayContentMaxX = centers[centers.length - 1] + widths[widths.length - 1] / 2;

  if (!preserveScroll) trayScrollOffsetX = 0;
  clampTrayScrollOffset();

  const scrolling = trayPointerMode === 'scroll';
  trayQueue.forEach((item, index) => {
    const centerX = centers[index] + trayScrollOffsetX;
    const target = new THREE.Vector3(centerX, getTableItemY(item, trayScale), trayZ);
    const wasVisible = item.mesh.visible;
    item.homePosition = target.clone();
    item.targetPosition = target.clone();
    if (!item.placed && item !== activeItem && item !== hintMove?.item) {
      setItemScale(item, trayScale);
      if (!animate || scrolling || wasVisible) {
        item.mesh.position.copy(target);
      } else {
        item.mesh.position.set(target.x + trayEntryOffsetX * 0.25, target.y, target.z);
      }
      applyTrayItemEdgeFade(item, centerX);
    }
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

function clampSpeedTuningOrder() {
  // 保证 settled < slowSlideMax < normalMax
  if (speedTuning.slowSlideMax <= speedTuning.settled + 0.05) {
    speedTuning.slowSlideMax = Number((speedTuning.settled + 0.05).toFixed(2));
  }
  if (speedTuning.normalMax <= speedTuning.slowSlideMax + 0.05) {
    speedTuning.normalMax = Number((speedTuning.slowSlideMax + 0.05).toFixed(2));
  }
}

function initSpeedPanel() {
  if (!SHOW_SPEED_PANEL || !speedControlsEl) {
    if (speedPanel) speedPanel.hidden = true;
    return;
  }
  speedPanel.hidden = false;
  const controls = [
    {
      key: 'settled',
      label: '停稳上限（格/秒）',
      min: 0.1,
      max: 1.2,
      step: 0.02,
      tip: '低于此=停稳'
    },
    {
      key: 'slowSlideMax',
      label: '慢滑上限（格/秒）',
      min: 0.2,
      max: 2.0,
      step: 0.02,
      tip: '停稳～此值=慢滑对准'
    },
    {
      key: 'normalMax',
      label: '正常挪上限（格/秒）',
      min: 0.5,
      max: 4.0,
      step: 0.05,
      tip: '慢滑～此值=正常挪；更高=快甩'
    },
    {
      key: 'axisConfidence',
      label: '慢滑主轴置信',
      min: 0.4,
      max: 0.95,
      step: 0.01,
      tip: '左右/上下够稳才算慢滑'
    }
  ];

  speedControlsEl.innerHTML = controls.map((control) => `
    <label class="camera-control">
      <span>${control.label}</span>
      <input
        data-speed-key="${control.key}"
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="${speedTuning[control.key]}"
      />
      <output data-speed-output="${control.key}">${Number(speedTuning[control.key]).toFixed(2)}</output>
    </label>
  `).join('');

  const applyFromInputs = () => {
    for (const input of speedControlsEl.querySelectorAll('[data-speed-key]')) {
      const key = input.dataset.speedKey;
      speedTuning[key] = Number(input.value);
    }
    clampSpeedTuningOrder();
    for (const input of speedControlsEl.querySelectorAll('[data-speed-key]')) {
      const key = input.dataset.speedKey;
      input.value = speedTuning[key];
      syncSpeedPanelValue(key);
    }
    if (activeItem) updateDragSpeedHud(activeItem);
  };

  speedControlsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-speed-key]');
    if (!input) return;
    applyFromInputs();
  });

  speedResetBtn?.addEventListener('click', () => {
    Object.assign(speedTuning, defaultSpeedTuning);
    for (const input of speedControlsEl.querySelectorAll('[data-speed-key]')) {
      const key = input.dataset.speedKey;
      input.value = speedTuning[key];
      syncSpeedPanelValue(key);
    }
    if (activeItem) updateDragSpeedHud(activeItem);
  });
}

function syncSpeedPanelValue(key) {
  if (!speedControlsEl) return;
  const output = speedControlsEl.querySelector(`[data-speed-output="${key}"]`);
  if (output) output.textContent = Number(speedTuning[key]).toFixed(2);
}

function initDragMotionPanel() {
  if (!dragMotionControlsEl || !dragMotionPanel || !dragMotionPanelToggle) return;
  const controls = [
    {
      key: 'moveGainX',
      label: '左右增益 X',
      min: 0.8,
      max: 2.2,
      step: 0.01,
      decimals: 2
    },
    {
      key: 'moveGainZ',
      label: '上下增益 Z',
      min: 0.8,
      max: 2.6,
      step: 0.01,
      decimals: 2
    },
    {
      key: 'visualOffsetY',
      label: '物品上移 px',
      min: 60,
      max: 180,
      step: 1,
      decimals: 0
    },
    {
      key: 'boxClearance',
      label: '箱体避让',
      min: 0,
      max: 0.45,
      step: 0.01,
      decimals: 2
    }
  ];

  dragMotionControlsEl.innerHTML = controls.map((control) => `
    <label class="camera-control drag-motion-control">
      <span>${control.label}</span>
      <input
        data-drag-motion-key="${control.key}"
        data-decimals="${control.decimals}"
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="${dragMotionTuning[control.key]}"
      />
      <output data-drag-motion-output="${control.key}">${formatDragMotionValue(control.key)}</output>
    </label>
  `).join('');

  dragMotionPanelToggle.addEventListener('click', () => {
    const nextHidden = !dragMotionPanel.hidden;
    dragMotionPanel.hidden = nextHidden;
    dragMotionPanelToggle.setAttribute('aria-expanded', String(!nextHidden));
  });

  dragMotionControlsEl.addEventListener('input', (event) => {
    const input = event.target.closest('[data-drag-motion-key]');
    if (!input) return;
    const key = input.dataset.dragMotionKey;
    dragMotionTuning[key] = Number(input.value);
    syncDragMotionPanelValue(key);
  });

  dragMotionResetBtn?.addEventListener('click', () => {
    Object.assign(dragMotionTuning, defaultDragMotionTuning);
    for (const input of dragMotionControlsEl.querySelectorAll('[data-drag-motion-key]')) {
      const key = input.dataset.dragMotionKey;
      input.value = dragMotionTuning[key];
      syncDragMotionPanelValue(key);
    }
  });

  dragMotionPanelToggle.setAttribute('aria-controls', 'dragMotionPanel');
  dragMotionPanelToggle.setAttribute('aria-expanded', 'false');
  dragMotionPanel.id = 'dragMotionPanel';
}

function syncDragMotionPanelValue(key) {
  if (!dragMotionControlsEl) return;
  const output = dragMotionControlsEl.querySelector(`[data-drag-motion-output="${key}"]`);
  if (output) output.textContent = formatDragMotionValue(key);
}

function formatDragMotionValue(key) {
  const decimals = key === 'visualOffsetY' ? 0 : 2;
  return Number(dragMotionTuning[key]).toFixed(decimals);
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
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  updateBoxSequence();
  updateHintMove();
  updateTrayScrollMomentum(dt);
  updateTrayAnimations();
  updateRotationAnimations();
  updateScaleAnimations();
  renderer.render(scene, camera);
}
