import { Resend } from 'resend';

// NOTE: In a production environment, Resend should be called from a backend server 
// or serverless function (like Supabase Edge Functions) to prevent exposing your API key
// and to avoid CORS issues in the browser.
// This implementation is provided for demonstration/MVP purposes.

const resendApiKey = import.meta.env.VITE_RESEND_API_KEY;

let resend: Resend | null = null;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
}

export async function sendWelcomeEmail(toEmail: string) {
  if (!resend) {
    console.warn("Resend API key is missing. Skipping email.");
    return { success: false, error: 'API key missing' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'GemForge <onboarding@resend.dev>', // Use a verified domain in production
      to: [toEmail],
      subject: 'Welcome to GemForge!',
      html: `
        <div>
          <h1>Welcome to GemForge!</h1>
          <p>We are thrilled to have you on board.</p>
          <p>Get ready to forge powerful AI Gems and supercharge your workflow.</p>
          <br />
          <p>Best regards,</p>
          <p>The GemForge Team</p>
        </div>
      `,
    });

    if (error) {
      console.error("Error sending email:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err: unknown) {
    console.error("Exception sending email:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
