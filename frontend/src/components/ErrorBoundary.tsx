import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render errors anywhere below it so a single bad component never blanks the app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BrewIQ caught an error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-4xl">☕💥</div>
          <h2 className="text-lg font-bold text-cream">Something brewed wrong</h2>
          <p className="max-w-sm text-sm text-tan">
            A component hit an unexpected error. Your data is safe — reload to continue.
          </p>
          <button onClick={() => this.setState({ error: null })} className="btn mt-1">
            <RotateCcw size={15} /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
