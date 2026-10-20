import { useState } from "react";
import type { ChoiceAnswer } from "../../engine/build.js";
import { choicePool, FREE_TEXT_POOLS } from "../../engine/validate.js";
import type { BackgroundPackage } from "../../schema/index.js";
import { content, packageById } from "../content.js";
import { slug, type Draft } from "../draft.js";
import { StepHeader, title, traitName } from "./ui.js";

// One question per package and pool, the way the engine matches answers.
interface Question {
  pkg: BackgroundPackage;
  from: string;
  count: number;
  notes: string[];
}

function questions(draft: Draft): Question[] {
  const out: Question[] = [];
  for (const id of [draft.origin, draft.profession, draft.past]) {
    const pkg = id ? packageById.get(id) : undefined;
    if (!pkg) continue;
    for (const c of pkg.choices) {
      const q = out.find((x) => x.pkg === pkg && x.from === c.from);
      if (q) {
        q.count += c.choose;
        if (c.note) q.notes.push(c.note);
      } else out.push({ pkg, from: c.from, count: c.choose, notes: c.note ? [c.note] : [] });
    }
  }
  return out;
}

export function ChoicesStep({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const qs = questions(draft);
  const answerOf = (q: Question) => draft.choices.find((c) => c.package === q.pkg.id && c.from === q.from);
  const setAnswer = (q: Question, traits: string[]) => {
    const rest = draft.choices.filter((c) => !(c.package === q.pkg.id && c.from === q.from));
    const answer: ChoiceAnswer = { package: q.pkg.id, from: q.from, traits };
    onChange({ ...draft, choices: [...rest, answer] });
  };

  return (
    <section>
      <StepHeader step="choices" title="Package choices">
        Some packages let you pick a Trait from a pool, like a Contact or a language.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        {qs.length === 0 && <p className="empty">This build's packages have no choices to answer.</p>}
        {qs.map((q) => (
          <div key={`${q.pkg.id}/${q.from}`} className="choice">
            <h3>
              {q.pkg.name} <span className="muted">· {title(q.pkg.type)}</span>
            </h3>
            <p>
              {q.notes.join("; ") || `Choose ${q.count} from ${q.from}`}{" "}
              <span className="muted">
                ({q.count} from <code>{q.from}</code>)
              </span>
            </p>
            <Answer q={q} answer={answerOf(q)?.traits ?? []} onAnswer={(t) => setAnswer(q, t)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Answer({ q, answer, onAnswer }: { q: Question; answer: string[]; onAnswer: (traits: string[]) => void }) {
  const pool = choicePool(q.from, content);
  const noun = FREE_TEXT_POOLS[q.from];
  const slots = Array.from({ length: q.count }, (_, i) => answer[i] ?? "");
  const set = (i: number, value: string) => {
    const next = slots.slice();
    next[i] = value;
    onAnswer(next.filter((v) => v !== ""));
  };

  // A Contact is whoever the player says it is: the name is kept as written.
  if (noun) {
    return (
      <div className="answer">
        <p className="hint">Who is your {noun}? Write a name or a short note; it's yours to decide.</p>
        {slots.map((v, i) => (
          <FreeText key={i} value={v} label={`${q.pkg.name} ${noun} ${i + 1}`} onCommit={(text) => set(i, text)} />
        ))}
      </div>
    );
  }

  if (pool.length > 0) {
    return (
      <div className="answer">
        {slots.map((v, i) => (
          <select key={i} value={v} onChange={(e) => set(i, e.target.value)} aria-label={`${q.pkg.name} ${q.from} choice ${i + 1}`}>
            <option value="">Choose…</option>
            {pool.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ))}
      </div>
    );
  }
  return (
    <div className="answer">
      <p className="hint">No Traits are in the “{q.from}” pool yet. Type a name: it's saved as an id, and the engine warns that it can't check it.</p>
      {slots.map((v, i) => (
        <FreeText key={i} value={v} label={`${q.pkg.name} ${q.from} choice ${i + 1}`} asId onCommit={(id) => set(i, id)} />
      ))}
    </div>
  );
}

// Commits on blur or Enter, so typing a space doesn't leave a half-made id in the build.
// With asId, the text is saved as an id; otherwise as written.
function FreeText({ value, label, asId, onCommit }: { value: string; label: string; asId?: boolean; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value && asId ? traitName(value) : value);
  const commit = () => onCommit(asId ? slug(text) : text.trim());
  return (
    <div className="free-text">
      <input
        value={text}
        aria-label={label}
        placeholder={asId ? "e.g. Old Herminstan" : "e.g. Harbor Master Oyl, who owes me a favor"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {value && asId && <code className="muted">{value}</code>}
    </div>
  );
}
