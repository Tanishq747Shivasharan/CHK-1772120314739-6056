const fs = require('fs');
const path = require('path');
const transporter = require('../utils/mailer');

const templateCache = {};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const loadTemplate = (templateName, data = {}) => {
  if (!templateCache[templateName]) {
    const filePath = path.join(__dirname, '..', 'templates', templateName);
    templateCache[templateName] = fs.readFileSync(filePath, 'utf-8');
    console.log(`[EMAIL] Template loaded & cached: ${templateName}`);
  }

  let html = templateCache[templateName];

  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, () => escapeHtml(value));
  });

  return html;
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    const recipient = typeof to === 'string' ? to.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) {
      return { success: false, error: 'Invalid recipient' };
    }
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: recipient,
      subject: String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200),
      html,
    });

    console.log('[EMAIL] Email sent');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Email delivery failed:', error.name || 'Error');
    return { success: false, error: 'Email delivery failed' };
  }
};

const sendWelcomeDonor = async ({ to, userName, email, phone, organizationName }) => {
  const html = loadTemplate('welcomeDonor.html', {
    userName: userName || 'Donor',
    email: email || to,
    phone: phone || 'N/A',
    organizationName: organizationName || 'N/A',
    dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    supportEmail: process.env.EMAIL_USER || 'support@extratoessential.com',
  });

  return sendEmail({
    to,
    subject: '🌱 Welcome to Extra-To-Essential — Thank You for Joining!',
    html,
  });
};

const sendWelcomeNGO = async ({ to, userName, email, phone, organizationName, contactPerson }) => {
  const html = loadTemplate('welcomeNGO.html', {
    userName: userName || 'NGO Admin',
    email: email || to,
    phone: phone || 'N/A',
    organizationName: organizationName || 'N/A',
    contactPerson: contactPerson || userName || 'N/A',
    dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    supportEmail: process.env.EMAIL_USER || 'support@extratoessential.com',
  });

  return sendEmail({
    to,
    subject: '🏢 Welcome to Extra-To-Essential — Your NGO is Registered!',
    html,
  });
};

const sendListingCreatedEmail = async ({
  to,
  ngoName,
  donorName,
  donorPhone,
  foodType,
  quantity,
  mealEquivalent,
  pickupAddress,
  expiryTime,
  distance,
}) => {
  const html = loadTemplate('listingCreated.html', {
    ngoName: ngoName || 'NGO',
    donorName: donorName || 'A Donor',
    donorPhone: donorPhone || 'N/A',
    foodType: foodType || 'Food',
    quantity: quantity || '0',
    mealEquivalent: mealEquivalent || '0',
    pickupAddress: pickupAddress || 'N/A',
    expiryTime: expiryTime || 'N/A',
    distance: distance || 'N/A',
    claimUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  });

  return sendEmail({
    to,
    subject: `🍽️ New Food Donation Available — ${quantity} kg of ${foodType}`,
    html,
  });
};

const sendClaimAcceptedEmail = async ({
  to,
  donorName,
  ngoName,
  ngoContact,
  ngoPhone,
  foodType,
  quantity,
  pickupAddress,
  pickupTime,
}) => {
  const html = loadTemplate('claimAccepted.html', {
    donorName: donorName || 'Donor',
    ngoName: ngoName || 'An NGO',
    ngoContact: ngoContact || 'N/A',
    ngoPhone: ngoPhone || 'N/A',
    foodType: foodType || 'Food',
    quantity: quantity || '0',
    pickupAddress: pickupAddress || 'N/A',
    pickupTime: pickupTime || 'To be scheduled',
    dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  });

  return sendEmail({
    to,
    subject: `🎉 Your ${foodType} Donation Has Been Claimed by ${ngoName}!`,
    html,
  });
};

const sendDeliveryAssignedEmail = async ({
  to,
  volunteerName,
  ngoName,
  ngoPhone,
  donorName,
  donorPhone,
  foodType,
  quantity,
  pickupAddress,
  deliveryStatus,
}) => {
  const html = loadTemplate('deliveryAssigned.html', {
    volunteerName: volunteerName || 'Volunteer',
    ngoName: ngoName || 'NGO',
    ngoPhone: ngoPhone || 'N/A',
    donorName: donorName || 'Donor',
    donorPhone: donorPhone || 'N/A',
    foodType: foodType || 'Food',
    quantity: quantity || '0',
    pickupAddress: pickupAddress || 'N/A',
    deliveryStatus: deliveryStatus || 'Assigned',
    dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  });

  return sendEmail({
    to,
    subject: `🚚 Delivery Assigned — ${quantity} kg of ${foodType}`,
    html,
  });
};

const sendDeliveryCompletedEmail = async ({
  to,
  recipientName,
  donorName,
  donorPhone,
  ngoName,
  ngoPhone,
  volunteerName,
  foodType,
  quantity,
  mealEquivalent,
  pickupAddress,
  deliveryStatus,
  completedAt,
  co2Saved,
}) => {
  const html = loadTemplate('deliveryCompleted.html', {
    recipientName: recipientName || 'User',
    donorName: donorName || 'Donor',
    donorPhone: donorPhone || 'N/A',
    ngoName: ngoName || 'NGO',
    ngoPhone: ngoPhone || 'N/A',
    volunteerName: volunteerName || 'Volunteer',
    foodType: foodType || 'Food',
    quantity: quantity || '0',
    mealEquivalent: mealEquivalent || '0',
    pickupAddress: pickupAddress || 'N/A',
    deliveryStatus: deliveryStatus || 'Delivered',
    completedAt: completedAt || new Date().toLocaleString(),
    co2Saved: co2Saved || '0',
    dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  });

  return sendEmail({
    to,
    subject: `✨ Delivery Completed — ${quantity} kg of ${foodType} Successfully Delivered!`,
    html,
  });
};

const sendCollectionOtpEmail = async ({ to, code, donorName, foodType, ngoName, expiresInMinutes = 10 }) => {
  return sendEmail({
    to,
    subject: `Pickup verification code for ${foodType || 'your donation'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#443c3c">
        <h2>Confirm your food donation pickup</h2>
        <p>Hello ${escapeHtml(donorName || 'Donor')},</p>
        <p>${escapeHtml(ngoName || 'Your NGO')} has a volunteer on the way to collect <strong>${escapeHtml(foodType || 'your donation')}</strong>.</p>
        <p>Share this code with the volunteer only when they arrive at the pickup location:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f5f2f1;padding:18px;text-align:center;border-radius:12px">${escapeHtml(code)}</p>
        <p>This code expires in ${Number(expiresInMinutes)} minutes. Extra-to-Essential will never ask you to share it before pickup.</p>
      </div>
    `
  });
};

module.exports = {
  sendEmail,
  loadTemplate,
  sendWelcomeDonor,
  sendWelcomeNGO,
  sendListingCreatedEmail,
  sendClaimAcceptedEmail,
  sendDeliveryAssignedEmail,
  sendDeliveryCompletedEmail,
  sendCollectionOtpEmail,
};
