import { vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Fld from "@/components/shared/Fld";

// Mock useTheme to return minimal token structure
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    textDim: "#999",
    T: {
      space: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40],
      fontSize: { xs: 12 },
      fontWeight: { semibold: 600 },
      tracking: { wide: "0.05em" },
    },
  }),
}));

describe("Fld", () => {
  it("renders with a label", () => {
    render(
      <Fld label="Project Name">
        <input />
      </Fld>,
    );
    expect(screen.getByText("Project Name")).toBeInTheDocument();
  });

  it("renders an input element passed as children", () => {
    render(
      <Fld label="Email">
        <input data-testid="email-input" />
      </Fld>,
    );
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
  });

  it("displays the value of a controlled input", () => {
    render(
      <Fld label="Name">
        <input data-testid="name-input" value="Matt" readOnly />
      </Fld>,
    );
    expect(screen.getByTestId("name-input").value).toBe("Matt");
  });

  it("calls onChange when input value changes", () => {
    const onChange = vi.fn();
    render(
      <Fld label="City">
        <input data-testid="city-input" onChange={onChange} />
      </Fld>,
    );
    fireEvent.change(screen.getByTestId("city-input"), {
      target: { value: "New York" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows error styling when error class is applied to child", () => {
    render(
      <Fld label="Budget">
        <input data-testid="budget-input" className="error" aria-invalid="true" />
      </Fld>,
    );
    const input = screen.getByTestId("budget-input");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className).toContain("error");
  });
});
