import { useEffect, useRef, useState } from "react";
import { Bookmark, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BODIES } from "@/lib/forme/bodies";
import { getProduct } from "@/lib/forme/catalog";
import { HumanModel } from "./HumanModel";
import { useStudio } from "./store";

export function LooksSheet({
  open,
  onOpenChange,
  focusInput,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  focusInput: boolean;
}) {
  const { state, dispatch } = useStudio();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const suggested = `${BODIES[state.gender].name}'s look ${state.looks.filter((l) => l.gender === state.gender).length + 1}`;

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || suggested;
    dispatch({ type: "saveLook", id: crypto.randomUUID(), name: finalName, createdAt: Date.now() });
    setName("");
    toast("Look saved", { description: finalName });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]"
        onOpenAutoFocus={(e) => {
          if (focusInput) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <SheetHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
          <SheetTitle className="font-serif text-3xl font-normal">Saved looks</SheetTitle>
          <SheetDescription>Saved on this device. Restore any look in one tap.</SheetDescription>
        </SheetHeader>

        <form onSubmit={save} className="flex gap-2 border-b border-border px-6 py-4">
          <label htmlFor="look-name" className="sr-only">
            Look name
          </label>
          <input
            id="look-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggested}
            maxLength={40}
            className="h-10 min-w-0 flex-1 rounded-full border border-input bg-card px-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" variant="coral" size="pill">
            <Bookmark aria-hidden /> Save current
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {state.looks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-serif text-2xl">No saved looks yet</p>
              <p className="mx-auto mt-1 max-w-[260px] text-sm text-muted-foreground">
                Name the outfit you're wearing and save it to come back to it later.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {state.looks.map((look) => {
                const names = (["top", "bottom", "shoes"] as const)
                  .map((s) => getProduct(look.outfit[s].productId)?.name)
                  .filter(Boolean);
                return (
                  <li
                    key={look.id}
                    className="flex gap-3 rounded-2xl border border-border bg-card p-2.5"
                  >
                    <div className="h-32 w-20 shrink-0 overflow-hidden rounded-xl bg-studio-gradient">
                      <HumanModel
                        spec={BODIES[look.gender]}
                        outfit={look.outfit}
                        animate={false}
                        allowGeneration={false}
                        className="h-full w-full"
                        label={`Preview of ${look.name}`}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate font-serif text-xl leading-tight">{look.name}</p>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {look.gender === "men" ? "Men" : "Women"} ·{" "}
                        {new Date(look.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {names.join(" · ")}
                      </p>
                      <div className="mt-auto flex gap-1.5 pt-2">
                        <Button
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            dispatch({ type: "restoreLook", id: look.id });
                            toast("Look restored", { description: look.name });
                            onOpenChange(false);
                          }}
                        >
                          <RotateCcw aria-hidden /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full"
                          onClick={() => dispatch({ type: "deleteLook", id: look.id })}
                          aria-label={`Delete ${look.name}`}
                        >
                          <Trash2 aria-hidden /> Delete
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
