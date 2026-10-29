import { PackageGrants } from "../../app/components/BackgroundStep.js";
import { Chip, LorePopup, regionClass, SettingIcon, StatRanges, traitName } from "../../app/components/ui.js";
import { kindById, packageById } from "../../app/content.js";

// A Kind's or a background package's card, drawn like its card in the
// Character Creator, in the site's lore popup. Opened from the background
// line under the character's name.
export function BackgroundPopup({ id, onClose }: { id: string; onClose: () => void }) {
  const kind = kindById.get(id);
  const pkg = kind ? undefined : packageById.get(id);
  const entry = kind ?? pkg;
  if (!entry) return null;
  return (
    <LorePopup label={entry.name} onClose={onClose}>
      <div className={`card headed tools-background-card ${regionClass(entry.plane)}`}>
        <div className="card-head">
          <h3>
            <SettingIcon plane={entry.plane} />
            {entry.name}
          </h3>
          <Chip tone="muted">{entry.plane}</Chip>
        </div>
        <p>{entry.summary}</p>
        {entry.lore && <p className="muted">{entry.lore}</p>}
        {kind && (
          <>
            <StatRanges stats={kind.stats} />
            {kind.grants.length > 0 && (
              <div className="grants">
                <div>
                  <span className="label">Grants</span>
                  {kind.grants.map((g) => (
                    <Chip key={g.trait} tone="accent">
                      {traitName(g.trait)}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <ul className="features">
              {kind.features.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}.</strong> {f.description}
                </li>
              ))}
            </ul>
          </>
        )}
        {pkg && <PackageGrants pkg={pkg} />}
      </div>
    </LorePopup>
  );
}
