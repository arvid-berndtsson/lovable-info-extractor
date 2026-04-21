export async function clickPublishUpdate(tabId, waitForUpdateMs = 30000) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxWaitMs) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const POLL_MS = 600;
      const MAX_ACTION_DIAGNOSTICS = 40;
      const POST_CLICK_MIN_WAIT_MS = 8000;
      const POST_CLICK_MAX_WAIT_MS = 45000;

      function readText(node) {
        return (node?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function isControlDisabled(node) {
        if (!node) {
          return false;
        }
        if (node.disabled === true) {
          return true;
        }
        const ariaDisabled = (node.getAttribute("aria-disabled") || "").toLowerCase();
        if (ariaDisabled === "true") {
          return true;
        }
        return node.hasAttribute("disabled") || node.hasAttribute("data-disabled");
      }

      function clickNode(node) {
        if (!node) {
          return;
        }
        node.click();
      }

      function describeNode(node) {
        if (!node) {
          return null;
        }
        const className =
          typeof node.className === "string"
            ? node.className.slice(0, 220)
            : String(node.className || "").slice(0, 220);
        return {
          tag: node.tagName ? String(node.tagName).toLowerCase() : "",
          id: node.id || "",
          role: node.getAttribute("role") || "",
          ariaLabel: node.getAttribute("aria-label") || "",
          text: readText(node).slice(0, 180),
          dataState: node.getAttribute("data-state") || "",
          disabled: isControlDisabled(node),
          className
        };
      }

      function listActionCandidates(limit = MAX_ACTION_DIAGNOSTICS) {
        const candidates = [];
        const seen = new Set();
        const nodes = Array.from(
          document.querySelectorAll(
            "button, [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']"
          )
        );

        for (const node of nodes) {
          const descriptor = describeNode(node);
          if (!descriptor) {
            continue;
          }
          if (!descriptor.text && !descriptor.ariaLabel) {
            continue;
          }
          const key = [
            descriptor.tag,
            descriptor.id,
            descriptor.role,
            descriptor.ariaLabel,
            descriptor.text
          ].join("|");
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          candidates.push(descriptor);
          if (candidates.length >= limit) {
            break;
          }
        }

        return candidates;
      }

      function captureDiagnostics(polls, extra = {}) {
        return {
          page: {
            url: location.href,
            title: document.title || "",
            readyState: document.readyState,
            visibilityState: document.visibilityState
          },
          polls,
          publishMenu: describeNode(findPublishMenuButton()),
          actionCandidates: listActionCandidates(),
          ...extra
        };
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
        const buttons = Array.from(
          document.querySelectorAll(
            "button[type='button'], button, [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']"
          )
        );
        return (
          buttons.find((button) => {
            if (button.id === "publish-v2-menu") {
              return false;
            }
            const text = readText(button).toLowerCase();
            const aria = (button.getAttribute("aria-label") || "").toLowerCase();
            return text === expected || aria === expected;
          }) || null
        );
      }

      async function observePostClickLifecycle(maxPostClickWaitMs) {
        const startedAt = Date.now();
        let polls = 0;
        let observedUpdating = false;
        let observedUpToDate = false;

        while (Date.now() - startedAt < maxPostClickWaitMs) {
          polls += 1;
          const menuButton = findPublishMenuButton();
          if (menuButton && !isControlDisabled(menuButton)) {
            clickNode(menuButton);
            await sleep(120);
          }

          const updatingButton = findActionButton("Updating");
          if (updatingButton) {
            observedUpdating = true;
          }

          const upToDateButton = findActionButton("Up to date");
          if (upToDateButton) {
            observedUpToDate = true;
            return {
              lifecycle: "up_to_date",
              settled: true,
              observedUpdating,
              observedUpToDate,
              polls,
              waitedMs: Date.now() - startedAt
            };
          }

          await sleep(POLL_MS);
        }

        return {
          lifecycle: observedUpdating ? "updating" : "unknown",
          settled: false,
          observedUpdating,
          observedUpToDate,
          polls,
          waitedMs: Date.now() - startedAt
        };
      }

      const startedAt = Date.now();
      let sawUpToDate = false;
      let sawUpdate = false;
      let foundPublishMenu = false;
      let polls = 0;

      while (Date.now() - startedAt < maxWaitMs) {
        polls += 1;
        const menuButton = findPublishMenuButton();
        if (!menuButton) {
          await sleep(POLL_MS);
          continue;
        }

        foundPublishMenu = true;
        if (!isControlDisabled(menuButton)) {
          clickNode(menuButton);
          await sleep(140);
        }

        const upToDateButton = findActionButton("Up to date");
        if (upToDateButton) {
          sawUpToDate = true;
        }

        const updateButton = findActionButton("Update");
        if (updateButton) {
          sawUpdate = true;
          if (!isControlDisabled(updateButton)) {
            clickNode(updateButton);
            await sleep(120);
            const postClickWaitMs = Math.min(
              POST_CLICK_MAX_WAIT_MS,
              Math.max(POST_CLICK_MIN_WAIT_MS, Math.floor(maxWaitMs / 2))
            );
            const postClick = await observePostClickLifecycle(postClickWaitMs);
            return {
              foundPublishMenu,
              sawUpToDate,
              sawUpdate,
              clicked: true,
              waitedMs: Date.now() - startedAt,
              reason: "clicked_update",
              postClick,
              diagnostics: null
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
          reason: "publish_menu_not_found",
          postClick: null,
          diagnostics: captureDiagnostics(polls)
        };
      }

      return {
        foundPublishMenu: true,
        sawUpToDate,
        sawUpdate,
        clicked: false,
        waitedMs: Date.now() - startedAt,
        reason: sawUpToDate ? "still_up_to_date" : "update_not_ready",
        postClick: null,
        diagnostics: captureDiagnostics(polls)
      };
    },
    args: [waitForUpdateMs]
  });

  return result;
}
