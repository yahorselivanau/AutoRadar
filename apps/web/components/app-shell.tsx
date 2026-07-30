"use client";

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
  const [conversationMenu, setConversationMenu] = useState<string | null>(null);
  const [editingConversation, setEditingConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { garage } = useGarage();

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
  const refreshConversations = () =>
    window.dispatchEvent(new Event("autoradar:conversations-changed"));

  const renameConversation = async () => {
    if (!editingConversation?.title.trim()) return;
    const response = await fetch(
      `/api/conversations/${editingConversation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingConversation.title }),
      },
    );
    if (response.ok) {
      setEditingConversation(null);
      setConversationMenu(null);
      refreshConversations();
    }
  };

  const deleteConversation = async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) return;
    setDeleteConfirmId(null);
    setConversationMenu(null);
    refreshConversations();
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
                      value={editingConversation.title}
                      onBlur={() => void renameConversation()}
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
                <button
                  className="history-more pressable"
                  type="button"
                  aria-label={`Действия: ${conversation.title}`}
                  aria-expanded={conversationMenu === conversation.id}
                  onClick={() =>
                    setConversationMenu((current) =>
                      current === conversation.id ? null : conversation.id,
                    )
                  }
                >
                  <MoreHorizontal size={17} />
                </button>
                {conversationMenu === conversation.id ? (
                  <div className="history-menu">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingConversation({
                          id: conversation.id,
                          title: conversation.title,
                        })
                      }
                    >
                      <Pencil size={15} />
                      Переименовать
                    </button>
                    <button
                      className="destructive"
                      type="button"
                      onClick={() => {
                        if (deleteConfirmId === conversation.id) {
                          void deleteConversation(conversation.id);
                        } else {
                          setDeleteConfirmId(conversation.id);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                      {deleteConfirmId === conversation.id
                        ? "Удалить точно?"
                        : "Удалить"}
                    </button>
                  </div>
                ) : null}
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
            <span className="account-avatar">
              <UserRound size={17} />
            </span>
            <span>
              <strong>{accountEmail ?? "Гостевой режим"}</strong>
              <small>{accountEmail ? "Аккаунт" : "Войти и сохранить"}</small>
            </span>
          </Link>
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
          <Link className="desktop-sign-in pressable" href="/auth/sign-in">
            {accountEmail ? "Аккаунт" : "Войти"}
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
            <UserRound size={20} />
          </Link>
        </header>
        {children}
      </main>
    </div>
  );
}
