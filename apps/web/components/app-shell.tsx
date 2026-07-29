"use client";

import {
  CircleHelp,
  Menu,
  MessageCirclePlus,
  PanelLeftClose,
  PanelLeftOpen,
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
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentConversations, setRecentConversations] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const { garage, activeVehicle } = useGarage();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/conversations", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            conversations?: Array<{ id: string; title: string }>;
          } | null,
        ) => setRecentConversations(payload?.conversations?.slice(0, 6) ?? []),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  const closeDrawer = () => setDrawerOpen(false);

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
              <Link
                className={`nav-item ${
                  pathname === `/chat/${conversation.id}` ? "active" : ""
                }`}
                href={`/chat/${conversation.id}`}
                key={conversation.id}
                onClick={closeDrawer}
              >
                <span>{conversation.title}</span>
              </Link>
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
              <strong>Гостевой режим</strong>
              <small>Войти и сохранить</small>
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
            <Link className="mobile-vehicle-link" href="/garage">
              {activeVehicle
                ? `${activeVehicle.make} ${activeVehicle.model} · ${activeVehicle.year}`
                : "Выбрать автомобиль"}
            </Link>
          </div>
          <Link
            className="icon-button pressable"
            href="/auth/sign-in"
            aria-label="Войти"
          >
            <UserRound size={20} />
          </Link>
        </header>
        {children}
      </main>
    </div>
  );
}
