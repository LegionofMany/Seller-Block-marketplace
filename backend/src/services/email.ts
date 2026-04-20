import { getContext } from "./context";

export function transactionalEmailAvailable() {
  const { env } = getContext();
  return Boolean(env.postmarkServerToken && env.notificationEmailFrom && env.frontendAppUrl);
}

export async function sendTransactionalEmail(to: string, subject: string, htmlBody: string, textBody: string) {
  const { env, logger } = getContext();
  if (!env.postmarkServerToken || !env.notificationEmailFrom) return false;

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": env.postmarkServerToken,
      },
      body: JSON.stringify({
        From: env.notificationEmailFrom,
        To: to,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, to, subject }, "failed to send transactional email");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, to, subject }, "transactional email request failed");
    return false;
  }
}