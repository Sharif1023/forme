import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getProduct, type Product } from "@/lib/forme/catalog";
import { getProductImage } from "@/lib/forme/outfit-images";
import { GarmentThumb } from "./GarmentThumb";

const patternedProduct = (): Product => ({
  ...structuredClone(getProduct("m-tee-crew")!),
  id: "same-swatch-patterns",
  imageUrl: "/uploads/main-product.png",
  colors: [
    { id: "black-solid", name: "Black solid", hex: "#242424" },
    { id: "black-striped", name: "Black striped", hex: "#242424" },
  ],
  tryOn: {
    enabled: true,
    ready: true,
    colorImages: {
      "black-solid": "/uploads/solid-black.png",
      "black-striped": "/uploads/striped-black.png",
    },
  },
});

describe("Product photographs with matching colour swatches", () => {
  it("shows each selected variant's actual photograph when their hex colours are identical", () => {
    const product = patternedProduct();
    const { container, rerender } = render(
      <GarmentThumb product={product} hex="#242424" colorId="black-striped" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/uploads/striped-black.png");
    rerender(<GarmentThumb product={product} hex="#242424" colorId="black-solid" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/uploads/solid-black.png");
  });

  it("resolves prepared photographs by exact colour ID rather than the shared swatch", () => {
    const product = patternedProduct();
    expect(getProductImage(product, "#242424", "black-striped")).toBe(
      "/images/products/same-swatch-patterns--black-striped.webp",
    );
    expect(getProductImage(product, "#242424", "black-solid")).toBe(
      "/images/products/same-swatch-patterns--black-solid.webp",
    );
    expect(getProductImage(product, "#242424")).toBe(
      "/images/products/same-swatch-patterns--black-solid.webp",
    );
  });

  it("does not substitute another variant's photograph when an explicit colour ID is unknown", () => {
    const product = patternedProduct();
    const { container } = render(
      <GarmentThumb product={product} hex="#242424" colorId="retired-colour" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/images/product-placeholder.svg",
    );
    expect(getProductImage(product, "#242424", "retired-colour")).toBe(
      "/images/product-placeholder.svg",
    );
  });
});
