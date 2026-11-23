import { useEffect, useState } from "react";
import { api } from "@/lib/commerce/api";
import type { Gender } from "./bodies";
import { canPreviewProduct, categoryToSlot, getProduct, sizesFor } from "./catalog";
import { getOutfitImage } from "./outfit-images";
import type { Outfit } from "./state";

interface PreviewResult {
  key: string;
  status: "pending" | "processing" | "ready" | "failed" | "unavailable";
  imageUrl?: string;
  jobId?: string;
  id?: string;
  message?: string;
}

const SLOTS = ["top", "bottom", "shoes"] as const;

/** Static looks remain instant; new garments resolve through the persistent server cache. */
export function useOutfitPreview(gender: Gender, outfit: Outfit, allowGeneration = true) {
  let prepared: ReturnType<typeof getOutfitImage> | null = null;
  try { prepared = getOutfitImage(gender, outfit); } catch { /* Resolve photo-based products below. */ }
  const valid = SLOTS.every((slot) => {
    const selection = outfit[slot];
    const product = getProduct(selection.productId);
    return product && canPreviewProduct(product) && product.gender === gender && categoryToSlot(product.category) === slot && product.colors.some((color) => color.id === selection.colorId) && sizesFor(product).includes(selection.size);
  });
  // Source changes invalidate a mounted preview as well as the server's cached frame.
  const signature = JSON.stringify([gender, outfit, SLOTS.map((slot) => {
    const product = getProduct(outfit[slot].productId);
    return product ? [product.active, product.previewSupported, product.tryOn, product.colors, product.style, product.imageUrl] : null;
  }), allowGeneration]);
  const [result, setResult] = useState<{ signature: string; value: PreviewResult } | null>(null);
  const [retry, setRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const staticKey = prepared?.key;
  const staticSrc = prepared?.src;
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener("forme-catalog-refreshed", update);
    return () => window.removeEventListener("forme-catalog-refreshed", update);
  }, []);
  useEffect(() => {
    if (staticKey || !valid) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const show = (value: PreviewResult) => {
      if (!controller.signal.aborted) setResult({ signature, value });
    };
    show({ key: signature, status: "pending", message: "Preparing your photo preview…" });
    const receive = (value: PreviewResult) => {
      if (controller.signal.aborted) return;
      if (value.status === "ready" && (!value.imageUrl || !/^\/(?:uploads\/|images\/looks\/)/.test(value.imageUrl))) {
        show({ key: signature, status: "failed", message: "The preview image could not be loaded." });
        return;
      }
      show(value);
      const jobId = value.jobId ?? value.id;
      if (!["pending", "processing"].includes(value.status) || !jobId) return;
      if (Date.now() - started > 10 * 60_000) {
        show({ key: signature, status: "failed", message: "Your preview is still queued. Check again in a moment." });
        return;
      }
      timer = setTimeout(() => {
        void api<PreviewResult>(`/try-on/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal }).then(receive).catch(fail);
      }, 2000);
    };
    const fail = (error: unknown) => show({ key: signature, status: "failed", message: error instanceof Error ? error.message : "The preview could not be created. Please try again." });
    // Read the request snapshot from the stable serialized selection, not a newer render.
    const [selectedGender, selectedOutfit] = JSON.parse(signature) as [Gender, Outfit];
    void api<PreviewResult>("/try-on/preview", {
      method: "POST",
      body: JSON.stringify({ gender: selectedGender, outfit: selectedOutfit, generate: allowGeneration, retry: retry > 0 }),
      signal: controller.signal,
    }).then(receive).catch(fail);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [signature, staticKey, valid, retry, refresh, allowGeneration]);
  const value: PreviewResult = staticKey && staticSrc
    ? { key: staticKey, status: "ready", imageUrl: staticSrc }
    : !valid
      ? { key: signature, status: "unavailable", message: "This look is no longer available in the fitting studio." }
      : result?.signature === signature
        ? result.value
        : { key: signature, status: "pending", message: "Preparing your photo preview…" };
  return { ...value, generated: !prepared, retry: () => setRetry((value) => value + 1) };
}
