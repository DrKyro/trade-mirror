import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth/auth-client";
import { useI18n } from "#/lib/i18n";

interface SocialLoginButtonProps {
  provider: string;
  icon: React.ReactNode;
  disabled?: boolean;
  callbackURL: string;
}

export function SignInSocialButton(props: SocialLoginButtonProps) {
  const { t } = useI18n();
  const providerLabel =
    props.provider === "github"
      ? "GitHub"
      : props.provider.charAt(0).toUpperCase() + props.provider.slice(1);

  const mutation = useMutation({
    mutationFn: async () =>
      await authClient.signIn.social(
        {
          provider: props.provider,
          callbackURL: props.callbackURL,
        },
        {
          onError: ({ error }) => {
            toast.error(error.message || t("error.socialSignIn", { provider: providerLabel }));
          },
        },
      ),
  });

  return (
    <Button
      variant="secondary"
      className="w-full"
      type="button"
      disabled={mutation.isSuccess || mutation.isPending || props.disabled}
      onClick={() => mutation.mutate()}
    >
      {props.icon}
      {t("auth.loginWith", { provider: providerLabel })}
    </Button>
  );
}
