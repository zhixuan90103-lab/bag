# Pack 装箱游戏当前实现文档

本文档记录当前 Three.js 版本装箱游戏的真实实现状态。内容以当前代码为准，覆盖工程结构、关卡数据、渲染场景、核心规则、交互流程、提示/撤销、调参面板、移动端适配和后续修改注意事项。

## 1. 项目概况

项目是一个移动端竖屏优先的网页 3D 装箱拼图原型。

技术栈：

- Vite
- Three.js `0.178.0`
- 原生 JavaScript ES Module
- CSS 原生样式

入口文件：

- `index.html`
- `src/main.js`
- `src/styles.css`
- `src/levels.js`

命令：

```bash
npm run dev
npm run build
npm run preview
```

当前 `package.json` 脚本：

```json
{
  "dev": "vite --host 0.0.0.0",
  "build": "vite build",
  "preview": "vite preview --host 0.0.0.0"
}
```

当前构建状态：`npm run build` 通过。

## 2. 代码文件职责

### `src/main.js`

主实现文件，包含：

- DOM UI 创建
- Three.js 场景初始化
- 相机、灯光、桌面调参面板
- 纸箱、棋盘、桌面、物品模型创建
- 拖拽交互
- 放置规则
- 3D 体素占用判断
- 提示自动摆放
- 撤销
- 重置
- 旋转
- 移动端 resize 和渲染循环

### `src/levels.js`

关卡数据文件，当前导出多关卡数组：

```js
export const levels = [...]
```

当前通过 `src/main.js` 内的 `levelIndex` 和 `level = levels[levelIndex]` 选择关卡。  
关卡完成后可通过结算面板进入下一关。

当前共有 3 关：`2x2x1`、`4x4x2`、`6x6x3`。

### `src/styles.css`

负责：

- iPhone 竖屏容器
- 顶部 UI
- 提示/撤销/重置按钮
- 右下旋转按钮
- Toast
- Camera / Light / Table 调参面板
- 横屏提示
- 移动端全屏适配

## 3. 当前关卡数据

当前关卡定义在 `src/levels.js`，共有 3 关：

| 关卡 | id | 名称 | 箱体尺寸 | cellSize | 物品配置 |
|---:|---|---|---|---:|---|
| 1 | `small-first-order` | 小单入门 | `2x2x1` | `1.15` | 2 个 `2x1x1` |
| 2 | `voxel-stack-test` | 体素叠放 | `4x4x2` | `0.78` | 4 个 `2x2x2` |
| 3 | `stack-tower` | 叠高挑战 | `6x6x3` | `0.78` | 9 个 `2x2x3` |

第一关使用更大的 `cellSize`，是为了在不推进摄像机、不改变下方待放区的前提下，让真实 `2x2` 箱子看起来不小。第二、三关使用标准 `0.78` 尺寸。

物品形状通过 `rectShape(cols, rows)` 生成二维矩阵：

```js
function rectShape(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(1));
}
```

当前所有物品仍是矩形形状。尚未加入 L、T、Z 等异形矩阵。

物品高度规则：

```js
function getItemHeight(item) {
  return item.height ?? 1;
}
```

没有显式 `height` 的物品默认高度为 1。当前第二关使用 `height: 2`，第三关使用 `height: 3`，用于验证多层体素摆放。

## 4. 全局尺寸参数

主尺寸参数在 `src/main.js` 顶部：

```js
const TRAY_CELL_SIZE = 0.78;
let itemCellSize = TRAY_CELL_SIZE;
const trayScale = 0.8;
const blockHeight = itemCellSize;
const trayVisibleCount = 3;
const traySlotXs = [-1.55, 0, 1.55];
const trayMinGap = 0.24;
const trayZ = 4.85;
const trayEntryOffsetX = 1.15;
const trayLerpAlpha = 0.18;
const rotationLerpAlpha = 0.12;
```

含义：

- `TRAY_CELL_SIZE`：下方待放区固定预览格尺寸，不随关卡变化。
- `itemCellSize`：物品 mesh 建模基准尺寸，固定等于 `TRAY_CELL_SIZE`。
- `trayScale`：待放区物品缩放，当前为 0.8。
- `blockHeight`：物品 mesh 原始单层高度，等于 `TRAY_CELL_SIZE`。
- `trayVisibleCount`：下方最多显示 3 个待放物品。
- `traySlotXs`：下方 3 个槽位的基础 X 坐标。
- `trayMinGap`：下方物品之间的最小间距。
- `trayZ`：待放区 Z 坐标。
- `trayEntryOffsetX`：新物品滑入时从右侧偏移的距离。
- `trayLerpAlpha`：待放区补位动画插值速度。
- `rotationLerpAlpha`：旋转动画插值速度。

箱内真实格子尺寸来自每关 `box.cellSize`：

```js
grid.cell = level.box.cellSize;
grid.levelHeight = grid.cell;
```

入箱后物品通过 `getBoardItemScale()` 缩放到当前关卡真实尺寸：

```js
function getBoardItemScale() {
  return grid.cell / itemCellSize;
}
```

这个设计保证下方待放区尺寸固定，但箱内视觉和逻辑完全一致。

## 5. DOM UI 结构

`src/main.js` 运行时直接写入 `#app.innerHTML`。

当前 DOM 包含：

- `canvas#game`
- `.topbar`
- `.order-card`
- `#status`
- `.topbar-actions`
- `#hintBtn`
- `#undoBtn`
- `#resetBtn`
- `#toast`
- `#orientationGate`

顶部 UI：

- 左侧订单卡显示“今日订单”和进度。
- 右侧按钮依次为“提示”“撤销”“重置”。

旋转：

- **无**右下角旋转钮；仅物品区短点转（见 §19）。

Toast：

- 用于显示“订单完成”“正在演示摆放”“暂无可放位置”“没有可撤销步骤”等短提示。

横屏提示：

- 横屏且高度小于 520px 时显示 `orientationGate`。

## 6. Three.js 场景结构

### Scene

```js
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6efe4');
```

背景色为浅米色。

### Renderer

```js
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

当前开启：

- 抗锯齿
- 最大像素比 2
- 阴影
- PCFSoftShadowMap

注意：移动端性能后续可能需要评估，圆角几何体和软阴影都有成本。

### 场景 Group

```js
const boardGroup = new THREE.Group();
const trayGroup = new THREE.Group();
const itemGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
const gridGuideGroup = new THREE.Group();
const gridHeightGuideGroup = new THREE.Group();
scene.add(boardGroup, trayGroup, ghostGroup, itemGroup);
```

职责：

- `boardGroup`：纸箱、底板、网格。
- `trayGroup`：历史遗留的托盘组，目前清空，不再实际显示托盘。
- `itemGroup`：所有可拖拽物品。
- `ghostGroup`：红/绿提示平面。
- `gridGuideGroup`：拿起物品时显示的棋盘网格。
- `gridHeightGuideGroup`：层级高度辅助线，目前只有 level > 0 时生成角点竖线。

## 7. 相机实现

当前同时创建透视相机和正交相机：

```js
const perspectiveCamera = new THREE.PerspectiveCamera(36, 390 / 844, 0.1, 100);
const orthographicCamera = new THREE.OrthographicCamera(-2.92, 2.92, 6.1, -6.1, 0.1, 100);
```

默认使用透视相机。

默认相机 rig：

```js
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
```

重要实现细节：

- `x/y/z` 不是最终相机位置，而是“视线方向锚点”。
- `targetX/Y/Z` 是观察目标。
- `distance` 控制远近。
- `screenX/screenY` 通过相机局部 right/up 做屏幕平移。
- `fov` 只影响透视相机。
- `orthoSize` 只影响正交相机。

这样设计的原因：避免直接修改 `pos z` 时视角发生意外变化；拉远/推进应使用 `distance`。

## 8. 灯光实现

当前有两个灯光：

### HemisphereLight

```js
const ambient = new THREE.HemisphereLight('#ffffff', '#c8b7a0', 2.1);
```

用于整体柔和环境光。

### DirectionalLight

```js
const keyLight = new THREE.DirectionalLight('#ffffff', 2.6);
keyLight.position.set(2.5, 8, 4);
keyLight.castShadow = true;
```

默认调参值：

```js
const defaultLightRig = {
  keyX: -1,
  keyY: 8,
  keyZ: -1.2,
  keyIntensity: 1.5,
  ambientIntensity: 2,
  shadowIntensity: 0.3
};
```

阴影相机：

```js
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 24;
```

灯光调参面板支持：

- key x
- key y
- key z
- key power
- ambient
- shadow

## 9. 桌面底板

桌面底板是一个可调参 BoxGeometry：

```js
tableMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: '#eadac7', roughness: 0.9 })
);
```

默认参数：

```js
const defaultTableRig = {
  width: 9.6,
  depth: 18,
  thickness: 0.12,
  x: 0,
  y: -0.22,
  z: -0.65
};
```

应用方式：

```js
tableMesh.scale.set(tableRig.width, tableRig.thickness, tableRig.depth);
tableMesh.position.set(tableRig.x, tableRig.y, tableRig.z);
```

桌面高度影响待放物品的 Y 坐标：

```js
function getTableSurfaceY() {
  return tableRig.y + tableRig.thickness / 2;
}
```

## 10. 纸箱和棋盘

纸箱由 floor、base、三面墙组成。

### Floor

```js
new THREE.BoxGeometry(grid.width + 0.08, 0.18, grid.depth + 0.08)
```

颜色：

```js
#df9341
```

位置：

```js
floor.position.y = -0.11;
```

### Base

```js
new THREE.BoxGeometry(grid.width, 0.08, grid.depth)
```

颜色：

```js
#f1b56d
```

位置：

```js
base.position.y = 0.015;
```

### 墙体

当前只有三面墙：

- 后墙
- 左墙
- 右墙

正对摄像机的一面隐藏，方便观察和拖放。

墙体参数：

```js
const wallThickness = 0.08;
const wallOffset = 0.055;
const wallY = grid.wallHeight / 2;
```

墙体高度：

```js
grid.wallHeight = grid.levels * grid.levelHeight;
```

当前关卡 `levels=3`，所以墙高是 3 层。

### 墙体圆角实现

`addWall()` 不是单个 box，而是：

- 一个中间 core BoxGeometry
- 两端 CylinderGeometry cap

核心逻辑：

```js
const radius = Math.min(w, d) / 2;
const runsAlongX = w >= d;
```

这样让墙体侧面转角更圆滑，但薄面不会过度圆角。

## 11. 棋盘网格提示

网格默认隐藏：

```js
hideGridGuide();
```

拖起物品或提示时显示：

```js
showGridGuide(level);
```

网格由：

- 半透明 plane fill
- 纵横 Line
- 边框 Line
- 高度辅助线

组成。

网格颜色：

- 填充：`#9ca3af`，透明度 `0.16`
- 线：`#6b7280`，透明度 `0.82`
- 边框：`#4b5563`，透明度 `0.94`

层级移动：

```js
gridGuideGroup.position.y = guideLevel * grid.levelHeight;
```

普通放置/支撑不足时，`guideLevel` 对应当前尝试的落脚层。高物品放到底层时仍显示底层网格，不按 `itemHeight` 抬到物品中层或顶层。  
超过箱子高度时，`guideLevel` 允许等于 `grid.levels`，表示箱子高度上限平面，而不是最高可放 base 层 `grid.levels - 1`。例如 `levels = 3` 时，超高提示显示在第三层顶部网格。

高度辅助线：

```js
updateGridHeightGuide(guideLevel);
```

当 `level <= 0` 时不显示高度辅助线。

## 12. 物品模型

每个物品是一个 `THREE.Mesh`，由统一的 polyomino 圆角挤出管线生成。

当前不再区分“矩形用 `RoundedBoxGeometry`、异形用 `ExtrudeGeometry`”两套方案。所有物品，包括方块、长条、L/J/T/U/拐角等异形，都统一走：

```js
createSolidPolyominoGeometry(shape, cellSize, height, inset)
```

这样做的原因：

- 方形和异形的顶面圆角、侧面倒角、法线和高光更一致。
- 避免两套几何体在圆角程度、分段数、材质反射上产生视觉差异。
- 提示 ghost 和真实物品共用同一套脚印几何，边缘一致。

物品尺寸来源：

```js
const shape = item.shape;
const height = getItemVisualHeight(item);
const cellSize = itemCellSize; // 固定 TRAY_CELL_SIZE
const inset = 0.08;
const geometry = createSolidPolyominoGeometry(shape, cellSize, height, inset);
```

高度：

```js
function getItemVisualHeight(item) {
  return blockHeight * getItemHeight(item);
}
```

### 12.1 `createSolidPolyominoGeometry`

`createSolidPolyominoGeometry()` 的流程：

1. 从二维 `shape` 0/1 矩阵提取外轮廓。
2. 将格子角点转换为以物品包围盒中心为原点的 XZ 坐标。
3. 对外轮廓做轻微内缩，保持与格子之间的视觉留缝。
4. 对外凸角做圆角处理，内凹角保持稳定，避免 L/J/T 凹口被错误斜切。
5. 使用 `THREE.ExtrudeGeometry` 挤出高度。
6. 使用较小 bevel 避免凹多边形 bevel 伪影。
7. `rotateX(-Math.PI / 2)` 转为 Y-up。
8. 按 Y 轴居中，使物品底面和高度计算一致。

关键约束：

- 不使用负 `bevelOffset`。Grok 检索和 Three.js issue 显示，凹多边形配合负 `bevelOffset` 容易产生错误面和斜切伪影。
- 不再为矩形单独创建 `RoundedBoxGeometry`，避免和异形件不一致。
- `shape` 的逻辑占格不被几何圆角改变，摆放判断仍然基于二维矩阵。

### 12.2 Ghost 几何

红/绿 ghost 仍是薄平面提示，但几何也统一调用：

```js
createSolidPolyominoGeometry(shape, grid.cell, 0.045, 0.08)
```

因此 ghost 的外轮廓、圆角和真实物品一致，只是高度很薄、材质透明。

材质：

```js
new THREE.MeshStandardMaterial({
  color: item.color,
  roughness: 0.54,
  metalness: 0.015
})
```

每个物品：

- `castShadow = true`
- `receiveShadow = true`
- `mesh.userData.item = item`

物品状态字段：

```js
{
  rotation: 0,
  placed: false,
  gridX: null,
  gridY: null,
  level: null,
  lastValid: null,
  trayVisible: false,
  targetPosition: null,
  targetRotationY: 0,
  mesh
}
```

## 13. 下方 3 槽待放队列

下方不再显示独立托盘模型，物品直接放在桌面底板上。

队列：

```js
let trayQueue = [];
```

初始化：

```js
trayQueue = [...items];
layoutTrayQueue({ animate: false });
```

最多显示：

```js
const trayVisibleCount = 3;
```

槽位：

```js
const traySlotXs = [-1.55, 0, 1.55];
```

### 布局算法

`layoutTrayQueue()`：

1. 取 `trayQueue.slice(0, trayVisibleCount)`。
2. 计算每个可见物品宽度。
3. 用 `getTraySlotXs()` 保证最小间距。
4. 前 3 个显示，其他隐藏。
5. 新进入可见区的物品从右侧 `trayEntryOffsetX` 位置滑入。

宽度计算：

```js
function getTrayItemWidth(item) {
  const shape = rotateShape(item.shape, item.rotation);
  return (shape[0].length * itemCellSize - 0.08) * trayScale;
}
```

补位动画：

```js
item.mesh.position.lerp(item.targetPosition, trayLerpAlpha);
```

演示提示动画期间，队列动画不会移动正在演示的物品：

```js
item === hintMove?.item
```

## 14. 拖拽交互

### Pointer Down

入口：

```js
canvas.addEventListener('pointerdown', onPointerDown);
```

`onPointerDown()` 流程：

1. 如果正在提示自动摆放 `hintMove`，直接 return。
2. 用 raycaster 拾取物品。
3. 清除提示。
4. 设置 `activeItem`。
5. 记录物品是否已放置。
6. 记录拖拽开始旋转。
7. 如果物品已放置，记录 `previousPlacement`。
8. 缓存最后一块 final 加权（`getFinalItemIntentPlacement`）；拖中再跑 `analyzeLastPieceFill`；拿起不转角。
9. 物品放大到拖拽态。
10. Y 坐标设置为 `grid.pickupHeight`。
11. 临时关闭投影。
12. 设置 pointer capture。
13. 设置拖拽平面为拿起高度。
14. 计算 `dragOffset`。
15. 显示第 0 层网格。
16. 清空 ghost。

拿起高度：

```js
grid.pickupHeight = grid.wallHeight + 0.7;
```

当前是 3 层箱子，所以拿起高度高于箱体。

### Pointer Move

`onPointerMove()`：

1. 更新 pointer。
2. 射线和 `dragPlane` 求交。
3. 更新物品 X/Z。
4. 通过 `getIntentCandidate()` 计算候选落点。
5. 根据是否在箱内调整缩放。
6. 根据候选层显示网格。
7. 更新红/绿 ghost。

### Pointer Up

`onPointerUp()`：

1. 如果 `candidate.valid`，调用 `placeItem()`。
2. 否则调用 `restoreActiveItem()`。
3. 恢复阴影。
4. 如果成功放置，恢复棋盘缩放。
5. 清理 active/candidate/finalIntent/dragStartRotation。
6. 隐藏网格。
7. 清空 ghost。
8. 刷新进度。

## 15. 坐标转换

### 世界坐标到格子候选

`getCandidateForRotation()`：

```js
const localX = worldPosition.x - grid.left;
const localZ = worldPosition.z - grid.top;
const gx = Math.round(localX / grid.cell - cols / 2);
const gy = Math.round(localZ / grid.cell - rows / 2);
```

候选判断箱内范围：

```js
worldPosition.x >= grid.left - 0.8 &&
worldPosition.x <= -grid.left + 0.8 &&
worldPosition.z >= grid.top - 0.8 &&
worldPosition.z <= -grid.top + 0.8
```

注意：这里有 `0.8` 容差，用于拖拽接近边缘时仍显示提示。

### 格子到世界坐标

`gridToWorld(gx, gy, shape)`：

```js
return new THREE.Vector3(
  grid.left + (gx + cols / 2) * grid.cell,
  0,
  grid.top + (gy + rows / 2) * grid.cell
);
```

Y 坐标不在这里计算，而是在 `getBoardItemY()` 或 ghost 中单独设置。

## 16. 旋转实现

形状矩阵旋转：

```js
function rotateShape(shape, turns) {
  ...
}
```

每次旋转 90 度。

视觉旋转：

```js
item.targetRotationY = -rotation * Math.PI / 2;
```

动画：

```js
item.mesh.rotation.y += delta * rotationLerpAlpha;
```

手动旋转（2026-07-17）：

- 仅物品区 `trayVisible && !placed` 短点 `rotateItemByTap`。
- 拖中 / 箱内已放置不可转；无旋转钮。
- 托盘声明角见 §19 `intentAnchorRotation`。

## 17. 3D 体素放置规则

当前已经从原来的 2D `heightMap` 改成 3D voxel grid。

核心函数：

- `getPlacement()`
- `buildVoxelGrid()`
- `isVoxelSpaceEmpty()`
- `hasFullSupport()`
- `getColumnStackHeight()`
- `getIntendedBaseLevel()`（非法放置时的展示层，见下）

### 体素网格结构

```js
const voxelGrid = Array.from({ length: grid.levels }, () => (
  Array.from({ length: grid.rows }, () => Array(grid.cols).fill(null))
));
```

索引含义：

```js
voxelGrid[level][row][col]
```

值：

- `null` 表示空。
- `item.id` 表示被对应物品占用。

### 构建占用

`buildVoxelGrid(exceptItem)` 会遍历所有已放置物品，排除当前正在判断的物品：

```js
if (item === exceptItem || !item.placed) continue;
```

对每个物品：

1. 根据当前旋转得到 shape。
2. 得到 `baseLevel`。
3. 得到 `itemHeight`。
4. 对 shape 覆盖格子的每个 level 填入 `item.id`。

### 放置判断

`getPlacement(item, gx, gy, shape)`：

1. 先检查 X/Y 是否越界。
2. 从 `baseLevel = 0` 到 `grid.levels - itemHeight` 逐层尝试。
3. 调用 `isVoxelSpaceEmpty()` 检查目标空间是否为空。
4. 调用 `hasFullSupport()` 检查完整支撑。
5. 第一个合法层级返回 `{ valid: true, baseLevel }`。
6. 全部失败返回 `{ valid: false, baseLevel: getIntendedBaseLevel(...) }`。

`getCandidateForRotation()` 会在此基础上额外计算 `displayBaseLevel`：

- `baseLevel`：规则判定层，决定能不能放、最终落在哪一层。
- `displayBaseLevel`：UI 展示层，决定红/绿 ghost 和网格显示在哪一层。
- `guideLevel`：网格辅助层，通常与 `displayBaseLevel` 一致；超高时可显示到 `grid.levels`。
- 合法时两者相同。
- 非法时允许不同，避免错误提示被下层模型遮住。

### 非法放置的展示层（方案 A · 意图落脚层）

合法时的 `baseLevel` 是真正可落的层级。  
非法时不再只依赖 `baseLevel` 直接画 UI，而是使用 `displayBaseLevel` 控制红 ghost 和网格引导高度。

旧实现使用 `getLowestBlockedLevel()`：找 footprint 内**最先碰到已有体素的层**。在「想叠到上层、但下方有缺口」时，往往返回 `0`，红框画在箱底，被已放物品遮住，玩家误以为是碰撞而非悬空。

当前分两步：

1. `getPlacement()` 用 `getIntendedBaseLevel()` 计算非法候选层。
2. `getGhostDisplayBaseLevel()` 为 UI 单独计算可见展示层。

`getIntendedBaseLevel()`：

1. 对 footprint 每一格用 `getColumnStackHeight()` 计算从底板往上**连续占满的堆高**。
2. 取各格堆高的 **`max`**，作为玩家意图对准的支撑面。
3. 再夹紧到 `min(maxStack, grid.levels - itemHeight)`，避免越顶。

`getGhostDisplayBaseLevel()`：

1. 合法放置直接返回 `placement.baseLevel`。
2. 非法放置重新构建排除当前拖拽物的体素网格。
3. 遍历 shape footprint 中仍在箱内的格子。
4. 对这些可见格取 `getColumnStackHeight()` 的最大值。
5. 夹紧到 `0..grid.levels - itemHeight` 后作为 `displayBaseLevel`。
6. 如果 footprint 完全不在箱内，则退回 `placement.baseLevel ?? 0`。

`height-exceeded` 超高规则：

1. `getPlacement()` 通过 footprint 下方最大连续堆高 `maxStack` 判断：如果 `maxStack + itemHeight > grid.levels`，返回 `reason: 'height-exceeded'`。
2. `displayBaseLevel` 显示在箱子高度上限平面 `grid.levels`，而不是底层或最高可放 base 层。
3. `guideLevel` 同样设置为 `grid.levels`，使网格显示为最高高度边界。三层箱子就是第三层顶部网格。
4. 该提示表达“超过箱子高度”，不表达“底层碰撞”。

典型场景：

- 部分格堆高 `1`、缺口格堆高 `0`（完整支撑失败）→ `displayBaseLevel = 1`，红框画在第 1 层表面。
- 底层已被物品遮挡、玩家实际在上层尝试摆放 → 红框与网格显示在可见上层，不沉到箱底。
- footprint 部分出界 → 只统计箱内可见格，尽量保持红框可见。
- 三层箱中物品再叠会超过高度 → 红框和网格显示在第三层顶部高度边界，帮助玩家理解超高。
- 全空非法（极少见）→ `baseLevel = 0`。
- 堆已顶到箱顶附近 → 夹紧后不超过可放上限。

相关代码：

```js
function getColumnStackHeight(voxelGrid, cx, cy) { /* 连续 stack 高度 */ }

function getIntendedBaseLevel(voxelGrid, gx, gy, shape, itemHeight) {
  // max(stack) under footprint, clamped to levels - itemHeight
}

function getGhostDisplayBaseLevel(item, gx, gy, shape, placement) {
  // valid: placement.baseLevel
  // invalid: max visible stack height under footprint, clamped
}
```

**未做**（曾尝试后回滚）：多层动态投射平面（拖拽射线平面随层变化）。当前拖拽仍固定 `pickupHeight`；仅非法 ghost/网格用意图层高度。

### 完整支撑规则

```js
function hasFullSupport(voxelGrid, gx, gy, baseLevel, shape) {
  if (baseLevel === 0) return true;
  const supportLevel = baseLevel - 1;
  ...
}
```

规则：

- 第 0 层永远有地面支撑。
- 放在第 1 层或更高时，物品 footprint 的每个占用格子正下方都必须被占用。
- 只要任意一格下方为空，就不可放。

这就是当前 `FULL_SUPPORT` 的实现。

## 18. 红/绿提示 Ghost

当前 ghost 是薄平面，不是 3D 体块。

厚度固定：

```js
const height = 0.045;
```

尺寸：

```js
new THREE.BoxGeometry(cols * grid.cell - 0.08, height, rows * grid.cell - 0.08)
```

颜色：

- 合法：`#22c55e`
- 非法：`#ef4444`

透明度：

```js
opacity: next.hint ? 0.36 : 0.58
```

提示自动摆放的 ghost 更淡，普通拖拽 ghost 更明显。

Y 坐标：

```js
const displayBaseLevel = next.displayBaseLevel ?? next.baseLevel ?? 0;
ghost.position.y = getBoardSurfaceY() + displayBaseLevel * grid.levelHeight + 0.035;
```

也就是说 ghost 是平面，但会出现在对应层级。

- **合法**：`baseLevel` 为真实可放层。
- **非法**：`displayBaseLevel` 为 UI 可见展示层，避免红框沉在第 0 层被遮挡。
- **超高非法**：`reason === 'height-exceeded'` 时，`displayBaseLevel` 和 `guideLevel` 指向 `grid.levels`，即箱子高度上限平面。

网格引导与 ghost 共用同一展示层：

```js
showGridGuide(candidate?.guideLevel ?? candidate?.displayBaseLevel ?? candidate?.baseLevel ?? 0);
```

因此拖拽非法时，红框和网格会一起抬到玩家当前尝试放置的可见层。
超高非法时，网格会抬到箱体顶层边界，用最高层网格解释“高度超出”。

边框：

```js
new THREE.EdgesGeometry(ghost.geometry)
```

边框透明度 `0.95`。

## 19. 意图自动转角（v3 · 场景表）

权威同步：`docs/research/INTENT-SCENARIO-SYNC-2026-07-17.md`。  
调参纪律：`docs/research/INTENT-PARAM-PRIORITY.md`。  
实现：`src/main.js`（`INTENT_SCENARIOS` / `INTENT_ANTI_REVERSE` / `resolveIntentScenario`）。

### 模型

**棋盘占位 × 手中脚印 × 手势 → 场景档 → 帮转。**  
P0 硬门 → P1 格子 → P2 场景 → P3 手势 → P4 时延 → P5 防反拧。

### 主路径

```text
L0 sampleIntentContext
P0 passIntentHardGates
P1 analyzeRegionPlaceableOrients + classifyIntentChannel
P2 resolveIntentScenario → lastMust | uniqueBoard | uniqueRegionHard | hotSoft | warm | cold
P3 passIntentGestureGates(scenario)
P4 passIntentTimingGates(scenario)
L3 decideIntentRotation (+ 防反拧)
L4 confirmAndApplyIntentRotation (场景 dwell)
```

| 场景 | 条件 | 手势 | 时延 |
|------|------|------|------|
| lastMust | 最后一块必须转 | notFast | 尽早；可越过提交锁 |
| uniqueBoard | 全盘唯一其它脚印 | notFast | 尽早 |
| uniqueRegionHard | 邻域唯一且 snap0 红 | notFast | 尽早 |
| hotSoft | 其它 Hot | aiming | 默认，不硬顶极短 |
| warm / cold | 多解 | 更严 | 冷静/钝化 |

### 手动旋转与最后一块

- **手动旋转**：仅物品区（`trayVisible && !placed`）短点 `rotateItemByTap`；**无旋转钮**；箱内/拖中不可转。  
- 托盘点转写入 `intentAnchorRotation` + `manualLock`；意图改走该角仅 `lastMust` / `uniqueBoard` / `uniqueRegionHard` 且停稳/刷边。  
- **最后一块**：禁止拿起强转；入箱后 `lastMust` 加码。

### 速度

| 档 | 默认（格/秒） |
|----|----------------|
| settled | &lt; 0.38 |
| slowSlide | ～ 0.82 |
| normal | ～ 1.6 |
| fast | ≥ 1.6 |

HUD / Speed 面板暂隐；`?intentDebug=1` 显示场景 id。

### 相关符号

- `INTENT_SCENARIOS` · `INTENT_ANTI_REVERSE` · `resolveIntentScenario`  
- `analyzeRegionPlaceableOrients` · `analyzeBoardOrientFill` · `analyzeLastPieceFill`

## 20. 提示自动摆放

按钮：

```js
hintBtn.addEventListener('click', showHint);
```

### 查找提示

`findHintPlacement()`：

- 只扫描当前可见的 3 个待放物品。
- 不会从隐藏队列中突然拿物品。
- 对每个物品尝试 4 个旋转。
- 对每个旋转尝试所有格子。
- 找到第一个合法位置就返回。

返回对象包含：

```js
{
  gx,
  gy,
  shape,
  rotation,
  item,
  hint: true,
  inside: true,
  valid,
  baseLevel
}
```

### 自动摆放流程

`startHintAutoPlace(hint)`：

1. `pushUndoSnapshot()` 保存提示前状态。
2. 记录 `hintPlacement`。
3. 设置物品旋转为推荐角度。
4. 设置旋转动画目标。
5. 关闭物品投影。
6. 显示对应层级网格。
7. 显示平面 ghost。
8. 设置 `hintMove` 动画状态。
9. Toast 显示“正在演示摆放”。

### 动画状态

```js
hintMove = {
  item,
  placement,
  startTime,
  duration: 650,
  startPosition,
  endPosition,
  startScale,
  endScale
};
```

时长：

```js
650ms
```

### 动画曲线

`updateHintMove()` 每帧执行。

使用 smoother step：

```js
function smootherStep(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}
```

位置：

```js
item.mesh.position.lerpVectors(startPosition, endPosition, phase);
```

高度：

```js
const liftHeight = Math.max(0.45, grid.pickupHeight - Math.max(startPosition.y, endPosition.y));
item.mesh.position.y = baseY + Math.sin(Math.PI * phase) * liftHeight;
```

这是一条连续弧线：

- 从待放区开始
- 抬起到接近手动拖拽高度
- 平滑移动到目标位置
- 落下

缩放：

```js
const liftScale = Math.sin(Math.PI * phase);
const xzScale = THREE.MathUtils.lerp(startScale, endScale, phase) + liftScale * 0.06;
const yScale = THREE.MathUtils.lerp(startScale, 1, phase) + liftScale * 0.06;
```

动画结束后：

```js
placeItem(item, placement, { recordUndo: false });
```

因为开始提示时已经保存了 undo 快照，所以实际落下时不重复保存。

## 21. 撤销功能

按钮：

```js
undoBtn.addEventListener('click', undoLastMove);
```

撤销栈：

```js
let undoStack = [];
```

每次成功放置前保存快照：

```js
if (recordUndo) pushUndoSnapshot();
```

提示自动摆放也会保存快照。

快照内容：

```js
{
  completionShown,
  trayQueueIds,
  items: [
    {
      id,
      rotation,
      placed,
      gridX,
      gridY,
      level,
      lastValid
    }
  ]
}
```

撤销行为：

1. 如果正在提示演示，显示“演示中不能撤销”。
2. 如果没有快照，显示“没有可撤销步骤”。
3. 如果正在拖拽，先恢复当前物品。
4. 恢复 `completionShown`。
5. 恢复 `trayQueue` 顺序。
6. 遍历物品恢复：
   - rotation
   - placed
   - gridX
   - gridY
   - level
   - lastValid
7. 已放置物品恢复棋盘位置。
8. 未放置物品交给 `layoutTrayQueue({ animate: false })` 重新排布。
9. 隐藏网格和 ghost。
10. 刷新状态。

当前撤销粒度：

- 一次成功手动放置 = 一步。
- 一次提示自动摆放 = 一步。
- 旋转已放置物品目前不单独进入撤销栈。

## 22. 重置功能

按钮：

```js
resetBtn.addEventListener('click', resetLevel);
```

重置会：

- 清除完成状态
- 清空撤销栈
- 停止提示动画
- 清除提示
- 恢复全部物品未放置
- 清空 grid 坐标和 level
- 清空 lastValid
- 清空 finalIntentPlacement
- 旋转归 0
- 显示所有物品并重新排下方队列
- 隐藏网格
- 刷新状态

## 23. 状态显示和完成条件

状态文本：

```js
const placed = items.filter((item) => item.placed).length;
statusEl.textContent = `${placed}/${items.length} 件已入箱`;
```

完成条件：

```js
placed === items.length && !completionShown
```

完成后：

```js
showToast('订单完成', 1800);
```

## 24. Toast 系统

统一函数：

```js
function showToast(message, duration = 1100)
```

行为：

- 设置 `toastEl.textContent`
- 添加 `.show`
- 清除旧 timer
- 定时移除 `.show`

当前使用场景：

- 订单完成
- 暂无可放位置
- 正在演示摆放
- 没有可撤销步骤
- 演示中不能撤销

## 25. 调参面板

PC 端显示三个面板：

- Camera
- Light
- Table

移动端隐藏：

```css
@media (max-width: 699px), (pointer: coarse) {
  .camera-panel {
    display: none;
  }
}
```

### Camera 面板

字段：

- mode
- pos x
- pos y
- pos z
- look x
- look y
- look z
- distance
- screen x
- screen y
- fov
- ortho size

注意：

- `distance` 控制推进/拉远。
- `screen x/y` 控制整体画面平移。
- `pos x/y/z` 主要控制视线方向。

### Light 面板

字段：

- key x
- key y
- key z
- key power
- ambient
- shadow

### Table 面板

字段：

- width
- depth
- thick
- pos x
- pos y
- pos z

修改桌面参数会触发：

```js
if (items.length) layoutTrayQueue({ animate: false });
```

目的是让下方物品贴合新的桌面高度。

## 26. 移动端适配

容器默认尺寸：

```css
#app {
  width: min(100%, 390px);
  height: min(100%, 844px);
  border-radius: 34px;
}
```

移动端：

```css
#app {
  width: 100%;
  height: var(--viewport-height, 100dvh);
  border-radius: 0;
  box-shadow: none;
}
```

动态视口高度：

```js
const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
```

禁用默认触控行为：

```css
touch-action: none;
overscroll-behavior: none;
user-select: none;
```

横屏提示：

```css
@media (orientation: landscape) and (max-height: 520px) {
  .orientation-gate {
    display: flex;
  }
}
```

## 27. 渲染循环

主循环：

```js
function animate() {
  requestAnimationFrame(animate);
  updateBoxSequence();
  updateHintMove();
  updateTrayAnimations();
  updateRotationAnimations();
  renderer.render(scene, camera);
}
```

顺序含义：

1. 先更新开箱 / 合箱动画。
2. 再更新提示自动摆放动画。
3. 再更新下方队列补位动画。
4. 再更新旋转动画。
5. 最后渲染。

正在提示演示的物品会被 `updateTrayAnimations()` 跳过，避免两个动画系统抢同一个物品。

## 28. 当前实现的约束和注意事项

### 1. 关卡系统已支持三关和下一关

当前已经有：

- `levels` 多关卡数组。
- `levelIndex` 当前关卡索引。
- `loadLevel(index)` 切关。
- 结算面板 `nextLevelBtn`。
- 切关时重建纸箱、物品、状态、相机约束和开箱动画。

仍未做的是：

- 关卡选择菜单。
- 关卡解锁/进度保存。
- 关卡合法性自动校验。

### 2. 异形物品数据结构已经使用

`shape` 本质是二维 0/1 矩阵，所以可以支持：

```js
[
  [1, 0],
  [1, 1]
]
```

当前关卡已经使用拐角、L/J、T、U 等异形脚印。矩形与异形都使用同一套 `createSolidPolyominoGeometry()` 生成，不再分别走两套几何体。

### 3. 当前体素物品只支持垂直柱状高度

当前 `height` 表示整块 footprint 每一格都同样高。暂不支持一个物品内部不同格子不同高度，也不支持桥形/空洞形 3D 体素物品。

如果要支持真正复杂 3D 形状，需要把物品从 `shape + height` 改成 3D voxel shape。

### 4. 多层拖拽投射仍是固定拿起平面

拖拽使用：

```js
dragPlane.constant = -grid.pickupHeight;
```

所以当前手动拖拽是在拿起高度投射，再通过 X/Z 找棋盘候选。它能工作，但不是根据目标层动态切换投射平面。

### 5. Ghost 是平面提示

当前用户偏好平面红/绿提示，所以 ghost 不显示实际物品高度。2x2x2 的物品本体是 2 高，但提示仍是薄平面。

### 6. 撤销不记录“旋转已放置物品”

当前撤销记录成功放置和提示自动摆放，不记录已放置物品的单独旋转操作。

### 7. 提示会自动摆放

提示按钮不是只提示，而是会从当前可见 3 个物品中选择一个可放位置，并自动演示摆放后真正放下。

### 8. 意图自动转角（已迭代）

拿起不转；箱内非法 + 瞄准态 + 转后合法 + dwell/margin 才转。含分档、大件钝化、拧边、方向消歧、最后一块填空分析。与提示代放分责。详见 §19 与 `INTENT-IMPLEMENTATION-CHANGELOG.md`。

### 9. 性能注意

当前使用：

- 统一 polyomino `ExtrudeGeometry` 圆角挤出管线
- PCFSoftShadowMap
- 2048 阴影图

移动端如果物品更多，可能需要优化：

- 降低 polyomino 圆角 / bevel 细分
- 降低阴影质量
- 使用假阴影
- 合并静态几何
- 减少透明物体

### 10. `trayGroup` 目前是历史遗留结构

代码里仍然存在：

```js
const trayGroup = new THREE.Group();
function initTray() {
  trayGroup.clear();
}
function addTrayWall(...)
function addTrayLine(...)
```

但当前版本已经隐藏了实体托盘，物品直接放在大桌面底板上。因此：

- `trayGroup` 被加入场景，但没有实际模型。
- `initTray()` 只执行 `clear()`。
- `addTrayWall()` 和 `addTrayLine()` 当前没有调用点。
- 它们是之前托盘方案的遗留工具函数，后续如果确认不再恢复实体托盘，可以删除。

### 11. `getShapeCells()` 目前没有调用

代码里还有：

```js
function getShapeCells(shape)
```

当前没有调用点。它原本适合用来把二维 shape 展开成格子列表，但当前实现直接在各个规则函数里双重循环 shape。

后续有两个选择：

- 保留，等异形物品、失败原因提示、调试可视化时复用。
- 删除，减少未使用函数。

### 12. 当前提示按钮不是“只提示”

当前 `提示` 按钮的真实行为是：

1. 查找当前可见 3 个待放物品中的第一个可放方案。
2. 显示平面 ghost。
3. 自动播放一段连续拿起/移动/落下动画。
4. 动画结束后真正调用 `placeItem()` 放置该物品。
5. 该动作进入撤销栈。

所以从玩家体验上看，提示按钮更接近“帮我放一个”，不是只给建议。

如果后续需要传统提示功能，需要新增模式，例如：

- `showHintOnly()`：只显示 ghost，不移动物品。
- `autoPlaceHint()`：当前行为，自动演示并放置。

### 13. 提示自动摆放和撤销的互斥规则

当前互斥规则：

- `hintMove` 存在时，`onPointerDown()` 直接 return，不能手动拖拽。
- `hintMove` 存在时，`undoLastMove()` 显示“演示中不能撤销”。
- `updateTrayAnimations()` 会跳过 `hintMove.item`，避免队列补位动画和提示动画同时控制同一个 mesh。

这保证提示动画不会被手动操作或队列动画打断。

### 14. 拖拽失败恢复和撤销不是同一套机制

拖拽失败：

- 发生在 `onPointerUp()`。
- 如果 candidate 不合法，调用 `restoreActiveItem()`。
- 不写入撤销栈。

撤销：

- 只回退成功放置前的快照。
- 手动成功放置和提示自动摆放都会写入快照。

因此，拖错又松手回位，不算一步撤销。

### 15. `placeItem()` 的 `recordUndo` 参数

当前 `placeItem()` 签名：

```js
function placeItem(item, next, { recordUndo = true } = {})
```

手动放置时使用默认值，会调用 `pushUndoSnapshot()`。

提示自动摆放时：

```js
pushUndoSnapshot();
...
placeItem(item, placement, { recordUndo: false });
```

原因是提示动画一开始就保存了快照，动画结束落下时不能再重复保存，否则撤销需要点两次。

### 16. `hintPlacement` 当前只用于记录提示状态

当前有：

```js
let hintPlacement = null;
```

它在 `startHintAutoPlace()` 中被赋值，在 `clearHint()` 中清空。当前主要用于表达“有提示状态”，但并没有被其他逻辑读取。

后续如果要做“再次点击提示取消”“高亮当前提示物品”“提示路径显示”，可以复用它。若保持当前功能，它也可以被简化掉。

### 17. `tableMesh.renderOrder = -1`

桌面底板设置了：

```js
tableMesh.renderOrder = -1;
```

目的是让桌面更稳定地处在场景底层渲染顺序中。因为桌面是大底板，且接收阴影，后续如果增加更多透明面片或背景模型，需要注意 renderOrder 是否产生意外遮挡。

### 18. 透明提示面片的深度策略

红/绿 ghost 材质：

```js
new THREE.MeshBasicMaterial({
  transparent: true,
  depthWrite: false
})
```

含义：

- `transparent: true` 让颜色半透明。
- `depthWrite: false` 避免透明提示面片写入深度缓冲，减少它挡住后续透明对象的问题。

但它仍然参与深度测试。当前优先通过 `displayBaseLevel` 把提示放到可见层来解决遮挡；后续如果仍出现提示面片被模型遮住，可以再考虑显式设置 `depthTest` 或 `renderOrder`。

### 19. HTML 前置条件

`main.js` 假设页面里已经存在：

```html
<div id="app"></div>
```

然后通过：

```js
const app = document.querySelector('#app');
app.innerHTML = ...
```

如果以后迁移到框架或多页面结构，必须保留 `#app` 或改入口挂载逻辑。

### 20. CSS 安全区和移动端约束

顶部和右下按钮使用了 iOS 安全区变量：

```css
env(safe-area-inset-top)
env(safe-area-inset-left)
env(safe-area-inset-right)
env(safe-area-inset-bottom)
```

这对 iPhone 刘海屏、底部 home indicator 有意义。移动端测试时，需要确认：

- 顶部订单卡没有贴住系统状态栏。
- 右下旋转按钮没有贴住 home indicator。
- 横屏时 `orientationGate` 能挡住游戏画面。

### 21. 当前构建有 chunk size 警告

`npm run build` 能通过，但 Vite 会提示：

```text
Some chunks are larger than 500 kB after minification.
```

当前主要原因是 Three.js 打包体积较大。现阶段不影响运行。后续如果要上线或追求首屏加载，应考虑：

- 动态 import
- manualChunks
- 降低依赖体积
- 资源懒加载

### 22. 代码仍是单文件主逻辑

虽然关卡数据已抽到 `src/levels.js`，但主逻辑仍集中在 `src/main.js`。当前可维护，但继续增加关卡、提示类型、失败原因、动画和模型资产后，建议拆分：

- `scene.js`
- `board.js`
- `items.js`
- `placement.js`
- `input.js`
- `ui.js`
- `cameraRig.js`
- `levels.js`

拆分前不要大改行为，先给关键规则函数补测试或手动验证清单。

### 23. 当前没有自动化测试

当前验证依赖：

- `npm run build`
- 手动浏览器测试

没有单元测试覆盖：

- `rotateShape()`
- `getPlacement()`
- `buildVoxelGrid()`
- `hasFullSupport()`
- `findHintPlacement()`
- `undoLastMove()`

如果后续规则复杂化，最值得先补的是纯逻辑测试，尤其是体素放置和完整支撑。

### 24. 文档和代码同步责任

本文档描述的是当前实现，不是设计目标。后续如果修改以下内容，需要同步更新文档：

- 关卡数据格式
- `grid.levels`
- 物品高度规则
- ghost 显示方式
- 提示按钮行为
- 撤销记录粒度
- 相机默认参数
- 灯光默认参数
- 意图自动转角阈值 / 分档 / 拧边与方向消歧（同步 §19 与 `INTENT-IMPLEMENTATION-CHANGELOG.md`）
- CSS 移动端布局

## 29. 当前 Git 状态说明

最近已推送提交：

```text
160ae63 Add hint auto-place and undo
6439b5f Add voxel placement support
54c5e14 Add intent rotation assist
bf62d6a Expand shadow camera bounds
8ddc07c Improve tray queue animation and scaling
```

当前工作区在撰写本文档前只有未跟踪的 `mockups/` 目录。本文档新增后，`docs/IMPLEMENTATION.md` 也会成为未提交文件。

`mockups/` 目录未纳入当前代码提交流程，除非明确要求，不应提交。

## 30. 建议的后续开发顺序

建议优先级：

1. 设计 2-3 个真正体现多层支撑的测试关卡。
2. 给 `levels.js` 增加多关卡数据，而不是继续只改当前关。
3. 增加关卡切换和当前关卡索引。
4. 最后一块：已用 `analyzeLastPieceFill`（拖中帮转、拿起不转）；可继续按手感调参，无需再「决定是否保留拿起强转」。
5. 给失败原因增加更明确反馈，例如“悬空”“碰撞”“越界”（文案 / Toast）；可选方案 B 按格标缺口。
6. 多层动态投射平面：已试做后回滚，维持固定 `pickupHeight`；若以后再做，勿改拖拽物高度、只改瞄准平面或网格。
7. 非法 ghost 遮挡：若意图层仍被侧面挡住，可考虑 `depthTest: false`（方案 C）。
8. 性能压测移动端，必要时优化圆角和阴影。
9. 将抽象彩色积木逐步替换为低 poly 生活物品。

## 31. 快速验证清单

每次修改后建议验证：

- `npm run build` 通过。
- 页面能正常打开。
- 顶部显示当前订单，例如 `订单 1/3 · 小单入门`。
- 下方只显示 3 个物品。
- 第一关 `2x2x1` 箱子不显得过小，待放物品完整显示。
- 第二关 `4x4x2` 能正常开箱、摆放、合箱。
- 第三关 `6x6x3` 箱体和下方 3 个待放物品都完整可见。
- 手动拖动物品能拿起、移动、放下。
- 合法位置显示绿色平面。
- 非法位置显示红色平面。
- **上层悬空非法时，红框与网格使用 `displayBaseLevel` 显示在可见尝试层（非箱底被挡死）。**
- **底层已有物品遮挡时，非法红框不能沉到下层导致玩家看不到。**
- **footprint 部分出界时，红框仍应尽量依据箱内可见格显示。**
- 2x2x2 / 2x2x3 物品视觉高度正确。
- 多高度物品占用对应层数。
- 上层放置必须完整支撑。
- 提示按钮会自动演示摆放。
- 提示动画连续、速度合适。
- 撤销能回到提示或手动放置前。
- 重置能恢复初始状态。
- 下一关按钮能切到后续关卡。
- 开箱 / 合箱期间点击可跳过。
- 旋转按钮仍能旋转物品。
- 移动端横屏会出现竖屏提示。
- PC 调参面板仍可用。

## 32. 变更记录（相对文档初版）

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-07-16 | 拆分 ghost 判定层和显示层 | 新增 `displayBaseLevel`；`baseLevel` 继续负责放置规则，红/绿 ghost 与网格使用展示层，解决多层遮挡下红色提示沉到底层的问题。 |
| 2026-07-16 | 非法 ghost 意图落脚层（方案 A） | 用 `getIntendedBaseLevel` / `getColumnStackHeight` 替代 `getLowestBlockedLevel` 作为非法 `baseLevel`；合法规则不变。 |
| 2026-07-16 | 动态投射平面回滚 | 曾试多层动态平面 + 拖拽物随层升降；手感不佳后完整回滚，拖拽仍固定 `pickupHeight`。 |
| 2026-07-16 | 开箱 / 合箱第 1 刀 | 前墙 Alpha + 后铰链盖；`gamePhase`: opening→play→closing→settle；开箱先盖后墙、合箱先墙后盖；仪式可点跳过；结算「再来一次」重播开箱。 |
| 2026-07-16 | RSC 四襟片顶盖 | 整盖改为前/后 major + 左/右 minor 四片；开箱 major→minor 外翻；合箱 minor→major 向中合拢。 |
| 2026-07-16 | 开箱动画定稿 | 入场落下+顺时针 45° 归正 → major→minor → 前墙+前襟片淡至 0.1；实现笔记 `docs/research/OPEN-BOX-ANIM-IMPL.md`（已入 NotebookLM）。 |
| 2026-07-16 | 纸箱视觉高度 | `wallHeight = surface + levels*cell + 0.01 + BOX_LID_CLEARANCE(0.14)`，合盖不与顶层摆放物穿插。 |
| 2026-07-16 | 多关卡相机 fit 修正 | `fitCameraToBox()` 只允许大关卡拉远，不允许小关卡推进；`target/screen` 保持默认，避免下方待放物品被裁切、箱子位置随关卡漂移。 |
| 2026-07-16 | 小关卡尺寸适配 | 箱内真实 `box.cellSize` 可随关卡变化；下方待放区固定 `TRAY_CELL_SIZE=0.78` 作为预览尺寸。物品入箱时按 `grid.cell / TRAY_CELL_SIZE` 整体缩放，保证逻辑/视觉一致且待放区不变。 |
