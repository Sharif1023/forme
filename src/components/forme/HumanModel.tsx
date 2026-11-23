import { useEffect, useId, useRef, useState } from "react";
import type { BodySpec } from "@/lib/forme/bodies";
import { useOutfitPreview } from "@/lib/forme/use-outfit-preview";
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
  allowGeneration?: boolean;
}

/** Each frame is one complete outfit photograph; swaps begin only after decoding. */
export function HumanModel({
  spec,
  outfit,
  focus = "full",
  animate = true,
  className,
  label,
  allowGeneration = true,
}: HumanModelProps) {
  const uid = `outfit-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const preview = useOutfitPreview(spec.gender, outfit, allowGeneration);
  const requested =
    preview.status === "ready" && preview.imageUrl
      ? { key: preview.key, src: preview.imageUrl }
      : null;
  const generating = preview.status === "pending" || preview.status === "processing";
  const unavailable = preview.status === "unavailable";
  const previewFailed = preview.status === "failed";
  const requestedKey = requested?.key;
  const requestedSrc = requested?.src;
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
    if (!requestedKey || !requestedSrc) {
      setDecoded(null);
      if (unavailable || previewFailed) setDisplay({ current: null, previous: null });
      setFailure(null);
      return;
    }
    void decodeImage(requestedSrc).then(
      () => {
        if (!cancelled && id === requestId.current) {
          setDecoded({ key: requestedKey, src: requestedSrc, label: requestedLabel });
          setFailure(null);
        }
      },
      () => {
        if (!cancelled && id === requestId.current) {
          setFailure({ key: requestedKey, src: requestedSrc, attempt });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestedKey, requestedSrc, requestedLabel, attempt, unavailable, previewFailed]);

  useEffect(() => {
    if (
      !requestedKey ||
      !requestedSrc ||
      !decoded ||
      decoded.key !== requestedKey ||
      decoded.src !== requestedSrc
    )
      return;
    if (display.current?.key === decoded.key && display.current.src === decoded.src) return;
    // Finish the current fade before starting the newest requested frame. This keeps
    // rapid clicks from revealing a half-faded intermediate image at full opacity.
    if (display.previous) return;
    const motion = animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setDisplay((current) => ({ current: decoded, previous: motion ? current.current : null }));
  }, [decoded, requestedKey, requestedSrc, display, animate]);

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
    requested !== null &&
    failure !== null &&
    failure.key === requested.key &&
    failure.src === requested.src &&
    failure.attempt === attempt;
  const updating =
    requested !== null &&
    (display.current?.key !== requested.key ||
      display.current?.src !== requested.src ||
      Boolean(display.previous));
  const current = unavailable || previewFailed ? null : display.current;
  const previous = unavailable || previewFailed ? null : display.previous;
  const f = FOCUS[focus];

  return (
    <div className={className ? `outfit-model ${className}` : "outfit-model"}>
      <svg
        viewBox="0 0 400 1000"
        className="h-full w-full"
        role="img"
        aria-label={
          current?.label ?? `${spec.name}, preview ${unavailable ? "unavailable" : "loading"}`
        }
        aria-busy={(generating || updating) && !failed}
        data-outfit-key={current?.key}
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
          {current && <ellipse cx={200} cy={992} rx={150} ry={9} fill={`url(#${uid}-shadow)`} />}
          {previous && (
            <image
              key={previous.key}
              href={previous.src}
              x={-140}
              y={0}
              width={680}
              height={1000}
              preserveAspectRatio="xMidYMid meet"
              className="outfit-frame-previous"
            />
          )}
          {current && (
            <image
              key={current.key}
              href={current.src}
              x={-140}
              y={0}
              width={680}
              height={1000}
              preserveAspectRatio="xMidYMid meet"
              className={previous ? "outfit-frame-enter" : undefined}
            />
          )}
        </g>
      </svg>
      {(generating || updating || failed || previewFailed || unavailable) && (
        <div className="outfit-model-feedback" role="status" aria-live="polite">
          {unavailable ? (
            <span>{preview.message}</span>
          ) : failed || previewFailed ? (
            <>
              <span>{previewFailed ? preview.message : "Look unavailable"}</span>
              <button
                type="button"
                onClick={() => (previewFailed ? preview.retry() : setAttempt((value) => value + 1))}
                aria-label="Retry loading outfit preview"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <span className="outfit-model-spinner" aria-hidden />
              <span>
                {generating
                  ? preview.message || "Creating your photo preview…"
                  : display.current
                    ? "Updating look"
                    : "Loading look"}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
