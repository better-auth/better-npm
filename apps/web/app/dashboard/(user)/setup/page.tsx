import type { Metadata } from "next";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = {
  title: "Setup — better-npm",
};

export default function SetupPage() {
  return <SetupClient />;
}
