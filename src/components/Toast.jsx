import { useToast } from "../hooks/useToast.jsx";

export function ToastContainer() {
    const { toasts, dismissToast } = useToast();

    if (!toasts.length) return null;

    return (
        <div className="toast-container" role="region" aria-label="Notifications">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`toast toast-${toast.variant || "default"}`}
                    role="alert"
                >
                    <div className="toast-body">
                        {toast.title ? <p className="toast-title">{toast.title}</p> : null}
                        {toast.description ? (
                            <p className="toast-description">{toast.description}</p>
                        ) : null}
                    </div>
                    <button
                        className="toast-close"
                        onClick={() => dismissToast(toast.id)}
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
