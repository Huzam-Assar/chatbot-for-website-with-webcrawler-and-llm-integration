import mongoose from 'mongoose';

const crawledPageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceUrl: {
      type: String,
      required: true,
      index: true,
    },
    canonicalUrl: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    headings: {
      type: [String],
      default: [],
    },
    mainContent: {
      type: String,
      default: '',
    },
    footerContent: {
      type: String,
      default: '',
    },
    contentHash: {
      type: String,
      required: true,
      index: true,
    },
    lastCrawled: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sourceType: {
      type: String,
      default: 'web',
    },
  },
  {
    timestamps: true,
  }
);

crawledPageSchema.index(
  { title: 'text', headings: 'text', mainContent: 'text', footerContent: 'text' },
  {
    name: 'crawled_page_text_index',
    weights: {
      title: 10,
      headings: 8,
      footerContent: 6,
      mainContent: 4,
    },
  }
);

export default mongoose.model('CrawledPage', crawledPageSchema);
