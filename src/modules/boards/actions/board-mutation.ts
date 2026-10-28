import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import type { Permission } from "@/lib/auth/types";

/** All child mutations refresh the two board route trees once, after success only. */
export function boardMutation<T extends z.ZodType, R>({
  name,
  schema,
  permission,
  mutate,
}: {
  name: string;
  schema: T;
  permission: Permission;
  mutate: (input: z.output<T>, actorUserId: number) => Promise<R>;
}) {
  return action({
    name,
    schema,
    permission,
    handler: async (input, ctx) => {
      const result = await mutate(input, ctx.session.userId);
      revalidatePath("/boards", "layout");
      revalidatePath("/projects/[id]/boards", "layout");
      return result;
    },
  });
}
