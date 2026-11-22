import { useEffect, useId, useRef, useState } from "react";
import type { BodySpec } from "@/lib/forme/bodies";
import { getOutfitImage } from "@/lib/forme/outfit-images";
import type { Outfit } from "@/lib/forme/state";

export type Focus = "full" | "tops" | "bottoms" | "shoes";

const FOCUS: Record<Focus, { cx: number; cy: number; s: number }> = {
  full: { cx: 200, cy: 500, s: 1 },
  tops: { cx: 200, cy: 290, s: 1.8 },
  bottoms: { cx: 200, cy: 650, s: 1.65 },
  shoes: { cx: 200, cy: 935, s: 3.2 },
};

const TRANSITION_MS = 400;
const DECODE_CACHE_LIMIT = 24;
const decodedImages = new Map<string, Promise<HTMLImageElement>>();

/** Keep a small set of decoded photographs reusable between the studio and comparison. */
function decodeImage(src: string): Promise<HTMLImageElement> {
  const cached = decodedImages.get(src);
  if (cached) {
    decodedImages.delete(src);
    decodedImages.set(src, cached);
    return cached;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = src;
  const decoded = image.decode().then(() => image);
  const request = decoded.catch((error: unknown) => {
    if (decodedImages.get(src) === request) decodedImages.delete(src);
    throw error;
  });
  decodedImages.set(src, request);
  if (decodedImages.size > DECODE_CACHE_LIMIT) {
    decodedImages.delete(decodedImages.keys().next().value!);
  }
  return request;
}

interface Frame {
  key: string;
  src: string;
  label: string;
}

interface Display {
  current: Frame | null;
  previous: Frame | null;
}

export interface HumanModelProps {
  spec: BodySpec;
  outfit: Outfit;
  focus?: Focus;
  animate?: boolean;
  className?: string;
  label?: string;
}

/** Each frame is one complete outfit photograph; swaps begin only after decoding. */
export function HumanModel({
  spec,
  outfit,
  focus = "full",
  animate = true,
  className,
  label,
}: HumanModelProps) {
  const uid = `outfit-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const requested = getOutfitImage(spec.gender, outfit);
  const requestedLabel = label ?? `${spec.name}, photographic outfit preview`;
  const [decoded, setDecoded] = useState<Frame | null>(null);
  const [display, setDisplay] = useState<Display>({ current: null, previous: null });
  const [failure, setFailure] = useState<{ key: string; src: string; attempt: number } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    void decodeImage(requested.src).then(
      () => {
        if (!cancelled && id === requestId.current) {
          setDecoded({ key: requested.key, src: requested.src, label: requestedLabel });
          setFailure(null);
        }
      },
      () => {
        if (!cancelled && id === requestId.current) {
          setFailure({ key: requested.key, src: requested.src, attempt });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requested.key, requested.src, requestedLabel, attempt]);

  useEffect(() => {
    if (!decoded || decoded.key !== requested.key || decoded.src !== requested.src) return;
    if (display.current?.key === decoded.key && display.current.src === decoded.src) return;
    // Finish the current fade before starting the newest requested frame. This keeps
    // rapid clicks from revealing a half-faded intermediate image at full opacity.
    if (display.previous) return;
    const motion = animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setDisplay((current) => ({ current: decoded, previous: motion ? current.current : null }));
  }, [decoded, requested.key, requested.src, display, animate]);

  useEffect(() => {
    if (!display.previous) return;
    const frame = display.current;
    const timeout = window.setTimeout(() => {
      setDisplay((current) =>
        current.current === frame ? { current: frame, previous: null } : current,
      );
    }, TRANSITION_MS);
    return () => window.clearTimeout(timeout);
  }, [display]);

  const failed =
    failure !== null &&
    failure.key === requested.key &&
    failure.src === requested.src &&
    failure.attempt === attempt;
  const updating =
    display.current?.key !== requested.key ||
    display.current?.src !== requested.src ||
    Boolean(display.previous);
  const f = FOCUS[focus];

  return (
    <div className={className ? `outfit-model ${className}` : "outfit-model"}>
      <svg
        viewBox="0 0 400 1000"
        className="h-full w-full"
        role="img"
        aria-label={display.current?.label ?? `${spec.name}, preview loading`}
        aria-busy={updating && !failed}
        data-outfit-key={display.current?.key}
      >
        <defs>
          <radialGradient id={`${uid}-shadow`}>
            <stop stopColor="#34271b" stopOpacity=".2" />
            <stop offset="1" stopColor="#34271b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          className="stage-frame"
          style={{
            transform: `translate(200px, 500px) scale(${f.s}) translate(${-f.cx}px, ${-f.cy}px)`,
          }}
        >
          {display.current && (
            <ellipse cx={200} cy={992} rx={150} ry={9} fill={`url(#${uid}-shadow)`} />
          )}
          {display.previous && (
            <image
              key={display.previous.key}
              href={display.previous.src}
              x={-140}
              y={0}
              width={680}
              height={1000}
              preserveAspectRatio="xMidYMid meet"
              className="outfit-frame-previous"
            />
          )}
          {display.current && (
            <image
              key={display.current.key}
              href={display.current.src}
              x={-140}
              y={0}
              width={680}
              height={1000}
              preserveAspectRatio="xMidYMid meet"
              className={display.previous ? "outfit-frame-enter" : undefined}
            />
          )}
        </g>
      </svg>
      {(updating || failed) && (
        <div className="outfit-model-feedback" role="status" aria-live="polite">
          {failed ? (
            <>
              <span>Look unavailable</span>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                aria-label="Retry loading outfit preview"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <span className="outfit-model-spinner" aria-hidden />
              <span>{display.current ? "Updating look" : "Loading look"}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
