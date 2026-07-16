function rectShape(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(1));
}

export const levels = [
  {
    id: 'voxel-stack-test',
    name: '体素叠放测试',
    box: {
      cols: 5,
      rows: 5,
      levels: 3,
      cellSize: 0.78
    },
    items: [
      { id: 'blue-large', label: '蓝块', shape: rectShape(2, 3), color: '#2367d9' },
      { id: 'red-large', label: '红块', shape: rectShape(3, 2), color: '#e63237' },
      { id: 'yellow-mid', label: '黄块', shape: rectShape(2, 2), color: '#f2d33c' },
      { id: 'green-mid', label: '绿块', shape: rectShape(2, 2), color: '#44c06a' },
      { id: 'teal-box', label: 'BOX', shape: rectShape(2, 2), height: 2, color: '#2ec4b6' },
      { id: 'purple-bar', label: '紫条', shape: rectShape(1, 3), color: '#9b6ce3' },
      { id: 'orange-small', label: '橙块', shape: rectShape(1, 2), color: '#f28b2e' }
    ]
  }
];

export const currentLevel = levels[0];
