import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Note: For a production app, verify the Stripe signature here using stripe.webhooks.constructEvent
  const event = req.body; // Assuming parsed JSON for this snippet

  try {
    const userEmail = event.data?.object?.customer_details?.email || event.data?.object?.customer_email || 'user@example.com';
    const locale = event.data?.object?.customer_details?.address?.country === 'VN' ? 'VI' : 'EN'; // Simple locale detection

    switch (event.type) {
      case 'checkout.session.completed': {
        const subject = locale === 'VI' ? 'Chào mừng bạn đến với GemForge - Nâng cấp thành công!' : 'Welcome to GemForge & Upgrade Success!';
        const html = locale === 'VI' 
          ? `<h1>Nâng cấp thành công!</h1><p>Cảm ơn bạn đã nâng cấp. GemForge đã sẵn sàng.</p>`
          : `<h1>Upgrade Success!</h1><p>Thank you for upgrading. GemForge is ready.</p>`;
        
        await resend.emails.send({
          from: 'GemForge <support@gemforge.ai>',
          to: userEmail,
          subject,
          html,
        });
        break;
      }

      case 'invoice.paid': {
        const subject = locale === 'VI' ? 'Biên lai thanh toán hàng tháng' : 'Monthly Billing Receipt';
        const html = locale === 'VI' 
          ? `<h1>Thanh toán thành công</h1><p>Biên lai thanh toán hàng tháng của bạn đã được ghi nhận.</p>`
          : `<h1>Payment Received</h1><p>Your monthly billing receipt has been processed.</p>`;
        
        await resend.emails.send({
          from: 'GemForge <billing@gemforge.ai>',
          to: userEmail,
          subject,
          html,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subject = locale === 'VI' ? 'Xác nhận hủy gói' : 'Plan Cancellation Confirmation';
        const html = locale === 'VI' 
          ? `<h1>Hủy gói thành công</h1><p>Gói của bạn đã được hủy. Bạn sẽ trở về gói miễn phí khi kỳ thanh toán kết thúc.</p>`
          : `<h1>Plan Cancelled</h1><p>Your plan has been cancelled. You will return to the free plan at the end of your billing cycle.</p>`;
        
        await resend.emails.send({
          from: 'GemForge <support@gemforge.ai>',
          to: userEmail,
          subject,
          html,
        });
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Webhook error:', message);
    res.status(400).send(`Webhook Error: ${message}`);
  }
}
