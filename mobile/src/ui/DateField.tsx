import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { calendarDateLabel, fromCalendarDate, toCalendarDate } from "./calendarDate";
import { HIT_SIZE, color, radius, space, type } from "./theme";

/**
 * A date field that opens the phone's own calendar instead of asking for
 * "YYYY-MM-DD". The value in and out is still that string, so forms and the
 * API don't change. Android shows its dialog; iOS shows an inline calendar in
 * a sheet with a Done button.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = false,
  disabled = false,
  defaultDate,
}: {
  label: string;
  /** "YYYY-MM-DD", or "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Offer a way back to no date at all (a birthday nobody knows). */
  clearable?: boolean;
  disabled?: boolean;
  /** Where the calendar opens when there's no value yet, as "YYYY-MM-DD". */
  defaultDate?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());

  const start = () => fromCalendarDate(value) ?? fromCalendarDate(defaultDate) ?? new Date();

  const open = () => {
    if (disabled) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start(),
        mode: "date",
        onValueChange: (_e, d) => onChange(toCalendarDate(d)),
      });
    } else {
      setDraft(start());
      setIosOpen(true);
    }
  };

  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? calendarDateLabel(value) : "not set"}`}
          onPress={open}
          disabled={disabled}
          style={[s.input, disabled && { opacity: 0.6 }]}
        >
          <Text style={[s.value, !value && { color: color.faint }]}>
            {value ? calendarDateLabel(value) : placeholder}
          </Text>
          <Ionicons name="calendar-outline" size={20} color={color.navy700} />
        </Pressable>
        {clearable && !!value && !disabled && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            onPress={() => onChange("")}
            hitSlop={8}
            style={s.clear}
          >
            <Ionicons name="close-circle" size={22} color={color.faint} />
          </Pressable>
        )}
      </View>

      {Platform.OS === "ios" && (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setIosOpen(false)} accessibilityLabel="Close" />
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Pressable onPress={() => setIosOpen(false)} hitSlop={10}>
                <Text style={s.cancel}>Cancel</Text>
              </Pressable>
              <Text style={s.sheetTitle}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(toCalendarDate(draft));
                  setIosOpen(false);
                }}
                hitSlop={10}
              >
                <Text style={s.done}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              onValueChange={(_e, d) => setDraft(d)}
              accentColor={color.teal700}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { ...type.label, color: color.muted, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  input: {
    flex: 1,
    minHeight: HIT_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: color.field,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: color.white,
  },
  value: { ...type.body, color: color.ink },
  clear: { padding: space.xs },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: space.xxl,
    paddingHorizontal: space.md,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.md,
  },
  sheetTitle: { ...type.bodyStrong, color: color.ink },
  cancel: { ...type.body, color: color.muted },
  done: { ...type.bodyStrong, color: color.teal700 },
});
