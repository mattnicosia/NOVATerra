import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PageErrorBoundary from "@/components/shared/PageErrorBoundary";

// Suppress console.error noise from React's error boundary logging
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// A component that throws on demand
function Thrower({ shouldThrow = false }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <div>Normal content</div>;
}

describe("PageErrorBoundary", () => {
  it("renders children normally when no error occurs", () => {
    render(
      <PageErrorBoundary pageName="Takeoffs">
        <div>Child content here</div>
      </PageErrorBoundary>,
    );
    expect(screen.getByText("Child content here")).toBeTruthy();
  });

  it("catches errors and shows fallback UI with page name", () => {
    render(
      <PageErrorBoundary pageName="Takeoffs">
        <Thrower shouldThrow />
      </PageErrorBoundary>,
    );

    expect(screen.getByText("Takeoffs encountered an error")).toBeTruthy();
    expect(screen.getByText(/Your data is safe/)).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("uses fallback page name when pageName prop is omitted", () => {
    render(
      <PageErrorBoundary>
        <Thrower shouldThrow />
      </PageErrorBoundary>,
    );

    expect(screen.getByText("This page encountered an error")).toBeTruthy();
  });

  it("recovers when Try Again is clicked", () => {
    // Start with an error, then simulate recovery by re-rendering without throw
    const { rerender } = render(
      <PageErrorBoundary pageName="Plans">
        <Thrower shouldThrow />
      </PageErrorBoundary>,
    );

    // Fallback UI visible
    expect(screen.getByText("Plans encountered an error")).toBeTruthy();

    // We need to swap children to non-throwing before clicking retry,
    // otherwise the re-render will throw again immediately.
    // First click Try Again (resets hasError state)
    // But the same throwing child will re-throw. So we rerender with non-throwing child first,
    // which triggers componentDidUpdate and auto-resets.
    rerender(
      <PageErrorBoundary pageName="Plans">
        <Thrower shouldThrow={false} />
      </PageErrorBoundary>,
    );

    // componentDidUpdate detects children changed and resets error state
    expect(screen.getByText("Normal content")).toBeTruthy();
  });

  it("resets via Try Again button and re-renders children", () => {
    // We'll use a stateful wrapper to control throwing
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) throw new Error("Boom");
      return <div>Recovered</div>;
    }

    render(
      <PageErrorBoundary pageName="Reports">
        <ConditionalThrower />
      </PageErrorBoundary>,
    );

    expect(screen.getByText("Reports encountered an error")).toBeTruthy();

    // Stop throwing before clicking retry
    shouldThrow = false;

    fireEvent.click(screen.getByText("Try Again"));

    // After reset, children re-render without error
    expect(screen.getByText("Recovered")).toBeTruthy();
  });
});
