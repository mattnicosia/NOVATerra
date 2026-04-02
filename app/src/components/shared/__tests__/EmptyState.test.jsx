import { vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmptyState from "@/components/shared/EmptyState";

// Mock useTheme to return minimal token structure
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    accent: "#3B82F6",
    text: "#111",
    textMuted: "#666",
    T: {
      space: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40],
      fontSize: { xs: 12, sm: 13, base: 14, lg: 18 },
      fontWeight: { semibold: 600 },
      lineHeight: { normal: 1.5 },
      radius: { full: 9999, md: 8, lg: 12 },
      font: { sans: "Switzer, sans-serif" },
      glass: { blurLight: "blur(8px)", specular: "none", edge: "none", blur: "blur(8px)" },
    },
  }),
}));

// Mock Ic icon component
vi.mock("@/components/shared/Ic", () => ({
  default: ({ d }) => <span data-testid="icon">{d}</span>,
}));

describe("EmptyState", () => {
  it("renders title text", () => {
    render(<EmptyState title="No items yet" />);
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });

  it("renders subtitle text", () => {
    render(<EmptyState title="Empty" subtitle="Add your first item to get started" />);
    expect(screen.getByText("Add your first item to get started")).toBeInTheDocument();
  });

  it("renders action button when action prop is provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={onClick}
        actionLabel="Create Item"
      />,
    );
    expect(screen.getByText("Create Item")).toBeInTheDocument();
  });

  it("action button triggers onClick callback", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={onClick}
        actionLabel="Create Item"
      />,
    );
    fireEvent.click(screen.getByText("Create Item"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders without action button when action prop is not provided", () => {
    render(<EmptyState title="Nothing here" subtitle="Just a message" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
