import Link from "next/link";

export function Wordmark() {
  return (
    <Link
      className="wordmark"
      href="/chat"
      aria-label="AutoRadar — новый поиск"
    >
      AutoRadar
    </Link>
  );
}
