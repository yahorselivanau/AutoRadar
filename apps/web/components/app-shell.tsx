"use client";

import {
  ChevronDown,
  CircleHelp,
  History,
  Menu,
  MessageCirclePlus,
  PanelLeftClose,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Wordmark } from "./wordmark";

const conversations = [
  "Стеклоподъёмник Peugeot 308",
  "Колодки для Golf VII",
  "Фара Volvo XC60",
];

export function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="app-shell">
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
            aria-label="Свернуть боковую панель"
          >
            <PanelLeftClose size={19} />
          </button>
        </div>

        <Link
          className="new-search pressable"
          href="/chat"
          onClick={closeDrawer}
        >
          <MessageCirclePlus size={18} />
          Новый поиск
        </Link>

        <nav className="sidebar-nav" aria-label="Основная навигация">
          <p className="nav-label">Рабочее пространство</p>
          <Link
            className={`nav-item ${pathname === "/garage" ? "active" : ""}`}
            href="/garage"
            onClick={closeDrawer}
          >
            <Warehouse size={18} />
            Мой гараж
            <span className="nav-count">2</span>
          </Link>

          <p className="nav-label recent-label">Недавние запросы</p>
          {conversations.map((conversation, index) => (
            <Link
              className="conversation-item"
              href={index === 0 ? "/search/demo" : "/chat"}
              key={conversation}
              onClick={closeDrawer}
            >
              <History size={16} />
              <span>{conversation}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="footer-link pressable" type="button">
            <CircleHelp size={18} />
            Помощь
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
          <button className="vehicle-chip pressable" type="button">
            Peugeot 308 · 2008
            <ChevronDown size={15} />
          </button>
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
