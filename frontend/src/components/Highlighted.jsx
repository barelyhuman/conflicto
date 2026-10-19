/** Split text into plain / highlighted runs from sorted char indices. */
export function Highlighted({ text, indices }) {
  if (!indices.length) return text;
  const set = new Set(indices);
  const parts = [];
  let run = '';
  let runOn = false;

  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);

    if (on !== runOn && run) {
      parts.push(runOn ? <mark key={i}>{run}</mark> : run);
      run = '';
    }

    runOn = on;
    run += text[i];
  }

  if (run) parts.push(runOn ? <mark key="end">{run}</mark> : run);

  return parts;
}
