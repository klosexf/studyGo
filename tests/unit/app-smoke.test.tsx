import "fake-indexeddb/auto";

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import HomePage from "@/app/page";

it("renders the empty dashboard", async () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { name: "训练仪表盘" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: "开始第一次训练" }),
  ).toHaveAttribute("href", "/training");
});
