import { PackageGrants } from "./BackgroundStep.js";
import { Popup } from "./popup.js";
import { title } from "./ui.js";
import { BackgroundCard } from "./cards.js";
import { KindBody } from "./KindCards.js";
import { kindById, packageById } from "../content.js";

// A Kind's or a background package's card, drawn like its card in the
// Character Creator, in the site's lore popup. Opened from the background
// line under the character's name in Player Tools, and from the list beside
// it on the Sheet. Its header says what it is (Kind, Origin, Profession or
// Past), like the badges on the Trait cards, then its setting.
export function BackgroundPopup({ id, onClose }: { id: string; onClose: () => void }) {
  const kind = kindById.get(id);
  const pkg = kind ? undefined : packageById.get(id);
  const entry = kind ?? pkg;
  if (!entry) return null;
  return (
    <Popup label={entry.name} onClose={onClose} card>
      <BackgroundCard name={entry.name} slot={kind ? "Kind" : title(pkg!.type)} plane={entry.plane} className="tools-background-card">
        {kind ? (
          <KindBody kind={kind} lore />
        ) : (
          <>
            <p>{entry.summary}</p>
            {entry.lore && <p className="sf-card-lore">{entry.lore}</p>}
            <PackageGrants pkg={pkg!} />
          </>
        )}
      </BackgroundCard>
    </Popup>
  );
}
