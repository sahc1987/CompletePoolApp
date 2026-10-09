import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import {
  bills as billsApi,
  clients as clientsApi,
  type BillListPage,
  type ClientDetail,
} from "@/api/endpoints";
import { BillCard } from "@/features/billing/shared";
import {
  Body,
  Button,
  Card,
  ErrorNotice,
  Heading,
  Icon,
  Loading,
  Screen,
  Title,
} from "@/ui/components";
import { color, radius, space, type, usd } from "@/ui/theme";

/**
 * One client: how to reach them, their pools, and their bills — what they've
 * been charged and what they still owe. Edits happen on their own screens.
 */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [billing, setBilling] = useState<BillListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        clientsApi.get(id),
        billsApi.list({ clientId: id, status: "all" }),
      ]);
      setClient(c);
      setBilling(b);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this client.");
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
    navigation.setOptions({ title: client?.name ?? "Client" });
  }, [navigation, client?.name]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading client…" />
      </Screen>
    );
  }
  if (!client) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Client not found."} onRetry={load} />
        <Button title="Back to clients" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const remove = () =>
    Alert.alert(`Delete ${client.name}?`, "Their pools go too. This can't be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await clientsApi.remove(client.id);
            router.back();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't delete this client.");
            setDeleting(false);
          }
        },
      },
    ]);

  const owed = billing?.totals.outstanding ?? 0;

  return (
    <Screen>
      <View style={s.head}>
        <Title>{client.name}</Title>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/(manager)/clients/form?id=${client.id}`)}
          style={s.edit}
        >
          <Icon name="create-outline" size={18} color={color.navy700} />
          <Text style={s.editText}>Edit</Text>
        </Pressable>
      </View>

      {!!error && <ErrorNotice message={error} />}

      <Card>
        <Contact icon="call-outline" value={client.phone} href={client.phone ? `tel:${client.phone}` : null} />
        <Contact icon="mail-outline" value={client.email} href={client.email ? `mailto:${client.email}` : null} />
        <Contact icon="home-outline" value={client.address} label="Billing address" />
        {!client.phone && !client.email && !client.address && (
          <Body tone="muted">No contact details yet.</Body>
        )}
        {!!client.notes && (
          <View style={s.notes}>
            <Text style={s.notesText}>{client.notes}</Text>
          </View>
        )}
      </Card>

      <Card>
        <View style={s.sectionHead}>
          <Heading>Pools ({client.pools.length})</Heading>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/(manager)/clients/pool?clientId=${client.id}`)}
            hitSlop={8}
          >
            <Text style={s.link}>+ Add pool</Text>
          </Pressable>
        </View>
        {client.pools.length === 0 && <Body tone="muted">No pools yet.</Body>}
        {client.pools.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityHint="Edit this pool"
            onPress={() => router.push(`/(manager)/clients/pool?clientId=${client.id}&poolId=${p.id}`)}
            style={({ pressed }) => [s.pool, pressed && { opacity: 0.8 }]}
          >
            <Icon name="water-outline" size={20} color={color.teal700} />
            <View style={{ flex: 1 }}>
              <Text style={s.poolAddress}>{p.address}</Text>
              <Text style={s.poolMeta}>
                {[p.size, p.type].filter(Boolean).join(" · ") || "No size or type set"}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={color.faint} />
          </Pressable>
        ))}
      </Card>

      <View style={s.sectionHead}>
        <Heading>Bills</Heading>
        {owed > 0 && <Text style={s.owed}>{usd(owed)} owed</Text>}
      </View>
      {billing && billing.rows.length === 0 && (
        <Card>
          <Body tone="muted">No bills yet — they're created when a job is approved.</Body>
        </Card>
      )}
      {billing?.rows.map((b) => (
        <BillCard
          key={b.id}
          bill={b}
          timezone={billing.timezone}
          showClient={false}
          onPress={() => router.push(`/(manager)/billing/${b.id}`)}
        />
      ))}
      {billing && billing.total > billing.rows.length && (
        <Body tone="muted">
          Showing the latest {billing.rows.length} of {billing.total}. The rest are under Billing.
        </Body>
      )}

      <Card style={{ marginTop: space.lg }}>
        {client.deletable ? (
          <Button title="Delete client" variant="danger" onPress={remove} loading={deleting} />
        ) : (
          <Body tone="muted">
            Has {client.taskCount} job{client.taskCount === 1 ? "" : "s"} and {client.estimateCount}{" "}
            estimate{client.estimateCount === 1 ? "" : "s"} on record, so it can't be deleted.
          </Body>
        )}
      </Card>
    </Screen>
  );
}

function Contact({
  icon,
  value,
  href,
  label,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  value: string | null;
  href?: string | null;
  label?: string;
}) {
  if (!value) return null;
  const body = (
    <View style={s.contact}>
      <Icon name={icon} size={20} color={color.teal700} />
      <View style={{ flex: 1 }}>
        {!!label && <Text style={s.contactLabel}>{label}</Text>}
        <Text style={[s.contactValue, !!href && { color: color.navy700 }]}>{value}</Text>
      </View>
    </View>
  );
  return href ? (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(href)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  edit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.md,
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: color.chrome100,
    marginBottom: space.sm,
  },
  editText: { ...type.small, fontWeight: "700", color: color.navy700 },
  contact: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  contactLabel: { fontSize: 12, color: color.muted },
  contactValue: { ...type.body, color: color.ink },
  notes: { marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface },
  notesText: { ...type.small, color: color.muted },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.xs,
  },
  link: { ...type.bodyStrong, color: color.teal700 },
  owed: { ...type.bodyStrong, color: color.warn },
  pool: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.chrome100,
  },
  poolAddress: { ...type.bodyStrong, color: color.ink },
  poolMeta: { ...type.small, color: color.muted, marginTop: 2 },
});
