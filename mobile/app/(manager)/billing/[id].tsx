import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/api/client";
import {
  bills as billsApi,
  invoiceNumber,
  receiptNumber,
  type BillDetail,
} from "@/api/endpoints";
import {
  BillBadge,
  METHOD_LABEL,
  shareDocument,
  sharePayLink,
  shortDate,
} from "@/features/billing/shared";
import {
  Body,
  Button,
  Card,
  ErrorNotice,
  Field,
  Heading,
  Icon,
  Label,
  Loading,
  Row,
  Screen,
  Title,
} from "@/ui/components";
import { color, radius, space, type, usd } from "@/ui/theme";

/**
 * One bill: what it's for, the money, every payment with its receipt, and —
 * for admins — taking a payment or undoing them. The owner reads it all and
 * can share the documents, which are reads, but can't move money (as on the
 * web).
 */
export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBill(await billsApi.get(id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this bill.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reload on focus: coming back from taking a payment must show it.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({ title: bill ? invoiceNumber(bill.invoiceNo) : "Bill" });
  }, [navigation, bill]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading bill…" />
      </Screen>
    );
  }
  if (!bill) {
    return (
      <Screen>
        <ErrorNotice message={error ?? "Bill not found."} onRetry={load} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const tz = bill.timezone;
  const client = bill.task.client;

  const share = async (key: string, download: () => Promise<string>, title: string) => {
    if (sharing) return;
    setSharing(key);
    await shareDocument(download, title);
    setSharing(null);
  };

  const undo = () => {
    if (!reason.trim()) {
      setError("Say why the payments are being undone — it's kept on the record.");
      return;
    }
    Alert.alert(
      "Undo every payment?",
      `All ${bill.payments.length} payment${bill.payments.length === 1 ? "" : "s"} (${usd(bill.paid)}) come off this bill and it goes back to unpaid.`,
      [
        { text: "Keep them", style: "cancel" },
        {
          text: "Undo payments",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await billsApi.reverse(bill.id, reason.trim());
              setUndoing(false);
              setReason("");
              await load();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Couldn't undo the payments.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Title>{client.name}</Title>
          <Body tone="muted">
            {bill.task.serviceName} · {shortDate(bill.task.date, tz)}
          </Body>
        </View>
        <BillBadge status={bill.status} />
      </View>

      {!!error && <ErrorNotice message={error} />}

      {/* The balance leads: it's what anyone opening a bill wants to know. */}
      <View style={[s.balance, bill.balance <= 0 && { backgroundColor: "#dcf0e3" }]}>
        <Text style={s.balanceLabel}>{bill.balance > 0 ? "Balance due" : "Paid in full"}</Text>
        <Text style={[s.balanceValue, bill.balance <= 0 && { color: color.good }]}>
          {usd(Math.max(0, bill.balance))}
        </Text>
        {bill.paid > 0 && bill.balance > 0 && (
          <Text style={s.balanceSub}>
            {usd(bill.paid)} paid of {usd(bill.amount)}
          </Text>
        )}
      </View>

      {isAdmin && bill.balance > 0 && (
        <Button
          title="Record a payment"
          onPress={() => router.push(`/(manager)/billing/pay?id=${bill.id}`)}
          style={{ marginBottom: space.md }}
        />
      )}

      <View style={s.actions}>
        <Action
          icon="document-text-outline"
          label="Invoice PDF"
          busy={sharing === "invoice"}
          onPress={() =>
            share("invoice", () => billsApi.invoicePdf(bill), `Invoice ${invoiceNumber(bill.invoiceNo)}`)
          }
        />
        {isAdmin && !!bill.payUrl && (
          <Action
            icon="card-outline"
            label="Send pay link"
            onPress={() => sharePayLink(bill.payUrl!, client.name, usd(bill.balance))}
          />
        )}
      </View>

      <Card>
        <Heading>Invoice</Heading>
        {bill.lineItems.map((l, i) => (
          <Row
            key={i}
            label={l.detail ? `${l.description}\n${l.detail}` : l.description}
            value={usd(l.amount)}
          />
        ))}
        <View style={s.sep} />
        {bill.taxes.length > 0 && (
          <>
            <Row label="Subtotal" value={usd(bill.subtotal)} />
            {bill.taxes.map((t) => (
              <Row key={t.name} label={`${t.name} (${t.ratePercent}%)`} value={usd(t.amount)} />
            ))}
          </>
        )}
        <Row label="Total" value={usd(bill.amount)} />
        <Row label="Paid" value={bill.paid > 0 ? usd(bill.paid) : "—"} />
        <Row label="Service address" value={bill.task.poolAddress} />
        {!!client.phone && <Row label="Phone" value={client.phone} />}
        {!!client.email && <Row label="Email" value={client.email} />}
      </Card>

      <Card>
        <Heading>Payments</Heading>
        {bill.payments.length === 0 && <Body tone="muted">No payments yet.</Body>}
        {bill.payments.map((p) => (
          <View key={p.id} style={s.payment}>
            <View style={{ flex: 1 }}>
              <Text style={s.payAmount}>{usd(p.amount)}</Text>
              <Text style={s.payMeta}>
                {METHOD_LABEL[p.method] ?? p.method}
                {p.checkNumber ? ` #${p.checkNumber}` : ""} · {shortDate(p.paidAt, tz)}
                {p.recordedBy ? ` · ${p.recordedBy}` : ""}
              </Text>
              {!!p.note && <Text style={s.payMeta}>{p.note}</Text>}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Receipt ${receiptNumber(p.receiptNo)}`}
              onPress={() =>
                share(p.id, () => billsApi.receiptPdf(bill.id, p), `Receipt ${receiptNumber(p.receiptNo)}`)
              }
              style={s.receipt}
            >
              <Icon name="receipt-outline" size={18} color={color.navy700} />
              <Text style={s.receiptText}>{sharing === p.id ? "…" : "Receipt"}</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      {bill.reversals.length > 0 && (
        <Card>
          <Heading>Undone payments</Heading>
          {bill.reversals.map((r) => (
            <View key={r.id} style={s.payment}>
              <View style={{ flex: 1 }}>
                <Text style={s.payAmount}>
                  {usd(r.amountReversed)} · {r.paymentCount} payment{r.paymentCount === 1 ? "" : "s"}
                </Text>
                <Text style={s.payMeta}>
                  {shortDate(r.createdAt, tz)}
                  {r.reversedBy ? ` · ${r.reversedBy}` : ""}
                </Text>
                <Text style={s.payMeta}>“{r.reason}”</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {isAdmin && bill.payments.length > 0 && (
        <Card>
          {undoing ? (
            <>
              <Heading>Undo payments</Heading>
              <Body tone="muted">
                Every payment comes off the bill. The record of what was undone, by whom and why
                stays.
              </Body>
              <View style={{ height: space.md }} />
              <Field
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Check bounced"
                editable={!busy}
              />
              <Button title="Undo payments" variant="danger" onPress={undo} loading={busy} />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setUndoing(false)}
                disabled={busy}
                style={{ marginTop: space.sm }}
              />
            </>
          ) : (
            <>
              <Label>Made a mistake?</Label>
              <Button title="Undo payments…" variant="secondary" onPress={() => setUndoing(true)} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

function Action({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [s.action, (pressed || busy) && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={20} color={color.teal700} />
      <Text style={s.actionText}>{busy ? "Preparing…" : label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.md },
  balance: {
    backgroundColor: "#fdf0dc",
    borderRadius: radius.xl,
    padding: space.lg,
    alignItems: "center",
    marginBottom: space.md,
  },
  balanceLabel: { ...type.label, color: color.muted },
  balanceValue: { ...type.display, color: color.warn, marginTop: space.xs },
  balanceSub: { ...type.small, color: color.muted, marginTop: space.xs },
  actions: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.field,
  },
  actionText: { ...type.bodyStrong, color: color.navy700 },
  sep: { height: 1, backgroundColor: color.chrome100, marginVertical: space.xs },
  payment: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.chrome100,
  },
  payAmount: { ...type.bodyStrong, color: color.ink },
  payMeta: { ...type.small, color: color.muted, marginTop: 2 },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.md,
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: color.chrome100,
  },
  receiptText: { ...type.small, fontWeight: "700", color: color.navy700 },
});
