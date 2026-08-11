import mongoose from 'mongoose';
import Message from '../models/Message.js';
import CrawledPage from '../models/CrawledPage.js';

let databaseAvailable = false;

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    databaseAvailable = true;
    return mongoose.connection;
  }

  if (!process.env.MONGODB_URI) {
    databaseAvailable = false;
    console.warn('MONGODB_URI is not set. Falling back to in-memory chat storage.');
    return null;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    await Promise.all([
      Message.createCollection(),
      CrawledPage.createCollection(),
      Message.syncIndexes(),
      CrawledPage.syncIndexes(),
    ]);

    databaseAvailable = true;
    return mongoose.connection;
  } catch (error) {
    databaseAvailable = false;
    console.warn('MongoDB connection failed. Falling back to in-memory chat storage.', error.message);
    return null;
  }
}

export function isDatabaseAvailable() {
  return databaseAvailable || mongoose.connection.readyState === 1;
}
