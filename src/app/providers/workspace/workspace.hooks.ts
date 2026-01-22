import { useContext } from "react";
import { WorkspaceContext } from "./WorkspaceContext";
import type { WorkspaceContextValue } from "./workspace.types";

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}

