import { AppError } from "@/lib/errors/app-error";

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const CLOUD_METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google",
  "metadata.azure.internal",
]);

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function ipv4Octets(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets;
}

function isBlockedIpv4(address: string) {
  const octets = ipv4Octets(address);
  if (!octets) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 127 ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function mappedIpv4Address(address: string) {
  const normalized = address.toLowerCase();
  const dottedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMatch) {
    return ipv4Octets(dottedMatch[1]) ? dottedMatch[1] : null;
  }

  const hexadecimalMatch = normalized.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (!hexadecimalMatch) {
    return null;
  }
  const high = Number.parseInt(hexadecimalMatch[1], 16);
  const low = Number.parseInt(hexadecimalMatch[2], 16);
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff,
  ].join(".");
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase();
  const mapped = mappedIpv4Address(normalized);
  if (mapped) {
    return isBlockedIpv4(mapped);
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(normalized) ||
    /^fe[89ab][0-9a-f]:/.test(normalized)
  );
}

export function isBlockedProviderAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ipv4Octets(normalized)) {
    return isBlockedIpv4(normalized);
  }
  if (normalized.includes(":")) {
    return isBlockedIpv6(normalized);
  }
  return true;
}

function isIpLiteral(hostname: string) {
  return ipv4Octets(hostname) !== null || hostname.includes(":");
}

export function isSafeProviderBaseUrl(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }

  if (url.username || url.password || url.search || url.hash) {
    return false;
  }

  const hostname = normalizedHostname(url);
  const isLocalHttpHost = LOCAL_HTTP_HOSTS.has(hostname);
  if (
    CLOUD_METADATA_HOSTS.has(hostname) ||
    (isIpLiteral(hostname) &&
      isBlockedProviderAddress(hostname) &&
      !isLocalHttpHost)
  ) {
    return false;
  }

  if (isLocalHttpHost) {
    return url.protocol === "http:";
  }

  if (url.protocol === "https:") {
    return true;
  }

  return false;
}

export function validateProviderBaseUrl(baseUrl: string) {
  if (!isSafeProviderBaseUrl(baseUrl)) {
    throw new AppError({
      code: "INVALID_PROVIDER_URL",
      message: "Provider Base URL 不符合安全策略。",
      status: 400,
      retryable: false,
    });
  }

  return new URL(baseUrl);
}

export function isExplicitLoopbackHostname(hostname: string) {
  return LOCAL_HTTP_HOSTS.has(hostname.toLowerCase().replace(/^\[|\]$/g, ""));
}

export function buildChatCompletionsUrl(baseUrl: string) {
  const url = validateProviderBaseUrl(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/chat/completions")
    ? pathname
    : `${pathname}/chat/completions`;
  return url.toString();
}
