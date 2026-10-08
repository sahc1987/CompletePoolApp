import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space, type } from "@/ui/theme";

/**
 * Full-screen camera for one shot.
 *
 * Deliberately not a general-purpose camera: one job, one photo, then straight
 * back. A worker is holding a phone in one hand beside a pool, so the shutter
 * is large, centred, and the only thing that can be pressed by accident is
 * Cancel — which is placed well away from it.
 */
export function CameraCapture({
  label,
  onCaptured,
  onCancel,
}: {
  /** "Before" or "After", shown so the shot's purpose is never ambiguous. */
  label: string;
  onCaptured: (uri: string) => void;
  onCancel: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const insets = useSafeAreaInsets();

  const take = async () => {
    if (taking) return;
    setTaking(true);
    try {
      const shot = await camera.current?.takePictureAsync({
        // The compression step downstream does the real work; skipping it here
        // keeps the capture itself fast.
        quality: 1,
        skipProcessing: true,
      });
      if (shot?.uri) onCaptured(shot.uri);
      else setTaking(false);
    } catch {
      setTaking(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={s.root}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

        <View style={[s.top, { paddingTop: insets.top + space.md }]}>
          <Text style={s.label}>{label} photo</Text>
        </View>

        <View style={[s.bottom, { paddingBottom: insets.bottom + space.xl }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onCancel}
            style={s.cancel}
            hitSlop={12}
          >
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Take the ${label.toLowerCase()} photo`}
            accessibilityState={{ busy: taking }}
            onPress={take}
            disabled={taking}
            style={({ pressed }) => [s.shutter, pressed && { opacity: 0.8 }]}
          >
            {taking ? (
              <ActivityIndicator color={color.navy900} />
            ) : (
              <View style={s.shutterInner} />
            )}
          </Pressable>

          {/* Balances the row so the shutter sits centred. */}
          <View style={s.cancel} />
        </View>
      </View>
    </Modal>
  );
}

const SHUTTER = 76;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.night },
  top: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: "rgba(15,22,34,0.55)",
  },
  label: { ...type.heading, color: color.white },
  bottom: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    backgroundColor: "rgba(15,22,34,0.55)",
  },
  cancel: { width: 72 },
  cancelText: { ...type.bodyStrong, color: color.white },
  shutter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.45)",
  },
  shutterInner: {
    width: SHUTTER - 22,
    height: SHUTTER - 22,
    borderRadius: (SHUTTER - 22) / 2,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
});
