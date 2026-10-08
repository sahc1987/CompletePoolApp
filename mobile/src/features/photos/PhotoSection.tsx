import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCameraPermissions } from "expo-camera";
import type { PhotoTypeValue } from "@contracts/enums";
import { ApiError } from "@/api/client";
import { photos as photosApi, uploadTaskPhoto, type TaskPhoto } from "@/api/photos";
import { Body, Button, Card, Heading } from "@/ui/components";
import { color, radius, space, type } from "@/ui/theme";
import { CameraCapture } from "./CameraCapture";

/**
 * Before/after photos on a job.
 *
 * Grouped by kind rather than shown as one strip: "before" and "after" only
 * mean anything in contrast, and a reviewer needs to see which is which at a
 * glance.
 */

const GROUPS: { type: PhotoTypeValue; label: string }[] = [
  { type: "BEFORE", label: "Before" },
  { type: "AFTER", label: "After" },
];

export function PhotoSection({
  taskId,
  editable,
}: {
  taskId: string;
  /** False once the job is closed — its photos are then part of what was billed. */
  editable: boolean;
}) {
  const [items, setItems] = useState<TaskPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<PhotoTypeValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<PhotoTypeValue | null>(null);
  const [viewing, setViewing] = useState<TaskPhoto | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const load = useCallback(async () => {
    try {
      setItems(await photosApi.list(taskId));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load photos.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startCapture = async (type: PhotoTypeValue) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Camera access needed",
          "Photos of the job are taken with the camera. You can turn this on in Settings.",
          [{ text: "OK" }]
        );
        return;
      }
    }
    setCapturing(type);
  };

  const onCaptured = async (type: PhotoTypeValue, uri: string) => {
    setCapturing(null);
    setBusyType(type);
    setError(null);
    try {
      await uploadTaskPhoto(taskId, type, uri);
      // Re-read rather than appending what was just uploaded: the list is what
      // carries the signed display URLs.
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Couldn't upload that photo."
      );
    } finally {
      setBusyType(null);
    }
  };

  const confirmRemove = (photo: TaskPhoto) =>
    Alert.alert("Delete this photo?", "You can take another in its place.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setViewing(null);
          try {
            await photosApi.remove(photo.id);
            setItems((prev) => prev.filter((p) => p.id !== photo.id));
          } catch (e) {
            setError(
              e instanceof ApiError ? e.message : "Couldn't delete that photo."
            );
          }
        },
      },
    ]);

  return (
    <Card>
      <Heading>Photos</Heading>
      <Body tone="muted">
        A before and after shot is the record of what you did on this job.
      </Body>

      {loading && (
        <ActivityIndicator style={{ marginTop: space.lg }} color={color.navy700} />
      )}

      {!loading &&
        GROUPS.map(({ type, label }) => {
          const group = items.filter((p) => p.type === type);
          return (
            <View key={type} style={{ marginTop: space.lg }}>
              <Text style={s.groupLabel}>
                {label}
                {group.length > 0 ? ` · ${group.length}` : ""}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.sm }}
              >
                {group.map((photo) => (
                  <Pressable
                    key={photo.id}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`${label} photo`}
                    onPress={() => setViewing(photo)}
                    style={s.thumb}
                  >
                    {photo.url ? (
                      <Image
                        source={{ uri: photo.url }}
                        style={s.thumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[s.thumbImage, s.thumbMissing]}>
                        <Text style={s.missingText}>Unavailable</Text>
                      </View>
                    )}
                  </Pressable>
                ))}

                {editable && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Take a ${label.toLowerCase()} photo`}
                    onPress={() => startCapture(type)}
                    disabled={busyType !== null}
                    style={({ pressed }) => [
                      s.thumb,
                      s.addTile,
                      pressed && { opacity: 0.8 },
                      busyType !== null && { opacity: 0.5 },
                    ]}
                  >
                    {busyType === type ? (
                      <ActivityIndicator color={color.navy700} />
                    ) : (
                      <>
                        <Text style={s.addPlus}>+</Text>
                        <Text style={s.addLabel}>Take photo</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </ScrollView>

              {!editable && group.length === 0 && (
                <Text style={s.none}>No {label.toLowerCase()} photo.</Text>
              )}
            </View>
          );
        })}

      {!!error && (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      {capturing && (
        <CameraCapture
          label={capturing === "BEFORE" ? "Before" : "After"}
          onCancel={() => setCapturing(null)}
          onCaptured={(uri) => onCaptured(capturing, uri)}
        />
      )}

      <Modal visible={!!viewing} transparent animationType="fade">
        <View style={s.viewerBackdrop}>
          {viewing?.url && (
            <Image
              source={{ uri: viewing.url }}
              style={s.viewerImage}
              resizeMode="contain"
            />
          )}
          <View style={s.viewerActions}>
            <Button
              title="Close"
              variant="secondary"
              onPress={() => setViewing(null)}
              style={{ flex: 1 }}
            />
            {editable && !!viewing && (
              <Button
                title="Delete"
                variant="danger"
                onPress={() => confirmRemove(viewing)}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const THUMB = 104;

const s = StyleSheet.create({
  groupLabel: { ...type.label, color: color.faint, marginBottom: space.sm },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: color.chrome100,
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbMissing: { alignItems: "center", justifyContent: "center" },
  missingText: { ...type.small, color: color.faint },
  addTile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.field,
    borderStyle: "dashed",
    backgroundColor: color.white,
  },
  addPlus: { fontSize: 28, color: color.navy700, lineHeight: 32 },
  addLabel: { ...type.small, color: color.navy700 },
  none: { ...type.small, color: color.faint },
  error: { ...type.small, color: color.danger, marginTop: space.md },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,22,34,0.94)",
    justifyContent: "center",
    padding: space.lg,
  },
  viewerImage: { flex: 1, width: "100%" },
  viewerActions: {
    flexDirection: "row",
    gap: space.md,
    paddingTop: space.lg,
  },
});
