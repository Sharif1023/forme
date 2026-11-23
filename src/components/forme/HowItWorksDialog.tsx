import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: "01",
    title: "Choose a model",
    text: "Explore generated photographic models for Men and Women. Each model keeps its own outfit.",
  },
  {
    n: "02",
    title: "Build your outfit",
    text: "Choose your pieces and colours. Prepared looks appear instantly; new photo-based looks are generated the first time and saved for your next visit.",
  },
  {
    n: "03",
    title: "Save or bag it",
    text: "Save looks you like on this device, or add single pieces or the whole outfit to your bag.",
  },
];

export function HowItWorksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-border bg-card p-8">
        <DialogHeader className="text-left">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-coral">
            How it works
          </p>
          <DialogTitle className="font-serif text-4xl font-normal leading-tight">
            See your style come together.
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Style generated photographic models, explore colours and compare outfits in your own
            studio.
          </DialogDescription>
        </DialogHeader>
        <ol className="mt-2 space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="font-serif text-2xl leading-none text-studio-deep">{s.n}</span>
              <div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-2xl bg-secondary/70 p-4 text-xs leading-relaxed text-muted-foreground">
          Models and outfit previews are AI-generated from prepared looks or product photographs.
          Details and colours can vary; saved sizes do not change the model or predict fit. Add
          favourites to your bag and continue to checkout for current prices, delivery and available
          payment methods.
        </p>
        <Button
          variant="default"
          size="pill"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Start styling
        </Button>
      </DialogContent>
    </Dialog>
  );
}
