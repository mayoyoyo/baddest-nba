import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import {
  ApiError,
  deleteAdminImage,
  searchAdminImages,
  uploadAdminImage,
} from "../lib/api";
import {
  prepareImageForUpload,
  type PreparedUploadImage,
} from "../lib/imagePrep";
import { loadCurrentUser, type SessionUser } from "../lib/session";
import { useAppLogout } from "../lib/useAppLogout";

type UploadStatus = "failed" | "preparing" | "ready" | "uploaded" | "uploading";

interface UploadItem extends PreparedUploadImage {
  error?: string;
  id: string;
  imageId?: string;
  originalFile: File;
  status: UploadStatus;
}

export default function AdminUploadPage() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteQuery, setDeleteQuery] = useState("");
  const [deleteResults, setDeleteResults] = useState<Array<{ id: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const handleLogout = useAppLogout();

  useEffect(() => {
    let active = true;

    loadCurrentUser(true)
      .then((nextUser) => {
        if (active) {
          setUser(nextUser);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setPageError(error instanceof Error ? error.message : "Unable to load session");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const readyCount = useMemo(
    () => items.filter((item) => item.status === "ready").length,
    [items],
  );

  if (user === undefined) {
    return <main className="page-shell">Loading...</main>;
  }

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  if (user.role !== "admin") {
    return (
      <AppShell
        activeNav="shared"
        onLogout={handleLogout}
        title="Upload"
        user={user}
      >
          <p className="form-error">This page is for admins only.</p>
      </AppShell>
    );
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setPageError(null);
    const files = Array.from(fileList);
    const preparedItems = await Promise.all(
      files.map(async (file) => {
        try {
          const prepared = await prepareImageForUpload(file);
          return {
            id: crypto.randomUUID(),
            originalFile: file,
            status: "ready" as const,
            ...prepared,
          };
        } catch (error) {
          return {
            id: crypto.randomUUID(),
            originalFile: file,
            status: "failed" as const,
            displayFile: file,
            width: 0,
            height: 0,
            previewUrl: URL.createObjectURL(file),
            error: error instanceof Error ? error.message : "Unable to prepare image",
          };
        }
      }),
    );

    setItems((current) => [...current, ...preparedItems]);
  }

  async function handleUploadAll() {
    setPageError(null);

    for (const item of items) {
      if (item.status !== "ready") {
        continue;
      }

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", error: undefined } : entry,
        ),
      );

      try {
        const response = await uploadAdminImage({
          display: item.displayFile,
          width: item.width,
          height: item.height,
          sourceName: item.originalFile.name,
        });
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "uploaded",
                  imageId: response.image.id,
                }
              : entry,
          ),
        );
      } catch (error) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "failed",
                  error:
                    error instanceof ApiError
                      ? error.message
                      : "Unable to upload image",
                }
              : entry,
          ),
        );
      }
    }
  }

  async function handleDeleteSearch() {
    const normalizedQuery = deleteQuery.trim();
    setDeleteError(null);
    setDeleteResults([]);

    if (!normalizedQuery) {
      return;
    }

    setSearching(true);
    try {
      const response = await searchAdminImages(normalizedQuery);
      setDeleteResults(response.images);
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? error.message : "Unable to search photos",
      );
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete(imageId: string) {
    setDeleteError(null);

    if (!window.confirm(`Delete ${imageId} permanently?`)) {
      return;
    }

    setDeletingImageId(imageId);
    try {
      await deleteAdminImage(imageId);
      setDeleteResults((current) =>
        current.filter((result) => result.id !== imageId),
      );
      setItems((current) =>
        current.filter((item) => item.imageId !== imageId),
      );
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? error.message : "Unable to delete photo",
      );
    } finally {
      setDeletingImageId(null);
    }
  }

  return (
    <AppShell
      activeNav="upload"
      onLogout={handleLogout}
      title="Upload"
      user={user}
    >
      <section className="upload-controls">
        <label className="button button--ghost upload-picker">
          <input
            accept="image/*"
            multiple
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.currentTarget.value = "";
            }}
            type="file"
          />
          Choose photos
        </label>
        <button
          className="button"
          disabled={readyCount === 0}
          onClick={() => void handleUploadAll()}
          type="button"
        >
          Upload ready files
        </button>
      </section>
      {pageError ? <p className="form-error">{pageError}</p> : null}
      <div className="upload-grid">
        {items.map((item) => (
          <article className="upload-item" key={item.id}>
            <img
              alt={item.originalFile.name}
              className="upload-item__preview"
              src={item.previewUrl}
            />
            <div className="upload-item__meta">
              <strong>{item.originalFile.name}</strong>
              <span>
                {item.width > 0 && item.height > 0
                  ? `${item.width} x ${item.height}`
                  : "Not prepared"}
              </span>
              <span className={`upload-status upload-status--${item.status}`}>
                {item.status}
              </span>
              {item.imageId ? <span>ID: {item.imageId}</span> : null}
              {item.error ? <p className="form-error">{item.error}</p> : null}
            </div>
          </article>
        ))}
      </div>
      <section className="upload-controls">
        <input
          name="delete-search"
          onChange={(event) => setDeleteQuery(event.currentTarget.value)}
          placeholder="Search photo ID"
          type="search"
          value={deleteQuery}
        />
        <button
          className="button button--ghost"
          disabled={searching || deleteQuery.trim().length === 0}
          onClick={() => void handleDeleteSearch()}
          type="button"
        >
          {searching ? "Searching..." : "Search photos"}
        </button>
      </section>
      {deleteError ? <p className="form-error">{deleteError}</p> : null}
      {deleteResults.length > 0 ? (
        <div className="upload-grid">
          {deleteResults.map((result) => (
            <article className="upload-item" key={result.id}>
              <div className="upload-item__meta">
                <strong>{result.id}</strong>
                <button
                  className="button button--ghost"
                  disabled={deletingImageId === result.id}
                  onClick={() => void handleDelete(result.id)}
                  type="button"
                >
                  {deletingImageId === result.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}
