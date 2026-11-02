const nodemailer = require('nodemailer');

const smtpPort = Number(process.env.SMTP_PORT || 587);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

exports.sendFreeClassNotification = async (leadData) => {
  const name = escapeHtml(leadData.name);
  const email = escapeHtml(leadData.email);
  const phone = escapeHtml(leadData.phone);
  const age = escapeHtml(leadData.age || 'Not provided');
  const mailOptions = {
    from: `"Event Portal Alerts" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `New Free Class Request: ${leadData.name}`,
    text: `A new free class request was submitted.\n\nStudent: ${leadData.name}\nAge: ${leadData.age}\nPhone: ${leadData.phone}\nEmail: ${leadData.email}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #1e3a8a; color: #ffffff; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">New Free Class Registration</h2>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <p>A new visitor has submitted the Free Class form on the main website:</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 35%;">Student name:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Age:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${age}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Phone:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${phone}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Email:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Date / Time:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
        </div>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

exports.sendContactNotification = async (leadData) => {
  return transporter.sendMail({
    from: `"Team Kabirians Website" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL,
    replyTo: leadData.email,
    subject: `Website message: ${escapeHtml(leadData.subject)}`,
    text: `Name: ${leadData.name}\nEmail: ${leadData.email}\nSubject: ${leadData.subject}\n\n${leadData.message}`,
    html: `<h2>New website message</h2><p><strong>Name:</strong> ${escapeHtml(leadData.name)}</p><p><strong>Email:</strong> ${escapeHtml(leadData.email)}</p><p><strong>Subject:</strong> ${escapeHtml(leadData.subject)}</p><p>${escapeHtml(leadData.message).replace(/\n/g, '<br>')}</p>`,
  });
};
