import {
  rectShape,
  shapeCorner,
  shapeL3,
  shapeL4,
  shapeJ4,
  shapeT,
  shapeS,
  shapeZ,
  shapeU,
  shapePlus,
  assertExactFill
} from './shapes.js';

/**
 * 关卡数据。box 尺寸变化时，main 会 rebuild 箱体并 fitCamera。
 *
 * 硬规则：
 * - 每关 box 容积可不同（cols × rows × levels）
 * - 物品体素总和必须 === 箱容积（精确铺满）
 * - 全部物品入箱才过关
 * - 保证至少有一解（已用装箱搜索校验）
 *
 * 形状见 shapes.js：矩形 / 拐角 / L3 / L4 / J / T / S / Z / U / 十字
 */
export const levels = [
  {
    id: 'first-flat-fill',
    name: '放满底面',
    difficulty: 'starter',
    puzzleType: 'operation',
    box: { cols: 2, rows: 2, levels: 1, cellSize: 1.12 },
    puzzleIntent: '第一关只教一次拖拽：把 2×2 整块放进 2×2×1 箱体即可完成，不引入拼合、旋转或堆叠压力。',
    keyItem: 'l1-board',
    keyPlacement: { gx: 0, gy: 0, level: 0, rotation: 0 },
    dependencyGraph: [
      { step: 'drag the full-size board into box', unlocks: 'completion' }
    ],
    items: [
      { id: 'l1-board', label: '蓝底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' }
    ]
  },
  {
    id: 'first-stack',
    name: '底满再叠',
    difficulty: 'starter',
    puzzleType: 'support',
    box: { cols: 2, rows: 2, levels: 2, cellSize: 1.08 },
    puzzleIntent: '第二关教核心 3D 规则：2×2 底面铺满后，上面才能放整块盖板。',
    keyItem: 'l2-top',
    keyPlacement: { gx: 0, gy: 0, level: 1, rotation: 0 },
    dependencyGraph: [
      { step: 'fill 2x2 bottom with two bars', unlocks: 'top support' },
      { step: 'place top cover', unlocks: 'completion' }
    ],
    items: [
      { id: 'l2-base-a', label: '蓝底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l2-base-b', label: '橙底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f28b2e' },
      { id: 'l2-top', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'first-tall-piece',
    name: '高块初见',
    difficulty: 'starter',
    puzzleType: 'height',
    box: { cols: 2, rows: 2, levels: 2, cellSize: 1.02 },
    puzzleIntent: '第三关引入落底后直接顶满高度的物品，让玩家区分高块和普通薄件。',
    keyItem: 'l3-tall',
    keyPlacement: { gx: 0, gy: 0, level: 0, rotation: 0 },
    dependencyGraph: [
      { step: 'place tall item on bottom', unlocks: 'side space' },
      { step: 'fill remaining thin pieces', unlocks: 'completion' }
    ],
    items: [
      { id: 'l3-tall', label: '蓝高箱', shape: rectShape(1, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l3-thin-a', label: '红薄条', shape: rectShape(1, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l3-thin-b', label: '白薄条', shape: rectShape(1, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'side-platform',
    name: '侧边平台',
    difficulty: 'starter',
    puzzleType: 'platform',
    box: { cols: 3, rows: 2, levels: 2, cellSize: 0.98 },
    puzzleIntent: '第四关作为过渡：高块先占住一侧，剩余 2×2 区域需要先铺底，再放上层盖板。',
    keyItem: 'l4-tall',
    keyPlacement: { gx: 0, gy: 0, level: 0, rotation: 0 },
    dependencyGraph: [
      { step: 'place side tall item', unlocks: '2x2 platform cavity' },
      { step: 'fill platform bottom', unlocks: 'top cover' },
      { step: 'place top cover', unlocks: 'completion' }
    ],
    items: [
      { id: 'l4-tall', label: '蓝高箱', shape: rectShape(1, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l4-base', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l4-top', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'first-light-puzzle',
    name: '预留平台',
    difficulty: 'junior',
    puzzleType: 'reserve',
    box: { cols: 4, rows: 3, levels: 2, cellSize: 0.82 },
    puzzleIntent: '第一个轻谜题：高块不能随便放，底层要为上层盖板和异形件留下完整支撑平台。',
    keyItem: 'l5-tall',
    keyPlacement: { gx: 0, gy: 0, level: 0, rotation: 0 },
    dependencyGraph: [
      { step: 'place tall anchor', unlocks: 'remaining bottom layout' },
      { step: 'complete foundation', unlocks: 'two top covers' },
      { step: 'place top covers', unlocks: 'completion' }
    ],
    items: [
      { id: 'l5-tall', label: '蓝高条', shape: rectShape(2, 1), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l5-base-a', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l5-base-b', label: '黄底条', shape: rectShape(3, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l5-base-c', label: '绿底角', shape: shapeL3(), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l5-top-a', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l5-top-b', label: '灰盖条', shape: rectShape(3, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l5-top-c', label: '粉盖角', shape: shapeL3(), height: 1, role: 'supported', intendedLayer: 1, color: '#e85d8a' }
    ]
  },
  {
    id: 'corner-foundation',
    name: '异形铺底',
    difficulty: 'junior',
    puzzleType: 'platform',
    box: { cols: 3, rows: 3, levels: 2, cellSize: 0.9 },
    puzzleIntent: '异形件必须互补成完整底层平台，上层大件用来验证底层是否真的铺对。',
    keyItem: 'l6-top-a',
    keyPlacement: { gx: 0, gy: 0, level: 1, rotation: 0 },
    dependencyGraph: [
      { step: 'combine L/corner pieces', unlocks: 'complete foundation' },
      { step: 'place top cover and strip', unlocks: 'completion' }
    ],
    items: [
      { id: 'l6-base-a', label: '蓝底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l6-base-b', label: '紫底角', shape: shapeL3(), height: 1, role: 'foundation', intendedLayer: 0, color: '#9b6ce3' },
      { id: 'l6-base-c', label: '橙底条', shape: rectShape(3, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f28b2e' },
      { id: 'l6-top-a', label: '白盖板', shape: rectShape(3, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l6-top-b', label: '灰顶条', shape: rectShape(3, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' }
    ]
  },
  {
    id: 'long-slot-reserve',
    name: '长槽预留',
    difficulty: 'junior',
    puzzleType: 'reserve',
    box: { cols: 4, rows: 3, levels: 2, cellSize: 0.82 },
    puzzleIntent: '提前为上层长条保留连续支撑带，避免用短件把长槽打碎。',
    keyItem: 'l7-top-a',
    keyPlacement: { gx: 0, gy: 0, level: 1, rotation: 0 },
    dependencyGraph: [
      { step: 'keep one continuous bottom row', unlocks: 'top long strip' },
      { step: 'finish remaining top space', unlocks: 'completion' }
    ],
    items: [
      { id: 'l7-base-a', label: '蓝底条', shape: rectShape(4, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l7-base-b', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l7-base-c', label: '黄底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l7-base-d', label: '绿底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l7-top-a', label: '白长盖', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l7-top-b', label: '灰盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l7-top-c', label: '青顶条', shape: rectShape(2, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#2ec4b6' },
      { id: 'l7-top-d', label: '粉顶条', shape: rectShape(2, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#e85d8a' }
    ]
  },
  {
    id: 'two-platforms',
    name: '平台分区',
    difficulty: 'expert',
    puzzleType: 'platform',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    puzzleIntent: '底层不是随便铺满，而是要分成两个 4×2 平台给上层大盖板使用。',
    keyItem: 'l8-top-a',
    keyPlacement: { gx: 0, gy: 0, level: 1, rotation: 0 },
    dependencyGraph: [
      { step: 'build first 4x2 support platform', unlocks: 'first top cover' },
      { step: 'build second 4x2 support platform', unlocks: 'second top cover' }
    ],
    items: [
      { id: 'l8-base-a', label: '蓝底板', shape: rectShape(4, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l8-base-b', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l8-base-c', label: '黄底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l8-top-a', label: '白盖板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l8-top-b', label: '灰盖板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' }
    ]
  },
  {
    id: 'three-layer-slot',
    name: '三层长槽',
    difficulty: 'expert',
    puzzleType: 'interlock',
    box: { cols: 4, rows: 4, levels: 3, cellSize: 0.78 },
    puzzleIntent: '第一次进入三层空间：2×2×3 高箱定骨架，薄件逐层保留长槽。',
    keyItem: 'l9-tower',
    keyPlacement: { gx: 0, gy: 0, level: 0, rotation: 0 },
    dependencyGraph: [
      { step: 'place 3-high anchor', unlocks: 'remaining 3-layer cavity' },
      { step: 'fill foundation', unlocks: 'middle strips' },
      { step: 'fill middle layer', unlocks: 'top strips' }
    ],
    items: [
      { id: 'l9-tower', label: '蓝高箱', shape: rectShape(2, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l9-base-a', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l9-base-b', label: '黄底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l9-base-c', label: '绿底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l9-mid-a', label: '白中条', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l9-mid-b', label: '灰中条', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l9-mid-c', label: '青中板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#2ec4b6' },
      { id: 'l9-top-a', label: '橙顶条', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 2, color: '#f28b2e' },
      { id: 'l9-top-b', label: '粉顶条', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 2, color: '#e85d8a' },
      { id: 'l9-top-c', label: '紫顶板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#9b6ce3' }
    ]
  },
  {
    id: 'first-exam',
    name: '小考验',
    difficulty: 'expert',
    puzzleType: 'exam',
    box: { cols: 5, rows: 4, levels: 3, cellSize: 0.72 },
    puzzleIntent: '第 10 关作为阶段考验：同时处理高块锚点、连续长槽和逐层平台，但规模仍控制在可读范围。',
    keyItem: 'l10-tower-a',
    keyPlacement: { gx: 0, gy: 0, level: 0, rotation: 0 },
    dependencyGraph: [
      { step: 'place tall anchors', unlocks: 'stable 3-layer frame' },
      { step: 'fill bottom platform', unlocks: 'middle layer' },
      { step: 'preserve long strips', unlocks: 'top seal' }
    ],
    items: [
      { id: 'l10-tower-a', label: '蓝高箱', shape: rectShape(2, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l10-tower-b', label: '红高箱', shape: rectShape(1, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l10-base-a', label: '黄底板', shape: rectShape(3, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l10-base-b', label: '绿底条', shape: rectShape(4, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l10-base-c', label: '青底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#2ec4b6' },
      { id: 'l10-mid-a', label: '白中板', shape: rectShape(3, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l10-mid-b', label: '灰中条', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l10-mid-c', label: '紫中板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#9b6ce3' },
      { id: 'l10-top-a', label: '橙顶板', shape: rectShape(3, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#f28b2e' },
      { id: 'l10-top-b', label: '粉顶条', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 2, color: '#e85d8a' },
      { id: 'l10-top-c', label: '蓝顶板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#4f8cff' }
    ]
  }
];

// 开发期：体积必须精确铺满
for (const level of levels) {
  assertExactFill(level);
}

export function getLevel(index) {
  const i = Math.max(0, Math.min(levels.length - 1, index | 0));
  return levels[i];
}

export {
  rectShape,
  shapeCorner,
  shapeL3,
  shapeL4,
  shapeJ4,
  shapeT,
  shapeS,
  shapeZ,
  shapeU,
  shapePlus
};
