import "./playful-followup.css";

export function SheetLogLogo({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-testid="sheetlog-logo"
      className={className}
    />
  );
}
