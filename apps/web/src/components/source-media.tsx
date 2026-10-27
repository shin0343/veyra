import type { Camera } from "@/lib/types";

export function SourceMediaCredit({
  media,
}: {
  media: Camera["source_media"];
}) {
  if (!media) return null;
  return (
    <p className="source-media-credit">
      {media.kind === "prerecorded"
        ? "Prerecorded demo"
        : "Development test pattern"}
      {" · "}
      {media.title}
      {" · "}
      {media.creator}
      {" · "}
      {media.license_url ? (
        <a href={media.license_url} target="_blank" rel="noreferrer">
          {media.license}
        </a>
      ) : (
        media.license
      )}
      {media.source_url && (
        <>
          {" "}
          ·{" "}
          <a href={media.source_url} target="_blank" rel="noreferrer">
            Original source
          </a>
        </>
      )}
      {" · "}
      {media.changes}
    </p>
  );
}
