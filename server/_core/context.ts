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

  // Vercel normalizes headers to lowercase
  const headers = req.headers || {};

  // Check Authorization header (Basic auth)
  const authHeader = headers.authorization;
  if (authHeader?.startsWith("Basic ")) {
    try {
      const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
      const [, providedPassword] = credentials.split(":");
      if (providedPassword === password) return true;
    } catch {}
  }

  // Check custom header (lowercase on Vercel)
  if (headers["x-access-password"] === password) {
    return true;
  }

  // Also check cookie as fallback
  const cookieHeader = headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/pq_pwd=([^;]+)/);
    if (match && decodeURIComponent(match[1]) === password) return true;
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