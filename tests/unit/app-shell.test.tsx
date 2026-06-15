import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, StrictMode, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/app-shell/app-shell";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";

describe("Button", () => {
  const variants: ButtonVariant[] = [
    "primary",
    "sage",
    "yellow",
    "lavender",
    "secondary",
    "danger",
    "ghost",
  ];

  it.each(variants)("applies the %s variant class", (variant) => {
    render(<Button variant={variant}>{variant}</Button>);

    expect(screen.getByRole("button", { name: variant })).toHaveClass(
      `ui-button--${variant}`,
    );
  });

  it("forwards disabled state and its ref to the native button", () => {
    const ref = createRef<HTMLButtonElement>();

    render(
      <Button ref={ref} disabled>
        Disabled action
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Disabled action" });
    expect(button).toBeDisabled();
    expect(ref.current).toBe(button);
  });
});

describe("AppShell", () => {
  it("renders the product navigation and accessible page landmarks", () => {
    render(
      <AppShell
        main={<h1>训练仪表盘</h1>}
        insights={<p>下一练建议</p>}
      />,
    );

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "训练仪表盘" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("button", { name: "历史记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本地设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始训练" })).toHaveAttribute(
      "href",
      "/training",
    );
    expect(screen.getByRole("main", { name: "主要内容" })).toHaveTextContent(
      "训练仪表盘",
    );
    expect(
      screen.getByRole("complementary", { name: "训练洞察" }),
    ).toHaveTextContent("下一练建议");
  });

  it("forwards history, settings, and start callbacks", async () => {
    const user = userEvent.setup();
    const onHistory = vi.fn();
    const onSettings = vi.fn();
    const onStartTraining = vi.fn();

    render(
      <AppShell
        main={<p>主内容</p>}
        insights={<p>洞察</p>}
        onHistory={onHistory}
        onSettings={onSettings}
        onStartTraining={onStartTraining}
      />,
    );

    await user.click(screen.getByRole("button", { name: "历史记录" }));
    await user.click(screen.getByRole("button", { name: "本地设置" }));
    await user.click(screen.getByRole("link", { name: "开始训练" }));

    expect(onHistory).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onStartTraining).toHaveBeenCalledOnce();
  });

  it("renders a non-navigable dashboard control when dashboard is disabled", async () => {
    const onDashboardNavigate = vi.fn();
    render(
      <AppShell
        dashboardDisabled
        onDashboardNavigate={onDashboardNavigate}
        main={<p>请先保存训练结果</p>}
        insights={<p>洞察</p>}
      />,
    );

    const dashboard = screen.getByRole("button", { name: "训练仪表盘" });
    expect(dashboard).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "训练仪表盘" })).toBeNull();
    await userEvent.click(dashboard);
    expect(onDashboardNavigate).not.toHaveBeenCalled();
    expect(screen.getByText("请先保存训练结果")).toBeInTheDocument();
  });

  it("disables dashboard and training navigation while keeping local tools available", async () => {
    const onDashboardNavigate = vi.fn();
    const onStartTraining = vi.fn();
    const onHistory = vi.fn();
    const onSettings = vi.fn();
    render(
      <AppShell
        navigationDisabled
        onDashboardNavigate={onDashboardNavigate}
        onStartTraining={onStartTraining}
        onHistory={onHistory}
        onSettings={onSettings}
        main={<p>结果尚未保存</p>}
        insights={<p>洞察</p>}
      />,
    );

    const dashboard = screen.getByRole("button", { name: "训练仪表盘" });
    const training = screen.getByRole("button", { name: "开始训练" });
    expect(dashboard).toHaveAttribute("aria-disabled", "true");
    expect(training).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "训练仪表盘" })).toBeNull();
    expect(screen.queryByRole("link", { name: "开始训练" })).toBeNull();

    await userEvent.click(dashboard);
    await userEvent.click(training);
    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));
    await userEvent.click(screen.getByRole("button", { name: "本地设置" }));

    expect(onDashboardNavigate).not.toHaveBeenCalled();
    expect(onStartTraining).not.toHaveBeenCalled();
    expect(onHistory).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it.each([
    ["dashboard", "link", "训练仪表盘"],
    ["history", "button", "历史记录"],
    ["settings", "button", "本地设置"],
    ["training", "link", "开始训练"],
  ] as const)(
    "marks the %s item as the active page",
    (activeItem, role, name) => {
      render(
        <AppShell
          activeItem={activeItem}
          main={<p>主内容</p>}
          insights={<p>洞察</p>}
        />,
      );

      const activeControl = screen.getByRole(role, { name });
      expect(activeControl).toHaveAttribute("aria-current", "page");
      expect(activeControl).toHaveAttribute("data-active", "true");
      expect(activeControl).toHaveClass("is-active");
    },
  );
});

function ModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开设置
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="本地设置"
        description="配置本机 AI Provider"
      >
        <button type="button">保存设置</button>
        <button type="button">测试连接</button>
      </Modal>
    </>
  );
}

function DrawerHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开历史
      </button>
      <Drawer open={open} onOpenChange={setOpen} title="历史记录">
        <button type="button">查看复盘</button>
        <button type="button">删除记录</button>
      </Drawer>
    </>
  );
}

function NestedOverlayHarness() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setModalOpen(true)}>
        打开嵌套设置
      </button>
      <Modal open={modalOpen} onOpenChange={setModalOpen} title="嵌套设置">
        <button type="button" onClick={() => setDrawerOpen(true)}>
          打开嵌套历史
        </button>
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title="嵌套历史"
        >
          <button type="button">关闭前操作</button>
        </Drawer>
      </Modal>
    </>
  );
}

function EmptyOverlayHarness({ kind }: { kind: "modal" | "drawer" }) {
  const [open, setOpen] = useState(false);
  const Overlay = kind === "modal" ? Modal : Drawer;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开空白{kind}
      </button>
      <Overlay open={open} onOpenChange={setOpen} title={`空白${kind}`}>
        <p>没有可聚焦控件</p>
      </Overlay>
    </>
  );
}

describe("Modal", () => {
  it("focuses the first control and cycles focus in both directions", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));

    const dialog = screen.getByRole("dialog", { name: "本地设置" });
    const firstControl = screen.getByRole("button", { name: "保存设置" });
    const lastControl = screen.getByRole("button", { name: "测试连接" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(firstControl).toHaveFocus();

    lastControl.focus();
    await user.tab();
    expect(firstControl).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastControl).toHaveFocus();
  });

  it("locks body scrolling while open and restores it after close", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "clip";
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("restores body scrolling when unmounted while open", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    const { unmount } = render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByTestId("modal-backdrop"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focuses its panel when it has no focusable children", async () => {
    const user = userEvent.setup();
    render(<EmptyOverlayHarness kind="modal" />);

    const trigger = screen.getByRole("button", { name: "打开空白modal" });
    await user.click(trigger);

    const panel = screen.getByRole("dialog", { name: "空白modal" });
    expect(panel).toHaveAttribute("tabindex", "-1");
    expect(panel).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(panel).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("Drawer", () => {
  it("cycles focus in both directions", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "打开历史" }));

    expect(screen.getByRole("dialog", { name: "历史记录" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    const firstControl = screen.getByRole("button", { name: "查看复盘" });
    const lastControl = screen.getByRole("button", { name: "删除记录" });
    expect(firstControl).toHaveFocus();

    lastControl.focus();
    await user.tab();
    expect(firstControl).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastControl).toHaveFocus();
  });

  it("locks body scrolling while open and restores it after close", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "scroll";
    render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "打开历史" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores body scrolling when unmounted while open", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "visible";
    const { unmount } = render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "打开历史" }));
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("visible");
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "打开历史" }));
    await user.click(screen.getByTestId("drawer-backdrop"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focuses its panel when it has no focusable children", async () => {
    const user = userEvent.setup();
    render(<EmptyOverlayHarness kind="drawer" />);

    const trigger = screen.getByRole("button", { name: "打开空白drawer" });
    await user.click(trigger);

    const panel = screen.getByRole("dialog", { name: "空白drawer" });
    expect(panel).toHaveAttribute("tabindex", "-1");
    expect(panel).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(panel).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("nested overlays", () => {
  it("keeps body scrolling locked until the last overlay closes", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    render(<NestedOverlayHarness />);

    await user.click(screen.getByRole("button", { name: "打开嵌套设置" }));
    await user.click(screen.getByRole("button", { name: "打开嵌套历史" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByTestId("drawer-backdrop"));
    expect(
      screen.queryByRole("dialog", { name: "嵌套历史" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "嵌套设置" }),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByTestId("modal-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("lets only the top overlay handle Escape", async () => {
    const user = userEvent.setup();
    render(<NestedOverlayHarness />);

    await user.click(screen.getByRole("button", { name: "打开嵌套设置" }));
    await user.click(screen.getByRole("button", { name: "打开嵌套历史" }));

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "嵌套历史" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "嵌套设置" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores a non-top backdrop", async () => {
    const user = userEvent.setup();
    render(<NestedOverlayHarness />);

    await user.click(screen.getByRole("button", { name: "打开嵌套设置" }));
    await user.click(screen.getByRole("button", { name: "打开嵌套历史" }));
    await user.click(screen.getByTestId("modal-backdrop"));

    expect(
      screen.getByRole("dialog", { name: "嵌套设置" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "嵌套历史" }),
    ).toBeInTheDocument();
  });

  it("keeps focus inside the top overlay", async () => {
    const user = userEvent.setup();
    render(<NestedOverlayHarness />);

    await user.click(screen.getByRole("button", { name: "打开嵌套设置" }));
    const lowerOverlayButton = screen.getByRole("button", {
      name: "打开嵌套历史",
    });
    await user.click(lowerOverlayButton);

    lowerOverlayButton.focus();
    expect(screen.getByRole("button", { name: "关闭前操作" })).toHaveFocus();
  });
});

describe("overlay portal and background isolation", () => {
  it("hydrates an initially open overlay without a server/client mismatch", async () => {
    document.getElementById("overlay-root")?.remove();
    const overlay = (
      <Modal open onOpenChange={() => undefined} title="Hydrated settings">
        <button type="button">Hydrated action</button>
      </Modal>
    );
    const serverMarkup = renderToString(overlay);
    expect(serverMarkup).toBe("");
    expect(document.getElementById("overlay-root")).toBeNull();

    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;

    await act(async () => {
      root = hydrateRoot(container, overlay);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Hydrated settings" }),
      ).toBeInTheDocument();
    });
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).toLowerCase().includes("hydration"),
      ),
    ).toBe(false);

    await act(async () => root!.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it("renders the overlay root under body instead of a clipping container", async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="clipping-container" style={{ overflow: "hidden" }}>
        <ModalHarness />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "打开设置" }));

    const overlayRoot = document.getElementById("overlay-root");
    expect(overlayRoot?.parentElement).toBe(document.body);
    expect(
      screen.getByTestId("clipping-container").contains(overlayRoot),
    ).toBe(false);
  });

  it("isolates and restores background content", async () => {
    const user = userEvent.setup();
    const { container } = render(<ModalHarness />);
    const appRoot = container;

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    expect(appRoot).toHaveAttribute("inert");
    expect(appRoot).toHaveAttribute("aria-hidden", "true");

    const backgroundButton = screen.getByRole("button", {
      name: "打开设置",
      hidden: true,
    });
    backgroundButton.focus();
    expect(screen.getByRole("button", { name: "保存设置" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(appRoot).not.toHaveAttribute("inert");
    expect(appRoot).not.toHaveAttribute("aria-hidden");
  });

  it("preserves existing background attributes after the last overlay closes", async () => {
    const user = userEvent.setup();
    const background = document.createElement("div");
    background.setAttribute("aria-hidden", "false");
    background.setAttribute("inert", "");
    document.body.append(background);

    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.keyboard("{Escape}");

    expect(background).toHaveAttribute("aria-hidden", "false");
    expect(background).toHaveAttribute("inert");
    background.remove();
  });

  it("isolates body children added while an overlay is open and restores them", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));

    const widget = document.createElement("button");
    widget.textContent = "Late widget";
    widget.setAttribute("aria-hidden", "false");
    document.body.append(widget);

    await waitFor(() => {
      expect(widget).toHaveAttribute("inert");
      expect(widget).toHaveAttribute("aria-hidden", "true");
    });

    await user.keyboard("{Escape}");
    expect(widget).not.toHaveAttribute("inert");
    expect(widget).toHaveAttribute("aria-hidden", "false");
    widget.remove();
  });

  it("cleans up scroll lock and isolation under StrictMode", async () => {
    document.body.style.overflow = "clip";
    const { container, unmount } = render(
      <StrictMode>
        <Modal
          open
          onOpenChange={() => undefined}
          title="严格模式设置"
        >
          <button type="button">严格模式按钮</button>
        </Modal>
      </StrictMode>,
    );
    const appRoot = container;

    await waitFor(() => {
      expect(document.body.style.overflow).toBe("hidden");
      expect(appRoot).toHaveAttribute("inert");
      expect(appRoot).toHaveAttribute("aria-hidden", "true");
    });

    await act(async () => unmount());
    expect(document.body.style.overflow).toBe("clip");
    expect(appRoot).not.toHaveAttribute("inert");
    expect(appRoot).not.toHaveAttribute("aria-hidden");
  });
});
