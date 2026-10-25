import { useState } from "react";
import type { ChoiceAnswer } from "../../engine/build.js";
import { answers, choicePool, FREE_TEXT_POOLS, SPOKEN_AND_WRITTEN, type BuildResult, type ChoiceQuestion } from "../../engine/validate.js";
import { content, packageById, traitById } from "../content.js";
import { slug, type Draft } from "../draft.js";
import { Chip, choiceLabel, regionClass, SettingIcon, StepHeader, title, traitName } from "./ui.js";

// Before the build is complete enough for the engine, its packages' choices.
function packageQuestions(draft: Draft): ChoiceQuestion[] {
  const out: ChoiceQuestion[] = [];
  for (const id of [draft.origin, draft.profession, draft.past]) {
    const pkg = id ? packageById.get(id) : undefined;
    if (!pkg) continue;
    for (const c of pkg.choices) {
      const q = out.find((x) => x.id === pkg.id && x.from === c.from);
      if (q) {
        q.count += c.choose;
        if (c.note) q.notes.push(c.note);
      } else out.push({ by: "package", id: pkg.id, name: pkg.name, from: c.from, count: c.choose, notes: c.note ? [c.note] : [] });
    }
  }
  return out;
}

// What asked, under each question's name: the package's slot, or "Trait".
const askedBy = (q: ChoiceQuestion) => (q.by === "trait" ? "Trait" : title(packageById.get(q.id)?.type ?? "package"));

// The plane of whatever asked, for the card's header color.
const askerPlane = (q: ChoiceQuestion) => (q.by === "trait" ? traitById.get(q.id)?.plane : packageById.get(q.id)?.plane);

export function ChoicesStep({ draft, result, onChange }: { draft: Draft; result: BuildResult; onChange: (d: Draft) => void }) {
  // The engine's questions: the packages' choices, then the held Traits'.
  const qs = result.summary?.questions ?? packageQuestions(draft);
  const answerOf = (q: ChoiceQuestion) => draft.choices.find((c) => answers(c, q));
  const setAnswer = (q: ChoiceQuestion, traits: string[]) => {
    const rest = draft.choices.filter((c) => !answers(c, q));
    const answer: ChoiceAnswer = { [q.by]: q.id, from: q.from, traits };
    onChange({ ...draft, choices: [...rest, answer] });
  };

  return (
    <section>
      <StepHeader step="choices" title="Choices">
        Packages and some Traits ask you to choose, like who a Contact is, which language you speak, or which seas you've sailed.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        {qs.length === 0 && <p className="empty">This build's packages and Traits have no choices to answer.</p>}
        <div className="choice-grid">
          {qs.map((q) => (
            <div key={`${q.by}/${q.id}/${q.from}`} className={`choice headed ${regionClass(askerPlane(q))}`}>
              <div className="card-head">
                <h3>
                  <SettingIcon plane={askerPlane(q)} />
                  {q.name}
                </h3>
                <Chip tone="muted">{askedBy(q)}</Chip>
              </div>
              <p>{q.notes.join("; ") || choiceLabel(q.count, q.from)}</p>
              <Answer q={q} answer={answerOf(q)?.traits ?? []} onAnswer={(t) => setAnswer(q, t)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Answer({ q, answer, onAnswer }: { q: ChoiceQuestion; answer: string[]; onAnswer: (traits: string[]) => void }) {
  const pool = choicePool(q.from, content);
  const noun = FREE_TEXT_POOLS[q.from];
  const slots = Array.from({ length: q.count }, (_, i) => answer[i] ?? "");
  const set = (i: number, value: string) => {
    const next = slots.slice();
    next[i] = value;
    onAnswer(next.filter((v) => v !== ""));
  };

  // A Contact or Place is whatever the player says it is: kept as written.
  if (noun) {
    const contact = q.from === "contact";
    return (
      <div className="answer">
        <p className="hint">{contact ? `Who is your ${noun}? Write a name or a short note; it's yours to decide.` : "Write it in your own words; it's yours to decide."}</p>
        {slots.map((v, i) => (
          <FreeText
            key={i}
            value={v}
            label={`${q.name} ${noun} ${i + 1}`}
            placeholder={contact ? undefined : "e.g. The Mende river and its delta"}
            onCommit={(text) => set(i, text)}
          />
        ))}
      </div>
    );
  }

  if (pool.length > 0) {
    return (
      <div className="answer">
        {slots.map((v, i) => (
          <select key={i} value={v} onChange={(e) => set(i, e.target.value)} aria-label={`${q.name} ${q.from} choice ${i + 1}`}>
            <option value="">Choose…</option>
            {pool.map((t) => (
              <option key={t.id} value={t.id}>
                {/* The answer brings both forms, so name the language itself. */}
                {q.from === SPOKEN_AND_WRITTEN ? t.name.replace(/ \(Spoken\)$/, "") : t.name}
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
        <FreeText key={i} value={v} label={`${q.name} ${q.from} choice ${i + 1}`} asId onCommit={(id) => set(i, id)} />
      ))}
    </div>
  );
}

// Commits on blur or Enter, so typing a space doesn't leave a half-made id in the build.
// With asId, the text is saved as an id; otherwise as written.
function FreeText({
  value,
  label,
  asId,
  placeholder,
  onCommit,
}: {
  value: string;
  label: string;
  asId?: boolean;
  placeholder?: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(value && asId ? traitName(value) : value);
  const commit = () => onCommit(asId ? slug(text) : text.trim());
  return (
    <div className="free-text">
      <input
        value={text}
        aria-label={label}
        placeholder={placeholder ?? (asId ? "e.g. Old Herminstan" : "e.g. Harbor Master Oyl, who owes me a favor")}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {value && asId && <code className="muted">{value}</code>}
    </div>
  );
}
