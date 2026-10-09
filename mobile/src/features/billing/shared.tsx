import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as Sharing from "expo-sharing";
import { ApiError } from "@/api/client";
import type { Bill, BillStatus } from "@/api/endpoints";
import { color, radius, shadow, space, type, usd } from "@/ui/theme";

/**
 * Bits the billing and client screens share: how a bill's status looks, how a
 * date reads, and handing a document or pay link to the share sheet.
 */

export const BILL_TONE: Record<BillStatus, { label: string; fg: string; bg: string }> = {
  PENDING: { label: "Unpaid", fg: color.pending, bg: "#e2e8f0" },
  PARTIAL: { label: "Partial", fg: color.aqua, bg: "#d7eef3" },
  PAID: { label: "Paid", fg: color.good, bg: "#dcf0e3" },
};

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  ONLINE: "Online",
};

export function BillBadge({ status }: { status: BillStatus }) {
  const t = BILL_TONE[status];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

/**
 * "Oct 6, 2026", in the business's zone (which the server sends) rather than
 * the phone's — a job stored at the business's midnight would otherwise show
 * as the day before on a phone further west. Formatting only; no arithmetic.
 */
export function shortDate(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Download a document and open the share sheet (Mail, Messages, Files, print…). */
export async function shareDocument(download: () => Promise<string>, title: string) {
  try {
    const uri = await download();
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Can't share here", "This device has no share sheet.");
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: title,
    });
  } catch (e) {
    Alert.alert(
      "Couldn't open the document",
      e instanceof ApiError ? e.message : "Try again in a moment."
    );
  }
}

/** The customer's card-payment link, as a text they can tap. */
export function sharePayLink(url: string, clientName: string, balance: string) {
  void Share.share({
    message: `Hi ${clientName}, here's the link to pay your ${balance} balance by card: ${url}`,
  });
}

export function BillCard({
  bill: b,
  timezone,
  onPress,
  showClient = true,
}: {
  bill: Bill;
  timezone?: string;
  onPress: () => void;
  showClient?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}
    >
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.client} numberOfLines={1}>
            {showClient ? b.task.client.name : b.task.serviceName}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {showClient ? `${b.task.serviceName} · ` : ""}
            {shortDate(b.task.date, timezone)}
          </Text>
        </View>
        <BillBadge status={b.status} />
      </View>
      <View style={s.money}>
        <Money label="Total" value={usd(b.amount)} />
        <Money label="Paid" value={b.paid > 0 ? usd(b.paid) : "—"} tone={b.paid > 0 ? color.good : color.faint} />
        <Money label="Balance" value={b.balance > 0 ? usd(b.balance) : "—"} tone={b.balance > 0 ? color.warn : color.faint} />
      </View>
    </Pressable>
  );
}

function Money({ label, value, tone = color.ink }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text style={[s.moneyValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  client: { ...type.heading, color: color.ink },
  meta: { ...type.small, color: color.muted, marginTop: 2 },
  money: {
    flexDirection: "row",
    marginTop: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
  },
  moneyLabel: { fontSize: 12, color: color.muted },
  moneyValue: { ...type.bodyStrong, marginTop: 2 },

  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
});
