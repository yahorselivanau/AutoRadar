"use client";

import {
  CircleHelp,
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

import { useGarage } from "@/lib/garage-store";

import { Wordmark } from "./wordmark";

export function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { garage, activeVehicle } = useGarage();

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
            <span className="nav-count">{garage.vehicles.length}</span>
          </Link>

          <p className="nav-label recent-label">Недавние запросы</p>
          <p className="sidebar-empty">
            Реальные запросы появятся здесь после подключения истории.
          </p>
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
          <Link className="vehicle-chip pressable" href="/garage">
            {activeVehicle
              ? `${activeVehicle.make} ${activeVehicle.model} · ${activeVehicle.year}`
              : "Выбрать автомобиль"}
          </Link>
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
