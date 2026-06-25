import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { managedUsersQueryOptions } from "#/lib/auth/admin-queries";
import {
  $createManagedUser,
  $removeManagedUser,
  $setManagedUserPassword,
  $updateManagedUser,
} from "#/lib/auth/admin-repository";
import { authQueryOptions } from "#/lib/auth/queries";
import { isAdminUser } from "#/lib/auth/roles";
import { useI18n } from "#/lib/i18n";

export const Route = createFileRoute("/_auth/app/users")({
  loader: async ({ context }) => {
    const currentUser = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    });
    if (!currentUser || !isAdminUser(currentUser)) {
      throw new Error("Forbidden");
    }

    const managedUsers = await context.queryClient.fetchQuery(managedUsersQueryOptions());
    return {
      currentUser,
      managedUsers,
    };
  },
  component: UsersPage,
});

function UsersPage() {
  const { currentUser, managedUsers } = Route.useLoaderData();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });

  const refreshManagedUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth", "managed-users"] });
    await router.invalidate();
  };

  return (
    <TradingPageShell title={t("users.title")} description={t("users.description")}>
      <form
        className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await $createManagedUser({
            data: {
              name: createForm.name,
              email: createForm.email,
              password: createForm.password,
              role: createForm.role as "admin" | "user",
            },
          });
          setCreateForm({
            name: "",
            email: "",
            password: "",
            role: "user",
          });
          await refreshManagedUsers();
        }}
      >
        <div className="text-sm text-muted-foreground md:col-span-2">{t("users.createHint")}</div>
        <ManagedField
          label={t("common.name")}
          value={createForm.name}
          onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))}
        />
        <ManagedField
          label={t("common.email")}
          value={createForm.email}
          onChange={(value) => setCreateForm((current) => ({ ...current, email: value }))}
        />
        <ManagedField
          label={t("common.password")}
          type="password"
          value={createForm.password}
          onChange={(value) => setCreateForm((current) => ({ ...current, password: value }))}
        />
        <RoleField
          value={createForm.role}
          onChange={(value) => setCreateForm((current) => ({ ...current, role: value }))}
        />
        <div className="flex justify-end md:col-span-2">
          <Button type="submit">{t("users.createUser")}</Button>
        </div>
      </form>

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 text-sm text-muted-foreground">
          {t("users.total", { count: managedUsers.total })}
        </div>
        <div className="divide-y">
          {managedUsers.users.map((user) => (
            <ManagedUserRow
              key={user.id}
              user={user}
              currentUserId={currentUser.id}
              onChanged={async () => {
                await refreshManagedUsers();
              }}
            />
          ))}
        </div>
      </div>
    </TradingPageShell>
  );
}

function ManagedUserRow(props: {
  user: {
    id: string;
    name: string;
    email: string;
    role: string | null;
  };
  currentUserId: string;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: props.user.name,
    email: props.user.email,
    role: props.user.role ?? "user",
    password: "",
  });

  const isSelf = useMemo(
    () => props.user.id === props.currentUserId,
    [props.currentUserId, props.user.id],
  );

  return (
    <div className="grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ManagedField
          label={t("common.name")}
          value={form.name}
          onChange={(value) => setForm((current) => ({ ...current, name: value }))}
        />
        <ManagedField
          label={t("common.email")}
          value={form.email}
          onChange={(value) => setForm((current) => ({ ...current, email: value }))}
        />
        <RoleField
          value={form.role}
          onChange={(value) => setForm((current) => ({ ...current, role: value }))}
        />
        <ManagedField
          label={t("users.resetPassword")}
          type="password"
          value={form.password}
          onChange={(value) => setForm((current) => ({ ...current, password: value }))}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {props.user.id} {isSelf ? `· ${t("common.currentSession")}` : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await $updateManagedUser({
                data: {
                  userId: props.user.id,
                  name: form.name,
                  email: form.email,
                  role: form.role as "admin" | "user",
                },
              });
              await props.onChanged();
            }}
          >
            {t("users.saveProfile")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!form.password}
            onClick={async () => {
              await $setManagedUserPassword({
                data: {
                  userId: props.user.id,
                  password: form.password,
                },
              });
              setForm((current) => ({ ...current, password: "" }));
              await props.onChanged();
            }}
          >
            {t("users.setPassword")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isSelf}
            onClick={async () => {
              await $removeManagedUser({
                data: {
                  userId: props.user.id,
                },
              });
              await props.onChanged();
            }}
          >
            {t("users.deleteUser")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ManagedField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  const id = props.label.toLowerCase().replaceAll(" ", "-");

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function RoleField(props: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-2">
      <Label htmlFor="role">{t("common.role")}</Label>
      <select
        id="role"
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="user">{t("common.user")}</option>
        <option value="admin">{t("common.admin")}</option>
      </select>
    </div>
  );
}
