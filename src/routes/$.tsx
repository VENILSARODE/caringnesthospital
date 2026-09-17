import { createFileRoute } from "@tanstack/react-router";
import HMSApp from "../hms/App";

// Catch-all so TanStack hands every URL to the BrowserRouter inside HMSApp.
export const Route = createFileRoute("/$")({
  component: HMSApp,
});
