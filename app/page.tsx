import { B2bSearchDashboard } from "@/components/b2b-search-dashboard";

export default function Home() {
  return (
    <div className="min-h-full flex flex-col bg-gradient-to-b from-slate-50 via-slate-100/80 to-slate-50">
      <main className="flex flex-1 flex-col">
        <B2bSearchDashboard />
      </main>
      <footer className="border-t border-slate-200/80 py-6 text-center text-xs text-slate-500">
        Demo 数据仅供展示 · Next.js · Tailwind CSS
      </footer>
    </div>
  );
}
