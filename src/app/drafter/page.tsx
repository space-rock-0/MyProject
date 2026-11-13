import { Drafter } from "@/components/drafter";
import "./drafter.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personal Drafter" };

export default function DrafterPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap"
        rel="stylesheet"
      />
      <Drafter />
    </>
  );
}
