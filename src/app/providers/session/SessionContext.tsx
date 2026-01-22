import { createContext } from "react";
import type { SessionContextValue } from "./session.types";

export const SessionContext = createContext<SessionContextValue | null>(null);

