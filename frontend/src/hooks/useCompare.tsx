import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const MAX_COMPARE = 5;

interface CompareState {
  selected: string[];
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  toggle: (symbol: string) => void;
  clear: () => void;
  has: (symbol: string) => boolean;
  isFull: boolean;
}

const CompareContext = createContext<CompareState | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);

  const add = useCallback((symbol: string) => {
    setSelected((prev) => {
      if (prev.includes(symbol) || prev.length >= MAX_COMPARE) return prev;
      return [...prev, symbol];
    });
  }, []);

  const remove = useCallback((symbol: string) => {
    setSelected((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const toggle = useCallback((symbol: string) => {
    setSelected((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, symbol];
    });
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const has = useCallback((symbol: string) => selected.includes(symbol), [selected]);

  return (
    <CompareContext.Provider
      value={{ selected, add, remove, toggle, clear, has, isFull: selected.length >= MAX_COMPARE }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare(): CompareState {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within CompareProvider");
  return ctx;
}
