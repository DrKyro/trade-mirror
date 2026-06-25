import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { LanguageToggle } from "#/components/language-toggle";
import { authQueryOptions } from "#/lib/auth/queries";

export const Route = createFileRoute("/_guest")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    // Redirect path when user is already present,
    // or after successful login/signup
    const REDIRECT_URL = "/app";

    const user = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    });
    if (user) {
      throw redirect({
        to: REDIRECT_URL,
      });
    }

    return {
      redirectUrl: REDIRECT_URL,
    };
  },
});

function RouteComponent() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm justify-end">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
