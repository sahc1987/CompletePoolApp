import { StyleSheet, Text } from "react-native";
import {
  READINGS,
  READING_KEYS,
  readingStatus,
  readingTarget,
  type ReadingKey,
  type WaterTestReading,
} from "@contracts/waterTest";
import { color, type } from "@/ui/theme";

/**
 * A reading's value, marked when it is outside the target range. The arrow and
 * the word carry the meaning as well as the colour, so it doesn't depend on
 * seeing red.
 */
export function ReadingValue({ k, value }: { k: ReadingKey; value: number | null }) {
  if (value === null) return <Text style={s.none}>—</Text>;
  const status = readingStatus(k, value);
  if (status === "ok") return <Text style={s.ok}>{value}</Text>;
  return (
    <Text
      style={s.flag}
      accessibilityLabel={`${value}, ${status}. Target ${readingTarget(k)}`}
    >
      {value} {status === "low" ? "▼ low" : "▲ high"}
    </Text>
  );
}

/** "Free chlorine 2.5 · pH 7.4 …" on one wrapping line, for a compact history row. */
export function ReadingLine({ reading }: { reading: WaterTestReading }) {
  const present = READING_KEYS.filter((k) => reading[k] !== null);
  return (
    <Text style={s.line}>
      {present.map((k, i) => (
        <Text key={k}>
          {i > 0 ? "  ·  " : ""}
          {READINGS[k].label.replace("Total alkalinity", "Alkalinity").replace("Stabilizer (CYA)", "CYA")}{" "}
          <ReadingValue k={k} value={reading[k]} />
        </Text>
      ))}
    </Text>
  );
}

const s = StyleSheet.create({
  none: { ...type.small, color: color.faint },
  ok: { ...type.bodyStrong, color: color.ink },
  flag: { ...type.bodyStrong, color: color.danger },
  line: { ...type.small, color: color.muted, lineHeight: 20 },
});
