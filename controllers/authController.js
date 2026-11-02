const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate JWT Helper
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || 'secretkey123', {
    expiresIn: '7d',
  });
};

// @route   POST /api/v1/auth/register
// @desc    Register a new Team Head / User
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, teamName, email, phone, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create User
    const user = await User.create({
      name: name.trim(),
      teamName: teamName ? teamName.trim() : '',
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password: hashedPassword,
      role: role || 'team_head',
    });

    const token = generateToken(user._id, user.role);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        teamName: user.teamName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.',
      error: error.message,
    });
  }
};

// @route   POST /api/v1/auth/login
// @desc    Login User
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, phone, identifier, password } = req.body;
    const loginIdentifier = String(identifier || email || phone || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email or phone number and password.',
      });
    }

    console.log(`[AUTH LOGIN] Login attempt with identifier: "${loginIdentifier}"`);

    const rawInput = loginIdentifier.trim();
    const cleanEmail = rawInput.toLowerCase();
    const cleanDigits = rawInput.replace(/\D/g, '');

    const orConditions = [
      { email: cleanEmail },
      { phone: rawInput },
      { phoneNumber: rawInput },
      { contactPhone: rawInput },
    ];

    if (cleanDigits.length >= 7) {
      const variants = new Set([cleanDigits, rawInput]);

      let core10 = '';
      if (cleanDigits.startsWith('92') && cleanDigits.length >= 11) {
        core10 = cleanDigits.slice(2);
      } else if (cleanDigits.startsWith('0') && cleanDigits.length >= 10) {
        core10 = cleanDigits.slice(1);
      } else if (cleanDigits.length === 10) {
        core10 = cleanDigits;
      }

      if (core10) {
        variants.add(core10);
        variants.add('0' + core10);
        variants.add('92' + core10);
        variants.add('+92' + core10);
        variants.add('+92 ' + core10);
        if (core10.length === 10) {
          variants.add(`0${core10.slice(0, 3)}-${core10.slice(3)}`);
          variants.add(`0${core10.slice(0, 3)} ${core10.slice(3)}`);
          variants.add(`+92-${core10.slice(0, 3)}-${core10.slice(3)}`);
          variants.add(`+92 ${core10.slice(0, 3)} ${core10.slice(3)}`);
        }
      }

      for (const v of variants) {
        orConditions.push({ phone: v });
        orConditions.push({ phoneNumber: v });
        orConditions.push({ contactPhone: v });
      }

      const numVal = Number(cleanDigits);
      if (!isNaN(numVal)) {
        orConditions.push({ phone: numVal });
        orConditions.push({ phoneNumber: numVal });
      }
      if (core10) {
        const coreNum = Number(core10);
        if (!isNaN(coreNum)) {
          orConditions.push({ phone: coreNum });
          orConditions.push({ phoneNumber: coreNum });
        }
      }

      const core9 = cleanDigits.slice(-9);
      if (core9.length === 9) {
        const looseRegex = new RegExp(core9.split('').join('\\D*'), 'i');
        orConditions.push({ phone: looseRegex });
        orConditions.push({ phoneNumber: looseRegex });
        orConditions.push({ contactPhone: looseRegex });
      }
    }

    const user = await User.findOne({ $or: orConditions }).select('+password');
    if (!user) {
      console.warn(`[AUTH LOGIN] User not found for identifier: "${loginIdentifier}"`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.',
      });
    }

    let isMatch = false;
    if (typeof user.matchPassword === 'function') {
      isMatch = await user.matchPassword(password);
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      console.warn(`[AUTH LOGIN] Incorrect password for user: "${user.email || user.phone || user._id}"`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.',
      });
    }

    console.log(`[AUTH LOGIN] Login successful for user: "${user.email || user.phone || user._id}"`);

    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        teamName: user.teamName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};