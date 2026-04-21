export async function scrapeCurrentPage(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 1000)
        .map((node) => ({
          href: node.href,
          text: (node.textContent || "").trim().slice(0, 220)
        }));

      const text = (document.body?.innerText || "").slice(0, 300000);
      return {
        url: location.href,
        title: document.title || "",
        anchors,
        text
      };
    }
  });

  return result;
}
