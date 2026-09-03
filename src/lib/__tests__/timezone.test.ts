/**
 * @jest-environment node
 */
import {
  zonedParts,
  zonedTimeToUtc,
  parseZonedDateTime,
  parseZonedDate,
  zonedDayStart,
  addZonedDays,
  minutesIntoZonedDay,
  zonedDayKey,
  zonedDayOfWeek,
  zonedWeekStart,
  zonedMonthStart,
} from "../timezone";

const NY = "America/New_York";
const PHX = "America/Phoenix"; // no DST — a useful control
const LA = "America/Los_Angeles";

describe("zonedParts", () => {
  it("reads an instant on the business wall clock, not the host's", () => {
    // 2024-07-04 16:30 UTC is 12:30 in New York (EDT, UTC-4).
    expect(zonedParts(new Date("2024-07-04T16:30:00Z"), NY)).toEqual({
      year: 2024,
      month: 7,
      day: 4,
      hour: 12,
      minute: 30,
      second: 0,
    });
  });

  it("rolls the date back when the zone is behind UTC midnight", () => {
    // 03:00 UTC on the 5th is still 23:00 on the 4th in New York.
    const p = zonedParts(new Date("2024-07-05T03:00:00Z"), NY);
    expect([p.year, p.month, p.day, p.hour]).toEqual([2024, 7, 4, 23]);
  });

  it("normalises midnight to hour 0 rather than Intl's 24", () => {
    expect(zonedParts(new Date("2024-07-04T04:00:00Z"), NY).hour).toBe(0);
  });
});

describe("zonedTimeToUtc", () => {
  it("resolves a summer (DST) wall time", () => {
    // 09:00 EDT = 13:00 UTC.
    expect(zonedTimeToUtc(2024, 7, 4, 9, 0, NY).toISOString()).toBe(
      "2024-07-04T13:00:00.000Z"
    );
  });

  it("resolves a winter (standard time) wall time", () => {
    // 09:00 EST = 14:00 UTC.
    expect(zonedTimeToUtc(2024, 1, 15, 9, 0, NY).toISOString()).toBe(
      "2024-01-15T14:00:00.000Z"
    );
  });

  it("is stable in a zone that never shifts", () => {
    expect(zonedTimeToUtc(2024, 7, 4, 9, 0, PHX).toISOString()).toBe(
      "2024-07-04T16:00:00.000Z"
    );
    expect(zonedTimeToUtc(2024, 1, 15, 9, 0, PHX).toISOString()).toBe(
      "2024-01-15T16:00:00.000Z"
    );
  });

  it("lands on the right side of the spring-forward boundary", () => {
    // DST starts 2024-03-10 at 02:00 local. A 09:00 job that day is EDT.
    const d = zonedTimeToUtc(2024, 3, 10, 9, 0, NY);
    expect(d.toISOString()).toBe("2024-03-10T13:00:00.000Z");
    // Round-trips: reading it back gives the wall time we asked for.
    expect(minutesIntoZonedDay(d, NY)).toBe(9 * 60);
  });

  it("lands on the right side of the fall-back boundary", () => {
    // DST ends 2024-11-03 at 02:00 local. A 09:00 job that day is EST.
    const d = zonedTimeToUtc(2024, 11, 3, 9, 0, NY);
    expect(d.toISOString()).toBe("2024-11-03T14:00:00.000Z");
    expect(minutesIntoZonedDay(d, NY)).toBe(9 * 60);
  });

  it("round-trips every hour across both DST transitions", () => {
    for (const day of [[2024, 3, 10] as const, [2024, 11, 3] as const]) {
      for (let hour = 4; hour < 24; hour++) {
        const d = zonedTimeToUtc(day[0], day[1], day[2], hour, 0, NY);
        expect(minutesIntoZonedDay(d, NY)).toBe(hour * 60);
      }
    }
  });

  it("normalises an overflowing day into the next month", () => {
    // addZonedDays leans on this: June 31st means July 1st.
    expect(zonedDayKey(zonedTimeToUtc(2024, 6, 31, 0, 0, NY), NY)).toBe("2024-07-01");
  });
});

describe("parseZonedDateTime", () => {
  it("parses a date and time as business-local", () => {
    expect(parseZonedDateTime("2024-07-04", "09:00", NY)?.toISOString()).toBe(
      "2024-07-04T13:00:00.000Z"
    );
  });

  it("accepts a single-digit hour and tolerates surrounding whitespace", () => {
    expect(parseZonedDateTime(" 2024-07-04 ", " 9:30 ", NY)?.toISOString()).toBe(
      "2024-07-04T13:30:00.000Z"
    );
  });

  it.each([
    ["7/4/2024", "09:00"],
    ["2024-7-4", "09:00"],
    ["", "09:00"],
    ["2024-07-04", "9am"],
    ["2024-07-04", "0900"],
    ["2024-07-04", ""],
  ])("rejects malformed input (%s, %s)", (date, time) => {
    expect(parseZonedDateTime(date, time, NY)).toBeNull();
  });

  it.each([
    ["24:00"],
    ["25:30"],
    ["09:60"],
  ])("rejects out-of-range time %s", (time) => {
    expect(parseZonedDateTime("2024-07-04", time, NY)).toBeNull();
  });

  it("parses a bare date as local midnight", () => {
    expect(parseZonedDate("2024-07-04", NY)?.toISOString()).toBe(
      "2024-07-04T04:00:00.000Z"
    );
  });
});

describe("day and week boundaries", () => {
  it("zonedDayStart snaps to local midnight, not UTC midnight", () => {
    // Late evening local on the 4th, already the 5th in UTC.
    expect(zonedDayStart(new Date("2024-07-05T03:00:00Z"), NY).toISOString()).toBe(
      "2024-07-04T04:00:00.000Z"
    );
  });

  it("addZonedDays keeps midnight across a DST change", () => {
    // Mar 9 -> Mar 11 spans spring-forward; both ends must still be midnight.
    const start = zonedDayStart(new Date("2024-03-09T12:00:00Z"), NY);
    const after = addZonedDays(start, 2, NY);
    expect(zonedDayKey(after, NY)).toBe("2024-03-11");
    expect(minutesIntoZonedDay(after, NY)).toBe(0);
    // 47 hours of real time, not 48 — the clock skipped one.
    expect(after.getTime() - start.getTime()).toBe(47 * 3600_000);
  });

  it("addZonedDays walks backwards over a month boundary", () => {
    const d = addZonedDays(new Date("2024-07-02T12:00:00Z"), -5, NY);
    expect(zonedDayKey(d, NY)).toBe("2024-06-27");
  });

  it("minutesIntoZonedDay measures from local midnight", () => {
    expect(minutesIntoZonedDay(new Date("2024-07-04T17:45:00Z"), NY)).toBe(13 * 60 + 45);
    // Same instant, different zone: 10:45 in Los Angeles.
    expect(minutesIntoZonedDay(new Date("2024-07-04T17:45:00Z"), LA)).toBe(10 * 60 + 45);
  });

  it("zonedDayKey zero-pads month and day", () => {
    expect(zonedDayKey(new Date("2024-01-05T18:00:00Z"), NY)).toBe("2024-01-05");
  });

  it("zonedDayOfWeek reports the local weekday", () => {
    // 2024-07-04 was a Thursday.
    expect(zonedDayOfWeek(new Date("2024-07-04T18:00:00Z"), NY)).toBe(4);
    // 02:00 UTC Monday is still Sunday evening in New York.
    expect(zonedDayOfWeek(new Date("2024-07-08T02:00:00Z"), NY)).toBe(0);
  });

  it("zonedWeekStart returns Monday midnight", () => {
    const monday = zonedWeekStart(new Date("2024-07-04T18:00:00Z"), NY); // Thursday
    expect(zonedDayKey(monday, NY)).toBe("2024-07-01");
    expect(zonedDayOfWeek(monday, NY)).toBe(1);
    expect(minutesIntoZonedDay(monday, NY)).toBe(0);
  });

  it("zonedWeekStart treats Sunday as the end of the week, not the start", () => {
    const sunday = new Date("2024-07-07T18:00:00Z");
    expect(zonedDayKey(zonedWeekStart(sunday, NY), NY)).toBe("2024-07-01");
  });

  it("zonedWeekStart is idempotent on a Monday", () => {
    const monday = zonedWeekStart(new Date("2024-07-04T18:00:00Z"), NY);
    expect(zonedWeekStart(monday, NY).getTime()).toBe(monday.getTime());
  });

  it("zonedMonthStart returns the 1st at local midnight", () => {
    const m = zonedMonthStart(new Date("2024-07-24T18:00:00Z"), NY);
    expect(m.toISOString()).toBe("2024-07-01T04:00:00.000Z");
  });

  it("zonedMonthStart uses the local month near a boundary", () => {
    // 01:00 UTC Aug 1 is still July 31 in New York.
    expect(zonedDayKey(zonedMonthStart(new Date("2024-08-01T01:00:00Z"), NY), NY)).toBe(
      "2024-07-01"
    );
  });
});
