// Toast notification types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  persistent?: boolean;
  action?: ToastAction;
}

export interface ToastContextType {
  show: (message: string, type?: ToastType, duration?: number, options?: Partial<Toast>) => void;
  confirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}
