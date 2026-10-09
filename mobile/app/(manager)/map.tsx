import { DayMapScreen } from "@/features/map/DayMapScreen";

/** Every worker's stops for the day, one color per worker. */
export default function ManagerMap() {
  return (
    <DayMapScreen byWorker jobHref={(taskId, day) => `/(manager)/job/${taskId}?day=${day}`} />
  );
}
