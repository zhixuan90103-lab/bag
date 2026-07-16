# 开箱 / 合箱 / 多尺寸 · 清理后综合结论

日期：2026-07-16  
项目：Pack 装箱游戏 Three.js 版本  
状态：已清理历史噪声。本文件只保留对当前实现仍有效的调研结论。

## 0. 权威边界

当前项目的实现口径以以下文档为准：

1. `docs/PROJECT_DOCUMENTATION.md`
2. `docs/IMPLEMENTATION.md`
3. `docs/research/LEVEL-ADAPTATION-SCHEME.md`
4. `docs/research/OPEN-BOX-ANIM-IMPL.md`

本文件是调研综合，不覆盖上述权威文档。

## 1. 已废弃噪声

以下内容曾出现在早期检索或 MVP 文档中，但已经不再适用于当前项目：

1. **固定 `cellSize` + 相机 fit 适配关卡**
   - 废弃原因：会让小关卡推进相机，导致纸箱位置漂移、下方待放物品被裁切。
   - 当前做法：摄像机固定，小关卡通过增大真实 `box.cellSize` 放大箱体。

2. **2D/逻辑与视觉分离的箱体**
   - 废弃原因：玩家会看到不可放置的假空间，产生认知偏差。
   - 当前做法：视觉格子、纸箱尺寸、物品入箱尺寸必须与逻辑一致。

3. **早期 8 关 MVP 规划**
   - 废弃原因：与当前验证用三关不一致。
   - 当前做法：当前真实关卡为 `2x2x1`、`4x4x2`、`6x6x3`。

4. **单关卡 `5x5x3` 硬编码描述**
   - 废弃原因：当前已切换为 `levels` 数组和 `levelIndex`。
   - 当前做法：关卡数据集中在 `src/levels.js`。

## 2. 当前有效结论

### 2.1 铰链与开箱结构

有效结论：用 `THREE.Group` 作为铰链，不直接修改 geometry 顶点。

实现边界：

- 每个纸箱襟片使用独立 mesh。
- 每个襟片挂在自己的 hinge group 上。
- 打开/关闭只修改 hinge group 的旋转。
- 纸箱尺寸变化时重建 hinge 位置。

当前实现位置：

- `createBoxFlap()`
- `rebuildBox()`
- `updateBoxSequence()`

### 2.2 前墙和透明处理

有效结论：透明墙应作为独立 mesh 控制。

实现边界：

- 半透明阶段使用 `transparent: true` 和 `opacity`。
- 半透明时 `depthWrite: false`，减少遮挡排序问题。
- 完全隐藏时优先 `visible = false`，避免无意义透明排序。

当前用途：

- 面向摄像机的前墙可以隐藏。
- 开箱/合箱动画中可淡入淡出。

### 2.3 开箱 / 合箱节奏

有效结论：开箱与合箱是短仪式动画，必须锁输入且可跳过。

当前节奏：

- 开局：完整纸箱从上方落下。
- 开箱：顶部/侧边襟片打开，前墙进入可玩状态。
- 游玩：前墙隐藏或弱化，避免遮挡。
- 通关：锁输入，纸箱合上，显示结算。

实现边界：

- `phase` 不为 `play` 时，拖拽、提示、撤销应被拦截。
- 跳过动画时必须直接设置最终状态，再恢复输入。

### 2.4 结算 UI

有效结论：结算、提示、撤销、重置这类交互应使用 DOM overlay，不放进 3D 场景。

原因：

- 移动端点击命中更稳定。
- 安全区和字号更容易控制。
- 不受相机、遮挡、深度排序影响。

### 2.5 多尺寸关卡 schema

有效结论：关卡数据应参数化，纸箱和物品都从数据重建。

当前最小结构：

```js
{
  id: "level-id",
  name: "关卡名",
  box: {
    cols: 2,
    rows: 2,
    levels: 1,
    cellSize: 1.15
  },
  items: [
    {
      id: "item-id",
      color: "#3b82f6",
      shape: [[0, 0], [1, 0]],
      height: 1
    }
  ]
}
```

当前三关：

| 关卡 | 尺寸 | 目的 |
|------|------|------|
| 1 | `2x2x1` | 验证小关卡真实放大，不动相机 |
| 2 | `4x4x2` | 验证二层体素叠放 |
| 3 | `6x6x3` | 验证三层和大底盘上限 |

### 2.6 摆放物品几何生成

有效结论：方形和异形物品必须使用同一套几何生成口径。

当前实现统一使用：

```js
createSolidPolyominoGeometry(shape, cellSize, height, inset)
```

适用对象：

- 方形块
- 长条块
- L / J / T / U / 拐角异形
- 红/绿 ghost 提示平面

不再采用：

- 方形物品使用 `RoundedBoxGeometry`
- 异形物品使用另一套 `ExtrudeGeometry`

原因：

- 两套几何体会导致圆角半径、侧面倒角、顶面高光和法线观感不一致。
- 凹形 `ExtrudeGeometry` 配合负 `bevelOffset` 有已知错误面问题，会出现斜切伪影。

当前策略：

- 统一从二维 `shape` 提取 polyomino 外轮廓。
- 外轮廓轻微内缩，保留视觉缝隙。
- 只圆滑外凸角，内凹角保持稳定。
- 使用小 bevel 处理顶面到侧面的圆角。
- 不使用负 `bevelOffset`。

## 3. 当前多尺寸适配定稿

最终方案不是相机适配，而是“两套尺寸基准”：

1. **箱内真实尺寸**
   - 来源：`level.box.cellSize`
   - 用途：纸箱尺寸、格子尺寸、物品入箱尺寸、层高、体素占用。

2. **下方预览尺寸**
   - 常量：`TRAY_CELL_SIZE = 0.78`
   - 用途：待放区物品预览。
   - 不随关卡变化。

入箱缩放：

```js
boardScale = grid.cell / TRAY_CELL_SIZE;
```

约束：

- 小关卡不能推进相机。
- 下方待放区不能因关卡变化缩放。
- 视觉空间和逻辑空间不能分离。
- 大关卡只在确实装不下时允许拉远，但不能改变构图中心。

## 4. 保留的外部参考价值

早期检索资料仍可作为底层技术参考，但不能直接作为当前产品方案：

| 资料方向 | 可保留价值 | 不能直接套用的部分 |
|----------|------------|--------------------|
| Three.js pivot / door | 铰链 group 思路 | 不覆盖当前襟片结构 |
| Three.js transparent / depth | 半透明墙体材质设置 | 不用于改变玩法遮挡规则 |
| Camera fit 公式 | 大关卡超界时的保底拉远参考 | 不用于小关卡推进放大 |
| Tiled JSON / grid schema | 参数化关卡结构 | 不代表最终关卡内容 |
| Cutscene skip / lock input | 仪式动画锁输入 | 不改变当前 `phase` 状态机 |

## 5. 后续维护规则

修改以下内容时，必须同步更新权威文档和本综合：

- `src/levels.js` 关卡数量、尺寸、物品配置。
- `TRAY_CELL_SIZE`、待放区位置、待放区最多显示数量。
- `getBoardItemScale()` 或入箱缩放策略。
- 开箱/合箱动画时间轴。
- 体素层数、支撑规则、占用规则。
- 提示、撤销、最后一块意图识别逻辑。

## 6. 不再作为实现依据的文件或段落

如果 NotebookLM 中仍存在以下源，应视为历史归档或直接删除：

- `mvp-plan.md`
- `mvp-tasks.md`
- `mvp-notebooklm-review.md`
- `research-synthesis.md`
- `ROUND2_SYNTHESIS.md`
- `ROUND3_SYNTHESIS.md`
- `research-gap-audit.md`
- `research-gap-audit-r2.md`
- `research-self-consistency.md`
- `research-plan.md`
- `level.schema.json` 的 error 状态源

这些资料中的有效信息已经被提取到当前权威文档，继续保留会增加 NotebookLM 回答噪声。
