import { redirect } from "next/navigation";

// PROTOTYPE — the only page is the floor plan editor prototype.
export default function Home() {
  redirect("/prototype/floor-plan-editor");
}
