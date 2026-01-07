type AccountButtonsProps = {
  accounts: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  isDisabled?: (value: string) => boolean;
};

export function AccountButtons({ accounts, selected, onSelect, isDisabled }: AccountButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((item) => {
        const isActive = selected === item;
        const disabled = isDisabled?.(item) ?? false;
        return (
          <button
            key={item}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              isActive ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground'
            } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
            onClick={() => onSelect(item)}
            aria-pressed={isActive}
            disabled={disabled}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
