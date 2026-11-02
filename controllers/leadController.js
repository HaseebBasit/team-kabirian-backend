const FreeClassLead = require('../models/FreeClassLead');
const { sendFreeClassNotification, sendContactNotification } = require('../utils/emailService');

exports.submitContactMessage = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Name, email, subject, and message are required.' });
    }
    if (name.length > 100 || email.length > 254 || subject.length > 160 || message.length > 5000 || !emailPattern.test(email)) {
      return res.status(400).json({ success: false, message: 'Please check the message fields and try again.' });
    }

    const lead = await FreeClassLead.create({ name, email, subject, message, source: 'contact', phone: '' });
    if (process.env.SMTP_USER && process.env.ADMIN_EMAIL) {
      sendContactNotification(lead)
        .then(async () => {
          lead.emailSentToAdmin = true;
          await lead.save();
        })
        .catch((mailError) => {
          console.error('Contact notification failed in background:', mailError.message);
        });
    }
    return res.status(201).json({ success: true, message: 'Your message has been received.', data: { id: lead._id } });
  } catch (error) {
    console.error('submitContactMessage Error:', error);
    return res.status(500).json({ success: false, message: 'Unable to submit your message right now.' });
  }
};

exports.submitFreeClassLead = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const age = Number(body.age);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !phone || !body.age) {
      return res.status(400).json({
        success: false,
        message: 'Student name, age, email, and phone number are required.',
      });
    }
    if (name.length > 100 || email.length > 254 || phone.length > 30 || !emailPattern.test(email) || !Number.isInteger(age) || age < 3 || age > 100) {
      return res.status(400).json({ success: false, message: 'Please check the name, age, phone, and email fields and try again.' });
    }

    const lead = await FreeClassLead.create({
      name,
      email,
      phone,
      age,
      source: 'Free Trial Class Popup',
      emailSentToAdmin: false,
    });

    // Send email to admin asynchronously in background so visitor never experiences latency or timeout
    if (process.env.SMTP_USER && process.env.ADMIN_EMAIL) {
      sendFreeClassNotification(lead)
        .then(async () => {
          lead.emailSentToAdmin = true;
          await lead.save();
          console.log(`[Email] Free class notification sent to admin for ${lead.name}`);
        })
        .catch((mailError) => {
          console.error('[Email] Free class email dispatch failed:', mailError.message);
        });
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your free class request has been received.',
      data: { id: lead._id, name: lead.name, emailSentToAdmin: true },
    });
  } catch (error) {
    console.error('submitFreeClassLead Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
