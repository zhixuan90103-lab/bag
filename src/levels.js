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
    id: 'small-first-order',
    name: '完整支撑',
    box: { cols: 2, rows: 2, levels: 2, cellSize: 1.05 },
    puzzleIntent: '先让玩家理解：上层物品不是看见空位就能放，必须先把 footprint 下方完整铺满。',
    keyItem: 'l1-top',
    keyPlacement: { gx: 0, gy: 0, level: 1 },
    // 破题点：两条底板必须先共同组成完整 2×2 支撑面。
    items: [
      { id: 'l1-base-a', label: '蓝底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l1-base-b', label: '橙底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f28b2e' },
      { id: 'l1-top', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'corner-pair',
    name: '异形拼底',
    box: { cols: 2, rows: 3, levels: 2, cellSize: 0.98 },
    puzzleIntent: '两个三格异形必须互补成完整底面；错在这里，上层整板永远没有完整支撑。',
    keyItem: 'l2-top',
    keyPlacement: { gx: 0, gy: 0, level: 1 },
    // 破题点：底层不是随便填满，而是要拼出一整块 2×3 平台。
    items: [
      { id: 'l2-corner', label: '青底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#2ec4b6' },
      { id: 'l2-l3', label: '紫底角', shape: shapeL3(), height: 1, role: 'foundation', intendedLayer: 0, color: '#9b6ce3' },
      { id: 'l2-top', label: '白盖板', shape: rectShape(2, 3), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'corner-quartet',
    name: '高块占边',
    box: { cols: 3, rows: 4, levels: 2, cellSize: 0.86 },
    puzzleIntent: '顶满高度的长高块必须先作为边界锚点；它会决定剩余底层被切成什么形状。',
    keyItem: 'l3-tall',
    keyPlacement: { gx: 0, gy: 0, level: 0 },
    // 破题点：1×2×2 高块落底后直接占满上下两层，其余物品围绕它补出底面和上层缺口。
    items: [
      { id: 'l3-tall', label: '蓝高箱', shape: rectShape(1, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l3-c1', label: '紫底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#9b6ce3' },
      { id: 'l3-c2', label: '红底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l3-c3', label: '黄底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l3-bar', label: '绿底条', shape: rectShape(1, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l3-top-a', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l3-top-b', label: '灰盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l3-top-c', label: '青顶条', shape: rectShape(1, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#2ec4b6' }
    ]
  },
  {
    id: 't-field',
    name: '角落高箱',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    puzzleIntent: '2×2×2 高箱是整关锚点；玩家要先把它当作角落大件处理，再用三块底板补齐剩余象限。',
    keyItem: 'l4-tall',
    keyPlacement: { gx: 0, gy: 0, level: 0 },
    // 破题点：高箱占掉一个 2×2 象限，剩下三个 2×2 底板和三个 2×2 盖板自然展开。
    items: [
      { id: 'l4-tall', label: '蓝高箱', shape: rectShape(2, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l4-base-a', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l4-base-b', label: '黄底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l4-base-c', label: '绿底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l4-top-a', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l4-top-b', label: '灰盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l4-top-c', label: '青盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#2ec4b6' }
    ]
  },
  {
    id: 'l-and-j',
    name: '封口预留',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    puzzleIntent: '上层有两条 4×1 长盖板，底层必须提前形成连续支撑带；不能只看当前小块哪里能塞。',
    keyItem: 'l5-top-a',
    keyPlacement: { gx: 0, gy: 0, level: 1 },
    // 破题点：高箱占满一个角后，剩余底层要保持连续行/列，给长盖板留完整支撑。
    items: [
      { id: 'l5-tall', label: '蓝高箱', shape: rectShape(2, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l5-base-c', label: '青底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#2ec4b6' },
      { id: 'l5-base-a', label: '紫底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#9b6ce3' },
      { id: 'l5-base-b', label: '橙底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f28b2e' },
      { id: 'l5-top-a', label: '白盖板', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l5-top-b', label: '灰盖板', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l5-top-c', label: '粉盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#e85d8a' }
    ]
  },
  {
    id: 'u-and-corners',
    name: '双高边界',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    puzzleIntent: '两个 1×2×2 高块会形成竖向边界，U 型件不能随便放，必须和高块共同决定底层轮廓。',
    keyItem: 'l6-u',
    keyPlacement: { gx: 0, gy: 0, level: 0 },
    // 破题点：高块先切出边界，U 型件再负责封住底层关键缺口，上层 T/条形件收口。
    items: [
      { id: 'l6-tall-a', label: '蓝高箱', shape: rectShape(1, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l6-tall-b', label: '红高箱', shape: rectShape(1, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l6-u', label: '蓝底 U', shape: shapeU(), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l6-a', label: '青底角', shape: shapeL3(), height: 1, role: 'foundation', intendedLayer: 0, color: '#2ec4b6' },
      { id: 'l6-bar', label: '黄底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l6-top-a', label: '白顶 T', shape: shapeT(), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l6-top-b', label: '灰顶 T', shape: shapeT(), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l6-top-c', label: '绿顶条', shape: rectShape(2, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#44c06a' },
      { id: 'l6-top-d', label: '紫顶条', shape: rectShape(2, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#9b6ce3' },
      { id: 'l6-top-e', label: '粉顶条', shape: rectShape(2, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#e85d8a' }
    ]
  },
  {
    id: 'voxel-stack-test',
    name: '平台分区',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    puzzleIntent: '底层四块 2×2 不是难点，难点是玩家要意识到它们是在搭两个 4×2 上层盖板的平台。',
    keyItem: 'l7-top-a',
    keyPlacement: { gx: 0, gy: 0, level: 1 },
    // 破题点：先按平台思路铺底，再用两个 4×2 大件完成上层封口。
    items: [
      { id: 'l7-base-a', label: '蓝底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l7-base-b', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l7-base-c', label: '黄底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l7-base-d', label: '绿底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l7-top-a', label: '白盖板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l7-top-b', label: '灰盖板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' }
    ]
  },
  {
    id: 't-stack',
    name: '三层长槽',
    box: { cols: 4, rows: 4, levels: 3, cellSize: 0.78 },
    puzzleIntent: '2×2×3 高箱顶满高度后，剩余空间要按层保留 4×1 长槽；长条位置是这关的关键。',
    keyItem: 'l8-tower',
    keyPlacement: { gx: 0, gy: 0, level: 0 },
    // 破题点：高箱先定锚，底层补齐后，中层/顶层的 4×1 长条需要连续支撑。
    items: [
      { id: 'l8-tower', label: '蓝高箱', shape: rectShape(2, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l8-base-a', label: '红底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l8-base-b', label: '黄底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l8-base-c', label: '绿底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l8-mid-a', label: '白中板', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l8-mid-b', label: '灰中板', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 1, color: '#6f7778' },
      { id: 'l8-mid-c', label: '青中板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#2ec4b6' },
      { id: 'l8-top-a', label: '橙顶板', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 2, color: '#f28b2e' },
      { id: 'l8-top-b', label: '粉顶板', shape: rectShape(4, 1), height: 1, role: 'supported', intendedLayer: 2, color: '#e85d8a' },
      { id: 'l8-top-c', label: '紫顶板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#9b6ce3' }
    ]
  },
  {
    id: 'stack-tower',
    name: '三柱货架',
    box: { cols: 6, rows: 6, levels: 3, cellSize: 0.78 },
    puzzleIntent: '三个 2×2×3 高箱是货架立柱；它们的位置决定剩余三层平台是否还能被 4×2 与 2×2 组合填满。',
    keyItem: 'l9-tower-a',
    keyPlacement: { gx: 0, gy: 0, level: 0 },
    // 破题点：先用三个高箱建立竖向骨架，再按底层/中层/顶层逐层铺平台。
    items: [
      { id: 'l9-tower-a', label: '蓝高箱', shape: rectShape(2, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l9-tower-b', label: '红高箱', shape: rectShape(2, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#e63237' },
      { id: 'l9-tower-c', label: '黄高箱', shape: rectShape(2, 2), height: 3, role: 'foundation', intendedLayer: 0, color: '#f2d33c' },
      { id: 'l9-base-a', label: '绿底板', shape: rectShape(4, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#44c06a' },
      { id: 'l9-base-b', label: '青底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#2ec4b6' },
      { id: 'l9-base-c', label: '橙底板', shape: rectShape(2, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#f28b2e' },
      { id: 'l9-base-d', label: '灰底板', shape: rectShape(4, 2), height: 1, role: 'foundation', intendedLayer: 0, color: '#6f7778' },
      { id: 'l9-mid-a', label: '白中板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' },
      { id: 'l9-mid-b', label: '紫中板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#9b6ce3' },
      { id: 'l9-mid-c', label: '粉中板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#e85d8a' },
      { id: 'l9-mid-d', label: '蓝中板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#4f8cff' },
      { id: 'l9-top-a', label: '白顶板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#f4f0e8' },
      { id: 'l9-top-b', label: '紫顶板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#9b6ce3' },
      { id: 'l9-top-c', label: '粉顶板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#e85d8a' },
      { id: 'l9-top-d', label: '蓝顶板', shape: rectShape(4, 2), height: 1, role: 'supported', intendedLayer: 2, color: '#4f8cff' }
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
