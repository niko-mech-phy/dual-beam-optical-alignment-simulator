import { Component, Fragment } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
  attempt: number;
}

/** Keeps a WebGL initialization failure local to the 3D viewport. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "The optical bench 3D view could not render.",
      error,
      info.componentStack,
    );
  }

  retry = () =>
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));

  render() {
    if (this.state.failed)
      return (
        <div
          role="alert"
          style={{
            height: "100%",
            minHeight: 260,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            boxSizing: "border-box",
            background: "#0c171e",
            color: "#c8dbe3",
            textAlign: "center",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <svg
            width="42"
            height="42"
            viewBox="0 0 42 42"
            fill="none"
            aria-hidden="true"
            style={{ marginBottom: 18, color: "#86b8ce" }}
          >
            <path
              d="M21 4 36 12.5v17L21 38 6 29.5v-17L21 4Z M6 12.5 21 21l15-8.5 M21 21v17"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="m11 8 20 25" stroke="#0c171e" strokeWidth="7" />
            <path d="m11 8 20 25" stroke="#86b8ce" strokeWidth="1.5" />
          </svg>
          <strong style={{ color: "#edf5f8", fontSize: 17, fontWeight: 550 }}>
            The 3D view could not start
          </strong>
          <p
            style={{
              maxWidth: 370,
              color: "#91a9b5",
              fontSize: 13,
              lineHeight: 1.65,
              margin: "12px 0 20px",
            }}
          >
            This optical bench requires a browser with WebGL 2. Enable hardware
            acceleration, or use a browser that supports WebGL 2, then retry.
          </p>
          <button
            type="button"
            onClick={this.retry}
            style={{
              background: "#d0e9e0",
              color: "#143b35",
              border: 0,
              borderRadius: 7,
              padding: "10px 18px",
              font: "600 12px Inter, system-ui, sans-serif",
              cursor: "pointer",
            }}
          >
            Retry 3D view
          </button>
        </div>
      );
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
