import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { untickedCount, type ChecklistEntry } from "@contracts/checklist";
import { ApiError } from "@/api/client";
import { saveChecklist } from "@/offline/outbox";
import { Body, Card, Heading } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

/**
 * The service's checklist for this job. Ticks save by themselves a moment after
 * the last tap (and when the screen is left), through the offline outbox, so it
 * works with no signal. It's a reminder: nothing here blocks submitting.
 */
const SAVE_DELAY_MS = 600;

export function ChecklistCard({
  taskId,
  items,
  onChange,
}: {
  taskId: string;
  items: ChecklistEntry[];
  onChange: (items: ChecklistEntry[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(items);
  latest.current = items;

  const push = async (list: ChecklistEntry[]) => {
    try {
      await saveChecklist(taskId, list.filter((i) => i.done).map((i) => i.id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the checklist. Try again.");
    }
  };

  // Leaving the screen inside the delay must not drop the last tap.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveChecklist(taskId, latest.current.filter((i) => i.done).map((i) => i.id)).catch(() => {});
      }
    },
    [taskId]
  );

  const toggle = (id: string) => {
    const next = items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
    onChange(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void push(next);
    }, SAVE_DELAY_MS);
  };

  const left = untickedCount(items);

  return (
    <Card>
      <Heading>Checklist</Heading>
      <Body tone="muted">
        {left === 0 ? "All done." : `${items.length - left} of ${items.length} ticked.`}
      </Body>
      <View style={{ marginTop: space.md }}>
        {items.map((i) => (
          <Pressable
            key={i.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: i.done }}
            accessibilityLabel={i.label}
            onPress={() => toggle(i.id)}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          >
            <Text style={[s.box, i.done && { color: color.teal700 }]}>{i.done ? "☑" : "☐"}</Text>
            <Text style={[s.label, i.done && s.done]}>{i.label}</Text>
          </Pressable>
        ))}
      </View>
      {!!error && <Body tone="danger">{error}</Body>}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  box: { fontSize: 26, color: color.faint },
  label: { ...type.body, color: color.ink, flexShrink: 1 },
  done: { color: color.muted, textDecorationLine: "line-through" },
});
