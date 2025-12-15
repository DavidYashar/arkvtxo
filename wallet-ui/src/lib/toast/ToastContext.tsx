'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastContextType, ToastType } from './types';

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const show = useCallback((
    message: string,
    type: ToastType = 'info',
    duration: number = 4000,
    options?: Partial<Toast>
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = {
      id,
      message,
      type,
      duration,
      persistent: options?.persistent || false,
      action: options?.action,
    };

    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss if not persistent
    if (!newToast.persistent && duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }
  }, []);

  const confirm = useCallback((
    message: string,
    onConfirm: () => void,
    onCancel?: () => void
  ) => {
    setConfirmDialog({
      message,
      onConfirm,
      onCancel: onCancel || (() => {}),
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const handleConfirm = () => {
    if (confirmDialog) {
      confirmDialog.onConfirm();
      setConfirmDialog(null);
    }
  };

  const handleCancel = () => {
    if (confirmDialog) {
      confirmDialog.onCancel();
      setConfirmDialog(null);
    }
  };

  return (
    <ToastContext.Provider value={{ show, confirm, dismiss, dismissAll }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-0 left-0 right-0 z-[9999] w-full pointer-events-none">
        <div className="flex flex-col items-center w-full px-4 sm:px-6 pointer-events-auto">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Action</h3>
              </div>
              <p className="text-gray-700">{confirmDialog.message}</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-md"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

// Toast Item Component
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [progress, setProgress] = useState(100);

  React.useEffect(() => {
    if (!toast.persistent && toast.duration && toast.duration > 0) {
      const interval = 50;
      const decrement = (interval / toast.duration) * 100;
      
      const timer = setInterval(() => {
        setProgress((prev) => {
          const next = prev - decrement;
          return next <= 0 ? 0 : next;
        });
      }, interval);

      return () => clearInterval(timer);
    }
  }, [toast.duration, toast.persistent]);

  const colors = {
    success: {
      bg: 'from-green-500 to-green-600',
      icon: 'text-white',
      progress: 'bg-green-300',
    },
    error: {
      bg: 'from-red-500 to-red-600',
      icon: 'text-white',
      progress: 'bg-red-300',
    },
    info: {
      bg: 'from-blue-600 to-blue-800',
      icon: 'text-white',
      progress: 'bg-blue-300',
    },
    warning: {
      bg: 'from-yellow-500 to-yellow-600',
      icon: 'text-white',
      progress: 'bg-yellow-300',
    },
  };

  const icons = {
    success: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  const color = colors[toast.type];

  return (
    <div className="w-full max-w-md sm:max-w-lg animate-slide-down mt-2">
      <div className={`bg-gradient-to-r ${color.bg} rounded-b-xl sm:rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm mx-auto`}>
        <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3">
          <div className={`${color.icon} flex-shrink-0`}>
            {icons[toast.type]}
          </div>
          <p className="text-white font-medium flex-1 text-sm sm:text-base break-words">{toast.message}</p>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
              className="text-white/90 hover:text-white font-semibold text-sm underline whitespace-nowrap"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-white/70 hover:text-white transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {!toast.persistent && toast.duration && toast.duration > 0 && (
          <div className="h-1 bg-white/20">
            <div
              className={`h-full ${color.progress} transition-all duration-50 ease-linear`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    // Fallback to alert if toast context not available
    return {
      show: (message: string) => alert(message),
      confirm: (message: string, onConfirm: () => void) => {
        if (confirm(message)) onConfirm();
      },
      dismiss: () => {},
      dismissAll: () => {},
    };
  }
  return context;
}
