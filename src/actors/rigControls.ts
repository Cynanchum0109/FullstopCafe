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
  | "eyeSize"
  | "eyeSpacing"
  | "eyeHeight"
  | "blush"
  | "capDepth"
  | "backDepth"
  | "faceGap"
  | "partRatio"
  | "fringeDrop"
  | "fringeAsym"
  | "sideLockLength"
  | "sideLockAsym"
  | "tailLength"
  | "tailThickness"
  | "tailAnchorY"
  | "tailTilt"
  | "handRadius"
  | "footRadius";

/** Keys of `RigSpec` the tuner exposes as colour swatches. */
export type ColorRigKey =
  | "skin"
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
    title: "脸",
    controls: [
      { key: "eyeSize", label: "眼睛大小", min: 0.015, max: 0.07, step: 0.002 },
      { key: "eyeSpacing", label: "眼距", min: 0.15, max: 0.6, step: 0.01 },
      { key: "eyeHeight", label: "眼高", min: -0.35, max: 0.35, step: 0.01 },
      { key: "blush", label: "腮红", min: 0, max: 0.06, step: 0.002 },
    ],
  },
  {
    title: "头发",
    controls: [
      { key: "capDepth", label: "顶冠深度", min: 0.5, max: 1.6, step: 0.02 },
      { key: "backDepth", label: "后发长度", min: 0.8, max: 2.4, step: 0.02 },
      { key: "faceGap", label: "露脸角度", min: 0.8, max: 2.6, step: 0.02 },
      { key: "partRatio", label: "分缝位置", min: 0.1, max: 0.9, step: 0.01 },
      { key: "fringeDrop", label: "刘海长度", min: 0, max: 0.32, step: 0.005 },
      { key: "fringeAsym", label: "刘海偏侧", min: -0.9, max: 0.9, step: 0.02 },
      { key: "sideLockLength", label: "鬓发长度", min: 0, max: 0.4, step: 0.005 },
      { key: "sideLockAsym", label: "鬓发偏侧", min: -0.9, max: 0.9, step: 0.02 },
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
    title: "手脚",
    controls: [
      { key: "handRadius", label: "手大小", min: 0.03, max: 0.11, step: 0.002 },
      { key: "footRadius", label: "脚大小", min: 0.025, max: 0.1, step: 0.002 },
    ],
  },
];

export const RIG_COLOR_CONTROLS: Array<{ key: ColorRigKey; label: string }> = [
  { key: "skin", label: "皮肤" },
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
