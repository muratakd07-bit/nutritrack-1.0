import { BottomNav } from "@/app/_components/BottomNav";

/**
 * Oturum açmış kullanıcının ana ekranları. Yetkilendirme burada DEĞİL,
 * her sayfanın çağırdığı API route'larında yapılır (layout'lar navigasyonda
 * yeniden render edilmez — bkz. Next.js authentication rehberi); sayfalar
 * 401 aldığında giriş ekranını gösterir.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      {children}
      <BottomNav />
    </div>
  );
}
