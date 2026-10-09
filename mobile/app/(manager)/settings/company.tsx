import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/client";
import { settings as settingsApi, type CompanyInfo } from "@/api/endpoints";
import { companyInfoSchema } from "@contracts/settings";
import { Body, Button, Card, Field, Heading, Loading, Screen } from "@/ui/components";
import { color, space, type } from "@/ui/theme";

type Form = Record<keyof CompanyInfo, string>;

const blank = (c: CompanyInfo): Form => ({
  name: c.name,
  tagline: c.tagline ?? "",
  address: c.address ?? "",
  phone: c.phone ?? "",
  email: c.email ?? "",
  website: c.website ?? "",
  taxId: c.taxId ?? "",
  paymentTerms: c.paymentTerms ?? "",
  paymentNote: c.paymentNote ?? "",
  documentFooter: c.documentFooter ?? "",
});

/**
 * Admin: what every invoice and receipt prints about the business — the same
 * fields as the web's Settings → Company details. Takes effect on the next
 * document; ones already sent don't change.
 */
export default function CompanySettings() {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi
      .get()
      .then((d) => setForm(blank(d.company)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the company details."));
  }, []);

  if (!form) {
    return (
      <Screen>{error ? <Text style={s.error}>{error}</Text> : <Loading />}</Screen>
    );
  }

  const set = (key: keyof Form) => (v: string) => setForm((f) => (f ? { ...f, [key]: v } : f));

  const save = async () => {
    if (busy) return;
    const parsed = companyInfoSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await settingsApi.saveCompany(form);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the company details.");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Heading>Business</Heading>
        <Field label="Company name" value={form.name} onChangeText={set("name")} editable={!busy} />
        <Field
          label="Tagline"
          value={form.tagline}
          onChangeText={set("tagline")}
          placeholder="Pool maintenance & repair"
          editable={!busy}
        />
        <Field label="Address" value={form.address} onChangeText={set("address")} editable={!busy} multiline />
        <Field label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" editable={!busy} />
        <Field
          label="Email"
          value={form.email}
          onChangeText={set("email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Field
          label="Website"
          value={form.website}
          onChangeText={set("website")}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Field label="Tax ID / licence no." value={form.taxId} onChangeText={set("taxId")} editable={!busy} />
      </Card>

      <Card>
        <Heading>On the documents</Heading>
        <Field
          label="Payment terms"
          value={form.paymentTerms}
          onChangeText={set("paymentTerms")}
          placeholder="Due upon receipt"
          editable={!busy}
        />
        <Field
          label="How to pay"
          value={form.paymentNote}
          onChangeText={set("paymentNote")}
          placeholder="Shown under the totals on an unpaid invoice"
          multiline
          editable={!busy}
        />
        <Field
          label="Closing line"
          value={form.documentFooter}
          onChangeText={set("documentFooter")}
          placeholder="e.g. Thank you for your business"
          multiline
          editable={!busy}
        />
        <Body tone="muted">Used on the next invoice or receipt. Documents already sent don't change.</Body>
        <Text>{"\n"}</Text>
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title="Save company details" onPress={save} loading={busy} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  error: { ...type.small, color: color.danger, marginBottom: space.md },
});
