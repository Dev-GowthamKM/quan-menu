export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[70dvh] place-items-center py-16">
      <div className="w-full max-w-md">
        <h1 className="text-center font-serif text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 text-center text-taupe">{subtitle}</p>}
        <div className="mt-10 bg-paper p-6 shadow-[0_1px_0_var(--color-line)] md:p-10">{children}</div>
      </div>
    </div>
  );
}
