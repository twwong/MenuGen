import "server-only";

import { del, get, put } from "@vercel/blob";

import type { ObjectStorage } from "@/application/contracts";

export class PrivateBlobStorage implements ObjectStorage {
  constructor(private readonly token: string) {}

  async put(input: Parameters<ObjectStorage["put"]>[0]) {
    const blob = await put(input.key, input.body as Parameters<typeof put>[1], {
      access: "private",
      token: this.token,
      contentType: input.mimeType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return {
      key: blob.url,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
    };
  }

  async read(key: string): Promise<ReadableStream> {
    const result = await get(key, {
      access: "private",
      token: this.token,
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("asset_not_found");
    }
    return result.stream;
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await del([...keys], { token: this.token });
  }
}
