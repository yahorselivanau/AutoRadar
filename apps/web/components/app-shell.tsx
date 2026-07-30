"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Avatar } from "@base-ui/react/avatar";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import {
  CircleHelp,
  Menu,
  MessageCirclePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Trash2,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useGarage } from "@/lib/garage-store";

import { Wordmark } from "./wordmark";

export function AppShell({
  children,
  accountEmail,
}: Readonly<{ children: React.ReactNode; accountEmail?: string | null }>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [recentConversations, setRecentConversations] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [editingConversation, setEditingConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { garage } = useGarage();
  const accountInitial = accountEmail?.trim().charAt(0).toLocaleUpperCase("ru");

  useEffect(() => {
    const controller = new AbortController();
    const loadConversations = () => {
      void fetch("/api/conversations", { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then(
          (
            payload: {
              conversations?: Array<{ id: string; title: string }>;
            } | null,
          ) =>
            setRecentConversations(payload?.conversations?.slice(0, 6) ?? []),
        )
        .catch(() => undefined);
    };
    loadConversations();
    window.addEventListener(
      "autoradar:conversations-changed",
      loadConversations,
    );
    return () => {
      controller.abort();
      window.removeEventListener(
        "autoradar:conversations-changed",
        loadConversations,
      );
    };
  }, [pathname]);

  const closeDrawer = () => setDrawerOpen(false);

  const renameConversation = async () => {
    const draft = editingConversation;
    const title = draft?.title.trim().replace(/\s+/g, " ");
    if (!draft || !title || renamingId) return;

    setActionError(null);
    setRenamingId(draft.id);
    const response = await fetch(
      `/api/conversations/${draft.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (response.ok) {
      const renamed = (await response.json()) as { id: string; title: string };
      setRecentConversations((conversations) =>
        conversations.map((conversation) =>
          conversation.id === renamed.id
            ? { ...conversation, title: renamed.title }
            : conversation,
        ),
      );
      setEditingConversation(null);
    } else {
      setActionError("Не удалось переименовать запрос. Попробуйте ещё раз.");
    }
    setRenamingId(null);
  };

  const deleteConversation = async (id: string) => {
    setActionError(null);
    setDeletingId(id);
    const response = await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setActionError("Не удалось удалить запрос. Попробуйте ещё раз.");
      setDeletingId(null);
      return;
    }
    setRecentConversations((conversations) =>
      conversations.filter((conversation) => conversation.id !== id),
    );
    setDeleteTarget(null);
    setDeletingId(null);
    if (pathname === `/chat/${id}`) window.location.assign("/chat");
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${drawerOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Wordmark />
          <button
            className="icon-button pressable mobile-only"
            type="button"
            aria-label="Закрыть меню"
            onClick={closeDrawer}
          >
            <X size={20} />
          </button>
          <button
            className="icon-button pressable desktop-only"
            type="button"
            aria-label={
              sidebarCollapsed
                ? "Развернуть боковую панель"
                : "Свернуть боковую панель"
            }
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
        </div>

        <Link
          className="new-search pressable"
          href="/chat"
          onClick={closeDrawer}
        >
          <MessageCirclePlus size={18} />
          <span>Новый поиск</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Основная навигация">
          <p className="nav-label">Рабочее пространство</p>
          <Link
            className={`nav-item ${pathname === "/garage" ? "active" : ""}`}
            href="/garage"
            onClick={closeDrawer}
          >
            <Warehouse size={18} />
            <span>Мой гараж</span>
            <span className="nav-count">{garage.vehicles.length}</span>
          </Link>

          <p className="nav-label recent-label">Недавние запросы</p>
          {recentConversations.length > 0 ? (
            recentConversations.map((conversation) => (
              <div className="history-row" key={conversation.id}>
                {editingConversation?.id === conversation.id ? (
                  <form
                    className="history-edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void renameConversation();
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Название диалога"
                      aria-invalid={actionError ? true : undefined}
                      disabled={renamingId === conversation.id}
                      maxLength={72}
                      value={editingConversation.title}
                      onBlur={() => {
                        if (renamingId !== conversation.id) {
                          setEditingConversation(null);
                        }
                      }}
                      onChange={(event) =>
                        setEditingConversation({
                          ...editingConversation,
                          title: event.target.value,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setEditingConversation(null);
                        }
                      }}
                    />
                  </form>
                ) : (
                  <Link
                    className={`nav-item ${
                      pathname === `/chat/${conversation.id}` ? "active" : ""
                    }`}
                    href={`/chat/${conversation.id}`}
                    aria-current={
                      pathname === `/chat/${conversation.id}`
                        ? "page"
                        : undefined
                    }
                    onClick={closeDrawer}
                  >
                    <span>{conversation.title}</span>
                  </Link>
                )}
                <BaseMenu.Root>
                  <BaseMenu.Trigger
                    className="history-more pressable"
                    aria-label={`Действия: ${conversation.title}`}
                  >
                    <MoreHorizontal size={17} />
                  </BaseMenu.Trigger>
                  <BaseMenu.Portal>
                    <BaseMenu.Positioner
                      className="history-menu-positioner"
                      side="right"
                      align="start"
                      sideOffset={6}
                    >
                      <BaseMenu.Popup className="history-menu">
                        <BaseMenu.Item
                          className="history-menu-item"
                          onClick={() => {
                            setActionError(null);
                            setEditingConversation({
                              id: conversation.id,
                              title: conversation.title,
                            });
                          }}
                        >
                          <Pencil size={15} />
                          Переименовать
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className="history-menu-item destructive"
                          onClick={() => {
                            setActionError(null);
                            setDeleteTarget(conversation);
                          }}
                        >
                          <Trash2 size={15} />
                          Удалить
                        </BaseMenu.Item>
                      </BaseMenu.Popup>
                    </BaseMenu.Positioner>
                  </BaseMenu.Portal>
                </BaseMenu.Root>
              </div>
            ))
          ) : (
            <p className="sidebar-empty">История диалогов пока пуста.</p>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="footer-link pressable" type="button">
            <CircleHelp size={18} />
            <span>Помощь</span>
          </button>
          <Link className="account-row pressable" href="/auth/sign-in">
            <Avatar.Root className="account-avatar">
              <Avatar.Fallback className="account-avatar-fallback">
                {accountInitial ?? <UserRound aria-hidden="true" size={17} />}
              </Avatar.Fallback>
            </Avatar.Root>
            <span className="account-copy">
              <strong>{accountEmail ?? "Гостевой режим"}</strong>
              {!accountEmail ? <small>Войти и сохранить</small> : null}
            </span>
          </Link>
          {actionError ? (
            <p className="sidebar-action-error" role="status">
              {actionError}
            </p>
          ) : null}
        </div>
      </aside>

      {drawerOpen ? (
        <button
          className="drawer-overlay"
          type="button"
          aria-label="Закрыть меню"
          onClick={closeDrawer}
        />
      ) : null}

      <main className="main-shell">
        <header className="desktop-header desktop-only">
          <button
            className={`icon-button pressable ${
              sidebarCollapsed ? "" : "header-control-hidden"
            }`}
            type="button"
            aria-label="Открыть боковую панель"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftOpen size={19} />
          </button>
          <Wordmark />
          <Link
            className={`desktop-sign-in pressable ${
              accountEmail ? "desktop-account-avatar" : ""
            }`}
            href="/auth/sign-in"
            aria-label={accountEmail ? `Аккаунт: ${accountEmail}` : "Войти"}
          >
            {accountEmail ? (
              <Avatar.Root className="header-avatar">
                <Avatar.Fallback className="account-avatar-fallback">
                  {accountInitial}
                </Avatar.Fallback>
              </Avatar.Root>
            ) : (
              "Войти"
            )}
          </Link>
        </header>
        <header className="mobile-header">
          <button
            className="icon-button pressable"
            type="button"
            aria-label="Открыть меню"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="mobile-header-center">
            <Wordmark />
          </div>
          <Link
            className="icon-button pressable"
            href="/auth/sign-in"
            aria-label={accountEmail ? "Открыть аккаунт" : "Войти"}
          >
            <Avatar.Root className="mobile-account-avatar">
              <Avatar.Fallback className="account-avatar-fallback">
                {accountInitial ?? <UserRound aria-hidden="true" size={16} />}
              </Avatar.Fallback>
            </Avatar.Root>
          </Link>
        </header>
        {children}
      </main>

      <AlertDialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) {
            setDeleteTarget(null);
            setActionError(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="delete-dialog-backdrop" />
          <AlertDialog.Viewport className="delete-dialog-viewport">
            <AlertDialog.Popup className="delete-dialog">
              <AlertDialog.Title className="delete-dialog-title">
                Удалить запрос?
              </AlertDialog.Title>
              <AlertDialog.Description className="delete-dialog-description">
                «{deleteTarget?.title}» исчезнет из истории без возможности
                восстановления.
              </AlertDialog.Description>
              {actionError ? (
                <p className="delete-dialog-error" role="alert">
                  {actionError}
                </p>
              ) : null}
              <div className="delete-dialog-actions">
                <AlertDialog.Close
                  className="delete-dialog-button pressable"
                  disabled={Boolean(deletingId)}
                >
                  Отмена
                </AlertDialog.Close>
                <button
                  className="delete-dialog-button destructive pressable"
                  type="button"
                  disabled={Boolean(deletingId)}
                  onClick={() => {
                    if (deleteTarget) {
                      void deleteConversation(deleteTarget.id);
                    }
                  }}
                >
                  {deletingId ? "Удаляем…" : "Удалить"}
                </button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
