import type { ReactNode } from "react";
import { bodyOuterX, type BodySpec } from "@/lib/forme/bodies";
import type { PantStyle, Product, ShoeStyle, TopStyle } from "@/lib/forme/catalog";
import {
  clamp01,
  lerp,
  luminance,
  mirrorRuns,
  path,
  sample,
  shade,
  symPath,
  symStroke,
  tint,
  xAt,
  type P,
} from "@/lib/forme/geometry";

/** Garment pieces at their z-levels: back (behind body), main, sleeves (over arms) and front details. */
export interface GarmentArt {
  back?: ReactNode;
  main: ReactNode;
  sleeves?: ReactNode;
  front?: ReactNode;
}

interface Paint {
  base: string;
  line: string;
  fold: string;
  hi: string;
  uid: string;
}

function makePaint(hex: string, uid: string): Paint {
  const lum = luminance(hex);
  return {
    base: hex,
    line: shade(hex, lum > 0.55 ? 0.34 : 0.5),
    fold: lum < 0.04 ? tint(hex, 0.12) : shade(hex, lum > 0.55 ? 0.22 : 0.32),
    hi: tint(hex, lum < 0.04 ? 0.22 : 0.4),
    uid,
  };
}

function Fabric({ d, p, sw = 1.1, cyl = true, drop = false, fill }: { d: string; p: Paint; sw?: number; cyl?: boolean; drop?: boolean; fill?: string }) {
  return (
    <g>
      <path d={d} fill={fill ?? p.base} />
      {cyl && <path d={d} fill={`url(#${p.uid}-cyl)`} />}
      {drop && <path d={d} fill={`url(#${p.uid}-drop)`} />}
      <path d={d} fill={`url(#${p.uid}-light)`} />
      <path d={d} fill="none" stroke={p.line} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

const Fold = ({ d, p, w = 1, o = 0.75 }: { d: string; p: Paint; w?: number; o?: number }) => (
  <path d={d} fill="none" stroke={p.fold} strokeWidth={w} strokeOpacity={o} strokeLinecap="round" strokeLinejoin="round" />
);
const Hi = ({ d, p, w = 1.1, o = 0.45 }: { d: string; p: Paint; w?: number; o?: number }) => (
  <path d={d} fill="none" stroke={p.hi} strokeWidth={w} strokeOpacity={o} strokeLinecap="round" />
);
const Stitch = ({ d, color, w = 0.7, o = 0.8 }: { d: string; color: string; w?: number; o?: number }) => (
  <path d={d} fill="none" stroke={color} strokeWidth={w} strokeOpacity={o} strokeDasharray="2.2 1.8" strokeLinecap="round" />
);

/** Draw an open left-side stroke and its mirror. */
function Both({ runs, children }: { runs: P[][]; children: (d: string) => ReactNode }) {
  return (
    <>
      {children(path(runs, false))}
      {children(path(mirrorRuns(runs), false))}
    </>
  );
}

const MIRROR = "matrix(-1 0 0 1 400 0)";

/* ============================== TOPS ============================== */

interface SleeveOpts {
  endY: number;
  easeAt: (y: number, t: number) => number;
  drop: number;
  short: boolean;
}

function sleeveGeometry(spec: BodySpec, o: SleeveOpts) {
  const [ax, ay] = spec.acromion;
  const py = spec.armpit[1];
  const top: P = [ax - 4 - o.drop, ay - 2 + o.drop * 0.5];
  const y0 = ay + 14 + o.drop * 0.8;
  const n = Math.max(3, Math.round((o.endY - y0) / 38));
  const outer = sample(y0, o.endY, n, (y, t) => xAt(spec.armOuter, y) - o.easeAt(y, t));
  const innerEndY = o.short ? Math.max(py + 18, o.endY - 8) : o.endY - 1;
  const n2 = Math.max(2, Math.round((innerEndY - py) / 40));
  const inner = sample(innerEndY, py + 4, n2, (y, t) => xAt(spec.armInner, y) + o.easeAt(y, 1 - t) * 0.72);
  const oEnd = outer[outer.length - 1]!;
  const iStart = inner[0]!;
  const iEnd = inner[inner.length - 1]!;
  const hem: P[] = [oEnd, [lerp(oEnd[0], iStart[0], 0.5), lerp(oEnd[1], iStart[1], 0.5) + 2.5], iStart];
  const scye: P[] = [iEnd, [ax + 22, ay + 42], [ax + 7 - o.drop * 0.3, ay + 12], top];
  return { d: path([[top, ...outer], hem, inner, scye]), outer, inner, hem, top };
}

function renderTop(spec: BodySpec, style: TopStyle, p: Paint, productId: string): GarmentArt {
  const W = spec.gender === "women";
  const nb = spec.neckBaseY;
  const nh = spec.neckHalf;
  const cw = Math.max(nh, 24);
  const [ax, ay] = spec.acromion;
  const [px, py] = spec.armpit;
  const isTee = style.kind === "tee";
  const fit = isTee ? style.fit : "regular";
  const ease = isTee ? { fitted: 2.5, regular: 6, boxy: 12 }[fit] : W ? 4.5 : 6;
  const drape = isTee ? { fitted: 0.2, regular: 0.6, boxy: 1 }[fit] : W ? 0.45 : 0.7;
  const drop = fit === "boxy" ? 10 : 0;
  const hemY = isTee ? (W ? (fit === "boxy" ? 494 : 540) : fit === "boxy" ? 546 : 552) : W ? 548 : 566;

  // ---- neckline ----
  const sideNeck: P = isTee ? [200 - nh - 5, nb - 7] : [200 - nh - 3, nb - 12];
  let neck: P[];
  if (isTee && style.neckline === "crew") neck = [[200, nb + (W ? 14 : 11)], [200 - nh * 0.75, nb + 6], sideNeck];
  else if (isTee) neck = [[200, nb + (W ? 52 : 46)], [200 - nh * 0.55, nb + 18], sideNeck];
  else if (style.kind === "shirt" && style.collar === "camp") neck = [[200, nb + 60], [200 - nh * 0.75, nb + 20], sideNeck];
  else neck = [[200, nb + 8], [200 - nh * 0.7, nb + 1], sideNeck];

  const shoulderPt: P = [ax - 3 - drop, ay - 2 + drop * 0.5];
  const shoulder: P[] = [sideNeck, ...spec.trapezius.slice(1, -1).map(([x, y]) => [x, y - 3] as P), shoulderPt];
  const chest = Math.min(...spec.torsoSide.filter((q) => q[1] < spec.waistY).map((q) => q[0]));
  const sideX = (y: number) => {
    const b = bodyOuterX(spec, y);
    return lerp(b, Math.min(b, chest), drape) - ease;
  };
  const armholeEnd: P = [sideX(py + 8), py + 8];
  const armhole: P[] = [shoulderPt, [ax + 6 - drop * 0.5, ay + 36], armholeEnd];
  const side = sample(py + 8, hemY, 8, sideX);
  const hx = sideX(hemY);
  const hem: P[] = isTee
    ? [[hx, hemY], [(hx + 200) / 2, hemY + 3], [200, hemY + 4]]
    : [[hx, hemY], [hx + 11, hemY + 8], [(hx + 200) / 2 + 6, hemY + 14], [200, hemY + 15]];
  const bodyD = symPath([neck, shoulder, armhole, side, hem]);
  const centerHemY = isTee ? hemY + 4 : hemY + 15;

  // ---- sleeves ----
  const longSleeve = style.kind === "shirt" && style.sleeve === "long";
  let sleeveOpts: SleeveOpts;
  if (longSleeve) {
    const wy = spec.wristY;
    sleeveOpts = {
      endY: wy - 8,
      drop: 0,
      short: false,
      easeAt: (y) => 4.5 + 3.5 * Math.exp(-(((y - (wy - 50)) / 24) ** 2)) - 1.2 * clamp01((y - (wy - 30)) / 20),
    };
  } else {
    const endY = ay + (isTee ? (W ? (fit === "fitted" ? 66 : 74) : 90) : W ? 74 : 88) + drop * 2;
    const base = isTee ? { fitted: 2.5, regular: 4.5, boxy: 7 }[fit] : 6;
    const flare = isTee ? { fitted: 2.5, regular: 5, boxy: 8 }[fit] : 8;
    sleeveOpts = { endY, drop, short: true, easeAt: (_y, t) => base + flare * t };
  }
  const sl = sleeveGeometry(spec, sleeveOpts);
  const sleeveRuns = mirrorRuns([[sl.top, ...sl.outer], sl.hem, sl.inner, [sl.inner[sl.inner.length - 1]!, [ax + 22, ay + 42], [ax + 7 - drop * 0.3, ay + 12], sl.top]]);
  const sleeveRightD = path(sleeveRuns);

  // folds
  const wy = spec.waistY;
  const wx = sideX(wy);
  const armpitDrag: P[][] = [
    [
      [px + 2, py + 16],
      [px + 13, py + 30],
      [px + 27, py + 38],
    ],
  ];
  const waistFold: P[][] = [
    [
      [wx + 3, wy - 6],
      [wx + 13, wy + 1],
      [wx + 24, wy + 2],
    ],
  ];
  const hemFold: P[][] = [
    [
      [hx + 22, hemY - 18],
      [hx + 26, hemY - 6],
      [hx + 28, hemY + 2],
    ],
  ];
  const bustFold: P[][] = W
    ? [
        [
          [px + 8, py + 50],
          [168, py + 68],
          [190, py + 66],
        ],
      ]
    : [];

  // sleeve hem stitch / cuff
  const oEnd = sl.outer[sl.outer.length - 1]!;
  const iStart = sl.inner[0]!;
  const sleeveHemStitch: P[][] = [
    [
      [oEnd[0] + 1.5, oEnd[1] - 6],
      [lerp(oEnd[0], iStart[0], 0.5), lerp(oEnd[1], iStart[1], 0.5) - 3.5],
      [iStart[0] - 1.5, iStart[1] - 6],
    ],
  ];

  let cuffD = "";
  if (longSleeve) {
    const c0 = spec.wristY - 24;
    const c1 = spec.wristY + 1;
    const co = sample(c0, c1, 2, (y) => xAt(spec.armOuter, y) - 3);
    const ci = sample(c1, c0, 2, (y) => xAt(spec.armInner, y) + 3);
    const coE = co[co.length - 1]!;
    const ciE = ci[ci.length - 1]!;
    cuffD = path([co, [coE, [lerp(coE[0], ci[0]![0], 0.5), c1 + 2], ci[0]!], ci, [ciE, [lerp(ciE[0], co[0]![0], 0.5), c0 + 1.5], co[0]!]]);
  }
  const elbow = spec.elbowY;
  const eo = xAt(spec.armOuter, elbow);
  const ei = xAt(spec.armInner, elbow);
  const elbowFolds: P[][] = longSleeve
    ? [
        [
          [eo - 1, elbow - 12],
          [eo + 9, elbow - 5],
          [eo + 18, elbow - 8],
        ],
        [
          [ei + 1, elbow + 6],
          [ei - 8, elbow + 10],
          [ei - 15, elbow + 6],
        ],
        [
          [xAt(spec.armOuter, spec.wristY - 44) - 3, spec.wristY - 46],
          [lerp(xAt(spec.armOuter, spec.wristY - 40), xAt(spec.armInner, spec.wristY - 40), 0.5), spec.wristY - 38],
          [xAt(spec.armInner, spec.wristY - 46) + 2, spec.wristY - 48],
        ],
      ]
    : [
        [
          [ax + 6, ay + 26],
          [ax + 1, ay + 46],
          [oEnd[0] + 10, oEnd[1] - 10],
        ],
      ];

  const sleeves = (
    <g>
      <Fabric d={sl.d} p={p} />
      <Fabric d={sleeveRightD} p={p} />
      <Both runs={elbowFolds}>{(d) => <Fold d={d} p={p} />}</Both>
      {!longSleeve && <Both runs={sleeveHemStitch}>{(d) => <Stitch d={d} color={p.line} />}</Both>}
      {longSleeve && (
        <>
          <Fabric d={cuffD} p={p} />
          <g transform={MIRROR}>
            <Fabric d={cuffD} p={p} />
          </g>
          <circle cx={xAt(spec.armInner, spec.wristY - 12) - 2} cy={spec.wristY - 12} r={1.8} fill={p.hi} stroke={p.line} strokeWidth={0.6} />
          <circle cx={400 - xAt(spec.armInner, spec.wristY - 12) + 2} cy={spec.wristY - 12} r={1.8} fill={p.hi} stroke={p.line} strokeWidth={0.6} />
        </>
      )}
    </g>
  );

  // ---- tee specifics ----
  if (style.kind === "tee") {
    const backD = symPath([
      [
        [200, nb - 12],
        [200 - nh * 0.8, nb - 11],
        [sideNeck[0] - 1, sideNeck[1] - 2],
      ],
      [
        [sideNeck[0] - 1, sideNeck[1] - 2],
        [neck[1]![0], neck[1]![1] + 2],
        [200, neck[0]![1] + 1],
      ],
    ]);
    const rib =
      style.neckline === "crew"
        ? symStroke([
            [sideNeck[0] + 3, sideNeck[1] + 5],
            [200 - nh * 0.75, nb + 12],
            [200, neck[0]![1] + 6],
          ])
        : symStroke([
            [sideNeck[0] + 3, sideNeck[1] + 5],
            [200 - nh * 0.5, nb + 24],
            [200, neck[0]![1] + 7],
          ]);
    const pocketY = nb + (W ? 64 : 60);
    const pocketD = path([
      [
        [211, pocketY],
        [238, pocketY],
      ],
      [
        [238, pocketY],
        [238, pocketY + 28],
      ],
      [
        [238, pocketY + 28],
        [234, pocketY + 33],
        [215, pocketY + 33],
        [211, pocketY + 28],
      ],
      [
        [211, pocketY + 28],
        [211, pocketY],
      ],
    ]);
    return {
      back: <Fabric d={backD} p={p} fill={shade(p.base, 0.14)} cyl={false} />,
      main: (
        <g>
          <Fabric d={bodyD} p={p} drop />
          <path d={rib} fill="none" stroke={p.line} strokeWidth={1} strokeOpacity={0.8} />
          <Stitch d={symStroke([[hx + 1, hemY - 6], [(hx + 200) / 2, hemY - 3], [200, hemY - 2]])} color={p.line} />
          <Both runs={armpitDrag}>{(d) => <Fold d={d} p={p} />}</Both>
          <Both runs={waistFold}>{(d) => <Fold d={d} p={p} o={0.55} />}</Both>
          <Both runs={hemFold}>{(d) => <Fold d={d} p={p} o={0.4} />}</Both>
          <Both runs={bustFold}>{(d) => <Fold d={d} p={p} o={0.45} />}</Both>
          {fit === "boxy" && (
            <Hi d={path([[[200 - 26, nb + 40], [200 - 30, py + 60], [200 - 28, hemY - 10]]], false)} p={p} o={0.3} w={2} />
          )}
          {style.pocket && (
            <g>
              <Fabric d={pocketD} p={p} cyl={false} sw={0.9} />
              <Stitch d={path([[[211.5, pocketY + 3], [237.5, pocketY + 3]]], false)} color={p.line} />
            </g>
          )}
        </g>
      ),
      sleeves,
    };
  }

  // ---- shirt specifics ----
  const collar = style.collar;
  let collarFront: ReactNode = null;
  let collarBack: ReactNode = null;
  let placketTop = nb + 8;
  const backBand = (lift: number) =>
    symPath([
      [
        [200, nb - 28 + lift],
        [200 - nh * 0.7, nb - 27 + lift],
        [200 - nh - 4, nb - 22 + lift],
      ],
      [
        [200 - nh - 4, nb - 22 + lift],
        [200 - nh - 1, nb - 10 + lift],
      ],
      [
        [200 - nh - 1, nb - 10 + lift],
        [200 - nh * 0.6, nb - 13 + lift],
        [200, nb - 12 + lift],
      ],
    ]);

  if (collar === "point" || collar === "buttondown") {
    const A: P = [200 - nh - 3, nb - 22];
    const B: P = [200 - cw - 15, nb - 1];
    const C: P = [200 - cw + 3, nb + 30];
    const D: P = [198, nb + 9];
    const leaf = path([
      [A, [200 - cw - 11, nb - 12], B],
      [B, [200 - cw - 8, nb + 14], C],
      [C, [200 - 12, nb + 18], D],
      [D, [200 - nh * 0.55, nb - 6], A],
    ]);
    collarBack = <Fabric d={backBand(0)} p={p} fill={shade(p.base, 0.16)} cyl={false} />;
    collarFront = (
      <g>
        <Fabric d={leaf} p={p} cyl={false} sw={1} />
        <g transform={MIRROR}>
          <Fabric d={leaf} p={p} cyl={false} sw={1} />
        </g>
        <Both runs={[[[A[0] + 2, A[1] + 6], [B[0] + 6, B[1] + 2], [C[0] - 1, C[1] - 6]]]}>{(d) => <Stitch d={d} color={p.line} w={0.6} />}</Both>
        {collar === "buttondown" && (
          <>
            <circle cx={C[0] + 5} cy={C[1] - 7} r={1.6} fill={p.hi} stroke={p.line} strokeWidth={0.5} />
            <circle cx={400 - C[0] - 5} cy={C[1] - 7} r={1.6} fill={p.hi} stroke={p.line} strokeWidth={0.5} />
          </>
        )}
      </g>
    );
    placketTop = D[1];
  } else if (collar === "camp") {
    const A: P = [200 - nh - 2, nb - 16];
    const B: P = [200 - cw - 30, nb + 4];
    const C: P = [200 - cw - 10, nb + 40];
    const D: P = [197, nb + 62];
    const leaf = path([
      [A, [200 - cw - 18, nb - 8], B],
      [B, [200 - cw - 22, nb + 24], C],
      [C, [200 - cw * 0.5 - 8, nb + 50], D],
      [D, [200 - nh * 0.75, nb + 20], A],
    ]);
    collarBack = <Fabric d={backBand(5)} p={p} fill={shade(p.base, 0.16)} cyl={false} />;
    collarFront = (
      <g>
        <Fabric d={leaf} p={p} cyl={false} sw={1} />
        <g transform={MIRROR}>
          <Fabric d={leaf} p={p} cyl={false} sw={1} />
        </g>
        <Both runs={[[[B[0] + 5, B[1] + 3], [C[0] - 1, C[1] - 4]], [[C[0] + 4, C[1] + 2], [D[0] - 8, D[1] - 6]]]}>
          {(d) => <Hi d={d} p={p} o={0.4} />}
        </Both>
      </g>
    );
    placketTop = D[1];
  } else {
    const band = path([
      [
        [200 - nh - 3, nb - 20],
        [200 - nh * 0.5, nb - 9],
        [198, nb - 5],
      ],
      [
        [198, nb - 5],
        [198, nb + 7],
      ],
      [
        [198, nb + 7],
        [200 - nh * 0.5, nb + 3],
        [200 - nh - 5, nb - 8],
      ],
      [
        [200 - nh - 5, nb - 8],
        [200 - nh - 3, nb - 20],
      ],
    ]);
    collarBack = <Fabric d={backBand(2)} p={p} fill={shade(p.base, 0.16)} cyl={false} />;
    collarFront = (
      <g>
        <Fabric d={band} p={p} cyl={false} sw={1} />
        <g transform={MIRROR}>
          <Fabric d={band} p={p} cyl={false} sw={1} />
        </g>
      </g>
    );
    placketTop = nb + 7;
  }

  const placketD = path([
    [
      [193.5, placketTop],
      [193.5, centerHemY - 1],
    ],
    [
      [193.5, centerHemY - 1],
      [206.5, centerHemY - 1],
    ],
    [
      [206.5, centerHemY - 1],
      [206.5, placketTop],
    ],
    [
      [206.5, placketTop],
      [193.5, placketTop],
    ],
  ]);
  const buttonFill = luminance(p.base) > 0.45 ? shade(p.base, 0.1) : tint(p.base, 0.55);
  const buttons: number[] = [];
  for (let y = placketTop + (collar === "camp" ? 16 : 14); y < centerHemY - 14; y += W ? 42 : 46) buttons.push(y);
  const pocketY = nb + 64;
  const showPocket = !W && collar === "buttondown";
  const pocketD = path([
    [
      [212, pocketY],
      [238, pocketY],
    ],
    [
      [238, pocketY],
      [238, pocketY + 28],
    ],
    [
      [238, pocketY + 28],
      [225, pocketY + 35],
    ],
    [
      [225, pocketY + 35],
      [212, pocketY + 28],
    ],
    [
      [212, pocketY + 28],
      [212, pocketY],
    ],
  ]);

  return {
    back: collarBack,
    main: (
      <g>
        <Fabric d={bodyD} p={p} drop />
        <Fabric d={placketD} p={p} cyl={false} sw={0.8} />
        {buttons.map((y) => (
          <g key={y}>
            <circle cx={200} cy={y} r={2.7} fill={buttonFill} stroke={p.line} strokeWidth={0.6} />
            <circle cx={199.2} cy={y} r={0.4} fill={p.line} />
            <circle cx={200.8} cy={y} r={0.4} fill={p.line} />
          </g>
        ))}
        <Stitch d={symStroke([[hx + 1, hemY - 5], [hx + 12, hemY + 3], [(hx + 200) / 2 + 6, hemY + 9], [200, hemY + 10]])} color={p.line} />
        <Both runs={armpitDrag}>{(d) => <Fold d={d} p={p} />}</Both>
        <Both runs={waistFold}>{(d) => <Fold d={d} p={p} o={0.55} />}</Both>
        <Both runs={bustFold}>{(d) => <Fold d={d} p={p} o={0.45} />}</Both>
        <Both
          runs={[
            [
              [190, placketTop + 40],
              [184, placketTop + 90],
              [182, placketTop + 150],
            ],
          ]}
        >
          {(d) => <Fold d={d} p={p} o={0.35} />}
        </Both>
        {showPocket && (
          <g>
            <Fabric d={pocketD} p={p} cyl={false} sw={0.9} />
            <Stitch d={path([[[212.5, pocketY + 3], [237.5, pocketY + 3]]], false)} color={p.line} />
          </g>
        )}
      </g>
    ),
    sleeves,
    front: <g data-product={productId}>{collarFront}</g>,
  };
}

/* ============================== PANTS ============================== */

const smooth = (t: number) => t * t * (3 - 2 * t);

export function pantsGeometry(spec: BodySpec, style: PantStyle) {
  const W = spec.gender === "women";
  const rise = W ? spec.waistY + 2 : spec.waistY + 26;
  const cut = style.cut;
  const hemY = { slim: spec.ankleY - 8, straight: spec.floorY - 24, wide: spec.floorY - 6, cigarette: spec.ankleY - 34 }[cut];
  const thighEase = { slim: 5, straight: 8, wide: 13, cigarette: 3.5 }[cut];
  const hemHalf = { slim: W ? 19 : 21, straight: W ? 31 : 33, wide: W ? 44 : 46, cigarette: W ? 17.5 : 19 }[cut];
  const hipEase = style.pleats ? 7 : W ? 3.5 : 5;
  const c0 = spec.crotchY;
  const lc = (y: number) => (xAt(spec.legOuter, y) + xAt(spec.legInner, y)) / 2;
  const lh = (y: number) => (xAt(spec.legInner, y) - xAt(spec.legOuter, y)) / 2;
  const thighHalf = lh(c0 + 30) + thighEase;
  const half = (y: number) => {
    const t = clamp01((y - c0) / (hemY - c0));
    const k = cut === "wide" ? t ** 0.75 : cut === "straight" ? t ** 0.6 : t;
    return Math.max(lh(y) + 3, lerp(thighHalf, hemHalf, k));
  };
  const innerAt = (y: number) => Math.min(198, lc(y) + half(y));
  const outerAt = (y: number) => {
    const body = bodyOuterX(spec, y) - hipEase;
    if (y < spec.hipY) return body;
    const leg = Math.min(lc(y) - half(y), innerAt(y) - 2 * half(y));
    const k = smooth(clamp01((y - spec.hipY) / (c0 + 40 - spec.hipY)));
    return Math.min(body + 2 * k, lerp(body, leg, k));
  };
  return { rise, hemY, outerAt, innerAt, lc, c0, W };
}

function renderPants(spec: BodySpec, style: PantStyle, p: Paint): GarmentArt {
  const { rise, hemY, outerAt, innerAt, c0 } = pantsGeometry(spec, style);
  const top: P[] = [
    [200, rise + 3],
    [lerp(200, outerAt(rise), 0.5), rise + 1.5],
    [outerAt(rise), rise],
  ];
  const outerRun = sample(rise, hemY, 18, outerAt);
  const ho = outerAt(hemY);
  const hi = innerAt(hemY);
  const hemRun: P[] = [
    [ho, hemY],
    [(ho + hi) / 2, hemY + 3],
    [hi, hemY],
  ];
  const innerRun: P[] = [...sample(hemY, c0 + 10, 10, innerAt), [200, c0 + 3]];
  const d = symPath([top, outerRun, hemRun, innerRun]);
  const legD = path([top, outerRun, hemRun, innerRun, [[200, c0 + 3], [200, rise + 3]]]);
  const mid = (y: number) => (outerAt(y) + innerAt(y)) / 2;
  const denim = !!style.denim;
  const thread = "#C9944F";

  const wbY = rise + 13;
  const waistband = symStroke([
    [outerAt(wbY) + 0.5, wbY],
    [(outerAt(wbY) + 200) / 2, wbY + 1],
    [200, wbY + 2],
  ]);
  const loops = [lerp(outerAt(rise), 200, 0.45), outerAt(rise) + 7];
  const pocket: P[][] = denim
    ? [
        [
          [outerAt(rise + 15) + 24, rise + 15],
          [outerAt(rise + 38) + 15, rise + 36],
          [outerAt(rise + 52) + 3, rise + 50],
        ],
      ]
    : [
        [
          [outerAt(rise + 15) + 10, rise + 15],
          [outerAt(rise + 48) + 15, rise + 48],
          [outerAt(rise + 80) + 5, rise + 82],
        ],
      ];
  const crease = path([sample(rise + 70, hemY - 4, 6, mid)], false);
  const kneeY = spec.kneeY;
  const kneeFolds: P[][] = [
    [
      [mid(kneeY) - 16, kneeY - 14],
      [mid(kneeY) - 2, kneeY - 7],
      [mid(kneeY) + 12, kneeY - 12],
    ],
    [
      [mid(kneeY) - 10, kneeY + 6],
      [mid(kneeY) + 4, kneeY + 10],
    ],
  ];
  const hemFolds: P[][] =
    style.cut === "straight" || style.cut === "wide"
      ? [
          [
            [mid(hemY - 30) - 18, hemY - 34],
            [mid(hemY - 30) - 4, hemY - 26],
            [mid(hemY - 30) + 14, hemY - 32],
          ],
          [
            [mid(hemY - 14) - 10, hemY - 14],
            [mid(hemY - 14) + 6, hemY - 10],
            [mid(hemY - 14) + 18, hemY - 16],
          ],
        ]
      : [
          [
            [mid(hemY - 18) - 8, hemY - 20],
            [mid(hemY - 18) + 6, hemY - 15],
          ],
        ];

  return {
    main: (
      <g>
        <Fabric d={d} p={p} cyl={false} drop />
        <path d={legD} fill={`url(#${p.uid}-cyl)`} />
        <path d={path(mirrorRuns([top, outerRun, hemRun, innerRun, [[200, c0 + 3], [200, rise + 3]]]))} fill={`url(#${p.uid}-cyl)`} />
        <path d={d} fill="none" stroke={p.line} strokeWidth={1.1} strokeLinejoin="round" />
        <path d={waistband} fill="none" stroke={p.line} strokeWidth={0.9} />
        {denim && <Stitch d={waistband} color={thread} w={0.7} />}
        {loops.map((x) => (
          <g key={x}>
            <rect x={x - 2} y={rise - 1} width={4} height={15} rx={1} fill={p.base} stroke={p.line} strokeWidth={0.7} />
            <rect x={400 - x - 2} y={rise - 1} width={4} height={15} rx={1} fill={p.base} stroke={p.line} strokeWidth={0.7} />
          </g>
        ))}
        <circle cx={200} cy={rise + 7} r={2.4} fill={denim ? "#B9884D" : shade(p.base, 0.25)} stroke={p.line} strokeWidth={0.5} />
        <path d={path([[[200, wbY + 2], [200, c0 + 2]]], false)} fill="none" stroke={p.line} strokeWidth={0.8} strokeOpacity={0.8} />
        {denim ? (
          <Stitch d={path([[[206, wbY + 2], [206, c0 - 34], [203, c0 - 16], [199.5, c0 - 9]]], false)} color={thread} w={0.8} />
        ) : (
          <Fold d={path([[[205.5, wbY + 2], [205.5, c0 - 34], [202, c0 - 16], [199.5, c0 - 9]]], false)} p={p} w={0.8} />
        )}
        <Both runs={pocket}>{(dd) => (denim ? <Stitch d={dd} color={thread} w={0.8} /> : <Fold d={dd} p={p} />)}</Both>
        {denim && (
          <>
            <circle cx={pocket[0]![0]![0]} cy={rise + 16} r={1.3} fill="#B9884D" />
            <circle cx={400 - pocket[0]![0]![0]} cy={rise + 16} r={1.3} fill="#B9884D" />
            <Both runs={[[[mid(c0 - 10) + 8, c0 - 6], [mid(c0) + 18, c0 + 6]], [[mid(c0 + 6) + 6, c0 + 10], [mid(c0 + 14) + 18, c0 + 20]]]}>
              {(dd) => <Hi d={dd} p={p} o={0.35} w={1.6} />}
            </Both>
          </>
        )}
        {!denim && (
          <>
            <path d={crease} fill="none" stroke={p.hi} strokeOpacity={0.5} strokeWidth={1.2} />
            <path d={crease} transform="translate(1.4 0)" fill="none" stroke={p.fold} strokeOpacity={0.5} strokeWidth={0.8} />
            <g transform={MIRROR}>
              <path d={crease} fill="none" stroke={p.hi} strokeOpacity={0.5} strokeWidth={1.2} />
              <path d={crease} transform="translate(1.4 0)" fill="none" stroke={p.fold} strokeOpacity={0.5} strokeWidth={0.8} />
            </g>
          </>
        )}
        {style.pleats && (
          <Both
            runs={[
              [
                [mid(rise + 20) + 4, wbY + 2],
                [mid(rise + 50) + 3, rise + 64],
              ],
              [
                [mid(rise + 20) + 14, wbY + 2],
                [mid(rise + 40) + 14, rise + 40],
              ],
            ]}
          >
            {(dd) => <Fold d={dd} p={p} />}
          </Both>
        )}
        <Both runs={kneeFolds}>{(dd) => <Fold d={dd} p={p} o={0.45} />}</Both>
        <Both runs={hemFolds}>{(dd) => <Fold d={dd} p={p} o={0.6} />}</Both>
        <Both runs={[[[ho + 2, hemY - 6], [(ho + hi) / 2, hemY - 3], [hi - 2, hemY - 6]]]}>
          {(dd) => (denim ? <Stitch d={dd} color={thread} /> : <Fold d={dd} p={p} o={0.5} w={0.7} />)}
        </Both>
      </g>
    ),
  };
}

/* ============================== SHOES ============================== */

function renderShoes(spec: BodySpec, style: ShoeStyle, p: Paint): GarmentArt {
  const ay = spec.ankleY;
  const fy = spec.floorY;
  const ao = xAt(spec.legOuter, ay);
  const ai = xAt(spec.legInner, ay);
  const fc = (ao + ai) / 2 - 3;
  const lum = luminance(p.base);
  const soleColor = style.shoe === "sneaker" ? (lum > 0.5 ? "#F6F3EC" : "#EFEBE3") : shade(p.base, 0.6);
  const sole: Paint = makePaint(soleColor, p.uid);
  let left: ReactNode;

  if (style.shoe === "sneaker") {
    const upper = path([
      [
        [ao - 3, ay + 6],
        [ao - 9, ay + 26],
        [ao - 13, fy - 18],
        [ao - 15, fy - 12],
      ],
      [
        [ao - 15, fy - 12],
        [fc - 8, fy - 6],
        [ai + 2, fy - 8],
        [ai + 7, fy - 13],
      ],
      [
        [ai + 7, fy - 13],
        [ai + 6, fy - 28],
        [ai + 2, ay + 8],
      ],
      [
        [ai + 2, ay + 8],
        [fc + 2, ay + 2],
        [ao - 3, ay + 6],
      ],
    ]);
    const soleD = path([
      [
        [ao - 16, fy - 14],
        [ao - 17, fy - 5],
        [ao - 12, fy + 1],
      ],
      [
        [ao - 12, fy + 1],
        [fc, fy + 4],
        [ai + 6, fy + 1],
      ],
      [
        [ai + 6, fy + 1],
        [ai + 9, fy - 5],
        [ai + 8, fy - 14],
      ],
      [
        [ai + 8, fy - 14],
        [fc, fy - 6],
        [ao - 16, fy - 14],
      ],
    ]);
    const tongue = path([
      [
        [fc - 7, fy - 24],
        [fc - 7, ay + 4],
      ],
      [
        [fc - 7, ay + 4],
        [fc, ay - 1],
        [fc + 7, ay + 4],
      ],
      [
        [fc + 7, ay + 4],
        [fc + 7, fy - 24],
      ],
      [
        [fc + 7, fy - 24],
        [fc - 7, fy - 24],
      ],
    ]);
    const laceColor = lum > 0.5 ? shade(p.base, 0.12) : "#F1EEE8";
    const laces: ReactNode[] = [];
    for (let y = ay + 9; y < fy - 26; y += 6) {
      laces.push(<path key={y} d={`M${fc - 8},${y} L${fc + 8},${y + 3}`} stroke={laceColor} strokeWidth={1.6} strokeLinecap="round" />);
    }
    left = (
      <g>
        <Fabric d={upper} p={p} />
        <Fabric d={tongue} p={p} cyl={false} sw={0.7} fill={shade(p.base, 0.05)} />
        {laces}
        <Fold d={path([[[fc - 9, ay + 6], [fc - 9, fy - 25]], [[fc + 9, fy - 25], [fc + 9, ay + 6]]], false)} p={p} w={0.8} />
        <Fold d={path([[[ao - 12, fy - 18], [fc - 2, fy - 22], [ai + 6, fy - 18]]], false)} p={p} o={0.6} />
        <Hi d={path([[[ao - 8, ay + 22], [ao - 11, fy - 22]]], false)} p={p} o={0.5} w={1.4} />
        <Fabric d={soleD} p={sole} cyl={false} sw={0.9} />
        <Stitch d={path([[[ao - 14, fy - 9], [fc, fy - 2], [ai + 6, fy - 9]]], false)} color={sole.line} w={0.6} />
      </g>
    );
  } else if (style.shoe === "loafer") {
    const upper = path([
      [
        [ao - 5, fy - 34],
        [ao - 11, fy - 24],
        [ao - 14, fy - 11],
      ],
      [
        [ao - 14, fy - 11],
        [fc - 6, fy - 4],
        [ai + 2, fy - 6],
        [ai + 6, fy - 12],
      ],
      [
        [ai + 6, fy - 12],
        [ai + 5, fy - 26],
        [ai + 1, fy - 34],
      ],
      [
        [ai + 1, fy - 34],
        [fc, fy - 29],
        [ao - 5, fy - 34],
      ],
    ]);
    const soleD = path([
      [
        [ao - 15, fy - 11],
        [ao - 15, fy - 5],
        [fc, fy + 1],
        [ai + 7, fy - 5],
        [ai + 7, fy - 12],
      ],
      [
        [ai + 7, fy - 12],
        [fc, fy - 4],
        [ao - 15, fy - 11],
      ],
    ]);
    const strap = path([
      [
        [ao - 10, fy - 27],
        [fc, fy - 22],
        [ai + 4, fy - 27],
      ],
      [
        [ai + 4, fy - 27],
        [ai + 4.5, fy - 21],
      ],
      [
        [ai + 4.5, fy - 21],
        [fc, fy - 16],
        [ao - 11, fy - 21],
      ],
      [
        [ao - 11, fy - 21],
        [ao - 10, fy - 27],
      ],
    ]);
    left = (
      <g>
        <Fabric d={upper} p={p} />
        <Fabric d={strap} p={p} cyl={false} sw={0.8} fill={shade(p.base, 0.12)} />
        <ellipse cx={fc} cy={fy - 19.5} rx={4} ry={1.4} fill={shade(p.base, 0.6)} />
        <Stitch d={path([[[ao - 9, fy - 17], [fc - 2, fy - 9], [ai + 3, fy - 16]]], false)} color={p.line} w={0.6} />
        <ellipse cx={fc - 5} cy={fy - 12} rx={5} ry={2} fill="#FFFFFF" opacity={0.28} />
        <Fabric d={soleD} p={sole} cyl={false} sw={0.7} />
      </g>
    );
  } else if (style.shoe === "pump") {
    const upper = path([
      [
        [ao - 3, fy - 30],
        [ao - 8, fy - 20],
        [ao - 10, fy - 10],
      ],
      [
        [ao - 10, fy - 10],
        [fc - 8, fy + 3],
      ],
      [
        [fc - 8, fy + 3],
        [ai + 1, fy - 7],
        [ai + 4, fy - 14],
      ],
      [
        [ai + 4, fy - 14],
        [ai + 3, fy - 24],
        [ai, fy - 30],
      ],
      [
        [ai, fy - 30],
        [fc - 1, fy - 17],
        [ao - 3, fy - 30],
      ],
    ]);
    left = (
      <g>
        <path d={`M${ao - 2},${fy - 29} L${ao},${ay + 9}`} stroke={p.line} strokeWidth={3} strokeLinecap="round" />
        <path d={`M${ao - 2},${fy - 29} L${ao},${ay + 9}`} stroke={p.base} strokeWidth={1.8} strokeLinecap="round" />
        <path d={`M${ai},${fy - 29} L${ai - 1},${ay + 9}`} stroke={p.line} strokeWidth={3} strokeLinecap="round" />
        <path d={`M${ai},${fy - 29} L${ai - 1},${ay + 9}`} stroke={p.base} strokeWidth={1.8} strokeLinecap="round" />
        <Fabric d={upper} p={p} />
        <path d={path([[[ao - 9, fy - 9], [fc - 8, fy + 3], [ai + 3, fy - 10]]], false)} fill="none" stroke={shade(p.base, 0.6)} strokeWidth={1.6} />
        <ellipse cx={fc - 4} cy={fy - 10} rx={4.5} ry={1.8} fill="#FFFFFF" opacity={0.3} />
      </g>
    );
  } else {
    // chelsea / ankle boot
    const boot = style.shoe === "chelsea";
    const sy = ay - (boot ? 42 : 38);
    const so = xAt(spec.legOuter, sy) - 3;
    const si = xAt(spec.legInner, sy) + 3;
    const upper = path([
      [
        [so, sy],
        [ao - 4, ay - 6],
        [ao - 11, fy - 22],
        [ao - 14, fy - 12],
      ],
      [
        [ao - 14, fy - 12],
        [fc - 7, fy - 4],
        [ai + 3, fy - 7],
        [ai + 7, fy - 13],
      ],
      [
        [ai + 7, fy - 13],
        [ai + 5, fy - 28],
        [ai + 3, ay],
        [si, sy],
      ],
      [
        [si, sy],
        [(so + si) / 2, sy - 2],
        [so, sy],
      ],
    ]);
    const soleD = path([
      [
        [ao - 15, fy - 12],
        [ao - 15, fy - 5],
        [fc, fy + 1],
        [ai + 8, fy - 5],
        [ai + 8, fy - 13],
      ],
      [
        [ai + 8, fy - 13],
        [fc, fy - 4],
        [ao - 15, fy - 12],
      ],
    ]);
    left = (
      <g>
        <Fabric d={upper} p={p} sw={boot ? 1 : 1.1} />
        {boot ? (
          <>
            <path d={path([[[so + 1, sy + 1], [ao + 1, ay + 2]], [[ao + 1, ay + 2], [so + 13, sy + 1]]])} fill={shade(p.base, 0.35)} stroke={p.line} strokeWidth={0.6} />
            <path d={path([[[si - 1, sy + 1], [ai - 1, ay + 2]], [[ai - 1, ay + 2], [si - 13, sy + 1]]])} fill={shade(p.base, 0.35)} stroke={p.line} strokeWidth={0.6} />
            <rect x={(so + si) / 2 - 4} y={sy - 9} width={8} height={11} rx={2} fill={shade(p.base, 0.1)} stroke={p.line} strokeWidth={0.6} />
          </>
        ) : (
          <>
            <path d={`M${si - 4},${sy + 2} L${ai - 1},${ay + 12}`} stroke={shade(p.base, 0.45)} strokeWidth={1.2} />
            <rect x={si - 6.5} y={sy + 4} width={3.5} height={7} rx={1} fill="#C7B79F" />
            <Fold d={path([[[ao - 2, ay - 4], [fc - 2, ay + 2], [ai - 2, ay - 6]]], false)} p={p} o={0.55} />
          </>
        )}
        <Hi d={path([[[ao - 6, ay - 20], [ao - 10, fy - 22]]], false)} p={p} o={0.4} w={1.6} />
        <ellipse cx={fc - 5} cy={fy - 12} rx={5} ry={2} fill="#FFFFFF" opacity={boot ? 0.12 : 0.28} />
        <Fabric d={soleD} p={sole} cyl={false} sw={0.7} />
      </g>
    );
  }

  return {
    main: (
      <g>
        {left}
        <g transform={MIRROR}>{left}</g>
      </g>
    ),
  };
}

/* ============================== ENTRY ============================== */

export function renderGarment(spec: BodySpec, product: Product, hex: string, uid: string): GarmentArt {
  const p = makePaint(hex, uid);
  const s = product.style;
  if (s.kind === "tee" || s.kind === "shirt") return renderTop(spec, s, p, product.id);
  if (s.kind === "pants") return renderPants(spec, s, p);
  return renderShoes(spec, s, p);
}

/** Framing used by product cards so each garment is shown on its own. */
export function thumbViewBox(spec: BodySpec, product: Product): string {
  const s = product.style;
  if (s.kind === "pants") {
    const { rise } = pantsGeometry(spec, s);
    const y0 = rise - 20;
    const h = spec.floorY + 8 - y0;
    const w = h * 0.8;
    return `${200 - w / 2} ${y0} ${w} ${h}`;
  }
  if (s.kind === "shoes") {
    const y0 = spec.ankleY - 64;
    const h = spec.floorY + 16 - y0;
    const w = h * 1.6;
    return `${200 - w / 2} ${y0} ${w} ${h}`;
  }
  const y0 = spec.neckBaseY - 44;
  const long = s.kind === "shirt" && s.sleeve === "long";
  const y1 = long ? spec.wristY + 14 : 590;
  const h = y1 - y0;
  const w = Math.max(h * 0.8, 290);
  return `${200 - w / 2} ${y0} ${w} ${h}`;
}
