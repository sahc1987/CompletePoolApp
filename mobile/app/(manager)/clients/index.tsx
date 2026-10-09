import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@/api/client";
import { clients as clientsApi, type ClientListPage, type ClientListRow } from "@/api/endpoints";
import { Button, Empty, ErrorNotice, Icon, Loading, Screen } from "@/ui/components";
import { HIT_SIZE, color, radius, shadow, space, type } from "@/ui/theme";

/**
 * Admin: every client, A–Z, searchable by name, phone, email or any of their
 * pools' addresses — a job is often remembered by where it is.
 */
export default function ClientList() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ClientListPage | null>(null);
  const [rows, setRows] = useState<ClientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Typing fires a search per pause; only the newest answer may land.
  const latest = useRef(0);

  const load = useCallback(async (q: string, mode: "initial" | "refresh") => {
    const call = ++latest.current;
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await clientsApi.list(q);
      if (call !== latest.current) return;
      setData(res);
      setRows(res.rows);
      setError(null);
    } catch (e) {
      if (call === latest.current) {
        setError(e instanceof ApiError ? e.message : "Couldn't load clients.");
      }
    } finally {
      if (call === latest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Search a moment after typing stops, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(query, "initial"), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  // Coming back from an edit or a new client: show it, under the same search.
  // The first focus is skipped — the search effect above already loads.
  const queryRef = useRef(query);
  queryRef.current = query;
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void load(queryRef.current, "initial");
    }, [load])
  );

  const loadMore = async () => {
    if (!data || more) return;
    setMore(true);
    try {
      const res = await clientsApi.list(query, data.page + 1);
      setData(res);
      setRows((prev) => [...prev, ...res.rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load more clients.");
    } finally {
      setMore(false);
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(query, "refresh")} tintColor={color.navy700} />
      }
    >
      <View style={s.searchRow}>
        <View style={s.search}>
          <Icon name="search" size={18} color={color.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name, phone, email or address"
            placeholderTextColor={color.faint}
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search clients"
          />
          {!!query && (
            <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={10}>
              <Icon name="close-circle" size={18} color={color.faint} />
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New client"
          onPress={() => router.push("/(manager)/clients/form")}
          style={({ pressed }) => [s.add, pressed && { opacity: 0.85 }]}
        >
          <Icon name="add" size={26} color={color.white} />
        </Pressable>
      </View>

      {!!error && <ErrorNotice message={error} onRetry={() => load(query, "initial")} />}

      {loading ? (
        <Loading label="Loading clients…" />
      ) : (
        <>
          {!error && rows.length === 0 && (
            <Empty
              title={data && data.totalUnfiltered > 0 ? "No matches" : "No clients yet"}
              detail={
                data && data.totalUnfiltered > 0
                  ? "Try part of a name, a phone number or a street."
                  : "Add your first client with the + button."
              }
            />
          )}
          {data && rows.length > 0 && (
            <Text style={s.count}>
              {data.total} client{data.total === 1 ? "" : "s"}
            </Text>
          )}
          {rows.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(manager)/clients/${c.id}`)}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}
            >
              <View style={s.initial}>
                <Text style={s.initialText}>{c.name.trim()[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  {c.phone || c.email || c.address || "No contact details"}
                </Text>
                <Text style={s.meta}>
                  {c.poolCount} pool{c.poolCount === 1 ? "" : "s"} · {c.taskCount} job
                  {c.taskCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color={color.faint} />
            </Pressable>
          ))}
          {data && data.page < data.totalPages && (
            <Button title="Show more" variant="secondary" onPress={loadMore} loading={more} />
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: HIT_SIZE,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.field,
  },
  searchInput: { flex: 1, ...type.body, color: color.ink, paddingVertical: space.sm },
  add: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radius.lg,
    backgroundColor: color.teal700,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { ...type.small, color: color.muted, marginBottom: space.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  initial: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e6efff",
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: { ...type.heading, color: color.navy700, fontWeight: "700" },
  name: { ...type.heading, color: color.ink },
  meta: { ...type.small, color: color.muted, marginTop: 2 },
});
