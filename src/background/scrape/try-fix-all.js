export async function tryClickTryFixAll(tabId, waitForEnabledMs = 20000) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxWaitMs) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      function readText(node) {
        return (node?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function locateButton() {
        const buttons = Array.from(document.querySelectorAll("button[type='button']"));
        return (
          buttons.find((button) => {
            const text = readText(button).toLowerCase();
            return text.includes("try to fix all");
          }) || null
        );
      }

      const startedAt = Date.now();
      let button = locateButton();
      if (!button) {
        return {
          found: false,
          clicked: false,
          disabled: false,
          waitedMs: 0,
          reason: "not_found"
        };
      }

      while (button && button.disabled && Date.now() - startedAt < maxWaitMs) {
        await sleep(600);
        button = locateButton();
      }

      if (!button) {
        return {
          found: false,
          clicked: false,
          disabled: false,
          waitedMs: Date.now() - startedAt,
          reason: "disappeared"
        };
      }

      if (button.disabled) {
        return {
          found: true,
          clicked: false,
          disabled: true,
          waitedMs: Date.now() - startedAt,
          reason: "still_disabled"
        };
      }

      button.click();
      await sleep(120);

      return {
        found: true,
        clicked: true,
        disabled: false,
        waitedMs: Date.now() - startedAt,
        reason: "clicked"
      };
    },
    args: [waitForEnabledMs]
  });

  return result;
}
