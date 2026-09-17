import { createFileRoute } from "@tanstack/react-router";
import HMSApp from "../hms/App";

export const Route = createFileRoute("/")({
  component: HMSApp,
});
