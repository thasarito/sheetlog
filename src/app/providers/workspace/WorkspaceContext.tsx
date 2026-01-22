import { createContext } from "react";
import type { WorkspaceContextValue } from "./workspace.types";

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null
);

