// Email sender. Plug-in point for Resend.
// - Production: set RESEND_API_KEY + RESEND_FROM, mail goes via Resend HTTPS API.
// - Dev/testing (no key): logs to console and returns { devLink } so callers
//   can surface the link directly to the requester for one-click testing.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Countryside Staples <onboarding@resend.dev>';
const IS_PROD = process.env.NODE_ENV === 'production';

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

async function sendMail({ to, subject, html, text, devLink }) {
  if (RESEND_API_KEY) {
    await sendViaResend({ to, subject, html, text });
    return { delivered: 'resend' };
  }
  // Dev fallback — refuse to silently drop mail in production.
  if (IS_PROD) {
    throw new Error('RESEND_API_KEY is required in production');
  }
  console.log('\n  ── DEV EMAIL ──────────────────────────────');
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}`);
  if (devLink) console.log(`  Link:    ${devLink}`);
  console.log('  ───────────────────────────────────────────\n');
  return { delivered: 'console', devLink };
}

function shell({ heading, body, ctaLabel, link, footer }) {
  return `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
      <h2 style="margin:0 0 16px;font-weight:normal;letter-spacing:0.04em">Countryside Staples</h2>
      <p style="margin:0 0 12px">${heading}</p>
      <p style="margin:0 0 16px;color:#444">${body}</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:13px">${ctaLabel}</a>
      </p>
      <p style="font-size:13px;color:#666">Or paste this URL: <br><span style="word-break:break-all">${link}</span></p>
      <p style="font-size:13px;color:#666;margin-top:24px">${footer}</p>
    </div>`;
}

function verifyEmailTemplate({ link }) {
  return {
    subject: 'Confirm your email — Countryside Staples',
    text: `Confirm your email to finish creating your account: ${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this message.`,
    html: shell({
      heading: 'Welcome — please confirm your email.',
      body: 'Click the button below to verify your address and activate your account.',
      ctaLabel: 'Confirm email',
      link,
      footer: "This link expires in 24 hours. If you didn't sign up, ignore this message.",
    }),
  };
}

function resetPasswordTemplate({ link }) {
  return {
    subject: 'Reset your password — Countryside Staples',
    text: `Reset your password: ${link}\n\nThis link expires in 1 hour. If you didn't request it, ignore this message — your password won't change.`,
    html: shell({
      heading: 'Reset your password.',
      body: "Click the button below to choose a new password. If you didn't request this, you can safely ignore this email.",
      ctaLabel: 'Reset password',
      link,
      footer: "This link expires in 1 hour. If you didn't request it, your password won't change.",
    }),
  };
}

module.exports = { sendMail, verifyEmailTemplate, resetPasswordTemplate };
