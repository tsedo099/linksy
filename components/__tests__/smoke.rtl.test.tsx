// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";

function Hello({ name }: { name: string }) {
  return <h1>Hello {name}</h1>;
}

describe("@testing-library/react smoke", () => {
  it("renders heading", () => {
    render(<Hello name="CI" />);
    expect(screen.getByRole("heading", { name: /hello ci/i })).toBeInTheDocument();
  });
});
