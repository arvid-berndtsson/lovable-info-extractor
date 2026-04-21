const URL_PATTERN = /https?:\/\/[^\s"'<>`]+/gim;
const LOVABLE_ORIGIN = "https://lovable.dev";

const EMPTY_SUMMARY = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  total: 0
};

function normalizeCandidate(raw) {
  const trimmed = raw.trim().replace(/[),.;]+$/g, "");
  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function extractUrlsFromText(text) {
  const rawMatches = String(text).match(URL_PATTERN) || [];
  const urls = [];
  for (const candidate of rawMatches) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) {
      urls.push(normalized);
    }
  }
  return urls;
}

function isLovableProjectPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "lovable.dev" && parsed.pathname.startsWith("/projects/");
  } catch {
    return false;
  }
}

function isPublishedProjectUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "lovable.dev") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function collectProjectUrls(textArtifacts) {
  const projectPages = new Set();
  const publishedUrls = new Set();

  for (const artifact of textArtifacts || []) {
    const urls = extractUrlsFromText(artifact);
    for (const url of urls) {
      if (isLovableProjectPage(url)) {
        projectPages.add(url);
      } else if (isPublishedProjectUrl(url)) {
        publishedUrls.add(url);
      }
    }
  }

  return {
    projectPages: [...projectPages].sort(),
    publishedUrls: [...publishedUrls].sort()
  };
}

export function parseSecuritySummary(text) {
  const summary = { ...EMPTY_SUMMARY };
  const content = String(text || "");

  for (const severity of ["critical", "high", "medium", "low"]) {
    const pattern = new RegExp(`\\b${severity}\\b[^\\d]{0,24}(\\d+)`, "i");
    const match = content.match(pattern);
    if (match) {
      summary[severity] = Number(match[1]) || 0;
    }
  }

  summary.total = summary.critical + summary.high + summary.medium + summary.low;
  return summary;
}

export function buildProjectVisitUrls(viewLinks, origin = LOVABLE_ORIGIN) {
  const securityViewUrls = new Set();
  const projectPageUrls = new Set();

  for (const rawLink of viewLinks || []) {
    if (!rawLink) {
      continue;
    }

    let parsed;
    try {
      parsed = new URL(String(rawLink), origin);
    } catch {
      continue;
    }

    if (parsed.hostname !== new URL(origin).hostname) {
      continue;
    }
    if (!parsed.pathname.startsWith("/projects/")) {
      continue;
    }

    parsed.hash = "";
    securityViewUrls.add(parsed.toString());

    const projectUrl = new URL(parsed.toString());
    projectUrl.search = "";
    projectUrl.hash = "";
    projectPageUrls.add(projectUrl.toString());
  }

  return {
    securityViewUrls: [...securityViewUrls].sort(),
    projectPageUrls: [...projectPageUrls].sort()
  };
}
