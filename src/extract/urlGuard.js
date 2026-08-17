// URL guard for the fetch step. NO store allowlist (would reinstate "define the stores"). Two jobs:
//   1. SSRF safety — https-only, reject localhost/*.local/*.internal and any IP-literal host.
//   2. Skip obvious non-store noise via a tiny denylist (not a store definition).
// The real "is it a product?" decision happens later in extraction (Phase 4).

const DENY_DOMAINS = [
  'youtube.com', 'youtu.be', 'wikipedia.org', 'facebook.com', 'x.com', 'twitter.com',
  'instagram.com', 'reddit.com', 'pinterest.com', 'quora.com', 'tiktok.com', 'linkedin.com',
  'gsmarena.com',
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// SSRF-safe? https + a real public domain name (no IP literals, no local hosts).
function isSafeUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  // Reject any IP-literal host (IPv4 dotted-quad or IPv6 with ':'). Real stores use domain names, and
  // this blocks loopback/private/link-local + cloud-metadata SSRF targets without needing DNS.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
  return true;
}

// Obvious non-store domain (exact or subdomain)?
function isDenied(url) {
  const host = hostnameOf(url);
  if (!host) return true;
  return DENY_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Keep a link if it's safe to fetch and not obvious non-store noise.
function keepLink(url) {
  return isSafeUrl(url) && !isDenied(url);
}

// Filter a list of links (strings or { url }) down to keepers.
function filterLinks(links) {
  return (links || []).filter((l) => keepLink(typeof l === 'string' ? l : l && l.url));
}

module.exports = { isSafeUrl, isDenied, keepLink, filterLinks, DENY_DOMAINS };
