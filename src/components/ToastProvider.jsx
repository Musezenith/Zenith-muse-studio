import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

function ToastItem({ toast, onClose }) {
  const toneClass =
    toast.type === "error"
      ? "border-red-900/60 bg-red-950/90 text-red-100"
      : toast.type === "success"
      ? "border-emerald-900/60 bg-emerald-950/90 text-emerald-100"
      : "border-neutral-700 bg-neutral-900/95 text-neutral-100";

  return (
    <div
      className={`min-w-[260px] max-w-sm rounded-xl border px-3 py-2 text-sm shadow-xl ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="break-words [overflow-wrap:anywhere]">{toast.message}</div>
        <button
          onClick={() => onClose(toast.id)}
          className="rounded px-1 text-xs text-neutral-300 hover:text-white"
        >
          x
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((existing) => existing.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((message, type = "info", ttlMs = 3200) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    setToasts((existing) => [...existing, { id, message, type }]);
    setTimeout(() => dismissToast(id), ttlMs);
  }, [dismissToast]);

  const value = useMemo(
    () => ({
      info: (message, ttlMs) => pushToast(message, "info", ttlMs),
      success: (message, ttlMs) => pushToast(message, "success", ttlMs),
      error: (message, ttlMs) => pushToast(message, "error", ttlMs),
    }),
    [pushToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onClose={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      info: () => {},
      success: () => {},
      error: () => {},
    };
  }
  return context;
}
