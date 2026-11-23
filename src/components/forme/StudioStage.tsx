import { useState } from "react";
import { ArrowLeftRight, Bookmark, Check, Maximize2, RotateCcw, Shirt, X } from "lucide-react";
import { toast } from "sonner";
import { BODIES, type Gender } from "@/lib/forme/bodies";
import type { Slot } from "@/lib/forme/catalog";
import type { Outfit } from "@/lib/forme/state";
import { cn } from "@/lib/utils";
import { HumanModel, type Focus } from "./HumanModel";
import { OutfitSummary } from "./OutfitSummary";
import { useStudio } from "./store";

const FOCI: { id: Focus; label: string }[] = [
  { id: "full", label: "Full look" },
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "shoes", label: "Shoes" },
];

const BACKGROUNDS = [
  { id: "warm", label: "Warm", color: "#d8cbbb" },
  { id: "daylight", label: "Daylight", color: "#f4f3ee" },
  { id: "noir", label: "Noir", color: "#55524d" },
] as const;

interface Props {
  focus: Focus;
  onFocus: (f: Focus) => void;
  onSaveLook: () => void;
  onReplace: (slot: Slot) => void;
  onOpenOutfit: () => void;
}

const pill =
  "rounded-full px-3 h-8 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function StudioStage({ focus, onFocus, onSaveLook, onReplace, onOpenOutfit }: Props) {
  const { state, dispatch } = useStudio();
  const [background, setBackground] = useState<(typeof BACKGROUNDS)[number]["id"]>("warm");
  const [pinned, setPinned] = useState<{ gender: Gender; outfit: Outfit } | null>(null);
  const spec = BODIES[state.gender];
  const outfit = state.outfits[state.gender];
  const sideButton =
    "glass grid size-10 place-items-center rounded-full text-foreground transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const compare = () => {
    if (pinned) {
      setPinned(null);
      return;
    }
    setPinned({ gender: state.gender, outfit: structuredClone(outfit) });
    onFocus("full");
    toast("Look pinned for comparison", {
      description: "Try another piece to see both looks side by side.",
    });
  };

  const focusControl = (mobile: boolean) => (
    <div
      className={cn(
        "glass flex max-w-full overflow-x-auto rounded-full p-1 scrollbar-none",
        mobile ? "md:hidden" : "hidden md:flex",
      )}
      role="group"
      aria-label="Focus"
    >
      {FOCI.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={focus === f.id}
          onClick={() => onFocus(f.id)}
          className={cn(
            pill,
            "shrink-0",
            focus === f.id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <section
      aria-label="Fitting studio"
      className={cn(
        "fitting-stage relative h-full min-h-0 overflow-hidden rounded-[22px] shadow-studio",
        `fitting-stage-${background}`,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="stage-halo" />
        <div className="stage-floor" />
        <div className="absolute inset-x-[7%] bottom-[29%] h-px bg-foreground/[0.06]" />
        {!pinned && (
          <div className="stage-editorial hidden lg:block">
            <span className="text-[9px] font-medium uppercase tracking-[0.25em]">
              The everyday edit
            </span>
            <p className="mt-3 font-serif text-[clamp(28px,3.5vw,52px)] leading-[0.95] tracking-[-0.03em]">
              Good clothes.
              <br />
              <span className="italic">Better together.</span>
            </p>
            <span className="mt-4 block h-px w-7 bg-current opacity-40" />
          </div>
        )}
        <span className="absolute right-5 top-[92px] hidden text-[9px] uppercase tracking-[0.24em] text-foreground/40 xl:block [writing-mode:vertical-rl]">
          A study in personal style - FORME
        </span>
      </div>

      <div className={cn("studio-model-area absolute", pinned ? "studio-model-area-compare" : "")}>
        {pinned && (
          <div className="relative min-h-0 min-w-0 border-r border-foreground/10">
            <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full bg-card/75 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-foreground">
              Pinned look
            </span>
            <HumanModel
              spec={BODIES[pinned.gender]}
              allowGeneration={false}
              outfit={pinned.outfit}
              focus={focus}
              animate={false}
              className="h-full w-full"
              label={`${BODIES[pinned.gender].name}, pinned outfit for comparison`}
            />
          </div>
        )}
        <div className="relative min-h-0 min-w-0">
          {pinned && (
            <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full bg-coral px-3 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-coral-foreground">
              Current look
            </span>
          )}
          <HumanModel
            spec={spec}
            outfit={outfit}
            focus={focus}
            className="model-in h-full w-full"
            label={`${spec.name}, ${state.gender === "men" ? "male" : "female"} model wearing the current outfit`}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 p-3 lg:p-4">
        <div className="glass flex shrink-0 rounded-full p-1" role="radiogroup" aria-label="Model">
          {(["men", "women"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={state.gender === g}
              onClick={() => dispatch({ type: "setGender", gender: g })}
              className={cn(
                pill,
                "px-4",
                state.gender === g
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-card/70",
              )}
            >
              {g === "men" ? "Men" : "Women"}
            </button>
          ))}
        </div>
        {focusControl(false)}
        <button
          type="button"
          onClick={compare}
          aria-pressed={Boolean(pinned)}
          aria-label={pinned ? "Close outfit comparison" : "Compare looks"}
          title={pinned ? "Close comparison" : "Pin this look to compare"}
          className={cn(
            "glass flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-[11px] font-medium text-foreground transition hover:bg-card",
            pinned && "ring-1 ring-coral",
          )}
        >
          {pinned ? (
            <X className="size-3.5" aria-hidden />
          ) : (
            <ArrowLeftRight className="size-3.5" aria-hidden />
          )}
          <span className="hidden xl:inline">{pinned ? "Close compare" : "Compare"}</span>
        </button>
      </div>

      <div className="absolute inset-x-0 top-[65px] z-10 flex justify-center px-3 md:hidden">
        {focusControl(true)}
      </div>

      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 lg:right-4">
        <button
          type="button"
          onClick={() => onFocus("full")}
          aria-label="Reset view to full body"
          title="Reset view"
          className={cn(sideButton, focus !== "full" && "ring-1 ring-coral")}
        >
          <Maximize2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "resetOutfit" });
            toast("Outfit reset", { description: `${spec.name} is back in the starting look.` });
          }}
          aria-label="Reset outfit"
          title="Reset outfit"
          className={sideButton}
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onSaveLook}
          aria-label="Save this look"
          title="Save look"
          className={sideButton}
        >
          <Bookmark className="size-4" aria-hidden />
        </button>
      </div>

      <div className="stage-bottom-details absolute inset-x-4 z-10 flex items-end justify-between gap-3">
        <div className="hidden lg:block">
          <p className="text-[9px] uppercase tracking-[0.2em] text-foreground/55">
            Meet your model
          </p>
          <p className="mt-1 flex items-center gap-2 font-serif text-[25px] leading-none text-foreground">
            {spec.name}
            <span className="rounded-full border border-current/15 px-2 py-1 font-sans text-[8px] uppercase tracking-[0.1em] opacity-65">
              Styled preview
            </span>
          </p>
        </div>
        <div
          className="glass flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5"
          role="group"
          aria-label="Studio background"
        >
          <span className="mr-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Scene
          </span>
          {BACKGROUNDS.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => setBackground(scene.id)}
              aria-label={`${scene.label} background`}
              aria-pressed={background === scene.id}
              title={scene.label}
              className={cn(
                "grid size-6 place-items-center rounded-full border border-foreground/15 transition",
                background === scene.id && "ring-1 ring-foreground ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: scene.color }}
            >
              {background === scene.id && (
                <Check
                  className={cn("size-3", scene.id === "noir" ? "text-white" : "text-foreground")}
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-3 z-10 hidden lg:block">
        <OutfitSummary variant="bar" onReplace={onReplace} />
      </div>
      <div className="absolute bottom-3 left-3 z-10 lg:hidden">
        <button
          type="button"
          onClick={onOpenOutfit}
          className="glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Shirt className="size-4" aria-hidden /> Current outfit
        </button>
      </div>
      <span className="sr-only">
        Use the wardrobe to change pieces, pin a look to compare outfits, or change the scene.
      </span>
    </section>
  );
}
