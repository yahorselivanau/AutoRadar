import Link from "next/link";

export function Wordmark() {
  return (
    <Link
      className="wordmark"
      href="/chat"
      aria-label="Авто Радар — новый поиск"
    >
      <span>Авто Радар</span>
    </Link>
  );
}
