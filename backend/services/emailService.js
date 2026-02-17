const { Resend } = require('resend');

let resendClient = null;

function getClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Payless4Tech <noreply@payless4tech.com>';

const STATUS_TEMPLATES = {
  'Purchased': {
    subject: 'Your order {tracking_code} has been purchased! 🛒',
    body: `Hi {customer_name},

Great news! Your preorder ({tracking_code}) has been purchased and is being prepared.

Item: {item_description}
Quantity: {quantity}

We'll notify you once it ships. You can track your order anytime at:
https://payless4tech.com/track

Tracking Code: {tracking_code}

Thank you for choosing Payless4Tech!
— The Payless4Tech Team`
  },
  'Shipped': {
    subject: 'Your order {tracking_code} has been shipped! ✈️',
    body: `Hi {customer_name},

Your preorder ({tracking_code}) is on its way to Ghana!

Item: {item_description}
Shipping Method: {shipping_method}
Estimated Arrival: {estimated_arrival_date}

Track your order: https://payless4tech.com/track
Tracking Code: {tracking_code}

We'll let you know when it arrives.
— The Payless4Tech Team`
  },
  'Arrived': {
    subject: 'Your order {tracking_code} has arrived! 🎉',
    body: `Hi {customer_name},

Your preorder ({tracking_code}) has arrived and is ready for pickup!

Item: {item_description}
Balance Due: GHS {balance_due}

Please visit our shop at Dworwulu, Accra to complete your purchase.

Questions? Call or WhatsApp us.
— The Payless4Tech Team`
  }
};

function fillTemplate(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || 'N/A');
  }
  return result;
}

async function sendPreorderStatusEmail(preorder) {
  const client = getClient();
  if (!client) {
    console.log('Resend not configured — skipping email');
    return { sent: false, reason: 'no_api_key' };
  }

  if (!preorder.customer_email) {
    return { sent: false, reason: 'no_email' };
  }

  const template = STATUS_TEMPLATES[preorder.status];
  if (!template) {
    return { sent: false, reason: 'no_template_for_status' };
  }

  const data = {
    customer_name: (preorder.customer_name || '').split(' ')[0],
    tracking_code: preorder.tracking_code,
    item_description: preorder.item_description,
    quantity: String(preorder.quantity || 1),
    shipping_method: preorder.shipping_method || 'Air',
    estimated_arrival_date: preorder.estimated_arrival_date || 'TBD',
    balance_due: String(preorder.balance_due || 0)
  };

  const subject = fillTemplate(template.subject, data);
  const text = fillTemplate(template.body, data);

  let result;
  try {
    const sendResult = await client.emails.send({
      from: FROM_EMAIL,
      to: [preorder.customer_email],
      subject,
      text
    });
    console.log(`📧 Email sent to ${preorder.customer_email} for ${preorder.tracking_code}: ${preorder.status}`);
    result = { sent: true, id: sendResult.data?.id };
  } catch (err) {
    console.error(`📧 Email failed for ${preorder.tracking_code}:`, err.message);
    result = { sent: false, reason: err.message };
  }

  // Log notification
  try {
    const { NotificationLog } = require('../models');
    await NotificationLog.create({
      preorder_id: preorder.id,
      channel: 'email',
      recipient: preorder.customer_email,
      subject,
      body: text,
      status: result.sent ? 'sent' : 'failed',
      provider_id: result.id || null,
      error_message: result.sent ? null : result.reason
    });
  } catch (_) {
    // don't fail if logging fails
  }

  return result;
}

module.exports = { sendPreorderStatusEmail, STATUS_TEMPLATES };
