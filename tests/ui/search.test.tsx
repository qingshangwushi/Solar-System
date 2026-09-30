import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("celestial search and selection", () => {
  it("searches Saturn and Titan by name and selects the exact result", () => {
    render(<App />);
    const search = screen.getByLabelText("Search celestial bodies");
    fireEvent.change(search, { target: { value: "Saturn" } });
    const saturn = screen.getByRole("button", { name: /Saturn/ });
    fireEvent.click(saturn);
    expect(screen.getByTestId("scene-target").textContent).toBe("saturn");
    fireEvent.change(search, { target: { value: "Titan" } });
    fireEvent.click(screen.getByRole("button", { name: /Titan/ }));
    expect(screen.getByTestId("scene-target").textContent).toBe("titan");
  });

  it("keeps duplicate names disambiguated by official name", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Search celestial bodies"), { target: { value: "Europa" } });
    const results = screen.getAllByRole("button", { name: /Europa/ });
    expect(results).toHaveLength(2);
    expect(within(results[0]!).getByText(/moon|asteroid/i)).toBeTruthy();
  });
});
