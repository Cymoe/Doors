/** Renders a catalog description: paragraphs separated by blank lines; lines starting with "• " become a list. */
export function Description({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={`ul${out.length}`} className="prose">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
    bullets = [];
  };
  for (const b of blocks) {
    const lines = b.split("\n");
    if (lines.every((l) => l.startsWith("• "))) {
      bullets.push(...lines.map((l) => l.slice(2)));
      continue;
    }
    flush();
    out.push(<p key={`p${out.length}`} className="muted">{b.replace(/\s*\n\s*/g, " ")}</p>);
  }
  flush();
  return <>{out}</>;
}
