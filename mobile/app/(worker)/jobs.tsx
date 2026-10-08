import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useTasks } from "@/api/useTasks";
import type { WorkerTask } from "@/api/endpoints";
import {
  Empty,
  ErrorNotice,
  Icon,
  Loading,
  Screen,
  StatusBadge,
} from "@/ui/components";
import { color, radius, shadow, space, statusTone, type } from "@/ui/theme";

/** A job's start time, rendered in the business's zone rather than the phone's. */
function timeOfDay(iso: string, timeZone: string | undefined) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function JobCard({
  task,
  timeZone,
  onPress,
}: {
  task: WorkerTask;
  timeZone: string | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.serviceName} for ${task.clientName} at ${timeOfDay(task.startTime, timeZone)}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.job,
        // The status color runs down the card's edge, so a list of jobs reads
        // at a glance: what's done, what's next, what came back.
        { borderLeftColor: statusTone[task.status]?.fg ?? color.line },
        pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={s.jobTop}>
        <View style={s.iconLine}>
          <Icon name="time-outline" size={17} color={color.navy700} />
          <Text style={s.time}>{timeOfDay(task.startTime, timeZone)}</Text>
          <Text style={s.duration}>· {task.durationMin} min</Text>
        </View>
        <StatusBadge status={task.status} />
      </View>
      <Text style={s.client}>{task.clientName}</Text>
      <Text style={s.service}>{task.serviceName}</Text>
      <View style={[s.iconLine, { marginTop: space.sm }]}>
        <Icon name="location-outline" size={16} color={color.faint} />
        <Text style={s.address} numberOfLines={2}>
          {task.poolAddress}
        </Text>
      </View>
      {!!task.flagReason && (
        <View style={s.flag}>
          <Text style={s.flagText}>{task.flagReason}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function MyDay() {
  const router = useRouter();
  const { groups, businessDay, loading, refreshing, error, retryable, reload, refresh } =
    useTasks();

  // Coming back from a job that was just started or submitted, the list is
  // stale. Refreshing on focus is what makes the card's status match what the
  // worker did a second ago.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loading label="Loading your jobs…" />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.navy700} />
      }
    >
      {!!error && (
        <ErrorNotice message={error} onRetry={retryable ? reload : undefined} />
      )}

      {!error && groups.length === 0 && (
        <Empty
          title="Nothing scheduled"
          detail="Jobs assigned to you will appear here. Pull down to check again."
        />
      )}

      {groups.map((group) => (
        <View key={group.key} style={{ marginBottom: space.lg }}>
          <Text
            style={[
              s.groupLabel,
              group.key === "rework" && { color: color.danger },
            ]}
          >
            {group.label}
          </Text>
          {group.tasks.map((task) => (
            <JobCard
              key={task.id}
              task={task}
              timeZone={businessDay?.timezone}
              onPress={() => router.push(`/(worker)/task/${task.id}`)}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  groupLabel: { ...type.label, color: color.faint, marginBottom: space.sm },
  job: {
    backgroundColor: color.white,
    borderRadius: radius.xl,
    borderLeftWidth: 5,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  iconLine: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  duration: { ...type.small, color: color.faint },
  jobTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.sm,
  },
  time: { ...type.bodyStrong, color: color.navy700 },
  client: { ...type.title, color: color.ink },
  service: { ...type.body, color: color.muted, marginTop: 2 },
  address: { ...type.small, color: color.faint, flexShrink: 1 },
  flag: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: "#fae3e3",
  },
  flagText: { ...type.small, color: color.danger, lineHeight: 20 },
});
