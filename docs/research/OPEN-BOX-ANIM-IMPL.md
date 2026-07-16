# 开箱动画实现笔记（As-Implemented）

**日期：** 2026-07-16（修订）  
**笔记本：** Pack 装箱游戏 · 设计检索库  
**代码：** `src/main.js`（`BOX_ANIM`、`createRscFlaps`、`updateBoxSequence`、墙高公式等）  
**关联检索：** `SYNTHESIS-open-close-multi-size.md`、`A1-hinged-lid.md`、`A2-transparent-fade.md`、`A5-skippable-lock-input.md`

---

## 1. 设计目标

| 目标 | 实现 |
|------|------|
| 仪式感入场 | 整箱从上方落下 + Y 轴顺时针旋转归正，再开盖 |
| 真箱叙事 | RSC 四襟片：major（前/后）→ minor（左/右）外翻 |
| 俯视可操作 | 前墙 + 前襟片同步淡到「幽灵」半透明，不完全消失 |
| 合盖不穿模 | 墙顶高于「叠满 levels 后的物品顶」+ 盖下净空 |
| 可跳过 | opening / closing 期间点屏 → 终态 + 解锁输入 |
| 合箱对称 | 前墙回实 → minor 合 → major 合 → settle UI |

---

## 2. 阶段机（gamePhase）

```
boot → opening → play → closing → settle
              ↑                      │
              └──── 再来一次 / reset ─┘
```

| phase | 输入 | 状态栏 | 动画 |
|-------|------|--------|------|
| `opening` | 仅 skip | 开箱中… | intro + 开盖 |
| `play` | 拖放 / 提示 / 撤销 | n/m 件已入箱 | 无 boxAnim |
| `closing` | 仅 skip | m/m 件已入箱 | 合盖 |
| `settle` | 结算面板「再来一次」 | 订单完成 | 无 |

- `isGameplayLocked()`：`gamePhase !== 'play'` 或 hint 移动中。
- `onPointerDown`：若 `boxAnim && (opening|closing)` → `skipBoxSequence()`。
- 全部放完 → `startClosingSequence()`；replay/reset → `startOpeningSequence()`。

---

## 3. 开箱时间轴（opening）

总时长 ≈ `introDropMs` + max(major, minor, front) ≈ **720 + 1140 ≈ 1860ms**（以当前常量为准）。

### 3.1 入场 Intro（0 → introDropMs）

| 参数 | 当前值 | 含义 |
|------|--------|------|
| `introDropMs` | 720 | 落下+旋转时长 |
| `introStartY` | 4.6 | 起始高度 |
| `introStartRotY` | π/4 (**45°**) | 起始 Y 旋转；插值到 0 = 俯视**顺时针 45°** |
| `introStartTiltX` | 0.28 | 落下侧倾，落地归零 |
| `introStartTiltZ` | -0.18 | 同上 |

**姿态函数 `setBoxIntroPose(t)`（t∈[0,1]）：**

- **下落：** ease-out cubic `1-(1-t)³`，`y: introStartY → 0`
- **落地轻弹：** `t ≥ 0.82` 时正弦弹跳（幅度随 t 衰减）
- **旋转：** `smootherStep(t)`，`rotation.y/x/z` 从 intro 起始值 → 0
- **变换对象：** `boardGroup`（箱体 / 墙 / 襟片 / 网格引导均在其下）

Intro 期间：襟片合拢、前墙全实。

### 3.2 开盖 Open（相对 intro 结束后的 openElapsed）

| 参数 | 当前值 | 含义 |
|------|--------|------|
| `openMajorMs` | **560** | 前/后 major 外翻时长（已放慢） |
| `openMinorDelayMs` | **200** | minor 相对 open 起点延迟 |
| `openMinorMs` | **520** | 左/右 minor 外翻时长 |
| `openFrontDelayMs` | **720** | 前墙淡出延迟（≈ minor 结束，**无额外停顿**） |
| `openFrontMs` | **420** | 前墙+前襟片淡出时长 |
| `flapOpenAngle` | 220° | 外翻角（过水平再贴箱外侧） |
| `frontFadeMinAlpha` | **0.1** | 开箱后前侧最低不透明度 |

顺序：

1. **Major** 外翻：`back.rotation.x = -ang`，`front.rotation.x = +ang`
2. **Minor** 外翻：`left.rotation.z = +ang`，`right.rotation.z = -ang`
3. **前墙 + 前襟片** 同步淡出：`setFrontWallAlpha(1 → 0)`，实际 opacity 映射到 `[frontFadeMinAlpha, 1]`

缓动：分轨 `smootherStep`。

**节奏修订：** 初版 major/minor/front 约 420/400/340ms，手感偏快后整体放慢约 30–35%。

---

## 4. 合箱时间轴（closing）

| 参数 | 当前值 |
|------|--------|
| `closeFrontMs` | 320 |
| `closeMinorDelayMs` | 80 |
| `closeMinorMs` | 360 |
| `closeMajorDelayMs` | 260 |
| `closeMajorMs` | 440 |

顺序（贴近真箱封顶）：

1. 前墙+前襟片淡入（幽灵 → 实）
2. minor 向中合拢
3. major 向中合拢  
4. `finishClosingSequence` → settle 面板 + toast

---

## 5. 纸箱视觉高度（合盖防穿模）

### 5.1 问题

- 物品从箱内底面 `BOARD_SURFACE_Y` 往上堆叠。
- 旧公式 `wallHeight = levels × levelHeight` **未计入底板偏移**，叠满后物品顶 ≈  
  `surface + levels×cell + 0.01`，高于墙顶。
- 合箱后襟片与顶层摆放物（如 height=2 的 teal 块）**几何穿插**。

### 5.2 当前公式

```text
BOARD_SURFACE_Y   = 0.015 + 0.04   // 与 base 顶面一致
BOX_LID_CLEARANCE = 0.14           // 盖下净空

wallHeight = BOARD_SURFACE_Y
           + levels * levelHeight
           + 0.01                  // 与 getBoardItemY 顶面垫高一致
           + BOX_LID_CLEARANCE
```

| 量 | 3 层、cell=0.78 约值 |
|----|----------------------|
| 叠满物品顶 | ≈ 2.405 |
| 墙顶 `wallHeight` | ≈ 2.545 |
| 盖下余量 | ≈ 0.14 |

- 襟片铰链仍在 `wallHeight + 0.006~0.012`。
- `getBoardSurfaceY()` 统一返回 `BOARD_SURFACE_Y`，避免与墙高公式漂移。
- 逻辑可堆叠高度仍由 `levels` 约束；**只抬视觉墙/盖，不改网格层数规则**。

### 5.3 调参

| 想改… | 改什么 |
|-------|--------|
| 合盖更空 / 更贴 | `BOX_LID_CLEARANCE`（更大更空） |
| 底板高度 | `BOARD_SURFACE_Y`（须与 base mesh 一致） |

---

## 6. 几何与材质

### 6.1 RSC 四襟片（`createRscFlaps`）

- **铰链 Group** 钉在墙体外沿 `WALL_OUTER`，板从铰链伸向箱心。
- major 各盖约一半 depth；minor 各盖约一半 width；枢轴略高于墙顶，厚板旋转不切墙。
- **后 / 左 / 右** 共用 `flapMat`（不透明）。
- **前襟片** 独立 `frontFlapMat`（可透明），与前墙同轨淡出。

### 6.2 前墙 / 前盖淡出（`setFrontWallAlpha`）

```
t = 1 → opacity = 1（可 opaque）
t = 0 → opacity = frontFadeMinAlpha（默认 0.1，仍 visible）
```

`applyFrontFadeMesh`：

- `alpha >= 0.98`：可关 transparent、开 depthWrite
- 半透明：`transparent=true`，`depthWrite=false`
- `castShadow` 在 alpha ≥ 0.5 时开启

> 与早期 A2「play 时 visible=false」不同：产品选择**保留 0.1 幽灵感**，避免完全消失。

---

## 7. 关键 API（实现对照表）

| 函数 | 职责 |
|------|------|
| `startOpeningSequence` | 清交互态 → phase=opening → 合盖+前实+intro t=0 → boxAnim |
| `startClosingSequence` | phase=closing → boxAnim |
| `updateBoxSequence` | 每帧推进 intro / open 或 close |
| `setBoxIntroPose` / `resetBoxRigPose` | boardGroup 入场 / 归零 |
| `setMajorFlapsOpen` / `setMinorFlapsOpen` / `setFlapsOpenAmount` | 襟片角度 |
| `setFrontWallAlpha` / `applyFrontFadeMesh` | 前墙+前盖透明度 |
| `skipBoxSequence` | 跳到 finish* |
| `finishOpeningSequence` | rig 归零、盖开、前幽灵、phase=play |
| `finishClosingSequence` | 盖合、前实、phase=settle、UI |

动画驱动：`animate()` 循环内调用 `updateBoxSequence`（与 tray / rotation lerp 并列）。

---

## 8. 调参速查

| 想改… | 改什么 |
|-------|--------|
| 入场旋转幅度 | `introStartRotY`（45°=`π/4`，逆时针则取负） |
| 落差 / 砸桌感 | `introStartY`、`introDropMs`、bounce 段系数 |
| 开盖节奏 | `openMajorMs` / `openMinorDelayMs` / `openMinorMs` |
| 淡出早晚 | `openFrontDelayMs`（相对 open 起点；当前≈minor 结束） |
| 幽灵浓度 | `frontFadeMinAlpha`（越大越实） |
| 外翻贴墙程度 | `flapOpenAngle`（当前 220°） |
| 合盖与物品间隙 | `BOX_LID_CLEARANCE` |

---

## 9. 已知边界 / 后续可做

1. **itemGroup 不随 boardGroup**：入场只动箱子；托盘件独立。若以后「箱内已有物」入场，需把放置物挂到 box rig 或同步 transform。
2. **合箱无整箱离场**：closing 只做封盖，无飞出/缩小。
3. **intro 与 open 硬切**：intro 结束后立刻 open，无 hold；若要「落地停顿」可加 `introHoldMs`。
4. **超高视觉件**：若将来物品 scale>1 或额外装饰高度，需同步加大 `BOX_LID_CLEARANCE` 或改规则。
5. **level.schema 等** 与动画无关，不在此笔记范围。

---

## 10. 变更摘要

1. RSC 四襟片开/合 + 阶段机 + 可跳过  
2. 前襟片与前墙同步淡出；终点 `frontFadeMinAlpha = 0.1`  
3. 去掉开盖前额外停顿（`openFrontDelayMs` 对齐 minor 结束）  
4. 入场：落下 + 顺时针旋转（90° → **45°**）再开盖  
5. **开盖节奏放慢**：major 560 / minor 520 / front 420（相对 intro 后）  
6. **墙高防穿模**：`wallHeight = surface + levels×cell + 0.01 + BOX_LID_CLEARANCE(0.14)`  

---

## 11. 代码锚点

```text
src/main.js
  BOX_ANIM                          ~L22
  BOARD_SURFACE_Y / BOX_LID_CLEARANCE / wallHeight  ~L200+
  createRscFlaps / setMajor|Minor   ~L480+
  setFrontWallAlpha                 ~L588
  setBoxIntroPose / startOpening*   ~L623+
  updateBoxSequence                 ~L703
  getBoardSurfaceY / getBoardItemY
  onPointerDown skip                opening|closing
  resetLevel → startOpeningSequence
```
