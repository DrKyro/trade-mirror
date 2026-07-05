import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/app/strategy-board")({
  beforeLoad: () => {
    throw redirect({ to: "/app/performance", replace: true });
  },
});
