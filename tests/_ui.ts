// Shared helpers that drive the Lumen UI by its stable data-testids. Tests describe intent ("open the edit panel"), not layout.
import type { Page } from "playwright";
export async function T(page: Page, name: string) {
  const click = (sel: string) => page.click(sel);
  switch (name) {
    case "edit": await click("[data-testid=right-develop]"); { const b = page.locator("[data-testid=sections-expand]"); if ((await b.innerText()).includes("Expand")) await b.click(); } break;
    case "masks": await click("[data-testid=right-masks]"); break;
    case "reference": await click("[data-testid=right-looks]"); break;
    case "assistant": await click("[data-testid=left-assistant]"); break;
    case "report": await click("[data-testid=left-report]"); break;
    case "analysis": await click("[data-testid=left-insight]"); break;
    case "export": await click("[data-testid=open-export]"); break;
    default: throw new Error("unknown tab " + name);
  }
}
/** Wait until the editor has analysed the photo (the Insight tab lists the proposed recipe). */
export async function R(page: Page) { await page.waitForSelector("[data-testid=left-insight]", { timeout: 20000 }); await page.click("[data-testid=left-insight]"); await page.waitForSelector("text=Proposed recipe", { timeout: 20000 }); }
