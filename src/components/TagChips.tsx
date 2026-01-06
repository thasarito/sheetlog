interface TagChipsProps {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}

export function TagChips({ tags, selected, onToggle }: TagChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isActive = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground"
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
