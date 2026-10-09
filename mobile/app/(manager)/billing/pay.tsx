import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { bills as billsApi, type BillDetail } from "@/api/endpoints";
import { paymentDetailsSchema } from "@contracts/billing";
import type { PaymentMethodValue } from "@contracts/enums";
import { Body, Button, Card, Chip, ErrorNotice, Field, Label, Loading, Screen } from "@/ui/components";
import { color, space, type, usd } from "@/ui/theme";

const METHODS: { value: PaymentMethodValue; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "ONLINE", label: "Card / online" },
];

/**
 * Record money received: cash, a check, or a card taken outside the app —
 * the full balance or part of it. The server holds the rules (no more than
 * the balance, a check number for a check, a billing address for a card) and
 * closes any card checkout the customer has open first, so the same bill
 * can't be paid twice.
 */
export default function RecordPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [method, setMethod] = useState<PaymentMethodValue>("CASH");
  const [amount, setAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    billsApi
      .get(id)
      .then((b) => {
        setBill(b);
        setAmount(b.balance.toFixed(2));
        setBillingAddress(b.task.client.address ?? "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this bill."));
  }, [id]);

  if (!bill) {
    return (
      <Screen>
        {error ? <ErrorNotice message={error} /> : <Loading label="Loading bill…" />}
      </Screen>
    );
  }

  const submit = async () => {
    if (busy) return;
    const input = {
      amount: amount.replace(/[$,\s]/g, ""),
      method,
      checkNumber: method === "CHECK" ? checkNumber : undefined,
      billingAddress: method === "ONLINE" ? billingAddress : undefined,
      note,
    };
    const parsed = paymentDetailsSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await billsApi.pay(bill.id, input);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't record the payment.");
      setBusy(false);
    }
  };

  const full = amount === bill.balance.toFixed(2);

  return (
    <Screen>
      <Card>
        <Label>{bill.task.client.name}</Label>
        <Text style={s.balance}>{usd(bill.balance)}</Text>
        <Body tone="muted">
          owed of {usd(bill.amount)} · {bill.task.serviceName}
        </Body>
      </Card>

      <Card>
        <Label>How they paid</Label>
        <View style={s.chips}>
          {METHODS.map((m) => (
            <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />
          ))}
        </View>

        <Field
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy}
        />
        {!full && (
          <Button
            title={`Full balance (${usd(bill.balance)})`}
            variant="secondary"
            onPress={() => setAmount(bill.balance.toFixed(2))}
            style={{ marginTop: -space.sm, marginBottom: space.lg }}
          />
        )}

        {method === "CHECK" && (
          <Field
            label="Check number"
            value={checkNumber}
            onChangeText={setCheckNumber}
            keyboardType="number-pad"
            editable={!busy}
          />
        )}
        {method === "ONLINE" && (
          <Field
            label="Card billing address"
            value={billingAddress}
            onChangeText={setBillingAddress}
            editable={!busy}
          />
        )}
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Printed on the receipt"
          editable={!busy}
        />

        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={full ? "Record full payment" : "Record partial payment"} onPress={submit} loading={busy} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  balance: { ...type.display, color: color.warn },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  error: { ...type.small, color: color.danger, marginBottom: space.md },
});
