import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import { GoogleMapsAttribution } from "./GoogleMapsAttribution";

type PlaceSearchDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: string;
  onInputChange: (input: string) => void;
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  selectionError: Error | null;
  isSelecting: boolean;
  onRetry: () => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
};

export function PlaceSearchDrawer({
  open,
  onOpenChange,
  input,
  onInputChange,
  suggestions,
  isLoading,
  isError,
  error,
  selectionError,
  isSelecting,
  onRetry,
  onSelect,
}: PlaceSearchDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  const showEmpty =
    !isLoading && !isError && input.trim().length >= 2 && suggestions.length === 0;

  return (
    <Drawer
      open={open}
      dismissible={!isSelecting}
      onOpenChange={(nextOpen) => {
        if (nextOpen || !isSelecting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Search places</DrawerTitle>
          <DrawerDescription>
            Search Google Maps for a place to use as your note.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          <label className="sr-only" htmlFor="place-search-input">
            Search places
          </label>
          <input
            ref={inputRef}
            id="place-search-input"
            type="search"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Search places"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />

          <div className="min-h-28" aria-live="polite">
            {isLoading && suggestions.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Searching places
              </div>
            ) : null}

            {isError ? (
              <div className="flex flex-col items-start gap-2 py-2 text-sm text-muted-foreground">
                <span>{error?.message ?? "Could not search places"}</span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={onRetry}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {selectionError ? (
              <p className="py-2 text-sm text-muted-foreground">
                Couldn’t select that place. Tap it again.
              </p>
            ) : null}

            {suggestions.length > 0 ? (
              <div className="flex flex-col gap-1">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.placeId}
                    type="button"
                    disabled={isSelecting}
                    className="flex min-h-14 w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    onClick={() => onSelect(suggestion)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {suggestion.name}
                      </span>
                      {suggestion.secondaryText ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {suggestion.secondaryText}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {showEmpty ? (
              <p className="py-4 text-sm text-muted-foreground">No places found</p>
            ) : null}

            {!isLoading && !isError && input.trim().length < 2 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Type at least two characters to search
              </p>
            ) : null}

            {isSelecting ? (
              <p className="py-2 text-sm text-muted-foreground">Selecting place…</p>
            ) : null}
          </div>
          <GoogleMapsAttribution />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
