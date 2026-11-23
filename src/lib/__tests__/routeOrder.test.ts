/** @jest-environment node */
import { routeLength, suggestOrder } from "../routeOrder";

const p = (id: string, lat: number, lng: number) => ({ id, lat, lng });

test("keeps the first stop and visits the nearest next", () => {
  // a is the start; c is next to a, b is far away.
  const pts = [p("a", 0, 0), p("b", 0, 1), p("c", 0, 0.1)];
  expect(suggestOrder(pts)).toEqual(["a", "c", "b"]);
  expect(routeLength([pts[0], pts[2], pts[1]])).toBeLessThan(routeLength(pts) + 1e-9);
});

test("fewer than three stops are left alone", () => {
  expect(suggestOrder([p("a", 0, 0), p("b", 5, 5)])).toEqual(["a", "b"]);
});
