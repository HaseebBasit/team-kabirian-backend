const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'kabirians_jwt_secret';

// 1. Authentication Middleware
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, token missing.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Master Admin Token Bypass (Always grants admin privileges)
    if (decoded.id === 'admin-master' || decoded.role === 'admin') {
      req.user = {
        _id: 'admin-master',
        role: 'admin',
        name: 'Master Admin',
        email: decoded.email || 'admin@eventportal.com',
      };
      return next();
    }

    // Normal User / Team Head
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found in database.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Token invalid or session expired.',
    });
  }
};

// 2. Role Authorization Middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, session missing.',
      });
    }

    const userRole = String(req.user.role || '').toLowerCase().trim();

    // Master Admin or administrative roles bypass role checks completely
    if (
      req.user._id === 'admin-master' ||
      userRole === 'admin' ||
      userRole === 'superadmin' ||
      userRole === 'organizer' ||
      userRole === 'manager'
    ) {
      return next();
    }

    const normalizedRoles = roles.map((r) => String(r).toLowerCase().trim());
    if (normalizedRoles.length === 0 || normalizedRoles.includes(userRole) || normalizedRoles.includes('*')) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `User role '${req.user?.role || 'unknown'}' is not authorized to access this route.`,
    });
  };
};

module.exports = {
  protect,
  authorize,
};