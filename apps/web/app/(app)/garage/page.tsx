import type { Metadata } from "next";

import { GarageView } from "@/components/garage/garage-view";

export const metadata: Metadata = {
  title: "Мой гараж",
};

export default function GaragePage() {
  return <GarageView />;
}
