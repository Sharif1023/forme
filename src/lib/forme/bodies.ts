import type { P } from "./geometry";
import { xAt } from "./geometry";

export type Gender = "men" | "women";

/** Fixed anatomy for each model. Left-side profiles only; the right side is mirrored. */
export interface BodySpec {
  gender: Gender;
  name: string;
  skin: string;
  skinLight: string;
  skinShade: string;
  skinDeep: string;
  lip: string;
  lipDeep: string;
  hair: string;
  hairLight: string;
  brow: string;
  iris: string;
  headTop: number;
  chinY: number;
  neckHalf: number;
  neckTopY: number;
  neckBaseY: number;
  trapezius: P[];
  acromion: P;
  armpit: P;
  torsoSide: P[];
  pelvis: P[];
  waistY: number;
  hipY: number;
  crotchY: number;
  armOuter: P[];
  armInner: P[];
  armTop: P[];
  elbowY: number;
  wristY: number;
  hand: P[];
  thumb: P[];
  legOuter: P[];
  legInner: P[];
  kneeY: number;
  ankleY: number;
  floorY: number;
  foot: P[];
}

export const MEN: BodySpec = {
  gender: "men",
  name: "Arin",
  skin: "#B67D58",
  skinLight: "#CB9672",
  skinShade: "#9A6444",
  skinDeep: "#6E4129",
  lip: "#9A5A45",
  lipDeep: "#6F3A2B",
  hair: "#1E1712",
  hairLight: "#4A382B",
  brow: "#231912",
  iris: "#3B2618",
  headTop: 66,
  chinY: 177,
  neckHalf: 27,
  neckTopY: 150,
  neckBaseY: 205,
  trapezius: [
    [173, 200],
    [155, 209],
    [125, 218],
    [102, 228],
  ],
  acromion: [102, 228],
  armpit: [128, 300],
  torsoSide: [
    [128, 300],
    [122, 322],
    [122, 360],
    [127, 400],
    [131, 440],
    [130, 470],
    [126, 500],
    [124, 512],
  ],
  pelvis: [
    [124, 512],
    [136, 542],
    [166, 561],
    [200, 566],
  ],
  waistY: 440,
  hipY: 512,
  crotchY: 566,
  armOuter: [
    [102, 228],
    [91, 244],
    [86, 272],
    [87, 320],
    [86, 372],
    [84, 432],
    [80, 478],
    [77, 530],
    [79, 585],
  ],
  armInner: [
    [130, 296],
    [130, 336],
    [125, 388],
    [120, 432],
    [113, 478],
    [106, 530],
    [104, 585],
  ],
  armTop: [
    [130, 296],
    [114, 256],
    [102, 228],
  ],
  elbowY: 432,
  wristY: 585,
  hand: [
    [79, 582],
    [76, 606],
    [75, 632],
    [78, 656],
    [86, 674],
    [94, 679],
    [100, 672],
    [103, 650],
    [106, 624],
    [106, 600],
    [104, 582],
  ],
  thumb: [
    [104, 597],
    [110, 607],
    [112, 622],
    [108, 636],
    [102, 633],
  ],
  legOuter: [
    [124, 505],
    [119, 552],
    [120, 612],
    [127, 682],
    [136, 750],
    [134, 792],
    [136, 832],
    [146, 880],
    [154, 920],
  ],
  legInner: [
    [200, 566],
    [198, 612],
    [195, 680],
    [192, 750],
    [190, 792],
    [191, 840],
    [188, 888],
    [186, 920],
  ],
  kneeY: 750,
  ankleY: 920,
  floorY: 970,
  foot: [
    [154, 912],
    [150, 936],
    [141, 957],
    [141, 968],
    [150, 974],
    [168, 975],
    [184, 971],
    [190, 961],
    [189, 938],
    [186, 912],
  ],
};

export const WOMEN: BodySpec = {
  gender: "women",
  name: "Maya",
  skin: "#D9A47F",
  skinLight: "#E8BC9A",
  skinShade: "#BF8763",
  skinDeep: "#8E5A3D",
  lip: "#B4605A",
  lipDeep: "#7E3B36",
  hair: "#1C1411",
  hairLight: "#5A3E2E",
  brow: "#2A1D16",
  iris: "#3A2416",
  headTop: 84,
  chinY: 190,
  neckHalf: 19,
  neckTopY: 165,
  neckBaseY: 216,
  trapezius: [
    [181, 211],
    [162, 222],
    [132, 231],
    [112, 238],
  ],
  acromion: [112, 238],
  armpit: [134, 306],
  torsoSide: [
    [134, 306],
    [128, 330],
    [127, 352],
    [133, 378],
    [143, 410],
    [147, 432],
    [142, 462],
    [132, 494],
    [124, 525],
    [122, 540],
  ],
  pelvis: [
    [122, 540],
    [134, 566],
    [166, 580],
    [200, 584],
  ],
  waistY: 432,
  hipY: 540,
  crotchY: 584,
  armOuter: [
    [112, 238],
    [104, 250],
    [99, 276],
    [100, 318],
    [99, 370],
    [96, 436],
    [91, 488],
    [87, 540],
    [88, 580],
  ],
  armInner: [
    [135, 304],
    [134, 346],
    [128, 398],
    [124, 436],
    [118, 488],
    [110, 540],
    [108, 580],
  ],
  armTop: [
    [135, 304],
    [122, 266],
    [112, 238],
  ],
  elbowY: 436,
  wristY: 580,
  hand: [
    [88, 577],
    [85, 600],
    [84, 626],
    [87, 648],
    [94, 664],
    [101, 667],
    [106, 660],
    [108, 640],
    [110, 616],
    [110, 596],
    [108, 577],
  ],
  thumb: [
    [108, 592],
    [113, 601],
    [114, 615],
    [110, 627],
    [106, 624],
  ],
  legOuter: [
    [122, 530],
    [120, 582],
    [123, 640],
    [131, 700],
    [140, 762],
    [138, 800],
    [141, 842],
    [150, 886],
    [158, 922],
  ],
  legInner: [
    [200, 584],
    [198, 632],
    [195, 692],
    [192, 762],
    [190, 802],
    [190, 850],
    [186, 894],
    [182, 922],
  ],
  kneeY: 762,
  ankleY: 922,
  floorY: 968,
  foot: [
    [158, 914],
    [155, 936],
    [148, 955],
    [148, 965],
    [156, 971],
    [171, 972],
    [183, 968],
    [187, 958],
    [186, 936],
    [182, 914],
  ],
};

export const BODIES: Record<Gender, BodySpec> = { men: MEN, women: WOMEN };

/** Outer body edge at y, following the torso and then the thigh. */
export function bodyOuterX(spec: BodySpec, y: number): number {
  const lastTorso = spec.torsoSide[spec.torsoSide.length - 1]!;
  if (y <= lastTorso[1]) return xAt(spec.torsoSide, y);
  return Math.min(lastTorso[0], xAt(spec.legOuter, y));
}
