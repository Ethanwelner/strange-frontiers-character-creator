import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { GENDERS, MAX_AGE, MAX_SIZE_LENGTH, genderText, type Looks } from "../draft.js";

const label = (g: string) => g[0]!.toUpperCase() + g.slice(1);

// Age, gender, height and weight, blocks on the line under the character's
// name (after Kind): each a label over its value and the name's pen. The pen
// (or the value) opens its field in place: a number for the age, the
// creator's gender dropdown for the gender, with a field for the player's own
// word under Custom, and free text for height and weight. Enter or leaving
// the field keeps it; Escape puts it back.
export function LooksLine({ looks, onChange }: { looks: Looks; onChange: (looks: Looks) => void }) {
  const [editing, setEditing] = useState<"age" | "gender" | "height" | "weight">();
  const [age, setAge] = useState("");
  // The height or weight being edited
  const [size, setSize] = useState("");
  const [gender, setGender] = useState<string>("unlisted");
  const [custom, setCustom] = useState("");

  const startAge = () => {
    setAge(looks.age === undefined ? "" : String(looks.age));
    setEditing("age");
  };
  const startGender = () => {
    setGender(looks.gender ?? "unlisted");
    setCustom(looks.customGender ?? "");
    setEditing("gender");
  };
  const finishAge = (keep: boolean) => {
    if (keep) {
      const n = Number(age);
      onChange({ ...looks, age: age.trim() === "" || !Number.isFinite(n) ? undefined : Math.min(MAX_AGE, Math.max(0, Math.floor(n))) });
    }
    setEditing(undefined);
  };
  const keepGender = (g: string, word: string) => {
    const picked = g === "unlisted" ? undefined : (g as Looks["gender"]);
    onChange({ ...looks, gender: picked, customGender: picked === "custom" ? word.trim() || undefined : undefined });
  };
  // Leaving the gender fields keeps them, unless focus moved between the
  // dropdown and the custom word, which are one edit.
  const leaveGender = (e: FocusEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    keepGender(gender, custom);
    setEditing(undefined);
  };
  const keys = (finish: (keep: boolean) => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  };
  const finishGender = (keep: boolean) => {
    if (keep) keepGender(gender, custom);
    setEditing(undefined);
  };
  const startSize = (key: "height" | "weight") => {
    setSize(looks[key] ?? "");
    setEditing(key);
  };
  const finishSize = (key: "height" | "weight") => (keep: boolean) => {
    if (keep) onChange({ ...looks, [key]: size.trim() || undefined });
    setEditing(undefined);
  };

  // Height or weight: its value, or a free-text field while it's edited
  const sizeItem = (key: "height" | "weight", label: string) => (
    <span className="tools-line-item tools-look">
      <span className="field-label">{label}</span>
      <span className="tools-look-row">
        {editing === key ? (
          <input
            className="tools-look-input tools-look-size"
            aria-label={label}
            maxLength={MAX_SIZE_LENGTH}
            placeholder="—"
            autoFocus
            value={size}
            onChange={(e) => setSize(e.target.value)}
            onBlur={() => finishSize(key)(true)}
            onKeyDown={keys(finishSize(key))}
          />
        ) : (
          <button type="button" className="tools-look-value" onClick={() => startSize(key)}>
            <strong>{looks[key] ?? "—"}</strong>
          </button>
        )}
        <button
          type="button"
          className="name-edit tools-look-edit"
          aria-label={`Edit the ${key}`}
          onMouseDown={(e) => editing === key && e.preventDefault()}
          onClick={() => (editing === key ? finishSize(key)(true) : startSize(key))}
        >
          <span className="pen-icon" aria-hidden="true" />
        </button>
      </span>
    </span>
  );

  return (
    <>
      <span className="tools-line-item tools-look">
        <span className="field-label">Age</span>
        <span className="tools-look-row">
          {editing === "age" ? (
            <input
              className="tools-look-input tools-look-age"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_AGE}
              step={1}
              aria-label="Age"
              placeholder="—"
              autoFocus
              value={age}
              onChange={(e) => setAge(e.target.value)}
              onBlur={() => finishAge(true)}
              onKeyDown={keys(finishAge)}
            />
          ) : (
            <button type="button" className="tools-look-value" onClick={startAge}>
              <strong>{looks.age ?? "—"}</strong>
            </button>
          )}
          <button
            type="button"
            className="name-edit tools-look-edit"
            aria-label="Edit the age"
            onMouseDown={(e) => editing === "age" && e.preventDefault()}
            onClick={() => (editing === "age" ? finishAge(true) : startAge())}
          >
            <span className="pen-icon" aria-hidden="true" />
          </button>
        </span>
      </span>
      <span className="tools-line-item tools-look">
        <span className="field-label">Gender</span>
        <span className="tools-look-row">
          {editing === "gender" ? (
            <span className="tools-look-gender" onBlur={leaveGender}>
              <select
                className="tools-look-input"
                aria-label="Gender"
                autoFocus
                value={gender}
                onChange={(e) => {
                  setGender(e.target.value);
                  // Anything but Custom is the whole answer
                  if (e.target.value !== "custom") {
                    keepGender(e.target.value, "");
                    setEditing(undefined);
                  }
                }}
                onKeyDown={(e) => e.key === "Escape" && finishGender(false)}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {label(g)}
                  </option>
                ))}
              </select>
              {gender === "custom" && (
                <input
                  className="tools-look-input"
                  aria-label="Custom gender"
                  maxLength={40}
                  placeholder="In your own words"
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={keys(finishGender)}
                />
              )}
            </span>
          ) : (
            <button type="button" className="tools-look-value" onClick={startGender}>
              <strong>{genderText(looks) ?? "Unlisted"}</strong>
            </button>
          )}
          <button
            type="button"
            className="name-edit tools-look-edit"
            aria-label="Edit the gender"
            onMouseDown={(e) => editing === "gender" && e.preventDefault()}
            onClick={() => (editing === "gender" ? finishGender(true) : startGender())}
          >
            <span className="pen-icon" aria-hidden="true" />
          </button>
        </span>
      </span>
      {sizeItem("height", "Height")}
      {sizeItem("weight", "Weight")}
    </>
  );
}
