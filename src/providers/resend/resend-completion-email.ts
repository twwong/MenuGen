import "server-only";

import { Resend } from "resend";

import type { CompletionEmailSender } from "@/application/contracts";

export class ResendCompletionEmailSender implements CompletionEmailSender {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
    private readonly appUrl: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(input: Parameters<CompletionEmailSender["send"]>[0]) {
    const dashboardUrl = new URL("/dashboard", this.appUrl).toString();
    const { data, error } = await this.resend.emails.send(
      {
        from: this.from,
        to: input.email,
        subject: "Your MenuGen result is ready",
        html: [
          "<p>Your MenuGen result is ready.</p>",
          `<p><a href="${escapeHtml(dashboardUrl)}">Open your private dashboard</a></p>`,
          "<p>This result expires 30 days after generation.</p>",
        ].join(""),
        text: `Your MenuGen result is ready. Open your private dashboard: ${dashboardUrl}\n\nThis result expires 30 days after generation.`,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (error || !data) throw new Error("completion_email_failed");
    return { providerMessageId: data.id };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
