import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { connectDB } from './config/db.js';
import chatRoutes from './routes/chatRoutes.js';
import { startCrawlerScheduler } from './services/crawlerService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api', chatRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Chatbot demo server is running' });
});

async function startServer() {
  try {
    await connectDB();
    startCrawlerScheduler();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
