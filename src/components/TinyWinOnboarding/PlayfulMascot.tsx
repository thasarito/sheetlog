import "./playful.css";

type MascotMode = "bank" | "install";

export function PlayfulMascot({
  mode = "bank",
  accountMark = "S",
}: {
  mode?: MascotMode;
  accountMark?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`tiny-win-mascot-scene tiny-win-mascot-scene--${mode}`}
      data-testid="tiny-win-mascot"
    >
      <span className="tiny-win-spark tiny-win-spark--coral">✦</span>
      <span className="tiny-win-spark tiny-win-spark--blue">●</span>
      <span className="tiny-win-spark tiny-win-spark--violet">＋</span>
      <div className="tiny-win-mascot-body">
        <span className="tiny-win-mascot-ear" />
        <span className="tiny-win-mascot-eye tiny-win-mascot-eye--left" />
        <span className="tiny-win-mascot-eye tiny-win-mascot-eye--right" />
        <span className="tiny-win-mascot-smile" />
        <span className="tiny-win-mascot-arm tiny-win-mascot-arm--left" />
        <span className="tiny-win-mascot-arm tiny-win-mascot-arm--right" />
        {mode === "install" ? (
          <span className="tiny-win-mascot-phone">
            <span>S</span>
          </span>
        ) : (
          <span className="tiny-win-mascot-card">S</span>
        )}
      </div>
      {mode === "install" ? (
        <span className="tiny-win-account-bubble">{accountMark}</span>
      ) : null}
    </div>
  );
}

const CONFETTI = [
  [8, 0, "coral"],
  [17, 120, "blue"],
  [28, 60, "yellow"],
  [39, 180, "violet"],
  [51, 30, "green"],
  [62, 150, "coral"],
  [73, 90, "blue"],
  [84, 210, "yellow"],
  [93, 45, "violet"],
] as const;

export function PlayfulSuccessArt() {
  return (
    <div
      aria-hidden="true"
      className="tiny-win-success-art"
      data-testid="tiny-win-success-art"
    >
      <div className="tiny-win-confetti" aria-hidden="true">
        {CONFETTI.map(([left, delay, tone]) => (
          <span
            key={`${left}-${tone}`}
            className={`tiny-win-confetti-piece tiny-win-confetti-piece--${tone}`}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </div>
      <span className="tiny-win-success-ring">✓</span>
      <span className="tiny-win-success-icon">S</span>
      <span className="tiny-win-success-spark tiny-win-success-spark--one">✦</span>
      <span className="tiny-win-success-spark tiny-win-success-spark--two">●</span>
      <span className="tiny-win-success-spark tiny-win-success-spark--three">＋</span>
    </div>
  );
}
