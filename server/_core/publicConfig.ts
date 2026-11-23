// Empty config since we're not using Manus platform
export function publicPlatformConfig(): Record<string, string> {
  return {
    projectId: "",
    oauthPortalUrl: "",
    apiUrl: "",
    apiBrowserKey: "",
  };
}

export function publicPlatformScript(): string {
  const json = JSON.stringify(publicPlatformConfig()).replaceAll("<", "\\u003c");
  return `window.__MANUS_CONFIG__=${json};`;
}