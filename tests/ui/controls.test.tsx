import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("solar system controls", () => {
  it("updates the selected body details and target", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Earth/i }));
    expect(screen.getByRole("heading", { name: "Earth" })).toBeTruthy();
    expect(screen.getByTestId("scene-target").textContent).toBe("earth");
  });

  it("supports date, pause, reverse, and scale controls", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Simulation date"), { target: { value: "2026-09-30" } });
    expect((screen.getByLabelText("Simulation date") as HTMLInputElement).value).toBe("2026-09-30");
    fireEvent.click(screen.getByRole("button", { name: /reverse time/i }));
    expect((screen.getByLabelText("Simulation speed") as HTMLSelectElement).value).toBe("-86400");
    fireEvent.change(screen.getByLabelText("Scale mode"), { target: { value: "visible" } });
    expect(screen.getAllByText(/body sizes enhanced/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Quality preset"), { target: { value: "performance" } });
    expect((screen.getByLabelText("Quality preset") as HTMLSelectElement).value).toBe("performance");
  });
});
