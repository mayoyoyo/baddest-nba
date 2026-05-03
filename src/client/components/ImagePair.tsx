import type { PairPayload } from "../lib/api";
import { buildImageUrl } from "../lib/imageUrls";

interface ImagePairProps {
  onChoose: (winnerImageId: string, loserImageId: string) => Promise<void>;
  onSkip: () => Promise<void>;
  pair: PairPayload["pair"];
  pending?: boolean;
}

export default function ImagePair({
  onChoose,
  onSkip,
  pair,
  pending = false,
}: ImagePairProps) {
  if (!pair) {
    return <p className="empty-state">Add photos to start voting.</p>;
  }

  return (
    <div className="pair-grid">
      <button
        className="pair-card pair-card--left"
        disabled={pending}
        onClick={() => onChoose(pair.left.id, pair.right.id)}
        type="button"
      >
        <img
          alt=""
          className="pair-card__image"
          src={buildImageUrl(pair.left.id)}
        />
        <strong>{pair.left.id}</strong>
      </button>
      <button
        className="pair-card pair-card--right"
        disabled={pending}
        onClick={() => onChoose(pair.right.id, pair.left.id)}
        type="button"
      >
        <img
          alt=""
          className="pair-card__image"
          src={buildImageUrl(pair.right.id)}
        />
        <strong>{pair.right.id}</strong>
      </button>
      <div className="pair-grid__skip">
        <button
          className="button button--ghost pair-skip"
          disabled={pending}
          onClick={() => void onSkip()}
          type="button"
        >
          Skip matchup
        </button>
      </div>
    </div>
  );
}
