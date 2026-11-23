import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  READINGS,
  READING_KEYS,
  readingStatus,
  readingTarget,
  waterTestFieldsSchema,
  type ReadingKey,
} from "@contracts/waterTest";
import { waterTests } from "@/api/endpoints";
import { queuedWaterTest, saveWaterTest } from "@/offline/outbox";
import { ApiError } from "@/api/client";
import { Body, Button, Card, Field, Heading } from "@/ui/components";
import { space } from "@/ui/theme";

/**
 * The visit's water test: four readings, any of which can be left blank.
 *
 * A value outside the target range is flagged as it is typed, so the worker
 * can retest or note it before leaving. Nothing is blocked for being out of
 * range, and no dose is suggested. Saving goes through the offline outbox, so
 * it works at a pool with no signal and sends later.
 */
type Values = Record<ReadingKey, string>;
const EMPTY: Values = { freeChlorine: "", ph: "", alkalinity: "", cyanuricAcid: "" };

const parse = (s: string): number | undefined => {
  const t = s.trim().replace(",", ".");
  return t === "" ? undefined : Number(t);
};

export function WaterTestCard({ taskId }: { taskId: string }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  // Show what is already recorded: the server's copy, then anything saved on
  // this phone that hasn't sent (newer, so it wins).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Values = { ...EMPTY };
      try {
        const saved = await waterTests.get(taskId);
        if (saved) for (const k of READING_KEYS) next[k] = saved[k] == null ? "" : String(saved[k]);
      } catch {
        // No signal or a hiccup: the form just starts empty (or with the queued copy).
      }
      const queued = await queuedWaterTest(taskId).catch(() => null);
      if (queued) for (const k of READING_KEYS) next[k] = queued[k] == null ? "" : String(queued[k]);
      if (!cancelled) setValues(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const save = async () => {
    const fields = Object.fromEntries(READING_KEYS.map((k) => [k, parse(values[k])]));
    if (READING_KEYS.some((k) => Number.isNaN(fields[k]))) {
      setMessage({ text: "Readings must be numbers.", bad: true });
      return;
    }
    // The same schema the server checks with, so a bad value is caught here
    // rather than after a round trip that may not complete.
    const parsed = waterTestFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      setMessage({ text: parsed.error.issues[0].message, bad: true });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await saveWaterTest(taskId, parsed.data);
      const waiting = await queuedWaterTest(taskId);
      setMessage({
        text: waiting
          ? "Saved on this phone. It sends when you have signal."
          : "Water test saved.",
      });
    } catch (e) {
      setMessage({
        text: e instanceof ApiError ? e.message : "Couldn't save the water test. Try again.",
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>Water test</Heading>
      <Body tone="muted">
        Record what you measured. Leave a box empty for anything you didn&apos;t test.
      </Body>
      <View style={{ marginTop: space.lg }}>
        {READING_KEYS.map((k) => {
          const n = parse(values[k]);
          const status = n !== undefined && !Number.isNaN(n) ? readingStatus(k, n) : "ok";
          const { label, unit } = READINGS[k];
          return (
            <Field
              key={k}
              label={`${label}${unit ? ` (${unit})` : ""}`}
              value={values[k]}
              onChangeText={(v) => {
                setValues((prev) => ({ ...prev, [k]: v }));
                setMessage(null);
              }}
              keyboardType="decimal-pad"
              placeholder={readingTarget(k)}
              editable={!busy}
              error={
                status === "ok"
                  ? null
                  : `${status === "low" ? "Low" : "High"} — target ${readingTarget(k)}`
              }
            />
          );
        })}
      </View>
      {!!message &&<Body tone={message.bad ? "danger" : "muted"}>{message.text}</Body>}
      <Button
        title="Save water test"
        variant="secondary"
        onPress={save}
        loading={busy}
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}
