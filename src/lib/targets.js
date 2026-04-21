export function asTargetsFile(result) {
  const urls = result?.projectUrls?.publishedUrls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return "";
  }
  return `${urls.join("\n")}\n`;
}
