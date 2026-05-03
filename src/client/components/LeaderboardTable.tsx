import { useEffect, useState } from "react";

import ConfidenceBadge from "./ConfidenceBadge";
import { buildImageUrl } from "../lib/imageUrls";

interface LeaderboardRow {
  confidence: number;
  image: { id: string };
  rankPosition: number;
  score: string;
  wins: number;
}

interface LeaderboardTableProps {
  rows: LeaderboardRow[];
}

export default function LeaderboardTable({ rows }: LeaderboardTableProps) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedImageId) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedImageId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedImageId]);

  return (
    <>
      <div className="table-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Image</th>
              <th>Score</th>
              <th>Wins</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.image.id}>
                <td>{row.rankPosition}</td>
                <td>
                  <button
                    aria-label={`Open ${row.image.id} image`}
                    className="leaderboard-image-button"
                    onClick={() => setSelectedImageId(row.image.id)}
                    type="button"
                  >
                    <span className="leaderboard-image-cell">
                      <img
                        alt=""
                        className="leaderboard-thumb"
                        loading="lazy"
                        src={buildImageUrl(row.image.id)}
                      />
                      <span>{row.image.id}</span>
                    </span>
                  </button>
                </td>
                <td>{row.score}</td>
                <td>{row.wins}</td>
                <td>
                  <ConfidenceBadge value={row.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedImageId ? (
        <div
          className="image-popout"
          onClick={() => setSelectedImageId(null)}
          role="presentation"
        >
          <div
            aria-label={`${selectedImageId} image preview`}
            aria-modal="true"
            className="image-popout__dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="image-popout__header">
              <h2>{selectedImageId}</h2>
              <button
                className="button button--ghost"
                onClick={() => setSelectedImageId(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <img
              alt={selectedImageId}
              className="image-popout__image"
              src={buildImageUrl(selectedImageId)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
