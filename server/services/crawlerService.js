import crypto from 'crypto';
import { load } from 'cheerio';
import CrawledPage from '../models/CrawledPage.js';

const IGNORED_PROTOCOLS = new Set(['mailto:', 'tel:', 'javascript:']);

let crawlInProgress = false;

function getCrawlerTimeoutMs() {
  const timeoutMs = Number(process.env.CRAWLER_TIMEOUT || '15000');
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;
}

function getCrawlerUserAgent() {
  return process.env.CRAWLER_USER_AGENT || 'Mozilla/5.0 (compatible; IntelliFlickBot/1.0)';
}

function buildRequestHeaders() {
  return {
    'User-Agent': getCrawlerUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };
}

function isRetryableFetchError(error) {
  const causeText = `${error?.cause?.code || ''} ${error?.cause?.message || ''}`.toLowerCase();
  const message = `${error?.name || ''} ${error?.message || ''} ${causeText}`.toLowerCase();

  return (
    message.includes('fetch failed') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('certificate') ||
    message.includes('tls') ||
    message.includes('socket hang up')
  );
}

function getAlternateSchemeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      parsed.protocol = 'http:';
      return parsed.toString();
    }

    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
  } catch {
    // Ignore invalid URLs.
  }

  return null;
}

function getSeedUrls() {
  const rawUrls = process.env.CRAWLER_URLS || process.env.WEB_CRAWL_URLS || '';

  return rawUrls
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

function cleanWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';

    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function isInternalLink(candidateUrl, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl, baseUrl);
    return candidate.origin === base.origin;
  } catch {
    return false;
  }
}

function getPageRoot($) {
  const selectors = ['main', 'article', '.site-main', '.entry-content', '#content', 'body'];

  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      return element.clone();
    }
  }

  return $('body').first().clone();
}

function getFooterRoot($) {
  const footer = $('footer').first();
  return footer.length > 0 ? footer.clone() : null;
}

function getTitle($, fallbackUrl) {
  const title = cleanWhitespace($('title').first().text() || '');
  if (title) {
    return title;
  }

  const h1 = cleanWhitespace($('h1').first().text() || '');
  if (h1) {
    return h1;
  }

  return fallbackUrl;
}

function collectHeadingsFromRoot($, root) {
  const headings = [];
  const seen = new Set();

  root.find('h1,h2,h3,h4,h5,h6').each((_, element) => {
    const text = cleanWhitespace($(element).text());
    if (text && !seen.has(text)) {
      seen.add(text);
      headings.push(text);
    }
  });

  return headings;
}

function collectBlockTextFromRoot($, root) {
  root.find('script, style, noscript, nav, header, aside, svg, iframe').remove();

  const blocks = [];
  const seen = new Set();

  const blockSelectors = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,address,figcaption,caption,td,th,dt,dd';

  root.find(blockSelectors).each((_, element) => {
    const text = cleanWhitespace($(element).text());
    if (text && !seen.has(text)) {
      seen.add(text);
      blocks.push(text);
    }
  });

  root.find('table').each((tableIndex, table) => {
    const rows = [];

    $(table)
      .find('tr')
      .each((_, row) => {
        const cells = [];

        $(row)
          .find('th, td')
          .each((_, cell) => {
            const text = cleanWhitespace($(cell).text());
            if (text) {
              cells.push(text);
            }
          });

        if (cells.length > 0) {
          rows.push(cells.join(' | '));
        }
      });

    if (rows.length > 0) {
      blocks.push(`Table ${tableIndex + 1}:\n${rows.join('\n')}`);
    }
  });

  return blocks.join('\n');
}

function extractStructuredPageContent($) {
  const mainRoot = getPageRoot($);
  const footerRoot = getFooterRoot($);

  const mainClone = mainRoot.clone();
  mainClone.find('footer').remove();

  const footerClone = footerRoot ? footerRoot.clone() : null;

  const headings = [
    ...collectHeadingsFromRoot($, mainClone),
    ...(footerClone ? collectHeadingsFromRoot($, footerClone) : []),
  ];

  const uniqueHeadings = [...new Set(headings)].filter(Boolean);
  const mainContent = collectBlockTextFromRoot($, mainClone).slice(0, 40000);
  const footerContent = footerClone ? collectBlockTextFromRoot($, footerClone).slice(0, 10000) : '';

  return {
    headings: uniqueHeadings,
    mainContent,
    footerContent,
  };
}

function extractCanonicalUrl($, fallbackUrl) {
  const canonicalHref = $('link[rel="canonical"]').attr('href');

  if (!canonicalHref) {
    return normalizeUrl(fallbackUrl);
  }

  try {
    const resolved = new URL(canonicalHref, fallbackUrl).toString();
    return isInternalLink(resolved, fallbackUrl) ? normalizeUrl(resolved) : normalizeUrl(fallbackUrl);
  } catch {
    return normalizeUrl(fallbackUrl);
  }
}

function extractInternalLinks($, baseUrl) {
  const links = new Set();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');

    if (!href) {
      return;
    }

    const trimmedHref = href.trim();

    if (!trimmedHref || trimmedHref.startsWith('#')) {
      return;
    }

    const lower = trimmedHref.toLowerCase();
    if ([...IGNORED_PROTOCOLS].some((protocol) => lower.startsWith(protocol))) {
      return;
    }

    try {
      const resolved = new URL(trimmedHref, baseUrl).toString();
      if (isInternalLink(resolved, baseUrl)) {
        links.add(normalizeUrl(resolved));
      }
    } catch {
      // Ignore invalid URLs.
    }
  });

  return [...links];
}

function buildContentHash(document) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        title: document.title,
        headings: document.headings,
        mainContent: document.mainContent,
        footerContent: document.footerContent,
        canonicalUrl: document.canonicalUrl,
      })
    )
    .digest('hex');
}

async function saveCrawledPage(document) {
  const existing = await CrawledPage.findOne({ url: document.url }).lean();

  if (existing && existing.contentHash === document.contentHash) {
    return { action: 'skipped', url: document.url };
  }

  if (!existing) {
    await CrawledPage.create(document);
    return { action: 'created', url: document.url };
  }

  await CrawledPage.updateOne(
    { url: document.url },
    {
      $set: {
        canonicalUrl: document.canonicalUrl,
        title: document.title,
        headings: document.headings,
        mainContent: document.mainContent,
        footerContent: document.footerContent,
        contentHash: document.contentHash,
        lastCrawled: document.lastCrawled,
      },
    }
  );

  return { action: 'updated', url: document.url };
}

async function fetchPage(url) {
  const timeoutMs = getCrawlerTimeoutMs();
  const requestAttempts = [url];
  const alternateSchemeUrl = getAlternateSchemeUrl(url);

  if (alternateSchemeUrl && alternateSchemeUrl !== url) {
    requestAttempts.push(alternateSchemeUrl);
  }

  let lastError = null;

  for (const requestUrl of requestAttempts) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

      try {
        const response = await fetch(requestUrl, {
          headers: buildRequestHeaders(),
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          const responseText = await response.text().catch(() => '');
          const preview = responseText ? cleanWhitespace(responseText).slice(0, 160) : '';
          throw new Error(
            `HTTP ${response.status} ${response.statusText}${preview ? ` - ${preview}` : ''}`
          );
        }

        return response;
      } catch (error) {
        lastError = error;

        const errorLabel = `${error?.cause?.code || error?.message || 'unknown error'}`;
        const shouldRetry = attempt < 2 && isRetryableFetchError(error);

        if (shouldRetry) {
          console.warn(`[crawler] retrying ${requestUrl} after ${errorLabel}`);
          continue;
        }

        if (requestUrl === url && alternateSchemeUrl && alternateSchemeUrl !== url && isRetryableFetchError(error)) {
          console.warn(`[crawler] switching scheme for ${url} after ${errorLabel}`);
        }

        break;
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

async function crawlPage(url) {
  const response = await fetchPage(url);

  const html = await response.text();
  const $ = load(html);
  const canonicalUrl = extractCanonicalUrl($, url);
  const structuredContent = extractStructuredPageContent($);
  const title = getTitle($, canonicalUrl);
  const document = {
    url: canonicalUrl,
    sourceUrl: normalizeUrl(url),
    canonicalUrl,
    title,
    headings: structuredContent.headings,
    mainContent: structuredContent.mainContent,
    footerContent: structuredContent.footerContent,
    contentHash: buildContentHash({
      canonicalUrl,
      title,
      headings: structuredContent.headings,
      mainContent: structuredContent.mainContent,
      footerContent: structuredContent.footerContent,
    }),
    lastCrawled: new Date(),
  };

  const result = await saveCrawledPage(document);
  const discoveredLinks = extractInternalLinks($, canonicalUrl);

  return {
    ...result,
    discoveredLinks,
  };
}

async function crawlSite(seedUrl, summary) {
  const queue = [normalizeUrl(seedUrl)];
  const visited = new Set();
  const maxPages = Number(process.env.CRAWLER_MAX_PAGES || Number.POSITIVE_INFINITY);

  while (queue.length > 0 && visited.size < maxPages) {
    const nextUrl = queue.shift();

    if (!nextUrl || visited.has(nextUrl)) {
      continue;
    }

    visited.add(nextUrl);

    try {
      const result = await crawlPage(nextUrl);
      summary.crawledUrls.push(nextUrl);
      summary[result.action] += 1;

      console.log(`[crawler] ${result.action}: ${result.url}`);

      for (const discoveredLink of result.discoveredLinks) {
        if (!visited.has(discoveredLink) && !queue.includes(discoveredLink)) {
          queue.push(discoveredLink);
        }
      }
    } catch (error) {
      summary.errors += 1;
      const errorDetails = error?.cause?.code || error?.cause?.message || error.message;
      console.error(`[crawler] skipped: ${nextUrl} (${errorDetails})`);
    }
  }
}

export async function crawlConfiguredSources() {
  const seedUrls = getSeedUrls();

  if (seedUrls.length === 0) {
    console.log('[crawler] no CRAWLER_URLS configured, skipping crawl');
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      crawledUrls: [],
    };
  }

  const summary = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    crawledUrls: [],
  };

  for (const seedUrl of seedUrls) {
    console.log(`[crawler] starting site crawl from ${seedUrl}`);
    await crawlSite(seedUrl, summary);
  }

  console.log(
    `[crawler] summary stored=${summary.created + summary.updated} created=${summary.created} updated=${summary.updated} skipped=${summary.skipped} errors=${summary.errors} urls=${summary.crawledUrls.length}`
  );

  return summary;
}

export function startCrawlerScheduler() {
  const intervalMinutes = Number(process.env.CRAWLER_INTERVAL_MINUTES || '10');
  const intervalMs = Math.max(intervalMinutes, 1) * 60 * 1000;

  async function runCrawl(trigger) {
    if (crawlInProgress) {
      console.log(`[crawler] crawl already running, skipping ${trigger}`);
      return;
    }

    crawlInProgress = true;

    try {
      await crawlConfiguredSources();
    } catch (error) {
      console.error(`[crawler] ${trigger} crawl failed:`, error.message);
    } finally {
      crawlInProgress = false;
    }
  }

  void runCrawl('initial');

  const timer = setInterval(() => {
    void runCrawl('scheduled');
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
