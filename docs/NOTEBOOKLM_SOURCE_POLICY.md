# NotebookLM 源使用策略

日期：2026-07-16  
用途：减少 NotebookLM 在回答项目问题时混用旧方案、旧 MVP 规划和外部参考资料。

## 1. 当前权威源

以下文档是当前项目实现和方案判断的唯一依据：

1. `docs/PROJECT_DOCUMENTATION.md`
   - 项目总文档。
   - 包含玩法、关卡、交互、动画、适配、技术债和反查补漏记录。

2. `docs/IMPLEMENTATION.md`
   - 当前代码实现细节。
   - 用于确认函数、状态机、渲染循环、UI、调参面板和动画流程。

3. `docs/research/LEVEL-ADAPTATION-SCHEME.md`
   - 多关卡尺寸适配最终方案。
   - 明确固定摄像机、固定待放区、动态 `box.cellSize`、固定 `TRAY_CELL_SIZE`。

4. `docs/research/OPEN-BOX-ANIM-IMPL.md`
   - 开箱、合箱、纸箱襟片和输入锁实现。

5. `docs/research/SYNTHESIS-open-close-multi-size.md`
   - 已清理的调研综合。
   - 只保留当前仍有效的调研结论和已废弃方案清单。

## 2. 当前最终口径

NotebookLM 回答当前项目问题时，必须遵守以下规则：

- 当前真实关卡是三关：
  - 第 1 关：`2x2x1`
  - 第 2 关：`4x4x2`
  - 第 3 关：`6x6x3`
- 摄像机默认固定。
- 下方待放区默认固定。
- 小关卡不能通过推进相机放大。
- 小关卡通过增大真实 `box.cellSize` 放大。
- 下方物品预览使用固定 `TRAY_CELL_SIZE = 0.78`。
- 入箱后通过 `grid.cell / TRAY_CELL_SIZE` 缩放到真实箱内尺寸。
- 视觉空间和逻辑空间不能分离。
- 提示、撤销、结算 UI 使用 DOM overlay。
- 开箱/合箱动画期间锁输入。

## 3. 应删除或归档的历史源

以下源包含旧 MVP 计划、旧关卡数量、旧相机适配建议或过期审计内容。如果仍在 NotebookLM 中，应删除；如果必须保留，只能作为历史归档，不能用于当前实现判断。

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

## 4. 外部资料的使用边界

外部网页和研究笔记只作为技术参考，不直接覆盖当前项目方案。

| 外部资料类型 | 可用价值 | 禁止用途 |
|--------------|----------|----------|
| Three.js camera fit | 大关卡超界时的保底拉远参考 | 用于小关卡推进放大 |
| Three.js pivot / door | 纸箱襟片铰链实现参考 | 替换当前 RSC 纸箱结构 |
| Three.js transparent / depth | 前墙半透明和隐藏参考 | 改变核心遮挡规则 |
| Tiled JSON / schema | 关卡数据结构参考 | 推翻当前 `src/levels.js` 结构 |
| Cutscene skip / input lock | 动画锁输入参考 | 改变当前 `phase` 状态机 |

## 5. 回答冲突时的处理

如果 NotebookLM 检索到相互冲突的结论，优先级如下：

1. `PROJECT_DOCUMENTATION.md`
2. `LEVEL-ADAPTATION-SCHEME.md`
3. `IMPLEMENTATION.md`
4. `OPEN-BOX-ANIM-IMPL.md`
5. 清理后的 `SYNTHESIS-open-close-multi-size.md`
6. 外部研究资料
7. 历史 MVP / 旧综合 / 审计日志

当历史源与权威源冲突时，必须明确说明历史源已废弃。

## 6. 项目文档更新触发规则

当用户在本项目中说出以下任一意图时：

- “更新项目文档”
- “整理项目文档”
- “反查补漏文档”
- “把最新实现更新到文档”
- “同步到 NotebookLM”

执行者必须同时完成两件事：

1. **更新本地项目文档**
   - 优先更新 `docs/PROJECT_DOCUMENTATION.md`。
   - 涉及实现细节时同步更新 `docs/IMPLEMENTATION.md`。
   - 涉及专项方案时同步更新对应研究文档，例如：
     - `docs/research/LEVEL-ADAPTATION-SCHEME.md`
     - `docs/research/OPEN-BOX-ANIM-IMPL.md`
     - `docs/research/SYNTHESIS-open-close-multi-size.md`
   - 若文档权威源、噪声源、维护规则发生变化，必须同步更新本文件。

2. **维护 NotebookLM 中的项目文档源**
   - 删除 NotebookLM 中对应文档的旧版本。
   - 上传本地最新版本。
   - 检查源状态必须为 `ready`。
   - 对关键问题做一次验证问答，确认 NotebookLM 回答没有回到旧口径。

验证问题至少覆盖：

- 当前关卡数量和尺寸。
- 摄像机是否固定。
- 小关卡是否通过真实 `box.cellSize` 适配。
- 下方待放区是否固定。
- 是否仍引用旧 MVP 或旧相机适配方案。

如果无法访问 NotebookLM，必须在回复中明确说明“本地文档已更新，但 NotebookLM 未同步”，并给出失败原因。
