export async function clickPublishUpdate(tabId, waitForUpdateMs = 30000) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxWaitMs) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const POLL_MS = 600;

      function readText(node) {
        return (node?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function findPublishMenuButton() {
        return (
          document.querySelector("#publish-v2-menu") ||
          Array.from(document.querySelectorAll("button[type='button']")).find((button) => {
            const aria = (button.getAttribute("aria-label") || "").toLowerCase();
            const text = readText(button).toLowerCase();
            return aria === "publish" || text === "publish";
          }) ||
          null
        );
      }

      function findActionButton(label) {
        const expected = label.toLowerCase();
        const buttons = Array.from(document.querySelectorAll("button[type='button']"));
        return (
          buttons.find((button) => {
            const text = readText(button).toLowerCase();
            return text === expected;
          }) || null
        );
      }

      const startedAt = Date.now();
      let sawUpToDate = false;
      let sawUpdate = false;
      let foundPublishMenu = false;

      while (Date.now() - startedAt < maxWaitMs) {
        const menuButton = findPublishMenuButton();
        if (!menuButton) {
          await sleep(POLL_MS);
          continue;
        }

        foundPublishMenu = true;
        if (!menuButton.disabled) {
          menuButton.click();
          await sleep(140);
        }

        const upToDateButton = findActionButton("Up to date");
        if (upToDateButton) {
          sawUpToDate = true;
        }

        const updateButton = findActionButton("Update");
        if (updateButton) {
          sawUpdate = true;
          if (!updateButton.disabled) {
            updateButton.click();
            await sleep(120);
            return {
              foundPublishMenu,
              sawUpToDate,
              sawUpdate,
              clicked: true,
              waitedMs: Date.now() - startedAt,
              reason: "clicked_update"
            };
          }
        }

        await sleep(POLL_MS);
      }

      if (!foundPublishMenu) {
        return {
          foundPublishMenu: false,
          sawUpToDate,
          sawUpdate,
          clicked: false,
          waitedMs: Date.now() - startedAt,
          reason: "publish_menu_not_found"
        };
      }

      return {
        foundPublishMenu: true,
        sawUpToDate,
        sawUpdate,
        clicked: false,
        waitedMs: Date.now() - startedAt,
        reason: sawUpToDate ? "still_up_to_date" : "update_not_ready"
      };
    },
    args: [waitForUpdateMs]
  });

  return result;
}
