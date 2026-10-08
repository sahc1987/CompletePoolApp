import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  HIT_SIZE,
  color,
  heroGradient,
  radius,
  shadow,
  space,
  statusTone,
  tileTone,
  type,
} from "./theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export { Ionicons as Icon };
import { useLayout } from "./useLayout";

/**
 * The shared pieces every screen is built from. Kept deliberately small — a
 * component earns its place here once a second screen needs it.
 */

/** Page frame: safe area, background, and the tablet width cap. */
export function Screen({
  children,
  scroll = true,
  refreshControl,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { contentMaxWidth } = useLayout();

  const inner = (
    <View style={[{ width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }, style]}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[s.screen, { paddingBottom: insets.bottom }]}>{inner}</View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: space.lg,
        // Clear of the home indicator and the floating tab bar, which sits
        // over the content rather than below it.
        paddingBottom: insets.bottom + 110,
      }}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {inner}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={s.heading}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Body({
  children,
  tone = "ink",
}: {
  children: ReactNode;
  tone?: "ink" | "muted" | "faint" | "danger";
}) {
  return <Text style={[s.body, { color: color[tone] }]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inert = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [
        s.button,
        variant === "primary" && s.buttonPrimary,
        variant === "secondary" && s.buttonSecondary,
        variant === "danger" && s.buttonDanger,
        pressed && !inert && s.buttonPressed,
        inert && s.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "secondary" ? color.navy700 : color.white}
        />
      ) : (
        <Text
          style={[
            s.buttonText,
            variant === "secondary" && { color: color.navy700 },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.faint}
        style={[s.input, !!error && { borderColor: color.danger }]}
        {...props}
      />
      {!!error && <Text style={s.fieldError}>{error}</Text>}
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone[status] ?? {
    label: status,
    fg: color.faint,
    bg: color.chrome100,
  };
  return (
    <View style={[s.badge, { backgroundColor: tone.bg }]}>
      <Text style={[s.badgeText, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

/**
 * What a screen shows instead of a blank page. Always says what would be here
 * and, where there is one, what to do about it — "nothing yet" alone reads as
 * a failure.
 */
export function Empty({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: space.xxl }}>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!detail && <Text style={s.emptyDetail}>{detail}</Text>}
    </Card>
  );
}

/** A failure the user can act on: what went wrong, and a way to try again. */
export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card style={{ borderColor: color.danger, borderWidth: 1 }}>
      <Text style={[s.body, { color: color.danger }]}>{message}</Text>
      {!!onRetry && (
        <Button
          title="Try again"
          variant="secondary"
          onPress={onRetry}
          style={{ marginTop: space.md }}
        />
      )}
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.loading}>
      <ActivityIndicator size="large" color={color.navy700} />
      {!!label && (
        <Text style={[s.body, { color: color.muted, marginTop: space.md }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

/**
 * The blue curved header that opens a top-level screen. Full-bleed: it cancels
 * the Screen's padding so the gradient reaches the edges, and clears the
 * status bar itself because these screens hide the navigation header.
 */
export function Hero({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Top-right slot, e.g. an Avatar. */
  right?: ReactNode;
  /** Extra content inside the blue area, under the title. */
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.hero, { paddingTop: insets.top + space.lg }]}
    >
      <View style={s.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>{title}</Text>
          {!!subtitle && <Text style={s.heroSubtitle}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

/** Initials in a circle — the signed-in person, top right of the header. */
export function Avatar({ name, onPress }: { name: string; onPress?: () => void }) {
  const initials = name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Account for ${name}`}
      onPress={onPress}
      disabled={!onPress}
      style={s.avatar}
    >
      <Text style={s.avatarText}>{initials || "?"}</Text>
    </Pressable>
  );
}

/** A dashboard tile: tinted icon, label, and an optional one-line detail. */
export function Tile({
  icon,
  label,
  detail,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  tone: keyof typeof tileTone;
  onPress: () => void;
}) {
  const t = tileTone[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]}
    >
      <View style={[s.tileIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={28} color={t.fg} />
      </View>
      <Text style={s.tileLabel}>{label}</Text>
      {!!detail && (
        <Text style={s.tileDetail} numberOfLines={1}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

/** One option in a wrapping row of choices — a material, a client, a job. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipOn]}
    >
      <Text style={[s.chipText, selected && { color: color.white }]}>{label}</Text>
    </Pressable>
  );
}

/** A label/value pair, used down the detail screens. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        {typeof value === "string" ? (
          <Text style={s.rowValue}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  title: { ...type.title, color: color.ink, marginBottom: space.sm },
  heading: { ...type.heading, color: color.ink, marginBottom: space.sm },
  body: { ...type.body, color: color.ink, lineHeight: 22 },
  label: {
    ...type.label,
    color: color.faint,
    marginBottom: space.sm,
  },
  button: {
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonPrimary: { backgroundColor: color.teal700 },
  buttonSecondary: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.field,
  },
  buttonDanger: { backgroundColor: color.danger },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...type.bodyStrong, color: color.white },
  fieldLabel: {
    ...type.label,
    color: color.muted,
    marginBottom: space.xs,
  },
  input: {
    minHeight: HIT_SIZE,
    borderWidth: 1,
    borderColor: color.field,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: color.white,
    ...type.body,
    color: color.ink,
  },
  fieldError: { ...type.small, color: color.danger, marginTop: space.xs },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  emptyTitle: { ...type.bodyStrong, color: color.ink, textAlign: "center" },
  emptyDetail: {
    ...type.small,
    color: color.muted,
    textAlign: "center",
    marginTop: space.xs,
  },
  loading: { padding: space.xxl, alignItems: "center" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.lg,
    paddingVertical: space.sm,
  },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.field,
    backgroundColor: color.white,
  },
  chipOn: { backgroundColor: color.teal700, borderColor: color.teal700 },
  chipText: { ...type.small, color: color.ink, fontWeight: "600" },
  hero: {
    marginHorizontal: -space.lg,
    marginTop: -space.lg,
    marginBottom: space.lg,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroTitle: { ...type.display, color: color.white },
  heroSubtitle: { ...type.body, color: "#d6e4ff", marginTop: space.xs },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...type.bodyStrong, color: color.white },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: color.white,
    borderRadius: radius.xl,
    paddingVertical: space.xl,
    paddingHorizontal: space.md,
    alignItems: "center",
    ...shadow.card,
  },
  tileIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  tileLabel: { ...type.bodyStrong, color: color.ink, textAlign: "center" },
  tileDetail: { ...type.small, color: color.muted, marginTop: 2, textAlign: "center" },
  rowLabel: { ...type.small, color: color.muted },
  rowValue: { ...type.bodyStrong, color: color.ink, textAlign: "right" },
});
