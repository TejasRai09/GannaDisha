import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (title: string, type?: ToastType, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, type: ToastType = 'info', message?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);

      // Auto dismiss after 3600ms
      setTimeout(() => {
        removeToast(id);
      }, 3600);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Fixed bottom-right toast stack */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full"
      >
        {toasts.map((toast) => {
          let Icon = Info;
          let iconColor = 'text-(--accent)';
          let borderColor = 'border-(--border)';

          if (toast.type === 'success') {
            Icon = CheckCircle2;
            iconColor = 'text-emerald-600 dark:text-emerald-400';
            borderColor = 'border-emerald-500/20';
          } else if (toast.type === 'warning') {
            Icon = AlertTriangle;
            iconColor = 'text-amber-500';
            borderColor = 'border-amber-500/20';
          } else if (toast.type === 'error') {
            Icon = AlertCircle;
            iconColor = 'text-rose-600 dark:text-rose-400';
            borderColor = 'border-rose-500/20';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto bg-(--surface-card) border ${borderColor} text-(--text-primary) p-3 rounded-[10px] shadow-(--shadow-lg) flex items-start gap-3 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}
            >
              <Icon className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-(--text-primary) leading-tight">
                  {toast.title}
                </div>
                {toast.message && (
                  <div className="text-[12px] text-(--text-secondary) mt-0.5 leading-snug">
                    {toast.message}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-(--text-muted) hover:text-(--text-primary) p-0.5 rounded-[4px] hover:bg-(--surface-sunken) transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
