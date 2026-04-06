import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || 1));
  const limit = 50;
  const offset = (page - 1) * limit;

  const result = await auth.api.listUsers({
    headers: await headers(),
    query: {
      limit,
      offset,
      sortBy: "createdAt",
      sortDirection: "desc",
    },
  });

  const users = result.users;
  const total = result.total;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs text-foreground/40 font-mono">
          {total} user{total !== 1 ? "s" : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            {page > 1 && (
              <a
                href={`/dashboard/admin/users?page=${page - 1}`}
                className="text-foreground/40 hover:text-foreground/60"
              >
                ← prev
              </a>
            )}
            <span className="text-foreground/30">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={`/dashboard/admin/users?page=${page + 1}`}
                className="text-foreground/40 hover:text-foreground/60"
              >
                next →
              </a>
            )}
          </div>
        )}
      </div>

      <div className="border border-foreground/[0.08] rounded overflow-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                User
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Email
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02] transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt=""
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-foreground/[0.08] flex items-center justify-center text-[10px] text-foreground/40">
                        {(user.name?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                    <span className="text-[13px]">
                      {user.name || "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/50 font-mono">
                  {user.email}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/30">
                  {formatDate(user.createdAt.toString())}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-12 text-center text-foreground/25 text-sm"
                >
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
