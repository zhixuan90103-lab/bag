/**
 * 物品脚印形状库（XZ 平面 0/1 矩阵）。
 * height 在关卡 item 上单独配置，与 shape 相乘得到体素体积。
 *
 * 约定：shape[row][col]，row 沿 +Z，col 沿 +X。
 * 旋转由 main.rotateShape 处理（90°×n）。
 */

/** 实心矩形 cols × rows */
export function rectShape(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(1));
}

/** 单格 */
export function shapeUnit() {
  return [[1]];
}

/**
 * 拐角 / L 三格（tromino）
 * ##
 * #
 */
export function shapeCorner() {
  return [
    [1, 1],
    [1, 0]
  ];
}

/**
 * 竖向 L 三格（与拐角同构，初始朝向不同）
 * #
 * ##
 */
export function shapeL3() {
  return [
    [1, 0],
    [1, 1]
  ];
}

/**
 * L 四格（tetromino L）
 * #
 * #
 * ##
 */
export function shapeL4() {
  return [
    [1, 0],
    [1, 0],
    [1, 1]
  ];
}

/**
 * J 四格（L 镜像）
 *  #
 *  #
 * ##
 */
export function shapeJ4() {
  return [
    [0, 1],
    [0, 1],
    [1, 1]
  ];
}

/**
 * T 四格
 * ###
 *  #
 */
export function shapeT() {
  return [
    [1, 1, 1],
    [0, 1, 0]
  ];
}

/**
 * S 四格
 *  ##
 * ##
 */
export function shapeS() {
  return [
    [0, 1, 1],
    [1, 1, 0]
  ];
}

/**
 * Z 四格
 * ##
 *  ##
 */
export function shapeZ() {
  return [
    [1, 1, 0],
    [0, 1, 1]
  ];
}

/**
 * U 五格
 * # #
 * ###
 */
export function shapeU() {
  return [
    [1, 0, 1],
    [1, 1, 1]
  ];
}

/**
 * 十字五格
 *  #
 * ###
 *  #
 */
export function shapePlus() {
  return [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0]
  ];
}

/** 脚印占用格数 */
export function countShapeCells(shape) {
  let n = 0;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (shape[y][x]) n += 1;
    }
  }
  return n;
}

/** 物品体素体积 = 脚印格数 × height */
export function pieceVolume(item) {
  return countShapeCells(item.shape) * (item.height ?? 1);
}

/** 关卡箱容积 */
export function boxVolume(box) {
  return box.cols * box.rows * box.levels;
}

/** 校验：体素和是否等于箱容（精确铺满） */
export function assertExactFill(level) {
  const need = boxVolume(level.box);
  const got = level.items.reduce((sum, item) => sum + pieceVolume(item), 0);
  if (got !== need) {
    console.warn(
      `[level ${level.id}] volume mismatch: items=${got}, box=${need}`
    );
  }
  return got === need;
}
