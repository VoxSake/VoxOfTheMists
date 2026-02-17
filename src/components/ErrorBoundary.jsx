import { Component } from "react";

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error(`[ErrorBoundary] ${this.props.name || "Section"} crashed:`, error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <section className="card error-card">
                    <div className="error-content">
                        <p className="error-icon">⚠️</p>
                        <h3>{this.props.name || "Section"} encountered an error</h3>
                        <p className="muted">{this.state.error?.message || "An unexpected error occurred."}</p>
                        <button
                            className="btn ghost"
                            onClick={() => this.setState({ hasError: false, error: null })}
                        >
                            Try Again
                        </button>
                    </div>
                </section>
            );
        }

        return this.props.children;
    }
}
