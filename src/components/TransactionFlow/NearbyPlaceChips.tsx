import { Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlaceSuggestion } from "../../lib/googlePlaces";

type NearbyPlaceChipsProps = {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  canSearch: boolean;
  onSelect: (suggestion: PlaceSuggestion) => void;
  onSearch: () => void;
  searchButtonRef?: React.Ref<HTMLButtonElement>;
};

export function NearbyPlaceChips({
  suggestions,
  isLoading,
  canSearch,
  onSelect,
  onSearch,
  searchButtonRef,
}: NearbyPlaceChipsProps) {
  const [showLoading, setShowLoading] = useState(false);
  const visibleSuggestions = suggestions.slice(0, 5);
  const hasChipContent = visibleSuggestions.length > 0 || canSearch;

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setShowLoading(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  if ((!isLoading || !showLoading) && !hasChipContent) {
    return null;
  }

  return (
    <div className="min-h-[42px] pt-2" aria-live="polite">
      <div className="space-y-1.5">
        {isLoading && showLoading && visibleSuggestions.length === 0 ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-medium">Nearby</span>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Finding places</span>
          </div>
        ) : null}
        {hasChipContent ? (
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleSuggestions.map((suggestion) => (
              <button
                key={suggestion.placeId}
                type="button"
                className="min-h-8 shrink-0 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={`Use ${suggestion.name} as note`}
                onClick={() => onSelect(suggestion)}
              >
                {suggestion.name}
              </button>
            ))}
            {canSearch ? (
              <button
                ref={searchButtonRef}
                type="button"
                className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Search places"
                onClick={onSearch}
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                Search
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
