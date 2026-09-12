import { createContext, useContext, useCallback, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => remove(id), 4200);
  }, [remove]);

  const toast = useCallback(
    {
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    },
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="alert">
            {t.type === 'success' && <CheckCircle2 size={20} />}
            {t.type === 'error' && <AlertCircle size={20} />}
            {t.type === 'info' && <Info size={20} />}
            <span>{t.message}</span>
            <button className="toast__close" onClick={() => remove(t.id)} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
