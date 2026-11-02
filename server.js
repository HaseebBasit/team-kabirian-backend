const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();

// Route & Controller Imports
const portalRoutes = require('./routes/portalRoutes');
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminController = require('./controllers/adminController');
const leadRoutes = require('./routes/leadRoutes');
const publicRoutes = require('./routes/publicRoutes');
const { protect } = require('./middlewares/authMiddleware');

// Connect Database
connectDB();

const app = express();

// 1. CORS Configuration (Fixed for withCredentials)
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.1.92:3000',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Fallback: allow all local dev environments
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// 2. Routes Mounts
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/public', publicRoutes);

// 3. Global Results Aliases (Prevents 404 on /api/v1/results)
app.get('/api/v1/results', adminController.getPublicResults);
app.post('/api/v1/results', protect, adminController.assignResult);
app.put('/api/v1/results/:id/toggle-publish', protect, adminController.toggleResultPublish);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
