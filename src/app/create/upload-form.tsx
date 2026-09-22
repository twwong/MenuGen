"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  beginManagedUploadAction,
  createDraftAction,
} from "@/app/create/actions";
import type { TargetLanguage } from "@/domain/menu/menu-extraction";

const languageOptions: ReadonlyArray<{ value: TargetLanguage; label: string }> =
  [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "ja", label: "Japanese" },
    { value: "zh-CN", label: "Simplified Chinese" },
  ];

export function UploadForm({
  enabled,
  backend,
}: {
  enabled: boolean;
  backend: "fixture" | "managed";
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("en");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)].slice(0, 10);
    setFiles(next);
    setError(null);
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...files];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setFiles(next);
  }

  function submit() {
    if (!enabled) {
      setError("The creator preview is not enabled in this environment.");
      return;
    }
    if (files.length === 0) {
      setError("Choose a PDF or at least one menu photo.");
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          targetLanguage,
          files: files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
        };
        const result =
          backend === "managed"
            ? await uploadManagedFiles(files, input, setProgress)
            : await createFixture(files, input, setProgress);
        router.push(`/create/${result.menuId}/processing`);
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message.includes("rate_limit")
            ? "This device has reached the three-menu daily preview limit."
            : "That menu could not be accepted. Check the file type and limits, then try again.";
        setError(message);
        queueMicrotask(() => errorRef.current?.focus());
      }
    });
  }

  return (
    <div className="creator-upload-grid">
      <section
        aria-labelledby="upload-heading"
        className="creator-panel creator-panel--paper"
      >
        <p className="eyebrow">01 · Language</p>
        <h1 className="creator-title" id="upload-heading">
          Bring the whole menu into view.
        </h1>
        <p className="creator-lede">
          Choose the language you want to read. Original wording and prices stay
          beside the translation.
        </p>

        <label className="field-label" htmlFor="target-language">
          Translate into
        </label>
        <select
          className="select-control"
          id="target-language"
          onChange={(event) =>
            setTargetLanguage(event.target.value as TargetLanguage)
          }
          value={targetLanguage}
        >
          {languageOptions.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>

        <div className="upload-actions" aria-label="Choose menu files">
          <label className="upload-choice upload-choice--primary">
            <span className="upload-choice__number">A</span>
            <span>
              <strong>Take menu photos</strong>
              <small>Best on a phone</small>
            </span>
            <input
              accept="image/jpeg,image/png,image/heic,image/heif"
              capture="environment"
              className="sr-only"
              disabled={!enabled || isPending}
              multiple
              onChange={(event) => addFiles(event.target.files)}
              type="file"
            />
          </label>
          <label className="upload-choice">
            <span className="upload-choice__number">B</span>
            <span>
              <strong>Choose photos or PDF</strong>
              <small>Up to 10 pages</small>
            </span>
            <input
              accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
              className="sr-only"
              disabled={!enabled || isPending}
              multiple
              onChange={(event) => addFiles(event.target.files)}
              type="file"
            />
          </label>
        </div>

        {files.length > 0 ? (
          <div className="page-order" aria-labelledby="page-order-heading">
            <div className="page-order__header">
              <h2 id="page-order-heading">Reading order</h2>
              <span>{files.length} / 10 pages</span>
            </div>
            <ol>
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <span aria-hidden="true" className="page-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="page-name">{file.name}</span>
                  <span className="page-size">{formatBytes(file.size)}</span>
                  <span className="page-controls">
                    <button
                      aria-label={`Move ${file.name} earlier`}
                      disabled={index === 0 || isPending}
                      onClick={() => move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${file.name} later`}
                      disabled={index === files.length - 1 || isPending}
                      onClick={() => move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Remove ${file.name}`}
                      disabled={isPending}
                      onClick={() =>
                        setFiles(
                          files.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {error ? (
          <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
            {error}
          </div>
        ) : null}

        {isPending ? (
          <div className="upload-progress" role="status">
            <span style={{ width: `${progress}%` }} />
            <p>Reading upload bytes… {progress}%</p>
          </div>
        ) : null}

        <button
          className="primary-button"
          disabled={!enabled || isPending}
          onClick={submit}
          type="button"
        >
          {isPending ? "Preparing menu…" : "Read this menu"}
        </button>
        {!enabled ? (
          <p className="preview-lock">
            Protected preview is off. No files can be submitted.
          </p>
        ) : null}
      </section>

      <aside className="capture-note" aria-labelledby="capture-heading">
        <p className="eyebrow">Capture note</p>
        <h2 id="capture-heading">Readable beats beautiful.</h2>
        <ol>
          <li>
            <span>1</span>Fill the frame, but keep every edge visible.
          </li>
          <li>
            <span>2</span>Move away from overhead glare and strong shadows.
          </li>
          <li>
            <span>3</span>Overlap pages slightly so nothing is missing.
          </li>
          <li>
            <span>4</span>Check small prices before you continue.
          </li>
        </ol>
        <p className="capture-note__limits">
          JPEG, PNG, HEIC, HEIF, or one PDF · 20 MB each · 50 MB total
        </p>
      </aside>
    </div>
  );
}

async function createFixture(
  files: readonly File[],
  input: Parameters<typeof beginManagedUploadAction>[0],
  update: (value: number) => void,
) {
  await measureFiles(files, update);
  return createDraftAction(input);
}

async function uploadManagedFiles(
  files: readonly File[],
  input: Parameters<typeof beginManagedUploadAction>[0],
  update: (value: number) => void,
) {
  const signed = await beginManagedUploadAction(input);
  const [{ default: Uppy }, { default: Transloadit }] = await Promise.all([
    import("@uppy/core"),
    import("@uppy/transloadit"),
  ]);
  const uppy = new Uppy({
    autoProceed: false,
    restrictions: {
      maxNumberOfFiles: 10,
      maxFileSize: 20 * 1024 * 1024,
      maxTotalFileSize: 50 * 1024 * 1024,
      allowedFileTypes: [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/heif",
      ],
    },
  });
  uppy.use(Transloadit, {
    assemblyOptions: {
      params: signed.params,
      signature: signed.signature,
    },
    waitForEncoding: true,
    retryDelays: [],
  });
  uppy.on("progress", update);
  for (const file of files) {
    uppy.addFile({
      name: file.name,
      type: file.type,
      data: file,
      source: "menu-file-input",
    });
  }
  try {
    const result = await uppy.upload();
    if (result?.failed?.length) throw new Error("managed_upload_failed");
    update(100);
    return { menuId: signed.menuId };
  } finally {
    uppy.destroy();
  }
}

async function measureFiles(
  files: readonly File[],
  update: (value: number) => void,
) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let completed = 0;
  for (const file of files) {
    await new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        update(
          Math.min(100, Math.round(((completed + event.loaded) / total) * 100)),
        );
      };
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.onload = () => resolve();
      reader.readAsArrayBuffer(file);
    });
    completed += file.size;
    update(Math.min(100, Math.round((completed / total) * 100)));
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
