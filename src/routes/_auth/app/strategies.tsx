import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/app/strategies")({
  beforeLoad: () => {
    throw redirect({ to: "/app/traders", replace: true });
  },
});
