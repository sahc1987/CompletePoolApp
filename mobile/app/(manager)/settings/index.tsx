import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Alert, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { settings as settingsApi, type BusinessSettings } from "@/api/endpoints";
import { saveWorkHoursSchema } from "@contracts/settings";
import { Body, Button, Card, ErrorNotice, Field, Heading, Icon, Loading, Screen } from "@/ui/components";
import { color, space, type, usd } from "@/ui/theme";

const pad = (n: number) => String(n).padStart(2, "0");
/** Minutes past midnight as the "HH:MM" the hours endpoint takes. */
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/**
 * Admin: business hours and timezone, and the catalog — services, add-ons and
 * tax rates. Each item edits on its own screen.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const [data, setData] = useState<BusinessSettings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [timezone, setTimezone] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await settingsApi.get();
      setData(d);
      setStart(toHHMM(d.hours.startMin));
      setEnd(toHHMM(d.hours.endMin));
      setTimezone(d.hours.timezone);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load settings.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!data && !error) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading settings…" />
      </Screen>
    );
  }

  const saveHours = () => {
    const input = { workdayStart: start.trim(), workdayEnd: end.trim(), timezone: timezone.trim() };
    const parsed = saveWorkHoursSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    const doSave = async () => {
      setBusy(true);
      setError(null);
      setSaved(false);
      try {
        await settingsApi.saveHours(input);
        setSaved(true);
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't save the hours.");
      } finally {
        setBusy(false);
      }
    };
    // A new timezone moves every date in the app; make sure that's meant.
    if (data && input.timezone !== data.hours.timezone) {
      Alert.alert(
        "Change the business timezone?",
        `Every date and time in the app — schedules, bills, payroll weeks — will be read in ${input.timezone}.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Change it", style: "destructive", onPress: () => void doSave() },
        ]
      );
    } else {
      void doSave();
    }
  };

  const toggleTax = async (id: string) => {
    try {
      await settingsApi.toggleTaxRate(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't change the tax rate.");
    }
  };

  const open = (kind: "service" | "extra" | "tax", id?: string) =>
    router.push(`/(manager)/settings/item?kind=${kind}${id ? `&id=${id}` : ""}`);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={color.navy700} />}>
      {!!error && <ErrorNotice message={error} onRetry={data ? undefined : load} />}

      {data && (
        <>
          <Card>
            <Heading>Business hours</Heading>
            <Body tone="muted">Jobs can only be scheduled inside these hours.</Body>
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Field label="Open (HH:MM)" value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" editable={!busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Close (HH:MM)" value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" editable={!busy} />
              </View>
            </View>
            <Field
              label="Timezone"
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="America/New_York"
              editable={!busy}
            />
            {saved && <Text style={s.saved}>Saved.</Text>}
            <Button title="Save hours" onPress={saveHours} loading={busy} />
          </Card>

          <Section title="Services" onAdd={() => open("service")}>
            {data.services.length === 0 && <Body tone="muted">No services yet.</Body>}
            {data.services.map((x) => (
              <Item
                key={x.id}
                title={x.name}
                detail={`${usd(x.basePrice)} · ${x.defaultDurationMin} min`}
                onPress={() => open("service", x.id)}
              />
            ))}
          </Section>

          <Section title="Add-ons" onAdd={() => open("extra")}>
            {data.extras.length === 0 && <Body tone="muted">No add-ons yet.</Body>}
            {data.extras.map((x) => (
              <Item key={x.id} title={x.name} detail={usd(x.price)} onPress={() => open("extra", x.id)} />
            ))}
          </Section>

          <Section title="Tax rates" onAdd={() => open("tax")}>
            <Body tone="muted">Applied on estimates; a job from a signed estimate is billed with its tax.</Body>
            {data.taxRates.map((t) => (
              <View key={t.id} style={s.taxRow}>
                <Pressable style={{ flex: 1 }} onPress={() => open("tax", t.id)} accessibilityRole="button">
                  <Text style={[s.itemTitle, !t.active && { color: color.faint }]}>{t.name}</Text>
                  <Text style={s.itemDetail}>
                    {t.rate}%{t.active ? "" : " · off for new estimates"}
                  </Text>
                </Pressable>
                <Switch
                  value={t.active}
                  onValueChange={() => void toggleTax(t.id)}
                  accessibilityLabel={`${t.name} active`}
                  trackColor={{ true: color.teal700, false: color.field }}
                />
              </View>
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <View style={s.sectionHead}>
        <Heading>{title}</Heading>
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add to ${title}`} hitSlop={8}>
          <Text style={s.add}>+ Add</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}

function Item({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitle}>{title}</Text>
        <Text style={s.itemDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={color.faint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row2: { flexDirection: "row", gap: space.md, marginTop: space.md },
  saved: { ...type.bodyStrong, color: color.good, marginBottom: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  add: { ...type.bodyStrong, color: color.teal700 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.chrome100,
  },
  taxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.chrome100,
  },
  itemTitle: { ...type.bodyStrong, color: color.ink },
  itemDetail: { ...type.small, color: color.muted, marginTop: 2 },
});
