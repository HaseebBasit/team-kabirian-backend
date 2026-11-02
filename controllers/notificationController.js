const Notification = require('../models/Notification');

// Admin notifications fetch karna (Newest first)
exports.getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientRole: { $in: ['admin', 'all'] },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Saari unread notifications ko read mark karna
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientRole: { $in: ['admin', 'all'] }, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};