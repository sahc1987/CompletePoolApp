import { calendarDateLabel, fromCalendarDate, toCalendarDate } from "../calendarDate";

describe("calendar dates", () => {
  it("round-trips the date the person picked", () => {
    expect(toCalendarDate(fromCalendarDate("2026-10-08")!)).toBe("2026-10-08");
    expect(toCalendarDate(fromCalendarDate("2024-02-29")!)).toBe("2024-02-29");
  });

  it("reads a picker Date by its local day, not UTC", () => {
    // 11pm local on the 8th is still the 8th, wherever the phone is.
    expect(toCalendarDate(new Date(2026, 9, 8, 23, 0))).toBe("2026-10-08");
    expect(toCalendarDate(new Date(2026, 9, 8, 0, 0))).toBe("2026-10-08");
  });

  it("refuses blanks and dates that don't exist", () => {
    expect(fromCalendarDate("")).toBeNull();
    expect(fromCalendarDate("2026-02-31")).toBeNull();
    expect(fromCalendarDate("10/08/2026")).toBeNull();
  });

  it("labels a date for display", () => {
    expect(calendarDateLabel("2026-10-08")).toBe("Oct 8, 2026");
  });
});
