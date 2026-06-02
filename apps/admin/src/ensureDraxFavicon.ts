const FAVICON_ICO = "/favicon.ico";
const FAVICON_PNG = "/favcon.png";

function upsertLink(rel: string, href: string, type?: string) {
  const selector = `link[rel="${rel}"][href="${href}"]`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }
  if (type) link.type = type;
}

export function ensureDraxFavicon() {
  upsertLink("icon", FAVICON_ICO);
  upsertLink("icon", FAVICON_PNG, "image/png");
  upsertLink("shortcut icon", FAVICON_ICO);
  upsertLink("apple-touch-icon", FAVICON_PNG);
}
