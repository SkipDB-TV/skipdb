export function JsonHighlight({ json }: { json: string }) {
  const parts = json.split(
    /("(?:[^"\\]|\\.)*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g,
  );
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0)
          return (
            <span key={i} className="text-slate-500">
              {part}
            </span>
          );
        if (/^".*":$/.test(part))
          return (
            <span key={i} className="text-slate-300">
              {part}
            </span>
          );
        if (/^"/.test(part))
          return (
            <span key={i} className="text-skip-bright">
              {part}
            </span>
          );
        if (part === "null")
          return (
            <span key={i} className="text-slate-500">
              {part}
            </span>
          );
        if (part === "true" || part === "false")
          return (
            <span key={i} className="text-signal">
              {part}
            </span>
          );
        return (
          <span key={i} className="text-warn">
            {part}
          </span>
        );
      })}
    </>
  );
}
