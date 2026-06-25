import { queryOptions } from "@tanstack/react-query";

import { $listManagedUsers } from "#/lib/auth/admin-repository";

export const managedUsersQueryOptions = () =>
  queryOptions({
    queryKey: ["auth", "managed-users"],
    queryFn: ({ signal }) => $listManagedUsers({ signal }),
  });
