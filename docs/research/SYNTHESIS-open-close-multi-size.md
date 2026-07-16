# 开箱 / 合箱 / 多尺寸 · Grok 检索综合结论

**日期：** 2026-07-16  
**笔记本：** Pack 装箱游戏 · 设计检索库  
**方法：** grok-search（xAI web_search）按检索计划 Phase1–3  
**原始材料：** `docs/research/A*.md`、`B*.md`、`json/*.json`

---

## 0. 执行状态

| ID | 主题 | 状态 | 产出 |
|----|------|------|------|
| A1 | 铰链盖 / pivot | ✅ 深度 MD | `A1-hinged-lid.md` |
| A2 | 透明墙 fade | ✅ 深度 MD | `A2-transparent-fade.md` |
| B1 | fit camera | ✅ 深度 MD | `B1-fit-camera.md` |
| A4 | 通关 juice | ✅ 深度 MD | `A4-level-complete-juice.md` |
| A5 | 可跳过 / 锁输入 | ✅ JSON | `json/A5.json` |
| C2 | easing | ✅ JSON | `json/C2.json` |
| C3 | 结算 UI DOM vs 3D | ✅ JSON | `json/C3.json` |
| B2 | 竖屏多尺寸相机 | ✅ JSON | `json/B2.json` |
| B3 | 多网格尺寸先例 | ⚠️ 搜索中断 | 仅保留 `.err` 查询日志，未形成有效 JSON |
| B4 | level schema | ✅ JSON | `json/B4.json` |

> 注：后半包因 grok-search「Extracting detailed content」耗时长，改用 `--json` 快路径（仅 URL+摘要，无全文抽取）。

---

## 1. 验收问题 → 结论（可直接指导实现）

### Q1. 铰链盖 pivot 放哪？

**结论：用 Group 铰链，不要改 geometry 顶点。**

1. 建 `lidHinge` Group，位置钉在**后墙顶边中心**（世界坐标随 box 重建）。  
2. `lid` mesh 作为子物体，**向盖板中心偏移**：若盖深为 `depth`，则 `lid.position.z = +depth/2`（铰链在 z 负向后缘时取反，按你们轴向约定）。  
3. 动画只改 `lidHinge.rotation.x`（或对应轴），`t=0` 合、`t=1` 开。  
4. 参考：Group offset 门（Code Orange / SO pivot）、`rotateAboutPoint` 备选。

**对本项目：** `rebuild(box)` 时重算 hinge 世界位与 lid 尺寸；`setLidOpenAmount(t)` 只 lerp 角度。

### Q2. 前墙 Alpha 怎么设？

**结论：**

| 阶段 | 建议 |
|------|------|
| 淡入淡出中 | `transparent: true`，改 `opacity`；`depthWrite: false`；可提高 `renderOrder` |
| 完全透明（play） | `opacity=0` 后设 `visible=false`，避免透明排序与误遮挡 |
| 完全不透明（opening 初 / closing 末） | `opacity=1`，可 `transparent: false` 以省透明队列 |

勿对大量物体无谓开 `transparent`。半透明阶段 `depthWrite: false` 更稳。  
参考：three 文档 depthTest、SO transparent depth、A2 Summary。

### Q3. 多尺寸相机公式？

**结论（透视、固定 FOV）：**

```text
// 垂直方向适配为主（竖屏）
fovV = fov * π/180
distV = (fitHeight/2) / tan(fovV/2)

// 水平也要装下
fovH = 2 * atan(tan(fovV/2) * aspect)
distH = (fitWidth/2) / tan(fovH/2)

distance = max(distV, distH) * padding   // padding ~ 1.15–1.35
target = boxCenter（略抬高 wallHeight*0.2）
```

`fitWidth/Height` 用箱体在**相机投影平面**上的有效尺寸；俯视斜角时可对 AABB 取 `max(width, depth)` 与 `wallHeight` 加权。  
参考：SO 14614252、2866350、wejn.org fit nut、B1 Summary。  
**切关：** `rebuild` 后 `fitCameraToBox(box)`；可用短 lerp，不必上 camera-controls 库（已有自定义 rig）。

### Q4. 开/合顺序有没有反例？

检索未否定「先盖后墙 / 合箱先墙后盖」。  
表现向建议保持你们已定：

- **开箱：** 掀盖 → 前墙 1→0  
- **合箱：** 前墙 0→1 → 合盖  

与「完整盒 → 可操作 → 再封回完整盒」叙事一致。

### Q5. 仪式时长与可跳过？

- 资料与既有 MVP：合箱 **600–1000ms** 可跳过。  
- 引擎实践（Unity/UE 教程）：cutscene 期间 **Disable Input**，skip 跳到 Timeline 终点再恢复输入。  
- **建议：**  
  - opening 总长 **0.6–0.9s**（短于 closing）  
  - closing **0.7–1.1s**  
  - 点屏 / 跳过 → 直接终态 + unlock  
  - `phase ∈ {opening,closing,settle}` 时 `onPointer*` / 提示 / 撤销 return  

### Q6. 切关：重建 vs scale？

- 多尺寸 puzzle 先例：难度 = 不同 grid（3×3 / 4×4…），逻辑重建网格。  
- 箱盖/墙尺寸随 `cols*cell` 变 → **rebuild mesh 更干净**。  
- Schema 参考：Tiled JSON（width/height + layers）；3D 可扩 `depth/levels`。  
- **建议接口：**

```js
box: { cols, rows, levels, cellSize }
// rebuildBoard(box) + fitCameraToBox(box) + phase=opening
```

固定 `cellSize`，只变格数；相机 fit 吸收屏幕适配。

---

## 2. 分主题要点

### A1 铰链盖

- Three 无原生 transform-origin → **Group 偏移** 是社区标准。  
- GSAP/自写 lerp 均可；项目已有 `smootherStep`，够用。  
- 示例：门 swing group 放铰链边，mesh 反向偏移半宽。

### A2 透明前墙

- 半透明：`depthWrite:false` + 合适 `renderOrder`。  
- 全透明：优先 `visible=false`。  
- 透明排序仅 object 级 → 前墙单独一个 mesh 即可控。

### B1/B2 相机

- 核心：`d = (s/2) / tan(fov/2)`，再取宽高 max。  
- 非立方体箱：用 AABB 或 bounding sphere 半径。  
- 竖屏：优先保证箱宽与箱高都在安全边距内；托盘在箱下方留 margin（fit 时 fitHeight 含托盘区或单独 UI 不进 fit）。

### A4 Juice

- 检索命中偏 match-3 / JS13K 架构，直接「合纸箱」分镜仍少。  
- 可迁移原则：通关反馈要**短、可读、可跳过**；与核心循环解耦（状态机）。  
- 仍以项目笔记为准：盖合 + Toast + 锁输入 + 进下一关。

### A5 锁输入 / 跳过

- 统一 pattern：进入仪式 → disable gameplay input → skip 或播完 → restore。  
- 结算层单独接收点击（「下一关」），与 gameplay 输入分离。

### C2 Easing

- 合盖/开盖：`easeOutCubic` / easeOutQuad 适合「快起慢落」。  
- 可用 Penner 公式或 `THREE.MathUtils.smootherstep`；不必引库。  
- 前墙 alpha 可用线性或更短 easeOut。

### C3 结算 UI

- **推荐 DOM overlay** 做「订单完成 / 下一关」：字号、安全区、点击命中更省事。  
- 3D 内 UI 维护成本高，移动端命中差。  
- 3D 只负责箱盖/前墙；结算弹层用现有 Toast 升级为 settle panel。

### B3/B4 多尺寸与 Schema

- 关卡差异 = `grid` 参数化是行业常识。  
- Schema 最小集建议：

```json
{
  "id": "string",
  "name": "string",
  "box": { "cols": 3, "rows": 3, "levels": 1, "cellSize": 0.78 },
  "items": [
    { "id": "a", "shape": [[1,1],[1,0]], "height": 1, "color": "#..." }
  ]
}
```

- Tiled 的 width/height 可类比 cols/rows；`levels` 为第三维。

---

## 3. 推荐技术方案（检索后定稿骨架）

```text
BoxRig.rebuild(box)
  floor, base, back/left/right walls
  frontWall (alpha controllable)
  lidHinge @ back-top edge + lid child

BoxRig.setLidOpen(t01)      // rotation only
BoxRig.setFrontAlpha(a)     // opacity + visible

CameraFitter.fit(box, viewport)
  distance = max(distW, distH) * pad
  target = center

GamePhase: boot → opening → play → closing → settle → next
  opening: lid 0→1, then/with front 1→0, unlock
  closing: lock, front 0→1, lid 1→0, settle UI
  settle: DOM panel → loadLevel(i+1) → rebuild → opening
```

**尺寸只进 rebuild + fit；序列零硬编码 cols。**

---

## 4. 关键 URL 清单（建议入库 NotebookLM）

### 铰链 / Pivot
- https://stackoverflow.com/questions/42812861/three-js-pivot-point  
- https://leemartin.dev/opening-the-door-into-the-above-with-code-orange-d04bc939d438  
- https://discourse.threejs.org/t/rotating-planegeometry-at-edge-like-a-door-using-dat-gui/19589  

### 透明
- https://threejs.org/docs/#api/en/materials/Material.depthTest  
- https://stackoverflow.com/questions/59938997/how-to-deal-with-transparent-textures-and-depth-in-three-js  
- https://stackoverflow.com/questions/49096626/three-js-what-is-more-efficient-to-layer-and-resolve-z-fighting-using-polygono  

### 相机 fit
- https://stackoverflow.com/questions/14614252/how-to-fit-camera-to-object  
- https://stackoverflow.com/questions/2866350/move-camera-to-fit-3d-scene  
- https://wejn.org/2020/12/cracking-the-threejs-object-fitting-nut/  

### Easing / 输入 / UI
- https://github.com/just-animate/just-curves  
- https://lordkakabel.medium.com/skipping-cutscenes-in-unity-7571c8991e42  
- https://stackoverflow.com/questions/62735138/the-best-approach-to-use-only-threejs-for-building-interactive-ui-without-html-d  

### Schema / 多尺寸
- https://doc.mapeditor.org/en/stable/reference/json-map-format/  
- https://github.com/Deadworld-bit/CasualPuzzle_Testing  

---

## 5. 仍偏弱的资料（可接受）

| 缺口 | 处理 |
|------|------|
| 纸箱合盖专用分镜 | 用你们已定玩家流程 + 本技术栈补全 |
| 移动端竖屏 fit 专用长文 | 用通用 fit 公式 + padding 实测 3×3×1 与 5×5×3 |
| level.schema 3D 标准文件 | 按 §2 B4 最小集自建 `level.schema.json` |

---

## 6. 建议实现顺序（检索后）

1. `BoxRig`：前墙 + 铰链盖 + rebuild(box)  
2. `opening` / `closing` 序列 + 输入锁 + 跳过  
3. `fitCameraToBox` + 第二关不同 `cols/rows` 验证  
4. DOM settle + `loadLevel` 钩子  
5. 音效 / 震动（后置）

---

*Generated from Grok research run 2026-07-16 for Pack project.*
