"use client";
import { createContext, useCallback, useContext, useState } from "react";

type Kind = "success" | "error" | "info";
interface ToastItem { id: number; message: string; kind: Kind }

const Ctx = createContext<(message: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Lightweight toast stack. Auto-dismisses; errors stay a little longer. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), kind === "error" ? 6000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => setItems((c) => c.filter((x) => x.id !== t.id))}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
