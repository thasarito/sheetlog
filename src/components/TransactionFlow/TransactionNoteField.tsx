import { FileText, X } from "lucide-react";
import type React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Coordinates, PlaceSuggestion } from "../../lib/googlePlaces";
import { cn } from "../../lib/utils";
import { NearbyPlaceChips } from "./NearbyPlaceChips";
import { createPlaceSessionId } from "./placeSessionId";
import type { ResolvedPlaceSelection } from "./transactionNoteForm";
import { usePlaceAutocomplete } from "./usePlaceAutocomplete";

export type PlaceNoteOptions = {
  enabled: boolean;
  nearbySuggestions: PlaceSuggestion[];
  isNearbyLoading: boolean;
  locationBias?: Coordinates;
};

type TransactionNoteFieldProps = {
  value: string;
  onManualChange: (value: string) => void;
  onClear: () => void;
  onPlaceSelect: (selection: ResolvedPlaceSelection) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  places?: PlaceNoteOptions;
};

export function TransactionNoteField({
  value,
  onManualChange,
  onClear,
  onPlaceSelect,
  onSubmit,
  canSubmit,
  inputRef,
  places,
}: TransactionNoteFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const valueRef = useRef(value);
  const placesEnabled = places?.enabled === true;
  const placesEnabledRef = useRef(placesEnabled);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const [sessionId, setSessionId] = useState(createPlaceSessionId);
  const sessionIdRef = useRef(sessionId);
  const [activeIndex, setActiveIndex] = useState(-1);
  const previousQueryContextRef = useRef({ value, sessionId });
  const generationRef = useRef(0);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  valueRef.current = value;
  placesEnabledRef.current = placesEnabled;
  sessionIdRef.current = sessionId;

  const assignInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      localInputRef.current = node;
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current =
          node;
      }
    },
    [inputRef],
  );

  const autocomplete = usePlaceAutocomplete({
    value,
    active,
    enabled: placesEnabled,
    sessionId,
    locationBias: places?.locationBias,
  });

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      if (mountedRef.current) localInputRef.current?.focus();
    });
  }, []);

  const blurInput = useCallback(() => {
    localInputRef.current?.blur();
  }, []);

  const retireLifecycle = useCallback((force = false) => {
    if (!force && !activeRef.current) return;
    activeRef.current = false;
    generationRef.current += 1;
    setActive(false);
    setActiveIndex(-1);
    setSessionId(createPlaceSessionId());
  }, []);

  const handleManualChange = (nextValue: string) => {
    generationRef.current += 1;
    setActiveIndex(-1);
    if (!nextValue.trim()) {
      onManualChange(nextValue);
      retireLifecycle(true);
      return;
    }
    if (
      !activeRef.current ||
      autocomplete.sessionError ||
      autocomplete.isSelecting
    ) {
      setSessionId(createPlaceSessionId());
    }
    activeRef.current = true;
    setActive(true);
    onManualChange(nextValue);
  };

  const selectOption = async (
    suggestion: PlaceSuggestion,
    dismissKeyboard = false,
  ) => {
    const generation = generationRef.current;
    const selectionSessionId = sessionId;
    const selectionValue = value;
    try {
      const selection = await autocomplete.selectSuggestion(suggestion);
      if (
        !mountedRef.current ||
        generationRef.current !== generation ||
        sessionIdRef.current !== selectionSessionId ||
        valueRef.current !== selectionValue ||
        !placesEnabledRef.current
      ) {
        return;
      }
      onPlaceSelect(selection);
      retireLifecycle(true);
      if (dismissKeyboard) blurInput();
      else focusInput();
    } catch {
      // The generic selection error remains available in the open popup.
    }
  };

  const handleNearbySelect = (suggestion: PlaceSuggestion) => {
    onPlaceSelect({
      displayName: suggestion.name,
      placeId: suggestion.placeId,
    });
    retireLifecycle(true);
    blurInput();
  };

  const handleClear = () => {
    onClear();
    retireLifecycle(true);
    focusInput();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const previousQueryContext = previousQueryContextRef.current;
    if (
      previousQueryContext.value !== value ||
      previousQueryContext.sessionId !== sessionId
    ) {
      previousQueryContextRef.current = { value, sessionId };
      setActiveIndex(-1);
    }
  }, [value, sessionId]);

  useEffect(() => {
    setActiveIndex((index) =>
      index >= autocomplete.suggestions.length ? -1 : index,
    );
  }, [autocomplete.suggestions.length]);

  useEffect(() => {
    if (!placesEnabled && activeRef.current) retireLifecycle();
  }, [placesEnabled, retireLifecycle]);

  useEffect(() => {
    if (!active) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        retireLifecycle();
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [active, retireLifecycle]);

  const popupOpen = Boolean(
    placesEnabled &&
      active &&
      value.trim().length >= 2 &&
      (autocomplete.isLoading ||
        autocomplete.isError ||
        autocomplete.selectionError ||
        autocomplete.hasSearched),
  );
  const activeOption = autocomplete.suggestions[activeIndex];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (popupOpen && event.key === "Enter") {
      event.preventDefault();
      const selectedOption = autocomplete.suggestions[activeIndex];
      if (selectedOption && !autocomplete.isSelecting) {
        void selectOption(selectedOption);
      }
      return;
    }
    if (popupOpen && event.key === "Escape") {
      event.preventDefault();
      retireLifecycle();
      return;
    }
    if (popupOpen && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, autocomplete.suggestions.length - 1),
      );
      return;
    }
    if (popupOpen && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index < 0
          ? autocomplete.suggestions.length - 1
          : Math.max(index - 1, 0),
      );
      return;
    }
    if (!popupOpen && event.key === "Enter" && canSubmit) onSubmit();
  };

  let liveStatus = "";
  if (popupOpen && autocomplete.isLoading) liveStatus = "Searching places";
  else if (popupOpen && autocomplete.isError) {
    liveStatus = "Couldn’t search places";
  } else if (popupOpen && autocomplete.selectionError) {
    liveStatus = "Couldn’t select that place";
  } else if (popupOpen && autocomplete.suggestions.length === 0) {
    liveStatus = "No places found";
  } else if (popupOpen) {
    liveStatus = `${autocomplete.suggestions.length} places found`;
  }

  const renderedOptions = autocomplete.suggestions.map((suggestion, index) => (
    <button
      key={suggestion.placeId}
      id={optionId(index)}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={index === activeIndex}
      className={cn(
        "flex min-h-11 w-full flex-col justify-center px-3 py-2 text-left text-sm",
        index === activeIndex && "bg-muted text-foreground",
      )}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => void selectOption(suggestion, true)}
    >
      <span>{suggestion.name}</span>
      {suggestion.secondaryText ? (
        <span className="text-xs text-muted-foreground">
          {suggestion.secondaryText}
        </span>
      ) : null}
    </button>
  ));

  const renderedPopupState = autocomplete.isLoading ? (
    <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
      Searching places…
    </p>
  ) : autocomplete.isError ? (
    <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
      Couldn’t search places.
    </p>
  ) : autocomplete.suggestions.length === 0 ? (
    <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
      No places found.
    </p>
  ) : (
    <>
      {autocomplete.selectionError ? (
        <p className="min-h-11 px-3 py-2 text-sm text-muted-foreground">
          Couldn’t select that place. Choose it again or edit the note.
        </p>
      ) : null}
      {renderedOptions}
    </>
  );

  return (
    <div ref={rootRef} className="relative mt-4">
      <div className="relative flex items-center gap-3 border-b border-border/10 pb-2 transition-colors focus-within:border-primary/50">
        <FileText
          className="h-4 w-4 text-muted-foreground/50"
          aria-hidden="true"
        />
        <input
          ref={assignInputRef}
          type="text"
          aria-label="Transaction note"
          {...(placesEnabled
            ? {
                role: "combobox",
                "aria-autocomplete": "list",
                "aria-expanded": popupOpen,
                "aria-controls": popupOpen ? listboxId : undefined,
                "aria-activedescendant": activeOption
                  ? optionId(activeIndex)
                  : undefined,
              }
            : {})}
          className="flex-1 bg-transparent pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          placeholder="Add a note..."
          value={value}
          autoComplete="off"
          onChange={(event) => handleManualChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (
              !(next instanceof Node) ||
              !rootRef.current?.contains(next)
            ) {
              retireLifecycle();
            }
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear note"
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={handleClear}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {popupOpen ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface"
        >
          {renderedPopupState}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </span>
      {placesEnabled && value.trim() === "" ? (
        <div>
          <NearbyPlaceChips
            suggestions={places?.nearbySuggestions ?? []}
            isLoading={places?.isNearbyLoading ?? false}
            onPointerDown={(event) => event.preventDefault()}
            onSelect={handleNearbySelect}
          />
        </div>
      ) : null}
    </div>
  );
}
