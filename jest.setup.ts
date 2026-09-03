import "@testing-library/jest-dom";

// The suite asserts on wall-clock behaviour in a fixed business zone, so pin
// the host zone to something else — a test that passes here passes on a UTC
// CI box too, and a timezone bug can't hide behind a matching local clock.
process.env.TZ = "UTC";
