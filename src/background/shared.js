export const LOVABLE_ORIGIN = "https://lovable.dev";
export const MAX_PAGES = 500;
export const LOAD_TIMEOUT_MS = 30000;
export const POST_LOAD_DELAY_MS = 1200;
export const PROJECT_PAGE_LOAD_TIMEOUT_MS = 60000;
export const PROJECT_PAGE_POST_LOAD_DELAY_MS = 3500;

export const SECURITY_SECTIONS = [
  { key: "overview", path: "/settings/security-center" },
  { key: "supplyChain", path: "/settings/security-center?section=supply-chain" },
  { key: "secrets", path: "/settings/security-center?section=secrets" }
];

export function nowIso() {
  return new Date().toISOString();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toAbsoluteLovableUrl(path) {
  return new URL(path, LOVABLE_ORIGIN).toString();
}

export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isLovableProjectPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "lovable.dev" && parsed.pathname.startsWith("/projects/");
  } catch {
    return false;
  }
}

export function ensureProjectSecurityViewUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "lovable.dev" || !parsed.pathname.startsWith("/projects/")) {
      return parsed.toString();
    }
    parsed.searchParams.set("view", "security");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function stripProjectSecurityViewUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "lovable.dev" || !parsed.pathname.startsWith("/projects/")) {
      return parsed.toString();
    }
    if (parsed.searchParams.get("view") !== "security") {
      return parsed.toString();
    }
    parsed.searchParams.delete("view");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isProjectSecurityViewUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "lovable.dev" &&
      parsed.pathname.startsWith("/projects/") &&
      parsed.searchParams.get("view") === "security"
    );
  } catch {
    return false;
  }
}

export function getPageLoadTimeoutMs(url) {
  return isLovableProjectPage(url) ? PROJECT_PAGE_LOAD_TIMEOUT_MS : LOAD_TIMEOUT_MS;
}

export function getPostLoadDelayMs(url) {
  return isLovableProjectPage(url) ? PROJECT_PAGE_POST_LOAD_DELAY_MS : POST_LOAD_DELAY_MS;
}

export function isLovableUrl(url) {
  try {
    return new URL(url).hostname === "lovable.dev";
  } catch {
    return false;
  }
}

export function resolveSectionKey(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "lovable.dev" || parsed.pathname !== "/settings/security-center") {
      return null;
    }
    const section = parsed.searchParams.get("section");
    if (!section) {
      return "overview";
    }
    if (section === "supply-chain") {
      return "supplyChain";
    }
    if (section === "secrets") {
      return "secrets";
    }
    return null;
  } catch {
    return null;
  }
}
