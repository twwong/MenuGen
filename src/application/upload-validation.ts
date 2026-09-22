import { fileTypeFromBuffer } from "file-type";
import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import sharp from "sharp";

const MEBIBYTE = 1024 * 1024;

export const uploadLimits = {
  maximumFiles: 10,
  maximumPages: 10,
  maximumBytesPerFile: 20 * MEBIBYTE,
  maximumTotalBytes: 50 * MEBIBYTE,
  maximumImagePixels: 40_000_000,
  minimumImageDimension: 800,
} as const;

const acceptedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

export type UploadValidationCode =
  | "empty_upload"
  | "file_count_limit"
  | "file_size_limit"
  | "total_size_limit"
  | "unsupported_format"
  | "signature_mismatch"
  | "mixed_pdf_and_images"
  | "encrypted_pdf"
  | "page_limit"
  | "image_dimensions"
  | "decompression_limit";

export class UploadValidationError extends Error {
  constructor(
    readonly code: UploadValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export interface PendingUploadFile {
  name: string;
  claimedMimeType: string;
  bytes: Uint8Array;
  sourceFileOrder: number;
}

export interface ValidatedUploadFile {
  name: string;
  normalizedMimeType:
    | "application/pdf"
    | "image/jpeg"
    | "image/png"
    | "image/heic"
    | "image/heif";
  byteSize: number;
  sourceFileOrder: number;
  pageCount: number;
  width: number | null;
  height: number | null;
}

export async function validateUploadFiles(
  inputFiles: readonly PendingUploadFile[],
): Promise<readonly ValidatedUploadFile[]> {
  if (inputFiles.length === 0) {
    throw new UploadValidationError("empty_upload", "Choose a menu file first");
  }
  if (inputFiles.length > uploadLimits.maximumFiles) {
    throw new UploadValidationError(
      "file_count_limit",
      `Choose no more than ${uploadLimits.maximumFiles} images`,
    );
  }

  const totalBytes = inputFiles.reduce(
    (total, file) => total + file.bytes.byteLength,
    0,
  );
  if (totalBytes > uploadLimits.maximumTotalBytes) {
    throw new UploadValidationError(
      "total_size_limit",
      "The menu is larger than the 50 MB total limit",
    );
  }

  const orderedFiles = [...inputFiles].sort(
    (left, right) => left.sourceFileOrder - right.sourceFileOrder,
  );
  const validated = await Promise.all(orderedFiles.map(validateOneFile));
  const hasPdf = validated.some(
    (file) => file.normalizedMimeType === "application/pdf",
  );
  if (hasPdf && validated.length !== 1) {
    throw new UploadValidationError(
      "mixed_pdf_and_images",
      "Upload one PDF or an ordered set of photos, not both",
    );
  }

  const totalPages = validated.reduce(
    (total, file) => total + file.pageCount,
    0,
  );
  if (totalPages > uploadLimits.maximumPages) {
    throw new UploadValidationError(
      "page_limit",
      `The menu has more than ${uploadLimits.maximumPages} pages`,
    );
  }
  return validated;
}

async function validateOneFile(
  file: PendingUploadFile,
): Promise<ValidatedUploadFile> {
  if (file.bytes.byteLength > uploadLimits.maximumBytesPerFile) {
    throw new UploadValidationError(
      "file_size_limit",
      `${file.name} is larger than the 20 MB per-file limit`,
    );
  }

  const detected = await fileTypeFromBuffer(file.bytes);
  if (!detected || !acceptedMimeTypes.has(detected.mime)) {
    throw new UploadValidationError(
      "unsupported_format",
      `${file.name} is not a supported PDF or menu photo`,
    );
  }

  const normalizedClaim =
    file.claimedMimeType === "image/jpg" ? "image/jpeg" : file.claimedMimeType;
  if (normalizedClaim !== detected.mime) {
    throw new UploadValidationError(
      "signature_mismatch",
      `${file.name} does not match its declared file type`,
    );
  }

  if (detected.mime === "application/pdf") {
    return validatePdf(file);
  }
  if (detected.mime === "image/jpeg" || detected.mime === "image/png") {
    return validateRasterImage(file, detected.mime);
  }

  return {
    name: file.name,
    normalizedMimeType: detected.mime as "image/heic" | "image/heif",
    byteSize: file.bytes.byteLength,
    sourceFileOrder: file.sourceFileOrder,
    pageCount: 1,
    width: null,
    height: null,
  };
}

async function validatePdf(
  file: PendingUploadFile,
): Promise<ValidatedUploadFile> {
  const header = Buffer.from(file.bytes)
    .subarray(0, 1_000_000)
    .toString("latin1");
  if (/\/Encrypt\b/.test(header)) {
    throw new UploadValidationError(
      "encrypted_pdf",
      "Remove the PDF password before uploading",
    );
  }
  try {
    const pdf = await PDFDocument.load(file.bytes, { updateMetadata: false });
    return {
      name: file.name,
      normalizedMimeType: "application/pdf",
      byteSize: file.bytes.byteLength,
      sourceFileOrder: file.sourceFileOrder,
      pageCount: pdf.getPageCount(),
      width: null,
      height: null,
    };
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new UploadValidationError(
        "encrypted_pdf",
        "Remove the PDF password before uploading",
      );
    }
    throw new UploadValidationError(
      "unsupported_format",
      `${file.name} is not a readable PDF`,
    );
  }
}

async function validateRasterImage(
  file: PendingUploadFile,
  mimeType: "image/jpeg" | "image/png",
): Promise<ValidatedUploadFile> {
  const metadata = await sharp(file.bytes, {
    limitInputPixels: uploadLimits.maximumImagePixels,
  }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new UploadValidationError(
      "image_dimensions",
      `${file.name} has unreadable dimensions`,
    );
  }
  if (metadata.width * metadata.height > uploadLimits.maximumImagePixels) {
    throw new UploadValidationError(
      "decompression_limit",
      `${file.name} expands beyond the safe image limit`,
    );
  }
  if (
    metadata.width < uploadLimits.minimumImageDimension ||
    metadata.height < uploadLimits.minimumImageDimension
  ) {
    throw new UploadValidationError(
      "image_dimensions",
      `${file.name} is too small to read reliably`,
    );
  }

  return {
    name: file.name,
    normalizedMimeType: mimeType,
    byteSize: file.bytes.byteLength,
    sourceFileOrder: file.sourceFileOrder,
    pageCount: 1,
    width: metadata.width,
    height: metadata.height,
  };
}
