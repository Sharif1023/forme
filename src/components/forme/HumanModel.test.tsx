import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEN } from "@/lib/forme/bodies";
import { DEFAULT_OUTFITS, type Outfit } from "@/lib/forme/state";
import { HumanModel } from "./HumanModel";

vi.mock("@/lib/forme/outfit-images", () => ({
  getOutfitImage: (_gender: string, outfit: Outfit) => {
    if (outfit.top.productId.startsWith("unsupported-")) throw new Error("Preview unavailable");
    return { key: outfit.top.productId, src: `/test-outfits/${outfit.top.productId}.webp` };
  },
}));

interface DeferredImage {
  resolve: () => void;
  reject: (error: Error) => void;
}
const requests = new Map<string, DeferredImage[]>();

class ControlledImage {
  src = "";
  decoding = "auto";
  decode() {
    return new Promise<void>((resolve, reject) => {
      requests.set(this.src, [...(requests.get(this.src) ?? []), { resolve, reject }]);
    });
  }
}

const outfit = (id: string): Outfit => ({
  ...DEFAULT_OUTFITS.men,
  top: { ...DEFAULT_OUTFITS.men.top, productId: id },
});
let container: HTMLDivElement;
let root: Root;
const renderFrame = (id: string, animate = false) => {
  act(() => {
    root.render(<HumanModel spec={MEN} outfit={outfit(id)} animate={animate} />);
  });
};
const currentImage = () => container.querySelector('[role="img"]')!;
const status = () => container.querySelector('[role="status"]');
const resolveImage = async (id: string) => {
  await act(async () => {
    requests.get(`/test-outfits/${id}.webp`)!.at(-1)!.resolve();
  });
};

beforeEach(() => {
  requests.clear();
  vi.stubGlobal("Image", ControlledImage);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Whole-outfit previews", () => {
  it("clears stale photographs and cancels pending loads when a catalog edit removes support", async () => {
    renderFrame("catalog-a");
    await resolveImage("catalog-a");
    renderFrame("catalog-pending");
    expect(() => renderFrame("unsupported-catalog")).not.toThrow();
    expect(container.querySelectorAll("svg image")).toHaveLength(0);
    expect(currentImage()).not.toHaveAttribute("data-outfit-key");
    expect(currentImage()).toHaveAttribute("aria-busy", "false");
    expect(status()).toHaveTextContent("no longer available");
    await resolveImage("catalog-pending");
    expect(container.querySelectorAll("svg image")).toHaveLength(0);
    renderFrame("catalog-restored");
    await resolveImage("catalog-restored");
    expect(currentImage()).toHaveAttribute("data-outfit-key", "catalog-restored");
  });

  it("keeps the decoded look visible and ignores an obsolete load finishing last", async () => {
    renderFrame("race-a");
    expect(container.querySelectorAll("svg image")).toHaveLength(0);
    await resolveImage("race-a");

    renderFrame("race-b");
    expect(currentImage()).toHaveAttribute("data-outfit-key", "race-a");
    expect(status()).toHaveTextContent("Updating look");
    renderFrame("race-c");
    await resolveImage("race-c");
    await resolveImage("race-b");

    expect(currentImage()).toHaveAttribute("data-outfit-key", "race-c");
    expect(container.querySelectorAll("svg image")).toHaveLength(1);
    expect(container.querySelector("svg image")).toHaveAttribute(
      "href",
      "/test-outfits/race-c.webp",
    );
    expect(status()).toBeNull();
  });

  it("preserves the last photograph after failure and retries the selected look", async () => {
    renderFrame("retry-a");
    await resolveImage("retry-a");
    renderFrame("retry-b");
    await act(async () => {
      requests.get("/test-outfits/retry-b.webp")![0]!.reject(new Error("File unavailable"));
    });

    expect(currentImage()).toHaveAttribute("data-outfit-key", "retry-a");
    expect(status()).toHaveTextContent("Look unavailable");
    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Retry loading outfit preview"]')!
        .click();
    });
    expect(requests.get("/test-outfits/retry-b.webp")).toHaveLength(2);
    await resolveImage("retry-b");
    expect(currentImage()).toHaveAttribute("data-outfit-key", "retry-b");
    expect(status()).toBeNull();
  });

  it("finishes a fade before starting the latest decoded look", async () => {
    vi.useFakeTimers();
    renderFrame("fade-a", true);
    await resolveImage("fade-a");
    renderFrame("fade-b", true);
    await resolveImage("fade-b");
    expect(container.querySelectorAll("svg image")).toHaveLength(2);

    renderFrame("fade-c", true);
    await resolveImage("fade-c");
    expect(currentImage()).toHaveAttribute("data-outfit-key", "fade-b");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(currentImage()).toHaveAttribute("data-outfit-key", "fade-c");
    expect(container.querySelectorAll("svg image")).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(container.querySelectorAll("svg image")).toHaveLength(1);
    expect(status()).toBeNull();
  });
});
