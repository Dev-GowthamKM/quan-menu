/** Plain text from the database as paragraphs; React escapes it, so no HTML is ever injected. */
export default function Paragraphs({ text, className }: { text: string | null | undefined; className?: string }) {
  const parts = (text ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className={`prose-store ${className ?? ""}`}>
      {parts.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
