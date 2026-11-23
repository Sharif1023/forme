import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/commerce/api";
import { canPreviewProduct, filterProducts, getProduct } from "@/lib/forme/catalog";
import { getOutfitImage } from "@/lib/forme/outfit-images";
import {
  DEFAULT_OUTFITS,
  initialState,
  parseStored,
  reducer,
  type Outfit,
} from "@/lib/forme/state";
import { useOutfitPreview } from "@/lib/forme/use-outfit-preview";

vi.mock("@/lib/commerce/api", () => ({ api: vi.fn() }));
const product = getProduct("m-shirt-oxford")!;
const original = structuredClone(product);
const selected = (): Outfit => structuredClone(DEFAULT_OUTFITS.men);

beforeEach(() => {
  vi.mocked(api).mockReset();
  Object.assign(product, structuredClone(original));
  delete product.tryOn;
});
afterEach(() => {
  Object.assign(product, structuredClone(original));
  delete product.tryOn;
  vi.useRealTimers();
});
function makeDynamic() {
  product.previewSupported = false;
  product.tryOn = {
    enabled: true,
    ready: true,
    revision: "photo-v1",
    colorImages: {
      sky: "/uploads/sky.png",
      white: "/uploads/white.png",
      rose: "/uploads/rose.png",
    },
  };
}

describe("Photo-based fitting previews", () => {
  it("waits for rapid garment changes to settle before requesting a paid image", async () => {
    makeDynamic();
    vi.mocked(api).mockResolvedValue({
      key: "settled",
      status: "ready",
      imageUrl: "/uploads/try-on/settled.webp",
    });
    const next = selected();
    next.top.colorId = "white";
    const { result, rerender } = renderHook(({ outfit }) => useOutfitPreview("men", outfit), {
      initialProps: { outfit: selected() },
    });
    rerender({ outfit: next });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(api).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string).outfit.top.colorId).toBe(
      "white",
    );
  });

  it("does not retry another failed selection or refresh without that look's explicit Retry", async () => {
    makeDynamic();
    vi.mocked(api).mockResolvedValue({ key: "failed", status: "failed", message: "Try again" });
    const first = selected();
    const next = selected();
    next.top.colorId = "white";
    const { result, rerender } = renderHook(({ outfit }) => useOutfitPreview("men", outfit), {
      initialProps: { outfit: first },
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(JSON.parse(vi.mocked(api).mock.calls[1]![1]!.body as string).retry).toBe(true);
    rerender({ outfit: next });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(JSON.parse(vi.mocked(api).mock.calls[2]![1]!.body as string).retry).toBe(false);
    act(() => window.dispatchEvent(new Event("forme-catalog-refreshed")));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(4));
    expect(JSON.parse(vi.mocked(api).mock.calls[3]![1]!.body as string).retry).toBe(false);
  });
  it("keeps prepared looks immediate without any server generation request", () => {
    const { result } = renderHook(() => useOutfitPreview("men", selected()));
    expect(result.current.status).toBe("ready");
    expect(result.current.imageUrl).toContain("/images/looks/men/");
    expect(api).not.toHaveBeenCalled();
  });

  it("allows photo-ready products in wardrobe and saved state while refusing a nonexistent prepared frame", () => {
    makeDynamic();
    expect(canPreviewProduct(product)).toBe(true);
    expect(filterProducts("men", "shirts", "")).toContain(product);
    const state = reducer(initialState(), { type: "wear", productId: product.id, colorId: "sky" });
    expect(state.outfits.men.top.productId).toBe(product.id);
    expect(parseStored(JSON.stringify(state)).outfits.men.top.colorId).toBe("sky");
    expect(() => getOutfitImage("men", state.outfits.men)).toThrow();
    product.tryOn!.ready = false;
    expect(canPreviewProduct(product)).toBe(false);
    expect(filterProducts("men", "shirts", "")).not.toContain(product);
  });

  it("polls a queued job and uses only the resulting whole-outfit image", async () => {
    makeDynamic();
    vi.mocked(api)
      .mockResolvedValueOnce({ key: "new-look", status: "pending", jobId: "job-1" })
      .mockResolvedValueOnce({
        key: "new-look",
        status: "ready",
        imageUrl: "/uploads/try-on/look.webp",
      });
    const { result } = renderHook(() => useOutfitPreview("men", selected()));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("ready"), { timeout: 3500 });
    expect(result.current.imageUrl).toBe("/uploads/try-on/look.webp");
    expect(vi.mocked(api).mock.calls[1]![0]).toBe("/try-on/jobs/job-1");
  });

  it("never lets an old selection finishing last replace the chosen outfit", async () => {
    makeDynamic();
    let finishOld!: (value: unknown) => void;
    vi.mocked(api)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ key: "new", status: "ready", imageUrl: "/uploads/try-on/new.webp" });
    const oldOutfit = selected();
    const newOutfit = selected();
    newOutfit.top.colorId = "white";
    const { result, rerender } = renderHook(({ outfit }) => useOutfitPreview("men", outfit), {
      initialProps: { outfit: oldOutfit },
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    rerender({ outfit: newOutfit });
    await waitFor(() => expect(result.current.key).toBe("new"));
    await act(async () =>
      finishOld({ key: "old", status: "ready", imageUrl: "/uploads/try-on/old.webp" }),
    );
    expect(result.current.key).toBe("new");
  });

  it("looks up saved thumbnails without authorizing generation", async () => {
    makeDynamic();
    vi.mocked(api).mockResolvedValue({
      key: "saved",
      status: "unavailable",
      message: "Open this look to generate a preview.",
    });
    const { result } = renderHook(() => useOutfitPreview("men", selected(), false));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    const body = JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string);
    expect(body.generate).toBe(false);
  });

  it("rejects unexpected remote image responses and offers an explicit retry", async () => {
    makeDynamic();
    vi.mocked(api)
      .mockResolvedValueOnce({
        key: "bad",
        status: "ready",
        imageUrl: "https://untrusted.example/image.png",
      })
      .mockResolvedValueOnce({
        key: "good",
        status: "ready",
        imageUrl: "/uploads/try-on/good.webp",
      });
    const { result } = renderHook(() => useOutfitPreview("men", selected()));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.key).toBe("good"));
    const body = JSON.parse(vi.mocked(api).mock.calls[1]![1]!.body as string);
    expect(body.retry).toBe(true);
  });
});
