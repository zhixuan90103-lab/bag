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
    name: '先底后盖',
    box: { cols: 2, rows: 2, levels: 2, cellSize: 1.05 },
    // 容积 8：两条底板铺满第一层后，整块盖板才能放到第二层
    items: [
      { id: 'l1-base-a', label: '蓝底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l1-base-b', label: '橙底条', shape: rectShape(2, 1), height: 1, role: 'foundation', intendedLayer: 0, color: '#f28b2e' },
      { id: 'l1-top', label: '白盖板', shape: rectShape(2, 2), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'corner-pair',
    name: '拐角铺底',
    box: { cols: 2, rows: 3, levels: 2, cellSize: 0.98 },
    // 容积 12：两个三格拐角先拼满底层，再放 2×3 上层板
    items: [
      { id: 'l2-corner', label: '青底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#2ec4b6' },
      { id: 'l2-l3', label: '紫底角', shape: shapeL3(), height: 1, role: 'foundation', intendedLayer: 0, color: '#9b6ce3' },
      { id: 'l2-top', label: '白盖板', shape: rectShape(2, 3), height: 1, role: 'supported', intendedLayer: 1, color: '#f4f0e8' }
    ]
  },
  {
    id: 'corner-quartet',
    name: '四角托盘',
    box: { cols: 3, rows: 4, levels: 2, cellSize: 0.86 },
    // 容积 24：一个落底顶满高块先占位，其余底层补齐后再放上层盖板
    items: [
      { id: 'l3-tall', label: '蓝高箱', shape: rectShape(1, 2), height: 2, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
      { id: 'l3-c1', label: '蓝底角', shape: shapeCorner(), height: 1, role: 'foundation', intendedLayer: 0, color: '#2367d9' },
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
    name: 'T 字底架',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    // 容积 32：一个 2×2×2 高箱顶满高度，三块底板补齐底层后再上架
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
    name: 'L/J 承重',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    // 容积 32：高箱先落底顶满高度，三块底板补出可承重的底层区域
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
    name: 'U 型底座',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    // 容积 32：两个顶满高块形成竖向边界，U 型件和小件补底后再上层收口
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
    name: '先铺底层',
    box: { cols: 4, rows: 4, levels: 2, cellSize: 0.78 },
    // 容积 32：先用 1 高度物品铺满第一层，再放第二层盖板
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
    name: '高箱与薄件',
    box: { cols: 4, rows: 4, levels: 3, cellSize: 0.78 },
    // 容积 48：2×2×3 高箱先落底，其余 1 高度物品分层补满
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
    name: '三层货架',
    box: { cols: 6, rows: 6, levels: 3, cellSize: 0.78 },
    // 容积 108：三个 2×2×3 高箱作为竖向锚点，其余 1 高度物品先铺底再上架
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
