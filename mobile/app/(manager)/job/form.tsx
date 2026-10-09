import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  agenda as agendaApi,
  scheduling as schedulingApi,
  tasks as tasksApi,
  type Agenda,
  type SchedulingCatalog,
} from "@/api/endpoints";
import { createTaskSchema, editTaskSchema } from "@contracts/scheduling";
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNotice,
  Field,
  Heading,
  Icon,
  Label,
  Loading,
  Screen,
} from "@/ui/components";
import { color, radius, shadow, space, type } from "@/ui/theme";

/**
 * New job, or edit/reschedule an existing one (`?id=`).
 *
 * Dates come from the server's week strip and times from the business's
 * hours, so the phone never parses or computes a date: it sends back the
 * `YYYY-MM-DD` and `HH:MM` the server gave it, and the server interprets them
 * in the business's timezone — with the same hours and double-booking checks
 * as the web.
 */

const REPEATS = [
  { value: "NONE", label: "Doesn't repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "MONTHLY", label: "Monthly" },
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Start times offered, every half hour within business hours. */
const STEP_MIN = 30;

const pad = (n: number) => String(n).padStart(2, "0");
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
function toLabel(min: number) {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(min % 60)} ${h >= 12 ? "PM" : "AM"}`;
}

export default function JobForm() {
  const { id, day } = useLocalSearchParams<{ id?: string; day?: string }>();
  const editing = !!id;
  const router = useRouter();
  const navigation = useNavigation();

  const [catalog, setCatalog] = useState<SchedulingCatalog | null>(null);
  const [week, setWeek] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<(typeof REPEATS)[number]["value"]>("NONE");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [originalDay, setOriginalDay] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? "Edit job" : "New job" });
  }, [navigation, editing]);

  const loadWeek = useCallback(async (d?: string) => {
    try {
      setWeek(await agendaApi.get(d));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load dates.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [cat, wk] = await Promise.all([schedulingApi.catalog(), agendaApi.get(day || undefined)]);
        setCatalog(cat);
        setWeek(wk);
        if (editing) {
          const t = wk.tasks.find((x) => x.id === id);
          if (!t) {
            setError("This job isn't on that day any more — it may have been moved.");
          } else {
            setServiceId(t.serviceId);
            setWorkerId(t.workerId);
            setDate(t.dayKey);
            setOriginalDay(t.dayKey);
            setTime(t.time);
            setDuration(String(t.durationMin));
            setPrice(String(t.price ?? 0));
            setRecurring(t.recurring);
            setSearch(t.clientName);
          }
        } else {
          setDate(wk.day);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't load the form.");
      } finally {
        setLoading(false);
      }
    })();
  }, [day, editing, id]);

  const clientMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (catalog?.clients ?? []).filter((c) => c.pools.length > 0);
    return (q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list).slice(0, 12);
  }, [catalog, search]);
  const client = catalog?.clients.find((c) => c.id === clientId) ?? null;

  const times = useMemo(() => {
    if (!week) return [];
    const out: number[] = [];
    for (let m = week.hours.startMin; m + STEP_MIN <= week.hours.endMin; m += STEP_MIN) out.push(m);
    return out;
  }, [week]);

  const pickService = (sid: string) => {
    setServiceId(sid);
    // Same as the web: a service sets its default length and price, which can then be changed.
    const svc = catalog?.services.find((x) => x.id === sid);
    if (svc) {
      setDuration(String(svc.defaultDurationMin));
      setPrice(String(svc.basePrice));
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    setError(null);
    const shared = {
      workerId: workerId ?? "",
      serviceId: serviceId ?? "",
      date: date ?? "",
      time: time ?? "",
      durationMin: duration,
      price,
    };

    if (editing) {
      const input = { ...shared, applyToSeries: recurring && applyToSeries };
      const parsed = editTaskSchema.safeParse({ taskId: id, ...input });
      if (!parsed.success) return setError(parsed.error.errors[0].message);
      setBusy(true);
      try {
        await tasksApi.edit(id!, input);
        // Moved to another day: show the job where it now is.
        if (date !== originalDay) router.replace(`/(manager)/job/${id}?day=${date}`);
        else router.back();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't save the job.");
        setBusy(false);
      }
      return;
    }

    const input = {
      ...shared,
      clientId: clientId ?? "",
      poolId: poolId ?? "",
      notes,
      extras,
      repeat,
      daysOfWeek,
    };
    const parsed = createTaskSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.errors[0].message);
    setBusy(true);
    try {
      const res = await tasksApi.create(input);
      router.replace(`/(manager)/job/${res.id}?day=${date}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't schedule the job.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!catalog || !week) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Couldn't load the form."} />
      </Screen>
    );
  }

  return (
    <Screen>
      {editing ? (
        <Card>
          <Label>Client</Label>
          <Body>{search}</Body>
          <Text style={s.hint}>To change the client or pool, cancel this job and schedule a new one.</Text>
        </Card>
      ) : (
        <Card>
          <Heading>Client</Heading>
          <Field label="Search" value={search} onChangeText={setSearch} placeholder="Type a name" autoCorrect={false} />
          <View style={s.chips}>
            {clientMatches.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={clientId === c.id}
                onPress={() => {
                  setClientId(c.id);
                  setPoolId(c.pools[0]?.id ?? null);
                }}
              />
            ))}
            {clientMatches.length === 0 && <Body tone="faint">No client with a pool matches.</Body>}
          </View>
          {client && client.pools.length > 1 && (
            <>
              <Label>Pool</Label>
              <View style={s.chips}>
                {client.pools.map((p) => (
                  <Chip key={p.id} label={p.address} selected={poolId === p.id} onPress={() => setPoolId(p.id)} />
                ))}
              </View>
            </>
          )}
        </Card>
      )}

      <Card>
        <Heading>Service</Heading>
        <View style={s.chips}>
          {catalog.services.map((x) => (
            <Chip key={x.id} label={x.name} selected={serviceId === x.id} onPress={() => pickService(x.id)} />
          ))}
        </View>
        <Heading>Worker</Heading>
        <View style={s.chips}>
          {catalog.workers.map((w) => (
            <Chip key={w.id} label={w.name} selected={workerId === w.id} onPress={() => setWorkerId(w.id)} />
          ))}
        </View>
      </Card>

      <Card>
        <Heading>When</Heading>
        <View style={s.weekHead}>
          <Pressable accessibilityLabel="Previous week" onPress={() => loadWeek(week.prevWeek)} style={s.arrow}>
            <Icon name="chevron-back" size={20} color={color.navy700} />
          </Pressable>
          <Text style={s.weekLabel}>
            {week.week[0]?.weekday} {week.week[0]?.dateNum} – {week.week[6]?.weekday} {week.week[6]?.dateNum}
          </Text>
          <Pressable accessibilityLabel="Next week" onPress={() => loadWeek(week.nextWeek)} style={s.arrow}>
            <Icon name="chevron-forward" size={20} color={color.navy700} />
          </Pressable>
        </View>
        <View style={s.week}>
          {week.week.map((d) => (
            <Pressable
              key={d.day}
              accessibilityRole="button"
              accessibilityLabel={`${d.weekday} ${d.dateNum}`}
              onPress={() => setDate(d.day)}
              style={[s.dayChip, date === d.day && s.dayChipOn]}
            >
              <Text style={[s.dayWk, date === d.day && { color: "#cfe0ff" }]}>{d.weekday}</Text>
              <Text style={[s.dayNum, date === d.day && { color: color.white }]}>{d.dateNum}</Text>
            </Pressable>
          ))}
        </View>
        <Label>Start time</Label>
        <View style={s.chips}>
          {times.map((m) => (
            <Chip key={m} label={toLabel(m)} selected={time === toHHMM(m)} onPress={() => setTime(toHHMM(m))} />
          ))}
        </View>
        <View style={s.pair}>
          <View style={{ flex: 1 }}>
            <Field label="Minutes" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Price ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          </View>
        </View>
      </Card>

      {!editing && (
        <Card>
          {catalog.extras.length > 0 && (
            <>
              <Heading>Add-ons</Heading>
              <View style={s.chips}>
                {catalog.extras.map((x) => (
                  <Chip
                    key={x.id}
                    label={`${x.name} · $${x.price}`}
                    selected={extras.includes(x.id)}
                    onPress={() => setExtras((l) => toggle(l, x.id))}
                  />
                ))}
              </View>
            </>
          )}
          <Heading>Repeat</Heading>
          <View style={s.chips}>
            {REPEATS.map((r) => (
              <Chip key={r.value} label={r.label} selected={repeat === r.value} onPress={() => setRepeat(r.value)} />
            ))}
          </View>
          {(repeat === "WEEKLY" || repeat === "BIWEEKLY") && (
            <>
              <Label>On (defaults to the job's own day)</Label>
              <View style={s.chips}>
                {WEEKDAYS.map((w, i) => (
                  <Chip
                    key={w}
                    label={w}
                    selected={daysOfWeek.includes(i)}
                    onPress={() => setDaysOfWeek((l) => toggle(l, i))}
                  />
                ))}
              </View>
            </>
          )}
          <Field label="Notes for the worker (optional)" value={notes} onChangeText={setNotes} multiline />
        </Card>
      )}

      {editing && recurring && (
        <Card style={s.seriesRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.seriesTitle}>Apply to later jobs in the series</Text>
            <Text style={s.hint}>Worker, service, time, length and price. Each keeps its own date.</Text>
          </View>
          <Switch value={applyToSeries} onValueChange={setApplyToSeries} trackColor={{ true: color.teal700, false: color.line }} />
        </Card>
      )}

      {!!error && <ErrorNotice message={error} />}
      <Button title={editing ? "Save changes" : "Schedule job"} onPress={save} loading={busy} />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  hint: { ...type.small, color: color.muted, marginTop: space.xs },
  pair: { flexDirection: "row", gap: space.md },
  weekHead: { flexDirection: "row", alignItems: "center", marginBottom: space.sm },
  weekLabel: { ...type.bodyStrong, color: color.ink, flex: 1, textAlign: "center" },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.chrome100,
  },
  week: { flexDirection: "row", gap: 6, marginBottom: space.lg },
  dayChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  dayChipOn: { backgroundColor: color.navy700, borderColor: color.navy700, ...shadow.card },
  dayWk: { ...type.small, fontSize: 12, color: color.muted },
  dayNum: { ...type.heading, color: color.ink },
  seriesRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  seriesTitle: { ...type.bodyStrong, color: color.ink },
});
