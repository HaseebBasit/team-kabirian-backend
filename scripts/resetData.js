require('dotenv').config();
const mongoose = require('mongoose');

const resetAllData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for data wipe...');

    // Clear test collections
    const collections = [
      'registrations',
      'payments',
      'videosubmissions',
      'results',
      'teams',
      // Agar events aur categories bhi saaf karni hon toh uncomment karein:
      // 'events',
      // 'categories',
    ];

    for (const col of collections) {
      if (mongoose.connection.collections[col]) {
        await mongoose.connection.collections[col].deleteMany({});
        console.log(`Cleaned collection: ${col} (Zero data)`);
      }
    }

    console.log('\nAll test submissions, payments, teams, and results wiped to ZERO successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Reset error:', error);
    process.exit(1);
  }
};

resetAllData();