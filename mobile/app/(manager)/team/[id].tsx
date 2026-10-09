import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { team as teamApi, type TeamMemberDetail } from "@/api/endpoints";
import type { RoleValue } from "@contracts/enums";
import { saveEmploymentSchema } from "@contracts/users";
import { dateOnly, longDate, ROLE_LABEL } from "@/features/team/roles";
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorNotice,
  Field,
  Heading,
  Loading,
  Row,
  Screen,
  Title,
} from "@/ui/components";
import { color, radius, space, type, usd } from "@/ui/theme";

const hoursLabel = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

/**
 * One person: contact, recent hours and pay, and — for accounts the caller
 * outranks — role, pay, enable/disable and a password reset. The server
 * decides what's allowed (`locked`); this only declines to offer what it would
 * refuse.
 */
export default function TeamMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [person, setPerson] = useState<TeamMemberDetail | null>(null);
  const [grantable, setGrantable] = useState<RoleValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [rate, setRate] = useState("");
  const [hiredOn, setHiredOn] = useState("");
  const [birthday, setBirthday] = useState("");
  const [rateNote, setRateNote] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, list] = await Promise.all([teamApi.get(id), teamApi.list()]);
      setPerson(p);
      setGrantable(list.grantableRoles);
      setRate(p.hourlyRate === null ? "" : String(p.hourlyRate));
      setHiredOn(dateOnly(p.hiredOn));
      setBirthday(dateOnly(p.birthday));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this person.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({ title: person?.name ?? "Team member" });
  }, [navigation, person?.name]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!person) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Not found."} onRetry={load} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  /** Runs one change; true when it went through, so a form only clears on success. */
  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    if (busy) return false;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changeRole = (role: RoleValue) => {
    if (role === person.role) return;
    Alert.alert(`Make ${person.name} ${ROLE_LABEL[role].label.toLowerCase()}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Change role",
        onPress: () => void run("role", () => teamApi.setRole(person.id, role), "Role changed."),
      },
    ]);
  };

  const toggleActive = () =>
    Alert.alert(
      person.active ? `Disable ${person.name}?` : `Enable ${person.name}?`,
      person.active
        ? "They're signed out on every device and can't sign in. Their history stays."
        : "They can sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: person.active ? "Disable" : "Enable",
          style: person.active ? "destructive" : "default",
          onPress: () =>
            void run(
              "active",
              () => teamApi.toggleActive(person.id),
              person.active ? "Account disabled." : "Account enabled."
            ),
        },
      ]
    );

  const saveEmployment = () => {
    const input = { hourlyRate: rate, hiredOn, birthday, note: rateNote };
    const parsed = saveEmploymentSchema.safeParse({ userId: person.id, ...input });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    void run("employment", () => teamApi.saveEmployment(person.id, input), "Saved.").then((ok) => ok && setRateNote(""));
  };

  const resetPassword = () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    Alert.alert(
      `Reset ${person.name}'s password?`,
      "They're signed out everywhere and told it was reset. Give them the new password yourself.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () =>
            void run("password", () => teamApi.resetPassword(person.id, password), "Password reset.").then(
              (ok) => ok && setPassword("")
            ),
        },
      ]
    );
  };

  const tone = ROLE_LABEL[person.role];

  return (
    <Screen>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Title>{person.name}</Title>
          <View style={s.badges}>
            <View style={[s.badge, { backgroundColor: tone.bg }]}>
              <Text style={[s.badgeText, { color: tone.fg }]}>{tone.label}</Text>
            </View>
            {!person.active && (
              <View style={[s.badge, { backgroundColor: "#fae3e3" }]}>
                <Text style={[s.badgeText, { color: color.danger }]}>Disabled</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {!!notice && (
        <Card style={{ backgroundColor: "#dcf0e3" }}>
          <Text style={{ ...type.bodyStrong, color: color.good }}>{notice}</Text>
        </Card>
      )}
      {!!error && <ErrorNotice message={error} />}

      <Card>
        <Pressable onPress={() => void Linking.openURL(`mailto:${person.email}`)}>
          <Row label="Email" value={<Text style={s.link}>{person.email}</Text>} />
        </Pressable>
        {!!person.phone && (
          <Pressable onPress={() => void Linking.openURL(`tel:${person.phone}`)}>
            <Row label="Phone" value={<Text style={s.link}>{person.phone}</Text>} />
          </Pressable>
        )}
        <Row label="Hourly pay" value={person.hourlyRate === null ? "Not set" : usd(person.hourlyRate)} />
        <Row label="Hired" value={longDate(person.hiredOn)} />
        <Row label="Birthday" value={longDate(person.birthday)} />
        <Row label="Member since" value={longDate(person.createdAt, person.timezone)} />
      </Card>

      {person.weeks.length > 0 && (
        <Card>
          <Heading>Last {person.weeks.length} weeks</Heading>
          {person.weeks.map((w) => (
            <Row
              key={w.weekStart}
              label={`Week of ${new Date(w.weekStart).toLocaleDateString("en-US", {
                timeZone: person.timezone,
                month: "short",
                day: "numeric",
              })} · ${w.jobs} job${w.jobs === 1 ? "" : "s"}`}
              value={`${hoursLabel(w.minutes)}${w.pay === null ? "" : ` · ${usd(w.pay)}`}`}
            />
          ))}
          <View style={s.sep} />
          <Row
            label="Total"
            value={`${hoursLabel(person.totalMinutes)}${person.hourlyRate === null ? "" : ` · ${usd(person.totalPay)}`}`}
          />
        </Card>
      )}

      {person.locked ? (
        <Card>
          <Body tone="muted">
            {person.isSelf
              ? "This is you. Change your own details under Account; someone else changes your role."
              : person.isLastManager
                ? "The last active admin/owner can't be demoted or disabled. Promote someone else first."
                : "You can't administer this account — it's at or above your role."}
          </Body>
        </Card>
      ) : (
        <>
          <Card>
            <Heading>Role</Heading>
            <View style={s.chips}>
              {grantable.map((r) => (
                <Chip
                  key={r}
                  label={ROLE_LABEL[r].label}
                  selected={person.role === r}
                  onPress={() => changeRole(r)}
                />
              ))}
            </View>
            {busy === "role" && <Loading />}
          </Card>

          <Card>
            <Heading>Pay & dates</Heading>
            <Field
              label="Hourly pay ($, blank if not hourly)"
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              editable={!busy}
            />
            <Field
              label="Reason for a pay change (optional)"
              value={rateNote}
              onChangeText={setRateNote}
              placeholder="e.g. Annual raise"
              editable={!busy}
            />
            <Field
              label="Hire date (YYYY-MM-DD)"
              value={hiredOn}
              onChangeText={setHiredOn}
              keyboardType="numbers-and-punctuation"
              editable={!busy}
            />
            <Field
              label="Birthday (YYYY-MM-DD)"
              value={birthday}
              onChangeText={setBirthday}
              keyboardType="numbers-and-punctuation"
              editable={!busy}
            />
            <Button title="Save" onPress={saveEmployment} loading={busy === "employment"} />
          </Card>

          {person.payRateHistory.length > 0 && (
            <Card>
              <Heading>Pay history</Heading>
              {person.payRateHistory.map((h) => (
                <View key={h.id} style={s.history}>
                  <Text style={s.historyMain}>
                    {h.oldRate === null ? "Set to" : `${usd(h.oldRate)} →`} {usd(h.newRate)}/hr
                  </Text>
                  <Text style={s.historyMeta}>
                    {longDate(h.createdAt, person.timezone)}
                    {h.changedBy ? ` · ${h.changedBy}` : ""}
                    {h.note ? ` · ${h.note}` : ""}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Heading>Reset password</Heading>
            <Field
              label="New password (8+ characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            <Button
              title="Reset password"
              variant="secondary"
              onPress={resetPassword}
              loading={busy === "password"}
            />
          </Card>

          <Card>
            <Button
              title={person.active ? "Disable account" : "Enable account"}
              variant={person.active ? "danger" : "primary"}
              onPress={toggleActive}
              loading={busy === "active"}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", marginBottom: space.md },
  badges: { flexDirection: "row", gap: space.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: "700" },
  link: { ...type.bodyStrong, color: color.navy700 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  sep: { height: 1, backgroundColor: color.chrome100, marginVertical: space.xs },
  history: { paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.chrome100 },
  historyMain: { ...type.bodyStrong, color: color.ink },
  historyMeta: { ...type.small, color: color.muted, marginTop: 2 },
});
