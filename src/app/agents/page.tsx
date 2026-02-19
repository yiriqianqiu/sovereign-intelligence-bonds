import { redirect } from "next/navigation";
import { ALPHA_SIGNAL_ID } from "@/lib/constants";

export default function AgentsPage() {
  redirect(`/agents/${ALPHA_SIGNAL_ID}`);
}
