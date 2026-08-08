import type { RigSpec } from "./Rig";

/** Keys of `RigSpec` the tuner exposes as sliders. */
export type NumericRigKey =
  | "scale"
  | "headRadius"
  | "bodyHeight"
  | "bodyTopRadius"
  | "bodyBottomRadius"
  | "hemHeight"
  | "hemRadius"
  | "bodySegments"
  | "headSegments"
  | "headRings"
  | "capDepth"
  | "backDepth"
  | "faceGap"
  | "tailLength"
  | "tailThickness"
  | "tailAnchorY"
  | "tailTilt"
  | "handRadius";

/** Keys of `RigSpec` the tuner exposes as colour swatches. */
export type ColorRigKey =
  | "skin"
  | "skinDark"
  | "eye"
  | "hair"
  | "hairShade"
  | "hairTie"
  | "body"
  | "hem"
  | "accent"
  | "boots"
  | "gogglesColor";

export interface NumberControl {
  key: NumericRigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface ControlGroup {
  title: string;
  controls: NumberControl[];
}

/**
 * Slider definitions for the in-game rig tuner.
 *
 * Ranges are intentionally tight around what actually looks right -- a slider
 * that can only produce usable values is far quicker to work with than one that
 * spends most of its travel on nonsense.
 */
export const RIG_CONTROL_GROUPS: ControlGroup[] = [
  {
    title: "比例",
    controls: [
      { key: "scale", label: "整体缩放", min: 0.7, max: 1.4, step: 0.01 },
      { key: "headRadius", label: "头半径", min: 0.14, max: 0.34, step: 0.005 },
      { key: "bodyHeight", label: "身高", min: 0.3, max: 1.0, step: 0.01 },
      { key: "bodyTopRadius", label: "肩宽", min: 0.02, max: 0.18, step: 0.005 },
      { key: "bodyBottomRadius", label: "下摆宽", min: 0.12, max: 0.4, step: 0.005 },
      { key: "hemRadius", label: "裙边宽", min: 0.12, max: 0.42, step: 0.005 },
      { key: "hemHeight", label: "裙边高", min: 0.02, max: 0.14, step: 0.005 },
    ],
  },
  {
    title: "面数",
    controls: [
      { key: "bodySegments", label: "身体边数", min: 4, max: 14, step: 1 },
      { key: "headSegments", label: "头经线", min: 5, max: 16, step: 1 },
      { key: "headRings", label: "头纬线", min: 3, max: 10, step: 1 },
    ],
  },
  {
    title: "发团",
    controls: [
      { key: "capDepth", label: "顶冠深度", min: 0.5, max: 1.6, step: 0.02 },
      { key: "backDepth", label: "后发长度", min: 0.8, max: 2.4, step: 0.02 },
      { key: "faceGap", label: "露脸角度", min: 0.8, max: 2.6, step: 0.02 },
    ],
  },
  {
    title: "马尾",
    controls: [
      { key: "tailLength", label: "长度", min: 0, max: 0.9, step: 0.01 },
      { key: "tailThickness", label: "粗细", min: 0.02, max: 0.16, step: 0.005 },
      { key: "tailAnchorY", label: "扎的高度", min: -0.2, max: 1.0, step: 0.02 },
      { key: "tailTilt", label: "翘起角度", min: -0.4, max: 1.6, step: 0.02 },
    ],
  },
  {
    title: "手",
    controls: [
      { key: "handRadius", label: "手大小", min: 0.03, max: 0.11, step: 0.002 },
    ],
  },
];

export const RIG_COLOR_CONTROLS: Array<{ key: ColorRigKey; label: string }> = [
  { key: "skin", label: "皮肤" },
  { key: "skinDark", label: "腮红" },
  { key: "eye", label: "眼睛" },
  { key: "hair", label: "头发" },
  { key: "hairShade", label: "刘海暗部" },
  { key: "hairTie", label: "发圈" },
  { key: "body", label: "身体" },
  { key: "hem", label: "裙边" },
  { key: "accent", label: "领口" },
  { key: "boots", label: "鞋" },
  { key: "gogglesColor", label: "护目镜" },
];

/** Every key the tuner can write, for building the export payload. */
export const TUNABLE_KEYS: Array<keyof RigSpec> = [
  ...RIG_CONTROL_GROUPS.flatMap((group) => group.controls.map((c) => c.key)),
  ...RIG_COLOR_CONTROLS.map((c) => c.key),
  "goggles",
];

/** Numeric fields of a `SurfacePiece`, as sliders. */
export type NumericPieceKey =
  | "azimuth"
  | "elevation"
  | "lift"
  | "width"
  | "length"
  | "taper"
  | "skew"
  | "bend"
  | "pitch"
  | "spin"
  | "thickness"
  | "pad";

export interface PieceControl {
  key: NumericPieceKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const PIECE_CONTROLS: PieceControl[] = [
  { key: "azimuth", label: "水平角", min: -Math.PI, max: Math.PI, step: 0.02 },
  { key: "elevation", label: "垂直角", min: -1.4, max: 1.5, step: 0.02 },
  { key: "lift", label: "外移", min: -0.04, max: 0.1, step: 0.002 },
  { key: "width", label: "宽", min: 0.01, max: 0.34, step: 0.005 },
  { key: "length", label: "长", min: 0.01, max: 0.6, step: 0.005 },
  { key: "taper", label: "收尖", min: 0, max: 1.6, step: 0.02 },
  { key: "skew", label: "尖端偏移", min: -0.25, max: 0.25, step: 0.005 },
  { key: "bend", label: "平面内转", min: -1.6, max: 1.6, step: 0.02 },
  { key: "pitch", label: "翘离头皮", min: -1.2, max: 1.2, step: 0.02 },
  { key: "spin", label: "自转", min: -1.6, max: 1.6, step: 0.02 },
  // Zero is a real value here: a single flat face with no sides.
  { key: "thickness", label: "厚度", min: 0, max: 0.12, step: 0.002 },
  { key: "pad", label: "画布余量", min: 1, max: 3, step: 0.05 },
];

export const PIECE_SHAPES = [
  { value: "quad", label: "矩形" },
  { value: "wedge", label: "梯形" },
  { value: "triangle", label: "三角" },
  { value: "lock", label: "发绺" },
  { value: "spike", label: "尖刺" },
  { value: "leaf", label: "叶形（曲线）" },
  { value: "round", label: "椭圆（曲线）" },
  { value: "disc", label: "圆片" },
  { value: "custom", label: "自定义（画布追踪）" },
] as const;

export const PIECE_COLORS = [
  { value: "none", label: "完全透明" },
  { value: "hair", label: "头发" },
  { value: "hairShade", label: "暗部" },
  { value: "hairTie", label: "发圈" },
  { value: "skin", label: "皮肤" },
  { value: "skinDark", label: "腮红" },
  { value: "eye", label: "眼睛" },
  { value: "accent", label: "领口" },
  { value: "body", label: "身体" },
  { value: "hem", label: "裙边" },
] as const;
