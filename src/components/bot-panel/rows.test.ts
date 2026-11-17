import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NavRow } from "./rows";

const VALUE = "google-calendar, gmail, notion, slack, linear, github";
const valued = () => renderToStaticMarkup(createElement(NavRow, { title: "Apps it can use", value: VALUE, onClick: () => {} }));

it("keeps room for the title on a phone and lets a long value shrink instead", () => {
  const html = valued();
  expect(html).toMatch(/<div class="[^"]*\bmax-w-\[65%\] shrink-0\b[^"]*">/);
  expect(html).toMatch(/<span class="[^"]*\bmin-w-0\b[^"]*">/);
});

it("puts the ellipsis on the value text itself, so it also shows in Firefox", () => {
  expect(valued()).toMatch(new RegExp(`<span class="[^"]*\\btruncate\\b[^"]*">${VALUE}</span>`));
});
