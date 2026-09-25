import Link from "next/link";

export function LoadingCard({ text = "Yükleniyor..." }: { text?: string }) {
  return (
    <div className="rounded-3xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
      {text}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-3xl bg-red-50 p-6 text-sm text-red-700 ring-1 ring-red-100">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 font-semibold underline underline-offset-2"
        >
          Tekrar dene
        </button>
      )}
    </div>
  );
}

export function SignInRequired() {
  return (
    <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">Devam etmek için giriş yapmalısın.</p>
      <Link
        href="/login"
        className="mt-4 inline-block rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Giriş Yap
      </Link>
    </div>
  );
}
