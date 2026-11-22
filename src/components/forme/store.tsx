import { createContext, useContext, useEffect, useReducer, useState, type Dispatch, type ReactNode } from "react";
import { initialState, parseStored, reducer, STORAGE_KEY, type Action, type StudioState } from "@/lib/forme/state";

interface StudioCtx {
  state: StudioState;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
}

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      dispatch({ type: "hydrate", state: parseStored(window.localStorage.getItem(STORAGE_KEY)) });
    } catch {
      /* storage unavailable: keep defaults */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }, [state, hydrated]);

  return <Ctx.Provider value={{ state, dispatch, hydrated }}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio must be used inside StudioProvider");
  return ctx;
}
