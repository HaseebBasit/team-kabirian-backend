const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log('Connecting to URI:', MONGO_URI);

mongoose.connect(MONGO_URI).then(async () => {
  console.log('Connected DB Name:', mongoose.connection.name);
  
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('\n--- COLLECTIONS FOUND ---');
  collections.forEach(c => console.log('📁', c.name));

  const Event = mongoose.model('Event', new mongoose.Schema({}, { strict: false }));
  const Category = mongoose.model('Category', new mongoose.Schema({}, { strict: false }));

  const eventCount = await Event.countDocuments();
  const categoryCount = await Category.countDocuments();

  console.log('\n--- DATA COUNTS ---');
  console.log('Total Events in this DB:', eventCount);
  console.log('Total Categories in this DB:', categoryCount);

  if (eventCount > 0) {
    const sampleEvent = await Event.findOne();
    console.log('\nSample Event Title:', sampleEvent?.title || sampleEvent?.name);
  }

  process.exit();
}).catch(err => {
  console.error('Connection Error:', err);
  process.exit(1);
});