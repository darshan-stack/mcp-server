import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: any;
  res: any;
  user: User | null;
};

export async function createContext(opts: any): Promise<TrpcContext> {
  // Local mode — no Manus OAuth. Always treated as owner/admin.
  const user: User = {
    id: 1,
    openId: "local_owner",
    name: "Owner",
    email: null,
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
