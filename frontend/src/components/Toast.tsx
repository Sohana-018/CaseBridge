import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'error';
}

interface ToastContextType {
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Accessible live region for toast notifications */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => {
          let bg = 'bg-white text-[#101828] border-[#E4E7EC]';
          let icon = <CheckCircle2 className="w-4 h-4 text-[#067647] shrink-0" aria-hidden="true" />;
          if (t.type === 'error') {
            bg = 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]';
            icon = <AlertCircle className="w-4 h-4 text-[#B42318] shrink-0" aria-hidden="true" />;
          } else if (t.type === 'info') {
            bg = 'bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]';
            icon = <Info className="w-4 h-4 text-[#175CD3] shrink-0" aria-hidden="true" />;
          }
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border shadow-sm text-xs font-medium ${bg}`}
            >
              <div className="flex items-center gap-2">
                {icon}
                <span>{t.text}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-1 rounded hover:bg-black/5 text-current cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
