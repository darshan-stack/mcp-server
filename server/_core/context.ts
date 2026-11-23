import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: any;
  res: any;
  user: User | null;
};

// Simple password check for Vercel production
function checkAuth(req: any): boolean {
  // In development, always allow (local mode)
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  // In production, check for password header or cookie
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    // No password set - allow access (fallback)
    return true;
  }
  // Check Authorization header (Basic auth) or custom header
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith("Basic ")) {
    const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
    const [, providedPassword] = credentials.split(":");
    return providedPassword === password;
  }
  // Check custom header
  if (req.headers?.["x-access-password"] === password) {
    return true;
  }
  return false;
}

export async function createContext(opts: any): Promise<TrpcContext> {
  const isAuthed = checkAuth(opts.req);

  const user: User = {
    id: 1,
    openId: isAuthed ? "owner" : "unauthorized",
    name: isAuthed ? "Owner" : "Unauthorized",
    email: null,
    loginMethod: "local",
    role: isAuthed ? "admin" : "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    req: opts.req,
    res: opts.res,
    user: isAuthed ? user : null,
  };
}