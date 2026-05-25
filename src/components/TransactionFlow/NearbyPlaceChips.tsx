import { Loader2, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

type NearbyPlaceChipsProps = {
  suggestions: string[];
  isLoading: boolean;
  onSelect: (placeName: string) => void;
};

export function NearbyPlaceChips({
  suggestions,
  isLoading,
  onSelect,
}: NearbyPlaceChipsProps) {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setShowLoading(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  if ((!isLoading || !showLoading) && suggestions.length === 0) {
    return null;
  }

  return (
    <div className="min-h-[42px] pt-2" aria-live="polite">
      {isLoading && showLoading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium">Nearby</span>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Finding places</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((placeName) => (
              <button
                key={placeName}
                type="button"
                className="min-h-8 shrink-0 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={`Use ${placeName} as note`}
                onClick={() => onSelect(placeName)}
              >
                {placeName}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-medium text-muted-foreground/70">
            Powered by Google
          </p>
        </div>
      )}
    </div>
  );
}
