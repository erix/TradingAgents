import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

type ActiveRunContextValue = {
  activeRun: any | null;
  activeRunId: string | null;
  setActiveRun: (run: any | null) => void;
  setActiveRunId: (runId: string | null) => void;
};

const ActiveRunContext = createContext<ActiveRunContextValue | null>(null);

export function ActiveRunProvider({ children }: { children: ReactNode }) {
  const [activeRun, setActiveRun] = useState<any | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const value = useMemo(
    () => ({ activeRun, activeRunId, setActiveRun, setActiveRunId }),
    [activeRun, activeRunId]
  );

  return <ActiveRunContext.Provider value={value}>{children}</ActiveRunContext.Provider>;
}

export function useActiveRun() {
  const context = useContext(ActiveRunContext);
  if (!context) {
    throw new Error("useActiveRun must be used inside ActiveRunProvider");
  }
  return context;
}
