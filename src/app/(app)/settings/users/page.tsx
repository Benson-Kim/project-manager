import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ListPager } from "@/components/ui/data-view/list-pager";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { DEFAULT_PAGE_SIZE, parseListParams, totalPages } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { AddUserButton, UserActions } from "@/modules/auth/components/users-admin";
import { listUsers } from "@/modules/auth/repository/users";
import { USER_SORT, type UserRow } from "@/modules/auth/schemas/user";

const U = messages.settings.users;

export const metadata: Metadata = { title: `${U.title} — ${messages.app.name}` };

function statusOf(user: UserRow, now = Date.now()): string {
  if (!user.IsActive) return U.deactivated;
  if (user.LockedUntilUtc && user.LockedUntilUtc.getTime() > now) return U.locked;
  if (user.MustChangePassword) return U.mustChangePassword;
  return U.active;
}

/**
 * Settings > Users, Admin only. notFound() for a User keeps the page out of reach, and
 * usp_User_List refuses a non-Admin too, so hiding the link is never the only control.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  if (session.role !== "Admin") notFound();
  const params = parseListParams(await searchParams, USER_SORT);
  const { rows: users, totalCount } = await listUsers(params, session.userId);

  return (
    <>
      <PageHeader title={U.title} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput testId="users-search" placeholder={U.search} />
        </div>
        <AddUserButton />
      </div>
      <div className="overflow-x-auto">
        <table data-testid="users-table" className="w-full text-left text-sm">
          <thead className="text-ink-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                {U.displayName}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {U.username}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {U.role}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {U.status}
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">{messages.datasheet.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.UserId} className="border-t border-line">
                <td className="py-2 pr-4 text-ink">
                  {user.DisplayName}
                  {user.UserId === session.userId ? (
                    <span className="ml-2 text-ink-muted">({U.you})</span>
                  ) : null}
                </td>
                <td className="py-2 pr-4 text-ink">{user.Username}</td>
                <td className="py-2 pr-4 text-ink">
                  {user.RoleName ? U.roles[user.RoleName] : ""}
                </td>
                <td className="py-2 pr-4">
                  <Badge value={statusOf(user)} />
                </td>
                <td className="py-2">
                  {user.RoleName ? (
                    <UserActions
                      isSelf={user.UserId === session.userId}
                      user={{
                        userId: user.UserId,
                        username: user.Username,
                        displayName: user.DisplayName,
                        email: user.Email,
                        role: user.RoleName,
                        isActive: user.IsActive,
                        rowVer: user.RowVer,
                      }}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ListPager
        className="mt-4"
        page={params.page}
        pages={totalPages(totalCount, DEFAULT_PAGE_SIZE)}
      />
    </>
  );
}
