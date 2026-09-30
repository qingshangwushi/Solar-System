import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("App", () => {
  it("shows the guide title inside the main application region", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Solar System Atlas" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
