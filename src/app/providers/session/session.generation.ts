let sessionTokenGeneration = 0;

/** Returns the current in-memory generation for token-owning async work. */
export function getSessionTokenGeneration(): number {
  return sessionTokenGeneration;
}

/**
 * Retires every token request started under the previous account/session.
 * Advance before publishing a replacement token or clearing the session.
 */
export function advanceSessionTokenGeneration(): number {
  sessionTokenGeneration += 1;
  return sessionTokenGeneration;
}
