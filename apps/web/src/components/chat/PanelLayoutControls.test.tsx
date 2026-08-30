import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { DraftComposerExpandControl, PanelLayoutControls } from "./PanelLayoutControls";

describe("PanelLayoutControls", () => {
  it("keeps unavailable panel tooltip triggers interactive", () => {
    const markup = renderToStaticMarkup(
      <PanelLayoutControls
        showTerminalControl
        terminalAvailable={false}
        terminalOpen={false}
        terminalShortcutLabel={null}
        rightPanelAvailable={false}
        rightPanelOpen={false}
        rightPanelShortcutLabel={null}
        liveAgentCount={0}
        onToggleTerminal={() => {}}
        onToggleRightPanel={() => {}}
      />,
    );

    expect(markup.match(/data-slot="tooltip-trigger"/g)).toHaveLength(2);
    expect(markup.match(/data-slot="tooltip-trigger"[^>]*><button[^>]*disabled=""/g)).toHaveLength(
      2,
    );
  });
});

describe("DraftComposerExpandControl", () => {
  it("describes both prompt sizing states", () => {
    const collapsed = renderToStaticMarkup(
      <DraftComposerExpandControl expanded={false} onToggle={() => {}} />,
    );
    const expanded = renderToStaticMarkup(
      <DraftComposerExpandControl expanded onToggle={() => {}} />,
    );

    expect(collapsed).toContain('aria-label="Expand prompt"');
    expect(expanded).toContain('aria-label="Restore prompt size"');
  });
});
