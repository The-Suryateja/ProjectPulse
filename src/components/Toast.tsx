import { useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export default function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="flex items-start gap-3 bg-white border border-red-200 shadow-lg rounded-lg p-4">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 flex-1">{message}</p>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
