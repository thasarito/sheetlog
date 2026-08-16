let fallbackSequence = 0;

export function createPlaceSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  fallbackSequence += 1;
  return `place-${Date.now()}-${fallbackSequence}`;
}
