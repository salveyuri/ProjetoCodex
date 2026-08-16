import { afterEach, describe, expect, it, vi } from "vitest";
import { emailService } from "./email.service";
import { resendClient } from "./resend-client";

/**
 * Same convention as the route integration tests: hits the real dev
 * Postgres (reads the actual seeded EmailTemplate rows, writes a real
 * EmailLog row per call — not cleaned up afterwards). Only the outbound
 * Resend call itself is mocked, since that's the actual external I/O
 * boundary and there is no real API key configured in this environment
 * anyway.
 */
describe("EmailService.send", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("HTML-escapes plain variables but leaves *Html-suffixed ones raw", async () => {
    const sendSpy = vi
      .spyOn(resendClient, "send")
      .mockResolvedValue({ id: "resend-id-1", error: null });

    await emailService.send("QUOTE_SUMMARY", "customer@example.com", {
      accountName: '<script>alert("xss")</script>',
      customerName: "Fulano & Cia",
      totalAmount: "R$ 100,00",
      validUntil: "01/01/2027",
      itemsHtml: "<tr><td>Peca segura</td></tr>",
      triggerLabel: "aprovado",
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [{ html }] = sendSpy.mock.calls[0];

    // The dangerous variable was escaped — no raw <script> tag reached the
    // outgoing HTML.
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Plain text with an ampersand is also escaped.
    expect(html).toContain("Fulano &amp; Cia");
    // itemsHtml is a pre-built HTML fragment (key ends in "Html") and must
    // pass through untouched, not double-escaped.
    expect(html).toContain("<tr><td>Peca segura</td></tr>");
  });

  it("strips newlines from subject variables but does not HTML-escape them", async () => {
    const sendSpy = vi
      .spyOn(resendClient, "send")
      .mockResolvedValue({ id: "resend-id-2", error: null });

    await emailService.send("ACCOUNT_CREATED", "user@example.com", {
      accountName: "Empresa & Filhos\nLinha injetada",
      email: "user@example.com",
      planName: "Free",
      loginUrl: "https://example.com/login",
    });

    const [{ subject }] = sendSpy.mock.calls[0];

    expect(subject).not.toContain("\n");
    // Subjects are plain text (never HTML-rendered), so "&" must stay
    // literal here — HTML-escaping it would show "&amp;" to the recipient.
    expect(subject).toContain("Empresa & Filhos Linha injetada");
  });

  it("never throws even when Resend fails, and reports the failure", async () => {
    vi.spyOn(resendClient, "send").mockRejectedValue(new Error("network down"));

    const result = await emailService.send("ACCOUNT_CREATED", "user@example.com", {
      accountName: "Empresa Teste",
      email: "user@example.com",
      planName: "Free",
      loginUrl: "https://example.com/login",
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("network down");
  });
});
