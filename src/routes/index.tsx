import { createFileRoute } from "@tanstack/react-router";
import { FittingStudio } from "@/components/forme/FittingStudio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FORME — Fitting Studio" },
      {
        name: "description",
        content:
          "Explore outfits on generated photographic models in FORME, a personal style studio with simulated colours, saved looks and outfit comparisons.",
      },
      { property: "og:title", content: "FORME — Fitting Studio" },
      {
        property: "og:description",
        content:
          "Your everyday, reimagined. Build and compare looks on generated photographic models.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FittingStudio,
});
