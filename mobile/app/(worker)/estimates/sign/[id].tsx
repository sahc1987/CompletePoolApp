import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import SignatureView, { type SignatureViewRef } from "react-native-signature-canvas";
import { ApiError } from "@/api/client";
import { estimates as estimatesApi } from "@/api/endpoints";
import { signEstimateSchema } from "@contracts/estimates";
import { Button, ErrorNotice, Field, Screen } from "@/ui/components";
import { color, radius, space, type, usd } from "@/ui/theme";

// The pad draws inside a WebView; hide its built-in buttons so the app's own,
// thumb-sized ones are the only controls.
const PAD_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { height: 100%; }
`;

/**
 * The customer signs on the worker's phone. The pad hands back a
 * `data:image/png;base64,…` URL — the same format the web pad sends, so the
 * signature prints on the PDF the same way whichever device captured it.
 *
 * Not a scrolling screen: a vertical stroke on the pad would otherwise scroll
 * the page instead of drawing.
 */
export default function SignEstimate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pad = useRef<SignatureViewRef>(null);

  const [total, setTotal] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    estimatesApi
      .get(id)
      .then((e) => {
        setTotal(e.total);
        setName((n) => n || e.clientName);
      })
      .catch(() => setTotal(null));
  }, [id]);

  const submit = async (signatureData: string) => {
    const body = { signedByName: name, signatureData };
    const parsed = signEstimateSchema.safeParse({ estimateId: id, ...body });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await estimatesApi.sign(id, body);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the signature. Try again.");
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false} style={{ flex: 1, padding: space.lg }}>
      {total !== null && (
        <Text style={s.total}>
          Approving {usd(total)}
        </Text>
      )}
      <Field
        label="Customer's name"
        value={name}
        onChangeText={setName}
        editable={!busy}
      />

      <Text style={s.hint}>Sign below</Text>
      <View style={s.padFrame}>
        <SignatureView
          ref={pad}
          onOK={(sig) => void submit(sig)}
          onEmpty={() => setError("Capture a signature first")}
          webStyle={PAD_STYLE}
          imageType="image/png"
          backgroundColor="#ffffff"
          penColor={color.ink}
          autoClear={false}
        />
      </View>

      {!!error && <ErrorNotice message={error} />}

      <View style={s.actions}>
        <Button
          title="Clear"
          variant="secondary"
          onPress={() => pad.current?.clearSignature()}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <Button
          title="Accept & sign"
          // Asks the pad for its image; it answers through onOK or onEmpty.
          onPress={() => pad.current?.readSignature()}
          loading={busy}
          style={{ flex: 2 }}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  total: { ...type.title, color: color.navy700, marginBottom: space.md },
  hint: { ...type.label, color: color.faint, marginBottom: space.sm },
  padFrame: {
    flex: 1,
    minHeight: 220,
    borderWidth: 1,
    borderColor: color.field,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.white,
    marginBottom: space.md,
  },
  actions: { flexDirection: "row", gap: space.md },
});
