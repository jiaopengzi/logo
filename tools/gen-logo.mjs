/**
 * FilePath    : logo\tools\gen-logo.mjs
 * Author      : jiaopengzi
 * Blog        : https://jiaopengzi.com
 * Copyright   : Copyright (c) 2026 by jiaopengzi, All Rights Reserved.
 * Description : 参数化生成方形图标, 横版 (含紧凑版与深色版) 与头像 SVG, 在仓库根目录运行 node tools/gen-logo.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EOL } from 'node:os';
import { fileURLToPath } from 'node:url';

/** NAVY 品牌藏青色. */
const NAVY = '#1E2858';
/** GOLD 品牌金色. */
const GOLD = '#C89828';

/**
 * ICON_J_D 图标 J 的路径命令, 与 logo.svg 原稿逐字一致, 图标与各横版共用.
 * 坐标系以 550 方块左上角为 (-230, -345); 59.372539 = (√63 - 2) × 10.
 */
const ICON_J_D = [
  'M -10 10',
  'L -59.372539 10',
  'A 80,80 1 0,0 20,100',
  'A 130,130 1 0,0 150,-30',
  'L 150 -240',
  'L 20 -240',
  'L 20 -160',
  'L 70 -160',
  'L 70 -30',
  'A 50,50 1 0,1 -10,10',
  'Z',
];

/** SOFT 中文收笔尖角的柔化半径 (字身 350 单位). */
const SOFT = 6;
/** A_TOP_R 字母 A 顶部两角的圆角半径 (字母单位). */
const A_TOP_R = 30;
/** CN_H 中文字身高度. */
const CN_H = 350;

// 各字笔画宽: SV 为竖向笔画宽, SH 为横向笔画高; 笔画多的字略细, 使三字灰度一致.
const W_JIAO = { SV: 34, SH: 31 };
const W_PENG = { SV: 33, SH: 29 };
const W_ZI = { SV: 36, SH: 32 };

/**
 * LAYOUT 横版排版参数.
 * cnLeft, cnRight 为中文行左右边界, cnTop 为中文行顶, cnW 为三字字宽, latinS 为字母缩放, rowGap 为两行间距.
 */
const LAYOUT = { cnLeft: 652, cnRight: 1780, cnTop: 22, cnW: [345, 345, 345], latinS: 0.32, rowGap: 50 };

/** COMPACT 紧凑横版参数: scale 为中文行放大倍数, left 为中文行左边界, width 为画布宽. */
const COMPACT = { scale: 1.2, left: 660, width: 2024 };

/** AVATAR 头像参数: k 为缩放, cnCenter 与 latinCenter 为两行中线 (1080 的 0.382 与 0.618 黄金分割点). */
const AVATAR = { k: 0.82, cnCenter: 412.5, latinCenter: 667.5 };

/** LT 字母坐标系的大写顶线 T 与基线 B. */
const LT = { T: 105, B: 440 };

// ---------------- 基础工具 ----------------

/**
 * fmt 将数值格式化为最多两位小数的字符串, 并消除 -0.
 * @param {number} n - 待格式化的数值.
 * @returns {string} 格式化结果.
 */
function fmt(n) {
  const v = Math.round(n * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
}

/**
 * near 判断两点是否重合.
 * @param {number[]} a - 点 [x, y].
 * @param {number[]} b - 点 [x, y].
 * @returns {boolean} 两点各坐标差都小于 1e-6 时返回 true.
 */
function near(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

/**
 * cmdsToD 将路径命令转为 path 的 d 属性文本, 每条命令占一行.
 * @param {Array<Array>} cmds - 路径命令, 形如 ['M', x, y], ['L', x, y], ['A', rx, ry, rot, large, sweep, x, y], ['Z'].
 * @param {string} [indent=''] - 换行后的缩进.
 * @returns {string} d 属性文本.
 * @throws {Error} 遇到不支持的命令时抛出.
 */
function cmdsToD(cmds, indent = '') {
  return cmds
    .map((c) => {
      switch (c[0]) {
        case 'M':
          return `M ${fmt(c[1])} ${fmt(c[2])}`;
        case 'L':
          return `L ${fmt(c[1])} ${fmt(c[2])}`;
        case 'A':
          return `A ${fmt(c[1])} ${fmt(c[2])} ${c[3]} ${c[4]} ${c[5]} ${fmt(c[6])} ${fmt(c[7])}`;
        case 'Z':
          return 'Z';
        default:
          throw new Error('bad cmd ' + c[0]);
      }
    })
    .join('\n' + indent);
}

/**
 * poly 生成圆角多边形的路径命令.
 * 顶点可带 r (圆角半径), t (切线长), leaf (叶形收笔, 切线长取较短邻边),
 * soft (收笔尖角微圆, 相邻 leaf 自动让出切线长度, 两段圆弧在端边上相切衔接).
 * @param {Array<{x: number, y: number, r?: number, t?: number, leaf?: boolean, soft?: boolean}>} ptsIn - 顶点列表.
 * @param {number} [soft=SOFT] - 柔化半径.
 * @returns {Array<Array>} 路径命令.
 */
function poly(ptsIn, soft = SOFT) {
  let pts = ptsIn;
  const plain = (p) => !p.leaf && !p.r && !p.t && !p.soft;
  const firstSharp = pts.findIndex(plain);
  if (firstSharp > 0) pts = [...pts.slice(firstSharp), ...pts.slice(0, firstSharp)];
  const n = pts.length;
  const geo = pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const ax = p.x - prev.x, ay = p.y - prev.y, la = Math.hypot(ax, ay);
    const bx = next.x - p.x, by = next.y - p.y, lb = Math.hypot(bx, by);
    const u = [ax / la, ay / la];
    const v = [bx / lb, by / lb];
    const cross = u[0] * v[1] - u[1] * v[0];
    const turn = Math.atan2(Math.abs(cross), u[0] * v[0] + u[1] * v[1]);
    return { la, lb, u, v, cross, turn };
  });
  const tSoft = pts.map((p, i) => (p.soft ? soft * Math.tan(geo[i].turn / 2) : 0));
  const items = pts.map((p, i) => {
    if (plain(p)) return { pt: [p.x, p.y] };
    const { la, lb, u, v, cross, turn } = geo[i];
    let t, rad;
    if (p.leaf) {
      t = Math.min(la - tSoft[(i - 1 + n) % n], lb - tSoft[(i + 1) % n]);
      rad = t / Math.tan(turn / 2);
    } else if (p.soft) {
      t = tSoft[i];
      rad = soft;
    } else if (p.t) {
      t = p.t;
      rad = t / Math.tan(turn / 2);
    } else {
      rad = p.r;
      t = rad * Math.tan(turn / 2);
    }
    return {
      a: [p.x - u[0] * t, p.y - u[1] * t],
      b: [p.x + v[0] * t, p.y + v[1] * t],
      rad,
      sweep: cross > 0 ? 1 : 0,
    };
  });
  const cmds = [];
  const first = items[0].pt ?? items[0].a;
  cmds.push(['M', ...first]);
  let cur = first;
  items.forEach((it, i) => {
    if (it.pt) {
      if (i > 0 && !near(cur, it.pt)) cmds.push(['L', ...it.pt]);
      cur = it.pt;
    } else {
      if (i > 0 && !near(cur, it.a)) cmds.push(['L', ...it.a]);
      cmds.push(['A', it.rad, it.rad, 0, 0, it.sweep, ...it.b]);
      cur = it.b;
    }
  });
  cmds.push(['Z']);
  return cmds;
}

/**
 * endCorner 计算笔画端角的顶点标记.
 * 'flat' 为藏入他笔的平切端, 两角保持直角; 否则一角叶形, 另一角柔化.
 * @param {string} kind - 端部类型, '\\', '/' 或 'flat'.
 * @param {string} leafWhen - 该角在何种端部类型下做叶形.
 * @returns {{leaf?: boolean, soft?: boolean}} 顶点标记.
 */
function endCorner(kind, leafWhen) {
  if (kind === 'flat') return {};
  return kind === leafWhen ? { leaf: true } : { soft: true };
}

/**
 * vbar 生成竖向笔画.
 * @param {number} x0 - 左边界.
 * @param {number} y0 - 上边界.
 * @param {number} x1 - 右边界.
 * @param {number} y1 - 下边界.
 * @param {string} [top='\\'] - 上端类型, '\\' 为右上叶形 (主笔势), '/' 为左上叶形 (撇势), 'flat' 为平切.
 * @param {string} [bot='\\'] - 下端类型, '\\' 为左下叶形, '/' 为右下叶形, 'flat' 为平切.
 * @returns {Array<Array>} 路径命令.
 */
function vbar(x0, y0, x1, y1, top = '\\', bot = '\\') {
  return poly([
    { x: x0, y: y0, ...endCorner(top, '/') },
    { x: x1, y: y0, ...endCorner(top, '\\') },
    { x: x1, y: y1, ...endCorner(bot, '/') },
    { x: x0, y: y1, ...endCorner(bot, '\\') },
  ]);
}

/**
 * hbar 生成横向笔画.
 * @param {number} x0 - 左边界.
 * @param {number} y0 - 上边界.
 * @param {number} x1 - 右边界.
 * @param {number} y1 - 下边界.
 * @param {string} [left='\\'] - 左端类型, '\\' 为左下叶形, '/' 为左上叶形, 'flat' 为平切.
 * @param {string} [right='\\'] - 右端类型, '\\' 为右上叶形, '/' 为右下叶形, 'flat' 为平切.
 * @returns {Array<Array>} 路径命令.
 */
function hbar(x0, y0, x1, y1, left = '\\', right = '\\') {
  return poly([
    { x: x0, y: y0, ...endCorner(left, '/') },
    { x: x1, y: y0, ...endCorner(right, '\\') },
    { x: x1, y: y1, ...endCorner(right, '/') },
    { x: x0, y: y1, ...endCorner(left, '\\') },
  ]);
}

/**
 * band 生成斜向笔画 (带状) 的顶点.
 * 端部默认垂直于笔画方向; cap.cutY 或 cap.cutX 指定水平或竖直切断,
 * cap.sharp 指定柔化尖角的一侧 (minX, maxX, minY, maxY), 另一侧做叶形; 未指定 sharp 的端部按藏笔处理.
 * @param {number[]} P0 - 起笔中心点.
 * @param {number[]} P1 - 收笔中心点.
 * @param {number} w - 笔画宽.
 * @param {{cutX?: number, cutY?: number, sharp?: string}} [cap0={}] - 起笔端设置.
 * @param {{cutX?: number, cutY?: number, sharp?: string}} [cap1={}] - 收笔端设置.
 * @returns {Array<Object>} 供 poly 使用的顶点列表.
 */
function band(P0, P1, w, cap0 = {}, cap1 = {}) {
  const dx = P1[0] - P0[0], dy = P1[1] - P0[1], L = Math.hypot(dx, dy);
  const u = [dx / L, dy / L];
  const nL = [u[1], -u[0]];
  const h = w / 2;
  const off = (P, s) => [P[0] + nL[0] * h * s, P[1] + nL[1] * h * s];
  const cut = (A, cap) => {
    if (cap.cutY != null) {
      const s = (cap.cutY - A[1]) / u[1];
      return [A[0] + u[0] * s, A[1] + u[1] * s];
    }
    if (cap.cutX != null) {
      const s = (cap.cutX - A[0]) / u[0];
      return [A[0] + u[0] * s, A[1] + u[1] * s];
    }
    return A;
  };
  const a0 = cut(off(P0, 1), cap0), b0 = cut(off(P0, -1), cap0);
  const a1 = cut(off(P1, 1), cap1), b1 = cut(off(P1, -1), cap1);
  const pick = (A, B, cap) => {
    if (!cap.sharp) return [{}, {}];
    const key = { minX: (p) => p[0], maxX: (p) => -p[0], minY: (p) => p[1], maxY: (p) => -p[1] }[cap.sharp];
    return key(A) < key(B) ? [{ soft: true }, { leaf: true }] : [{ leaf: true }, { soft: true }];
  };
  const [fa0, fb0] = pick(a0, b0, cap0);
  const [fa1, fb1] = pick(a1, b1, cap1);
  return [
    { x: a0[0], y: a0[1], ...fa0 },
    { x: a1[0], y: a1[1], ...fa1 },
    { x: b1[0], y: b1[1], ...fb1 },
    { x: b0[0], y: b0[1], ...fb0 },
  ];
}

/**
 * lineX 求过点 P, 方向 u 的直线在 x 处的交点.
 * @param {number[]} P - 直线上一点.
 * @param {number[]} u - 方向向量.
 * @param {number} x - 竖直线的 x.
 * @returns {number[]} 交点 [x, y].
 */
function lineX(P, u, x) {
  const s = (x - P[0]) / u[0];
  return [x, P[1] + u[1] * s];
}

/**
 * lineY 求过点 P, 方向 u 的直线在 y 处的交点.
 * @param {number[]} P - 直线上一点.
 * @param {number[]} u - 方向向量.
 * @param {number} y - 水平线的 y.
 * @returns {number[]} 交点 [x, y].
 */
function lineY(P, u, y) {
  const s = (y - P[1]) / u[1];
  return [P[0] + u[0] * s, y];
}

/**
 * unit 求单位向量.
 * @param {number} dx - x 分量.
 * @param {number} dy - y 分量.
 * @returns {number[]} 单位向量.
 */
function unit(dx, dy) {
  const L = Math.hypot(dx, dy);
  return [dx / L, dy / L];
}

// ---------------- 中文字形 (局部坐标 x 0..345, y 0..350) ----------------

/**
 * glyphJiao 生成 焦 的笔画.
 * 顶点与 灬 四点同形同大, 并与中竖同 x 对齐.
 * @param {{SV: number, SH: number}} [P=W_JIAO] - 笔画宽.
 * @returns {Array<Array>} 笔画列表, 每项为 [笔画 id, 路径命令, 可选注释].
 */
function glyphJiao(P = W_JIAO) {
  const { SV, SH } = P;
  const g = [];
  // 亻: 撇 + 竖
  g.push([
    'danrenpang-pie',
    poly(band([82, -10], [14, 112], SV, { cutY: 0, sharp: 'minX' }, { cutY: 110, sharp: 'minX' })),
  ]);
  const DOT = 52;
  const rows = [70, 125, 180, 235];
  const last = rows[3] + SH;
  g.push(['danrenpang-shu', vbar(28, 60, 28 + SV, last + 6, 'flat', '\\')]);
  // 隹: 顶点, 四横一竖
  const vx = 188;
  g.push(['dian', vbar(vx, 0, vx + SV, DOT, '\\', '\\')]);
  const xs = 90;
  const rights = [322, 302, 302, 345];
  rows.forEach((y, i) => g.push([`heng${i + 1}`, hbar(xs, y, rights[i], y + SH, '\\', '\\')]));
  g.push(['shu', vbar(vx, rows[0], vx + SV, last, 'flat', 'flat')]);
  // 灬: 首点左向, 余三点右向
  const dots = [8, 106, 204, 302];
  dots.forEach((x, i) => {
    const pen = i === 0 ? '/' : '\\';
    g.push([`sidian${i + 1}`, vbar(x, CN_H - DOT, x + SV, CN_H, pen, pen)]);
  });
  return g;
}

/**
 * yue 生成 月 部件 (外框 + 两内横), 两腿下伸到字身底.
 * @param {number} x0 - 左边界.
 * @param {number} x1 - 右边界.
 * @param {number} y0 - 顶边.
 * @param {number[]} inner - 两内横的上沿 y.
 * @param {{SV: number, SH: number}} P - 笔画宽.
 * @returns {Array<Array>} 笔画列表.
 */
function yue(x0, x1, y0, inner, P) {
  const { SV, SH } = P;
  const out = [];
  out.push([
    'yue',
    poly([
      { x: x0, y: y0, soft: true },
      { x: x1, y: y0, r: SV },
      { x: x1, y: CN_H, soft: true },
      { x: x1 - SV, y: CN_H, leaf: true },
      { x: x1 - SV, y: y0 + SH },
      { x: x0 + SV, y: y0 + SH },
      { x: x0 + SV, y: CN_H, leaf: true },
      { x: x0, y: CN_H, soft: true },
    ]),
  ]);
  inner.forEach((y, i) => out.push([`heng${i + 1}`, vbar(x0 + SV - 8, y, x1 - SV + 8, y + SH - 1, 'flat', 'flat')]));
  return out;
}

/**
 * glyphPeng 生成 棚 的笔画.
 * @param {{SV: number, SH: number}} [P=W_PENG] - 笔画宽.
 * @returns {Array<Array>} 笔画列表.
 */
function glyphPeng(P = W_PENG) {
  const { SV, SH } = P;
  const g = [];
  // 木
  const mx = 36;
  g.push(['mu-shu', vbar(mx, 0, mx + SV, CN_H, '\\', '\\')]);
  g.push(['mu-heng', hbar(0, 76, 100, 76 + SH, '\\', '\\')]);
  // 撇与点的起笔端藏在横竖交叉区内, 避免交接处出现细小缺口
  g.push(['mu-pie', poly(band([mx + SV / 2, 80], [6, 236], SV - 2, {}, { cutY: 230, sharp: 'minX' }))]);
  g.push(['mu-dian', poly(band([mx + SV / 2, 84], [92, 166], SV - 4, {}, { cutY: 160, sharp: 'maxX' }))]);
  // 月 月
  const inner = [110, 194];
  for (const [id, d] of yue(122, 220, 22, inner, P)) g.push([`yue1-${id}`, d]);
  for (const [id, d] of yue(244, 345, 22, inner, P)) g.push([`yue2-${id}`, d]);
  return g;
}

/**
 * glyphZi 生成 子 的笔画, 竖钩取字母 J 的碗形收尾等比缩小.
 * @param {{SV: number, SH: number}} [P=W_ZI] - 笔画宽.
 * @returns {Array<Array>} 笔画列表.
 */
function glyphZi(P = W_ZI) {
  const { SV, SH } = P;
  const g = [];
  const y0 = 22; // 顶横上沿
  const xl = 62;
  const B = [272, y0]; // 横撇外转角
  const vx0 = 173 - SV / 2, vx1 = vx0 + SV; // 弯钩竖
  const u = unit(-84, 120); // 撇段方向 (外沿)
  const nUL = [-u[1], u[0]]; // 指向左上 (内沿方向)
  // 外沿过 B, 内沿平移 SV
  const inP = [B[0] + nUL[0] * SV, B[1] + nUL[1] * SV];
  const C = lineX(B, u, vx1);
  const F = lineY(inP, u, y0 + SH);
  const E = lineX(inP, u, vx0);
  g.push([
    'hengpie',
    poly([
      { x: xl, y: y0, soft: true },
      { x: B[0], y: B[1], r: 22 },
      { x: C[0], y: C[1] },
      { x: vx1, y: C[1] + 40 },
      { x: vx0, y: C[1] + 40 },
      { x: E[0], y: E[1], r: 40 },
      { x: F[0], y: F[1] },
      { x: xl, y: y0 + SH, leaf: true },
    ]),
  ]);
  // 弯钩: 按 J 的碗与尾 (半径 130/50/80) 以 SV/80 比例缩放
  const k = SV / 80;
  const cx = vx0 - 50 * k; // 碗心 x
  const cy = CN_H - 130 * k; // 碗心 y
  const tailY = cy + 40 * k;
  // 尾尖柔化: 半径 SOFT 的小圆同时切于尾部平顶线与尾弧 (圆心 cx, cy + 50k, 半径 80k)
  const R = 80 * k, s = SOFT;
  const fx = cx - Math.sqrt((R - s) ** 2 - (s - 10 * k) ** 2);
  const tc = [cx, cy + 50 * k];
  const q = [tc[0] + ((fx - tc[0]) * R) / (R - s), tc[1] + ((tailY + s - tc[1]) * R) / (R - s)];
  g.push([
    'wangou',
    [
      ['M', vx0, C[1]],
      ['L', vx1, C[1]],
      ['L', vx1, cy],
      ['A', 130 * k, 130 * k, 0, 0, 1, cx, CN_H],
      ['A', R, R, 0, 0, 1, q[0], q[1]],
      ['A', s, s, 0, 0, 1, fx, tailY],
      ['L', cx - 30 * k, tailY],
      ['A', 50 * k, 50 * k, 0, 0, 0, vx0, cy],
      ['Z'],
    ],
    '竖钩取字母 J 的碗形收尾等比缩小',
  ]);
  // 横
  g.push(['heng', hbar(0, 176, 345, 176 + SH, '\\', '\\')]);
  return g;
}

// ---------------- 英文字母 (字母坐标: 顶 105, 基线 440) ----------------

/** J_PATH_CMDS 字母 J 的原始路径, 与 logo.svg 中的 J 同形, 不做修改. */
const J_PATH_CMDS = [
  ['M', 220, 355],
  ['L', 170.627461, 355],
  ['A', 80, 80, 1, 0, 0, 250, 445],
  ['A', 130, 130, 1, 0, 0, 380, 315],
  ['L', 380, 105],
  ['L', 250, 105],
  ['L', 250, 185],
  ['L', 300, 185],
  ['L', 300, 315],
  ['A', 50, 50, 1, 0, 1, 220, 355],
  ['Z'],
];

/**
 * ellipseCmds 生成完整椭圆的路径命令.
 * @param {number} cx - 圆心 x.
 * @param {number} cy - 圆心 y.
 * @param {number} rx - x 半径.
 * @param {number} ry - y 半径.
 * @param {boolean} [cw=true] - 是否顺时针绘制.
 * @returns {Array<Array>} 路径命令.
 */
function ellipseCmds(cx, cy, rx, ry, cw = true) {
  const s = cw ? 1 : 0;
  return [
    ['M', cx - rx, cy],
    ['A', rx, ry, 0, 1, s, cx + rx, cy],
    ['A', rx, ry, 0, 1, s, cx - rx, cy],
    ['Z'],
  ];
}

/**
 * polyCmds 生成直角多边形的路径命令.
 * @param {number[][]} pts - 顶点列表.
 * @returns {Array<Array>} 路径命令.
 */
function polyCmds(pts) {
  const c = [['M', ...pts[0]]];
  for (const p of pts.slice(1)) c.push(['L', ...p]);
  c.push(['Z']);
  return c;
}

/**
 * letterA 生成字母 A, 顶部两角带半径 A_TOP_R 的圆弧.
 * @returns {{w: number, cmds: Array<Array>, evenodd: boolean}} 字宽, 路径命令与填充规则标记.
 */
function letterA() {
  const W = 316, apex = 60, legH = 78; // legH: 腿水平厚
  const s = (W - apex) / 2 / 335; // dx/dy
  const xl = (y) => s * (440 - y); // 左外沿
  const xli = (y) => legH + s * (440 - y); // 左内沿
  const xri = (y) => W - legH - s * (440 - y);
  const barT = 318, barB = 380;
  const yApexIn = 440 - (W - 2 * legH) / (2 * s);
  const outer = poly([
    { x: 0, y: 440 },
    { x: xl(105), y: 105, r: A_TOP_R },
    { x: W - xl(105), y: 105, r: A_TOP_R },
    { x: W, y: 440 },
    { x: W - legH, y: 440 },
    { x: xri(barB), y: barB },
    { x: xli(barB), y: barB },
    { x: legH, y: 440 },
  ]);
  const hole = [
    [(xli(yApexIn) + xri(yApexIn)) / 2, yApexIn],
    [xli(barT), barT],
    [xri(barT), barT],
  ];
  return { w: W, cmds: [...outer, ...polyCmds(hole)], evenodd: true };
}

/**
 * letterO 生成字母 O (椭圆环).
 * @returns {{w: number, cmds: Array<Array>, evenodd: boolean}} 字宽, 路径命令与填充规则标记.
 */
function letterO() {
  const W = 336, cy = 272.5, rx = W / 2, ry = 173;
  return {
    w: W,
    cmds: [...ellipseCmds(rx, cy, rx, ry), ...ellipseCmds(rx, cy, rx - 82, ry - 74, false)],
    evenodd: true,
  };
}

/**
 * letterP 生成字母 P.
 * @returns {{w: number, cmds: Array<Array>, evenodd: boolean}} 字宽, 路径命令与填充规则标记.
 */
function letterP() {
  const R = 107.5, bar = 70, xc = 130;
  const yb = 105 + 2 * R;
  const r = R - bar;
  return {
    w: xc + R,
    cmds: [
      ['M', 0, 105],
      ['L', xc, 105],
      ['A', R, R, 0, 0, 1, xc, yb],
      ['L', 80, yb],
      ['L', 80, 440],
      ['L', 0, 440],
      ['Z'],
      ['M', 80, 105 + bar],
      ['L', 80, yb - bar],
      ['L', xc, yb - bar],
      ['A', r, r, 0, 0, 0, xc, 105 + bar],
      ['Z'],
    ],
    evenodd: true,
  };
}

/**
 * letterE 生成字母 E.
 * @returns {{w: number, cmds: Array<Array>}} 字宽与路径命令.
 */
function letterE() {
  return {
    w: 214,
    cmds: polyCmds([
      [0, 105], [210, 105], [210, 175], [80, 175], [80, 238], [192, 238], [192, 306], [80, 306],
      [80, 370], [214, 370], [214, 440], [0, 440],
    ]),
  };
}

/**
 * letterN 生成字母 N.
 * @returns {{w: number, cmds: Array<Array>}} 字宽与路径命令.
 */
function letterN() {
  const W = 272, d = 88, sx = (W - d) / 335;
  const y1 = 105 + (W - 80 - d) / sx;
  const y2 = 105 + 80 / sx;
  return {
    w: W,
    cmds: polyCmds([
      [0, 105], [d, 105], [W - 80, y1], [W - 80, 105], [W, 105], [W, 440], [W - d, 440], [80, y2], [80, 440], [0, 440],
    ]),
  };
}

/**
 * rayEllipse 求从椭圆中心沿指定角度发出的射线与椭圆的交点.
 * @param {number} cx - 圆心 x.
 * @param {number} cy - 圆心 y.
 * @param {number} rx - x 半径.
 * @param {number} ry - y 半径.
 * @param {number} deg - 角度, 屏幕坐标下负值朝上.
 * @returns {number[]} 交点 [x, y].
 */
function rayEllipse(cx, cy, rx, ry, deg) {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const r = 1 / Math.sqrt((c / rx) ** 2 + (s / ry) ** 2);
  return [cx + r * c, cy + r * s];
}

/**
 * ellipseXAtY 求椭圆右半边在指定 y 处的 x.
 * @param {number} cx - 圆心 x.
 * @param {number} cy - 圆心 y.
 * @param {number} rx - x 半径.
 * @param {number} ry - y 半径.
 * @param {number} y - 水平线 y.
 * @returns {number} 交点 x.
 */
function ellipseXAtY(cx, cy, rx, ry, y) {
  return cx + rx * Math.sqrt(1 - ((y - cy) / ry) ** 2);
}

/**
 * letterG 生成字母 G, 参考 Google G: 横杠以圆心线为中线, 厚度同环的上下厚度, 左端止于圆心, 开口端沿 -45° 径向切断.
 * @returns {{w: number, cmds: Array<Array>}} 字宽与路径命令.
 */
function letterG() {
  const W = 336, cx = W / 2, cy = 272.5, rx = W / 2, ry = 173, irx = rx - 82, iry = ry - 74;
  const bar = ry - iry, barT = cy - bar / 2, barB = cy + bar / 2, barL = cx, ang = -45;
  const To = rayEllipse(cx, cy, rx, ry, ang);
  const Ti = rayEllipse(cx, cy, irx, iry, ang);
  const Rb = [ellipseXAtY(cx, cy, rx, ry, barT), barT];
  const Ib = [ellipseXAtY(cx, cy, irx, iry, barB), barB];
  return {
    w: W,
    cmds: [
      ['M', ...To],
      ['A', rx, ry, 0, 1, 0, ...Rb],
      ['L', barL, barT],
      ['L', barL, barB],
      ['L', ...Ib],
      ['A', irx, iry, 0, 1, 1, ...Ti],
      ['Z'],
    ],
  };
}

/**
 * letterZ 生成字母 Z.
 * @returns {{w: number, cmds: Array<Array>}} 字宽与路径命令.
 */
function letterZ() {
  const top = 234, bot = 240, dh = 94;
  return {
    w: bot,
    cmds: polyCmds([
      [0, 105], [top, 105], [top, 175], [dh, 370], [bot, 370], [bot, 440], [0, 440], [0, 370], [top - dh, 175], [0, 175],
    ]),
  };
}

/**
 * letterI 生成字母 I.
 * @returns {{w: number, cmds: Array<Array>}} 字宽与路径命令.
 */
function letterI() {
  return { w: 80, cmds: polyCmds([[0, 105], [80, 105], [80, 440], [0, 440]]) };
}

/**
 * letterJ 返回字母 J 的原始路径, inkLeft 为尾尖左缘, 用于左对齐.
 * @returns {{w: number, inkLeft: number, cmds: Array<Array>}} 字宽, 墨迹左缘与路径命令.
 */
function letterJ() {
  return { w: 380 - 170.627461, inkLeft: 170.627461, cmds: J_PATH_CMDS };
}

/** LETTERS 字母序列: [id, 字形函数, 左侧形状类型, 右侧形状类型], 形状类型用于查 KERN. */
const LETTERS = [
  ['jiao-j', letterJ, 'jl', 'st'],
  ['jiao-i', letterI, 'st', 'st'],
  ['jiao-a', letterA, 'dg', 'dg'],
  ['jiao-o', letterO, 'rd', 'rd'],
  ['peng-p', letterP, 'st', 'pb'],
  ['peng-e', letterE, 'st', 'op'],
  ['peng-n', letterN, 'st', 'st'],
  ['peng-g', letterG, 'rd', 'gg'],
  ['zi-z', letterZ, 'zz', 'zz'],
  ['zi-i', letterI, 'st', 'st'],
];

/** KERN 间距修正 (字母单位), 键为 左字母右侧类型-右字母左侧类型. */
const KERN = {
  'st-st': 0,
  'st-dg': -34,
  'dg-rd': -40,
  'rd-st': -14,
  'rd-op': -14,
  'pb-st': -30,
  'op-st': -24,
  'st-rd': -14,
  'gg-zz': -26,
  'zz-st': -16,
};

/**
 * layoutLetters 按总宽两端对齐排布字母, 字距 = 均分余量 + KERN 修正.
 * @param {number} totalW - 字母行总宽 (画布单位).
 * @param {number} s - 字母缩放.
 * @returns {{glyphs: Array<Object>, tracking: number}} 带 x 位置的字母列表与均分字距 (字母单位).
 */
function layoutLetters(totalW, s) {
  const glyphs = LETTERS.map(([id, fn, l, r]) => ({ id, ...fn(), l, r }));
  const sumW = glyphs.reduce((a, g) => a + g.w, 0);
  const kerns = [];
  for (let i = 0; i < glyphs.length - 1; i++) {
    kerns.push(KERN[`${glyphs[i].r}-${glyphs[i + 1].l}`] ?? 0);
  }
  const sumK = kerns.reduce((a, b) => a + b, 0);
  const t = (totalW / s - sumW - sumK) / (glyphs.length - 1);
  let cur = 0;
  glyphs.forEach((g, i) => {
    g.x = cur;
    cur += g.w + (i < kerns.length ? t + kerns[i] : 0);
  });
  return { glyphs, tracking: t };
}

// ---------------- 排版与输出 ----------------

/**
 * cnRow 生成中文行三字及其位置, 三字字距相等.
 * @returns {Array<{id: string, name: string, x: number, y: number, parts: Array<Array>}>} 字列表.
 */
function cnRow() {
  const { cnLeft, cnRight, cnTop, cnW } = LAYOUT;
  const gap = (cnRight - cnLeft - cnW.reduce((a, b) => a + b, 0)) / 2;
  const xs = [cnLeft, cnLeft + cnW[0] + gap, cnLeft + cnW[0] + cnW[1] + 2 * gap];
  return [
    { id: 'jiaopengzi-text-jiao', name: '焦', x: xs[0], y: cnTop, parts: glyphJiao() },
    { id: 'jiaopengzi-text-peng', name: '棚', x: xs[1], y: cnTop, parts: glyphPeng() },
    { id: 'jiaopengzi-text-zi', name: '子', x: xs[2], y: cnTop, parts: glyphZi() },
  ];
}

/**
 * latinRow 生成字母行及其位置, 左右与中文行对齐.
 * @returns {{capTop: number, tracking: number, glyphs: Array<Object>}} 大写顶线, 均分字距与带平移量的字母列表.
 */
function latinRow() {
  const { cnLeft, cnRight, cnTop, latinS, rowGap } = LAYOUT;
  const capTop = cnTop + CN_H + rowGap;
  const { glyphs, tracking } = layoutLetters(cnRight - cnLeft, latinS);
  return {
    capTop,
    tracking,
    glyphs: glyphs.map((g) => ({
      ...g,
      tx: cnLeft + (g.x - (g.inkLeft ?? 0)) * latinS,
      ty: capTop - LT.T * latinS,
    })),
  };
}

/**
 * pathEl 生成 path 元素文本.
 * @param {string} id - 元素 id, 为空时不输出 id.
 * @param {Array<Array>} cmds - 路径命令.
 * @param {string} indent - 元素缩进.
 * @param {string} [extra=''] - 额外属性文本.
 * @returns {string} path 元素文本.
 */
function pathEl(id, cmds, indent, extra = '') {
  const d = cmdsToD(cmds, indent + '    ');
  return `${indent}<path${id ? ` id="${id}"` : ''}${extra} d="\n${indent}    ${d}" />`;
}

/**
 * renderCn 生成中文行的 SVG 文本.
 * @param {Array<Object>} rows - cnRow 的结果.
 * @param {string} indent - 缩进.
 * @returns {string} SVG 文本.
 */
function renderCn(rows, indent) {
  return rows
    .map(
      (ch) =>
        `${indent}<!-- ${ch.name} -->\n${indent}<g id="${ch.id}" transform="translate(${fmt(ch.x)} ${fmt(ch.y)})">\n` +
        ch.parts
          .map(([pid, cmds, note]) =>
            (note ? `${indent}    <!-- ${note} -->\n` : '') + pathEl(`${ch.id}-${pid}`, cmds, indent + '    '),
          )
          .join('\n') +
        `\n${indent}</g>`,
    )
    .join('\n');
}

/**
 * renderLatin 生成字母行的 SVG 文本.
 * @param {Object} lr - latinRow 的结果.
 * @param {string} indent - 缩进.
 * @returns {string} SVG 文本.
 */
function renderLatin(lr, indent) {
  const s = LAYOUT.latinS;
  return lr.glyphs
    .map(
      (g) =>
        `${indent}<g id="${g.id}" transform="translate(${fmt(g.tx)} ${fmt(g.ty)}) scale(${s})">\n` +
        pathEl('', g.cmds, indent + '    ', g.evenodd ? ' fill-rule="evenodd"' : '') +
        `\n${indent}</g>`,
    )
    .join('\n');
}

/**
 * fileHeader 生成 SVG 文件头注释.
 * @param {string} name - 文件名.
 * @param {string} desc - 文件描述.
 * @returns {string} 注释文本.
 */
function fileHeader(name, desc) {
  return `<!--
 * FilePath    : logo\\${name}
 * Author      : jiaopengzi
 * Blog        : https://jiaopengzi.com
 * Copyright   : Copyright (c) 2026 by jiaopengzi, All Rights Reserved.
 * Description : ${desc} 由 tools/gen-logo.mjs 生成.
-->
`;
}

/**
 * svgOpen 生成 svg 起始标签与无障碍标题.
 * @param {number} width - 画布宽.
 * @param {number} height - 画布高.
 * @param {string} name - 文件名, 用于生成唯一的标题 id.
 * @param {string} title - 读屏软件读出的名称.
 * @returns {string} 起始标签与 title 元素文本.
 */
function svgOpen(width, height, name, title) {
  const titleId = `jiaopengzi-${name.replace(/\.svg$/, '')}-title`;
  return `<svg id="jiaopengzi-logo-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1"
    xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    role="img" aria-labelledby="${titleId}">
    <title id="${titleId}">${title}</title>`;
}

/**
 * iconGroup 生成横版左侧的 J 图标, 与 logo.svg 同形同色.
 * @returns {string} 图标分组文本.
 */
function iconGroup() {
  return `    <!-- logo-J -->
    <g id="jiaopengzi-logo" transform="translate(230 345)">
        <rect id="jiaopengzi-logo-svg-background" x="-230" y="-345" width="550" height="550" rx="210" ry="210"
            fill="${NAVY}" />
        <path id="jiaopengzi-logo-svg-j" d="
${ICON_J_D.map((c) => `    ${c}`).join('\n')}" fill="${GOLD}" stroke="${GOLD}"></path>
    </g>`;
}

/**
 * buildLogo 生成方形图标 logo.svg: 藏青圆角方块加金色 J.
 * 输出与原稿逐字节一致 (含原注释, 两处行尾空格与末尾无换行), 改动图标请改 ICON_J_D 与颜色常量.
 * @returns {{name: string, svg: string}} 文件名与 SVG 文本.
 */
function buildLogo() {
  const d = ICON_J_D.map((c) => `    ${c}`);
  d[0] += ' ';
  d[d.length - 1] += `" fill="${GOLD}" stroke="${GOLD}"></path>`;
  const lines = [
    '<!-- ',
    '59.372539 = 63 的算术平方根减二乘以10,具体参看原始设计图。',
    'rx,ry=210,210 正方形边长 550 乘以 黄金比例 0.618 等于 340; 550-340=210',
    '-->',
    '<svg id="jiaopengzi-logo-svg" width="108" height="108" viewBox="-230 -345 550 550" version="1.1"',
    '    xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
    '    <rect id="jiaopengzi-logo-svg-background" x="-230" y="-345" width="550" height="550" rx="210" ry="210"',
    `        fill="${NAVY}" stroke="${NAVY}" />`,
    '    <path id="jiaopengzi-logo-svg-j" d="',
    ...d,
    '</svg>',
  ];
  return { name: 'logo.svg', svg: lines.join('\n') };
}

/**
 * buildLogoWithText 生成横版 logo: J 图标 + 焦棚子 + JIAOPENGZI 两行.
 * @param {('light'|'dark')} theme - light 为藏青字, 用于浅色背景; dark 为金色字, 用于深色背景.
 * @returns {{name: string, svg: string}} 文件名与 SVG 文本.
 */
function buildLogoWithText(theme) {
  const dark = theme === 'dark';
  const name = dark ? 'logo-with-text-dark.svg' : 'logo-with-text.svg';
  const desc = dark
    ? '深色背景用横版 logo, 字标为金色, J 图标不变.'
    : '横版 logo, 左侧为 J 图标, 右侧为 焦棚子 与 JIAOPENGZI 两行字标.';
  const svg = `${fileHeader(name, desc)}${svgOpen(1790, 550, name, '焦棚子 JIAOPENGZI')}

${iconGroup()}
    <g fill="${dark ? GOLD : NAVY}">
${renderCn(cnRow(), '        ')}

        <!-- 字母: 与中文行左右对齐, 字母 J 沿用原路径 -->
${renderLatin(latinRow(), '        ')}
    </g>
</svg>
`;
  return { name, svg };
}

/**
 * buildCompact 生成紧凑横版 logo: J 图标 + 焦棚子 单行, 用于高度不超过 40px 的场景.
 * @param {('light'|'dark')} theme - light 为藏青字, 用于浅色背景; dark 为金色字, 用于深色背景.
 * @returns {{name: string, svg: string}} 文件名与 SVG 文本.
 */
function buildCompact(theme) {
  const dark = theme === 'dark';
  const name = dark ? 'logo-compact-dark.svg' : 'logo-compact.svg';
  const desc = dark
    ? '深色背景用紧凑横版 logo, 字标为金色, J 图标不变.'
    : '紧凑横版 logo, J 图标加 焦棚子 单行, 用于高度不超过 40px 的场景.';
  const { cnLeft, cnTop } = LAYOUT;
  const { scale, left, width } = COMPACT;
  const top = (550 - CN_H * scale) / 2;
  const svg = `${fileHeader(name, desc)}${svgOpen(width, 550, name, '焦棚子')}

${iconGroup()}
    <g fill="${dark ? GOLD : NAVY}">
        <!-- 中文行放大 ${scale} 倍, 与图标垂直居中 -->
        <g transform="translate(${left} ${fmt(top)}) scale(${scale}) translate(${-cnLeft} ${-cnTop})">
${renderCn(cnRow(), '            ')}
        </g>
    </g>
</svg>
`;
  return { name, svg };
}

/**
 * buildAvatar 生成方形头像: 金色底, 焦棚子 与 JIAOPENGZI 两行中线分别落在黄金分割点.
 * @returns {{name: string, svg: string}} 文件名与 SVG 文本.
 */
function buildAvatar() {
  const name = 'avatar.svg';
  const lr = latinRow();
  const { k, cnCenter, latinCenter } = AVATAR;
  const { cnLeft, cnRight, cnTop } = LAYOUT;
  const x = (1080 - (cnRight - cnLeft) * k) / 2;
  const yCn = cnCenter - (CN_H * k) / 2;
  const yLa = latinCenter - (335 * LAYOUT.latinS * k) / 2;
  const svg = `${fileHeader(name, '方形头像, 金色底上居中放置 焦棚子 与 JIAOPENGZI 两行字标.')}${svgOpen(1080, 1080, name, '焦棚子 JIAOPENGZI')}
    <rect id="jiaopengzi-logo-svg-background" x="0" y="0" width="1080" height="1080" fill="${GOLD}" />

    <g fill="${NAVY}">
        <!-- 手动调高低改这里: translate(${fmt(x)} Y). 当前 Y=${fmt(yCn)}, 焦棚子 中线落在 ${cnCenter} (1080 × 0.382 黄金分割点). -->
        <g transform="translate(${fmt(x)} ${fmt(yCn)}) scale(${k}) translate(${-cnLeft} ${-cnTop})">
${renderCn(cnRow(), '            ')}
        </g>

        <!-- 手动调高低改这里: translate(${fmt(x)} Y). 当前 Y=${fmt(yLa)}, JIAOPENGZI 中线落在 ${latinCenter} (1080 × 0.618 黄金分割点). -->
        <g transform="translate(${fmt(x)} ${fmt(yLa)}) scale(${k}) translate(${-cnLeft} ${-lr.capTop})">
${renderLatin(lr, '            ')}
        </g>
    </g>
</svg>
`;
  return { name, svg };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [
  buildLogo(),
  buildLogoWithText('light'),
  buildLogoWithText('dark'),
  buildCompact('light'),
  buildCompact('dark'),
  buildAvatar(),
];
for (const { name, svg } of outputs) {
  fs.writeFileSync(path.join(ROOT, name), svg.replace(/\n/g, EOL));
  console.log('generated', name);
}
