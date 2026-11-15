import { Drafter } from "@/components/drafter";
import { PageFrame } from "@/components/page-frame";
import "./drafter.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Personal Drafter" };
export default function DrafterPage() { return <PageFrame><Drafter /></PageFrame>; }
