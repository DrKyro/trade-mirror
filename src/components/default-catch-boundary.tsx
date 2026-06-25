import {
  ErrorComponent,
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from "@tanstack/react-router";

import { useI18n } from "#/lib/i18n";

import { Button } from "./ui/button";

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
  const router = useRouter();
  const { t } = useI18n();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error(error);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => {
            router.invalidate();
          }}
        >
          {t("error.tryAgain")}
        </Button>
        {isRoot ? (
          <Button render={<Link to="/" />} variant="secondary" nativeButton={false}>
            {t("common.home")}
          </Button>
        ) : (
          <Button
            render={
              <Link
                to="/"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.back();
                }}
              />
            }
            variant="secondary"
            nativeButton={false}
          >
            {t("common.goBack")}
          </Button>
        )}
      </div>
    </div>
  );
}
