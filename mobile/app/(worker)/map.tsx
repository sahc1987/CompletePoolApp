import { DayMapScreen } from "@/features/map/DayMapScreen";

/** The worker's own route for the day. */
export default function WorkerMap() {
  return <DayMapScreen jobHref={(taskId) => `/(worker)/task/${taskId}`} />;
}
